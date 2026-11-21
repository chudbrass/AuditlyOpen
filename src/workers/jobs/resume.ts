import { prisma } from "@/lib/db";
import { enqueue } from "@/lib/queue";
import { QUEUE_SCAN_FINALIZE } from "./queues";
import { enqueueCrawlPagesBulk } from "./crawlPage";
import { enqueueAuditPage } from "./auditPage";

/**
 * DB-driven frontier recovery: on worker startup, resume any scan that was mid-flight
 * when the process last stopped, instead of relying on in-memory state.
 */
export async function resumeInFlightScans(): Promise<void> {
  await prisma.itemCheck.updateMany({
    where: { status: "RUNNING", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }] },
    data: { status: "QUEUED", attemptToken: null, leaseExpiresAt: null, startedAt: null },
  });
  const staleChecks = await prisma.itemCheck.findMany({ where: { status: "QUEUED" }, select: { id: true } });
  for (const check of staleChecks) await enqueue("item.check", { itemCheckId: check.id }, { singletonKey: check.id, singletonSeconds: 30 });
  // Pages that were mid-fetch when the worker died — put them back in the frontier.
  await prisma.page.updateMany({
    where: { status: "CRAWLING", scan: { status: "CRAWLING" } },
    data: { status: "PENDING", attemptToken: null, leaseExpiresAt: null },
  });
  await prisma.page.updateMany({
    where: { status: "AUDITING", scan: { status: "AUDITING" } },
    data: { status: "FETCHED", attemptToken: null, leaseExpiresAt: null },
  });
  await prisma.scan.updateMany({
    where: { status: "STARTING", OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: new Date() } }] },
    data: { status: "QUEUED", attemptToken: null, leaseExpiresAt: null },
  });
  const finalizing = await prisma.scan.findMany({ where: { status: "FINALIZING" }, select: { id: true } });
  for (const scan of finalizing) await enqueue(QUEUE_SCAN_FINALIZE, { scanId: scan.id });

  // Enqueuing one page at a time here previously meant a worker restart while a large crawl was
  // mid-flight (exactly the nightly all-sites scenario) spent minutes before printing "worker
  // ready" — tens of thousands of individual round trips before the process could do anything
  // else, including recover from the very outage that triggered this resume. Group by scan and
  // bulk-insert per scan instead.
  const pendingPages = await prisma.page.findMany({
    where: { status: "PENDING", scan: { status: "CRAWLING" } },
    select: { id: true, scanId: true },
  });
  const pendingByScan = new Map<string, string[]>();
  for (const page of pendingPages) {
    const ids = pendingByScan.get(page.scanId) ?? [];
    ids.push(page.id);
    pendingByScan.set(page.scanId, ids);
  }
  for (const [scanId, pageIds] of pendingByScan) {
    await enqueueCrawlPagesBulk(scanId, pageIds);
  }

  // Crawling scans whose frontier is already empty — the finalize that should have followed
  // the last crawl.page never made it. Re-fire it.
  const crawlingScans = await prisma.scan.findMany({
    where: { status: "CRAWLING" },
    select: { id: true },
  });
  for (const scan of crawlingScans) {
    const remaining = await prisma.page.count({
      where: { scanId: scan.id, status: { in: ["PENDING", "CRAWLING"] } },
    });
    if (remaining === 0) {
      await enqueue(QUEUE_SCAN_FINALIZE, { scanId: scan.id });
    }
  }

  // Auditing scans: re-enqueue any audits that never finished; if none are left (or the worker
  // died before the audit set was even marked), finalize handles the completion path.
  const auditingScans = await prisma.scan.findMany({
    where: { status: "AUDITING" },
    select: { id: true },
  });
  for (const scan of auditingScans) {
    const pendingAudits = await prisma.page.findMany({
      where: { scanId: scan.id, audited: true, status: "FETCHED" },
      select: { id: true },
    });
    if (pendingAudits.length > 0) {
      for (const page of pendingAudits) {
        await enqueueAuditPage(scan.id, page.id);
      }
    } else {
      await enqueue(QUEUE_SCAN_FINALIZE, { scanId: scan.id });
    }
  }
}
