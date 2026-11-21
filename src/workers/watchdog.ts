import { prisma } from "@/lib/db";
import { enqueue } from "@/lib/queue";
import { pruneScanLinkCache } from "@/lib/audits/linkCheck";
import { pruneScanPageCountCache } from "@/lib/scan/pageCountCache";
import { ACTIVE_SCAN_STATUSES } from "@/lib/scan/constants";
import { QUEUE_SCAN_FINALIZE } from "./jobs/queues";
import { enqueueCrawlPage } from "./jobs/crawlPage";
import { enqueueAuditPage } from "./jobs/auditPage";
import { runAsControlLeader } from "@/lib/controlLease";

/**
 * Stuck-scan watchdog. Job handlers are exception-safe and every HTTP/browser call is
 * time-bounded, but jobs can still be lost outright (worker crash mid-job, pg-boss retry
 * exhaustion, dropped DB connection). Without recovery, a single lost job leaves the scan
 * "active" forever — which also blocks every future scheduled scan of that site.
 *
 * Recovery ladder, checked once a minute:
 *  1. CRAWLING scan with wedged pages    → reset stale CRAWLING pages to PENDING and re-fire
 *                                          crawl jobs for every stale PENDING page. Page
 *                                          reprocessing is idempotent (it clears its own
 *                                          links/findings first).
 *  2. AUDITING scan with no progress     → re-fire audit jobs for the not-yet-audited pages
 *                                          (handler skips pages already AUDITED).
 *  3. A running scan older than the limit and silent for that entire period → mark FAILED. Healthy
 *                                          progressing scans are never failed by age alone.
 */

const WATCHDOG_INTERVAL_MS = 60_000;

// Every crawled page increments scan.pagesCrawled, which touches scan.updatedAt — so a
// CRAWLING scan whose updatedAt hasn't moved for this long has made zero progress and its
// jobs are gone. Scan-level gating matters: a merely *backlogged* scan (thousands of PENDING
// pages waiting their turn) must not be treated as stalled, or the watchdog would re-fire
// duplicate jobs for the whole frontier every sweep.
const CRAWL_STALL_MS = 15 * 60_000;

// Within a stalled scan, only reclaim CRAWLING pages that are themselves stale — a page
// claimed moments ago (on an otherwise-quiet scan) may still be mid-fetch.
const PAGE_STALL_MS = 15 * 60_000;

// Bound how many jobs one sweep re-fires so recovery of a huge scan can't monopolize the
// sweep; the remainder is picked up by subsequent sweeps.
const MAX_REFIRES_PER_SWEEP = 2_000;

// AUDITING progress touches scan.updatedAt on every pagesAudited increment; each audit is
// bounded to ~6 min by the stage timeouts, so this much silence means lost jobs — but the
// audit queue is serialized worker-wide, so re-fired jobs for a backlogged scan are cheap
// no-ops (the handler skips already-audited pages).
const AUDIT_STALL_MS = 20 * 60_000;

const MAX_SCAN_AGE_MS = (() => {
  const parsed = Number(process.env.AUDITLY_MAX_SCAN_MINUTES);
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : 240;
  return minutes * 60_000;
})();

async function failExpiredScan(scanId: string, ageMs: number): Promise<void> {
  const failed = await prisma.scan.updateMany({
    where: { id: scanId, status: { in: [...ACTIVE_SCAN_STATUSES] } },
    data: { status: "FAILED", finishedAt: new Date() },
  });
  if (failed.count > 0) {
    console.error(
      `[watchdog] scan ${scanId} exceeded the no-progress limit ` +
        `(${Math.round(ageMs / 60_000)}m old, silent > ${Math.round(MAX_SCAN_AGE_MS / 60_000)}m) — ` +
        `marked FAILED to free the site's scan slot`
    );
  }
}

async function recoverCrawlingScan(scanId: string, now: number): Promise<void> {
  const pageCutoff = new Date(now - PAGE_STALL_MS);

  // Pages wedged mid-crawl (worker died / job lost) — collect ids first, because the reset
  // itself bumps updatedAt and would hide them from a follow-up staleness query.
  const wedged = await prisma.page.findMany({
    where: { scanId, status: "CRAWLING", updatedAt: { lt: pageCutoff } },
    select: { id: true },
    take: MAX_REFIRES_PER_SWEEP,
  });
  if (wedged.length > 0) {
    await prisma.page.updateMany({
      where: { id: { in: wedged.map((p) => p.id) }, status: "CRAWLING" },
      data: { status: "PENDING" },
    });
  }

  // The scan has made no progress for the whole stall window, so every PENDING page's job is
  // presumed lost. Touch them back to PENDING (bumps updatedAt) before re-firing so the next
  // sweep doesn't double-fire the same set while the queue works through it.
  const stalePending = await prisma.page.findMany({
    where: { scanId, status: "PENDING", updatedAt: { lt: pageCutoff } },
    select: { id: true },
    take: Math.max(0, MAX_REFIRES_PER_SWEEP - wedged.length),
  });
  if (stalePending.length > 0) {
    await prisma.page.updateMany({
      where: { id: { in: stalePending.map((p) => p.id) }, status: "PENDING" },
      data: { status: "PENDING" },
    });
  }

  const toEnqueue = [...wedged, ...stalePending];
  if (toEnqueue.length > 0) {
    console.warn(`[watchdog] scan ${scanId}: re-firing ${toEnqueue.length} stalled crawl page(s)`);
    for (const page of toEnqueue) {
      await enqueueCrawlPage(scanId, page.id);
    }
    return;
  }

  // Frontier is empty but the scan never left CRAWLING — the finalize trigger was lost.
  const remaining = await prisma.page.count({
    where: { scanId, status: { in: ["PENDING", "CRAWLING"] } },
  });
  if (remaining === 0) {
    console.warn(`[watchdog] scan ${scanId}: frontier empty, re-firing finalize`);
    await enqueue(QUEUE_SCAN_FINALIZE, { scanId });
  }
}

async function recoverAuditingScan(scanId: string): Promise<void> {
  const stale = await prisma.page.findMany({
    where: { scanId, audited: true, status: "AUDITING", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }] },
    select: { id: true },
    take: MAX_REFIRES_PER_SWEEP,
  });
  if (stale.length > 0) {
    await prisma.page.updateMany({
      where: { id: { in: stale.map((page) => page.id) }, status: "AUDITING", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }] },
      data: { status: "FETCHED", attemptToken: null, leaseExpiresAt: null },
    });
  }
  const pending = await prisma.page.findMany({
    where: { scanId, audited: true, status: "FETCHED" },
    select: { id: true },
    take: MAX_REFIRES_PER_SWEEP,
  });
  if (pending.length > 0) {
    console.warn(`[watchdog] scan ${scanId}: re-firing ${pending.length} stalled audit(s)`);
    for (const page of pending) {
      await enqueueAuditPage(scanId, page.id);
    }
  } else {
    console.warn(`[watchdog] scan ${scanId}: audits done, re-firing finalize`);
    await enqueue(QUEUE_SCAN_FINALIZE, { scanId });
  }
}

export async function sweepStuckScans(): Promise<void> {
  await runAsControlLeader("watchdog", async () => {
  const now = Date.now();
  const activeScans = await prisma.scan.findMany({
    where: { status: { in: [...ACTIVE_SCAN_STATUSES] } },
    select: { id: true, status: true, startedAt: true, updatedAt: true },
  });

  // Free scan-scoped cache memory held by scans that are no longer active (cancelled/failed
  // scans never reach finalize, which is where completed scans clear their own entries).
  const activeIds = new Set(activeScans.map((scan) => scan.id));
  pruneScanLinkCache(activeIds);
  pruneScanPageCountCache(activeIds);

  for (const scan of activeScans) {
    const age = now - scan.startedAt.getTime();
    const sinceProgress = now - scan.updatedAt.getTime();
    // QUEUED is a legitimate wait state under the global dispatcher, not stuck work.
    if (scan.status === "QUEUED") continue;

    if (scan.status === "STARTING" && sinceProgress > CRAWL_STALL_MS) {
      const reset = await prisma.scan.updateMany({ where: { id: scan.id, status: "STARTING", leaseExpiresAt: { lt: new Date() } }, data: { status: "QUEUED", attemptToken: null, leaseExpiresAt: null } });
      if (reset.count > 0) await enqueue("scan.start", { scanId: scan.id });
      continue;
    }
    if (scan.status === "FINALIZING" && sinceProgress > CRAWL_STALL_MS) {
      await enqueue(QUEUE_SCAN_FINALIZE, { scanId: scan.id });
      continue;
    }

    // Large scheduled crawls can legitimately run beyond the configured cap. Only fail a scan
    // when it has also made no progress for that entire period; elapsed wall time alone is not
    // evidence of failure.
    if (age > MAX_SCAN_AGE_MS && sinceProgress > MAX_SCAN_AGE_MS) {
      await failExpiredScan(scan.id, age);
      continue;
    }

    if (scan.status === "CRAWLING" && sinceProgress > CRAWL_STALL_MS) {
      await recoverCrawlingScan(scan.id, now);
    } else if (scan.status === "AUDITING" && sinceProgress > AUDIT_STALL_MS) {
      await recoverAuditingScan(scan.id);
    }
  }
  });
}

export function startWatchdog(): void {
  setInterval(() => {
    sweepStuckScans().catch((err) => console.error("[watchdog] sweep failed", err));
  }, WATCHDOG_INTERVAL_MS);
  console.log(
    `[watchdog] stuck-scan watchdog running (1m sweep, ` +
      `${Math.round(MAX_SCAN_AGE_MS / 60_000)}m no-progress failure limit)`
  );
}
