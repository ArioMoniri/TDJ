/**
 * Store creative v3, step 2: the screenshot sets and the product page header images, all on the black stage of
 * Apple's product pages (showcase.ts): one device per panel, the whole device in view, a real capture on its
 * screen, a small product line and one white headline above it. The devices are 3D renders (apps/video: the laptop,
 * "Showcase"; the phone, tablet and foldable, "HandheldStill"), made once per size before the page is drawn.
 *
 * Each set is laid out as a strip of panels side by side; the page is cut into panels by moving the strip under a
 * viewport of the exact upload size and taking an opaque JPEG of each.
 * Output: <out>/<set dir>/<locale>/<panel>_<set>.jpg and <out>/product_page/<locale>/<header>.png
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { type Browser, chromium } from "playwright";
import { fitHandheld, type HandheldFit } from "../../../video/src/three/handheld";
import { flattenAlpha, info, jpegSize } from "../../scripts/png.mjs";
import { esc } from "./art";
import { RAW } from "./capture";
import {
  appRect,
  DISPLAY_STACK,
  handheldFit,
  handheldHtml,
  handheldPanelHtml,
  headerLaptop,
  headlineSize,
  LEADING,
  macPanelHtml,
  PLACE,
  renderHandheld,
  renderShowcase,
  stageCss,
  stageGrid,
  type Tone,
} from "./showcase";
import {
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
  shotFile,
} from "./spec";

const WORK = fileURLToPath(new URL("../out/creative/work/", import.meta.url));
const REPO = fileURLToPath(new URL("../../../../", import.meta.url));

export const rawPath = (cap: CaptureId, locale: Locale, shot: string, full = false) =>
  `${RAW}${cap}/${locale}/${shot}${full ? "-full" : ""}.png`;

export const darkShot = (id: string) => !!SHOTS.find((s) => s.id === id)?.dark;

/** the size the Mac laptop is rendered at (the larger Mac set; 2560 × 1600 is the same picture scaled) */
const MAC_STILL = { width: SETS.mac.out.width, height: SETS.mac.out.height };

/** the 3D devices a page needs: the laptop per tone, or one handheld */
export type Stills = { laptop?: Record<Tone, string>; handheld?: string };

const page = (W: number, H: number, n: number, locale: Locale, body: string) =>
  `<!doctype html><html lang="${locale === "tr" ? "tr" : "en"}"><head><meta charset="utf-8"><style>
${stageCss()}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}
#strip{position:absolute;left:0;top:0;width:${W * n}px;height:${H}px;transform:translateX(calc(var(--panel,0) * -${W}px))}
</style></head><body><div id="strip">${body}</div></body></html>`;

/**
 * One set and locale: its panels side by side, each the black stage with the device and one capture on its
 * screen. `stills`: the laptop rendered for light and dark captures (Mac sets), or the set's handheld.
 */
export function stripHtml(setId: SetId, locale: Locale, stills: Stills): string {
  const set = SETS[setId];
  const { width: W, height: H } = set.out;
  const g = stageGrid(set.frame, W, H);
  const size = headlineSize(
    g,
    PANELS.map((p) => p.headline[locale]),
  );
  const fit = handheldFit(setId);
  const panels = PANELS.map((panel, i) => {
    const capture = rawPath(set.capture, locale, panel.shot);
    const dark = darkShot(panel.shot);
    if (!fit)
      return macPanelHtml({
        W,
        H,
        x0: W * i,
        capture,
        frame: stills.laptop![dark ? "dark" : "light"],
        headline: panel.headline[locale],
        size,
      });
    return handheldPanelHtml({
      W,
      H,
      x0: W * i,
      frame: set.frame,
      capture: set.capture,
      src: capture,
      still: stills.handheld!,
      fit,
      dark,
      headline: panel.headline[locale],
      size,
    });
  });
  return page(W, H, PANELS.length, locale, panels.join("\n"));
}

/** the Mac sets (kept for the older name) */
export const macStripHtml = (setId: SetId, locale: Locale, frames: Record<Tone, string>) =>
  stripHtml(setId, locale, { laptop: frames });

/**
 * The header's layout: the laptop left of Apple's art safe area, the tablet and the phone (in front, lower) right
 * of it, all on one black stage; the lockup and the words in the safe area.
 */
export function headerLayout(h: HeaderSpec) {
  const { width: W, height: H, safe } = h;
  const pad = W * 0.012;
  // the laptop's canvas: everything left of the safe area
  const lapW = 2 * Math.floor((safe.x - pad) / 2);
  const laptop = {
    canvas: { x: 0, y: 0, w: lapW, h: H },
    place: headerLaptop(lapW, H, { top: H * 0.16, bottom: H * 0.88, left: lapW * 0.06, right: lapW * 0.94 }),
  };
  const rx = safe.x + safe.width + pad;
  const rw = W - W * 0.03 - rx;
  const tablet = fitHandheld("tablet", { x: rx, y: H * 0.12, w: rw * 0.74, h: H * 0.72 });
  const phone = fitHandheld("phone", { x: rx + rw * 0.58, y: H * 0.36, w: rw * 0.42, h: H * 0.56 });
  return { laptop, tablet, phone };
}

/** The product page header: the devices on the black stage, the lockup and the words in Apple's safe area. */
export function headerHtml(
  h: HeaderSpec,
  locale: Locale,
  stills: { laptop: string; tablet: string; phone: string },
): string {
  const { width: W, height: H, safe } = h;
  const L = headerLayout(h);
  const lockup = readFileSync(join(REPO, "brand/lockup-mono.svg"), "utf8").replace(
    /<title[^>]*>.*?<\/title>/s,
    "",
  );
  const src = (cap: CaptureId, shot: string) => rawPath(cap, locale, shot);
  const url = (f: string) => pathToFileURL(f).href;
  const lap = L.laptop;
  const r = appRect(lap.canvas.w, lap.canvas.h, lap.place);
  const lapHtml = `<img class="cap" src="${url(src("mac", "compose"))}" style="position:absolute;left:${lap.canvas.x + r.x}px;top:${lap.canvas.y + r.y}px;width:${r.w}px;height:${r.h}px">
<img class="dev" src="${url(stills.laptop)}" style="position:absolute;left:${lap.canvas.x}px;top:${lap.canvas.y}px;width:${lap.canvas.w}px;height:${lap.canvas.h}px">`;
  const hand = (frame: "tablet" | "phone", fit: HandheldFit, shot: string, still: string) =>
    handheldHtml({ frame, capture: frame, src: src(frame, shot), still, fit, dark: darkShot(shot) });
  const lockH = safe.height * 0.22;
  const ls = lines(plain(HEADER_COPY[locale]));
  const longest = Math.max(...ls.map((l) => [...l].length));
  const textSize = Math.min(safe.height * 0.17, (safe.width * 0.96) / (longest * 0.56));
  return `<!doctype html><html lang="${locale === "tr" ? "tr" : "en"}"><head><meta charset="utf-8"><style>
${stageCss()}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}
.safe{position:absolute;left:${safe.x}px;top:${safe.y}px;width:${safe.width}px;height:${safe.height}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${safe.height * 0.08}px;z-index:6;text-align:center}
.safe svg{height:${lockH}px;width:auto;display:block;filter:invert(1);opacity:.92}
.safe h1{position:static;font-size:${textSize}px;line-height:${LEADING}}
</style></head><body>
${lapHtml}
${hand("tablet", L.tablet, "booth", stills.tablet)}
${hand("phone", L.phone, "transition", stills.phone)}
<div class="vig soft"></div>
<div class="safe">${lockup}<h1 style="font-family:${DISPLAY_STACK}">${ls.map((l) => `<span class="ln">${esc(l)}</span>`).join("")}</h1></div>
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

/** every 3D still the sets and headers need (rendered before the page browser starts: one Chromium at a time) */
function renderStills(sets: SetId[], headers: boolean) {
  const bySet: Partial<Record<SetId, Stills>> = {};
  let mac: Record<Tone, string> | null = null;
  for (const id of sets) {
    const fit = handheldFit(id);
    if (fit) bySet[id] = { handheld: renderHandheld({ kind: fit.kind, scale: fit.scale, dir: WORK }) };
    else {
      mac ??= {
        light: renderShowcase({ ...MAC_STILL, place: PLACE.storeMac, tone: "light", dir: WORK }),
        dark: renderShowcase({ ...MAC_STILL, place: PLACE.storeMac, tone: "dark", dir: WORK }),
      };
      bySet[id] = { laptop: mac };
    }
  }
  const byHeader: Record<string, { laptop: string; tablet: string; phone: string }> = {};
  if (headers)
    for (const h of HEADERS) {
      const L = headerLayout(h);
      byHeader[h.id] = {
        laptop: renderShowcase({
          width: L.laptop.canvas.w,
          height: L.laptop.canvas.h,
          place: L.laptop.place,
          tone: "light",
          dir: WORK,
          transparent: true,
        }),
        tablet: renderHandheld({ kind: "tablet", scale: L.tablet.scale, dir: WORK }),
        phone: renderHandheld({ kind: "phone", scale: L.phone.scale, dir: WORK }),
      };
    }
  return { bySet, byHeader };
}

/** Draws every panel of the given sets and the header images into `out`. Returns the files written. */
export async function compose(o: {
  out: string;
  sets: SetId[];
  locales: Locale[];
  headers?: boolean;
  quality?: number;
}): Promise<string[]> {
  const written: string[] = [];
  mkdirSync(WORK, { recursive: true });
  const ready = o.sets.filter((setId) =>
    o.locales.some((locale) => {
      const set = SETS[setId];
      const missing = PANELS.map((p) => p.shot).filter((s) => !existsSync(rawPath(set.capture, locale, s)));
      if (missing.length)
        console.warn(
          `  ${setId} ${locale}: no capture for ${[...new Set(missing)].join(", ")} (run capture first)`,
        );
      return !missing.length;
    }),
  );
  const stills = renderStills(ready, o.headers !== false);
  const browser = await launch();
  try {
    for (const setId of ready) {
      const set = SETS[setId];
      const tab = await browser.newPage({ viewport: { width: set.out.width, height: set.out.height } });
      for (const locale of o.locales) {
        if (PANELS.some((p) => !existsSync(rawPath(set.capture, locale, p.shot)))) continue;
        const html = `${WORK}${setId}-${locale}.html`;
        writeFileSync(html, stripHtml(setId, locale, stills.bySet[setId]!));
        await tab.goto(pathToFileURL(html).href, { waitUntil: "load" });
        await tab.evaluate(() => document.fonts.ready);
        // every headline fits its panel (no line wider than its box)
        const wide = await tab.evaluate(() =>
          [...document.querySelectorAll("h1")]
            .filter((el) => el.scrollWidth > el.clientWidth + 1)
            .map((el) => el.textContent),
        );
        if (wide.length)
          throw new Error(`${setId} ${locale}: headline wider than the panel: ${wide.join(" | ")}`);
        for (let i = 0; i < PANELS.length; i++) {
          await tab.evaluate(
            (k) => document.getElementById("strip")!.style.setProperty("--panel", String(k)),
            i,
          );
          const jpg = await tab.screenshot({ type: "jpeg", quality: o.quality ?? 92 });
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
      await tab.close();
    }
    if (o.headers !== false) {
      for (const h of HEADERS) {
        const tab = await browser.newPage({ viewport: { width: h.width, height: h.height } });
        for (const locale of o.locales) {
          const need: Array<[CaptureId, string]> = [
            ["mac", "compose"],
            ["tablet", "booth"],
            ["phone", "transition"],
          ];
          const missing = need.filter(([c, s]) => !existsSync(rawPath(c, locale, s)));
          if (missing.length) {
            console.warn(`  ${h.id} ${locale}: no capture for ${missing.map((m) => m.join("/")).join(", ")}`);
            continue;
          }
          const html = `${WORK}${h.id}-${locale}.html`;
          writeFileSync(html, headerHtml(h, locale, stills.byHeader[h.id]!));
          await tab.goto(pathToFileURL(html).href, { waitUntil: "load" });
          await tab.evaluate(() => document.fonts.ready);
          // the lockup and every line of the words inside Apple's art safe area
          const outside = await tab.evaluate((sa) => {
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
          const png = flattenAlpha(await tab.screenshot({ type: "png" }), [0, 0, 0]);
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
        await tab.close();
      }
    }
  } finally {
    await browser.close();
    // the device stills are intermediate: the next run renders its own
    if (!process.env.KEEP_WORK) rmSync(WORK, { recursive: true, force: true });
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
