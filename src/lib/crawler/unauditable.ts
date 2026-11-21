import * as cheerio from "cheerio";

// Markers from common bot-protection interstitials (Akamai Bot Manager, Cloudflare,
// Imperva/Incapsula, PerimeterX, DataDome). Matched case-insensitively against the raw HTML.
const CHALLENGE_MARKERS = [
  "bm-verify",
  "cp_challenge",
  "/akam/",
  "incapsula",
  "cf-browser-verification",
  "cf_chl_",
  "px-captcha",
  "perimeterx",
  "datadome",
  "distil_r_captcha",
];

const MIN_VISIBLE_WORDS = 15;
const MIN_SHELL_SCRIPTS = 3;

export function hasChallengeMarkers(html: string): boolean {
  const lower = html.toLowerCase();
  return CHALLENGE_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * True when a 200 response carries no auditable content — a bot-protection interstitial or a
 * JavaScript-only shell that renders client-side. Auditing such a body fires a false finding for
 * nearly every metadata rule at once (no title, no h1, no meta description, no viewport…), so
 * callers must treat the page as blocked instead of running rules against it.
 */
export function isUnauditableShell(html: string): boolean {
  const $ = cheerio.load(html);
  const body = $("body").clone();
  body.find("script, style, noscript, template, iframe").remove();
  const words = body.text().split(/\s+/).filter(Boolean).length;
  if (words >= MIN_VISIBLE_WORDS) return false;

  if (hasChallengeMarkers(html)) return true;

  // No known marker, but the document is script-heavy with essentially no visible text —
  // a client-rendered shell the fast (no-JS) tier cannot see into.
  return $("script").length >= MIN_SHELL_SCRIPTS;
}
