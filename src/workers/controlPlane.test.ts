import assert from "node:assert/strict";
import test from "node:test";
import { readinessStatus } from "@/lib/readiness";
import { shouldTerminateWorker, FATAL_WORKER_EXIT_CODE } from "@/lib/workerFatalPolicy";
import { globalSettingsSchema, GLOBAL_SETTINGS_DEFAULTS } from "@/lib/validation/settings";

test("settings are fully typed and reject unsafe values", () => {
  assert.deepEqual(globalSettingsSchema.parse(GLOBAL_SETTINGS_DEFAULTS), GLOBAL_SETTINGS_DEFAULTS);
  assert.equal(globalSettingsSchema.safeParse({ ...GLOBAL_SETTINGS_DEFAULTS, defaultMaxPages: 0 }).success, false);
});

test("readiness requires both database and worker", () => {
  assert.equal(readinessStatus(true, true), 200);
  assert.equal(readinessStatus(true, false), 503);
  assert.equal(readinessStatus(false, true), 503);
});

test("fatal worker errors require supervisor restart", () => {
  assert.equal(shouldTerminateWorker("uncaughtException"), true);
  assert.equal(FATAL_WORKER_EXIT_CODE, 1);
});
