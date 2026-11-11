import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Cortina, type Playlist, planBooth, type Song } from "@tdj/core";
import { describe, expect, it } from "vitest";
import {
  clipSummary,
  rehearsalClip,
  SAME_RECORDING_TOL_SEC,
  spotifyLengthSec,
  withSpotifyLengths,
} from "./clips";
import { planEntities } from "./plan";

const featured = JSON.parse(
  readFileSync(join(__dirname, "../../../public/featured/golden-double-peak.json"), "utf8"),
) as Playlist;

const song = (o: Partial<Song> = {}): Song => ({
  id: "s1",
  title: "Recuerdo Malevo",
  rhythm: "tango",
  orchestra: "Ricardo Tanturi",
  orchestraId: "ricardo-tanturi",
  singer: "Alberto Castillo",
  singerId: "alberto-castillo",
  vocal: true,
  year: 1941,
  era: "golden-peak",
  durationSec: 153,
  spotify: {
    uri: "spotify:track:4aeLSOzo18dWJO5ReQ2MPK",
    url: "https://open.spotify.com/track/4aeLSOzo18dWJO5ReQ2MPK",
    durationMs: 153000,
    matched: "Ricardo Tanturi, Alberto Castillo – Recuerdo Malevo",
  },
  ...o,
});
const deezer = (durationMs: number, o: Record<string, unknown> = {}) => ({
  provider: "deezer" as const,
  id: "1",
  title: "Recuerdo Malevo",
  artist: "Ricardo Tanturi",
  durationMs,
  previewUrl: "https://cdnt-preview.dzcdn.net/x.mp3",
  matchedAt: "2026-01-01T00:00:00Z",
  confidence: 1,
  ...o,
});

describe("round 18: the booth plays and times the checked Spotify recording", () => {
  it("a side's booth length is its Spotify recording's length", () => {
    expect(spotifyLengthSec(song())).toBe(153);
    expect(spotifyLengthSec(song({ spotify: null }))).toBeNull();
    // only a real track URI counts (a search URL or an album is not the checked recording)
    expect(spotifyLengthSec(song({ spotify: { uri: "spotify:album:x", durationMs: 100000 } }))).toBeNull();
  });

  it("withSpotifyLengths: every plan item of the featured night is as long as its Spotify recording", () => {
    const plan = planBooth(withSpotifyLengths(featured));
    const ents = planEntities(featured, plan);
    let checked = 0;
    plan.items.forEach((it, i) => {
      const e = ents[i];
      if (!e || it.kind === "cortina" || it.kind === "break") return;
      const sp = spotifyLengthSec(e);
      if (sp === null) return;
      checked++;
      expect(it.lengthSec, (e as Song).title).toBeCloseTo(sp, 2);
    });
    // every song of the night carries a checked Spotify match
    expect(checked).toBe(plan.items.filter((x) => x.kind === "track" || x.kind === "closing").length);
    // Pensalo Bien: the catalogue keeps Deezer's 150 s side length, the booth plays Spotify's 136.92 s transfer
    const pb = plan.items.find((_, i) => (ents[i] as Song | null)?.title === "Pensalo Bien")!;
    expect(pb.lengthSec).toBeCloseTo(136.92, 2);
    // the set itself is not changed (the catalogue's side length stays for the musical rules)
    expect(featured.tandas[9]!.songs[0]!.durationSec).toBe(150);
  });

  it("planEntities includes the closing La Cumparsita (it printed as '?' with no source)", () => {
    const plan = planBooth(featured);
    const ents = planEntities(featured, plan);
    expect(ents.at(-1)).not.toBeNull();
    expect((ents.at(-1) as Song).title).toBe("La Cumparsita");
    expect(ents.every((e, i) => e !== null || plan.items[i]!.kind === "break")).toBe(true);
  });

  it("a Deezer clip rehearses a side only when it is the same recording as the Spotify match", () => {
    // within the tolerance and passing the shared match rules: the Deezer clip
    expect(rehearsalClip(song({ resolved: deezer(155000) })).clip?.from).toBe("deezer");
    // 168 s against Spotify's 153 s: another transfer or take, so no clip rather than a different recording
    const v = rehearsalClip(song({ resolved: deezer(168000) }));
    expect(v.clip).toBeNull();
    expect(v.why).toMatch(/168 s.*153 s/);
    // the tolerance is the match rules' own "this is the side" length band
    expect(SAME_RECORDING_TOL_SEC).toBe(6);
    expect(rehearsalClip(song({ resolved: deezer(159000) })).clip?.from).toBe("deezer");
    expect(rehearsalClip(song({ resolved: deezer(159500) })).clip).toBeNull();
    // the same length but another orchestra's record: rejected by matchProblem
    const other = rehearsalClip(song({ resolved: deezer(153000, { artist: "Juan D'Arienzo" }) }));
    expect(other.clip).toBeNull();
    expect(other.why).toMatch(/orchestra|credit/);
    // no Deezer match at all
    expect(rehearsalClip(song({ resolved: null })).why).toMatch(/no clip of the Spotify recording/);
  });

  it("a Spotify 30 s preview of the checked recording wins over any Deezer clip", () => {
    const sp = {
      ...song().spotify!,
      previewUrl: "https://p.scdn.co/mp3-preview/9097aeefa401b4760f92537a715d192af69daabc",
    };
    const c = rehearsalClip(song({ spotify: sp, resolved: deezer(168000) })).clip;
    expect(c).toEqual({ from: "spotify", url: sp.previewUrl });
    // never an invented or foreign URL
    const bad = { ...sp, previewUrl: "https://example.com/clip.mp3" };
    expect(rehearsalClip(song({ spotify: bad, resolved: null })).clip).toBeNull();
  });

  it("a cortina's Deezer clip is judged by the cortina rules and the same length band", () => {
    const cue: Cortina = {
      id: "c1",
      title: "Ben Sana Vurgunum",
      artist: "Erol Evgin",
      genre: "turkish-pop",
      culture: "turkish",
      energy: 50,
      spotify: { uri: "spotify:track:x", durationMs: 270851 },
      resolved: deezer(264000, { title: "Ben Sana Vurgunum", artist: "Erol Evgin" }),
    };
    expect(rehearsalClip(cue).clip).toBeNull();
    expect(rehearsalClip({ ...cue, resolved: { ...cue.resolved!, durationMs: 270000 } }).clip?.from).toBe(
      "deezer",
    );
    // no Spotify record: the Deezer record is the cue's only recording and rehearses
    expect(rehearsalClip({ ...cue, spotify: null }).clip?.from).toBe("deezer");
  });

  it("the featured night: every rehearsal clip is the Spotify recording; the rest are counted with a reason", () => {
    const plan = planBooth(featured);
    const ents = planEntities(featured, plan);
    const s = clipSummary(ents);
    expect(s.spotify + s.deezer + s.none.length).toBe(ents.filter(Boolean).length);
    for (const n of s.none) expect(n.why.length).toBeGreaterThan(0);
    ents.forEach((e) => {
      const v = rehearsalClip(e);
      if (v.clip?.from !== "deezer" || !e?.spotify?.durationMs) return;
      const dz = (e.resolved?.durationMs ?? 0) / 1000;
      expect(Math.abs(dz - e.spotify.durationMs / 1000)).toBeLessThanOrEqual(SAME_RECORDING_TOL_SEC);
    });
  });
});
