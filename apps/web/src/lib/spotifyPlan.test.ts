import { describe, expect, it } from "vitest";
import { orderedRows, orderedUris, playlistIdFrom, spotifyPlanFor, standInCortinas } from "./spotifyPlan";

describe("playlistIdFrom", () => {
  it("reads a link, a share link with ?si=, a spotify: URI and a bare 22-character id", () => {
    expect(playlistIdFrom("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBe(
      "37i9dQZF1DXcBWIGoYBM5M",
    );
    expect(playlistIdFrom(" https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc ")).toBe(
      "37i9dQZF1DXcBWIGoYBM5M",
    );
    expect(playlistIdFrom("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBe("37i9dQZF1DXcBWIGoYBM5M");
    expect(playlistIdFrom("37i9dQZF1DXcBWIGoYBM5M")).toBe("37i9dQZF1DXcBWIGoYBM5M");
  });
  it("is null for anything that is not a playlist", () => {
    expect(playlistIdFrom("")).toBeNull();
    expect(playlistIdFrom("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toBeNull();
    expect(playlistIdFrom("hello")).toBeNull();
  });
});

describe("orderedUris", () => {
  it("puts a match back into its own row and drops rows never found", () => {
    const plan = {
      slots: [{ uri: "spotify:track:a" }, { id: "c1" }, { uri: "spotify:track:b" }, { id: "x" }],
    };
    expect(orderedUris(plan, new Map([["c1", "spotify:track:c"]]))).toEqual([
      "spotify:track:a",
      "spotify:track:c",
      "spotify:track:b",
    ]);
  });
});

describe("standInCortinas (round 19)", () => {
  const cue = (id: string, energy: number, uri: string | null, genre = "turkish-pop") => ({
    id,
    title: id,
    artist: "A",
    genre,
    culture: "turkish",
    energy,
    tags: [],
    spotify: uri ? { uri } : null,
  });
  it("a cortina Spotify could not match gets the nearest Spotify-ready cue of its family, in its own row", () => {
    const night = {
      tandas: [
        { cortina: cue("c1", 60, "spotify:track:c1") },
        { cortina: cue("c2", 70, null) },
        { cortina: cue("c3", 72, "spotify:track:c3") },
        { cortina: null },
      ],
    } as never;
    const pool = [cue("p1", 69, "spotify:track:p1"), cue("p2", 71, "spotify:track:p2", "swing")];
    const found = new Map<string, string>();
    const r = standInCortinas(night, ["c2"], found, pool);
    // c3 (e72) is a neighbour, p2 another family: p1 (e69, same family) stands in
    expect(found.get("c2")).toBe("spotify:track:p1");
    expect(r.missing).toEqual([]);
    expect(r.standIns).toEqual([{ id: "c2", cue: "c2 (A)", standIn: "p1 (A)", uri: "spotify:track:p1" }]);
    const plan = {
      slots: [
        { uri: "spotify:track:s1" },
        { uri: "spotify:track:c1" },
        { id: "c2" },
        { uri: "spotify:track:s2" },
      ],
    };
    expect(orderedUris(plan, found)).toEqual([
      "spotify:track:s1",
      "spotify:track:c1",
      "spotify:track:p1",
      "spotify:track:s2",
    ]);
    // a side (not a cortina) stays missing
    expect(standInCortinas(night, ["song9"], new Map(), pool).missing).toEqual(["song9"]);
  });
});

describe("a tanda the DJ pinned keeps the streams the DJ chose", () => {
  it("the featured night needs no Spotify search: every side has its stored stream", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const p = JSON.parse(
      readFileSync(join(__dirname, "../../public/featured/golden-double-peak.json"), "utf8"),
    );
    const plan = spotifyPlanFor(p, {} as never, { includeCortinas: true });
    expect(plan.items).toEqual([]);
  });
});

describe("orderedRows (the rows the Spotify export writes)", () => {
  const row = (id: string, kind: "track" | "cortina", uri?: string) => ({
    id,
    kind,
    tanda: 1,
    title: id,
    artist: "A",
    item: { id, title: id, orchestra: "A" },
    ...(uri ? { uri } : {}),
  });
  it("keeps the same cortina twice, fills a searched row by its id, and applies a country replacement", () => {
    const plan = {
      rows: [
        row("s1", "track", "spotify:track:s1"),
        row("c1", "cortina"),
        row("s2", "track", "spotify:track:s2"),
        row("c1", "cortina"),
        row("gone", "track"),
      ],
    };
    const got = orderedRows(plan, new Map([["c1", "spotify:track:cue"]]), {
      s2: { from: "spotify:track:s2", uri: "spotify:track:s2tr" },
    });
    expect(got.map((r) => r.uri)).toEqual([
      "spotify:track:s1",
      "spotify:track:cue",
      "spotify:track:s2tr",
      "spotify:track:cue",
    ]);
    // a replacement remembered for another URI is not applied
    expect(
      orderedRows(plan, new Map(), { s1: { from: "spotify:track:old", uri: "spotify:track:x" } })[0]!.uri,
    ).toBe("spotify:track:s1");
  });
  it("spotifyPlanFor gives every row of the running order, in slot order, with its tanda and song", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const p = JSON.parse(
      readFileSync(join(__dirname, "../../public/featured/golden-double-peak.json"), "utf8"),
    );
    const plan = spotifyPlanFor(p, {} as never, { includeCortinas: true });
    expect(plan.rows).toHaveLength(plan.slots.length);
    expect(plan.rows.map((r) => r.uri)).toEqual(plan.slots.map((s) => s.uri));
    expect(plan.rows.find((r) => r.kind === "track")!.song).toBe(1);
    expect(orderedRows(plan, new Map()).map((r) => r.uri)).toEqual(orderedUris(plan, new Map()));
  });
});
