import { prisma } from "@/lib/db";
import { latestCronMatch, nextCronMatch } from "@/lib/scan/cron";
import { startScan } from "@/lib/scan/startScan";
import { hasAttemptForOccurrence } from "@/lib/scan/scheduleOccurrence";
import { runAsControlLeader } from "@/lib/controlLease";

const TICK_MS = 60_000;

export async function runSchedulerTick(now = new Date()): Promise<void> {
  return runAsControlLeader("scheduler", async () => {
  const sites = await prisma.site.findMany({
    where: { scheduleCron: { not: null } },
    select: {
      id: true,
      name: true,
      scheduleCron: true,
      scheduleTimezone: true,
      scheduleNextRunAt: true,
      scans: {
        where: { scanType: "CRAWL" },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { startedAt: true },
      },
    },
  });

  for (const site of sites) {
    if (!site.scheduleCron) continue;
    const dueAt = site.scheduleNextRunAt && site.scheduleNextRunAt <= now
      ? site.scheduleNextRunAt
      : latestCronMatch(site.scheduleCron, now, site.scheduleTimezone);
    if (!dueAt) continue;

    const latestCrawl = site.scans[0];
    // Exactly one attempt per occurrence. Cancellation/failure is terminal for this slot and
    // must not resurrect every minute; the next cron occurrence gets a fresh attempt.
    const slotAlreadyServed = hasAttemptForOccurrence(latestCrawl?.startedAt, dueAt);
    if (slotAlreadyServed) continue;

    const result = await startScan(site.id, { scheduledFor: dueAt });
    if (result.ok) {
      await prisma.site.update({ where: { id: site.id }, data: {
        scheduleNextRunAt: nextCronMatch(site.scheduleCron, dueAt, site.scheduleTimezone),
      } });
      const caughtUp = now.getTime() - dueAt.getTime() >= TICK_MS;
      console.log(
        `[scheduler] ${caughtUp ? "catch-up scan" : "scan"} started for "${site.name}" ` +
          `(${site.scheduleCron}, due ${dueAt.toISOString()})`
      );
    }
  }
  });
}

export function startScheduler(): void {
  runSchedulerTick().catch((err) => console.error("[scheduler] initial tick failed", err));
  setInterval(() => {
    runSchedulerTick().catch((err) => console.error("[scheduler] tick failed", err));
  }, TICK_MS);
  console.log("[scheduler] cron scheduler running (immediate start, 1m tick, missed-run catch-up)");
}
