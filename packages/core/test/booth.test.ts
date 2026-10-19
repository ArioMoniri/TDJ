/**
 * Booth timing invariants (docs/specs/round7-booth.md §7 and §12, docs/TDD.md): the plan walks the set in flatten
 * order, every gap is exact, a cortina's fade reaches silence at its stop second, gains are priors clamped to a
 * sane window and never raise a known peak above −1 dBFS, the time to La Cumparsita is the sum of what plays
 * before it, the exports write the plan's seconds, and the plan is pure and deterministic.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  attachBooth,
  BOOTH_DEFAULTS,
  BOOTH_RANGES,
  type BoothPlan,
  compose,
  computeStats,
  cortinaStopFor,
  flatten,
  GAIN_MAX_DB,
  GAIN_MIN_DB,
  NORM_CLAMP_DB,
  PEAK_CEILING_DBFS,
  type Playlist,
  planBooth,
  type Song,
  swapTanda,
  toCSV,
  toJSON,
  toM3U8,
  toRekordboxXML,
  toSeratoCSV,
  toSetList,
  toTraktorNML,
} from "../src/index";
import { loadCatalog } from "../src/load";

const deps = loadCatalog();
let p: Playlist;
let plan: BoothPlan;
beforeAll(() => {
  p = compose({ hours: 2, seed: 11, cortinaLengthSec: 45 }, deps);
  plan = planBooth(p);
});
afterEach(() => new Promise((r) => setTimeout(r, 0)));

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const audioFor = (loudnessDb: number, introSec = 0): Song["audio"] => ({
  version: 1,
  durationSec: 30,
  bpm: 120,
  bpmCandidates: [120],
  pulseClarity: 0.5,
  key: "D",
  mode: "minor",
  keyConfidence: 0.5,
  camelot: "7A",
  loudnessDb,
  loudnessRange: 8,
  brightnessHz: 2000,
  onsetsPerSec: 3,
  introSec,
  energy: 50,
  chroma: new Array(12).fill(1 / 12),
});
/** A copy of the set whose first song of each tanda carries the given loudness prior. */
const withAudio = (pl: Playlist, loudnessDb: number, introSec = 0): Playlist => ({
  ...pl,
  tandas: pl.tandas.map((t) => ({
    ...t,
    songs: t.songs.map((s, i) => ({ ...s, audio: i === 0 ? audioFor(loudnessDb, introSec) : null })),
  })),
  closing: pl.closing ? { ...pl.closing, audio: null } : null,
});

describe("planBooth order and gaps", () => {
  it("items follow flatten() with breaks, 1-based n, and the same ids", () => {
    const rows = flatten(p, { includeCortinas: true, includeBreaks: true });
    expect(plan.items).toHaveLength(rows.length);
    plan.items.forEach((it, i) => {
      expect(it.n).toBe(i + 1);
      expect(it.n).toBe(rows[i]!.n);
      expect(it.kind).toBe(rows[i]!.kind);
      expect(it.id).toBe(rows[i]!.id);
      expect(it.tanda).toBe(rows[i]!.tanda);
    });
    expect(plan.items.filter((i) => i.kind === "cortina")).toHaveLength(
      p.tandas.filter((t) => t.cortina).length,
    );
  });

  it("startSec strictly increases and every gap is exact: start[n+1] = start[n] + length[n] + gap[n]", () => {
    expect(plan.items[0]!.startSec).toBe(0);
    for (let i = 0; i < plan.items.length - 1; i++) {
      const a = plan.items[i]!;
      const b = plan.items[i + 1]!;
      expect(b.startSec).toBeGreaterThan(a.startSec);
      expect(b.startSec).toBe(round3(a.startSec + a.lengthSec + a.gapAfterSec));
    }
    const last = plan.items[plan.items.length - 1]!;
    expect(plan.wallClockSec).toBe(round3(last.startSec + last.lengthSec));
  });

  it("every item except a break and the closing is followed by gapSec; the closing ends the night", () => {
    expect(plan.settings).toEqual(BOOTH_DEFAULTS);
    expect(plan.settings.gapSec).toBe(2.5);
    const last = plan.items[plan.items.length - 1]!;
    expect(last.kind).toBe("closing");
    expect(last.gapAfterSec).toBe(0);
    for (const it of plan.items.slice(0, -1)) {
      if (it.kind === "break") expect(it.gapAfterSec).toBe(0);
      else expect(it.gapAfterSec).toBe(2.5);
    }
  });

  it("clamps the gap to 0.5–6 s and honours per-tanda overrides", () => {
    expect(planBooth(p, { gapSec: 10 }).settings.gapSec).toBe(BOOTH_RANGES.gapSec.max);
    expect(planBooth(p, { gapSec: 0 }).settings.gapSec).toBe(BOOTH_RANGES.gapSec.min);
    const o = planBooth(p, { gapOverrides: { 3: 4 } });
    expect(o.gapOverrides).toEqual({ 3: 4 });
    for (const it of o.items.slice(0, -1)) {
      if (it.kind === "break") continue;
      expect(it.gapAfterSec).toBe(it.tanda === 3 ? 4 : 2.5);
    }
    // the plan is re-timed, not just annotated
    const i3 = o.items.findIndex((i) => i.tanda === 3);
    expect(o.items[i3 + 1]!.startSec).toBe(round3(o.items[i3]!.startSec + o.items[i3]!.lengthSec + 4));
  });

  it("breaks are items after the tanda's cortina, birthday valses are flagged, an opening Cumparsita comes first", () => {
    const q = compose(
      {
        hours: 3,
        seed: 5,
        rules: { showBreakAt: 0.5, showBreakMinutes: 15, birthdayValsAt: 0.6, openWithCumparsita: true },
      },
      deps,
    );
    const b = planBooth(q);
    expect(q.breaks).toHaveLength(1);
    expect(q.opening).toBeTruthy();
    const breaks = b.items.filter((i) => i.kind === "break");
    expect(breaks).toHaveLength(1);
    const br = breaks[0]!;
    expect(br.lengthSec).toBe(15 * 60);
    expect(br.gapAfterSec).toBe(0);
    expect(br.tanda).toBe(q.breaks![0]!.afterTanda + 1);
    const prev = b.items[br.n - 2]!;
    expect(prev.tanda).toBe(br.tanda);
    expect(prev.kind).toBe(q.tandas[q.breaks![0]!.afterTanda]!.cortina ? "cortina" : "track");
    expect(b.items[br.n]!.tanda).toBe(br.tanda + 1);
    const first = b.items[0]!;
    expect(first.kind).toBe("closing");
    expect(first.tanda).toBe(0);
    expect(first.id).toBe(q.opening!.id);
    expect(first.gapAfterSec).toBe(2.5);
    const bday = b.items.filter((i) => i.birthday);
    expect(bday.length).toBeGreaterThan(0);
    const bt = new Set(bday.map((i) => i.tanda));
    expect(bt.size).toBe(1);
    expect(q.tandas[[...bt][0]! - 1]!.rhythm).toBe("vals");
    expect(b.markers.filter((m) => m.kind === "break")).toHaveLength(1);
    expect(b.markers[0]!.kind).toBe("opening");
    expect(b.wallClockSec).toBeGreaterThanOrEqual(q.stats.durationSec);
  });
});

describe("cortinas", () => {
  it("length = stopSec − trimIn, the fade ends at the stop second and never starts before one second of cortina", () => {
    const cs = plan.items.filter((i) => i.kind === "cortina");
    expect(cs.length).toBeGreaterThan(0);
    for (const c of cs) {
      expect(c.stopSec).toBeDefined();
      expect(c.trimInSec).toBeDefined();
      expect(c.fadeOutSec).toBe(BOOTH_DEFAULTS.cortinaFadeOutSec);
      expect(c.fadeInSec).toBe(BOOTH_DEFAULTS.cortinaFadeInSec);
      expect(c.lengthSec).toBe(c.stopSec! - c.trimInSec!);
      expect(c.trimInSec! + c.lengthSec).toBe(c.stopSec);
      expect(c.stopSec! - c.fadeOutSec!).toBeGreaterThanOrEqual(c.trimInSec! + 1);
      expect(c.stopSec).toBe(cortinaStopFor({}, p.tandas[c.tanda - 1]!.cortina!.lengthSec));
    }
  });

  it("the cortina stop option and the fade ranges reach the plan", () => {
    const b = planBooth(p, { cortinaStopSec: 60, cortinaFadeOutSec: 20, cortinaFadeInSec: -1 });
    expect(b.settings.cortinaFadeOutSec).toBe(BOOTH_RANGES.cortinaFadeOutSec.max);
    expect(b.settings.cortinaFadeInSec).toBe(BOOTH_RANGES.cortinaFadeInSec.min);
    for (const c of b.items.filter((i) => i.kind === "cortina")) {
      expect(c.stopSec).toBe(60);
      expect(c.fadeOutSec).toBe(6);
      expect(c.lengthSec + c.trimInSec!).toBe(60);
    }
    // a cue-in deep into the clip is dropped rather than leaving less than fade + 1 s of cortina
    const q: Playlist = {
      ...p,
      tandas: p.tandas.map((t) => (t.cortina ? { ...t, cortina: { ...t.cortina, startSec: 40 } } : t)),
    };
    for (const c of planBooth(q).items.filter((i) => i.kind === "cortina")) {
      expect(c.stopSec! - c.fadeOutSec!).toBeGreaterThanOrEqual(c.trimInSec! + 1);
      expect(c.lengthSec).toBeGreaterThanOrEqual(c.fadeOutSec! + 1);
    }
    const r: Playlist = {
      ...p,
      tandas: p.tandas.map((t) => (t.cortina ? { ...t, cortina: { ...t.cortina, startSec: 12 } } : t)),
    };
    for (const c of planBooth(r).items.filter((i) => i.kind === "cortina")) {
      expect(c.trimInSec).toBe(12);
      expect(c.lengthSec).toBe(c.stopSec! - 12);
    }
  });

  it("a cortina's gain prior is the level offset (−4 dB default, −8…−2)", () => {
    for (const c of plan.items.filter((i) => i.kind === "cortina")) expect(c.gainDb).toBe(-4);
    expect(planBooth(p, { cortinaLevelDb: -20 }).settings.cortinaLevelDb).toBe(-8);
    expect(planBooth(p, { cortinaLevelDb: 0 }).settings.cortinaLevelDb).toBe(-2);
    for (const c of planBooth(p, { cortinaLevelDb: -6 }).items.filter((i) => i.kind === "cortina"))
      expect(c.gainDb).toBe(-6);
  });
});

describe("gain priors", () => {
  it("is undefined without audio features and never capped by default", () => {
    for (const it of plan.items.filter((i) => i.kind === "track")) {
      const song = p.tandas[it.tanda - 1]!.songs.find((s) => s.id === it.id)!;
      if (song.audio && Number.isFinite(song.audio.loudnessDb)) {
        expect(Math.abs(it.gainDb!)).toBeLessThanOrEqual(NORM_CLAMP_DB);
      } else expect(it.gainDb).toBeUndefined();
      expect(it.peakCapped).toBeUndefined();
    }
  });

  it("target − loudnessDb, clamped to ±12, with the target in −18…−12", () => {
    expect(NORM_CLAMP_DB).toBe(12);
    const b = planBooth(withAudio(p, -12));
    const firsts = b.items.filter((i) => i.kind === "track" && i.gainDb !== undefined);
    expect(firsts).toHaveLength(p.tandas.length);
    for (const it of firsts) expect(it.gainDb).toBe(-4);
    for (const it of planBooth(withAudio(p, -30)).items.filter(
      (i) => i.gainDb !== undefined && i.kind === "track",
    ))
      expect(it.gainDb).toBe(12);
    for (const it of planBooth(withAudio(p, 0)).items.filter(
      (i) => i.gainDb !== undefined && i.kind === "track",
    ))
      expect(it.gainDb).toBe(-12);
    const t = planBooth(withAudio(p, -20), { loudnessTargetLUFS: -18 });
    expect(t.settings.loudnessTargetLUFS).toBe(-18);
    for (const it of t.items.filter((i) => i.gainDb !== undefined && i.kind === "track"))
      expect(it.gainDb).toBe(2);
    expect(planBooth(p, { loudnessTargetLUFS: -30 }).settings.loudnessTargetLUFS).toBe(-18);
    expect(planBooth(p, { loudnessTargetLUFS: 0 }).settings.loudnessTargetLUFS).toBe(-12);
  });

  it("per-track trims add on top; the total never leaves [−24, +12]", () => {
    expect(GAIN_MAX_DB).toBe(12);
    expect(GAIN_MIN_DB).toBe(-24);
    const q = withAudio(p, -12);
    const id = q.tandas[0]!.songs[0]!.id;
    const b = planBooth(q, { trims: { [id]: 3 } });
    expect(b.trims).toEqual({ [id]: 3 });
    expect(b.items.find((i) => i.id === id)!.gainDb).toBe(-1);
    expect(planBooth(withAudio(p, -30), { trims: { [id]: 6 } }).items.find((i) => i.id === id)!.gainDb).toBe(
      12,
    );
    expect(planBooth(withAudio(p, 0), { trims: { [id]: -30 } }).items.find((i) => i.id === id)!.gainDb).toBe(
      -24,
    );
    // a trim on a track without features is still a gain
    expect(planBooth(p, { trims: { [id]: -2 } }).items.find((i) => i.id === id)!.gainDb).toBe(-2);
    // trims are clamped to ±12 before they add
    expect(planBooth(withAudio(p, -12), { trims: { [id]: 40 } }).items.find((i) => i.id === id)!.gainDb).toBe(
      8,
    );
    for (const it of planBooth(q).items) {
      if (it.gainDb === undefined) continue;
      expect(it.gainDb).toBeLessThanOrEqual(GAIN_MAX_DB);
      expect(it.gainDb).toBeGreaterThanOrEqual(GAIN_MIN_DB);
    }
  });

  it("a measured file wins over the prior and the peak cap keeps peak + gain ≤ −1 dBFS", () => {
    expect(PEAK_CEILING_DBFS).toBe(-1);
    const id = p.tandas[0]!.songs[0]!.id;
    const q = withAudio(p, -12);
    const measured = planBooth(q, { measurements: { [id]: { lufs: -20 } } }).items.find((i) => i.id === id)!;
    expect(measured.gainDb).toBe(4);
    expect(measured.peakCapped).toBeUndefined();
    const capped = planBooth(q, { measurements: { [id]: { lufs: -24, peakDbFS: -3 } } }).items.find(
      (i) => i.id === id,
    )!;
    expect(capped.gainDb).toBe(2);
    expect(capped.peakCapped).toBe(true);
    // the DJ's trim is never reduced by the cap: the normalisation part absorbs it
    const trimmed = planBooth(q, {
      measurements: { [id]: { lufs: -24, peakDbFS: -3 } },
      trims: { [id]: 1 },
    }).items.find((i) => i.id === id)!;
    expect(trimmed.gainDb).toBe(2);
    expect(trimmed.peakCapped).toBe(true);
    // the cap only ever reduces
    const quiet = planBooth(q, { measurements: { [id]: { lufs: -10, peakDbFS: -20 } } }).items.find(
      (i) => i.id === id,
    )!;
    expect(quiet.gainDb).toBe(-6);
    expect(quiet.peakCapped).toBeUndefined();
  });

  it("trims leading silence only when enabled, from the measured intro else the prior, never more than 3 s", () => {
    const q = withAudio(p, -14, 1.2);
    for (const it of planBooth(q).items)
      expect(it.kind === "cortina" || it.trimInSec === undefined).toBe(true);
    expect(planBooth(q).settings.trimLeadingSilence).toBe(false);
    const on = planBooth(q, { trimLeadingSilence: true });
    const firsts = on.items.filter((i) => i.kind === "track" && i.trimInSec !== undefined);
    expect(firsts).toHaveLength(p.tandas.length);
    for (const it of firsts) {
      const song = p.tandas[it.tanda - 1]!.songs.find((s) => s.id === it.id)!;
      expect(it.trimInSec).toBe(1.2);
      expect(it.lengthSec).toBe(round3((song.durationSec ?? 170) - 1.2));
    }
    const long = planBooth(withAudio(p, -14, 7), { trimLeadingSilence: true }).items.find(
      (i) => i.trimInSec === 3,
    );
    expect(long).toBeDefined();
    const id = p.tandas[0]!.songs[0]!.id;
    expect(
      planBooth(q, { trimLeadingSilence: true, measurements: { [id]: { introSec: 0.4 } } }).items.find(
        (i) => i.id === id,
      )!.trimInSec,
    ).toBe(0.4);
  });
});

describe("time to La Cumparsita and markers", () => {
  it("cumparsitaAtSec is the sum of every item (with its gap) before the closing", () => {
    const closing = plan.items[plan.items.length - 1]!;
    expect(closing.kind).toBe("closing");
    let sum = 0;
    for (const it of plan.items.slice(0, -1)) sum += it.lengthSec + it.gapAfterSec;
    expect(plan.cumparsitaAtSec).toBe(round3(sum));
    expect(plan.cumparsitaAtSec).toBe(closing.startSec);
    expect(plan.wallClockSec).toBe(round3(plan.cumparsitaAtSec! + closing.lengthSec));
    expect(planBooth({ ...p, closing: null }).cumparsitaAtSec).toBeUndefined();
  });

  it("marks each tanda's first track, breaks, the opening and the closing", () => {
    const tm = plan.markers.filter((m) => m.kind === "tanda");
    expect(tm).toHaveLength(p.tandas.length);
    tm.forEach((m, i) => {
      expect(m.tanda).toBe(i + 1);
      const first = plan.items.find((it) => it.tanda === i + 1 && it.kind === "track")!;
      expect(m.planIndex).toBe(plan.items.indexOf(first));
      expect(m.atSec).toBe(first.startSec);
      expect(m.label).toContain(p.tandas[i]!.orchestra);
    });
    const cm = plan.markers.find((m) => m.kind === "closing")!;
    expect(cm.atSec).toBe(plan.cumparsitaAtSec);
    expect(cm.planIndex).toBe(plan.items.length - 1);
    for (let i = 1; i < plan.markers.length; i++)
      expect(plan.markers[i]!.atSec).toBeGreaterThan(plan.markers[i - 1]!.atSec);
  });
});

describe("compose and stats", () => {
  it("compose() attaches the plan; wallClockSec and gapsSec land in stats, durationSec is untouched", () => {
    expect(p.booth).toBeDefined();
    expect(p.booth).toEqual(plan);
    expect(p.stats.wallClockSec).toBe(plan.wallClockSec);
    expect(p.stats.gapsSec).toBe(round3(plan.items.reduce((a, i) => a + i.gapAfterSec, 0)));
    expect(p.stats.wallClockSec!).toBeGreaterThanOrEqual(p.stats.durationSec);
    expect(p.stats.durationSec).toBe(computeStats(p.tandas, p.closing, p.options).durationSec);
  });

  it("attachBooth keeps the DJ's settings and trims, and swapTanda re-plans with them", () => {
    const id = p.tandas[0]!.songs[0]!.id;
    const q = attachBooth(p, { gapSec: 3, trims: { [id]: -2 }, gapOverrides: { 2: 4 } });
    expect(q.booth!.settings.gapSec).toBe(3);
    expect(q.stats.wallClockSec).toBe(q.booth!.wallClockSec);
    expect(q.stats.durationSec).toBe(p.stats.durationSec);
    const r = attachBooth(q);
    expect(r.booth!.settings.gapSec).toBe(3);
    expect(r.booth!.trims).toEqual({ [id]: -2 });
    expect(r.booth!.gapOverrides).toEqual({ 2: 4 });
    const s = swapTanda(q, 3, deps, 42);
    expect(s.booth).toBeDefined();
    expect(s.booth!.settings.gapSec).toBe(3);
    expect(s.booth!.items.map((i) => i.id)).toEqual(flatten(s, { includeBreaks: true }).map((r) => r.id));
    expect(s.stats.wallClockSec).toBe(s.booth!.wallClockSec);
  });

  it("is deterministic and pure", () => {
    const before = JSON.stringify(p);
    const a = planBooth(p, { gapSec: 3, trims: { x: 1 }, gapOverrides: { 1: 2 } });
    const b = planBooth(p, { gapSec: 3, trims: { x: 1 }, gapOverrides: { 1: 2 } });
    expect(a).toEqual(b);
    expect(JSON.stringify(p)).toBe(before);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    a.items[0]!.gapAfterSec = 99;
    expect(planBooth(p, { gapSec: 3, trims: { x: 1 }, gapOverrides: { 1: 2 } }).items[0]!.gapAfterSec).toBe(
      2,
    );
    expect(planBooth(p, { gapSec: 3, trims: { x: 1 } }).items[0]!.gapAfterSec).toBe(3);
  });
});

describe("exports write the plan's seconds", () => {
  it("flatten rows carry the plan's timing and planIndex", () => {
    const rows = flatten(p);
    for (const r of rows) {
      const it = p.booth!.items[r.planIndex]!;
      expect(it.id).toBe(r.id);
      expect(r.startSec).toBe(it.startSec);
      expect(r.gapAfterSec).toBe(it.gapAfterSec);
      expect(r.gainDb).toBe(it.gainDb);
      expect(r.stopSec).toBe(it.stopSec);
      expect(r.fadeOutSec).toBe(it.fadeOutSec);
      expect(r.trimInSec).toBe(it.trimInSec);
    }
    // without cortinas the rows still point at the right plan items
    for (const r of flatten(p, { includeCortinas: false }))
      expect(p.booth!.items[r.planIndex]!.id).toBe(r.id);
    // a different stop re-plans: the rows and the exports agree with planBooth for that stop
    const alt = planBooth(p, { cortinaStopSec: 60 });
    flatten(p, { cortinaStopSec: 60 }).forEach((r) => {
      expect(r.startSec).toBe(alt.items[r.planIndex]!.startSec);
      expect(r.stopSec).toBe(alt.items[r.planIndex]!.stopSec);
    });
    // a set without a plan (older history entries) exports with the default plan
    const bare: Playlist = { ...p, booth: undefined };
    expect(flatten(bare).map((r) => r.startSec)).toEqual(flatten(p).map((r) => r.startSec));
    // a stale plan (a tanda swapped without re-planning) is ignored
    const stale: Playlist = { ...p, tandas: p.tandas.slice(0, -1) };
    expect(flatten(stale).map((r) => r.id)).toEqual(planBooth(stale).items.map((i) => i.id));
  });

  it("M3U8: start-time for cue-ins, stop-time at the stop, and a #TDJ comment with gap, gain and fade", () => {
    const q: Playlist = attachBooth(
      {
        ...withAudio(p, -14),
        tandas: withAudio(p, -14).tandas.map((t) =>
          t.cortina ? { ...t, cortina: { ...t.cortina, startSec: 10 } } : t,
        ),
      },
      { trimLeadingSilence: false },
    );
    const text = toM3U8(q);
    const entries = text.split("\n#EXTINF").slice(1);
    const cs = q.booth!.items.filter((i) => i.kind === "cortina");
    const starts = entries.filter((e) => e.includes("#EXTVLCOPT:start-time=10"));
    expect(starts).toHaveLength(cs.length);
    for (const e of entries) {
      if (e.split("\n")[0]!.endsWith("[CORTINA]")) {
        expect(e).toMatch(/#EXTVLCOPT:start-time=10\n#EXTVLCOPT:stop-time=\d+\n/);
        expect(e).toMatch(/#TDJ:gap=2\.5 gain=-4 fade=4/);
      } else {
        expect(e).not.toContain("stop-time");
        expect(e).not.toContain("start-time");
        expect(e).toMatch(/#TDJ:gap=(2\.5|0)/);
      }
    }
    const trackGains = entries.filter((e) => /#TDJ:gap=2\.5 gain=-2\n/.test(e));
    expect(trackGains).toHaveLength(p.tandas.length);
    const stops = text
      .split("\n")
      .filter((l) => l.startsWith("#EXTVLCOPT:stop-time="))
      .map((l) => Number(l.split("=")[1]));
    expect(stops).toEqual(cs.map((c) => c.stopSec));
  });

  it("Rekordbox: a second hot cue at the fade start, Traktor: CUE_V2 out and fade, both in the plan's seconds", () => {
    const xml = toRekordboxXML(p);
    const cs = p.booth!.items.filter((i) => i.kind === "cortina");
    const fades = xml.match(/<POSITION_MARK Name="Cortina fade \(4 s\)" [^>]*\/>/g) ?? [];
    expect(fades).toHaveLength(cs.length);
    fades.forEach((m, i) => {
      expect(m).toContain(`Start="${(cs[i]!.stopSec! - cs[i]!.fadeOutSec!).toFixed(3)}"`);
      expect(m).toContain('Num="1"');
    });
    const outs = xml.match(/<POSITION_MARK Name="Cortina out[^>]*\/>/g) ?? [];
    outs.forEach((m, i) => expect(m).toContain(`Start="${cs[i]!.stopSec!.toFixed(3)}"`));
    expect(xml).toContain("· gap 2.5 s");
    const nml = toTraktorNML(p);
    const cueOut = nml.match(/<CUE_V2 NAME="Cortina out" [^>]*>/g) ?? [];
    const cueFade = nml.match(/<CUE_V2 NAME="Fade" [^>]*>/g) ?? [];
    expect(cueOut).toHaveLength(cs.length);
    expect(cueFade).toHaveLength(cs.length);
    cueOut.forEach((m, i) => expect(m).toContain(`START="${(cs[i]!.stopSec! * 1000).toFixed(3)}"`));
    cueFade.forEach((m, i) =>
      expect(m).toContain(`START="${((cs[i]!.stopSec! - cs[i]!.fadeOutSec!) * 1000).toFixed(3)}"`),
    );
    expect(nml.match(/<CUE_V2 /g)?.length).toBe(cs.length * 2);
  });

  it("CSV and DJ CSV carry start_sec, stop_sec, gap_sec, fade_out_sec, gain_db; JSON carries booth", () => {
    for (const text of [toCSV(p), toSeratoCSV(p)]) {
      const lines = text.trim().split("\n");
      const head = lines[0]!.split(",").map((h) => h.replace(/"/g, ""));
      for (const col of ["start_sec", "stop_sec", "gap_sec", "fade_out_sec", "gain_db"])
        expect(head).toContain(col);
      const rows = flatten(p);
      expect(lines.length - 1).toBe(rows.length);
      const si = head.indexOf("start_sec");
      const st = head.indexOf("stop_sec");
      lines.slice(1).forEach((l, i) => {
        const cells = l.split('","').map((c) => c.replace(/^"|"$/g, ""));
        expect(Number(cells[si])).toBe(rows[i]!.startSec);
        expect(cells[st]).toBe(rows[i]!.stopSec === undefined ? "" : String(rows[i]!.stopSec));
      });
    }
    const j = JSON.parse(toJSON(p));
    expect(j.booth).toEqual(JSON.parse(JSON.stringify(plan)));
    expect(JSON.parse(toJSON({ ...p, booth: undefined })).booth).toEqual(JSON.parse(JSON.stringify(plan)));
  });

  it("the set list prefixes every tanda with its planned clock (T+ without a start time, hh:mm with one)", () => {
    const text = toSetList(p);
    const tm = plan.markers.filter((m) => m.kind === "tanda");
    const lines = text.split("\n").filter((l) => /^T\+\d+:\d\d {2}\d\d\. \[/.test(l));
    expect(lines).toHaveLength(tm.length);
    expect(lines[0]).toMatch(/^T\+0:00 {2}01\./);
    const q = attachBooth(p, { startAt: "2026-10-19T21:30:00" });
    const clocked = toSetList(q)
      .split("\n")
      .filter((l) => /^\d\d:\d\d {2}\d\d\. \[/.test(l));
    expect(clocked).toHaveLength(tm.length);
    expect(clocked[0]).toMatch(/^21:30 {2}01\./);
  });
});
