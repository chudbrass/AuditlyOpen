import { Category, Severity } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listAffectedPages } from "@/lib/scan/groupFindings";

const querySchema = z.object({
  code: z.string().min(1).max(255),
  category: z.nativeEnum(Category).optional(),
  severity: z.nativeEnum(Severity).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const query = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json({ error: "Invalid issue filters" }, { status: 400 });
  }

  const { code, ...filters } = query.data;
  const pages = await listAffectedPages(id, code, filters);
  return NextResponse.json({ pages }, { headers: { "Cache-Control": "private, no-store" } });
}
