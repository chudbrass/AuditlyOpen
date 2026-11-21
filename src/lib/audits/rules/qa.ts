import { AuditRule, sampleSnippets, countMessage } from "./types";

const DOC_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|zip)(?:[?#]|$)/i;
const DOC_TEXT_HINT = /\b(pdf|docx?|xlsx?|pptx?|zip|download|kb|mb)\b/i;
const INLINE_STYLE_THRESHOLD = 25;

export const qaRules: AuditRule[] = [
  {
    id: "qa.mixed-content",
    name: "HTTPS pages must not load HTTP resources",
    conformance: "QA",
    severity: "SERIOUS",
    role: "developer",
    elementType: "scripts",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content",
    impact:
      "Browsers block or warn about insecure sub-resources; images break and scripts fail on the live site.",
    fixHint: "Serve every asset over https:// (or use protocol-relative/absolute-path URLs).",
    check(ctx) {
      if (!ctx.url.startsWith("https://")) return [];
      const nodes = ctx
        .$("img[src], script[src], iframe[src], audio[src], video[src], source[src], embed[src], object[data], link[rel='stylesheet'][href]")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          const url = $el.attr("src") ?? $el.attr("data") ?? $el.attr("href") ?? "";
          return url.startsWith("http://");
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(nodes.length, "insecure (http://) resource on an HTTPS page", "insecure (http://) resources on an HTTPS page"),
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
  {
    id: "qa.deprecated-elements",
    name: "Avoid deprecated HTML elements",
    conformance: "QA",
    severity: "MINOR",
    role: "developer",
    elementType: "structure",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTML/Element#obsolete_and_deprecated_elements",
    impact: "Obsolete elements render inconsistently and often break accessibility and styling.",
    fixHint: "<font>/<center> → CSS; <marquee>/<blink> → remove (they also violate WCAG pause/stop rules).",
    check(ctx) {
      const nodes = ctx.$("font, center, marquee, blink, big, strike, acronym").toArray();
      if (nodes.length === 0) return [];
      const tags = [...new Set(nodes.map((el) => (el.type === "tag" ? `<${el.tagName}>` : "")))];
      return [
        {
          message: `${countMessage(nodes.length, "deprecated element")} (${tags.join(", ")})`,
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
  {
    id: "qa.table-headers",
    name: "Data tables must have header cells",
    conformance: "QA",
    severity: "MODERATE",
    role: "author",
    elementType: "tables",
    wcag: "1.3.1 Info and Relationships",
    helpUrl: "https://www.w3.org/WAI/tutorials/tables/",
    impact:
      "Screen readers cannot associate data cells with their column/row meaning, turning the table into a number soup.",
    fixHint: `Add header cells with scope: <tr><th scope="col">Plan</th><th scope="col">Price</th></tr>.`,
    check(ctx) {
      const nodes = ctx
        .$("table")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          if ($el.attr("role") === "presentation" || $el.attr("role") === "none") return false;
          const rows = $el.find("tr").length;
          const cols = $el.find("tr").first().find("td, th").length;
          if (rows < 2 || cols < 2) return false; // probably layout, not data
          return $el.find("th").length === 0 && $el.find("[scope]").length === 0;
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(nodes.length, "data table without header cells", "data tables without header cells"),
          evidence: { samples: sampleSnippets(ctx.$, nodes, 3) },
        },
      ];
    },
  },
  {
    id: "qa.doc-link-unlabeled",
    name: "Document links should state the file type",
    conformance: "QA",
    severity: "MINOR",
    role: "author",
    elementType: "links",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html",
    impact:
      "Users click expecting a web page and get an unexpected file download (painful on mobile or metered data).",
    fixHint: `Include the type and size in the link text: “Annual report (PDF, 2.4 MB)”.`,
    check(ctx) {
      const nodes = ctx
        .$("a[href]")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          const href = $el.attr("href") ?? "";
          if (!DOC_EXTENSIONS.test(href)) return false;
          const text = `${$el.text()} ${$el.attr("aria-label") ?? ""}`;
          return !DOC_TEXT_HINT.test(text);
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(
            nodes.length,
            "document link that hides its file type",
            "document links that hide their file type"
          ),
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
  {
    id: "qa.inline-style-overload",
    name: "Excessive inline styles",
    conformance: "QA",
    severity: "MINOR",
    role: "author",
    elementType: "content",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/Cascade_and_inheritance",
    impact:
      "Heavy inline styling usually means CMS copy-paste content that will fight the design system and break responsive layouts.",
    fixHint: "Strip inline styles from authored content; style via the site's stylesheet instead.",
    check(ctx) {
      const count = ctx.$("body [style]").length;
      if (count <= INLINE_STYLE_THRESHOLD) return [];
      return [
        {
          message: `${count} elements carry inline style attributes (threshold ${INLINE_STYLE_THRESHOLD})`,
          evidence: { count, heuristic: true },
        },
      ];
    },
  },
  {
    id: "qa.img-missing-srcset",
    name: "Content images should use responsive srcset",
    conformance: "QA",
    severity: "MINOR",
    role: "developer",
    elementType: "images",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Learn/HTML/Multimedia_and_embedding/Responsive_images",
    impact:
      "Mobile users download desktop-sized images, hurting load time and Core Web Vitals.",
    fixHint: `Provide scaled variants: <img src="hero-800.jpg" srcset="hero-400.jpg 400w, hero-800.jpg 800w" sizes="100vw">.`,
    check(ctx) {
      if (ctx.$('meta[name="viewport"]').length === 0) return []; // not a responsive page
      const nodes = ctx
        .$("img[src]")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          const src = $el.attr("src") ?? "";
          if (src.endsWith(".svg") || src.startsWith("data:")) return false;
          return $el.attr("srcset") === undefined && $el.closest("picture").length === 0;
        });
      if (nodes.length < 3) return []; // one-off images are fine; flag the pattern
      return [
        {
          message: `${nodes.length} content images have no srcset/sizes on a responsive page`,
          evidence: { count: nodes.length, samples: sampleSnippets(ctx.$, nodes, 3), heuristic: true },
        },
      ];
    },
  },
];
