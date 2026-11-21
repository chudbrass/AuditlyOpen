import Link from "next/link";
import { notFound } from "next/navigation";
import { Category, Severity } from "@prisma/client";
import { prisma } from "@/lib/db";
import { crawlBrand } from "@/lib/crawler/localization";
import { CANADIAN_PROVINCES, provinceScopeLabel } from "@/lib/crawler/provinces";
import { compareToPreviousScan } from "@/lib/scan/compareScans";
import { groupScanFindings } from "@/lib/scan/groupFindings";
import DeleteScanButton from "@/components/scan/DeleteScanButton";
import TextSearchResults from "@/components/scan/TextSearchResults";
import ScanProgress from "@/components/ScanProgress";
import PageList from "@/components/PageList";
import LocaleCoverage from "@/components/scan/LocaleCoverage";
import LinksTable from "@/components/LinksTable";
import IssueGroups from "@/components/scan/IssueGroups";
import ScoreRing from "@/components/ui/ScoreRing";
import { CATEGORY_LABELS, SEVERITY_COLORS, SEVERITY_LABELS } from "@/lib/ui/colors";
import { pageLimitLabel, scanTypeLabel, TERMINAL_SCAN_STATUSES } from "@/lib/scan/constants";
import { getBrokenLinkPairs, listBrokenLinks } from "@/lib/scan/brokenLinks";

type LinkTypeFilter = "all" | "internal" | "external";

function filterLink(current: URLSearchParams, updates: Record<string, string>): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(updates)) next.set(key, value);
  return `?${next.toString()}`;
}

function clearParamLink(current: URLSearchParams, key: string): string {
  const next = new URLSearchParams(current);
  next.delete(key);
  return `?${next.toString()}`;
}

export default async function ScanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; scanId: string }>;
  searchParams: Promise<{ type?: string; sev?: string; cat?: string; pageCursor?: string; linkCursor?: string; showPages?: string }>;
}) {
  const { id, scanId } = await params;
  const { type: typeParam, sev: sevParam, cat: catParam, pageCursor, linkCursor, showPages } = await searchParams;

  const scan = await prisma.scan.findFirst({ where: { id: scanId, siteId: id }, include: { site: true } });
  if (!scan) notFound();
  if (scan.scanType === "TEXT_SEARCH") return <TextSearchResults scan={scan} cursor={pageCursor} />;

  const sevFilter =
    sevParam && (Object.values(Severity) as string[]).includes(sevParam) ? (sevParam as Severity) : null;
  const catFilter =
    catParam && (Object.values(Category) as string[]).includes(catParam) ? (catParam as Category) : null;

  // ---- Issues, grouped by rule ---------------------------------------------------------------
  const [{ groups, totalFindingCount }, severityGroups] = await Promise.all([
    groupScanFindings(scan.id, { severity: sevFilter, category: catFilter }),
    prisma.finding.groupBy({
      by: ["severity"],
      where: { scanId: scan.id, duplicateOfId: null },
      _count: { _all: true },
    }),
  ]);

  const severityCounts = Object.fromEntries(severityGroups.map((g) => [g.severity, g._count._all]));

  // ---- Pages & links -------------------------------------------------------------------------
  const [pages, errorPageCount, provincePage] = await Promise.all([
    prisma.page.findMany({
      where: { scanId: scan.id, status: { not: "REDIRECTED" } },
      orderBy: [{ status: "desc" }, { depth: "asc" }, { id: "asc" }],
      take: 101,
      ...(pageCursor ? { cursor: { id: pageCursor }, skip: 1 } : {}),
    }),
    prisma.page.count({ where: { scanId: scan.id, status: "ERROR" } }),
    prisma.page.findFirst({ where: { scanId: scan.id, requestedProvince: { not: null } }, select: { id: true } }),
  ]);
  const pageHasMore = pages.length > 100;
  const visiblePages = pages.slice(0, 100);
  const sortedPages = visiblePages
    .slice()
    .sort((a, b) => Number(b.status === "ERROR") - Number(a.status === "ERROR") || a.depth - b.depth);

  const typeFilter: LinkTypeFilter =
    typeParam === "internal" || typeParam === "external" ? typeParam : "all";

  // Only broken links have rows now; totals come from the Scan counters. Pre-change scans have
  // linksChecked 0 but full Link rows, so fall back to counting rows for them.
  const localized = provincePage !== null;
  const pageLimit = scan.scanType === "CRAWL"
    ? { maxPages: scan.site.maxPages, perProvince: crawlBrand(scan.site.rootUrl) !== null }
    : undefined;
  const [links, localizedBrokenPairs] = await Promise.all([
    listBrokenLinks(scan.id, { type: typeFilter, cursor: linkCursor, take: 101, localized }),
    localized ? getBrokenLinkPairs(scan.id) : null,
  ]);
  const linkHasMore = links.length > 100;
  const visibleLinks = links.slice(0, 100);
  const [totalLinkCount, brokenLinkCount] =
    scan.linksChecked > 0
      ? [scan.linksChecked, scan.linksBroken]
      : await Promise.all([
          prisma.link.count({ where: { scanId: scan.id } }),
          prisma.link.count({ where: { scanId: scan.id, broken: true } }),
        ]);

  const linkParams = new URLSearchParams({
    ...(typeParam ? { type: typeParam } : {}),
  });
  const issueParams = new URLSearchParams({
    ...(sevParam ? { sev: sevParam } : {}),
    ...(catParam ? { cat: catParam } : {}),
  });

  const [auditedPages, comparison] = await Promise.all([
    prisma.page.findMany({ where: { scanId: scan.id, audited: true }, orderBy: { perfScore: "asc" } }),
    scan.status === "COMPLETE" ? compareToPreviousScan(scan.id) : Promise.resolve(null),
  ]);

  function metricValue(metrics: unknown, key: string): string {
    if (!metrics || typeof metrics !== "object" || !(key in metrics)) return "—";
    const v = (metrics as Record<string, unknown>)[key];
    if (typeof v !== "number") return "—";
    if (key === "cls") return v.toFixed(3);
    return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
  }

  const scoreCards = [
    { label: "Overall", score: scan.scoreOverall },
    { label: "Links", score: scan.scoreLinks },
    { label: "SEO", score: scan.scoreSeo },
    { label: "Accessibility", score: scan.scoreA11y },
    { label: "QA", score: scan.scoreQa },
    { label: "Security", score: scan.scoreSecurity },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link href={`/sites/${scan.siteId}`} className="text-sm text-gray-500 hover:underline">
        ← {scan.site.name}
      </Link>
      <h1 className="mt-2 text-2xl font-bold">
        {scanTypeLabel(scan.scanType)} — {new Date(scan.startedAt).toLocaleString()}
      </h1>
      {(localized || scan.scanProvinces.length > 0) && (
        <p className="mt-1 text-sm text-gray-600">
          Scan provinces · {provinceScopeLabel(scan.scanProvinces.length > 0 ? scan.scanProvinces : CANADIAN_PROVINCES)}
        </p>
      )}
      {pageLimit && (
        <p className="mt-1 text-xs text-gray-500">
          Current {pageLimitLabel(pageLimit.perProvince).toLowerCase()} · {pageLimit.maxPages.toLocaleString()}
        </p>
      )}

      <div className="mt-4">
        <ScanProgress
          pageLimit={pageLimit}
          scan={{
            id: scan.id,
            scanType: scan.scanType,
            status: scan.status,
            pagesFound: scan.pagesFound,
            pagesCrawled: scan.pagesCrawled,
            pagesAudited: scan.pagesAudited,
            startedAt: scan.startedAt.toISOString(),
          }}
        />
      </div>

      {scan.scoreOverall !== null && (
        <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {scoreCards.map((card) => (
            <div key={card.label} className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <ScoreRing score={card.score} size={44} strokeWidth={4} />
              <div>
                <div className="text-[11px] text-gray-500">{card.label}</div>
                <div className="text-base font-bold">{card.score ?? "—"}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---- Issues to fix (the point of the page) ---- */}
      <section className="mt-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h2 className="text-lg font-semibold">Issues to Fix</h2>
          <span className="text-xs text-gray-400">
            {totalFindingCount.toLocaleString()} findings across {groups.length} rule
            {groups.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Findings grouped by rule, worst first. Expand a rule for the impact, example elements, and how
          to fix it.
        </p>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Link
            href={clearParamLink(issueParams, "sev")}
            className={`ui-button px-2.5 py-1 font-medium ${!sevFilter ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}
          >
            All severities
          </Link>
          {Object.values(Severity).map((sev) => (
            <Link
              key={sev}
              href={filterLink(issueParams, { sev })}
              className={`ui-button gap-1.5 px-2.5 py-1 font-medium ${sevFilter === sev ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SEVERITY_COLORS[sev.toLowerCase()] }} />
              {SEVERITY_LABELS[sev.toLowerCase()]}
              <span className="text-[10px] text-gray-400">{severityCounts[sev] ?? 0}</span>
            </Link>
          ))}
          <span className="mx-1 self-center text-gray-300">|</span>
          <Link
            href={clearParamLink(issueParams, "cat")}
            className={`ui-button px-2.5 py-1 font-medium ${!catFilter ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}
          >
            All categories
          </Link>
          {Object.values(Category).map((cat) => (
            <Link
              key={cat}
              href={filterLink(issueParams, { cat })}
              className={`ui-button px-2.5 py-1 font-medium ${catFilter === cat ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}
            >
              {CATEGORY_LABELS[cat]}
            </Link>
          ))}
        </div>

        <div className="mt-3">
          <IssueGroups
            groups={groups}
            affectedPagesUrl={scan.scanType === "CRAWL" ? (code) => {
              const query = new URLSearchParams({
                code,
                ...(sevFilter ? { severity: sevFilter } : {}),
                ...(catFilter ? { category: catFilter } : {}),
              });
              return `/api/scans/${scan.id}/affected-pages?${query}`;
            } : undefined}
          />
        </div>
      </section>

      {/* ---- Broken links ---- */}
      <section id="broken-links" className="mt-8">
        <h2 className="text-lg font-semibold">
          Broken Links ({localizedBrokenPairs
            ? `${localizedBrokenPairs.length.toLocaleString()} unique source and target pairs`
            : `${brokenLinkCount.toLocaleString()} broken of ${totalLinkCount.toLocaleString()} checked`})
        </h2>

        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {(["all", "internal", "external"] as const).map((option) => (
            <Link
              key={option}
              href={filterLink(linkParams, { type: option })}
              className={`ui-button px-2.5 py-1 font-medium capitalize ${typeFilter === option ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}
            >
              {option}
            </Link>
          ))}
        </div>

        <div className="mt-3">
          {visibleLinks.length === 0 ? (
            <p className="rounded-xl border border-gray-200 bg-white px-5 py-6 text-center text-sm text-gray-400">
              No broken links 🎉
            </p>
          ) : (
            <LinksTable links={visibleLinks} />
          )}
          {linkHasMore && <Link href={filterLink(linkParams, { linkCursor: visibleLinks.at(-1)!.id })} className="mt-3 inline-flex text-xs font-medium text-blue-600 hover:underline">More broken links →</Link>}
        </div>
      </section>

      {scan.scanType === "PAGE_AUDIT" && <>
      {/* ---- Standalone one-page Lighthouse result ---- */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Performance Result</h2>
        <p className="mt-1 text-xs text-gray-400">
          Lighthouse ran on the one page selected when this scan was started. This diagnostic does not
          contribute to the site health score or dashboard trends.
        </p>
        {auditedPages.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nothing audited in this scan.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
          <table className="min-w-[640px] w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 pr-3 font-medium">Page</th>
                <th className="py-2 pr-3 font-medium">Perf</th>
                <th className="py-2 pr-3 font-medium">LCP</th>
                <th className="py-2 pr-3 font-medium">CLS</th>
                <th className="py-2 pr-3 font-medium">TBT</th>
                <th className="py-2 pr-3 font-medium">FCP</th>
              </tr>
            </thead>
            <tbody>
              {auditedPages.map((page) => (
                <tr key={page.id} className="border-b border-gray-100">
                  <td className="max-w-xs truncate py-2 pr-3" title={page.url}>{page.url}</td>
                  <td className={`py-2 pr-3 font-semibold ${page.perfScore !== null && page.perfScore < 50 ? "text-red-600" : page.perfScore !== null && page.perfScore < 90 ? "text-amber-600" : "text-green-600"}`}>
                    {page.perfScore ?? "—"}
                  </td>
                  <td className="py-2 pr-3">{metricValue(page.metrics, "lcp")}</td>
                  <td className="py-2 pr-3">{metricValue(page.metrics, "cls")}</td>
                  <td className="py-2 pr-3">{metricValue(page.metrics, "tbt")}</td>
                  <td className="py-2 pr-3">{metricValue(page.metrics, "fcp")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
      </>}

      {/* ---- Comparison ---- */}
      {comparison && (
        <section className="mt-8" id="compare">
          <h2 className="text-lg font-semibold">Compared to Previous Scan</h2>
          {!comparison.previousScanId ? (
            <p className="mt-3 text-sm text-gray-400">No comparable completed scan yet.</p>
          ) : (
            <>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <span className={comparison.newFindingCount > 0 ? "font-medium text-red-600" : "text-gray-500"}>
                  +{comparison.newFindingCount} new
                </span>
                <span className={comparison.resolvedFindingCount > 0 ? "font-medium text-green-600" : "text-gray-500"}>
                  {comparison.resolvedFindingCount} resolved
                </span>
                <span className="text-gray-500">{comparison.persistingFindingCount} persisting</span>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                {(
                  [
                    { title: "New findings", count: comparison.newFindingCount, rows: comparison.newFindings, badge: "bg-red-100 text-red-700" },
                    { title: "Resolved findings", count: comparison.resolvedFindingCount, rows: comparison.resolvedFindings, badge: "bg-green-100 text-green-700" },
                  ] as const
                ).map((group) => (
                  <div key={group.title} className="rounded-lg border border-gray-200 bg-white p-4">
                    <h3 className="text-sm font-semibold">{group.title} ({group.count})</h3>
                    {group.count === 0 ? (
                      <p className="mt-2 text-xs text-gray-400">None</p>
                    ) : (
                      <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto text-xs">
                        {group.rows.slice(0, 50).map((f, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${group.badge}`}>
                              {CATEGORY_LABELS[f.category]}
                            </span>
                            <span className="min-w-0">
                              <span className="font-mono text-[10px] text-gray-500">{f.code}</span>{" "}
                              {f.pageUrl && (
                                <span className="text-gray-400">({new URL(f.pageUrl).pathname})</span>
                              )}
                              {f.affectedProvinces.length > 0 && (
                                <span className="ml-2 text-gray-500">Provinces · {f.affectedProvinces.join(", ")}</span>
                              )}
                            </span>
                          </li>
                        ))}
                        {group.count > group.rows.length && (
                          <li className="text-gray-400">…and {group.count - group.rows.length} more</li>
                        )}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ---- Page inventory (reference data, collapsed by default) ---- */}
      <section id="pages" className="mt-8">
        <details open={showPages === "1" || Boolean(pageCursor)} className="group rounded-xl border border-gray-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="text-[10px] text-gray-400 transition-transform group-open:rotate-90">▶</span>
            <span className="text-sm font-semibold">
              {localized ? "Pages by province" : `Pages processed (${scan.pagesCrawled.toLocaleString()})`}
            </span>
            {!localized && (
              <span className="text-xs text-gray-400">
                {Math.max(0, scan.pagesCrawled - errorPageCount).toLocaleString()} OK
                {errorPageCount > 0 && (
                  <span className="ml-1.5 font-medium text-red-600">· {errorPageCount.toLocaleString()} error{errorPageCount === 1 ? "" : "s"}</span>
                )}
              </span>
            )}
          </summary>
          <div className="border-t border-gray-100 px-4 py-3 sm:px-5">
            <LocaleCoverage scanId={scan.id} scanProvinces={scan.scanProvinces} />
            <PageList pages={sortedPages} />
            {pageHasMore && <Link href={`${filterLink(new URLSearchParams({ ...(typeParam ? { type: typeParam } : {}), ...(sevParam ? { sev: sevParam } : {}), ...(catParam ? { cat: catParam } : {}) }), { pageCursor: visiblePages.at(-1)!.id })}#pages`} className="mt-3 inline-flex text-xs font-medium text-blue-600 hover:underline">More pages →</Link>}
          </div>
        </details>
      </section>
      {TERMINAL_SCAN_STATUSES.includes(scan.status) && <DeleteScanButton scanId={scan.id} siteId={scan.siteId} />}
    </main>
  );
}
