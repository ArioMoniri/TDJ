import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Playlist, Song } from "@tdj/core";
import { planBooth } from "@tdj/core";
import { describe, expect, it } from "vitest";
import { artworkFor, placeholderFor } from "./artwork";
import { canPrelisten, outputsFrom } from "./cue";
import { nightEnergy } from "./energyChart";
import { ERA_CLASSES, eraOf } from "./era";
import { INDICATORS, indicatorDefaults } from "./indicatorList";
import { MIX_PRESETS, presetOf } from "./mix";
import { decorate } from "./plan";
import { bpmOf, energyOf, keyOf } from "./songInfo";
import { resolveSourceMode } from "./sourceMode";
import { versionsOf } from "./versions";
import { clampCue, cueFromX, peaks } from "./waveform";

/**
 * Round 22 (docs/ROADMAP.md §1, §4, §12): the player's indicators and DJ tools are pure functions, so the page, the
 * desktop and iPad apps and these tests read the same rules.
 */
const featured = JSON.parse(
  readFileSync(join(__dirname, "../../../public/featured/golden-double-peak.json"), "utf8"),
) as Playlist;
const song = (o: Partial<Song> = {}): Song => ({
  id: "s1",
  title: "Corazón",
  rhythm: "tango",
  orchestra: "Carlos Di Sarli",
  orchestraId: "carlos-di-sarli",
  singer: "Roberto Rufino",
  singerId: "roberto-rufino",
  vocal: true,
  year: 1939,
  era: "golden-peak",
  ...o,
});
/** words that belong to engineers, never to the DJ's screen */
const NO_WORDS = /\b(TDJ_|env|api|server|undefined|null|NaN)\b/;

describe("era badge (coverage.json grades)", () => {
  it("maps the heatmap grade to best / good / weak / outside, with words a DJ reads", () => {
    expect(eraOf(song({ heat: 4 }))?.cls).toBe("best");
    expect(eraOf(song({ heat: 3 }))?.cls).toBe("good");
    expect(eraOf(song({ heat: 2 }))?.cls).toBe("weak");
    expect(eraOf(song({ heat: 1 }))?.cls).toBe("weak");
    expect(eraOf(song({ heat: 0 }))?.cls).toBe("outside");
    expect(ERA_CLASSES.map((c) => c.cls)).toEqual(["best", "good", "weak", "outside"]);
    for (const c of ERA_CLASSES) expect(c.explain).not.toMatch(NO_WORDS);
  });
  it("falls back to the shipped heatmap when the side carries no grade; nothing for unknown orchestras or years", () => {
    // D'Agostino / Vargas 1941 is graded in coverage.json
    const s = featured.tandas[0]!.songs[0]!;
    const { heat: _h, ...bare } = s;
    expect(eraOf(bare as Song)?.grade).toBe(s.heat);
    expect(eraOf(song({ orchestraId: "nobody", heat: undefined }))).toBeNull();
    expect(eraOf(song({ year: null, heat: undefined }))).toBeNull();
    // cortinas have no era
    expect(eraOf(featured.tandas[0]!.cortina!)).toBeNull();
    // the tooltip names the orchestra, the mode and the year
    expect(eraOf(s)!.why).toMatch(/D'Agostino.*vocal.*1941/);
  });
});

describe("BPM, key and energy with their source", () => {
  it("BPM: the DJ's, else the measured one, else the index; the source is named", () => {
    expect(bpmOf(song({ tempo: { bpm: 121.6, source: "dj" } }))).toEqual({ value: 122, source: "Your edit" });
    expect(bpmOf(song({ tempo: { bpm: 118, source: "deezer" } }))?.source).toBe("Deezer");
    expect(bpmOf(song({ bpm: 120 }))?.source).toBe("Catalogue estimate");
    expect(bpmOf(song())).toBeNull();
  });
  it("key: Camelot and the musical name from the analysed preview; nothing below a weak confidence", () => {
    const audio = {
      version: 1 as const,
      durationSec: 30,
      bpm: 120,
      bpmCandidates: [120],
      pulseClarity: 0.5,
      key: "G#",
      mode: "minor" as const,
      keyConfidence: 0.6,
      camelot: "1A",
      loudnessDb: -20,
      loudnessRange: 8,
      brightnessHz: 2000,
      onsetsPerSec: 3,
      introSec: 0,
      energy: 50,
      chroma: [],
    };
    expect(keyOf(song({ audio }))).toEqual({ camelot: "1A", name: "G♯ minor", source: "Analysed preview" });
    expect(keyOf(song({ audio: { ...audio, keyConfidence: 0.05 } }))).toBeNull();
    expect(keyOf(song())).toBeNull();
  });
  it("energy: 0–100 rounded, null without one", () => {
    expect(energyOf(song({ energy: 56.4 }))).toBe(56);
    expect(energyOf(song())).toBeNull();
  });
});

describe("the night's energy chart", () => {
  const plan = decorate(featured, planBooth(featured));
  it("one point per tanda in order, energy and target 0–100, times inside the night, rhythm kept", () => {
    const c = nightEnergy(featured, plan, 0);
    expect(c.points.length).toBe(featured.tandas.length);
    c.points.forEach((pt, i) => {
      expect(pt.tanda).toBe(i + 1);
      expect(pt.energy).toBeGreaterThanOrEqual(0);
      expect(pt.energy).toBeLessThanOrEqual(100);
      expect(pt.at).toBeGreaterThanOrEqual(0);
      expect(pt.at).toBeLessThanOrEqual(1);
      expect(pt.rhythm).toBe(featured.tandas[i]!.rhythm);
      if (i) expect(pt.at).toBeGreaterThan(c.points[i - 1]!.at);
    });
  });
  it("'we are here' follows the playhead: 0 at the start, inside tanda 7 when tanda 7 plays", () => {
    expect(nightEnergy(featured, plan, 0).here).toBe(0);
    const i7 = plan.items.findIndex((x) => x.kind === "track" && x.tanda === 7);
    const c = nightEnergy(featured, plan, i7, 30);
    expect(c.hereTanda).toBe(7);
    expect(c.here).toBeGreaterThan(c.points[5]!.at);
    expect(c.here).toBeLessThan(c.points[7]!.at);
  });
});

describe("artwork", () => {
  it("the album art from the catalogue (Deezer cover, else a cached Spotify one), else null", () => {
    const s = featured.tandas[0]!.songs[0]!;
    expect(artworkFor(s)).toMatch(/^https:\/\/cdn-images\.dzcdn\.net\//);
    expect(artworkFor(song())).toBeNull();
    expect(artworkFor(song(), { s1: "https://i.scdn.co/image/abc" })).toBe("https://i.scdn.co/image/abc");
    // anything that is not an https image URL is ignored
    expect(artworkFor(song({ resolved: { artwork: "javascript:alert(1)" } as Song["resolved"] }))).toBeNull();
  });
  it("the placeholder is stable per orchestra and differs between orchestras", () => {
    const a = placeholderFor("Carlos Di Sarli");
    expect(a).toEqual(placeholderFor("Carlos Di Sarli"));
    expect(a.initials).toBe("DS");
    expect(placeholderFor("Juan D'Arienzo").initials).toBe("DA");
    expect(placeholderFor("Osvaldo Pugliese").initials).toBe("P");
    expect(a.hue).not.toBe(placeholderFor("Osvaldo Pugliese").hue);
    expect(a.hue).toBeGreaterThanOrEqual(0);
    expect(a.hue).toBeLessThan(360);
  });
});

describe("headphone pre-listen (a second output)", () => {
  const devs = [
    { kind: "audiooutput", deviceId: "default", label: "Default - MacBook Pro Speakers", groupId: "g1" },
    { kind: "audiooutput", deviceId: "spk", label: "MacBook Pro Speakers", groupId: "g1" },
    { kind: "audiooutput", deviceId: "hp", label: "AirPods Pro", groupId: "g2" },
    { kind: "audioinput", deviceId: "mic", label: "Mic", groupId: "g3" },
  ] as MediaDeviceInfo[];
  it("lists outputs only, named, without the duplicate default", () => {
    const o = outputsFrom(devs);
    expect(o.map((d) => d.id)).toEqual(["default", "hp"]);
    expect(o[0]!.label).toBe("This device (MacBook Pro Speakers)");
  });
  it("pre-listen needs setSinkId and a headphones output that is not the room's", () => {
    expect(canPrelisten({ supported: false, roomId: "default", cueId: "hp" })).toMatchObject({ ok: false });
    expect(canPrelisten({ supported: false, roomId: "default", cueId: "hp" }).why).toMatch(/Safari|browser/);
    expect(canPrelisten({ supported: true, roomId: "default", cueId: null }).ok).toBe(false);
    expect(canPrelisten({ supported: true, roomId: "hp", cueId: "hp" }).why).toMatch(/same/);
    expect(canPrelisten({ supported: true, roomId: "default", cueId: "hp" })).toEqual({ ok: true });
    // the same physical device under two ids (default + its own id) is the same output
    expect(
      canPrelisten({ supported: true, roomId: "default", cueId: "spk", devices: outputsFrom(devs, true) }).ok,
    ).toBe(false);
  });
});

describe("versions of a song", () => {
  it("every take of the same title by the same orchestra, by year, the side itself marked", () => {
    const me = song({ id: "a", year: 1939 });
    const cands = [
      song({ id: "b", year: 1956, singer: "Oscar Serpa" }),
      me,
      song({ id: "c", title: "Corazon", year: 1951 }),
      song({ id: "d", title: "Corazón de Oro", year: 1940 }),
      song({ id: "e", orchestraId: "anibal-troilo", orchestra: "Aníbal Troilo", year: 1944 }),
      song({ id: "b", year: 1956, singer: "Oscar Serpa" }),
    ];
    const v = versionsOf(me, cands);
    expect(v.map((x) => x.song.id)).toEqual(["a", "c", "b"]);
    expect(v[0]!.current).toBe(true);
    expect(v.filter((x) => x.current).length).toBe(1);
  });
});

describe("waveform and cue handles", () => {
  it("peaks: n buckets of the absolute maximum, 0–1", () => {
    const data = new Float32Array(1000);
    data[10] = -0.8;
    data[990] = 0.5;
    const p = peaks(data, 10);
    expect(p.length).toBe(10);
    expect(p[0]).toBeCloseTo(0.8);
    expect(p[9]).toBeCloseTo(0.5);
    expect(Math.max(...p.slice(1, 9))).toBe(0);
  });
  it("a drag maps x to seconds; cue and stop keep 10 s apart and inside the side", () => {
    expect(cueFromX(50, 200, 180)).toBe(45);
    expect(cueFromX(-20, 200, 180)).toBe(0);
    expect(cueFromX(400, 200, 180)).toBe(180);
    expect(clampCue({ inSec: 100, outSec: 95 }, 180, "in")).toEqual({ inSec: 85, outSec: 95 });
    expect(clampCue({ inSec: 100, outSec: 95 }, 180, "out")).toEqual({ inSec: 100, outSec: 110 });
    expect(clampCue({ inSec: -3, outSec: 999 }, 180, "in")).toEqual({ inSec: 0, outSec: 180 });
  });
});

describe("mix presets", () => {
  it("each preset says what it does; the current settings are recognised, else Custom", () => {
    for (const p of MIX_PRESETS) {
      expect(p.explain.length).toBeGreaterThan(20);
      expect(p.explain).not.toMatch(NO_WORDS);
      expect(presetOf({ ...p.values })).toBe(p.id);
    }
    expect(presetOf({ gapSec: 5.5, songFadeOutSec: 7, crossfadeSec: 1 })).toBe("custom");
  });
});

describe("indicators", () => {
  it("energy, BPM, key, era and artwork, each with a one-line explanation, all on by default", () => {
    expect(INDICATORS.map((i) => i.id)).toEqual(["energy", "bpm", "key", "era", "artwork"]);
    for (const i of INDICATORS) {
      expect(i.explain.length).toBeGreaterThan(20);
      expect(i.explain).not.toMatch(NO_WORDS);
    }
    expect(Object.values(indicatorDefaults()).every(Boolean)).toBe(true);
  });
});

describe("Spotify Premium plays full tracks by default", () => {
  it("connected Premium: full tracks, even when the last night was a rehearsal; ?rehearsal=1 still rehearses", () => {
    expect(resolveSourceMode({ saved: "preview", rehearsalParam: false, spotifyOk: true })).toBe("file");
    expect(resolveSourceMode({ saved: undefined, rehearsalParam: false, spotifyOk: true })).toBe("file");
    expect(resolveSourceMode({ saved: "spotify", rehearsalParam: false, spotifyOk: true })).toBe("spotify");
    expect(resolveSourceMode({ saved: "preview", rehearsalParam: true, spotifyOk: true })).toBe("preview");
    // without Spotify the DJ's own rehearsal choice is kept
    expect(resolveSourceMode({ saved: "preview", rehearsalParam: false, spotifyOk: false })).toBe("preview");
  });
});
