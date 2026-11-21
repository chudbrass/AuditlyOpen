import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { startScan } from "@/lib/scan/startScan";
import { provinceSelection } from "@/lib/scan/provinceSelection";
import { z } from "zod";

const input = z.object({ provinces: provinceSelection });

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take")) || 50, 1), 200);
  const scans = await prisma.scan.findMany({
    where: { siteId: id },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = scans.length > take;
  if (hasMore) scans.pop();
  return NextResponse.json({ scans, nextCursor: hasMore ? scans.at(-1)?.id : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let payload: unknown;
  try {
    const raw = await req.text();
    payload = raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid scan request" }, { status: 400 });
  }
  const body = input.safeParse(payload);
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message }, { status: 400 });
  }

  const result = await startScan(id, { scanProvinces: body.data.provinces });
  if (!result.ok) {
    if (result.reason === "unsupported-provinces") {
      return NextResponse.json({ error: "One or more selected provinces are unavailable for this site" }, { status: 400 });
    }
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  return NextResponse.json({ scan: result.scan }, { status: 201 });
}
