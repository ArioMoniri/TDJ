import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

/**
 * 2026-11 (the owner: "you can't select which night to play in the Booth, or from History"; "rename and delete
 * everywhere"): Play in the Booth never replaces a playing night silently; a rename reaches History, Compose and the
 * Booth, with an Undo; the featured night is never renamed.
 */
type Night = {
  id: string;
  name: string;
  tandas: Array<{ locked?: boolean; songs: unknown[] }>;
  options: object;
};
const night = (id: string, name = id): Night => ({
  id,
  name,
  tandas: [{ songs: [], locked: true }],
  options: { seed: 1 },
});
const endNight = vi.fn(async () => {
  booth.setState({ started: false, state: "stopped" });
});
const booth = create<Record<string, unknown>>(() => ({
  playlist: null,
  started: false,
  state: "idle",
  planIndex: 0,
  endNight,
}));
type Entry = { id: string; title: string; createdAt: string; playlist: Night; options: object };
const app = create<Record<string, unknown>>(() => ({
  playlist: null,
  currentEntry: null,
  history: [] as Entry[],
}));
app.setState({
  setPlaylist: (p: unknown) => app.setState({ playlist: p }),
  setCurrentEntry: (id: string | null) => app.setState({ currentEntry: id }),
  replaceOptions: () => {},
  updateSnapshot: (id: string, patch: Partial<Entry>) =>
    app.setState({
      history: (app.getState().history as Entry[]).map((h) => (h.id === id ? { ...h, ...patch } : h)),
    }),
});
vi.mock("./store", () => ({ useStore: app }));

const A = await import("./nightActions");
const { useBoothLoad } = await import("./booth/loadState");
const { undoEdit, clearEdits } = await import("./editHistory");
A.setBoothHandle(booth as never);

const go = vi.fn();
describe("Play in the Booth", () => {
  beforeEach(() => {
    booth.setState({ playlist: null, started: false, state: "idle", planIndex: 0 });
    app.setState({ playlist: null, currentEntry: null, history: [] });
    useBoothLoad.setState({ cleared: false, pending: null, seq: 0, resumeAt: null });
    A.usePlayAsk.setState({ ask: null });
    endNight.mockClear();
    go.mockClear();
    clearEdits();
  });

  it("nothing playing: the night loads (unlocked, its History entry current) and the Booth opens", async () => {
    expect(await A.playInBooth(night("sat") as never, { historyId: "h1", go })).toBe("loaded");
    expect((app.getState().playlist as Night).id).toBe("sat");
    expect((app.getState().playlist as Night).tandas[0]!.locked).toBe(false);
    expect(app.getState().currentEntry).toBe("h1");
    expect(useBoothLoad.getState().seq).toBe(1);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("another night playing: it asks first and changes nothing until Replace", async () => {
    booth.setState({ playlist: night("fri", "Friday"), started: true, state: "playing", planIndex: 7 });
    app.setState({ playlist: night("fri", "Friday"), currentEntry: "hf" });
    expect(await A.playInBooth(night("sat", "Saturday") as never, { historyId: "h1", go })).toBe("asked");
    expect(A.usePlayAsk.getState().ask?.playing).toBe("Friday");
    expect((app.getState().playlist as Night).id).toBe("fri");
    expect(endNight).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
    // Cancel: still nothing
    A.cancelPlayAsk();
    expect(A.usePlayAsk.getState().ask).toBeNull();
    expect((app.getState().playlist as Night).id).toBe("fri");
  });

  it("Replace ends the playing night (its log to History), loads the new one; Undo brings it back where it was", async () => {
    booth.setState({ playlist: night("fri", "Friday"), started: true, state: "playing", planIndex: 7 });
    app.setState({ playlist: night("fri", "Friday"), currentEntry: "hf" });
    await A.playInBooth(night("sat", "Saturday") as never, { historyId: "h1", go });
    await A.confirmPlayAsk();
    expect(endNight).toHaveBeenCalledTimes(1);
    expect((app.getState().playlist as Night).id).toBe("sat");
    expect(go).toHaveBeenCalledTimes(1);
    await undoEdit({ scope: "/booth" });
    expect((app.getState().playlist as Night).id).toBe("fri");
    expect(app.getState().currentEntry).toBe("hf");
    // nothing restarts by itself: the playhead waits where it was
    expect(useBoothLoad.getState().resumeAt).toBe(7);
  });

  it("the same night playing: the Booth just opens", async () => {
    booth.setState({ playlist: night("fri"), started: true, state: "playing" });
    expect(await A.playInBooth(night("fri") as never, { go })).toBe("same");
    expect(go).toHaveBeenCalledTimes(1);
    expect(endNight).not.toHaveBeenCalled();
    expect(A.usePlayAsk.getState().ask).toBeNull();
  });

  it("a stopped or paused-at-the-end Booth is not 'playing': no question", async () => {
    booth.setState({ playlist: night("fri"), started: true, state: "stopped" });
    expect(await A.playInBooth(night("sat") as never, { go })).toBe("loaded");
  });

  it("a paused night mid-way is still the night playing: it asks", async () => {
    booth.setState({ playlist: night("fri"), started: true, state: "paused" });
    expect(await A.playInBooth(night("sat") as never, { go })).toBe("asked");
  });

  it("Compose's own night keeps its locks (keep)", async () => {
    const p = night("c");
    app.setState({ playlist: p });
    await A.playInBooth(p as never, { keep: true, go });
    expect(app.getState().playlist).toBe(p);
  });
});

describe("Rename", () => {
  const entry = (id: string, title: string, p: Night): Entry => ({
    id,
    title,
    createdAt: "2026-11-01T20:00:00.000Z",
    playlist: p,
    options: {},
  });
  beforeEach(() => {
    clearEdits();
    booth.setState({ playlist: null });
  });

  it("the entry, the night open in Compose and the night in the Booth take the new name; Undo puts it back", async () => {
    const p = night("n1", "Old name");
    app.setState({ history: [entry("e1", "Old name", p)], playlist: p });
    booth.setState({ playlist: p });
    expect(A.renameNight("e1", "  Saturday · at the club  ")).toBe(true);
    const h = (app.getState().history as Entry[])[0]!;
    expect(h.title).toBe("Saturday – at the club");
    expect(h.playlist.name).toBe("Saturday – at the club");
    expect((app.getState().playlist as Night).name).toBe("Saturday – at the club");
    expect((booth.getState().playlist as Night).name).toBe("Saturday – at the club");
    await undoEdit({});
    expect((app.getState().history as Entry[])[0]!.title).toBe("Old name");
    expect((app.getState().playlist as Night).name).toBe("Old name");
  });

  it("an empty or unchanged name changes nothing", () => {
    app.setState({ history: [entry("e1", "Same", night("n1", "Same"))] });
    expect(A.renameNight("e1", "   ")).toBe(false);
    expect(A.renameNight("e1", "Same")).toBe(false);
  });

  it("the featured night (the app's example) is never renamed", () => {
    app.setState({ history: [entry("f", "Featured night", night("tdj-5j", "Featured night"))] });
    expect(A.canRename("f")).toBe(false);
    expect(A.renameNight("f", "Mine now")).toBe(false);
    A.askRename("f");
    expect(A.useRenameAsk.getState().id).toBeNull();
  });
});
