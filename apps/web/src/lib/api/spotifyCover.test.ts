import { describe, expect, it } from "vitest";
import type { ApiDeps, SpotifySession } from "./deps";
import { spotifyCover } from "./spotifyCover";

/** a fake runtime: the session's scopes and a fake Spotify that records the PUT */
function deps(session: SpotifySession | null, status = 202) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const d = {
    guard: async () => null,
    fetch: async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status });
    },
    spotify: { enabled: async () => true, session: async () => session },
  } as unknown as ApiDeps;
  return { d, calls };
}
const post = (body: unknown) =>
  new Request("http://localhost/api/spotify/cover", { method: "POST", body: JSON.stringify(body) });

describe("/api/spotify/cover (fake Spotify)", () => {
  it("PUTs the JPEG with the session's token", async () => {
    const { d, calls } = deps({ access: "srv", expires: 0, scopes: ["ugc-image-upload"] });
    const r = await spotifyCover(post({ playlistId: "pl1", jpeg: "/9j/AA==" }), d);
    expect(await r.json()).toEqual({ added: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toMatch(/\/playlists\/pl1\/images$/);
    expect(calls[0]!.init?.method).toBe("PUT");
    const headers = (calls[0]!.init?.headers ?? {}) as Record<string, string>;
    expect(headers.authorization).toBe("Bearer srv");
    expect(calls[0]!.init?.body).toBe("/9j/AA==");
  });
  it("a session without ugc-image-upload: nothing is sent, the answer says why", async () => {
    const { d, calls } = deps({ access: "srv", expires: 0, scopes: ["playlist-modify-private"] });
    const r = await spotifyCover(post({ playlistId: "pl1", jpeg: "AAAA" }), d);
    expect(await r.json()).toEqual({ added: false, reason: "scope" });
    expect(calls).toHaveLength(0);
  });
  it("Spotify's 401 / 403 is the missing scope; bad input and too large a body are refused before Spotify", async () => {
    const a = deps({ access: "srv", expires: 0 }, 403);
    expect(await (await spotifyCover(post({ playlistId: "pl1", jpeg: "AAAA" }), a.d)).json()).toEqual({
      added: false,
      reason: "scope",
    });
    const b = deps({ access: "srv", expires: 0, scopes: ["ugc-image-upload"] });
    for (const body of [
      { playlistId: "../me", jpeg: "AAAA" },
      { playlistId: "pl1", jpeg: "not base64!" },
      { playlistId: "pl1", jpeg: "A".repeat(256 * 1024 + 4) },
    ])
      expect(await (await spotifyCover(post(body), b.d)).json()).toEqual({ added: false, reason: "input" });
    expect(b.calls).toHaveLength(0);
    const none = deps(null);
    expect((await spotifyCover(post({}), none.d)).status).toBe(401);
  });
});
