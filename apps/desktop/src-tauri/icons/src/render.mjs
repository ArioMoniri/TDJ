#!/usr/bin/env node
// Full-colour icon set from the vector sources, rendered by headless Chromium (Playwright):
//   macos.svg → icon.icns (PNG-based: 16…1024), icon.png (512), 32x32, 128x128, 128x128@2x
//   ios.svg   → ios/AppIcon-*.png, opaque RGB (App Store Connect rejects alpha), incl. the 1024 store icon
//   (media/social-preview.png and the store banner come from apps/desktop/store/banner.ts: `pnpm store:banner`)
// Replaces the `tauri icon` output, whose PNGs came out palette-quantised (≈400 colours: banded tile gradient,
// purple-shifted ink). icon.ico (Windows) is left alone.
//   node apps/desktop/src-tauri/icons/src/render.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = dirname(fileURLToPath(import.meta.url));
const icons = join(src, "..");
const repo = join(icons, "..", "..", "..", "..");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TDJ_PLAYWRIGHT ?? "playwright");
const { flattenAlpha, info } = await import(join(repo, "apps", "desktop", "scripts", "png.mjs"));

function chromiumPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const base = "/opt/pw-browsers";
  if (!existsSync(base)) return undefined;
  const dir = readdirSync(base)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .pop();
  const exe = dir && join(base, dir, "chrome-linux", "chrome");
  return exe && existsSync(exe) ? exe : undefined;
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
/** Render an SVG file to a PNG of w × h px (transparent where the SVG is). */
async function render(file, w, h = w) {
  const svg = readFileSync(join(src, file), "utf8").replace(/<svg /, `<svg width="${w}" height="${h}" `);
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`,
  );
  const png = await page.screenshot({
    type: "png",
    omitBackground: true,
    clip: { x: 0, y: 0, width: w, height: h },
  });
  await page.close();
  return png;
}

try {
  // macOS
  const mac = {};
  for (const s of [16, 32, 64, 128, 256, 512, 1024]) mac[s] = await render("macos.svg", s);
  writeFileSync(join(icons, "32x32.png"), mac[32]);
  writeFileSync(join(icons, "128x128.png"), mac[128]);
  writeFileSync(join(icons, "128x128@2x.png"), mac[256]);
  writeFileSync(join(icons, "icon.png"), mac[512]);
  const entries = [
    ["icp4", 16],
    ["icp5", 32],
    ["ic11", 32],
    ["ic12", 64],
    ["ic07", 128],
    ["ic08", 256],
    ["ic13", 256],
    ["ic09", 512],
    ["ic14", 512],
    ["ic10", 1024],
  ].map(([type, s]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "latin1");
    head.writeUInt32BE(8 + mac[s].length, 4);
    return Buffer.concat([head, mac[s]]);
  });
  const body = Buffer.concat(entries);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "latin1");
  head.writeUInt32BE(8 + body.length, 4);
  writeFileSync(join(icons, "icon.icns"), Buffer.concat([head, body]));

  // iOS / iPadOS: same file names as the committed set, sizes from the names
  for (const name of readdirSync(join(icons, "ios")).filter((n) => n.endsWith(".png"))) {
    const m = name.match(/^AppIcon-(?:([\d.]+)x[\d.]+@(\d)x(?:-1)?|512@2x)\.png$/);
    if (!m) continue;
    const px = m[1] ? Math.round(Number(m[1]) * Number(m[2])) : 1024;
    const png = flattenAlpha(await render("ios.svg", px), [0x0b, 0x0a, 0x10]);
    if (info(png).alpha) throw new Error(`${name} still has alpha`);
    writeFileSync(join(icons, "ios", name), png);
  }

  console.log("icons written");
} finally {
  await browser.close();
}
