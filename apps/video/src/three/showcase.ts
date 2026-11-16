/**
 * Where the laptop's app area sits in a picture, as fractions of the frame. Plain numbers (no three.js), so the store
 * pipeline (apps/desktop/store/creative) can lay captures and headlines out on the same grid as the 3D render
 * (laptop.ts → squarePose puts the camera so that the app area lands exactly on `appRect`).
 */

/** the app area under the menu-bar strip: 16:10, the captures' own shape */
export const APP_ASPECT = 1.6;

/**
 * the app area: `w` its width over the frame's width, `top` its top edge over the frame's height, centred; `deg` the
 * lid's opening for this shot (the camera looks down by deg − 90°; default laptop.ts → OPEN_DEG); `fov` the lens
 * (default SHOWCASE_FOV)
 */
export type Placement = { w: number; top: number; deg?: number; fov?: number };

export function appRect(W: number, H: number, p: Placement) {
  const w = p.w * W;
  return { x: (W - w) / 2, y: p.top * H, w, h: w / APP_ASPECT };
}

/** the camera's vertical field of view for every product shot, in degrees */
export const SHOWCASE_FOV = 24;

/**
 * The layouts. The README hero at rest: the screen as wide as the laptop allows, the keyboard's first rows below it
 * in the screen's light. Its opening shot: the whole laptop, low in the frame, under a headline. The Mac App Store
 * panels (2880 × 1800 and 2560 × 1600, one picture for both) and the Mac app preview (1920 × 1080): Apple's product
 * page shot, the whole laptop (the lid, the deck, the front edge) centred under a headline, seen almost level (lid at
 * 95°) through a long lens (12°), so the deck is a thin wedge and the screen keeps ≥ 58 % of the panel's width. The
 * numbers come from laptop.ts → laptopBounds (apps/desktop/test/creative.test.ts checks them).
 */
export const PLACE = {
  heroRest: { w: 0.79, top: 0.075 },
  heroWide: { w: 0.4, top: 0.265 },
  storeMac: { w: 0.584, top: 0.187, deg: 95, fov: 12 },
  previewMac: { w: 0.513, top: 0.2006, deg: 95, fov: 12 },
} as const satisfies Record<string, Placement>;
