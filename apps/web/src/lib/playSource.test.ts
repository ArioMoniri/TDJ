import { describe, expect, it } from "vitest";
import { fmtLen, nightTotal, sidePlaySec, tandaTotal, totalText } from "./lengths";
import {
  isSpotifyTrackUri,
  noAudioAction,
  noAudioWhy,
  pickSource,
  playableStart,
  routeFor,
  STREAMING_SCOPES,
  spotifyPlayOf,
  stepIndex,
} from "./playSource";
import { moveItem } from "./reorder";

const URI = "spotify:track:4uLU6hMCjMI75M1A2tKUQC";

describe("tap to play: the source order", () => {
  it("Spotify Premium plays the full track when the side has a checked Spotify id", () => {
    expect(pickSource({ premium: true, spotifyUri: URI, previewRef: "/api/preview?x" })).toEqual({
      kind: "spotify-full",
      uri: URI,
    });
  });
  it("otherwise the 30 s preview, then the DJ's own file", () => {
    expect(pickSource({ premium: false, spotifyUri: URI, previewRef: "/p", file: true })).toEqual({
      kind: "preview",
      ref: "/p",
    });
    // Premium not known yet: never assumed
    expect(pickSource({ premium: null, spotifyUri: URI, previewRef: "/p" })?.kind).toBe("preview");
    expect(pickSource({ premium: true, spotifyUri: null, previewRef: null, file: true })).toEqual({
      kind: "file",
    });
    expect(pickSource({ premium: false, previewRef: null, file: true })).toEqual({ kind: "file" });
  });
  it("Premium with a bad Spotify id falls through to the preview", () => {
    expect(isSpotifyTrackUri("spotify:track:old")).toBe(false);
    expect(pickSource({ premium: true, spotifyUri: "spotify:track:old", previewRef: "/p" })?.kind).toBe(
      "preview",
    );
  });
  it("nothing playable → null, and the reason fits the account", () => {
    expect(pickSource({ premium: false })).toBeNull();
    expect(noAudioWhy({ connected: true, premium: false, spotifyUri: URI })).toBe("no_audio_premium");
    expect(noAudioWhy({ connected: false, premium: null, spotifyUri: URI })).toBe("no_audio_connect");
    // 2026-11 (the owner has Premium): a side with no Spotify recording and no preview is "not matched yet",
    // never "no Spotify Premium"
    expect(noAudioWhy({ connected: false, premium: null, spotifyUri: null })).toBe("no_audio_unmatched");
    expect(noAudioWhy({ connected: true, premium: true, spotifyUri: null })).toBe("no_audio_unmatched");
    expect(noAudioWhy({ connected: true, premium: null, spotify: "reconnect", spotifyUri: URI })).toBe(
      "no_audio_reconnect",
    );
    expect(noAudioAction("no_audio_connect")).toBe("connect");
    expect(noAudioAction("no_audio_reconnect")).toBe("reconnect");
    expect(noAudioAction("no_audio_unmatched")).toBe("find");
  });
  it("Premium is read like the Booth: product, then the playback scopes; no product is tried, not refused", () => {
    expect(spotifyPlayOf(null)).toBe("signed-out");
    expect(spotifyPlayOf({ user: null })).toBe("signed-out");
    expect(spotifyPlayOf({ user: { product: "premium" }, scopes: [...STREAMING_SCOPES] })).toBe("premium");
    expect(spotifyPlayOf({ user: { product: "free" } })).toBe("free");
    expect(spotifyPlayOf({ user: { product: "open" } })).toBe("free");
    // the profile came back without `product` (no user-read-private, a Dev Mode app): Premium is tried
    expect(spotifyPlayOf({ user: {} })).toBe("premium");
    // an older consent without the playback scopes: reconnect, whatever the product
    expect(spotifyPlayOf({ user: { product: "premium" }, scopes: ["user-read-email"] })).toBe("reconnect");
  });
  it("a night running in the Booth sends a tap to the headphones, never the room", () => {
    expect(routeFor(null)).toBe("player");
    expect(routeFor({ started: false })).toBe("player");
    expect(routeFor({ started: true })).toBe("headphones");
  });
  it("a cortina's chorus start is honoured where the clip holds it, else the clip plays from its start", () => {
    expect(playableStart(42, 200)).toBe(42); // a full track
    expect(playableStart(42, 30)).toBe(0); // a 30 s excerpt
    expect(playableStart(26, 30)).toBe(0); // too close to the end to play a cortina
    expect(playableStart(20, 30)).toBe(20);
    expect(playableStart(42, null)).toBe(42); // not known yet: ask for it
    expect(playableStart(0, 30)).toBe(0);
  });
  it("previous / next stay inside the list", () => {
    expect(stepIndex(4, 1, 1)).toBe(2);
    expect(stepIndex(4, 3, 1)).toBeNull();
    expect(stepIndex(4, 0, -1)).toBeNull();
  });
});

describe("lengths: songs, tandas and the night", () => {
  it("m:ss, h:mm:ss, and –:– for an unknown length", () => {
    expect(fmtLen(142)).toBe("2:22");
    expect(fmtLen(59.6)).toBe("1:00");
    expect(fmtLen(4 * 3600 + 65)).toBe("4:01:05");
    expect(fmtLen(null)).toBe("–:–");
    expect(fmtLen(0)).toBe("–:–");
  });
  it("a side plays its cue window when the night has one", () => {
    expect(sidePlaySec(180, null)).toBe(180);
    expect(sidePlaySec(180, { inSec: 4 })).toBe(176);
    expect(sidePlaySec(180, { inSec: 4, outSec: 170 })).toBe(166);
    expect(sidePlaySec(180, { outSec: 400 })).toBe(180); // never past the recording
    expect(sidePlaySec(null, { outSec: 150 })).toBe(150);
    expect(sidePlaySec(null, null)).toBeNull();
  });
  it("a tanda's total: cues honoured, unknown lengths left out and marked ≈", () => {
    const songs = [
      { id: "a", durationSec: 142 },
      { id: "b", durationSec: 149 },
      { id: "c", durationSec: 144 },
      { id: "d", durationSec: 172 },
    ];
    expect(tandaTotal(songs)).toEqual({ sec: 607, approx: false, count: 4 });
    expect(totalText(tandaTotal(songs))).toBe("10:07");
    expect(tandaTotal(songs, { d: { inSec: 2, outSec: 162 } }).sec).toBe(595);
    const t = tandaTotal([...songs.slice(0, 3), { id: "x" }]);
    expect(t).toEqual({ sec: 435, approx: true, count: 4 });
    expect(totalText(t)).toBe("≈ 7:15");
  });
  it("the night: the opening, the tandas, each cortina as played, the closing", () => {
    const p = {
      opening: { id: "o", durationSec: 180 },
      closing: { id: "z", durationSec: 190 },
      tandas: [
        { songs: [{ id: "a", durationSec: 150 }], cortina: { id: "c1" } },
        { songs: [{ id: "b", durationSec: 160 }], cortina: { id: "c2" } },
      ],
    };
    const tot = nightTotal(p, { b: { inSec: 10 } }, (c) => (c.id === "c1" ? 45 : null));
    expect(tot.sec).toBe(180 + 150 + 45 + 150 + 190);
    expect(tot.approx).toBe(true);
  });
});

describe("reorder", () => {
  it("moves one item, splice semantics", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    const same = ["a", "b"];
    expect(moveItem(same, 1, 1)).toBe(same);
    expect(moveItem(same, 0, 5)).toBe(same);
  });
});
