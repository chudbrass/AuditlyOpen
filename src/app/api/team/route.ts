import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { teamMemberCreateSchema } from "@/lib/validation/team";

export async function GET() {
  const members = await prisma.teamMember.findMany({
    orderBy: [{ createdAt: "asc" }],
    include: {
      _count: {
        select: { tasks: { where: { status: { not: "COMPLETED" } } } },
      },
    },
  });
  return NextResponse.json({ members });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = teamMemberCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.teamMember.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return NextResponse.json({ error: "A team member with this email already exists" }, { status: 409 });
  }

  const member = await prisma.teamMember.create({
    data: parsed.data,
    include: {
      _count: {
        select: { tasks: { where: { status: { not: "COMPLETED" } } } },
      },
    },
  });

  return NextResponse.json({ member }, { status: 201 });
}
