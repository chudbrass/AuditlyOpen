import assert from "node:assert/strict";
import test from "node:test";
import { averageAvailableScores } from "./scoring";

test("no pages and all-fetch-failed categories remain unavailable", () => {
  assert.equal(averageAvailableScores([]), null);
  assert.equal(averageAvailableScores([null, null]), null);
});

test("all-audit-failed remains unavailable instead of perfect", () => {
  assert.equal(averageAvailableScores([null, null]), null);
});

test("partial coverage averages successful category results only", () => {
  assert.equal(averageAvailableScores([80, null, 60]), 70);
});

test("crawl-only snapshot can score from available fast categories", () => {
  assert.equal(averageAvailableScores([90, 70, null, null]), 80);
});

test("standalone performance diagnostics are not included in health scoring", () => {
  const healthScores = [90, 70, 80];
  const standalonePerformanceScore = 25;
  assert.equal(averageAvailableScores(healthScores), 80);
  assert.equal(standalonePerformanceScore, 25);
});

test("mixed-site portfolio ignores unavailable sites", () => {
  assert.equal(averageAvailableScores([75, null, 95]), 85);
});
