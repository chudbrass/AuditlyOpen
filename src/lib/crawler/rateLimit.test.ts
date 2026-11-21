import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { acquireHostSlot } from "./rateLimit";

test("controlled origin never exceeds the per-host in-flight ceiling", async () => {
  let active = 0;
  let peak = 0;
  const server = createServer((_request, response) => {
    active += 1;
    peak = Math.max(peak, active);
    setTimeout(() => {
      active -= 1;
      response.end("ok");
    }, 40);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await Promise.all(Array.from({ length: 20 }, async () => {
      const release = await acquireHostSlot(`127.0.0.1:${address.port}`, 0);
      try { await fetch(`http://127.0.0.1:${address.port}/`); } finally { release(); }
    }));
    assert.ok(peak <= 5, `peak in-flight requests was ${peak}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
