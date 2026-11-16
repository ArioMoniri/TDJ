import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiDeps } from "./deps";
import { serviceSearch } from "./serviceSearch";
import { externalSide } from "./tandaSet";

const deps = (o: { enabled?: boolean; session?: boolean }): ApiDeps =>
  ({
    spotify: {
      enabled: async () => o.enabled ?? true,
      session: async () =>
        o.session ? { access: "acc", expires: Date.now() + 1e6, setCookie: "s=1" } : null,
    },
  }) as unknown as ApiDeps;
const post = (body: unknown) =>
  new Request("http://x/api/services/search", { method: "POST", body: JSON.stringify(body) });

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/services/search", () => {
  it("says why a service did not search: not offered here, or the DJ is not connected", async () => {
    const off = await (await serviceSearch(post({ q: "bahia blanca" }), deps({ enabled: false }))).json();
    expect(off.services).toEqual([{ id: "spotify", state: "off", tracks: [] }]);
    const out = await (await serviceSearch(post({ q: "bahia blanca" }), deps({}))).json();
    expect(out.services[0].state).toBe("signed-out");
  });
  it("answers the DJ's Spotify tracks as service recordings (only playable ones), with the refreshed cookie", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return new Response(
        JSON.stringify({
          tracks: {
            items: [
              {
                id: "t1",
                uri: "spotify:track:t1",
                name: "Bahía Blanca",
                artists: [{ name: "Carlos Di Sarli" }],
                duration_ms: 171000,
                album: { name: "Bahía Blanca", release_date: "1995-01-01" },
                external_ids: { isrc: "ARF000000001" },
              },
              {
                id: "t2",
                uri: "spotify:track:t2",
                name: "X",
                artists: [],
                duration_ms: 1,
                is_playable: false,
              },
            ],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const r = await serviceSearch(post({ q: "bahia blanca", limit: 50 }), deps({ session: true }));
    expect(r.headers.get("set-cookie")).toBe("s=1");
    const j = await r.json();
    expect(j.services[0].state).toBe("ok");
    expect(j.services[0].tracks).toEqual([
      {
        service: "spotify",
        id: "t1",
        uri: "spotify:track:t1",
        title: "Bahía Blanca",
        artists: ["Carlos Di Sarli"],
        album: "Bahía Blanca",
        year: 1995,
        durationSec: 171,
        previewUrl: null,
        isrc: "ARF000000001",
      },
    ]);
    const u = new URL(calls[0]!);
    expect(u.pathname.endsWith("/search")).toBe(true);
    expect(u.searchParams.get("limit")).toBe("10");
    expect(u.searchParams.get("market")).toBe("from_token");
  });
  it("a rate limit reads busy, never an empty answer passed off as nothing found", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 429, headers: { "retry-after": "60" } }));
    const j = await (await serviceSearch(post({ q: "bahia" }), deps({ session: true }))).json();
    expect(j.services[0].state).toBe("busy");
  });
  it("a query under two letters asks no service", async () => {
    const j = await (await serviceSearch(post({ q: "b" }), deps({ session: true }))).json();
    expect(j.services).toEqual([]);
  });
});

describe("a service recording sent as a side (POST /api/tanda-set)", () => {
  it("keeps the fields a side shows and plays, and only a real Spotify track uri", () => {
    const s = externalSide({
      id: "ext:spotify:t1",
      title: "Bahía Blanca",
      orchestra: "Carlos Di Sarli",
      orchestraId: "carlos-di-sarli",
      rhythm: "vals",
      singer: null,
      year: 1995,
      durationSec: 171,
      spotify: { uri: "spotify:track:t1" },
      audio: { chroma: [1, 2, 3] },
      locked: true,
    });
    expect(s).toMatchObject({
      id: "ext:spotify:t1",
      rhythm: "vals",
      vocal: false,
      yearApprox: true,
      spotify: { uri: "spotify:track:t1" },
    });
    expect(s).not.toHaveProperty("audio");
    expect(
      externalSide({ id: "ext:x", title: "T", spotify: { uri: "javascript:alert(1)" } })?.spotify,
    ).toBeNull();
  });
  it("refuses anything that is not a service recording (a catalogue id goes as a string)", () => {
    expect(externalSide({ id: "carlos-di-sarli-1", title: "T" })).toBeNull();
    expect(externalSide({ id: "ext:x" })).toBeNull();
    expect(externalSide(null)).toBeNull();
  });
});
