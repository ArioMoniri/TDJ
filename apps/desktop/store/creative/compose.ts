/**
 * Store creative v2, step 2: the screenshot sets and the product page header images.
 *
 * Each set is drawn once as a panorama, eight panels wide (art.ts: one ground, a dance floor that runs through every
 * panel, records turning on the panel edges), with one device per panel at a slight angle and, on some edges, a second
 * device that crosses into the next panel (the Agenda set's overlap). The page is then cut into panels by moving the
 * panorama under a viewport of the exact upload size and taking an opaque JPEG of each.
 * Output: <out>/<set dir>/<locale>/<panel>_<set>.jpg and <out>/product_page/<locale>/<header>.png
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Browser, chromium } from "playwright";
import { flattenAlpha, info, jpegSize } from "../../scripts/png.mjs";
import { bandoneon, bodySize, C, device, fonts, ground, headlineHtml } from "./art";
import { RAW } from "./capture";
import {
  CAPTURE,
  type CaptureId,
  HEADER_COPY,
  HEADERS,
  type HeaderSpec,
  headerFile,
  type Locale,
  lines,
  PANELS,
  plain,
  SETS,
  type SetId,
  SHOTS,
  type ShotSet,
  shotFile,
} from "./spec";

const WORK = fileURLToPath(new URL("../out/creative/work/", import.meta.url));
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

export const rawPath = (cap: CaptureId, locale: Locale, shot: string, full = false) =>
  `${RAW}${cap}/${locale}/${shot}${full ? "-full" : ""}.png`;

const darkShot = (id: string) => !!SHOTS.find((s) => s.id === id)?.dark;

/** per-panel tilt and nudge (Agenda: alternate angles, devices leaning into each other) */
const TILT = [-4, 3.5, -3, 4, -3.5, 3, -4, 3.5];

interface Layout {
  /** headline box: top, font size, width (fractions of H, W) */
  text: { top: number; size: number; width: number };
  main: { w: number; cy: number };
  bridge: { w: number; cy: number; rot: number } | null;
  floorTop: number;
  landscape: boolean;
}

/** the layout of one set, in fractions of the panel (W, H) */
export function layoutFor(set: ShotSet): Layout {
  switch (set.frame) {
    case "phone":
      return {
        text: { top: 0.05, size: 0.096, width: 0.92 },
        main: { w: 0.77, cy: 0.6 },
        bridge: { w: 0.4, cy: 0.72, rot: 9 },
        floorTop: 0.62,
        landscape: false,
      };
    case "duoOuter":
      return {
        text: { top: 0.045, size: 0.088, width: 0.92 },
        main: { w: 0.7, cy: 0.6 },
        bridge: { w: 0.42, cy: 0.7, rot: 9 },
        floorTop: 0.64,
        landscape: false,
      };
    case "tablet":
      return {
        text: { top: 0.04, size: 0.07, width: 0.92 },
        main: { w: 0.86, cy: 0.6 },
        bridge: { w: 0.46, cy: 0.74, rot: 8 },
        floorTop: 0.66,
        landscape: false,
      };
    case "duoInner":
      return {
        text: { top: 0.055, size: 0.06, width: 0.9 },
        main: { w: 0.72, cy: 0.62 },
        bridge: null,
        floorTop: 0.7,
        landscape: true,
      };
    default:
      return {
        text: { top: 0.05, size: 0.07, width: 0.9 },
        main: { w: 0.7, cy: 0.62 },
        bridge: null,
        floorTop: 0.74,
        landscape: true,
      };
  }
}

/** The panorama of one set and locale: n panels side by side. */
export function stripHtml(setId: SetId, locale: Locale, fontCss: string): string {
  const set = SETS[setId];
  const cap = CAPTURE[set.capture];
  const { width: W, height: H } = set.out;
  const n = PANELS.length;
  const L = layoutFor(set);
  const items: string[] = [];
  const src = (shot: string) => pathToFileURL(rawPath(set.capture, locale, shot)).href;
  PANELS.forEach((panel, i) => {
    const x0 = W * i;
    const leftBridge = i > 0 && !!PANELS[i - 1]!.bridge && !!L.bridge;
    const rightBridge = !!panel.bridge && !!L.bridge;
    // make room for the device that crosses an edge
    const nudge = (leftBridge ? 0.06 : 0) - (rightBridge ? 0.06 : 0);
    // keep the device inside the panel vertically: below the headline, above the bottom edge; a device too tall for
    // the room left is drawn narrower (the tablets: their screens are nearly as tall as the panel)
    const textBottom = H * L.text.top + 2 * 1.08 * L.text.size * (L.landscape ? H : W);
    const gap = H * (L.landscape ? 0.03 : 0.035);
    const room = H - textBottom - gap - H * 0.02;
    let w = W * L.main.w;
    const h0 = bodySize(set.frame, cap, w).h;
    if (h0 > room) w *= room / h0;
    const { h } = bodySize(set.frame, cap, w);
    const cy = Math.min(textBottom + gap + h / 2, H - h / 2 - H * 0.02);
    items.push(
      device(
        set.frame,
        cap,
        src(panel.shot),
        { cx: x0 + W * (0.5 + nudge), cy, w, rot: L.landscape ? 0 : TILT[i]!, z: 2 },
        { dark: darkShot(panel.shot) },
      ),
    );
    if (rightBridge && i < n - 1) {
      const bw = W * L.bridge!.w;
      items.push(
        device(
          set.frame,
          cap,
          src(panel.bridge!),
          { cx: x0 + W, cy: H * L.bridge!.cy, w: bw, rot: L.bridge!.rot * (i % 2 ? -1 : 1), z: 3 },
          { dark: darkShot(panel.bridge!), shadow: 1.4 },
        ),
      );
    }
    const size = L.text.size * (L.landscape ? H : W);
    items.push(
      `<h1 style="left:${x0 + (W * (1 - L.text.width)) / 2}px;top:${H * L.text.top}px;width:${W * L.text.width}px;font-size:${size}px">${headlineHtml(panel.headline[locale])}</h1>`,
    );
  });
  return `<!doctype html><html lang="${locale === "tr" ? "tr" : "en"}"><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${C.ink}}
#strip{position:absolute;left:0;top:0;width:${W * n}px;height:${H}px;transform:translateX(calc(var(--panel,0) * -${W}px))}
.ground{position:absolute;left:0;top:0}
h1{position:absolute;margin:0;text-align:center;color:${C.ink};font-family:Fraunces,Georgia,serif;font-weight:400;line-height:1.08;letter-spacing:-.02em;z-index:5}
h1 .ln{display:block;white-space:nowrap}
h1 b{font-weight:800;letter-spacing:-.025em}
</style></head><body><div id="strip">${ground({ W, H, n, floorTop: L.floorTop, landscape: L.landscape })}${items.join("\n")}</div></body></html>`;
}

/** The product page header: the ground, the lockup and the words in Apple's safe area, devices outside it. */
export function headerHtml(h: HeaderSpec, locale: Locale, fontCss: string): string {
  const { width: W, height: H, safe } = h;
  const lockup = readFileSync(join(REPO, "brand/lockup-mono.svg"), "utf8").replace(
    /<title[^>]*>.*?<\/title>/s,
    "",
  );
  const src = (cap: CaptureId, shot: string) => pathToFileURL(rawPath(cap, locale, shot)).href;
  const items: string[] = [];
  // left of the safe area: the laptop; right of it: the tablet and the phone, leaning in
  const sideW = safe.x;
  const lapW = sideW * 0.86;
  const lap = bodySize("laptop", CAPTURE.mac, lapW);
  items.push(
    device("laptop", CAPTURE.mac, src("mac", "compose"), {
      cx: sideW * 0.52,
      cy: Math.min(H * 0.6, H - lap.h / 2 - H * 0.04),
      w: lapW,
      rot: 0,
    }),
  );
  const rightX = safe.x + safe.width;
  const rightW = W - rightX;
  const tabW = rightW * 0.6;
  const tab = bodySize("tablet", CAPTURE.tablet, tabW);
  items.push(
    device(
      "tablet",
      CAPTURE.tablet,
      src("tablet", "booth"),
      { cx: rightX + rightW * 0.42, cy: Math.max(tab.h / 2 + H * 0.05, H * 0.56), w: tabW, rot: -5 },
      { dark: true },
    ),
  );
  const phW = rightW * 0.32;
  const ph = bodySize("phone", CAPTURE.phone, phW);
  items.push(
    device(
      "phone",
      CAPTURE.phone,
      src("phone", "transition"),
      { cx: rightX + rightW * 0.74, cy: Math.min(H * 0.62, H - ph.h / 2 - H * 0.03), w: phW, rot: 7, z: 3 },
      { dark: true },
    ),
  );
  const lockH = safe.height * 0.24;
  // as large as the safe area allows: its height, or its width for the longest line (Fraunces ≈ 0.52 em a character)
  const longest = Math.max(...lines(plain(HEADER_COPY[locale])).map((l) => [...l].length));
  const textSize = Math.min(safe.height * 0.15, (safe.width * 0.94) / (longest * 0.52));
  return `<!doctype html><html lang="${locale === "tr" ? "tr" : "en"}"><head><meta charset="utf-8"><style>
${fontCss}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:${C.ink}}
.ground{position:absolute;left:0;top:0}
.safe{position:absolute;left:${safe.x}px;top:${safe.y}px;width:${safe.width}px;height:${safe.height}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${safe.height * 0.07}px;z-index:6;text-align:center}
.safe svg{height:${lockH}px;width:auto;display:block}
h1{margin:0;color:${C.ink};font-family:Fraunces,Georgia,serif;font-weight:400;font-size:${textSize}px;line-height:1.08;letter-spacing:-.02em}
h1 .ln{display:block;white-space:nowrap}h1 b{font-weight:800}
</style></head><body>
${ground({ W, H, n: 1, floorTop: 0.8, landscape: true })}
<svg style="position:absolute;left:${W * 0.5 - H * 0.55}px;top:${H * 0.08}px;opacity:1" width="${H * 1.1}" height="${H * 0.6}">${bandoneon(0, H * 0.12, H * 1.1, "rgba(11,10,16,.07)", Math.max(3, H * 0.004))}</svg>
${items.join("\n")}
<div class="safe">${lockup}<h1>${headlineHtml(HEADER_COPY[locale])}</h1></div>
</body></html>`;
}

const arg = (k: string) =>
  process.argv
    .find((a) => a.startsWith(`--${k}=`))
    ?.split("=")[1]
    ?.split(",");

async function launch(): Promise<Browser> {
  const exe = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium";
  return chromium.launch({
    ...(exe ? { executablePath: exe } : {}),
    args: ["--no-sandbox", "--allow-file-access-from-files"],
  });
}

/** Draws every panel of the given sets and the header images into `out`. Returns the files written. */
export async function compose(o: {
  out: string;
  sets: SetId[];
  locales: Locale[];
  headers?: boolean;
  quality?: number;
}): Promise<string[]> {
  const fontCss = fonts();
  const written: string[] = [];
  mkdirSync(WORK, { recursive: true });
  const browser = await launch();
  try {
    for (const setId of o.sets) {
      const set = SETS[setId];
      const page = await browser.newPage({ viewport: { width: set.out.width, height: set.out.height } });
      for (const locale of o.locales) {
        const missing = PANELS.flatMap((p) => [p.shot, p.bridge].filter(Boolean) as string[]).filter(
          (s) => !existsSync(rawPath(set.capture, locale, s)),
        );
        if (missing.length) {
          console.warn(
            `  ${setId} ${locale}: no capture for ${[...new Set(missing)].join(", ")} (run capture first)`,
          );
          continue;
        }
        const html = `${WORK}${setId}-${locale}.html`;
        writeFileSync(html, stripHtml(setId, locale, fontCss));
        await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
        await page.evaluate(() => document.fonts.ready);
        // every headline fits its panel (no line wider than its box)
        const wide = await page.evaluate(() =>
          [...document.querySelectorAll("h1")]
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .map((el) => el.textContent),
        );
        if (wide.length)
          throw new Error(`${setId} ${locale}: headline wider than the panel: ${wide.join(" | ")}`);
        for (let i = 0; i < PANELS.length; i++) {
          await page.evaluate(
            (k) => document.getElementById("strip")!.style.setProperty("--panel", String(k)),
            i,
          );
          const jpg = await page.screenshot({ type: "jpeg", quality: o.quality ?? 90 });
          const got = jpegSize(jpg);
          if (got.width !== set.out.width || got.height !== set.out.height || got.components !== 3)
            throw new Error(`${setId} ${PANELS[i]!.id}: ${got.width}×${got.height}×${got.components}`);
          const target = join(o.out, shotFile(setId, locale, PANELS[i]!.id));
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, jpg);
          written.push(target);
        }
        rmSync(html, { force: true });
        console.log(`composed ${setId} ${locale}: ${PANELS.length} panels`);
      }
      await page.close();
    }
    if (o.headers !== false) {
      for (const h of HEADERS) {
        const page = await browser.newPage({ viewport: { width: h.width, height: h.height } });
        for (const locale of o.locales) {
          const html = `${WORK}${h.id}-${locale}.html`;
          writeFileSync(html, headerHtml(h, locale, fontCss));
          await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
          await page.evaluate(() => document.fonts.ready);
          // the lockup and every line of the words inside Apple's art safe area
          const outside = await page.evaluate((sa) => {
            const bad: string[] = [];
            for (const el of document.querySelectorAll(".safe > svg, .safe .ln")) {
              const r = el.getBoundingClientRect();
              const w = el.classList.contains("ln") ? (el as HTMLElement).scrollWidth : r.width;
              const left = r.left + r.width / 2 - w / 2;
              if (
                left < sa.x - 1 ||
                left + w > sa.x + sa.width + 1 ||
                r.top < sa.y - 1 ||
                r.bottom > sa.y + sa.height + 1
              )
                bad.push(el.textContent || "lockup");
            }
            return bad;
          }, h.safe);
          if (outside.length)
            throw new Error(`${h.id} ${locale}: outside the safe area: ${outside.join(" | ")}`);
          // Apple takes no alpha channel: the page is opaque, so dropping it changes no pixel
          const png = flattenAlpha(await page.screenshot({ type: "png" }), [11, 10, 16]);
          const meta = info(png);
          if (meta.alpha) throw new Error(`${h.id}: alpha channel left`);
          if (meta.width !== h.width || meta.height !== h.height)
            throw new Error(`${h.id}: ${meta.width}×${meta.height}`);
          const target = join(o.out, headerFile(h, locale));
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, png);
          written.push(target);
          rmSync(html, { force: true });
          console.log(`composed ${h.id} ${locale}`);
        }
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  compose({
    out: arg("out")?.[0] ?? fileURLToPath(new URL("../../fastlane/", import.meta.url)),
    sets: (arg("sets") as SetId[] | undefined) ?? (Object.keys(SETS) as SetId[]),
    locales: (arg("locales") as Locale[] | undefined) ?? ["en-US", "tr"],
    headers: !process.argv.includes("--no-headers"),
  }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
