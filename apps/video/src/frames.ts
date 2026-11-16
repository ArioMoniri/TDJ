/**
 * The device frames shared by the README clips (Clip.tsx, Remotion) and the README stills
 * (apps/web/scripts/media/stills.ts, plain HTML): drawn here, no product images or logos.
 *
 * - desktop: a laptop seen straight on (black glass, an even thin bezel, a camera notch, rounded top corners, an
 *   aluminium base lip), the same laptop as the README hero (Laptop.tsx) so every clip lines up with it;
 * - tablet: an even black bezel and rounded corners;
 * - phone: ~19.5:9, an even thin bezel in a metal band, a pill-shaped camera cutout, side buttons, a status bar
 *   (9:41, signal, Wi-Fi, battery) above the app and a home indicator over it.
 *
 * Every function takes the CONTENT rectangle (where the app's pixels go, stage px) and returns HTML strings: `under`
 * (the body, behind the screen) and `over` (cutouts, status bar, glass), so a caller puts its video or image
 * between them. A phone's screen is taller than its content: the status bar band sits above the app.
 */
export type Kind = "desktop" | "tablet" | "phone";
export type Rect = { x: number; y: number; w: number; h: number };

/** the iPhone-class status bar, in points of a 393 pt wide screen */
export const STATUS_PT = 54;

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const box = (r: Rect) => `left:${px(r.x)};top:${px(r.y)};width:${px(r.w)};height:${px(r.h)}`;

/** the screen (the lit glass) for a content rectangle */
export function screenRect(kind: Kind, c: Rect): Rect {
  if (kind !== "phone") return c;
  const u = c.w / 393;
  return { x: c.x, y: c.y - STATUS_PT * u, w: c.w, h: c.h + STATUS_PT * u };
}

export function screenRadius(kind: Kind, c: Rect): string {
  const u = c.w / (kind === "phone" ? 393 : kind === "tablet" ? 1180 : 1280);
  if (kind === "phone") return px(55 * u);
  if (kind === "tablet") return px(18 * u);
  return `${px(10 * u)} ${px(10 * u)} ${px(2 * u)} ${px(2 * u)}`;
}

/** how much room a frame needs around its content (for layout): left/right, top, bottom */
export function chrome(kind: Kind, contentW: number) {
  if (kind === "phone") {
    const u = contentW / 393;
    return { side: 13 * u, top: (13 + STATUS_PT) * u, bottom: 13 * u };
  }
  if (kind === "tablet") {
    const u = contentW / 1180;
    return { side: 24 * u, top: 24 * u, bottom: 24 * u };
  }
  const u = contentW / 1280;
  return { side: 30 * u, top: 18 * u, bottom: 30 * u + 22 * u };
}

const SHADOW = "0 50px 100px -24px rgba(30,6,24,.6), 0 26px 50px -28px rgba(0,0,0,.5)";

export function frameUnder(kind: Kind, c: Rect, _o: { dark?: boolean } = {}): string {
  const s = screenRect(kind, c);
  if (kind === "phone") {
    const u = c.w / 393;
    const bezel = 10 * u;
    const band = 2.6 * u;
    const body = {
      x: s.x - bezel - band,
      y: s.y - bezel - band,
      w: s.w + 2 * (bezel + band),
      h: s.h + 2 * (bezel + band),
    };
    const r = 55 * u + bezel + band;
    const btn = (left: boolean, top: number, h: number) =>
      `<div style="position:absolute;${box({ x: left ? body.x - 2.4 * u : body.x + body.w - 0.6 * u, y: body.y + top * u, w: 3 * u, h: h * u })};border-radius:${px(1.6 * u)};background:linear-gradient(${left ? 90 : 270}deg,#5c5c63,#9d9ea6 55%,#6e6f76)"></div>`;
    return [
      btn(true, 128, 30),
      btn(true, 190, 58),
      btn(true, 262, 58),
      btn(false, 214, 92),
      // the metal band, then the black glass
      `<div style="position:absolute;${box(body)};border-radius:${px(r)};background:linear-gradient(135deg,#8f9097 0%,#d4d5da 22%,#6f7077 50%,#c2c3c8 78%,#7b7c83 100%);box-shadow:${SHADOW}"></div>`,
      `<div style="position:absolute;${box({ x: body.x + band, y: body.y + band, w: body.w - 2 * band, h: body.h - 2 * band })};border-radius:${px(r - band)};background:#050506;box-shadow:inset 0 0 0 ${px(0.8 * u)} rgba(255,255,255,.08)"></div>`,
    ].join("");
  }
  if (kind === "tablet") {
    const u = c.w / 1180;
    const b = 22 * u;
    const body = { x: s.x - b, y: s.y - b, w: s.w + 2 * b, h: s.h + 2 * b };
    return `<div style="position:absolute;${box({ x: body.x - 2 * u, y: body.y - 2 * u, w: body.w + 4 * u, h: body.h + 4 * u })};border-radius:${px(40 * u)};background:linear-gradient(135deg,#9a9ba1,#d6d7dc 30%,#7c7d83 60%,#babbc0);box-shadow:${SHADOW}"></div><div style="position:absolute;${box(body)};border-radius:${px(38 * u)};background:#0a0a0c"></div>`;
  }
  // the laptop, straight on: the lid (glass, bezel), then the base lip under the hinge
  const u = c.w / 1280;
  const side = 16 * u;
  const top = 18 * u;
  const chin = 26 * u;
  const lid = { x: s.x - side, y: s.y - top, w: s.w + 2 * side, h: s.h + top + chin };
  const base = { x: lid.x - 34 * u, y: lid.y + lid.h, w: lid.w + 68 * u, h: 16 * u };
  return [
    `<div style="position:absolute;${box(lid)};border-radius:${px(24 * u)} ${px(24 * u)} ${px(6 * u)} ${px(6 * u)};background:#0b0b0d;box-shadow:${SHADOW},0 0 0 ${px(1.5 * u)} #a9aab0,0 0 0 ${px(3 * u)} #7d7e85"></div>`,
    // the hinge: a dark slot between the lid and the base
    `<div style="position:absolute;${box({ x: lid.x + 60 * u, y: lid.y + lid.h - 1 * u, w: lid.w - 120 * u, h: 4 * u })};background:linear-gradient(180deg,#2a2a2e,#5a5b61)"></div>`,
    `<div style="position:absolute;${box(base)};border-radius:${px(3 * u)} ${px(3 * u)} ${px(16 * u)} ${px(16 * u)};background:linear-gradient(180deg,#e3e4e8 0%,#c9cacf 35%,#a3a4ab 80%,#8b8c93 100%);box-shadow:0 30px 40px -18px rgba(25,4,20,.55)">` +
      `<div style="position:absolute;left:${px(base.w / 2 - 90 * u)};top:0;width:${px(180 * u)};height:${px(6 * u)};border-radius:0 0 ${px(8 * u)} ${px(8 * u)};background:linear-gradient(180deg,#9c9da3,#c3c4c9)"></div></div>`,
  ].join("");
}

const SIGNAL = (fill: string) =>
  `<svg viewBox="0 0 18 12" width="100%" height="100%"><g fill="${fill}"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></g></svg>`;
const WIFI = (fill: string) =>
  `<svg viewBox="0 0 16 12" width="100%" height="100%"><g fill="${fill}"><path d="M8 2.3c2.4 0 4.6.9 6.3 2.5l1.2-1.3C13.5 1.6 10.9.5 8 .5S2.5 1.6.5 3.5l1.2 1.3C3.4 3.2 5.6 2.3 8 2.3z"/><path d="M8 5.6c1.5 0 2.8.5 3.9 1.5l1.2-1.3C11.7 4.5 9.9 3.8 8 3.8S4.3 4.5 2.9 5.8l1.2 1.3C5.2 6.1 6.5 5.6 8 5.6z"/><path d="M8 8.9c.6 0 1.2.2 1.6.6L8 11.5 6.4 9.5c.4-.4 1-.6 1.6-.6z"/></g></svg>`;
const BATTERY = (fill: string) =>
  `<svg viewBox="0 0 27 13" width="100%" height="100%"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="${fill}" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.2" fill="${fill}"/><path d="M25 4.5v4c.8-.3 1.4-1.1 1.4-2s-.6-1.7-1.4-2z" fill="${fill}" fill-opacity=".45"/></svg>`;

export function frameOver(kind: Kind, c: Rect, o: { dark?: boolean; statusBg?: string } = {}): string {
  const s = screenRect(kind, c);
  if (kind === "phone") {
    const u = c.w / 393;
    const ink = o.dark ? "#fff" : "#000";
    const bg = o.statusBg ?? (o.dark ? "#000" : "#f2f2f7");
    const bar = { x: s.x, y: s.y, w: s.w, h: STATUS_PT * u };
    const at = (x: number, y: number, w: number, h: number) =>
      box({ x: s.x + x * u, y: s.y + y * u, w: w * u, h: h * u });
    return [
      // the status bar band (the app's own top colour), the time, the indicators
      `<div style="position:absolute;${box(bar)};background:${bg};border-radius:${px(55 * u)} ${px(55 * u)} 0 0"></div>`,
      `<div style="position:absolute;${at(28, 17, 70, 22)};font:600 ${px(17 * u)}/${px(22 * u)} -apple-system,'SF Pro Text','Inter',system-ui,sans-serif;color:${ink};text-align:center;letter-spacing:-.01em">9:41</div>`,
      `<div style="position:absolute;${at(286, 22.5, 18, 12)}">${SIGNAL(ink)}</div>`,
      `<div style="position:absolute;${at(309, 22.5, 16, 12)}">${WIFI(ink)}</div>`,
      `<div style="position:absolute;${at(331, 22, 27, 13)}">${BATTERY(ink)}</div>`,
      // the camera cutout
      `<div style="position:absolute;${at(393 / 2 - 63, 11, 126, 37)};border-radius:${px(18.5 * u)};background:#000"><div style="position:absolute;right:${px(12 * u)};top:${px(11.5 * u)};width:${px(14 * u)};height:${px(14 * u)};border-radius:50%;background:radial-gradient(circle at 35% 35%,#2b3550,#06070b 70%)"></div></div>`,
      // the home indicator, over the app
      `<div style="position:absolute;${box({ x: s.x + s.w / 2 - 67 * u, y: s.y + s.h - 13 * u, w: 134 * u, h: 5 * u })};border-radius:${px(3 * u)};background:${ink};opacity:.85"></div>`,
      // glass: a faint reflection
      `<div style="position:absolute;${box(s)};border-radius:${px(55 * u)};background:linear-gradient(120deg,rgba(255,255,255,.07),rgba(255,255,255,0) 35%);pointer-events:none"></div>`,
    ].join("");
  }
  if (kind === "tablet") {
    const u = c.w / 1180;
    return `<div style="position:absolute;${box(s)};border-radius:${px(18 * u)};background:linear-gradient(120deg,rgba(255,255,255,.06),rgba(255,255,255,0) 35%);pointer-events:none"></div>`;
  }
  const u = c.w / 1280;
  return [
    `<div style="position:absolute;${box({ x: s.x + s.w / 2 - 70 * u, y: s.y - 1 * u, w: 140 * u, h: 22 * u })};border-radius:0 0 ${px(11 * u)} ${px(11 * u)};background:#0b0b0d"><div style="position:absolute;left:${px(65.5 * u)};top:${px(6.5 * u)};width:${px(9 * u)};height:${px(9 * u)};border-radius:50%;background:radial-gradient(circle at 35% 35%,#3a4660,#0d1018 70%)"></div></div>`,
    `<div style="position:absolute;${box(s)};border-radius:${screenRadius("desktop", c)};background:linear-gradient(115deg,rgba(255,255,255,.05),rgba(255,255,255,0) 38%);pointer-events:none"></div>`,
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
