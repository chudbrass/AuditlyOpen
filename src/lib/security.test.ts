import assert from "node:assert/strict";
import test from "node:test";
import { hasSameOrigin, isStrongAuditlyPassword } from "./security";
import { normalizeUrl } from "./crawler/urlFilters";
import { siteInputSchema, siteUpdateSchema } from "./validation/site";

test("rejects credentials in root and seed URLs on site creation and update", () => {
  const rootUrl = "https://example.com";
  for (const url of ["https://user@example.com", "https://:secret@example.com", "https://user:p%40ss@example.com"]) {
    assert.equal(siteInputSchema.safeParse({ name: "Example", rootUrl: url }).success, false);
    assert.equal(siteInputSchema.safeParse({ name: "Example", rootUrl, seedUrls: [url] }).success, false);
    assert.equal(siteUpdateSchema.safeParse({ rootUrl: url }).success, false);
    assert.equal(siteUpdateSchema.safeParse({ seedUrls: [url] }).success, false);
    assert.equal(normalizeUrl(url, rootUrl), null);
  }
});

test("preserves site creation defaults and leaves omitted update fields alone", () => {
  const site = siteInputSchema.parse({ name: "Example", rootUrl: "https://example.com/page?filter=a@b" });
  assert.deepEqual(site.seedUrls, []);
  assert.equal(site.maxPages, 1000);
  assert.equal(site.scheduleTimezone, "UTC");
  assert.deepEqual(siteUpdateSchema.parse({ name: "New name" }), { name: "New name" });
});

test("rejects missing, placeholder, and clearly weak passwords", () => {
  for (const password of [undefined, "change-me", "password123", "short-A1!", "abcdefghijklmnop"]) {
    assert.equal(isStrongAuditlyPassword(password), false);
  }
  assert.equal(isStrongAuditlyPassword("Correct-Horse-42-Battery!"), true);
});

test("accepts a same-origin mutation", () => {
  const request = new Request("https://auditly.example/api/sites", {
    method: "POST",
    headers: { host: "auditly.example", origin: "https://auditly.example" },
  });
  assert.equal(hasSameOrigin(request), true);
});

test("rejects cross-origin and missing-origin mutations", () => {
  const crossOrigin = new Request("https://auditly.example/api/sites", {
    method: "POST",
    headers: { host: "auditly.example", origin: "https://attacker.example" },
  });
  const missingOrigin = new Request("https://auditly.example/api/sites", {
    method: "POST",
    headers: { host: "auditly.example" },
  });
  assert.equal(hasSameOrigin(crossOrigin), false);
  assert.equal(hasSameOrigin(missingOrigin), false);
});

test("uses the external forwarded origin behind the local proxy", () => {
  const request = new Request("http://127.0.0.1:3000/api/sites", {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin: "https://auditly.example",
      "x-forwarded-host": "auditly.example",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(hasSameOrigin(request), true);
});
