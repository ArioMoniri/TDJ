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
import {
  otherVersions,
  serviceWorkKey,
  thisRecording,
  versionCover,
  yearNoteOf,
  youtubeThumb,
} from "./songVersions";
import { albumImage } from "./spotifyWeb";
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

describe("versions: 'This recording', covers, album years and merged sources", () => {
  const ctx = {
    orchestras: [
      { id: "anibal-troilo", name: "Aníbal Troilo" },
      { id: "lucio-demare", name: "Lucio Demare" },
      { id: "carlos-di-sarli", name: "Carlos Di Sarli" },
    ],
  };
  const troilo = S({
    id: "t42",
    title: "Malena",
    orchestra: "Aníbal Troilo",
    orchestraId: "anibal-troilo",
    singer: "Francisco Fiorentino",
    year: 1942,
    durationSec: 182,
  });
  const troiloLate = S({
    id: "t57",
    title: "Malena",
    orchestra: "Aníbal Troilo",
    orchestraId: "anibal-troilo",
    singer: "Roberto Goyeneche",
    year: 1957,
    durationSec: 190,
  });
  const demare = S({
    id: "d42",
    title: "Malena",
    orchestra: "Lucio Demare",
    orchestraId: "lucio-demare",
    singer: "Juan Carlos Miranda",
    year: 1942,
    durationSec: 171,
    spotify: { uri: "spotify:track:dem" } as Song["spotify"],
  });
  const demareInstr = S({
    id: "d50",
    title: "Malena",
    orchestra: "Lucio Demare",
    orchestraId: "lucio-demare",
    year: 1950,
    durationSec: 171,
  });
  const cat = [troiloLate, demare, troilo, demareInstr];
  const T = (o: Partial<ServiceTrack> & Pick<ServiceTrack, "id" | "artists">): ServiceTrack => ({
    service: "spotify",
    uri: `spotify:track:${o.id}`,
    title: "Malena",
    year: 2004,
    durationSec: 170,
    ...o,
  });
  const ok = (tracks: ServiceTrack[]): ServiceAnswer[] => [{ id: "spotify", state: "ok", tracks }];

  it("'This recording' is the side's id, listed first and only once, even when the catalogue lists it later", () => {
    const r = otherVersions(troilo, cat, [], ctx);
    expect(r.versions[0]!.song.id).toBe("t42");
    expect(r.versions.filter((v) => v.current).map((v) => v.song.id)).toEqual(["t42"]);
    expect(r.versions.filter((v) => v.song.id === "t42")).toHaveLength(1);
    expect(r.catalogue).toBe(4);
  });
  it("a side opened from Spotify is matched by its uri to the catalogue row, never by the title alone", () => {
    const fromSpotify = S({
      id: "ext:spotify:dem",
      title: "Malena - Remastered 2004",
      orchestra: "Lucio Demare",
      orchestraId: "lucio-demare",
      singer: "Juan Carlos Miranda",
      year: 2004,
      spotify: { uri: "spotify:track:dem" } as Song["spotify"],
    });
    const r = otherVersions(fromSpotify, cat, [], ctx);
    expect(r.versions[0]!.song.id).toBe("d42");
    expect(r.versions[0]!.current).toBe(true);
    expect(r.versions.filter((v) => v.current)).toHaveLength(1);
    // the same work by another orchestra is never "This recording"
    const other = S({
      id: "ext:spotify:zz",
      title: "Malena",
      orchestra: "Some Band",
      orchestraId: "ext-some-band",
      year: 1942,
    });
    const r2 = otherVersions(other, cat, [], ctx);
    expect(r2.versions[0]!.song.id).toBe("ext:spotify:zz");
    expect(r2.versions.filter((v) => v.current).map((v) => v.song.id)).toEqual(["ext:spotify:zz"]);
  });
  it("without an id or uri, the orchestra + voice + recording year match; another voice or year does not", () => {
    const copy = { ...troilo, id: "elsewhere:1" } as Song;
    expect(thisRecording(copy, { song: troilo, sources: ["catalogue"] })).toBe("people");
    expect(thisRecording(copy, { song: troiloLate, sources: ["catalogue"] })).toBeNull();
    expect(thisRecording(copy, { song: { ...troilo, singer: null }, sources: ["catalogue"] })).toBeNull();
    // a service's album year is not a recording year
    expect(thisRecording(copy, { song: troilo, sources: ["spotify"] })).toBeNull();
    const r = otherVersions(copy, cat, [], ctx);
    expect(r.versions[0]!.song.id).toBe("t42");
    expect(r.versions.filter((v) => v.current)).toHaveLength(1);
  });
  it("a Spotify recording of the same orchestra + singer + length ±3 s merges into the catalogue row as a source", () => {
    const r = otherVersions(
      troilo,
      cat,
      ok([
        T({
          id: "fio",
          artists: ["Aníbal Troilo", "Francisco Fiorentino"],
          durationSec: 184,
          image: "https://i.scdn.co/a.jpg",
        }),
        // the same orchestra and singer, 9 s longer: another recording
        T({ id: "fio2", artists: ["Aníbal Troilo", "Francisco Fiorentino"], durationSec: 191 }),
        // the instrumental side never takes a sung track
        T({ id: "dm", artists: ["Lucio Demare", "Raúl Berón"], durationSec: 171 }),
      ]),
      ctx,
    );
    const mine = r.versions[0]!;
    expect(mine.song.id).toBe("t42");
    expect(mine.sources).toEqual(["catalogue", "spotify"]);
    expect(mine.external?.uri).toBe("spotify:track:fio");
    expect(r.versions.find((v) => v.song.id === "d50")!.sources).toEqual(["catalogue"]);
    expect(r.versions.some((v) => v.song.id === "ext:spotify:fio2")).toBe(true);
    expect(r.versions.some((v) => v.song.id === "ext:spotify:dm")).toBe(true);
    expect(r.serviceMatched).toBe(1);
  });
  it("the nearest length wins when two sides of one voice could be the track", () => {
    const twin = { ...troilo, id: "t42b", durationSec: 180 } as Song;
    const r = otherVersions(
      troilo,
      [...cat, twin],
      ok([T({ id: "fio", artists: ["Aníbal Troilo", "Francisco Fiorentino"], durationSec: 180 })]),
      ctx,
    );
    expect(r.versions.find((v) => v.song.id === "t42b")!.sources).toContain("spotify");
    expect(r.versions.find((v) => v.song.id === "t42")!.sources).toEqual(["catalogue"]);
  });
  it("covers: a service row shows its album image (else a YouTube thumbnail); a catalogue row resolves its own", () => {
    const r = otherVersions(
      troilo,
      cat,
      ok([
        T({ id: "img", artists: ["Carlos Di Sarli"], durationSec: 150, image: "https://i.scdn.co/img.jpg" }),
        T({ id: "noimg", artists: ["Julio Sosa"], durationSec: 200, year: 1964 }),
      ]),
      ctx,
      { youtube: { "ext:spotify:noimg": "abcDEF12345" } },
    );
    expect(r.versions.find((v) => v.song.id === "ext:spotify:img")!.cover).toBe("https://i.scdn.co/img.jpg");
    expect(r.versions.find((v) => v.song.id === "ext:spotify:noimg")!.cover).toBe(
      youtubeThumb("abcDEF12345"),
    );
    expect(r.versions[0]!.cover).toBeNull();
    expect(
      versionCover({
        song: troilo,
        sources: ["youtube"],
        external: { service: "youtube", id: "vid", uri: "yt:vid", title: "Malena", artists: [] },
      }),
    ).toBe(youtubeThumb("vid"));
  });
  it("a golden-age orchestra's Spotify album year is a reissue's; another artist's is an album year; the catalogue's is the recording's", () => {
    const r = otherVersions(
      troilo,
      cat,
      ok([
        T({ id: "ds", artists: ["Carlos Di Sarli"], durationSec: 150, year: 2004 }),
        T({ id: "js", artists: ["Julio Sosa"], durationSec: 200, year: 1964 }),
      ]),
      ctx,
    );
    expect(r.versions.find((v) => v.song.id === "ext:spotify:ds")!.yearNote).toBe("reissue");
    expect(r.versions.find((v) => v.song.id === "ext:spotify:js")!.yearNote).toBe("album");
    expect(r.versions.find((v) => v.song.id === "t42")!.yearNote).toBeNull();
    expect(
      yearNoteOf({ song: { ...troilo, orchestraId: "ext-x", year: 1990 }, sources: ["spotify"] }, 1957),
    ).toBe("reissue");
  });
  it("Spotify's album image: the smallest at least 128 px wide, else the largest", () => {
    expect(
      albumImage([
        { url: "https://i.scdn.co/640", width: 640 },
        { url: "https://i.scdn.co/300", width: 300 },
        { url: "https://i.scdn.co/64", width: 64 },
      ]),
    ).toBe("https://i.scdn.co/300");
    expect(albumImage([{ url: "https://i.scdn.co/64", width: 64 }])).toBe("https://i.scdn.co/64");
    expect(albumImage([])).toBeNull();
    expect(albumImage([{ url: "http://insecure/x", width: 300 }])).toBeNull();
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
