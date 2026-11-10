import { describe, expect, it } from "vitest";
import { orderedUris, playlistIdFrom } from "./spotifyPlan";

describe("playlistIdFrom", () => {
  it("reads a link, a share link with ?si=, a spotify: URI and a bare 22-character id", () => {
    expect(playlistIdFrom("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")).toBe(
      "37i9dQZF1DXcBWIGoYBM5M",
    );
    expect(playlistIdFrom(" https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=abc ")).toBe(
      "37i9dQZF1DXcBWIGoYBM5M",
    );
    expect(playlistIdFrom("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBe("37i9dQZF1DXcBWIGoYBM5M");
    expect(playlistIdFrom("37i9dQZF1DXcBWIGoYBM5M")).toBe("37i9dQZF1DXcBWIGoYBM5M");
  });
  it("is null for anything that is not a playlist", () => {
    expect(playlistIdFrom("")).toBeNull();
    expect(playlistIdFrom("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")).toBeNull();
    expect(playlistIdFrom("hello")).toBeNull();
  });
});

describe("orderedUris", () => {
  it("puts a match back into its own row and drops rows never found", () => {
    const plan = {
      slots: [{ uri: "spotify:track:a" }, { id: "c1" }, { uri: "spotify:track:b" }, { id: "x" }],
    };
    expect(orderedUris(plan, new Map([["c1", "spotify:track:c"]]))).toEqual([
      "spotify:track:a",
      "spotify:track:c",
      "spotify:track:b",
    ]);
  });
});
