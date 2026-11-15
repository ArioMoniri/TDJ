#!/usr/bin/env node
/**
 * Flips the README's App Store badge from "coming soon" to live once App Review approves the app:
 * removes the `<!-- app-store:coming-soon … -->` marker line and the `data-store-status="coming-soon"` note,
 * and fixes the badge's alt text. Idempotent. Usage: node scripts/release/readme-store-badge.mjs [README.md]
 */
import { readFileSync, writeFileSync } from "node:fs";

export function flipStoreBadge(md) {
  return md
    .split("\n")
    .filter(
      (l) => !l.includes("<!-- app-store:coming-soon") && !l.includes('data-store-status="coming-soon"'),
    )
    .join("\n")
    .replace(
      "Download on the App Store (Mac and iPad), coming soon",
      "Download on the App Store (Mac and iPad)",
    );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2] ?? "README.md";
  const before = readFileSync(file, "utf8");
  const after = flipStoreBadge(before);
  if (after !== before) writeFileSync(file, after);
  console.log(after !== before ? `${file}: App Store badge is live` : `${file}: already live`);
}
