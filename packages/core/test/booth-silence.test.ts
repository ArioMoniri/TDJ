/**
 * 2026-11 (the owner: "some songs play a lot of silent moments; those should be counted as the gap between songs"):
 * old tango transfers carry 1–6 s of silence at their head and tail. The booth's three silence modes:
 * - "gap" (default, recommended): the room hears exactly the configured gap — the outgoing tail plus the incoming
 *   head are subtracted from the inserted gap (never below 0); when they already exceed it, the outgoing tail is cut
 *   (the incoming head kept up to the gap); fades / blends / rises run from the last and first audible moments;
 * - "after": the gap starts after the music ends — the tail is trimmed, the incoming head is kept;
 * - "off": the files play to their edges, then the gap (as before).
 * The plan carries what it detected and what it cut, so the night clock and the exports read the same seconds.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  BOOTH_DEFAULTS,
  boothSettings,
  compose,
  estimateSilence,
  joinAfterTail,
  type Playlist,
  planBooth,
  SILENCE_ESTIMATE_TAIL_SEC,
  SILENCE_MODES,
  silenceJoin,
  toM3U8,
  transitionKey,
} from "../src/index";
import { loadCatalog } from "../src/load";

const deps = loadCatalog();
let p: Playlist;
beforeAll(() => {
  p = compose({ hours: 2, seed: 11, cortinaLengthSec: 45 }, deps);
});
const round3 = (v: number) => Math.round(v * 1000) / 1000;

describe("silenceJoin: the silence the room hears between two items", () => {
  it("gap mode: natural silence shorter than the gap is subtracted from the inserted gap", () => {
    const j = silenceJoin("gap", { gapSec: 2.5, tailSec: 1.2, headSec: 0.5 });
    expect(j).toEqual({ gapSec: 0.8, tailCutSec: 0, headCutSec: 0, heardSec: 2.5 });
  });
  it("gap mode: natural silence longer than the gap cuts the outgoing tail; the gap is never below 0", () => {
    const j = silenceJoin("gap", { gapSec: 2.5, tailSec: 4, headSec: 1 });
    expect(j.gapSec).toBe(0);
    expect(j.headCutSec).toBe(0);
    expect(j.tailCutSec).toBe(2.5);
    expect(j.heardSec).toBe(2.5);
  });
  it("gap mode: an incoming head longer than the gap is cut too (the outgoing tail goes first)", () => {
    const j = silenceJoin("gap", { gapSec: 2, tailSec: 1, headSec: 5 });
    expect(j).toEqual({ gapSec: 0, tailCutSec: 1, headCutSec: 3, heardSec: 2 });
  });
  it("gap mode: a fade, blend or rise runs from the audible moments (both silences cut whole)", () => {
    const j = silenceJoin("gap", { gapSec: 1, tailSec: 2, headSec: 0.7, faded: true });
    expect(j).toEqual({ gapSec: 1, tailCutSec: 2, headCutSec: 0.7, heardSec: 1 });
  });
  it("after mode: only the tail is trimmed; the incoming head is kept", () => {
    expect(silenceJoin("after", { gapSec: 2.5, tailSec: 3, headSec: 1 })).toEqual({
      gapSec: 2.5,
      tailCutSec: 3,
      headCutSec: 0,
      heardSec: 3.5,
    });
  });
  it("off: files play to their edges, then the gap (tail + gap + head is heard)", () => {
    expect(silenceJoin("off", { gapSec: 2.5, tailSec: 3, headSec: 1 })).toEqual({
      gapSec: 2.5,
      tailCutSec: 0,
      headCutSec: 0,
      heardSec: 6.5,
    });
  });
  it("never a negative gap or cut, whatever the inputs (fuzz)", () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let k = 0; k < 2000; k++) {
      const mode = SILENCE_MODES[k % 3]!;
      const gapSec = round3(rnd() * 6);
      const tailSec = round3(rnd() * 8);
      const headSec = round3(rnd() * 8);
      const faded = rnd() < 0.3;
      const j = silenceJoin(mode, { gapSec, tailSec, headSec, faded });
      expect(j.gapSec).toBeGreaterThanOrEqual(0);
      expect(j.tailCutSec).toBeGreaterThanOrEqual(0);
      expect(j.headCutSec).toBeGreaterThanOrEqual(0);
      expect(j.tailCutSec).toBeLessThanOrEqual(tailSec + 1e-9);
      expect(j.headCutSec).toBeLessThanOrEqual(headSec + 1e-9);
      // the room hears what is left of both silences plus the inserted gap
      expect(j.heardSec).toBeCloseTo(tailSec - j.tailCutSec + j.gapSec + headSec - j.headCutSec, 6);
      if (mode === "gap") expect(j.heardSec).toBeCloseTo(gapSec, 6);
      if (mode === "off") expect(j.heardSec).toBeCloseTo(tailSec + gapSec + headSec, 6);
    }
  });
});

describe("joinAfterTail: the incoming side once the outgoing tail is already fixed", () => {
  it("gap mode: the kept tail counts; the head is cut only past the gap", () => {
    expect(joinAfterTail("gap", { gapSec: 2.5, keptTailSec: 1, headSec: 0.5 })).toEqual({
      gapSec: 1,
      headCutSec: 0,
      heardSec: 2.5,
    });
    expect(joinAfterTail("gap", { gapSec: 2.5, keptTailSec: 2, headSec: 3 })).toEqual({
      gapSec: 0,
      headCutSec: 2.5,
      heardSec: 2.5,
    });
  });
  it("after / off keep the head; faded cuts it in gap mode", () => {
    expect(joinAfterTail("after", { gapSec: 2.5, keptTailSec: 0, headSec: 1 }).headCutSec).toBe(0);
    expect(joinAfterTail("off", { gapSec: 2.5, keptTailSec: 2, headSec: 1 }).heardSec).toBe(5.5);
    expect(joinAfterTail("gap", { gapSec: 1, keptTailSec: 0, headSec: 1, faded: true })).toEqual({
      gapSec: 1,
      headCutSec: 1,
      heardSec: 1,
    });
  });
});

describe("planBooth with silences", () => {
  const ids = () => {
    const t0 = p.tandas[0]!;
    return { a: t0.songs[0]!, b: t0.songs[1]! };
  };
  it("the default mode is 'silence counts as the gap'; settings validate the mode", () => {
    expect(BOOTH_DEFAULTS.silenceMode).toBe("gap");
    expect(boothSettings({}).silenceMode).toBe("gap");
    expect(boothSettings({ silenceMode: "after" }).silenceMode).toBe("after");
    expect(boothSettings({ silenceMode: "nope" as never }).silenceMode).toBe("gap");
  });
  it("without any silence data the plan is unchanged in every mode", () => {
    const base = planBooth(p, { silenceMode: "off" });
    for (const m of SILENCE_MODES) {
      const q = planBooth(p, { silenceMode: m });
      expect(q.items.map((i) => [i.startSec, i.lengthSec, i.gapAfterSec])).toEqual(
        base.items.map((i) => [i.startSec, i.lengthSec, i.gapAfterSec]),
      );
    }
  });
  it("gap mode: a measured tail and head make the heard silence the gap, and the clock follows", () => {
    const { a, b } = ids();
    const measurements = {
      [a.id]: { lufs: -16, tailSilenceSec: 1.5 },
      [b.id]: { lufs: -16, headSilenceSec: 0.6 },
    };
    const off = planBooth(p, { silenceMode: "off", measurements });
    const on = planBooth(p, { silenceMode: "gap", measurements });
    const ia = on.items.findIndex((i) => i.id === a.id);
    const A = on.items[ia]!;
    const B = on.items[ia + 1]!;
    expect(B.id).toBe(b.id);
    expect(A.tailSilenceSec).toBe(1.5);
    expect(B.headSilenceSec).toBe(0.6);
    // 1.5 + 0.6 < 2.5: nothing is cut, the inserted gap shrinks to 0.4
    expect(A.gapAfterSec).toBe(0.4);
    expect(A.tailCutSec ?? 0).toBe(0);
    expect(B.headCutSec ?? 0).toBe(0);
    expect(A.lengthSec).toBe(off.items[ia]!.lengthSec);
    // the night is shorter by exactly the silence that no longer doubles up
    expect(round3(off.wallClockSec - on.wallClockSec)).toBe(2.1);
    // and every start still follows start + length + gap
    for (let i = 0; i + 1 < on.items.length; i++) {
      const x = on.items[i]!;
      expect(on.items[i + 1]!.startSec).toBe(
        round3(x.startSec + x.lengthSec + x.gapAfterSec - (x.overlapAfterSec ?? 0)),
      );
    }
  });
  it("gap mode: a tail longer than the gap is cut (with the item shorter by the cut)", () => {
    const { a } = ids();
    const measurements = { [a.id]: { lufs: -16, tailSilenceSec: 4 } };
    const off = planBooth(p, { silenceMode: "off", measurements });
    const on = planBooth(p, { silenceMode: "gap", measurements });
    const ia = on.items.findIndex((i) => i.id === a.id);
    expect(on.items[ia]!.gapAfterSec).toBe(0);
    expect(on.items[ia]!.tailCutSec).toBe(1.5);
    expect(on.items[ia]!.lengthSec).toBe(round3(off.items[ia]!.lengthSec - 1.5));
    expect(round3(off.wallClockSec - on.wallClockSec)).toBe(4);
  });
  it("after mode: the tail goes, the head stays; off: nothing is cut", () => {
    const { a, b } = ids();
    const measurements = {
      [a.id]: { lufs: -16, tailSilenceSec: 2 },
      [b.id]: { lufs: -16, headSilenceSec: 1 },
    };
    const after = planBooth(p, { silenceMode: "after", measurements });
    const ia = after.items.findIndex((i) => i.id === a.id);
    expect(after.items[ia]!.tailCutSec).toBe(2);
    expect(after.items[ia]!.gapAfterSec).toBe(2.5);
    expect(after.items[ia + 1]!.headCutSec ?? 0).toBe(0);
    const off = planBooth(p, { silenceMode: "off", measurements });
    expect(off.items[ia]!.tailCutSec ?? 0).toBe(0);
    expect(off.items[ia]!.gapAfterSec).toBe(2.5);
  });
  it("the night's first song and the closing lose their silent edges in gap mode", () => {
    const first = p.opening ?? p.tandas[0]!.songs[0]!;
    const last = p.closing!;
    const measurements = {
      [first.id]: { lufs: -16, headSilenceSec: 2 },
      [last.id]: { lufs: -16, tailSilenceSec: 3 },
    };
    const on = planBooth(p, { measurements });
    expect(on.items[0]!.headCutSec).toBe(2);
    expect(on.items.at(-1)!.tailCutSec).toBe(3);
    expect(planBooth(p, { measurements, silenceMode: "after" }).items[0]!.headCutSec ?? 0).toBe(0);
  });
  it("a blend measures its overlap from the audible moments: both silences are cut whole", () => {
    const { a, b } = ids();
    const measurements = {
      [a.id]: { lufs: -16, tailSilenceSec: 2 },
      [b.id]: { lufs: -16, headSilenceSec: 1 },
    };
    const transitions = { [transitionKey(a.id, b.id)]: { preset: "blend" as const, overlapSec: 4 } };
    const on = planBooth(p, { measurements, transitions });
    const ia = on.items.findIndex((i) => i.id === a.id);
    expect(on.items[ia]!.tailCutSec).toBe(2);
    expect(on.items[ia + 1]!.headCutSec).toBe(1);
    expect(on.items[ia]!.overlapAfterSec).toBe(4);
  });
  it("a cued side keeps the DJ's cue: a cue in drops the head, a stop drops the tail", () => {
    const { a } = ids();
    const measurements = { [a.id]: { lufs: -16, headSilenceSec: 1, tailSilenceSec: 3 } };
    const q = planBooth(p, { measurements, songCues: { [a.id]: { outSec: 120 } } });
    const it = q.items.find((i) => i.id === a.id)!;
    expect(it.tailSilenceSec).toBeUndefined();
    expect(it.stopSec).toBe(120);
  });
  it("cortinas and breaks never take silence cuts; a silence table entry counts like a measurement", () => {
    const { a } = ids();
    const q = planBooth(p, { silences: { [a.id]: { tailSec: 1, estimated: true } } });
    const it = q.items.find((i) => i.id === a.id)!;
    expect(it.tailSilenceSec).toBe(1);
    expect(it.silenceEstimated).toBe(true);
    for (const c of q.items.filter((i) => i.kind === "cortina" || i.kind === "break")) {
      expect(c.headCutSec ?? 0).toBe(0);
      expect(c.tailCutSec ?? 0).toBe(0);
    }
    // a measurement wins over the table
    const m = planBooth(p, {
      silences: { [a.id]: { tailSec: 1, estimated: true } },
      measurements: { [a.id]: { lufs: -16, tailSilenceSec: 0.2 } },
    }).items.find((i) => i.id === a.id)!;
    expect(m.tailSilenceSec).toBe(0.2);
    expect(m.silenceEstimated).toBeUndefined();
  });
  it("silence values are clamped: never more than 10 s, never leaving under 10 s of music", () => {
    const { a } = ids();
    const q = planBooth(p, {
      measurements: { [a.id]: { lufs: -16, headSilenceSec: 40, tailSilenceSec: -3 } },
    });
    const it = q.items.find((i) => i.id === a.id)!;
    expect(it.headSilenceSec).toBe(10);
    expect(it.tailSilenceSec).toBeUndefined();
  });
  it("the set list (exports) reads the same gaps", () => {
    const { a } = ids();
    const q = planBooth(p, { measurements: { [a.id]: { lufs: -16, tailSilenceSec: 1 } } });
    expect(toM3U8({ ...p, booth: q })).toContain("#TDJ:gap=1.5");
  });
});

describe("estimateSilence: the opt-in per-era default for streaming tracks", () => {
  it("golden-era 78 rpm transfers get a conservative tail; later recordings and unknown years get nothing", () => {
    expect(estimateSilence({ year: 1941 })).toEqual({ tailSec: SILENCE_ESTIMATE_TAIL_SEC, estimated: true });
    expect(SILENCE_ESTIMATE_TAIL_SEC).toBeGreaterThanOrEqual(0.5);
    expect(SILENCE_ESTIMATE_TAIL_SEC).toBeLessThanOrEqual(2);
    expect(estimateSilence({ year: 1975 })).toBeNull();
    expect(estimateSilence({ year: null })).toBeNull();
  });
});
