/**
 * The drawing kit of store creative v2: the brand ground (teal → pink → coral with an ink floor), the tango art
 * (vinyl grooves, a parquet floor, a bandoneon in line art), our own device frames (no Apple product artwork: an
 * iPhone-like phone with an island, a thin-bezel tablet, a laptop, the iPhone Duo folded and open) and the headline.
 * Everything is HTML/CSS/SVG rendered by Chromium; sizes are in output pixels.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statusBar } from "../compose";
import type { CaptureDevice, Frame } from "./spec";

/** brand/README.md: ink, rose, cream; teal is the app's vals colour; coral is the warm end of the rose */
export const C = {
  ink: "#0B0A10",
  ink2: "#17121F",
  cream: "#F6F1E8",
  rose: "#E0557A",
  pink: "#EE7C9E",
  teal: "#4FD1C5",
  coral: "#F4906A",
} as const;

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** Fraunces 400/800 (headline), Inter 500/700 (small type); latin + latin-ext (Turkish ğ ş ı İ), as data URLs */
export function fonts(): string {
  const req = createRequire(join(fileURLToPath(new URL("../../../web/package.json", import.meta.url))));
  const face = (family: string, pkg: string, w: number) =>
    ["latin", "latin-ext"]
      .map((sub) => {
        const p = join(
          dirname(req.resolve(`${pkg}/package.json`)),
          "files",
          `${pkg.split("/")[1]}-${sub}-${w}-normal.woff2`,
        );
        return `@font-face{font-family:"${family}";font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${readFileSync(p).toString("base64")}) format("woff2")}`;
      })
      .join("\n");
  return [
    face("Fraunces", "@fontsource/fraunces", 400),
    face("Fraunces", "@fontsource/fraunces", 800),
    face("Inter", "@fontsource/inter", 500),
    face("Inter", "@fontsource/inter", 700),
  ].join("\n");
}

/** `Compose a *milonga*\nin one tap` → two lines, the starred word bold */
export function headlineHtml(h: string): string {
  return h
    .split("\n")
    .map((line) => `<span class="ln">${esc(line).replace(/\*([^*]+)\*/g, "<b>$1</b>")}</span>`)
    .join("");
}

/* ------------------------------------------------------------------ ground */

/** a sine-wave top edge for the ink floor, continuous across the whole strip */
function floorPath(w: number, h: number, top: number, amp: number, period: number): string {
  const pts: string[] = [];
  for (let x = 0; x <= w; x += Math.max(8, Math.round(w / 600)))
    pts.push(`${x},${(top + Math.sin((x / period) * Math.PI * 2 + 0.6) * amp).toFixed(1)}`);
  return `M0,${h} L${pts.join(" L")} L${w},${h} Z`;
}

/** concentric grooves of a record */
function vinyl(cx: number, cy: number, r: number, color: string, unit: number): string {
  const rings: string[] = [];
  for (let k = r; k > r * 0.36; k -= unit) rings.push(`<circle cx="${cx}" cy="${cy}" r="${k.toFixed(1)}"/>`);
  return `<g fill="none" stroke="${color}" stroke-width="${Math.max(1, unit * 0.18).toFixed(1)}">${rings.join("")}</g>
  <circle cx="${cx}" cy="${cy}" r="${(r * 0.3).toFixed(1)}" fill="none" stroke="${color}" stroke-width="${(unit * 0.5).toFixed(1)}"/>
  <circle cx="${cx}" cy="${cy}" r="${(r * 0.03).toFixed(1)}" fill="${color}"/>`;
}

/** a bandoneon in line art: two keyboards with buttons, the bellows folding between them */
export function bandoneon(x: number, y: number, w: number, color: string, stroke: number): string {
  const h = w * 0.42;
  const box = w * 0.22;
  const folds = 9;
  const bx0 = x + box;
  const bw = w - 2 * box;
  const parts: string[] = [];
  // the two ends
  for (const ex of [x, x + w - box]) {
    parts.push(`<rect x="${ex}" y="${y}" width="${box}" height="${h}" rx="${box * 0.14}"/>`);
    parts.push(
      `<rect x="${ex + box * 0.1}" y="${y + h * 0.1}" width="${box * 0.8}" height="${h * 0.8}" rx="${box * 0.08}"/>`,
    );
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 3; c++)
        parts.push(
          `<circle cx="${ex + box * (0.28 + c * 0.22 + (r % 2) * 0.1)}" cy="${y + h * (0.2 + r * 0.15)}" r="${box * 0.05}"/>`,
        );
  }
  // the bellows: zigzag top and bottom edges, a line at every fold
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= folds * 2; i++) {
    const fx = bx0 + (bw * i) / (folds * 2);
    const dy = i % 2 ? h * 0.07 : 0;
    top.push(`${fx.toFixed(1)},${(y + dy).toFixed(1)}`);
    bottom.push(`${fx.toFixed(1)},${(y + h - dy).toFixed(1)}`);
    parts.push(
      `<line x1="${fx.toFixed(1)}" y1="${(y + dy).toFixed(1)}" x2="${fx.toFixed(1)}" y2="${(y + h - dy).toFixed(1)}"/>`,
    );
  }
  parts.push(`<polyline points="${top.join(" ")}"/>`, `<polyline points="${bottom.join(" ")}"/>`);
  // the straps
  parts.push(
    `<path d="M${x + box * 0.5},${y} q${box * 0.1},${-h * 0.18} ${box * 0.5},${-h * 0.16}"/>`,
    `<path d="M${x + w - box * 0.5},${y} q${-box * 0.1},${-h * 0.18} ${-box * 0.5},${-h * 0.16}"/>`,
  );
  return `<g fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${parts.join("")}</g>`;
}

/**
 * The ground of a whole set, `n` panels wide: the brand gradient, records spinning off panel edges, a bandoneon
 * here and there, and an ink dance floor (parquet) whose wavy top edge runs through every panel.
 */
export function ground(o: { W: number; H: number; n: number; floorTop: number; landscape: boolean }): string {
  const { W, H, n } = o;
  const SW = W * n;
  const unit = Math.max(6, Math.round(Math.min(W, H) / 110));
  const floorTop = H * o.floorTop;
  const amp = H * (o.landscape ? 0.035 : 0.025);
  const tile = Math.round(Math.min(W, H) * 0.05);
  const art: string[] = [];
  // records centred on a few panel edges, in the bright half
  for (let i = 1; i < n; i += 2) {
    const cx = W * i;
    const cy = o.landscape ? H * 0.25 : H * 0.3;
    art.push(vinyl(cx, cy, Math.min(W, H) * (o.landscape ? 0.42 : 0.5), "rgba(11,10,16,.07)", unit));
  }
  // a bandoneon in panels 2 and 7 (behind the device, above the floor)
  for (const i of [1, 6].filter((k) => k < n)) {
    const bw = W * (o.landscape ? 0.5 : 0.95);
    art.push(
      bandoneon(
        W * i + (W - bw) / 2,
        floorTop - bw * 0.62,
        bw,
        "rgba(11,10,16,.09)",
        Math.max(3, unit * 0.45),
      ),
    );
  }
  return `<svg class="ground" width="${SW}" height="${H}" viewBox="0 0 ${SW} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="1" y2="0.18">
      <stop offset="0" stop-color="${C.teal}"/>
      <stop offset="0.42" stop-color="${C.pink}"/>
      <stop offset="1" stop-color="${C.coral}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0" r="0.9">
      <stop offset="0" stop-color="#fff" stop-opacity=".22"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="floorShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${C.ink2}"/>
      <stop offset="1" stop-color="${C.ink}"/>
    </linearGradient>
    <pattern id="parquet" width="${tile * 2}" height="${tile * 2}" patternUnits="userSpaceOnUse">
      <g fill="none" stroke="rgba(246,241,232,.06)" stroke-width="${Math.max(1, tile * 0.04).toFixed(1)}">
        <path d="M0,${tile} L${tile},0 M${tile},${tile * 2} L${tile * 2},${tile} M${tile},0 L${tile * 2},${tile} M0,${tile} L${tile},${tile * 2}"/>
        <path d="M${tile / 2},${tile / 2} L${tile * 1.5},${tile * 1.5}" stroke="rgba(224,85,122,.07)"/>
      </g>
    </pattern>
    <clipPath id="floorClip"><path d="${floorPath(SW, H, floorTop, amp, W * 1.6)}"/></clipPath>
  </defs>
  <rect width="${SW}" height="${H}" fill="url(#sky)"/>
  <rect width="${SW}" height="${H * 0.7}" fill="url(#glow)"/>
  ${art.join("\n")}
  <path d="${floorPath(SW, H, floorTop, amp, W * 1.6)}" fill="url(#floorShade)"/>
  <g clip-path="url(#floorClip)"><rect width="${SW}" height="${H}" fill="url(#parquet)"/>
    <path d="${floorPath(SW, H, floorTop, amp, W * 1.6)}" fill="none" stroke="${C.rose}" stroke-opacity=".55" stroke-width="${Math.max(2, unit * 0.5)}"/></g>
</svg>`;
}

/* ------------------------------------------------------------------ devices */

export interface Placement {
  /** centre of the device, in strip pixels */
  cx: number;
  cy: number;
  /** width of the device body */
  w: number;
  rot: number;
  z?: number;
}

/** The body's size for a screen of the capture's aspect, at body width w (frame thickness included). */
export function bodySize(frame: Frame, cap: Pick<CaptureDevice, "width" | "height">, w: number) {
  const f = FRAME[frame];
  const sw = w * (1 - 2 * f.side);
  const sh = (sw * cap.height) / cap.width;
  const lidH = sh + w * (f.top + f.bottom);
  return { sw, sh, h: lidH + (frame === "laptop" ? w * 0.06 : 0), lidH };
}

/** frame proportions, as fractions of the body width */
const FRAME: Record<Frame, { side: number; top: number; bottom: number; radius: number; inner: number }> = {
  phone: { side: 0.04, top: 0.04, bottom: 0.04, radius: 0.16, inner: 0.125 },
  duoOuter: { side: 0.045, top: 0.045, bottom: 0.045, radius: 0.13, inner: 0.095 },
  tablet: { side: 0.032, top: 0.032, bottom: 0.032, radius: 0.058, inner: 0.032 },
  duoInner: { side: 0.028, top: 0.028, bottom: 0.028, radius: 0.06, inner: 0.04 },
  laptop: { side: 0.03, top: 0.038, bottom: 0.034, radius: 0.028, inner: 0.006 },
};

/** the overlay a screen needs: the status bar (phone, tablet), a camera hole and status column (Duo), nothing (Mac) */
function screenChrome(frame: Frame, cap: CaptureDevice, k: number, dark: boolean): string {
  const c = dark ? "#fff" : "#000";
  if (frame === "phone") return statusBar({ kind: "phone", safe: cap.safe }, k, dark);
  if (frame === "tablet") return statusBar({ kind: "tablet", safe: cap.safe }, k, dark);
  if (frame === "duoOuter") {
    const t = cap.safe.top * k;
    const fs = 15 * k;
    return `<div style="position:absolute;inset:0 0 auto 0;height:${t}px;display:flex;align-items:center;justify-content:space-between;padding:0 ${30 * k}px;box-sizing:border-box;color:${c};font:700 ${fs}px/1 Inter,sans-serif">
      <span>9:41</span><span style="display:flex;gap:${4 * k}px;align-items:center"><i style="width:${22 * k}px;height:${11 * k}px;border:${1.2 * k}px solid ${c};border-radius:${3 * k}px;opacity:.9;display:block"></i></span></div>
      <div style="position:absolute;top:${(t - 12 * k) / 2}px;left:50%;width:${12 * k}px;height:${12 * k}px;margin-left:${-6 * k}px;border-radius:50%;background:#000;box-shadow:0 0 0 ${2 * k}px rgba(255,255,255,.05)"></div>
      <div style="position:absolute;bottom:${7 * k}px;left:50%;width:${120 * k}px;height:${5 * k}px;margin-left:${-60 * k}px;background:${c};opacity:.85;border-radius:${3 * k}px"></div>`;
  }
  if (frame === "duoInner") {
    // 27.1 SDK: the status bar is a vertical bar on the trailing edge; the fold runs down the middle
    const r = cap.safe.right * k;
    const fs = 12 * k;
    return `<div style="position:absolute;top:0;right:0;bottom:0;width:${r}px;display:flex;flex-direction:column;align-items:center;padding-top:${14 * k}px;gap:${8 * k}px;color:${c};font:700 ${fs}px/1 Inter,sans-serif">
        <span style="writing-mode:vertical-rl">9:41</span><i style="width:${10 * k}px;height:${20 * k}px;border:${1.2 * k}px solid ${c};border-radius:${3 * k}px;opacity:.9;display:block"></i></div>
      <div style="position:absolute;top:0;bottom:0;left:50%;width:${3 * k}px;margin-left:${-1.5 * k}px;background:linear-gradient(90deg,rgba(0,0,0,.10),rgba(255,255,255,.14),rgba(0,0,0,.10))"></div>
      <div style="position:absolute;bottom:${6 * k}px;left:50%;width:${160 * k}px;height:${5 * k}px;margin-left:${-80 * k}px;background:${c};opacity:.8;border-radius:${3 * k}px"></div>`;
  }
  return "";
}

/** One device with a capture in it, absolutely placed (centre, width, rotation) in the strip. */
export function device(
  frame: Frame,
  cap: CaptureDevice,
  src: string,
  p: Placement,
  o: { dark?: boolean; shadow?: number } = {},
): string {
  const f = FRAME[frame];
  const w = p.w;
  const { sw, sh, h, lidH } = bodySize(frame, cap, w);
  const k = sw / cap.width;
  const left = p.cx - w / 2;
  const top = p.cy - h / 2;
  const R = w * f.radius;
  const r = w * f.inner;
  const band = Math.max(2, w * 0.006);
  const sh1 = Math.round(w * 0.04 * (o.shadow ?? 1));
  const shadow = `0 ${sh1}px ${sh1 * 2.2}px rgba(11,10,16,.42), 0 ${Math.round(sh1 / 4)}px ${Math.round(sh1 / 2)}px rgba(11,10,16,.25)`;
  const screen = `<div class="scr" style="position:absolute;left:${w * f.side}px;top:${w * f.top}px;width:${sw}px;height:${sh}px;border-radius:${r}px;overflow:hidden;background:#000 url('${src}') center top/100% 100% no-repeat">${screenChrome(frame, cap, k, !!o.dark)}</div>`;
  const metal = "linear-gradient(135deg,#d9d6de 0%,#7d7983 18%,#3b3842 50%,#8e8a94 82%,#e3e0e7 100%)";
  let body: string;
  if (frame === "laptop") {
    const baseW = w * 1.14;
    const baseH = w * 0.034;
    body = `<div style="position:absolute;left:0;top:0;width:${w}px;height:${lidH}px;border-radius:${R}px ${R}px ${w * 0.008}px ${w * 0.008}px;background:#0c0c0f;box-shadow:inset 0 0 0 ${band}px #2e2d33,0 0 0 ${Math.max(1, band * 0.6)}px #a8a5ad">
        <div style="position:absolute;top:${w * 0.013}px;left:50%;width:${w * 0.006}px;height:${w * 0.006}px;margin-left:${-w * 0.003}px;border-radius:50%;background:#1d2a33;box-shadow:0 0 0 ${w * 0.002}px #2a2a30"></div>
        ${screen}</div>
      <div style="position:absolute;left:${(w - baseW) / 2}px;top:${lidH - 1}px;width:${baseW}px;height:${baseH}px;border-radius:0 0 ${baseW * 0.06}px ${baseW * 0.06}px / 0 0 ${baseH}px ${baseH}px;background:linear-gradient(180deg,#e9e7ec 0%,#c9c6cd 45%,#8f8c95 100%);box-shadow:0 ${baseH * 0.6}px ${baseH * 1.4}px rgba(11,10,16,.35)">
        <div style="position:absolute;left:50%;top:0;width:${baseW * 0.14}px;height:${baseH * 0.38}px;margin-left:${-baseW * 0.07}px;border-radius:0 0 ${baseH * 0.4}px ${baseH * 0.4}px;background:linear-gradient(180deg,#a9a6ae,#cfccd3)"></div></div>`;
  } else {
    const buttons =
      frame === "phone" || frame === "duoOuter"
        ? [
            [-1, 0.2, 0.05],
            [-1, 0.29, 0.085],
            [-1, 0.4, 0.085],
            [1, 0.3, frame === "duoOuter" ? 0.14 : 0.12],
          ]
        : frame === "tablet" || frame === "duoInner"
          ? [
              [0, 0.11, 0.07],
              [1, 0.1, 0.06],
              [1, 0.18, 0.06],
            ]
          : [];
    const bw = Math.max(3, w * 0.012);
    const btn = buttons
      .map(([side, at, len]) =>
        side === 0
          ? `<i style="position:absolute;top:${-bw * 0.7}px;right:${w * at!}px;width:${w * len!}px;height:${bw}px;border-radius:${bw}px;background:${metal}"></i>`
          : `<i style="position:absolute;${side! < 0 ? "left" : "right"}:${-bw * 0.7}px;top:${h * at!}px;width:${bw}px;height:${h * len!}px;border-radius:${bw}px;background:${metal}"></i>`,
      )
      .join("");
    body = `${btn}<div style="position:absolute;inset:0;border-radius:${R}px;background:${metal};padding:${band}px;box-sizing:border-box">
        <div style="position:relative;width:100%;height:100%;border-radius:${R - band}px;background:#060608;overflow:hidden">
          <div style="position:absolute;inset:0;margin:${-band}px">${screen}</div></div></div>`;
  }
  return `<div class="dev" style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;transform:rotate(${p.rot}deg);z-index:${p.z ?? 2};filter:none;border-radius:${R}px;box-shadow:${frame === "laptop" ? "none" : shadow}">${body}</div>`;
}
