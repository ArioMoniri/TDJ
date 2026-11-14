#!/usr/bin/env node
// Builds the UI that ships *inside* the app (r22-apps-plan.md §3.1, phase 2), without touching apps/web:
//   1. copy apps/web/src + public + configs into a scratch folder next to it (same node_modules, same @tdj/core),
//   2. drop the route handlers (src/app/api/**): in the app they run on the TDJ server, reached through the
//      native API bridge (src-tauri/src/bridge.rs), never in the bundle,
//   3. `next build` with `output: "export"` → plain HTML/JS/CSS,
//   4. inject the bridge shim (ui/bridge-shim.js) as the first script of every page,
//   5. write the result, plus the app's own pages (ui/static), to apps/desktop/ui/dist (Tauri's frontendDist),
//      with the marker tdj-bundle.json that switches the app into bundled mode.
// Usage: node apps/desktop/scripts/build-ui.mjs [--keep]
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");
const web = join(desktop, "..", "web");
const scratch = join(desktop, "..", ".tdj-app-ui"); // sibling of apps/web so ../../ paths and node_modules resolve
const out = join(desktop, "ui", "dist");
const keep = process.argv.includes("--keep");

export const SHIM_TAG = '<script src="/tdj-bridge-shim.js"></script>';

/** Inserts the shim as the first child of <head> (idempotent). */
export function injectShim(html) {
  if (html.includes(SHIM_TAG)) return html;
  return html.replace(/<head([^>]*)>/i, (m) => `${m}${SHIM_TAG}`);
}

/** Removes `export const dynamic = "force-dynamic"` / `revalidate = 0` (static export cannot honour them). */
export function stripDynamic(src) {
  return src
    .replace(/^export const dynamic\s*=\s*["']force-dynamic["'];?\s*$/gm, "")
    .replace(/^export const revalidate\s*=\s*0;?\s*$/gm, "");
}

function walk(dir, fn) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, fn);
    else fn(p);
  }
}

function main() {
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  for (const f of ["src", "public", "tsconfig.json", "postcss.config.mjs", "next-env.d.ts", "package.json"]) {
    if (existsSync(join(web, f))) cpSync(join(web, f), join(scratch, f), { recursive: true });
  }
  // node_modules: link to apps/web's so the exact same dependency versions are used
  spawnSync("ln", ["-s", join(web, "node_modules"), join(scratch, "node_modules")]);
  rmSync(join(scratch, "src", "app", "api"), { recursive: true, force: true });
  // the server build renders per request (CloudFront RSC prefetch fix); the bundle is prerendered once instead
  walk(join(scratch, "src", "app"), (p) => {
    if (!/\.(tsx?|jsx?)$/.test(p)) return;
    const src = readFileSync(p, "utf8");
    const next = stripDynamic(src);
    if (next !== src) writeFileSync(p, next);
  });
  writeFileSync(
    join(scratch, "next.config.mjs"),
    `export default {
  output: "export",
  trailingSlash: false,
  transpilePackages: ["@tdj/core"],
  images: { unoptimized: true },
  agentRules: false,
  // components import *types* from route handlers that are removed here; apps/web's own CI typechecks them
  typescript: { ignoreBuildErrors: true },
  env: { NEXT_PUBLIC_TDJ_APP: "1" },
};
`,
  );
  const r = spawnSync("npx", ["next", "build"], {
    cwd: scratch,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  if (r.status !== 0) {
    console.error("next build (static export) failed; see the output above.");
    process.exit(r.status ?? 1);
  }
  rmSync(out, { recursive: true, force: true });
  cpSync(join(scratch, "out"), out, { recursive: true });
  cpSync(join(desktop, "ui", "bridge-shim.js"), join(out, "tdj-bridge-shim.js"));
  for (const f of readdirSync(join(desktop, "ui", "static"))) {
    if (f !== "index.html") cpSync(join(desktop, "ui", "static", f), join(out, f));
  }
  const commit =
    spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout?.trim() || null;
  writeFileSync(
    join(out, "tdj-bundle.json"),
    `${JSON.stringify({ commit, builtAt: new Date().toISOString() }, null, 2)}\n`,
  );
  let pages = 0;
  walk(out, (p) => {
    if (!p.endsWith(".html")) return;
    writeFileSync(p, injectShim(readFileSync(p, "utf8")));
    pages++;
  });
  if (!keep) rmSync(scratch, { recursive: true, force: true });
  console.log(`bundled UI: ${pages} pages → ${relative(process.cwd(), out)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
