import assert from "node:assert/strict";
import test from "node:test";
import { isValidCron, isValidTimezone, latestCronMatch, nextCronMatch } from "./cron";

test("cron validation rejects out-of-range fields and accepts ranges/steps", () => {
  assert.equal(isValidCron("60 * * * *"), false);
  assert.equal(isValidCron("0 24 * * *"), false);
  assert.equal(isValidCron("0 0 32 * *"), false);
  assert.equal(isValidCron("*/15 8-18 * * 1-5"), true);
});

test("standard DOM/DOW semantics match when either restricted field matches", () => {
  const mondayNotFirst = new Date("2026-06-08T12:00:00.000Z");
  assert.deepEqual(latestCronMatch("0 9 1 * 1", mondayNotFirst, "UTC"), new Date("2026-06-08T09:00:00.000Z"));
});

test("IANA timezone converts wall-clock occurrences to durable UTC identity", () => {
  assert.equal(isValidTimezone("America/Toronto"), true);
  assert.equal(isValidTimezone("Mars/Olympus"), false);
  assert.deepEqual(
    latestCronMatch("0 9 * * *", new Date("2026-07-12T15:00:00.000Z"), "America/Toronto"),
    new Date("2026-07-12T13:00:00.000Z")
  );
});

test("spring-forward nonexistent local time advances explicitly", () => {
  const next = nextCronMatch("30 2 * * *", new Date("2026-03-08T05:00:00.000Z"), "America/Toronto");
  assert.equal(next.toISOString(), "2026-03-08T07:30:00.000Z");
});
