import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const check = await prisma.itemCheck.findUnique({ where: { id } });
  if (!check) return NextResponse.json({ error: "Recheck not found" }, { status: 404 });
  return NextResponse.json({ check });
}
