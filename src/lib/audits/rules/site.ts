import { AuditRule } from "./types";

/**
 * Site-level checks: run once per scan (from scanStart via lib/audits/siteChecks.ts), not per
 * page — these registry entries carry the triage metadata and appear on /rules, but the
 * per-page check() is a no-op. Findings created from them have no pageId.
 */
export const siteRules: AuditRule[] = [
  {
    id: "site.robots-missing",
    name: "Site should serve a robots.txt",
    conformance: "SEO",
    severity: "MINOR",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
    impact:
      "Checked once per scan. Without robots.txt, crawlers guess what to index and you lose the standard place to declare your sitemap.",
    fixHint: "Serve /robots.txt with at least a `Sitemap:` line pointing at your sitemap.xml.",
    check: () => [],
  },
  {
    id: "site.robots-blocks-search",
    name: "robots.txt must not block search engines from the site",
    conformance: "SEO",
    severity: "CRITICAL",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
    impact:
      "Checked once per scan. The homepage is disallowed for search crawlers — the site can drop out of search results entirely (a classic forgotten staging config).",
    fixHint: "Remove the `Disallow: /` (or over-broad rule) for `User-agent: *` / Googlebot in robots.txt.",
    check: () => [],
  },
  {
    id: "site.sitemap-missing",
    name: "Site should provide an XML sitemap",
    conformance: "SEO",
    severity: "MODERATE",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview",
    impact:
      "Checked once per scan. Without a sitemap, search engines discover pages only by following links — deep or new pages get indexed late or never.",
    fixHint: "Generate /sitemap.xml (most frameworks/CMSs have this built in) and declare it in robots.txt.",
    check: () => [],
  },
  {
    id: "site.sitemap-empty",
    name: "Sitemap must contain URLs",
    conformance: "SEO",
    severity: "SERIOUS",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://www.sitemaps.org/protocol.html",
    impact:
      "Checked once per scan. The sitemap exists but yields zero URLs — malformed XML or an empty generator output; search engines get nothing from it.",
    fixHint: "Validate the sitemap XML (<urlset><url><loc>…) and make sure the generator actually emits your pages.",
    check: () => [],
  },
  {
    id: "site.sitemap-cross-domain",
    name: "Sitemap URLs should stay on the site's domain",
    conformance: "SEO",
    severity: "MODERATE",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://www.sitemaps.org/protocol.html",
    impact:
      "Checked once per scan. URLs on other domains in the sitemap are ignored by search engines and usually indicate a misconfigured host/base URL.",
    fixHint: "Point the sitemap generator's base URL at the canonical domain so every <loc> matches the site host.",
    check: () => [],
  },
];
