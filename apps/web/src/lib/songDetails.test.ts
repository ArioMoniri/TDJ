import type { Song } from "@tdj/core";
import { describe, expect, it } from "vitest";
import {
  firstSungSec,
  type LrclibRecord,
  lineAt,
  lrclibQueries,
  lyricsOf,
  parseLrc,
  pickRecord,
} from "./lyrics";
import type { ServiceAnswer, ServiceTrack } from "./smartSearch";
import { songHistory } from "./songHistory";
import { withMeasurement } from "./songMarks";
import { otherVersions, serviceWorkKey } from "./songVersions";
import { DRIFT_PLAYING_SEC, SEEK_SETTLE_MS, syncAction } from "./videoSync";

/**
 * 2026-11 — the song details: lyrics from LRCLIB (parsed, matched to the side, the current line), the other versions
 * from the catalogue and the DJ's services (one row per recording, the counts, "only this version" only when every
 * source was searched), the measured marks under the DJ's own, and a matched video following the Booth's clock.
 */
const S = (o: Partial<Song> & Pick<Song, "id" | "title" | "orchestra" | "orchestraId">): Song =>
  ({
    rhythm: "tango",
    singer: null,
    singerId: null,
    vocal: false,
    year: 1941,
    era: "golden",
    durationSec: 170,
    ...o,
    ...(o.singer ? { vocal: true, singerId: o.singer.toLowerCase().replace(/ /g, "-") } : {}),
  }) as Song;

describe("lyrics (LRCLIB)", () => {
  const lrc = "[ar:Troilo]\n[00:12.40] Malena canta el tango\n[00:18.05][01:40.00] como ninguna\n[00:30.00]";
  it("parses the timed lines, several stamps on one line, sorted, the tags left out", () => {
    const l = parseLrc(lrc);
    expect(l.map((x) => x.at)).toEqual([12.4, 18.05, 30, 100]);
    expect(l[0]!.text).toBe("Malena canta el tango");
    expect(firstSungSec(l)).toBe(12.4);
  });
  it("the current line is the last one started", () => {
    const l = parseLrc(lrc);
    expect(lineAt(l, 5)).toBe(-1);
    expect(lineAt(l, 12.4)).toBe(0);
    expect(lineAt(l, 25)).toBe(1);
    expect(lineAt(l, 500)).toBe(3);
  });
  const me = S({
    id: "a",
    title: "Malena",
    orchestra: "Aníbal Troilo",
    orchestraId: "anibal-troilo",
    singer: "Francisco Fiorentino",
    durationSec: 182,
  });
  const rec = (o: Partial<LrclibRecord>): LrclibRecord => ({
    id: 1,
    trackName: "Malena",
    artistName: "Aníbal Troilo",
    duration: 182,
    ...o,
  });
  it("picks the record of this orchestra and length, synced first; another title or artist never", () => {
    const best = pickRecord(
      [
        rec({ id: 1, artistName: "Julio Sosa", syncedLyrics: "[00:01.00] x" }),
        rec({ id: 2, plainLyrics: "x", duration: 240 }),
        rec({ id: 3, artistName: "Anibal Troilo, Francisco Fiorentino", syncedLyrics: "[00:10.00] y" }),
        rec({ id: 4, trackName: "Malena (otra)", artistName: "Aníbal Troilo" }),
      ],
      me,
    );
    expect(best?.id).toBe(3);
    expect(pickRecord([rec({ trackName: "Sur", plainLyrics: "x" })], me)).toBeNull();
  });
  it("what a record gives: synced, plain, instrumental or none", () => {
    expect(lyricsOf(rec({ syncedLyrics: "[00:10.00] y" })).state).toBe("synced");
    expect(lyricsOf(rec({ plainLyrics: "y" })).state).toBe("plain");
    expect(lyricsOf(rec({ instrumental: true })).state).toBe("instrumental");
    expect(lyricsOf(null).state).toBe("none");
  });
  it("searches by title and the orchestra's surname, then by the singer", () => {
    const [a, b] = lrclibQueries(me);
    expect(a).toContain("lrclib.net/api/search");
    expect(decodeURIComponent(a!)).toContain("artist_name=troilo");
    expect(decodeURIComponent(b!.replace(/\+/g, " "))).toContain("Francisco Fiorentino");
  });
});

describe("other versions: the catalogue and the DJ's services", () => {
  const me = S({
    id: "m",
    title: "Malena",
    orchestra: "Aníbal Troilo",
    orchestraId: "anibal-troilo",
    year: 1942,
  });
  const cat = [
    me,
    S({
      id: "d",
      title: "Malena",
      orchestra: "Lucio Demare",
      orchestraId: "lucio-demare",
      singer: "Juan Carlos Miranda",
      year: 1942,
    }),
    S({
      id: "o",
      title: "Malena",
      orchestra: "Osvaldo Pugliese",
      orchestraId: "osvaldo-pugliese",
      year: 1952,
    }),
    S({ id: "x", title: "Sur", orchestra: "Aníbal Troilo", orchestraId: "anibal-troilo" }),
  ];
  const ctx = {
    orchestras: [
      { id: "anibal-troilo", name: "Aníbal Troilo" },
      { id: "lucio-demare", name: "Lucio Demare" },
      { id: "osvaldo-pugliese", name: "Osvaldo Pugliese" },
      { id: "ruben-sosa", name: "Rubén Sosa" },
    ],
  };
  const T = (o: Partial<ServiceTrack> & Pick<ServiceTrack, "id" | "title" | "artists">): ServiceTrack => ({
    service: "spotify",
    uri: `spotify:track:${o.id}`,
    year: 1990,
    durationSec: 170,
    ...o,
  });
  const ok = (tracks: ServiceTrack[]): ServiceAnswer[] => [{ id: "spotify", state: "ok", tracks }];
  it("every orchestra's recording of the work, the side first, other works left out", () => {
    const r = otherVersions(me, cat, [], ctx);
    expect(r.versions.map((v) => v.song.id)).toEqual(["m", "d", "o"]);
    expect(r.versions[0]!.current).toBe(true);
    expect(r.catalogue).toBe(3);
  });
  it("a service's recording of the work joins (another orchestra, an edition tail), the same one merges", () => {
    const r = otherVersions(
      me,
      cat,
      ok([
        T({ id: "1", title: "Malena - Remastered", artists: ["Julio Sosa"], durationSec: 200 }),
        T({ id: "2", title: "Malena", artists: ["Lucio Demare", "Juan Carlos Miranda"], year: 1995 }),
        T({ id: "3", title: "Naranjo en flor", artists: ["Julio Sosa"] }),
      ]),
      ctx,
    );
    expect(r.versions.map((v) => v.song.id)).toEqual(["m", "d", "o", "ext:spotify:1"]);
    expect(r.versions.find((v) => v.song.id === "d")!.sources).toEqual(["catalogue", "spotify"]);
    expect(r.serviceOnly).toBe(1);
    expect(r.serviceMatched).toBe(1);
    expect(r.versions.at(-1)!.song.yearApprox).toBe(true);
    expect(serviceWorkKey("Malena [Live]")).toBe("malena");
    // another person of the same surname is not that orchestra ("Julio Sosa" is not Rubén Sosa)
    expect(r.versions.at(-1)!.song.orchestra).toBe("Julio Sosa");
  });
  it("'only this version' only once every source was searched and found nothing else", () => {
    const alone = [me];
    expect(otherVersions(me, alone, ok([]), ctx).onlyThis).toBe(true);
    const out = otherVersions(me, alone, [{ id: "spotify", state: "signed-out", tracks: [] }], ctx);
    expect(out.onlyThis).toBe(false);
    expect(out.unsearched).toEqual(["spotify"]);
    expect(otherVersions(me, alone, [], ctx, { servicesSearched: false }).onlyThis).toBe(false);
    expect(otherVersions(me, alone, [{ id: "spotify", state: "off", tracks: [] }], ctx).onlyThis).toBe(true);
  });
});

describe("marks and the synced video", () => {
  const m = { musicStartSec: 0.4, firstBeatSec: 0.5, firstDownbeatSec: 1, bpm: 120, confidence: 0.8 };
  it("a measurement fills the beat, never over the DJ's own; the singer mark stays", () => {
    expect(withMeasurement(undefined, m).downbeatSec).toBe(1);
    const own = withMeasurement({ downbeatSec: 2.2, bpm: 118, beatFrom: "dj", singerSec: 31 }, m);
    expect(own.downbeatSec).toBe(2.2);
    expect(own.bpm).toBe(118);
    expect(own.singerSec).toBe(31);
    expect(own.musicStartSec).toBe(0.4);
  });
  const base = { target: 60, playing: true, videoTime: 60, videoPlaying: true, sinceSeekMs: 5000 };
  it("in step: nothing to do; drifted: one seek, then a pause to settle before the next", () => {
    expect(syncAction(base)).toEqual({ drift: 0 });
    expect(syncAction({ ...base, videoTime: 60 + DRIFT_PLAYING_SEC / 2 }).seek).toBeUndefined();
    expect(syncAction({ ...base, videoTime: 62 }).seek).toBe(60);
    expect(syncAction({ ...base, videoTime: 62, sinceSeekMs: SEEK_SETTLE_MS - 1 }).seek).toBeUndefined();
  });
  it("follows play, pause and the DJ's offset; nothing playing pauses it; past its end it waits", () => {
    expect(syncAction({ ...base, playing: false }).pause).toBe(true);
    expect(syncAction({ ...base, videoPlaying: false }).play).toBe(true);
    expect(syncAction({ ...base, offsetSec: 3 }).seek).toBe(63);
    expect(syncAction({ ...base, target: null }).pause).toBe(true);
    const end = syncAction({ ...base, target: 300, videoTime: 100, videoDuration: 200 });
    expect(end.pause).toBe(true);
    expect(end.seek).toBe(199.75);
  });
});

describe("your history with a side", () => {
  const side = S({ id: "s1", title: "Malena", orchestra: "Aníbal Troilo", orchestraId: "anibal-troilo" });
  const other = { ...side, id: "s2" };
  const night = (id: string, songs: Song[], played: boolean) =>
    ({
      id,
      title: `Night ${id}`,
      createdAt: `2026-10-0${id}T20:00:00Z`,
      options: {},
      score: 90,
      source: "compose",
      playlist: { tandas: [{ songs }] },
      ...(played ? { nightLog: { playedSec: 4000, rehearsal: false } } : {}),
    }) as never;
  it("the nights that hold it or another version, newest first; floor taps and hearts counted", () => {
    const h = songHistory(
      side,
      [night("1", [side], true), night("2", [other], false), night("3", [], false)],
      {
        taps: [
          {
            at: "x",
            nightId: "n",
            scope: "song",
            songIds: ["s1"],
            family: "f",
            role: "peak",
            reaction: "full",
          },
          {
            at: "x",
            nightId: "n",
            scope: "tanda",
            songIds: ["s1", "z"],
            family: "f",
            role: "peak",
            reaction: "ok",
          },
        ],
        hearts: { n: { s1: { n: 3, role: "peak", at: "x" } } },
        plays: {},
        songs: {},
      },
    );
    expect(h.nights.map((n) => [n.id, n.version, n.played])).toEqual([
      ["2", "other", false],
      ["1", "this", true],
    ]);
    expect([h.full, h.ok, h.emptied, h.hearts]).toEqual([1, 1, 0, 3]);
  });
});
