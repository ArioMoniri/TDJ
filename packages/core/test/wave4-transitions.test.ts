/**
 * Wave 4 — per-transition edits (the Booth's transition editor, modelled on a playlist "Mix" editor): each edit is
 * stored per transition key (fromId→toId) in the plan's inputs, travels in `.tdjnight`, and re-times the night. The
 * invariants: the night's clock stays the sum of lengths and gaps minus overlaps; an overlap never exceeds either
 * side; La Cumparsita is never faded or overlapped; a cortina cut ends at the cortina's stop second; inside a tanda
 * the default stays a gap.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  attachBooth,
  type BoothPlan,
  boothInputs,
  compose,
  exportNight,
  importNight,
  type Playlist,
  planBooth,
  resolveTransition,
  TRANSITION_RANGES,
  type TransitionEdit,
  toRekordboxXML,
  transitionKey,
} from "../src/index";
import { loadCatalog } from "../src/load";

const deps = loadCatalog();
let p: Playlist;
let plan: BoothPlan;
beforeAll(() => {
  p = compose({ hours: 2, seed: 11, cortinaLengthSec: 45 }, deps);
  plan = planBooth(p);
});
const round3 = (v: number) => Math.round(v * 1000) / 1000;
/** the night's clock rebuilt from the items: Σ length + Σ gap − Σ overlap */
const clockOf = (pl: BoothPlan) =>
  round3(pl.items.reduce((a, it) => a + it.lengthSec + it.gapAfterSec - (it.overlapAfterSec ?? 0), 0));
/** first index i whose item and its neighbour i+1 match the predicate */
const pairAt = (
  pl: BoothPlan,
  pred: (a: BoothPlan["items"][number], b: BoothPlan["items"][number]) => boolean,
) => pl.items.findIndex((a, i) => i + 1 < pl.items.length && pred(a, pl.items[i + 1]!));
const keyAt = (pl: BoothPlan, i: number) => transitionKey(pl.items[i]!.id!, pl.items[i + 1]!.id!);

describe("transition keys and storage", () => {
  it("keys read fromId→toId and boothInputs carries the edits (so .tdjnight and attachBooth keep them)", () => {
    expect(transitionKey("a", "b")).toBe("a→b");
    const i = pairAt(plan, (a, b) => a.kind === "track" && b.kind === "cortina");
    const edits = {
      [keyAt(plan, i)]: { preset: "fade", fadeOutSec: 3, fadeInSec: 3, gapSec: 3 } as TransitionEdit,
    };
    const q = attachBooth(p, { transitions: edits });
    expect(q.booth!.transitions).toEqual(edits);
    expect(boothInputs(q.booth).transitions).toEqual(edits);
    // a swap / re-plan without inputs keeps them
    expect(attachBooth(q).booth!.transitions).toEqual(edits);
    // the night file carries them, and opening it re-times the same way
    const file = exportNight(q);
    expect(file.booth?.transitions).toEqual(edits);
    const back = importNight(JSON.parse(JSON.stringify(file)), deps);
    expect(back.playlist.booth!.items[i]!.transitionAfter?.preset).toBe("fade");
  });
});

describe("timing", () => {
  it("a gap edit replaces the gap after that item only, and the clock moves by exactly the difference", () => {
    const i = pairAt(plan, (a, b) => a.kind === "track" && b.kind === "track" && a.tanda === b.tanda);
    const q = planBooth(p, { transitions: { [keyAt(plan, i)]: { preset: "gap", gapSec: 4 } } });
    expect(q.items[i]!.gapAfterSec).toBe(4);
    expect(round3(q.wallClockSec - plan.wallClockSec)).toBe(round3(4 - plan.items[i]!.gapAfterSec));
    q.items.forEach((it, k) => {
      if (k !== i) expect(it.gapAfterSec).toBe(plan.items[k]!.gapAfterSec);
    });
  });

  it("the clock is Σ length + Σ gap − Σ overlap, and every start follows start + length + gap − overlap", () => {
    const a = pairAt(plan, (x, y) => x.kind === "track" && y.kind === "track" && x.tanda === y.tanda);
    const b = pairAt(plan, (x, y) => x.kind === "track" && y.kind === "cortina");
    const c = pairAt(plan, (x, y) => x.kind === "cortina" && y.kind === "track");
    const q = planBooth(p, {
      transitions: {
        [keyAt(plan, a)]: { preset: "blend", overlapSec: 6 },
        [keyAt(plan, b)]: { preset: "rise", overlapSec: 4, fadeInSec: 3 },
        [keyAt(plan, c)]: { preset: "cortinaCut", gapSec: 1.5 },
      },
    });
    expect(q.items[a]!.overlapAfterSec).toBe(6);
    expect(q.items[a]!.gapAfterSec).toBe(0);
    expect(q.items[b]!.overlapAfterSec).toBe(4);
    expect(q.items[c]!.gapAfterSec).toBe(1.5);
    for (let k = 0; k + 1 < q.items.length; k++) {
      const it = q.items[k]!;
      expect(q.items[k + 1]!.startSec).toBeCloseTo(
        it.startSec + it.lengthSec + it.gapAfterSec - (it.overlapAfterSec ?? 0),
        2,
      );
    }
    expect(q.wallClockSec).toBeCloseTo(clockOf(q), 2);
    expect(round3(plan.wallClockSec - q.wallClockSec)).toBeCloseTo(
      round3(
        plan.items[a]!.gapAfterSec + 6 + plan.items[b]!.gapAfterSec + 4 + plan.items[c]!.gapAfterSec - 1.5,
      ),
      2,
    );
  });

  it("gaps are clamped to 0.5–5 s and overlaps to 1–12 s", () => {
    expect(TRANSITION_RANGES.gapSec).toMatchObject({ min: 0.5, max: 5 });
    const i = pairAt(plan, (a, b) => a.kind === "track" && b.kind === "track");
    const k = keyAt(plan, i);
    expect(planBooth(p, { transitions: { [k]: { preset: "gap", gapSec: 0 } } }).items[i]!.gapAfterSec).toBe(
      0.5,
    );
    expect(planBooth(p, { transitions: { [k]: { preset: "gap", gapSec: 60 } } }).items[i]!.gapAfterSec).toBe(
      5,
    );
    expect(
      planBooth(p, { transitions: { [k]: { preset: "blend", overlapSec: 99 } } }).items[i]!.overlapAfterSec,
    ).toBe(12);
  });

  it("an edit for a pair that is no longer adjacent (a swap) is ignored", () => {
    const q = planBooth(p, { transitions: { "nope→never": { preset: "blend", overlapSec: 8 } } });
    expect(q.wallClockSec).toBe(plan.wallClockSec);
    expect(q.items.some((it) => it.transitionAfter)).toBe(false);
  });
});

describe("resolveTransition rules", () => {
  const side = (kind: "track" | "cortina" | "closing", lengthSec = 180, tanda = 1) => ({
    kind,
    lengthSec,
    tanda,
  });
  it("an overlap never exceeds half of either side, nor 12 s", () => {
    const r = resolveTransition(
      { preset: "blend", overlapSec: 12 },
      { from: side("track", 180), to: side("cortina", 10) },
    );
    expect(r.overlapSec).toBeLessThanOrEqual(5);
    const r2 = resolveTransition(
      { preset: "rise", overlapSec: 12 },
      { from: side("track", 6), to: side("track", 180) },
    );
    expect(r2.overlapSec).toBeLessThanOrEqual(3);
    // fades stay inside the overlap and inside the sides
    expect(r.fadeOutSec).toBeLessThanOrEqual(r.overlapSec);
    expect(r.fadeInSec).toBeLessThanOrEqual(r.overlapSec);
    const f = resolveTransition(
      { preset: "fade", fadeOutSec: 10, fadeInSec: 10 },
      { from: side("track", 6), to: side("track", 4) },
    );
    expect(f.fadeOutSec).toBeLessThanOrEqual(5);
    expect(f.fadeInSec).toBeLessThanOrEqual(3);
  });

  it("La Cumparsita plays whole: no fade and no overlap on its side", () => {
    const into = resolveTransition(
      { preset: "blend", overlapSec: 6 },
      { from: side("cortina", 45), to: side("closing") },
    );
    expect(into.overlapSec).toBe(0);
    expect(into.fadeInSec).toBe(0);
    expect(into.preset).not.toBe("blend");
    expect(into.gapSec).toBeGreaterThanOrEqual(0.5);
    const out = resolveTransition(
      { preset: "fade", fadeOutSec: 4, fadeInSec: 2 },
      { from: side("closing"), to: side("track") },
    );
    expect(out.fadeOutSec).toBe(0);
    expect(out.fadeInSec).toBe(2);
    const rise = resolveTransition(
      { preset: "rise", overlapSec: 6, fadeInSec: 4 },
      { from: side("track"), to: side("closing") },
    );
    expect(rise.overlapSec).toBe(0);
    expect(rise.fadeInSec).toBe(0);
  });

  it("a cortina cut only follows a cortina; elsewhere it is a gap", () => {
    expect(
      resolveTransition({ preset: "cortinaCut" }, { from: side("track"), to: side("track") }).preset,
    ).toBe("gap");
    const c = resolveTransition(
      { preset: "cortinaCut", fadeOutSec: 5, gapSec: 2 },
      { from: side("cortina", 40), to: side("track", 170, 2) },
    );
    expect(c).toMatchObject({ preset: "cortinaCut", fadeOutSec: 5, gapSec: 2, overlapSec: 0, fadeInSec: 0 });
  });

  it("a cortina cut ends the cortina's fade exactly at its stop second; the cortina keeps its length", () => {
    const i = pairAt(plan, (a, b) => a.kind === "cortina" && b.kind === "track");
    const q = planBooth(p, {
      transitions: { [keyAt(plan, i)]: { preset: "cortinaCut", fadeOutSec: 6, gapSec: 2 } },
    });
    const c = q.items[i]!;
    expect(c.fadeOutSec).toBe(6);
    expect(c.lengthSec).toBe(plan.items[i]!.lengthSec);
    expect(round3((c.trimInSec ?? 0) + c.lengthSec)).toBe(c.stopSec);
    expect(c.gapAfterSec).toBe(2);
  });

  it("inside a tanda the default is a gap: no stored edit leaves the plan as it was", () => {
    expect(planBooth(p, { transitions: {} })).toEqual(plan);
  });
});

describe("exports", () => {
  it("Rekordbox carries a mix-out cue where a transition fades or overlaps; a gap adds nothing", () => {
    const i = pairAt(plan, (a, b) => a.kind === "track" && b.kind === "track");
    const q = attachBooth(p, { transitions: { [keyAt(plan, i)]: { preset: "blend", overlapSec: 6 } } });
    expect(toRekordboxXML(q)).toMatch(/POSITION_MARK Name="Mix out \(blend 6 s\)"/);
    const g = attachBooth(p, { transitions: { [keyAt(plan, i)]: { preset: "gap", gapSec: 3 } } });
    expect(toRekordboxXML(g)).not.toMatch(/Mix out/);
  });
});

/* 2026-11 — the finished editor: the EQ row offers a three-band hand-over besides the bass swap */
describe("EQ: none, centre bass swap, three-band swap", () => {
  const side = (kind: "track" | "closing" | "cortina" = "track") => ({ kind, lengthSec: 180, tanda: 1 });
  const ctx = { from: side(), to: { ...side(), tanda: 2 } };
  it("a three-band swap needs an overlap: it is the bass swap plus the mids and highs handed over", () => {
    const r = resolveTransition({ preset: "blend", overlapSec: 6, eq: "threeBand" }, ctx);
    expect(r.eq).toBe("threeBand");
    expect(r.bassSwap).toBe(true);
    const b = resolveTransition({ preset: "blend", overlapSec: 6, bassSwap: true }, ctx);
    expect(b.eq).toBe("bassSwap");
    expect(resolveTransition({ preset: "blend", overlapSec: 6, eq: "bassSwap" }, ctx).bassSwap).toBe(true);
    expect(resolveTransition({ preset: "blend", overlapSec: 6 }, ctx).eq).toBe("none");
  });
  it("no overlap, no EQ hand-over (a fade, a gap, La Cumparsita)", () => {
    for (const edit of [
      { preset: "fade", eq: "threeBand" },
      { preset: "gap", eq: "bassSwap" },
    ] as TransitionEdit[]) {
      const r = resolveTransition(edit, ctx);
      expect(r.eq).toBe("none");
      expect(r.bassSwap).toBe(false);
    }
    const c = resolveTransition({ preset: "blend", eq: "threeBand" }, { from: side(), to: side("closing") });
    expect(c.eq).toBe("none");
  });
  it("an unknown EQ value is none", () => {
    const r = resolveTransition({ preset: "blend", eq: "wobble" as never }, ctx);
    expect(r.eq).toBe("none");
  });
});

/**
 * 2026-11 — transition templates (the owner: "there should be an option to add custom templates for transitions"):
 * a template carries the silence setting too, so an edit may name its own silence mode for that one join; and the
 * DJ's defaults per boundary arrive as `defaultTransitions`, which an explicit edit beats and which are never stored
 * as the DJ's own edits.
 */
describe("templates: a join's own silence mode and default transitions", () => {
  const pair = () => {
    const t0 = p.tandas[0]!;
    return { a: t0.songs[0]!, b: t0.songs[1]! };
  };
  it("resolveTransition keeps a valid silence mode and drops an unknown one", () => {
    const ctx = {
      from: { kind: "track" as const, lengthSec: 180, tanda: 1 },
      to: { kind: "track" as const, lengthSec: 180, tanda: 1 },
    };
    expect(resolveTransition({ preset: "gap", silence: "off" }, ctx).silence).toBe("off");
    expect(resolveTransition({ preset: "fade", silence: "after" }, ctx).silence).toBe("after");
    expect(resolveTransition({ preset: "gap", silence: "loud" as never }, ctx).silence).toBeUndefined();
    expect(resolveTransition({ preset: "gap" }, ctx).silence).toBeUndefined();
  });
  it("an edit's silence mode replaces the night's for that join only", () => {
    const { a, b } = pair();
    const measurements = {
      [a.id]: { lufs: -16, tailSilenceSec: 1.5 },
      [b.id]: { lufs: -16, headSilenceSec: 0.6 },
    };
    const base = planBooth(p, { silenceMode: "gap", measurements });
    const ia = base.items.findIndex((i) => i.id === a.id);
    expect(base.items[ia]!.gapAfterSec).toBe(0.4);
    const kept = planBooth(p, {
      silenceMode: "gap",
      measurements,
      transitions: { [transitionKey(a.id, b.id)]: { preset: "gap", gapSec: 2.5, silence: "off" } },
    });
    // "off" for this join: nothing subtracted, the full gap is inserted after the silent tail
    expect(kept.items[ia]!.gapAfterSec).toBe(2.5);
    expect(kept.items[ia]!.tailCutSec ?? 0).toBe(0);
    // the other joins follow the night's mode as before
    expect(kept.items.filter((_, k) => k !== ia).map((x) => x.gapAfterSec)).toEqual(
      base.items.filter((_, k) => k !== ia).map((x) => x.gapAfterSec),
    );
    // and the clock still adds up
    expect(kept.wallClockSec).toBe(clockOf(kept));
  });
  it("defaultTransitions apply where the DJ has no edit, lose to an explicit edit, and are never stored", () => {
    const i = pairAt(plan, (a, b) => a.kind === "track" && b.kind === "track" && a.tanda === b.tanda);
    const j = pairAt(plan, (a, b) => a.kind === "track" && b.kind === "cortina");
    const defaults = {
      [keyAt(plan, i)]: { preset: "fade", fadeOutSec: 2, fadeInSec: 0, gapSec: 1 } as TransitionEdit,
      [keyAt(plan, j)]: { preset: "fade", fadeOutSec: 4, gapSec: 2 } as TransitionEdit,
    };
    const own = { [keyAt(plan, j)]: { preset: "gap", gapSec: 3 } as TransitionEdit };
    const q = planBooth(p, { transitions: own, defaultTransitions: defaults });
    expect(q.items[i]!.transitionAfter?.preset).toBe("fade");
    expect(q.items[i]!.transitionAfter?.fadeOutSec).toBe(2);
    expect(q.items[j]!.transitionAfter?.preset).toBe("gap");
    expect(q.items[j]!.gapAfterSec).toBe(3);
    expect(q.transitions).toEqual(own);
    expect(boothInputs(q).transitions).toEqual(own);
    expect(q.wallClockSec).toBe(clockOf(q));
  });
});
