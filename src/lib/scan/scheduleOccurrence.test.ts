import assert from "node:assert/strict";
import test from "node:test";
import { latestCronMatch } from "./cron";
import { hasAttemptForOccurrence } from "./scheduleOccurrence";

test("a terminal attempt still serves its scheduled occurrence", () => {
  const dueAt = new Date(2026, 6, 10, 1, 0, 0);
  assert.equal(hasAttemptForOccurrence(null, dueAt), false);
  assert.equal(hasAttemptForOccurrence(new Date(2026, 6, 10, 0, 59, 59), dueAt), false);
  assert.equal(hasAttemptForOccurrence(new Date(2026, 6, 10, 1, 0, 0), dueAt), true);
  assert.equal(hasAttemptForOccurrence(new Date(2026, 6, 10, 1, 5, 0), dueAt), true);
});

test("latest cron occurrence supports restart catch-up", () => {
  const now = new Date("2026-07-10T08:30:00.000Z");
  assert.deepEqual(latestCronMatch("0 1 * * *", now), new Date("2026-07-10T01:00:00.000Z"));
});
