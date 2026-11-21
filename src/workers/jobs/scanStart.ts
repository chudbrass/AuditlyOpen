import { prisma } from "@/lib/db";
import { Prisma, type Scan, type Site } from "@prisma/client";
import { getRobots } from "@/lib/crawler/robots";
import { discoverSitemapUrls } from "@/lib/crawler/sitemap";
import { isUrlAllowed, isSameSiteDomain, normalizeUrl } from "@/lib/crawler/urlFilters";
import { localizationSeeds, pageVariantIdentity } from "@/lib/crawler/localization";
import { siteProvinces } from "@/lib/crawler/brand";
import { USER_AGENT } from "@/lib/crawler/fetchPage";
import { runSiteChecks } from "@/lib/audits/siteChecks";
import { ScanStartPayload } from "./queues";
import { enqueueCrawlPagesBulk } from "./crawlPage";
import { enqueueAuditPage } from "./auditPage";
import { randomUUID } from "node:crypto";
import { injectCrash } from "@/lib/scan/crashInjection";
import { GLOBAL_SCAN_LIMIT, QUEUED_SCAN_WHERE } from "../scanDispatcher";

const START_LEASE_MS = 10 * 60_000;

export async function handleScanStart(payload: ScanStartPayload): Promise<void> {
  const { scanId } = payload;
  const attemptToken = randomUUID();

  let claim: "claimed" | "blocked" | "gone";
  try {
    claim = await prisma.$transaction(
      async (tx) => {
        const candidate = await tx.scan.findUnique({
          where: { id: scanId },
          select: { status: true, scanType: true },
        });
        if (!candidate || candidate.status !== "QUEUED") return "gone" as const;

        const oldestQueued = await tx.scan.findFirst({
          where: QUEUED_SCAN_WHERE,
          orderBy: [{ startedAt: "asc" }, { id: "asc" }],
          select: { id: true },
        });
        if (oldestQueued?.id !== scanId) return "blocked" as const;

        const running = await tx.scan.count({
          where: { id: { not: scanId }, status: { in: ["STARTING", "CRAWLING", "AUDITING", "FINALIZING"] } },
        });
        if (running >= GLOBAL_SCAN_LIMIT) return "blocked" as const;

        await tx.scan.update({
          where: { id: scanId },
          data: { status: "STARTING", attemptToken, leaseExpiresAt: new Date(Date.now() + START_LEASE_MS) },
        });
        return "claimed" as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") return;
    throw err;
  }
  if (claim !== "claimed") return;
  injectCrash("scan.start.claimed");

  const scan = await prisma.scan.findUnique({ where: { id: scanId }, include: { site: true } });
  if (!scan) return;

  try {
    if (scan.scanType === "PAGE_AUDIT") await beginAuditScan(scanId, attemptToken);
    else await beginScan(scan, attemptToken);
  } catch (err) {
    console.error(`[scan] start failed for scan ${scanId}`, err);
    // A scan stranded in QUEUED/CRAWLING counts as "active" and blocks every future scan of
    // the site (including the nightly schedule) — fail it so the slot frees up.
    await prisma.scan
      .updateMany({
        where: { id: scanId, status: "STARTING", attemptToken },
        data: { status: "QUEUED", attemptToken: null, leaseExpiresAt: null },
      })
      .catch(() => {});
    throw err;
  }
}

async function beginAuditScan(scanId: string, attemptToken: string): Promise<void> {
  const auditScan = await prisma.scan.findUnique({ where: { id: scanId }, select: { auditPageLimit: true } });
  const pages = await prisma.page.findMany({
    where: { scanId, audited: true, status: "FETCHED" },
    select: { id: true },
  });
  if (pages.length === 0) throw new Error("performance scan has no queued audit pages");
  if (auditScan?.auditPageLimit == null || pages.length > auditScan.auditPageLimit) {
    throw new Error(`performance scan exceeds its hard audit ceiling (${pages.length}/${auditScan?.auditPageLimit ?? 0})`);
  }
  const started = await prisma.scan.updateMany({
    where: { id: scanId, status: "STARTING", attemptToken },
    data: { status: "AUDITING", attemptToken: null, leaseExpiresAt: null },
  });
  if (started.count === 0) return;
  for (const page of pages) await enqueueAuditPage(scanId, page.id);
}

async function beginScan(scan: Scan & { site: Site }, attemptToken: string): Promise<void> {
  const { id: scanId, site, scanProvinces } = scan;
  const runChecks = scan.scanType === "CRAWL";
  const robots = await getRobots(site.rootUrl);
  const sitemapUrls = await discoverSitemapUrls(site.rootUrl, robots.getSitemaps());
  let siteFindings: Awaited<ReturnType<typeof runSiteChecks>> = [];

  // Site-level robots/sitemap validation — one set of findings per scan, no pageId.
  try {
    if (runChecks) siteFindings = await runSiteChecks(site.rootUrl, sitemapUrls);
  } catch {
    // Site checks are best-effort; never let them block the crawl itself.
  }

  const availableProvinces = siteProvinces(site.rootUrl);
  const provinces = scanProvinces.length > 0 ? scanProvinces : availableProvinces.length > 0 ? availableProvinces : [null];
  const candidates = [
    ...localizationSeeds(site.rootUrl),
    site.rootUrl, ...site.seedUrls, ...sitemapUrls,
  ];

  const seen = new Set<string>();
  const seedUrls: string[] = [];
  for (const candidate of candidates) {
    const url = normalizeUrl(candidate, site.rootUrl);
    if (!url || seen.has(url)) continue;
    if (!isSameSiteDomain(url, site.rootUrl)) continue;
    if (!isUrlAllowed(url, { includePatterns: site.includePatterns, excludePatterns: site.excludePatterns })) {
      continue;
    }
    if (robots.isAllowed(url, USER_AGENT) === false) continue;
    seen.add(url);
    seedUrls.push(url);
    if (seedUrls.length >= site.maxPages) break;
  }

  if (seedUrls.length === 0) throw new Error("crawl has no robots-allowed seed pages");

  const initialized = await prisma.$transaction(async (tx) => {
    const owned = await tx.scan.findFirst({ where: { id: scanId, status: "STARTING", attemptToken }, select: { id: true } });
    if (!owned) return false;
    for (const requestedProvince of provinces) {
      await tx.page.createMany({
        data: seedUrls.map((url) => ({ scanId, url, requestedProvince, urlHash: pageVariantIdentity(url, requestedProvince) })),
        skipDuplicates: true,
      });
    }
    if (siteFindings.length > 0) await tx.finding.createMany({ data: siteFindings.map((f) => ({ ...f, scanId })) });
    await tx.scan.update({ where: { id: scanId }, data: { status: "CRAWLING", pagesFound: seedUrls.length * provinces.length, attemptToken: null, leaseExpiresAt: null } });
    return true;
  });
  if (!initialized) return;
  injectCrash("scan.start.initialized");

  // Parked scans can already have a persisted frontier. Resume all waiting pages.
  const pages = await prisma.page.findMany({
    where: { scanId, status: "PENDING" },
    select: { id: true, url: true },
  });

  const pagesFound = await prisma.page.count({ where: { scanId, status: { not: "REDIRECTED" } } });

  const stillRunning = await prisma.scan.updateMany({
    where: { id: scanId, status: "CRAWLING" },
    data: { pagesFound },
  });
  if (stillRunning.count === 0) return;

  const homepageUrl = normalizeUrl(site.rootUrl, site.rootUrl);
  const homepageIds = runChecks ? undefined : new Set(
    pages.filter((page) => page.url === homepageUrl).map((page) => page.id)
  );
  await enqueueCrawlPagesBulk(
    scanId,
    pages.map((page) => page.id),
    homepageIds
  );
}
