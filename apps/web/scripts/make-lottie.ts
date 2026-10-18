// Generates public/anim/vinyl.json — a hand-built Lottie: spinning vinyl with grooves and a rose label, plus a pulsing "energy" ring.
import { mkdirSync, writeFileSync } from "node:fs";

const fr = 30,
  ip = 0,
  op = 120,
  w = 400,
  h = 400;
const ellipse = (nm: string, d: number, fill: number[], op = 100) => ({
  ty: "gr",
  nm,
  it: [
    { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [d, d] } },
    { ty: "fl", c: { a: 0, k: fill }, o: { a: 0, k: op } },
    {
      ty: "tr",
      p: { a: 0, k: [0, 0] },
      a: { a: 0, k: [0, 0] },
      s: { a: 0, k: [100, 100] },
      r: { a: 0, k: 0 },
      o: { a: 0, k: 100 },
    },
  ],
});
const ring = (nm: string, d: number, sw: number, c: number[], o = 100) => ({
  ty: "gr",
  nm,
  it: [
    { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [d, d] } },
    { ty: "st", c: { a: 0, k: c }, o: { a: 0, k: o }, w: { a: 0, k: sw } },
    {
      ty: "tr",
      p: { a: 0, k: [0, 0] },
      a: { a: 0, k: [0, 0] },
      s: { a: 0, k: [100, 100] },
      r: { a: 0, k: 0 },
      o: { a: 0, k: 100 },
    },
  ],
});
const disc = {
  ddd: 0,
  ind: 1,
  ty: 4,
  nm: "disc",
  sr: 1,
  ks: {
    o: { a: 0, k: 100 },
    r: {
      a: 1,
      k: [
        { t: ip, s: [0], e: [360], i: { x: [0.833], y: [0.833] }, o: { x: [0.167], y: [0.167] } },
        { t: op },
      ],
    },
    p: { a: 0, k: [w / 2, h / 2, 0] },
    a: { a: 0, k: [0, 0, 0] },
    s: { a: 0, k: [100, 100, 100] },
  },
  ao: 0,
  ip,
  op,
  st: 0,
  bm: 0,
  shapes: [
    ellipse("vinyl", 300, [0.07, 0.06, 0.09, 1]),
    ...[270, 240, 210, 180, 150].map((d, i) => ring(`groove${i}`, d, 1.5, [1, 1, 1], 14)),
    {
      ty: "gr",
      nm: "shine",
      it: [
        {
          ty: "sh",
          ks: {
            a: 0,
            k: {
              c: false,
              v: [
                [-120, -60],
                [-60, -120],
              ],
              i: [
                [0, 0],
                [0, 0],
              ],
              o: [
                [0, 0],
                [0, 0],
              ],
            },
          },
        },
        { ty: "st", c: { a: 0, k: [1, 1, 1] }, o: { a: 0, k: 35 }, w: { a: 0, k: 14 }, lc: 2 },
        {
          ty: "tr",
          p: { a: 0, k: [0, 0] },
          a: { a: 0, k: [0, 0] },
          s: { a: 0, k: [100, 100] },
          r: { a: 0, k: 0 },
          o: { a: 0, k: 100 },
        },
      ],
    },
    ellipse("label", 96, [0.88, 0.33, 0.48, 1]),
    {
      ty: "gr",
      nm: "arc",
      it: [
        {
          ty: "sh",
          ks: {
            a: 0,
            k: {
              c: false,
              v: [
                [-26, 20],
                [-8, 20],
                [-8, 2],
                [10, 2],
                [10, -16],
                [28, -16],
              ],
              i: [
                [0, 0],
                [0, 0],
                [0, 0],
                [0, 0],
                [0, 0],
                [0, 0],
              ],
              o: [
                [0, 0],
                [0, 0],
                [0, 0],
                [0, 0],
                [0, 0],
                [0, 0],
              ],
            },
          },
        },
        { ty: "st", c: { a: 0, k: [1, 1, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 7 }, lc: 2, lj: 2 },
        {
          ty: "tr",
          p: { a: 0, k: [0, 0] },
          a: { a: 0, k: [0, 0] },
          s: { a: 0, k: [100, 100] },
          r: { a: 0, k: 0 },
          o: { a: 0, k: 100 },
        },
      ],
    },
    ellipse("hole", 10, [0.07, 0.06, 0.09, 1]),
  ].reverse(),
};
const pulse = {
  ddd: 0,
  ind: 2,
  ty: 4,
  nm: "pulse",
  sr: 1,
  ks: {
    o: {
      a: 1,
      k: [
        { t: 0, s: [45], e: [0], i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } },
        { t: 60, s: [0], e: [45] },
        { t: 120 },
      ],
    },
    r: { a: 0, k: 0 },
    p: { a: 0, k: [w / 2, h / 2, 0] },
    a: { a: 0, k: [0, 0, 0] },
    s: {
      a: 1,
      k: [
        { t: 0, s: [100, 100, 100], e: [125, 125, 100], i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } },
        { t: 60, s: [125, 125, 100], e: [100, 100, 100] },
        { t: 120 },
      ],
    },
  },
  ao: 0,
  ip,
  op,
  st: 0,
  bm: 0,
  shapes: [ring("pulse", 310, 6, [0.88, 0.33, 0.48], 100)],
};
const anim = {
  v: "5.9.0",
  fr,
  ip,
  op,
  w,
  h,
  nm: "TDJ vinyl",
  ddd: 0,
  assets: [],
  layers: [pulse, disc],
  meta: { g: "TDJ make-lottie.ts" },
};
mkdirSync("public/anim", { recursive: true });
writeFileSync("public/anim/vinyl.json", JSON.stringify(anim));
console.log("wrote public/anim/vinyl.json");
