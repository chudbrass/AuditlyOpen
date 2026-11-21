import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST() {
  const result = await prisma.alert.updateMany({
    where: { read: false },
    data: { read: true },
  });
  return NextResponse.json({ count: result.count });
}
