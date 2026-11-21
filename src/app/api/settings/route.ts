import { NextRequest, NextResponse } from "next/server";
import { globalSettingsSchema } from "@/lib/validation/settings";
import { getGlobalSettings, saveGlobalSettings } from "@/lib/settings";

export async function GET() {
  return NextResponse.json({ settings: await getGlobalSettings() });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const parsed = globalSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return NextResponse.json({ settings: await saveGlobalSettings(parsed.data) });
}
