import type { Page, Prisma, Scan } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createQueuedScan } from "@/lib/scan/createQueuedScan";
import { urlIdentity } from "@/lib/crawler/urlIdentity";
import {
  configuredSiteUrlPrefixes,
  isSameSiteDomain,
} from "@/lib/crawler/urlFilters";

type SourcePage = Pick<
  Page,
  "url" | "httpStatus" | "depth" | "title" | "metaDescription" | "h1Count" | "fetchedAt"
>;

export interface PerformancePageOption {
  url: string;
  title: string | null;
}

export type ListPerformancePagesResult =
  | { ok: true; pages: PerformancePageOption[] }
  | { ok: false; reason: "not-found" | "no-crawl-scan" };

export type StartPageAuditScanResult =
  | { ok: true; scan: Scan }
  | {
      ok: false;
      reason: "not-found" | "no-crawl-scan" | "page-not-found";
    };

const pageSelect = {
  url: true,
  httpStatus: true,
  depth: true,
  title: true,
  metaDescription: true,
  h1Count: true,
  fetchedAt: true,
} as const;

async function latestCompletedCrawlId(siteId: string): Promise<string | null> {
  const sourceScan = await prisma.scan.findFirst({
    where: { siteId, scanType: "CRAWL", status: "COMPLETE" },
    orderBy: [{ finishedAt: "desc" }, { startedAt: "desc" }],
    select: { id: true },
  });
  return sourceScan?.id ?? null;
}

function eligiblePageWhere(scanId: string, rootUrl: string): Prisma.PageWhereInput {
  const hostPrefixes = configuredSiteUrlPrefixes(rootUrl);
  return {
    scanId,
    status: { in: ["FETCHED", "AUDITED"] },
    httpStatus: { lt: 400 },
    AND: [{ OR: hostPrefixes.map((prefix) => ({ url: { startsWith: prefix } })) }],
  };
}

export async function listPerformancePages(
  siteId: string,
  query = ""
): Promise<ListPerformancePagesResult> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, rootUrl: true },
  });
  if (!site) return { ok: false, reason: "not-found" };
  const sourceScanId = await latestCompletedCrawlId(siteId);
  if (!sourceScanId) return { ok: false, reason: "no-crawl-scan" };

  const trimmedQuery = query.trim();
  const pages = await prisma.page.findMany({
    where: {
      ...eligiblePageWhere(sourceScanId, site.rootUrl),
      ...(trimmedQuery
        ? {
            OR: [
              { url: { contains: trimmedQuery, mode: "insensitive" } },
              { title: { contains: trimmedQuery, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { url: true, title: true },
    distinct: ["url"],
    orderBy: [{ depth: "asc" }, { url: "asc" }],
    take: 100,
  });
  return { ok: true, pages };
}

export async function startPageAuditScan(
  siteId: string,
  pageUrl: string
): Promise<StartPageAuditScanResult> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, rootUrl: true },
  });
  if (!site) return { ok: false, reason: "not-found" };
  if (!isSameSiteDomain(pageUrl, site.rootUrl)) {
    return { ok: false, reason: "page-not-found" };
  }

  const sourceScanId = await latestCompletedCrawlId(siteId);
  if (!sourceScanId) return { ok: false, reason: "no-crawl-scan" };

  // The submitted URL must be an auditable page from the latest completed crawl. This both
  // prevents arbitrary outbound requests and guarantees the dialog and worker share one source.
  const sourcePage: SourcePage | null = await prisma.page.findFirst({
    where: { ...eligiblePageWhere(sourceScanId, site.rootUrl), url: pageUrl },
    select: pageSelect,
  });
  if (!sourcePage) return { ok: false, reason: "page-not-found" };

  const created = await createQueuedScan(
    siteId,
    "PAGE_AUDIT",
    {
      status: "QUEUED",
      sourceScanId,
      auditPageLimit: 1,
      pagesFound: 1,
      pagesCrawled: 1,
    },
    [
      {
        url: sourcePage.url,
        urlHash: urlIdentity(sourcePage.url),
        status: "FETCHED",
        httpStatus: sourcePage.httpStatus,
        depth: sourcePage.depth,
        audited: true,
        title: sourcePage.title,
        metaDescription: sourcePage.metaDescription,
        h1Count: sourcePage.h1Count,
        fetchedAt: sourcePage.fetchedAt,
      },
    ]
  );
  if (!created.ok) return { ok: false, reason: "not-found" };

  return { ok: true, scan: created.scan };
}
