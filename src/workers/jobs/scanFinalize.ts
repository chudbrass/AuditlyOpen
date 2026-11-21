import { prisma } from "@/lib/db";
import { computeScanScores } from "@/lib/scoring";
import { clearScanLinkCache } from "@/lib/audits/linkCheck";
import { clearScanPageCountCache } from "@/lib/scan/pageCountCache";
import { createDuplicateSeoFindings } from "@/lib/audits/seoDuplicates";
import { generateAlertsForScan } from "@/lib/scan/generateAlerts";
import { ScanFinalizePayload } from "./queues";
import { dispatchNextQueuedScan } from "../scanDispatcher";
import { randomUUID } from "node:crypto";
import { injectCrash } from "@/lib/scan/crashInjection";
import { ensureScanFindingFingerprints } from "@/lib/findings/fingerprint";
import { consolidateProvincialFindings } from "@/lib/findings/consolidate";

const FINALIZE_LEASE_MS = 10 * 60_000;

// Broken-link findings list at most this many source pages in evidence; the full count is
// kept alongside so the UI can say "…and N more".
const MAX_SOURCE_PAGE_SAMPLES = 20;

/**
 * Runs once per crawl scan, inside finalize's status-claim guard.
 *
 * 1. Overwrites the Scan link counters with exact values. The live per-page increments in
 *    crawlPage can over-count when the watchdog re-runs a page; the per-page Page counters are
 *    written in each page's final status update (overwrite, not increment), so summing them is
 *    idempotent. linksBroken comes from the stored broken Link rows so it always matches the
 *    broken-links table.
 * 2. Creates ONE broken-link Finding per broken target (grouped across source pages), with up
 *    to MAX_SOURCE_PAGE_SAMPLES source URLs in evidence.samples plus the total source count.
 *    Findings are scan-level (pageId null → the UI shows them as "site-wide").
 */
async function finalizeLinkData(scanId: string): Promise<void> {
  await prisma.finding.deleteMany({ where: { scanId, code: { in: ["links.broken-internal", "links.broken-external"] } } });
  const [pageSums, brokenLinks] = await Promise.all([
    prisma.page.aggregate({
      where: { scanId },
      _sum: { linksDiscovered: true, linksChecked: true, linksInternalChecked: true },
    }),
    prisma.link.findMany({
      where: { scanId, broken: true },
      select: {
        sourceUrl: true, targetUrl: true, isInternal: true, httpStatus: true, error: true,
        sourcePage: { select: { requestedProvince: true, province: true, language: true } },
      },
      orderBy: { sourceUrl: "asc" },
    }),
  ]);

  await prisma.scan.update({
    where: { id: scanId },
    data: {
      linksChecked: pageSums._sum.linksChecked ?? 0,
      linksDiscovered: pageSums._sum.linksDiscovered ?? 0,
      linksInternalChecked: pageSums._sum.linksInternalChecked ?? 0,
      linksBroken: brokenLinks.length,
    },
  });

  const byTarget = new Map<string, typeof brokenLinks>();
  for (const link of brokenLinks) {
    const source = link.sourcePage;
    const key = JSON.stringify([link.targetUrl, source?.requestedProvince, source?.requestedProvince ? source.language : null]);
    const group = byTarget.get(key);
    if (group) group.push(link);
    else byTarget.set(key, [link]);
  }

  if (byTarget.size > 0) {
    await prisma.finding.createMany({
      data: [...byTarget.values()].map((group) => {
        const { targetUrl, isInternal, httpStatus, error, sourcePage } = group[0];
        return {
          scanId,
          province: sourcePage?.requestedProvince ? sourcePage.province : null,
          language: sourcePage?.requestedProvince ? sourcePage.language : null,
          category: "LINKS" as const,
          severity: isInternal ? ("SERIOUS" as const) : ("MODERATE" as const),
          code: isInternal ? "links.broken-internal" : "links.broken-external",
          message: `Broken ${isInternal ? "internal" : "external"} link: ${targetUrl}`,
          conformance: "QA",
          responsibleRole: "author",
          elementType: "links",
          evidence: {
            targetUrl,
            httpStatus,
            error,
            sourcePageCount: group.length,
            samples: group.slice(0, MAX_SOURCE_PAGE_SAMPLES).map((link) => link.sourceUrl),
          },
        };
      }),
    });
  }
}

async function completeScan(scanId: string, isTextSearch = false): Promise<void> {
  const [pagesFound, pagesCrawled, pagesAudited] = await Promise.all([
    prisma.page.count({ where: { scanId, status: { not: "REDIRECTED" } } }),
    prisma.page.count({ where: { scanId, status: { in: ["FETCHED", "AUDITED", "ERROR"] } } }),
    prisma.page.count({ where: { scanId, status: "AUDITED" } }),
  ]);
  await prisma.scan.update({ where: { id: scanId }, data: { pagesFound, pagesCrawled, pagesAudited } });
  if (isTextSearch) {
    clearScanPageCountCache(scanId);
    return;
  }
  await consolidateProvincialFindings(scanId);
  await ensureScanFindingFingerprints(scanId);
  const scores = await computeScanScores(scanId);
  await prisma.scan.update({
    where: { id: scanId },
    data: { ...scores },
  });
  await generateAlertsForScan(scanId);
  clearScanLinkCache(scanId);
  clearScanPageCountCache(scanId);
}

export async function handleScanFinalize(payload: ScanFinalizePayload): Promise<void> {
  const { scanId } = payload;
  const attemptToken = randomUUID();

  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: { status: true, scanType: true, siteId: true },
  });
  if (!scan) return;

  if (scan.status === "CRAWLING") {
    const remaining = await prisma.page.count({
      where: { scanId, status: { in: ["PENDING", "CRAWLING"] } },
    });
    if (remaining > 0) return;

    const claimed = await prisma.scan.updateMany({
      where: { id: scanId, status: "CRAWLING" },
      data: { status: "FINALIZING", attemptToken, leaseExpiresAt: new Date(Date.now() + FINALIZE_LEASE_MS) },
    });
    if (claimed.count === 0) return;

    if (scan.scanType === "CRAWL") {
      await finalizeLinkData(scanId);
      await createDuplicateSeoFindings(scanId);
    }
    await completeScan(scanId, scan.scanType === "TEXT_SEARCH");
    injectCrash("scan.finalize.before-complete");
    await prisma.scan.updateMany({ where: { id: scanId, status: "FINALIZING", attemptToken }, data: { status: "COMPLETE", finishedAt: new Date(), attemptToken: null, leaseExpiresAt: null } });
    await dispatchNextQueuedScan();
    return;
  }

  if (scan.status === "AUDITING") {
    const remainingAudits = await prisma.page.count({
      where: { scanId, audited: true, status: { in: ["FETCHED", "AUDITING"] } },
    });
    if (remainingAudits > 0) return;

    const claimed = await prisma.scan.updateMany({
      where: { id: scanId, status: "AUDITING" },
      data: { status: "FINALIZING", attemptToken, leaseExpiresAt: new Date(Date.now() + FINALIZE_LEASE_MS) },
    });
    if (claimed.count === 0) return;

    await completeScan(scanId);
    injectCrash("scan.finalize.before-complete");
    await prisma.scan.updateMany({ where: { id: scanId, status: "FINALIZING", attemptToken }, data: { status: "COMPLETE", finishedAt: new Date(), attemptToken: null, leaseExpiresAt: null } });
    await dispatchNextQueuedScan();
    return;
  }

  if (scan.status === "FINALIZING") {
    const reclaimed = await prisma.scan.updateMany({
      where: { id: scanId, status: "FINALIZING", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }] },
      data: { attemptToken, leaseExpiresAt: new Date(Date.now() + FINALIZE_LEASE_MS) },
    });
    if (reclaimed.count === 0) throw new Error(`scan ${scanId} finalization lease is still active`);
    if (scan.scanType === "CRAWL") {
      await finalizeLinkData(scanId);
      await createDuplicateSeoFindings(scanId);
    }
    await completeScan(scanId, scan.scanType === "TEXT_SEARCH");
    await prisma.scan.updateMany({ where: { id: scanId, status: "FINALIZING", attemptToken }, data: { status: "COMPLETE", finishedAt: new Date(), attemptToken: null, leaseExpiresAt: null } });
    await dispatchNextQueuedScan();
  }
}
