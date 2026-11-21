const DEFAULT_MIN_INTERVAL_MS = 250;

// robots.txt Crawl-delay is advisory; some sites declare 60s+ which would make a crawl of any
// size run for hours and trip the stuck-page watchdog. Cap it the way commercial crawlers do.
const MAX_CRAWL_DELAY_MS = 15_000;

// Long-lived worker processes check links against arbitrary external hosts — prune the per-host
// bookkeeping once it grows past this so the maps can't accumulate forever.
const HOST_MAP_PRUNE_THRESHOLD = 5_000;
const HOST_ENTRY_STALE_MS = 10 * 60_000;

const nextSlotAtByHost = new Map<string, number>();
const crawlDelayMsByHost = new Map<string, number>();
const inFlightByHost = new Map<string, number>();
const waitersByHost = new Map<string, Array<() => void>>();
const HOST_IN_FLIGHT_LIMIT = (() => {
  const parsed = Number(process.env.AUDITLY_HOST_CONCURRENCY);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(50, Math.floor(parsed)) : 5;
})();

export function setCrawlDelay(host: string, delaySeconds: number | undefined) {
  if (delaySeconds === undefined) {
    crawlDelayMsByHost.delete(host);
    return;
  }
  crawlDelayMsByHost.set(host, Math.min(MAX_CRAWL_DELAY_MS, Math.max(0, delaySeconds * 1000)));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneStaleHosts(now: number): void {
  if (nextSlotAtByHost.size <= HOST_MAP_PRUNE_THRESHOLD) return;
  for (const [host, slotAt] of nextSlotAtByHost) {
    if (slotAt < now - HOST_ENTRY_STALE_MS) nextSlotAtByHost.delete(host);
  }
}

/**
 * Per-host politeness gate. Reserves the next request slot synchronously (no await between
 * reading and writing the map), so N concurrent callers for the same host get N consecutive
 * slots spaced by the host's interval — instead of all observing the same "last request" time
 * and firing together after one shared wait.
 *
 * `maxIntervalMs` lets cheap status probes (link HEAD checks) use a tighter spacing than page
 * fetches on hosts that declare a large Crawl-delay, so one link-heavy page can't pin a crawl
 * slot for many minutes.
 */
export async function waitForHostSlot(host: string, maxIntervalMs?: number): Promise<void> {
  const configured = crawlDelayMsByHost.get(host) ?? DEFAULT_MIN_INTERVAL_MS;
  const minInterval =
    maxIntervalMs !== undefined ? Math.min(configured, Math.max(0, maxIntervalMs)) : configured;

  const now = Date.now();
  const slot = Math.max(now, nextSlotAtByHost.get(host) ?? 0);
  nextSlotAtByHost.set(host, slot + minInterval);
  pruneStaleHosts(now);

  const wait = slot - now;
  if (wait > 0) await sleep(wait);
}

/**
 * Acquires both the per-process host semaphore and the request-start/Crawl-delay slot.
 * Callers must release in finally. Site/global admission is Prisma-backed across workers;
 * host politeness is process-local, so multi-worker deployments must divide the desired host
 * ceiling by worker count (or run one crawl worker) because remote origins offer no shared lock.
 */
export async function acquireHostSlot(host: string, maxIntervalMs?: number): Promise<() => void> {
  while ((inFlightByHost.get(host) ?? 0) >= HOST_IN_FLIGHT_LIMIT) {
    await new Promise<void>((resolve) => {
      const queue = waitersByHost.get(host) ?? [];
      queue.push(resolve);
      waitersByHost.set(host, queue);
    });
  }
  inFlightByHost.set(host, (inFlightByHost.get(host) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const next = Math.max(0, (inFlightByHost.get(host) ?? 1) - 1);
    if (next === 0) inFlightByHost.delete(host); else inFlightByHost.set(host, next);
    const waiter = waitersByHost.get(host)?.shift();
    if (waitersByHost.get(host)?.length === 0) waitersByHost.delete(host);
    waiter?.();
  };
  try {
    await waitForHostSlot(host, maxIntervalMs);
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
