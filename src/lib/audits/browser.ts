import type { Browser } from "playwright";
import { existsSync } from "node:fs";
import { startEgressProxy, type EgressProxy } from "@/lib/network/egressProxy";
import { createServer } from "node:net";

// One Chromium per worker process, launched with a fixed CDP port so Lighthouse can attach to
// it and axe (via Playwright contexts) can share it. audit.page runs with batchSize 1, so a
// single debug port is safe.
let browserPromise: Promise<Browser> | null = null;
let proxyPromise: Promise<EgressProxy> | null = null;
let cdpPortPromise: Promise<number> | null = null;

async function reserveDynamicPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function getConfiguredChromiumExecutablePath() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
  if (!executablePath) return undefined;

  if (!existsSync(executablePath)) {
    throw new Error(
      `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH points to a missing file: ${executablePath}`
    );
  }

  return executablePath;
}

export async function getSharedBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright");
      const executablePath = getConfiguredChromiumExecutablePath();
      proxyPromise ??= startEgressProxy();
      const proxy = await proxyPromise;
      cdpPortPromise ??= reserveDynamicPort();
      const cdpPort = await cdpPortPromise;
      const browser = await chromium.launch({
        headless: true,
        executablePath,
        proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "<-loopback>" },
        args: [`--remote-debugging-port=${cdpPort}`, "--proxy-bypass-list=<-loopback>"],
      });
      browser.on("disconnected", () => {
        browserPromise = null;
      });
      return browser;
    })();
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

export async function getBrowserCdpPort(): Promise<number> {
  await getSharedBrowser();
  if (!cdpPortPromise) throw new Error("Chromium CDP port was not initialized");
  return cdpPortPromise;
}

export async function closeSharedBrowser(): Promise<void> {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  cdpPortPromise = null;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // already dead — nothing to clean up
  }
  const pendingProxy = proxyPromise;
  proxyPromise = null;
  if (pendingProxy) await (await pendingProxy).close().catch(() => {});
}
