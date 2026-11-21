import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { siteProvinces } from "@/lib/crawler/brand";
import { compareToPreviousScan } from "@/lib/scan/compareScans";
import { groupScanFindings } from "@/lib/scan/groupFindings";
import ScoreRing from "@/components/ui/ScoreRing";
import TrendChart from "@/components/charts/TrendChart";
import SeverityDonut from "@/components/charts/SeverityDonut";
import ScanLaunchButton from "@/components/ScanLaunchButton";
import { provinceScopeLabel } from "@/lib/crawler/provinces";
import PerformanceScanButton from "@/components/PerformanceScanButton";
import ScanProgress from "@/components/ScanProgress";
import ScanHistoryList from "@/components/ScanHistoryList";
import IssueGroups from "@/components/scan/IssueGroups";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/ui/colors";
import { Skeleton } from "@/components/ui/Skeleton";
import { getCurrentSiteSnapshot, HEALTH_FINDING_CATEGORIES, type CurrentSiteSnapshot } from "@/lib/currentSiteSnapshot";
import { getBrokenLinkPairs } from "@/lib/scan/brokenLinks";
import { pageLimitLabel, usesSitePageLimit } from "@/lib/scan/constants";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["QUEUED", "CRAWLING", "AUDITING"];
const LATEST_SCAN_ISSUE_PREVIEW_COUNT = 6;
const accessibilityCoverage = z.object({
  A11Y: z.object({ attempted: z.number(), succeeded: z.number() }),
});

async function ComparisonStrip({ siteId, scanId }: { siteId: string; scanId: string }) {
  const comparison = await compareToPreviousScan(scanId);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm shadow-sm">
      <span className="text-xs font-medium text-gray-500">Compared with previous scan</span>
      {comparison.previousScanId ? <>
        <span className={comparison.newFindingCount > 0 ? "font-medium text-red-600" : "text-gray-500"}>+{comparison.newFindingCount} new</span>
        <span className={comparison.resolvedFindingCount > 0 ? "font-medium text-green-600" : "text-gray-500"}>{comparison.resolvedFindingCount} resolved</span>
        <span className="text-gray-500">{comparison.persistingFindingCount} persisting</span>
        <Link href={`/sites/${siteId}/scans/${scanId}#compare`} className="text-xs font-medium text-blue-600 hover:underline sm:ml-auto">View comparison</Link>
      </> : <span className="text-gray-400">No comparable completed scan yet</span>}
    </div>
  );
}

async function IssueBreakdown({ snapshot }: { snapshot: CurrentSiteSnapshot }) {
  const { siteId, crawl, categoryCounts, issueCounts } = snapshot;
  if (!crawl) return null;
  const brokenLinkPairs = await getBrokenLinkPairs(crawl.id);
  const destinationCount = new Set(brokenLinkPairs.map(({ targetUrl }) => targetUrl)).size;
  const placementCount = brokenLinkPairs.length;
  const max = Math.max(1, ...Object.values(categoryCounts));
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Open Issues</h2>
      <p className="mt-1 text-xs text-gray-500">Latest completed crawl</p>
      <SeverityDonut counts={issueCounts} height={150} />
      <div className="mt-2 space-y-2">
        {HEALTH_FINDING_CATEGORIES.map((category) => {
          const count = categoryCounts[category] ?? 0;
          return <div key={category} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0">{CATEGORY_LABELS[category]}</span><span className="w-10 shrink-0 text-gray-500">{count.toLocaleString()}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, backgroundColor: CATEGORY_COLORS[category] }} /></div>
          </div>;
        })}
      </div>
      <div className="mt-3 border-t border-gray-100 pt-3 text-xs">
        <Link href={`/sites/${siteId}/scans/${crawl.id}#broken-links`} className="text-blue-600 hover:underline">
          {placementCount.toLocaleString()} broken link placement{placementCount === 1 ? "" : "s"} across {destinationCount.toLocaleString()} destination{destinationCount === 1 ? "" : "s"} →
        </Link>
      </div>
    </div>
  );
}

async function LatestScanIssues({ siteId, scanId, startedAt }: { siteId: string; scanId: string; startedAt: Date }) {
  const issues = await groupScanFindings(scanId, {
    categories: HEALTH_FINDING_CATEGORIES,
    limit: LATEST_SCAN_ISSUE_PREVIEW_COUNT,
  });
  const scanHref = `/sites/${siteId}/scans/${scanId}`;
  return (
    <div className="mt-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-sm font-semibold">Latest Scan Issues</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-blue-600">
          <Link href={`${scanHref}?showPages=1#pages`} className="ui-button bg-white px-3 py-1.5 ring-1 ring-blue-200 hover:bg-blue-50">
            Show all pages
          </Link>
          {issues.totalGroupCount > 0 && <Link href={scanHref} className="hover:underline">View full scan ({issues.totalGroupCount} rule{issues.totalGroupCount === 1 ? "" : "s"}) →</Link>}
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-500">Top issues from the scan on {startedAt.toLocaleString()}, grouped by rule and sorted worst first.</p>
      <div className="mt-3">{issues.groups.length === 0
        ? <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-400">No issues found in the latest scan 🎉</p>
        : <IssueGroups
            groups={issues.groups}
            affectedPagesUrl={(code) => `/api/scans/${scanId}/affected-pages?${new URLSearchParams({ code })}`}
            showTriageLink
          />}
      </div>
    </div>
  );
}

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      scans: {
        orderBy: { startedAt: "desc" },
        take: 50,
        select: {
          id: true, siteId: true, status: true, scanType: true, startedAt: true, scanProvinces: true,
          pagesFound: true, pagesCrawled: true, pagesAudited: true, linksChecked: true,
          pages: { where: { requestedProvince: { not: null } }, take: 1, select: { id: true } },
          scoreOverall: true, scoreLinks: true, scoreSeo: true,
          scoreA11y: true, scoreQa: true, scoreSecurity: true,
        },
      },
    },
  });
  if (!site) notFound();
  const snapshot = await getCurrentSiteSnapshot(id);

  const completed = site.scans.filter((s) => s.status === "COMPLETE");
  const completedCrawlScans = completed.filter((s) => s.scanType === "CRAWL");
  const latestScan = snapshot.crawl;
  const latestCoverage = accessibilityCoverage.safeParse(latestScan?.categoryCoverage).data?.A11Y;
  const activeScan = site.scans.find((s) => ACTIVE_STATUSES.includes(s.status)) ?? null;
  const displayScan = activeScan ?? latestScan;
  const availableProvinces = siteProvinces(site.rootUrl);
  const hasProvinceCoverage = availableProvinces.length > 0;
  const activePageLimit = activeScan && usesSitePageLimit(activeScan.scanType)
    ? { maxPages: site.maxPages, perProvince: hasProvinceCoverage }
    : undefined;

  const activeStats = activeScan
    ? await Promise.all([
        prisma.page.count({ where: { scanId: activeScan.id, status: { not: "REDIRECTED" } } }),
        prisma.finding.count({ where: { scanId: activeScan.id } }),
      ]).then(([pageCount, findingCount]) => ({
        pageCount,
        // Live progress counter — healthy links no longer get Link rows, so counting rows
        // would show only broken links here.
        linkCount: activeScan.linksChecked,
        findingCount,
      }))
    : null;

  const trendData = completedCrawlScans
    .slice()
    .reverse()
    .map((scan) => ({
      label: new Date(scan.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      overall: scan.scoreOverall,
      links: scan.scoreLinks,
      seo: scan.scoreSeo,
      a11y: scan.scoreA11y,
      qa: scan.scoreQa,
      security: scan.scoreSecurity,
    }));

  const scoreCards = latestScan
    ? [
        { label: "Overall", score: snapshot.scoreOverall },
        { label: "Links", score: snapshot.scores.LINKS },
        { label: "SEO", score: snapshot.scores.SEO },
        { label: "Accessibility", score: snapshot.scores.A11Y },
        { label: "QA", score: snapshot.scores.QA },
        { label: "Security", score: snapshot.scores.SECURITY },
      ]
    : [];

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <Link href="/" className="text-xs text-gray-400 hover:underline">
        ← Portfolio Overview
      </Link>

      <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{site.name}</h1>
          <a href={site.rootUrl} target="_blank" rel="noreferrer" className="text-sm text-gray-500 hover:underline">
            {site.rootUrl}
          </a>
          <div className="mt-1 text-xs text-gray-400">
            {pageLimitLabel(hasProvinceCoverage)} {site.maxPages.toLocaleString()} · external links{" "}
            {site.checkExternalLinks ? "checked" : "skipped"} · schedule{" "}
            {site.scheduleCron ? <code className="rounded bg-gray-100 px-1">{site.scheduleCron}</code> : "manual only"}
            {" "}· spelling {site.spellcheckEnabled ? "enabled" : "disabled"}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!activeScan && (
            <>
              <ScanLaunchButton siteId={site.id} availableProvinces={availableProvinces} textSearch />
              <ScanLaunchButton siteId={site.id} availableProvinces={availableProvinces} />
              <PerformanceScanButton siteId={site.id} disabled={!latestScan} />
            </>
          )}
          <Link
            href={`/sites/${site.id}/edit`}
            className="ui-button bg-white px-3 py-1.5 text-sm ring-1 ring-gray-300 hover:bg-gray-50"
          >
            Settings
          </Link>
        </div>
      </div>

      {activeScan && displayScan && (
        <div className="mt-4">
          <ScanProgress
            pageLimit={activePageLimit}
            scan={{
              id: displayScan.id,
              scanType: displayScan.scanType,
              status: displayScan.status,
              pagesFound:
                activeScan && activeStats ? Math.max(displayScan.pagesFound, activeStats.pageCount) : displayScan.pagesFound,
              pagesCrawled: displayScan.pagesCrawled,
              pagesAudited: displayScan.pagesAudited,
              startedAt: displayScan.startedAt.toISOString(),
            }}
          />
        </div>
      )}

      {activeScan && activeStats && activeScan.scanType !== "TEXT_SEARCH" && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-blue-950">
                {activeScan.scanType === "PAGE_AUDIT"
                  ? "Current Performance Scan"
                  : "Current Crawl Scan"}
              </h2>
              <p className="mt-1 text-xs text-blue-700">
                {activeScan.scanType === "PAGE_AUDIT"
                  ? "Lighthouse is testing the one selected page. This result stays separate from the health scores and trends below."
                  : "Live crawl results for this running scan. Historical score cards below are from the latest completed crawl scan."}
              </p>
            </div>
            <Link
              href={`/sites/${site.id}/scans/${activeScan.id}`}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Open scan detail
            </Link>
          </div>
          <div className={`mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 ${activePageLimit?.perProvince ? "md:grid-cols-4" : "md:grid-cols-5"}`}>
            <div className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
              <div className="text-[11px] font-medium uppercase tracking-wide text-blue-500">Status</div>
              <div className="mt-1 text-lg font-bold text-blue-950">{activeScan.status}</div>
            </div>
            <div className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
              <div className="text-[11px] font-medium uppercase tracking-wide text-blue-500">
                {activePageLimit ? pageLimitLabel(activePageLimit.perProvince) : "Selected pages"}
              </div>
              <div className="mt-1 text-lg font-bold text-blue-950">
                {(activePageLimit?.maxPages ?? Math.max(activeScan.pagesFound, activeStats.pageCount)).toLocaleString()}
              </div>
            </div>
            {!activePageLimit?.perProvince && (
              <div className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
                <div className="text-[11px] font-medium uppercase tracking-wide text-blue-500">
                  {activeScan.scanType === "PAGE_AUDIT" ? "Pages audited" : "Pages processed"}
                </div>
                <div className="mt-1 text-lg font-bold text-blue-950">
                  {(activeScan.scanType === "PAGE_AUDIT" ? activeScan.pagesAudited : activeScan.pagesCrawled).toLocaleString()}
                </div>
              </div>
            )}
            <div className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
              <div className="text-[11px] font-medium uppercase tracking-wide text-blue-500">Links Recorded</div>
              <div className="mt-1 text-lg font-bold text-blue-950">{activeStats.linkCount.toLocaleString()}</div>
            </div>
            <div className="rounded-lg bg-white p-3 ring-1 ring-blue-100">
              <div className="text-[11px] font-medium uppercase tracking-wide text-blue-500">
                {activePageLimit?.perProvince ? "Regional Observations So Far" : "Findings So Far"}
              </div>
              <div className="mt-1 text-lg font-bold text-blue-950">{activeStats.findingCount.toLocaleString()}</div>
            </div>
          </div>
        </div>
      )}

      {activeScan?.scanType === "TEXT_SEARCH" && (
        <Link href={`/sites/${site.id}/scans/${activeScan.id}`} className="mt-2 inline-block text-sm text-blue-700 hover:underline">
          Open text search results
        </Link>
      )}

      {!latestScan && !activeScan ? (
        <div className="mt-10 flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-white py-14">
          <div className="font-semibold">No completed crawl yet</div>
          <p className="mt-1 text-sm text-gray-500">Run a full crawl to populate the site health dashboard.</p>
        </div>
      ) : latestScan ? (
        <>
          {/* Score cards */}
          {(activeScan || latestScan.scanProvinces.length > 0) && (
            <div className="mt-5 text-xs font-medium text-gray-500">
              Latest completed crawl
              {latestScan.scanProvinces.length > 0 && ` · ${provinceScopeLabel(latestScan.scanProvinces)}`}
            </div>
          )}
          <div className="mt-5 grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {scoreCards.map((card) => (
              <div key={card.label} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <ScoreRing score={card.score} size={52} strokeWidth={5} />
                <div>
                  <div className="text-xs text-gray-500">{card.label}</div>
                  <div className="text-lg font-bold">{card.score ?? "—"}</div>
                </div>
              </div>
            ))}
          </div>
          {latestCoverage && latestCoverage.attempted > 0 && (
            <p className="mt-2 text-xs text-gray-600">
              Accessibility checks ran on {latestCoverage.succeeded.toLocaleString()} of{" "}
              {latestCoverage.attempted.toLocaleString()}{" "}
              {hasProvinceCoverage ? "provincial page variants" : "pages"} in the latest crawl.{" "}
              <Link href={`/sites/${site.id}/scans/${latestScan.id}`} className="text-blue-700 hover:underline">
                View crawl details
              </Link>
            </p>
          )}

          <Suspense fallback={<Skeleton className="mt-4 h-12 w-full" />}>
            <ComparisonStrip siteId={site.id} scanId={latestScan.id} />
          </Suspense>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Score trend */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm xl:col-span-2">
              <h2 className="text-sm font-semibold">Score Trend</h2>
              <div className="mt-2">
                <TrendChart
                  data={trendData}
                  height={220}
                  yDomain={[0, 100]}
                  series={[
                    { key: "overall", label: "Overall", color: "#111827" },
                    { key: "links", label: "Links", color: CATEGORY_COLORS.LINKS },
                    { key: "seo", label: "SEO", color: CATEGORY_COLORS.SEO },
                    { key: "a11y", label: "A11y", color: CATEGORY_COLORS.A11Y },
                    { key: "qa", label: "QA", color: CATEGORY_COLORS.QA },
                    { key: "security", label: "Security", color: CATEGORY_COLORS.SECURITY },
                  ]}
                />
              </div>
            </div>

            <Suspense fallback={<Skeleton className="h-72" />}>
              <IssueBreakdown snapshot={snapshot} />
            </Suspense>
          </div>

          <Suspense fallback={<Skeleton className="mt-4 h-64 w-full" />}>
            <LatestScanIssues siteId={site.id} scanId={latestScan.id} startedAt={latestScan.startedAt} />
          </Suspense>

        </>
      ) : null}
      {site.scans.length > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Scan History</h2>
          <ScanHistoryList
            siteId={site.id}
            scans={site.scans.map((scan) => ({
              id: scan.id,
              scanType: scan.scanType,
              startedAt: scan.startedAt.toISOString(),
              status: scan.status,
              pagesFound: scan.pagesFound,
              pagesCrawled: scan.pagesCrawled,
              hasProvinceCoverage: scan.pages.length > 0,
              scanProvinces: scan.scanProvinces,
              scoreOverall: scan.scoreOverall,
            }))}
          />
        </div>
      )}
    </div>
  );
}
