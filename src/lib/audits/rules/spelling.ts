import { AuditRule } from "./types";
import { getSpellchecker } from "../spellcheck";

// Bound the work per page: long pages are sampled, not exhaustively spell-checked.
const MAX_WORDS_PER_PAGE = 4000;
const MAX_REPORTED = 15;
// Only flag words the dictionary is likely to be right about: all-lowercase (or single
// leading capital), letters + optional apostrophe, reasonably long. \p{L}/\p{Ll} keep
// accented characters (é, ç, œ…) inside a word instead of splitting it — essential for French.
const WORD_PATTERN = /(?<![\p{L}'’])[\p{L}][\p{Ll}]{3,}(?:['’][\p{Ll}]{1,4})?(?![\p{L}'’])/gu;
const HAS_UPPER_AFTER_FIRST = /^.\p{Lu}/u;

/** Elements whose text is code, boilerplate, or user input — never prose to spell-check. */
const SKIP_SELECTOR = "script, style, noscript, code, pre, kbd, samp, textarea, [translate='no'], [spellcheck='false'], address";

export const spellingRules: AuditRule[] = [
  {
    id: "qa.misspellings",
    name: "Page copy should be free of misspellings",
    conformance: "QA",
    severity: "MINOR",
    role: "author",
    elementType: "content",
    helpUrl: "https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/lang",
    impact:
      "Typos read as carelessness and erode trust in the content — and misspelled keywords are invisible to search. Runs on pages declaring lang en or fr.",
    fixHint:
      "Fix the listed words in the CMS. False positive (brand name, jargon)? That's a hint the term may confuse visitors too — consider a glossary.",
    check(ctx) {
      if (!ctx.siteConfig.spellcheckEnabled) return [];
      // Dictionary keyed by the page's declared language (en/fr today); pages in other
      // languages — or before the worker loads dictionaries — are skipped.
      const lang = (ctx.$("html").attr("lang") ?? "en").trim().toLowerCase();
      const spell = getSpellchecker(lang);
      if (!spell) return [];
      const allowedWords = new Set(ctx.siteConfig.allowedSpellingWords.map((word) => word.toLocaleLowerCase(lang)));

      const $body = ctx.$("body").clone();
      $body.find(SKIP_SELECTOR).remove();
      const text = $body.text();

      const counts = new Map<string, number>();
      let checked = 0;
      for (const match of text.matchAll(WORD_PATTERN)) {
        if (++checked > MAX_WORDS_PER_PAGE) break;
        const word = match[0];
        // Skip CamelCase/mid-caps (product names) and anything the dictionary accepts in
        // original or lower case (sentence-initial capitals).
        if (HAS_UPPER_AFTER_FIRST.test(word)) continue;
        if (spell.correct(word) || spell.correct(word.toLowerCase())) continue;
        const key = word.toLowerCase();
        if (allowedWords.has(key)) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (counts.size === 0) return [];

      const top = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_REPORTED)
        .map(([word, count]) => (count > 1 ? `${word} (×${count})` : word));

      return [
        {
          message: `${counts.size} potential misspelling${counts.size === 1 ? "" : "s"}: ${top.join(", ")}`,
          evidence: {
            uniqueWords: counts.size,
            words: top,
            wordCounts: [...counts.entries()].map(([word, count]) => ({ word, count })),
            heuristic: true,
          },
        },
      ];
    },
  },
];
