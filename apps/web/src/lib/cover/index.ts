import { type Locale, tIn } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/en";
import { SANS, SERIF } from "./glyphs";
import { coverSeedOf, fnv, isSeed } from "./seed";
import { cleanText, fitLine, measure, textPath, wrap } from "./text";

export { coverSeedOf, fnv, nightIdentity } from "./seed";

/**
 * Wave 4 — every night's own cover, drawn from its data: the energy arc as one smooth line, a mark per tanda in its
 * rhythm's colour, the title, the length and tanda count, the era and the T-DJ mark, over a background motif.
 * Pure: no DOM, no fonts (the words are outlines, ./text.ts); the string is rasterised by a canvas in the browser
 * and the apps (./raster.ts) and by resvg on the server (the Open Graph image).
 *
 * One cover per generation. The cover's family (its colour pairing, its motif, the motif's angle and density) comes
 * from the night's cover seed: the hash of its identity (every tanda's song ids and cortina, the opening, the
 * closing and the engine seed), or the `coverSeed` a History entry keeps. So the same night gets a byte-identical
 * cover in every export (Spotify, History, Share, the .tdjnight preview, the link preview), and two generations
 * differ at a glance, even at 56 px. An edit inside one History entry (a new version) keeps the entry's `coverSeed`,
 * so it keeps its family; the arc, the marks and the words follow the version on screen.
 *
 * Uses: the Spotify playlist cover (640 × 640), History thumbnails (56 px, light and dark), the Share sheet's
 * preview and the 1200 × 630 Open Graph image of a shared night link.
 */

export type CoverTheme = "light" | "dark";
export interface CoverOptions {
  /** a square's side in px, or "og" for 1200 × 630; under 160 px the cover drops its words (a thumbnail) */
  size?: number | "og";
  theme?: CoverTheme;
  locale?: Locale;
}

/** what a cover is made of: a Playlist, a `.tdjnight` file or a short link's night all reduce to this */
export interface CoverData {
  /** the cover family: 8 hex characters (the generation's identity hash, or the History entry's `coverSeed`) */
  seed: string;
  /** the night's name as kept (the title is its part before " · ") */
  name: string;
  era: string | null;
  durationSec: number;
  /** the planned length, when there is no duration */
  hours: number | null;
  tandas: Array<{ rhythm: string; energy: number }>;
}

interface SideLike {
  id?: unknown;
  durationSec?: unknown;
}
interface TandaLike {
  rhythm?: unknown;
  energy?: unknown;
  targetEnergy?: unknown;
  durationSec?: unknown;
  songs?: SideLike[];
  sides?: SideLike[];
  cortina?: { id?: unknown; lengthSec?: unknown } | null;
}
interface NightLike {
  name?: unknown;
  coverSeed?: unknown;
  options?: { eras?: unknown; hours?: unknown; seed?: unknown } | null;
  stats?: { durationSec?: unknown } | null;
  tandas?: unknown;
  opening?: SideLike | null;
  closing?: SideLike | null;
}

const num = (x: unknown, d = 0) => (typeof x === "number" && Number.isFinite(x) ? x : d);
const RHYTHMS = ["tango", "vals", "milonga"];
const asNight = (p: unknown) => (p && typeof p === "object" ? p : {}) as NightLike;
const tandasOf = (n: NightLike) =>
  (Array.isArray(n.tandas) ? n.tandas : []).filter((t): t is TandaLike => !!t && typeof t === "object");

/** a Playlist, a NightFile or anything shaped like one, read defensively (a cover never throws) */
export function coverData(p: unknown): CoverData {
  const n = asNight(p);
  const tandas = tandasOf(n);
  // a Playlist keeps the measured energy; a night file keeps the target it was built for
  const energy = (t: TandaLike) => Math.max(0, Math.min(100, num(t.energy, num(t.targetEnergy, 50))));
  let durationSec = num(n.stats?.durationSec);
  if (!durationSec)
    durationSec = tandas.reduce(
      (a, t) =>
        a +
        (num(t.durationSec) ||
          (Array.isArray(t.sides) ? t.sides.reduce((b, s) => b + num(s?.durationSec), 0) : 0) +
            num(t.cortina?.lengthSec)),
      0,
    );
  const eras = n.options?.eras;
  return {
    seed: coverSeedOf(p),
    name: typeof n.name === "string" ? n.name : "",
    era: Array.isArray(eras) && typeof eras[0] === "string" ? eras[0] : null,
    durationSec,
    hours: num(n.options?.hours) || null,
    tandas: tandas.map((t) => ({
      rhythm: typeof t.rhythm === "string" && RHYTHMS.includes(t.rhythm) ? t.rhythm : "tango",
      energy: energy(t),
    })),
  };
}

const isCoverData = (p: unknown): p is CoverData =>
  !!p && typeof p === "object" && "durationSec" in p && "seed" in p && !("options" in p);

/** a hash of everything the cover draws (its family and its arc, words and marks): the cache key's first part */
export function nightHash(p: unknown): string {
  const d = isCoverData(p) ? p : coverData(p);
  return fnv(
    JSON.stringify([
      d.seed,
      d.name,
      d.era,
      Math.round(d.durationSec / 60),
      d.hours,
      d.tandas.map((t) => `${t.rhythm[0]}${Math.round(t.energy)}`).join(""),
    ]),
  );
}

/** the cache key of one rendering (History caches by it) */
export const coverKey = (p: unknown, o: CoverOptions = {}) =>
  `${nightHash(p)}:${o.size ?? 640}:${o.theme ?? "light"}:${o.locale ?? "en"}`;

/** mulberry32: the family's variation, the same for the same seed */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Variant {
  bg0: string;
  bg1: string;
  text: string;
  line: string;
  motif: string;
  /** the ground is dark: light rhythm marks and logo */
  deep: boolean;
}
/**
 * Ten colour pairings inside the brand (globals.css, brand/README.md): cream, blush, rose, wine, and the tints the
 * app already uses (the vals teal, the milonga violet, the --bg-* apricot and midnight, sand, plum), each with a
 * light and a dark variant so History follows the app's theme.
 */
const PAIRINGS: Array<{ name: string; light: Variant; dark: Variant }> = [
  {
    name: "cream",
    light: {
      bg0: "#F6F1E8",
      bg1: "#EEDFD3",
      text: "#3A1420",
      line: "#C9426A",
      motif: "#3A1420",
      deep: false,
    },
    dark: { bg0: "#1B0C14", bg1: "#3A1420", text: "#F6F1E8", line: "#F47896", motif: "#F6F1E8", deep: true },
  },
  {
    name: "blush",
    light: {
      bg0: "#F9E3E7",
      bg1: "#EEB8C5",
      text: "#4A0F24",
      line: "#8E1F43",
      motif: "#8E1F43",
      deep: false,
    },
    dark: { bg0: "#6B2A4A", bg1: "#3E1530", text: "#FFE8EE", line: "#FFC2D1", motif: "#FFC2D1", deep: true },
  },
  {
    name: "rose",
    light: { bg0: "#E37C99", bg1: "#B9345D", text: "#FFF4F0", line: "#FFF1E6", motif: "#FFF1E6", deep: true },
    dark: { bg0: "#B9345D", bg1: "#7E1D3F", text: "#FFF1E6", line: "#FFF1E6", motif: "#FFE0E8", deep: true },
  },
  {
    name: "wine",
    light: { bg0: "#74253D", bg1: "#3A1420", text: "#F6F1E8", line: "#F6A9BC", motif: "#F6F1E8", deep: true },
    dark: { bg0: "#0B0A10", bg1: "#1E1A2A", text: "#F6F1E8", line: "#E0557A", motif: "#E0557A", deep: true },
  },
  {
    name: "teal",
    light: {
      bg0: "#D5EFEA",
      bg1: "#97D3C8",
      text: "#0B3B36",
      line: "#0F5E57",
      motif: "#0F5E57",
      deep: false,
    },
    dark: { bg0: "#062824", bg1: "#0F4F48", text: "#E4FBF7", line: "#7FE3D8", motif: "#7FE3D8", deep: true },
  },
  {
    name: "violet",
    light: {
      bg0: "#E6E0FB",
      bg1: "#BBAEF2",
      text: "#26145C",
      line: "#4B2BA8",
      motif: "#4B2BA8",
      deep: false,
    },
    dark: { bg0: "#1A1238", bg1: "#36246F", text: "#EEEAFF", line: "#BFB2FF", motif: "#BFB2FF", deep: true },
  },
  {
    name: "apricot",
    light: {
      bg0: "#FCE3CC",
      bg1: "#F2B184",
      text: "#4A1A0A",
      line: "#A3361F",
      motif: "#A3361F",
      deep: false,
    },
    dark: { bg0: "#3A1A0C", bg1: "#6E3417", text: "#FFEEDF", line: "#FFB989", motif: "#FFB989", deep: true },
  },
  {
    name: "sand",
    light: {
      bg0: "#F1E7CC",
      bg1: "#D6BE8A",
      text: "#3D2A08",
      line: "#7A5312",
      motif: "#5A3A10",
      deep: false,
    },
    dark: { bg0: "#231C0C", bg1: "#4A3A18", text: "#FAF0D6", line: "#F0CF7A", motif: "#F0CF7A", deep: true },
  },
  {
    name: "midnight",
    light: {
      bg0: "#DCE4F3",
      bg1: "#A6B9E0",
      text: "#0F1F3A",
      line: "#24407A",
      motif: "#24407A",
      deep: false,
    },
    dark: { bg0: "#08101F", bg1: "#14284A", text: "#E8EEFB", line: "#9DB8F5", motif: "#9DB8F5", deep: true },
  },
  {
    name: "plum",
    light: {
      bg0: "#EEDCEC",
      bg1: "#C995C4",
      text: "#3D0F38",
      line: "#6E1F66",
      motif: "#6E1F66",
      deep: false,
    },
    dark: { bg0: "#260C24", bg1: "#4D1A47", text: "#FBE6F7", line: "#F0A6E6", motif: "#F0A6E6", deep: true },
  },
];
const MOTIFS = ["grooves", "bellows", "rings", "waves", "dots"] as const;
export type Motif = (typeof MOTIFS)[number];
const RHYTHM_ON = {
  light: { tango: "#B3264F", vals: "#0F766E", milonga: "#6D28D9" } as Record<string, string>,
  deep: { tango: "#FF8FAB", vals: "#5FE0D2", milonga: "#B9ADFF" } as Record<string, string>,
};

/** the family a seed picks: pairing, motif, the motif's angle and density (exported for the tests) */
export function coverFamily(seed: string) {
  const h = Number.parseInt(isSeed(seed) ? seed : fnv(seed), 16);
  const rand = rng(h);
  // pairing and motif from separate bits, so the 50 combinations spread evenly
  const pairing = PAIRINGS[(h >>> 0) % PAIRINGS.length]!;
  const motif = MOTIFS[Math.floor(rand() * MOTIFS.length)]!;
  return { pairing, motif, angle: Math.floor(rand() * 180), density: 0.7 + rand() * 0.7, rand };
}

const ERA_KEY: Record<string, MsgKey> = {
  golden: "nightName.golden_age",
  "golden-extended": "nightName.golden_age_extended",
  "guardia-vieja": "nightName.guardia_vieja",
  "post-golden": "nightName.post_golden",
  nuevo: "nightName.nuevo",
  contemporary: "nightName.contemporary",
  all: "nightName.all_eras",
};

/** the title: the name's part before " · " (lib/nightName.ts nightTitle), in the cover's language when unnamed */
export function coverTitle(d: CoverData, locale: Locale = "en"): string {
  return cleanText(d.name.split(" · ")[0]) || tIn(locale, "nightName.tonight_s_milonga");
}
/** "4 h 36 · 25 tandas" */
export function coverMeta(d: CoverData, locale: Locale = "en"): string {
  const m = Math.max(0, Math.round(d.durationSec / 60));
  const len = m
    ? m >= 60
      ? m % 60
        ? tIn(locale, "cover.h_min", { h: Math.floor(m / 60), r: String(m % 60).padStart(2, "0") })
        : tIn(locale, "cover.h", { h: m / 60 })
      : tIn(locale, "cover.min", { r: m })
    : d.hours
      ? tIn(locale, "cover.h", { h: `${d.hours}`.replace(".5", "½") })
      : "";
  const n = d.tandas.length;
  const cat = new Intl.PluralRules(locale).select(n) === "one" ? "one" : "other";
  const count = tIn(locale, `cover.tandas.${cat}` as MsgKey, { count: n });
  return len ? `${len} · ${count}` : count;
}
export function coverEra(d: CoverData, locale: Locale = "en"): string {
  const k = ERA_KEY[d.era ?? "golden"];
  return k ? tIn(locale, k) : cleanText(d.era);
}

export function escapeXml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "apos" }[c]};`,
  );
}
const f1 = (n: number) => Math.round(n * 10) / 10;

/** the T-DJ lockup (brand/lockup.svg): record ring, tanda line, wordmark; 698 × 256 */
function lockup(x: number, y: number, h: number, ring: string, tanda: string) {
  const k = h / 256;
  return `<g transform="translate(${f1(x)} ${f1(y)}) scale(${Math.round(k * 10000) / 10000})"><path fill="${ring}" d="M217.98 108A100 100 0 1 1 200 68L166.65 68A76 76 0 1 0 193.32 108Z"/><path fill="${tanda}" d="M49.99 156H132V76H244V100H108V180H65.4A75.4 75.4 0 0 1 49.99 156Z"/><g fill="${ring}" fill-rule="evenodd"><path d="M276 40H428V62H364V216H340V62H276Z"/><path d="M444 40H508A90 88 0 0 1 508 216H444ZM468 62H508A66 66 0 0 1 508 194H468Z"/><path d="M654 40H678V179A40 40 0 0 1 598 179H622A16 16 0 0 0 654 179Z"/></g></g>`;
}

/** horizontal-midpoint cubic through the points (the app's EnergyCurve shape) */
function smooth(pts: Array<[number, number]>): string {
  if (!pts.length) return "";
  let d = `M${f1(pts[0]![0])} ${f1(pts[0]![1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!;
    const [x1, y1] = pts[i]!;
    const cx = f1((x0 + x1) / 2);
    d += `C${cx} ${f1(y0)} ${cx} ${f1(y1)} ${f1(x1)} ${f1(y1)}`;
  }
  return d;
}

/** the background motif over the whole canvas (W × H), rotated by the family's angle */
function motifSvg(
  motif: Motif,
  W: number,
  H: number,
  fam: ReturnType<typeof coverFamily>,
  color: string,
  opacity: number,
  weight: number,
): string {
  const { angle, density, rand } = fam;
  const D = Math.hypot(W, H);
  const cx = W / 2;
  const cy = H / 2;
  const rot = `rotate(${angle} ${cx} ${cy})`;
  const stroke = `fill="none" stroke="${color}" stroke-opacity="${f1(opacity * 100) / 100}" stroke-width="${f1(weight)}"`;
  let body = "";
  if (motif === "grooves") {
    // a record's grooves around a centre off one edge (the angle chooses the edge)
    const a = (angle * 2 * Math.PI) / 180;
    const gx = cx + Math.cos(a) * W * 0.62;
    const gy = cy + Math.sin(a) * H * 0.62;
    const step = (Math.min(W, H) * 0.024) / density;
    const r0 = Math.min(W, H) * (0.12 + 0.12 * rand());
    for (let r = r0; r < D; r += step) body += `<circle cx="${f1(gx)}" cy="${f1(gy)}" r="${f1(r)}"/>`;
    return `<g ${stroke}>${body}</g>`;
  }
  if (motif === "rings") {
    // a few small records scattered over the ground
    const k = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < k; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const R = Math.min(W, H) * (0.14 + rand() * 0.2);
      const step = R / 6 / density;
      for (let r = step; r <= R; r += step) body += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/>`;
    }
    return `<g ${stroke}>${body}</g>`;
  }
  if (motif === "bellows") {
    // a bandoneón's pleats: zigzag bands across the ground
    const gap = (Math.min(W, H) * 0.11) / density;
    const amp = gap * 0.42;
    const pw = gap * 0.9;
    for (let y = -D / 2; y < D * 1.5; y += gap) {
      let d = "";
      for (let x = -D / 2, i = 0; x < D * 1.5; x += pw / 2, i++)
        d += `${i ? "L" : "M"}${f1(x)} ${f1(y + (i % 2 ? amp : 0))}`;
      body += `<path d="${d}"/>`;
    }
    return `<g ${stroke} stroke-linejoin="miter" transform="${rot}">${body}</g>`;
  }
  if (motif === "waves") {
    const gap = (Math.min(W, H) * 0.075) / density;
    const len = gap * (3 + rand() * 3);
    const amp = gap * 0.35;
    for (let y = -D / 2; y < D * 1.5; y += gap) {
      let d = `M${f1(-D / 2)} ${f1(y)}`;
      for (let x = -D / 2; x < D * 1.5; x += len)
        d += `Q${f1(x + len / 4)} ${f1(y - amp)} ${f1(x + len / 2)} ${f1(y)}T${f1(x + len)} ${f1(y)}`;
      body += `<path d="${d}"/>`;
    }
    return `<g ${stroke} transform="${rot}">${body}</g>`;
  }
  // dots: a rotated grid
  const gap = (Math.min(W, H) * 0.06) / density;
  const r = gap * 0.16 * (weight > 2 ? 1.8 : 1);
  for (let y = -D / 2; y < D * 1.5; y += gap)
    for (let x = -D / 2; x < D * 1.5; x += gap) {
      // only the dots that land on the canvas (the grid is rotated about the centre)
      const a = (angle * Math.PI) / 180;
      const rx = cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a);
      const ry = cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a);
      if (rx < -gap || ry < -gap || rx > W + gap || ry > H + gap) continue;
      body += `<circle cx="${f1(rx)}" cy="${f1(ry)}" r="${f1(r)}"/>`;
    }
  return `<g fill="${color}" fill-opacity="${f1(opacity * 1.6 * 100) / 100}">${body}</g>`;
}

/**
 * The cover as an SVG string. Deterministic (the same night, size, theme and locale give the same bytes), valid
 * XML, and it never throws: an empty or odd night gets a cover with what it has.
 */
export function nightCoverSvg(p: unknown, o: CoverOptions = {}): string {
  try {
    return draw(isCoverData(p) ? p : coverData(p), o);
  } catch {
    return draw({ seed: "00000000", name: "", era: null, durationSec: 0, hours: null, tandas: [] }, o);
  }
}

function draw(d: CoverData, o: CoverOptions): string {
  const og = o.size === "og";
  const W = og ? 1200 : 640;
  const H = og ? 630 : 640;
  const outW = og ? 1200 : Math.max(16, Math.round(num(o.size, 640)));
  const outH = og ? 630 : outW;
  const thumb = !og && outW < 160;
  const theme: CoverTheme = o.theme === "dark" ? "dark" : "light";
  const locale: Locale = o.locale === "tr" ? "tr" : "en";
  const fam = coverFamily(d.seed);
  const c = fam.pairing[theme];
  const rhythm = c.deep ? RHYTHM_ON.deep : RHYTHM_ON.light;
  const hash = nightHash(d);

  const title = coverTitle(d, locale);
  const label = tIn(locale, "cover.alt", { title });
  const parts: string[] = [];
  parts.push(
    `<defs><linearGradient id="bg-${hash}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg0}"/><stop offset="1" stop-color="${c.bg1}"/></linearGradient><linearGradient id="arc-${hash}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.line}" stop-opacity="${c.deep ? 0.2 : 0.16}"/><stop offset="1" stop-color="${c.line}" stop-opacity="0"/></linearGradient></defs>`,
    `<rect width="${W}" height="${H}" fill="url(#bg-${hash})"/>`,
    // the motif: stronger on a thumbnail, where it carries most of the difference between two nights
    motifSvg(fam.motif, W, H, fam, c.motif, thumb ? 0.2 : 0.1, thumb ? 5 : 1.4),
  );

  // ---- the energy arc and the tanda marks
  const pad = og ? 64 : thumb ? 44 : 48;
  const chart = og
    ? { x0: pad, x1: W - pad, top: 378, bottom: 532, rail: 560, railH: 12 }
    : thumb
      ? { x0: pad, x1: W - pad, top: 150, bottom: 430, rail: 500, railH: 46 }
      : { x0: pad, x1: W - pad, top: 330, bottom: 514, rail: 546, railH: 11 };
  const n = d.tandas.length;
  // the arc, not the tanda-to-tanda jitter: a 1-2-1 pass (two on a thumbnail), the shape the DJ planned
  let es = d.tandas.map((t) => t.energy);
  for (let pass = 0; pass < (thumb ? 2 : 1); pass++)
    es = es.map((e, i) => 0.25 * (es[i - 1] ?? e) + 0.5 * e + 0.25 * (es[i + 1] ?? e));
  const lo0 = n ? Math.min(...es) : 40;
  const hi0 = n ? Math.max(...es) : 60;
  const mid = (lo0 + hi0) / 2;
  const span = Math.max(36, hi0 - lo0 + 14);
  const lo = mid - span / 2;
  const xAt = (i: number) =>
    n <= 1 ? (chart.x0 + chart.x1) / 2 : chart.x0 + (i / (n - 1)) * (chart.x1 - chart.x0);
  const yAt = (e: number) => chart.bottom - ((e - lo) / span) * (chart.bottom - chart.top);
  const pts: Array<[number, number]> =
    n === 0
      ? []
      : n === 1
        ? [
            [chart.x0, yAt(es[0]!)],
            [chart.x1, yAt(es[0]!)],
          ]
        : es.map((e, i) => [xAt(i), yAt(e)]);
  if (pts.length) {
    const line = smooth(pts);
    parts.push(
      `<path d="${line}L${f1(chart.x1)} ${chart.rail - 8}L${f1(chart.x0)} ${chart.rail - 8}Z" fill="url(#arc-${hash})"/>`,
      `<path d="${line}" fill="none" stroke="${c.line}" stroke-width="${f1((og ? 5 : 4.5) * (thumb ? 4.4 : 1))}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    if (!thumb && n > 1 && n <= 60) {
      const r = n > 32 ? 4 : 5.5;
      let dots = "";
      for (let i = 0; i < n; i++)
        dots += `<circle cx="${f1(xAt(i))}" cy="${f1(yAt(es[i]!))}" r="${r}" fill="${rhythm[d.tandas[i]!.rhythm] ?? c.line}"/>`;
      parts.push(`<g stroke="${c.bg0}" stroke-width="2.5">${dots}</g>`);
    }
  } else {
    parts.push(
      `<path d="M${chart.x0} ${f1((chart.top + chart.bottom) / 2)}H${chart.x1}" stroke="${c.line}" stroke-opacity="0.4" stroke-width="${thumb ? 8 : 3}" stroke-dasharray="${thumb ? "26 26" : "10 10"}" stroke-linecap="round"/>`,
    );
  }
  if (n) {
    const gap = Math.min(thumb ? 12 : 5, ((chart.x1 - chart.x0) / n) * 0.3);
    const w = (chart.x1 - chart.x0 - gap * (n - 1)) / n;
    const rx = Math.min(chart.railH / 2, w / 2);
    let marks = "";
    for (let i = 0; i < n; i++)
      marks += `<rect x="${f1(chart.x0 + i * (w + gap))}" y="${chart.rail}" width="${f1(Math.max(0.5, w))}" height="${chart.railH}" rx="${f1(rx)}" fill="${rhythm[d.tandas[i]!.rhythm] ?? c.line}"/>`;
    parts.push(`<g>${marks}</g>`);
  }

  // ---- words (outlined): the mark and the era on top, the title and its length line
  if (!thumb) {
    const logoH = og ? 36 : 30;
    const top = og ? 56 : 46;
    parts.push(lockup(pad, top, logoH, c.text, c.line));
    const era = coverEra(d, locale).toLocaleUpperCase(locale);
    const eraSize = og ? 17 : 15;
    const lockW = (698 / 256) * logoH;
    parts.push(
      textPath(SANS, fitLine(SANS, era, eraSize, W - pad * 2 - lockW - 24, 0.14), {
        x: W - pad,
        y: top + logoH * 0.62 + eraSize * 0.36,
        size: eraSize,
        fill: c.text,
        tracking: 0.14,
        anchor: "end",
        opacity: 0.78,
      }),
    );
    const maxW = W - pad * 2;
    let size = og ? 70 : 60;
    let lines = wrap(SERIF, title, size, maxW, 2);
    if (lines.at(-1)?.endsWith("…") && !title.endsWith("…")) {
      size = og ? 58 : 50;
      lines = wrap(SERIF, title, size, maxW, 2);
    }
    const first = og ? 190 : 168;
    const lead = size * 1.12;
    lines.forEach((l, i) =>
      parts.push(textPath(SERIF, l, { x: pad - size * 0.04, y: first + i * lead, size, fill: c.text })),
    );
    const metaSize = og ? 26 : 22;
    const meta = fitLine(SANS, coverMeta(d, locale), metaSize, maxW);
    parts.push(
      textPath(SANS, meta, {
        x: pad,
        y: first + (lines.length - 1) * lead + metaSize * 2.1,
        size: metaSize,
        fill: c.text,
        opacity: 0.78,
      }),
    );
  }

  const body = parts.filter(Boolean).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outW}" height="${outH}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(label)}" data-night="${hash}" data-cover-seed="${d.seed}"><title>${escapeXml(label)}</title>${body}</svg>`;
}

/**
 * The generic link preview (1200 × 630): no night's data, only the brand — cream, the record's grooves, the bellows
 * and the T-DJ lockup. For a fragment-only link (the server never sees its night) and every fallback
 * (public/og-night.png, written by scripts/cover-samples.ts).
 */
export function brandCoverSvg(locale: Locale = "en"): string {
  const W = 1200;
  const H = 630;
  const fam = coverFamily("00000000");
  const c = PAIRINGS[0]!.light;
  const line = tIn(locale, "cover.brand_line");
  const lockH = 120;
  const lockW = (698 / 256) * lockH;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="T-DJ"><title>T-DJ</title><defs><linearGradient id="bg-brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.bg0}"/><stop offset="1" stop-color="${c.bg1}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bg-brand)"/>${motifSvg("grooves", W, H, { ...fam, angle: 160, density: 1 }, c.motif, 0.1, 1.4)}${lockup((W - lockW) / 2, 210, lockH, "#0B0A10", "#C9426A")}${textPath(
    SANS,
    line,
    { x: (W - measure(SANS, line, 30)) / 2, y: 430, size: 30, fill: c.text, opacity: 0.78 },
  )}</svg>`;
}

/** exported for the tests: the widths the layout uses */
export const _measure = { serif: (s: string, size: number) => measure(SERIF, s, size) };
