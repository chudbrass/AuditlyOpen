import { prisma } from "@/lib/db";
import { enqueue } from "@/lib/queue";
import { QUEUE_SCAN_START } from "./jobs/queues";
import { runAsControlLeader } from "@/lib/controlLease";
import type { Prisma } from "@prisma/client";

const DISPATCH_INTERVAL_MS = 2_000;
export const GLOBAL_SCAN_LIMIT = 1;
export const QUEUED_SCAN_WHERE = {
  status: "QUEUED",
  OR: [
    { scanType: { in: ["CRAWL", "TEXT_SEARCH"] } },
    { scanType: "PAGE_AUDIT", pages: { some: { audited: true } } },
  ],
} satisfies Prisma.ScanWhereInput;

/** Running scans are lease-owned and may span workers; startup must never park another worker's work. */
export async function reconcileGlobalScanQueue(): Promise<void> {
  await dispatchNextQueuedScan();
}

/** Enqueue only the oldest waiting scan when no scan owns the global worker slot. */
export async function dispatchNextQueuedScan(): Promise<void> {
  await runAsControlLeader("scan-dispatcher", async () => {
    const running = await prisma.scan.count({
      where: { status: { in: ["STARTING", "CRAWLING", "AUDITING", "FINALIZING"] } },
    });
    const available = GLOBAL_SCAN_LIMIT - running;
    if (available <= 0) return;

    const next = await prisma.scan.findMany({
      where: QUEUED_SCAN_WHERE,
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take: available,
    });
    for (const scan of next) {
      await enqueue(QUEUE_SCAN_START, { scanId: scan.id }, { singletonKey: scan.id, singletonSeconds: 5 });
    }
  });
}

export function startScanDispatcher(): void {
  dispatchNextQueuedScan().catch((err) => console.error("[dispatcher] initial dispatch failed", err));
  setInterval(() => {
    dispatchNextQueuedScan().catch((err) => console.error("[dispatcher] dispatch failed", err));
  }, DISPATCH_INTERVAL_MS);
  console.log(`[dispatcher] fair global scan queue running (limit ${GLOBAL_SCAN_LIMIT})`);
}
