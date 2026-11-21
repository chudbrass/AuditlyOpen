import assert from "node:assert/strict";
import test from "node:test";
import { siteProvinces } from "./brand";
import { localizationSeeds, provinceHeaders } from "./localization";
import { isSameSiteDomain } from "./urlFilters";

test("Aliant uses Atlantic province cookies on its own English and French entry pages", () => {
  const rootUrl = "https://aliant.bell.ca/";
  assert.deepEqual(siteProvinces(rootUrl), ["NB", "NL", "NS", "PE"]);
  assert.deepEqual(siteProvinces("https://service.aliant.bell.ca/"), []);
  assert.equal(isSameSiteDomain("https://www.bell.ca/", rootUrl), false);

  const seeds = localizationSeeds(rootUrl);
  assert.deepEqual(seeds, [rootUrl, "https://aliant.bell.ca/Accueil"]);
  for (const province of siteProvinces(rootUrl)) {
    assert.deepEqual(provinceHeaders(rootUrl, seeds[0], province), {
      Cookie: `gemini=region=${province}|language=en|province=${province}|LarSegmentType=`,
      "Accept-Language": "en-CA",
    });
    assert.deepEqual(provinceHeaders(rootUrl, seeds[1], province), {
      Cookie: `gemini=region=${province}|language=fr|province=${province}|LarSegmentType=`,
      "Accept-Language": "fr-CA",
    });
  }
});
