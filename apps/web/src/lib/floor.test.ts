import { describe, expect, it } from "vitest";
import {
  type BoothLite,
  beatPhase,
  beatSource,
  cleanFloor,
  floorOf,
  floorPosition,
  floorRemaining,
  floorStage,
  tapTempo,
} from "./floor";

/**
 * 2026-11 — the dancers' Floor screen and the Now playing view: the side's place in its tanda and the join-the-floor
 * stage, a cortina's countdown and the next tanda, La Cumparsita; the beat (measured, else estimated) and tap tempo.
 */
const item = (n: number, kind: "track" | "cortina" | "closing" | "break", tanda: number, o = {}) => ({
  n,
  kind,
  tanda,
  id: `i${n}`,
  title: `T${n}`,
  artist: kind === "cortina" ? "Cortina band" : "Di Sarli",
  rhythm: kind === "cortina" ? "cortina" : tanda === 2 ? "vals" : "tango",
  lengthSec: kind === "cortina" ? 45 : 180,
  ...o,
});
const plan = {
  items: [
    item(1, "closing", 0),
    item(2, "track", 1),
    item(3, "track", 1),
    item(4, "track", 1),
    item(5, "track", 1),
    item(6, "cortina", 1),
    item(7, "track", 2),
    item(8, "track", 2),
    item(9, "track", 2),
    item(10, "closing", 3),
  ],
};
const booth = (planIndex: number, o: Partial<BoothLite> = {}): BoothLite => ({
  plan,
  planIndex,
  playlist: {
    tandas: [
      { orchestra: "Carlos Di Sarli", rhythm: "tango", singer: "Roberto Rufino" },
      { orchestra: "Francisco Canaro", rhythm: "vals", singer: null },
    ],
  },
  entities: plan.items.map((x) => ({
    id: x.id,
    orchestra: "Carlos Di Sarli",
    singer: "Roberto Rufino",
    year: 1941,
  })),
  state: "playing",
  started: true,
  position: 30,
  ...o,
});

describe("floorStage: when to join the floor", () => {
  it("a tanda of four: invite, a good time to start, still fine, the last song", () => {
    expect([0, 1, 2, 3].map((k) => floorStage(k, 4))).toEqual(["invite", "start", "fine", "last"]);
  });
  it("a tanda of three (vals, milonga): invite, start, last", () => {
    expect([0, 1, 2].map((k) => floorStage(k, 3))).toEqual(["invite", "start", "last"]);
    expect(floorStage(-1, 4)).toBeNull();
  });
});

describe("floorOf: the Booth's plan and clock as the screen's state", () => {
  it("song 2 of 4 of tanda 1, the next tanda named", () => {
    const f = floorOf(booth(2), 1000);
    expect(f).toMatchObject({
      kind: "song",
      k: 1,
      n: 4,
      tanda: 1,
      tandas: 2,
      stage: "start",
      orchestra: "Carlos Di Sarli",
      singer: "Roberto Rufino",
      year: 1941,
      playing: true,
      positionSec: 30,
      at: 1000,
    });
    expect(f.next).toEqual({ orchestra: "Francisco Canaro", rhythm: "vals", singer: null });
  });
  it("a cortina: change partners, the next tanda, its countdown", () => {
    const f = floorOf(booth(5, { position: 15, state: "cortina" }), 0);
    expect(f.kind).toBe("cortina");
    expect(f.next?.orchestra).toBe("Francisco Canaro");
    expect(floorRemaining(f, 5000)).toBe(25);
  });
  it("the vals tanda's last song; La Cumparsita at the end; the opening; before the night", () => {
    expect(floorOf(booth(8)).stage).toBe("last");
    expect(floorOf(booth(9)).kind).toBe("closing");
    expect(floorOf(booth(0)).kind).toBe("opening");
    expect(floorOf(booth(2, { started: false, state: "idle" })).kind).toBe("idle");
  });
  it("paused: the position stays; playing: viewers carry it forward", () => {
    const p = floorOf(booth(2, { paused: true, state: "paused" }), 0);
    expect(floorPosition(p, 10_000)).toBe(30);
    const q = floorOf(booth(2), 0);
    expect(floorPosition(q, 2_500)).toBe(32.5);
  });
  it("another device's state is cleaned (unknown kinds dropped, bounded strings)", () => {
    const f = floorOf(booth(2), 0);
    expect(cleanFloor(JSON.parse(JSON.stringify(f)))).toEqual(f);
    expect(cleanFloor({ kind: "hack" })).toBeNull();
    expect(cleanFloor({ ...f, title: "x".repeat(500) })!.title).toHaveLength(120);
  });
});

describe("the beat", () => {
  it("measured marks lock it; else the catalogue BPM from the music's start; else the rhythm's typical tempo", () => {
    expect(beatSource({ marks: { bpm: 118, downbeatSec: 0.6 }, bpm: 120, rhythm: "tango" })).toEqual({
      bpm: 118,
      downbeatSec: 0.6,
      locked: true,
      typical: false,
    });
    expect(beatSource({ bpm: 124, rhythm: "tango", headSec: 1.2 })).toMatchObject({
      bpm: 124,
      downbeatSec: 1.2,
      locked: false,
      typical: false,
    });
    expect(beatSource({ marks: { musicStartSec: 0.4 }, rhythm: "vals" })).toMatchObject({
      bpm: 180,
      downbeatSec: 0.4,
      typical: true,
    });
  });
  it("the phase: beat number in the bar (4/4, 3/4) and how long since it sounded", () => {
    expect(beatPhase(0.5, 120, 0.5, 4)).toMatchObject({ beat: 1, bar: 1 });
    expect(beatPhase(1.75, 120, 0.5, 4)).toMatchObject({ beat: 3, bar: 1 });
    expect(beatPhase(1.75, 120, 0.5, 4).since).toBeCloseTo(0.5);
    expect(beatPhase(2.0, 180, 0, 3)).toMatchObject({ beat: 1, bar: 3 });
  });
  it("tap tempo: the median of the taps' intervals, from four taps", () => {
    expect(tapTempo([0, 500, 1000])).toBeNull();
    expect(tapTempo([0, 500, 1000, 1500, 2010])).toBe(120);
    expect(tapTempo([0, 333, 667, 1000, 1333])).toBeCloseTo(180, 0);
  });
});
