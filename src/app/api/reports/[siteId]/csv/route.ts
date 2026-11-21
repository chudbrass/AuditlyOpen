import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentFindingsWhere, getCurrentSiteSnapshot } from "@/lib/currentSiteSnapshot";

function csvEscape(value: string): string {
  // Excel/Sheets interpret these prefixes as formulas even inside quoted CSV cells.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "site";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const snapshot = await getCurrentSiteSnapshot(siteId);
  if (!snapshot.crawl) {
    return NextResponse.json({ error: "No completed scan found" }, { status: 404 });
  }

  const filename = `auditly-${slugify(site.name)}-findings.csv`;
  const encoder = new TextEncoder();
  const batchSize = 1_000;
  let cursor: string | undefined;
  let header = true;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const findings = await prisma.finding.findMany({
          where: currentFindingsWhere(snapshot),
          select: {
            id: true, severity: true, category: true, code: true, message: true,
            affectedProvinces: true, province: true, language: true, page: { select: { url: true } },
          },
          orderBy: { id: "asc" },
          take: batchSize,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        const regionalIds = findings.filter(({ affectedProvinces }) => affectedProvinces.length > 0).map(({ id }) => id);
        const regionalLanguages = regionalIds.length > 0 ? await prisma.finding.groupBy({
          by: ["duplicateOfId", "language"],
          where: { duplicateOfId: { in: regionalIds }, language: { not: null } },
        }) : [];
        const languagesByFinding = new Map<string, Set<string>>();
        for (const { duplicateOfId, language } of regionalLanguages) {
          if (!duplicateOfId || !language) continue;
          const languages = languagesByFinding.get(duplicateOfId) ?? new Set<string>();
          languages.add(language);
          languagesByFinding.set(duplicateOfId, languages);
        }
        const lines: string[] = [];
        if (header) {
          lines.push(["severity", "category", "code", "message", "pageUrl", "provinces", "languages"].map(csvEscape).join(","));
          header = false;
        }
        for (const finding of findings) {
          const provinces = finding.affectedProvinces.join(", ") || finding.province || "";
          const languages = languagesByFinding.get(finding.id) ?? new Set<string>();
          if (finding.language) languages.add(finding.language);
          lines.push([finding.severity, finding.category, finding.code, finding.message, finding.page?.url ?? "", provinces, [...languages].sort().join(", ")]
            .map((cell) => csvEscape(String(cell))).join(","));
        }
        if (lines.length) controller.enqueue(encoder.encode(`${lines.join("\r\n")}\r\n`));
        cursor = findings.at(-1)?.id;
        if (findings.length < batchSize) controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "Pragma": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
