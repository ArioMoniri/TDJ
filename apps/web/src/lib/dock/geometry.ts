/**
 * 2026-11 (the owner: "the circular shape always on screen player … like gramophone on side bar") — the one player's
 * geometry, pure: where a floating player may stand (inside the safe areas, clear of the tab bar and the sidebar),
 * how a release snaps it to an edge or a corner, how big it may be (a round gramophone below a card's width), how a
 * pinch or the handle resizes it, the ring of the gramophone (how much of the song is left) and what a device keeps.
 * components/player/PlayerDock.tsx does the pointer work; everything it decides comes from here (geometry.test.ts).
 */

export type Edge = "left" | "right";
export type Corner = "top" | "bottom" | null;
export interface Box {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
/** what the floating player must stay clear of, px from each viewport edge (safe areas, the tab bar, the sidebar) */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
/** where a floating player stands, independent of the window's size: an edge and how far down it (0 top … 1 bottom) */
export interface Anchor {
  edge: Edge;
  y: number;
}

/** the round gramophone's diameter */
export const DISC = { min: 56, def: 76, max: 112 } as const;
/** the floating card's width; any size below `CARD.min` is the gramophone */
export const CARD = { min: 260, def: 300, max: 420 } as const;
/** the breath between the player and whatever it stays clear of */
export const MARGIN = 12;
/** a release this close to the top or the bottom of its range snaps into that corner */
export const CORNER = 72;
/** a press moves this far before it is a drag (a tap below it) */
export const DRAG_SLOP = 6;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** the range a box's top-left corner may take */
export function bounds(box: Box, vp: Box, ins: Insets, m = MARGIN) {
  const minX = ins.left + m;
  const minY = ins.top + m;
  return {
    minX,
    minY,
    maxX: Math.max(minX, vp.w - ins.right - m - box.w),
    maxY: Math.max(minY, vp.h - ins.bottom - m - box.h),
  };
}

/** a point kept inside the range (while the finger drags: it never leaves the safe area) */
export function clampPos(p: Point, box: Box, vp: Box, ins: Insets): Point {
  const b = bounds(box, vp, ins);
  return { x: clamp(p.x, b.minX, b.maxX), y: clamp(p.y, b.minY, b.maxY) };
}

/**
 * a release: the nearer side edge (as iOS picture in picture), the top or bottom corner when the box ends close to
 * one, else the height it was let go at; and the anchor that keeps that place when the window changes size
 */
export function snap(p: Point, box: Box, vp: Box, ins: Insets): Point & { anchor: Anchor; corner: Corner } {
  const b = bounds(box, vp, ins);
  const centre = p.x + box.w / 2;
  const mid = (b.minX + b.maxX + box.w) / 2;
  const edge: Edge = centre < mid ? "left" : "right";
  const x = edge === "left" ? b.minX : b.maxX;
  let y = clamp(p.y, b.minY, b.maxY);
  let corner: Corner = null;
  if (y - b.minY < CORNER) {
    y = b.minY;
    corner = "top";
  } else if (b.maxY - y < CORNER) {
    y = b.maxY;
    corner = "bottom";
  }
  const span = b.maxY - b.minY;
  return { x, y, corner, anchor: { edge, y: span > 0 ? (y - b.minY) / span : 1 } };
}

/** an anchor laid out in the current window */
export function place(a: Anchor, box: Box, vp: Box, ins: Insets): Point {
  const b = bounds(box, vp, ins);
  return {
    x: a.edge === "left" ? b.minX : b.maxX,
    y: b.minY + clamp(a.y, 0, 1) * (b.maxY - b.minY),
  };
}

/** a size is the gramophone below a card's width */
export const isDisc = (size: number) => size < CARD.min;
/** every size the handle or a pinch may reach while it moves */
export const clampSize = (size: number) => clamp(Math.round(size), DISC.min, CARD.max);
/** the gramophone's diameter for a size */
export const discOf = (size: number) => clamp(Math.round(size), DISC.min, DISC.max);

/**
 * a let-go size: a card keeps its width, a gramophone its diameter; between the largest gramophone and the narrowest
 * card it settles on the nearer of the two (no half-card, no giant disc)
 */
export function settleSize(size: number): number {
  const s = clampSize(size);
  if (s <= DISC.max) return discOf(s);
  if (s >= CARD.min) return s;
  return s - DISC.max < CARD.min - s ? DISC.max : CARD.min;
}

/** a pinch: the size it started at, scaled by how far the two fingers moved apart */
export function pinchSize(start: number, d0: number, d1: number): number {
  if (!(d0 > 0) || !(d1 > 0)) return clampSize(start);
  return clampSize(start * (d1 / d0));
}

/**
 * the handle: it stands on the card's inner corner (away from its edge), so dragging it away from the edge grows the
 * card — rightwards on the left edge, leftwards on the right
 */
export function handleSize(start: number, dx: number, edge: Edge): number {
  return clampSize(start + (edge === "left" ? dx : -dx));
}

/** the box a size draws: a circle, or a card of its measured height */
export function boxOf(size: number, cardH: number): Box {
  if (isDisc(size)) {
    const d = discOf(size);
    return { w: d, h: d };
  }
  return { w: Math.min(size, CARD.max), h: cardH };
}

/**
 * The gramophone's ring: how much of the song has played (`frac`, 0 … 1) drawn as an arc of a circle of radius `r`
 * (an SVG stroke: `dasharray` the circumference, `dashoffset` what is still to come), and the seconds left.
 */
export function ring(pos: number, len: number, r: number) {
  const ok = Number.isFinite(pos) && Number.isFinite(len) && len > 0;
  const frac = ok ? clamp(pos / len, 0, 1) : 0;
  const circumference = 2 * Math.PI * r;
  return {
    frac,
    remaining: ok ? Math.max(0, len - Math.max(0, pos)) : 0,
    circumference,
    offset: circumference * (1 - frac),
  };
}

/** where a drag let go re-docks the player: on the open sidebar, or onto the bottom bar's place (above the tab bar) */
export function dropTarget(
  p: Point,
  vp: Box,
  o: { sideRight: number | null; barTop: number | null },
): "side" | "bar" | null {
  if (o.sideRight !== null && p.x <= o.sideRight) return "side";
  if (o.barTop !== null && p.y >= o.barTop && p.y <= vp.h) return "bar";
  return null;
}

/* ——— what a device keeps ——— */

export type FormFactor = "phone" | "tablet" | "desktop";
/** a phone, an iPad portrait (no sidebar) and a window with the sidebar keep their own place */
export const formOf = (vw: number): FormFactor => (vw < 600 ? "phone" : vw < 900 ? "tablet" : "desktop");
export const dockKey = (f: FormFactor) => `tdj-player-dock:${f}`;

export interface DockSaved {
  /** floating (a card or the gramophone) rather than docked in the sidebar or the bottom bar */
  detached: boolean;
  anchor: Anchor;
  size: number;
}
export const defaultSaved = (f: FormFactor): DockSaved => ({
  detached: false,
  anchor: { edge: f === "desktop" ? "left" : "right", y: 1 },
  size: f === "phone" ? DISC.def : CARD.def,
});

/** a stored place, checked: anything missing or out of range falls back to the default */
export function parseSaved(raw: string | null, f: FormFactor): DockSaved {
  const d = defaultSaved(f);
  if (!raw) return d;
  try {
    const v = JSON.parse(raw) as Partial<DockSaved> | null;
    if (!v || typeof v !== "object") return d;
    const edge = v.anchor?.edge === "left" || v.anchor?.edge === "right" ? v.anchor.edge : d.anchor.edge;
    const y =
      typeof v.anchor?.y === "number" && Number.isFinite(v.anchor.y) ? clamp(v.anchor.y, 0, 1) : d.anchor.y;
    const size = typeof v.size === "number" && Number.isFinite(v.size) ? settleSize(v.size) : d.size;
    return { detached: v.detached === true, anchor: { edge, y }, size };
  } catch {
    return d;
  }
}
export const serializeSaved = (s: DockSaved) =>
  JSON.stringify({
    detached: s.detached,
    anchor: { edge: s.anchor.edge, y: Math.round(s.anchor.y * 1000) / 1000 },
    size: Math.round(s.size),
  });

/* ——— where the player is ——— */

export type Place = "side" | "bar" | "float" | "disc";
/**
 * one player, one place: floating where the user put it (a card, or the gramophone below a card's width); else in the
 * sidebar when it is open, the gramophone when it is collapsed, the bottom bar where there is no sidebar
 */
export function placeOf(s: DockSaved, env: { wide: boolean; collapsed: boolean }): Place {
  if (s.detached) return isDisc(s.size) ? "disc" : "float";
  if (env.wide) return env.collapsed ? "disc" : "side";
  return "bar";
}
