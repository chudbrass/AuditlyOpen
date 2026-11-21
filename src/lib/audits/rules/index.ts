import * as cheerio from "cheerio";
import { Category, Prisma, Severity } from "@prisma/client";
import { AuditRule, Conformance, CONFORMANCE_TO_CATEGORY, PageContext } from "./types";
import { wcagARules } from "./wcagA";
import { wcagAARules } from "./wcagAA";
import { ariaRules } from "./aria";
import { qaRules } from "./qa";
import { seoRules } from "./seo";
import { securityRules } from "./security";
import { spellingRules } from "./spelling";
import { siteRules } from "./site";

export type { AuditRule, Conformance, ResponsibleRole, ElementType } from "./types";

/** Every fast-tier rule, in triage order (A first, SEO last). */
export const ALL_RULES: AuditRule[] = [
  ...wcagARules,
  ...wcagAARules,
  ...ariaRules,
  ...qaRules,
  ...spellingRules,
  ...securityRules,
  ...seoRules,
  ...siteRules,
];

export const RULES_BY_ID: ReadonlyMap<string, AuditRule> = new Map(
  ALL_RULES.map((rule) => [rule.id, rule])
);

/**
 * Rules whose findings are site-wide (one per scan, pageId null). Callers use this both to
 * partition runRules output for persistence and to clean up site-scoped findings on a
 * watchdog re-run of the root page (see crawlPage).
 */
export const SITE_SCOPED_RULE_IDS: ReadonlySet<string> = new Set(
  ALL_RULES.filter((rule) => rule.scope === "site").map((rule) => rule.id)
);

export interface RuleFindingInput {
  category: Category;
  severity: Severity;
  code: string;
  message: string;
  evidence: Prisma.InputJsonValue;
  conformance: Conformance;
  responsibleRole: string;
  elementType: string;
}

/**
 * Run the fast-tier rule set against a fetched page. One finding per rule occurrence,
 * carrying the triage metadata (conformance / role / element type) used by the Issues filters.
 * A rule that throws is skipped — one bad rule must never abort the crawl of a page.
 *
 * Site-scoped rules (scope: "site") only run when `includeSiteScoped` is true — the caller
 * passes true for the root URL fetch only, so they yield at most one finding per scan.
 * `ruleFilter` optionally restricts execution to specific rule ids for item rechecks.
 */
export function runRules(
  html: string,
  pageUrl: string,
  headers: Record<string, string> = {},
  document?: cheerio.CheerioAPI,
  siteConfig: PageContext["siteConfig"] = { spellcheckEnabled: false, allowedSpellingWords: [] },
  includeSiteScoped = false,
  ruleFilter?: ReadonlySet<string>
): RuleFindingInput[] {
  const $ = document ?? cheerio.load(html);
  const ctx: PageContext = { url: pageUrl, $, headers, htmlBytes: html.length, siteConfig };
  const findings: RuleFindingInput[] = [];

  for (const rule of ALL_RULES) {
    if (rule.scope === "site" && !includeSiteScoped) continue;
    if (ruleFilter && !ruleFilter.has(rule.id)) continue;
    let issues;
    try {
      issues = rule.check(ctx);
    } catch {
      continue;
    }
    for (const issue of issues) {
      findings.push({
        category: CONFORMANCE_TO_CATEGORY[rule.conformance],
        severity: rule.severity,
        code: rule.id,
        message: issue.message,
        evidence: { pageUrl, helpUrl: rule.helpUrl, ...issue.evidence } as Prisma.InputJsonValue,
        conformance: rule.conformance,
        responsibleRole: rule.role,
        elementType: rule.elementType,
      });
    }
  }

  return findings;
}
