#!/usr/bin/env node
/**
 * Makes the App Store listing "live" everywhere once App Review approves the app:
 *   - README.md: removes every `<!-- app-store:coming-soon … -->` marker line and every line carrying
 *     `data-store-status="coming-soon"` (the "Coming to the App Store" notes, English and Turkish), and drops
 *     ", coming soon" / ", yakında" from the official badges' alt text;
 *   - package.json → release.appStoreLive = true, so Settings → About and the release notes link the store.
 * Idempotent. Usage: node scripts/release/readme-store-badge.mjs [README.md] [package.json]
 */
import { readFileSync, writeFileSync } from "node:fs";

export function flipStoreBadge(md) {
  return md
    .split("\n")
    .filter(
      (l) => !l.includes("<!-- app-store:coming-soon") && !l.includes('data-store-status="coming-soon"'),
    )
    .join("\n")
    .replace(/ \(coming soon\)"/g, '"')
    .replace(/ \(yakında\)"/g, '"');
}

/** package.json text with release.appStoreLive = true (formatting kept). */
export function flipPackage(text) {
  return text.replace(/("appStoreLive":\s*)false/, "$1true");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] ?? "README.md";
  const pkg = process.argv[3] ?? "package.json";
  const before = readFileSync(file, "utf8");
  const after = flipStoreBadge(before);
  if (after !== before) writeFileSync(file, after);
  const p0 = readFileSync(pkg, "utf8");
  const p1 = flipPackage(p0);
  if (p1 !== p0) writeFileSync(pkg, p1);
  console.log(after !== before || p1 !== p0 ? "App Store badges and links are live" : "already live");
}
