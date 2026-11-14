/**
 * Step 2: captioned App Store screenshots at the exact upload sizes, as opaque JPEGs (no alpha channel),
 * in fastlane deliver's layout (fastlane/screenshots/<locale>/ for iPad, fastlane/screenshots_mac/<locale>/).
 * The frame is an HTML template rendered by Chromium: brand ink background, caption, the capture inset with
 * rounded corners. Same renderer for both locales; captions from scenes.ts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { jpegSize } from "../scripts/png.mjs";
import { FRAME, LOCALES, outPath, PLATFORMS, SCENES, SIZES } from "./scenes";

const RAW = fileURLToPath(new URL("./out/raw/", import.meta.url));
const FASTLANE = fileURLToPath(new URL("../fastlane/", import.meta.url));

export function frameHtml(opts: {
  width: number;
  height: number;
  caption: string;
  image: string;
  dark: boolean;
}) {
  const cap = Math.round(opts.height * FRAME.captionHeight);
  const inset = Math.round(opts.width * FRAME.inset);
  const esc = opts.caption.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&display=block" rel="stylesheet">
<style>
  html,body{margin:0;width:${opts.width}px;height:${opts.height}px;overflow:hidden}
  body{background:radial-gradient(120% 90% at 50% 0%,#2a1f3d 0%,#0b0a10 60%);display:flex;flex-direction:column;align-items:center}
  h1{margin:0;height:${cap}px;display:flex;align-items:center;justify-content:center;color:#f6f1e8;
     font:600 ${Math.round(cap * 0.36)}px/1.1 Fraunces,Georgia,serif;letter-spacing:-.01em;text-align:center;padding:0 ${inset}px}
  h1 span{color:#e0557a}
  .shot{width:${opts.width - inset * 2}px;height:${opts.height - cap - inset}px;border-radius:${Math.round(opts.width * 0.012)}px;
     background:#000 url('${opts.image}') top center/cover no-repeat;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 2px rgba(255,255,255,.06)}
</style></head><body><h1>${esc}</h1><div class="shot"></div></body></html>`;
}

async function main() {
  const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox"] });
  try {
    for (const platform of PLATFORMS) {
      const { out } = SIZES[platform];
      const page = await browser.newPage({
        viewport: { width: out.width, height: out.height },
        deviceScaleFactor: 1,
      });
      for (const locale of LOCALES) {
        for (const scene of SCENES) {
          const raw = readFileSync(`${RAW}${platform}/${locale}/${scene.id}.png`).toString("base64");
          await page.setContent(
            frameHtml({
              ...out,
              caption: scene.caption[locale],
              image: `data:image/png;base64,${raw}`,
              dark: !!scene.dark,
            }),
            { waitUntil: "networkidle" },
          );
          await page.evaluate(() => document.fonts.ready);
          const target = FASTLANE + outPath(platform, locale, scene.id);
          mkdirSync(dirname(target), { recursive: true });
          const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
          const got = jpegSize(jpg);
          if (got.width !== out.width || got.height !== out.height) {
            throw new Error(`${target}: ${got.width}×${got.height}, expected ${out.width}×${out.height}`);
          }
          writeFileSync(target, jpg);
          console.log(`composed ${target.slice(FASTLANE.length)}`);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
