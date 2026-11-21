import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { listBrokenLinks } from "@/lib/scan/brokenLinks";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take")) || 200, 1), 500);
  const type = req.nextUrl.searchParams.get("type");
  const localizedPage = await prisma.page.findFirst({
    where: { scanId: id, requestedProvince: { not: null } }, select: { id: true },
  });
  const links = await listBrokenLinks(id, { type, cursor, take: take + 1, localized: !!localizedPage });
  const hasMore = links.length > take;
  if (hasMore) links.pop();
  return NextResponse.json({ links, nextCursor: hasMore ? links.at(-1)?.id : null }, { headers: { "Cache-Control": "private, no-store" } });
}
