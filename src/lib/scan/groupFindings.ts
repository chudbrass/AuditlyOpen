import { prisma } from "@/lib/db";
import { Category, Prisma, Severity } from "@prisma/client";
import type { GroupedIssue } from "@/components/scan/IssueGroups";

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, SERIOUS: 1, MODERATE: 2, MINOR: 3 };
const MAX_SAMPLE_PAGES = 8;
const MAX_SAMPLE_SNIPPETS = 3;
const SAMPLE_FINDING_LIMIT = 24;
const DETAIL_CONCURRENCY = 8;

function evidenceStrings(evidence: unknown, key: string): string[] {
  if (evidence && typeof evidence === "object" && key in evidence) {
    const value = (evidence as Record<string, unknown>)[key];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function evidenceString(evidence: unknown, key: string): string | null {
  if (evidence && typeof evidence === "object" && key in evidence) {
    const value = (evidence as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return null;
}

export interface FindingGroupFilters {
  severity?: Severity | null;
  category?: Category | null;
  categories?: readonly Category[];
  province?: string;
  language?: string;
  /** @deprecated Counts are always exact; retained for call-site compatibility. */
  take?: number;
  /** Cap on returned groups (top N by severity then count). */
  limit?: number;
}

function findingFilter(
  scanId: string,
  { severity, category, categories, province, language }: FindingGroupFilters
): Prisma.FindingWhereInput {
  const where: Prisma.FindingWhereInput = {
    scanId,
    province,
    language,
    ...(severity ? { severity } : {}),
    ...(category ? { category } : {}),
    ...(!category && categories ? { category: { in: [...categories] } } : {}),
  };
  // A locale report uses the observations from the selected locale, which may
  // be represented by a finding from another province in the overall report.
  if (!province && !language) where.duplicateOfId = null;
  return where;
}

async function attachPageProvinces(
  scanId: string,
  pages: { url: string }[],
  where: Prisma.FindingWhereInput,
  localized: boolean,
  allPages = false
): Promise<GroupedIssue["samplePages"]> {
  const provincesByPage = new Map<string, Set<string>>();
  if (localized && pages.length > 0) {
    const observations = await prisma.finding.findMany({
      where: {
        ...where,
        page: { scanId, ...(allPages ? {} : { url: { in: pages.map(({ url }) => url) } }) },
      },
      select: { province: true, affectedProvinces: true, page: { select: { url: true } } },
    });
    for (const observation of observations) {
      if (!observation.page) continue;
      const { url } = observation.page;
      const provinces = provincesByPage.get(url) ?? new Set<string>();
      if (observation.province) provinces.add(observation.province);
      if (!where.province && !where.language) {
        for (const affectedProvince of observation.affectedProvinces) provinces.add(affectedProvince);
      }
      provincesByPage.set(url, provinces);
    }
  }

  return pages.map(({ url }) => ({ url, provinces: [...(provincesByPage.get(url) ?? [])].sort() }));
}

export async function listAffectedPages(scanId: string, code: string, filters: FindingGroupFilters) {
  const where = { ...findingFilter(scanId, filters), code };
  const [pages, localizedPage] = await Promise.all([
    prisma.page.groupBy({
      by: ["url"],
      where: { scanId, findings: { some: where } },
      orderBy: { url: "asc" },
    }),
    prisma.page.findFirst({ where: { scanId, requestedProvince: { not: null } }, select: { id: true } }),
  ]);
  return attachPageProvinces(scanId, pages, where, !!localizedPage, true);
}

/**
 * Groups by rule in Postgres, then fetches bounded page and snippet samples for the selected rules.
 */
export async function groupScanFindings(
  scanId: string,
  { limit, ...filters }: FindingGroupFilters = {}
): Promise<{ groups: GroupedIssue[]; totalGroupCount: number; totalFindingCount: number }> {
  const where = findingFilter(scanId, filters);

  const [aggregates, localizedPage] = await Promise.all([
    prisma.finding.groupBy({ by: ["code"], where, _count: { _all: true } }),
    prisma.page.findFirst({ where: { scanId, requestedProvince: { not: null } }, select: { id: true } }),
  ]);
  const totalFindingCount = aggregates.reduce((total, row) => total + row._count._all, 0);
  // This is one row per rule, not one row per finding. It supplies the stable rule metadata
  // required to preserve the existing severity-first presentation order.
  const metadata = await prisma.finding.findMany({
    where,
    distinct: ["code"],
    select: {
      code: true,
      category: true,
      severity: true,
      conformance: true,
      responsibleRole: true,
      message: true,
      evidence: true,
    },
    orderBy: { id: "asc" },
  });
  const metadataByCode = new Map(metadata.map((finding) => [finding.code, finding]));
  const selected = aggregates
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[metadataByCode.get(a.code)?.severity ?? ""] ?? 9) -
          (SEVERITY_ORDER[metadataByCode.get(b.code)?.severity ?? ""] ?? 9) ||
        b._count._all - a._count._all
    )
    .slice(0, limit);

  const details = await mapWithConcurrency(selected, DETAIL_CONCURRENCY, async (aggregate) => {
    const groupWhere: Prisma.FindingWhereInput = { ...where, code: aggregate.code };
    const representative = metadataByCode.get(aggregate.code);
    const pageWhere = { scanId, findings: { some: groupWhere } };
    const [pages, samples] = await Promise.all([
      localizedPage
        ? prisma.page.groupBy({ by: ["url"], where: pageWhere, orderBy: { url: "asc" } })
            .then((urls) => ({ count: urls.length, sample: urls.slice(0, MAX_SAMPLE_PAGES) }))
        : Promise.all([
            prisma.page.count({ where: pageWhere }),
            prisma.page.findMany({ where: pageWhere, select: { url: true }, orderBy: { url: "asc" }, take: MAX_SAMPLE_PAGES }),
          ]).then(([count, sample]) => ({ count, sample })),
      prisma.finding.findMany({
        where: groupWhere,
        select: { evidence: true },
        orderBy: { id: "asc" },
        take: SAMPLE_FINDING_LIMIT,
      }),
    ]);
    // Tolerate a concurrently deleted scan rather than returning a malformed group.
    if (!representative) return null;

    const samplePages = await attachPageProvinces(scanId, pages.sample, groupWhere, !!localizedPage);

    const siteWideProvinces = localizedPage && pages.count === 0
      ? (await prisma.finding.groupBy({
          by: ["province"], where: { ...groupWhere, duplicateOfId: undefined }, orderBy: { province: "asc" },
        })).flatMap(({ province }) => province ? [province] : [])
      : [];

    const sampleSnippets: string[] = [];
    for (const sample of samples) {
      for (const snippet of [
        ...evidenceStrings(sample.evidence, "samples"),
        ...evidenceStrings(sample.evidence, "sampleSelectors"),
      ]) {
        if (sampleSnippets.length >= MAX_SAMPLE_SNIPPETS) break;
        if (!sampleSnippets.includes(snippet)) sampleSnippets.push(snippet);
      }
      if (sampleSnippets.length >= MAX_SAMPLE_SNIPPETS) break;
    }

    return {
      code: aggregate.code,
      category: representative.category,
      severity: representative.severity,
      conformance: representative.conformance,
      responsibleRole: representative.responsibleRole,
      count: aggregate._count._all,
      sampleMessage: representative.message,
      samplePages,
      affectedPageCount: pages.count,
      siteWideProvinces,
      sampleSnippets,
      helpUrl: evidenceString(representative.evidence, "helpUrl"),
    };
  });

  const groups: GroupedIssue[] = (details.filter((group) => group !== null) as GroupedIssue[])
    .sort(
      (a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || b.count - a.count
    );

  return { groups, totalGroupCount: aggregates.length, totalFindingCount };
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await fn(items[index]);
      }
    })
  );
  return results;
}
