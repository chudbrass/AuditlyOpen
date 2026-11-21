import { Scan } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentSiteSnapshots, HEALTH_FINDING_CATEGORIES } from "@/lib/currentSiteSnapshot";
import { EMPTY_COUNTS, issueTotal, parseIssueCounts, type IssueCounts } from "@/lib/issueCounts";
import { crawlBrand } from "@/lib/crawler/brand";

export { issueTotal, parseIssueCounts, type IssueCounts } from "@/lib/issueCounts";
export const SITE_ORDER_SETTING_KEY = "dashboard.siteOrder";

export interface SiteSummary {
  id: string;
  name: string;
  rootUrl: string;
  maxPages: number;
  pageLimitPerProvince: boolean;
  spellcheckEnabled: boolean;
  latestScan: SummaryScan | null; // latest completed scan (scores populated)
  activeScan: SummaryScan | null; // currently running scan, if any
  previousScan: SummaryScan | null;
  issueCounts: IssueCounts;
  categoryCounts: Partial<Record<(typeof HEALTH_FINDING_CATEGORIES)[number], number>>;
  openIssues: number;
  scoreHistory: number[]; // oldest → newest overall scores
  currentFindingScanIds: string[];
}

export interface DashboardAlert {
  level: "critical" | "warning" | "info" | "ok";
  message: string;
  siteName: string;
  at: Date;
}

export interface DashboardData {
  sites: SiteSummary[];
  allSites: SiteSummary[];
  selectedSiteId: string | null;
  kpis: {
    avgHealth: number | null;
    avgHealthDelta: number | null;
    avgHealthHistory: number[];
    totalSites: number;
    totalPages: number;
    totalIssues: number;
    totalIssuesHistory: number[];
    issuesDelta: number | null;
    criticalIssues: number;
    criticalDelta: number | null;
    pagesNotScannedPct: number | null;
  };
  severityCounts: IssueCounts;
  categoryCounts: Record<string, number>;
  spelling: {
    enabledSites: number;
    totalSites: number;
    affectedPages: number;
    topWords: { word: string; count: number }[];
  };
  issueTrend: Record<string, string | number | null>[];
  scoreTrend: Record<string, string | number | null>[];
  healthDistribution: { label: string; range: string; count: number; color: string }[];
  alerts: DashboardAlert[];
  recentScans: (Scan & { site: { name: string } })[];
  dateRange: { from: Date; to: Date } | null;
  tasks: {
    total: number;
    completed: number;
    inProgress: number;
    open: number;
    overdue: number;
    dueThisWeek: number;
    completionPct: number | null;
  };
}

const ACTIVE_STATUSES = ["QUEUED", "CRAWLING", "AUDITING"] as const;
const SCAN_RETENTION_DAYS = 90;
const MAX_TREND_SCANS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

type TrendScan = Pick<Scan, "siteId" | "startedAt" | "scoreOverall" | "issueCounts">;

function parseSiteOrder(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

export type SummaryScan = Pick<
  Scan,
  | "id"
  | "siteId"
  | "status"
  | "scanType"
  | "startedAt"
  | "scoreOverall"
  | "issueCounts"
  | "pagesCrawled"
  | "pagesFound"
  | "linksChecked"
  | "linksBroken"
>;

export async function getSiteSummaries(): Promise<SiteSummary[]> {
  const [sites, orderSetting] = await Promise.all([
    prisma.site.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        scans: {
          orderBy: { startedAt: "desc" },
          take: 50,
          select: {
            id: true, siteId: true, status: true, scanType: true, startedAt: true,
            scoreOverall: true, issueCounts: true, pagesCrawled: true, pagesFound: true,
            linksChecked: true, linksBroken: true,
          },
        },
      },
    }),
    prisma.appSetting.findUnique({ where: { key: SITE_ORDER_SETTING_KEY } }),
  ]);
  const snapshots = new Map((await getCurrentSiteSnapshots(sites.map((site) => site.id))).map((snapshot) => [snapshot.siteId, snapshot]));
  const fallbackOrder = new Map(sites.map((site, index) => [site.id, index]));
  const savedOrder = new Map(parseSiteOrder(orderSetting?.value).map((id, index) => [id, index]));
  const orderedSites = sites.slice().sort((a, b) => {
    const aOrder = savedOrder.get(a.id);
    const bOrder = savedOrder.get(b.id);
    if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
    if (aOrder !== undefined) return -1;
    if (bOrder !== undefined) return 1;
    return (fallbackOrder.get(a.id) ?? 0) - (fallbackOrder.get(b.id) ?? 0);
  });

  return orderedSites.map((site) => {
    const completed = site.scans.filter((s) => s.status === "COMPLETE" && s.scanType === "CRAWL");
    const snapshot = snapshots.get(site.id);
    const latestScan = snapshot?.crawl
      ? { ...snapshot.crawl, scoreOverall: snapshot.scoreOverall, issueCounts: snapshot.issueCounts }
      : null;
    const previousScan = latestScan ? completed.find((scan) => scan.startedAt < latestScan.startedAt) ?? null : null;
    const activeScan =
      site.scans.find((s) => (ACTIVE_STATUSES as readonly string[]).includes(s.status)) ?? null;
    const counts = snapshot?.issueCounts ?? { ...EMPTY_COUNTS };

    return {
      id: site.id,
      name: site.name,
      rootUrl: site.rootUrl,
      maxPages: site.maxPages,
      pageLimitPerProvince: crawlBrand(site.rootUrl) !== null,
      spellcheckEnabled: site.spellcheckEnabled,
      latestScan,
      activeScan,
      previousScan,
      issueCounts: counts,
      categoryCounts: snapshot?.categoryCounts ?? {},
      openIssues: issueTotal(counts),
      currentFindingScanIds: snapshot?.findingScanIds ?? [],
      scoreHistory: completed
        .slice()
        .reverse()
        .map((s) => s.scoreOverall)
        .filter((s): s is number => s !== null),
    };
  });
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayLabel(key: string): string {
  const [, m, d] = key.split("-");
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1]} ${Number(d)}`;
}

/**
 * Portfolio trends: for each point in time, carry each site's most recent scan forward.
 * Granularity is per-day once history spans multiple days; for single-day history (fresh
 * installs, demos) it falls back to per-scan points so the trend isn't empty.
 */
function buildTrends(allCompleted: TrendScan[]): {
  issueTrend: Record<string, string | number | null>[];
  scoreTrend: Record<string, string | number | null>[];
} {
  const sorted = allCompleted.slice().sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const days = [...new Set(sorted.map((s) => dayKey(s.startedAt)))];

  const perScan = days.length < 2;
  const issueTrend: Record<string, string | number | null>[] = [];
  const scoreTrend: Record<string, string | number | null>[] = [];
  const latestPerSite = new Map<string, TrendScan>();
  const totals = { ...EMPTY_COUNTS };
  let scoreTotal = 0;
  let scoreCount = 0;

  const applyScan = (scan: TrendScan) => {
    const previous = latestPerSite.get(scan.siteId);
    if (previous) {
      const previousCounts = parseIssueCounts(previous.issueCounts);
      totals.critical -= previousCounts.critical;
      totals.serious -= previousCounts.serious;
      totals.moderate -= previousCounts.moderate;
      totals.minor -= previousCounts.minor;
      if (previous.scoreOverall !== null) {
        scoreTotal -= previous.scoreOverall;
        scoreCount--;
      }
    }
    const counts = parseIssueCounts(scan.issueCounts);
    totals.critical += counts.critical;
    totals.serious += counts.serious;
    totals.moderate += counts.moderate;
    totals.minor += counts.minor;
    if (scan.scoreOverall !== null) {
      scoreTotal += scan.scoreOverall;
      scoreCount++;
    }
    latestPerSite.set(scan.siteId, scan);
  };
  const addPoint = (label: string) => {
    issueTrend.push({ label, ...totals });
    scoreTrend.push({ label, score: scoreCount ? Math.round(scoreTotal / scoreCount) : null });
  };

  for (let index = 0; index < sorted.length; ) {
    const pointKey = perScan ? sorted[index].startedAt.getTime().toString() : dayKey(sorted[index].startedAt);
    let nextIndex = index;
    while (nextIndex < sorted.length) {
      const nextKey = perScan
        ? sorted[nextIndex].startedAt.getTime().toString()
        : dayKey(sorted[nextIndex].startedAt);
      if (nextKey !== pointKey) break;
      applyScan(sorted[nextIndex]);
      nextIndex++;
    }
    const label = perScan
      ? sorted[index].startedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : dayLabel(pointKey);
    const duplicatePoints = perScan ? nextIndex - index : 1;
    for (let point = 0; point < duplicatePoints; point++) addPoint(label);
    index = nextIndex;
  }

  return { issueTrend, scoreTrend };
}

const ALERT_LEVEL_MAP: Record<string, DashboardAlert["level"]> = {
  CRITICAL: "critical",
  WARNING: "warning",
  INFO: "info",
  OK: "ok",
};

export async function getRecentAlerts(siteId?: string): Promise<DashboardAlert[]> {
  const rows = await prisma.alert.findMany({
    where: siteId ? { siteId } : undefined,
    orderBy: [{ read: "asc" }, { createdAt: "desc" }],
    take: 6,
    include: { site: { select: { name: true } } },
  });
  return rows.map((row) => ({
    level: ALERT_LEVEL_MAP[row.level] ?? "info",
    message: row.message,
    siteName: row.site.name,
    at: row.createdAt,
  }));
}

export async function getTaskSummary(siteId?: string): Promise<DashboardData["tasks"]> {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const siteWhere = siteId ? { siteId } : {};
  const [statusGroups, overdue, dueThisWeek] = await Promise.all([
    prisma.task.groupBy({ by: ["status"], where: siteWhere, _count: { _all: true } }),
    prisma.task.count({ where: { ...siteWhere, status: { not: "COMPLETED" }, dueAt: { lt: now } } }),
    prisma.task.count({ where: { ...siteWhere, status: { not: "COMPLETED" }, dueAt: { gte: now, lte: weekFromNow } } }),
  ]);
  const byStatus = new Map(statusGroups.map((group) => [group.status, group._count._all]));
  const completed = byStatus.get("COMPLETED") ?? 0;
  const inProgress = byStatus.get("IN_PROGRESS") ?? 0;
  const open = byStatus.get("OPEN") ?? 0;
  const total = completed + inProgress + open;
  return {
    total,
    completed,
    inProgress,
    open,
    overdue,
    dueThisWeek,
    completionPct: total > 0 ? Math.round((completed / total) * 100) : null,
  };
}

export async function getDashboardTrendData(siteId?: string) {
  const trendSince = new Date(Date.now() - SCAN_RETENTION_DAYS * DAY_MS);
  const scans = await prisma.scan.findMany({
    where: { status: "COMPLETE", scanType: "CRAWL", startedAt: { gte: trendSince }, ...(siteId ? { siteId } : {}) },
    orderBy: { startedAt: "desc" },
    take: MAX_TREND_SCANS,
    select: { siteId: true, startedAt: true, scoreOverall: true, issueCounts: true },
  });
  return buildTrends(scans.reverse());
}

export async function getRecentScans(siteId?: string): Promise<DashboardData["recentScans"]> {
  return prisma.scan.findMany({
    where: siteId ? { siteId } : undefined,
    orderBy: { startedAt: "desc" },
    take: 8,
    include: { site: { select: { name: true } } },
  });
}

export function getCategoryCounts(sites: SiteSummary[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const site of sites) {
    for (const [category, count] of Object.entries(site.categoryCounts)) {
      counts[category] = (counts[category] ?? 0) + count;
    }
  }
  return counts;
}

export async function getSpellingSummary(sites: SiteSummary[]): Promise<DashboardData["spelling"]> {
  const scanIds = sites.flatMap((site) => site.currentFindingScanIds);
  const findings = scanIds.length ? await prisma.finding.findMany({
    where: { scanId: { in: scanIds }, duplicateOfId: null, code: "qa.misspellings" },
    orderBy: { id: "desc" }, take: 500, select: { evidence: true },
  }) : [];
  const counts = new Map<string, number>();
  for (const finding of findings) {
    const evidence = finding.evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) continue;
    const words = (evidence as Record<string, unknown>).words;
    if (!Array.isArray(words)) continue;
    for (const item of words) {
      if (typeof item !== "string") continue;
      const match = item.match(/^(.*?) \(×(\d+)\)$/u);
      const word = (match?.[1] ?? item).trim().toLowerCase();
      const count = match ? Number(match[2]) : 1;
      if (word) counts.set(word, (counts.get(word) ?? 0) + count);
    }
  }
  return {
    enabledSites: sites.filter((site) => site.spellcheckEnabled).length,
    totalSites: sites.length,
    affectedPages: findings.length,
    topWords: [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([word, count]) => ({ word, count })),
  };
}

export async function getDashboardData({
  siteId,
}: {
  siteId?: string | null;
} = {}): Promise<DashboardData> {
  const trendSince = new Date(Date.now() - SCAN_RETENTION_DAYS * DAY_MS);
  // Start portfolio-independent work immediately. A supplied site id is validated after
  // summaries resolve; an unknown id simply yields empty site-scoped results.
  const allSitesPromise = getSiteSummaries();
  const allCompletedPromise = prisma.scan.findMany({
    where: {
      status: "COMPLETE",
      scanType: "CRAWL",
      startedAt: { gte: trendSince },
      ...(siteId ? { siteId } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: MAX_TREND_SCANS,
    select: { siteId: true, startedAt: true, scoreOverall: true, issueCounts: true },
  });
  const recentScansPromise = prisma.scan.findMany({
    where: siteId ? { siteId } : undefined,
    orderBy: { startedAt: "desc" },
    take: 8,
    include: { site: { select: { name: true } } },
  });
  const alertsPromise = getRecentAlerts(siteId ?? undefined);
  const tasksPromise = getTaskSummary(siteId ?? undefined);

  const allSites = await allSitesPromise;
  const selectedSite = siteId ? allSites.find((site) => site.id === siteId) ?? null : null;
  const selectedSiteId = selectedSite?.id ?? null;
  const sites = selectedSite ? [selectedSite] : allSites;
  const latestScanIds = sites.flatMap((site) => site.currentFindingScanIds);

  const [allCompleted, recentScans, alerts, tasks, spellingFindings] = await Promise.all([
    allCompletedPromise.then((scans) => scans.reverse()),
    recentScansPromise,
    alertsPromise,
    tasksPromise,
    latestScanIds.length
      ? prisma.finding.findMany({
          where: { scanId: { in: latestScanIds }, duplicateOfId: null, code: "qa.misspellings" },
          orderBy: { id: "desc" },
          take: 500,
          select: { evidence: true },
        })
      : Promise.resolve([]),
  ]);

  const categoryCounts = getCategoryCounts(sites);

  const spellingWordCounts = new Map<string, number>();
  for (const finding of spellingFindings) {
    const evidence = finding.evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) continue;
    const words = (evidence as Record<string, unknown>).words;
    if (!Array.isArray(words)) continue;
    for (const item of words) {
      if (typeof item !== "string") continue;
      const match = item.match(/^(.*?) \(×(\d+)\)$/u);
      const word = (match?.[1] ?? item).trim().toLowerCase();
      const count = match ? Number(match[2]) : 1;
      if (word) spellingWordCounts.set(word, (spellingWordCounts.get(word) ?? 0) + count);
    }
  }
  const topSpellingWords = [...spellingWordCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([word, count]) => ({ word, count }));

  const severityCounts = { ...EMPTY_COUNTS };
  let totalPages = 0;
  let totalFound = 0;
  const healthScores: number[] = [];
  const prevHealthScores: number[] = [];
  let totalIssues = 0;
  let prevTotalIssues = 0;
  let criticalIssues = 0;
  let prevCritical = 0;
  let hasPrev = false;

  for (const site of sites) {
    if (!site.latestScan) continue;
    severityCounts.critical += site.issueCounts.critical;
    severityCounts.serious += site.issueCounts.serious;
    severityCounts.moderate += site.issueCounts.moderate;
    severityCounts.minor += site.issueCounts.minor;
    totalPages += site.latestScan.pagesCrawled;
    totalFound += site.latestScan.pagesFound;
    totalIssues += site.openIssues;
    criticalIssues += site.issueCounts.critical;
    if (site.latestScan.scoreOverall !== null) healthScores.push(site.latestScan.scoreOverall);
    if (site.previousScan) {
      hasPrev = true;
      const prevCounts = parseIssueCounts(site.previousScan.issueCounts);
      prevTotalIssues += issueTotal(prevCounts);
      prevCritical += prevCounts.critical;
      if (site.previousScan.scoreOverall !== null) prevHealthScores.push(site.previousScan.scoreOverall);
    } else {
      prevTotalIssues += site.openIssues;
      prevCritical += site.issueCounts.critical;
      if (site.latestScan.scoreOverall !== null) prevHealthScores.push(site.latestScan.scoreOverall);
    }
  }

  const avg = (arr: number[]) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  const avgHealth = avg(healthScores);
  const prevAvgHealth = avg(prevHealthScores);

  const { issueTrend, scoreTrend } = buildTrends(allCompleted);

  const buckets = [
    { label: "Excellent", range: "90–100", min: 90, max: 100, color: "#16a34a" },
    { label: "Good", range: "70–89", min: 70, max: 89, color: "#4ade80" },
    { label: "Fair", range: "50–69", min: 50, max: 69, color: "#f59e0b" },
    { label: "Poor", range: "0–49", min: 0, max: 49, color: "#ef4444" },
  ];
  const healthDistribution = buckets.map((b) => ({
    label: b.label,
    range: b.range,
    color: b.color,
    count: healthScores.filter((s) => s >= b.min && s <= b.max).length,
  }));

  const avgHealthHistory = scoreTrend
    .map((row) => row.score)
    .filter((v): v is number => typeof v === "number");
  const totalIssuesHistory = issueTrend.map((row) => {
    const c = Number(row.critical ?? 0);
    const s = Number(row.serious ?? 0);
    const m = Number(row.moderate ?? 0);
    const mi = Number(row.minor ?? 0);
    return c + s + m + mi;
  });

  const dateRange =
    allCompleted.length > 0
      ? {
          from: allCompleted[0].startedAt,
          to: allCompleted[allCompleted.length - 1].startedAt,
        }
      : null;

  return {
    sites,
    allSites,
    selectedSiteId,
    kpis: {
      avgHealth,
      avgHealthDelta: hasPrev && avgHealth !== null && prevAvgHealth !== null ? avgHealth - prevAvgHealth : null,
      avgHealthHistory,
      totalSites: sites.length,
      totalPages,
      totalIssues,
      totalIssuesHistory,
      issuesDelta: hasPrev ? totalIssues - prevTotalIssues : null,
      criticalIssues,
      criticalDelta: hasPrev ? criticalIssues - prevCritical : null,
      pagesNotScannedPct: totalFound > 0 ? Math.round(((totalFound - totalPages) / totalFound) * 1000) / 10 : null,
    },
    severityCounts,
    categoryCounts,
    spelling: {
      enabledSites: sites.filter((site) => site.spellcheckEnabled).length,
      totalSites: sites.length,
      affectedPages: spellingFindings.length,
      topWords: topSpellingWords,
    },
    issueTrend,
    scoreTrend,
    healthDistribution,
    alerts,
    recentScans,
    dateRange,
    tasks,
  };
}
