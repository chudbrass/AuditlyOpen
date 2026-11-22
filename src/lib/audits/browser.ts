import type { Browser } from "playwright";
import { existsSync } from "node:fs";
import { startEgressProxy, type EgressProxy } from "@/lib/network/egressProxy";
import { allowsPrivateNetwork } from "@/lib/network/egressPolicy";
import { createServer } from "node:net";

// The isolated Linux service and its firewall use these loopback ports.
const ISOLATED_CDP_PORT = 39222;
const ISOLATED_PROXY_PORT = 39223;

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

export function browserChildEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of [
    "HOME", "USERPROFILE", "LOCALAPPDATA", "SYSTEMROOT", "WINDIR",
    "PATH", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL",
  ]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

export async function getSharedBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("playwright");
      const isolated = process.env.AUDITLY_ISOLATED_CHROMIUM === "true";
      if (process.env.NODE_ENV === "production" && !isolated) {
        throw new Error("Production browser audits require the isolated Chromium service");
      }
      if (isolated && allowsPrivateNetwork()) {
        throw new Error("Isolated Chromium requires private-network access to be disabled");
      }
      proxyPromise ??= startEgressProxy(isolated ? ISOLATED_PROXY_PORT : 0).catch((error) => {
        proxyPromise = null;
        throw error;
      });
      const proxy = await proxyPromise;
      cdpPortPromise = isolated ? Promise.resolve(ISOLATED_CDP_PORT) : reserveDynamicPort();
      const cdpPort = await cdpPortPromise;
      const browser = isolated
        ? await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 10_000 })
        : await chromium.launch({
            headless: true,
            chromiumSandbox: true,
            executablePath: getConfiguredChromiumExecutablePath(),
            env: browserChildEnvironment(),
            proxy: { server: `http://127.0.0.1:${proxy.port}`, bypass: "<-loopback>" },
            args: [`--remote-debugging-port=${cdpPort}`, "--disable-quic"],
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
  const pending = browserPromise;
  browserPromise = null;
  cdpPortPromise = null;
  try {
    const browser = await pending;
    await browser?.close();
  } catch {
    // already dead — nothing to clean up
  }
  const pendingProxy = proxyPromise;
  proxyPromise = null;
  if (pendingProxy) await pendingProxy.then((proxy) => proxy.close()).catch(() => {});
}
