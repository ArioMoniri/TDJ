/**
 * Booth timing plan (docs/specs/round7-booth.md §7, docs/research/booth.md §2). Pure: `planBooth` walks the set in
 * flatten order (opening Cumparsita, each tanda's songs then its cortina, a show break after the tanda it follows,
 * the closing) and assigns every item a start on the night's clock with one gap rule: every item except a break and
 * the closing is followed by `gapSec`. A cortina plays from its cue-in to `stopSec`, where its fade reaches silence,
 * and the next tanda starts `gapSec` after that silence. Gains are priors (the catalogue's preview RMS, or a file
 * measurement when the booth hands one in) against the loudness target, clamped and peak-capped; the booth and every
 * DJ-app export read the same seconds from this plan.
 */
import type { Cortina, Playlist, PlaylistStats, Song } from "./types";

export interface BoothSettings {
  /** silence between items (0.5–6 s) */
  gapSec: number;
  /** cortina fade-in from the cue-in (0–2 s) */
  cortinaFadeInSec: number;
  /** cortina fade-out length (3–6 s); it ends exactly at the cortina's stop second */
  cortinaFadeOutSec: number;
  /** cortinas play this much under the tanda target (−8…−2 dB) */
  cortinaLevelDb: number;
  /** normalisation target (−18…−12 LUFS) */
  loudnessTargetLUFS: number;
  /** trim the measured leading silence (never more than 3 s) off every track */
  trimLeadingSilence: boolean;
  /** wall-clock start of the night (ISO 8601, local); markers and the set list print real clock times with it */
  startAt?: string;
}
export interface BoothPlanItem {
  /** 1-based, same order as `flatten(p, { includeCortinas: true, includeBreaks: true })` */
  n: number;
  kind: "track" | "cortina" | "closing" | "break";
  /** song / cortina id */
  id?: string;
  /** 0 = opening Cumparsita, tandas.length + 1 = closing; a break carries the tanda it follows */
  tanda: number;
  /** planned offset from the night's start, seconds (includes every gap and fade before it) */
  startSec: number;
  /** track: durationSec − trimIn; cortina: stopSec − trimIn; break: minutes × 60 */
  lengthSec: number;
  /** silence after this item (0 after a break and after the closing) */
  gapAfterSec: number;
  /** cortina cue-in (`Cortina.startSec`), or the intro trim of a track when `trimLeadingSilence` is on */
  trimInSec?: number;
  /** cortina: absolute second in the clip where the fade reaches silence */
  stopSec?: number;
  fadeInSec?: number;
  fadeOutSec?: number;
  /** gain prior in dB: normalisation (target − loudness, clamped ±12, peak-capped) plus the DJ's trim; undefined when nothing is known */
  gainDb?: number;
  /** the normalisation part was reduced so the known sample peak stays ≤ −1 dBFS */
  peakCapped?: boolean;
  /** belongs to the tanda reserved for the birthday vals */
  birthday?: boolean;
}
export interface BoothMarker {
  kind: "opening" | "tanda" | "break" | "closing";
  tanda: number;
  /** index into `BoothPlan.items` */
  planIndex: number;
  /** seconds from the night's start */
  atSec: number;
  label: string;
}
export interface BoothLogEntry {
  at: string;
  from: string;
  to: string;
  planIndex: number;
  reason?: string;
}
export interface BoothPlan {
  settings: BoothSettings;
  items: BoothPlanItem[];
  /** = last item startSec + lengthSec */
  wallClockSec: number;
  /** start of the closing La Cumparsita on the night's clock (undefined when the set has no closing) */
  cumparsitaAtSec?: number;
  /** each tanda's first track, the opening, breaks and the closing, in order */
  markers: BoothMarker[];
  /** tanda index (as in `BoothPlanItem.tanda`) → gap in seconds */
  gapOverrides?: Record<number, number>;
  /** song / cortina id → the DJ's trim in dB (±12) */
  trims?: Record<string, number>;
  /** the cortina play length the plan was made with (export option); undefined = each cortina's own length */
  cortinaStopSec?: number;
  /** filled by the booth while the night plays */
  log?: BoothLogEntry[];
  anchors?: Array<{ planIndex: number; at: string }>;
}
/** A file measurement the booth hands in (apps/web `loudness.ts`); wins over the catalogue prior. */
export interface BoothMeasurement {
  lufs?: number;
  peakDbFS?: number;
  introSec?: number;
}
export interface BoothInputs extends Partial<BoothSettings> {
  gapOverrides?: Record<number, number>;
  trims?: Record<string, number>;
  /** id → measurement */
  measurements?: Record<string, BoothMeasurement>;
  /** cortina play length (20–90), else each cortina's own `lengthSec` */
  cortinaStopSec?: number;
}

export const BOOTH_DEFAULTS: BoothSettings = {
  gapSec: 2.5,
  cortinaFadeInSec: 0,
  cortinaFadeOutSec: 4,
  cortinaLevelDb: -4,
  loudnessTargetLUFS: -16,
  trimLeadingSilence: false,
};
export const BOOTH_RANGES = {
  gapSec: { min: 0.5, max: 6, step: 0.5 },
  cortinaFadeInSec: { min: 0, max: 2, step: 0.5 },
  cortinaFadeOutSec: { min: 3, max: 6, step: 0.5 },
  cortinaLevelDb: { min: -8, max: -2, step: 1 },
  loudnessTargetLUFS: { min: -18, max: -12, step: 1 },
} as const;
/** normalisation window around the target */
export const NORM_CLAMP_DB = 12;
/** the DJ's per-track trim window */
export const TRIM_CLAMP_DB = 12;
/** total gain window: normalisation plus trim */
export const GAIN_MAX_DB = 12;
export const GAIN_MIN_DB = -24;
/** a known sample peak is never raised above this */
export const PEAK_CEILING_DBFS = -1;
/** leading silence is never trimmed beyond this */
export const TRIM_IN_MAX_SEC = 3;
export const CORTINA_STOP_MIN = 20;
export const CORTINA_STOP_MAX = 90;

/** The stop second an export writes for a cortina: the explicit option, else the cortina's length, clamped to 20–90. */
export function cortinaStopFor(eo: { cortinaStopSec?: number }, lengthSec?: number | null): number {
  const v = eo.cortinaStopSec ?? lengthSec ?? 45;
  return Math.round(Math.min(CORTINA_STOP_MAX, Math.max(CORTINA_STOP_MIN, Number.isFinite(v) ? v : 45)));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const round3 = (v: number) => Math.round(v * 1000) / 1000;
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Settings from a partial, every number clamped to its range; `startAt` only when given. */
export function boothSettings(s: Partial<BoothSettings> = {}): BoothSettings {
  const out: BoothSettings = {
    gapSec: clamp(num(s.gapSec) ?? BOOTH_DEFAULTS.gapSec, BOOTH_RANGES.gapSec.min, BOOTH_RANGES.gapSec.max),
    cortinaFadeInSec: clamp(
      num(s.cortinaFadeInSec) ?? BOOTH_DEFAULTS.cortinaFadeInSec,
      BOOTH_RANGES.cortinaFadeInSec.min,
      BOOTH_RANGES.cortinaFadeInSec.max,
    ),
    cortinaFadeOutSec: clamp(
      num(s.cortinaFadeOutSec) ?? BOOTH_DEFAULTS.cortinaFadeOutSec,
      BOOTH_RANGES.cortinaFadeOutSec.min,
      BOOTH_RANGES.cortinaFadeOutSec.max,
    ),
    cortinaLevelDb: clamp(
      num(s.cortinaLevelDb) ?? BOOTH_DEFAULTS.cortinaLevelDb,
      BOOTH_RANGES.cortinaLevelDb.min,
      BOOTH_RANGES.cortinaLevelDb.max,
    ),
    loudnessTargetLUFS: clamp(
      num(s.loudnessTargetLUFS) ?? BOOTH_DEFAULTS.loudnessTargetLUFS,
      BOOTH_RANGES.loudnessTargetLUFS.min,
      BOOTH_RANGES.loudnessTargetLUFS.max,
    ),
    trimLeadingSilence: s.trimLeadingSilence ?? BOOTH_DEFAULTS.trimLeadingSilence,
  };
  if (typeof s.startAt === "string" && s.startAt) out.startAt = s.startAt;
  return out;
}

/** The inputs that re-create a plan (so a swap or a new stop length keeps the DJ's choices). */
export function boothInputs(plan?: BoothPlan | null): BoothInputs {
  if (!plan) return {};
  const out: BoothInputs = { ...plan.settings };
  if (plan.gapOverrides) out.gapOverrides = plan.gapOverrides;
  if (plan.trims) out.trims = plan.trims;
  if (plan.cortinaStopSec !== undefined) out.cortinaStopSec = plan.cortinaStopSec;
  return out;
}

interface Gain {
  gainDb?: number;
  peakCapped?: boolean;
}
/**
 * `gain = clamp(target − loudness, ±12) + trim`, the normalisation part reduced (never the trim) so a known sample
 * peak stays ≤ −1 dBFS, the total clamped to [−24, +12]. A cortina's target is `target + cortinaLevelDb`; without
 * any loudness a cortina is assumed at the target, so it still carries the level offset.
 */
function gainFor(
  loudness: number | undefined,
  targetDb: number,
  trim: number | undefined,
  peakDbFS: number | undefined,
): Gain {
  const trimDb = trim === undefined ? undefined : clamp(trim, -TRIM_CLAMP_DB, TRIM_CLAMP_DB);
  if (loudness === undefined && trimDb === undefined) return {};
  let norm = loudness === undefined ? 0 : clamp(targetDb - loudness, -NORM_CLAMP_DB, NORM_CLAMP_DB);
  let peakCapped = false;
  if (peakDbFS !== undefined) {
    const max = PEAK_CEILING_DBFS - peakDbFS - (trimDb ?? 0);
    if (norm > max) {
      norm = max;
      peakCapped = true;
    }
  }
  const gainDb = clamp(round1(norm + (trimDb ?? 0)), GAIN_MIN_DB, GAIN_MAX_DB);
  return peakCapped ? { gainDb, peakCapped } : { gainDb };
}

const isBirthday = (t: { birthday?: boolean; note?: string }) =>
  !!t.birthday || /cumplea/i.test(t.note ?? "");
const tandaLabel = (p: Playlist, i: number) => {
  const t = p.tandas[i]!;
  return `${String(i + 1).padStart(2, "0")} ${t.rhythm.toUpperCase()} · ${t.orchestra}${t.singer ? ` / ${t.singer}` : ""}`;
};

/** The night's timing plan. Pure and deterministic: the same set and inputs give the same plan; `p` is not touched. */
export function planBooth(p: Playlist, s: BoothInputs = {}): BoothPlan {
  const settings = boothSettings(s);
  const target = settings.loudnessTargetLUFS;
  const gapFor = (tanda: number) => {
    const o = num(s.gapOverrides?.[tanda]);
    return o === undefined ? settings.gapSec : clamp(o, BOOTH_RANGES.gapSec.min, BOOTH_RANGES.gapSec.max);
  };
  const measure = (id: string | undefined) => (id ? s.measurements?.[id] : undefined);
  const trimFor = (id: string | undefined) => (id ? num(s.trims?.[id]) : undefined);
  const items: BoothPlanItem[] = [];
  let n = 1;
  const pushSong = (
    song: Song,
    kind: "track" | "closing",
    tanda: number,
    gapAfter: number,
    birthday = false,
  ) => {
    const m = measure(song.id);
    const prior = song.audio ? num(song.audio.loudnessDb) : undefined;
    const intro = num(m?.introSec) ?? (song.audio ? num(song.audio.introSec) : undefined) ?? 0;
    const trimIn = settings.trimLeadingSilence ? round3(clamp(intro, 0, TRIM_IN_MAX_SEC)) : 0;
    const dur = Math.max(1, num(song.durationSec) ?? (kind === "closing" ? 180 : 170));
    const it: BoothPlanItem = {
      n: n++,
      kind,
      id: song.id,
      tanda,
      startSec: 0,
      lengthSec: round3(Math.max(1, dur - trimIn)),
      gapAfterSec: gapAfter,
      ...(trimIn > 0 ? { trimInSec: trimIn } : {}),
      ...gainFor(num(m?.lufs) ?? prior, target, trimFor(song.id), num(m?.peakDbFS)),
    };
    if (birthday) it.birthday = true;
    items.push(it);
  };
  const pushCortina = (c: Cortina, tanda: number) => {
    const stopSec = cortinaStopFor({ cortinaStopSec: s.cortinaStopSec }, c.lengthSec);
    const fadeOutSec = settings.cortinaFadeOutSec;
    // the cue-in must leave at least one second of cortina before the fade starts; otherwise it is dropped
    const cue = Math.max(0, num(c.startSec) ?? 0);
    const trimIn = stopSec - fadeOutSec >= cue + 1 ? round3(cue) : 0;
    const m = measure(c.id);
    items.push({
      n: n++,
      kind: "cortina",
      id: c.id,
      tanda,
      startSec: 0,
      lengthSec: round3(stopSec - trimIn),
      gapAfterSec: gapFor(tanda),
      trimInSec: trimIn,
      stopSec,
      fadeInSec: settings.cortinaFadeInSec,
      fadeOutSec,
      ...gainFor(num(m?.lufs) ?? target, target + settings.cortinaLevelDb, trimFor(c.id), num(m?.peakDbFS)),
    });
  };
  if (p.opening) pushSong(p.opening, "closing", 0, gapFor(0));
  p.tandas.forEach((t, ti) => {
    const tanda = ti + 1;
    const bday = isBirthday(t);
    for (const song of t.songs) pushSong(song, "track", tanda, gapFor(tanda), bday);
    if (t.cortina) pushCortina(t.cortina, tanda);
    for (const b of p.breaks ?? [])
      if (b.afterTanda === ti)
        items.push({
          n: n++,
          kind: "break",
          tanda,
          startSec: 0,
          lengthSec: Math.max(0, num(b.minutes) ?? 0) * 60,
          gapAfterSec: 0,
        });
  });
  if (p.closing) pushSong(p.closing, "closing", p.tandas.length + 1, 0);
  // the night ends with its last item: no gap after it
  const last = items[items.length - 1];
  if (last) last.gapAfterSec = 0;
  let t = 0;
  for (const it of items) {
    it.startSec = round3(t);
    t = it.startSec + it.lengthSec + it.gapAfterSec;
  }
  const markers: BoothMarker[] = [];
  const seen = new Set<number>();
  items.forEach((it, planIndex) => {
    if (it.kind === "closing" && it.tanda === 0)
      markers.push({
        kind: "opening",
        tanda: 0,
        planIndex,
        atSec: it.startSec,
        label: "Opening La Cumparsita",
      });
    else if (it.kind === "track" && !seen.has(it.tanda)) {
      seen.add(it.tanda);
      markers.push({
        kind: "tanda",
        tanda: it.tanda,
        planIndex,
        atSec: it.startSec,
        label: tandaLabel(p, it.tanda - 1),
      });
    } else if (it.kind === "break") {
      const b = p.breaks?.find((x) => x.afterTanda === it.tanda - 1);
      markers.push({
        kind: "break",
        tanda: it.tanda,
        planIndex,
        atSec: it.startSec,
        label: b?.label || "Break",
      });
    } else if (it.kind === "closing")
      markers.push({
        kind: "closing",
        tanda: it.tanda,
        planIndex,
        atSec: it.startSec,
        label: "La Cumparsita",
      });
  });
  const closing =
    last && last.kind === "closing" && last.tanda === p.tandas.length + 1 && p.closing ? last : undefined;
  const plan: BoothPlan = {
    settings,
    items,
    wallClockSec: last ? round3(last.startSec + last.lengthSec) : 0,
    markers,
  };
  if (closing) plan.cumparsitaAtSec = closing.startSec;
  if (s.gapOverrides) plan.gapOverrides = { ...s.gapOverrides };
  if (s.trims) plan.trims = { ...s.trims };
  if (s.cortinaStopSec !== undefined) plan.cortinaStopSec = s.cortinaStopSec;
  return plan;
}

/** The id sequence a plan of `p` must have; a plan whose items differ is stale (a tanda was swapped without re-planning). */
export function planMatches(p: Playlist, plan: BoothPlan | null | undefined): plan is BoothPlan {
  if (!plan) return false;
  const keys: string[] = [];
  if (p.opening) keys.push(`closing:0:${p.opening.id}`);
  p.tandas.forEach((t, ti) => {
    for (const s of t.songs) keys.push(`track:${ti + 1}:${s.id}`);
    if (t.cortina) keys.push(`cortina:${ti + 1}:${t.cortina.id}`);
    for (const b of p.breaks ?? []) if (b.afterTanda === ti) keys.push(`break:${ti + 1}:${b.minutes}`);
  });
  if (p.closing) keys.push(`closing:${p.tandas.length + 1}:${p.closing.id}`);
  if (plan.items.length !== keys.length) return false;
  return plan.items.every(
    (it, i) => keys[i] === `${it.kind}:${it.tanda}:${it.kind === "break" ? it.lengthSec / 60 : it.id}`,
  );
}

/** Stats fields the plan adds: the real clock with gaps and planned cortina stops; `durationSec` is left alone. */
export function boothStats(stats: PlaylistStats, plan: BoothPlan): PlaylistStats {
  return {
    ...stats,
    wallClockSec: plan.wallClockSec,
    gapsSec: round3(plan.items.reduce((a, i) => a + i.gapAfterSec, 0)),
  };
}

/**
 * `p` with its plan (re)computed and the clock in its stats. Without `inputs`, the existing plan's settings, trims and
 * overrides are kept, so a swap re-times the night with the DJ's choices; the booth's log and anchors are carried over.
 */
export function attachBooth(p: Playlist, inputs?: BoothInputs): Playlist {
  const base = boothInputs(p.booth);
  const plan = planBooth(p, inputs ? { ...base, ...inputs } : base);
  if (p.booth?.log) plan.log = p.booth.log;
  if (p.booth?.anchors) plan.anchors = p.booth.anchors;
  return { ...p, booth: plan, stats: boothStats(p.stats, plan) };
}

/** `T+1:07` from the night's start, or `23:42` when the plan knows its wall-clock start. */
export function boothClock(plan: Pick<BoothPlan, "settings">, atSec: number): string {
  const start = plan.settings.startAt ? Date.parse(plan.settings.startAt) : Number.NaN;
  if (Number.isFinite(start)) {
    const d = new Date(start + atSec * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  const s = Math.max(0, Math.floor(atSec));
  return `T+${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}
