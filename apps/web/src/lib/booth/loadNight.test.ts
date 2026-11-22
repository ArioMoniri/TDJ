import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

/** 2026-11 (the owner: "a clear or reset button for the Booth, to add another playlist to play") */
const endNight = vi.fn(async () => {
  booth.setState({ started: false, state: "stopped" });
});
const booth = create<Record<string, unknown>>(() => ({
  started: false,
  state: "idle",
  planIndex: 3,
  settings: { stopFadeSec: 3 },
  endNight,
  stop: vi.fn(),
}));
const app = create<Record<string, unknown>>(() => ({ playlist: null, currentEntry: null }));
app.setState({
  setPlaylist: (p: unknown) => app.setState({ playlist: p }),
  setCurrentEntry: (id: string | null) => app.setState({ currentEntry: id }),
});
vi.mock("./store", () => ({ useBooth: booth }));
vi.mock("@/lib/store", () => ({ useStore: app }));

const { clearBooth, loadAfterThisSong, loadNight, resetBooth, useBoothLoad } = await import("./loadNight");
const { undoEdit, clearEdits } = await import("@/lib/editHistory");

const night = (name: string) =>
  ({ id: name, name, tandas: [{ songs: [], locked: true }], options: {} }) as never;

describe("Load a night / Clear the Booth", () => {
  beforeEach(() => {
    booth.setState({ started: false, state: "idle", planIndex: 3 });
    useBoothLoad.setState({ cleared: false, pending: null, seq: 0, resumeAt: null });
    endNight.mockClear();
    clearEdits();
  });

  it("a load makes the night the current one, unlocked, and boots the Booth again (seq)", async () => {
    await loadNight(night("Saturday"), { historyId: "h1" });
    const p = app.getState().playlist as { name: string; tandas: Array<{ locked: boolean }> };
    expect(p.name).toBe("Saturday");
    expect(p.tandas[0]!.locked).toBe(false);
    expect(app.getState().currentEntry).toBe("h1");
    expect(useBoothLoad.getState().seq).toBe(1);
    expect(endNight).not.toHaveBeenCalled();
  });

  it("mid-night a load ends the night first (its log goes to History)", async () => {
    booth.setState({ started: true, state: "playing" });
    await loadNight(night("Sunday"));
    expect(endNight).toHaveBeenCalledTimes(1);
  });

  it("after the current song: it waits for the next item, then loads", async () => {
    booth.setState({ started: true, state: "playing", planIndex: 3 });
    loadAfterThisSong(night("Later"));
    expect(useBoothLoad.getState().pending).not.toBeNull();
    booth.setState({ position: 12 });
    expect(useBoothLoad.getState().seq).toBe(0);
    booth.setState({ planIndex: 4 });
    await vi.waitFor(() => expect(useBoothLoad.getState().seq).toBe(1));
    expect((app.getState().playlist as { name: string }).name).toBe("Later");
  });

  it("clear empties the Booth (the music stops first mid-night); Undo brings it back", async () => {
    booth.setState({ started: true, state: "playing" });
    await clearBooth();
    expect(endNight).toHaveBeenCalled();
    expect(useBoothLoad.getState().cleared).toBe(true);
    await undoEdit({ scope: "/booth" });
    expect(useBoothLoad.getState().cleared).toBe(false);
  });

  it("closing mid-night: Undo brings the night back where it was, nothing playing", async () => {
    booth.setState({ started: true, state: "playing", planIndex: 9 });
    await clearBooth();
    expect(useBoothLoad.getState().cleared).toBe(true);
    await undoEdit({ scope: "/booth" });
    expect(useBoothLoad.getState().cleared).toBe(false);
    expect(useBoothLoad.getState().resumeAt).toBe(9);
    expect(booth.getState().started).toBe(false);
  });

  it("reset: the night that plays ends, the same night boots at its start; Undo puts the playhead back", async () => {
    booth.setState({ started: true, state: "playing", planIndex: 6 });
    await resetBooth();
    expect(endNight).toHaveBeenCalledTimes(1);
    expect(useBoothLoad.getState().seq).toBe(1);
    expect(useBoothLoad.getState().resumeAt).toBe(0);
    expect(useBoothLoad.getState().cleared).toBe(false);
    await undoEdit({ scope: "/booth" });
    expect(useBoothLoad.getState().resumeAt).toBe(6);
  });
});
