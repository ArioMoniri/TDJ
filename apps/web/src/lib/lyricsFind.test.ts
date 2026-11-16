import { describe, expect, it } from "vitest";
import {
  bestLyrics,
  type LrclibRecord,
  lrclibLadder,
  lrclibRecords,
  pastedLyrics,
  pickWork,
  titleKey,
} from "./lyrics";
import { lrclibCandidates } from "./lyricsSources";

/**
 * 2026-11 (the owner: "this should work automatically and find and match") — the LRCLIB ladder and the match by
 * WORK: tango lyrics rarely change between recordings, so another recording's words serve (plain), and its stamps
 * only when its length is this side's.
 */
const side = {
  id: "s1",
  title: "Malena",
  orchestra: "Aníbal Troilo",
  singer: "Francisco Fiorentino",
  durationSec: 182,
  altTitles: ["Malena (tango)"],
};
const rec = (o: Partial<LrclibRecord>): LrclibRecord => ({
  id: 1,
  trackName: "Malena",
  artistName: "Julio Sosa",
  duration: 200,
  ...o,
});
const LRC = "[00:01.00] Malena canta el tango\n[00:05.00] como ninguna";

describe("titleKey: the work's title as LRCLIB spells it", () => {
  it("folds accents, case and a remaster gloss", () => {
    expect(titleKey("MALENA - Remastered 2004")).toBe(titleKey("Malena"));
    expect(titleKey("Malena (Remasterizado)")).toBe(titleKey("Malena"));
    expect(titleKey("Canción desesperada")).toBe(titleKey("cancion desesperada"));
  });
});

describe("the ladder", () => {
  it("exact get, the side searches, title + singer, then the title alone and each alternative title", () => {
    const l = lrclibLadder(side);
    expect(l.map((x) => x.kind)).toEqual(["get", "side", "side", "side", "work", "work"]);
    expect(l[0]!.url).toContain("/api/get?");
    expect(l[0]!.url).toContain("duration=182");
    expect(decodeURIComponent(l[3]!.url).replace(/\+/g, " ")).toContain("q=Malena Francisco Fiorentino");
    expect(decodeURIComponent(l[5]!.url).replace(/\+/g, " ")).toContain("Malena (tango)");
  });
  it("collects every rung's answers (an exact get's single record, a 404) and stops at this side's synced lyrics", async () => {
    const asked: string[] = [];
    const f = (async (u: string) => {
      asked.push(u);
      if (u.includes("/api/get")) return new Response("", { status: 404 });
      if (u.includes("track_name=Malena&artist_name=troilo"))
        return Response.json([rec({ id: 9, artistName: "Aníbal Troilo", duration: 182, syncedLyrics: LRC })]);
      return Response.json([]);
    }) as typeof fetch;
    const r = await lrclibRecords(side, f);
    expect(r.answered).toBe(true);
    expect(r.all.map((x) => x.id)).toEqual([9]);
    expect(asked).toHaveLength(2);
  });
});

describe("match by work", () => {
  it("another recording's synced stamps only when its length is this side's (±3 s)", () => {
    expect(pickWork([rec({ syncedLyrics: LRC, duration: 184 })], side)?.synced).toBe(true);
    expect(pickWork([rec({ syncedLyrics: LRC, duration: 200 })], side)?.synced).toBe(false);
    expect(pickWork([rec({ trackName: "Sur", plainLyrics: "x" })], side)).toBeNull();
    expect(pickWork([rec({ instrumental: true, plainLyrics: "x" })], side)).toBeNull();
    // an alternative title matches too
    expect(pickWork([rec({ trackName: "Malena (Tango)", plainLyrics: "x" })], side)).not.toBeNull();
  });
  it("best: this side's synced, else the work's synced (same length), else any words — plain from a synced text", () => {
    const own = rec({ id: 2, artistName: "Troilo", duration: 182, plainLyrics: "own" });
    const workSynced = rec({ id: 3, duration: 181, syncedLyrics: LRC });
    const workLong = rec({ id: 4, duration: 230, syncedLyrics: LRC });
    expect(bestLyrics([own, workSynced], side)).toMatchObject({
      state: "synced",
      match: { id: 3, kind: "work" },
    });
    expect(bestLyrics([own, workLong], side)).toMatchObject({
      state: "plain",
      plain: "own",
      match: { kind: "side" },
    });
    const w = bestLyrics([workLong], side);
    expect(w).toMatchObject({ state: "plain", match: { id: 4, kind: "work" } });
    expect(w.plain).toBe("Malena canta el tango\ncomo ninguna");
    expect(bestLyrics([], side).state).toBe("none");
  });
  it("candidates: this recording first, then the work's, synced before plain", () => {
    const c = lrclibCandidates(
      [
        rec({ id: 5, plainLyrics: "x" }),
        rec({ id: 6, duration: 183, syncedLyrics: LRC }),
        rec({ id: 7, artistName: "Troilo", duration: 182, plainLyrics: "own" }),
        rec({ id: 8, trackName: "Sur", plainLyrics: "no" }),
      ],
      side,
    );
    expect(c.map((x) => x.key)).toEqual(["lrclib:7", "lrclib:6", "lrclib:5"]);
    expect(c[0]!.fit).toBe("side");
    expect(c[1]!.lyrics?.state).toBe("synced");
  });
});

describe("the DJ's paste", () => {
  it("LRC stamps make it synced; plain text stays plain; nothing is nothing", () => {
    expect(pastedLyrics(LRC)).toMatchObject({ state: "synced", source: "paste" });
    expect(pastedLyrics("Malena canta el tango").state).toBe("plain");
    expect(pastedLyrics("   ").state).toBe("none");
  });
});
