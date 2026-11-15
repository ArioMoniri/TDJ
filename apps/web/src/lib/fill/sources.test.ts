import { describe, expect, it } from "vitest";
import {
  fillSong,
  lookup,
  matchScore,
  parseCoverArt,
  parseDeezerSearch,
  parseDeezerTrack,
  parseDiscogs,
  parseMusicBrainz,
  parseSpotifyTrack,
  plausibleDate,
} from "./sources";

const WANT = {
  id: "x",
  title: "Corazón",
  orchestra: "Carlos Di Sarli",
  singer: "Roberto Rufino",
  year: 1939,
};

const fakeFetch = (routes: Record<string, unknown>) => {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (!key) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => routes[key] };
  };
  return { f, calls };
};

describe("fill: source parsers", () => {
  it("matches by title and the orchestra's surname", () => {
    expect(matchScore(WANT, "Corazon", "Carlos Di Sarli y su Orquesta")).toBe(1);
    expect(matchScore(WANT, "Corazón", "Juan D'Arienzo")).toBe(0.6);
  });
  it("a date far from the index year is a reissue, not the side's date", () => {
    expect(plausibleDate("1939-05-11", 1939)).toBe(true);
    expect(plausibleDate("2008-01-01", 1939)).toBe(false);
    expect(plausibleDate("1941", null)).toBe(true);
  });
  it("Deezer: the best search hit and the track's BPM, gain, artwork, date and preview", () => {
    const hit = parseDeezerSearch(
      {
        data: [
          { id: 1, title: "Corazón", artist: { name: "Juan D'Arienzo" } },
          { id: 2, title: "Corazón", artist: { name: "Carlos Di Sarli" } },
        ],
      },
      WANT,
    );
    expect(hit?.id).toBe(2);
    const t = parseDeezerTrack({
      id: 2,
      bpm: 123.96,
      gain: -11.73,
      release_date: "1939-01-01",
      preview: "https://p/2.mp3",
      album: { cover_medium: "https://c/2.jpg" },
    });
    expect(t.values).toEqual({
      deezerId: "2",
      bpm: 124,
      gainDb: -11.7,
      artwork: "https://c/2.jpg",
      release: "1939-01-01",
    });
    expect(t.previewUrl).toBe("https://p/2.mp3");
    expect(t.ref).toBe("deezer:2");
    // bpm 0 = unknown on Deezer
    expect(parseDeezerTrack({ id: 3, bpm: 0 }).values.bpm).toBeUndefined();
  });
  it("MusicBrainz: the earliest dated release of the best recording, the release for its cover", () => {
    const mb = parseMusicBrainz(
      {
        recordings: [
          {
            id: "r1",
            title: "Corazón",
            "artist-credit": [{ name: "Carlos Di Sarli" }],
            releases: [
              { id: "late", date: "2004-01-01" },
              { id: "orig", date: "1939-06" },
            ],
          },
        ],
      },
      WANT,
    );
    expect(mb).toEqual({ values: { release: "1939-06" }, ref: "mb:r1", releaseId: "orig" });
    expect(parseMusicBrainz({ recordings: [{ id: "z", title: "Other" }] }, WANT)).toBeNull();
    expect(parseCoverArt({ images: [{ front: true, thumbnails: { "250": "https://caa/250.jpg" } }] })).toBe(
      "https://caa/250.jpg",
    );
  });
  it("Discogs and Spotify", () => {
    const dg = parseDiscogs(
      {
        results: [
          { id: 9, title: "Carlos Di Sarli - Corazón", year: "1939", cover_image: "https://d/9.jpg" },
        ],
      },
      WANT,
    );
    expect(dg).toEqual({ values: { release: "1939", artwork: "https://d/9.jpg" }, ref: "discogs:9" });
    const sp = parseSpotifyTrack({
      uri: "spotify:track:abc",
      album: {
        release_date: "2011-04-01",
        images: [
          { url: "https://i/640", width: 640 },
          { url: "https://i/300", width: 300 },
          { url: "https://i/64", width: 64 },
        ],
      },
    });
    expect(sp.values.artwork).toBe("https://i/300");
    expect(sp.ref).toBe("spotify:track:abc");
  });
});

describe("fill: one song from every enabled source", () => {
  const routes = {
    "api.deezer.com/search": { data: [{ id: 2, title: "Corazón", artist: { name: "Carlos Di Sarli" } }] },
    "api.deezer.com/track/2": { id: 2, bpm: 124, gain: -11, album: { cover_medium: "https://c/2.jpg" } },
    "musicbrainz.org": {
      recordings: [
        {
          id: "r1",
          title: "Corazón",
          "artist-credit": [{ name: "Carlos Di Sarli" }],
          releases: [{ id: "orig", date: "1939-06-01" }],
        },
      ],
    },
    "coverartarchive.org/release/orig": { images: [{ front: true, image: "https://caa/full.jpg" }] },
  };
  it("stores every value with its source, then skips sources that are fresh", async () => {
    const { f, calls } = fakeFetch(routes);
    const now = Date.parse("2026-11-14T12:00:00Z");
    const r = await fillSong(WANT, null, ["deezer", "musicbrainz", "coverart"], { fetch: f }, { now });
    expect(r.record).toMatchObject({ bpm: 124, gainDb: -11, release: "1939-06-01", deezerId: "2" });
    // the Cover Art Archive (the original release) answers after Deezer (often a reissue) and its cover is kept
    expect(r.record!.artwork).toBe("https://caa/full.jpg");
    expect(r.record!.fields).toMatchObject({ bpm: "deezer", release: "musicbrainz", artwork: "coverart" });
    const n = calls.length;
    const again = await fillSong(
      { ...WANT, deezerId: "2" },
      r.record,
      ["deezer", "musicbrainz"],
      { fetch: f },
      { now },
    );
    // deezer's ref was set by the search; asking with the same track id is fresh, musicbrainz too
    expect(again.results).toEqual([]);
    expect(calls.length).toBe(n);
    // the index now matches another Deezer track: refetch
    const moved = await fillSong({ ...WANT, deezerId: "7" }, r.record, ["deezer"], { fetch: f }, { now });
    expect(moved.results.length).toBe(1);
  });
  it("a token source without its token says so and fetches nothing", async () => {
    const { f, calls } = fakeFetch(routes);
    expect((await lookup("discogs", WANT, { fetch: f })).error).toMatch(/token/);
    expect((await lookup("spotify", WANT, { fetch: f })).error).toMatch(/Spotify/);
    expect(calls).toEqual([]);
  });
  it("an upstream failure is reported, never thrown", async () => {
    const r = await lookup("deezer", WANT, {
      fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    });
    expect(r.error).toMatch(/503/);
  });
});
