import robotsParser from "robots-parser";
import { fetchText, USER_AGENT } from "./fetchPage";
import { setCrawlDelay } from "./rateLimit";

type Robot = ReturnType<typeof robotsParser>;

type CachedRobots = { robots: Robot; expiresAt: number; host: string };

// robots.txt is allowed to change. A short, bounded cache avoids fetching it
// for every page without making a worker retain stale rules or crawl delays.
const ROBOTS_CACHE_TTL_MS = 15 * 60 * 1000;
const robotsByOrigin = new Map<string, CachedRobots>();
const pendingRobotsByOrigin = new Map<string, Promise<Robot>>();

export async function getRobots(rootUrl: string): Promise<Robot> {
  const origin = new URL(rootUrl).origin;
  const cached = robotsByOrigin.get(origin);
  if (cached && cached.expiresAt > Date.now()) return cached.robots;

  const pending = pendingRobotsByOrigin.get(origin);
  if (pending) return pending;

  const refresh = fetchRobots(origin);
  pendingRobotsByOrigin.set(origin, refresh);
  try {
    return await refresh;
  } finally {
    pendingRobotsByOrigin.delete(origin);
  }
}

async function fetchRobots(origin: string): Promise<Robot> {
  const robotsUrl = `${origin}/robots.txt`;
  let body = "";
  try {
    body = (await fetchText(robotsUrl, origin)).body ?? "";
  } catch {
    // no robots.txt reachable — treat as allow-all
  }

  const robots = robotsParser(robotsUrl, body);
  const host = new URL(origin).host;
  robotsByOrigin.set(origin, { robots, expiresAt: Date.now() + ROBOTS_CACHE_TTL_MS, host });

  const delay = robots.getCrawlDelay(USER_AGENT);
  // Also clear an old delay when the refreshed file omits Crawl-delay.
  setCrawlDelay(host, delay);

  return robots;
}

export function clearRobotsCache() {
  for (const { host } of robotsByOrigin.values()) setCrawlDelay(host, undefined);
  robotsByOrigin.clear();
  pendingRobotsByOrigin.clear();
}
