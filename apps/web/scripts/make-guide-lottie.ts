// Generates public/lottie/*.json — the Guide's small hand-built Lottie loops (shape layers only, no images, no
// expressions), written compact. Run: pnpm --filter @tdj/web exec tsx scripts/make-guide-lottie.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type V = number[];
const FR = 30;
const OP = 90; // a 3 s loop
const W = 160;
const H = 120;

const ROSE: V = [0.79, 0.26, 0.42, 1];
const BLUE: V = [0.2, 0.55, 0.95, 1];
const AMBER: V = [0.9, 0.62, 0.12, 1];
const GREEN: V = [0.2, 0.66, 0.42, 1];
const GREY: V = [0.55, 0.55, 0.6, 1];

const st = (k: number | V) => ({ a: 0, k });
/** animated property: [frame, value] pairs, eased in and out, looping back to the first value */
const an = (keys: Array<[number, number | V]>) => ({
  a: 1,
  k: keys.map(([t, s], i) => {
    const v = Array.isArray(s) ? s : [s];
    return i < keys.length - 1 ? { t, s: v, i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } } : { t, s: v };
  }),
});
const tr = () => ({ ty: "tr", p: st([0, 0]), a: st([0, 0]), s: st([100, 100]), r: st(0), o: st(100) });
const fill = (c: V, o: number | ReturnType<typeof an> = 100) => ({
  ty: "fl",
  c: st(c),
  o: typeof o === "number" ? st(o) : o,
});
const stroke = (c: V, w: number, o: number | ReturnType<typeof an> = 100) => ({
  ty: "st",
  c: st(c),
  o: typeof o === "number" ? st(o) : o,
  w: st(w),
  lc: 2,
  lj: 2,
});
const rect = (w: number, h: number, r = 3, p: V = [0, 0]) => ({
  ty: "rc",
  p: st(p),
  s: st([w, h]),
  r: st(r),
});
const ellipse = (d: number, p: V = [0, 0]) => ({ ty: "el", p: st(p), s: st([d, d]) });
const path = (v: V[], closed = false) => ({
  ty: "sh",
  ks: st({ c: closed, v, i: v.map(() => [0, 0]), o: v.map(() => [0, 0]) }),
});
const group = (...it: unknown[]) => ({ ty: "gr", it: [...it, tr()] });

let ind = 0;
/** one shape layer; transform values may be animated */
function layer(
  nm: string,
  shapes: unknown[],
  ks: Partial<Record<"p" | "a" | "s" | "o" | "r", unknown>> = {},
): Record<string, unknown> {
  return {
    ddd: 0,
    ind: ++ind,
    ty: 4,
    nm,
    sr: 1,
    ks: {
      o: ks.o ?? st(100),
      r: ks.r ?? st(0),
      p: ks.p ?? st([W / 2, H / 2, 0]),
      a: ks.a ?? st([0, 0, 0]),
      s: ks.s ?? st([100, 100, 100]),
    },
    ao: 0,
    ip: 0,
    op: OP,
    st: 0,
    bm: 0,
    shapes,
  };
}
const anim = (nm: string, layers: unknown[]) => {
  ind = 0;
  return { v: "5.9.0", fr: FR, ip: 0, op: OP, w: W, h: H, nm, ddd: 0, assets: [], layers };
};

/* compose: a tanda's four sides rise one by one, a cortina waits, then the night is ready */
function compose() {
  ind = 0;
  const colors = [ROSE, ROSE, ROSE, ROSE];
  const heights = [34, 46, 58, 42];
  const bars = heights.map((h, i) =>
    layer(`side${i + 1}`, [group(rect(14, h, 4, [0, -h / 2]), fill(colors[i]!))], {
      p: st([40 + i * 20, 96, 0]),
      s: an([
        [0, [100, 0, 100]],
        [8 + i * 8, [100, 0, 100]],
        [20 + i * 8, [100, 100, 100]],
        [72, [100, 100, 100]],
        [86, [100, 0, 100]],
        [90, [100, 0, 100]],
      ]),
    }),
  );
  const cortina = layer("cortina", [group(rect(8, 14, 3, [0, -7]), fill(GREY))], {
    p: st([124, 96, 0]),
    o: an([
      [0, 0],
      [50, 0],
      [58, 100],
      [76, 100],
      [86, 0],
      [90, 0],
    ]),
  });
  const floor = layer("floor", [group(rect(112, 3, 1.5), fill(GREY, 45))], { p: st([80, 98, 0]) });
  const spark = layer(
    "spark",
    [
      group(
        path([
          [0, -9],
          [0, 9],
        ]),
        stroke(AMBER, 3),
      ),
      group(
        path([
          [-9, 0],
          [9, 0],
        ]),
        stroke(AMBER, 3),
      ),
    ],
    {
      p: st([128, 30, 0]),
      s: an([
        [0, [0, 0, 100]],
        [52, [0, 0, 100]],
        [60, [120, 120, 100]],
        [66, [100, 100, 100]],
        [80, [100, 100, 100]],
        [88, [0, 0, 100]],
        [90, [0, 0, 100]],
      ]),
      r: an([
        [52, 0],
        [88, 90],
      ]),
    },
  );
  return anim("T-DJ compose", [spark, cortina, ...bars, floor]);
}

/* headphones: the cue in your ears, sound rings on the left cup, the room quiet on the right */
function headphones() {
  ind = 0;
  const band = layer(
    "band",
    [
      group(
        {
          ty: "sh",
          ks: st({
            c: false,
            v: [
              [-34, 14],
              [0, -30],
              [34, 14],
            ],
            i: [
              [0, 0],
              [-22, 0],
              [0, 0],
            ],
            o: [
              [0, 0],
              [22, 0],
              [0, 0],
            ],
          }),
        },
        stroke(BLUE, 6),
      ),
    ],
    { p: st([80, 60, 0]) },
  );
  const cups = layer(
    "cups",
    [group(rect(16, 28, 7, [-34, 22]), fill(BLUE)), group(rect(16, 28, 7, [34, 22]), fill(BLUE))],
    { p: st([80, 60, 0]) },
  );
  const rings = [0, 1, 2].map((k) =>
    layer("ring", [group(ellipse(20), stroke(BLUE, 2.5))], {
      p: st([46, 82, 0]),
      s: an([
        [k * 20, [60, 60, 100]],
        [k * 20 + 45, [260, 260, 100]],
        [90, [260, 260, 100]],
      ]),
      o: an([
        [k * 20, 0],
        [k * 20 + 6, 70],
        [k * 20 + 45, 0],
        [90, 0],
      ]),
    }),
  );
  return anim("T-DJ headphones", [cups, band, ...rings]);
}

/* rooms: one night, three devices; a beat travels from the host to each of them */
function rooms() {
  ind = 0;
  const host = layer("host", [group(rect(30, 22, 5), fill(ROSE))], {
    p: st([80, 34, 0]),
    s: an([
      [0, [100, 100, 100]],
      [10, [110, 110, 100]],
      [20, [100, 100, 100]],
      [90, [100, 100, 100]],
    ]),
  });
  const spots: V[] = [
    [32, 92],
    [80, 98],
    [128, 92],
  ];
  const lines = spots.map((p, i) =>
    layer(
      `link${i}`,
      [
        group(
          path([
            [80, 46],
            [p[0]!, p[1]! - 10],
          ]),
          stroke(GREY, 2, 60),
          {
            ty: "tm",
            s: st(0),
            e: an([
              [10 + i * 6, 0],
              [34 + i * 6, 100],
              [80, 100],
              [90, 0],
            ]),
            o: st(0),
            m: 1,
          },
        ),
      ],
      { p: st([0, 0, 0]) },
    ),
  );
  const devices = spots.map((p, i) =>
    layer(`device${i}`, [group(rect(16, 22, 4), fill(BLUE))], {
      p: st([p[0]!, p[1]!, 0]),
      o: an([
        [0, 35],
        [34 + i * 6, 35],
        [40 + i * 6, 100],
        [80, 100],
        [90, 35],
      ]),
    }),
  );
  return anim("T-DJ rooms", [host, ...lines, ...devices]);
}

/* find songs: a magnifier glides over three song rows and stops on the one that fits */
function search() {
  ind = 0;
  const rows = [0, 1, 2].map((i) =>
    layer(
      `row${i}`,
      [
        group(rect(14, 14, 3, [-38, 0]), fill(i === 1 ? ROSE : GREY, i === 1 ? 100 : 55)),
        group(rect(64, 6, 3, [6, -3]), fill(GREY, 45)),
        group(rect(40, 5, 2.5, [-6, 6]), fill(GREY, 30)),
      ],
      { p: st([76, 30 + i * 30, 0]) },
    ),
  );
  const glass = layer(
    "glass",
    [
      group(ellipse(26), stroke(AMBER, 4)),
      group(
        path([
          [9, 9],
          [20, 20],
        ]),
        stroke(AMBER, 5),
      ),
    ],
    {
      p: an([
        [0, [40, 30, 0]],
        [24, [112, 30, 0]],
        [48, [40, 60, 0]],
        [64, [76, 60, 0]],
        [80, [76, 60, 0]],
        [90, [40, 30, 0]],
      ]),
    },
  );
  return anim("T-DJ find songs", [glass, ...rows]);
}

/* learned preferences: three nudges in the same direction, then the curve leans that way for good */
function learn() {
  ind = 0;
  const curve = layer(
    "curve",
    [
      group(
        {
          ty: "sh",
          ks: st({
            c: false,
            v: [
              [16, 92],
              [64, 62],
              [104, 70],
              [144, 30],
            ],
            i: [
              [0, 0],
              [-18, 8],
              [-14, 0],
              [-16, 14],
            ],
            o: [
              [18, -8],
              [14, 0],
              [16, -14],
              [0, 0],
            ],
          }),
        },
        stroke(ROSE, 4),
        {
          ty: "tm",
          s: st(0),
          e: an([
            [0, 0],
            [40, 100],
            [80, 100],
            [90, 0],
          ]),
          o: st(0),
          m: 1,
        },
      ),
    ],
    { p: st([0, 0, 0]) },
  );
  const nudges = [0, 1, 2].map((i) =>
    layer(
      `nudge${i}`,
      [
        group(
          path([
            [0, 8],
            [0, -8],
          ]),
          stroke(GREEN, 3),
        ),
        group(
          path([
            [-6, -2],
            [0, -8],
            [6, -2],
          ]),
          stroke(GREEN, 3),
        ),
      ],
      {
        p: st([40 + i * 28, 104, 0]),
        o: an([
          [0, 0],
          [6 + i * 10, 0],
          [12 + i * 10, 100],
          [76, 100],
          [86, 0],
          [90, 0],
        ]),
      },
    ),
  );
  const dot = layer("dot", [group(ellipse(10), fill(AMBER))], {
    p: st([144, 30, 0]),
    s: an([
      [0, [0, 0, 100]],
      [40, [0, 0, 100]],
      [48, [130, 130, 100]],
      [56, [100, 100, 100]],
      [80, [100, 100, 100]],
      [88, [0, 0, 100]],
      [90, [0, 0, 100]],
    ]),
  });
  return anim("T-DJ learned preferences", [dot, curve, ...nudges]);
}

const out = join(__dirname, "..", "public", "lottie");
mkdirSync(out, { recursive: true });
for (const [name, data] of Object.entries({ compose, headphones, rooms, search, learn })) {
  const json = JSON.stringify(data());
  writeFileSync(join(out, `${name}.json`), `${json}\n`);
  console.log(`${name}.json ${json.length} bytes`);
}
