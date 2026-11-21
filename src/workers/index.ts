import { boss, startWorker, ensureQueues } from "@/lib/queue";
import { closeSharedBrowser } from "@/lib/audits/browser";
import {
  QUEUE_SCAN_START,
  QUEUE_CRAWL_PAGE,
  QUEUE_AUDIT_PAGE,
  QUEUE_SCAN_FINALIZE,
  QUEUE_ITEM_CHECK,
} from "./jobs/queues";
import { handleScanStart } from "./jobs/scanStart";
import { handleCrawlPage } from "./jobs/crawlPage";
import { handleAuditPage } from "./jobs/auditPage";
import { handleScanFinalize } from "./jobs/scanFinalize";
import { handleItemCheck } from "./jobs/itemCheck";
import { resumeInFlightScans } from "./jobs/resume";
import { startScheduler } from "./scheduler";
import { startWatchdog } from "./watchdog";
import { startRetentionSweeper } from "./retention";
import { recordWorkerHeartbeat, HEARTBEAT_INTERVAL_MS } from "@/lib/workerStatus";
import { reconcileGlobalScanQueue, startScanDispatcher } from "./scanDispatcher";
import { prisma } from "@/lib/db";
import { scanStartPayloadSchema, crawlPagePayloadSchema, auditPagePayloadSchema, scanFinalizePayloadSchema, itemCheckPayloadSchema } from "./jobs/queues";
import { observeJob, persistJobMetrics } from "@/lib/jobMetrics";
import { logger } from "@/lib/logger";
import { FATAL_WORKER_EXIT_CODE } from "@/lib/workerFatalPolicy";

// Page concurrency within the single crawl that owns the global scan slot. Per-host politeness
// (robots Crawl-delay + the 250ms default interval) is enforced separately by waitForHostSlot.
const CRAWL_BATCH_SIZE = (() => {
  const parsed = Number(process.env.AUDITLY_CRAWL_CONCURRENCY);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(100, Math.floor(parsed)) : 30;
})();

/**
 * Runs a job handler and swallows anything it throws. Every handler already catches its own
 * expected failure modes and marks the affected row ERROR/FAILED, but a genuinely unexpected
 * throw (DB pool exhaustion, a dropped connection) must never escape here: an unhandled
 * rejection reaching Node's top level kills this whole process by default (Node 15+), which
 * previously took the worker down for hours with nothing left running to notice or recover —
 * including the watchdog that exists specifically to recover stuck scans. One bad job must
 * cost that job, never the process.
 */
async function main() {
  await startWorker();
  await ensureQueues();

  // pollingIntervalSeconds defaults to 2s (pg-boss's floor is 0.5s) — tuned down everywhere so
  // "Run full crawl" feels immediate instead of visibly sitting in QUEUED for a couple of seconds.
  await boss.work(QUEUE_SCAN_START, { pollingIntervalSeconds: 0.5, includeMetadata: true }, async (jobs) => {
    for (const job of jobs) {
      const data = scanStartPayloadSchema.parse(job.data);
      observeJob(QUEUE_SCAN_START, job);
      logger.info("job.start", { queue: QUEUE_SCAN_START, jobId: job.id, scanId: data.scanId });
      await handleScanStart(data);
    }
  });

  await boss.work(
    QUEUE_CRAWL_PAGE,
    { batchSize: CRAWL_BATCH_SIZE, pollingIntervalSeconds: 1, includeMetadata: true },
    async (jobs) => {
      await Promise.all(
        jobs.map((job) => {
          const data = crawlPagePayloadSchema.parse(job.data);
          observeJob(QUEUE_CRAWL_PAGE, job);
          logger.info("job.start", { queue: QUEUE_CRAWL_PAGE, jobId: job.id, scanId: data.scanId, pageId: data.pageId });
          return handleCrawlPage(data);
        })
      );
    }
  );

  // Heavy tier: batchSize 1 — Lighthouse attaches to the shared browser's single CDP port,
  // so audits must not run concurrently within a worker process.
  await boss.work(QUEUE_AUDIT_PAGE, { batchSize: 1, pollingIntervalSeconds: 1, includeMetadata: true }, async (jobs) => {
    for (const job of jobs) {
      const data = auditPagePayloadSchema.parse(job.data);
      observeJob(QUEUE_AUDIT_PAGE, job);
      logger.info("job.start", { queue: QUEUE_AUDIT_PAGE, jobId: job.id, scanId: data.scanId, pageId: data.pageId });
      await handleAuditPage(data);
    }
  });

  await boss.work(QUEUE_SCAN_FINALIZE, { pollingIntervalSeconds: 0.5, includeMetadata: true }, async (jobs) => {
    for (const job of jobs) {
      const data = scanFinalizePayloadSchema.parse(job.data);
      observeJob(QUEUE_SCAN_FINALIZE, job);
      logger.info("job.start", { queue: QUEUE_SCAN_FINALIZE, jobId: job.id, scanId: data.scanId });
      await handleScanFinalize(data);
    }
  });

  await boss.work(QUEUE_ITEM_CHECK, { pollingIntervalSeconds: 0.5 }, async (jobs) => {
    for (const job of jobs) {
      await handleItemCheck(itemCheckPayloadSchema.parse(job.data));
    }
  });

  await reconcileGlobalScanQueue();
  await resumeInFlightScans();
  startScheduler();
  startScanDispatcher();
  startWatchdog();
  startRetentionSweeper();

  // Liveness heartbeat — lets the dashboard warn when queued scans have no worker to run them.
  await recordWorkerHeartbeat();
  setInterval(() => {
    recordWorkerHeartbeat().catch((err) => console.error("heartbeat failed", err));
    persistJobMetrics().catch((err) => console.error("metrics snapshot failed", err));
  }, HEARTBEAT_INTERVAL_MS);

  console.log("worker ready");
}

let shuttingDown = false;
async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("worker shutting down");
  await boss.stop({ graceful: true, timeout: 30_000 }).catch((err) => console.error("pg-boss stop failed", err));
  await closeSharedBrowser().catch((err) => console.error("Chromium close failed", err));
  await prisma.$disconnect().catch((err) => console.error("Prisma disconnect failed", err));
  process.exit(exitCode);
}
process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

// Last-resort safety net. runJob() catches everything inside job handlers, but background
// loops (scheduler tick, watchdog sweep) and any promise we didn't think to
// await can still reject outside that net — and Node 15+ terminates the process by default on
// an unhandled rejection. That's what turned one bad query into a multi-hour outage overnight:
// the process died silently and nothing was left running to recover the scans it dropped.
// Logging and staying alive is strictly better for a long-running worker than dying quietly.
process.on("unhandledRejection", (reason) => {
  console.error("[worker] unhandled rejection; terminating for supervisor restart", reason);
  void shutdown(FATAL_WORKER_EXIT_CODE);
});
process.on("uncaughtException", (err) => {
  console.error("[worker] uncaught exception; terminating for supervisor restart", err);
  void shutdown(FATAL_WORKER_EXIT_CODE);
});

main().catch((err) => {
  console.error("worker failed to start", err);
  process.exit(1);
});
