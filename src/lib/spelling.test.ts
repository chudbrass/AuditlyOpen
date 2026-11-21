import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAllowedSpellingWord, spellingWordsFromEvidence } from "./spelling";

test("reads legacy spelling evidence with occurrence counts", () => {
  assert.deepEqual(spellingWordsFromEvidence({ words: ["fibe (×12)", "québec"] }), [
    { word: "fibe", count: 12 },
    { word: "québec", count: 1 },
  ]);
});

test("prefers structured spelling evidence", () => {
  assert.deepEqual(spellingWordsFromEvidence({ wordCounts: [{ word: "Auditly", count: 2 }] }), [
    { word: "Auditly", count: 2 },
  ]);
});

test("normalizes accepted site vocabulary", () => {
  assert.equal(normalizeAllowedSpellingWord("  Auditly "), "auditly");
});
