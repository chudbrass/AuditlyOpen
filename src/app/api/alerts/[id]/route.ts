import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { alertUpdateSchema } from "@/lib/validation/alert";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const parsed = alertUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const alert = await prisma.alert.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ alert });
  } catch {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }
}
