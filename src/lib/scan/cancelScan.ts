import { prisma } from "@/lib/db";
import { clearScanLinkCache } from "@/lib/audits/linkCheck";
import { clearScanPageCountCache } from "@/lib/scan/pageCountCache";

export async function cancelScan(scanId: string): Promise<boolean> {
  const cancelled = await prisma.$transaction(async (tx) => {
    const result = await tx.scan.updateMany({
      where: { id: scanId, status: { in: ["QUEUED", "STARTING", "CRAWLING", "AUDITING", "FINALIZING"] } },
      data: { status: "CANCELLED", finishedAt: new Date(), attemptToken: null, leaseExpiresAt: null },
    });
    if (result.count > 0) {
      // A fetch may have claimed a page just before cancellation. Return those pages to a neutral
      // persisted state; conditional job writes prevent the in-flight handler from changing them.
      await tx.page.updateMany({
        where: { scanId, status: "CRAWLING" },
        data: { status: "PENDING", attemptToken: null, leaseExpiresAt: null },
      });
    }
    return result.count > 0;
  });
  if (cancelled) {
    clearScanLinkCache(scanId);
    clearScanPageCountCache(scanId);
  }
  return cancelled;
}
