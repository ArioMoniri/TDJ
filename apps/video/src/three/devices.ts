/**
 * The device frames the README clips and stills sit in, as 3D renders (DeviceFrame.tsx renders each once to
 * public/frames/<kind>.png, `pnpm media:frames`): seen straight on with an orthographic camera, so the screen is an
 * exact rectangle, and the screen itself is a transparent hole the app's pixels show through.
 *
 * Our own models, from public sizes only (no product images or logos):
 * - phone: a 393 × 852 pt screen (6.1-inch class, 19.5:9), 55 pt screen corners, a thin even black border, a
 *   titanium band, a pill-shaped camera cutout, the action button and volume keys on the left, the side key on
 *   the right;
 * - tablet: an 1180 × 820 pt screen in landscape, an even black border, an aluminium edge, the camera on the long
 *   edge;
 * - laptop: the hero's laptop (laptop.ts), lid open square to the camera, the base's front edge below.
 *
 * `FRAMES` gives each image's size and the screen's rectangle in image pixels; frames.ts uses it to lay out a frame
 * around any content rectangle.
 */
import { APP_H, BASE_H, BASE_W, LID_D, PANEL_TOP, PANEL_W, PIVOT, STRIP_H } from "./laptop";

export type FrameKind = "phone" | "tablet" | "desktop";
export type FrameMeta = {
  /** px per model unit in the image */
  scale: number;
  w: number;
  h: number;
  /** the hole, in image px */
  screen: { x: number; y: number; w: number; h: number; r: number };
  /** the body's outline, in image px (for the drop shadow) */
  body: { x: number; y: number; w: number; h: number; r: number };
  /** the model-space point at the image centre */
  centre: { x: number; y: number };
};

export const PHONE = { sw: 393, sh: 852, sr: 55, border: 6.6, band: 3.1, t: 8.3 };
export const TABLET = { sw: 1180, sh: 820, sr: 18, border: 19, band: 2.4, t: 6 };
const MARGIN = 6; // model units around the body (buttons stick out)

function flat(kind: "phone" | "tablet", scale: number): FrameMeta {
  const d = kind === "phone" ? PHONE : TABLET;
  const bw = d.sw + 2 * (d.border + d.band);
  const bh = d.sh + 2 * (d.border + d.band);
  const w = Math.round((bw + 2 * MARGIN) * scale);
  const h = Math.round((bh + 2 * MARGIN) * scale);
  return {
    scale,
    w,
    h,
    screen: {
      x: (w - d.sw * scale) / 2,
      y: (h - d.sh * scale) / 2,
      w: d.sw * scale,
      h: d.sh * scale,
      r: d.sr * scale,
    },
    body: {
      x: (w - bw * scale) / 2,
      y: (h - bh * scale) / 2,
      w: bw * scale,
      h: bh * scale,
      r: (d.sr + d.border + d.band) * scale,
    },
    centre: { x: 0, y: 0 },
  };
}

function laptop(scale: number): FrameMeta {
  // straight on, lid at 90°: x is x, the lid's length runs up from the hinge
  const top = PIVOT.y + LID_D + 0.2;
  const bottom = -0.35;
  const half = BASE_W / 2 + 0.3;
  const w = Math.round(2 * half * scale);
  const h = Math.round((top - bottom) * scale);
  const appTop = PIVOT.y + LID_D - PANEL_TOP - STRIP_H; // the bezel, then the strip
  return {
    scale,
    w,
    h,
    screen: {
      x: (half - PANEL_W / 2) * scale,
      y: (top - appTop) * scale,
      w: PANEL_W * scale,
      h: APP_H * scale,
      r: 0.25 * scale,
    },
    body: {
      x: 0.3 * scale,
      y: 0.2 * scale,
      w: BASE_W * scale,
      h: (top - 0.2 - bottom - 0.35 + BASE_H * 0) * scale,
      r: 1 * scale,
    },
    centre: { x: 0, y: (top + bottom) / 2 },
  };
}

/** phone at 3 px/pt, tablet at 2 px/pt, laptop with its app area at 2560 px (the clips' 1280 pt at 2×) */
export const FRAMES: Record<FrameKind, FrameMeta> = {
  phone: flat("phone", 3),
  tablet: flat("tablet", 2),
  desktop: laptop(2560 / PANEL_W),
};
