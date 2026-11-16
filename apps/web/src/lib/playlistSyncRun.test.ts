import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Playlist } from "@tdj/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSpotify } from "./spotifyFake";

/**
 * The real writers behind the playlist sync (lib/playlistSyncRun.ts), with `fetch` mocked: the BYO-key Spotify path
 * (this browser's own token: the night's rows written through byoWritePlaylist into a fake Spotify Web API and read
 * back) and the YouTube path (/api/google/youtube with `sync: true`: the rows the night plays tonight, the videos
 * already matched, the check's answer kept for the next sync).
 */

// (vitest runs in node: a Map stands in for the browser's localStorage, and the page's address for directPost)
const mem = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};
g.location = { pathname: "/", search: "", assign: () => {} };

const { playlistSyncer, _resetSyncCaches } = await import("./playlistSyncRun");
const { rememberExport, recordOf, statusOf, syncRows } = await import("./playlistSync");
const { useStore } = await import("./store");
const { orderedRows, spotifyPlanFor } = await import("./spotifyPlan");
const { withoutCortinas } = await import("./exportPaths");

const SPOTIFY = "https://api.spotify.com/v1";
type Call = { url: string; method: string; body: unknown; auth: string | null };

/** a fetch that answers /api/spotify/me (no hosted session), the fake Spotify Web API and `routes` */
function mockFetch(routes: Record<string, (body: unknown) => unknown> = {}) {
  const sp = fakeSpotify();
  const calls: Call[] = [];
  const json = (status: number, v: unknown) =>
    new Response(v === undefined ? null : JSON.stringify(v), {
      status,
      headers: { "content-type": "application/json" },
    });
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    const headers = new Headers(init.headers);
    calls.push({ url, method, body, auth: headers.get("authorization") });
    if (url.startsWith("/api/spotify/me")) return json(200, { hosted: false, user: null });
    if (url.startsWith(SPOTIFY)) {
      try {
        const v = await sp.call(method as "GET", url.slice(SPOTIFY.length), body);
        return json(200, v);
      } catch (e) {
        return json((e as { status?: number }).status ?? 500, { error: { message: String(e) } });
      }
    }
    const route = routes[url.split("?")[0]!];
    if (route) return json(200, route(body));
    return json(404, { error: `no mock for ${url}` });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { sp, calls };
}

let night: Playlist;
beforeEach(() => {
  mem.clear();
  _resetSyncCaches();
  night = JSON.parse(
    readFileSync(join(__dirname, "../../public/featured/golden-double-peak.json"), "utf8"),
  ) as Playlist;
  useStore.setState((s) => ({
    spotifyToken: {
      access: "byo-access",
      refresh: "byo-refresh",
      expires: Date.now() + 3_600_000,
      scope: "playlist-modify-private",
    },
    settings: { ...s.settings, spotifyClientId: "my-client-id", exportCover: false },
    overrides: {},
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playlist sync: the BYO-key Spotify writer (byoWritePlaylist)", () => {
  it("rewrites the exported playlist with the night's rows in order through this browser's token, reads it back", async () => {
    const tonight = withoutCortinas(night);
    const plan = spotifyPlanFor(tonight, {}, { includeCortinas: false, dropBypassed: true });
    // every row matched by the export already: nothing is searched again
    const found = Object.fromEntries(plan.items.map((it, i) => [it.id, `spotify:track:row${i}`]));
    const want = orderedRows(plan, new Map(Object.entries(found))).map((r) => r.uri);
    expect(want.length).toBeGreaterThan(20);
    const { sp, calls } = mockFetch();
    rememberExport(night, { service: "spotify", id: "pl1", url: "u", includeCortinas: false, found });

    await playlistSyncer.flush(night);

    expect(statusOf(night.id, "spotify")).toMatchObject({ state: "ok", error: undefined, cover: "same" });
    // the playlist holds exactly the rows, in order: one PUT replaces it (≤ 100 rows), any rest POSTed after it
    expect(sp.playlists.get("pl1")!.uris).toEqual(want);
    const writes = sp.log.filter((l) => l.method !== "GET");
    expect(writes[0]).toMatchObject({ method: "PUT", count: Math.min(100, want.length) });
    expect(writes.slice(1).every((w) => w.method === "POST")).toBe(true);
    // read back after the write
    expect(sp.log.some((l) => l.method === "GET" && l.path.includes("/playlists/pl1/items"))).toBe(true);
    // the DJ's own token on every Spotify call, no hosted session asked to write, no search
    const toSpotify = calls.filter((c) => c.url.startsWith(SPOTIFY));
    expect(toSpotify.length).toBeGreaterThan(0);
    expect(toSpotify.every((c) => c.auth === "Bearer byo-access")).toBe(true);
    expect(calls.some((c) => c.url.includes("/search"))).toBe(false);
    expect(calls.some((c) => c.url.startsWith("/api/spotify/playlist"))).toBe(false);
    // the matches are kept for the next sync
    expect(recordOf(night.id)!.targets[0]!.found).toMatchObject(found);
  });

  it("without a token or a client id it asks to reconnect Spotify and writes nothing", async () => {
    const { calls } = mockFetch();
    useStore.setState({ spotifyToken: null });
    rememberExport(night, { service: "spotify", id: "pl1", url: "u", includeCortinas: false });
    await playlistSyncer.flush(night);
    const st = statusOf(night.id, "spotify");
    expect(st.state).toBe("error");
    expect(st.error).toMatch(/Spotify/);
    expect(calls.some((c) => c.url.startsWith(SPOTIFY))).toBe(false);
  });
});

describe("playlist sync: the YouTube writer (sync: true)", () => {
  it("asks /api/google/youtube to put the playlist right with the night's rows and the videos already matched", async () => {
    const rows = syncRows(night, false);
    const first = rows.find((r) => r.id)!;
    // the Booth / the export matched one side already
    mem.set("tdj-youtube-matches", JSON.stringify({ [first.id]: "matched0001" }));
    let sent: Record<string, unknown> | null = null;
    mockFetch({
      "/api/google/youtube": (body) => {
        sent = body as Record<string, unknown>;
        const expected = (sent.expected as Array<{ videoId: string; query: string }>) ?? [];
        const videoIds = expected.map((e, i) => e.videoId || `vid${String(i).padStart(7, "0")}`);
        return {
          check: {
            ok: true,
            expected: expected.length,
            actual: expected.length,
            inPlace: expected.length,
            missing: [],
            extra: [],
            outOfOrder: [],
            unavailable: [],
            replaced: [],
            repairs: 0,
            rows: [],
            videoIds,
          },
        };
      },
    });
    rememberExport(night, { service: "youtube", id: "yt1", url: "u", includeCortinas: false });

    await playlistSyncer.flush(night);

    expect(sent).not.toBeNull();
    const body = sent as unknown as {
      sync: boolean;
      verify: boolean;
      playlistId: string;
      expected: Array<{ videoId: string; query: string }>;
    };
    expect(body.sync).toBe(true);
    expect(body.verify).toBe(true);
    expect(body.playlistId).toBe("yt1");
    // the rows the night plays tonight (no cortinas here), each with a search for the ones not matched yet
    expect(body.expected).toHaveLength(rows.length);
    expect(body.expected[0]).toMatchObject({ videoId: "matched0001" });
    expect(body.expected.every((e) => e.query.length > 0)).toBe(true);
    const st = statusOf(night.id, "youtube");
    expect(st).toMatchObject({ state: "ok", cover: "skipped" });
    // what the check found is kept for the next sync and remembered as the sides' matches
    const kept = recordOf(night.id)!.targets[0]!.found!;
    expect(Object.keys(kept).length).toBe(rows.filter((r) => r.id).length);
    expect(kept[first.id]).toBe("matched0001");
    expect(Object.keys(JSON.parse(mem.get("tdj-youtube-matches") ?? "{}")).length).toBeGreaterThan(1);
  });

  it("a quota answer is said in plain words and the playlist stays due", async () => {
    mockFetch({
      "/api/google/youtube": () => ({
        check: {
          ok: false,
          expected: 3,
          actual: 0,
          inPlace: 0,
          missing: [],
          extra: [],
          outOfOrder: [],
          unavailable: [],
          replaced: [],
          repairs: 0,
          rows: [],
          videoIds: [],
          error: "quotaExceeded",
          quota: true,
        },
      }),
    });
    rememberExport(night, { service: "youtube", id: "yt1", url: "u", includeCortinas: false });
    await playlistSyncer.flush(night);
    const st = statusOf(night.id, "youtube");
    expect(st.state).toBe("error");
    expect(st.error).not.toBe("quotaExceeded");
    expect(st.error).toMatch(/YouTube/i);
  });
});
