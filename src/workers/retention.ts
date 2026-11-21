import { prisma } from "@/lib/db";
import { getGlobalSettings } from "@/lib/settings";
import { runAsControlLeader } from "@/lib/controlLease";

/**
 * Retention sweeper. Scan history grows without bound otherwise (Page/Link/Finding rows are
 * per-page and dominate the DB), so once an hour this deletes whole Scans older than the
 * configured scanRetentionDays. Retention never mutates surviving scans — a scan is either
 * kept intact or deleted entirely (Page/Link/Finding rows cascade via the schema), so the
 * "every scan is immutable history" rule holds for everything that remains.
 *
 * Safety rails:
 *  - Active scans (QUEUED/CRAWLING/AUDITING) are never touched, regardless of age.
 *  - Each site's most recent COMPLETE scan of each scanType is always kept, so dashboards
 *    never go empty even on sites that haven't scanned within the retention window.
 *  - Deletes run in small batches so a first sweep over a large backlog can't hold one
 *    enormous cascading delete open.
 */

const SWEEP_INTERVAL_MS = 60 * 60_000;

// Batch size per delete; each scan's cascade can span thousands of Page/Link/Finding rows,
// so keep individual deletes short and let the hourly cadence work through any backlog.
const SCAN_DELETE_BATCH = 20;

// Bound one sweep's total work so startup against a large backlog stays polite.
const MAX_BATCHES_PER_SWEEP = 25;

async function sweepScans(cutoff: Date): Promise<void> {
  // Each site's newest COMPLETE scan per scanType survives regardless of age — deleting it
  // would leave that site's dashboard with no data at all. distinct + orderBy desc yields
  // exactly the first (latest) scan per (siteId, scanType) group.
  const keep = await prisma.scan.findMany({
    where: { status: "COMPLETE" },
    distinct: ["siteId", "scanType"],
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  const keepIds = keep.map((scan) => scan.id);

  let totalDeleted = 0;
  for (let batch = 0; batch < MAX_BATCHES_PER_SWEEP; batch++) {
    const expired = await prisma.scan.findMany({
      where: {
        startedAt: { lt: cutoff },
        // Terminal statuses only — an in-flight scan is never retention's to touch.
        status: { in: ["COMPLETE", "CANCELLED", "FAILED"] },
        id: { notIn: keepIds },
      },
      orderBy: { startedAt: "asc" },
      select: { id: true, siteId: true, scanType: true, startedAt: true },
      take: SCAN_DELETE_BATCH,
    });
    if (expired.length === 0) break;

    const deleted = await prisma.scan.deleteMany({
      where: { id: { in: expired.map((scan) => scan.id) } },
    });
    totalDeleted += deleted.count;
    console.log(
      `[retention] deleted ${deleted.count} scan(s) ` +
        `(oldest ${expired[0].startedAt.toISOString()}, sites ` +
        `${[...new Set(expired.map((scan) => scan.siteId))].join(", ")})`
    );
    if (expired.length < SCAN_DELETE_BATCH) break;
  }

  if (totalDeleted > 0) {
    console.log(
      `[retention] sweep removed ${totalDeleted} scan(s) older than ${cutoff.toISOString()}`
    );
  }
}

export async function sweepRetention(): Promise<void> {
  await runAsControlLeader("retention", async () => {
  const retentionDays = (await getGlobalSettings()).scanRetentionDays;
  const now = Date.now();
  const scanCutoff = new Date(now - retentionDays * 24 * 60 * 60_000);

  await sweepScans(scanCutoff);

  // Only read alerts — unread ones still need the user's attention no matter how old.
  const alerts = await prisma.alert.deleteMany({
    where: { read: true, createdAt: { lt: scanCutoff } },
  });
  if (alerts.count > 0) {
    console.log(`[retention] deleted ${alerts.count} read alert(s) older than ${retentionDays}d`);
  }
  });
}

export function startRetentionSweeper(): void {
  const run = () => {
    sweepRetention().catch((err) => console.error("[retention] sweep failed", err));
  };
  run();
  setInterval(run, SWEEP_INTERVAL_MS);
  console.log("[retention] retention sweeper running (hourly)");
}
