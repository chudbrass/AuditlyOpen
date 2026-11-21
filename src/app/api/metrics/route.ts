import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [snapshot, oldestQueued, stalled] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: "workerMetrics" }, select: { value: true } }),
    prisma.scan.findFirst({ where: { status: "QUEUED" }, orderBy: { startedAt: "asc" }, select: { startedAt: true } }),
    prisma.scan.count({ where: { status: { in: ["STARTING", "CRAWLING", "AUDITING", "FINALIZING"] }, updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } } }),
  ]);
  return NextResponse.json({
    worker: snapshot?.value ?? null,
    scanQueueAgeMs: oldestQueued ? Date.now() - oldestQueued.startedAt.getTime() : 0,
    stalledScans: stalled,
  });
}
