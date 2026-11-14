#!/usr/bin/env node
// App icons for every size from the brand mark (brand/logo-app-icon.svg geometry, redrawn on the platform grids):
//   src-tauri/icons/src/macos.svg → icon.icns, icon.png, 32/128/128@2x PNGs (macOS grid with margin + shadow)
//   src-tauri/icons/src/ios.svg   → icons/ios/AppIcon-*.png (full-bleed, opaque; copied into the Xcode asset
//                                    catalog by scripts/release/mac-build.sh after `tauri ios init`)
// Runs on Linux: `pnpm --filter @tdj/desktop icons`. The generated files are committed.
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { flattenAlpha } from "./png.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const icons = join(root, "src-tauri", "icons");
const tauri = (args) => {
  const r = spawnSync("npx", ["tauri", "icon", ...args], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// macOS + defaults
tauri([join(icons, "src", "macos.svg"), "-o", icons]);
// iPadOS: separate full-bleed source, opaque background
const tmp = mkdtempSync(join(tmpdir(), "tdj-icons-"));
tauri([join(icons, "src", "ios.svg"), "-o", tmp, "--ios-color", "#0B0A10"]);
rmSync(join(icons, "ios"), { recursive: true, force: true });
cpSync(join(tmp, "ios"), join(icons, "ios"), { recursive: true });
rmSync(tmp, { recursive: true, force: true });
// App Store Connect rejects iOS icons with an alpha channel: flatten every one onto the ink colour
for (const name of readdirSync(join(icons, "ios"))) {
  const p = join(icons, "ios", name);
  writeFileSync(p, flattenAlpha(readFileSync(p), [0x0b, 0x0a, 0x10]));
}
// keep only what Apple builds use (no Android/Windows store tiles)
for (const name of readdirSync(icons)) {
  if (
    name === "android" ||
    /^Square\d+x\d+Logo\.png$/.test(name) ||
    name === "StoreLogo.png" ||
    name === "64x64.png"
  ) {
    rmSync(join(icons, name), { recursive: true, force: true });
  }
}
console.log("icons written to", icons);
