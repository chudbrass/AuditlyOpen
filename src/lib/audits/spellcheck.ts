/**
 * Lazily-initialized spellcheckers (hunspell dictionaries via nspell), one per supported
 * language. The worker calls ensureSpellchecker() once before running page rules; the
 * spelling rule itself only reads the singletons, so importing the rule registry (e.g. from
 * the dashboard's /rules page) never loads the multi-MB dictionaries or touches the filesystem.
 *
 * To add a language: npm install dictionary-<code>, add a loader entry + custom-word list.
 */

interface Spellchecker {
  correct(word: string): boolean;
}

const checkers = new Map<string, Spellchecker>();
let loading: Promise<void> | null = null;

// Dictionary imports read multi-MB files. Bound the shared load so a stalled filesystem
// does not block every in-flight crawl page. Spelling checks skip unloaded dictionaries.
const DICTIONARY_LOAD_TIMEOUT_MS = 30_000;

/** Language for a page's `lang` attribute, or null when we have no dictionary for it. */
export function getSpellchecker(lang: string): Spellchecker | null {
  const primary = lang.toLowerCase().split(/[-_]/)[0];
  return checkers.get(primary) ?? null;
}

export const SUPPORTED_SPELLCHECK_LANGUAGES = ["en", "fr"] as const;

export function ensureSpellchecker(): Promise<void> {
  loading ??= (async () => {
    const [{ default: nspell }, { default: en }, { default: fr }] = await Promise.all([
      import("nspell"),
      import("dictionary-en"),
      import("dictionary-fr"),
    ]);

    const enChecker = nspell(en);
    for (const word of CUSTOM_WORDS_EN) enChecker.add(word);
    checkers.set("en", enChecker);

    const frChecker = nspell(fr);
    for (const word of CUSTOM_WORDS_FR) frChecker.add(word);
    checkers.set("fr", frChecker);
  })().catch(() => {
    // Dictionaries failed to load — the spelling rule silently no-ops rather than aborting scans.
    loading = null;
  });

  // Race a timeout alongside the shared load, without replacing `loading` itself — a slow (not
  // dead) load already in flight should still get to finish and populate `checkers` for
  // whoever calls next, even if this particular caller stopped waiting on it.
  return Promise.race([
    loading,
    new Promise<void>((resolve) => setTimeout(resolve, DICTIONARY_LOAD_TIMEOUT_MS)),
  ]);
}

// Web/brand vocabulary the stock dictionaries lack — every entry here avoids a false positive.
const CUSTOM_WORDS_EN = [
  "admin", "app", "apps", "auth", "backend", "blog", "blogs", "checkbox", "checkout",
  "config", "cybersecurity", "dashboard", "dropdown", "ebook", "ecommerce", "email",
  "emails", "favicon", "fintech", "frontend", "geolocation", "hoodie", "hoodies",
  "homepage", "internet", "login", "logout", "lifecycle", "metadata", "nav", "newsletter",
  "onboarding", "online", "opt", "permalink", "podcast", "podcasts", "popup", "pricing",
  "roadmap", "signup", "sitemap", "smartphone", "smartphones", "startup", "startups",
  "subpage", "subpages", "timezone", "username", "wifi", "workflow", "workflows",
];

const CUSTOM_WORDS_FR = [
  "app", "apps", "blog", "blogs", "chatbot", "checkout", "cookie", "cookies", "dashboard",
  "ebook", "email", "emails", "favicon", "internet", "livraison", "login", "newsletter",
  "podcast", "podcasts", "popup", "smartphone", "smartphones", "startup", "startups",
  "webinaire", "webinaires", "wifi",
];
