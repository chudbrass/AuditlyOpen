# Outbound network threat model

Auditly treats every scanned URL and every resource referenced by a scanned page as attacker-controlled. A site owner may add a hostile hostname; DNS answers may change between validation and connection; redirects, robots files, sitemaps, links, scripts, frames, images, CSS, and Lighthouse navigation can all point at internal services.

## Security boundary

- `src/lib/network/egressPolicy.ts` is the shared address policy. Production accepts only HTTP(S) URLs without embedded credentials and globally routable unicast addresses. Loopback, private, link-local, carrier-grade NAT, benchmarking, documentation, multicast/reserved IPv4, non-global IPv6, and IPv4-mapped private IPv6 are rejected. If any DNS answer is non-global, the request is rejected.
- Fast-tier Undici requests resolve each redirect hop, validate the complete answer set, and create a dispatcher whose `lookup` callback returns only the selected vetted address. The socket therefore cannot repeat DNS resolution after validation. This covers pages, robots, sitemaps, link checks, and item rechecks because they all use `fetchPage.ts`.
- Chromium is launched only through Auditly's loopback egress proxy. The proxy validates and pins the upstream address for HTTP and HTTPS CONNECT traffic, so top-level redirects and browser subresources share the same boundary. Lighthouse attaches to that proxied browser; its runner refuses standalone execution without the enforcement marker.
- TLS certificate verification is always enabled. Auditly no longer retries with `rejectUnauthorized: false`.
- Response bodies have transfer bounds, and sitemap decompression has a separate 10 MiB output bound. Crawl include/exclude patterns are literal wildcard matches (`*`) rather than regular expressions.

## Explicit development exception

`AUDITLY_ALLOW_PRIVATE_NETWORK=true` permits non-global destinations in both tiers for trusted local development. It must never be enabled for a shared or internet-facing deployment. This is a process-wide trust policy, not a per-request escape hatch, and startup configuration should be retained with deployment records.

## Residual assumptions

- The worker host and Node/Chromium processes are trusted and not already compromised.
- Operating-system firewall/container egress rules remain recommended as defense in depth.
- Public services that themselves proxy internal data are outside an IP egress boundary; application-level credentials must not be exposed to scanned pages.
- DNS and connections can still fail or be denied (fail closed); availability is secondary to preventing internal access.

## Verification

Run `npm run test:security`, `npm run typecheck`, `npm run lint`, and `npm run build`. The focused suite covers mixed DNS/rebinding answers, redirects/subresource proxy attempts to private and metadata addresses, IPv4-mapped IPv6, gzip expansion bombs, and malicious former-regex patterns.
