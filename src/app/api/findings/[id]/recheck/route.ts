import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueue } from "@/lib/queue";
import { QUEUE_ITEM_CHECK } from "@/workers/jobs/queues";

interface Params {
  params: Promise<{ id: string }>;
}

function evidenceString(evidence: unknown, key: string): string | null {
  if (!evidence || typeof evidence !== "object" || !(key in evidence)) return null;
  const value = (evidence as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const observation = await prisma.finding.findUnique({ where: { id }, select: { duplicateOfId: true } });
  if (!observation) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  const finding = await prisma.finding.findUnique({
    where: { id: observation.duplicateOfId ?? id },
    include: { page: { select: { url: true } }, scan: { include: { site: true } } },
  });
  if (!finding) return NextResponse.json({ error: "Finding not found" }, { status: 404 });

  const active = await prisma.itemCheck.findFirst({
    where: { findingId: finding.id, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
  if (active) return NextResponse.json({ check: active });

  const targetUrl = evidenceString(finding.evidence, "targetUrl");
  const pageUrl = finding.page?.url ?? targetUrl ?? finding.scan.site.rootUrl;
  const check = await prisma.itemCheck.create({
    data: {
      siteId: finding.scan.siteId,
      findingId: finding.id,
      findingCode: finding.code,
      pageUrl,
      taskPageUrl: finding.page?.url ?? null,
      targetUrl,
    },
  });

  try {
    const jobId = await enqueue(QUEUE_ITEM_CHECK, { itemCheckId: check.id });
    if (!jobId) throw new Error("The recheck job could not be queued.");
  } catch (error) {
    const failed = await prisma.itemCheck.update({
      where: { id: check.id },
      data: { status: "FAILED", error: error instanceof Error ? error.message : String(error), finishedAt: new Date() },
    });
    return NextResponse.json({ check: failed }, { status: 503 });
  }

  return NextResponse.json({ check }, { status: 202 });
}
