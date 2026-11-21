import { prisma } from "@/lib/db";
import { Category, Prisma, Severity } from "@prisma/client";
import { ALL_RULES } from "@/lib/audits/rules";
import { CONFORMANCE_TO_CATEGORY } from "@/lib/audits/rules/types";
import { getBrokenLinkPairs } from "@/lib/scan/brokenLinks";

const SEVERITY_KEYS = ["critical", "serious", "moderate", "minor"] as const;
type SeverityKey = (typeof SEVERITY_KEYS)[number];

// Weighted-issue-density weights, heaviest first — used by the per-category scores to turn
// raw finding counts into a 0–100 score.
const SEVERITY_WEIGHT: Record<Severity, number> = {
  CRITICAL: 25,
  SERIOUS: 15,
  MODERATE: 7,
  MINOR: 3,
};

export function averageAvailableScores(scores: Array<number | null>): number | null {
  const present = scores.filter((score): score is number => score !== null);
  return present.length ? Math.round(present.reduce((sum, score) => sum + score, 0) / present.length) : null;
}

// Same semantics as before (100 × share of checked links that aren't broken); the totals now
// come from the Scan counters written by finalizeLinkData instead of counting Link rows, since
// only broken links get rows. Scans from before that change have linksChecked 0 but full Link
// rows, so fall back to row counts there.
export const SCORE_VERSION = 5;
export type Coverage = { attempted: number; succeeded: number; failed: number };
const HEALTH_CATEGORIES: Category[] = ["LINKS", "SEO", "A11Y", "QA", "SECURITY"];
const A11Y_RULE_WEIGHTS = new Map(ALL_RULES
  .filter((rule) => rule.scope !== "site" && CONFORMANCE_TO_CATEGORY[rule.conformance] === "A11Y")
  .map((rule) => [rule.id, SEVERITY_WEIGHT[rule.severity]]));
const A11Y_TOTAL_WEIGHT = [...A11Y_RULE_WEIGHTS.values()].reduce((sum, weight) => sum + weight, 0);

// The HTML parser persists an H1 count (including zero) when the page has auditable markup.
const AUDITED_HTML: Prisma.PageWhereInput = {
  status: { in: ["FETCHED", "AUDITED"] },
  h1Count: { not: null },
};

export async function computeLinksScore(scanId: string): Promise<number | null> {
  const localizedPage = await prisma.page.findFirst({
    where: { scanId, requestedProvince: { not: null } },
    select: { id: true },
  });
  if (localizedPage) {
    const [sources, brokenPairs] = await Promise.all([
      prisma.page.groupBy({ by: ["url"], where: { scanId }, _max: { linksChecked: true } }),
      getBrokenLinkPairs(scanId),
    ]);
    const checkedBySource = new Map(sources.map(({ url, _max }) => [url, _max.linksChecked ?? 0]));
    const brokenBySource = new Map<string, number>();
    for (const { sourceUrl } of brokenPairs) {
      brokenBySource.set(sourceUrl, (brokenBySource.get(sourceUrl) ?? 0) + 1);
    }
    // Only broken targets are retained. For each URL, the largest checked set
    // and the union of its broken targets bound the number of distinct checks.
    for (const [url, broken] of brokenBySource) {
      checkedBySource.set(url, Math.max(checkedBySource.get(url) ?? 0, broken));
    }
    const total = [...checkedBySource.values()].reduce((sum, count) => sum + count, 0);
    return total > 0 ? Math.round(100 * (1 - brokenPairs.length / total)) : null;
  }

  const scan = await prisma.scan.findUnique({
    where: { id: scanId },
    select: { linksChecked: true, linksBroken: true },
  });

  let total = scan?.linksChecked ?? 0;
  let broken = scan?.linksBroken ?? 0;
  if (total === 0) {
    total = await prisma.link.count({ where: { scanId } });
    if (total === 0) return null;
    broken = await prisma.link.count({ where: { scanId, broken: true } });
  }
  return Math.max(0, Math.round(100 * (1 - broken / total)));
}

// Score = 100 minus the severity-weighted issue density (weighted issues per page). A single
// SERIOUS issue on every page (density 15) scores 85; a page riddled with issues scores toward 0.
async function countScoredPages(scanId: string): Promise<number> {
  const pages = await prisma.page.groupBy({
    by: ["url"],
    where: { scanId, status: { in: ["FETCHED", "AUDITED"] } },
  });
  return pages.length;
}

async function computeCategoryDensityScore(
  scanId: string, category: Category, pageCountPromise = countScoredPages(scanId)
): Promise<number | null> {
  const pageCount = await pageCountPromise;
  if (pageCount === 0) return null;

  const grouped = await prisma.finding.groupBy({
    by: ["severity"],
    where: { scanId, category, duplicateOfId: null },
    _count: { _all: true },
  });

  const totalWeight = grouped.reduce(
    (sum, row) => sum + SEVERITY_WEIGHT[row.severity] * row._count._all,
    0
  );
  const density = totalWeight / pageCount;
  return Math.max(0, Math.round(100 - density));
}

export function computeSeoScore(scanId: string): Promise<number | null> {
  return computeCategoryDensityScore(scanId, "SEO");
}

export function computeQaScore(scanId: string): Promise<number | null> {
  return computeCategoryDensityScore(scanId, "QA");
}

export function computeSecurityScore(scanId: string): Promise<number | null> {
  return computeCategoryDensityScore(scanId, "SECURITY");
}

export async function computeA11yScore(scanId: string): Promise<number | null> {
  const where = { scanId, ...AUDITED_HTML };
  const pages = await prisma.page.groupBy({ by: ["url"], where });
  if (!pages.length) return null;

  // A URL fails a rule if any audited variant fails it. Repeated elements and provinces
  // affect the issue evidence, but each rule can contribute its weight only once per URL.
  const findings = await prisma.finding.findMany({
    where: { scanId, category: "A11Y", code: { in: [...A11Y_RULE_WEIGHTS.keys()] }, page: where },
    select: { code: true, page: { select: { url: true } } },
  });
  const affectedUrlsByRule = new Map<string, Set<string>>();
  for (const { code, page } of findings) {
    if (!page) continue;
    let urls = affectedUrlsByRule.get(code);
    if (!urls) {
      urls = new Set();
      affectedUrlsByRule.set(code, urls);
    }
    urls.add(page.url);
  }
  let failedWeight = 0;
  for (const [code, urls] of affectedUrlsByRule) {
    failedWeight += (A11Y_RULE_WEIGHTS.get(code) ?? 0) * urls.size;
  }
  return Math.round(100 * (1 - failedWeight / (pages.length * A11Y_TOTAL_WEIGHT)));
}

async function computeCoverage(scanId: string, scanType: "CRAWL" | "PAGE_AUDIT") {
  const [statuses, scan] = await Promise.all([
    prisma.page.groupBy({ by: ["status"], where: { scanId, status: { not: "REDIRECTED" } }, _count: { _all: true } }),
    prisma.scan.findUnique({ where: { id: scanId }, select: { linksChecked: true } }),
  ]);
  const statusCount = new Map(statuses.map((row) => [row.status, row._count._all]));
  const fetched = (statusCount.get("FETCHED") ?? 0) + (statusCount.get("AUDITED") ?? 0);
  const failedFetches = statusCount.get("ERROR") ?? 0;
  const crawlCoverage = { attempted: statuses.reduce((sum, row) => sum + row._count._all, 0), succeeded: fetched, failed: failedFetches };
  if (scanType !== "PAGE_AUDIT") {
    const auditedHtml = await prisma.page.count({ where: { scanId, ...AUDITED_HTML } });
    return {
      LINKS: { attempted: scan?.linksChecked ?? 0, succeeded: scan?.linksChecked ?? 0, failed: 0 },
      SEO: crawlCoverage, QA: crawlCoverage, SECURITY: crawlCoverage,
      A11Y: { attempted: crawlCoverage.attempted, succeeded: auditedHtml, failed: failedFetches },
      PERFORMANCE: { attempted: 0, succeeded: 0, failed: 0 },
    };
  }
  const [attempted, performanceSucceeded] = await Promise.all([
    prisma.page.count({ where: { scanId, audited: true } }),
    prisma.page.count({ where: { scanId, audited: true, perfScore: { not: null } } }),
  ]);
  return {
    LINKS: { attempted: 0, succeeded: 0, failed: 0 }, SEO: { attempted: 0, succeeded: 0, failed: 0 },
    QA: { attempted: 0, succeeded: 0, failed: 0 }, SECURITY: { attempted: 0, succeeded: 0, failed: 0 },
    PERFORMANCE: { attempted, succeeded: performanceSucceeded, failed: attempted - performanceSucceeded },
    A11Y: { attempted: 0, succeeded: 0, failed: 0 },
  };
}

export async function computeIssueCounts(scanId: string): Promise<Record<SeverityKey, number>> {
  const scan = await prisma.scan.findUnique({ where: { id: scanId }, select: { scanType: true } });
  const grouped = await prisma.finding.groupBy({
    by: ["severity"],
    where: {
      scanId,
      duplicateOfId: null,
      category: scan?.scanType === "PAGE_AUDIT" ? "PERFORMANCE" : { in: HEALTH_CATEGORIES },
    },
    _count: { _all: true },
  });

  const counts = Object.fromEntries(SEVERITY_KEYS.map((key) => [key, 0])) as Record<
    SeverityKey,
    number
  >;
  for (const row of grouped) {
    counts[row.severity.toLowerCase() as SeverityKey] = row._count._all;
  }
  return counts;
}

export interface ScanScores {
  scoreLinks: number | null;
  scoreSeo: number | null;
  scoreQa: number | null;
  scoreSecurity: number | null;
  scoreA11y: number | null;
  scoreOverall: number | null;
  issueCounts: Record<SeverityKey, number>;
  scoreVersion: number;
  categoryCoverage: Record<string, Coverage>;
  categoryProvenance: Record<string, { sourceScanId: string; scanType: string; scoreVersion: number }>;
}

// Overall = equal-weighted average across the categories that actually produced a score
// (per docs/ARCHITECTURE.md — "weighted average, weights configurable, default equal").
export async function computeScanScores(scanId: string): Promise<ScanScores> {
  const scan = await prisma.scan.findUnique({ where: { id: scanId }, select: { scanType: true } });
  if (!scan) throw new Error(`scan ${scanId} not found`);
  if (scan.scanType === "TEXT_SEARCH") throw new Error("Text search scans do not have health scores");
  const issueCountsPromise = computeIssueCounts(scanId);
  const categoryCoverage = await computeCoverage(scanId, scan.scanType);
  const provenance = (categories: string[]) => Object.fromEntries(categories.map((category) => [category, { sourceScanId: scanId, scanType: scan.scanType, scoreVersion: SCORE_VERSION }]));

  // A performance scan is an isolated diagnostic for one selected page. Lighthouse's score
  // remains on Page.perfScore, but it never becomes a site/category/overall score or trend.
  if (scan.scanType === "PAGE_AUDIT") {
    return {
      scoreLinks: null,
      scoreSeo: null,
      scoreQa: null,
      scoreSecurity: null,
      scoreA11y: null,
      scoreOverall: null,
      issueCounts: await issueCountsPromise,
      scoreVersion: SCORE_VERSION, categoryCoverage,
      categoryProvenance: {},
    };
  }

  const scoredPages = countScoredPages(scanId);
  const [scoreLinks, scoreSeo, scoreQa, scoreSecurity, scoreA11y, issueCounts] =
    await Promise.all([
      computeLinksScore(scanId),
      computeCategoryDensityScore(scanId, "SEO", scoredPages),
      computeCategoryDensityScore(scanId, "QA", scoredPages),
      computeCategoryDensityScore(scanId, "SECURITY", scoredPages),
      computeA11yScore(scanId),
      issueCountsPromise,
    ]);

  const scoreOverall = averageAvailableScores([scoreLinks, scoreSeo, scoreQa, scoreSecurity, scoreA11y]);

  return {
    scoreLinks,
    scoreSeo,
    scoreQa,
    scoreSecurity,
    scoreA11y,
    scoreOverall,
    issueCounts,
    scoreVersion: SCORE_VERSION, categoryCoverage,
    categoryProvenance: provenance([
      ...(scoreLinks !== null ? ["LINKS"] : []), ...(scoreSeo !== null ? ["SEO"] : []),
      ...(scoreQa !== null ? ["QA"] : []), ...(scoreSecurity !== null ? ["SECURITY"] : []),
      ...(scoreA11y !== null ? ["A11Y"] : []),
    ]),
  };
}
