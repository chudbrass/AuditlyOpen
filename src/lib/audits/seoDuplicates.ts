import { prisma } from "@/lib/db";

interface PageIdentity {
  id: string;
  url: string;
  title: string | null;
  metaDescription: string | null;
  requestedProvince: string | null;
  language: string | null;
}

function groupBy(pages: PageIdentity[], key: "title" | "metaDescription"): Map<string, PageIdentity[]> {
  const groups = new Map<string, PageIdentity[]>();
  for (const page of pages) {
    const value = page[key];
    if (!value) continue;
    const groupKey = JSON.stringify([value, page.requestedProvince, page.requestedProvince ? page.language : null]);
    const group = groups.get(groupKey) ?? [];
    group.push(page);
    groups.set(groupKey, group);
  }
  return groups;
}

export async function createDuplicateSeoFindings(scanId: string): Promise<void> {
  const pages = await prisma.page.findMany({
    where: { scanId, status: "FETCHED" },
    select: { id: true, url: true, title: true, metaDescription: true, requestedProvince: true, language: true },
  });

  const triage = { conformance: "SEO", responsibleRole: "author", elementType: "metadata" };

  const findingsData: {
    scanId: string;
    category: "SEO";
    severity: "SERIOUS";
    code: string;
    message: string;
    province: string | null;
    language: string | null;
    evidence: object;
    conformance: string;
    responsibleRole: string;
    elementType: string;
  }[] = [];

  for (const group of groupBy(pages, "title").values()) {
    if (group.length < 2) continue;
    const { title, requestedProvince, language } = group[0];
    findingsData.push({
      scanId,
      province: requestedProvince,
      language: requestedProvince ? language : null,
      category: "SEO",
      severity: "SERIOUS",
      code: "seo.duplicate-title",
      message: `${group.length} pages share the title "${title}"`,
      evidence: { title, pageUrls: group.map((p) => p.url) },
      ...triage,
    });
  }

  for (const group of groupBy(pages, "metaDescription").values()) {
    if (group.length < 2) continue;
    const { metaDescription, requestedProvince, language } = group[0];
    findingsData.push({
      scanId,
      province: requestedProvince,
      language: requestedProvince ? language : null,
      category: "SEO",
      severity: "SERIOUS",
      code: "seo.duplicate-meta-description",
      message: `${group.length} pages share the same meta description`,
      evidence: { metaDescription, pageUrls: group.map((p) => p.url) },
      ...triage,
    });
  }

  // Delete-then-insert makes this idempotent — if the worker dies between the finalize claim
  // and here, the resume path can safely run it again without doubling the findings.
  await prisma.finding.deleteMany({
    where: { scanId, code: { in: ["seo.duplicate-title", "seo.duplicate-meta-description"] } },
  });
  if (findingsData.length > 0) {
    await prisma.finding.createMany({ data: findingsData });
  }
}
