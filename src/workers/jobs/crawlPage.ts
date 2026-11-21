import { findTextMatches } from "@/lib/crawler/textSearch";
import { prisma } from "@/lib/db";
import { Page, Prisma, Scan, Site } from "@prisma/client";
import * as cheerio from "cheerio";
import { enqueue, enqueueBulk } from "@/lib/queue";
import { fetchPage, USER_AGENT, TRANSIENT_HTTP_STATUSES } from "@/lib/crawler/fetchPage";
import { declaredProvince, parseHtml, ParsedPage } from "@/lib/crawler/extractLinks";
import { getRobots } from "@/lib/crawler/robots";
import { acquireHostSlot, sleep, waitForHostSlot } from "@/lib/crawler/rateLimit";
import { isSameSiteDomain, isUrlAllowed, normalizeUrl } from "@/lib/crawler/urlFilters";
import { urlIdentity } from "@/lib/crawler/urlIdentity";
import { crawlBrand, declaredLanguage, pageVariantIdentity, provinceFallbackUrl, provinceHeaders } from "@/lib/crawler/localization";
import { siteProvinces } from "@/lib/crawler/brand";
import { hasChallengeMarkers, isUnauditableShell } from "@/lib/crawler/unauditable";
import { renderPage } from "@/lib/crawler/renderPage";
import { checkLinkOnce, clearScanLinkCache } from "@/lib/audits/linkCheck";
import {
  clearScanPageCountCache,
} from "@/lib/scan/pageCountCache";
import { runRules, SITE_SCOPED_RULE_IDS } from "@/lib/audits/rules";
import { ensureSpellchecker } from "@/lib/audits/spellcheck";
import { QUEUE_CRAWL_PAGE, QUEUE_SCAN_FINALIZE, CrawlPagePayload } from "./queues";
import { randomUUID } from "node:crypto";
import { injectCrash } from "@/lib/scan/crashInjection";

// A page with thousands of outbound links (mega-footers, HTML sitemaps) would otherwise
// dominate the scan; check a bounded set, internal links first since those are the ones we
// report as SERIOUS.
const MAX_LINK_TARGETS_PER_PAGE = 200;
const LINK_CHECK_CONCURRENCY = 5;

// crawl.page runs as one batch per poll (Promise.all over up to CRAWL_BATCH_SIZE jobs) — pg-boss
// doesn't fetch the next batch until every job in the current one settles. Every individual
// operation inside crawlClaimedPage already has its own timeout, but that guarantee is only as
// good as the last person to touch this file remembering to add one to whatever they touch next
// — and one gap (observed live: dictionary loading with no timeout at all) is enough to wedge
// the entire crawl.page queue indefinitely, for every scan, until the process is restarted. This
// is the backstop: no single page, for any reason, blocks the batch past this ceiling.
const PAGE_JOB_TIMEOUT_MS = 5 * 60_000;

export async function enqueueCrawlPage(scanId: string, pageId: string): Promise<void> {
  // Random priority shuffles the global fetch order. crawl.page is one shared queue ordered
  // by (priority DESC, createdOn); without this, the nightly all-sites run seeds each site's
  // thousands of jobs back-to-back and sites crawl *serially* — throughput collapses to one
  // host's politeness rate and later sites sit idle for hours. Shuffled, every fetched batch
  // mixes hosts, so concurrent site scans genuinely run in parallel. Page order within a
  // scan is irrelevant to results.
  const priority = Math.floor(Math.random() * 1_000_000);
  await enqueue(
    QUEUE_CRAWL_PAGE,
    { scanId, pageId },
    { singletonKey: pageId, singletonSeconds: 60, priority }
  );
}

/**
 * Bulk enqueue — used for a scan's initial seed set and for each page's newly discovered
 * batch. Sending thousands of jobs one enqueue() at a time serializes on per-call round-trip
 * latency; at 1am, with several large sites seeding concurrently, that was slow and heavy
 * enough to contribute to the DB contention that crashed the worker. Carries the same
 * per-page singletonKey and random-priority interleave as enqueueCrawlPage. Text
 * searches can put homepage variants ahead of the rest of the initial batch.
 */
export async function enqueueCrawlPagesBulk(scanId: string, pageIds: string[], homepageIds?: ReadonlySet<string>): Promise<void> {
  await enqueueBulk(
    QUEUE_CRAWL_PAGE,
    pageIds.map((pageId) => ({
      data: { scanId, pageId },
      options: {
        singletonKey: pageId,
        singletonSeconds: 60,
        priority: homepageIds?.has(pageId) ? 1_000_000 : Math.floor(Math.random() * 1_000_000),
      },
    }))
  );
}

async function enqueueFinalizeIfDone(scanId: string): Promise<void> {
  const remaining = await prisma.page.count({
    where: { scanId, status: { in: ["PENDING", "CRAWLING"] } },
  });
  if (remaining > 0) return;

  // No singleton dedup here: handleScanFinalize is idempotent (checks remaining==0 and scan
  // status itself), and a debounce window can suppress a *later*, actually-correct trigger if
  // an earlier one already consumed the window while pages were still in flight — leaving the
  // scan stuck in CRAWLING with nothing left to wake it up.
  await enqueue(QUEUE_SCAN_FINALIZE, { scanId });
}

/**
 * Stops waiting after `ms` and rejects — but the underlying `run()` call is not cancelled and
 * keeps executing in the background (Node/Prisma/undici have no cooperative cancellation here).
 * A timed-out page's late writes racing the ERROR status set below is an accepted, rare cost;
 * it is strictly better than the alternative of one hung page freezing the entire crawl.page
 * queue for every site indefinitely.
 */
function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, ms: number, message: string): Promise<T> {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { controller.abort(new Error(message)); reject(new Error(message)); }, ms);
    run(controller.signal).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  });
  await Promise.all(lanes);
}

interface PageLinkCounts {
  discovered: number;
  checked: number;
  broken: number;
  internalChecked: number;
  brokenRows: Prisma.LinkCreateManyInput[];
}

/**
 * Checks the page's outbound links and persists ONLY the broken/error ones as Link rows
 * (healthy links were ~97% of Link storage and were never read individually). Totals come
 * back as counters. Broken-link Findings are NOT written here — they're created once per
 * broken target at finalize (see scanFinalize), which also makes watchdog page re-runs a
 * non-issue for findings.
 */
async function checkPageLinks(
  scanId: string,
  page: Page,
  site: Site,
  parsed: ParsedPage,
  signal: AbortSignal
): Promise<PageLinkCounts> {
  const eligibleTargets = [...new Set(parsed.links.map((link) => link.url))]
    .filter((targetUrl) => {
      const isInternal = isSameSiteDomain(targetUrl, site.rootUrl);
      return isInternal || site.checkExternalLinks;
    });
  const uniqueTargets = eligibleTargets.sort((a, b) => {
      const aInternal = isSameSiteDomain(a, site.rootUrl) ? 0 : 1;
      const bInternal = isSameSiteDomain(b, site.rootUrl) ? 0 : 1;
      return aInternal - bInternal;
    })
    .slice(0, MAX_LINK_TARGETS_PER_PAGE);

  const brokenRows: Prisma.LinkCreateManyInput[] = [];
  const counts: PageLinkCounts = { discovered: eligibleTargets.length, checked: 0, broken: 0, internalChecked: 0, brokenRows };

  await mapWithConcurrency(uniqueTargets, LINK_CHECK_CONCURRENCY, async (targetUrl) => {
    const isInternal = isSameSiteDomain(targetUrl, site.rootUrl);
    const result = await checkLinkOnce(scanId, targetUrl, signal, page.requestedProvince
      ? { rootUrl: site.rootUrl, province: page.requestedProvince }
      : undefined);

    counts.checked += 1;
    if (isInternal) counts.internalChecked += 1;
    if (result.broken) {
      counts.broken += 1;
      brokenRows.push({
        scanId,
        sourceUrl: page.url,
        targetUrl,
        isInternal,
        httpStatus: result.httpStatus,
        broken: true,
        error: result.error,
      });
    }
  });

  return counts;
}

/** Reserve frontier slots atomically and return the IDs of newly inserted pages. */
export async function createDiscoveredPages(
  scanId: string,
  urls: string[],
  maxPages: number,
  depth: number,
  provinces: readonly (string | null)[] = [null]
): Promise<string[]> {
  if (urls.length === 0) return [];

  const uniqueUrls = [...new Set(urls)];
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const counts = await tx.page.groupBy({
          by: ["requestedProvince"],
          where: { scanId, status: { not: "REDIRECTED" } },
          _count: { _all: true },
        });
        const existing = await tx.page.findMany({
          where: { scanId, url: { in: uniqueUrls } },
          select: { id: true, url: true, depth: true, requestedProvince: true },
        });
        const shallower = existing.filter((row) => depth < row.depth).map((row) => row.id);
        if (shallower.length > 0) {
          await tx.page.updateMany({ where: { id: { in: shallower }, depth: { gt: depth } }, data: { depth } });
        }
        const newPages = provinces.flatMap((requestedProvince) => {
          const count = counts.find((row) => row.requestedProvince === requestedProvince)?._count._all ?? 0;
          const existingUrls = new Set(existing.filter((row) => row.requestedProvince === requestedProvince).map((row) => row.url));
          return uniqueUrls.filter((url) => !existingUrls.has(url))
            .slice(0, Math.max(0, maxPages - count))
            .map((url) => ({ scanId, url, requestedProvince, urlHash: pageVariantIdentity(url, requestedProvince), depth }));
        });
        if (newPages.length === 0) return [];
        const created = await tx.page.createManyAndReturn({
          data: newPages,
          select: { id: true },
          skipDuplicates: true,
        });
        return created.map((row) => row.id);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt === 19) throw error;
      await sleep(Math.min(250, 10 * 2 ** attempt) + Math.floor(Math.random() * 20));
    }
  }
  return [];

}

/**
 * Full processing for a claimed page. The page stays in CRAWLING until the single status
 * update at the end — flipping to FETCHED before link checks/discovery (as this used to)
 * let a concurrent finalize mark the scan COMPLETE and compute scores while findings were
 * still being written.
 */
async function crawlClaimedPage(scan: Scan & { site: Site }, page: Page, attemptToken: string, signal: AbortSignal): Promise<boolean> {
  const { site } = scan;
  const scanId = scan.id;
  const pageId = page.id;

  // The root URL fetch doubles as the origin's header sample: site-scoped rules (headers are
  // origin-level in practice) run only here and persist one finding per scan with pageId null.
  const { requestedProvince } = page;
  const { scanProvinces } = scan;
  const activeProvinces = scanProvinces.length > 0 ? scanProvinces : siteProvinces(site.rootUrl);
  const headerProvince = activeProvinces.includes("ON") ? "ON" : activeProvinces[0];
  const isRootPage = (requestedProvince === null || requestedProvince === headerProvince) &&
    page.url === normalizeUrl(site.rootUrl, site.rootUrl);

  // Re-runs happen (worker restart, watchdog reclaim) — drop any rows a partial earlier pass
  // wrote for this page so reprocessing never duplicates links or findings. Link rows are now
  // broken-only but still keyed by sourceUrl, so this cleanup works unchanged. Broken-link
  // findings are scan-level and only created at finalize, so they can't exist here.
  // Site-scoped findings have pageId null so the per-page delete misses them — on a root-page
  // re-run, delete them by code (only codes this function rewrites; scanStart's site.* and
  // finalize's broken-link findings are also pageId-null and must survive).
  const { host, pathname, search } = new URL(page.url);

  const robots = await getRobots(page.url);
  if (robots.isAllowed(page.url, USER_AGENT) === false) {
    return prisma.$transaction(async (tx) => {
      const owned = await tx.page.findFirst({ where: { id: pageId, status: "CRAWLING", attemptToken, scan: { status: "CRAWLING" } }, select: { id: true } });
      if (!owned) return false;
      await tx.page.update({ where: { id: pageId }, data: { status: "ERROR", httpStatus: null, fetchError: "Blocked by robots.txt", fetchedAt: new Date(), attemptToken: null, leaseExpiresAt: null } });
      await tx.scan.update({ where: { id: scanId }, data: { pagesCrawled: { increment: 1 } } });
      return true;
    });
  }

  // Transient statuses (429/502/503/504) are usually rate limiting or an overloaded origin,
  // and bot-protection challenge shells (200 with no auditable content) are often served
  // intermittently — retry both with backoff instead of recording a page full of junk.
  const needsRetry = (r: Awaited<ReturnType<typeof fetchPage>>) =>
    (r.httpStatus !== null && TRANSIENT_HTTP_STATUSES.has(r.httpStatus)) ||
    (r.body !== null && r.httpStatus !== null && r.httpStatus < 400 && isUnauditableShell(r.body));

  let redirected = false;
  const allowRedirect = async (url: string) => {
    redirected = true;
    if (!isSameSiteDomain(url, site.rootUrl) || !isUrlAllowed(url, site)) return false;
    if ((await getRobots(url)).isAllowed(url, USER_AGENT) === false) return false;
    await waitForHostSlot(new URL(url).host);
    return true;
  };

  const fetchWithCapacity = async (url = page.url) => {
    const release = await acquireHostSlot(host);
    redirected = false;
    try {
      return await fetchPage(url, site.rootUrl, signal, allowRedirect, requestedProvince
        ? (target) => provinceHeaders(site.rootUrl, target, requestedProvince)
        : undefined);
    } finally { release(); }
  };
  let result = await fetchWithCapacity();
  for (let attempt = 1; attempt <= 2 && needsRetry(result); attempt++) {
    await sleep(1500 * attempt);
    result = await fetchWithCapacity();
  }

  let document: cheerio.CheerioAPI | undefined;
  // Bell serves its Mobility landing page as a script shell to the HTTP client.
  // Keep browser rendering bounded to that landing page in each selected province.
  if (!redirected && result.httpStatus === 200 && result.body &&
      crawlBrand(site.rootUrl) === "bell" && pathname === "/Mobility" && !search &&
      isUnauditableShell(result.body) && !hasChallengeMarkers(result.body)) {
    const rendered = await renderPage(page.url, site.rootUrl, requestedProvince, signal);
    if (rendered?.body && !isUnauditableShell(rendered.body)) {
      const renderedDocument = cheerio.load(rendered.body);
      if (!requestedProvince || declaredProvince(renderedDocument) === requestedProvince) {
        result = rendered;
        document = renderedDocument;
      }
    }
  }
  if (requestedProvince && !document && !redirected && result.body && result.httpStatus === 200) {
    document = cheerio.load(result.body);
  }
  if (requestedProvince && document && declaredProvince(document) !== requestedProvince) {
    const fallbackUrl = provinceFallbackUrl(site.rootUrl, page.url, requestedProvince);
    if (fallbackUrl && isUrlAllowed(fallbackUrl, site) && robots.isAllowed(fallbackUrl, USER_AGENT) !== false) {
      const fallback = await fetchWithCapacity(fallbackUrl);
      if (!redirected && !fallback.error && fallback.httpStatus === 200 && fallback.body) {
        const fallbackDocument = cheerio.load(fallback.body);
        if (declaredProvince(fallbackDocument) === requestedProvince) {
          result = { ...fallback, finalUrl: page.url };
          document = fallbackDocument;
        }
      }
      // A fallback is an extra request for the same page, so only its verified content
      // can replace the primary result. Keep the primary URL's redirect state.
      redirected = false;
    }
  }

  // 4xx/5xx responses are error pages: record the status (and title, e.g. "502 Bad Gateway")
  // but never run audit rules, link checks, or discovery against an error body.
  const isErrorPage =
    result.error !== null || result.httpStatus === null || result.httpStatus >= 400;

  // A 200 whose body is a bot-challenge interstitial or an empty JS shell has nothing the fast
  // tier can audit — running rules against it flags every metadata rule at once (false
  // "missing title/h1/meta description" on pages that render fine in a browser).
  const blocked = !isErrorPage && result.body !== null && isUnauditableShell(result.body);

  if (redirected) {
    const destination = result.error === null ? normalizeUrl(result.finalUrl, page.url) : null;
    const siteFindings =
      scan.scanType === "CRAWL" && isRootPage && destination && !isErrorPage && !blocked && result.body
        ? runRules(result.body, destination, result.headers, undefined, undefined, true, SITE_SCOPED_RULE_IDS)
        : [];

    // Retain the alias as a terminal frontier entry. The destination uses the same crawl
    // depth and takes the alias's slot even if the frontier was already full.
    injectCrash("crawl.page.before-commit");
    const replaced = await prisma.$transaction(async (tx) => {
      const updated = await tx.page.updateMany({
        where: { id: pageId, status: "CRAWLING", attemptToken, scan: { status: "CRAWLING" } },
        data: { status: "REDIRECTED", fetchError: result.error, fetchedAt: new Date(), attemptToken: null, leaseExpiresAt: null },
      });
      if (updated.count === 0) return null;
      if (siteFindings.length > 0) {
        await tx.finding.deleteMany({ where: { scanId, pageId: null, code: { in: [...SITE_SCOPED_RULE_IDS] } } });
        await tx.finding.createMany({ data: siteFindings.map((finding) => ({ ...finding, scanId })) });
      }
      let destinationId: string | undefined;
      if (destination && destination !== page.url) {
        const where = { scanId, url: destination, requestedProvince };
        const existing = await tx.page.findFirst({ where, select: { id: true } });
        if (!existing) {
          const created = await tx.page.createManyAndReturn({
            data: [{ ...where, urlHash: pageVariantIdentity(destination, requestedProvince), depth: page.depth }],
            select: { id: true },
            skipDuplicates: true,
          });
          destinationId = created[0]?.id;
        }
        await tx.page.updateMany({
          where: { ...where, depth: { gt: page.depth } },
          data: { depth: page.depth },
        });
      }
      if (!destinationId) {
        await tx.scan.update({ where: { id: scanId }, data: { pagesFound: { decrement: 1 } } });
      }
      return { destinationId };
    });
    if (replaced?.destinationId) await enqueueCrawlPage(scanId, replaced.destinationId);
    return replaced !== null;
  }

  let parsed: ReturnType<typeof parseHtml> | null = null;
  if (result.body && !blocked) {
    document ??= cheerio.load(result.body);
    parsed = parseHtml(document, result.finalUrl);
  }
  const language = declaredLanguage(parsed?.lang ?? null);
  const province = parsed?.province ?? null;
  const provinceMismatch = requestedProvince !== null && province !== requestedProvince;
  const localizationError = provinceMismatch
    ? `Requested ${requestedProvince}; page declared ${province ?? "no province"}`
    : null;

  const freshScan = await prisma.scan.findUnique({ where: { id: scanId }, select: { status: true } });
  const scanStillRunning = freshScan?.status === "CRAWLING";

  let linkCounts: PageLinkCounts = { discovered: 0, checked: 0, broken: 0, internalChecked: 0, brokenRows: [] };
  const findingRows: Prisma.FindingCreateManyInput[] = [];
  const textMatches =
    scan.scanType === "TEXT_SEARCH" && scan.textSearchQuery && !isErrorPage && !blocked &&
    !provinceMismatch && document && scanStillRunning
      ? findTextMatches(document, scan.textSearchQuery)
      : null;
  if (scan.scanType === "CRAWL" && !isErrorPage && !blocked && !provinceMismatch && parsed && scanStillRunning) {
    linkCounts = await checkPageLinks(scanId, page, site, parsed, signal);

    // Live progress only. A watchdog re-run of this page increments again (the previous
    // contribution can't be subtracted — it isn't stored per scan), so these can transiently
    // over-count; finalize overwrites them with exact sums of the per-page Page counters
    // written below, which a re-run overwrites rather than accumulates.
    // Counters commit atomically with the page outputs below.

    if (result.body) {
      // Full crawl rule set: WCAG A/AA/2.2 + ARIA + QA/content + security + SEO.
      // Measured performance is intentionally a separate, user-selected one-page audit.
      if (site.spellcheckEnabled) {
        await ensureSpellchecker(); // no-op after the first call; spelling rule reads the singleton
      }
      const ruleFindings = runRules(
        result.body,
        result.finalUrl,
        result.headers,
        document,
        {
          spellcheckEnabled: site.spellcheckEnabled,
          allowedSpellingWords: site.allowedSpellingWords,
        },
        isRootPage
      );
      if (ruleFindings.length > 0) {
        findingRows.push(...ruleFindings.map((f) => ({
            ...f,
            scanId,
            province: requestedProvince ? province : null,
            language: requestedProvince ? language : null,
            // Site-scoped observations use no pageId.
            pageId: SITE_SCOPED_RULE_IDS.has(f.code) ? null : pageId,
          })));
      }
    }
  }

  if (!isErrorPage && !blocked && parsed && scanStillRunning) {
    // Filter candidates first (robots is cached per origin, so the per-link getRobots await
    // is cheap after the first URL of each host), then register the survivors in one batch.
    const candidates: string[] = [];
    const seen = new Set<string>();
    const discovered = requestedProvince
      ? [...parsed.languageAlternates.map((url) => ({ url, nofollow: false })), ...parsed.links]
      : parsed.links;
    for (const link of discovered) {
      if (link.nofollow) continue;
      if (seen.has(link.url)) continue;
      seen.add(link.url);
      if (!isSameSiteDomain(link.url, site.rootUrl)) continue;
      if (
        !isUrlAllowed(link.url, {
          includePatterns: site.includePatterns,
          excludePatterns: site.excludePatterns,
        })
      ) {
        continue;
      }
      const linkRobots = await getRobots(link.url);
      if (linkRobots.isAllowed(link.url, USER_AGENT) === false) continue;
      candidates.push(link.url);
    }

    const newlyDiscovered = await createDiscoveredPages(
      scanId, candidates, site.maxPages, page.depth + 1, activeProvinces.length > 0 ? activeProvinces : [requestedProvince]
    );

    if (newlyDiscovered.length > 0) {
      const stillRunning = await prisma.scan.updateMany({
        where: { id: scanId, status: "CRAWLING" },
        data: { pagesFound: { increment: newlyDiscovered.length } },
      });
      if (stillRunning.count > 0) {
        await enqueueCrawlPagesBulk(scanId, newlyDiscovered);
      }
    }
  }

  injectCrash("crawl.page.before-commit");
  return prisma.$transaction(async (tx) => {
    const owned = await tx.page.findFirst({ where: { id: pageId, status: "CRAWLING", attemptToken, scan: { status: "CRAWLING" } }, select: { id: true } });
    if (!owned) return false;
    await tx.link.deleteMany({ where: { OR: [{ sourcePageId: pageId }, { sourcePageId: null, scanId, sourceUrl: page.url }] } });
    await tx.finding.deleteMany({ where: { scanId, pageId } });
    if (isRootPage) await tx.finding.deleteMany({
      where: { scanId, pageId: null, province: requestedProvince, code: { in: [...SITE_SCOPED_RULE_IDS] } },
    });
    if (linkCounts.brokenRows.length > 0) await tx.link.createMany({ data: linkCounts.brokenRows.map((row) => ({ ...row, sourcePageId: pageId })) });
    if (findingRows.length > 0) await tx.finding.createMany({ data: findingRows });
    if (textMatches && textMatches.count > 0) {
      const url = result.finalUrl;
      await tx.textSearchMatch.createMany({
        data: { scanId, urlHash: urlIdentity(url), province: requestedProvince ?? "", url, title: parsed?.title, ...textMatches },
        skipDuplicates: true,
      });
    }
    await tx.page.update({ where: { id: pageId }, data: {
      status: isErrorPage || blocked || provinceMismatch ? "ERROR" : "FETCHED",
      fetchError: result.error ?? (isErrorPage ? `HTTP ${result.httpStatus}` :
        blocked ? "Blocked or unauditable response" : localizationError),
      httpStatus: result.httpStatus,
      title: parsed?.title ?? null,
      ...(textMatches && { textMatchCount: textMatches.count }),
      metaDescription: parsed?.metaDescription ?? null,
      h1Count: parsed?.h1Count ?? null,
      province: !isErrorPage && !blocked ? province : null,
      language: !isErrorPage && !blocked ? language : null,
      linksChecked: linkCounts.checked,
      linksDiscovered: linkCounts.discovered,
      linksBroken: linkCounts.broken,
      linksInternalChecked: linkCounts.internalChecked,
      fetchedAt: new Date(),
      attemptToken: null,
      leaseExpiresAt: null,
    } });
    await tx.scan.update({ where: { id: scanId }, data: {
      pagesCrawled: { increment: 1 }, linksChecked: { increment: linkCounts.checked },
      linksBroken: { increment: linkCounts.broken }, linksInternalChecked: { increment: linkCounts.internalChecked },
    } });
    return true;
  });
}

export async function handleCrawlPage(payload: CrawlPagePayload): Promise<void> {
  const { scanId, pageId } = payload;
  const attemptToken = randomUUID();

  const [scan, page] = await Promise.all([
    prisma.scan.findUnique({ where: { id: scanId }, include: { site: true } }),
    prisma.page.findUnique({ where: { id: pageId } }),
  ]);
  if (!scan || !page) return;
  if (scan.status !== "CRAWLING") {
    // Terminal (or audit-phase) scan — drop the job. Cancelled/failed scans never reach
    // finalize, so free their scan-scoped caches here instead of leaking them.
    if (scan.status === "CANCELLED" || scan.status === "FAILED") {
      clearScanLinkCache(scanId);
      clearScanPageCountCache(scanId);
    }
    return;
  }
  if (page.status !== "PENDING") return; // already claimed/processed

  // Active scans can survive worker restarts and therefore may contain frontier rows created
  // by an older crawler version that admitted subdomains. Never trust persisted frontier state
  // as authorization to fetch: quarantine anything outside the site's configured hostname.
  if (!isSameSiteDomain(page.url, scan.site.rootUrl)) {
    const rejected = await prisma.$transaction(async (tx) => {
      const updated = await tx.page.updateMany({
        where: { id: pageId, status: "PENDING", scan: { status: "CRAWLING" } },
        data: {
          status: "ERROR",
          httpStatus: null,
          fetchError: "Outside the configured hostname",
          fetchedAt: new Date(),
          attemptToken: null,
          leaseExpiresAt: null,
        },
      });
      if (updated.count > 0) {
        await tx.scan.update({ where: { id: scanId }, data: { pagesCrawled: { increment: 1 } } });
      }
      return updated.count > 0;
    });
    if (rejected) await enqueueFinalizeIfDone(scanId);
    return;
  }

  let claim: "claimed" | "busy" | "gone" = "busy";
  let capacityWaitMs = 100;
  while (claim === "busy") {
    try {
      claim = await prisma.$transaction(async (tx) => {
        const candidate = await tx.page.findUnique({
          where: { id: pageId },
          select: { status: true, scan: { select: { status: true } } },
        });
        if (candidate?.status !== "PENDING" || candidate.scan.status !== "CRAWLING") {
          return "gone" as const;
        }
        const inFlight = await tx.page.count({ where: { scanId, status: "CRAWLING" } });
        if (inFlight >= scan.site.concurrency) return "busy" as const;
        const updated = await tx.page.updateMany({
          where: { id: pageId, status: "PENDING", scan: { status: "CRAWLING" } },
          data: { status: "CRAWLING", attemptToken, leaseExpiresAt: new Date(Date.now() + PAGE_JOB_TIMEOUT_MS) },
        });
        return updated.count === 1 ? "claimed" as const : "gone" as const;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
      claim = "busy";
    }
    if (claim === "busy") {
      // A pg-boss batch can contain more pages for this site than its configured concurrency.
      // Throwing here rejects the entire Promise.all batch, retries every job (including work
      // already running), and caused the live 25k-retry storm. Keep this delivery leased and
      // wait for one of the claimed pages to commit instead.
      await sleep(capacityWaitMs + Math.floor(Math.random() * 75));
      capacityWaitMs = Math.min(2_000, Math.round(capacityWaitMs * 1.5));
    }
  }
  if (claim !== "claimed") return;

  let completed = false;
  try {
    completed = await withTimeout(
      (signal) => crawlClaimedPage(scan, page, attemptToken, signal),
      PAGE_JOB_TIMEOUT_MS,
      `page processing exceeded ${PAGE_JOB_TIMEOUT_MS}ms`
    );
  } catch (err) {
    console.error(`[crawl] page failed: ${page.url}`, err);
    // Never leave a claimed page stuck in CRAWLING — a stranded page wedges the whole scan.
    const marked = await prisma.page
      .updateMany({
        where: { id: pageId, status: "CRAWLING", attemptToken, scan: { status: "CRAWLING" } },
        data: { status: "PENDING", attemptToken: null, leaseExpiresAt: null },
      })
      .catch(() => null);
    if ((marked?.count ?? 0) > 0) throw err;
    return;
  }

  if (!completed) return;
  injectCrash("crawl.page.after-commit");
  await enqueueFinalizeIfDone(scanId);
}
