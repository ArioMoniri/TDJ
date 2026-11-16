/**
 * Step 2: captioned App Store screenshots at the exact upload sizes, as opaque JPEGs (no alpha channel), in
 * fastlane deliver's layout (scenes.ts → outPath). The frame is an HTML page rendered by Chromium: the brand's ink
 * ground with a rose glow and faint record grooves, one headline and one short line over the real capture in a
 * plain device body (iPhone, iPad) or a window (Mac). Fonts are the app's own (Fraunces, Inter; @fontsource files,
 * so no network). docs/design/store-assets.md has the reasoning.
 * Flags: --devices=iphone69  --scenes=02_booth  --locales=tr
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { jpegSize } from "../scripts/png.mjs";
import { DEVICES, type Device, LOCALES, type Locale, outPath, SIZES, type Size, scenesFor } from "./scenes";

const RAW = fileURLToPath(new URL("./out/raw/", import.meta.url));
const FASTLANE = fileURLToPath(new URL("../fastlane/", import.meta.url));
const arg = (k: string) =>
  process.argv
    .find((a) => a.startsWith(`--${k}=`))
    ?.split("=")[1]
    ?.split(",");

/** Brand colours (brand/README.md). */
export const BRAND = { ink: "#0B0A10", rose: "#E0557A", cream: "#F6F1E8", glow: "#3A1420" } as const;

/** @font-face rules for Fraunces 600 and Inter 500/600 (latin + latin-ext: Turkish ğ ş ı İ), as data URLs. */
export function fontFaces(): string {
  const req = createRequire(join(fileURLToPath(new URL("../../web/package.json", import.meta.url))));
  const face = (family: string, pkg: string, file: string, weight: number) => {
    const p = join(dirname(req.resolve(`${pkg}/package.json`)), "files", file);
    return `@font-face{font-family:"${family}";font-weight:${weight};font-display:block;src:url(data:font/woff2;base64,${readFileSync(p).toString("base64")}) format("woff2")}`;
  };
  return [
    face("Fraunces", "@fontsource/fraunces", "fraunces-latin-600-normal.woff2", 600),
    face("Fraunces", "@fontsource/fraunces", "fraunces-latin-ext-600-normal.woff2", 600),
    face("Inter", "@fontsource/inter", "inter-latin-500-normal.woff2", 500),
    face("Inter", "@fontsource/inter", "inter-latin-ext-500-normal.woff2", 500),
    face("Inter", "@fontsource/inter", "inter-latin-600-normal.woff2", 600),
    face("Inter", "@fontsource/inter", "inter-latin-ext-600-normal.woff2", 600),
  ].join("\n");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** The ground every store image shares: ink, a rose glow, record grooves off one corner. */
export function ground(w: number, h: number, corner: "right" | "bottom" = "right"): string {
  const cx = corner === "right" ? w * 1.02 : w * 0.5;
  const cy = corner === "right" ? h * 0.5 : h * 1.08;
  const r = Math.max(w, h) * 0.9;
  const unit = Math.max(6, Math.round(Math.min(w, h) / 160));
  return `background:
    radial-gradient(${Math.round(r * 0.55)}px ${Math.round(r * 0.55)}px at ${cx}px ${cy}px, ${BRAND.glow} 0%, transparent 70%),
    repeating-radial-gradient(circle at ${cx}px ${cy}px, rgba(246,241,232,.045) 0 1.5px, transparent 1.5px ${unit}px),
    radial-gradient(120% 80% at 50% 0%, #17121f 0%, ${BRAND.ink} 60%);`;
}

/** The iOS status bar, Dynamic Island and home indicator drawn over the capture's safe areas (k: canvas px per CSS px). */
export function statusBar(size: Pick<Size, "kind" | "safe">, k: number, dark: boolean): string {
  if (size.kind === "mac" || !size.safe.top) return "";
  const c = dark ? "#fff" : "#000";
  const phone = size.kind === "phone";
  const h = size.safe.top * k;
  const fs = (phone ? 17 : 13) * k;
  const pad = (phone ? 34 : 22) * k;
  const icons = `<svg viewBox="0 0 76 14" height="${Math.round(fs * 0.78)}" fill="${c}"><rect x="0" y="9" width="3.2" height="5" rx="1"/><rect x="5" y="6.5" width="3.2" height="7.5" rx="1"/><rect x="10" y="4" width="3.2" height="10" rx="1"/><rect x="15" y="1.5" width="3.2" height="12.5" rx="1"/><path d="M31 3.6a10.6 10.6 0 0 1 7.6 3.1l1.3-1.4a12.6 12.6 0 0 0-17.8 0l1.3 1.4A10.6 10.6 0 0 1 31 3.6zm0 3.7a6.9 6.9 0 0 1 4.9 2l1.3-1.4a8.9 8.9 0 0 0-12.4 0l1.3 1.4a6.9 6.9 0 0 1 4.9-2zm0 3.7a3.2 3.2 0 0 1 2.2.9L31 14l-2.2-2.1a3.2 3.2 0 0 1 2.2-.9z"/><rect x="46.5" y="1" width="25" height="12" rx="3.6" fill="none" stroke="${c}" stroke-opacity=".4"/><rect x="48.5" y="3" width="21" height="8" rx="2"/><path d="M73 5v4a2.2 2.2 0 0 0 0-4z" fill-opacity=".45"/></svg>`;
  const top = phone ? (size.safe.top - 37) / 2 + 2 : (size.safe.top - fs / k) / 2;
  return `<div style="position:absolute;inset:0 0 auto 0;height:${h}px;display:flex;align-items:${phone ? "center" : "flex-start"};justify-content:space-between;padding:${phone ? 0 : top * k}px ${pad}px 0;box-sizing:border-box;color:${c};font:600 ${fs}px/1 Inter,system-ui,sans-serif;letter-spacing:-.01em;pointer-events:none">
  <span style="${phone ? `width:${110 * k}px;text-align:center` : ""}">9:41</span><span style="display:flex;${phone ? `width:${110 * k}px;justify-content:center` : ""}">${icons}</span></div>
  ${phone ? `<div style="position:absolute;top:${(top - 1) * k}px;left:50%;width:${126 * k}px;height:${37 * k}px;margin-left:${-63 * k}px;background:#000;border-radius:${19 * k}px"></div>` : ""}
  <div style="position:absolute;bottom:${8 * k}px;left:50%;width:${(phone ? 140 : 320) * k}px;height:${5 * k}px;margin-left:${-(phone ? 70 : 160) * k}px;background:${c};opacity:.85;border-radius:${3 * k}px"></div>`;
}

export function frameHtml(opts: {
  size: Pick<Size, "kind" | "out" | "safe" | "width">;
  title: string;
  sub: string;
  image: string;
  dark: boolean;
  fonts?: string;
}) {
  const { width: W, height: H } = opts.size.out;
  const kind = opts.size.kind;
  const portrait = kind !== "mac";
  // text block, then the device: the capture keeps its own aspect (the canvas's), scaled to fit what is left
  const textH = Math.round(H * (kind === "phone" ? 0.205 : kind === "tablet" ? 0.165 : 0.2));
  const foot = Math.round(H * (portrait ? 0.03 : 0.05));
  const devH = H - textH - foot;
  const devW = Math.round((devH * W) / H);
  const bezel = kind === "phone" ? Math.round(devW * 0.022) : kind === "tablet" ? Math.round(devW * 0.02) : 0;
  const radius =
    kind === "phone"
      ? Math.round(devW * 0.14)
      : kind === "tablet"
        ? Math.round(devW * 0.045)
        : Math.round(W * 0.008);
  const inner = Math.max(0, radius - bezel);
  const titlePx = Math.round(kind === "phone" ? W * 0.083 : kind === "tablet" ? W * 0.058 : H * 0.066);
  const subPx = Math.round(kind === "phone" ? W * 0.037 : kind === "tablet" ? W * 0.025 : H * 0.03);
  const body =
    kind === "mac"
      ? `background:#000;border-radius:${radius}px;box-shadow:0 ${Math.round(H * 0.03)}px ${Math.round(H * 0.07)}px rgba(0,0,0,.6),0 0 0 2px rgba(246,241,232,.12)`
      : `background:#050507;border-radius:${radius}px;padding:${bezel}px;box-sizing:border-box;box-shadow:0 ${Math.round(H * 0.02)}px ${Math.round(H * 0.05)}px rgba(0,0,0,.65),0 0 0 ${Math.max(2, Math.round(W * 0.002))}px #2b2a31,inset 0 0 0 ${Math.max(1, Math.round(W * 0.001))}px #3a3940`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${opts.fonts ?? ""}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden}
body{${ground(W, H, portrait ? "bottom" : "right")}display:flex;flex-direction:column;align-items:center}
header{height:${textH}px;width:${Math.round(W * (portrait ? 0.86 : 0.8))}px;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:${Math.round(subPx * 0.55)}px}
h1{margin:0;color:${BRAND.cream};font:600 ${titlePx}px/1.06 Fraunces,Georgia,serif;letter-spacing:-.015em;text-wrap:balance}
p{margin:0;color:rgba(246,241,232,.72);font:500 ${subPx}px/1.3 Inter,system-ui,sans-serif;letter-spacing:-.005em;text-wrap:balance}
p::before{content:"";display:block;width:${Math.round(subPx * 1.6)}px;height:${Math.max(3, Math.round(subPx * 0.09))}px;background:${BRAND.rose};margin:0 auto ${Math.round(subPx * 0.55)}px;border-radius:2px}
.dev{width:${devW}px;height:${devH}px;${body}}
.screen{position:relative;overflow:hidden;width:100%;height:100%;border-radius:${inner}px;background:#000 url('${opts.image}') top center/cover no-repeat}
</style></head><body><header><h1>${esc(opts.title)}</h1><p>${esc(opts.sub)}</p></header><div class="dev"><div class="screen">${statusBar(opts.size, (devW - 2 * bezel) / opts.size.width, opts.dark)}</div></div></body></html>`;
}

async function main() {
  const devices = (arg("devices") as Device[] | undefined) ?? DEVICES;
  const locales = (arg("locales") as Locale[] | undefined) ?? LOCALES;
  const only = arg("scenes");
  const fonts = fontFaces();
  const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
  const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox"] });
  try {
    for (const device of devices) {
      const size = SIZES[device];
      const { out } = size;
      const page = await browser.newPage({
        viewport: { width: out.width, height: out.height },
        deviceScaleFactor: 1,
      });
      for (const locale of locales) {
        for (const scene of scenesFor(device)) {
          if (only && !only.includes(scene.id)) continue;
          const raw = readFileSync(`${RAW}${device}/${locale}/${scene.id}.png`).toString("base64");
          await page.setContent(
            frameHtml({
              size,
              ...scene.caption[locale],
              image: `data:image/png;base64,${raw}`,
              dark: !!scene.dark,
              fonts,
            }),
            { waitUntil: "load" },
          );
          await page.evaluate(() => document.fonts.ready);
          const target = FASTLANE + outPath(device, locale, scene.id);
          mkdirSync(dirname(target), { recursive: true });
          const jpg = await page.screenshot({ type: "jpeg", quality: 88 });
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
