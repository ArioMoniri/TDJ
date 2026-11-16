/**
 * `pnpm store:creative`: every App Store image and video, in one pass, from the app as built.
 *   1. the bundled app UI (`node scripts/build-ui.mjs`; skipped with --reuse-ui when ui/dist is there)
 *   2. captures (capture.ts) → 3. screenshot sets and header images (compose.ts) → 4. app previews (preview.ts)
 *   5. the review page (sheet.ts), then the raw captures are deleted (--keep-raw keeps them).
 * Output: apps/desktop/fastlane/ in deliver's layout, or --out=<dir> for drafts.
 * Flags: --out=<dir> --locales=en-US --sets=iphone69,mac --previews=iphone --no-previews --no-headers --reuse-ui
 *        --keep-raw --skip-capture (compose from the captures already in store/out/creative/raw)
 * Memory: one Chromium at a time, one static server (PORT, default 3986), Remotion at concurrency 1.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { capture, RAW } from "./capture";
import { compose } from "./compose";
import { previews } from "./preview";
import { writeSheet } from "./sheet";
import {
  CAPTURE,
  type CaptureId,
  LOCALES,
  type Locale,
  PREVIEWS,
  type PreviewSpec,
  previewDir,
  SET_IDS,
  SETS,
  type SetId,
} from "./spec";

const DESKTOP = fileURLToPath(new URL("../../", import.meta.url));
const has = (f: string) => process.argv.includes(`--${f}`);
const arg = (k: string) =>
  process.argv
    .find((a) => a.startsWith(`--${k}=`))
    ?.split("=")[1]
    ?.split(",");

/** A fresh set: earlier images of the same set (v1 scene names end in the same set ids) must not go up beside the
 * new ones; the previews' folders hold only this run's videos. */
function clean(out: string, sets: SetId[], locales: Locale[], previewIds: PreviewSpec["id"][]) {
  for (const s of sets)
    for (const l of locales) {
      const d = join(out, SETS[s].dir, l);
      if (existsSync(d)) for (const f of readdirSync(d)) if (f.endsWith(`_${s}.jpg`)) rmSync(join(d, f));
    }
  for (const p of PREVIEWS.filter((x) => previewIds.includes(x.id)))
    for (const l of locales) {
      const d = join(out, previewDir(p), l);
      if (existsSync(d)) for (const f of readdirSync(d)) if (f.includes(p.deliverType)) rmSync(join(d, f));
    }
}

function du(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).reduce((n, f) => {
    const p = join(dir, f);
    const s = statSync(p);
    return n + (s.isDirectory() ? du(p) : s.size);
  }, 0);
}

async function main() {
  const out = arg("out")?.[0] ?? join(DESKTOP, "fastlane");
  const locales = (arg("locales") as Locale[] | undefined) ?? LOCALES;
  const sets = (arg("sets") as SetId[] | undefined) ?? SET_IDS;
  const previewIds = has("no-previews")
    ? []
    : ((arg("previews") as PreviewSpec["id"][] | undefined) ?? PREVIEWS.map((p) => p.id));
  mkdirSync(out, { recursive: true });

  if (!(has("reuse-ui") && existsSync(join(DESKTOP, "ui/dist/index.html"))) && !has("skip-capture")) {
    const r = spawnSync("node", ["scripts/build-ui.mjs"], { cwd: DESKTOP, stdio: "inherit" });
    if (r.status !== 0) throw new Error("the bundled UI did not build");
  }
  const captures = new Set<CaptureId>(sets.map((s) => SETS[s].capture));
  for (const p of PREVIEWS.filter((x) => previewIds.includes(x.id))) captures.add(p.capture);
  if (!has("skip-capture")) await capture({ captures: [...captures].filter((c) => c in CAPTURE), locales });

  clean(out, sets, locales, previewIds);
  await compose({ out, sets, locales, headers: !has("no-headers") });
  if (previewIds.length) await previews({ out, locales, ids: previewIds });
  const sheetFile = writeSheet(out, locales);
  if (!has("keep-raw")) rmSync(RAW, { recursive: true, force: true });
  console.log(`\nstore creative: ${(du(out) / 1e6).toFixed(1)} MB in ${out}\nreview: ${sheetFile}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
