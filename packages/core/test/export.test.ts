/**
 * Export invariants: the cortina play length (ExportOpts.cortinaStopSec, default the cortina's own length) reaches
 * the players that can honour it: VLC through M3U8/XSPF stop-time options, Rekordbox through a hot cue. Tracks
 * never carry a stop; the ids of songs and cortinas travel with the flattened rows so a streaming match can be
 * stored back against them.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  compose,
  cortinaStopFor,
  flatten,
  orderSpotifyUris,
  type Playlist,
  toM3U8,
  toRekordboxXML,
  toSpotifyPlan,
  toXSPF,
} from "../src/index";
import { loadCatalog } from "../src/load";

let p: Playlist;
beforeAll(() => {
  p = compose({ hours: 2, seed: 7, cortinaLengthSec: 45 }, loadCatalog());
});
afterEach(() => new Promise((r) => setTimeout(r, 0)));

const cortinas = (pl: Playlist) => pl.tandas.filter((t) => t.cortina).length;

describe("cortina stop time", () => {
  it("clamps to 20–90 and follows the cortina's own length by default", () => {
    expect(cortinaStopFor({}, 45)).toBe(45);
    expect(cortinaStopFor({}, 30)).toBe(30);
    expect(cortinaStopFor({}, undefined)).toBe(45);
    expect(cortinaStopFor({ cortinaStopSec: 60 }, 45)).toBe(60);
    expect(cortinaStopFor({ cortinaStopSec: 5 }, 45)).toBe(20);
    expect(cortinaStopFor({ cortinaStopSec: 500 }, 45)).toBe(90);
    expect(cortinaStopFor({ cortinaStopSec: Number.NaN }, 45)).toBe(45);
  });

  it("M3U8 writes #EXTVLCOPT:stop-time for cortinas only, right after their #EXTINF", () => {
    const n = cortinas(p);
    expect(n).toBeGreaterThan(0);
    const text = toM3U8(p, { cortinaStopSec: 60 });
    const lines = text.split("\n");
    const stops = lines.filter((l) => l.startsWith("#EXTVLCOPT:stop-time="));
    expect(stops).toHaveLength(n);
    // 2026-11: the play length (60 s) runs from the cortina's start (its chorus)
    const starts60 = flatten(p, { cortinaStopSec: 60 })
      .filter((r) => r.kind === "cortina")
      .map((r) => r.trimInSec ?? 0);
    expect(stops).toEqual(starts60.map((s) => `#EXTVLCOPT:stop-time=${s + 60}`));
    // every VLC option belongs to the cortina entry above it (the #TDJ comment line sits between)
    lines.forEach((l, i) => {
      if (!l.startsWith("#EXTVLCOPT")) return;
      let j = i - 1;
      while (j >= 0 && !lines[j]!.startsWith("#EXTINF")) j--;
      expect(lines[j]).toMatch(/\[CORTINA\]$/);
    });
    // default: each cortina's own length (the compose option, trimmed by the engine to fit the night)
    const starts0 = flatten(p)
      .filter((r) => r.kind === "cortina")
      .map((r) => r.trimInSec ?? 0);
    const own = p.tandas
      .filter((t) => t.cortina)
      .map((t, i) => cortinaStopFor({}, t.cortina!.lengthSec) + starts0[i]!);
    expect(
      toM3U8(p)
        .split("\n")
        .filter((l) => l.startsWith("#EXTVLCOPT:stop-time="))
        .map((l) => Number(l.split("=")[1])),
    ).toEqual(own);
    // cortinas left out: no stop lines at all
    expect(toM3U8(p, { includeCortinas: false })).not.toContain("#EXTVLCOPT");
  });

  it("XSPF sets the cortina <duration> to the stop and a vlc:option stop-time; songs keep their full length", () => {
    const text = toXSPF(p, { cortinaStopSec: 50 });
    expect(text).toContain('xmlns:vlc="http://www.videolan.org/vlc/playlist/ns/0/"');
    const tracks = text.match(/<track>[\s\S]*?<\/track>/g) ?? [];
    const cort = tracks.filter((t) => t.includes("<annotation>cortina</annotation>"));
    expect(cort).toHaveLength(cortinas(p));
    const starts = flatten(p, { cortinaStopSec: 50 })
      .filter((r) => r.kind === "cortina")
      .map((r) => r.trimInSec ?? 0);
    cort.forEach((t, i) => {
      // the duration is what plays (50 s); VLC starts at the chorus and stops 50 s later
      expect(t).toContain("<duration>50000</duration>");
      expect(t).toContain(`<vlc:option>stop-time=${starts[i]! + 50}</vlc:option>`);
    });
    for (const t of tracks.filter((t) => !t.includes("<annotation>cortina</annotation>")))
      expect(t).not.toContain("vlc:option");
  });

  it("Rekordbox XML adds a hot cue at the stop second (and one at the fade start) on cortina tracks only", () => {
    const text = toRekordboxXML(p, { cortinaStopSec: 40 });
    const marks = text.match(/<POSITION_MARK [^>]*\/>/g) ?? [];
    const starts = flatten(p, { cortinaStopSec: 40 })
      .filter((r) => r.kind === "cortina")
      .map((r) => r.trimInSec ?? 0);
    // 2026-11: plus a memory cue at the start of each cortina that starts inside the song (its chorus)
    expect(marks).toHaveLength(cortinas(p) * 2 + starts.filter((s) => s > 0).length);
    marks
      .filter((m) => m.includes("Cortina out"))
      .forEach((m, i) => {
        expect(m).toContain(`Start="${(starts[i]! + 40).toFixed(3)}"`);
        expect(m).toContain('Type="0"');
        expect(m).toContain('Num="0"');
      });
    marks
      .filter((m) => m.includes("Cortina fade"))
      .forEach((m, i) => {
        expect(m).toContain(`Start="${(starts[i]! + 36).toFixed(3)}"`);
        expect(m).toContain('Num="1"');
      });
    const ins = marks.filter((m) => m.includes("Cortina in"));
    expect(ins.map((m) => m.match(/Start="([\d.]+)"/)![1])).toEqual(
      starts.filter((s) => s > 0).map((s) => s.toFixed(3)),
    );
    for (const m of ins) expect(m).toContain('Num="-1"');
    // every mark sits inside a cortina TRACK element
    for (const block of text.match(/<TRACK [^>]*>\n\s*<POSITION_MARK[\s\S]*?<\/TRACK>/g) ?? [])
      expect(block).toMatch(/Genre="Cortina"/);
    expect(text.match(/<TRACK TrackID=/g)?.length).toBe(flatten(p).length);
    expect(toRekordboxXML(p, { includeCortinas: false })).not.toContain("POSITION_MARK");
  });
});

describe("flattened ids", () => {
  it("carries the song and cortina ids, and toSpotifyPlan hands them to the matcher", () => {
    const rows = flatten(p);
    for (const r of rows) expect(r.id).toBeTruthy();
    const songIds = new Set(p.tandas.flatMap((t) => t.songs.map((s) => s.id)));
    for (const r of rows.filter((r) => r.kind === "track")) expect(songIds.has(r.id!)).toBe(true);
    const plan = toSpotifyPlan(p);
    for (const u of plan.unresolved) expect(u.track.id).toBeTruthy();
    expect(plan.uris.length + plan.unresolved.length).toBe(rows.length);
  });
});

describe("spotify order", () => {
  it("keeps the running order: every row has a slot, unresolved rows are filled back into their own slot", () => {
    const rows = flatten(p);
    const plan = toSpotifyPlan(p);
    expect(plan.slots.length).toBe(rows.length);
    // pretend half the rows were resolved and the rest matched later, in reverse order
    const found = new Map(plan.unresolved.map((u) => [u.track.id!, `spotify:track:m${u.slot}`] as const));
    const ordered = orderSpotifyUris(plan, found);
    expect(ordered.length).toBe(rows.length);
    rows.forEach((r, i) => {
      const slot = plan.slots[i]!;
      expect(ordered[i]).toBe(slot.uri ?? `spotify:track:m${i}`);
      if (slot.uri) expect(slot.uri).toBe(r.spotifyUri);
      else expect(slot.id).toBe(r.id);
    });
    // a cortina that was not resolved stays between its tandas, never at the end
    const firstCortina = rows.findIndex((r) => r.kind === "cortina");
    expect(firstCortina).toBeGreaterThan(0);
    expect(firstCortina).toBeLessThan(rows.length - 1);
  });
  it("drops only the rows that were never found and keeps everything else in place", () => {
    const plan = toSpotifyPlan(p);
    const ordered = orderSpotifyUris(plan, new Map());
    expect(ordered).toEqual(plan.slots.filter((s) => s.uri).map((s) => s.uri));
  });
});
