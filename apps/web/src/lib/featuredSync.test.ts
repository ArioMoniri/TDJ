import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("./store", () => ({ useStore: { getState: () => ({ playlist: null, setPlaylist: () => {} }) } }));
vi.mock("./toast", () => ({ toast: () => {} }));

import { isOlderCopy } from "./featuredSync";
import type { Playlist } from "./types";

const shipped = JSON.parse(
  readFileSync(join(__dirname, "../../public/featured/golden-double-peak.json"), "utf8"),
) as Playlist;
const clone = (p: Playlist) => JSON.parse(JSON.stringify(p)) as Playlist;

describe("an older copy of the featured night follows the shipped version", () => {
  it("the shipped night itself is not older", () => {
    expect(isOlderCopy(clone(shipped), shipped)).toBe(false);
  });
  it("the same night id with other sides, Spotify links or no Cumparsita is older", () => {
    const a = clone(shipped);
    a.tandas[14]!.songs[0]!.id = "68f9f78507";
    expect(isOlderCopy(a, shipped)).toBe(true);
    const b = clone(shipped);
    b.opening = undefined as unknown as Playlist["opening"];
    expect(isOlderCopy(b, shipped)).toBe(true);
    const c = clone(shipped);
    c.tandas[0]!.songs[0]!.spotify = { ...c.tandas[0]!.songs[0]!.spotify!, uri: "spotify:track:old" };
    expect(isOlderCopy(c, shipped)).toBe(true);
  });
  it("a copy under another id that keeps most of the night's sides is older", () => {
    const a = clone(shipped);
    a.id = "my-own-copy";
    a.tandas[3]!.songs[1]!.id = "b313688f75";
    expect(isOlderCopy(a, shipped)).toBe(true);
  });
  it("another night (few shared sides, another id) is left alone", () => {
    const a = clone(shipped);
    a.id = "another-night";
    a.tandas = a.tandas.slice(0, 5);
    expect(isOlderCopy(a, shipped)).toBe(false);
  });
});
