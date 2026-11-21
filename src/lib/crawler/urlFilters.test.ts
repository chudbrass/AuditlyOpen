import assert from "node:assert/strict";
import test from "node:test";
import { siteInputSchema } from "@/lib/validation/site";
import {
  configuredSiteHostnames,
  configuredSiteUrlPrefixes,
  isSameSiteDomain,
} from "./urlFilters";

test("configured host accepts its www and bare aliases", () => {
  const rootUrl = "https://www.bell.ca/";

  assert.deepEqual(configuredSiteHostnames(rootUrl), ["bell.ca", "www.bell.ca"]);
  assert.equal(isSameSiteDomain("https://www.bell.ca/mobility", rootUrl), true);
  assert.equal(isSameSiteDomain("http://bell.ca/support", rootUrl), true);
});

test("configured host rejects every subdomain", () => {
  const rootUrl = "https://www.bell.ca/";

  assert.equal(isSameSiteDomain("https://support.bell.ca/", rootUrl), false);
  assert.equal(isSameSiteDomain("https://service.aliant.bell.ca/", rootUrl), false);
  assert.equal(isSameSiteDomain("https://notbell.ca/", rootUrl), false);
});

test("a manually added subdomain is a crawl target in its own right", () => {
  const { rootUrl } = siteInputSchema.parse({
    name: "Support",
    rootUrl: "https://support.example.com/",
  });

  assert.equal(isSameSiteDomain("https://support.example.com/help", rootUrl), true);
  assert.equal(isSameSiteDomain("https://example.com/help", rootUrl), false);
  assert.equal(isSameSiteDomain("https://shop.example.com/help", rootUrl), false);
});

test("configured host keeps explicit ports isolated", () => {
  const rootUrl = "http://localhost:4100/";

  assert.deepEqual(configuredSiteHostnames(rootUrl), ["localhost"]);
  assert.equal(isSameSiteDomain("https://localhost:4100/page", rootUrl), true);
  assert.equal(isSameSiteDomain("http://localhost:4200/page", rootUrl), false);
  assert.equal(isSameSiteDomain("http://api.localhost:4100/page", rootUrl), false);
});

test("configured URL prefixes cover only the selected hostname aliases", () => {
  assert.deepEqual(configuredSiteUrlPrefixes("https://www.bell.ca/"), [
    "http://bell.ca/",
    "https://bell.ca/",
    "http://www.bell.ca/",
    "https://www.bell.ca/",
  ]);
});
