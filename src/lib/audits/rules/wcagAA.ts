import { AuditRule, sampleSnippets, countMessage } from "./types";

const GENERIC_LINK_TEXT = new Set([
  "click here",
  "here",
  "read more",
  "more",
  "learn more",
  "details",
  "link",
  "this page",
  "continue",
  "click",
]);

export const wcagAARules: AuditRule[] = [
  {
    id: "a11y.meta-viewport-zoom",
    name: "Zoom must not be disabled",
    conformance: "AA",
    severity: "SERIOUS",
    role: "developer",
    elementType: "metadata",
    wcag: "1.4.4 Resize Text",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html",
    impact:
      "Low-vision users cannot pinch-zoom or enlarge text, making the page unreadable on mobile.",
    fixHint: `Remove user-scalable=no and maximum-scale from the viewport meta: <meta name="viewport" content="width=device-width, initial-scale=1">.`,
    check(ctx) {
      const content = (ctx.$('meta[name="viewport"]').attr("content") ?? "").toLowerCase();
      if (!content) return [];
      const noScale = /user-scalable\s*=\s*(no|0)/.test(content);
      const maxScale = content.match(/maximum-scale\s*=\s*([\d.]+)/);
      const capped = maxScale ? Number(maxScale[1]) < 2 : false;
      if (!noScale && !capped) return [];
      return [
        {
          message: `Viewport meta blocks zooming (${noScale ? "user-scalable=no" : `maximum-scale=${maxScale?.[1]}`})`,
          evidence: { content },
        },
      ];
    },
  },
  {
    id: "a11y.link-generic-text",
    name: "Link text must describe its purpose",
    conformance: "AA",
    severity: "MODERATE",
    role: "author",
    elementType: "links",
    wcag: "2.4.4 Link Purpose (In Context)",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context.html",
    impact:
      "Screen-reader users skimming a list of links hear “read more, read more, read more” with no context.",
    fixHint: `Make the destination explicit: “Read more” → “Read more about our fibre plans”, or add an aria-label.`,
    check(ctx) {
      const nodes = ctx
        .$("a[href]")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          if (($el.attr("aria-label") ?? "").trim()) return false;
          const text = $el.text().trim().toLowerCase().replace(/[.!…›»>→]+$/g, "").trim();
          return GENERIC_LINK_TEXT.has(text);
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(nodes.length, "link with generic text", "links with generic text"),
          evidence: { count: nodes.length, samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
  {
    id: "a11y.meta-refresh",
    name: "Pages must not auto-refresh or auto-redirect",
    conformance: "AA",
    severity: "SERIOUS",
    role: "developer",
    elementType: "metadata",
    wcag: "2.2.1 Timing Adjustable",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html",
    impact:
      "The page changes or reloads before slower readers finish, with no way to pause or extend the time.",
    fixHint: "Remove <meta http-equiv=\"refresh\"> — use a server-side redirect or user-triggered navigation.",
    check(ctx) {
      const meta = ctx.$('meta[http-equiv="refresh" i]').first();
      if (meta.length === 0) return [];
      return [
        {
          message: `Page uses <meta http-equiv="refresh"> (content="${meta.attr("content") ?? ""}")`,
          evidence: { content: meta.attr("content") ?? "" },
        },
      ];
    },
  },
  {
    id: "a11y.select-auto-submit",
    name: "Changing a control must not trigger navigation",
    conformance: "AA",
    severity: "MODERATE",
    role: "developer",
    elementType: "forms",
    wcag: "3.2.2 On Input",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/on-input.html",
    impact:
      "Keyboard users navigating a dropdown with arrow keys trigger the action on every keystroke.",
    fixHint: "Submit on an explicit button press instead of the select's onchange handler.",
    check(ctx) {
      const nodes = ctx
        .$("select[onchange], input[onchange]")
        .toArray()
        .filter((el) => {
          const handler = (ctx.$(el).attr("onchange") ?? "").toLowerCase();
          return handler.includes("submit") || handler.includes("location");
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(
            nodes.length,
            "control that navigates on change",
            "controls that navigate on change"
          ),
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
  {
    id: "a11y.tabindex-positive",
    name: "Avoid positive tabindex values",
    conformance: "AA",
    severity: "MODERATE",
    role: "developer",
    elementType: "scripts",
    wcag: "2.4.3 Focus Order",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html",
    impact:
      "Positive tabindex overrides the natural tab order, so keyboard focus jumps around the page unpredictably.",
    fixHint: `Use tabindex="0" (or none) and let DOM order define the tab sequence.`,
    check(ctx) {
      const nodes = ctx
        .$("[tabindex]")
        .toArray()
        .filter((el) => Number(ctx.$(el).attr("tabindex")) > 0);
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(nodes.length, "element with positive tabindex", "elements with positive tabindex"),
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
  {
    id: "a11y.error-identification",
    name: "Invalid fields must describe their error",
    conformance: "AA",
    severity: "MODERATE",
    role: "developer",
    elementType: "forms",
    wcag: "3.3.1 Error Identification",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html",
    impact:
      "Screen readers announce the field as invalid but give no explanation of what is wrong or how to fix it.",
    fixHint: `Point the field at its error message: <input aria-invalid="true" aria-describedby="email-error"> <p id="email-error">Enter a valid email.</p>.`,
    check(ctx) {
      const nodes = ctx
        .$('[aria-invalid="true"]')
        .toArray()
        .filter((el) => !(ctx.$(el).attr("aria-describedby") ?? "").trim());
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(
            nodes.length,
            "invalid field without an associated error message",
            "invalid fields without associated error messages"
          ),
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
  {
    id: "a11y.label-in-name",
    name: "Accessible name must contain the visible label",
    conformance: "AA",
    severity: "MODERATE",
    role: "developer",
    elementType: "forms",
    wcag: "2.5.3 Label in Name",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html",
    impact:
      "Voice-control users say the visible label (“click Search”) but the command fails because the accessible name differs.",
    fixHint: "Make aria-label start with or contain the element's visible text.",
    check(ctx) {
      const nodes = ctx
        .$("a[aria-label], button[aria-label]")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          const visible = $el.text().trim().toLowerCase();
          const name = ($el.attr("aria-label") ?? "").trim().toLowerCase();
          return visible.length > 1 && name.length > 0 && !name.includes(visible);
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(
            nodes.length,
            "element whose aria-label hides its visible text",
            "elements whose aria-label hides their visible text"
          ),
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
  {
    id: "a11y.fixed-width-layout",
    name: "Avoid large fixed pixel widths (reflow)",
    conformance: "AA",
    severity: "MINOR",
    role: "designer",
    elementType: "structure",
    wcag: "1.4.10 Reflow",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/reflow.html",
    impact:
      "Containers wider than 320 CSS px force horizontal scrolling on small screens and at 400% zoom.",
    fixHint: "Use max-width with fluid units: style=\"width:800px\" → style=\"max-width:800px; width:100%\".",
    check(ctx) {
      const nodes = ctx
        .$("[style*='width']")
        .toArray()
        .filter((el) => {
          const style = ctx.$(el).attr("style") ?? "";
          const m = style.match(/(?:^|[^-])width\s*:\s*(\d+)px/i);
          return m !== null && Number(m[1]) > 400;
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(
            nodes.length,
            "element with a fixed width over 400px",
            "elements with fixed widths over 400px"
          ),
          evidence: { samples: sampleSnippets(ctx.$, nodes), heuristic: true },
        },
      ];
    },
  },
  // ---- WCAG 2.2 additions ----
  {
    id: "a11y.target-size",
    name: "Interactive targets should be at least 24×24px",
    conformance: "AA22",
    severity: "MODERATE",
    role: "designer",
    elementType: "links",
    wcag: "2.5.8 Target Size (Minimum)",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html",
    impact:
      "Users with tremors or large fingers mis-tap controls that are smaller than 24×24 CSS pixels.",
    fixHint: "Increase the control's size or padding so its hit area is at least 24×24 CSS px.",
    check(ctx) {
      // static heuristic: explicit inline/attribute sizing below 24px on interactive elements
      const nodes = ctx
        .$("a[href], button, input[type='checkbox'], input[type='radio'], [role='button']")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          const style = $el.attr("style") ?? "";
          const w = style.match(/width\s*:\s*(\d+)px/i) ?? [null, $el.attr("width")];
          const h = style.match(/height\s*:\s*(\d+)px/i) ?? [null, $el.attr("height")];
          const width = w?.[1] ? Number(w[1]) : null;
          const height = h?.[1] ? Number(h[1]) : null;
          return (width !== null && width < 24) || (height !== null && height < 24);
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(
            nodes.length,
            "interactive element sized below 24×24px",
            "interactive elements sized below 24×24px"
          ),
          evidence: { samples: sampleSnippets(ctx.$, nodes), heuristic: true },
        },
      ];
    },
  },
  {
    id: "a11y.dragging-alternative",
    name: "Dragging needs a single-pointer alternative",
    conformance: "AA22",
    severity: "MODERATE",
    role: "developer",
    elementType: "scripts",
    wcag: "2.5.7 Dragging Movements",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html",
    impact:
      "Users who cannot perform drag gestures (switch access, tremors) are locked out of drag-only interactions.",
    fixHint:
      "Offer buttons or a menu for the same action (e.g. “Move up/down” buttons next to drag handles).",
    check(ctx) {
      const nodes = ctx.$("[draggable='true']").toArray();
      if (nodes.length === 0) return [];
      return [
        {
          message: `${nodes.length} draggable element${nodes.length === 1 ? "" : "s"} found — verify a click/tap alternative exists`,
          evidence: { samples: sampleSnippets(ctx.$, nodes), heuristic: true },
        },
      ];
    },
  },
  {
    id: "a11y.accessible-auth",
    name: "Authentication must not require puzzles",
    conformance: "AA22",
    severity: "MODERATE",
    role: "developer",
    elementType: "forms",
    wcag: "3.3.8 Accessible Authentication (Minimum)",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html",
    impact:
      "CAPTCHAs and transcription puzzles can make login impossible for users with cognitive disabilities.",
    fixHint:
      "Allow paste and password managers; prefer email links, passkeys, or object-recognition-free alternatives to CAPTCHA.",
    check(ctx) {
      const hasPassword = ctx.$("input[type='password']").length > 0;
      if (!hasPassword) return [];
      const captcha = ctx.$(
        "[class*='captcha' i], [id*='captcha' i], iframe[src*='recaptcha'], iframe[src*='hcaptcha'], .g-recaptcha, .h-captcha"
      );
      const pasteBlocked = ctx.$("input[onpaste*='return false'], input[onpaste*='preventDefault']");
      const nodes = [...captcha.toArray(), ...pasteBlocked.toArray()];
      if (nodes.length === 0) return [];
      return [
        {
          message:
            "Login form uses a CAPTCHA or blocks paste — verify an accessible alternative exists",
          evidence: { samples: sampleSnippets(ctx.$, nodes), heuristic: true },
        },
      ];
    },
  },
];
