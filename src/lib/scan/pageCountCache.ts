import { prisma } from "@/lib/db";

// Per-scan Page-row counter so discovery doesn't run prisma.page.count() once per discovered
// link (~100k count queries over a 1000-page scan). Module-scoped like the link-check cache in
// @/lib/audits/linkCheck: seeded lazily with one count query, incremented on successful create,
// dropped when the scan leaves CRAWLING. maxPages is a soft cap and the (scanId, url) unique
// constraint is the real duplicate guard, so an approximate count across worker restarts (the
// reseed simply re-counts) is acceptable.
const counts = new Map<string, number>();

export async function getScanPageCount(scanId: string): Promise<number> {
  const cached = counts.get(scanId);
  if (cached !== undefined) return cached;
  const fresh = await prisma.page.count({ where: { scanId } });
  // A concurrent seeder may have won while we awaited; keep whichever landed first so its
  // subsequent increments aren't wiped out.
  const existing = counts.get(scanId);
  if (existing !== undefined) return existing;
  counts.set(scanId, fresh);
  return fresh;
}

export function incrementScanPageCount(scanId: string, by: number): void {
  const current = counts.get(scanId);
  if (current !== undefined) counts.set(scanId, current + by);
}

export function clearScanPageCountCache(scanId: string): void {
  counts.delete(scanId);
}

/** Same sweep contract as pruneScanLinkCache — see @/lib/audits/linkCheck. */
export function pruneScanPageCountCache(activeScanIds: ReadonlySet<string>): void {
  for (const scanId of counts.keys()) {
    if (!activeScanIds.has(scanId)) counts.delete(scanId);
  }
}
