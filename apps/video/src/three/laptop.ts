/**
 * Our own 14-inch-class pro laptop, modelled from public dimensions only (31.26 × 22.12 × 1.55 cm): no product
 * images, renders or logos. Units are centimetres; x right, y up, z toward the front edge.
 *
 * This module is plain three.js (no React) so the camera maths can be shared with the 2D layer: `screenCorners()`
 * gives the app's rectangle in world space for any lid angle, and Hero projects it to pixels.
 */
import * as THREE from "three";
import { APP_ASPECT, appRect, type Placement, SHOWCASE_FOV } from "./showcase";

export const BASE_W = 31.26;
export const BASE_D = 22.12;
export const BASE_H = 0.95;
export const LID_T = 0.58;
/** the lid: the panel, an even 0.5 cm bezel on the top and sides, and a short chin that the hinge half hides */
export const LID_D = 21.3;
/** the panel: 14.2" at 1.54:1; the app fills the 16:10 part under the menu-bar strip that holds the notch */
export const PANEL_W = 30.25;
export const PANEL_H = 19.64;
export const APP_H = PANEL_W / APP_ASPECT;
export const STRIP_H = PANEL_H - APP_H;
/** from the lid's top edge to the panel */
export const PANEL_TOP = 0.46;
/** the hinge: the lid turns about this line (x along the width) */
export const PIVOT = new THREE.Vector3(0, BASE_H + 0.09, -BASE_D / 2 + 0.36);
export const OPEN_DEG = 108;

/** a rounded rectangle in the XY plane, centred */
export function rrShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * A slab w (x) × d (z) × t (y) with rounded corners (radius r) and a chamfer-like bevel b on every edge, sitting on
 * y = 0, centred in x and z.
 */
export function slab(w: number, d: number, t: number, r: number, b: number, segs = 3): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(rrShape(w - 2 * b, d - 2 * b, Math.max(0.01, r - b)), {
    depth: Math.max(0.001, t - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: segs,
    curveSegments: 18,
  });
  // the shape is in XY, extruded along +z: lay it down (thickness on y), the shape's +y toward the front (+z)
  g.rotateX(Math.PI / 2);
  g.translate(0, t - b, 0);
  g.computeVertexNormals();
  return g;
}

/** the lid's transform for an opening angle (0 = shut, OPEN_DEG = open) */
export function lidMatrix(deg: number): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeTranslation(PIVOT.x, PIVOT.y, PIVOT.z);
  m.multiply(new THREE.Matrix4().makeRotationX((-deg * Math.PI) / 180));
  return m;
}

/**
 * In the lid's own space the slab runs from the hinge (z = 0) to its top edge (z = LID_D), y from 0 to LID_T, the
 * glass on the y = 0 face (facing −y: down onto the keys when shut, toward the viewer when open).
 */
export const panelCentreLocal = new THREE.Vector3(0, -0.012, LID_D - PANEL_TOP - PANEL_H / 2);
export const appCentreLocal = new THREE.Vector3(0, -0.014, LID_D - PANEL_TOP - STRIP_H - APP_H / 2);

/** the app's corners in world space: top-left, top-right, bottom-right, bottom-left (as seen on the screen) */
export function screenCorners(deg: number): THREE.Vector3[] {
  const m = lidMatrix(deg);
  const c = appCentreLocal;
  // local +z is the screen's up, local x its right (seen from the front)
  return [
    new THREE.Vector3(c.x - PANEL_W / 2, c.y, c.z + APP_H / 2),
    new THREE.Vector3(c.x + PANEL_W / 2, c.y, c.z + APP_H / 2),
    new THREE.Vector3(c.x + PANEL_W / 2, c.y, c.z - APP_H / 2),
    new THREE.Vector3(c.x - PANEL_W / 2, c.y, c.z - APP_H / 2),
  ].map((v) => v.applyMatrix4(m));
}

/** the screen's centre and outward normal in world space */
export function screenFrame(deg: number) {
  const m = lidMatrix(deg);
  const centre = appCentreLocal.clone().applyMatrix4(m);
  const normal = new THREE.Vector3(0, -1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(m)).normalize();
  return { centre, normal };
}

/** MacBook-class key layout, in key units (u); rows from the function row to the bottom row */
export type Key = { x: number; y: number; w: number; h: number };
export function keyLayout(): Key[] {
  const rows: Array<Array<number>> = [
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], // esc, F1–F12, the fingerprint key (half height)
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75],
    [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
  ];
  const keys: Key[] = [];
  let y = 0;
  rows.forEach((row, i) => {
    const h = i === 0 ? 0.55 : 1;
    let x = 0;
    for (const w of row) {
      keys.push({ x, y, w, h });
      x += w;
    }
    y += h;
  });
  // the bottom row: fn, control, option, command, the space bar, command, option, then the inverted-T arrows
  let x = 0;
  for (const w of [1, 1, 1, 1.25, 5, 1.25, 1]) {
    keys.push({ x, y, w, h: 1 });
    x += w;
  }
  keys.push({ x, y: y + 0.5, w: 1, h: 0.5 }); // left
  keys.push({ x: x + 1, y, w: 1, h: 0.5 }); // up
  keys.push({ x: x + 1, y: y + 0.5, w: 1, h: 0.5 }); // down
  keys.push({ x: x + 2, y: y + 0.5, w: 1, h: 0.5 }); // right
  return keys;
}
export const KEY_ROWS_U = 5.55; // the function row (0.55), four rows, the bottom row
export const KEY_COLS_U = 14.5;

/** a camera: where it is, what it looks at, which way is up */
export type Pose = { pos: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 };

/**
 * The product shot: the camera on the open screen's axis (so the app area is an exact rectangle in the picture: video
 * and captures can be laid on it in 2D), placed so that the app area lands on `appRect(W, H, p)`. With the lid at
 * OPEN_DEG the axis looks down on the laptop by OPEN_DEG − 90°: the front, a little from above.
 */
export function squarePose(W: number, H: number, p: Placement, fovDeg: number, deg = OPEN_DEG): Pose {
  const m = lidMatrix(deg);
  const rot = new THREE.Matrix4().extractRotation(m);
  const normal = new THREE.Vector3(0, -1, 0).applyMatrix4(rot).normalize();
  const up = new THREE.Vector3(0, 0, 1).applyMatrix4(rot).normalize();
  const centre = appCentreLocal.clone().applyMatrix4(m);
  const f = H / 2 / Math.tan((fovDeg * Math.PI) / 360); // px
  const r = appRect(W, H, p);
  const d = (PANEL_W * f) / r.w;
  const pos = centre
    .clone()
    .addScaledVector(normal, d)
    .addScaledVector(up, -((H / 2 - (r.y + r.h / 2)) * d) / f)
    .addScaledVector(new THREE.Vector3(1, 0, 0), -((r.x + r.w / 2 - W / 2) * d) / f);
  return { pos, target: pos.clone().sub(normal), up };
}

/**
 * Where the whole laptop lands in a W × H picture taken with `squarePose` (the lid's back and top edge, the base's
 * front edge and its feet), in px, from the slabs' corners (their rounded corners only make it a little smaller).
 */
export function laptopBounds(W: number, H: number, p: Placement, fovDeg = p.fov ?? SHOWCASE_FOV) {
  const deg = p.deg ?? OPEN_DEG;
  const pose = squarePose(W, H, p, fovDeg, deg);
  const cam = new THREE.PerspectiveCamera(fovDeg, W / H, 1, 1000);
  cam.up.copy(pose.up);
  cam.position.copy(pose.pos);
  cam.lookAt(pose.target);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const lid = lidMatrix(deg);
  const pts: THREE.Vector3[] = [];
  for (const x of [-BASE_W / 2, BASE_W / 2]) {
    for (const y of [0, LID_T])
      for (const z of [0, LID_D]) pts.push(new THREE.Vector3(x, y, z).applyMatrix4(lid));
    for (const y of [0, BASE_H])
      for (const z of [-BASE_D / 2, BASE_D / 2]) pts.push(new THREE.Vector3(x, y, z));
  }
  const px = pts.map((v) => {
    const n = v.clone().project(cam);
    return { x: ((n.x + 1) / 2) * W, y: ((1 - n.y) / 2) * H };
  });
  return {
    left: Math.min(...px.map((q) => q.x)),
    right: Math.max(...px.map((q) => q.x)),
    top: Math.min(...px.map((q) => q.y)),
    bottom: Math.max(...px.map((q) => q.y)),
  };
}

/**
 * The largest placement that keeps the whole laptop inside `box` (px) of a W × H picture, centred in it (the app
 * area is centred across the picture, so the box should be too).
 */
export function fitLaptop(
  W: number,
  H: number,
  box: { top: number; bottom: number; left: number; right: number },
  look: { deg: number; fov: number },
): Placement {
  let lo = 0.1;
  let hi = 0.95;
  let best: Placement = { w: lo, top: 0.2, ...look };
  for (let k = 0; k < 28; k++) {
    const w = (lo + hi) / 2;
    let p: Placement = { w, top: 0.2, ...look };
    let b = laptopBounds(W, H, p);
    for (let i = 0; i < 4; i++) {
      const want = (box.top + box.bottom) / 2 - (b.bottom - b.top) / 2;
      p = { ...p, top: p.top + (want - b.top) / H };
      b = laptopBounds(W, H, p);
    }
    if (b.top >= box.top && b.bottom <= box.bottom && b.left >= box.left && b.right <= box.right) {
      lo = w;
      best = p;
    } else hi = w;
  }
  return best;
}
