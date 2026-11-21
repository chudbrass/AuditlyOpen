import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { acquireControlLease } from "./controlLease";

test("duplicate workers cannot both acquire the same live leadership lease", async (t) => {
  if (!process.env.DATABASE_URL) return t.skip("DATABASE_URL is not configured");
  const key = `test:${randomUUID()}`;
  try {
    const now = new Date();
    const results = await Promise.all([
      acquireControlLease(key, "worker-a", 30_000, now),
      acquireControlLease(key, "worker-b", 30_000, now),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    const winner = results[0] ? "worker-a" : "worker-b";
    assert.equal(await acquireControlLease(key, winner, 30_000, now), true);
  } finally {
    await prisma.controlLease.deleteMany({ where: { key } });
  }
});
