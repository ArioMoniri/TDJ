/**
 * Store creative v3: every App Store picture on the README hero's black stage, Apple's product-page style. A small
 * product line and one plain headline in the system's display face, white, large and tight, above one device: the
 * space-black 3D laptop (apps/video, composition "Showcase"), phone, tablet or foldable (composition
 * "HandheldStill"), with one real capture on its screen.
 *
 * The devices are rendered once per picture size (the laptop also per screen tone: light and dark captures light the
 * deck differently) with the screen a transparent hole; each panel lays its capture under the hole in 2D, at the
 * rectangle the 3D camera was placed for (video/src/three/showcase.ts → appRect, three/handheld.ts → fitHandheld),
 * so the app is pixel-sharp at App Store size.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  fitHandheld,
  type HandheldFit,
  type HandheldKind,
  type Rect,
  stillRect,
} from "../../../video/src/three/handheld";
import { fitLaptop } from "../../../video/src/three/laptop";
import { APP_ASPECT, appRect, PLACE, type Placement } from "../../../video/src/three/showcase";
import { statusBar } from "../compose";
import { esc, fonts, screenChrome } from "./art";
import { CAPTURE, type CaptureId, type Frame, lines, plain, SETS, type SetId } from "./spec";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const VIDEO = join(REPO, "apps/video");

export type Tone = "light" | "dark";

/** what the screen does to the room: its light on the deck, and the menu-bar band around the notch */
export const TONES: Record<Tone, { spill: string; strip: string }> = {
  // the app's paper (the captures average about #f0ece9, their top row #f3efea)
  light: { spill: "#ece8e4", strip: "#f3efea" },
  // the Booth and Now playing (about #2a2830 on average, a near-black top row)
  dark: { spill: "#2c2a33", strip: "#0e0e12" },
};

export { APP_ASPECT, appRect, PLACE };

/** the product line over every headline */
export const KICKER = "T-DJ";

/** the headline's face: SF Pro on a Mac; elsewhere Inter Display if installed, else Inter 600 (embedded) */
export const DISPLAY_STACK =
  '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter Display", "TDJ Display", sans-serif';

/** the store headline's lines on one line, without its bold mark */
export const oneLine = (h: string) => lines(plain(h)).join(" ");

/** the vertical grid of a Mac panel, in fractions of its height */
export const MAC_TEXT = { kickerTop: 0.04, kickerSize: 0.022, top: 0.068, size: 0.056 } as const;

/** the handheld each set shows */
export const HANDHELD_OF: Partial<Record<Frame, HandheldKind>> = {
  phone: "phone",
  tablet: "tablet",
  duoOuter: "duoOuter",
  duoInner: "duoInner",
};

/**
 * The words and the device's room in one panel (px): the product line, the headline (one line on landscape panels,
 * the store headline's two lines on portrait ones), the box the device is fitted into below it.
 */
export interface StageGrid {
  kickerTop: number;
  kickerSize: number;
  top: number;
  size: number;
  lines: 1 | 2;
  /** the headline's box width */
  width: number;
  box: { top: number; bottom: number; left: number; right: number };
}

/** line height of the headline */
export const LEADING = 1.05;

export function stageGrid(frame: Frame, W: number, H: number): StageGrid {
  const g = (
    o: Omit<StageGrid, "box" | "width"> & { gap: number; foot: number; side: number },
  ): StageGrid => {
    const textBottom = o.top + o.lines * LEADING * o.size;
    return {
      kickerTop: o.kickerTop,
      kickerSize: o.kickerSize,
      top: o.top,
      size: o.size,
      lines: o.lines,
      width: W * 0.9,
      box: { top: textBottom + o.gap, bottom: H - o.foot, left: o.side, right: W - o.side },
    };
  };
  switch (frame) {
    case "phone":
      return g({
        kickerTop: H * 0.045,
        kickerSize: W * 0.034,
        top: H * 0.066,
        size: W * 0.088,
        lines: 2,
        gap: H * 0.03,
        foot: H * 0.03,
        side: W * 0.05,
      });
    case "tablet":
      return g({
        kickerTop: H * 0.042,
        kickerSize: W * 0.024,
        top: H * 0.062,
        size: W * 0.058,
        lines: 2,
        gap: H * 0.028,
        foot: H * 0.028,
        side: W * 0.06,
      });
    case "duoOuter":
      return g({
        kickerTop: H * 0.045,
        kickerSize: W * 0.03,
        top: H * 0.07,
        size: W * 0.075,
        lines: 2,
        gap: H * 0.03,
        foot: H * 0.035,
        side: W * 0.05,
      });
    case "duoInner":
      return g({
        kickerTop: H * 0.04,
        kickerSize: H * 0.024,
        top: H * 0.07,
        size: H * 0.058,
        lines: 1,
        gap: H * 0.035,
        foot: H * 0.04,
        side: W * 0.06,
      });
    default: {
      const t = MAC_TEXT;
      return g({
        kickerTop: H * t.kickerTop,
        kickerSize: H * t.kickerSize,
        top: H * t.top,
        size: H * t.size,
        lines: 1,
        gap: H * (0.15 - t.top - LEADING * t.size),
        foot: H * 0.035,
        side: W * 0.06,
      });
    }
  }
}

/** a set's handheld, fitted to its panel's grid */
export function handheldFit(setId: SetId): HandheldFit | null {
  const set = SETS[setId];
  const kind = HANDHELD_OF[set.frame];
  if (!kind) return null;
  const { width: W, height: H } = set.out;
  const b = stageGrid(set.frame, W, H).box;
  return fitHandheld(kind, { x: b.left, y: b.top, w: b.right - b.left, h: b.bottom - b.top });
}

/** Inter 600, embedded as "TDJ Display" (the last fallback for SF Pro Display) */
export function displayFontCss(): string {
  const req = createRequire(join(REPO, "apps/web/package.json"));
  const dir = join(dirname(req.resolve("@fontsource/inter/package.json")), "files");
  return ["latin", "latin-ext"]
    .map(
      (sub) =>
        `@font-face{font-family:"TDJ Display";font-weight:600;font-display:block;src:url(data:font/woff2;base64,${readFileSync(join(dir, `inter-${sub}-600-normal.woff2`)).toString("base64")}) format("woff2")}`,
    )
    .join("\n");
}

/** stills made in this process (a run renders each device once) */
const made = new Set<string>();

function still(composition: string, out: string, props: object, what: string): string {
  if (made.has(out) && existsSync(out)) return out;
  const r = spawnSync(
    "pnpm",
    [
      "exec",
      "remotion",
      "still",
      "src/index.ts",
      composition,
      out,
      `--props=${JSON.stringify(props)}`,
      "--gl=swangle",
      "--timeout=240000",
      "--log=error",
    ],
    { cwd: VIDEO, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (r.status !== 0 || !existsSync(out)) throw new Error(`the ${what} still did not render`);
  made.add(out);
  return out;
}

/**
 * Renders the laptop for one picture size and tone (Remotion still, software GL) into `dir`; returns the PNG.
 * `transparent`: no black stage round it (the header images). About 15 s each.
 */
export function renderShowcase(o: {
  width: number;
  height: number;
  place: Placement;
  tone: Tone;
  dir: string;
  transparent?: boolean;
}): string {
  mkdirSync(o.dir, { recursive: true });
  const p = o.place;
  const out = join(
    o.dir,
    `showcase-${o.width}x${o.height}-${p.w.toFixed(4)}-${p.top.toFixed(4)}-${p.deg ?? ""}-${o.tone}${o.transparent ? "-t" : ""}.png`,
  );
  const props = {
    width: o.width,
    height: o.height,
    place: p,
    transparent: !!o.transparent,
    ...TONES[o.tone],
  };
  return still("Showcase", out, props, `laptop (${o.tone})`);
}

/** Renders one handheld at `scale` px per point (transparent ground, the screen a hole) into `dir`. */
export function renderHandheld(o: { kind: HandheldKind; scale: number; dir: string }): string {
  mkdirSync(o.dir, { recursive: true });
  const out = join(o.dir, `handheld-${o.kind}-${o.scale.toFixed(5)}.png`);
  return still("HandheldStill", out, { kind: o.kind, scale: o.scale }, o.kind);
}

const url = (f: string) => pathToFileURL(f).href;
const box = (r: Rect) => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;

/** the product line and the headline of a panel */
function words(g: StageGrid, W: number, headline: string, size: number): string {
  const text = g.lines === 1 ? [oneLine(headline)] : lines(plain(headline));
  return `<p class="kicker" style="top:${g.kickerTop}px;font-size:${g.kickerSize}px">${esc(KICKER)}</p>
<h1 style="left:${(W - g.width) / 2}px;top:${g.top}px;width:${g.width}px;font-size:${size}px">${text.map((l) => `<span class="ln">${esc(l)}</span>`).join("")}</h1>`;
}

/**
 * The headline's size for a set and locale: the grid's, or smaller so the longest line of any panel fits its box
 * (the display face is about 0.55 em a character), the same on every panel of the set.
 */
export function headlineSize(g: StageGrid, headlines: string[]): number {
  const longest = Math.max(
    ...headlines.flatMap((h) => (g.lines === 1 ? [oneLine(h)] : lines(plain(h)))).map((l) => [...l].length),
  );
  return Math.min(g.size, (g.width * 0.97) / (longest * 0.56));
}

/** one Mac panel: the stage, the capture under the laptop's screen, the vignette, the words */
export function macPanelHtml(o: {
  W: number;
  H: number;
  x0: number;
  capture: string;
  frame: string;
  headline: string;
  size?: number;
  place?: Placement;
}): string {
  const { W, H, x0 } = o;
  const r = appRect(W, H, o.place ?? PLACE.storeMac);
  const g = stageGrid("laptop", W, H);
  return `<section class="stage" style="left:${x0}px;width:${W}px;height:${H}px">
<img class="cap" src="${url(o.capture)}" style="${box(r)}">
<img class="lap" src="${url(o.frame)}" style="width:${W}px;height:${H}px">
<div class="vig"></div>
${words(g, W, o.headline, o.size ?? g.size)}
</section>`;
}

/**
 * One handheld panel: the screen's glow on the stage (the capture, blurred, behind the device), the capture on the
 * screen with the status bar the device draws, a faint sheen across the glass, the device over it, the words.
 */
export function handheldPanelHtml(o: {
  W: number;
  H: number;
  x0: number;
  frame: Frame;
  capture: CaptureId;
  src: string;
  still: string;
  fit: HandheldFit;
  dark: boolean;
  headline: string;
  size?: number;
}): string {
  const { W, H, x0 } = o;
  const g = stageGrid(o.frame, W, H);
  return `<section class="stage" style="left:${x0}px;width:${W}px;height:${H}px">
${handheldHtml({ ...o, cls: "dev" })}
<div class="vig soft"></div>
${words(g, W, o.headline, o.size ?? g.size)}
</section>`;
}

/** a handheld with its capture, absolutely placed (its still at `stillRect(fit)`) */
export function handheldHtml(o: {
  frame: Frame;
  capture: CaptureId;
  src: string;
  still: string;
  fit: HandheldFit;
  dark: boolean;
  cls?: string;
}): string {
  const { fit } = o;
  const s = fit.screen;
  const cap = CAPTURE[o.capture];
  const k = s.w / cap.width;
  const sr = stillRect(fit);
  const glow = Math.max(s.w, s.h) * 0.06;
  return `<div class="glow" style="${box({ x: s.x + s.w * 0.06, y: s.y + s.h * 0.06, w: s.w * 0.88, h: s.h * 0.88 })};border-radius:${s.r}px;background:url('${url(o.src)}') center/cover;filter:blur(${glow}px) saturate(1.3);opacity:${o.dark ? 0.55 : 0.3}"></div>
<div class="scr" style="${box(s)};border-radius:${s.r}px"><img src="${url(o.src)}">${chrome(o.frame, o.capture, k, o.dark)}</div>
<img class="${o.cls ?? "dev"}" src="${url(o.still)}" style="position:absolute;${box(sr)}">
<i class="gloss" style="${box(fit.body)};border-radius:${fit.body.r}px"></i>`;
}

/** the screen's own drawing over the capture: the status bar and home indicator (the island is the 3D model's) */
function chrome(frame: Frame, capture: CaptureId, k: number, dark: boolean): string {
  const cap = CAPTURE[capture];
  if (frame === "phone") return statusBar({ kind: "phone", safe: cap.safe }, k, dark);
  if (frame === "tablet") return statusBar({ kind: "tablet", safe: cap.safe }, k, dark);
  return screenChrome(frame, cap, k, dark);
}

/** the page's styles for stage panels */
export function stageCss(): string {
  return `${displayFontCss()}
${fonts()}
.stage{position:absolute;top:0;overflow:hidden;background:#000}
.stage .cap,.stage .lap{position:absolute;display:block}
.stage .lap{left:0;top:0}
.glow{position:absolute}
.scr{position:absolute;overflow:hidden;background:#000}
.scr>img{position:absolute;left:0;top:0;width:100%;height:100%;display:block}
.gloss{position:absolute;background:linear-gradient(122deg,rgba(255,255,255,.075) 0%,rgba(255,255,255,.03) 30%,rgba(255,255,255,0) 44%,rgba(255,255,255,0) 82%,rgba(255,255,255,.025) 100%);pointer-events:none}
.vig{position:absolute;inset:0;background:radial-gradient(120% 95% at 50% 42%,rgba(0,0,0,0) 58%,rgba(0,0,0,.42) 86%,rgba(0,0,0,.7) 100%);pointer-events:none}
.vig.soft{background:radial-gradient(130% 110% at 50% 45%,rgba(0,0,0,0) 70%,rgba(0,0,0,.35) 100%)}
.kicker{position:absolute;left:0;width:100%;margin:0;text-align:center;color:#86868b;font-family:${DISPLAY_STACK};font-weight:600;letter-spacing:-.01em}
h1{position:absolute;margin:0;text-align:center;color:#f5f5f7;font-family:${DISPLAY_STACK};font-weight:600;line-height:${LEADING};letter-spacing:-.03em;z-index:5}
h1 .ln{display:block;white-space:nowrap}`;
}

/** the header's laptop: the largest that fits `box` of a W × H canvas, Apple's near-level view */
export const headerLaptop = (W: number, H: number, b: StageGrid["box"]) =>
  fitLaptop(W, H, b, { deg: PLACE.storeMac.deg, fov: PLACE.storeMac.fov });
