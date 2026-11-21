import { AuditRule, sampleSnippets, countMessage, PageContext } from "./types";

function isHttps(ctx: PageContext): boolean {
  return ctx.url.startsWith("https://");
}

/** Header rules are meaningless without headers (e.g. unit tests feed HTML only). */
function hasHeaders(ctx: PageContext): boolean {
  return Object.keys(ctx.headers).length > 0;
}

/**
 * Security-hygiene checks: response-header posture plus markup-level footguns.
 * These are defensive-configuration findings (the kind Siteimprove/Mozilla Observatory
 * report), not a penetration test.
 */
export const securityRules: AuditRule[] = [
  {
    id: "sec.hsts-missing",
    name: "HTTPS sites should send Strict-Transport-Security",
    scope: "site",
    conformance: "SECURITY",
    severity: "MODERATE",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security",
    impact:
      "Without HSTS, returning visitors can be silently downgraded to plain HTTP by a network attacker (SSL-stripping).",
    fixHint: "Send `Strict-Transport-Security: max-age=31536000; includeSubDomains` on every HTTPS response.",
    check(ctx) {
      if (!isHttps(ctx) || !hasHeaders(ctx)) return [];
      if (ctx.headers["strict-transport-security"]) return [];
      return [{ message: "No Strict-Transport-Security header on an HTTPS page" }];
    },
  },
  {
    id: "sec.content-type-options",
    name: "Responses should send X-Content-Type-Options: nosniff",
    scope: "site",
    conformance: "SECURITY",
    severity: "MODERATE",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options",
    impact:
      "Browsers may MIME-sniff responses into executable types, letting uploaded or proxied content run as script.",
    fixHint: "Send `X-Content-Type-Options: nosniff` on all responses.",
    check(ctx) {
      if (!hasHeaders(ctx)) return [];
      const value = (ctx.headers["x-content-type-options"] ?? "").toLowerCase();
      if (value.includes("nosniff")) return [];
      return [{ message: "X-Content-Type-Options: nosniff header is missing" }];
    },
  },
  {
    id: "sec.csp-missing",
    name: "Pages should set a Content-Security-Policy",
    scope: "site",
    conformance: "SECURITY",
    severity: "MODERATE",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP",
    impact:
      "Without CSP, any injected script (XSS, compromised third-party tag) runs with full access to the page and its cookies.",
    fixHint:
      "Start with a report-only policy, then enforce: `Content-Security-Policy: default-src 'self'; …`. A <meta http-equiv> tag also counts.",
    check(ctx) {
      if (!hasHeaders(ctx)) return [];
      if (ctx.headers["content-security-policy"] || ctx.headers["content-security-policy-report-only"]) return [];
      if (ctx.$('meta[http-equiv="Content-Security-Policy" i]').length > 0) return [];
      return [{ message: "No Content-Security-Policy (header or meta tag)" }];
    },
  },
  {
    id: "sec.frame-protection",
    name: "Pages should be protected against clickjacking",
    scope: "site",
    conformance: "SECURITY",
    severity: "MODERATE",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options",
    impact:
      "Any site can embed the page in an invisible iframe and trick visitors into clicking buttons they can't see (clickjacking).",
    fixHint:
      "Send `X-Frame-Options: SAMEORIGIN` or (preferred) a CSP `frame-ancestors 'self'` directive.",
    check(ctx) {
      if (!hasHeaders(ctx)) return [];
      if (ctx.headers["x-frame-options"]) return [];
      if (/frame-ancestors/i.test(ctx.headers["content-security-policy"] ?? "")) return [];
      return [{ message: "No clickjacking protection (X-Frame-Options or CSP frame-ancestors)" }];
    },
  },
  {
    id: "sec.referrer-policy",
    name: "Set an explicit Referrer-Policy",
    scope: "site",
    conformance: "SECURITY",
    severity: "MINOR",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy",
    impact:
      "Full page URLs (which can contain tokens, search terms, or account paths) leak to every third-party the page links to or loads.",
    fixHint: 'Send `Referrer-Policy: strict-origin-when-cross-origin` (or add <meta name="referrer" content="…">).',
    check(ctx) {
      if (!hasHeaders(ctx)) return [];
      if (ctx.headers["referrer-policy"]) return [];
      if (ctx.$('meta[name="referrer" i]').length > 0) return [];
      return [{ message: "No Referrer-Policy header or meta tag" }];
    },
  },
  {
    id: "sec.server-info-leak",
    name: "Avoid advertising server software versions",
    scope: "site",
    conformance: "SECURITY",
    severity: "MINOR",
    role: "developer",
    elementType: "metadata",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server",
    impact:
      "Version strings in Server/X-Powered-By headers let attackers match the stack against known CVEs without probing.",
    fixHint: "Strip or genericize `Server` and remove `X-Powered-By` at the web server / framework level.",
    check(ctx) {
      if (!hasHeaders(ctx)) return [];
      const leaks: string[] = [];
      const server = ctx.headers["server"] ?? "";
      // Only flag when a version number is exposed; a bare product name is fine.
      if (/\d/.test(server)) leaks.push(`Server: ${server}`);
      if (ctx.headers["x-powered-by"]) leaks.push(`X-Powered-By: ${ctx.headers["x-powered-by"]}`);
      if (leaks.length === 0) return [];
      return [{ message: `Server software disclosed in response headers`, evidence: { headers: leaks } }];
    },
  },
  {
    id: "sec.form-insecure-action",
    name: "Forms must not submit over HTTP",
    conformance: "SECURITY",
    severity: "SERIOUS",
    role: "developer",
    elementType: "forms",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content",
    impact:
      "Anything the visitor types — passwords, personal data — travels the network in plaintext and browsers show scary warnings.",
    fixHint: "Point every form action at an https:// URL (or use a relative path on an HTTPS site).",
    check(ctx) {
      const nodes = ctx
        .$("form[action]")
        .toArray()
        .filter((el) => (ctx.$(el).attr("action") ?? "").trim().toLowerCase().startsWith("http://"));
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(nodes.length, "form submitting to an insecure http:// URL", "forms submitting to insecure http:// URLs"),
          evidence: { samples: sampleSnippets(ctx.$, nodes, 3) },
        },
      ];
    },
  },
  {
    id: "sec.target-blank-noopener",
    name: "External target=\"_blank\" links should use rel=\"noopener\"",
    conformance: "SECURITY",
    severity: "MINOR",
    role: "author",
    elementType: "links",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/rel/noopener",
    impact:
      "Legacy browsers give the opened page a handle back to yours (window.opener), enabling reverse-tabnabbing phishing; it can also hurt performance.",
    fixHint: `Add the rel attribute: <a href="…" target="_blank" rel="noopener noreferrer">.`,
    check(ctx) {
      let pageOrigin: string | null = null;
      try {
        pageOrigin = new URL(ctx.url).origin;
      } catch {
        return [];
      }
      const nodes = ctx
        .$('a[target="_blank"][href^="http"]')
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          const rel = ($el.attr("rel") ?? "").toLowerCase();
          if (rel.includes("noopener") || rel.includes("noreferrer")) return false;
          try {
            return new URL($el.attr("href")!).origin !== pageOrigin;
          } catch {
            return false;
          }
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(
            nodes.length,
            'external target="_blank" link without rel="noopener"',
            'external target="_blank" links without rel="noopener"'
          ),
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
];
