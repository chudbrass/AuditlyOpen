import { gunzipSync } from "node:zlib";
import * as cheerio from "cheerio";
import { fetchBuffer } from "./fetchPage";
import { isSameSiteDomain, isRequestUrlAllowed, normalizeUrl } from "./urlFilters";

const MAX_SITEMAP_DEPTH = 3;
// Hard bounds so a huge sitemap index (tens of thousands of child sitemaps) can't turn scan
// startup into hours of fetching — seeds are capped by the site's maxPages anyway.
const MAX_SITEMAP_FETCHES = 50;
const MAX_SITEMAP_URLS = 20_000;
export const MAX_SITEMAP_OUTPUT_BYTES = 10 * 1024 * 1024;

export function decodeSitemap(buffer: Buffer, isGzip: boolean): string | null {
  try {
    const output = isGzip
      ? gunzipSync(buffer, { maxOutputLength: MAX_SITEMAP_OUTPUT_BYTES })
      : buffer.subarray(0, MAX_SITEMAP_OUTPUT_BYTES + 1);
    if (output.length > MAX_SITEMAP_OUTPUT_BYTES) return null;
    return output.toString("utf-8");
  } catch {
    return null;
  }
}

async function fetchSitemapXml(url: string, rootUrl: string): Promise<string | null> {
  const { buffer, error } = await fetchBuffer(url, rootUrl);
  if (error || !buffer) return null;

  const isGzip = url.endsWith(".gz") || (buffer[0] === 0x1f && buffer[1] === 0x8b);
  return decodeSitemap(buffer, isGzip);
}

async function collectSitemapUrls(
  url: string,
  rootUrl: string,
  visited: Set<string>,
  depth: number
): Promise<string[]> {
  if (
    depth > MAX_SITEMAP_DEPTH ||
    visited.size >= MAX_SITEMAP_FETCHES ||
    visited.has(url) ||
    !isSameSiteDomain(url, rootUrl) ||
    !isRequestUrlAllowed(url)
  ) {
    return [];
  }
  visited.add(url);

  const xml = await fetchSitemapXml(url, rootUrl);
  if (!xml) return [];

  const $ = cheerio.load(xml, { xmlMode: true });

  const nestedSitemaps = $("sitemapindex > sitemap > loc")
    .map((_, el) => normalizeUrl($(el).text().trim(), url))
    .get()
    .filter((candidate): candidate is string => Boolean(candidate));

  if (nestedSitemaps.length > 0) {
    // Sequential (not Promise.all): child fetches share the `visited` budget, and fetching
    // dozens of nested sitemaps concurrently would hammer the origin at scan start.
    const nested: string[] = [];
    for (const loc of nestedSitemaps) {
      nested.push(...(await collectSitemapUrls(loc, rootUrl, visited, depth + 1)));
      if (nested.length >= MAX_SITEMAP_URLS) break;
    }
    return nested.slice(0, MAX_SITEMAP_URLS);
  }

  return $("urlset > url > loc")
    .map((_, el) => normalizeUrl($(el).text().trim(), url))
    .get()
    .filter(
      (candidate): candidate is string =>
        candidate !== null && isSameSiteDomain(candidate, rootUrl) && isRequestUrlAllowed(candidate)
    );
}

export async function discoverSitemapUrls(
  rootUrl: string,
  robotsSitemaps: string[]
): Promise<string[]> {
  const origin = new URL(rootUrl).origin;
  const candidates = (robotsSitemaps.length > 0 ? robotsSitemaps : [`${origin}/sitemap.xml`])
    .map((candidate) => normalizeUrl(candidate, rootUrl))
    .filter(
      (candidate): candidate is string =>
        candidate !== null && isSameSiteDomain(candidate, rootUrl) && isRequestUrlAllowed(candidate)
    );

  const visited = new Set<string>();
  const results: string[] = [];
  for (const sitemapUrl of candidates) {
    results.push(...(await collectSitemapUrls(sitemapUrl, rootUrl, visited, 0)));
    if (results.length >= MAX_SITEMAP_URLS) break;
  }

  return [...new Set(results)].slice(0, MAX_SITEMAP_URLS);
}
