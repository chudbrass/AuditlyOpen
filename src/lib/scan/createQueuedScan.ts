import { Prisma, type Scan, type ScanType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { siteProvinces } from "@/lib/crawler/brand";
import type { Province } from "@/lib/crawler/provinces";
import { usesSitePageLimit } from "@/lib/scan/constants";

type QueuedScanCreation = Omit<Prisma.ScanUncheckedCreateInput, "siteId" | "scanType" | "scanProvinces"> & {
  scanProvinces?: Province[];
};
type InitialPage = Omit<Prisma.PageUncheckedCreateWithoutScanInput, "id" | "updatedAt">;

export type CreateQueuedScanResult =
  | { ok: true; scan: Scan }
  | { ok: false; reason: "not-found" | "unsupported-provinces" };

/**
 * Atomically saves a queued scan and any pages it needs at startup.
 * The FIFO dispatcher owns admission, so later requests wait instead of failing.
 */
export async function createQueuedScan(
  siteId: string,
  scanType: ScanType,
  { scanProvinces, ...data }: QueuedScanCreation = {},
  initialPages: InitialPage[] = []
): Promise<CreateQueuedScanResult> {
  return prisma.$transaction(async (tx) => {
    const site = await tx.site.findUnique({ where: { id: siteId }, select: { rootUrl: true } });
    if (!site) return { ok: false, reason: "not-found" };
    const availableProvinces = usesSitePageLimit(scanType) ? siteProvinces(site.rootUrl) : [];
    if (scanProvinces?.some((province) => !availableProvinces.includes(province))) {
      return { ok: false, reason: "unsupported-provinces" };
    }

    const scan = await tx.scan.create({
      data: {
        ...data,
        siteId,
        scanType,
        scanProvinces: scanProvinces ?? [...availableProvinces],
        ...(initialPages.length > 0 ? { pages: { create: initialPages } } : {}),
      },
    });
    return { ok: true, scan };
  });
}
