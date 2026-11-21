import { NextRequest, NextResponse } from "next/server";
import { cancelScan } from "@/lib/scan/cancelScan";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const cancelled = await cancelScan(id);
  if (!cancelled) {
    return NextResponse.json({ error: "Scan is not active" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
