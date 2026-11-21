import Link from "next/link";
import AffectedPages from "./AffectedPages";
import { RULES_BY_ID } from "@/lib/audits/rules";
import {
  CATEGORY_LABELS,
  CONFORMANCE_LABELS,
  CONFORMANCE_COLORS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  ROLE_LABELS,
} from "@/lib/ui/colors";

export interface GroupedIssue {
  code: string;
  category: string;
  severity: string; // CRITICAL | SERIOUS | MODERATE | MINOR
  conformance: string | null;
  responsibleRole: string | null;
  count: number;
  /** Representative message from one occurrence (rule name is preferred when known). */
  sampleMessage: string;
  /** Up to a handful of affected page URLs. */
  samplePages: { url: string; provinces: string[] }[];
  affectedPageCount: number;
  siteWideProvinces: string[];
  /** Offending-element snippets / selectors pulled from evidence. */
  sampleSnippets: string[];
  helpUrl: string | null;
}

export default function IssueGroups({
  groups,
  affectedPagesUrl,
  showTriageLink = !affectedPagesUrl,
}: {
  groups: GroupedIssue[];
  affectedPagesUrl?: (code: string) => string;
  showTriageLink?: boolean;
}) {
  if (groups.length === 0) {
    return (
      <p className="rounded-xl border border-gray-200 bg-white px-5 py-8 text-center text-sm text-gray-400">
        No issues match this filter.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      {groups.map((group) => {
        const rule = RULES_BY_ID.get(group.code);
        const helpUrl = rule?.helpUrl ?? group.helpUrl;
        const endpoint = affectedPagesUrl?.(group.code);
        return (
          <li key={group.code}>
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-3 hover:bg-gray-50 sm:gap-3 sm:px-4 [&::-webkit-details-marker]:hidden">
                <span className="w-3 shrink-0 text-[10px] text-gray-400 transition-transform group-open:rotate-90">
                  ▶
                </span>
                <span
                  className="inline-flex w-16 shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white sm:w-20"
                  style={{ backgroundColor: SEVERITY_COLORS[group.severity.toLowerCase()] ?? "#9ca3af" }}
                >
                  {SEVERITY_LABELS[group.severity.toLowerCase()] ?? group.severity}
                </span>
                {group.conformance && (
                  <span
                    className="hidden shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white sm:inline-flex"
                    style={{ backgroundColor: CONFORMANCE_COLORS[group.conformance] ?? "#6b7280" }}
                  >
                    {CONFORMANCE_LABELS[group.conformance] ?? group.conformance}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800">
                  {rule?.name ?? group.sampleMessage}
                </span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                  ×{group.count.toLocaleString()}
                </span>
                <span className="hidden w-24 shrink-0 text-right text-[11px] text-gray-400 md:block">
                  {group.affectedPageCount === 0
                    ? "site-wide"
                    : `${group.affectedPageCount} page${group.affectedPageCount === 1 ? "" : "s"}`}
                </span>
              </summary>

              <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-4 text-xs sm:px-10">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-gray-500">
                  <span className="font-mono text-gray-700">{group.code}</span>
                  <span>{CATEGORY_LABELS[group.category] ?? group.category}</span>
                  {rule?.wcag && <span>WCAG {rule.wcag}</span>}
                  {group.siteWideProvinces.length > 0 && (
                    <span>Provinces · {group.siteWideProvinces.join(", ")}</span>
                  )}
                  {group.responsibleRole && (
                    <span>Fix owner: {ROLE_LABELS[group.responsibleRole] ?? group.responsibleRole}</span>
                  )}
                </div>

                {rule?.impact && (
                  <p className="mt-3 max-w-3xl text-gray-700">
                    <span className="font-semibold">Visitor impact: </span>
                    {rule.impact}
                  </p>
                )}

                {group.sampleSnippets.length > 0 && (
                  <div className="mt-3">
                    <div className="font-semibold text-gray-600">Example offending elements</div>
                    <div className="mt-1 space-y-1">
                      {group.sampleSnippets.slice(0, 3).map((snippet, i) => (
                        <code
                          key={i}
                          className="block overflow-x-auto rounded-lg bg-gray-900 px-3 py-1.5 font-mono text-[11px] text-gray-100"
                        >
                          {snippet}
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

                {group.samplePages.length > 0 && (
                  <AffectedPages
                    key={endpoint}
                    sample={group.samplePages}
                    count={group.affectedPageCount}
                    endpoint={endpoint}
                  />
                )}

                {(helpUrl || showTriageLink) && (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
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
                    {showTriageLink && (
                      <Link
                        href={`/issues?q=${encodeURIComponent(group.code)}`}
                        className="text-gray-500 hover:underline"
                      >
                        View in issue triage →
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
