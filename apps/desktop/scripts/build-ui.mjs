#!/usr/bin/env node
// Builds the UI that ships *inside* the app, standalone (no TDJ server needed), without touching apps/web:
//   1. copy apps/web/src + public + configs into a scratch folder next to it (same node_modules, same @tdj/core),
//   2. drop the route handlers (src/app/api/**): a static export cannot hold them. In the app the same handlers
//      (src/lib/api/*) answer on the device, in a Web Worker, through the client adapter (src/lib/app/adapter.ts),
//   3. `next build` with `output: "export"` and TDJ_TARGET=app → plain HTML/JS/CSS,
//   4. inject the bridge shim (ui/bridge-shim.js) as the first script of every page,
//   5. copy the catalogue the engine reads (DATA_FILES of packages/core/src/data.ts) to tdj-data/,
//   6. write the result, plus the app's own pages (ui/static), to apps/desktop/ui/dist (Tauri's frontendDist),
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
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { writeDeviceRoutes } from "../../web/scripts/device-routes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = join(here, "..");
const repo = join(desktop, "..", "..");
const web = join(desktop, "..", "web");
const scratch = join(desktop, "..", ".tdj-app-ui"); // sibling of apps/web so ../../ paths and node_modules resolve
const out = join(desktop, "ui", "dist");
const keep = process.argv.includes("--keep");

export const SHIM_TAG = '<script src="/tdj-bridge-shim.js"></script>';
/** Where the adapter fetches the catalogue from (src/lib/app/adapter.ts → DATA_BASE). */
export const DATA_DIR = "tdj-data";
/** The animation player's WebAssembly at the bundle root (src/lib/app/boot.ts). */
export const WASM_FILE = "dotlottie-player.wasm";

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

/** The data files the engine loads, read from packages/core/src/data.ts (one list for the server and the app). */
export function dataFiles(src = readFileSync(join(repo, "packages/core/src/data.ts"), "utf8")) {
  const block = src.slice(src.indexOf("export const DATA_FILES"), src.indexOf("} as const;"));
  return [...block.matchAll(/"(data\/[^"]+\.json)"/g)].map((m) => m[1]);
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
  // the server routes the app runs unchanged on the device: copied with their server imports pointed at the device
  // modules (src/lib/app/server/*), before the route folders go (apps/web/scripts/device-routes.mjs)
  rmSync(join(scratch, "src", "lib", "app", "__device__"), { recursive: true, force: true });
  writeDeviceRoutes(join(web, "src"), join(scratch, "src", "lib", "app"));
  rmSync(join(scratch, "src", "app", "api"), { recursive: true, force: true });
  // the owner's page manages a deployment's secrets: an app has none
  rmSync(join(scratch, "src", "app", "admin"), { recursive: true, force: true });
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
  typescript: { ignoreBuildErrors: true },
  env: { NEXT_PUBLIC_TDJ_TARGET: "app" },
};
`,
  );
  const r = spawnSync("npx", ["next", "build"], {
    cwd: scratch,
    stdio: "inherit",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", TDJ_TARGET: "app", NEXT_PUBLIC_TDJ_TARGET: "app" },
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
  // the animation player's WebAssembly, served from the app instead of a CDN (src/lib/app/boot.ts → setWasmUrl)
  const req = createRequire(createRequire(join(web, "package.json")).resolve("@lottiefiles/dotlottie-react"));
  const wasm = join(dirname(req.resolve("@lottiefiles/dotlottie-web")), "dotlottie-player.wasm");
  cpSync(wasm, join(out, WASM_FILE));
  let bytes = 0;
  for (const rel of dataFiles()) {
    const from = join(repo, rel);
    if (!existsSync(from)) continue;
    const to = join(out, DATA_DIR, rel);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    bytes += statSync(from).size;
  }
  const commit =
    spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout?.trim() || null;
  writeFileSync(
    join(out, "tdj-bundle.json"),
    `${JSON.stringify({ commit, builtAt: new Date().toISOString(), standalone: true }, null, 2)}\n`,
  );
  let pages = 0;
  walk(out, (p) => {
    if (!p.endsWith(".html")) return;
    writeFileSync(p, injectShim(readFileSync(p, "utf8")));
    pages++;
  });
  if (!keep) rmSync(scratch, { recursive: true, force: true });
  console.log(
    `bundled UI: ${pages} pages, catalogue ${(bytes / 1e6).toFixed(1)} MB → ${relative(process.cwd(), out)}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
