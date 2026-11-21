import { getSharedBrowser } from "@/lib/audits/browser";
import { getGlobalSettings } from "@/lib/settings";
import type { BrowserContext, Request } from "playwright";
import type { FetchedPage } from "./fetchPage";
import { provinceHeaders } from "./localization";
import { acquireHostSlot } from "./rateLimit";
import { getRobots } from "./robots";

export async function renderPage(
  url: string,
  rootUrl: string,
  province: string | null,
  signal: AbortSignal,
): Promise<FetchedPage | null> {
  const { userAgent } = await getGlobalSettings();
  const robots = await getRobots(url);
  if (signal.aborted || robots.isAllowed(url, userAgent) === false) return null;

  const host = new URL(url).host;
  let context: BrowserContext | undefined;
  const closeContext = () => context?.close().catch(() => {});
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  deadline.addEventListener("abort", closeContext, { once: true });

  try {
    const browser = await getSharedBrowser();
    if (deadline.aborted) return null;
    context = await browser.newContext({ userAgent, serviceWorkers: "block", acceptDownloads: false });
    if (deadline.aborted) return null;

    const cookie = provinceHeaders(rootUrl, url, province).Cookie;
    if (cookie?.startsWith("gemini=")) {
      await context.addCookies([{ url, name: "gemini", value: cookie.slice("gemini=".length) }]);
    }

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    // A browser redirect can escape Playwright's request route. Reject it before Chromium follows it.
    cdp.on("Fetch.requestPaused", ({ requestId, responseStatusCode }) => {
      const action = responseStatusCode === 200
        ? cdp.send("Fetch.continueResponse", { requestId })
        : cdp.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
      void action.catch(() => {});
    });
    await cdp.send("Fetch.enable", { patterns: [{ requestStage: "Response" }] });
    await context.routeWebSocket("**/*", (socket) => socket.close());

    const releases = new Map<Request, () => void>();
    const releaseRequest = (request: Request) => {
      releases.get(request)?.();
      releases.delete(request);
    };
    page.on("requestfinished", releaseRequest);
    page.on("requestfailed", releaseRequest);
    let requests = 0;
    try {
      await context.route("**/*", async (route) => {
        const request = route.request();
        const kind = request.resourceType();
        if (deadline.aborted || requests >= 3 || request.url() !== url || request.method() !== "GET" ||
            (requests === 0 ? kind !== "document" : kind !== "xhr" && kind !== "fetch") ||
            request.frame() !== page.mainFrame()) {
          await route.abort().catch(() => {});
          return;
        }
        requests++;
        const release = await acquireHostSlot(host);
        if (deadline.aborted) {
          release();
          await route.abort().catch(() => {});
          return;
        }
        releases.set(request, release);
        await route.continue().catch(() => releaseRequest(request));
      });

      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12_000 });
      if (response?.status() !== 200 || response.url() !== url) return null;
      await page.waitForFunction(
        () => document.title.trim() && (document.body?.innerText.trim().length ?? 0) >= 80,
        undefined,
        { timeout: 6_000 },
      );
      const body = await page.content();
      const headers = await response.allHeaders();
      return { body, headers, httpStatus: 200, contentType: headers["content-type"] ?? null, error: null, finalUrl: url };
    } finally {
      await closeContext();
      for (const release of releases.values()) release();
    }
  } catch {
    return null;
  } finally {
    deadline.removeEventListener("abort", closeContext);
    await closeContext();
  }
}
