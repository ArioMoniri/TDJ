import { describe, expect, it } from "vitest";
import { verify } from "./exportVerify";
import { fakeSpotify, trackUris } from "./spotifyFake";
import { writeVerified } from "./spotifyWrite";

const opts = { wait: async () => {}, gapMs: 0 };
const writes = (f: ReturnType<typeof fakeSpotify>) => f.log.filter((l) => l.method !== "GET");

describe("verify (every export target)", () => {
  it("count, order, missing, extra and unavailable, duplicates counted", () => {
    expect(verify(["a", "b", "c"], ["a", "b", "c"]).ok).toBe(true);
    const r = verify(["a", "b", "c", "d"], ["a", "c", "b", "x"]);
    expect(r.ok).toBe(false);
    expect(r.missing.map((m) => m.key)).toEqual(["d"]);
    expect(r.extra).toEqual([{ at: 3, key: "x" }]);
    expect(r.outOfOrder).toEqual([1, 2]);
    // the same cortina twice is two rows: one copy missing is reported
    const d = verify(["c", "s", "c"], ["c", "s"]);
    expect(d.missing).toEqual([{ at: 2, key: "c" }]);
    // a relinked row stands for the row it was written as; an unplayable row is present but flagged
    const l = verify(
      ["a", "b"],
      [
        { key: "a2", linkedFrom: "a" },
        { key: "b", available: false },
      ],
    );
    expect(l.ok).toBe(true);
    expect(l.unavailable.map((u) => u.key)).toEqual(["b"]);
  });
});

describe("writeVerified (Spotify write + read-back)", () => {
  it("chunks of ≤ 100 in order: 100 rows is one PUT, 200 rows a PUT then one POST", async () => {
    for (const n of [100, 200]) {
      const f = fakeSpotify();
      const uris = trackUris(n);
      const r = await writeVerified(f.call, "pl", uris, { mode: "replace" }, opts);
      expect(writes(f).map((w) => [w.method, w.count])).toEqual(
        n === 100
          ? [["PUT", 100]]
          : [
              ["PUT", 100],
              ["POST", 100],
            ],
      );
      expect(f.playlists.get("pl")!.uris).toEqual(uris);
      expect(r.ok).toBe(true);
      expect(r.actual).toBe(n);
      expect(r.snapshotChanged).toBe(true);
    }
  });

  it("a new playlist gets every chunk as a POST, one after the other in running order (never in parallel)", async () => {
    const f = fakeSpotify();
    const uris = trackUris(250);
    const r = await writeVerified(f.call, "pl", uris, { mode: "new", before: "snap0" }, opts);
    expect(writes(f).map((w) => w.count)).toEqual([100, 100, 50]);
    expect(f.playlists.get("pl")!.uris).toEqual(uris);
    expect(r.ok && r.inPlace === 250).toBe(true);
  });

  it("a 429 on chunk 2 waits out its Retry-After and sends the chunk again", async () => {
    const f = fakeSpotify();
    f.rateLimitPosts.set(1, 3); // the first POST is chunk 2 of a replace
    const waited: number[] = [];
    const uris = trackUris(150);
    const r = await writeVerified(
      f.call,
      "pl",
      uris,
      { mode: "replace" },
      { ...opts, wait: async (ms) => void waited.push(ms) },
    );
    expect(waited).toContain(3000);
    expect(writes(f).map((w) => w.method)).toEqual(["PUT", "POST", "POST"]);
    expect(f.playlists.get("pl")!.uris).toEqual(uris);
    expect(r).toMatchObject({ ok: true, repairs: 0 });
  });

  it("a Retry-After past the request's budget is reported (with what Spotify holds), never swallowed", async () => {
    const f = fakeSpotify();
    f.rateLimitPosts.set(1, 60);
    const r = await writeVerified(
      f.call,
      "pl",
      trackUris(150),
      { mode: "replace" },
      { ...opts, deadline: Date.now() + 5000 },
    );
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBe(60);
    expect(r.error).toMatch(/429/);
  });

  it("the same cortina twice stays twice", async () => {
    const f = fakeSpotify();
    const uris = ["spotify:track:s1", "spotify:track:cue", "spotify:track:s2", "spotify:track:cue"];
    const r = await writeVerified(f.call, "pl", uris, { mode: "replace" }, opts);
    expect(f.playlists.get("pl")!.uris).toEqual(uris);
    expect(r.ok && r.actual === 4).toBe(true);
  });

  it("reads every page: 118 rows over 2 pages (100 + 18), a row lost at position 105 is flagged", async () => {
    const f = fakeSpotify();
    const uris = trackUris(118);
    f.playlists.set("pl", { uris: uris.filter((_, i) => i !== 105), snapshot: 1 });
    const r = await writeVerified(f.call, "pl", uris, { mode: "check" }, opts);
    expect(f.log.filter((l) => l.method === "GET" && l.path.includes("/items")).length).toBe(2);
    expect(r.actual).toBe(117);
    expect(r.missing.map((m) => m.at)).toEqual([105]);
    expect(writes(f)).toEqual([]); // the check writes nothing
    // the full list as Spotify holds it, for the sheet
    expect(r.rows).toHaveLength(117);
  });

  it("repairs a missing middle chunk: chunk 2 of 3 dropped, the playlist is rewritten and read back", async () => {
    const f = fakeSpotify();
    f.dropPosts.add(1);
    const uris = trackUris(250);
    const r = await writeVerified(f.call, "pl", uris, { mode: "replace" }, opts);
    expect(r).toMatchObject({ ok: true, repairs: 1, expected: 250, actual: 250 });
    expect(f.playlists.get("pl")!.uris).toEqual(uris);
  });

  it("a dropped last chunk is repaired by appending only the rest", async () => {
    const f = fakeSpotify();
    f.dropPosts.add(1);
    const uris = trackUris(118);
    const r = await writeVerified(f.call, "pl", uris, { mode: "replace" }, opts);
    expect(r.ok).toBe(true);
    expect(writes(f).map((w) => [w.method, w.count])).toEqual([
      ["PUT", 100],
      ["POST", 18],
      ["POST", 18],
    ]);
  });

  it("gives up after 2 repair rounds and says what is still wrong", async () => {
    const f = fakeSpotify();
    for (let i = 1; i < 10; i++) f.dropPosts.add(i);
    const r = await writeVerified(f.call, "pl", trackUris(150), { mode: "replace" }, opts);
    expect(r.ok).toBe(false);
    expect(r.repairs).toBe(2);
    expect(r.missing).toHaveLength(50);
    expect(r.missing[0]!.at).toBe(100);
  });

  it("an unplayable row in the listener's country is swapped in its own row: relinked, else searched", async () => {
    const f = fakeSpotify();
    const uris = trackUris(6);
    f.relink.set(uris[1]!, "spotify:track:relinked1");
    f.unplayable.add(uris[4]!);
    const asked: number[] = [];
    const r = await writeVerified(
      f.call,
      "pl",
      uris,
      {
        mode: "replace",
        market: "from_token",
        findPlayable: async (at) => {
          asked.push(at);
          return "spotify:track:other4";
        },
      },
      opts,
    );
    expect(asked).toEqual([4]);
    expect(r.replaced).toEqual([
      { at: 1, from: uris[1], to: "spotify:track:relinked1", how: "relinked" },
      { at: 4, from: uris[4], to: "spotify:track:other4", how: "search" },
    ]);
    const want = [...uris];
    want[1] = "spotify:track:relinked1";
    want[4] = "spotify:track:other4";
    expect(f.playlists.get("pl")!.uris).toEqual(want);
    expect(r.ok && r.unavailable.length === 0).toBe(true);
    expect(r.rows.every((x) => x.playable)).toBe(true);
  });

  it("without the track lookup the read-back finds the unplayable rows and the rewrite fixes them", async () => {
    const f = fakeSpotify();
    f.noLookup = true;
    const uris = trackUris(4);
    f.relink.set(uris[0]!, "spotify:track:r0");
    f.unplayable.add(uris[2]!);
    const r = await writeVerified(
      f.call,
      "pl",
      uris,
      { mode: "replace", market: "from_token", findPlayable: async () => "spotify:track:x2" },
      opts,
    );
    expect(f.playlists.get("pl")!.uris).toEqual(["spotify:track:r0", uris[1], "spotify:track:x2", uris[3]]);
    expect(r.ok).toBe(true);
    expect(r.repairs).toBe(1);
    expect(r.rows.every((x) => x.playable)).toBe(true);
  });

  it("an unplayable row with no other version stays and is listed as not available", async () => {
    const f = fakeSpotify();
    const uris = trackUris(3);
    f.unplayable.add(uris[1]!);
    const r = await writeVerified(
      f.call,
      "pl",
      uris,
      { mode: "replace", market: "from_token", findPlayable: async () => null },
      opts,
    );
    expect(r.ok).toBe(true);
    expect(r.replaced).toEqual([]);
    expect(r.unavailable.map((u) => u.at)).toEqual([1]);
  });
});
