import { describe, expect, it } from "vitest";
import { parseLrc } from "./lyrics";
import {
  activeLine,
  type BoothSnap,
  type BoothTapState,
  CLIP_MAX_SEC,
  lineStartSec,
  lyricTapRoute,
  nudgeOffset,
  type PlayerSnap,
  type Playing,
  pickPlaying,
  roomSeekSec,
} from "./lyricsSync";

/**
 * 2026-11 — synced lyrics everywhere (the owner: "lyrics are not matched with the playing song in real time … jump the
 * song from the lyrics by clicking a lyric … from Compose, Booth, Database and Library"): one source of "what plays and
 * where", the active line (shift, cue in, cut head silence, seek), and what a tap on a line does by the Booth's rules.
 */

const LINES = parseLrc(
  "[00:00.50] Uno\n[00:02.00] Dos\n[00:04.00] Tres\n[00:10.00] Cuatro\n[00:12.50] Cinco\n[01:30.00] Seis",
);

const player = (o: Partial<PlayerSnap> = {}): PlayerSnap => ({
  trackId: "s1",
  kind: "file",
  playing: true,
  position: 10,
  duration: 180,
  sinceMs: 0,
  ...o,
});
const booth = (o: Partial<BoothSnap> = {}): BoothSnap => ({ pos: null, clip: false, ...o });

describe("pickPlaying: one source for what plays and where", () => {
  it("the Booth's room wins over the mini player (its engine clock, the recording's second)", () => {
    const p = pickPlaying("s1", booth({ pos: { sec: 42.5, playing: true, where: "room" } }), player());
    expect(p).toEqual({ source: "booth", playing: true, positionSec: 42.5, synced: true });
  });
  it("a Booth pre-listen of the file is the cue's clock", () => {
    expect(pickPlaying("s1", booth({ pos: { sec: 3, playing: false, where: "cue" } }), null)).toMatchObject({
      source: "cue",
      playing: false,
      positionSec: 3,
      synced: true,
    });
  });
  it("the room's 30 s clip of this side is not the recording's timeline", () => {
    expect(pickPlaying("s1", booth({ clip: true }), player())).toMatchObject({
      source: "booth",
      synced: false,
    });
  });
  it("else the mini player, when it plays this side", () => {
    expect(pickPlaying("s1", booth(), player({ position: 20 }))).toEqual({
      source: "player",
      playing: true,
      positionSec: 20,
      synced: true,
    });
    expect(pickPlaying("s1", null, player({ trackId: "other" }))).toBeNull();
    expect(pickPlaying("s1", null, player({ trackId: null, kind: null }))).toBeNull();
    expect(pickPlaying("s1", null, null)).toBeNull();
  });
  it("the player's last report is carried forward while it plays (smooth between ticks), not while paused", () => {
    expect(pickPlaying("s1", null, player({ position: 20, sinceMs: 300 }))!.positionSec).toBeCloseTo(20.3);
    // at most 1.5 s (a stalled element does not run away)
    expect(pickPlaying("s1", null, player({ position: 20, sinceMs: 9000 }))!.positionSec).toBeCloseTo(21.5);
    expect(pickPlaying("s1", null, player({ position: 20, sinceMs: 300, playing: false }))!.positionSec).toBe(
      20,
    );
    // never past the end
    expect(
      pickPlaying("s1", null, player({ position: 179.9, sinceMs: 1000, duration: 180 }))!.positionSec,
    ).toBe(180);
  });
  it("a 30 s preview is a clip (not synced); a full-length preview, a file or a Spotify full track is", () => {
    expect(pickPlaying("s1", null, player({ kind: "preview", duration: 30 }))!.synced).toBe(false);
    expect(pickPlaying("s1", null, player({ kind: "preview", duration: 0 }))!.synced).toBe(false);
    expect(pickPlaying("s1", null, player({ kind: "preview", duration: CLIP_MAX_SEC + 80 }))!.synced).toBe(
      true,
    );
    expect(pickPlaying("s1", null, player({ kind: "spotify-full" }))!.synced).toBe(true);
    expect(pickPlaying("s1", null, player({ kind: "spotify" }))!.synced).toBe(false);
  });
});

describe("activeLine: the line sounding at the recording's second", () => {
  it("−1 before the first line, then the last line started", () => {
    expect(activeLine(LINES, 0.2)).toBe(-1);
    expect(activeLine(LINES, 0.5)).toBe(0);
    expect(activeLine(LINES, 3.9)).toBe(1);
    expect(activeLine(LINES, 11)).toBe(3);
    expect(activeLine(LINES, 600)).toBe(5);
  });
  it("the DJ's shift: +0.5 s shows each line half a second later, −0.5 s earlier", () => {
    expect(activeLine(LINES, 2.2, 0.5)).toBe(0);
    expect(activeLine(LINES, 2.5, 0.5)).toBe(1);
    expect(activeLine(LINES, 1.6, -0.5)).toBe(1);
  });
  it("a tap on a line lands on that very line (the shift both ways, no float slip)", () => {
    for (const off of [0, 0.5, -0.5, 1.3, -2.7])
      LINES.forEach((l, i) => {
        if (l.at + off >= 0) expect(activeLine(LINES, lineStartSec(l, off), off)).toBe(i);
      });
    // a line the shift puts before the recording starts it from 0:00
    expect(lineStartSec({ at: 0.5 }, -2)).toBe(0);
  });
  it("seek: the line follows the second wherever it jumps (forward, back, past the end)", () => {
    const seq = [0, 12.6, 2.1, 95, 4].map((s) => activeLine(LINES, s));
    expect(seq).toEqual([-1, 4, 1, 5, 2]);
  });
});

describe("roomSeekSec: the room's item clock starts at its cue in / cut head silence", () => {
  it("the recording's second less the item's start", () => {
    expect(roomSeekSec(42, 2.5)).toBe(39.5);
    expect(roomSeekSec(42, 0)).toBe(42);
  });
  it("a line inside the cut head plays from the item's start; never past its end", () => {
    expect(roomSeekSec(1, 2.5)).toBe(0);
    expect(roomSeekSec(400, 2, 180)).toBe(179.5);
  });
  it("a cut head and the lyrics agree: the Booth's clock (start + item second) maps back to the same line", () => {
    const start = 3.2; // the side's head silence cut
    const line = LINES[4]!;
    const item = roomSeekSec(lineStartSec(line), start);
    expect(activeLine(LINES, start + item)).toBe(4);
  });
});

describe("lyricTapRoute: a tap on a line, by the Booth's rules", () => {
  const playing = (o: Partial<Playing>): Playing => ({
    source: "player",
    playing: true,
    positionSec: 0,
    synced: true,
    ...o,
  });
  const b = (o: Partial<BoothTapState> = {}): BoothTapState => ({
    here: false,
    started: false,
    row: -1,
    cueBlocked: null,
    ...o,
  });
  it("the side that plays seeks there: the room, a pre-listen, the mini player", () => {
    expect(lyricTapRoute(playing({ source: "booth" }), b({ started: true, here: true })).kind).toBe(
      "seek-room",
    );
    expect(lyricTapRoute(playing({ source: "cue" }), b({ started: true })).kind).toBe("seek-cue");
    expect(lyricTapRoute(playing({ source: "player", playing: false }), null).kind).toBe("seek-player");
  });
  it("a clip has no line to jump to", () => {
    expect(lyricTapRoute(playing({ synced: false }), null).kind).toBe("clip");
  });
  it("not playing, no night: the mini player starts it at the line (Compose, Library, Database …)", () => {
    expect(lyricTapRoute(null, null)).toEqual({ kind: "player" });
    expect(lyricTapRoute(null, b({ here: false }))).toEqual({ kind: "player" });
  });
  it("the Booth before the night: a pre-listen from the line (the headphones, else this device: the room)", () => {
    expect(lyricTapRoute(null, b({ here: true, row: 4 }))).toEqual({ kind: "prelisten", row: 4 });
    expect(lyricTapRoute(null, b({ here: true, cueBlocked: "no headphones" }))).toEqual({
      kind: "prelisten",
      row: null,
    });
  });
  it("mid-night with headphones: a pre-listen (the Booth's page) or the mini player's headphones (other tabs)", () => {
    expect(lyricTapRoute(null, b({ started: true, here: true, row: 7 }))).toEqual({
      kind: "prelisten",
      row: 7,
    });
    expect(lyricTapRoute(null, b({ started: true, here: false, row: 7 }))).toEqual({ kind: "player" });
  });
  it("mid-night without headphones: tonight's row asks to confirm the room; anything else never reaches it", () => {
    expect(lyricTapRoute(null, b({ started: true, here: true, row: 7, cueBlocked: "pick" }))).toEqual({
      kind: "confirm-room",
      row: 7,
    });
    expect(lyricTapRoute(null, b({ started: true, row: -1, cueBlocked: "pick" }))).toEqual({
      kind: "blocked",
      why: "pick",
    });
  });
});

describe("nudgeOffset: ±0.5 s per side", () => {
  it("steps by tenths, bounded", () => {
    expect(nudgeOffset(0, 0.5)).toBe(0.5);
    expect(nudgeOffset(0.5, -0.5)).toBe(0);
    expect(nudgeOffset(-0.3, -0.5)).toBe(-0.8);
    expect(nudgeOffset(29.8, 0.5)).toBe(30);
  });
});
