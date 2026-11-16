import { afterEach, describe, expect, it } from "vitest";
import { pickPlaying } from "./lyricsSync";
import { usePlayer } from "./player";
import { boothSnapOf, planRowOf, playerSnap, playingPositionFn, readPlaying } from "./playingPosition";

/**
 * 2026-11 — the position hook's source selection against the Booth's store shape and the mini player's store: the
 * room's clock, a pre-listen, a clip, tonight's row of a side, and the mini player when no Booth is there.
 */

type View = Parameters<typeof boothSnapOf>[0];
const view = (o: Partial<View> = {}): View =>
  ({
    started: true,
    planIndex: 1,
    plan: {
      items: [
        { id: "a", kind: "song" },
        { id: "b", kind: "song" },
        { kind: "break" },
        { id: "c", kind: "cortina" },
      ],
    },
    entities: [{ id: "a" }, { id: "b" }, null, { id: "c" }],
    sources: ["file", "file", "file", "file"],
    audition: null,
    positionOf: () => null,
    ...o,
  }) as unknown as View;

afterEach(() => usePlayer.getState().close());

describe("boothSnapOf: the Booth's word on one side", () => {
  it("the room's clock (positionOf) when it plays the side", () => {
    const v = view({ positionOf: (id) => (id === "b" ? { sec: 61.2, playing: true, where: "room" } : null) });
    expect(boothSnapOf(v, "b")).toEqual({ pos: { sec: 61.2, playing: true, where: "room" }, clip: false });
    expect(boothSnapOf(v, "a")).toEqual({ pos: null, clip: false });
  });
  it("the room's item from a 30 s preview is a clip; so is a pre-listen of a clip — not of the file", () => {
    expect(boothSnapOf(view({ sources: ["file", "preview"] }), "b").clip).toBe(true);
    expect(boothSnapOf(view({ sources: ["file", "preview"], started: false }), "b").clip).toBe(false);
    const aud = (via: string) =>
      view({ audition: { i: 0, songId: "a", via, title: "A", where: "headphones" } as View["audition"] });
    expect(boothSnapOf(aud("clip"), "a").clip).toBe(true);
    expect(boothSnapOf(aud("file"), "a").clip).toBe(false);
  });
});

describe("planRowOf: tonight's row of a side", () => {
  it("by plan item or entity; −1 when not tonight's", () => {
    expect(planRowOf(view(), "b")).toBe(1);
    expect(planRowOf(view(), "c")).toBe(3);
    expect(planRowOf(view(), "zzz")).toBe(-1);
    expect(planRowOf({ plan: null, entities: [] } as unknown as View, "a")).toBe(-1);
  });
});

describe("the mini player's side (no Booth on this page)", () => {
  it("reads the player's track, source and second", () => {
    usePlayer.getState().play({
      id: "s9",
      title: "Malena",
      orchestra: "Troilo",
      source: { kind: "file", ref: "blob:x" },
    });
    usePlayer.getState()._tick(42, 180);
    const snap = playerSnap();
    expect(snap).toMatchObject({ trackId: "s9", kind: "file", playing: true, position: 42, duration: 180 });
    expect(pickPlaying("s9", null, { ...snap, sinceMs: 0 })).toEqual({
      source: "player",
      playing: true,
      positionSec: 42,
      synced: true,
    });
    // (node has no window: no Booth, the player alone)
    expect(readPlaying("s9")?.source).toBe("player");
    expect(readPlaying("other")).toBeNull();
    usePlayer.getState().pause();
    expect(playingPositionFn("s9")()).toEqual({ sec: 42, playing: false });
    expect(playingPositionFn("other")()).toBeNull();
  });
  it("a seek shows at once", () => {
    usePlayer
      .getState()
      .play({ id: "s9", title: "M", orchestra: "T", source: { kind: "file", ref: "blob:x" } });
    usePlayer.getState()._tick(10, 180);
    usePlayer.getState().pause();
    usePlayer.getState().seek(95.5);
    expect(readPlaying("s9")?.positionSec).toBe(95.5);
  });
});
