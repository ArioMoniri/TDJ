/**
 * Our own handheld models for the App Store pictures (store creative v3), from public sizes only (no product images,
 * renders or logos): a space-black phone with a titanium-like band and an island cutout, a thin-bezel tablet, and a
 * book-style foldable, folded (outer display) and open (inner display). Units are points of each device's own
 * screen (its capture's CSS size, apps/desktop/store/creative/spec.ts → CAPTURE), so a capture fills its screen
 * exactly. Plain numbers (no three.js): the store pipeline lays captures out with `fitHandheld` on the same grid the
 * 3D still (HandheldStill.tsx) is rendered for.
 */

export type HandheldKind = "phone" | "tablet" | "duoOuter" | "duoInner";

export interface HandheldSpec {
  /** the screen, pt (the capture's CSS size) and its corner radius */
  sw: number;
  sh: number;
  sr: number;
  /** the black glass border round the screen, and the metal band round the glass (seen from the front) */
  border: number;
  band: number;
  /** the body's thickness and the rounding of its edges */
  t: number;
  bevel: number;
  /** how far buttons and hinges stand out of the body's outline, each side */
  margin: number;
  /** keys on the edges: side −1 left, 1 right, 0 top; `at` from the body's top (or right) edge; `len` along it */
  keys: Array<{ side: -1 | 0 | 1; at: number; len: number; flush?: boolean }>;
  /** the phone's island: a pill over the top of the screen */
  island?: { w: number; h: number; top: number };
  /** the front camera in the bezel: x, y from the screen's centre */
  lens?: { x: number; y: number; r: number };
  /** the folded foldable: the hinge's spine along the left edge */
  spine?: boolean;
  /** the open foldable: the hinge across the middle (a gap in the band, top and bottom) */
  fold?: boolean;
}

export const HANDHELD: Record<HandheldKind, HandheldSpec> = {
  // 6.9-inch class, 19.5:9: an even 5.4 pt border, a 3.4 pt band
  phone: {
    sw: 440,
    sh: 956,
    sr: 62,
    border: 5.4,
    band: 3.4,
    t: 46,
    bevel: 7,
    margin: 3.2,
    keys: [
      { side: -1, at: 178, len: 40 },
      { side: -1, at: 258, len: 70 },
      { side: -1, at: 346, len: 70 },
      { side: 1, at: 270, len: 112 },
      { side: 1, at: 560, len: 74, flush: true },
    ],
    island: { w: 126, h: 37, top: 13.5 },
  },
  // 13-inch class, portrait: a 30 pt border all round, the camera on the long edge (the right, held upright)
  tablet: {
    sw: 1032,
    sh: 1376,
    sr: 30,
    border: 30,
    band: 2.6,
    t: 27,
    bevel: 5,
    margin: 3,
    keys: [
      { side: 0, at: 120, len: 92 },
      { side: 1, at: 130, len: 64 },
      { side: 1, at: 210, len: 64 },
    ],
    lens: { x: 1032 / 2 + 15, y: 0, r: 3.6 },
  },
  // the foldable, folded: the outer display (466 × 678 pt), a thick body, the hinge's spine on the left
  duoOuter: {
    sw: 466,
    sh: 678,
    sr: 48,
    border: 6.2,
    band: 3.6,
    t: 58,
    bevel: 9,
    margin: 7,
    keys: [
      { side: 1, at: 150, len: 96 },
      { side: 1, at: 270, len: 58 },
      { side: 1, at: 340, len: 58 },
    ],
    spine: true,
  },
  // the foldable, open like a book: the inner display (951 × 669 pt), the fold down the middle
  duoInner: {
    sw: 951,
    sh: 669,
    sr: 36,
    border: 8,
    band: 3.4,
    t: 28,
    bevel: 6,
    margin: 3,
    keys: [
      { side: 0, at: 150, len: 82 },
      { side: 1, at: 110, len: 56 },
      { side: 1, at: 180, len: 56 },
    ],
    fold: true,
  },
};

/** the body's outline, pt */
export function bodyOf(kind: HandheldKind) {
  const d = HANDHELD[kind];
  const w = d.sw + 2 * (d.border + d.band);
  const h = d.sh + 2 * (d.border + d.band);
  return { w, h, r: d.sr + d.border + d.band };
}

export type Rect = { x: number; y: number; w: number; h: number };

/** where a handheld lands in a picture: px per pt, the screen (with its corner radius), the body, the whole outline */
export interface HandheldFit {
  kind: HandheldKind;
  scale: number;
  cx: number;
  cy: number;
  screen: Rect & { r: number };
  body: Rect & { r: number };
  /** the body with its keys and hinge: what must stay inside the picture */
  outer: Rect;
}

/** the handheld as large as fits in `box` (px), centred in it */
export function fitHandheld(kind: HandheldKind, box: Rect): HandheldFit {
  const d = HANDHELD[kind];
  const b = bodyOf(kind);
  const scale = Math.min(box.w / (b.w + 2 * d.margin), box.h / (b.h + 2 * d.margin));
  return placeHandheld(kind, box.x + box.w / 2, box.y + box.h / 2, scale);
}

/** the handheld with its screen centred on (cx, cy), `scale` px per pt */
export function placeHandheld(kind: HandheldKind, cx: number, cy: number, scale: number): HandheldFit {
  const d = HANDHELD[kind];
  const b = bodyOf(kind);
  const sw = d.sw * scale;
  const sh = d.sh * scale;
  const bw = b.w * scale;
  const bh = b.h * scale;
  const m = d.margin * scale;
  return {
    kind,
    scale,
    cx,
    cy,
    screen: { x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh, r: d.sr * scale },
    body: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh, r: b.r * scale },
    outer: { x: cx - bw / 2 - m, y: cy - bh / 2 - m, w: bw + 2 * m, h: bh + 2 * m },
  };
}

/** the lens every handheld still is taken with (a long lens: square on, the edges barely bent) */
export const HANDHELD_FOV = 12;

/**
 * The still's size: the device with its keys and a little air (the perspective makes the near band a hair larger),
 * even numbers, the screen at its centre. Lay it with `stillRect`.
 */
export function stillSize(kind: HandheldKind, scale: number) {
  const d = HANDHELD[kind];
  const b = bodyOf(kind);
  const even = (n: number) => 2 * Math.ceil(n / 2);
  return {
    width: even((b.w + 2 * d.margin) * scale * 1.04 + 8),
    height: even((b.h + 2 * d.margin) * scale * 1.04 + 8),
  };
}

/** where a still for `fit` goes in the picture (its centre on the screen's centre) */
export function stillRect(fit: HandheldFit): Rect {
  const s = stillSize(fit.kind, fit.scale);
  return { x: fit.cx - s.width / 2, y: fit.cy - s.height / 2, w: s.width, h: s.height };
}
