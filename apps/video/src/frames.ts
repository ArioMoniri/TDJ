/**
 * The device frames shared by the README clips (Clip.tsx, Remotion) and the README stills
 * (apps/web/scripts/media/stills.ts, plain HTML). The devices themselves are 3D renders (three/devices.ts,
 * three/DeviceFrame.tsx → public/frames/<kind>.png, `pnpm media:frames`): the laptop straight on, the iPad-class
 * tablet, the phone with its titanium band and camera cutout, each with a transparent screen. Here they are laid
 * out around a content rectangle; the phone's status bar (9:41, signal, Wi-Fi, battery) and home indicator are
 * drawn in HTML so they stay sharp at any size.
 *
 * Every function takes the CONTENT rectangle (where the app's pixels go, stage px). `frameUnder` is the soft shadow
 * behind the device, `frameOver` the status bar and the device picture over the content. A phone's screen is
 * taller than its content: the status bar band sits above the app.
 */
import { FRAMES } from "./three/devices";

export type Kind = "desktop" | "tablet" | "phone";
export type Rect = { x: number; y: number; w: number; h: number };

/** the iPhone-class status bar, in points of a 393 pt wide screen */
export const STATUS_PT = 54;
/** the device picture for a kind, relative to apps/video/public */
export const frameFile = (kind: Kind) => `frames/${kind}.png`;

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const box = (r: Rect) => `left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)}`;

/** the screen (the lit glass) for a content rectangle */
export function screenRect(kind: Kind, c: Rect): Rect {
  if (kind !== "phone") return c;
  const u = c.w / 393;
  return { x: c.x, y: c.y - STATUS_PT * u, w: c.w, h: c.h + STATUS_PT * u };
}

/** stage px per image px, for a content width */
const k = (kind: Kind, contentW: number) => contentW / FRAMES[kind].screen.w;

export function screenRadius(kind: Kind, c: Rect): string {
  return px(FRAMES[kind].screen.r * k(kind, c.w));
}

/** how much room a frame needs around its content (for layout): left/right, top, bottom */
export function chrome(kind: Kind, contentW: number) {
  const f = FRAMES[kind];
  const s = k(kind, contentW);
  const status = kind === "phone" ? STATUS_PT * (contentW / 393) : 0;
  return {
    side: Math.max(f.screen.x, f.w - f.screen.x - f.screen.w) * s,
    top: f.screen.y * s + status,
    bottom: (f.h - f.screen.y - f.screen.h) * s,
  };
}

/** where the device picture goes for a content rectangle */
function imageRect(kind: Kind, c: Rect): Rect {
  const f = FRAMES[kind];
  const sc = screenRect(kind, c);
  const s = k(kind, c.w);
  return { x: sc.x - f.screen.x * s, y: sc.y - f.screen.y * s, w: f.w * s, h: f.h * s };
}

/** the soft shadow the device casts on the background */
export function frameUnder(kind: Kind, c: Rect, _o: { dark?: boolean } = {}): string {
  const f = FRAMES[kind];
  const ir = imageRect(kind, c);
  const s = k(kind, c.w);
  const b = { x: ir.x + f.body.x * s, y: ir.y + f.body.y * s, w: f.body.w * s, h: f.body.h * s };
  const r = f.body.r * s;
  return `<div style="position:absolute;${box(b)};border-radius:${px(r)};box-shadow:0 ${px(b.h * 0.05)} ${px(b.h * 0.1)} -${px(b.h * 0.02)} rgba(30,6,24,.55),0 ${px(b.h * 0.02)} ${px(b.h * 0.035)} -${px(b.h * 0.015)} rgba(0,0,0,.45)"></div>`;
}

const SIGNAL = (fill: string) =>
  `<svg viewBox="0 0 18 12" width="100%" height="100%"><g fill="${fill}"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></g></svg>`;
const WIFI = (fill: string) =>
  `<svg viewBox="0 0 16 12" width="100%" height="100%"><g fill="${fill}"><path d="M8 2.3c2.4 0 4.6.9 6.3 2.5l1.2-1.3C13.5 1.6 10.9.5 8 .5S2.5 1.6.5 3.5l1.2 1.3C3.4 3.2 5.6 2.3 8 2.3z"/><path d="M8 5.6c1.5 0 2.8.5 3.9 1.5l1.2-1.3C11.7 4.5 9.9 3.8 8 3.8S4.3 4.5 2.9 5.8l1.2 1.3C5.2 6.1 6.5 5.6 8 5.6z"/><path d="M8 8.9c.6 0 1.2.2 1.6.6L8 11.5 6.4 9.5c.4-.4 1-.6 1.6-.6z"/></g></svg>`;
const BATTERY = (fill: string) =>
  `<svg viewBox="0 0 27 13" width="100%" height="100%"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="${fill}" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.2" fill="${fill}"/><path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2z" fill="${fill}" fill-opacity=".45"/></svg>`;

/**
 * Over the content: a phone's status bar and home indicator, then the device picture (its screen is transparent).
 * `img` is the picture's URL: staticFile(frameFile(kind)) in Remotion, a data URL in the stills.
 */
export function frameOver(
  kind: Kind,
  c: Rect,
  o: { dark?: boolean; statusBg?: string; img: string },
): string {
  const ir = imageRect(kind, c);
  const img = `<img src="${o.img}" style="position:absolute;${box(ir)}">`;
  if (kind !== "phone") return img;
  const s = screenRect(kind, c);
  const u = c.w / 393;
  const ink = o.dark ? "#fff" : "#000";
  const bg = o.statusBg ?? (o.dark ? "#000" : "#f2f2f7");
  const at = (x: number, y: number, w: number, h: number) =>
    box({ x: s.x + x * u, y: s.y + y * u, w: w * u, h: h * u });
  return [
    `<div style="position:absolute;${box({ x: s.x, y: s.y, w: s.w, h: STATUS_PT * u })};background:${bg}"></div>`,
    `<div style="position:absolute;${at(28, 17, 70, 22)};font:600 ${px(17 * u)}/${px(22 * u)} -apple-system,'SF Pro Text','Inter',system-ui,sans-serif;color:${ink};text-align:center;letter-spacing:-.01em">9:41</div>`,
    `<div style="position:absolute;${at(286, 22.5, 18, 12)}">${SIGNAL(ink)}</div>`,
    `<div style="position:absolute;${at(309, 22.5, 16, 12)}">${WIFI(ink)}</div>`,
    `<div style="position:absolute;${at(331, 22, 27, 13)}">${BATTERY(ink)}</div>`,
    `<div style="position:absolute;${box({ x: s.x + s.w / 2 - 67 * u, y: s.y + s.h - 13 * u, w: 134 * u, h: 5 * u })};border-radius:${px(3 * u)};background:${ink};opacity:.85"></div>`,
    img,
  ].join("");
}

/** the content rectangle for content of cw × ch CSS px, its framed device centred on (cx, cy) within maxW × maxH */
export function fitDevice(
  kind: Kind,
  cw: number,
  ch: number,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
): Rect {
  let s = Math.min(maxW / cw, maxH / ch);
  let c = chrome(kind, cw * s);
  for (let i = 0; i < 3; i++) {
    s = Math.min((maxW - 2 * c.side) / cw, (maxH - c.top - c.bottom) / ch);
    c = chrome(kind, cw * s);
  }
  const w = cw * s;
  const h = ch * s;
  return { x: cx - w / 2, y: cy - (h + c.top + c.bottom) / 2 + c.top, w, h };
}
