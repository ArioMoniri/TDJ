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
    for (const s of stops) expect(s).toBe("#EXTVLCOPT:stop-time=60");
    // every VLC option belongs to the cortina entry above it (the #TDJ comment line sits between)
    lines.forEach((l, i) => {
      if (!l.startsWith("#EXTVLCOPT")) return;
      let j = i - 1;
      while (j >= 0 && !lines[j]!.startsWith("#EXTINF")) j--;
      expect(lines[j]).toMatch(/\[CORTINA\]$/);
    });
    // default: each cortina's own length (the compose option, trimmed by the engine to fit the night)
    const own = p.tandas.filter((t) => t.cortina).map((t) => cortinaStopFor({}, t.cortina!.lengthSec));
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
    for (const t of cort) {
      expect(t).toContain("<duration>50000</duration>");
      expect(t).toContain("<vlc:option>stop-time=50</vlc:option>");
    }
    for (const t of tracks.filter((t) => !t.includes("<annotation>cortina</annotation>")))
      expect(t).not.toContain("vlc:option");
  });

  it("Rekordbox XML adds a hot cue at the stop second (and one at the fade start) on cortina tracks only", () => {
    const text = toRekordboxXML(p, { cortinaStopSec: 40 });
    const marks = text.match(/<POSITION_MARK [^>]*\/>/g) ?? [];
    expect(marks).toHaveLength(cortinas(p) * 2);
    for (const m of marks.filter((m) => m.includes("Cortina out"))) {
      expect(m).toContain('Start="40.000"');
      expect(m).toContain('Type="0"');
      expect(m).toContain('Num="0"');
    }
    for (const m of marks.filter((m) => m.includes("Cortina fade"))) {
      expect(m).toContain('Start="36.000"');
      expect(m).toContain('Num="1"');
    }
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
