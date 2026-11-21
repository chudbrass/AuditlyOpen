import "server-only";
import { Category, Prisma, Scan } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EMPTY_COUNTS, type IssueCounts } from "@/lib/issueCounts";

export const HEALTH_FINDING_CATEGORIES = ["LINKS", "SEO", "A11Y", "QA", "SECURITY"] as const;

const SCORE_FIELDS = {
  LINKS: "scoreLinks",
  SEO: "scoreSeo",
  A11Y: "scoreA11y",
  QA: "scoreQa",
  SECURITY: "scoreSecurity",
} as const;
type HealthCategory = (typeof HEALTH_FINDING_CATEGORIES)[number];
type ScoreField = (typeof SCORE_FIELDS)[HealthCategory];

export interface CurrentSiteSnapshot {
  siteId: string;
  crawl: Scan | null;
  findingScanIds: string[];
  scores: Record<Category, number | null>;
  scoreOverall: number | null;
  issueCounts: IssueCounts;
  categoryCounts: Partial<Record<HealthCategory, number>>;
  provenance: Partial<
    Record<Category, { sourceScanId: string; scanType: "CRAWL"; scoreVersion: number | null }>
  >;
}

function scoresForCrawl(crawl: Scan | null) {
  const scores = {} as Record<Category, number | null>;
  const provenance: CurrentSiteSnapshot["provenance"] = {};

  for (const category of Object.values(Category)) {
    // Performance is a standalone one-page diagnostic. It is deliberately absent from the
    // site's current health snapshot even if historical crawl rows contain an old score.
    const score = category === "PERFORMANCE"
      ? null
      : crawl?.[SCORE_FIELDS[category as HealthCategory] as ScoreField] ?? null;
    scores[category] = score;
    if (crawl && score !== null) {
      provenance[category] = {
        sourceScanId: crawl.id,
        scanType: "CRAWL",
        scoreVersion: crawl.scoreVersion,
      };
    }
  }

  const present = Object.values(scores).filter((score): score is number => score !== null);
  return {
    scores,
    provenance,
    scoreOverall: present.length
      ? Math.round(present.reduce((sum, score) => sum + score, 0) / present.length)
      : null,
  };
}

function emptyFindingCounts() {
  return {
    issueCounts: { ...EMPTY_COUNTS },
    categoryCounts: {} as CurrentSiteSnapshot["categoryCounts"],
  };
}

export async function getCurrentSiteSnapshot(siteId: string): Promise<CurrentSiteSnapshot> {
  const [snapshot] = await getCurrentSiteSnapshots([siteId]);
  return snapshot ?? { siteId, crawl: null, findingScanIds: [], ...emptyFindingCounts(), ...scoresForCrawl(null) };
}

export async function getCurrentSiteSnapshots(siteIds?: string[]): Promise<CurrentSiteSnapshot[]> {
  const ids = siteIds ?? (await prisma.site.findMany({ select: { id: true } })).map((site) => site.id);
  if (!ids.length) return [];

  const sites = await prisma.site.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      scans: {
        where: { status: "COMPLETE", scanType: "CRAWL" },
        orderBy: [{ finishedAt: { sort: "desc", nulls: "last" } }, { startedAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
  });
  const crawls = sites.map((site) => site.scans[0]).filter((scan): scan is Scan => Boolean(scan));
  const groups = crawls.length
    ? await prisma.finding.groupBy({
        by: ["scanId", "severity", "category"],
        where: {
          scanId: { in: crawls.map((scan) => scan.id) },
          duplicateOfId: null,
          category: { in: [...HEALTH_FINDING_CATEGORIES] },
        },
        _count: { _all: true },
      })
    : [];
  const countsByScan = new Map<string, ReturnType<typeof emptyFindingCounts>>();
  for (const group of groups) {
    const counts = countsByScan.get(group.scanId) ?? emptyFindingCounts();
    const severity = group.severity.toLowerCase() as keyof IssueCounts;
    const category = group.category as HealthCategory;
    counts.issueCounts[severity] += group._count._all;
    counts.categoryCounts[category] = (counts.categoryCounts[category] ?? 0) + group._count._all;
    countsByScan.set(group.scanId, counts);
  }

  return sites.map((site) => {
    const crawl = site.scans[0] ?? null;
    const findingScanIds = crawl ? [crawl.id] : [];
    const counts = (crawl ? countsByScan.get(crawl.id) : undefined) ?? emptyFindingCounts();
    return {
      siteId: site.id,
      crawl,
      findingScanIds,
      ...counts,
      ...scoresForCrawl(crawl),
    };
  });
}

export function currentFindingsWhere(snapshot: CurrentSiteSnapshot): Prisma.FindingWhereInput {
  return {
    scanId: { in: snapshot.findingScanIds },
    duplicateOfId: null,
    category: { in: [...HEALTH_FINDING_CATEGORIES] },
  };
}
