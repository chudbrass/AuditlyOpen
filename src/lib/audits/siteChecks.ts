import robotsParser from "robots-parser";
import { fetchText, fetchBuffer } from "@/lib/crawler/fetchPage";
import { isSameSiteDomain } from "@/lib/crawler/urlFilters";
import { CONFORMANCE_TO_CATEGORY } from "./rules/types";
import { siteRules } from "./rules/site";
import type { RuleFindingInput } from "./rules";

const SITE_RULES_BY_ID = new Map(siteRules.map((r) => [r.id, r]));

function finding(code: string, message: string, evidence: Record<string, unknown> = {}): RuleFindingInput {
  const rule = SITE_RULES_BY_ID.get(code)!;
  return {
    category: CONFORMANCE_TO_CATEGORY[rule.conformance],
    severity: rule.severity,
    code: rule.id,
    message,
    evidence: { helpUrl: rule.helpUrl, ...evidence },
    conformance: rule.conformance,
    responsibleRole: rule.role,
    elementType: rule.elementType,
  };
}

/**
 * Validate robots.txt + sitemap once per scan. `sitemapUrls` is the already-discovered URL
 * list from scanStart, so the sitemap tree isn't crawled twice.
 */
export async function runSiteChecks(rootUrl: string, sitemapUrls: string[]): Promise<RuleFindingInput[]> {
  const findings: RuleFindingInput[] = [];
  const origin = new URL(rootUrl).origin;
  const robotsUrl = `${origin}/robots.txt`;

  const robotsRes = await fetchText(robotsUrl, rootUrl);
  const robotsBody = robotsRes.body;

  if (robotsBody === null) {
    findings.push(finding("site.robots-missing", `No robots.txt at ${robotsUrl}`, { robotsUrl, error: robotsRes.error }));
  } else {
    const robots = robotsParser(robotsUrl, robotsBody);
    for (const agent of ["Googlebot", "*"]) {
      if (robots.isAllowed(rootUrl, agent) === false) {
        findings.push(
          finding("site.robots-blocks-search", `robots.txt disallows ${rootUrl} for User-agent: ${agent}`, {
            robotsUrl,
            userAgent: agent,
          })
        );
        break;
      }
    }
  }

  // Sitemap existence: candidates are the robots-declared sitemaps, else the conventional path.
  const declared = robotsBody ? robotsParser(robotsUrl, robotsBody).getSitemaps() : [];
  const candidates = declared.length > 0 ? declared : [`${origin}/sitemap.xml`];

  let reachable: string | null = null;
  for (const candidate of candidates) {
    if (!isSameSiteDomain(candidate, rootUrl)) continue;
    const { buffer } = await fetchBuffer(candidate, rootUrl);
    if (buffer) {
      reachable = candidate;
      break;
    }
  }

  if (!reachable) {
    findings.push(
      finding("site.sitemap-missing", `No XML sitemap found (tried: ${candidates.join(", ")})`, { candidates })
    );
  } else if (sitemapUrls.length === 0) {
    findings.push(
      finding("site.sitemap-empty", `Sitemap at ${reachable} contains no page URLs`, { sitemapUrl: reachable })
    );
  } else {
    const offDomain = sitemapUrls.filter((u) => !isSameSiteDomain(u, rootUrl));
    if (offDomain.length > 0) {
      findings.push(
        finding(
          "site.sitemap-cross-domain",
          `${offDomain.length} of ${sitemapUrls.length} sitemap URLs are on a different domain`,
          { samples: offDomain.slice(0, 5), count: offDomain.length }
        )
      );
    }
  }

  return findings;
}
