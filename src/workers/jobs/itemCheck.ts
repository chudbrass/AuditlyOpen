import * as cheerio from "cheerio";
import robotsParser from "robots-parser";
import { prisma } from "@/lib/db";
import { fetchPage, fetchText, USER_AGENT } from "@/lib/crawler/fetchPage";
import { discoverSitemapUrls } from "@/lib/crawler/sitemap";
import { getRobots } from "@/lib/crawler/robots";
import { waitForHostSlot } from "@/lib/crawler/rateLimit";
import { checkLinkOnce } from "@/lib/audits/linkCheck";
import { runPerformanceAudit } from "@/lib/audits/performance";
import { ensureSpellchecker } from "@/lib/audits/spellcheck";
import { runSiteChecks } from "@/lib/audits/siteChecks";
import { RULES_BY_ID, runRules } from "@/lib/audits/rules";
import type { ItemCheckPayload } from "./queues";
import { randomUUID } from "node:crypto";
import { isSameSiteDomain, isUrlAllowed } from "@/lib/crawler/urlFilters";
import { declaredLanguage, provinceFallbackUrl, provinceHeaders } from "@/lib/crawler/localization";
import { declaredProvince } from "@/lib/crawler/extractLinks";
import type { Site } from "@prisma/client";
import type { ItemCheck } from "@prisma/client";

const ITEM_CHECK_LEASE_MS = 5 * 60_000;

const SITE_FETCH_RULES = new Set(["site.robots-missing", "site.robots-blocks-search", "site.sitemap-missing", "site.sitemap-empty", "site.sitemap-cross-domain"]);

async function checkIssue(
  code: string, pageUrl: string, targetUrl: string | null,
  site: Site,
  signal: AbortSignal, locale: { province: string | null; language: string | null } | null
): Promise<boolean> {
  const province = locale?.province;
  if (code === "links.broken-internal" || code === "links.broken-external") {
    if (!targetUrl) throw new Error("The broken-link target is missing from this finding.");
    return (await checkLinkOnce(`item-check:${Date.now()}`, targetUrl, signal, province
      ? { rootUrl: site.rootUrl, province }
      : undefined)).broken;
  }

  if (!isSameSiteDomain(pageUrl, site.rootUrl)) {
    throw new Error("This historical finding is outside the site's configured hostname.");
  }

  if (code === "performance.poor" || code === "performance.needs-improvement") {
    const result = await runPerformanceAudit(pageUrl, signal);
    if (result.error || result.perfScore === null) throw new Error(result.error ?? "Lighthouse returned no score.");
    return code === "performance.poor" ? result.perfScore < 50 : result.perfScore < 90;
  }

  if (SITE_FETCH_RULES.has(code)) {
    const robotsUrl = `${new URL(site.rootUrl).origin}/robots.txt`;
    const robotsBody = (await fetchText(robotsUrl, site.rootUrl, signal)).body;
    const declaredSitemaps = robotsBody ? robotsParser(robotsUrl, robotsBody).getSitemaps() : [];
    const sitemapUrls = await discoverSitemapUrls(site.rootUrl, declaredSitemaps);
    const findings = await runSiteChecks(site.rootUrl, sitemapUrls);
    return findings.some((finding) => finding.code === code);
  }

  if (!RULES_BY_ID.has(code)) {
    throw new Error("This issue depends on a whole-site comparison and cannot be checked individually.");
  }

  const robots = await getRobots(pageUrl);
  if (robots.isAllowed(pageUrl, USER_AGENT) === false) throw new Error("robots.txt does not allow Auditly to recheck this page.");
  await waitForHostSlot(new URL(pageUrl).host);
  const headersForUrl = province
    ? (url: string) => provinceHeaders(site.rootUrl, url, province)
    : undefined;
  let fetched = await fetchPage(pageUrl, site.rootUrl, signal, undefined, headersForUrl);
  if (fetched.error || fetched.httpStatus === null || fetched.httpStatus >= 400 || !fetched.body) {
    throw new Error(fetched.error ?? `Page returned HTTP ${fetched.httpStatus ?? "unknown"}.`);
  }
  let body = fetched.body;
  let document = cheerio.load(body);
  if (province) {
    if (declaredProvince(document) !== province) {
      const fallbackUrl = provinceFallbackUrl(site.rootUrl, pageUrl, province);
      if (fallbackUrl && isUrlAllowed(fallbackUrl, site) && robots.isAllowed(fallbackUrl, USER_AGENT) !== false) {
        await waitForHostSlot(new URL(fallbackUrl).host);
        const fallback = await fetchPage(fallbackUrl, site.rootUrl, signal, async () => false, headersForUrl);
        if (fallback.httpStatus === 200 && fallback.body) {
          fetched = { ...fallback, finalUrl: pageUrl };
          body = fallback.body;
          document = cheerio.load(body);
        }
      }
    }
    if (declaredProvince(document) !== province ||
        (locale.language && declaredLanguage(document("html").attr("lang") ?? null) !== locale.language)) {
      throw new Error("The page did not return the province and language of this finding.");
    }
  }
  if (code.startsWith("spelling.")) await ensureSpellchecker();
  const findings = runRules(
    body,
    fetched.finalUrl,
    fetched.headers,
    document,
    { spellcheckEnabled: site.spellcheckEnabled, allowedSpellingWords: site.allowedSpellingWords },
    pageUrl === site.rootUrl,
    new Set([code])
  );
  return findings.some((finding) => finding.code === code);
}

async function checkAffectedLocales(
  check: ItemCheck & {
    site: Site;
    finding: { id: string; duplicateOfId: string | null; province: string | null; language: string | null } | null;
  },
  signal: AbortSignal
): Promise<boolean> {
  const { finding, findingCode, pageUrl, targetUrl, site } = check;
  if (!finding?.province) return checkIssue(findingCode, pageUrl, targetUrl, site, signal, finding);

  const representativeId = finding.duplicateOfId ?? finding.id;
  const locales = await prisma.finding.groupBy({
    by: ["province", "language"],
    where: { OR: [{ id: representativeId }, { duplicateOfId: representativeId }] },
    orderBy: [{ province: "asc" }, { language: "asc" }],
  });
  // A regional check can confirm an issue as soon as any affected locale still has it.
  // Confirming a fix requires a successful recheck in every affected locale.
  let failure: unknown;
  for (const locale of locales) {
    signal.throwIfAborted();
    try {
      if (await checkIssue(findingCode, pageUrl, targetUrl, site, signal, locale)) return true;
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
  return false;
}

export async function handleItemCheck({ itemCheckId }: ItemCheckPayload): Promise<void> {
  const attemptToken = randomUUID();
  const claimed = await prisma.itemCheck.updateMany({
    where: { id: itemCheckId, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date(), attemptToken, leaseExpiresAt: new Date(Date.now() + ITEM_CHECK_LEASE_MS), attemptCount: { increment: 1 } },
  });
  if (claimed.count === 0) return;

  const check = await prisma.itemCheck.findUnique({
    where: { id: itemCheckId },
    include: { site: true, finding: { select: { id: true, duplicateOfId: true, province: true, language: true } } },
  });
  if (!check) return;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("Item check timed out")), ITEM_CHECK_LEASE_MS);
    const issuePresent = await checkAffectedLocales(check, controller.signal)
      .finally(() => clearTimeout(timer));
    let tasksCompleted = 0;
    if (!issuePresent && !check.finding?.province) {
      const completed = await prisma.task.updateMany({
        where: {
          siteId: check.siteId,
          findingCode: check.findingCode,
          pageUrl: check.taskPageUrl,
          status: { not: "COMPLETED" },
        },
        data: { status: "COMPLETED" },
      });
      tasksCompleted = completed.count;
    }
    await prisma.itemCheck.updateMany({
      where: { id: itemCheckId, status: "RUNNING", attemptToken },
      data: { status: "COMPLETE", issuePresent, tasksCompleted, finishedAt: new Date(), attemptToken: null, leaseExpiresAt: null },
    });
  } catch (error) {
    await prisma.itemCheck.updateMany({
      where: { id: itemCheckId, status: "RUNNING", attemptToken },
      data: { status: "FAILED", error: error instanceof Error ? error.message : String(error), finishedAt: new Date(), attemptToken: null, leaseExpiresAt: null },
    });
  }
}
