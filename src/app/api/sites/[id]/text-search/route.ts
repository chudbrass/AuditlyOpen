import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createQueuedScan } from "@/lib/scan/createQueuedScan";
import { provinceSelection } from "@/lib/scan/provinceSelection";

const input = z.object({
  provinces: provinceSelection,
  query: z.string().trim().min(1, "Enter text to search for").max(250).refine(
    (query) => !query.includes("\0"),
    "Enter valid search text"
  ),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = input.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message }, { status: 400 });
  }

  const result = await createQueuedScan(id, "TEXT_SEARCH", {
    textSearchQuery: body.data.query,
    scanProvinces: body.data.provinces,
  });
  if (!result.ok) {
    if (result.reason === "unsupported-provinces") {
      return NextResponse.json({ error: "One or more selected provinces are unavailable for this site" }, { status: 400 });
    }
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  return NextResponse.json({ scanId: result.scan.id }, { status: 201 });
}
