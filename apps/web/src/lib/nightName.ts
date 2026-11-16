import { getLocale, type Locale, t, tIn } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/en";

/**
 * Wave 2 — one name, one era label and one length for a night, wherever it shows (History, Share, the result header,
 * the featured card, the sidebar, the cover). Before, one night read "Sunday milonga", "Milonga · 4 h · Golden Age"
 * and "Golden 1935–45"; the era "Golden Age 35–55" and "Golden age"; and "4 h" for a night that runs 4 h 36.
 */
const ERA_KEY: Record<string, MsgKey> = {
  golden: "nightName.golden_age",
  "golden-extended": "nightName.golden_age_extended",
  "guardia-vieja": "nightName.guardia_vieja",
  "post-golden": "nightName.post_golden",
  nuevo: "nightName.nuevo",
  contemporary: "nightName.contemporary",
  all: "nightName.all_eras",
};
/**
 * The era presets' recording years (packages/core ERA_PRESETS, kept here so the cover does not pull the engine in;
 * nightName.test.ts keeps the two equal).
 */
export const ERA_YEARS: Record<string, [number, number]> = {
  "guardia-vieja": [1900, 1934],
  "golden-extended": [1932, 1960],
  golden: [1935, 1955],
  "post-golden": [1956, 1969],
  nuevo: [1970, 1994],
  contemporary: [1995, 2100],
  all: [1900, 2100],
};
/** the eras a run of years can map to, in order (no overlaps; golden-extended is a choice, not a period) */
const PERIODS = ["guardia-vieja", "golden", "post-golden", "nuevo", "contemporary"] as const;

/** one era's name: "Golden Age", "Nuevo"… (an era id the app does not know reads as itself) */
export const eraName = (era: string | undefined | null, locale: Locale = getLocale()) =>
  era ? (ERA_KEY[era] ? tIn(locale, ERA_KEY[era]) : era) : tIn(locale, "nightName.all_eras");

const isYear = (y: unknown): y is number =>
  typeof y === "number" && Number.isInteger(y) && y >= 1880 && y <= 2100;
const asRange = (r: unknown): [number, number] | null =>
  Array.isArray(r) && r.length === 2 && isYear(r[0]) && isYear(r[1])
    ? [Math.min(r[0], r[1]), Math.max(r[0], r[1])]
    : null;

/** what a night's era label is made of: a Playlist, a `.tdjnight` file or a cover's data all reduce to this */
export interface EraInputs {
  eras: string[];
  yearRange: [number, number] | null;
  /** the recording years of the night's tanda songs (the opening and the closing left out) */
  songYears: number[];
}
/** a Playlist (tandas[].songs), a NightFile (tandas[].sides) or a cover's data, read defensively */
export function eraInputs(night: unknown): EraInputs {
  const n = (night && typeof night === "object" ? night : {}) as {
    options?: { eras?: unknown; yearRange?: unknown } | null;
    tandas?: unknown;
    eras?: unknown;
    yearRange?: unknown;
    songYears?: unknown;
  };
  const o = n.options && typeof n.options === "object" ? n.options : n;
  const eras = Array.isArray(o.eras)
    ? [...new Set(o.eras.filter((e): e is string => typeof e === "string" && !!e.trim()))]
    : [];
  let songYears: number[];
  if (Array.isArray(n.songYears)) songYears = n.songYears.filter(isYear);
  else {
    songYears = [];
    for (const tanda of Array.isArray(n.tandas) ? n.tandas : []) {
      if (!tanda || typeof tanda !== "object") continue;
      const t = tanda as { songs?: unknown; sides?: unknown };
      const sides = Array.isArray(t.songs) ? t.songs : Array.isArray(t.sides) ? t.sides : [];
      for (const s of sides) {
        const y = s && typeof s === "object" ? (s as { year?: unknown }).year : undefined;
        if (isYear(y)) songYears.push(y);
      }
    }
  }
  return { eras, yearRange: asRange(o.yearRange), songYears };
}

const within = (era: string, lo: number, hi: number, slack = 0) => {
  const y = ERA_YEARS[era];
  return !!y && lo >= y[0] - slack && hi <= y[1];
};
/**
 * The one period a run of years sits in. Neighbouring periods share their boundary year (the presets end the golden
 * age with 1955 and start the post-golden years with 1956; DJs count a 1955 Pugliese or Di Sarli either way), so a
 * night of 1955–59 sides reads post-golden while 1938–56 spans two periods.
 */
function periodOf(lo: number, hi: number): string | undefined {
  return PERIODS.find((e) => within(e, lo, hi)) ?? PERIODS.find((e) => within(e, lo, hi, 1));
}

/** era `outer`'s years strictly hold era `inner`'s (golden inside golden-extended) */
const contains = (outer: string, inner: string) => {
  const a = ERA_YEARS[outer];
  const b = ERA_YEARS[inner];
  return outer !== inner && !!a && !!b && a[0] <= b[0] && a[1] >= b[1] && (a[0] !== b[0] || a[1] !== b[1]);
};

/** the share of the night's sides inside its year range that still reads "mostly <range>" */
export const MOSTLY = 0.75;
/** the era label is printed on the cover's top line beside the mark: past this it says "Mixed eras" */
const MAX_LABEL = 28;

/**
 * The night's era label, the same in the sub-line, History, Share, the featured card and the cover:
 * - a year range set: "1950–1960", or "Golden Age 1935–1945" when it sits inside the one era chosen;
 * - several eras: in chronological order, "Golden Age + Nuevo", "Guardia Vieja → Nuevo" for three or more, or
 *   "Mixed eras" when that would not fit the cover;
 * - "all": "All eras";
 * - no era: read from the tanda songs' years ("Post-golden", or "1938–1956" across periods). Never Golden Age by
 *   default (before, a night with no era, or a nuevo night's cover, said Golden Age).
 */
export function nightEraLabel(night: unknown, locale: Locale = getLocale()): string {
  const { eras, yearRange, songYears } = eraInputs(night);
  const years = (lo: number, hi: number) =>
    lo === hi ? String(lo) : tIn(locale, "nightName.years", { from: lo, to: hi });
  if (yearRange) {
    const [lo, hi] = yearRange;
    const one =
      eras.length === 1 && eras[0] !== "all" ? eras[0] : eras.length === 0 ? periodOf(lo, hi) : undefined;
    const label =
      one && within(one, lo, hi, eras.length ? 0 : 1)
        ? tIn(locale, "nightName.era_years", { era: eraName(one, locale), years: years(lo, hi) })
        : years(lo, hi);
    // QA fix 2026-11: the label never claims a span the night leaves ("Golden Age 1935–1945" over sides from 1933 to
    // 1963): most sides inside it say "mostly", fewer give the night's own years
    if (songYears.length) {
      const inside = songYears.filter((y) => y >= lo && y <= hi).length;
      if (inside < songYears.length) {
        if (inside / songYears.length >= MOSTLY) return tIn(locale, "nightName.mostly", { label });
        return years(Math.min(...songYears), Math.max(...songYears));
      }
    }
    return label;
  }
  if (eras.includes("all")) return tIn(locale, "nightName.all_eras");
  if (!eras.length) {
    if (!songYears.length) return tIn(locale, "nightName.all_eras");
    const lo = Math.min(...songYears);
    const hi = Math.max(...songYears);
    const p = periodOf(lo, hi);
    return p ? eraName(p, locale) : years(lo, hi);
  }
  // chronological, and an era inside another one chosen (golden inside golden-extended) reads as the wider one
  const start = (e: string) => ERA_YEARS[e]?.[0] ?? Number.POSITIVE_INFINITY;
  const kept = eras.filter((e) => !eras.some((o) => contains(o, e))).sort((a, b) => start(a) - start(b));
  const names = kept.map((e) => eraName(e, locale));
  if (names.length === 1) return names[0]!;
  const label =
    names.length === 2
      ? tIn(locale, "nightName.era_pair", { a: names[0], b: names[1] })
      : tIn(locale, "nightName.era_span", { a: names[0], b: names.at(-1) });
  return label.length <= MAX_LABEL ? label : tIn(locale, "nightName.mixed_eras");
}

/** the night's actual length: "4 h 36 min", "3 h", "45 min" (rounded to the minute) */
export function lengthText(sec: number | null | undefined): string {
  const m = Math.max(0, Math.round((sec ?? 0) / 60));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return t("nightName.min", { r });
  return r ? t("nightName.h_min", { h, r }) : t("nightName.h", { h });
}

/** a planned length ("4 h", "2½ h") for controls and auto-names before a night exists */
export const hoursText = (h: number) =>
  t("nightName.h", { h: Number.isInteger(h) ? h : `${h}`.replace(".5", "½") });

interface Named {
  name?: string | null;
  options: { eras?: string[]; hours?: number; yearRange?: [number, number] };
  stats?: { durationSec?: number } | null;
  tandas?: unknown;
}
/** the night's title: its name without the details older names carried after " · " */
export function nightTitle(p: Named): string {
  const n = (p.name ?? "").split(" · ")[0]?.trim();
  return n || t("nightName.tonight_s_milonga");
}
/**
 * "4 h 36 min · Golden Age + Nuevo": the line under the title (the era from the night itself, nightEraLabel). The
 * length is the night's music as it plays (lib/lengths nightMusicSec: sides with their cues, cortinas from their
 * start; gaps apart) when the caller has it — QA fix 2026-11: the header said 4 h 35 (the engine's plan) beside
 * "plays 4:37:07" and the sidebar's 4 h 37 — else the engine's own length.
 */
export function nightSub(p: Named, musicSec?: number | null): string {
  const len = musicSec
    ? lengthText(musicSec)
    : p.stats?.durationSec
      ? lengthText(p.stats.durationSec)
      : hoursText(p.options.hours ?? 4);
  return `${len} · ${nightEraLabel(p)}`;
}
