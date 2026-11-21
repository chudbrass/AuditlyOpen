import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { TERMINAL_SCAN_STATUSES } from "@/lib/scan/constants";
import { getWorkerStatus } from "@/lib/workerStatus";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const scan = await prisma.scan.findUnique({ where: { id }, include: { site: true } });
  if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });

  const [pageCount, worker] = await Promise.all([
    prisma.page.count({ where: { scanId: id, status: { not: "REDIRECTED" } } }),
    getWorkerStatus(),
  ]);

  return NextResponse.json({
    worker,
    scan: {
      ...scan,
      pagesFound: Math.max(scan.pagesFound, pageCount),
    },
  });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const parsed = z.object({ id: z.string().min(1) }).safeParse(await params);
  if (!parsed.success) return NextResponse.json({ error: "Invalid scan ID" }, { status: 400 });

  const { id } = parsed.data;
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      // The status check and cascade must happen in the same write.
      const { count } = await tx.scan.deleteMany({
        where: { id, status: { in: [...TERMINAL_SCAN_STATUSES] } },
      });
      if (count === 0) return false;

      // Alerts store the scan ID without a foreign key.
      await tx.alert.deleteMany({ where: { scanId: id } });
      return true;
    }, { timeout: 60_000 });

    if (deleted) return NextResponse.json({ ok: true });
    const scan = await prisma.scan.findUnique({ where: { id }, select: { id: true } });
    if (!scan) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    return NextResponse.json({ error: "Wait for the scan to finish or cancel it before deleting it." }, { status: 409 });
  } catch (error) {
    console.error("[api/scans/:id] scan deletion failed", { scanId: id, error });
    return NextResponse.json({ error: "Could not delete the scan. Please try again." }, { status: 500 });
  }
}
