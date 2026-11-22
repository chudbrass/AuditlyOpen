import { Agent, request as undiciRequest } from "undici";
import { getCACertificates } from "node:tls";
import { sleep } from "./rateLimit";
import { isRequestUrlAllowed, isSameSiteDomain } from "./urlFilters";
import { assertHttpUrl, createPinnedLookup, resolveVettedAddress } from "@/lib/network/egressPolicy";

export const USER_AGENT = "AuditlyBot/1.0 (+https://your-host/about)";

async function currentUserAgent(): Promise<string> {
  const { getGlobalSettings } = await import("@/lib/settings");
  return (await getGlobalSettings()).userAgent;
}

/**
 * Statuses that usually mean "try again in a moment" (rate limiting, overloaded origin,
 * bot-shield hiccups) rather than a genuinely broken URL. Callers retry these with backoff
 * before recording a result — without this, a burst of 502/429s during a crawl shows up as
 * hundreds of phantom broken pages/links.
 */
export const TRANSIENT_HTTP_STATUSES = new Set([429, 502, 503, 504]);

// undici's defaults (300s headers/body timeouts, unbounded body) let one slow-drip or
// oversized page pin a crawl slot for minutes and balloon memory. Everything the crawler
// fetches goes through these agents, so the bounds apply to pages, robots.txt, sitemaps,
// and link checks alike.
const HEADERS_TIMEOUT_MS = 20_000;
const BODY_IDLE_TIMEOUT_MS = 20_000;
const BODY_READ_DEADLINE_MS = 30_000;
const MAX_BODY_BYTES = (() => {
  const parsed = Number(process.env.AUDITLY_MAX_BODY_MB);
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  return Math.round(mb * 1024 * 1024);
})();

const timeoutOptions = {
  headersTimeout: HEADERS_TIMEOUT_MS,
  bodyTimeout: BODY_IDLE_TIMEOUT_MS,
  connect: { timeout: 10_000 },
} as const;
const MAX_REDIRECTS = 5;

// Node's bundled roots do not cover every chain trusted by the host OS (Bell.ca is one
// real example on Windows). Use the union for crawler traffic: verification remains fully
// enabled, while matching the trust store used by the browser and other system clients.
const TRUSTED_CA_CERTIFICATES = [
  ...new Set([...getCACertificates("default"), ...getCACertificates("system")]),
];

/**
 * Read a response body with both a size cap and an overall deadline. The idle bodyTimeout on
 * the agent only fires between chunks — a server drip-feeding one byte per second would
 * otherwise hold the read forever. Oversized bodies are truncated rather than failed: a
 * >MAX_BODY_BYTES HTML page is pathological, and a truncated parse beats a stalled scan.
 */
async function readBodyBounded(body: {
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
  destroy(err?: Error): unknown;
}): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  const deadline = setTimeout(() => {
    body.destroy(new Error(`Body read exceeded ${BODY_READ_DEADLINE_MS}ms`));
  }, BODY_READ_DEADLINE_MS);
  try {
    for await (const chunk of body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buf.length;
      chunks.push(buf);
      if (total >= MAX_BODY_BYTES) break; // exiting the loop destroys the stream
    }
  } finally {
    clearTimeout(deadline);
  }
  return Buffer.concat(chunks);
}

async function securedRequest(url: string, options: Parameters<typeof undiciRequest>[1]) {
  const parsed = assertHttpUrl(url);
  const vetted = await resolveVettedAddress(parsed.hostname);
  const dispatcher = new Agent({
    ...timeoutOptions,
    connect: {
      ...timeoutOptions.connect,
      ca: TRUSTED_CA_CERTIFICATES,
      lookup: createPinnedLookup(vetted),
    },
  });
  try {
    return { response: await undiciRequest(url, { ...options, dispatcher }), dispatcher };
  } catch (error) {
    await dispatcher.close();
    throw error;
  }
}

// node:dns's lookup() goes through libuv's threadpool (getaddrinfo), which defaults to just 4
// threads shared by every threadpool-bound op in the process — and unlike every other network
// call in this file, it has no built-in timeout. Observed live: with hundreds of concurrent
// external-link checks across several large scans, one slow-to-resolve or unresponsive DNS
// server was enough to occupy a thread indefinitely; once all 4 filled up the same way, every
// further lookup (and thus every fetch, since this guard runs before each one) queued forever —
// freezing the entire crawl.page queue with no error, no timeout, nothing to recover from short
// of restarting the process. A cache (most external links repeat across pages/scans) cuts the
// number of lookups drastically, and a timeout guarantees our side stops waiting even if the
// underlying OS call never returns.
export async function assertSafeRequestUrl(url: string): Promise<void> {
  if (!isRequestUrlAllowed(url)) throw new Error("Blocked unsafe request URL");
  await resolveVettedAddress(assertHttpUrl(url).hostname);
}

async function requestFollowingRedirects(
  initialUrl: string,
  options: Parameters<typeof undiciRequest>[1],
  allowInsecureTls: boolean,
  scopeRootUrl?: string,
  allowRedirect?: (url: string) => Promise<boolean>,
  headersForUrl?: (url: string) => Record<string, string>
) {
  let url = initialUrl;
  for (let redirects = 0; ; redirects++) {
    if (scopeRootUrl && !isSameSiteDomain(url, scopeRootUrl)) {
      throw new Error("Blocked redirect outside the configured hostname");
    }
    if (!isRequestUrlAllowed(url)) throw new Error("Blocked unsafe request URL");
    const { response, dispatcher } = await securedRequest(url, headersForUrl
      ? { ...options, headers: { ...options?.headers, ...headersForUrl(url) } }
      : options);
    const location = response.headers.location;
    if (
      response.statusCode >= 300 &&
      response.statusCode < 400 &&
      typeof location === "string"
    ) {
      await response.body.dump();
      await dispatcher.close();
      if (redirects >= MAX_REDIRECTS) throw new Error("Too many redirects");
      const destination = new URL(location, url);
      destination.hash = "";
      url = destination.toString();
      if (allowRedirect && !(await allowRedirect(url))) {
        throw new Error("Redirect destination excluded by crawl settings or robots.txt");
      }
      continue;
    }
    return { response, url, dispatcher };
  }
}

async function withVerifiedTls<T>(
  action: (allowInsecureTls: boolean) => Promise<T>
): Promise<T> {
  return action(false);
}

export interface FetchedPage {
  httpStatus: number | null;
  body: string | null;
  contentType: string | null;
  /** Response headers, lower-cased keys, multi-value headers joined with ", ". */
  headers: Record<string, string>;
  error: string | null;
  /** Final URL after same-site redirects. */
  finalUrl: string;
}

function normalizeHeaders(
  raw: Record<string, string | string[] | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const name = key.toLowerCase();
    // Set-Cookie values legally contain ", " (Expires dates) — join with \n so rules can
    // split individual cookies back apart.
    const joiner = name === "set-cookie" ? "\n" : ", ";
    out[name] = Array.isArray(value) ? value.join(joiner) : value;
  }
  return out;
}

export async function fetchPage(
  url: string,
  scopeRootUrl?: string,
  signal?: AbortSignal,
  allowRedirect?: (url: string) => Promise<boolean>,
  headersForUrl?: (url: string) => Record<string, string>
): Promise<FetchedPage> {
  try {
    const userAgent = await currentUserAgent();
    const { response: res, url: finalUrl, dispatcher } = await withVerifiedTls((allowInsecureTls) =>
      requestFollowingRedirects(
        url,
        {
          method: "GET",
          headers: { "User-Agent": userAgent },
          signal,
        },
        allowInsecureTls,
        scopeRootUrl,
        allowRedirect,
        headersForUrl
      )
    );
    const contentType = res.headers["content-type"];
    const isHtml =
      typeof contentType === "string" ? contentType.includes("text/html") : true;
    const body = isHtml
      ? (await readBodyBounded(res.body)).toString("utf-8")
      : (await res.body.dump(), null);
    await dispatcher.close();
    return {
      httpStatus: res.statusCode,
      body,
      contentType: typeof contentType === "string" ? contentType : null,
      headers: normalizeHeaders(res.headers),
      error: null,
      finalUrl,
    };
  } catch (err) {
    return {
      httpStatus: null,
      body: null,
      contentType: null,
      headers: {},
      error: err instanceof Error ? err.message : String(err),
      finalUrl: url,
    };
  }
}

// robots.txt / sitemap fetches: a transient 429/5xx here silently shrinks the seed set for the
// whole scan, so retry before giving up (page fetches retry at the crawlPage level instead).
export async function fetchText(
  url: string,
  scopeRootUrl?: string,
  signal?: AbortSignal
): Promise<{ body: string | null; error: string | null }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const userAgent = await currentUserAgent();
      const { response: res, dispatcher } = await withVerifiedTls((allowInsecureTls) =>
        requestFollowingRedirects(
          url,
          {
            method: "GET",
            headers: { "User-Agent": userAgent },
            signal,
          },
          allowInsecureTls,
          scopeRootUrl
        )
      );
      if (res.statusCode >= 400) {
        await res.body.dump();
        await dispatcher.close();
        if (TRANSIENT_HTTP_STATUSES.has(res.statusCode) && attempt <= 2) {
          await sleep(1200 * attempt);
          continue;
        }
        return { body: null, error: `HTTP ${res.statusCode}` };
      }
      const body = (await readBodyBounded(res.body)).toString("utf-8");
      await dispatcher.close();
      return { body, error: null };
    } catch (err) {
      return { body: null, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export async function fetchBuffer(
  url: string,
  scopeRootUrl?: string,
  signal?: AbortSignal
): Promise<{ buffer: Buffer | null; error: string | null }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const userAgent = await currentUserAgent();
      const { response: res, dispatcher } = await withVerifiedTls((allowInsecureTls) =>
        requestFollowingRedirects(
          url,
          {
            method: "GET",
            headers: { "User-Agent": userAgent },
            signal,
          },
          allowInsecureTls,
          scopeRootUrl
        )
      );
      if (res.statusCode >= 400) {
        await res.body.dump();
        await dispatcher.close();
        if (TRANSIENT_HTTP_STATUSES.has(res.statusCode) && attempt <= 2) {
          await sleep(1200 * attempt);
          continue;
        }
        return { buffer: null, error: `HTTP ${res.statusCode}` };
      }
      const buffer = await readBodyBounded(res.body);
      await dispatcher.close();
      return { buffer, error: null };
    } catch (err) {
      return { buffer: null, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

const CHECK_TIMEOUT_MS = 10_000;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function requestStatus(
  url: string,
  method: "HEAD" | "GET",
  signal?: AbortSignal,
  headersForUrl?: (url: string) => Record<string, string>
): Promise<{ httpStatus: number; error: null }> {
  const userAgent = await currentUserAgent();
  const { response: res, dispatcher } = await withVerifiedTls((allowInsecureTls) =>
    requestFollowingRedirects(
      url,
      {
        method,
        headers: { "User-Agent": userAgent },
        headersTimeout: CHECK_TIMEOUT_MS,
        bodyTimeout: CHECK_TIMEOUT_MS,
        signal,
      },
      allowInsecureTls,
      undefined,
      undefined,
      headersForUrl
    )
  );
  await res.body.dump();
  await dispatcher.close();
  return { httpStatus: res.statusCode, error: null };
}

/**
 * Resolve a URL's final status for link checking (not content) — tries HEAD first since it's
 * cheaper, falls back to GET for servers that reject/mishandle HEAD (405/501 or an outright error).
 */
export async function checkUrlStatus(
  url: string,
  signal?: AbortSignal,
  headersForUrl?: (url: string) => Record<string, string>
): Promise<{ httpStatus: number | null; error: string | null }> {
  try {
    const headResult = await requestStatus(url, "HEAD", signal, headersForUrl);
    // Many servers mishandle HEAD — not just 405/501, some return 404/403 for URLs that GET
    // just fine. Confirm any non-OK HEAD with a GET before reporting the failure.
    if (headResult.httpStatus >= 400) {
      try {
        return await requestStatus(url, "GET", signal, headersForUrl);
      } catch {
        return headResult;
      }
    }
    return headResult;
  } catch {
    try {
      return await requestStatus(url, "GET", signal, headersForUrl);
    } catch (err) {
      return { httpStatus: null, error: errorMessage(err) };
    }
  }
}
