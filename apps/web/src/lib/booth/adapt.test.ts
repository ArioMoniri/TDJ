import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

/**
 * QA 2026-11: after "Floor emptied" the suggestion card did not appear and nothing said why — when the engine finds no
 * better tanda for the next slots the Booth says so once ("No better tanda for the next slots — keeping the plan").
 */
const booth = create<{ playlist: unknown; plan: null; started: boolean }>(() => ({
  playlist: null,
  plan: null,
  started: false,
}));
vi.mock("./store", () => ({ useBooth: booth }));
vi.mock("./roomHearts", () => ({ useRoomHearts: { getState: () => ({ counts: {} }) } }));
vi.mock("@/lib/store", () => ({
  useStore: { getState: () => ({ memory: {}, settings: { learn: false }, updateMemory: () => {} }) },
}));
vi.mock("@/lib/favourites", () => ({ favouritesForRequest: () => null, nightIdOf: () => "n" }));
vi.mock("@tdj/core", () => ({
  floorLearningOn: () => false,
  learnedForRequest: () => null,
  learnFromFloor: (x: unknown) => x,
}));

const { requestAdapt, useAdapt } = await import("./adapt");
const { useGlobalToast } = await import("@/lib/toast");

describe("the floor's suggestion", () => {
  const p = { tandas: [{ songs: [] }, { songs: [] }, { songs: [] }] } as never;
  beforeEach(() => {
    booth.setState({ playlist: p });
    useGlobalToast.getState().dismiss();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("none better: the plan is kept and the toast says so", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ suggestion: null }) }));
    await requestAdapt(p, 1, "emptied");
    expect(useAdapt.getState().suggestion).toBeNull();
    expect(useGlobalToast.getState().toast?.text).toBe(
      "No better tanda for the next slots — keeping the plan",
    );
  });

  it("a better one: the card shows it, no toast", async () => {
    const suggestion = { index: 2, after: 1, reaction: "emptied", from: {}, to: {}, reasons: [] };
    vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ suggestion }) }));
    await requestAdapt(p, 1, "emptied");
    expect(useAdapt.getState().suggestion).toEqual(suggestion);
    expect(useGlobalToast.getState().toast).toBeNull();
  });

  it("a failed request says nothing (it is not an answer)", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, json: async () => ({}) }));
    await requestAdapt(p, 1, "emptied");
    expect(useGlobalToast.getState().toast).toBeNull();
  });
});
