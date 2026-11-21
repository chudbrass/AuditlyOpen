import { AuditRule, sampleSnippets, countMessage } from "./types";

// WAI-ARIA 1.2 roles (abstract roles excluded — they are invalid in content anyway).
const VALID_ROLES = new Set([
  "alert", "alertdialog", "application", "article", "banner", "blockquote", "button", "caption",
  "cell", "checkbox", "code", "columnheader", "combobox", "complementary", "contentinfo",
  "definition", "deletion", "dialog", "directory", "document", "emphasis", "feed", "figure",
  "form", "generic", "grid", "gridcell", "group", "heading", "img", "insertion", "link", "list",
  "listbox", "listitem", "log", "main", "marquee", "math", "menu", "menubar", "menuitem",
  "menuitemcheckbox", "menuitemradio", "meter", "navigation", "none", "note", "option",
  "paragraph", "presentation", "progressbar", "radio", "radiogroup", "region", "row", "rowgroup",
  "rowheader", "scrollbar", "search", "searchbox", "separator", "slider", "spinbutton", "status",
  "strong", "subscript", "superscript", "switch", "tab", "table", "tablist", "tabpanel", "term",
  "textbox", "time", "timer", "toolbar", "tooltip", "tree", "treegrid", "treeitem",
]);

const VALID_ARIA_ATTRS = new Set([
  "aria-activedescendant", "aria-atomic", "aria-autocomplete", "aria-braillelabel",
  "aria-brailleroledescription", "aria-busy", "aria-checked", "aria-colcount", "aria-colindex",
  "aria-colindextext", "aria-colspan", "aria-controls", "aria-current", "aria-describedby",
  "aria-description", "aria-details", "aria-disabled", "aria-dropeffect", "aria-errormessage",
  "aria-expanded", "aria-flowto", "aria-grabbed", "aria-haspopup", "aria-hidden",
  "aria-invalid", "aria-keyshortcuts", "aria-label", "aria-labelledby", "aria-level",
  "aria-live", "aria-modal", "aria-multiline", "aria-multiselectable", "aria-orientation",
  "aria-owns", "aria-placeholder", "aria-posinset", "aria-pressed", "aria-readonly",
  "aria-relevant", "aria-required", "aria-roledescription", "aria-rowcount", "aria-rowindex",
  "aria-rowindextext", "aria-rowspan", "aria-selected", "aria-setsize", "aria-sort",
  "aria-valuemax", "aria-valuemin", "aria-valuenow", "aria-valuetext",
]);

// Roles whose contents must include specific descendant roles.
const REQUIRED_CHILDREN: Record<string, string[]> = {
  list: ["listitem"],
  tablist: ["tab"],
  menu: ["menuitem", "menuitemcheckbox", "menuitemradio"],
  menubar: ["menuitem", "menuitemcheckbox", "menuitemradio"],
  radiogroup: ["radio"],
  listbox: ["option"],
  tree: ["treeitem"],
  grid: ["row"],
  table: ["row"],
};

// Native elements whose implicit role makes an explicit role attribute redundant.
const REDUNDANT_ROLE: [selector: string, role: string][] = [
  ["button", "button"],
  ["a[href]", "link"],
  ["nav", "navigation"],
  ["main", "main"],
  ["header", "banner"],
  ["footer", "contentinfo"],
  ["aside", "complementary"],
  ["form", "form"],
  ["img", "img"],
  ["ul", "list"],
  ["ol", "list"],
  ["li", "listitem"],
  ["table", "table"],
  ["h1,h2,h3,h4,h5,h6", "heading"],
];

const FOCUSABLE_SELECTOR =
  "a[href], button, input:not([type='hidden']), select, textarea, [tabindex]";

export const ariaRules: AuditRule[] = [
  {
    id: "aria.role-valid",
    name: "role values must be valid ARIA roles",
    conformance: "ARIA",
    severity: "SERIOUS",
    role: "developer",
    elementType: "aria",
    wcag: "4.1.2 Name, Role, Value",
    helpUrl: "https://www.w3.org/TR/wai-aria-1.2/#role_definitions",
    impact:
      "An invalid role is ignored by assistive technology, so the element loses its intended semantics entirely.",
    fixHint: `Use a role from the ARIA specification: role="navigation", role="button", role="dialog"…`,
    check(ctx) {
      const nodes = ctx
        .$("[role]")
        .toArray()
        .filter((el) => {
          const tokens = (ctx.$(el).attr("role") ?? "").trim().toLowerCase().split(/\s+/);
          return tokens.length > 0 && !tokens.some((t) => VALID_ROLES.has(t));
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(nodes.length, "element with an invalid role", "elements with invalid roles"),
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
  {
    id: "aria.attr-valid",
    name: "aria-* attributes must exist in the ARIA spec",
    conformance: "ARIA",
    severity: "MODERATE",
    role: "developer",
    elementType: "aria",
    wcag: "4.1.2 Name, Role, Value",
    helpUrl: "https://www.w3.org/TR/wai-aria-1.2/#state_prop_def",
    impact: "Misspelled ARIA attributes silently do nothing, leaving the intended semantics missing.",
    fixHint: `Check spelling against the spec: aria-labeledby → aria-labelledby.`,
    check(ctx) {
      const bad = new Map<string, number>();
      ctx.$("*").each((_, el) => {
        if (el.type !== "tag") return;
        for (const name of Object.keys(el.attribs ?? {})) {
          if (name.startsWith("aria-") && !VALID_ARIA_ATTRS.has(name)) {
            bad.set(name, (bad.get(name) ?? 0) + 1);
          }
        }
      });
      if (bad.size === 0) return [];
      return [
        {
          message: `Unknown ARIA attribute${bad.size === 1 ? "" : "s"}: ${[...bad.keys()].slice(0, 5).join(", ")}`,
          evidence: { attributes: [...bad.entries()].map(([k, n]) => `${k} ×${n}`) },
        },
      ];
    },
  },
  {
    id: "aria.hidden-focusable",
    name: "aria-hidden elements must not be focusable",
    conformance: "ARIA",
    severity: "SERIOUS",
    role: "developer",
    elementType: "aria",
    wcag: "4.1.2 Name, Role, Value",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
    impact:
      "Keyboard focus lands on an element that screen readers treat as non-existent — the user is focused on “nothing”.",
    fixHint: `Add tabindex="-1" (or remove aria-hidden) so hidden content can't receive focus.`,
    check(ctx) {
      const nodes = ctx
        .$("[aria-hidden='true']")
        .toArray()
        .filter((el) => {
          const $el = ctx.$(el);
          const selfFocusable = $el.is(FOCUSABLE_SELECTOR) && $el.attr("tabindex") !== "-1";
          const focusableChild = $el
            .find(FOCUSABLE_SELECTOR)
            .toArray()
            .some((child) => ctx.$(child).attr("tabindex") !== "-1");
          return selfFocusable || focusableChild;
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(
            nodes.length,
            "aria-hidden element that is still focusable",
            "aria-hidden elements that are still focusable"
          ),
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
  {
    id: "aria.redundant-role",
    name: "Avoid redundant roles on native elements",
    conformance: "ARIA",
    severity: "MINOR",
    role: "developer",
    elementType: "aria",
    helpUrl: "https://www.w3.org/TR/using-aria/#firstrule",
    impact: "Harmless but noisy — the native element already exposes this role.",
    fixHint: `Remove the role attribute: <button role="button"> → <button>.`,
    check(ctx) {
      const nodes = REDUNDANT_ROLE.flatMap(([selector, role]) =>
        ctx
          .$(selector)
          .toArray()
          .filter((el) => (ctx.$(el).attr("role") ?? "").trim().toLowerCase() === role)
      );
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(nodes.length, "element with a redundant role", "elements with redundant roles"),
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
  {
    id: "aria.landmark-unique",
    name: "Landmarks must be unique or labelled",
    conformance: "ARIA",
    severity: "MODERATE",
    role: "developer",
    elementType: "aria",
    wcag: "1.3.1 Info and Relationships",
    helpUrl: "https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/",
    impact:
      "Screen-reader users navigating by landmark hear several identical “navigation” regions and cannot tell them apart.",
    fixHint: `Label repeated landmarks: <nav aria-label="Primary">…</nav> <nav aria-label="Footer">…</nav>. Keep a single <main>.`,
    check(ctx) {
      const issues = [];
      const mains = ctx.$("main, [role='main']").toArray();
      if (mains.length > 1) {
        issues.push({
          message: `${mains.length} main landmarks found (there must be exactly one)`,
          evidence: { samples: sampleSnippets(ctx.$, mains) },
        });
      }
      const navs = ctx.$("nav, [role='navigation']").toArray();
      const unlabelled = navs.filter((el) => {
        const $el = ctx.$(el);
        return !($el.attr("aria-label") ?? "").trim() && !($el.attr("aria-labelledby") ?? "").trim();
      });
      if (navs.length > 1 && unlabelled.length > 0) {
        issues.push({
          message: `${navs.length} navigation landmarks, ${unlabelled.length} without a distinguishing label`,
          evidence: { samples: sampleSnippets(ctx.$, unlabelled) },
        });
      }
      return issues;
    },
  },
  {
    id: "aria.required-children",
    name: "Composite roles must contain their required children",
    conformance: "ARIA",
    severity: "SERIOUS",
    role: "developer",
    elementType: "aria",
    wcag: "1.3.1 Info and Relationships",
    helpUrl: "https://www.w3.org/TR/wai-aria-1.2/#mustContain",
    impact:
      "A tablist without tabs (or list without listitems) is announced as an empty widget, hiding its contents.",
    fixHint: `Give children the matching role: <div role="list"><div role="listitem">…</div></div>.`,
    check(ctx) {
      const nodes = ctx
        .$("[role]")
        .toArray()
        .filter((el) => {
          const role = (ctx.$(el).attr("role") ?? "").trim().toLowerCase();
          const required = REQUIRED_CHILDREN[role];
          if (!required) return false;
          const $el = ctx.$(el);
          const hasRequiredRole = required.some((r) => $el.find(`[role='${r}']`).length > 0);
          // native li inside role=list still maps to listitem
          const hasNativeEquivalent = role === "list" && $el.find("li").length > 0;
          return !hasRequiredRole && !hasNativeEquivalent;
        });
      if (nodes.length === 0) return [];
      return [
        {
          message: countMessage(
            nodes.length,
            "composite role missing its required children",
            "composite roles missing their required children"
          ),
          evidence: { samples: sampleSnippets(ctx.$, nodes) },
        },
      ];
    },
  },
];
