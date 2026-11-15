/**
 * The app adapter answers every /api/* route on the device. Invariant: for the same request, the local answer
 * (lib/app/routes.ts → `dispatch`, with the index read the way the app bundle hands it over and the native side
 * faked) equals the server route's answer (apps/web/src/app/api/**), status, type and body. The routes the app runs
 * unchanged (lib/app/deviceRoutes.ts) are the device copies the app build ships (test/device-routes.setup.ts), and
 * every model call on both sides goes through the provider layer (lib/ai/providers.ts), faked here.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exportNight, type Playlist } from "@tdj/core";
import { DATA_FILES, type DataFiles } from "@tdj/core/data";
import { findRoot } from "@tdj/core/load";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as AddSide from "@/app/api/add-side/route";
import * as AiEdit from "@/app/api/ai/edit/route";
import * as AiRefine from "@/app/api/ai/refine/route";
import * as AiReview from "@/app/api/ai/review/route";
import * as AiSwap from "@/app/api/ai/swap/route";
import * as Benchmark from "@/app/api/benchmark/route";
import * as Build from "@/app/api/build/route";
import * as CheckEdit from "@/app/api/check-edit/route";
import * as Compose from "@/app/api/compose/route";
import * as Export from "@/app/api/export/route";
import * as Feedback from "@/app/api/feedback/route";
import * as Fill from "@/app/api/fill/route";
import * as Improve from "@/app/api/improve/route";
import * as Meta from "@/app/api/meta/route";
import * as NightResolve from "@/app/api/night/resolve/route";
import * as Preview from "@/app/api/preview/route";
import * as Resolve from "@/app/api/resolve/route";
import * as Search from "@/app/api/search/route";
import * as SongSearch from "@/app/api/song-search/route";
import * as SpotifyMatch from "@/app/api/spotify/match/route";
import * as SpotifyPlaylist from "@/app/api/spotify/playlist/route";
import * as Swap from "@/app/api/swap/route";
import * as SwapOptions from "@/app/api/swap-options/route";
import * as SwapTrack from "@/app/api/swap-track/route";
import { clearPreviewCache } from "@/lib/api/net";
import { deviceAsk } from "./ai";
import { appDeps, deviceRuntime } from "./deps";
import type { HostCalls } from "./host";
import { dispatch } from "./routes";
import { setDeviceRuntime } from "./server/runtime";
import { KEYCHAIN_KEY } from "./target";

const fake = vi.hoisted(() => {
  const model = async (a: { system: string; user: string; json?: boolean }) => {
    if (a.system.startsWith("You are a connection test")) return "OK";
    if (a.system.includes("choosing one replacement side")) {
      const id = /id=([^\s·]+)/.exec(a.user)?.[1] ?? "";
      return JSON.stringify({ id, why: "same family, calmer" });
    }
    if (a.json)
      return '{"options": {"hours": 3}, "feedback": ["more-vals"], "note": "Three hours, more vals."}';
    return "1. Swap tanda 3 for a Di Sarli.";
  };
  const session = { access: "AT-test", refresh: "RT", expires: 4_102_444_800_000, authorizedAt: 1 };
  // the routes that read the global fetch when they load (/api/fill) see the same upstream on both sides
  const upstream: { fn: typeof fetch } = { fn: () => Promise.reject(new Error("no upstream yet")) };
  globalThis.fetch = ((...a: Parameters<typeof fetch>) => upstream.fn(...a)) as typeof fetch;
  return { model, session, upstream };
});

// one fake model behind the provider layer: the server's routes reach it through lib/server/llm.ts, the app's
// through lib/app/ai.ts (deviceAsk), with the same request
vi.mock("@/lib/ai/providers", async (orig) => ({
  ...(await orig<typeof import("@/lib/ai/providers")>()),
  providerFor: () => ({
    id: "anthropic",
    model: "fake",
    complete: async (r: { system: string; user: string; json?: boolean }) => ({
      text: await fake.model(r),
      toolCalls: [],
    }),
  }),
}));
// the device copies (generated for the run by test/device-routes.setup.ts, by file path: they exist only then)
vi.mock(
  "@/lib/app/deviceRoutes",
  () => import(/* @vite-ignore */ new URL("./__device__/deviceRoutes.ts", import.meta.url).pathname),
);
vi.mock("@/lib/server/spotify", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/spotify")>()),
  hostedEnabled: async () => true,
  withSession: async () => ({ session: fake.session }),
}));

/** Deezer, MusicBrainz and Spotify as they answer: the server reaches them with fetch, the app natively. */
async function upstream(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  const j = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url.host === "api.deezer.com") {
    if (url.pathname === "/infos") return j({ open: true });
    if (url.pathname.startsWith("/track/")) {
      const id = url.pathname.split("/")[2];
      if (id === "404") return j({ error: { type: "DataException" } });
      return j({
        id,
        preview: `https://cdnt-preview.dzcdn.net/api/1/1/x/${id}.mp3?hdnea=exp=4102444800~hmac=ab`,
      });
    }
    if (url.pathname === "/search")
      return j({
        data: [
          {
            id: 3135556,
            title: "La Cumparsita",
            duration: 172,
            preview: "https://cdnt-preview.dzcdn.net/api/1/1/c/3135556.mp3?hdnea=exp=1~hmac=x",
            link: "https://www.deezer.com/track/3135556",
            artist: { name: "Juan D'Arienzo" },
            album: { title: "Juan D'Arienzo 1951", cover_medium: "https://e-cdns-images.dzcdn.net/a.jpg" },
          },
        ],
      });
  }
  if (url.host === "musicbrainz.org")
    return j({
      recordings: [
        {
          id: "mb-1",
          title: "La Cumparsita",
          length: 171000,
          "first-release-date": "1951-03-01",
          "artist-credit": [{ name: "Juan D'Arienzo y su Orquesta Típica" }],
          releases: [{ date: "2003" }, { date: "1951-03-01" }],
        },
      ],
    });
  if (url.host === "api.spotify.com") {
    const auth = new Headers(init?.headers).get("authorization");
    if (auth !== `Bearer ${fake.session.access}`) return j({ error: "no token" }, 401);
    if (url.pathname === "/v1/search") {
      const q = url.searchParams.get("q") ?? "";
      return j({
        tracks: {
          items: [
            {
              uri: `spotify:track:${q.length.toString(36).padStart(4, "0")}`,
              name: q.replace(/^track:"?|"? artist:.*$/g, ""),
              artists: [{ name: "Juan D'Arienzo" }],
              duration_ms: 172000,
              album: { name: "Juan D'Arienzo 1941", release_date: "1941" },
              external_urls: { spotify: "https://open.spotify.com/track/x" },
            },
          ],
        },
      });
    }
    if (url.pathname === "/v1/me") return j({ id: "dj", display_name: "DJ" });
    if (url.pathname === "/v1/me/playlists")
      return j({ id: "pl1", external_urls: { spotify: "https://open.spotify.com/playlist/pl1" } });
    if (url.pathname.startsWith("/v1/playlists/")) return j({ snapshot_id: "s" });
  }
  return j({ error: `unexpected ${url.href}` }, 599);
}

/** The native side, faked: what the Rust commands answer (lib/app/host.ts). */
const host: HostCalls = {
  fetch: async (r) => {
    const res = await upstream(r.url, { method: r.method, headers: r.headers, body: r.body });
    return { status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() };
  },
  ask: (ai, r) => deviceAsk(ai, r),
  sql: async () => {
    throw new Error("no database in this test");
  },
  spotify: {
    enabled: async () => true,
    access: async () => ({ access: fake.session.access, expires: fake.session.expires }),
    logout: async () => {},
  },
  linked: async () => false,
  remote: async () => ({ status: 503, headers: {}, body: "" }),
};

let local: ReturnType<typeof appDeps>;
beforeAll(() => {
  const root = findRoot(join(process.cwd(), "../.."));
  const files: Record<string, string> = {};
  for (const [k, rel] of Object.entries(DATA_FILES)) {
    const p = join(root, rel);
    if (existsSync(p)) files[k] = readFileSync(p, "utf8");
  }
  local = appDeps(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k, JSON.parse(v)])) as DataFiles,
    host,
  );
  vi.stubGlobal("fetch", upstream);
  fake.upstream.fn = upstream as typeof fetch;
  setDeviceRuntime(deviceRuntime(local));
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => clearPreviewCache());

const BASE = "http://localhost:3000";
type Init = { method?: string; body?: unknown; headers?: Record<string, string> };
const req = (path: string, i: Init = {}) =>
  new Request(BASE + path, {
    method: i.method ?? (i.body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", ...(i.headers ?? {}) },
    body: i.body === undefined ? undefined : typeof i.body === "string" ? i.body : JSON.stringify(i.body),
  });

async function read(r: Response) {
  const text = await r.text();
  const type = r.headers.get("content-type") ?? "";
  return {
    status: r.status,
    type,
    location: r.headers.get("location"),
    disposition: r.headers.get("content-disposition"),
    body: type.includes("json") && text ? JSON.parse(text) : text,
  };
}

/**
 * The server route and the app adapter on the same request. `serverInit`/`appInit` differ only where the two runtimes
 * carry the DJ's key differently (a BYOK header on the web, the Keychain in the app).
 */
async function same(
  handler: (r: Request) => Promise<Response>,
  path: string,
  init: Init = {},
  o: { appInit?: Init; normalise?: (b: unknown) => unknown } = {},
) {
  const server = await read(await handler(req(path, init)));
  const app = await read(await dispatch(req(path, o.appInit ?? init), local));
  const n = o.normalise ?? ((b: unknown) => b);
  expect({ ...app, body: n(app.body) }).toEqual({ ...server, body: n(server.body) });
  return server;
}

describe("engine routes: local result equals the server's", () => {
  const FIXED = new Date("2026-11-14T21:00:00Z");
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIXED);
  });
  afterAll(() => vi.useRealTimers());

  let night: Record<string, unknown>;
  it("compose (with auto-improve, as Settings has it on by default)", async () => {
    const s = await same(Compose.POST, "/api/compose", {
      body: { hours: 1.5, seed: 777, autoImprove: true },
    });
    expect(s.status).toBe(200);
    night = s.body as Record<string, unknown>;
  });
  it("compose without auto-improve, with DJ overrides", async () => {
    await same(Compose.POST, "/api/compose", {
      body: { hours: 1, seed: 31, overrides: { hiddenTitles: ["la cumparsita"] } },
    });
  });
  it("compose rejects what the server rejects", async () => {
    await same(Compose.POST, "/api/compose", { body: "{not json" });
    await same(Compose.POST, "/api/compose", { body: { tangoTandaSize: 7 } });
    await same(Compose.POST, "/api/compose", { body: [1, 2] });
  });
  it("improve", async () => {
    await same(Improve.POST, "/api/improve", { body: { playlist: night } });
    await same(Improve.POST, "/api/improve", { body: {} });
  });
  it("benchmark", async () => {
    await same(Benchmark.POST, "/api/benchmark", { body: { playlist: night } });
  });
  it("swap a tanda, and the three choices nearest the plan", async () => {
    await same(Swap.POST, "/api/swap", { body: { playlist: night, index: 2 } });
    await same(Swap.POST, "/api/swap", { body: { playlist: night, index: 2, options: true } });
  });
  it("swap options and a swapped side", async () => {
    await same(SwapOptions.POST, "/api/swap-options", {
      body: { playlist: night, tandaIndex: 1, trackIndex: 1, query: "poema" },
    });
    await same(SwapTrack.POST, "/api/swap-track", {
      body: { playlist: night, tandaIndex: 1, trackIndex: 2 },
    });
    const tandas = night.tandas as Array<{ songs: Array<{ id: string }> }>;
    await same(SwapTrack.POST, "/api/swap-track", {
      body: { playlist: night, tandaIndex: 0, trackIndex: 0, songId: tandas[3]!.songs[0]!.id, force: true },
    });
  });
  it("the rule check before an edit: violations with facts, and suggestions", async () => {
    const tandas = night.tandas as Array<{ songs: Array<{ id: string }> }>;
    // another tanda's side in tanda 1's first chair
    const after = {
      ...night,
      tandas: tandas.map((t, i) =>
        i === 0 ? { ...t, songs: t.songs.map((s, k) => (k === 0 ? tandas[3]!.songs[0]! : s)) } : t,
      ),
    };
    await same(CheckEdit.POST, "/api/check-edit", { body: { before: night, after } });
    await same(CheckEdit.POST, "/api/check-edit", { body: {} });
  });
  it("meta (only where the database lives differs: the device)", async () => {
    const server = await read(await Meta.GET(req("/api/meta")));
    const app = await read(await dispatch(req("/api/meta"), local));
    expect((app.body as { storage: string }).storage).toBe("device");
    const { storage: _a, ...a } = app.body as Record<string, unknown>;
    const { storage: _b, ...b } = server.body as Record<string, unknown>;
    expect(a).toEqual(b);
    expect(app.status).toBe(server.status);
  });
  it("search", async () => {
    await same(Search.GET, "/api/search?q=pugliese");
    await same(Search.GET, "/api/search?q=a");
  });
  it("feedback", async () => {
    await same(Feedback.POST, "/api/feedback", {
      body: { options: { hours: 4 }, feedback: ["more-vals", "nonsense"] },
    });
  });
  it("exports (M3U8, CSV, Rekordbox) with the same file name", async () => {
    for (const format of ["m3u8", "csv", "rekordbox"])
      await same(Export.POST, "/api/export", { body: { playlist: night, format, includeCortinas: false } });
    await same(Export.POST, "/api/export", { body: { playlist: night, format: "exe" } });
  });
});

describe("network routes: Deezer and MusicBrainz from the device", () => {
  it("resolve", async () => {
    await same(
      Resolve.POST,
      "/api/resolve",
      { body: { title: "La Cumparsita", orchestra: "Juan D'Arienzo", year: 1951 } },
      // the lookup time is in every candidate
      { normalise: (b) => JSON.parse(JSON.stringify(b).replace(/"matchedAt":"[^"]+"/g, '"matchedAt":""')) },
    );
    await same(Resolve.POST, "/api/resolve", { body: { title: "" } });
  }, 20_000);
  it("resolve status", async () => {
    await same(Resolve.GET, "/api/resolve");
  }, 20_000);
  it("preview: a fresh signed link as JSON, as a redirect, and 404", async () => {
    await same(Preview.GET, "/api/preview?provider=deezer&id=3135556&json=1");
    clearPreviewCache();
    await same(Preview.GET, "/api/preview?provider=deezer&id=3135556");
    await same(Preview.GET, "/api/preview?provider=deezer&id=404&json=1");
    await same(Preview.GET, "/api/preview?provider=youtube&id=x&json=1");
  });
});

describe("model routes, run unchanged on the device: the DJ's own key (web: BYOK header, app: Keychain)", () => {
  const web = { "x-ai-provider": "anthropic", "x-ai-key": "sk-test", "x-ai-model": "" };
  const app = { ...web, "x-ai-key": KEYCHAIN_KEY };
  let night: { tandas: unknown[] };
  beforeAll(async () => {
    night = await (await Compose.POST(req("/api/compose", { body: { hours: 1, seed: 5 } }))).json();
  });
  it("review quota: no shared key", async () => {
    await same(AiReview.GET, "/api/ai/review");
  });
  it("review: connection test and a written review", async () => {
    await same(
      AiReview.POST,
      "/api/ai/review",
      { body: { test: true }, headers: web },
      { appInit: { body: { test: true }, headers: app } },
    );
    await same(
      AiReview.POST,
      "/api/ai/review",
      { body: { playlist: night }, headers: web },
      { appInit: { body: { playlist: night }, headers: app } },
    );
  });
  it("review without any key: the same 401", async () => {
    await same(AiReview.POST, "/api/ai/review", { body: { test: true } });
  });
  it("refine with a key, and by keywords without one", async () => {
    const body = { instruction: "more vals, three hours", options: { hours: 4, seed: 9 } };
    await same(AiRefine.POST, "/api/ai/refine", { body, headers: web }, { appInit: { body, headers: app } });
    await same(AiRefine.POST, "/api/ai/refine", {
      body: { instruction: "no Canaro, more vals", options: { seed: 3 } },
    });
    await same(AiRefine.POST, "/api/ai/refine", { body: { instruction: "" } });
  });
  it("AI pick in the Swap sheet", async () => {
    const body = { playlist: night, tandaIndex: 1, trackIndex: 1 };
    await same(AiSwap.POST, "/api/ai/swap", { body, headers: web }, { appInit: { body, headers: app } });
    await same(AiSwap.POST, "/api/ai/swap", { body });
  });
  it("Edit with AI: with a model, by plain words without one, and the refusals", async () => {
    const body = { playlist: night, instruction: "more vals" };
    await same(AiEdit.POST, "/api/ai/edit", { body, headers: web }, { appInit: { body, headers: app } });
    await same(AiEdit.POST, "/api/ai/edit", { body });
    await same(AiEdit.POST, "/api/ai/edit", { body: { playlist: night, instruction: "" } });
    await same(AiEdit.POST, "/api/ai/edit", { body: { instruction: "x" } });
  });
});

describe("round 22 routes, run unchanged on the device", () => {
  let night: { tandas: Array<{ songs: Array<{ id: string }> }> };
  afterAll(() => vi.useRealTimers());
  beforeAll(async () => {
    // a pinned side carries the time it was pinned
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T21:00:00Z"));
    night = await (await Compose.POST(req("/api/compose", { body: { hours: 1, seed: 7 } }))).json();
  });
  it("song search", async () => {
    await same(SongSearch.POST, "/api/song-search", { body: { query: { text: "flete" } } });
    await same(SongSearch.POST, "/api/song-search", {
      body: { query: { orchestra: "Di Sarli", yearFrom: 1940, yearTo: 1945, rhythms: ["vals"], limit: 5 } },
    });
  });
  it("add a side: accepted and refused", async () => {
    const first = (
      await (await SongSearch.POST(req("/api/song-search", { body: { query: { text: "a" } } }))).json()
    ).results[0]?.id;
    await same(AddSide.POST, "/api/add-side", { body: { playlist: night, tandaIndex: 0, songId: first } });
    await same(AddSide.POST, "/api/add-side", { body: { playlist: night, tandaIndex: 0, songId: "nope" } });
    await same(AddSide.POST, "/api/add-side", { body: {} });
  });
  it("build by hand: suggestions, lookup and the finished night", async () => {
    const draft = [night.tandas[0]!.songs.map((s) => s.id)];
    await same(Build.POST, "/api/build", { body: { draft, options: { hours: 2, seed: 1 } } });
    await same(Build.POST, "/api/build", { body: { lookup: draft[0] } });
    await same(Build.POST, "/api/build", { body: { draft, options: { hours: 2, seed: 1 }, finish: true } });
  });
  it("fill from Deezer and MusicBrainz (the app's native client), and bad input", async () => {
    const song = { id: "s1", title: "El Flete", orchestra: "Juan D'Arienzo", year: 1936 };
    await same(Fill.POST, "/api/fill", { body: { source: "deezer", song } });
    await same(Fill.POST, "/api/fill", { body: { source: "musicbrainz", song } });
    await same(Fill.POST, "/api/fill", { body: { source: "spotify", song } });
    await same(Fill.POST, "/api/fill", { body: { source: "deezer", song: { title: "x" } } });
  });
});

describe("shared nights and rooms", () => {
  it("a shared night opens against the app's catalogue, as on a server", async () => {
    const night = (await (
      await Compose.POST(req("/api/compose", { body: { hours: 1, seed: 4 } }))
    ).json()) as Playlist;
    await same(NightResolve.POST, "/api/night/resolve", { body: { night: exportNight(night) } });
    await same(NightResolve.POST, "/api/night/resolve", { body: { night: { v: 99 } } });
  });
  it("rooms and short links need a linked server: off, with the reason", async () => {
    const rooms = await dispatch(req("/api/rooms"), local);
    expect(await rooms.json()).toEqual({ available: false, shortLinks: false });
    for (const [path, init] of [
      ["/api/rooms", { body: { user: "Ana", name: "x" } }],
      ["/api/rooms/ABC234", {}],
      ["/api/night", { body: { night: {} } }],
      ["/api/night?id=abc", {}],
    ] as const) {
      const r = await dispatch(req(path, init), local);
      expect(r.status, path).toBe(404);
      expect((await r.json()).error).toMatch(/Settings → Connections/);
    }
  });
});

describe("Spotify with the DJ's session (web: sealed cookie, app: Keychain)", () => {
  const items = [
    { id: "s1", title: "El Flete", orchestra: "Juan D'Arienzo", year: 1936, durationSec: 172 },
    { id: "s2", title: "Pensalo Bien", orchestra: "Juan D'Arienzo", year: 1938, durationSec: 150 },
  ];
  it("match", async () => {
    await same(SpotifyMatch.POST, "/api/spotify/match", { body: { items } });
    await same(SpotifyMatch.POST, "/api/spotify/match", { body: { items: [] } });
  });
  it("playlist from matched uris, and an update", async () => {
    const uris = ["spotify:track:aaaa", "spotify:track:bbbb"];
    await same(SpotifyPlaylist.POST, "/api/spotify/playlist", {
      body: { uris, includeCortinas: true, name: "Saturday" },
    });
    await same(SpotifyPlaylist.POST, "/api/spotify/playlist", {
      body: { uris, playlistId: "pl1", replace: true, name: "Saturday", description: "x" },
    });
  });
});
