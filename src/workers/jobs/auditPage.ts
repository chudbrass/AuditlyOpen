import { prisma } from "@/lib/db";
import { enqueue } from "@/lib/queue";
import { runPerformanceAudit, PerfResult } from "@/lib/audits/performance";
import { closeSharedBrowser } from "@/lib/audits/browser";
import { QUEUE_AUDIT_PAGE, QUEUE_SCAN_FINALIZE, AuditPagePayload } from "./queues";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { injectCrash } from "@/lib/scan/crashInjection";

// Perf score below this emits a PERFORMANCE finding (Lighthouse's own "poor" band starts at 50).
const PERF_POOR_THRESHOLD = 50;
const PERF_NEEDS_WORK_THRESHOLD = 90;

// Backstop for the whole audit stage. The audits have their own internal timeouts, but a
// timed-out Lighthouse run can leave the shared browser wedged, and Playwright's newContext
// has no timeout — observed as an audit job hanging forever and stalling the AUDITING phase.
const STAGE_TIMEOUT_MS = 3 * 60_000;

async function withStageTimeout<T>(run: (signal: AbortSignal) => Promise<T>, fallback: T): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve(fallback); }, STAGE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** A timed-out stage means the shared browser is in an unknown state — replace it. */
async function resetBrowserAfterTimeout(): Promise<void> {
  await closeSharedBrowser().catch(() => {});
}

export async function enqueueAuditPage(scanId: string, pageId: string): Promise<void> {
  await enqueue(QUEUE_AUDIT_PAGE, { scanId, pageId }, { singletonKey: `audit:${pageId}`, singletonSeconds: 120 });
}

async function enqueueFinalizeIfAuditsDone(scanId: string): Promise<void> {
  const remaining = await prisma.page.count({
    where: { scanId, audited: true, status: { in: ["FETCHED", "AUDITING"] } },
  });
  if (remaining > 0) return;
  await enqueue(QUEUE_SCAN_FINALIZE, { scanId });
}

export async function handleAuditPage(payload: AuditPagePayload): Promise<void> {
  const { scanId, pageId } = payload;
  const attemptToken = randomUUID();

  const [scan, page] = await Promise.all([
    prisma.scan.findUnique({ where: { id: scanId }, select: { status: true } }),
    prisma.page.findUnique({ where: { id: pageId } }),
  ]);
  if (!scan || !page) return;
  if (scan.status !== "AUDITING") return; // cancelled/failed/completed — drop the job
  if (!page.audited || page.status !== "FETCHED") return; // not in the set / already audited

  const claimed = await prisma.page.updateMany({
    where: { id: pageId, status: "FETCHED", audited: true, scan: { status: "AUDITING" } },
    data: { status: "AUDITING", attemptToken, leaseExpiresAt: new Date(Date.now() + STAGE_TIMEOUT_MS * 2) },
  });
  if (claimed.count === 0) return;

  try {
    await auditClaimedPage(scanId, pageId, page.url, attemptToken);
  } catch (err) {
    console.error(`[audit] page failed: ${page.url}`, err);
    // Never leave an audit page stuck in FETCHED — a stranded page wedges the AUDITING phase.
    const marked = await prisma.page
      .updateMany({
        where: { id: pageId, audited: true, status: "AUDITING", attemptToken, scan: { status: "AUDITING" } },
        data: { status: "FETCHED", attemptToken: null, leaseExpiresAt: null },
      })
      .catch(() => null);
    if (marked && marked.count > 0) {
      throw err;
    }
    return;
  }

  await enqueueFinalizeIfAuditsDone(scanId);
}

async function auditClaimedPage(scanId: string, pageId: string, pageUrl: string, attemptToken: string): Promise<void> {
  const emptyPerf: PerfResult = {
    perfScore: null,
    metrics: { lcp: null, cls: null, tbt: null, fcp: null, speedIndex: null },
    error: `performance audit timed out after ${STAGE_TIMEOUT_MS}ms`,
  };
  const perf = await withStageTimeout((signal) => runPerformanceAudit(pageUrl, signal), emptyPerf);
  // A failed Lighthouse child can leave the shared browser with orphaned targets or sessions.
  // Replace it so the next one-page performance scan starts from a clean browser.
  if (perf.error) await resetBrowserAfterTimeout();

  const afterPerf = await prisma.scan.findUnique({ where: { id: scanId }, select: { status: true } });
  if (afterPerf?.status !== "AUDITING") return;

  const findingsData: Prisma.FindingCreateManyInput[] = [];

  if (perf.perfScore !== null && perf.perfScore < PERF_NEEDS_WORK_THRESHOLD) {
    const poor = perf.perfScore < PERF_POOR_THRESHOLD;
    findingsData.push({
      scanId,
      pageId,
      category: "PERFORMANCE" as const,
      severity: poor ? ("SERIOUS" as const) : ("MODERATE" as const),
      code: poor ? "performance.poor" : "performance.needs-improvement",
      message: `Lighthouse performance score ${perf.perfScore}/100${poor ? " (poor)" : ""}`,
      conformance: "BP",
      responsibleRole: "developer",
      elementType: "scripts",
      evidence: { pageUrl, perfScore: perf.perfScore, ...perf.metrics },
    });
  }

  injectCrash("audit.page.before-commit");
  await prisma.$transaction(async (tx) => {
    const owned = await tx.page.findFirst({ where: { id: pageId, status: "AUDITING", attemptToken, scan: { status: "AUDITING" } }, select: { id: true } });
    if (!owned) return;
    await tx.finding.deleteMany({ where: { scanId, pageId, category: "PERFORMANCE" } });
    if (findingsData.length > 0) await tx.finding.createMany({ data: findingsData });
    await tx.page.update({ where: { id: pageId }, data: {
      status: "AUDITED", perfScore: perf.perfScore,
      performanceAuditError: perf.error ?? null,
      metrics: { ...perf.metrics, ...(perf.error ? { perfError: perf.error } : {}) },
      attemptToken: null, leaseExpiresAt: null,
    } });
    await tx.scan.update({ where: { id: scanId }, data: { pagesAudited: { increment: 1 } } });
  });
  injectCrash("audit.page.after-commit");
}
