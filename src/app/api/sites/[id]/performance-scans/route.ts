import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listPerformancePages, startPageAuditScan } from "@/lib/scan/startPageAuditScan";

interface Params {
  params: Promise<{ id: string }>;
}

const performanceScanInput = z.object({
  pageUrl: z.string().trim().url("Choose a valid page URL"),
});

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const result = await listPerformancePages(id, req.nextUrl.searchParams.get("q") ?? "");
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "not-found" ? "Site not found" : "Run a crawl scan first" },
      { status: result.reason === "not-found" ? 404 : 422 }
    );
  }
  return NextResponse.json({ pages: result.pages });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = performanceScanInput.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "Choose a page" }, { status: 400 });
  }

  const result = await startPageAuditScan(id, body.data.pageUrl);
  if (!result.ok) {
    const responses = {
      "not-found": ["Site not found", 404],
      "no-crawl-scan": ["Run a crawl scan before starting a performance scan", 422],
      "page-not-found": ["Choose a page from the latest completed crawl", 422],
    } as const;
    const [error, status] = responses[result.reason];
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({ scan: result.scan }, { status: 201 });
}
