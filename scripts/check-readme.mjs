#!/usr/bin/env node
/**
 * Every local image, video and link in the README (and docs/FEATURES.md) points at a file that exists, and the
 * README's GIFs stay under 4 MB. `pnpm readme:check`; exits 1 with the list of what is missing.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const FILES = ["README.md", "docs/FEATURES.md"];
const GIF_LIMIT = 4 * 1024 * 1024;

const problems = [];
let checked = 0;
for (const f of FILES) {
  const md = readFileSync(join(ROOT, f), "utf8");
  const refs = [
    ...[...md.matchAll(/(?:src|href|srcset)="([^"]+)"/g)].map((m) => m[1]),
    ...[...md.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]),
  ];
  for (const raw of refs) {
    if (/^(https?:|mailto:|#)/.test(raw)) continue;
    const path = decodeURIComponent(raw.split("#")[0]);
    if (!path) continue;
    const abs = resolve(ROOT, dirname(f), path);
    checked++;
    if (!existsSync(abs)) problems.push(`${f}: ${raw} does not exist`);
    else if (f === "README.md" && abs.endsWith(".gif") && statSync(abs).size > GIF_LIMIT)
      problems.push(`${f}: ${raw} is ${(statSync(abs).size / 1048576).toFixed(1)} MB (limit 4 MB)`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`readme: ${checked} local paths, all present`);
