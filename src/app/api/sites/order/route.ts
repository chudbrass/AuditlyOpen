import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SITE_ORDER_SETTING_KEY } from "@/lib/dashboard";

const siteOrderSchema = z.object({
  siteIds: z.array(z.string().min(1)).max(10000),
});

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = siteOrderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { siteIds } = parsed.data;
  const uniqueIds = new Set(siteIds);
  if (uniqueIds.size !== siteIds.length) {
    return NextResponse.json({ error: "Site order contains duplicate IDs" }, { status: 400 });
  }

  const sites = await prisma.site.findMany({ select: { id: true } });
  const existingIds = new Set(sites.map((site) => site.id));
  const exactCurrentSet =
    siteIds.length === existingIds.size && siteIds.every((siteId) => existingIds.has(siteId));

  if (!exactCurrentSet) {
    return NextResponse.json({ error: "Site order must include every current site exactly once" }, { status: 400 });
  }

  await prisma.appSetting.upsert({
    where: { key: SITE_ORDER_SETTING_KEY },
    update: { value: siteIds as Prisma.InputJsonValue },
    create: { key: SITE_ORDER_SETTING_KEY, value: siteIds as Prisma.InputJsonValue },
  });

  return NextResponse.json({ siteIds });
}
