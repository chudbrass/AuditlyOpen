import assert from "node:assert/strict";
import test from "node:test";
import { hasSameOrigin, isStrongAuditlyPassword } from "./security";

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
