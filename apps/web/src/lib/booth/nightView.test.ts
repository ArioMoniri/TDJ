import { describe, expect, it } from "vitest";
import {
  cortinaSpan,
  cortinaSwapLabel,
  driftWords,
  lastFourChange,
  swapLabel,
  ttcCaption,
  upNext,
} from "./nightView";

// a night of three tandas of two tracks, each followed by its cortina, then the closing
const items = [
  { kind: "track", tanda: 1 },
  { kind: "track", tanda: 1 },
  { kind: "cortina", tanda: 1 },
  { kind: "track", tanda: 2 },
  { kind: "track", tanda: 2 },
  { kind: "cortina", tanda: 2 },
  { kind: "track", tanda: 3 },
  { kind: "track", tanda: 3 },
  { kind: "cortina", tanda: 3 },
  { kind: "closing", tanda: 4 },
];
const none = new Set<number>();

describe("Up next (wave 2: a skipped tanda is passed over)", () => {
  it("without skips: the next item, the next tanda and its cortina", () => {
    const u = upNext(items, 1, { passed: none, missing: none });
    expect(u.next).toBe(2);
    expect(u.noSource).toBe(false);
    expect(u.nextTanda).toBe(3);
    expect(u.nextTandaCortina).toBe(5);
  });
  it("tanda 2 skipped tonight: Up next and the next tanda move past it and its cortina", () => {
    const passed = new Set([3, 4, 5]);
    // on tanda 1's cortina: the next item is tanda 3's first track, not tanda 2
    const onCortina = upNext(items, 2, { passed, missing: none });
    expect(onCortina.next).toBe(6);
    // on tanda 1: the next tanda is tanda 3 with its own cortina
    const onTrack = upNext(items, 0, { passed, missing: none });
    expect(onTrack.nextTanda).toBe(6);
    expect(onTrack.nextTandaCortina).toBe(8);
  });
  it("an item without a source is passed over too; when nothing else is left it is shown and said", () => {
    const u = upNext(items, 1, { passed: none, missing: new Set([2]) });
    expect(u.next).toBe(3);
    const last = upNext(items, 8, { passed: none, missing: new Set([9]) });
    expect(last.next).toBe(9);
    expect(last.noSource).toBe(true);
    expect(upNext(items, 9, { passed: none, missing: none }).next).toBeNull();
  });
});

describe("plain words (wave 2: no shorthand)", () => {
  it("drift says ahead of / behind the plan", () => {
    expect(driftWords(-219)).toBe("3:39 ahead of plan");
    expect(driftWords(75)).toBe("1:15 behind plan");
    expect(driftWords(0.4)).toBe("on plan");
    expect(driftWords(-219)).not.toMatch(/[−-]/);
  });
  it("a cortina's span reads as words, never `in 0:00 · stop at 0:45`", () => {
    expect(cortinaSpan(0, 45)).toBe("plays its first 0:45");
    expect(cortinaSpan(12, 57)).toBe("plays 0:12 to 0:57 of the song");
    expect(cortinaSpan(0, 45)).not.toMatch(/\bin 0:00|stop at/);
  });
  it("time to La Cumparsita in a rehearsal says it counts 30 s clips, and the full night what it is", () => {
    const c = ttcCaption({ rehearsal: true, started: false });
    expect(c.label).toBe("Rehearsal to La Cumparsita");
    expect(c.explain).toMatch(/30 s/);
    expect(ttcCaption({ rehearsal: false, started: true }).label).toBe("Time to La Cumparsita");
  });
});

describe("Last 4 tandas tango only: the toast names the tandas (wave 2)", () => {
  const tandas = ["tango", "vals", "tango", "milonga", "tango", "vals", "tango"].map((rhythm) => ({
    rhythm,
  }));
  it("on: which tandas are skipped tonight", () => {
    expect(lastFourChange(new Set(), new Set([3, 5]), tandas)).toBe(
      "Skipping tanda 4 (milonga) and tanda 6 (vals) tonight: the night ends on tangos",
    );
  });
  it("off: which tandas play again", () => {
    expect(lastFourChange(new Set([5]), new Set(), tandas)).toBe("Tanda 6 (vals) plays again tonight");
  });
  it("nothing to change: says so", () => {
    expect(lastFourChange(new Set(), new Set(), tandas)).toBe(
      "The last 4 tandas are already tangos: nothing changes",
    );
  });
});

describe("swap labels (wave 2: counted per tanda, cortinas named)", () => {
  it("Swap tanda N, song M", () => {
    expect(swapLabel(7, 2)).toBe("Swap tanda 7, song 2");
    expect(cortinaSwapLabel(7)).toBe("Cortina after tanda 7: fades and stop");
  });
});
