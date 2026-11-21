import { ALL_RULES } from "@/lib/audits/rules";
import type { Conformance } from "@/lib/audits/rules";
import {
  CONFORMANCE_LABELS,
  CONFORMANCE_COLORS,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  ROLE_LABELS,
  ELEMENT_TYPE_LABELS,
} from "@/lib/ui/colors";

export const metadata = { title: "Rule Reference — Auditly" };

const SECTION_ORDER: Conformance[] = ["A", "AA", "AA22", "ARIA", "QA", "SECURITY", "SEO"];

const SECTION_DESCRIPTIONS: Record<Conformance, string> = {
  A: "WCAG 2.2 Level A success criteria — the legal baseline for accessibility.",
  AA: "WCAG 2.2 Level AA — the conformance target for most public-sector and enterprise sites.",
  AA22: "Success criteria newly added in WCAG 2.2 (target size, dragging, accessible authentication…).",
  ARIA: "WAI-ARIA usage checks — invalid roles, broken landmark structure, misused attributes.",
  QA: "Quality best practices — mixed content, deprecated markup, unlabeled document links.",
  SECURITY: "Security hygiene — HSTS, CSP, clickjacking protection, insecure forms, and reverse-tabnabbing links.",
  SEO: "Search & metadata checks — titles, descriptions, canonicals, headings, indexability, plus once-per-scan robots.txt and sitemap validation.",
};

export default function RulesPage() {
  const sections = SECTION_ORDER.map((conf) => ({
    conf,
    rules: ALL_RULES.filter((r) => r.conformance === conf),
  }));

  return (
    <div className="px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <h1 className="text-2xl font-bold">Rule Reference</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-500">
        Every check the crawl runs — {ALL_RULES.length} rules across WCAG 2.2 A/AA, WAI-ARIA,
        quality (including spelling and broken-link reporting), security, and SEO (including
        once-per-scan robots.txt/sitemap validation). Lighthouse performance is an independent,
        user-selected one-page diagnostic and does not affect site health.
      </p>

      {/* Coverage summary */}
      <div className="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {sections.map(({ conf, rules }) => (
          <a
            key={conf}
            href={`#conf-${conf}`}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div
              className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: CONFORMANCE_COLORS[conf] }}
            >
              {CONFORMANCE_LABELS[conf]}
            </div>
            <div className="mt-2 text-2xl font-bold">{rules.length}</div>
            <div className="text-[11px] text-gray-400">rules</div>
          </a>
        ))}
      </div>

      {sections.map(({ conf, rules }) => (
        <section key={conf} id={`conf-${conf}`} className="mt-8 scroll-mt-6">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-bold">{CONFORMANCE_LABELS[conf]}</h2>
            <span className="text-xs text-gray-400">{rules.length} rules</span>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{SECTION_DESCRIPTIONS[conf]}</p>

          <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
            <table className="min-w-[640px] w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Rule</th>
                  <th className="px-4 py-2.5 font-medium">Severity</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">WCAG</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Fix owner</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Element</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-t border-gray-100 align-top">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-800">{rule.name}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-gray-400">{rule.id}</div>
                      <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-gray-500">{rule.impact}</p>
                      <a
                        href={rule.helpUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-[11px] font-medium text-blue-600 hover:underline"
                      >
                        Documentation ↗
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: SEVERITY_COLORS[rule.severity.toLowerCase()] }}
                      >
                        {SEVERITY_LABELS[rule.severity.toLowerCase()]}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-500 md:table-cell">
                      {rule.wcag ?? "—"}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-500 lg:table-cell">
                      {ROLE_LABELS[rule.role]}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-500 lg:table-cell">
                      {ELEMENT_TYPE_LABELS[rule.elementType]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
