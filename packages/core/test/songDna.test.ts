/**
 * 2026-11 (the owner: "song lyrics and song DNA and other orchestra and singer versions should be shown in song
 * details … singer start or rhythm start info"): the invariants of the work credits (data/knowledge/works.json),
 * the Song DNA views (every recording of a work, the orchestra's and singer's year around it, the tanda family) and
 * the timing measured from decodable audio (music start, first beat, first downbeat, the beat grid).
 */
import { beforeAll, describe, expect, it } from "vitest";
import WORKS from "../../../data/knowledge/works.json";
import {
  BEATS_PER_BAR,
  beatGrid,
  estimateBpm,
  firstOnsetSec,
  measureTiming,
  onsetEnvelope,
} from "../src/audio/onsets";
import { normTitle } from "../src/energy";
import { readIndexSongs } from "../src/load";
import { orchestraDna, singerDna, songDna, WORK_CREDITS, workCredit, worksBy } from "../src/songDna";
import type { Song } from "../src/types";

let songs: Song[];
beforeAll(() => {
  songs = readIndexSongs();
});

describe("work credits (data/knowledge/works.json)", () => {
  it("every curated work is a title the index holds", () => {
    const titles = new Set(songs.map((s) => normTitle(s.title)));
    const missing = WORKS.works.filter((w) => !titles.has(normTitle(w.title))).map((w) => w.title);
    expect(missing).toEqual([]);
  });
  it("one entry per work, a composer always, a written year in the tango's century", () => {
    const keys = WORKS.works.map((w) => normTitle(w.title));
    expect(new Set(keys).size).toBe(keys.length);
    for (const w of WORKS.works) {
      expect(w.composers.length, w.title).toBeGreaterThan(0);
      expect(w.year, w.title).toBeGreaterThanOrEqual(1880);
      expect(w.year, w.title).toBeLessThanOrEqual(1990);
    }
  });
  it("a work without a lyricist is an instrumental work; the lookup ignores accents and case", () => {
    expect(workCredit("LA CUMPARSITA")?.composers).toEqual(["Gerardo Matos Rodríguez"]);
    expect(workCredit("la cumparsita")?.instrumental).toBe(false);
    expect(workCredit("Bahia blanca")?.instrumental).toBe(true);
    expect(workCredit("A title nobody wrote")).toBeNull();
    expect(WORK_CREDITS.size).toBe(WORKS.works.length);
  });
  it("the DJ's own credit wins over the curated one", () => {
    const own = workCredit("Malena", { malena: { composers: ["X"], lyricists: [], year: 1940 } });
    expect(own?.composers).toEqual(["X"]);
    expect(own?.source).toBe("dj");
  });
  it("related works: the same composer or lyricist, never the work itself", () => {
    const rel = worksBy(["Homero Manzi"], "Malena").map((w) => w.title);
    expect(rel).toContain("Sur");
    expect(rel).not.toContain("Malena");
  });
});

describe("Song DNA", () => {
  const pick = (title: string, orch: string) =>
    songs.find((s) => normTitle(s.title) === normTitle(title) && s.orchestraId === orch && s.year);
  it("every recording of the work, by every orchestra, oldest first, the side itself among them", () => {
    const me = pick("La cumparsita", "juan-d-arienzo")!;
    const d = songDna(songs, me.id)!;
    expect(d.recordings.length).toBeGreaterThan(50);
    expect(new Set(d.recordings.map((r) => r.orchestraId)).size).toBeGreaterThan(20);
    expect(d.recordings.some((r) => r.id === me.id && r.current)).toBe(true);
    const years = d.recordings.map((r) => r.year ?? 9999);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
    expect(d.work.credit?.composers[0]).toBe("Gerardo Matos Rodríguez");
    expect(d.work.count).toBe(d.recordings.length);
  });
  it("the orchestra's other works around the year (±2), the singer's (±3), never this work", () => {
    const me = songs.find((s) => s.orchestraId === "carlos-di-sarli" && s.singer && s.year === 1941)!;
    const d = songDna(songs, me.id)!;
    for (const r of d.orchestraAround) {
      expect(r.orchestraId).toBe(me.orchestraId);
      expect(Math.abs((r.year ?? 0) - me.year!)).toBeLessThanOrEqual(2);
      expect(normTitle(r.title)).not.toBe(normTitle(me.title));
    }
    expect(d.singerAround.length).toBeGreaterThan(0);
    for (const r of d.singerAround) {
      expect(r.singerId).toBe(me.singerId);
      expect(Math.abs((r.year ?? 0) - me.year!)).toBeLessThanOrEqual(3);
    }
  });
  it("the tanda family it fits: same orchestra, same voice, same rhythm, inside a two-year window", () => {
    const me = songs.find(
      (s) => s.orchestraId === "juan-d-arienzo" && !s.vocal && s.rhythm === "tango" && s.year === 1937,
    )!;
    const d = songDna(songs, me.id)!;
    expect(d.family.sides.length).toBeGreaterThanOrEqual(4);
    for (const s of d.family.sides) {
      expect(s.orchestraId).toBe(me.orchestraId);
      expect(s.vocal).toBe(false);
      expect(s.rhythm).toBe("tango");
      expect(Math.abs((s.year ?? 0) - 1937)).toBeLessThanOrEqual(2);
      expect(s.transcription).toBeFalsy();
    }
  });
  it("an unknown id has no DNA", () => {
    expect(songDna(songs, "nope")).toBeNull();
  });
  it("orchestra and singer pages: counts by year, voices with their years, works by count", () => {
    const o = orchestraDna(songs, "carlos-di-sarli")!;
    expect(o.count).toBe(songs.filter((s) => s.orchestraId === "carlos-di-sarli").length);
    expect(Object.values(o.byYear).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(o.count);
    expect(o.singers.some((x) => /Rufino/.test(x.name))).toBe(true);
    expect(o.works[0]!.count).toBeGreaterThanOrEqual(o.works.at(-1)!.count);
    const rufino = o.singers.find((x) => /Rufino/.test(x.name))!;
    const s = singerDna(songs, rufino.id!)!;
    expect(s.orchestras.some((x) => x.id === "carlos-di-sarli")).toBe(true);
    expect(orchestraDna(songs, "nope")).toBeNull();
  });
});

/* ---------- timing from audio ---------- */

const SR = 22050;
/** clicks at `bpm` from `startSec`, every `accentEvery`-th one (from `accentFrom`) louder, over low noise */
function clicks(o: {
  bpm: number;
  startSec: number;
  seconds: number;
  accentEvery: number;
  accentFrom: number;
}) {
  const x = new Float32Array(Math.round(o.seconds * SR));
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647 - 0.5;
  };
  for (let i = 0; i < x.length; i++) x[i] = rnd() * 0.0005;
  const period = 60 / o.bpm;
  for (let k = 0; ; k++) {
    const t0 = o.startSec + k * period;
    if (t0 >= o.seconds - 0.1) break;
    const amp = (k - o.accentFrom) % o.accentEvery === 0 && k >= o.accentFrom ? 0.9 : 0.3;
    const i0 = Math.round(t0 * SR);
    for (let j = 0; j < Math.round(0.04 * SR) && i0 + j < x.length; j++)
      x[i0 + j]! += rnd() * 2 * amp * Math.exp(-j / (0.008 * SR));
  }
  return x;
}

describe("timing from decodable audio", () => {
  const x = clicks({ bpm: 120, startSec: 2, seconds: 40, accentEvery: 4, accentFrom: 1 });
  it("the music starts where the first sound does", () => {
    expect(firstOnsetSec(x, SR)).toBeCloseTo(2, 1);
    expect(firstOnsetSec(new Float32Array(SR), SR)).toBeNull();
  });
  it("the tempo from the onsets, in the asked range", () => {
    const { env, hopSec } = onsetEnvelope(x, SR);
    const b = estimateBpm(env, hopSec, [90, 150])!;
    expect(Math.abs(b - 120)).toBeLessThan(2);
  });
  it("first beat at the music start, the first downbeat on the accented beat", () => {
    const m = measureTiming(x, SR, { bpm: 120, rhythm: "tango" })!;
    expect(Math.abs(m.firstBeatSec - 2)).toBeLessThan(0.03);
    expect(Math.abs(m.firstDownbeatSec - 2.5)).toBeLessThan(0.03);
    expect(m.confidence).toBeGreaterThan(0.3);
    expect(m.bpm).toBe(120);
  });
  it("without a tempo it measures one; silence measures nothing", () => {
    const m = measureTiming(x, SR, { rhythm: "tango" })!;
    expect(Math.abs(m.bpm - 120)).toBeLessThan(2);
    expect(measureTiming(new Float32Array(SR * 5), SR, {})).toBeNull();
  });
  it("the grid: beats every 60/bpm from the downbeat, a bar every beats-per-bar, a phrase every 8 bars", () => {
    expect(BEATS_PER_BAR.vals).toBe(3);
    const g = beatGrid({ downbeatSec: 1, bpm: 120, durationSec: 40, beatsPerBar: 4 });
    expect(g.beats).toContain(1);
    expect(g.bars[0]).toBeCloseTo(1, 5);
    expect(g.beats[1]! - g.beats[0]!).toBeCloseTo(0.5, 5);
    expect(g.bars[1]! - g.bars[0]!).toBeCloseTo(2, 5);
    expect(g.phrases[1]! - g.phrases[0]!).toBeCloseTo(16, 5);
    expect(g.beats.every((b) => b >= 0 && b <= 40)).toBe(true);
    // the beats before the downbeat (an anacrusis) are on the grid too
    const h = beatGrid({ downbeatSec: 1.2, bpm: 120, durationSec: 10, beatsPerBar: 4 });
    expect(h.beats[0]).toBeCloseTo(0.2, 5);
    expect(h.bars[0]).toBeCloseTo(1.2, 5);
  });
});
