import { allowsPrivateNetwork, isGlobalAddress } from "@/lib/network/egressPolicy";

export function normalizeUrl(rawUrl: string, base: string): string | null {
  try {
    const url = new URL(rawUrl, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Whether a URL may be requested by the crawler. Hosts resolving to a private address are
 * checked again immediately before the network request in fetchPage.ts; this synchronous
 * check rejects the unambiguous forms at validation/discovery time as well.
 */
export function isRequestUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    if (allowsPrivateNetwork()) return true;
    return !isPrivateHostname(normalizeHostname(parsed.hostname));
  } catch {
    return false;
  }
}

export { allowsPrivateNetwork };

/**
 * Hostnames that identify the configured site. Auditly treats the conventional `www` and
 * bare-host forms as aliases, but never broadens a site to arbitrary subdomains. For example,
 * a site configured as `www.bell.ca` may crawl `bell.ca`, but not `support.bell.ca`.
 */
export function configuredSiteHostnames(rootUrl: string): string[] {
  try {
    const root = new URL(rootUrl);
    const hostname = root.hostname.toLowerCase();
    if (isLocalOrIpHostname(hostname)) return [hostname];

    const bareHostname = hostname.replace(/^www\./, "");
    return [...new Set([bareHostname, `www.${bareHostname}`])];
  } catch {
    return [];
  }
}

/** URL prefixes suitable for narrowing Prisma queries before applying isSameSiteDomain. */
export function configuredSiteUrlPrefixes(rootUrl: string): string[] {
  try {
    const root = new URL(rootUrl);
    const port = root.port ? `:${root.port}` : "";
    return configuredSiteHostnames(rootUrl).flatMap((hostname) => [
      `http://${hostname}${port}/`,
      `https://${hostname}${port}/`,
    ]);
  } catch {
    return [];
  }
}

export function isSameSiteDomain(url: string, rootUrl: string): boolean {
  try {
    const parsed = new URL(url);
    const root = new URL(rootUrl);

    if (parsed.port !== root.port) return false;
    return configuredSiteHostnames(rootUrl).includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isLocalOrIpHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    hostname.includes(":")
  );
}

function isPrivateHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  const literal = hostname.replace(/^\[|\]$/g, "");
  return hostname.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
    ? !isGlobalAddress(literal)
    : false;
}

export function matchesPatterns(url: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    // Patterns are literal substrings with '*' as the sole wildcard. This linear matcher
    // cannot exhibit catastrophic regex backtracking on attacker-controlled URLs/patterns.
    const pieces = pattern.split("*");
    let offset = 0;
    for (const piece of pieces) {
      if (!piece) continue;
      const found = url.indexOf(piece, offset);
      if (found === -1) return false;
      offset = found + piece.length;
    }
    return true;
  });
}

export function isUrlAllowed(
  url: string,
  opts: { includePatterns: string[]; excludePatterns: string[] }
): boolean {
  if (opts.excludePatterns.length > 0 && matchesPatterns(url, opts.excludePatterns)) {
    return false;
  }
  if (opts.includePatterns.length > 0 && !matchesPatterns(url, opts.includePatterns)) {
    return false;
  }
  return true;
}
