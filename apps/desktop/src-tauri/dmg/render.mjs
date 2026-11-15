#!/usr/bin/env node
// DMG window art: background.svg → background.png (660 × 400) and background@2x.png (1320 × 800), rendered by
// headless Chromium (Playwright), then a check that Finder's icon labels stay legible in both appearances.
//   node apps/desktop/src-tauri/dmg/render.mjs [--preview out.png]
// --preview also renders a mock of the Finder window (light and dark side by side) with the icons placed where
// tauri.conf.json bundle.macOS.dmg puts them.
// Chromium: PLAYWRIGHT_CHROMIUM (default /opt/pw-browsers/chromium… in cloud sessions, else Playwright's own).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tauriDir = join(here, "..");
const W = 660;
const H = 400;

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TDJ_PLAYWRIGHT ?? "playwright");

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

const svg = readFileSync(join(here, "background.svg"), "utf8");
const conf = JSON.parse(readFileSync(join(tauriDir, "tauri.conf.json"), "utf8"));
const dmg = conf.bundle.macOS.dmg;

const page = (body, w, h) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}</style></head><body>${body}</body></html>`;

const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Worst-case contrast of black (light mode) and white (dark mode) label text over the label rail. */
async function labelCheck(p, png) {
  const rails = [dmg.appPosition, dmg.applicationFolderPosition].map(({ x, y }) => [x - 60, y + 68, 121, 27]);
  const pixels = await p.evaluate(
    async ({ src, rails }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      return rails.map(([x, y, w, h]) => Array.from(g.getImageData(x, y, w, h).data));
    },
    { src: `data:image/png;base64,${png.toString("base64")}`, rails },
  );
  let lo = 1;
  let hi = 0;
  for (const d of pixels) {
    for (let i = 0; i < d.length; i += 4) {
      const l = lum(d[i], d[i + 1], d[i + 2]);
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
    }
  }
  return { black: contrast(lo, 0), white: contrast(hi, 1) };
}

// ---- Finder window mock
const folderSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6CC4F8"/><stop offset="1" stop-color="#3A9BEA"/></linearGradient></defs>
  <path d="M10 30 Q10 22 18 22 H48 L56 30 H110 Q118 30 118 38 V100 Q118 108 110 108 H18 Q10 108 10 100 Z" fill="#2F8BD9"/>
  <rect x="10" y="38" width="108" height="70" rx="8" fill="url(#f)"/>
  <g fill="none" stroke="#1D6FB8" stroke-opacity=".75" stroke-width="5" stroke-linecap="round">
    <path d="M64 52 L50 92 M64 52 L78 92 M54 80 H74"/><path d="M44 92 H52 M76 92 H84" stroke-width="4"/>
  </g></svg>`;

function finderWindow(dark, appIconUri) {
  const bar = dark ? "#353438" : "#E8E6E8";
  const titleColor = dark ? "#E6E6E6" : "#3C3C3C";
  const label = dark ? "#FFFFFF" : "#000000";
  const icon = (pos, inner, name) =>
    `<div style="position:absolute;left:${pos.x - 64}px;top:${pos.y - 64}px;width:128px;text-align:center">
       <div style="width:128px;height:128px">${inner}</div>
       <div style="margin-top:6px;font:500 13px/16px Inter,-apple-system,sans-serif;color:${label}">${name}</div></div>`;
  return `<div style="position:relative;width:${W}px;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,${dark ? 0.6 : 0.18}),0 22px 50px rgba(0,0,0,.35);background:${bar}">
    <div style="height:28px;display:flex;align-items:center;position:relative">
      <div style="display:flex;gap:8px;margin-left:12px">${["#FF5F57", "#FEBC2E", "#28C840"].map((c) => `<span style="width:12px;height:12px;border-radius:50%;background:${c};display:block"></span>`).join("")}</div>
      <div style="position:absolute;left:0;right:0;text-align:center;font:600 13px Inter,-apple-system,sans-serif;color:${titleColor}">TDJ</div>
    </div>
    <div style="position:relative;width:${W}px;height:${H}px">
      <img src="data:image/png;base64,${readFileSync(join(here, "background@2x.png")).toString("base64")}" width="${W}" height="${H}" style="display:block">
      ${icon(dmg.appPosition, `<img src="${appIconUri}" width="128" height="128">`, conf.productName ?? "TDJ")}
      ${icon(dmg.applicationFolderPosition, folderSvg, "Applications")}
    </div></div>`;
}

const browser = await chromium.launch({ executablePath: chromiumPath() });
try {
  for (const [scale, name] of [
    [1, "background.png"],
    [2, "background@2x.png"],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
    const p = await ctx.newPage();
    await p.setContent(page(svg, W, H));
    const png = await p.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } });
    writeFileSync(join(here, name), png);
    if (scale === 1) {
      const c = await labelCheck(p, png);
      const ok = c.black >= 4.5 && c.white >= 4.5;
      console.log(
        `${name}: label rail contrast black ${c.black.toFixed(2)} (light Finder), white ${c.white.toFixed(2)} (dark Finder) ${ok ? "ok" : "FAIL"}`,
      );
      if (!ok) process.exitCode = 1;
    } else console.log(name);
    await ctx.close();
  }

  const i = process.argv.indexOf("--preview");
  if (i > 0) {
    const out = process.argv[i + 1];
    const appIcon = `data:image/png;base64,${readFileSync(join(tauriDir, "icons", "128x128@2x.png")).toString("base64")}`;
    const pw = W * 2 + 120;
    const ph = H + 28 + 140;
    const ctx = await browser.newContext({ viewport: { width: pw, height: ph }, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    const caption = (t, c) =>
      `<div style="font:600 13px Inter,sans-serif;color:${c};margin:0 0 12px 4px;letter-spacing:.02em">${t}</div>`;
    await p.setContent(
      page(
        `<div style="display:flex;width:${pw}px;height:${ph}px">
          <div style="flex:1;background:linear-gradient(160deg,#dfe6ef,#c9d3e0);padding:40px 0 0 40px">${caption("Finder · light appearance", "#333")}${finderWindow(false, appIcon)}</div>
          <div style="flex:1;background:linear-gradient(160deg,#1d2230,#0f1219);padding:40px 0 0 20px">${caption("Finder · dark appearance", "#ddd")}${finderWindow(true, appIcon)}</div>
        </div>`,
        pw,
        ph,
      ),
    );
    await p.screenshot({ path: out, type: "png" });
    await ctx.close();
    console.log("preview", out);
  }
} finally {
  await browser.close();
}
