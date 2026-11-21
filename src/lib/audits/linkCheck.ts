import { checkUrlStatus, TRANSIENT_HTTP_STATUSES } from "@/lib/crawler/fetchPage";
import { acquireHostSlot, sleep } from "@/lib/crawler/rateLimit";
import { provinceHeaders } from "@/lib/crawler/localization";
import { isSameSiteDomain } from "@/lib/crawler/urlFilters";

export interface LinkCheckResult {
  httpStatus: number | null;
  broken: boolean;
  error: string | null;
}

const NOT_BROKEN_STATUSES = new Set([401, 403, 429]);

// Per-scan, per-target cache so a link referenced from many pages is only checked once.
// Module-scoped (not DB-backed): good enough for a single worker process's lifetime.
const cache = new Map<string, Promise<LinkCheckResult>>();

function cacheKey(scanId: string, url: string): string {
  return `${scanId}::${url}`;
}

// Status probes are cheap HEAD/GETs — space them at most this far apart even when the host's
// robots.txt declares a large Crawl-delay, so one link-heavy page can't take many minutes.
const LINK_PROBE_MAX_INTERVAL_MS = 2_000;

export function checkLinkOnce(
  scanId: string,
  url: string,
  _signal?: AbortSignal,
  context?: { rootUrl: string; province: string }
): Promise<LinkCheckResult> {
  void _signal;
  const key = cacheKey(scanId, context ? JSON.stringify([url, context.province]) : url);
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      const headersForUrl = context && ((target: string) => isSameSiteDomain(target, context.rootUrl)
        ? provinceHeaders(context.rootUrl, target, context.province)
        : {});
      let host: string;
      try {
        host = new URL(url).host;
      } catch {
        return { httpStatus: null, broken: true, error: "Invalid URL" };
      }
      let release = await acquireHostSlot(host, LINK_PROBE_MAX_INTERVAL_MS);
      let response;
      // The network probe is shared by every source page that references this target. Tying it
      // to the first page's AbortSignal made the cache unsafe, so the old code skipped caching
      // whenever a signal existed—which is every crawl—and rechecked global nav/footer links
      // hundreds of times. HTTP calls already have strict connect/header/body deadlines.
      try { response = await checkUrlStatus(url, undefined, headersForUrl); } finally { release(); }
      let { httpStatus, error } = response;
      // Retry transient statuses (rate limiting / flaky origin) before calling a link broken.
      for (
        let attempt = 1;
        attempt <= 2 && httpStatus !== null && TRANSIENT_HTTP_STATUSES.has(httpStatus);
        attempt++
      ) {
        await sleep(1200 * attempt);
        release = await acquireHostSlot(host, LINK_PROBE_MAX_INTERVAL_MS);
        try { ({ httpStatus, error } = await checkUrlStatus(url, undefined, headersForUrl)); } finally { release(); }
      }
      // Statuses that reflect how the target treats *our bot*, not real visitors: 429 is
      // rate limiting, and 401/403 are auth walls or bot protection refusing the crawler.
      // None of them prove the link is broken for a person in a browser.
      const broken =
        error !== null ||
        httpStatus === null ||
        (httpStatus >= 400 && !NOT_BROKEN_STATUSES.has(httpStatus));
      return { httpStatus, broken, error };
    })();
    cache.set(key, pending);
  }
  return pending;
}

export function clearScanLinkCache(scanId: string): void {
  const prefix = `${scanId}::`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

/**
 * Drop cache entries for every scan not in the active set. Finalize clears its own scan, but
 * cancelled/failed/abandoned scans never reach finalize — without this sweep their entries
 * live for the whole worker process lifetime.
 */
export function pruneScanLinkCache(activeScanIds: ReadonlySet<string>): void {
  for (const key of cache.keys()) {
    const scanId = key.slice(0, key.indexOf("::"));
    if (!activeScanIds.has(scanId)) cache.delete(key);
  }
}
