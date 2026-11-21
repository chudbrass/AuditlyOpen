import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkerStatus } from "@/lib/workerStatus";
import { ACTIVE_SCAN_STATUSES, usesSitePageLimit } from "@/lib/scan/constants";
import { crawlBrand } from "@/lib/crawler/localization";

export async function GET() {
  const [scans, worker] = await Promise.all([
    prisma.scan.findMany({
      where: { status: { in: [...ACTIVE_SCAN_STATUSES] } },
      orderBy: { startedAt: "asc" },
      include: { site: { select: { id: true, name: true, rootUrl: true, maxPages: true } } },
    }),
    getWorkerStatus(),
  ]);

  const pageCounts =
    scans.length > 0
      ? await prisma.page.groupBy({
          by: ["scanId"],
          where: { scanId: { in: scans.map((scan) => scan.id) }, status: { not: "REDIRECTED" } },
          _count: { _all: true },
        })
      : [];
  const pageCountByScanId = new Map(pageCounts.map((row) => [row.scanId, row._count._all]));

  let queuedPosition = 0;
  return NextResponse.json({
    worker,
    scans: scans.map((scan) => ({
      id: scan.id,
      siteId: scan.site.id,
      siteName: scan.site.name,
      scanType: scan.scanType,
      status: scan.status,
      pagesFound: Math.max(scan.pagesFound, pageCountByScanId.get(scan.id) ?? 0),
      pagesCrawled: scan.pagesCrawled,
      pagesAudited: scan.pagesAudited,
      maxPages: usesSitePageLimit(scan.scanType) ? scan.site.maxPages : null,
      pagesPerProvince: usesSitePageLimit(scan.scanType) && crawlBrand(scan.site.rootUrl) ? scan.site.maxPages : null,
      startedAt: scan.startedAt,
      queuePosition: scan.status === "QUEUED" ? ++queuedPosition : null,
    })),
  });
}
