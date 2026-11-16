import { buildSongIndex, type Song, searchSongs } from "@tdj/core";
import { describe, expect, it } from "vitest";
import {
  completionsFor,
  correctionFor,
  eraOfFilters,
  groupWorks,
  mergeVersions,
  queryText,
  type ServiceAnswer,
  type ServiceTrack,
  sameRecording,
  serviceSong,
  titleComplete,
  withEra,
} from "./smartSearch";

/** a small catalogue: three versions of one work, a vals, a milonga, two orchestras with aliases */
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
const songs: Song[] = [
  S({
    id: "ds-1",
    title: "Bahía Blanca",
    orchestra: "Carlos Di Sarli",
    orchestraId: "carlos-di-sarli",
    year: 1957,
  }),
  S({
    id: "ds-2",
    title: "Bahía Blanca",
    orchestra: "Carlos Di Sarli",
    orchestraId: "carlos-di-sarli",
    year: 1958,
    durationSec: 182,
    spotify: { uri: "spotify:track:ds2" },
  }),
  S({
    id: "pu-1",
    title: "Bahía Blanca",
    orchestra: "Osvaldo Pugliese",
    orchestraId: "osvaldo-pugliese",
    year: 1960,
  }),
  S({
    id: "ds-3",
    title: "Corazón",
    orchestra: "Carlos Di Sarli",
    orchestraId: "carlos-di-sarli",
    singer: "Roberto Rufino",
    year: 1939,
    durationSec: 160,
  }),
  S({
    id: "da-1",
    title: "Lágrimas y Sonrisas",
    orchestra: "Juan D'Arienzo",
    orchestraId: "juan-d-arienzo",
    rhythm: "vals",
  }),
  S({
    id: "ca-1",
    title: "Milonga Vieja Milonga",
    orchestra: "Francisco Canaro",
    orchestraId: "francisco-canaro",
    rhythm: "milonga",
  }),
];
const ix = buildSongIndex(songs, { popularity: () => 0 });
const page = (q: string) => ({ ...searchSongs(ix, q, { limit: 50 }), parsed: [] });
const ctx = {
  orchestras: [
    { id: "carlos-di-sarli", name: "Carlos Di Sarli" },
    { id: "osvaldo-pugliese", name: "Osvaldo Pugliese" },
    { id: "juan-d-arienzo", name: "Juan D'Arienzo" },
    { id: "francisco-canaro", name: "Francisco Canaro" },
  ],
};
const track = (o: Partial<ServiceTrack>): ServiceTrack => ({
  service: "spotify",
  id: "x",
  uri: "spotify:track:x",
  title: "Bahía Blanca",
  artists: ["Carlos Di Sarli y su Orquesta Típica"],
  year: 1995,
  durationSec: 171,
  ...o,
});
const answer = (tracks: ServiceTrack[]): ServiceAnswer[] => [{ id: "spotify", state: "ok", tracks }];

describe("completions and the correction", () => {
  it("completes a title the words start, accent-blind, keeping the inline filters", () => {
    const c = completionsFor("50s bahia bl", page("50s bahia bl"));
    expect(c[0]).toMatchObject({ kind: "title", label: "Bahía Blanca", query: "Bahía Blanca 50s" });
  });
  it('completes an orchestra from the last words ("di sar" → Carlos Di Sarli)', () => {
    const c = completionsFor("di sar", page("di sar"));
    expect(c.some((x) => x.kind === "orchestra" && x.label === "Carlos Di Sarli")).toBe(true);
  });
  it("offers nothing once the words are a whole title (the versions view takes over)", () => {
    expect(completionsFor("bahia blanca", page("bahia blanca"))).toEqual([]);
    expect(titleComplete("bahia blanca", page("bahia blanca").items)).toBe(true);
    expect(titleComplete("bahia", page("bahia").items)).toBe(false);
  });
  it("says what a misspelt word was taken for, and offers a spelling when nothing matched", () => {
    const close = page("bahia blamca");
    expect(close.total).toBeGreaterThan(0);
    expect(correctionFor("bahia blamca", close)).toEqual({ query: "bahia Blanca", kind: "close" });
    const none = correctionFor("zzz", { total: 0, suggestion: "corazon" });
    expect(none).toEqual({ query: "corazon", kind: "none" });
    expect(correctionFor("corazon", page("corazon"))).toBeNull();
  });
  it("reads the words of a query without its filters", () => {
    expect(queryText("bahia blanca 50s instrumental")).toBe("bahia blanca");
  });
});

describe("services merged with the catalogue", () => {
  it("one row for the same recording (the same Spotify id), with both sources", () => {
    const v = mergeVersions(
      page("bahia blanca").items,
      answer([track({ uri: "spotify:track:ds2", id: "ds2" })]),
      ctx,
    );
    const row = v.find((x) => x.song.id === "ds-2")!;
    expect(row.sources).toEqual(["catalogue", "spotify"]);
    expect(v.filter((x) => x.song.id.startsWith("ext:"))).toHaveLength(0);
  });
  it("one row for the same work by the same orchestra with a matching length (a reissue's album year is late)", () => {
    const v = mergeVersions(page("bahia blanca").items, answer([track({})]), ctx);
    expect(v.find((x) => x.song.id === "ds-1")!.sources).toContain("spotify");
    expect(v).toHaveLength(3);
  });
  it("another recording is its own version: orchestra and singer read from the artists, rhythm from the work", () => {
    const t = track({
      id: "n1",
      uri: "spotify:track:n1",
      title: "Corazón",
      artists: ["Carlos Di Sarli", "Alberto Podestá"],
      durationSec: 150,
    });
    const v = mergeVersions(page("corazon").items, answer([t]), ctx);
    const ext = v.find((x) => x.song.id === "ext:spotify:n1")!;
    expect(ext.sources).toEqual(["spotify"]);
    expect(ext.song).toMatchObject({
      orchestraId: "carlos-di-sarli",
      singer: "Alberto Podestá",
      vocal: true,
      rhythm: "tango",
    });
    expect(ext.rhythmKnown).toBe(true);
    expect(ext.song.spotify?.uri).toBe("spotify:track:n1");
  });
  it("a rhythm chip drops a service's recording of another rhythm, and the title tells a vals when the catalogue cannot", () => {
    const vals = serviceSong(track({ title: "Vals de las Flores", artists: ["Unknown Band"] }), ctx);
    expect(vals.song.rhythm).toBe("vals");
    expect(vals.rhythmKnown).toBe(false);
    const v = mergeVersions(
      page("bahia blanca").items,
      answer([
        track({ id: "pu9", uri: "spotify:track:pu9", artists: ["Osvaldo Pugliese"], durationSec: 300 }),
      ]),
      ctx,
      { filters: { rhythms: ["vals"] } },
    );
    expect(v.some((x) => x.song.id === "ext:spotify:pu9")).toBe(false);
  });
  it("another singer's recording of the same work is not the catalogue's", () => {
    const s = songs.find((x) => x.id === "ds-3")!;
    expect(
      sameRecording(
        s,
        track({ title: "Corazón", artists: ["Carlos Di Sarli", "Roberto Rufino"], durationSec: 160 }),
        ctx,
      ),
    ).toBe(true);
    expect(
      sameRecording(
        s,
        track({ title: "Corazón", artists: ["Carlos Di Sarli", "Jorge Durán"], durationSec: 160 }),
        ctx,
      ),
    ).toBe(false);
  });
});

describe("versions grouped by work", () => {
  it("each work once, its catalogue versions before a service's", () => {
    const v = mergeVersions(
      page("bahia blanca").items,
      answer([track({ id: "z", uri: "spotify:track:z", artists: ["Some Cover Band"], durationSec: 200 })]),
      ctx,
    );
    const w = groupWorks(v);
    expect(w).toHaveLength(1);
    expect(w[0]!.title).toBe("Bahía Blanca");
    expect(w[0]!.versions).toHaveLength(4);
    expect(w[0]!.versions.at(-1)!.sources).toEqual(["spotify"]);
  });
});

describe("era chips", () => {
  it("map to year ranges and back", () => {
    const f = withEra({ rhythms: ["vals"] }, "golden");
    expect(f).toEqual({ rhythms: ["vals"], yearFrom: 1935, yearTo: 1955 });
    expect(eraOfFilters(f)).toBe("golden");
    expect(withEra(f, null)).toEqual({ rhythms: ["vals"] });
  });
});
