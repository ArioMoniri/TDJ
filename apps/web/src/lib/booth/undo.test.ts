import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";
import { clearEdits, redoEdit, undoEdit, useEditHistory } from "@/lib/editHistory";
import type { BoothMarks } from "./engine";
import type { BoothStore } from "./store";
import { installBoothUndo } from "./undo";

/**
 * 2026-11: the Booth's actions in the one undo history (lib/booth/undo.ts), against a fake store and engine: what
 * comes next is put back from the engine's marks, plan values from their value before, and what the room already
 * heard says why it cannot be undone.
 */
const fresh = (): BoothMarks => ({
  skipped: [],
  holdBefore: null,
  holding: false,
  breakUntil: null,
  forcedNext: null,
  birthday: [],
});
function setup(o: { live?: boolean } = {}) {
  let m = fresh();
  const engine = {
    trims: {} as Record<string, number>,
    marks: () => structuredClone(m),
    restoreMarks: (x: BoothMarks) => {
      m = structuredClone(x);
    },
  };
  const items = ["Ahora No Me Conocés", "Agua Florida", "Adiós, Arrabal", "Tres Esquinas"].map(
    (title, i) => ({
      id: `s${i}`,
      title,
    }),
  );
  const bypass: boolean[] = [false, false];
  const store = create<BoothStore>()(
    (set, get) =>
      ({
        started: true,
        state: o.live === false ? "stopped" : "playing",
        planIndex: 0,
        skipped: [],
        holding: false,
        plan: { items },
        playlist: { tandas: bypass.map((b) => ({ bypass: b })), booth: { songCues: {} } },
        settings: { gapSec: 2.5 },
        next: () => {
          m.skipped.push(1);
        },
        cueCortina: () => {
          m.skipped.push(2, 3);
        },
        birthdayVals: () => {
          m.holdBefore = 3;
          m.birthday = [3];
        },
        startBreak: () => {
          m.breakUntil = 1;
          m.holding = true;
        },
        hold: () => {
          m.holding = true;
        },
        toggleHold: () => {
          m.holding = !m.holding;
          set({ holding: m.holding });
        },
        jumpToClosing: async () => {
          m.skipped.push(2);
        },
        toggleBypass: async (tanda: number) => {
          const p = get().playlist!;
          set({
            playlist: {
              ...p,
              tandas: p.tandas.map((t, i) => (i === tanda - 1 ? { ...t, bypass: !t.bypass } : t)),
            } as never,
          });
        },
        setLastFourTango: async () => {},
        setSongCue: (id: string, cue: unknown) => {
          const p = get().playlist!;
          const songCues = { ...(p.booth?.songCues ?? {}) } as Record<string, unknown>;
          if (cue) songCues[id] = cue;
          else delete songCues[id];
          set({ playlist: { ...p, booth: { ...p.booth, songCues } } as never });
        },
        setCortinaEdit: () => {},
        setTrim: (id: string, db: number) => {
          engine.trims[id] = db;
        },
        setSettings: (s: Partial<BoothStore["settings"]>) => set({ settings: { ...get().settings, ...s } }),
        setSilence: () => {},
        setCortinaLength: () => {},
        nextNow: async () => set({ planIndex: get().planIndex + 1 }),
        previous: async () => set({ planIndex: Math.max(0, get().planIndex - 1) }),
        playNow: async (i: number) => set({ planIndex: i }),
        skipNow: async () => {},
        fadeOutNow: () => {},
        crossfadeNext: async () => {},
        select: (i: number) => {
          set({ planIndex: i });
          return true;
        },
      }) as unknown as BoothStore,
  );
  installBoothUndo(store.getState, store.setState, () => engine);
  return { store, marks: () => m, engine };
}

beforeEach(() => clearEdits());
const scope = { scope: "/" };

describe("the Booth's actions undo and redo with ⌘Z", () => {
  it("Skip next: one entry named after the song left out; undo puts it back, redo leaves it out again", async () => {
    const { store, marks } = setup();
    store.getState().next();
    expect(marks().skipped).toEqual([1]);
    const past = useEditHistory.getState().past;
    expect(past).toHaveLength(1);
    expect(past[0]!.label).toBe("Skip next (Agua Florida)");
    await undoEdit(scope);
    expect(marks().skipped).toEqual([]);
    await redoEdit(scope);
    expect(marks().skipped).toEqual([1]);
  });

  it("Cortina early, birthday vals, a break and Hold each undo to what came next before", async () => {
    const { store, marks } = setup();
    store.getState().cueCortina();
    store.getState().birthdayVals();
    store.getState().startBreak(10);
    store.getState().toggleHold();
    expect(useEditHistory.getState().past.map((e) => e.label)).toEqual([
      "Cortina early",
      "Birthday vals",
      "Break (10 min)",
      // (the break already holds: Hold toggles it off)
      "Hold cancelled",
    ]);
    await undoEdit(scope);
    await undoEdit(scope);
    expect(marks().breakUntil).toBeNull();
    await undoEdit(scope);
    expect(marks().holdBefore).toBeNull();
    await undoEdit(scope);
    expect(marks()).toEqual(fresh());
  });

  it("Skip tonight and a start point put the night's plan back; a slider dragged is one entry", async () => {
    const { store, engine } = setup();
    await store.getState().toggleBypass(2);
    expect(store.getState().playlist?.tandas[1]?.bypass).toBe(true);
    store.getState().setSongCue("s1", { inSec: 3 });
    store.getState().setSongCue("s1", { inSec: 4 });
    store.getState().setTrim("s0", 1);
    store.getState().setTrim("s0", 2);
    store.getState().setSettings({ gapSec: 4 });
    expect(useEditHistory.getState().past.map((e) => e.label)).toEqual([
      "Skip tonight (tanda 2)",
      "Start point (Agua Florida)",
      "Gain (Ahora No Me Conocés)",
      "Gap 4 s",
    ]);
    await undoEdit(scope);
    expect(store.getState().settings.gapSec).toBe(2.5);
    await undoEdit(scope);
    expect(engine.trims.s0).toBe(0);
    await undoEdit(scope);
    expect(store.getState().playlist?.booth?.songCues?.s1).toBeUndefined();
    await undoEdit(scope);
    expect(store.getState().playlist?.tandas[1]?.bypass).toBe(false);
    // the undos recorded nothing of their own
    expect(useEditHistory.getState().past).toHaveLength(0);
  });

  it("what the room already heard (Next now mid-night) cannot be un-heard: the undo says why", async () => {
    const { store } = setup();
    await store.getState().nextNow();
    const e = await undoEdit(scope);
    expect(e?.why).toMatch(/already played in the room/);
    expect(e?.why).toContain("Ahora No Me Conocés");
    expect(store.getState().planIndex).toBe(1);
    expect(useEditHistory.getState().past).toHaveLength(0);
  });

  it("before the night (nothing sounds), Next now only moved the playhead: undo moves it back", async () => {
    const { store } = setup({ live: false });
    await store.getState().nextNow();
    expect(store.getState().planIndex).toBe(1);
    const e = await undoEdit(scope);
    expect(e?.why).toBeUndefined();
    expect(store.getState().planIndex).toBe(0);
  });
});
