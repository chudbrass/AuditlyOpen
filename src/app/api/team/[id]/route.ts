import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { teamMemberUpdateSchema } from "@/lib/validation/team";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const parsed = teamMemberUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.email) {
    const existing = await prisma.teamMember.findUnique({
      where: { email: parsed.data.email },
    });
    if (existing && existing.id !== id) {
      return NextResponse.json({ error: "A team member with this email already exists" }, { status: 409 });
    }
  }

  try {
    const member = await prisma.teamMember.update({
      where: { id },
      data: parsed.data,
      include: {
        _count: {
          select: { tasks: { where: { status: { not: "COMPLETED" } } } },
        },
      },
    });
    return NextResponse.json({ member });
  } catch {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.teamMember.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }
}
