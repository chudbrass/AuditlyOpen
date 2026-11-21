import type { CheerioAPI } from "cheerio";
import type { AnyNode } from "domhandler";
import type { Category, Severity } from "@prisma/client";

/**
 * Conformance buckets, following the rule-spec taxonomy:
 *  A / AA   — WCAG 2.x Level A / AA success criteria
 *  AA22     — criteria added in WCAG 2.2
 *  ARIA     — WAI-ARIA usage checks
 *  QA       — best-practice / quality checks
 *  SEO      — search & metadata checks
 *  SECURITY — response-header & markup security hygiene
 */
export type Conformance = "A" | "AA" | "AA22" | "ARIA" | "QA" | "SEO" | "SECURITY";

/** Who typically fixes this class of issue — drives the triage "responsible role" filter. */
export type ResponsibleRole = "author" | "developer" | "designer";

export type ElementType =
  | "images"
  | "links"
  | "forms"
  | "headings"
  | "tables"
  | "media"
  | "aria"
  | "scripts"
  | "structure"
  | "metadata"
  | "content";

export interface RuleIssue {
  message: string;
  /** Page-specific facts only (counts, sample snippets); rule-level docs live on the rule. */
  evidence?: Record<string, unknown>;
}

export interface PageContext {
  url: string;
  $: CheerioAPI;
  /** Response headers (lower-cased keys). Empty when the caller has none (e.g. tests). */
  headers: Record<string, string>;
  /** Raw HTML length in bytes-ish (string length) — cheap payload-size signal. */
  htmlBytes: number;
  /** Site-level switches for optional fast-tier checks. */
  siteConfig: {
    spellcheckEnabled: boolean;
    allowedSpellingWords: string[];
  };
}

export interface AuditRule {
  /** Stable finding code, e.g. "a11y.img-alt" — never rename once shipped (trend history keys on it). */
  id: string;
  name: string;
  /**
   * "site": origin-level (typically header-derived) — produces at most ONE finding per scan,
   * checked against the root URL fetch only and persisted with pageId null (shown site-wide).
   * Default "page": runs on every crawled page.
   */
  scope?: "page" | "site";
  conformance: Conformance;
  severity: Severity;
  role: ResponsibleRole;
  elementType: ElementType;
  /** WCAG success criterion reference, e.g. "1.1.1 Non-text Content" (omit for QA/SEO). */
  wcag?: string;
  helpUrl: string;
  /** Plain-language visitor impact shown in the triage UI. */
  impact: string;
  /** How to fix it — short guidance, optionally with a code snippet. */
  fixHint: string;
  check: (ctx: PageContext) => RuleIssue[];
}

export const CONFORMANCE_TO_CATEGORY: Record<Conformance, Category> = {
  A: "A11Y",
  AA: "A11Y",
  AA22: "A11Y",
  ARIA: "A11Y",
  QA: "QA",
  SEO: "SEO",
  SECURITY: "SECURITY",
};

const SNIPPET_MAX = 180;
const MAX_SAMPLES = 5;

/** Short outer-HTML snippets of offending elements, for the "offending element" panel in the UI. */
export function sampleSnippets($: CheerioAPI, nodes: AnyNode[], max = MAX_SAMPLES): string[] {
  return nodes.slice(0, max).map((node) => {
    const html = $.html(node) ?? "";
    const collapsed = html.replace(/\s+/g, " ").trim();
    return collapsed.length > SNIPPET_MAX ? `${collapsed.slice(0, SNIPPET_MAX)}…` : collapsed;
  });
}

export function countMessage(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
