import { NextRequest, NextResponse } from "next/server";
import { PageStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

interface Params {
  params: Promise<{ id: string }>;
}

function parseStatus(value: string | null): PageStatus | null {
  if (value && (Object.values(PageStatus) as string[]).includes(value)) {
    return value as PageStatus;
  }
  return null;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const status = parseStatus(req.nextUrl.searchParams.get("status"));
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take")) || 200, 1), 500);

  const pages = await prisma.page.findMany({
    where: { scanId: id, status: status ? { equals: status, not: "REDIRECTED" } : { not: "REDIRECTED" } },
    orderBy: [{ depth: "asc" }, { id: "asc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = pages.length > take;
  if (hasMore) pages.pop();
  return NextResponse.json({ pages, nextCursor: hasMore ? pages.at(-1)?.id : null }, { headers: { "Cache-Control": "private, no-store" } });
}
