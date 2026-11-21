import { createQueuedScan, type CreateQueuedScanResult } from "@/lib/scan/createQueuedScan";
import type { Province } from "@/lib/crawler/provinces";

/** Shared by the full-crawl API route and cron scheduler; the worker admits scans in FIFO order. */
export async function startScan(
  siteId: string,
  { scheduledFor, scanProvinces }: { scheduledFor?: Date; scanProvinces?: Province[] } = {}
): Promise<CreateQueuedScanResult> {
  return createQueuedScan(siteId, "CRAWL", { scheduledFor, scanProvinces });
}
