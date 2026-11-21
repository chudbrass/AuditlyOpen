import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { siteUpdateSchema } from "@/lib/validation/site";
import { Prisma } from "@prisma/client";
import { SITE_ORDER_SETTING_KEY } from "@/lib/dashboard";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const site = await prisma.site.findUnique({
    where: { id },
    include: { scans: { orderBy: { startedAt: "desc" }, take: 10 } },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });
  return NextResponse.json({ site });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const parsed = siteUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const site = await prisma.site.update({
      where: { id },
      data: {
        ...parsed.data,
        ...("scheduleCron" in parsed.data || "scheduleTimezone" in parsed.data ? { scheduleNextRunAt: null } : {}),
      },
    });
    return NextResponse.json({ site });
  } catch {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    await prisma.$transaction(
      async (tx) => {
        const site = await tx.site.findUnique({ where: { id }, select: { id: true } });
        if (!site) return;

        // A full site deletion also removes its tasks so portfolio metrics cannot
        // retain data that belonged to the deleted site.
        await tx.task.deleteMany({ where: { siteId: id } });
        await tx.site.delete({ where: { id } });

        const orderSetting = await tx.appSetting.findUnique({
          where: { key: SITE_ORDER_SETTING_KEY },
          select: { value: true },
        });
        if (Array.isArray(orderSetting?.value)) {
          await tx.appSetting.update({
            where: { key: SITE_ORDER_SETTING_KEY },
            data: { value: orderSetting.value.filter((siteId) => siteId !== id) },
          });
        }
      },
      // Large sites can contain hundreds of thousands of result rows. The relation
      // indexes keep this fast, while this bounded timeout avoids Prisma's 5s default.
      { maxWait: 5_000, timeout: 60_000 }
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/sites/:id] site deletion failed", { siteId: id, error });
    const message =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? `Database error (${error.code}) while deleting the site`
        : "Could not delete the site";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
