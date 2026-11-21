import assert from "node:assert/strict";
import test from "node:test";
import { parseHtml } from "./extractLinks";

test("parseHtml ignores unresolved template placeholders in links", () => {
  const parsed = parseHtml(
    `
      <a href="{{device.manufacturer}}">Angular placeholder</a>
      <a href="https://{mybellhost_en}/">host placeholder</a>
      <a href="/support">Support</a>
    `,
    "https://example.com/products"
  );

  assert.deepEqual(parsed.links, [
    { url: "https://example.com/support", nofollow: false },
  ]);
});

test("parseHtml continues to normalize ordinary relative links", () => {
  const parsed = parseHtml(
    '<a href="../help#contact" rel="nofollow">Help</a>',
    "https://example.com/products/phones/"
  );

  assert.deepEqual(parsed.links, [
    { url: "https://example.com/products/help", nofollow: true },
  ]);
});
