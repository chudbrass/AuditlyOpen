import { load } from "cheerio";
import assert from "node:assert/strict";
import { test } from "node:test";
import { findTextMatches } from "./textSearch";

test("matches a literal phrase across inline HTML and normalizes layout whitespace", () => {
  const html = load('<p>Read <strong>WHAT</strong>’s next? &amp; learn.</p><p>Read what’s&nbsp;next?</p><script>Read what’s next?</script><span hidden>Read what’s next?</span>');
  const result = findTextMatches(html, " read what’s   next? ");
  assert.equal(result.count, 2);
  assert.deepEqual(result.excerpts.map(({ match }) => match), ["Read WHAT’s next?", "Read what’s next?"]);
  assert.equal(findTextMatches(html, "learn. Read").count, 1);
  assert.equal(findTextMatches(html, "learnX").count, 0);
});

test("counts every occurrence and keeps the first five excerpts", () => {
  const html = load("<p>A+B ".repeat(7));
  const result = findTextMatches(html, "a+b");
  assert.equal(result.count, 7);
  assert.equal(result.excerpts.length, 5);
});
