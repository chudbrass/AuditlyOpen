import { AuditRule, RuleIssue } from "./types";

const GOOGLE_TITLE_DOC = "https://developers.google.com/search/docs/appearance/title-link";
const GOOGLE_SNIPPET_DOC = "https://developers.google.com/search/docs/appearance/snippet";

function single(message: string, evidence?: Record<string, unknown>): RuleIssue[] {
  return [{ message, ...(evidence ? { evidence } : {}) }];
}

export const seoRules: AuditRule[] = [
  {
    id: "seo.missing-title",
    name: "Page must have a title tag",
    conformance: "SEO",
    severity: "SERIOUS",
    role: "author",
    elementType: "metadata",
    helpUrl: GOOGLE_TITLE_DOC,
    impact: "Search engines synthesize a title from page content — you lose control of the search result headline.",
    fixHint: `Add a unique, concise, descriptive <title> in <head>.`,
    check(ctx) {
      const title = ctx.$("title").first().text().trim();
      return title ? [] : single("Page has no <title>");
    },
  },
  {
    id: "seo.missing-meta-description",
    name: "Page must have a meta description",
    conformance: "SEO",
    severity: "MODERATE",
    role: "author",
    elementType: "metadata",
    helpUrl: GOOGLE_SNIPPET_DOC,
    impact: "Search engines pick an arbitrary text snippet for the result — usually worse for click-through.",
    fixHint: `<meta name="description" content="A concise, page-specific summary.">`,
    check(ctx) {
      const desc = (ctx.$('meta[name="description"]').attr("content") ?? "").trim();
      return desc ? [] : single("Page has no meta description");
    },
  },
  {
    id: "seo.missing-h1",
    name: "Page must have an H1",
    conformance: "SEO",
    severity: "MODERATE",
    role: "author",
    elementType: "headings",
    helpUrl: "https://developers.google.com/search/docs/appearance/structured-data",
    impact: "A clear main heading helps users and search engines understand the page's primary topic.",
    fixHint: "Add a descriptive main heading that states what the page is about.",
    check(ctx) {
      return ctx.$("h1").length === 0 ? single("Page has no <h1>") : [];
    },
  },
  {
    id: "seo.missing-canonical",
    name: "Page should declare a canonical URL",
    conformance: "SEO",
    severity: "MINOR",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
    impact: "URL variants (tracking params, http/https, trailing slash) split ranking signal across duplicates.",
    fixHint: `<link rel="canonical" href="https://example.com/current-page">`,
    check(ctx) {
      const canonical = (ctx.$('link[rel="canonical"]').attr("href") ?? "").trim();
      return canonical ? [] : single("Page has no rel=canonical link");
    },
  },
  {
    id: "seo.canonical-cross-domain",
    name: "Review cross-domain canonical URL",
    conformance: "SEO",
    severity: "MINOR",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
    impact: "A cross-domain canonical may be intentional, but it asks search engines to prefer a page on another site.",
    fixHint: "Confirm the external canonical is intentional; otherwise point it at this page's preferred URL.",
    check(ctx) {
      const canonical = (ctx.$('link[rel="canonical"]').attr("href") ?? "").trim();
      if (!canonical) return [];
      try {
        const canonicalHost = new URL(canonical, ctx.url).host;
        const pageHost = new URL(ctx.url).host;
        if (canonicalHost !== pageHost)
          return single(`Canonical points to a different domain: ${canonicalHost}`, { canonical });
      } catch {
        return single(`Canonical URL is malformed: "${canonical}"`, { canonical });
      }
      return [];
    },
  },
  {
    id: "seo.noindex",
    name: "Page is blocked from indexing",
    conformance: "SEO",
    severity: "SERIOUS",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developers.google.com/search/docs/crawling-indexing/block-indexing",
    impact: "The page will never appear in search results. Fine for staging — a disaster if it ships to production.",
    fixHint: `Remove <meta name="robots" content="noindex"> if this page should be indexable.`,
    check(ctx) {
      const robots = (ctx.$('meta[name="robots"]').attr("content") ?? "").toLowerCase();
      return robots.includes("noindex")
        ? single(`Page has a noindex robots directive ("${robots}")`, { robots })
        : [];
    },
  },
  {
    id: "seo.missing-viewport",
    name: "Page must have a viewport meta tag",
    conformance: "SEO",
    severity: "MODERATE",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developers.google.com/search/blog/2016/11/mobile-first-indexing",
    impact: "The page renders desktop-sized on phones — a direct mobile-friendliness ranking penalty.",
    fixHint: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    check(ctx) {
      return ctx.$('meta[name="viewport"]').length === 0
        ? single("Page has no viewport meta tag")
        : [];
    },
  },
  {
    id: "seo.non-descriptive-slug",
    name: "URL slug is not human-readable",
    conformance: "SEO",
    severity: "MINOR",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developers.google.com/search/docs/crawling-indexing/url-structure",
    impact: "ID-based URLs give users and search engines no clue what the page is about.",
    fixHint: "Use readable slugs: /p?id=8412 → /plans/fibre-gigabit.",
    check(ctx) {
      try {
        const url = new URL(ctx.url);
        const lastSegment = url.pathname.split("/").filter(Boolean).pop() ?? "";
        const idLike = /^\d{4,}$/.test(lastSegment) || /(^|[?&])(id|p|page)=\d+/i.test(url.search);
        return idLike ? single(`URL is ID-based rather than a readable slug (${url.pathname}${url.search})`) : [];
      } catch {
        return [];
      }
    },
  },
  {
    id: "seo.missing-hreflang",
    name: "Multi-language site without hreflang",
    conformance: "SEO",
    severity: "MINOR",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developers.google.com/search/docs/specialty/international/localized-versions",
    impact: "Search may serve users the wrong language variant (EN page to FR searchers and vice-versa).",
    fixHint: `Add alternates: <link rel="alternate" hreflang="fr" href="https://example.com/fr/page">.`,
    check(ctx) {
      if (ctx.$('link[rel="alternate"][hreflang]').length > 0) return [];
      // heuristic: page links to both /en/ and /fr/ paths → it's a bilingual site
      const hrefs = ctx
        .$("a[href]")
        .toArray()
        .map((el) => ctx.$(el).attr("href") ?? "");
      const hasEn = hrefs.some((h) => /(^|\/)en(\/|$)/i.test(h));
      const hasFr = hrefs.some((h) => /(^|\/)fr(\/|$)/i.test(h));
      return hasEn && hasFr
        ? single("Page links to EN and FR variants but declares no hreflang alternates")
        : [];
    },
  },
];
