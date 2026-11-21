import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { taskCreateSchema } from "@/lib/validation/task";

export async function GET(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take")) || 100, 1), 200);
  const tasks = await prisma.task.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      site: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });
  const hasMore = tasks.length > take;
  if (hasMore) tasks.pop();
  return NextResponse.json({ tasks, nextCursor: hasMore ? tasks.at(-1)?.id : null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { dueAt, ...rest } = parsed.data;

  const task = await prisma.task.create({
    data: {
      ...rest,
      dueAt: dueAt ? new Date(dueAt) : null,
    },
    include: {
      site: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ task }, { status: 201 });
}
