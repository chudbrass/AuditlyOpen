import Link from "next/link";
import { Suspense } from "react";
import { Severity, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { RULES_BY_ID } from "@/lib/audits/rules";
import IssueFilters from "@/components/issues/IssueFilters";
import CreateTaskButton from "@/components/issues/CreateTaskButton";
import RecheckIssueButton from "@/components/issues/RecheckIssueButton";
import SpellingWordList from "@/components/issues/SpellingWordList";
import { spellingWordsFromEvidence } from "@/lib/spelling";
import { Skeleton } from "@/components/ui/Skeleton";
import { getCurrentSiteSnapshots, HEALTH_FINDING_CATEGORIES } from "@/lib/currentSiteSnapshot";
import {
  CONFORMANCE_LABELS,
  CONFORMANCE_COLORS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  ROLE_LABELS,
  ELEMENT_TYPE_LABELS,
} from "@/lib/ui/colors";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SearchParams {
  category?: string;
  sev?: string;
  site?: string;
  conf?: string;
  role?: string;
  el?: string;
  q?: string;
  page?: string;
}

function parseEnum<T extends string>(value: string | undefined, allowed: T[]): T | null {
  return value && (allowed as string[]).includes(value) ? (value as T) : null;
}

function evidenceField(evidence: unknown, key: string): unknown {
  if (evidence && typeof evidence === "object" && key in evidence) {
    return (evidence as Record<string, unknown>)[key];
  }
  return undefined;
}

function evidenceString(evidence: unknown, key: string): string | null {
  const v = evidenceField(evidence, key);
  return typeof v === "string" ? v : null;
}

function evidenceStrings(evidence: unknown, key: string): string[] {
  const v = evidenceField(evidence, key);
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
      style={{ backgroundColor: SEVERITY_COLORS[severity.toLowerCase()] ?? "#9ca3af" }}
    >
      {SEVERITY_LABELS[severity.toLowerCase()] ?? severity}
    </span>
  );
}

function IssueResultsSkeleton() {
  return (
    <div className="px-4 pb-4 sm:px-6 lg:px-8 lg:pb-6">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16" />)}
      </div>
      <Skeleton className="mt-4 h-10 w-full" />
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="mb-3 h-12 w-full" />)}
      </div>
    </div>
  );
}

export default async function IssuesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Issues</h1>
            <p className="mt-1 text-sm text-gray-500">Open issues from the latest scan of each site.</p>
          </div>
          <Link href="/rules" className="text-xs font-medium text-blue-600 hover:underline">View rule reference →</Link>
        </div>
      </div>
      <Suspense fallback={<IssueResultsSkeleton />}>
        <IssueResults searchParams={searchParams} />
      </Suspense>
    </>
  );
}

function ConformanceBadge({ conformance }: { conformance: string | null }) {
  if (!conformance) return null;
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
      style={{ backgroundColor: CONFORMANCE_COLORS[conformance] ?? "#6b7280" }}
    >
      {CONFORMANCE_LABELS[conformance] ?? conformance}
    </span>
  );
}

async function IssueResults({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const category = parseEnum(sp.category, [...HEALTH_FINDING_CATEGORIES]);
  const severity = parseEnum(sp.sev, Object.values(Severity));
  const conformance = parseEnum(sp.conf, Object.keys(CONFORMANCE_LABELS));
  const role = parseEnum(sp.role, Object.keys(ROLE_LABELS));
  const elementType = parseEnum(sp.el, Object.keys(ELEMENT_TYPE_LABELS));
  const query = (sp.q ?? "").trim();
  const siteId = sp.site || null;
  const pageNum = Math.max(1, Number(sp.page) || 1);

  const sites = await prisma.site.findMany({ orderBy: { name: "asc" } });
  const snapshots = await getCurrentSiteSnapshots(sites.filter((s) => !siteId || s.id === siteId).map((s) => s.id));

  // Issues = findings from each site's latest completed scan (open issues, not history).
  const latestScanIds = snapshots.flatMap((snapshot) => snapshot.findingScanIds);
  const siteByScanId = new Map(
    snapshots.flatMap((snapshot) => snapshot.findingScanIds.map((scanId) => [scanId, sites.find((site) => site.id === snapshot.siteId)!] as const))
  );

  const where: Prisma.FindingWhereInput = {
    scanId: { in: latestScanIds },
    duplicateOfId: null,
    category: category ?? { in: [...HEALTH_FINDING_CATEGORIES] },
    ...(severity ? { severity } : {}),
    // QA and BP share the "Best Practice" label — treat them as one bucket when filtering
    ...(conformance
      ? { conformance: conformance === "QA" || conformance === "BP" ? { in: ["QA", "BP"] } : conformance }
      : {}),
    ...(role ? { responsibleRole: role } : {}),
    ...(elementType ? { elementType } : {}),
    ...(query
      ? {
          OR: [
            { message: { contains: query, mode: "insensitive" } },
            { code: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [findings, totalCount, severityGroups, topRules] = await Promise.all([
    prisma.finding.findMany({
      where,
      include: { page: { select: { url: true } } },
      orderBy: [{ severity: "asc" }, { category: "asc" }, { code: "asc" }, { id: "asc" }],
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.finding.count({ where }),
    prisma.finding.groupBy({ by: ["severity"], where, _count: { _all: true } }),
    prisma.finding.groupBy({
      by: ["code"],
      where,
      _count: { _all: true },
      orderBy: { _count: { code: "desc" } },
      take: 6,
    }),
  ]);

  const severityCounts = Object.fromEntries(severityGroups.map((g) => [g.severity, g._count._all]));
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function pageQuery(page: number): string {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== "page") next.set(k, v);
    }
    if (page > 1) next.set("page", String(page));
    return `?${next.toString()}`;
  }

  return (
    <div className="px-4 pb-4 sm:px-6 lg:px-8 lg:pb-6">
      {/* Severity summary strip */}
      <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-4">
        {Object.values(Severity).map((sev) => (
          <div
            key={sev}
            className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SEVERITY_COLORS[sev.toLowerCase()] }}
              />
              {SEVERITY_LABELS[sev.toLowerCase()]}
            </span>
            <span className="text-lg font-bold">{(severityCounts[sev] ?? 0).toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-4">
        <Suspense>
          <IssueFilters sites={sites.map((s) => ({ id: s.id, name: s.name }))} />
        </Suspense>
      </div>

      {/* Most frequent rules for the current filter */}
      {topRules.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-gray-500">Most frequent:</span>
          {topRules.map((r) => (
            <span key={r.code} className="rounded-full bg-white px-2.5 py-1 font-mono text-[10px] ring-1 ring-gray-200">
              {r.code} <span className="font-sans font-semibold text-gray-700">×{r._count._all}</span>
            </span>
          ))}
        </div>
      )}

      {/* Issue list */}
      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {findings.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-400">No issues match this filter.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {findings.map((f) => {
              const rule = RULES_BY_ID.get(f.code);
              const site = siteByScanId.get(f.scanId);
              const helpUrl = rule?.helpUrl ?? evidenceString(f.evidence, "helpUrl");
              const samples = [
                ...evidenceStrings(f.evidence, "samples"),
                ...evidenceStrings(f.evidence, "sampleSelectors"),
                ...evidenceStrings(f.evidence, "duplicates"),
                ...evidenceStrings(f.evidence, "skips"),
              ];
              const pagePath = f.page?.url ? new URL(f.page.url).pathname : null;
              const spellingWords = f.code === "qa.misspellings" ? spellingWordsFromEvidence(f.evidence) : [];
              const allowedSpellingWords = new Set(site?.allowedSpellingWords.map((word) => word.toLocaleLowerCase()) ?? []);
              const activeSpellingWords = spellingWords.filter(({ word }) => !allowedSpellingWords.has(word.toLocaleLowerCase()));
              const displayMessage = spellingWords.length > 0
                ? activeSpellingWords.length === 0
                  ? "All flagged words on this page are allowed"
                  : `${activeSpellingWords.length} potential misspelling${activeSpellingWords.length === 1 ? "" : "s"}: ${activeSpellingWords.map(({ word, count }) => count > 1 ? `${word} (×${count})` : word).join(", ")}`
                : f.message;

              return (
                <li key={f.id}>
                  <details className="group">
                    <summary className="flex cursor-pointer items-center gap-2 px-3 py-3 hover:bg-gray-50 sm:gap-3 sm:px-4 [&::-webkit-details-marker]:hidden">
                      <span className="w-3 shrink-0 text-[10px] text-gray-400 transition-transform group-open:rotate-90">
                        ▶
                      </span>
                      <SeverityBadge severity={f.severity} />
                      <ConformanceBadge conformance={f.conformance} />
                      <span className={`min-w-0 flex-1 truncate text-xs ${activeSpellingWords.length === 0 && spellingWords.length > 0 ? "text-gray-400 line-through" : "text-gray-800"}`}>{displayMessage}</span>
                      {site && (
                        <span className="hidden shrink-0 text-[11px] font-medium text-gray-500 lg:block">
                          {site.name}
                        </span>
                      )}
                      <span
                        className="hidden max-w-[180px] shrink-0 truncate text-[11px] text-gray-400 md:block"
                        title={f.page?.url ?? undefined}
                      >
                        {pagePath ?? "site-wide"}
                      </span>
                    </summary>

                    <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4 text-xs sm:px-10">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-gray-500">
                        <span className="font-mono text-gray-700">{f.code}</span>
                        {rule?.wcag && <span>WCAG {rule.wcag}</span>}
                        {f.responsibleRole && <span>Fix owner: {ROLE_LABELS[f.responsibleRole] ?? f.responsibleRole}</span>}
                        {f.elementType && <span>Element: {ELEMENT_TYPE_LABELS[f.elementType] ?? f.elementType}</span>}
                        {f.affectedProvinces.length > 0 && <span>Provinces · {f.affectedProvinces.join(", ")}</span>}
                        {f.page?.url && (
                          <a href={f.page.url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                            Open page ↗
                          </a>
                        )}
                      </div>

                      {rule?.impact && (
                        <p className="mt-3 max-w-3xl text-gray-700">
                          <span className="font-semibold">Visitor impact: </span>
                          {rule.impact}
                        </p>
                      )}

                      {site && spellingWords.length > 0 && (
                        <SpellingWordList siteId={site.id} words={spellingWords} allowedWords={site.allowedSpellingWords} />
                      )}

                      {samples.length > 0 && (
                        <div className="mt-3">
                          <div className="font-semibold text-gray-600">Offending element{samples.length === 1 ? "" : "s"}</div>
                          <div className="mt-1 space-y-1">
                            {samples.slice(0, 5).map((s, i) => (
                              <code key={i} className="block overflow-x-auto rounded-lg bg-gray-900 px-3 py-1.5 font-mono text-[11px] text-gray-100">
                                {s}
                              </code>
                            ))}
                          </div>
                        </div>
                      )}

                      {rule?.fixHint && (
                        <div className="mt-3">
                          <div className="font-semibold text-gray-600">How to fix</div>
                          <p className="mt-1 max-w-3xl whitespace-pre-wrap rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-green-900">
                            {rule.fixHint}
                          </p>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <RecheckIssueButton findingId={f.id} />
                        {site && (
                          <CreateTaskButton
                            title={`Fix: ${f.message}`}
                            siteId={site.id}
                            findingCode={f.code}
                            pageUrl={f.page?.url ?? null}
                            severity={f.severity}
                          />
                        )}
                        {helpUrl && (
                          <a
                            href={helpUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg bg-white px-3 py-1.5 font-medium text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50"
                          >
                            Documentation ↗
                          </a>
                        )}
                        {site && (
                          <Link href={`/sites/${site.id}`} className="text-gray-500 hover:underline">
                            Go to {site.name} →
                          </Link>
                        )}
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-gray-500">
            Page {pageNum} of {totalPages}
          </span>
          <div className="flex gap-2">
            {pageNum > 1 && (
              <Link href={pageQuery(pageNum - 1)} className="ui-button bg-white px-3 py-1.5 ring-1 ring-gray-200 hover:bg-gray-50">
                ← Previous
              </Link>
            )}
            {pageNum < totalPages && (
              <Link href={pageQuery(pageNum + 1)} className="ui-button bg-white px-3 py-1.5 ring-1 ring-gray-200 hover:bg-gray-50">
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
