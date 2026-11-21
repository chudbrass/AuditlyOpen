import { prisma } from "@/lib/db";
import { parseIssueCounts, issueTotal } from "@/lib/issueCounts";
import { getGlobalSettings } from "@/lib/settings";

/**
 * Persist alerts for a just-completed scan (compared against the previous completed scan).
 * Runs once from scan.finalize — the Alerts page and dashboard read these rows.
 */
export async function generateAlertsForScan(scanId: string): Promise<void> {
  if (!(await getGlobalSettings()).alertsEnabled) return;
  const scan = await prisma.scan.findUnique({ where: { id: scanId } });
  if (!scan || !["FINALIZING", "COMPLETE"].includes(scan.status)) return;
  // Finalization is retryable. Replace this scan's derived alerts instead of appending them.
  await prisma.alert.deleteMany({ where: { scanId } });

  const previous = await prisma.scan.findFirst({
    where: {
      siteId: scan.siteId,
      scanType: scan.scanType,
      status: "COMPLETE",
      startedAt: { lt: scan.startedAt },
    },
    orderBy: { startedAt: "desc" },
  });

  const counts = parseIssueCounts(scan.issueCounts);
  const prevCounts = previous ? parseIssueCounts(previous.issueCounts) : null;
  const alerts: { level: "CRITICAL" | "WARNING" | "INFO" | "OK"; message: string }[] = [];

  if (prevCounts && counts.critical > prevCounts.critical) {
    alerts.push({
      level: "CRITICAL",
      message: `Critical issues increased (${prevCounts.critical} → ${counts.critical})`,
    });
  } else if (counts.critical > 0 && !previous) {
    alerts.push({ level: "CRITICAL", message: `${counts.critical} critical issue${counts.critical === 1 ? "" : "s"} found on first scan` });
  }

  if (
    previous?.scoreOverall != null &&
    scan.scoreOverall != null &&
    previous.scoreOverall - scan.scoreOverall >= 10
  ) {
    alerts.push({
      level: "WARNING",
      message: `Site health dropped ${previous.scoreOverall - scan.scoreOverall} pts (${previous.scoreOverall} → ${scan.scoreOverall})`,
    });
  }

  if (scan.pagesFound > 0) {
    const notScanned = (scan.pagesFound - scan.pagesCrawled) / scan.pagesFound;
    if (notScanned > 0.05) {
      alerts.push({
        level: "WARNING",
        message: `${Math.round(notScanned * 100)}% of discovered pages were not scanned`,
      });
    }
  }

  if (prevCounts && issueTotal(counts) < issueTotal(prevCounts)) {
    alerts.push({
      level: "INFO",
      message: `Issues down ${issueTotal(prevCounts) - issueTotal(counts)} since last scan (${issueTotal(prevCounts)} → ${issueTotal(counts)})`,
    });
  }

  if (alerts.length === 0 && counts.critical === 0 && (scan.scoreOverall ?? 0) >= 80) {
    alerts.push({ level: "OK", message: "Scan complete — no critical issues" });
  }

  if (alerts.length > 0) {
    await prisma.alert.createMany({
      data: alerts.map((a) => ({ ...a, siteId: scan.siteId, scanId: scan.id })),
    });
  }
}
