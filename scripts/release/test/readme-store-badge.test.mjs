import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { flipStoreBadge } from "../readme-store-badge.mjs";

test("the README's App Store badge is marked coming soon, and the flip makes it live once", () => {
  const md = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");
  assert.match(md, /<!-- app-store:coming-soon/);
  assert.match(md, /https:\/\/apps\.apple\.com\/app\/id6834924534/);
  const live = flipStoreBadge(md);
  assert.doesNotMatch(live, /coming-soon|coming soon/i);
  assert.match(live, /https:\/\/apps\.apple\.com\/app\/id6834924534/);
  assert.equal(flipStoreBadge(live), live);
});
