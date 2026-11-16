/**
 * The Mac pictures in the README hero's style: a black stage, the space-black 3D laptop (apps/video, composition
 * "Showcase") seen from the front and a little above, a real capture on its screen, a small product line and one
 * plain headline above it in the system's display face, white, large and tight.
 *
 * The laptop is rendered once per picture size and screen tone (light or dark captures light the deck differently),
 * with the app area a transparent hole; each panel lays its capture under the hole in 2D, at the rectangle the 3D
 * camera was placed for (apps/video/src/three/showcase.ts → appRect), so the app is pixel-sharp at App Store size.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { APP_ASPECT, appRect, PLACE, type Placement } from "../../../video/src/three/showcase";
import { esc } from "./art";
import { lines, plain } from "./spec";

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

/** the panels' headline: the store headline's lines on one line, without its bold mark */
export const oneLine = (h: string) => lines(plain(h)).join(" ");

/** the vertical grid of a Mac panel, in fractions of its height */
export const MAC_TEXT = { kickerTop: 0.045, kickerSize: 0.024, top: 0.078, size: 0.06 } as const;

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

/**
 * Renders the laptop for one picture size and tone (Remotion still, software GL) into `dir`; returns the PNG.
 * About 15 s each.
 */
export function renderShowcase(o: {
  width: number;
  height: number;
  place: Placement;
  tone: Tone;
  dir: string;
}): string {
  mkdirSync(o.dir, { recursive: true });
  const out = join(o.dir, `showcase-${o.width}x${o.height}-${o.place.w}-${o.place.top}-${o.tone}.png`);
  const props = { width: o.width, height: o.height, place: o.place, ...TONES[o.tone] };
  const r = spawnSync(
    "pnpm",
    [
      "exec",
      "remotion",
      "still",
      "src/index.ts",
      "Showcase",
      out,
      `--props=${JSON.stringify(props)}`,
      "--gl=swangle",
      "--timeout=240000",
      "--log=error",
    ],
    { cwd: VIDEO, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (r.status !== 0 || !existsSync(out)) throw new Error(`the laptop still did not render (${o.tone})`);
  return out;
}

/** one Mac panel: the stage, the capture under the laptop's screen, the vignette, the words */
export function macPanelHtml(o: {
  W: number;
  H: number;
  x0: number;
  capture: string;
  frame: string;
  headline: string;
  place?: Placement;
}): string {
  const { W, H, x0 } = o;
  const r = appRect(W, H, o.place ?? PLACE.storeMac);
  const t = MAC_TEXT;
  const url = (f: string) => pathToFileURL(f).href;
  return `<section class="mac" style="left:${x0}px;width:${W}px;height:${H}px">
<img class="cap" src="${url(o.capture)}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px">
<img class="lap" src="${url(o.frame)}" style="width:${W}px;height:${H}px">
<div class="vig"></div>
<p class="kicker" style="top:${H * t.kickerTop}px;font-size:${H * t.kickerSize}px">${esc(KICKER)}</p>
<h1 style="left:${W * 0.05}px;top:${H * t.top}px;width:${W * 0.9}px;font-size:${H * t.size}px"><span class="ln">${esc(oneLine(o.headline))}</span></h1>
</section>`;
}

/** the page's styles for Mac panels */
export function macCss(): string {
  return `${displayFontCss()}
.mac{position:absolute;top:0;overflow:hidden;background:#000}
.mac .cap,.mac .lap{position:absolute;display:block}
.mac .lap{left:0;top:0}
.mac .vig{position:absolute;inset:0;background:radial-gradient(120% 95% at 50% 42%,rgba(0,0,0,0) 58%,rgba(0,0,0,.42) 86%,rgba(0,0,0,.7) 100%)}
.mac .kicker{position:absolute;left:0;width:100%;margin:0;text-align:center;color:#86868b;font-family:${DISPLAY_STACK};font-weight:600;letter-spacing:-.01em}
.mac h1{position:absolute;margin:0;text-align:center;color:#f5f5f7;font-family:${DISPLAY_STACK};font-weight:600;line-height:1.05;letter-spacing:-.03em;z-index:5}
.mac h1 .ln{display:block;white-space:nowrap}`;
}
