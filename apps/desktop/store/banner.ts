/**
 * Banners from code, in the store screenshots' style (compose.ts): the ink ground, the dark lockup, one headline,
 * and the real app on a Mac, an iPad and an iPhone (raw captures from capture.ts, en-US).
 *   media/social-preview.png  1280×640  GitHub → Settings → Social preview (PNG, under 1 MB)
 *   media/store-banner.webp   2560×1280 README hero and anywhere a wide banner is needed
 * Run after capture.ts (`pnpm store:shots` runs both). docs/design/store-assets.md.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { BRAND, fontFaces, ground, statusBar } from "./compose";
import { SIZES } from "./scenes";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const RAW = fileURLToPath(new URL("./out/raw/", import.meta.url));
const W = 1280;
const H = 640;

const img = (device: string, scene: string) =>
  `data:image/png;base64,${readFileSync(`${RAW}${device}/en-US/${scene}.png`).toString("base64")}`;

function device(
  kind: "phone" | "tablet" | "mac",
  src: string,
  x: number,
  y: number,
  w: number,
  dark: boolean,
) {
  const size = kind === "phone" ? SIZES.iphone69 : kind === "tablet" ? SIZES.ipad13 : SIZES.mac;
  const h = Math.round((w * size.height) / size.width);
  const bezel = kind === "phone" ? w * 0.03 : kind === "tablet" ? w * 0.022 : 0;
  const radius = kind === "phone" ? w * 0.15 : kind === "tablet" ? w * 0.05 : 8;
  const inner = Math.max(0, radius - bezel);
  const k = (w - 2 * bezel) / size.width;
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h + 2 * bezel}px;padding:${bezel}px;box-sizing:border-box;border-radius:${radius}px;background:${kind === "mac" ? "#000" : "#050507"};box-shadow:0 24px 60px rgba(0,0,0,.7),0 0 0 1.5px ${kind === "mac" ? "rgba(246,241,232,.14)" : "#2b2a31"}">
    <div style="position:relative;overflow:hidden;width:100%;height:100%;border-radius:${inner}px;background:#000 url('${src}') top center/cover no-repeat">${statusBar(size, k, dark)}</div></div>`;
}

export function bannerHtml(fonts: string): string {
  const lockup = readFileSync(`${ROOT}brand/lockup-dark.svg`, "utf8").replace(/<svg /, '<svg height="56" ');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fonts}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{position:relative;${ground(W, H, "right")}}
.copy{position:absolute;left:64px;top:0;bottom:0;width:440px;display:flex;flex-direction:column;justify-content:center;gap:22px}
h1{margin:0;color:${BRAND.cream};font:600 46px/1.06 Fraunces,Georgia,serif;letter-spacing:-.015em}
p{margin:0;color:rgba(246,241,232,.72);font:500 19px/1.4 Inter,system-ui,sans-serif}
.rule{width:56px;height:4px;background:${BRAND.rose};border-radius:2px}
.where{color:rgba(246,241,232,.55);font:600 13px/1 Inter,system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase}
</style></head><body>
<div class="copy">${lockup}<h1>Build a milonga the way a tango DJ does</h1><div class="rule"></div>
<p>Tandas, cortinas and the shape of the night, then play it from the Booth with real gaps between songs.</p>
<div class="where">iPhone · iPad · Mac · Web</div></div>
${device("mac", img("mac", "01_compose"), 630, 64, 610, false)}
${device("tablet", img("ipad13", "03_transition"), 1020, 262, 236, true)}
${device("phone", img("iphone69", "02_booth"), 572, 222, 168, true)}
</body></html>`;
}

async function main() {
  const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox"] });
  const html = bannerHtml(fontFaces());
  try {
    for (const [scale, out] of [
      [1, `${ROOT}media/social-preview.png`],
      [2, `${ROOT}media/.store-banner.png`],
    ] as const) {
      const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      writeFileSync(out, await page.screenshot({ type: "png" }));
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const social = `${ROOT}media/social-preview.png`;
  if (statSync(social).size > 1024 * 1024) {
    // GitHub's limit is 1 MB: fewer colours keep the PNG under it
    execFileSync("ffmpeg", [
      "-loglevel",
      "error",
      "-y",
      "-i",
      social,
      "-vf",
      "split[a][b];[a]palettegen=max_colors=256[p];[b][p]paletteuse=dither=sierra2_4a",
      `${social}.tmp.png`,
    ]);
    execFileSync("mv", [`${social}.tmp.png`, social]);
  }
  execFileSync("ffmpeg", [
    "-loglevel",
    "error",
    "-y",
    "-i",
    `${ROOT}media/.store-banner.png`,
    "-c:v",
    "libwebp",
    "-quality",
    "90",
    `${ROOT}media/store-banner.webp`,
  ]);
  rmSync(`${ROOT}media/.store-banner.png`);
  console.log(
    `media/social-preview.png ${(statSync(social).size / 1024).toFixed(0)} KB · media/store-banner.webp ${(statSync(`${ROOT}media/store-banner.webp`).size / 1024).toFixed(0)} KB`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
