import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { siteInputSchema } from "@/lib/validation/site";
import { getGlobalSettings } from "@/lib/settings";

export async function GET() {
  const sites = await prisma.site.findMany({
    orderBy: { createdAt: "desc" },
    include: { scans: { orderBy: { startedAt: "desc" }, take: 1 } },
  });
  return NextResponse.json({ sites });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const settings = await getGlobalSettings();
    const parsed = siteInputSchema.safeParse({
      ...body,
      maxPages: body.maxPages ?? settings.defaultMaxPages,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const site = await prisma.site.create({ data: parsed.data });
    console.log("[api/sites] site created", { siteId: site.id, rootUrl: site.rootUrl });
    return NextResponse.json({ site }, { status: 201 });
  } catch (error) {
    console.error("[api/sites] site creation failed", { error });
    return NextResponse.json({ error: "Could not create the site" }, { status: 500 });
  }
}
