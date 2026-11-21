import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { createPinnedLookup, isGlobalAddress, resolveVettedAddress } from "./egressPolicy";
import { startEgressProxy } from "./egressProxy";
import { decodeSitemap, MAX_SITEMAP_OUTPUT_BYTES } from "../crawler/sitemap";
import { matchesPatterns } from "../crawler/urlFilters";

test("rejects private, metadata, reserved, and IPv4-mapped IPv6 destinations", () => {
  for (const address of ["10.0.0.1", "127.0.0.1", "169.254.169.254", "192.168.1.1", "::1", "fc00::1", "fe80::1", "::ffff:169.254.169.254", "2001:db8::1"]) {
    assert.equal(isGlobalAddress(address), false, address);
  }
  assert.equal(isGlobalAddress("8.8.8.8"), true);
  assert.equal(isGlobalAddress("2606:4700:4700::1111"), true);
});

test("rejects a rebinding answer if any DNS result is non-global", async () => {
  await assert.rejects(
    resolveVettedAddress("rebind.example", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    /non-global/
  );
});

test("pinned DNS lookup supports single and all-address callback shapes", async () => {
  const lookup = createPinnedLookup({ address: "93.184.216.34", family: 4 });

  const single = await new Promise<{ address: string; family: number }>((resolve, reject) => {
    lookup("example.com", { all: false }, (error, address, family) => {
      if (error) return reject(error);
      if (typeof address !== "string") return reject(new Error("Expected a single DNS address"));
      resolve({ address, family: family ?? 0 });
    });
  });
  assert.deepEqual(single, { address: "93.184.216.34", family: 4 });

  const all = await new Promise<Array<{ address: string; family: number }>>((resolve, reject) => {
    lookup("example.com", { all: true }, (error, addresses) => {
      if (error) return reject(error);
      assert.ok(Array.isArray(addresses));
      resolve(addresses);
    });
  });
  assert.deepEqual(all, [{ address: "93.184.216.34", family: 4 }]);
});

test("browser proxy blocks private redirects and subresource CONNECTs", async () => {
  const proxy = await startEgressProxy();
  try {
    for (const destination of ["169.254.169.254:80", "127.0.0.1:443", "[::ffff:127.0.0.1]:443"]) {
      const status = await new Promise<number>((resolve, reject) => {
        const request = http.request({ host: "127.0.0.1", port: proxy.port, method: "CONNECT", path: destination });
        request.on("connect", (response) => resolve(response.statusCode ?? 0));
        request.on("response", (response) => resolve(response.statusCode ?? 0));
        request.on("error", reject);
        request.end();
      });
      assert.equal(status, 403, destination);
    }
  } finally {
    await proxy.close();
  }
});

test("bounded sitemap decoding rejects gzip bombs", () => {
  const bomb = gzipSync(Buffer.alloc(MAX_SITEMAP_OUTPUT_BYTES + 1, 65));
  assert.equal(decodeSitemap(bomb, true), null);
});

test("crawl patterns use safe wildcard matching instead of regular expressions", () => {
  const malicious = "(a+)+$";
  const input = `https://example.com/${"a".repeat(100_000)}!`;
  const started = performance.now();
  assert.equal(matchesPatterns(input, [malicious]), false);
  assert.ok(performance.now() - started < 250);
  assert.equal(matchesPatterns("https://example.com/docs/intro", ["*/docs/*"]), true);
});
