import type { AnyNode } from "domhandler";
import { AuditRule, PageContext, RuleIssue, sampleSnippets, countMessage } from "./types";

const WCAG_QUICKREF = "https://www.w3.org/WAI/WCAG22/quickref/";

/** Does the element have any accessible name from text, aria-label(ledby), or title? */
function hasAccessibleName(ctx: PageContext, el: AnyNode): boolean {
  const $el = ctx.$(el);
  if ($el.text().trim().length > 0) return true;
  if (($el.attr("aria-label") ?? "").trim().length > 0) return true;
  if (($el.attr("aria-labelledby") ?? "").trim().length > 0) return true;
  if (($el.attr("title") ?? "").trim().length > 0) return true;
  // an image child with non-empty alt names the link/button
  return $el.find("img[alt]").toArray().some((img) => (ctx.$(img).attr("alt") ?? "").trim().length > 0);
}

function aggregate(
  ctx: PageContext,
  nodes: AnyNode[],
  singular: string,
  plural?: string
): RuleIssue[] {
  if (nodes.length === 0) return [];
  return [
    {
      message: countMessage(nodes.length, singular, plural),
      evidence: { count: nodes.length, samples: sampleSnippets(ctx.$, nodes) },
    },
  ];
}

export const wcagARules: AuditRule[] = [
  {
    id: "a11y.img-alt",
    name: "Images must have alternate text",
    conformance: "A",
    severity: "CRITICAL",
    role: "author",
    elementType: "images",
    wcag: "1.1.1 Non-text Content",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
    impact:
      "Screen-reader users hear nothing (or a raw filename) for the image, so any information it carries is lost.",
    fixHint: `Add a meaningful alt attribute: <img src="hero.jpg" alt="Team assembling fibre cabinet">. Use alt="" plus role="presentation" only for purely decorative images.`,
    check(ctx) {
      const missing = ctx.$("img").toArray().filter((el) => ctx.$(el).attr("alt") === undefined);
      // empty alt inside a link/button hides a functional image from assistive tech
      const functionalEmpty = ctx
        .$("a[href] img, button img, [role='button'] img")
        .toArray()
        .filter((el) => {
          const alt = ctx.$(el).attr("alt");
          if (alt === undefined || alt.trim() !== "") return false;
          if (ctx.$(el).attr("role") === "presentation") return false;
          // fine if the wrapping link/button is named some other way
          const wrapper = ctx.$(el).closest("a[href], button, [role='button']");
          return wrapper.length > 0 && !hasAccessibleName(ctx, wrapper.get(0)!);
        });
      const nodes = [...missing, ...functionalEmpty];
      return aggregate(ctx, nodes, "image without usable alt text", "images without usable alt text");
    },
  },
  {
    id: "a11y.link-name",
    name: "Links must have discernible text",
    conformance: "A",
    severity: "CRITICAL",
    role: "developer",
    elementType: "links",
    wcag: "2.4.4 Link Purpose (In Context)",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html",
    impact:
      "Assistive technology announces the link as just “link”, so users cannot tell where it goes.",
    fixHint: `Give the link text, an aria-label, or an image child with alt text: <a href="/pricing" aria-label="View pricing"><svg …/></a>.`,
    check(ctx) {
      const nodes = ctx
        .$("a[href]")
        .toArray()
        .filter((el) => !hasAccessibleName(ctx, el));
      return aggregate(ctx, nodes, "link with no accessible name", "links with no accessible name");
    },
  },
  {
    id: "a11y.button-name",
    name: "Buttons must have discernible text",
    conformance: "A",
    severity: "CRITICAL",
    role: "developer",
    elementType: "forms",
    wcag: "4.1.2 Name, Role, Value",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
    impact: "Screen-reader users hear an unnamed “button” and cannot tell what pressing it will do.",
    fixHint: `Add visible text or an aria-label: <button aria-label="Close dialog">×</button>.`,
    check(ctx) {
      const nodes = ctx
        .$("button, [role='button']")
        .toArray()
        .filter((el) => !hasAccessibleName(ctx, el));
      return aggregate(ctx, nodes, "button with no accessible name", "buttons with no accessible name");
    },
  },
  {
    id: "a11y.input-label",
    name: "Form fields must have labels",
    conformance: "A",
    severity: "CRITICAL",
    role: "developer",
    elementType: "forms",
    wcag: "3.3.2 Labels or Instructions",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html",
    impact:
      "Users of screen readers and voice control cannot tell what the field is for, making the form unusable.",
    fixHint: `Associate a label: <label for="email">Email</label><input id="email" type="email">, or use aria-label / aria-labelledby.`,
    check(ctx) {
      const labelledIds = new Set(
        ctx
          .$("label[for]")
          .toArray()
          .map((el) => ctx.$(el).attr("for"))
          .filter((v): v is string => !!v)
      );
      const skipTypes = new Set(["hidden", "submit", "reset", "button", "image"]);
      const nodes = ctx
        .$("input, select, textarea")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          const type = ($el.attr("type") ?? "text").toLowerCase();
          if (el.type === "tag" && el.tagName === "input" && skipTypes.has(type)) return false;
          const id = $el.attr("id");
          if (id && labelledIds.has(id)) return false;
          if (($el.attr("aria-label") ?? "").trim()) return false;
          if (($el.attr("aria-labelledby") ?? "").trim()) return false;
          if (($el.attr("title") ?? "").trim()) return false;
          if ($el.closest("label").length > 0) return false;
          return true;
        });
      return aggregate(ctx, nodes, "form field without a label", "form fields without labels");
    },
  },
  {
    id: "a11y.html-lang",
    name: "Document must declare a language",
    conformance: "A",
    severity: "SERIOUS",
    role: "developer",
    elementType: "structure",
    wcag: "3.1.1 Language of Page",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html",
    impact:
      "Screen readers guess the language and may read the page with the wrong pronunciation rules.",
    fixHint: `Set the language on the root element: <html lang="en"> (or "fr" for French pages).`,
    check(ctx) {
      const lang = (ctx.$("html").first().attr("lang") ?? "").trim();
      return lang ? [] : [{ message: "The <html> element has no lang attribute" }];
    },
  },
  {
    id: "a11y.duplicate-ids",
    name: "id values must be unique",
    conformance: "ARIA",
    severity: "SERIOUS",
    role: "developer",
    elementType: "structure",
    wcag: "4.1.2 Name, Role, Value",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
    impact:
      "label/for, aria-labelledby and anchor links resolve to the wrong element when ids repeat.",
    fixHint: "Rename duplicates so every id on the page is unique.",
    check(ctx) {
      const seen = new Map<string, number>();
      ctx.$("[id]").each((_, el) => {
        const id = ctx.$(el).attr("id");
        if (id) seen.set(id, (seen.get(id) ?? 0) + 1);
      });
      const dupes = [...seen.entries()].filter(([, n]) => n > 1);
      if (dupes.length === 0) return [];
      return [
        {
          message: countMessage(dupes.length, "id value is reused", "id values are reused"),
          evidence: { duplicates: dupes.slice(0, 10).map(([id, n]) => `#${id} ×${n}`) },
        },
      ];
    },
  },
  {
    id: "a11y.heading-order",
    name: "Heading levels must not skip",
    conformance: "A",
    severity: "MODERATE",
    role: "author",
    elementType: "headings",
    wcag: "1.3.1 Info and Relationships",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html",
    impact:
      "Screen-reader users navigating by heading lose the document outline when levels jump (h1 → h3).",
    fixHint: "Nest headings sequentially: h1 → h2 → h3. Use CSS, not heading level, to control size.",
    check(ctx) {
      const issues: string[] = [];
      let prev = 0;
      ctx.$("h1, h2, h3, h4, h5, h6").each((_, el) => {
        if (el.type !== "tag") return;
        const level = Number(el.tagName.slice(1));
        const text = ctx.$(el).text().trim().slice(0, 60);
        if (prev > 0 && level > prev + 1) issues.push(`h${prev} → h${level} (“${text}”)`);
        prev = level;
      });
      if (issues.length === 0) return [];
      return [
        {
          message: countMessage(issues.length, "heading level skip"),
          evidence: { skips: issues.slice(0, 10) },
        },
      ];
    },
  },
  {
    id: "a11y.empty-heading",
    name: "Headings must not be empty",
    conformance: "A",
    severity: "MODERATE",
    role: "author",
    elementType: "headings",
    wcag: "1.3.1 Info and Relationships",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html",
    impact: "Empty headings add confusing stops to screen-reader heading navigation.",
    fixHint: "Remove the empty heading element, or put the section title inside it.",
    check(ctx) {
      const nodes = ctx
        .$("h1, h2, h3, h4, h5, h6")
        .toArray()
        .filter((el) => ctx.$(el).text().trim() === "" && ctx.$(el).find("img[alt]").length === 0);
      return aggregate(ctx, nodes, "empty heading");
    },
  },
  {
    id: "a11y.skip-link",
    name: "Provide a skip-to-content link",
    conformance: "A",
    severity: "MODERATE",
    role: "developer",
    elementType: "structure",
    wcag: "2.4.1 Bypass Blocks",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html",
    impact:
      "Keyboard users must tab through the entire header and navigation on every page before reaching content.",
    fixHint: `Make the first focusable element an in-page link: <a href="#main" class="skip-link">Skip to content</a> … <main id="main">.`,
    check(ctx) {
      // only meaningful when the page actually has navigation to skip
      if (ctx.$("nav, [role='navigation']").length === 0) return [];
      const firstLinks = ctx.$("a[href]").toArray().slice(0, 3);
      const hasSkip = firstLinks.some((el) => (ctx.$(el).attr("href") ?? "").startsWith("#"));
      return hasSkip
        ? []
        : [{ message: "No skip-to-content link found among the first focusable links" }];
    },
  },
  {
    id: "a11y.redundant-title-attr",
    name: "title attribute duplicates element text",
    conformance: "A",
    severity: "MINOR",
    role: "author",
    elementType: "content",
    helpUrl: WCAG_QUICKREF,
    impact: "Screen readers announce the same text twice, adding noise.",
    fixHint: "Remove title attributes that repeat the element's visible text.",
    check(ctx) {
      const nodes = ctx
        .$("[title]")
        .toArray()
        .filter((el) => {
          const title = (ctx.$(el).attr("title") ?? "").trim().toLowerCase();
          const text = ctx.$(el).text().trim().toLowerCase();
          return title.length > 0 && title === text && text.length > 0;
        });
      return aggregate(
        ctx,
        nodes,
        "element whose title attribute duplicates its text",
        "elements whose title attribute duplicates their text"
      );
    },
  },
  {
    id: "a11y.clickable-div",
    name: "Clickable elements must be keyboard-accessible",
    conformance: "A",
    severity: "SERIOUS",
    role: "developer",
    elementType: "scripts",
    wcag: "2.1.1 Keyboard",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html",
    impact:
      "A div/span with onclick cannot be reached or activated with the keyboard, so the action is impossible without a mouse.",
    fixHint: `Use a real <button> or <a>, or add role="button" tabindex="0" plus a keydown handler for Enter/Space.`,
    check(ctx) {
      const nodes = ctx
        .$("div[onclick], span[onclick]")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          return !$el.attr("role") && $el.attr("tabindex") === undefined;
        });
      return aggregate(
        ctx,
        nodes,
        "clickable div/span without keyboard support",
        "clickable divs/spans without keyboard support"
      );
    },
  },
  {
    id: "a11y.media-autoplay",
    name: "Media must not autoplay with sound",
    conformance: "A",
    severity: "SERIOUS",
    role: "developer",
    elementType: "media",
    wcag: "1.4.2 Audio Control",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html",
    impact:
      "Autoplaying audio talks over screen readers and cannot be stopped without controls.",
    fixHint: `Add muted for background video, or provide controls: <video autoplay muted loop> / <audio controls>.`,
    check(ctx) {
      const nodes = ctx
        .$("video[autoplay], audio[autoplay]")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          return $el.attr("muted") === undefined && $el.attr("controls") === undefined;
        });
      return aggregate(
        ctx,
        nodes,
        "media element autoplaying without mute or controls",
        "media elements autoplaying without mute or controls"
      );
    },
  },
  {
    id: "a11y.iframe-title",
    name: "iframes must have a title",
    conformance: "A",
    severity: "SERIOUS",
    role: "developer",
    elementType: "media",
    wcag: "4.1.2 Name, Role, Value",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
    impact: "Screen-reader users hear “frame” with no clue what the embedded content is.",
    fixHint: `Describe the embed: <iframe title="Store locations map" src="…">.`,
    check(ctx) {
      const nodes = ctx
        .$("iframe")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          if (($el.attr("title") ?? "").trim()) return false;
          if ($el.attr("aria-hidden") === "true") return false;
          return true;
        });
      return aggregate(ctx, nodes, "iframe without a title", "iframes without titles");
    },
  },
  {
    id: "a11y.sensory-instructions",
    name: "Instructions must not rely on colour/shape/position alone",
    conformance: "A",
    severity: "MINOR",
    role: "author",
    elementType: "content",
    wcag: "1.3.3 Sensory Characteristics",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/sensory-characteristics.html",
    impact:
      "Users who cannot perceive colour or layout (screen readers, colour blindness) cannot follow the instruction.",
    fixHint:
      "Reference elements by their label as well: “click the round green button” → “click Submit (the green button)”.",
    check(ctx) {
      const pattern =
        /\b(?:click|press|select|choose|tap|use)\b[^.!?]{0,40}\b(?:red|green|blue|yellow|orange|purple|round|circular|square)\b[^.!?]{0,20}\b(?:button|icon|link|field|box)\b/i;
      const matches: string[] = [];
      ctx.$("p, li, span, label, div").each((_, el) => {
        const own = ctx.$(el).clone().children().remove().end().text().trim();
        if (own.length > 10 && own.length < 300 && pattern.test(own)) {
          matches.push(own.slice(0, 120));
        }
      });
      if (matches.length === 0) return [];
      return [
        {
          message: countMessage(
            matches.length,
            "instruction that may rely on colour/shape alone",
            "instructions that may rely on colour/shape alone"
          ),
          evidence: { samples: [...new Set(matches)].slice(0, 5), heuristic: true },
        },
      ];
    },
  },
];
