import { beforeEach, describe, expect, it } from "vitest";
import { type PlayerTrack, stopAt, usePlayer } from "./player";

const song = (id: string): PlayerTrack => ({
  id,
  title: id,
  orchestra: "O",
  source: { kind: "preview", ref: `/p/${id}` },
});
const cortina = (stopSec: number): PlayerTrack => ({
  id: "c",
  title: "Cortina",
  orchestra: "Band",
  kind: "cortina",
  stopSec,
  source: { kind: "preview", ref: "/p/c" },
});

describe("cortina play length in the player", () => {
  beforeEach(() => usePlayer.getState().close());
  it("stopAt: the chain's clip, the cortina's own stop, or the shorter of the two", () => {
    expect(stopAt(song("a"), null)).toBeNull();
    expect(stopAt(cortina(45), null)).toBe(45);
    expect(stopAt(song("a"), { label: "T", tracks: [], index: 0, clipSec: 10 })).toBe(10);
    expect(stopAt(cortina(45), { label: "T", tracks: [], index: 0, clipSec: 10 })).toBe(10);
    expect(stopAt(cortina(8), { label: "T", tracks: [], index: 0, clipSec: 10 })).toBe(8);
  });
  it("a cortina played on its own ends at its stop second; a song keeps going", () => {
    const p = usePlayer.getState();
    p.play(cortina(45));
    p._tick(44, 200);
    expect(usePlayer.getState().playing).toBe(true);
    p._tick(45, 200);
    expect(usePlayer.getState().playing).toBe(false);
    p.play(song("a"));
    p._tick(120, 200);
    expect(usePlayer.getState().playing).toBe(true);
    expect(usePlayer.getState().position).toBe(120);
  });
  it("a set preview chain hands over from the cortina at its stop, not at the clip", () => {
    const p = usePlayer.getState();
    p.playQueue("Set", [song("a"), cortina(8), song("b")], 10);
    p._tick(10, 30);
    expect(usePlayer.getState().track?.id).toBe("c");
    p._tick(7.9, 30);
    expect(usePlayer.getState().track?.id).toBe("c");
    p._tick(8, 30);
    expect(usePlayer.getState().track?.id).toBe("b");
    expect(usePlayer.getState().queue?.index).toBe(2);
  });
});
