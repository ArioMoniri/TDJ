import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { flipPackage, flipStoreBadge } from "../readme-store-badge.mjs";
import { readRelease } from "../version.mjs";

const README = readFileSync(new URL("../../../README.md", import.meta.url), "utf8");

test("the README's App Store badges are marked coming soon, and the flip makes them live once", () => {
  const { appStoreUrl, macAppStoreUrl } = readRelease();
  assert.match(README, /<!-- app-store:coming-soon/);
  assert.ok(README.includes(appStoreUrl), "links the App Store listing from the root package.json's ID");
  assert.ok(README.includes(macAppStoreUrl));
  const live = flipStoreBadge(README);
  assert.doesNotMatch(live, /coming-soon|coming soon|yakında/i);
  assert.ok(live.includes(appStoreUrl));
  assert.equal(flipStoreBadge(live), live);
});

test("Apple's official badges, unmodified files, English and Turkish, black with a white one for dark mode", () => {
  for (const name of [
    "download-on-the-app-store-black-en-us",
    "download-on-the-app-store-white-en-us",
    "download-on-the-mac-app-store-black-en-us",
    "download-on-the-mac-app-store-white-en-us",
    "download-on-the-app-store-black-tr-tr",
    "download-on-the-app-store-white-tr-tr",
    "download-on-the-mac-app-store-black-tr-tr",
    "download-on-the-mac-app-store-white-tr-tr",
  ]) {
    const p = new URL(`../../../media/badges/${name}.svg`, import.meta.url);
    assert.ok(existsSync(p), name);
    const svg = readFileSync(p, "utf8");
    // Apple's own artwork carries its file title; nothing scripted inside
    assert.match(svg, /<title>Download_on_the_(Mac_)?App_Store_Badge/);
    assert.doesNotMatch(svg, /<script|onload=/);
    // the README is in English: its English badges are used there; the Turkish ones ship for the Turkish store page
    if (name.endsWith("en-us"))
      assert.ok(README.includes(`media/badges/${name}.svg`), `${name} is used in the README`);
  }
  // onscreen minimum: 40 px high
  for (const m of README.matchAll(/<img[^>]+media\/badges\/[^>]+>/g)) assert.match(m[0], /height="40"/);
});

test("the flip also turns the store links on in package.json", () => {
  const pkg = '{\n  "release": {\n    "appStoreLive": false\n  }\n}\n';
  assert.match(flipPackage(pkg), /"appStoreLive": true/);
  assert.equal(flipPackage(flipPackage(pkg)), flipPackage(pkg));
});
