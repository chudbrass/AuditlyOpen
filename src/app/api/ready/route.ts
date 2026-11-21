import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWorkerStatus } from "@/lib/workerStatus";
import { readinessStatus } from "@/lib/readiness";

export async function GET() {
  try {
    await prisma.appSetting.findFirst({ select: { key: true } });
    const worker = await getWorkerStatus();
    const status = readinessStatus(true, worker.online);
    return NextResponse.json({ status: status === 200 ? "ready" : "not-ready", database: "ok", worker }, {
      status,
    });
  } catch (error) {
    return NextResponse.json({ status: "not-ready", database: "error", error: String(error) }, { status: 503 });
  }
}
