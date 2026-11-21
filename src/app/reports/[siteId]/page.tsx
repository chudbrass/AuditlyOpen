import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Severity } from "@prisma/client";
import ScoreRing from "@/components/ui/ScoreRing";
import { CATEGORY_LABELS, SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/ui/colors";
import { parseIssueCounts, issueTotal } from "@/lib/dashboard";
import PrintButton from "./PrintButton";
import { getCurrentSiteSnapshot, HEALTH_FINDING_CATEGORIES } from "@/lib/currentSiteSnapshot";
import { groupScanFindings } from "@/lib/scan/groupFindings";
import LocaleCoverage from "@/components/scan/LocaleCoverage";
import { CANADIAN_PROVINCES, provinceScopeLabel } from "@/lib/crawler/provinces";
import { crawlBrand } from "@/lib/crawler/brand";
import { pageLimitLabel } from "@/lib/scan/constants";
import { comparableProvinceScope } from "@/lib/scan/compareScans";
import { z } from "zod";

export const dynamic = "force-dynamic";

const CATEGORY_KEYS = ["LINKS", "SEO", "A11Y", "QA", "SECURITY"] as const;
const reportLocale = z.object({ province: z.enum(CANADIAN_PROVINCES), language: z.enum(["en", "fr"]) });

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  SERIOUS: 1,
  MODERATE: 2,
  MINOR: 3,
};

export default async function SiteReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ province?: string; language?: string }>;
}) {
  const [{ siteId }, query] = await Promise.all([params, searchParams]);
  const locale = reportLocale.safeParse(query).data;
  const reportPath = `/reports/${siteId}`;

  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) notFound();

  const snapshot = await getCurrentSiteSnapshot(siteId);
  const latestScan = snapshot.crawl;

  if (!latestScan) {
    return (
      <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <Link href="/reports" className="text-xs text-gray-400 hover:underline">
          ← Reports
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{site.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{site.rootUrl}</p>
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
          Run a scan to generate a report.
        </div>
      </div>
    );
  }

  const [previousScan, provincePage] = await Promise.all([
    prisma.scan.findFirst({
      where: {
        siteId, status: "COMPLETE", scanType: "CRAWL", startedAt: { lt: latestScan.startedAt },
        ...comparableProvinceScope(latestScan.scanProvinces),
      },
      orderBy: { startedAt: "desc" },
    }),
    prisma.page.findFirst({ where: { scanId: latestScan.id, requestedProvince: { not: null } }, select: { id: true } }),
  ]);

  const counts = snapshot.issueCounts;
  const total = issueTotal(counts);
  const groupedByScan = await Promise.all(
    snapshot.findingScanIds.map((scanId) =>
      groupScanFindings(scanId, { categories: HEALTH_FINDING_CATEGORIES, limit: 20, ...locale })
    )
  );
  const topIssues = groupedByScan.flatMap((result) => result.groups)
    .sort((a, b) => SEVERITY_ORDER[a.severity as Severity] - SEVERITY_ORDER[b.severity as Severity] || b.count - a.count)
    .slice(0, 20);

  let comparisonLine: string | null = null;
  if (previousScan) {
    const prevCounts = parseIssueCounts(previousScan.issueCounts);
    const prevTotal = issueTotal(prevCounts);
    const scoreDelta =
      latestScan.scoreOverall !== null && previousScan.scoreOverall !== null
        ? latestScan.scoreOverall - previousScan.scoreOverall
        : null;
    const issueDelta = total - prevTotal;

    const scorePart =
      scoreDelta === null
        ? "score unavailable"
        : scoreDelta === 0
          ? "score unchanged"
          : `score ${scoreDelta > 0 ? "up" : "down"} ${Math.abs(scoreDelta)} pts`;
    const issuePart =
      issueDelta === 0
        ? "issue count unchanged"
        : `issues ${issueDelta > 0 ? "up" : "down"} ${Math.abs(issueDelta)}`;

    comparisonLine = `Compared to previous scan (${new Date(previousScan.startedAt).toLocaleDateString()}): ${scorePart}, ${issuePart}.`;
  }

  const severityBars: { key: keyof typeof counts; label: string }[] = [
    { key: "critical", label: SEVERITY_LABELS.critical },
    { key: "serious", label: SEVERITY_LABELS.serious },
    { key: "moderate", label: SEVERITY_LABELS.moderate },
    { key: "minor", label: SEVERITY_LABELS.minor },
  ];

  return (
    <div className="bg-white px-4 py-4 sm:px-6 lg:px-8 lg:py-6 print:px-0 print:py-0">
      <div className="print:hidden">
        <Link href="/reports" className="text-xs text-gray-400 hover:underline">
          ← Reports
        </Link>
      </div>

      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{site.name}</h1>
          <p className="mt-1 text-sm text-gray-500">{site.rootUrl}</p>
          <p className="mt-1 text-xs text-gray-400">
            Scan date: {new Date(latestScan.startedAt).toLocaleString()}
          </p>
          {latestScan.scanProvinces.length > 0 && (
            <p className="mt-1 text-sm text-gray-600">Scan provinces · {provinceScopeLabel(latestScan.scanProvinces)}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Current {pageLimitLabel(crawlBrand(site.rootUrl) !== null).toLowerCase()} · {site.maxPages.toLocaleString()}
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Score summary */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Score Summary</h2>
        <div className="mt-4 flex flex-wrap items-center gap-5 sm:gap-8">
          <div className="flex flex-col items-center gap-2">
            <ScoreRing score={snapshot.scoreOverall} size={96} strokeWidth={8} />
            <span className="text-xs font-medium text-gray-500">Overall</span>
          </div>
          {CATEGORY_KEYS.map((cat) => (
            <div key={cat} className="flex flex-col items-center gap-2">
              <ScoreRing score={snapshot.scores[cat]} size={72} strokeWidth={6} />
              <span className="text-xs font-medium text-gray-500">{CATEGORY_LABELS[cat]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pages stats */}
      {!provincePage && (
        <div className={`mt-4 grid grid-cols-1 gap-4 ${latestScan.pagesAudited > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Pages found</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{latestScan.pagesFound.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Pages processed</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{latestScan.pagesCrawled.toLocaleString()}</p>
          </div>
          {latestScan.pagesAudited > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Pages audited</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{latestScan.pagesAudited.toLocaleString()}</p>
            </div>
          )}
        </div>
      )}

      {/* Issue totals by severity */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">
          Open Issues <span className="font-normal text-gray-500">({total} total)</span>
        </h2>
        <div className="mt-4 space-y-2">
          {severityBars.map(({ key, label }) => {
            const count = counts[key];
            const max = Math.max(1, ...Object.values(counts));
            return (
              <div key={key} className="flex items-center gap-2 text-xs">
                <span className="w-16 shrink-0 font-medium text-gray-700">{label}</span>
                <span className="w-8 shrink-0 text-gray-500">{count}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(count / max) * 100}%`,
                      backgroundColor: SEVERITY_COLORS[key],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <LocaleCoverage scanId={latestScan.id} scanProvinces={latestScan.scanProvinces} reportPath={reportPath} />

      {/* Top issues table */}
      <div id="top-issues" className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {locale ? `Top issues · ${locale.province} · ${locale.language === "en" ? "English" : "French"}` : "Top Issues"}
          </h2>
          {locale ? <Link className="text-xs underline" href={`${reportPath}#top-issues`}>All issues</Link> : null}
        </div>
        {topIssues.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No findings on this scan.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
          <table className="min-w-[640px] w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-1.5 pr-3 font-medium">Code</th>
                <th className="py-1.5 pr-3 font-medium">Category</th>
                <th className="py-1.5 pr-3 font-medium">Severity</th>
                <th className="py-1.5 pr-3 font-medium">Count</th>
                <th className="py-1.5 font-medium">Example</th>
              </tr>
            </thead>
            <tbody>
              {topIssues.map((row) => (
                <tr key={row.code} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-mono text-[11px] text-gray-700">{row.code}</td>
                  <td className="py-2 pr-3">{CATEGORY_LABELS[row.category]}</td>
                  <td className="py-2 pr-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
                      style={{ backgroundColor: SEVERITY_COLORS[row.severity.toLowerCase()] }}
                    >
                      {SEVERITY_LABELS[row.severity.toLowerCase()]}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-semibold text-gray-900">{row.count}</td>
                  <td className="max-w-[360px] truncate py-2 text-gray-600" title={row.sampleMessage}>
                    {row.sampleMessage}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {comparisonLine && (
        <p className="mt-4 text-sm text-gray-600">{comparisonLine}</p>
      )}
    </div>
  );
}
