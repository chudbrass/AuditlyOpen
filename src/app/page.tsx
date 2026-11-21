import Link from "next/link";
import { Suspense } from "react";
import {
  getCategoryCounts,
  getDashboardTrendData,
  getRecentAlerts,
  getRecentScans,
  getSiteSummaries,
  getSpellingSummary,
  getTaskSummary,
  type DashboardData,
  type SiteSummary,
} from "@/lib/dashboard";
import { ACTIVE_SCAN_STATUSES, pageLimitLabel, scanTypeLabel } from "@/lib/scan/constants";
import Sparkline from "@/components/charts/Sparkline";
import SeverityDonut from "@/components/charts/SeverityDonut";
import TrendChart from "@/components/charts/TrendChart";
import SiteFavicon from "@/components/SiteFavicon";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  scoreColor,
  scoreLabel,
} from "@/lib/ui/colors";
import { HEALTH_FINDING_CATEGORIES } from "@/lib/currentSiteSnapshot";

export const dynamic = "force-dynamic";

const CARD = "rounded-lg border border-slate-200/80 bg-white shadow-card";
const numberFormat = new Intl.NumberFormat("en-US");
const compactFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatNumber(value: number): string {
  return numberFormat.format(value);
}

function formatCompact(value: number): string {
  return compactFormat.format(value);
}

function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "Never";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function numeric(value: string | number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function Delta({
  value,
  invert = false,
  suffix = "",
  compact = false,
}: {
  value: number | null;
  invert?: boolean;
  suffix?: string;
  compact?: boolean;
}) {
  if (value === null) return <span className="text-[11px] font-medium text-slate-400">Baseline</span>;
  const good = invert ? value <= 0 : value >= 0;
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  const displayValue = compact ? formatCompact(Math.abs(value)) : formatNumber(Math.abs(value));

  return (
    <span className={`text-[11px] font-semibold ${good ? "text-emerald-600" : "text-red-600"}`}>
      {sign}
      {displayValue}
      {suffix}
    </span>
  );
}

function MiniSparkline({
  values,
  color,
  height = 28,
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  if (values.length < 2) {
    return (
      <div
        style={{ height }}
        className="rounded-sm bg-gradient-to-r from-transparent via-slate-100 to-transparent"
      />
    );
  }

  return <Sparkline values={values} color={color} height={height} />;
}

function DonutMetric({
  value,
  total,
  label,
  center,
  color = "#22c55e",
}: {
  value: number;
  total: number;
  label: string;
  center: string;
  color?: string;
}) {
  const size = 118;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="relative mx-auto h-[118px] w-[118px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeWidth={stroke}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-2xl font-bold text-slate-950">{center}</div>
        <div className="text-[11px] font-medium text-slate-500">{label}</div>
      </div>
    </div>
  );
}

const ALERT_STYLES: Record<string, { icon: string; className: string }> = {
  critical: { icon: "!", className: "bg-red-100 text-red-600" },
  warning: { icon: "!", className: "bg-amber-100 text-amber-600" },
  info: { icon: "i", className: "bg-blue-100 text-blue-600" },
  ok: { icon: "ok", className: "bg-emerald-100 text-emerald-600" },
};

function StatusPill({ status }: { status: string }) {
  const className =
    status === "COMPLETE"
      ? "bg-emerald-100 text-emerald-700"
      : status === "FAILED" || status === "CANCELLED"
        ? "bg-red-100 text-red-700"
        : "bg-blue-100 text-blue-700";

  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${className}`}>{status}</span>;
}

function SectionHeader({
  title,
  href,
  action,
}: {
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {href && action && (
        <Link href={href} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
          {action}
        </Link>
      )}
    </div>
  );
}

function SiteCard({ site }: { site: SiteSummary }) {
  const score = site.latestScan?.scoreOverall ?? null;
  const previousScore = site.previousScan?.scoreOverall ?? null;
  const delta = score !== null && previousScore !== null ? score - previousScore : null;
  const color = score !== null ? scoreColor(score) : "#94a3b8";
  const healthLabel = score !== null ? scoreLabel(score) : "Never scanned";

  return (
    <article className={`${CARD} min-w-0 flex-[1_1_220px] p-3 transition-shadow hover:shadow-md`}>
      <div className="flex items-start gap-3">
        <SiteFavicon rootUrl={site.rootUrl} name={site.name} />
        <div className="min-w-0 flex-1">
          <Link href={`/sites/${site.id}`} className="block truncate text-sm font-bold text-slate-900 hover:text-blue-700">
            {site.name}
          </Link>
          <div className="truncate text-[11px] font-medium text-slate-400">{hostLabel(site.rootUrl)}</div>
        </div>
      </div>

      <Link href={`/sites/${site.id}`} className="mt-3 block">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold tracking-tight" style={{ color }}>
              {score !== null ? `${score}%` : "--"}
            </span>
            <Delta value={delta} suffix="%" />
          </div>
          <span className="mb-1 h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        </div>
        <div className="mt-1 h-7">
          <MiniSparkline values={site.scoreHistory} color={color} height={28} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs font-bold text-slate-900">{site.maxPages.toLocaleString()}</div>
            <div className="mt-0.5 text-[10px] font-medium text-slate-400">{pageLimitLabel(site.pageLimitPerProvince)}</div>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">{site.latestScan ? site.openIssues.toLocaleString() : "--"}</div>
            <div className="mt-0.5 text-[10px] font-medium text-slate-400">Open</div>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">{site.latestScan ? site.issueCounts.critical.toLocaleString() : "--"}</div>
            <div className="mt-0.5 text-[10px] font-medium text-slate-400">Critical</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold">
          {site.activeScan ? (
            <>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              <span className="text-blue-600">
                {scanTypeLabel(site.activeScan.scanType)} active
              </span>
            </>
          ) : (
            <>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-slate-500">{healthLabel}</span>
            </>
          )}
        </div>
      </Link>
    </article>
  );
}

function SiteLeaderboard({ sites }: { sites: SiteSummary[] }) {
  const ranked = sites
    .slice()
    .sort((a, b) => (b.latestScan?.scoreOverall ?? -1) - (a.latestScan?.scoreOverall ?? -1))
    .slice(0, 6);

  return (
    <div className={`${CARD} p-4 xl:col-span-7`}>
      <SectionHeader title="Site Health Leaderboard" href="/sites" action="View full leaderboard" />
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-[10px] uppercase text-slate-400">
            <tr>
              <th className="w-8 py-2 font-bold">#</th>
              <th className="py-2 font-bold">Site</th>
              <th className="py-2 font-bold">Health</th>
              <th className="py-2 font-bold">Page limit</th>
              <th className="py-2 font-bold">Open</th>
              <th className="py-2 font-bold">Critical</th>
              <th className="py-2 font-bold">Trend</th>
              <th className="py-2 text-right font-bold">Last scan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ranked.map((site, index) => {
              const score = site.latestScan?.scoreOverall ?? null;
              const color = score !== null ? scoreColor(score) : "#cbd5e1";
              return (
                <tr key={site.id}>
                  <td className="py-2.5 font-semibold text-slate-400">{index + 1}</td>
                  <td className="max-w-[180px] py-2.5">
                    <Link href={`/sites/${site.id}`} className="block truncate font-bold text-slate-900 hover:text-blue-700">
                      {site.name}
                    </Link>
                    <div className="truncate text-[10px] text-slate-400">{hostLabel(site.rootUrl)}</div>
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-8 font-bold text-slate-900">{score !== null ? `${score}%` : "--"}</span>
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${score ?? 0}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 font-semibold text-slate-600">
                    {site.maxPages.toLocaleString()}
                    {site.pageLimitPerProvince && <div className="text-[10px] font-medium text-slate-500">per province</div>}
                  </td>
                  <td className="py-2.5 font-semibold text-slate-600">{site.latestScan ? site.openIssues.toLocaleString() : "--"}</td>
                  <td className="py-2.5 font-semibold text-red-500">{site.latestScan ? site.issueCounts.critical.toLocaleString() : "--"}</td>
                  <td className="w-24 py-2.5">
                    <MiniSparkline values={site.scoreHistory} color={color} height={24} />
                  </td>
                  <td className="py-2.5 text-right text-[11px] font-medium text-slate-400">
                    {formatDateTime(site.latestScan?.startedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecentAlertsCard({
  alerts,
}: {
  alerts: DashboardData["alerts"];
}) {
  return (
    <div className={`${CARD} p-4 xl:col-span-3`}>
      <SectionHeader title="Recent Alerts" href="/alerts" action="View all" />
      {alerts.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">No alerts yet. Run scans to surface changes.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {alerts.map((alert, i) => {
            const style = ALERT_STYLES[alert.level];
            return (
              <li key={`${alert.siteName}-${i}`} className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${style.className}`}>
                  {style.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-slate-700">{alert.message}</div>
                  <div className="truncate text-[11px] text-slate-400">{alert.siteName}</div>
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {alert.at.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RecentScansCard({
  scans,
}: {
  scans: DashboardData["recentScans"];
}) {
  return (
    <div className={`${CARD} p-4 xl:col-span-2`}>
      <SectionHeader title="Recent Scans" />
      {scans.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">No scans yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {scans.slice(0, 6).map((scan) => (
            <li key={scan.id} className="flex items-center justify-between gap-2">
              <Link href={`/sites/${scan.siteId}/scans/${scan.id}`} className="min-w-0 flex-1 hover:text-blue-700">
                <div className="truncate text-xs font-bold text-slate-800">{scan.site.name}</div>
                <div className="text-[11px] text-slate-400">{formatDateTime(scan.startedAt)}</div>
              </Link>
              <StatusPill status={scan.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScanStatusCard({
  scans,
}: {
  scans: DashboardData["recentScans"];
}) {
  const total = scans.length;
  const complete = scans.filter((scan) => scan.status === "COMPLETE").length;
  const failed = scans.filter((scan) => scan.status === "FAILED").length;
  const cancelled = scans.filter((scan) => scan.status === "CANCELLED").length;
  const active = scans.filter((scan) => ACTIVE_SCAN_STATUSES.some((status) => status === scan.status)).length;
  const pct = total > 0 ? Math.round((complete / total) * 1000) / 10 : 0;

  return (
    <div className={`${CARD} p-4 xl:col-span-2`}>
      <SectionHeader title="Scan Status" />
      <div className="mt-3">
        <DonutMetric value={complete} total={Math.max(total, 1)} center={String(total)} label="Recent scans" />
      </div>
      <div className="mt-3 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium text-slate-500">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Completed
          </span>
          <span className="font-bold text-slate-800">{complete}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium text-slate-500">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            In progress
          </span>
          <span className="font-bold text-slate-800">{active}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-medium text-slate-500">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            Failed
          </span>
          <span className="font-bold text-slate-800">{failed}</span>
        </div>
        {cancelled > 0 && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium text-slate-500">
              <span className="h-2 w-2 rounded-full bg-slate-400" />
              Cancelled
            </span>
            <span className="font-bold text-slate-800">{cancelled}</span>
          </div>
        )}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3 text-xs">
        <span className="font-semibold text-slate-500">Completion rate</span>{" "}
        <span className="font-bold text-emerald-600">{pct}%</span>
      </div>
    </div>
  );
}

function RiskOverviewCard({ sites }: { sites: SiteSummary[] }) {
  const highRisk = sites.filter((site) => (site.issueCounts.critical ?? 0) > 0 || (site.latestScan?.scoreOverall ?? 100) < 60);
  const criticalSites = sites.filter((site) => site.issueCounts.critical > 0).length;
  const unscannedSites = sites.filter((site) => !site.latestScan).length;

  return (
    <div className={`${CARD} p-4 xl:col-span-2`}>
      <SectionHeader title="Risk Overview" href="/issues" action="View issues" />
      <div
        className={`mt-3 rounded-lg border p-3 ${
          highRisk.length > 0 ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"
        }`}
      >
        <div className="text-xs font-bold uppercase tracking-wide">{highRisk.length > 0 ? "High Risk" : "Healthy"}</div>
        <div className="mt-1 text-3xl font-bold">{highRisk.length}</div>
        <div className="text-xs font-medium">{highRisk.length === 1 ? "site needs" : "sites need"} attention</div>
      </div>
      <div className="mt-3 space-y-2 text-xs">
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Critical issues present</span>
          <span className="font-bold text-slate-800">{criticalSites} sites</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Site health below 60%</span>
          <span className="font-bold text-slate-800">
            {sites.filter((site) => (site.latestScan?.scoreOverall ?? 100) < 60).length} sites
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-500">Never scanned</span>
          <span className="font-bold text-slate-800">{unscannedSites} sites</span>
        </div>
      </div>
    </div>
  );
}

function SpellingCard({
  spelling,
}: {
  spelling: DashboardData["spelling"];
}) {
  const enabled = spelling.enabledSites > 0;
  return (
    <div className={`${CARD} p-4`}>
      <SectionHeader title="Spelling" href="/issues?q=qa.misspellings" action="View errors" />
      {!enabled && spelling.topWords.length === 0 ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <div className="text-xs font-bold text-amber-800">Spell checking is off</div>
          <p className="mt-1 text-[11px] leading-4 text-amber-700">
            Enable it in each site&apos;s Settings, then run a full crawl.
          </p>
          <Link href="/sites" className="mt-2 inline-block text-[11px] font-bold text-amber-800 hover:underline">
            Configure sites →
          </Link>
        </div>
      ) : spelling.topWords.length === 0 ? (
        <div className="mt-4">
          <div className="text-sm font-bold text-emerald-700">No potential misspellings found</div>
          <p className="mt-1 text-[11px] text-slate-400">
            Enabled for {spelling.enabledSites} of {spelling.totalSites} sites. Results update after full crawls.
          </p>
        </div>
      ) : (
        <>
          {!enabled && (
            <p className="mt-3 rounded bg-amber-50 px-2 py-1.5 text-[10px] font-medium text-amber-700">
              Showing latest saved results. Enable spelling in Site Settings for future full crawls.
            </p>
          )}
          <ol className="mt-3 space-y-3">
            {spelling.topWords.map(({ word, count }, index) => (
              <li key={word} className="flex items-center gap-3 text-xs">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-50 font-bold text-violet-600">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold text-slate-800">{word}</div>
                  <div className="text-[11px] text-slate-400">{count.toLocaleString()} occurrence{count === 1 ? "" : "s"}</div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="mt-3 text-[10px] text-slate-400">
        {spelling.affectedPages.toLocaleString()} affected page{spelling.affectedPages === 1 ? "" : "s"} in the latest full crawls
      </p>
    </div>
  );
}

function AssignedTasksCard({
  tasks,
}: {
  tasks: DashboardData["tasks"];
}) {
  return (
    <div className={`${CARD} p-4`}>
      <SectionHeader title="Assigned Tasks" href="/tasks" action="View all" />
      <div className="mt-3 flex items-center gap-5">
        <DonutMetric
          value={tasks.completed}
          total={Math.max(tasks.total, 1)}
          center={String(tasks.total)}
          label="Total"
          color={tasks.overdue > 0 ? "#ef4444" : "#22c55e"}
        />
        <div className="grid flex-1 grid-cols-2 gap-3 text-center text-xs">
          <div>
            <div className="text-lg font-bold text-emerald-600">{tasks.completed}</div>
            <div className="text-[11px] text-slate-400">Completed</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-600">{tasks.inProgress}</div>
            <div className="text-[11px] text-slate-400">In progress</div>
          </div>
          <div>
            <div className="text-lg font-bold text-slate-700">{tasks.open}</div>
            <div className="text-[11px] text-slate-400">Open</div>
          </div>
          <div>
            <div className="text-lg font-bold text-red-600">{tasks.overdue}</div>
            <div className="text-[11px] text-slate-400">Overdue</div>
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
        {tasks.dueThisWeek} task{tasks.dueThisWeek === 1 ? "" : "s"} due this week
      </div>
    </div>
  );
}

function CategoryBreakdownCard({
  categoryCounts,
}: {
  categoryCounts: Record<string, number>;
}) {
  const max = Math.max(1, ...Object.values(categoryCounts));

  return (
    <div className={`${CARD} p-4`}>
      <SectionHeader title="Open Issues by Category" href="/issues" action="Open" />
      <p className="mt-1 text-xs text-slate-500">Latest completed crawl per site</p>
      <div className="mt-4 space-y-3">
        {HEALTH_FINDING_CATEGORIES.map((category) => {
          const count = categoryCounts[category] ?? 0;
          return (
            <div key={category} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 truncate font-semibold text-slate-600">{CATEGORY_LABELS[category]}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(count / max) * 100}%`, backgroundColor: CATEGORY_COLORS[category] }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-bold text-slate-700">{count.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function TrendAndSeverityCards({ sites, siteId }: { sites: SiteSummary[]; siteId?: string }) {
  const { issueTrend, scoreTrend } = await getDashboardTrendData(siteId);
  const severityCounts = sites.reduce((total, site) => ({
    critical: total.critical + site.issueCounts.critical, serious: total.serious + site.issueCounts.serious,
    moderate: total.moderate + site.issueCounts.moderate, minor: total.minor + site.issueCounts.minor,
  }), { critical: 0, serious: 0, moderate: 0, minor: 0 });
  const totalSeverity = Object.values(severityCounts).reduce((a, b) => a + b, 0);
  const maxCritical = Math.max(1, ...issueTrend.map((row) => numeric(row.critical)));
  const maxWarnings = Math.max(
    1,
    ...issueTrend.map((row) => numeric(row.serious) + numeric(row.moderate))
  );
  const healthTrendData = scoreTrend.map((row, index) => {
    const issues = issueTrend[index] ?? {};
    const critical = numeric(issues.critical);
    const warnings = numeric(issues.serious) + numeric(issues.moderate);
    return {
      label: row.label,
      health: row.score,
      critical: Math.round((critical / maxCritical) * 100),
      warnings: Math.round((warnings / maxWarnings) * 100),
    };
  });

  return <>
            <div className={`${CARD} p-4 xl:col-span-6`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-900">Site Health Trend (14 Days)</h2>
                <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                  14 Days
                </span>
              </div>
              <div className="mt-3">
                <TrendChart
                  data={healthTrendData}
                  height={202}
                  yDomain={[0, 100]}
                  series={[
                    { key: "health", label: "Average Health", color: "#22c55e" },
                    { key: "critical", label: "Critical Load", color: "#ef4444" },
                    { key: "warnings", label: "Warning Load", color: "#f59e0b" },
                  ]}
                />
              </div>
            </div>

            <div className={`${CARD} p-4 xl:col-span-2`}>
              <SectionHeader title="Issues by Severity" href="/issues" action="Open" />
              <div className="mt-2">
                <SeverityDonut counts={severityCounts} height={148} />
              </div>
              <div className="mt-2 space-y-1.5">
                {Object.entries(severityCounts).map(([key, count]) => (
                  <div key={key} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-2 font-medium text-slate-500">
                      <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: SEVERITY_COLORS[key] }} />
                      {SEVERITY_LABELS[key]}
                    </span>
                    <span className="font-bold text-slate-700">
                      {count.toLocaleString()} <span className="text-slate-400">({totalSeverity > 0 ? Math.round((count / totalSeverity) * 100) : 0}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

  </>;
}

async function ScanStatusSection({ scansPromise }: { scansPromise: ReturnType<typeof getRecentScans> }) { return <ScanStatusCard scans={await scansPromise} />; }
async function AlertsSection({ siteId }: { siteId?: string }) { return <RecentAlertsCard alerts={await getRecentAlerts(siteId)} />; }
async function RecentScansSection({ scansPromise }: { scansPromise: ReturnType<typeof getRecentScans> }) { return <RecentScansCard scans={await scansPromise} />; }
async function SpellingSection({ sites }: { sites: SiteSummary[] }) { return <SpellingCard spelling={await getSpellingSummary(sites)} />; }
async function TasksSection({ siteId }: { siteId?: string }) { return <AssignedTasksCard tasks={await getTaskSummary(siteId)} />; }

export default async function PortfolioOverviewPage({ searchParams }: { searchParams?: Promise<{ site?: string }> }) {
  const sp = searchParams ? await searchParams : {};
  const selectedSiteParam = typeof sp.site === "string" ? sp.site : null;
  const allSites = await getSiteSummaries();
  const selected = selectedSiteParam ? allSites.find((site) => site.id === selectedSiteParam) : null;
  const sites = selected ? [selected] : allSites;
  const recentScansPromise = getRecentScans(selected?.id);

  return (
    <>
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-6 lg:py-5">
        {sites.length === 0 ? (
          <div className={`${CARD} flex flex-col items-center border-dashed py-16`}>
            <div className="text-lg font-bold text-slate-900">No sites yet</div>
            <p className="mt-1 text-sm text-slate-500">Add your first site from the Sites page to start scanning.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {sites.map((site) => <SiteCard key={site.id} site={site} />)}
          </div>
        )}
      </div>
      {sites.length > 0 && <div className="mx-auto max-w-[1600px] px-4 pb-4 sm:px-6 lg:px-6 lg:pb-5">
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Suspense fallback={<><Skeleton className="h-72 xl:col-span-6" /><Skeleton className="h-72 xl:col-span-2" /></>}>
            <TrendAndSeverityCards sites={sites} siteId={selected?.id} />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-72 xl:col-span-2" />}><ScanStatusSection scansPromise={recentScansPromise} /></Suspense>
          <RiskOverviewCard sites={sites} />
        </section>
        <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <SiteLeaderboard sites={sites} />
          <Suspense fallback={<Skeleton className="h-64 xl:col-span-3" />}><AlertsSection siteId={selected?.id} /></Suspense>
          <Suspense fallback={<Skeleton className="h-64 xl:col-span-2" />}><RecentScansSection scansPromise={recentScansPromise} /></Suspense>
        </section>
        <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Suspense fallback={<Skeleton className="h-64" />}><SpellingSection sites={sites} /></Suspense>
          <Suspense fallback={<Skeleton className="h-64" />}><TasksSection siteId={selected?.id} /></Suspense>
          <CategoryBreakdownCard categoryCounts={getCategoryCounts(sites)} />
        </section>
      </div>}
    </>
  );
}
