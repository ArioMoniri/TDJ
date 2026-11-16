/**
 * Connectors: hosted "Log in with Spotify" (server-side code exchange, sealed cookie, transparent session),
 * playlist creation through the server, the BYO fallback when the deployment has no Spotify credentials, direct
 * Google (Drive + YouTube, incremental scopes) and Dropbox (PKCE) logins with their uploads, and Pipedream Connect
 * (token → Connect Link, accounts, proxy export). Spotify, Google, Dropbox and Pipedream are mocked by a small HTTP
 * server; a second `next start` on port 3101 points at it through the *_URL environment variables.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

const MOCK_PORT = 3199;
const APP_PORT = 3101;
const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
const APP = `http://127.0.0.1:${APP_PORT}`;

interface Hit {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}
const hits: Hit[] = [];
const last = (re: RegExp) => [...hits].reverse().find((h) => re.test(`${h.method} ${h.url}`));
/** Spotify search mock: after this many searches every search answers 429 (Infinity = never); `retryAfter` is the header; `delayMs` slows every search. */
/**
 * round 17: a vocal side's credit must name its singer, as Spotify's credits do: the mock's right recording comes in two
 * credits under one URI — the orchestra alone (an instrumental side) and the orchestra with the singers the index knows
 * for that title and orchestra (a sung side takes the credit that names its own singer)
 */
const fold = (x: string) =>
  x
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const sungBy = new Map<string, Array<{ orchestra: string; singer: string }>>();
for (const s of JSON.parse(
  readFileSync(path.join(process.cwd(), "../../data/index/songs.json"), "utf8"),
) as Array<{ title: string; orchestra: string; vocal?: boolean; singer?: string | null }>)
  if (s.vocal && s.singer) {
    const k = s.title.replace(/"/g, "");
    sungBy.set(k, [...(sungBy.get(k) ?? []), { orchestra: fold(s.orchestra), singer: s.singer }]);
  }
const singersOf = (title: string, artist: string) => [
  ...new Set(
    (sungBy.get(title) ?? []).filter((x) => x.orchestra.includes(fold(artist))).map((x) => x.singer),
  ),
];
let searchSeq = 0;
const searchLimit = { after: Number.POSITIVE_INFINITY, count: 0, retryAfter: 30, delayMs: 0 };
/**
 * Spotify playlists the mock holds, as Spotify would: PUT replaces, POST appends, GET reads back in pages of ≤ 100
 * with `next`. `dropPosts` names POST calls (counted from `posts = 0`) that answer 201 and store nothing — the
 * "chunk 2 never arrived" a DJ saw; `unplayable` are tracks the listener's market cannot play.
 */
const lists = new Map<string, { uris: string[]; snap: number }>();
/** the last file Dropbox and Drive stored, for their metadata answers */
const stored = { dropbox: Buffer.alloc(0), drive: Buffer.alloc(0) };
const spotifyWrites = { posts: 0, dropPosts: new Set<number>(), unplayable: new Set<string>() };
/** the cover JPEGs the mock received for pl1 (their base64 lengths) */
const covers: number[] = [];
/** YouTube search mock: this many searches (counted since the last `hits.length = 0`) answer, the next one is quotaExceeded. */
const ytLimit = { searches: 2 };
/** the YouTube playlist the mock holds */
const yt = {
  items: [] as Array<{ id: string; videoId: string }>,
  seq: 0,
  inserts: 0,
  dropInserts: new Set<number>(),
};

function mockServer(): http.Server {
  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      const url = req.url ?? "";
      hits.push({ method: req.method ?? "GET", url, headers: req.headers, body });
      const json = (code: number, j: unknown) => {
        const send = () => {
          res.writeHead(code, { "content-type": "application/json" });
          res.end(JSON.stringify(j));
        };
        if (url.startsWith("/v1/search") && searchLimit.delayMs > 0) setTimeout(send, searchLimit.delayMs);
        else send();
      };
      // Spotify accounts service (a code of a user the owner never listed answers 403 "not registered")
      if (url === "/api/token" && body.includes("code=code-notlisted"))
        return json(403, {
          error: "invalid_grant",
          error_description: "User not registered in the Developer Dashboard",
        });
      if (url === "/api/token")
        return json(200, {
          access_token: body.includes("refresh_token") ? "acc-refreshed" : "acc-1",
          refresh_token: "ref-1",
          expires_in: 3600,
          token_type: "Bearer",
        });
      // Spotify Web API
      if (url === "/v1/me")
        return req.headers.authorization === "Bearer acc-1" ||
          req.headers.authorization === "Bearer acc-refreshed"
          ? json(200, {
              id: "dj1",
              display_name: "Test DJ",
              country: "TR",
              email: "dj@example.test",
              product: "premium",
              external_urls: { spotify: "https://open.spotify.com/user/dj1" },
            })
          : json(401, { error: { status: 401, message: "The access token expired" } });
      if (url.startsWith("/v1/search")) {
        searchLimit.count++;
        if (searchLimit.count > searchLimit.after) {
          res.writeHead(429, {
            "content-type": "application/json",
            "retry-after": String(searchLimit.retryAfter),
          });
          return res.end(JSON.stringify({ error: { status: 429, message: "API rate limit exceeded" } }));
        }
        // a query-aware catalogue: `track:"T" artist:"A"` answers a modern cover first, then the orchestra's own
        // recording (170 s, 1940); a title containing "nowhere" has covers only; plain queries find nothing
        const q = new URL(url, MOCK).searchParams.get("q") ?? "";
        const m = /^track:"([^"]*)" artist:"([^"]*)"$/.exec(q);
        if (!m) return json(200, { tracks: { items: [] } });
        const [, title, artist] = m;
        // ids are unique for the whole run, as Spotify's are: the server remembers matches across tests, and an id
        // counted from the last `hits.length = 0` handed two different sides the same track (one row then went missing)
        const n = ++searchSeq;
        const item = (uri: string, artists: string[], year: string, ms: number) => ({
          uri,
          name: title,
          artists: artists.map((name) => ({ name })),
          duration_ms: ms,
          album: { name: "Album", release_date: year },
          external_urls: { spotify: `https://open.spotify.com/track/${uri.split(":")[2]}` },
        });
        const items = [item(`spotify:track:cover${n}`, ["Orquesta Moderna de Hoy"], "2019-05-01", 201000)];
        if (!/nowhere/i.test(title ?? ""))
          // (round 15: the right recording carries no length here — the match rules judge a known side's length, and
          // a mock cannot know it; 0 reads as "not given")
          items.push(
            item(`spotify:track:found${n}`, [`${artist} y su Orquesta`], "1940-01-01", 0),
            ...(singersOf(title ?? "", artist ?? "").length
              ? [
                  item(
                    `spotify:track:found${n}`,
                    [`${artist} y su Orquesta`, ...singersOf(title ?? "", artist ?? "")],
                    "1940-01-01",
                    0,
                  ),
                ]
              : []),
          );
        return json(200, { tracks: { items } });
      }
      if (url === "/v1/me/playlists" && req.method === "POST") {
        lists.set("pl1", { uris: [], snap: 0 });
        return json(201, {
          id: "pl1",
          snapshot_id: "snap0",
          external_urls: { spotify: "https://open.spotify.com/playlist/pl1" },
        });
      }
      const rows = /^\/v1\/playlists\/(pl1|pl403)\/items(\?.*)?$/.exec(url);
      if (rows) {
        const pl = lists.get(rows[1]!) ?? { uris: [], snap: 0 };
        lists.set(rows[1]!, pl);
        if (req.method === "GET") {
          const q = new URL(url, MOCK).searchParams;
          const limit = Math.min(100, Number(q.get("limit") ?? 100));
          const offset = Number(q.get("offset") ?? 0);
          const market = !!q.get("market");
          const page = pl.uris.slice(offset, offset + limit);
          return json(200, {
            items: page.map((uri) => ({
              is_local: false,
              track: {
                uri,
                name: `Song ${uri.split(":")[2]}`,
                artists: [{ name: "Mock Artist" }],
                ...(market ? { is_playable: !spotifyWrites.unplayable.has(uri) } : {}),
              },
            })),
            total: pl.uris.length,
            next:
              offset + limit < pl.uris.length
                ? `${MOCK}/v1/playlists/${rows[1]}/items?offset=${offset + limit}&limit=${limit}`
                : null,
          });
        }
        const uris = (JSON.parse(body || "{}").uris ?? []) as string[];
        if (uris.length > 100) return json(400, { error: { status: 400, message: "Too many ids" } });
        if (req.method === "PUT") pl.uris = [...uris];
        else if (!spotifyWrites.dropPosts.has(++spotifyWrites.posts)) pl.uris.push(...uris);
        pl.snap++;
        return json(req.method === "PUT" ? 200 : 201, { snapshot_id: `snap${pl.snap}` });
      }
      if (/^\/v1\/playlists\/(pl1|pl403)\?fields=/.test(url) && req.method === "GET")
        return json(200, { snapshot_id: `snap${lists.get(url.split("/")[3]!.split("?")[0]!)?.snap ?? 0}` });
      if (url.startsWith("/v1/tracks?") && req.method === "GET") {
        const q = new URL(url, MOCK).searchParams;
        return json(200, {
          tracks: (q.get("ids") ?? "").split(",").map((id) => ({
            uri: `spotify:track:${id}`,
            name: `Song ${id}`,
            artists: [{ name: "Mock Artist" }],
            is_playable: !spotifyWrites.unplayable.has(`spotify:track:${id}`),
          })),
        });
      }
      // 2026-11: the playlist's cover (the export, then the sync): PUT stores the JPEG, GET lists it
      const img = /^\/v1\/playlists\/(pl1)\/images$/.exec(url);
      if (img && req.method === "PUT") {
        covers.push(body.length);
        res.writeHead(202);
        return res.end();
      }
      if (img && req.method === "GET")
        return json(
          200,
          covers.length ? [{ url: `https://i.scdn.co/image/c${covers.length}`, width: 640 }] : [],
        );
      if (url === "/v1/playlists/pl1" && req.method === "PUT") return json(200, {});
      if (url === "/v1/playlists/pl403" && req.method === "PUT")
        return json(403, { error: { status: 403, message: "You cannot change this playlist" } });
      // Pipedream Connect (REST shape the SDK deserialises)
      if (url === "/v1/oauth/token")
        return json(200, { access_token: "pd-token", token_type: "bearer", expires_in: 3600 });
      if (url === "/v1/connect/proj_test/tokens" && req.method === "POST")
        return json(200, {
          token: "ctok_test",
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
          connect_link_url: "https://pipedream.com/_static/connect.html?token=ctok_test&connectLink=true",
        });
      if (url.startsWith("/v1/connect/proj_test/accounts"))
        return json(200, {
          data: [
            {
              id: "apn_dropbox",
              name: "dj@example.test",
              healthy: true,
              dead: false,
              app: {
                id: "app_dbx",
                name_slug: "dropbox",
                name: "Dropbox",
                auth_type: "oauth",
                img_src: "",
                categories: [],
                featured_weight: 0,
                scope_profiles: [],
              },
            },
          ],
          page_info: { total_count: 1, count: 1, start_cursor: "a", end_cursor: "a" },
        });
      if (url.startsWith("/v1/connect/proj_test/proxy/")) return json(200, { path_display: "/TDJ/set.m3u8" });
      // Google: token endpoint (the granted scope depends on the code, like a real consent screen), userinfo,
      // Drive (folder lookup + create, multipart upload) and YouTube (playlist, search with a 2-call budget, items)
      if (url === "/google/token") {
        const form = new URLSearchParams(body);
        if (form.get("grant_type") === "refresh_token")
          return json(200, {
            access_token: "gg-refreshed",
            expires_in: 3599,
            scope: "openid email profile https://www.googleapis.com/auth/drive.file",
            token_type: "Bearer",
          });
        const code = form.get("code") ?? "";
        const scope = {
          "code-gg-none": "openid email profile",
          "code-gg-drive": "openid email profile https://www.googleapis.com/auth/drive.file",
          "code-gg-youtube": "openid https://www.googleapis.com/auth/youtube",
        }[code];
        if (!scope) return json(400, { error: "invalid_grant" });
        return json(200, {
          access_token: `gg-${code.slice(8)}`,
          ...(code === "code-gg-youtube" ? {} : { refresh_token: "ggref-1" }),
          expires_in: 3599,
          scope,
          token_type: "Bearer",
        });
      }
      if (url === "/google/oauth2/v3/userinfo")
        return req.headers.authorization?.startsWith("Bearer gg-")
          ? json(200, { sub: "g1", name: "Test Google", email: "dj@gmail.test" })
          : json(401, { error: "invalid_token" });
      if (url.startsWith("/google/drive/v3/files?") && req.method === "GET") return json(200, { files: [] });
      if (url.startsWith("/google/drive/v3/files?") && req.method === "POST")
        return json(200, { id: "folder1" });
      if (url.startsWith("/google/upload/drive/v3/files?")) {
        // the file part of the multipart body is what Drive stores (its size and MD5 answer files.get)
        const b = body.slice(2, body.indexOf("\r\n"));
        const part = body.split(`--${b}`)[2] ?? "";
        stored.drive = Buffer.from(part.slice(part.indexOf("\r\n\r\n") + 4, part.length - 2), "utf8");
        return json(200, {
          id: "file1",
          name: "set.m3u8",
          webViewLink: "https://drive.google.com/file/d/file1/view",
        });
      }
      if (url.startsWith("/google/drive/v3/files/file1?") && req.method === "GET")
        return json(200, {
          size: String(stored.drive.length),
          md5Checksum: createHash("md5").update(stored.drive).digest("hex"),
        });
      if (url.startsWith("/google/youtube/v3/playlists?")) {
        yt.items = [];
        return json(200, { id: "ytpl1" });
      }
      // the playlist YouTube holds: inserts (at a position or appended), moves, deletes, pages of ≤ 50
      if (url.startsWith("/google/youtube/v3/playlistItems?") && req.method === "GET") {
        const q = new URL(url, MOCK).searchParams;
        const start = Number(q.get("pageToken") || 0);
        const max = Math.min(50, Number(q.get("maxResults") ?? 5));
        return json(200, {
          items: yt.items.slice(start, start + max).map((x) => ({
            id: x.id,
            snippet: { title: `Video ${x.videoId}`, videoOwnerChannelTitle: "Mock Channel" },
            contentDetails: { videoId: x.videoId },
          })),
          ...(start + max < yt.items.length ? { nextPageToken: String(start + max) } : {}),
        });
      }
      if (url.startsWith("/google/youtube/v3/playlistItems?") && req.method === "PUT") {
        const b = JSON.parse(body) as { id: string; snippet: { position: number } };
        const k = yt.items.findIndex((x) => x.id === b.id);
        const [it] = yt.items.splice(k, 1);
        yt.items.splice(b.snippet.position, 0, it!);
        return json(200, { id: b.id });
      }
      if (url.startsWith("/google/youtube/v3/playlistItems?") && req.method === "DELETE") {
        const id = new URL(url, MOCK).searchParams.get("id");
        yt.items = yt.items.filter((x) => x.id !== id);
        res.writeHead(204);
        return res.end();
      }
      if (url.startsWith("/google/youtube/v3/videos?")) {
        const ids = (new URL(url, MOCK).searchParams.get("id") ?? "").split(",");
        return json(200, {
          items: ids.map((id) => ({
            id,
            status: { privacyStatus: "public", uploadStatus: "processed" },
            contentDetails: {},
          })),
        });
      }
      if (url.startsWith("/google/youtube/v3/search?")) {
        const n = hits.filter((h) => h.url.startsWith("/google/youtube/v3/search?")).length;
        return n <= ytLimit.searches
          ? json(200, { items: [{ id: { kind: "youtube#video", videoId: `vid${n}` } }] })
          : json(403, {
              error: {
                code: 403,
                message: "The request cannot be completed because you have exceeded your quota.",
                errors: [{ domain: "youtube.quota", reason: "quotaExceeded" }],
              },
            });
      }
      if (url.startsWith("/google/youtube/v3/playlistItems?")) {
        const b = JSON.parse(body || "{}") as {
          snippet?: { position?: number; resourceId?: { videoId?: string } };
        };
        const it = { id: `item${++yt.seq}`, videoId: b.snippet?.resourceId?.videoId ?? "" };
        // `dropInserts`: inserts (counted from 1) that answer 200 and store nothing — a video that never arrived
        if (!yt.dropInserts.has(++yt.inserts)) yt.items.splice(b.snippet?.position ?? yt.items.length, 0, it);
        return json(200, { id: it.id });
      }
      // Dropbox: token (PKCE), account, upload (content host), shared links (409 once the path says "again")
      if (url === "/dropbox/oauth2/token")
        return json(200, {
          access_token: body.includes("refresh_token") ? "db-refreshed" : "db-1",
          ...(body.includes("refresh_token") ? {} : { refresh_token: "dbref-1" }),
          expires_in: 14400,
          token_type: "bearer",
        });
      if (url === "/dropbox/2/users/get_current_account")
        return req.headers.authorization?.startsWith("Bearer db-")
          ? json(200, {
              account_id: "dbid:1",
              name: { display_name: "Test Dropbox" },
              email: "dj@example.test",
            })
          : json(401, { error_summary: "invalid_access_token/" });
      if (url === "/dropbox-content/2/files/upload") {
        const arg = JSON.parse(String(req.headers["dropbox-api-arg"] ?? "{}")) as { path: string };
        stored.dropbox = Buffer.from(body, "utf8");
        return json(200, { path_display: arg.path, path_lower: arg.path.toLowerCase() });
      }
      if (url === "/dropbox/2/files/get_metadata") {
        // Dropbox's content hash: SHA-256 of the SHA-256 of each 4 MiB block (one block here)
        const block = createHash("sha256").update(stored.dropbox).digest();
        return json(200, {
          size: stored.dropbox.length,
          content_hash: createHash("sha256").update(block).digest("hex"),
        });
      }
      if (url === "/dropbox/2/sharing/create_shared_link_with_settings")
        return body.includes("again")
          ? json(409, {
              error_summary: "shared_link_already_exists/..",
              error: { ".tag": "shared_link_already_exists" },
            })
          : json(200, { url: "https://www.dropbox.com/scl/fo/new?dl=0" });
      if (url === "/dropbox/2/sharing/list_shared_links")
        return json(200, { links: [{ url: "https://www.dropbox.com/scl/fo/existing?dl=0" }] });
      json(404, { error: `mock: no route for ${req.method} ${url}` });
    });
  });
}

let mock: http.Server;
let app: ChildProcess;
test.beforeAll(async () => {
  mock = mockServer();
  await new Promise<void>((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));
  const cwd = path.resolve(__dirname, "..");
  app = spawn(
    process.execPath,
    [path.join(cwd, "node_modules/next/dist/bin/next"), "start", "-p", String(APP_PORT)],
    {
      cwd,
      env: {
        ...process.env,
        SPOTIFY_CLIENT_ID: "test-client",
        SPOTIFY_CLIENT_SECRET: "test-secret",
        TDJ_COOKIE_SECRET: "e2e-cookie-secret",
        SPOTIFY_ACCOUNTS_URL: MOCK,
        SPOTIFY_API_URL: `${MOCK}/v1`,
        PIPEDREAM_PROJECT_ID: "proj_test",
        PIPEDREAM_CLIENT_ID: "pd-client",
        PIPEDREAM_CLIENT_SECRET: "pd-secret",
        PIPEDREAM_API_URL: MOCK,
        GOOGLE_CLIENT_ID: "google-client",
        GOOGLE_CLIENT_SECRET: "google-secret",
        GOOGLE_ACCOUNTS_URL: `${MOCK}/gaccounts`,
        GOOGLE_TOKEN_URL: `${MOCK}/google/token`,
        GOOGLE_API_URL: `${MOCK}/google`,
        DROPBOX_APP_KEY: "db-key",
        DROPBOX_APP_SECRET: "db-secret",
        DROPBOX_WWW_URL: `${MOCK}/dbwww`,
        DROPBOX_API_URL: `${MOCK}/dropbox`,
        DROPBOX_CONTENT_URL: `${MOCK}/dropbox-content`,
        NEXT_PUBLIC_APP_URL: "",
        TDJ_DB_TABLE: "",
        // the matching budget per request (20 s in production) shortened so the deadline test runs in seconds
        TDJ_MATCH_BUDGET_MS: "4000",
      },
      stdio: "ignore",
    },
  );
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${APP}/api/spotify/me`);
      if (r.status === 401 || r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("second Next server did not start");
});
test.afterAll(async () => {
  app?.kill("SIGTERM");
  await new Promise<void>((r) => mock?.close(() => r()));
});

const cookieOf = (setCookie: string[] | undefined, name: string) =>
  (setCookie ?? []).map((c) => c.split(";")[0]!).find((c) => c.startsWith(`${name}=`));
const setCookies = (r: { headersArray(): Array<{ name: string; value: string }> }) =>
  r
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);

/** Seals / unseals exactly as lib/server/cookies.ts does with TDJ_COOKIE_SECRET=e2e-cookie-secret. */
const COOKIE_KEY = createHash("sha256").update("tdj-cookie:e2e-cookie-secret").digest();
function sealed(value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", COOKIE_KEY, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    c.getAuthTag().toString("base64url"),
    ct.toString("base64url"),
  ].join(".");
}
function unsealed<T>(cookiePair: string): T {
  const [, iv, tag, ct] = decodeURIComponent(cookiePair.slice(cookiePair.indexOf("=") + 1)).split(".");
  const d = createDecipheriv("aes-256-gcm", COOKIE_KEY, Buffer.from(iv!, "base64url"));
  d.setAuthTag(Buffer.from(tag!, "base64url"));
  return JSON.parse(
    Buffer.concat([d.update(Buffer.from(ct!, "base64url")), d.final()]).toString("utf8"),
  ) as T;
}

/** Runs the hosted login up to the callback and returns the session cookie pair. */
async function login(request: APIRequestContext) {
  const r = await request.get(`${APP}/api/spotify/login?next=/`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const to = new URL(r.headers().location!);
  const state = to.searchParams.get("state")!;
  const stateCookie = cookieOf(
    r
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value),
    "tdj_sp_state",
  )!;
  const cb = await request.get(
    `${APP}/api/spotify/callback?code=code-xyz&state=${encodeURIComponent(state)}`,
    {
      maxRedirects: 0,
      headers: { cookie: stateCookie },
    },
  );
  expect(cb.status()).toBe(302);
  const set = cb
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value);
  const session = cookieOf(set, "tdj_sp")!;
  return { session, location: cb.headers().location!, setCookie: set };
}

test("login redirects to Spotify with the app's Client ID, scopes, state cookie and the /api/spotify/callback redirect URI", async ({
  request,
}) => {
  const r = await request.get(`${APP}/api/spotify/login`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const to = new URL(r.headers().location!);
  expect(to.origin).toBe(MOCK);
  expect(to.pathname).toBe("/authorize");
  expect(to.searchParams.get("client_id")).toBe("test-client");
  expect(to.searchParams.get("response_type")).toBe("code");
  expect(to.searchParams.get("redirect_uri")).toBe(`${APP}/api/spotify/callback`);
  // round 7: the Booth's Web Playback SDK needs the two playback scopes; wave 4: the playlist cover, image upload
  expect(to.searchParams.get("scope")).toBe(
    "playlist-modify-private playlist-modify-public user-read-email streaming user-read-private user-modify-playback-state user-read-playback-state ugc-image-upload",
  );
  const state = to.searchParams.get("state") ?? "";
  expect(state.length).toBeGreaterThan(16);
  const sc = r.headersArray().find((h) => h.name.toLowerCase() === "set-cookie")?.value ?? "";
  expect(sc).toContain(`tdj_sp_state=${encodeURIComponent(state)}`);
  expect(sc).toMatch(/HttpOnly/);
  expect(sc).toMatch(/SameSite=Lax/);
  expect(sc).toMatch(/Path=\/api\/spotify/);
});

test("callback exchanges the code on the server (client secret never in the browser) and seals the session cookie", async ({
  request,
}) => {
  hits.length = 0;
  const { session, location, setCookie } = await login(request);
  expect(location).toBe(`${APP}/?connected=spotify`);
  const sealed = decodeURIComponent(session.slice("tdj_sp=".length));
  expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  expect(sealed).not.toContain("acc-1");
  expect(sealed).not.toContain("ref-1");
  const raw = setCookie.find((c) => c.startsWith("tdj_sp="))!;
  expect(raw).toMatch(/HttpOnly/);
  expect(raw).toMatch(/SameSite=Lax/);
  expect(raw).not.toMatch(/Secure/); // http origin: no Secure flag; https sets it
  const tok = last(/POST \/api\/token/)!;
  const form = new URLSearchParams(tok.body);
  expect(form.get("grant_type")).toBe("authorization_code");
  expect(form.get("code")).toBe("code-xyz");
  expect(form.get("redirect_uri")).toBe(`${APP}/api/spotify/callback`);
  expect(tok.headers.authorization).toBe(
    `Basic ${Buffer.from("test-client:test-secret").toString("base64")}`,
  );
  // a wrong state is refused and never reaches Spotify
  const before = hits.length;
  const bad = await request.get(`${APP}/api/spotify/callback?code=x&state=forged`, {
    maxRedirects: 0,
    headers: { cookie: "tdj_sp_state=other" },
  });
  expect(bad.headers().location).toContain("error=spotify_state");
  expect(hits.length).toBe(before);
});

test("a DJ the owner did not list: access_denied from Spotify or a 403 'not registered' exchange lands on spotify_not_listed, and Settings explains it", async ({
  request,
  browser,
}) => {
  const start = async () => {
    const r = await request.get(`${APP}/api/spotify/login?next=/`, { maxRedirects: 0 });
    const state = new URL(r.headers().location!).searchParams.get("state")!;
    return { state, cookie: cookieOf(setCookies(r), "tdj_sp_state")! };
  };
  const a = await start();
  const denied = await request.get(
    `${APP}/api/spotify/callback?error=access_denied&state=${encodeURIComponent(a.state)}`,
    { maxRedirects: 0, headers: { cookie: a.cookie } },
  );
  expect(denied.headers().location).toBe(`${APP}/settings?error=spotify_not_listed`);
  expect(cookieOf(setCookies(denied), "tdj_sp")).toBeUndefined();
  const b = await start();
  const refused = await request.get(
    `${APP}/api/spotify/callback?code=code-notlisted&state=${encodeURIComponent(b.state)}`,
    { maxRedirects: 0, headers: { cookie: b.cookie } },
  );
  expect(refused.headers().location).toBe(`${APP}/settings?error=spotify_not_listed`);
  // any other failure keeps its own reason
  const c = await start();
  const other = await request.get(
    `${APP}/api/spotify/callback?error=server_error&state=${encodeURIComponent(c.state)}`,
    { maxRedirects: 0, headers: { cookie: c.cookie } },
  );
  expect(other.headers().location).toBe(`${APP}/settings?error=spotify_denied`);
  // the page: a plain sheet, the request to copy, the other ways
  const ctx = await browser.newContext({ baseURL: APP, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  await page.goto("/settings?error=spotify_not_listed");
  const sheet = page.getByTestId("spotify-not-listed");
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(
    "This app can let in 5 Spotify accounts. Ask the organiser to add your Spotify email, or send your set to Spotify another way",
  );
  await expect(sheet.locator("#not-listed-copy")).toHaveText("Copy my request");
  await expect(sheet.locator("#not-listed-contact")).toHaveCount(0); // no organiser contact on this deployment
  await page.locator("#not-listed-copy").click();
  await expect(sheet.locator("#not-listed-copy")).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/add my Spotify e-mail/);
  await sheet.locator("#not-listed-other").click();
  await expect(sheet.locator("#not-listed-other-ways")).toBeVisible();
  await expect(sheet.locator("#not-listed-transfer")).toContainText("Spotify via a transfer service");
  expect(page.url()).toBe(`${APP}/settings`); // the error left the address bar
  await ctx.close();
});

test("/api/spotify/me returns the profile with the cookie, 200 { hosted:true, user:null } without it (no console 401s); logout clears it", async ({
  request,
  playwright,
}) => {
  const { session } = await login(request);
  const me = await request.get(`${APP}/api/spotify/me`, { headers: { cookie: session } });
  expect(me.status()).toBe(200);
  const j = await me.json();
  expect(j.hosted).toBe(true);
  expect(j.user).toMatchObject({ id: "dj1", name: "Test DJ", product: "premium" });
  expect(j.token.access).toBe("acc-1");
  expect(j).not.toHaveProperty("refresh");
  const fresh = await playwright.request.newContext();
  const anon = await fresh.get(`${APP}/api/spotify/me`);
  expect(anon.status()).toBe(200);
  expect(await anon.json()).toEqual({ hosted: true, user: null });
  const out = await request.post(`${APP}/api/spotify/logout`, { headers: { cookie: session } });
  expect(out.headers()["set-cookie"]).toMatch(/tdj_sp=;.*Max-Age=0/);
});

test("playlist creation POSTs name/description/public, adds items in chunks of ≤100 and matches unresolved tracks with field-filtered searches", async ({
  request,
  playwright,
}) => {
  const { session } = await login(request);
  const p = await (await request.post(`${APP}/api/compose`, { data: { hours: 4, seed: 3 } })).json();
  hits.length = 0;
  const r = await request.post(`${APP}/api/spotify/playlist`, {
    headers: { cookie: session },
    data: { playlist: p, includeCortinas: false, name: "Milonga test" },
  });
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.url).toBe("https://open.spotify.com/playlist/pl1");
  const create = last(/POST \/v1\/me\/playlists/)!;
  expect(JSON.parse(create.body)).toEqual({
    name: "Milonga test",
    description: expect.stringContaining("cortinas excluded"),
    public: false,
  });
  expect(create.headers.authorization).toBe("Bearer acc-1");
  const adds = hits.filter((h) => h.url === "/v1/playlists/pl1/items");
  expect(adds.length).toBeGreaterThan(0);
  let total = 0;
  for (const a of adds) {
    const uris = JSON.parse(a.body).uris as string[];
    expect(uris.length).toBeLessThanOrEqual(100);
    total += uris.length;
  }
  expect(total).toBe(j.added);
  const songs =
    p.tandas.reduce((n: number, t: { songs: unknown[] }) => n + t.songs.length, 0) +
    (p.closing ? 1 : 0) +
    (p.opening ? 1 : 0);
  // every unresolved track was searched; round 16: a side whose index knows a later take needs positive evidence the
  // mock's undated "Album" cannot give, so it is reported in `missing` ("Not matched") instead of guessed
  expect(j.added + j.missing.length).toBe(songs);
  expect(j.added).toBeGreaterThan(songs / 2);
  const searches = hits.filter((h) => h.url.startsWith("/v1/search"));
  // the field-filtered query first for every searched side; a plain query only as the fallback after one
  // (round 16: a side the rules leave unmatched on the filtered answer is searched once more, plainly)
  let filtered = 0;
  for (const s of searches) {
    const q = new URL(s.url, MOCK).searchParams;
    expect(q.get("type")).toBe("track");
    expect(q.get("limit")).toBe("10");
    if (/^track:"[^"]+" artist:"[^"]+"$/.test(q.get("q") ?? "")) filtered++;
  }
  expect(filtered).toBeGreaterThanOrEqual(searches.length / 2);
  // the scorer took the orchestra's recording, never the cover that Spotify lists first
  for (const a of adds) for (const u of JSON.parse(a.body).uris as string[]) expect(u).not.toMatch(/cover/);
  // not logged in → 401, nothing reaches Spotify
  const n = hits.length;
  const anon = await (await playwright.request.newContext()).post(`${APP}/api/spotify/playlist`, {
    data: { playlist: p },
  });
  expect(anon.status()).toBe(401);
  expect(hits.length).toBe(n);
});

test("Spotify keeps the running order: searched cortinas stay between their tandas, and replace rewrites in place", async ({
  request,
}) => {
  const { session } = await login(request);
  const p = await (await request.post(`${APP}/api/compose`, { data: { hours: 2, seed: 5 } })).json();
  // round 19: one cue Spotify cannot match (no carried id, a title the mock has covers for only) — the nearest
  // Spotify-ready cue of its family stands in, in its own row, never a gap between two tandas
  const lostAt = (p.tandas as Array<{ cortina?: { id: string } | null }>).findIndex((t) => !!t.cortina);
  const lost = p.tandas[lostAt].cortina;
  p.tandas[lostAt].cortina = { ...lost, title: "Nowhere Cue", spotify: null };
  hits.length = 0;
  const r = await request.post(`${APP}/api/spotify/playlist`, {
    headers: { cookie: session },
    data: { playlist: p, includeCortinas: true, name: "Order test" },
  });
  expect(r.status()).toBe(200);
  const made = await r.json();
  const missing = new Set(made.missing as string[]);
  const standIns = (made.standIns ?? []) as Array<{ id: string; uri: string; cue: string }>;
  expect(standIns.map((x) => x.id)).toEqual([lost.id]);
  expect(standIns[0]!.uri).toMatch(/^spotify:track:[A-Za-z0-9]+$/);
  expect(missing.has(`Nowhere Cue ${lost.artist}`)).toBe(false);
  const got = hits
    .filter((h) => h.url === "/v1/playlists/pl1/items" && h.method === "POST")
    .flatMap((h) => JSON.parse(h.body).uris as string[]);
  type Row = {
    spotify?: { uri?: string } | null;
    title?: string;
    orchestra?: string;
    artist?: string;
  };
  // (round 16: a row the stricter rules leave "Not matched" is listed in `missing`, never added in its place)
  const want: string[] = [];
  const push = (x: Row) => {
    if (x.title === "Nowhere Cue") want.push(standIns[0]!.uri);
    else if (x.spotify?.uri) want.push(x.spotify.uri);
    else if (!missing.has(`${x.title} ${x.orchestra ?? x.artist}`)) want.push("SEARCHED");
  };
  // (round 21: the night opens with La Cumparsita by default: the first row)
  if (p.opening) push(p.opening as Row);
  for (const t of p.tandas as Array<{ songs: Row[]; cortina?: Row | null }>) {
    for (const s of t.songs) push(s);
    if (t.cortina) push(t.cortina);
  }
  if (p.closing) push(p.closing as Row);
  expect(want.filter((w) => w === "SEARCHED").length).toBeGreaterThan(0);
  expect(got.map((u) => (/^spotify:track:found\d+$/.test(u) ? "SEARCHED" : u))).toEqual(want);

  // replace: the first 100 go with PUT (which clears the playlist), the rest are appended, order intact
  const uris = Array.from({ length: 150 }, (_, i) => `spotify:track:row${i}`);
  hits.length = 0;
  const rep = await request.post(`${APP}/api/spotify/playlist`, {
    headers: { cookie: session },
    data: { uris, playlistId: "pl1", replace: true, includeCortinas: true },
  });
  expect(rep.status()).toBe(200);
  expect((await rep.json()).added).toBe(150);
  const calls = hits.filter((h) => h.url === "/v1/playlists/pl1/items");
  expect(calls.map((c) => c.method)).toEqual(["PUT", "POST"]);
  expect(calls.flatMap((c) => JSON.parse(c.body).uris as string[])).toEqual(uris);
  expect(hits.some((h) => h.url === "/v1/me/playlists")).toBe(false);
  // without a name or description the details stay as they are
  expect(hits.some((h) => h.url === "/v1/playlists/pl1")).toBe(false);

  // updating a playlist rewrites its name and description too, so the score in it is the set's current one
  hits.length = 0;
  const upd = await request.post(`${APP}/api/spotify/playlist`, {
    headers: { cookie: session },
    data: {
      uris: uris.slice(0, 3),
      playlistId: "pl1",
      replace: true,
      includeCortinas: true,
      name: "TDJ · Golden",
      description: "23 tandas composed with TDJ, cortinas included. Score 91/100.",
    },
  });
  expect(upd.status()).toBe(200);
  expect((await upd.json()).details).toBe(true);
  const details = hits.filter((h) => h.url === "/v1/playlists/pl1" && h.method === "PUT");
  expect(details).toHaveLength(1);
  expect(JSON.parse(details[0]!.body)).toEqual({
    name: "TDJ · Golden",
    description: "23 tandas composed with TDJ, cortinas included. Score 91/100.",
  });
  // a playlist whose details Spotify refuses (followed, not owned) still gets its tracks
  hits.length = 0;
  const ref = await request.post(`${APP}/api/spotify/playlist`, {
    headers: { cookie: session },
    data: {
      uris: uris.slice(0, 3),
      playlistId: "pl403",
      replace: true,
      includeCortinas: true,
      name: "TDJ · X",
    },
  });
  expect(ref.status()).toBe(200);
  const rj = await ref.json();
  expect(rj.added).toBe(3);
  expect(rj.details).toBe(false);
});

test("an expired access token is refreshed transparently and the cookie is re-sealed", async ({
  request,
  playwright,
}) => {
  // seal a session whose access token expired, exactly as lib/server/cookies.ts does with TDJ_COOKIE_SECRET
  const stale = sealed({
    access: "acc-stale",
    refresh: "ref-1",
    expires: Date.now() - 1000,
    authorizedAt: 1,
  });
  hits.length = 0;
  const me = await request.get(`${APP}/api/spotify/me`, {
    headers: { cookie: `tdj_sp=${encodeURIComponent(stale)}` },
  });
  expect(me.status()).toBe(200);
  expect((await me.json()).token.access).toBe("acc-refreshed");
  const tok = last(/POST \/api\/token/)!;
  const form = new URLSearchParams(tok.body);
  expect(form.get("grant_type")).toBe("refresh_token");
  expect(form.get("refresh_token")).toBe("ref-1");
  expect(me.headers()["set-cookie"]).toMatch(/tdj_sp=v1\./);
  // a tampered cookie (one ciphertext byte flipped) is simply "not logged in"
  const parts = stale.split(".");
  parts[3] = (parts[3]![0] === "A" ? "B" : "A") + parts[3]!.slice(1);
  const bad = await (await playwright.request.newContext()).get(`${APP}/api/spotify/me`, {
    headers: { cookie: `tdj_sp=${encodeURIComponent(parts.join("."))}` },
  });
  expect(bad.status()).toBe(200);
  expect((await bad.json()).user).toBeNull();
});

test("Settings (hosted): the Spotify row shows the account, the sheet has one primary action and Advanced hides the BYO field", async ({
  browser,
  request,
}) => {
  const { session } = await login(request);
  const ctx = await browser.newContext({ baseURL: APP });
  const [name, value] = session.split("=");
  await ctx.addCookies([{ name: name!, value: value!, url: APP }]);
  const page = await ctx.newPage();
  await page.goto("/settings");
  await expect(page.locator("#connector-spotify")).toContainText("Test DJ");
  await page.locator("#connector-spotify").click();
  const sheet = page.getByRole("dialog", { name: "Spotify" });
  await expect(sheet).toContainText("Logged in as Test DJ");
  await expect(sheet).toContainText("5 Spotify accounts");
  await expect(sheet.locator("#spotify-logout")).toBeVisible();
  await expect(sheet.locator("#spotify-client-id")).toHaveCount(0);
  await sheet.locator("#spotify-advanced").click();
  await expect(sheet.locator("#spotify-client-id")).toBeVisible();
  // Pipedream rows (the mock lists one Dropbox account for this user once the uid cookie exists)
  await expect(page.locator("#connector-pd-youtube_data_api")).toContainText(/Connect/);
  await expect(page.locator("#connector-owner-setup")).toHaveCount(0); // a service is configured: no owner link
  await ctx.close();
});

test("Settings (hosted, logged out): one button sends the DJ to /api/spotify/login", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: APP });
  const page = await ctx.newPage();
  await page.goto("/settings");
  await expect(page.locator("#connector-spotify")).toContainText("Log in");
  await page.locator("#connector-spotify").click();
  const sheet = page.getByRole("dialog", { name: "Spotify" });
  await expect(sheet.locator("#spotify-login")).toHaveText("Log in with Spotify");
  // the button navigates to the server route, which redirects to Spotify (mocked: a 404 page from the mock)
  const [req] = await Promise.all([
    page.waitForRequest((r) => r.url().startsWith(`${APP}/api/spotify/login`)),
    sheet.locator("#spotify-login").click(),
  ]);
  expect(new URL(req.url()).searchParams.get("next")).toBe("/settings");
  await ctx.close();
});

test("env-absent fallback: without server credentials the sheet shows the BYO Client ID flow", async ({
  page,
}) => {
  await page.route("**/api/spotify/me", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ hosted: false, user: null }),
    }),
  );
  await page.route("**/api/connect/accounts", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false, accounts: [] }),
    }),
  );
  for (const p of ["google", "dropbox"])
    await page.route(`**/api/${p}/me`, (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ hosted: false, user: null }),
      }),
    );
  await page.goto("/settings");
  await expect(page.locator("#connector-spotify")).toContainText("Set up");
  await expect(page.locator("#connector-dropbox")).toContainText("Off");
  await expect(page.locator("#connector-google")).toContainText("Off");
  await expect(page.locator("#connector-pd-youtube_data_api")).toHaveCount(0); // no Pipedream rows without its env
  // nothing configured anywhere: the owner is pointed at the in-app setup
  await expect(page.locator("#connector-owner-setup")).toContainText("Owner setup");
  await page.locator("#connector-spotify").click();
  const sheet = page.getByRole("dialog", { name: "Spotify" });
  await expect(sheet.locator("#spotify-connect")).toBeDisabled();
  await expect(sheet.locator("#spotify-login")).toHaveCount(0);
  await sheet.locator("#spotify-advanced").click();
  await sheet.locator("#spotify-client-id").fill("my-client-id");
  await expect(sheet.locator("#spotify-connect")).toBeEnabled();
  await expect(sheet).toContainText("/callback");
  await sheet.getByRole("button", { name: "Done" }).click();
  await page.locator("#connector-dropbox").click();
  const dbx = page.getByRole("dialog", { name: "Dropbox" });
  await expect(dbx).toContainText("Not turned on for this site");
  await expect(dbx.getByRole("link", { name: /How to turn it on/ })).toHaveAttribute(
    "href",
    /DEPLOY\.md#connectors/,
  );
  await expect(dbx.locator("#dropbox-login")).toHaveCount(0);
  await dbx.getByRole("button", { name: "Done" }).click();
  await page.locator("#connector-google").click();
  const gg = page.getByRole("dialog", { name: "Google" });
  await expect(gg).toContainText("Not turned on for this site");
  await expect(gg.getByRole("link", { name: /How to turn it on/ })).toHaveAttribute(
    "href",
    /DEPLOY\.md#connectors/,
  );
});

test("Pipedream: /api/connect/token mints a Connect Link for the cookie user; accounts and proxy export work", async ({
  request,
}) => {
  hits.length = 0;
  const t = await request.post(`${APP}/api/connect/token`, { data: { app: "dropbox" } });
  expect(t.status()).toBe(200);
  const j = await t.json();
  expect(j.connect_link_url).toContain("token=ctok_test");
  expect(j.connect_link_url).toContain("app=dropbox");
  const uid = cookieOf(
    t
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value),
    "tdj_uid",
  )!;
  const created = last(/POST \/v1\/connect\/proj_test\/tokens/)!;
  const body = JSON.parse(created.body);
  expect(body.external_user_id).toBe(decodeURIComponent(uid.slice("tdj_uid=".length)).split(".")[0]);
  expect(body.allowed_origins).toEqual([APP]);
  expect(body.success_redirect_uri).toBe(`${APP}/settings?connected=dropbox`);
  expect(last(/POST \/v1\/oauth\/token/)).toBeTruthy(); // the SDK authenticated with the client credentials
  const acc = await (await request.get(`${APP}/api/connect/accounts`, { headers: { cookie: uid } })).json();
  expect(acc.enabled).toBe(true);
  expect(acc.accounts).toEqual([
    { id: "apn_dropbox", app: "dropbox", label: "Dropbox", name: "dj@example.test", healthy: true },
  ]);
  const ex = await request.post(`${APP}/api/connect/export`, {
    headers: { cookie: uid },
    data: {
      app: "dropbox",
      accountId: "apn_dropbox",
      format: "m3u8",
      filename: "set.m3u8",
      text: "#EXTM3U\n",
    },
  });
  expect(ex.status()).toBe(200);
  expect((await ex.json()).path).toBe("/TDJ/set.m3u8");
  const proxy = last(/POST \/v1\/connect\/proj_test\/proxy\//)!;
  expect(proxy.body).toBe("#EXTM3U\n");
  expect(proxy.headers.authorization).toBe("Bearer pd-token");
  expect(proxy.headers["x-pd-proxy-dropbox-api-arg"]).toContain('"path":"/set.m3u8"');
  expect(proxy.headers["x-pd-environment"]).toBe("development");
  expect(Buffer.from(proxy.url.split("/proxy/")[1]!.split("?")[0]!, "base64url").toString()).toBe(
    "https://content.dropboxapi.com/2/files/upload",
  );
  // the wrong account id is refused
  const no = await request.post(`${APP}/api/connect/export`, {
    headers: { cookie: uid },
    data: { app: "dropbox", accountId: "apn_other", format: "m3u8", text: "x" },
  });
  expect(no.status()).toBe(403);
  // disabled deployment (the default server has no PIPEDREAM_* unless the shell sets them)
  const def = await request.post("/api/connect/token", { data: { app: "dropbox" } });
  expect([200, 404]).toContain(def.status());
});

test("Export sheet (hosted): 'Create playlist in Spotify' uses the session, lists the connected Dropbox and saves the file", async ({
  browser,
  request,
}) => {
  const { session } = await login(request);
  const ctx = await browser.newContext({ baseURL: APP });
  const [name, value] = session.split("=");
  await ctx.addCookies([{ name: name!, value: value!, url: APP }]);
  const page: Page = await ctx.newPage();
  await page.request.post("/api/connect/token", { data: {} }); // mints the uid cookie the accounts call needs
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet.locator("#send-spotify")).toContainText("Test DJ");
  await expect(sheet.locator("#send-pd-dropbox")).toBeVisible();
  // the direct rows (deployment's own Google and Dropbox apps) come before the Pipedream account
  await expect(sheet.locator("#send-dropbox")).toContainText("Connect");
  await expect(sheet.locator("#send-google_drive")).toContainText("Connect");
  await expect(sheet.locator("#send-youtube")).toContainText("Connect");
  const order = await sheet.evaluate((el) =>
    ["#send-spotify", "#send-youtube", "#send-dropbox", "#send-google_drive", "#send-pd-dropbox"].map((id) =>
      [...el.querySelectorAll("[id^=send-]")].findIndex((n) => n.id === id.slice(1)),
    ),
  );
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(order.every((i) => i >= 0)).toBe(true);
  // "Spotify via a transfer service": a title/artist/album CSV with one row per file, and the import page in a new tab
  const files = Number((await page.locator("#export-count").textContent())!.match(/\((\d+) files?\)/)![1]);
  await sheet.locator("#send-transfer").click();
  const transfer = page.getByTestId("transfer-sheet");
  await expect(transfer).toBeVisible();
  await expect(transfer.locator("#transfer-steps")).toContainText("Download the CSV below");
  await expect(transfer).toContainText(`${files} rows in set order`);
  // the import page is stubbed: the test proves which tab opens, not the service's own site
  await ctx.route("https://www.tunemymusic.com/**", (r) =>
    r.fulfill({ contentType: "text/html", body: "<html><body>stub</body></html>" }),
  );
  const [download, popup] = await Promise.all([
    page.waitForEvent("download"),
    ctx.waitForEvent("page"),
    transfer.locator("#transfer-download").click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-tunemymusic\.csv$/);
  await popup.waitForLoadState();
  expect(popup.url()).toBe("https://www.tunemymusic.com/transfer/csv-to-spotify");
  await popup.close();
  const csv = (await import("node:fs")).readFileSync((await download.path())!, "utf8");
  const lines = csv.split("\r\n").filter(Boolean);
  expect(lines[0]).toBe("title,artist,album");
  expect(lines.length - 1).toBe(files);
  expect(lines[1]).toMatch(/^"[^"]+","[^"]+",".*"$/);
  await transfer.getByRole("button", { name: "Done" }).click();
  await expect(transfer).toBeHidden();
  hits.length = 0;
  await sheet.locator("#send-pd-dropbox").click();
  await expect(page.getByTestId("toast")).toContainText("Saved to Dropbox", { timeout: 20000 });
  expect(last(/proxy/)!.body).toContain("#EXTM3U");
  await page.getByRole("button", { name: "Create playlist in Spotify" }).click();
  await expect(page.getByRole("button", { name: "Playlist created" })).toBeVisible({ timeout: 30000 });
  await expect(sheet.getByRole("button", { name: "Open in Spotify" })).toBeVisible();
  expect(last(/POST \/v1\/me\/playlists/)).toBeTruthy();
  await ctx.close();
});

test("2026-11: an exported Spotify playlist follows the night — a reorder and its undo are written 5 s later, read back, the cover redrawn; the sheet and the Booth say so", async ({
  browser,
  request,
}) => {
  test.setTimeout(180_000);
  const { session } = await login(request);
  const ctx = await browser.newContext({ baseURL: APP, viewport: { width: 1440, height: 900 } });
  const [name, value] = session.split("=");
  await ctx.addCookies([{ name: name!, value: value!, url: APP }]);
  const page: Page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  await page.getByRole("button", { name: "Create playlist in Spotify" }).click();
  await expect(page.getByRole("button", { name: "Playlist created" })).toBeVisible({ timeout: 30000 });
  // remembered for this night, the switch on, in step
  const group = sheet.getByTestId("sync-group");
  await group.scrollIntoViewIfNeeded();
  await expect(group.getByRole("switch", { name: "Keep my exported playlists in sync" })).toBeChecked();
  await expect(group.getByTestId("sync-spotify")).toContainText("Spotify playlist is in step");
  const before = [...(lists.get("pl1")?.uris ?? [])];
  expect(before.length).toBeGreaterThan(20);
  const coversBefore = covers.length;
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  // a reorder inside tanda 1 (Alt+↓ on its first song)
  hits.length = 0;
  const row = page.locator("#result [data-tanda]").first().locator("[data-reorder-row]").first();
  await row.focus();
  await page.keyboard.press("Alt+ArrowDown");
  // nothing is written at once: 5 s after the last change
  await page.waitForTimeout(2500);
  expect(hits.some((h) => h.method === "PUT" && /\/v1\/playlists\/pl1\/items/.test(h.url))).toBe(false);
  await expect
    .poll(() => hits.some((h) => h.method === "PUT" && /\/v1\/playlists\/pl1\/items/.test(h.url)), {
      timeout: 30000,
    })
    .toBe(true);
  // the playlist holds the new order: tanda 1's first two songs swapped (after the opening, when there is one),
  // every other row in place, read back (GET after the PUT)
  const swapped = (uris: string[] | undefined) => {
    if (!uris || uris.length !== before.length) return false;
    const i = uris.findIndex((u, k) => u !== before[k]);
    return (
      i >= 0 &&
      uris[i] === before[i + 1] &&
      uris[i + 1] === before[i] &&
      uris.every((u, k) => k === i || k === i + 1 || u === before[k])
    );
  };
  await expect.poll(() => swapped(lists.get("pl1")?.uris), { timeout: 20000 }).toBe(true);
  const put = hits.findIndex((h) => h.method === "PUT" && /\/v1\/playlists\/pl1\/items/.test(h.url));
  expect(hits.slice(put).some((h) => h.method === "GET" && /\/v1\/playlists\/pl1\/items/.test(h.url))).toBe(
    true,
  );
  // the cover was drawn again from the changed night and read back
  await expect.poll(() => covers.length, { timeout: 20000 }).toBeGreaterThan(coversBefore);
  expect(hits.some((h) => h.method === "GET" && /\/v1\/playlists\/pl1\/images/.test(h.url))).toBe(true);
  // the sheet says what happened
  await page.getByRole("button", { name: "Export" }).first().click();
  await expect(sheet.getByTestId("sync-spotify")).toContainText("Spotify playlist updated · 1 change", {
    timeout: 20000,
  });
  await page.keyboard.press("Escape");
  // undo syncs too: the playlist goes back to the exported order
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => lists.get("pl1")?.uris, { timeout: 30000 }).toEqual(before);
  // the Booth shows the chip
  await page.getByTestId("play-the-night").first().click();
  await expect(page).toHaveURL(/\/booth/);
  await expect(page.getByTestId("sync-chip")).toContainText("Playlists in sync (1)", { timeout: 20000 });
  // the switch off: an edit writes nothing
  await ctx.close();
});

/* ---------- server-side matching, rate limits, cortina play length ---------- */

test("POST /api/spotify/match scores up to 10 items: the orchestra's recording beats a modern cover, covers alone are 'not found'", async ({
  request,
  playwright,
}) => {
  const { session } = await login(request);
  hits.length = 0;
  const items = [
    {
      id: "ciego",
      title: "Ciego",
      orchestra: "Francisco Canaro",
      singer: "Roberto Maida",
      year: 1935,
      durationSec: 162,
    },
    { id: "none", title: "Nowhere tango", orchestra: "Juan D'Arienzo", year: 1940, durationSec: 170 },
    { id: "lc", title: "La cumparsita", orchestra: "Juan D'Arienzo", year: 1951, durationSec: 172 },
  ];
  const r = await request.post(`${APP}/api/spotify/match`, { headers: { cookie: session }, data: { items } });
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.rateLimited).toBeUndefined();
  expect(j.missing).toEqual(["none"]);
  expect(j.matches.map((m: { id: string }) => m.id)).toEqual(["ciego", "lc"]);
  const ciego = j.matches[0];
  expect(ciego.uri).toMatch(/^spotify:track:found/);
  // (round 17: a vocal side's credit names its singer)
  expect(ciego.artist).toBe("Canaro y su Orquesta, Roberto Maida");
  expect(ciego.name).toBe("Ciego");
  expect(ciego.durationMs).toBe(0); // (round 15: the mock gives the right recording no length)
  expect(ciego.year).toBe(1940);
  expect(ciego.score).toBeGreaterThanOrEqual(0.6);
  // the searches: one field-filtered query per item, the plain fallback only for the cover-only title
  const searches = hits
    .filter((h) => h.url.startsWith("/v1/search"))
    .map((h) => new URL(h.url, MOCK).searchParams.get("q"));
  expect(searches).toEqual([
    'track:"Ciego" artist:"Canaro"',
    'track:"Nowhere tango" artist:"D\'Arienzo"',
    "Nowhere tango Juan D'Arienzo",
    'track:"La cumparsita" artist:"D\'Arienzo"',
  ]);
  // memoised per process: the same items again search nothing
  const n = hits.length;
  const again = await request.post(`${APP}/api/spotify/match`, {
    headers: { cookie: session },
    data: { items },
  });
  expect((await again.json()).matches).toHaveLength(2);
  expect(hits.filter((h) => h.url.startsWith("/v1/search")).length).toBe(
    hits.slice(0, n).filter((h) => h.url.startsWith("/v1/search")).length,
  );
  // limits and auth
  const many = await request.post(`${APP}/api/spotify/match`, {
    headers: { cookie: session },
    data: { items: Array.from({ length: 11 }, (_, i) => ({ id: `i${i}`, title: `T${i}`, orchestra: "O" })) },
  });
  expect(many.status()).toBe(400);
  const anon = await (await playwright.request.newContext()).post(`${APP}/api/spotify/match`, {
    data: { items: items.slice(0, 1) },
  });
  expect(anon.status()).toBe(401);
});

test("a 429 from Spotify ends the matching cleanly: the server reports the pause, the browser stops (no retry storm), the playlist holds what was found, 'Try again' adds the rest", async ({
  browser,
  request,
}) => {
  const { session } = await login(request);
  const ctx = await browser.newContext({ baseURL: APP });
  const [name, value] = session.split("=");
  await ctx.addCookies([{ name: name!, value: value!, url: APP }]);
  const page: Page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // every recording unresolved: the composed set without its cached Spotify ids
  let files = 0;
  await page.route("**/api/compose", async (route) => {
    const r = await route.fetch();
    const j = await r.json();
    for (const t of j.tandas) for (const s of t.songs) s.spotify = null;
    if (j.closing) j.closing.spotify = null;
    if (j.opening) j.opening.spotify = null;
    files =
      j.tandas.reduce((n: number, t: { songs: unknown[] }) => n + t.songs.length, 0) +
      (j.closing ? 1 : 0) +
      (j.opening ? 1 : 0);
    await route.fulfill({ response: r, json: j });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  await sheet.getByRole("switch", { name: "Include cortinas" }).click(); // songs only: a known count
  expect(files).toBeGreaterThan(20);
  hits.length = 0;
  searchLimit.count = 0;
  searchLimit.after = 1; // the first search answers, the second is a 429 with Retry-After 30
  // a side the rules cannot prove from the mock's undated credit (the orchestra recorded the title again later,
  // e.g. Di Sarli's El Incendio 1940/1951) is reported not found, never added as a guess. The server may already
  // remember that verdict from an earlier test, so it can come in the first pass as well as after Try again.
  let notFound = 0;
  page.on("response", async (r) => {
    if (!r.url().includes("/api/spotify/match")) return;
    const j = (await r.json().catch(() => null)) as { missing?: unknown[] } | null;
    notFound += j?.missing?.length ?? 0;
  });
  try {
    await page.getByRole("button", { name: "Create playlist in Spotify" }).click();
    const toast = page.getByTestId("toast");
    await expect(toast).toContainText("Spotify is pausing searches for 30 s", { timeout: 30000 });
    await expect(toast).toContainText("try again in a minute to add the rest");
    await expect(toast.getByRole("button", { name: "Try again" })).toBeVisible();
    // no retry storm: one answered search, one 429, nothing more (Retry-After 30 is never waited out)
    const searches = hits.filter((h) => h.url.startsWith("/v1/search"));
    expect(searches.length).toBeLessThanOrEqual(3);
    expect(searches.length).toBe(2);
    // the playlist exists with the one match
    const create = last(/POST \/v1\/me\/playlists/)!;
    expect(JSON.parse(create.body).name).toMatch(/^TDJ · /);
    const adds = hits.filter((h) => /^\/v1\/playlists\/pl1\/items/.test(h.url) && h.method !== "GET");
    expect(adds).toHaveLength(1);
    // the one search that answered plus whatever the server already remembered from earlier tests (memoised
    // per process: no search for those), never a cover
    const first = JSON.parse(adds[0]!.body).uris as string[];
    expect(first.length).toBeGreaterThanOrEqual(1);
    for (const u of first) expect(u).toMatch(/^spotify:track:found/);
    const notFoundFirst = notFound;
    const left = files - first.length - notFoundFirst;
    await expect(sheet).toContainText(
      notFoundFirst
        ? `${first.length} tracks in the playlist (${notFoundFirst} not found: `
        : `${first.length} tracks in the playlist. `,
    );
    await expect(sheet).toContainText(`Spotify paused searches for 30 s: ${left} still to match.`);
    await expect(sheet.getByRole("button", { name: "Open in Spotify" })).toBeVisible();
    const btn = sheet.locator("#spotify-create");
    await expect(btn).toContainText(`Try again · ${left} left`);
    // the pause is over: Try again matches the rest and rewrites the same playlist in running order
    searchLimit.after = Number.POSITIVE_INFINITY;
    hits.length = 0;
    let matchCalls = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/spotify/match")) matchCalls++;
    });
    await btn.click();
    await expect(page.getByRole("button", { name: "Playlist created" })).toBeVisible({ timeout: 60000 });
    expect(last(/POST \/v1\/me\/playlists/)).toBeUndefined(); // no second playlist
    expect(matchCalls).toBe(Math.ceil(left / 10)); // batches of 10, sent one after the other
    let total = 0;
    const rewrites = hits.filter((h) => /^\/v1\/playlists\/pl1\/items/.test(h.url) && h.method !== "GET");
    expect(rewrites[0]?.method).toBe("PUT"); // replaced, not appended: the new matches sit in their own rows
    for (const a of rewrites) {
      const uris = JSON.parse(a.body).uris as string[];
      expect(uris.length).toBeLessThanOrEqual(100);
      for (const u of uris) expect(u).not.toMatch(/cover/);
      total += uris.length;
    }
    // every side is either in the playlist or reported not found: nothing dropped silently
    const notFoundAgain = notFound - notFoundFirst;
    expect(total).toBe(first.length + left - notFoundAgain);
    await expect(sheet).toContainText(
      `Added ${left - notFoundAgain} more${notFoundAgain ? ` (${notFoundAgain} not found)` : ""}.`,
    );
    // the matches went into the DJ's database: a second export of the same set searches nothing, and it
    // updates the playlist made before (remembered for this night) instead of making another one
    hits.length = 0;
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await page.getByRole("button", { name: "Export" }).first().click();
    await expect(sheet.locator("#spotify-target")).toHaveValue("https://open.spotify.com/playlist/pl1");
    await page.getByRole("button", { name: "Update playlist in Spotify" }).click();
    await expect(page.getByRole("button", { name: "Playlist updated" })).toBeVisible({ timeout: 60000 });
    expect(hits.filter((h) => h.url.startsWith("/v1/search"))).toHaveLength(0);
    expect(last(/POST \/v1\/me\/playlists/)).toBeUndefined();
    expect(hits.find((h) => /^\/v1\/playlists\/pl1\/items/.test(h.url) && h.method !== "GET")?.method).toBe(
      "PUT",
    );
    // the update also rewrites the title and description: the score in it is the one on the page
    const det = hits.find((h) => h.url === "/v1/playlists/pl1" && h.method === "PUT");
    expect(det, "playlist details updated").toBeTruthy();
    const dj = JSON.parse(det!.body) as { name: string; description: string };
    expect(dj.name).toMatch(/^TDJ · /);
    const shown = (
      await page
        .getByTestId("score")
        .first()
        .textContent()
        .catch(() => null)
    )?.match(/\d+/)?.[0];
    expect(dj.description).toMatch(new RegExp(`Score ${shown ?? "\\d+"}/100\\.$`));
    // the console stayed clean: no 401s from /api/*/me, no 429 storm, no stale PKCE refresh
    expect(errors.filter((e) => /401|429|accounts\.spotify|api\.spotify/.test(e))).toEqual([]);
  } finally {
    searchLimit.after = Number.POSITIVE_INFINITY;
  }
  await ctx.close();
});

test("Spotify proves the playlist: a 118-row night whose chunk 2 Spotify drops once is read back, repaired and shows 118 of 118, in order", async ({
  browser,
  request,
}) => {
  const { session } = await login(request);
  const ctx = await browser.newContext({ baseURL: APP });
  const [name, value] = session.split("=");
  await ctx.addCookies([{ name: name!, value: value!, url: APP }]);
  const page: Page = await ctx.newPage();
  // a night of exactly 118 rows (songs, cortinas, opening, closing), every row with its own Spotify id: no search
  let n = 0;
  await page.route("**/api/compose", async (route) => {
    // a longer night than the default, cut down to 118 rows below
    const sent = JSON.parse(route.request().postData() ?? "{}");
    const r = await route.fetch({ postData: JSON.stringify({ ...sent, hours: 5 }) });
    const j = await r.json();
    type Row = { spotify?: unknown } | null | undefined;
    const rows = (p: typeof j) =>
      p.tandas.reduce(
        (a: number, t: { songs: unknown[]; cortina?: unknown }) => a + t.songs.length + (t.cortina ? 1 : 0),
        0,
      ) +
      (p.opening ? 1 : 0) +
      (p.closing ? 1 : 0);
    while (rows(j) > 118) {
      const last = j.tandas.at(-1);
      if (last.songs.length > 1) last.songs.pop();
      else j.tandas.pop();
    }
    const id = (x: Row) => {
      if (x) x.spotify = { uri: `spotify:track:verify${n++}` };
    };
    if (j.opening) id(j.opening);
    for (const t of j.tandas) {
      for (const s of t.songs) id(s);
      if (t.cortina) id(t.cortina);
    }
    if (j.closing) id(j.closing);
    n = rows(j);
    await route.fulfill({ response: r, json: j });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  expect(n).toBe(118);
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  hits.length = 0;
  spotifyWrites.posts = 0;
  spotifyWrites.dropPosts = new Set([2]); // a new playlist gets two POSTs: the second (rows 101–118) is lost once
  try {
    await page.getByRole("button", { name: "Create playlist in Spotify" }).click();
    await expect(page.getByRole("button", { name: "Playlist created" })).toBeVisible({ timeout: 60000 });
    const verified = page.getByTestId("spotify-verified");
    await expect(page.getByTestId("spotify-verified-summary")).toHaveText(
      "118 of 118 in Spotify, in order ✓",
    );
    await expect(verified).toHaveAttribute("data-ok", "true");
    await expect(page.getByTestId("spotify-verified-lines")).toContainText("written again");
    // what happened at Spotify: two POSTs, the playlist read back (2 pages), the lost 18 appended, read again
    const writes = hits.filter((h) => h.url === "/v1/playlists/pl1/items");
    expect(writes.map((w) => [w.method, JSON.parse(w.body).uris.length])).toEqual([
      ["POST", 100],
      ["POST", 18],
      ["POST", 18],
    ]);
    const reads = hits.filter((h) => /^\/v1\/playlists\/pl1\/items\?/.test(h.url) && h.method === "GET");
    expect(reads.length).toBeGreaterThanOrEqual(3);
    for (const r of reads) expect(r.headers.authorization).toBe("Bearer acc-1"); // the DJ's own account
    expect(reads.every((r) => r.url.includes("market=from_token"))).toBe(true);
    // (a side whose carried id the match rules cannot prove is searched again: its row holds the found recording)
    const sent = writes.slice(0, 2).flatMap((w) => JSON.parse(w.body).uris as string[]);
    expect(lists.get("pl1")!.uris).toEqual(sent);
    expect(sent).toHaveLength(118);
    // the playlist as it is in Spotify, every row with its slot and a ✓
    const list = page.getByTestId("spotify-verified-list");
    await list.locator("summary").click();
    await expect(list.locator("li")).toHaveCount(118);
    await expect(list.locator("li[data-mark=ok]")).toHaveCount(118);

    // "Check playlist" on the linked playlist reads it and writes nothing; a row lost since is flagged
    lists.get("pl1")!.uris.splice(104, 1);
    hits.length = 0;
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await page.getByRole("button", { name: "Export" }).first().click();
    await sheet.locator("#spotify-check").click();
    await expect(page.getByTestId("spotify-verified-summary")).toHaveText("104 of 118 in Spotify, in order");
    await expect(page.getByTestId("spotify-verified-lines")).toContainText("Missing: ");
    expect(hits.filter((h) => h.method !== "GET" && /\/v1\/playlists\//.test(h.url))).toEqual([]);
    // "Fix in Spotify" rewrites it in order
    await page.locator("#spotify-verified-fix").click();
    await expect(page.getByTestId("spotify-verified-summary")).toHaveText(
      "118 of 118 in Spotify, in order ✓",
      {
        timeout: 30000,
      },
    );
    expect(lists.get("pl1")!.uris).toHaveLength(118);
  } finally {
    spotifyWrites.dropPosts = new Set();
  }
  await ctx.close();
});
/** each cortina's played length from VLC/rekordbox marks: stop − start (cortinas start at their chorus since 2026-11) */
function playedLengths(text: string, start: RegExp, stop: RegExp): number[] {
  const starts = [...text.matchAll(start)].map((m) => Number(m[1]));
  const stops = [...text.matchAll(stop)].map((m) => Number(m[1]));
  // a cortina without a start point has no start mark: pair each stop with the start right before it
  const out: number[] = [];
  let si = 0;
  const pos = (re: RegExp) => [...text.matchAll(re)].map((m) => m.index ?? 0);
  const sp = pos(start);
  const tp = pos(stop);
  tp.forEach((at, i) => {
    let st = 0;
    while (si < sp.length && sp[si]! < at) {
      st = starts[si]!;
      si++;
    }
    out.push(Math.round((stops[i]! - st) * 10) / 10);
  });
  return out;
}
test("cortina play length: the Export sheet's stepper changes the M3U8 (VLC stop-time) and the setting persists in Settings → Playback", async ({
  browser,
  request,
}) => {
  const p = await (await request.post(`${APP}/api/compose`, { data: { hours: 2, seed: 3 } })).json();
  // the route: explicit seconds, else each cortina's own length
  const at60 = await (
    await request.post(`${APP}/api/export`, { data: { playlist: p, format: "m3u8", cortinaStopSec: 60 } })
  ).text();
  const cortinas = p.tandas.filter((t: { cortina: unknown }) => t.cortina).length;
  expect(cortinas).toBeGreaterThan(0);
  const m3u = playedLengths(at60, /^#EXTVLCOPT:start-time=([\d.]+)$/gm, /^#EXTVLCOPT:stop-time=([\d.]+)$/gm);
  expect(m3u).toEqual(Array(cortinas).fill(60));
  const xspf = await (
    await request.post(`${APP}/api/export`, { data: { playlist: p, format: "xspf", cortinaStopSec: 60 } })
  ).text();
  expect(
    playedLengths(
      xspf,
      /<vlc:option>start-time=([\d.]+)<\/vlc:option>/g,
      /<vlc:option>stop-time=([\d.]+)<\/vlc:option>/g,
    ),
  ).toEqual(Array(cortinas).fill(60));
  const rb = await (
    await request.post(`${APP}/api/export`, {
      data: { playlist: p, format: "rekordbox", cortinaStopSec: 60 },
    })
  ).text();
  expect(
    playedLengths(
      rb,
      /<POSITION_MARK Name="Cortina in [^"]*" Type="0" Start="([\d.]+)"/g,
      /<POSITION_MARK Name="Cortina out [^"]*" Type="0" Start="([\d.]+)"/g,
    ),
  ).toEqual(Array(cortinas).fill(60));
  // the sheet
  const ctx = await browser.newContext({ baseURL: APP });
  const page: Page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet).toContainText("Cortinas stop at 45 s");
  await expect(sheet).toContainText("Spotify plays them in full"); // round8-ux.md §1.9: one sentence
  await sheet.getByRole("button", { name: "Increase cortina play length" }).click();
  await expect(sheet).toContainText("Cortinas stop at 50 s");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    sheet.getByRole("button", { name: /M3U8 playlist/ }).click(),
  ]);
  const text = (await import("node:fs")).readFileSync((await download.path())!, "utf8");
  const lens = playedLengths(text, /^#EXTVLCOPT:start-time=([\d.]+)$/gm, /^#EXTVLCOPT:stop-time=([\d.]+)$/gm);
  expect(lens.length).toBeGreaterThan(0);
  expect(new Set(lens)).toEqual(new Set([50]));
  // Settings → Playback shows the same value and can hand it back to the composer
  await page.goto("/settings");
  const playback = page.getByRole("group", { name: "Cortina play length" });
  await expect(page.getByText("Your own length")).toBeVisible();
  await expect(playback).toContainText("50");
  await page.getByRole("switch", { name: "Follow the composer's cortina length" }).click();
  await expect(page.getByText("Follows the composer")).toBeVisible();
  await ctx.close();
});

/* ---------- direct Google (Drive + YouTube) ---------- */

/** Runs /api/google/login?scope=… up to the callback; `code` decides what the mock consent screen granted. */
async function googleLogin(
  request: APIRequestContext,
  scope: "" | "drive" | "youtube",
  code: string,
  existing?: string,
) {
  const r = await request.get(`${APP}/api/google/login?scope=${scope}&next=/`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const to = new URL(r.headers().location!);
  const state = to.searchParams.get("state")!;
  const stateCookie = cookieOf(setCookies(r), "tdj_gg_state")!;
  const cb = await request.get(`${APP}/api/google/callback?code=${code}&state=${encodeURIComponent(state)}`, {
    maxRedirects: 0,
    headers: { cookie: [stateCookie, existing].filter(Boolean).join("; ") },
  });
  expect(cb.status()).toBe(302);
  const set = setCookies(cb);
  return { session: cookieOf(set, "tdj_gg")!, location: cb.headers().location!, setCookie: set, to };
}

test("2026-11: a sign-in the Mac / iPhone app opened in the system browser ends in the app (tdj://auth ticket → /api/app/redeem)", async ({
  request,
  playwright,
}) => {
  // the same https callback as the web (no new redirect URI at Google), marked as the app's by `client=app`
  const r = await request.get(`${APP}/api/google/login?client=app&scope=youtube&next=/booth`, {
    maxRedirects: 0,
  });
  const to = new URL(r.headers().location!);
  expect(to.searchParams.get("redirect_uri")).toBe(`${APP}/api/google/callback`);
  const state = to.searchParams.get("state")!;
  const cb = await request.get(
    `${APP}/api/google/callback?code=code-gg-youtube&state=${encodeURIComponent(state)}`,
    { maxRedirects: 0, headers: { cookie: cookieOf(setCookies(r), "tdj_gg_state")! } },
  );
  expect(cb.status()).toBe(302);
  // the browser never gets the session: it is handed to the app's deep link as a short-lived ticket
  expect(cookieOf(setCookies(cb), "tdj_gg")).toBeFalsy();
  const deep = new URL(cb.headers().location!);
  expect(`${deep.protocol}//${deep.host}${deep.pathname}`).toBe("tdj://auth/google");
  expect(deep.searchParams.get("next")).toBe("/booth");
  const ticket = deep.searchParams.get("ticket")!;
  expect(ticket).toMatch(/^[A-Za-z0-9\-_.~]{16,4096}$/);
  // the app's own cookie jar redeems it once: the usual sealed cookie, then the page it started from
  const jar = await playwright.request.newContext();
  const red = await jar.get(
    `${APP}/api/app/redeem?provider=google&ticket=${encodeURIComponent(ticket)}&next=/booth`,
    { maxRedirects: 0 },
  );
  expect(red.status()).toBe(303);
  expect(red.headers().location).toBe(`${APP}/booth?connected=google`);
  const session = cookieOf(setCookies(red), "tdj_gg")!;
  expect(session).toBeTruthy();
  const me = await jar.get(`${APP}/api/google/me`, { headers: { cookie: session } });
  expect((await me.json()).scopes).toMatchObject({ youtube: true });
  // single use, and never for another provider
  const again = await jar.get(
    `${APP}/api/app/redeem?provider=google&ticket=${encodeURIComponent(ticket)}&next=/booth`,
    { maxRedirects: 0 },
  );
  expect(again.headers().location).toContain("error=google_ticket_used");
  // the app asks this path to know the server can do it: 400 without a ticket, never 404
  expect((await jar.get(`${APP}/api/app/redeem`)).status()).toBe(400);
  // a refused consent comes back to the app's Settings, not to this browser's
  const r2 = await request.get(`${APP}/api/google/login?client=app`, { maxRedirects: 0 });
  const s2 = new URL(r2.headers().location!).searchParams.get("state")!;
  const denied = await request.get(
    `${APP}/api/google/callback?error=access_denied&state=${encodeURIComponent(s2)}`,
    { maxRedirects: 0, headers: { cookie: cookieOf(setCookies(r2), "tdj_gg_state")! } },
  );
  expect(denied.headers().location).toBe(
    `tdj://open?${new URLSearchParams({ path: "/settings?error=google_denied" })}`,
  );
});

test("Google login asks for the feature scope incrementally: offline access, consent, include_granted_scopes, state cookie", async ({
  request,
}) => {
  const r = await request.get(`${APP}/api/google/login?scope=drive`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const to = new URL(r.headers().location!);
  expect(to.origin + to.pathname).toBe(`${MOCK}/gaccounts/o/oauth2/v2/auth`);
  expect(to.searchParams.get("client_id")).toBe("google-client");
  expect(to.searchParams.get("response_type")).toBe("code");
  expect(to.searchParams.get("redirect_uri")).toBe(`${APP}/api/google/callback`);
  const scope = (to.searchParams.get("scope") ?? "").split(" ");
  expect(scope).toEqual(
    expect.arrayContaining(["openid", "email", "https://www.googleapis.com/auth/drive.file"]),
  );
  expect(scope).not.toContain("https://www.googleapis.com/auth/youtube");
  expect(to.searchParams.get("access_type")).toBe("offline");
  expect(to.searchParams.get("prompt")).toBe("consent");
  expect(to.searchParams.get("include_granted_scopes")).toBe("true");
  const sc = setCookies(r).find((c) => c.startsWith("tdj_gg_state="))!;
  expect(sc).toMatch(/HttpOnly/);
  expect(sc).toMatch(/Path=\/api\/google/);
  // YouTube is a separate consent, nothing else; no scope at all = identity only
  const yt = new URL(
    (await request.get(`${APP}/api/google/login?scope=youtube`, { maxRedirects: 0 })).headers().location!,
  );
  expect(yt.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/youtube");
  expect(yt.searchParams.get("scope")).not.toContain("drive.file");
  const none = new URL(
    (await request.get(`${APP}/api/google/login`, { maxRedirects: 0 })).headers().location!,
  );
  expect(none.searchParams.get("scope")).toBe("openid email profile");
});

test("Google callback exchanges the code with the client secret in the body, seals tdj_gg and merges scopes across consents", async ({
  request,
  playwright,
}) => {
  hits.length = 0;
  const first = await googleLogin(request, "drive", "code-gg-drive");
  expect(first.location).toBe(`${APP}/?connected=google`);
  const raw = first.setCookie.find((c) => c.startsWith("tdj_gg="))!;
  expect(raw).toMatch(/HttpOnly/);
  expect(raw).toMatch(/SameSite=Lax/);
  expect(first.session).not.toContain("gg-drive");
  const tok = last(/POST \/google\/token/)!;
  const form = new URLSearchParams(tok.body);
  expect(form.get("grant_type")).toBe("authorization_code");
  expect(form.get("code")).toBe("code-gg-drive");
  expect(form.get("redirect_uri")).toBe(`${APP}/api/google/callback`);
  expect(form.get("client_id")).toBe("google-client");
  expect(form.get("client_secret")).toBe("google-secret");
  expect(tok.headers.authorization).toBeUndefined();
  const me = await request.get(`${APP}/api/google/me`, { headers: { cookie: first.session } });
  expect(me.status()).toBe(200);
  const j = await me.json();
  expect(j.hosted).toBe(true);
  expect(j.user).toMatchObject({ id: "g1", name: "Test Google", email: "dj@gmail.test" });
  expect(j.scopes).toEqual({ drive: true, youtube: false });
  expect(j).not.toHaveProperty("token");
  // second consent for YouTube: Google issued no new refresh token; the old one and the Drive scope survive
  const second = await googleLogin(request, "youtube", "code-gg-youtube", first.session);
  const s = unsealed<{ access: string; refresh: string; scopes: string[] }>(second.session);
  expect(s.access).toBe("gg-youtube");
  expect(s.refresh).toBe("ggref-1");
  expect(s.scopes).toEqual(
    expect.arrayContaining([
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/youtube",
    ]),
  );
  const me2 = await (await playwright.request.newContext()).get(`${APP}/api/google/me`, {
    headers: { cookie: second.session },
  });
  expect((await me2.json()).scopes).toEqual({ drive: true, youtube: true });
  // anonymous: 200 + hosted:true, user null; a forged state never reaches Google
  const anon = await (await playwright.request.newContext()).get(`${APP}/api/google/me`);
  expect(anon.status()).toBe(200);
  expect(await anon.json()).toEqual({ hosted: true, user: null });
  const before = hits.length;
  const bad = await request.get(`${APP}/api/google/callback?code=x&state=forged`, {
    maxRedirects: 0,
    headers: { cookie: "tdj_gg_state=other" },
  });
  expect(bad.headers().location).toContain("error=google_state");
  expect(hits.length).toBe(before);
  const out = await request.post(`${APP}/api/google/logout`);
  expect(out.headers()["set-cookie"]).toMatch(/tdj_gg=;.*Max-Age=0/);
});

test("an expired Google access token is refreshed with the client secret in the body and the cookie re-sealed", async ({
  playwright,
}) => {
  const stale = sealed({
    access: "gg-stale",
    refresh: "ggref-1",
    expires: Date.now() - 1000,
    authorizedAt: 1,
    scopes: ["openid", "https://www.googleapis.com/auth/drive.file"],
  });
  hits.length = 0;
  const me = await (await playwright.request.newContext()).get(`${APP}/api/google/me`, {
    headers: { cookie: `tdj_gg=${encodeURIComponent(stale)}` },
  });
  expect(me.status()).toBe(200);
  expect((await me.json()).scopes.drive).toBe(true);
  const tok = last(/POST \/google\/token/)!;
  const form = new URLSearchParams(tok.body);
  expect(form.get("grant_type")).toBe("refresh_token");
  expect(form.get("refresh_token")).toBe("ggref-1");
  expect(form.get("client_secret")).toBe("google-secret");
  expect(me.headers()["set-cookie"]).toMatch(/tdj_gg=v1\./);
  expect(last(/userinfo/)!.headers.authorization).toBe("Bearer gg-refreshed");
});

test("Drive upload: finds or creates the TDJ folder, then a multipart/related body with the metadata and the file", async ({
  request,
  playwright,
}) => {
  const { session } = await googleLogin(request, "drive", "code-gg-drive");
  hits.length = 0;
  const r = await request.post(`${APP}/api/google/drive`, {
    headers: { cookie: session },
    data: { format: "m3u8", filename: "set.m3u8", text: "#EXTM3U\n#EXTINF:170,Orquesta - Found\n" },
  });
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({
    app: "google_drive",
    id: "file1",
    path: "TDJ/set.m3u8",
    url: "https://drive.google.com/file/d/file1/view",
    // asked again after the upload: Drive's size and MD5 are the bytes that were sent
    verified: { ok: true, bytes: 37, size: 37, hash: "match" },
  });
  expect(last(/GET \/google\/drive\/v3\/files\/file1\?/)!.url).toContain("fields=size,md5Checksum");
  const lookup = last(/GET \/google\/drive\/v3\/files\?/)!;
  expect(new URL(lookup.url, MOCK).searchParams.get("q")).toContain("name = 'TDJ'");
  const mk = last(/POST \/google\/drive\/v3\/files\?/)!;
  expect(JSON.parse(mk.body)).toEqual({ name: "TDJ", mimeType: "application/vnd.google-apps.folder" });
  const up = last(/POST \/google\/upload\/drive\/v3\/files\?/)!;
  expect(up.url).toContain("uploadType=multipart");
  expect(up.url).toContain("fields=id,name,webViewLink");
  expect(up.headers.authorization).toBe("Bearer gg-drive");
  const boundary = /multipart\/related; boundary=(\S+)/.exec(String(up.headers["content-type"]))?.[1];
  expect(boundary).toBeTruthy();
  const parts = up.body.split(`--${boundary}`);
  expect(parts).toHaveLength(4); // "", metadata, file, "--\r\n"
  expect(parts[1]).toContain("Content-Type: application/json; charset=UTF-8");
  expect(JSON.parse(parts[1]!.split("\r\n\r\n")[1]!.trim())).toEqual({
    name: "set.m3u8",
    parents: ["folder1"],
  });
  expect(parts[2]).toMatch(/Content-Type: [\w/.+-]+mpegurl/);
  expect(parts[2]).toContain("#EXTM3U\n#EXTINF:170,Orquesta - Found\n");
  // the Drive scope was never granted: 403 with where to go, nothing sent to Google
  const yt = await googleLogin(await playwright.request.newContext(), "youtube", "code-gg-youtube");
  const n = hits.length;
  const no = await request.post(`${APP}/api/google/drive`, {
    headers: { cookie: yt.session },
    data: { format: "m3u8", filename: "set.m3u8", text: "#EXTM3U\n", next: "/history" },
  });
  expect(no.status()).toBe(403);
  expect(await no.json()).toEqual({
    error: "needs_scope",
    scope: "drive",
    login: "/api/google/login?scope=drive&next=%2Fhistory",
  });
  expect(hits.length).toBe(n);
  // not connected → 401
  const anon = await (await playwright.request.newContext()).post(`${APP}/api/google/drive`, {
    data: { format: "m3u8", text: "x" },
  });
  expect(anon.status()).toBe(401);
});

test("YouTube: creates the playlist, searches each track, inserts items and stops at the first quota error, reporting what was left out", async ({
  request,
  playwright,
}) => {
  const { session } = await googleLogin(await playwright.request.newContext(), "youtube", "code-gg-youtube");
  const p = await (await request.post(`${APP}/api/compose`, { data: { hours: 2, seed: 5 } })).json();
  const songs =
    p.tandas.reduce((n: number, t: { songs: unknown[] }) => n + t.songs.length, 0) +
    (p.closing ? 1 : 0) +
    (p.opening ? 1 : 0);
  hits.length = 0;
  const r = await request.post(`${APP}/api/google/youtube`, {
    headers: { cookie: session },
    data: { playlist: p, includeCortinas: false, name: "Milonga YT" },
  });
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.url).toBe("https://www.youtube.com/playlist?list=ytpl1");
  expect(j.added).toBe(2);
  expect(j.quota).toBe(true);
  expect(j.missing).toEqual([]);
  expect(j.skipped).toHaveLength(songs - 2);
  const create = last(/POST \/google\/youtube\/v3\/playlists\?/)!;
  expect(create.url).toContain("part=snippet,status");
  expect(JSON.parse(create.body)).toEqual({
    snippet: { title: "Milonga YT", description: expect.stringContaining("cortinas excluded") },
    status: { privacyStatus: "private" },
  });
  expect(create.headers.authorization).toBe("Bearer gg-youtube");
  const searches = hits.filter((h) => h.url.startsWith("/google/youtube/v3/search?"));
  expect(searches).toHaveLength(3); // two hits, the third answered 403 quotaExceeded → stop
  for (const s of searches) {
    const q = new URL(s.url, MOCK).searchParams;
    expect(q.get("type")).toBe("video");
    expect(q.get("maxResults")).toBe("1");
    expect(q.get("q")).toBeTruthy();
  }
  const inserts = hits.filter((h) => h.url.startsWith("/google/youtube/v3/playlistItems?"));
  expect(inserts).toHaveLength(2);
  expect(JSON.parse(inserts[0]!.body)).toEqual({
    snippet: { playlistId: "ytpl1", resourceId: { kind: "youtube#video", videoId: "vid1" } },
  });
  // with only the Drive scope the route asks for the YouTube consent first
  const drive = await googleLogin(await playwright.request.newContext(), "drive", "code-gg-drive");
  const no = await request.post(`${APP}/api/google/youtube`, {
    headers: { cookie: drive.session },
    data: { playlist: p },
  });
  expect(no.status()).toBe(403);
  expect((await no.json()).login).toBe("/api/google/login?scope=youtube&next=%2F");
});

/* ---------- direct Dropbox (PKCE) ---------- */

async function dropboxLogin(request: APIRequestContext) {
  const r = await request.get(`${APP}/api/dropbox/login?next=/`, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
  const to = new URL(r.headers().location!);
  const state = to.searchParams.get("state")!;
  const set = setCookies(r);
  const cookies = [cookieOf(set, "tdj_db_state")!, cookieOf(set, "tdj_db_pkce")!];
  const cb = await request.get(
    `${APP}/api/dropbox/callback?code=code-db&state=${encodeURIComponent(state)}`,
    {
      maxRedirects: 0,
      headers: { cookie: cookies.join("; ") },
    },
  );
  expect(cb.status()).toBe(302);
  const cbSet = setCookies(cb);
  return {
    session: cookieOf(cbSet, "tdj_db")!,
    location: cb.headers().location!,
    setCookie: cbSet,
    to,
    cookies,
  };
}

test("Dropbox login uses PKCE (S256) and offline access; the callback proves the verifier and seals tdj_db", async ({
  request,
  playwright,
}) => {
  hits.length = 0;
  const { session, location, setCookie, to, cookies } = await dropboxLogin(request);
  expect(to.origin + to.pathname).toBe(`${MOCK}/dbwww/oauth2/authorize`);
  expect(to.searchParams.get("client_id")).toBe("db-key");
  expect(to.searchParams.get("response_type")).toBe("code");
  expect(to.searchParams.get("redirect_uri")).toBe(`${APP}/api/dropbox/callback`);
  expect(to.searchParams.get("token_access_type")).toBe("offline");
  expect(to.searchParams.get("code_challenge_method")).toBe("S256");
  const challenge = to.searchParams.get("code_challenge") ?? "";
  expect(challenge.length).toBeGreaterThanOrEqual(43);
  expect(to.searchParams.has("scope")).toBe(false); // scopes come from the app's permissions tab
  expect(cookies[1]).toMatch(/^tdj_db_pkce=v1\./); // the verifier only ever travels sealed
  expect(location).toBe(`${APP}/?connected=dropbox`);
  const raw = setCookie.find((c) => c.startsWith("tdj_db="))!;
  expect(raw).toMatch(/HttpOnly/);
  expect(session).not.toContain("db-1");
  const tok = last(/POST \/dropbox\/oauth2\/token/)!;
  const form = new URLSearchParams(tok.body);
  expect(form.get("grant_type")).toBe("authorization_code");
  expect(form.get("code")).toBe("code-db");
  expect(form.get("redirect_uri")).toBe(`${APP}/api/dropbox/callback`);
  const verifier = form.get("code_verifier") ?? "";
  expect(createHash("sha256").update(verifier).digest("base64url")).toBe(challenge);
  expect(tok.headers.authorization).toBe(`Basic ${Buffer.from("db-key:db-secret").toString("base64")}`);
  expect(form.has("client_id")).toBe(false);
  expect(unsealed<{ refresh: string }>(session).refresh).toBe("dbref-1");
  // the state and PKCE cookies are gone afterwards; a callback without the verifier cookie is refused
  expect(setCookie.find((c) => c.startsWith("tdj_db_pkce="))).toMatch(/Max-Age=0/);
  const again = await request.get(`${APP}/api/dropbox/login`, { maxRedirects: 0 });
  const st = new URL(again.headers().location!).searchParams.get("state")!;
  const n = hits.length;
  const bad = await request.get(`${APP}/api/dropbox/callback?code=x&state=${encodeURIComponent(st)}`, {
    maxRedirects: 0,
    headers: { cookie: cookieOf(setCookies(again), "tdj_db_state")! },
  });
  expect(bad.headers().location).toContain("error=dropbox_state");
  expect(hits.length).toBe(n);
  // me / anonymous / logout / refresh
  const me = await request.get(`${APP}/api/dropbox/me`, { headers: { cookie: session } });
  expect(me.status()).toBe(200);
  expect((await me.json()).user).toMatchObject({
    id: "dbid:1",
    name: "Test Dropbox",
    email: "dj@example.test",
  });
  const anon = await (await playwright.request.newContext()).get(`${APP}/api/dropbox/me`);
  expect(anon.status()).toBe(200);
  expect(await anon.json()).toEqual({ hosted: true, user: null });
  const out = await request.post(`${APP}/api/dropbox/logout`);
  expect(out.headers()["set-cookie"]).toMatch(/tdj_db=;.*Max-Age=0/);
  const stale = sealed({
    access: "db-stale",
    refresh: "dbref-1",
    expires: Date.now() - 1000,
    authorizedAt: 1,
  });
  hits.length = 0;
  const fresh = await (await playwright.request.newContext()).get(`${APP}/api/dropbox/me`, {
    headers: { cookie: `tdj_db=${encodeURIComponent(stale)}` },
  });
  expect(fresh.status()).toBe(200);
  expect(new URLSearchParams(last(/POST \/dropbox\/oauth2\/token/)!.body).get("grant_type")).toBe(
    "refresh_token",
  );
  expect(fresh.headers()["set-cookie"]).toMatch(/tdj_db=v1\./);
  expect(last(/get_current_account/)!.headers.authorization).toBe("Bearer db-refreshed");
});

test("Dropbox upload: files/upload into /<set>/<file> of the app folder, then a shared link (reused when it exists)", async ({
  request,
  playwright,
}) => {
  const { session } = await dropboxLogin(await playwright.request.newContext());
  hits.length = 0;
  const r = await request.post(`${APP}/api/dropbox/upload`, {
    headers: { cookie: session },
    data: { format: "m3u8", filename: "set.m3u8", text: "#EXTM3U\n", set: "Milonga / test" },
  });
  expect(r.status()).toBe(200);
  expect(await r.json()).toEqual({
    app: "dropbox",
    path: "/Apps/TDJ/Milonga _ test/set.m3u8",
    url: "https://www.dropbox.com/scl/fo/new?dl=0",
    // asked again after the upload: Dropbox's size and content hash are the bytes that were sent
    verified: { ok: true, bytes: 8, size: 8, hash: "match" },
  });
  expect(JSON.parse(last(/get_metadata/)!.body)).toEqual({ path: "/milonga _ test/set.m3u8" });
  const up = last(/POST \/dropbox-content\/2\/files\/upload/)!;
  expect(up.headers["content-type"]).toBe("application/octet-stream");
  expect(up.headers.authorization).toBe("Bearer db-1");
  expect(JSON.parse(String(up.headers["dropbox-api-arg"]))).toEqual({
    path: "/Milonga _ test/set.m3u8",
    mode: "add",
    autorename: true,
    mute: false,
  });
  expect(up.body).toBe("#EXTM3U\n");
  const share = last(/create_shared_link_with_settings/)!;
  expect(JSON.parse(share.body)).toEqual({ path: "/milonga _ test/set.m3u8" });
  expect(share.headers["content-type"]).toBe("application/json");
  // a link that already exists (409) is looked up instead of failing the export
  const r2 = await request.post(`${APP}/api/dropbox/upload`, {
    headers: { cookie: session },
    data: { format: "csv", filename: "again.csv", text: "a,b\n", set: "Set" },
  });
  expect((await r2.json()).url).toBe("https://www.dropbox.com/scl/fo/existing?dl=0");
  expect(JSON.parse(last(/list_shared_links/)!.body)).toEqual({ path: "/set/again.csv", direct_only: true });
  // not connected → 401; a bad format → 400
  const anon = await (await playwright.request.newContext()).post(`${APP}/api/dropbox/upload`, {
    data: { format: "m3u8", text: "x" },
  });
  expect(anon.status()).toBe(401);
  const bad = await request.post(`${APP}/api/dropbox/upload`, {
    headers: { cookie: session },
    data: { format: "exe", text: "x" },
  });
  expect(bad.status()).toBe(400);
});

/* ---------- Settings and Export sheet with the direct connections ---------- */

test("Settings (direct): Google and Dropbox rows show the account, permissions per feature, one button when logged out", async ({
  browser,
  playwright,
}) => {
  const gg = await googleLogin(await playwright.request.newContext(), "drive", "code-gg-drive");
  const db = await dropboxLogin(await playwright.request.newContext());
  const ctx = await browser.newContext({ baseURL: APP });
  await ctx.addCookies(
    [gg.session, db.session].map((c) => {
      const [name, value] = c.split("=");
      return { name: name!, value: value!, url: APP };
    }),
  );
  const page = await ctx.newPage();
  await page.goto("/settings");
  await expect(page.locator("#connector-google")).toContainText("Test Google");
  await expect(page.locator("#connector-dropbox")).toContainText("Test Dropbox");
  await page.locator("#connector-google").click();
  const sheet = page.getByRole("dialog", { name: "Google" });
  await expect(sheet).toContainText("Connected as Test Google");
  await expect(sheet.locator("#google-scope-drive")).toContainText("Allowed");
  await expect(sheet.locator("#google-scope-youtube")).toContainText("Not yet");
  await expect(sheet.locator("#google-grant-drive")).toHaveCount(0);
  await expect(sheet.locator("#google-grant-youtube")).toHaveText("Allow YouTube");
  await expect(sheet.locator("#google-logout")).toBeVisible();
  const [grant] = await Promise.all([
    page.waitForRequest((r) => r.url().startsWith(`${APP}/api/google/login`)),
    sheet.locator("#google-grant-youtube").click(),
  ]);
  const q = new URL(grant.url()).searchParams;
  expect(q.get("scope")).toBe("youtube");
  expect(q.get("next")).toBe("/settings");
  await page.goto("/settings");
  await page.locator("#connector-dropbox").click();
  const dbx = page.getByRole("dialog", { name: "Dropbox" });
  await expect(dbx).toContainText("Connected as Test Dropbox");
  await expect(dbx).toContainText("Apps/TDJ");
  await expect(dbx.locator("#dropbox-logout")).toBeVisible();
  // the Pipedream alternative lives under Advanced, named as such
  await expect(page.locator("#connector-pd-youtube_data_api")).toContainText("via Pipedream");
  await ctx.close();
  // logged out: one primary action per sheet, pointing at the server login routes
  const ctx2 = await browser.newContext({ baseURL: APP });
  const page2 = await ctx2.newPage();
  await page2.goto("/settings");
  await expect(page2.locator("#connector-google")).toContainText("Connect");
  await page2.locator("#connector-google").click();
  const g2 = page2.getByRole("dialog", { name: "Google" });
  await expect(g2.locator("#google-login")).toHaveText("Connect with Google");
  await expect(g2.locator("#google-scope-drive")).toHaveCount(0);
  const [login] = await Promise.all([
    page2.waitForRequest((r) => r.url().startsWith(`${APP}/api/google/login`)),
    g2.locator("#google-login").click(),
  ]);
  expect(new URL(login.url()).searchParams.get("scope")).toBeNull();
  await page2.goto("/settings");
  await page2.locator("#connector-dropbox").click();
  const d2 = page2.getByRole("dialog", { name: "Dropbox" });
  await expect(d2.locator("#dropbox-login")).toHaveText("Connect Dropbox");
  const [dlogin] = await Promise.all([
    page2.waitForRequest((r) => r.url().startsWith(`${APP}/api/dropbox/login`)),
    d2.locator("#dropbox-login").click(),
  ]);
  expect(new URL(dlogin.url()).searchParams.get("next")).toBe("/settings");
  await ctx2.close();
});

test("Export sheet (direct): Save to Dropbox uploads the chosen format with the session cookie; Drive without its scope goes to consent", async ({
  browser,
  playwright,
}) => {
  const gg = await googleLogin(await playwright.request.newContext(), "", "code-gg-none");
  const db = await dropboxLogin(await playwright.request.newContext());
  const ctx = await browser.newContext({ baseURL: APP });
  await ctx.addCookies(
    [gg.session, db.session].map((c) => {
      const [name, value] = c.split("=");
      return { name: name!, value: value!, url: APP };
    }),
  );
  const page: Page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet.locator("#send-dropbox")).toContainText(".m3u8");
  await expect(sheet.locator("#send-google_drive")).toContainText("Allow");
  await expect(sheet.locator("#send-youtube")).toContainText("Allow");
  await sheet.getByRole("combobox", { name: "File format" }).selectOption("csv");
  await expect(sheet.locator("#send-dropbox")).toContainText(".csv");
  hits.length = 0;
  await sheet.locator("#send-dropbox").click();
  await expect(page.getByTestId("toast")).toContainText("Saved to Dropbox", { timeout: 20000 });
  const up = last(/POST \/dropbox-content\/2\/files\/upload/)!;
  expect(up.body).toMatch(/^"?#/); // the CSV export, not the m3u8
  expect(JSON.parse(String(up.headers["dropbox-api-arg"])).path).toMatch(/\.csv$/);
  await expect(sheet).toContainText("Saved CSV to Dropbox (/Apps/TDJ/");
  // the file read back before it went up, and the copy Dropbox holds asked again after
  await expect(sheet).toContainText(/CSV file: \d+ tracks, order checked ✓/);
  await expect(sheet).toContainText(/Dropbox: the saved file matches the export, all \d+ bytes ✓/);
  await expect(sheet.getByRole("button", { name: "Open in Dropbox" })).toBeVisible();
  // Drive: the scope was never granted → the server says so and the browser goes to Google's consent for it
  const [consent] = await Promise.all([
    page.waitForRequest((r) => r.url().startsWith(`${APP}/api/google/login`)),
    sheet.locator("#send-google_drive").click(),
  ]);
  const q = new URL(consent.url()).searchParams;
  expect(q.get("scope")).toBe("drive");
  expect(q.get("next")).toBe("/");
  await ctx.close();
});

/* ---------- round 8: connectivity audit fixes ---------- */

test("Dropbox upload with ñ, í and an en dash: the Dropbox-API-Arg header is ASCII (\\uXXXX escapes) and the path keeps every character", async ({
  request,
  playwright,
}) => {
  const { session } = await dropboxLogin(await playwright.request.newContext());
  hits.length = 0;
  const r = await request.post(`${APP}/api/dropbox/upload`, {
    headers: { cookie: session },
    data: {
      format: "m3u8",
      filename: "Señor · Año 1935 – ñ.m3u8",
      text: "#EXTM3U\n#EXTINF:170,Canaro - Poema\n",
      set: "Práctica – Ñandú",
    },
  });
  expect(r.status()).toBe(200);
  const j = await r.json();
  expect(j.path).toBe("/Apps/TDJ/Práctica – Ñandú/Señor · Año 1935 – ñ.m3u8");
  const up = last(/POST \/dropbox-content\/2\/files\/upload/)!;
  const arg = String(up.headers["dropbox-api-arg"]);
  for (const ch of arg) expect(ch.charCodeAt(0)).toBeLessThan(0x7f);
  expect(arg).toContain("\\u00f1");
  expect(arg).toContain("\\u2013");
  expect(JSON.parse(arg)).toEqual({
    path: "/Práctica – Ñandú/Señor · Año 1935 – ñ.m3u8",
    mode: "add",
    autorename: true,
    mute: false,
  });
  expect(up.body).toContain("Canaro - Poema");
});

test("open redirect: ?next=//evil.example and /\\evil are refused at login and at the callback; a same-origin path is kept", async ({
  request,
}) => {
  for (const next of ["//evil.example/x", "/\\evil.example", "https://evil.example/", "evil"]) {
    const r = await request.get(`${APP}/api/spotify/login?next=${encodeURIComponent(next)}`, {
      maxRedirects: 0,
    });
    const state = new URL(r.headers().location!).searchParams.get("state")!;
    expect(Buffer.from(state.split(".")[1]!, "base64url").toString()).toBe("/settings");
    const cb = await request.get(
      `${APP}/api/spotify/callback?code=code-xyz&state=${encodeURIComponent(state)}`,
      { maxRedirects: 0, headers: { cookie: cookieOf(setCookies(r), "tdj_sp_state")! } },
    );
    expect(cb.headers().location).toBe(`${APP}/settings?connected=spotify`);
  }
  // a state cookie forged to carry "//evil.example" is refused at the callback too
  const forged = `${"a".repeat(22)}.${Buffer.from("//evil.example/x").toString("base64url")}`;
  const cb = await request.get(
    `${APP}/api/spotify/callback?code=code-xyz&state=${encodeURIComponent(forged)}`,
    { maxRedirects: 0, headers: { cookie: `tdj_sp_state=${encodeURIComponent(forged)}` } },
  );
  expect(cb.headers().location).toBe(`${APP}/settings?connected=spotify`);
  const ok = await request.get(`${APP}/api/google/login?next=${encodeURIComponent("/history?x=1")}`, {
    maxRedirects: 0,
  });
  const st = new URL(ok.headers().location!).searchParams.get("state")!;
  expect(Buffer.from(st.split(".")[1]!, "base64url").toString()).toBe("/history?x=1");
});

test("CSRF: a state-changing route refuses another site's Origin (nothing reaches the provider) and accepts the app's own", async ({
  request,
  playwright,
}) => {
  const { session } = await login(request);
  hits.length = 0;
  const evil = { cookie: session, origin: "https://evil.example" };
  const items = [{ id: "csrf", title: "Ciego", orchestra: "Francisco Canaro" }];
  const m = await request.post(`${APP}/api/spotify/match`, { headers: evil, data: { items } });
  expect(m.status()).toBe(403);
  expect((await m.json()).error).toMatch(/did not come from the app/);
  const pl = await request.post(`${APP}/api/spotify/playlist`, {
    headers: evil,
    data: { uris: ["spotify:track:x"], includeCortinas: true },
  });
  expect(pl.status()).toBe(403);
  const out = await request.post(`${APP}/api/spotify/logout`, { headers: evil });
  expect(out.status()).toBe(403);
  expect(out.headers()["set-cookie"]).toBeUndefined();
  const yt = await request.post(`${APP}/api/google/youtube`, { headers: evil, data: { queries: ["x"] } });
  expect(yt.status()).toBe(403);
  const db = await request.post(`${APP}/api/dropbox/upload`, {
    headers: evil,
    data: { format: "m3u8", text: "x" },
  });
  expect(db.status()).toBe(403);
  const tok = await request.post(`${APP}/api/connect/token`, { headers: evil, data: {} });
  expect(tok.status()).toBe(403);
  const cross = await request.post(`${APP}/api/spotify/match`, {
    headers: { cookie: session, "sec-fetch-site": "cross-site" },
    data: { items },
  });
  expect(cross.status()).toBe(403);
  expect(hits.filter((h) => h.url.startsWith("/v1/"))).toHaveLength(0);
  // the app's own origin (what a browser sends from its pages) is accepted; no Origin at all (curl) too
  const own = await request.post(`${APP}/api/spotify/match`, {
    headers: { cookie: session, origin: APP },
    data: { items },
  });
  expect(own.status()).toBe(200);
  const none = await (await playwright.request.newContext()).post(`${APP}/api/spotify/match`, {
    headers: { cookie: session },
    data: { items },
  });
  expect(none.status()).toBe(200);
});

test("session and token endpoints answer cache-control: no-store", async ({ request, playwright }) => {
  const { session } = await login(request);
  const anon = await playwright.request.newContext();
  for (const [path, headers] of [
    ["/api/spotify/me", { cookie: session }],
    ["/api/spotify/access", { cookie: session }],
    ["/api/spotify/me", {}],
    ["/api/google/me", {}],
    ["/api/dropbox/me", {}],
    ["/api/connect/accounts", {}],
    ["/api/db", {}],
    ["/api/ai/review", {}],
  ] as const) {
    const r = await (Object.keys(headers).length ? request : anon).get(`${APP}${path}`, { headers });
    expect(r.headers()["cache-control"], path).toBe("no-store");
  }
  const t = await request.post(`${APP}/api/connect/token`, { data: {} });
  expect(t.headers()["cache-control"]).toBe("no-store");
});

test("matching stops at the request's time budget: the rest comes back as a short pause (rateLimited) instead of a timeout", async ({
  request,
  playwright,
}) => {
  const { session } = await login(await playwright.request.newContext());
  const items = Array.from({ length: 4 }, (_, i) => ({
    id: `slow${i}`,
    title: `Slow tango ${i}`,
    orchestra: "Osvaldo Pugliese",
    year: 1950,
    durationSec: 170,
  }));
  searchLimit.delayMs = 1500; // every search takes 1.5 s; the server's budget is 4 s (TDJ_MATCH_BUDGET_MS)
  try {
    const t0 = Date.now();
    const r = await request.post(`${APP}/api/spotify/match`, {
      headers: { cookie: session },
      data: { items },
    });
    const took = Date.now() - t0;
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.rateLimited).toBe(5);
    expect(j.matches.map((m: { id: string }) => m.id)).toEqual(["slow0", "slow1", "slow2"]);
    expect(j.missing).toEqual([]); // slow3 was never searched: not "missing", just after the pause
    expect(took).toBeLessThan(6500);
  } finally {
    searchLimit.delayMs = 0;
  }
});

test("YouTube in batches: ≤ 10 queries per request, the first creates the playlist, later ones append to playlistId, a quota stop is reported", async ({
  request,
  playwright,
}) => {
  const { session } = await googleLogin(await playwright.request.newContext(), "youtube", "code-gg-youtube");
  hits.length = 0;
  const first = await request.post(`${APP}/api/google/youtube`, {
    headers: { cookie: session },
    data: { queries: ["Poema Canaro Maida", "Ciego Canaro Maida"], name: "Batch YT", tandas: 12 },
  });
  expect(first.status()).toBe(200);
  const a = await first.json();
  expect(a).toMatchObject({
    id: "ytpl1",
    url: "https://www.youtube.com/playlist?list=ytpl1",
    added: 2,
    missing: [],
    skipped: [],
    quota: false,
    timeout: false,
    created: true,
  });
  expect(JSON.parse(last(/POST \/google\/youtube\/v3\/playlists\?/)!.body).snippet).toEqual({
    title: "Batch YT",
    description: "12 tandas composed with TDJ, cortinas included.",
  });
  // the second batch: no second playlist; the third search of the day answers quotaExceeded → the rest skipped
  const n = hits.filter((h) => h.url.startsWith("/google/youtube/v3/playlists?")).length;
  const second = await request.post(`${APP}/api/google/youtube`, {
    headers: { cookie: session },
    data: { queries: ["A", "B", "C"], playlistId: "ytpl1" },
  });
  const b = await second.json();
  expect(b).toMatchObject({
    id: "ytpl1",
    added: 0,
    missing: [],
    skipped: ["A", "B", "C"],
    quota: true,
    created: false,
  });
  expect(hits.filter((h) => h.url.startsWith("/google/youtube/v3/playlists?")).length).toBe(n);
  expect(hits.filter((h) => h.url.startsWith("/google/youtube/v3/search?")).length).toBe(3);
  // limits
  const many = await request.post(`${APP}/api/google/youtube`, {
    headers: { cookie: session },
    data: { queries: Array.from({ length: 11 }, (_, i) => `q${i}`) },
  });
  expect(many.status()).toBe(400);
});

test("Export sheet: 'Create playlist' on YouTube sends the set in batches with a progress line and reports the quota stop", async ({
  browser,
  playwright,
}) => {
  const gg = await googleLogin(await playwright.request.newContext(), "youtube", "code-gg-youtube");
  const ctx = await browser.newContext({ baseURL: APP });
  const [name, value] = gg.session.split("=");
  await ctx.addCookies([{ name: name!, value: value!, url: APP }]);
  const page: Page = await ctx.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: /Compose the night/ }).click();
  await expect(page.locator("#result")).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Export" }).first().click();
  const sheet = page.getByTestId("export-sheet");
  await expect(sheet.locator("#send-youtube")).toContainText("Create playlist");
  const files = Number((await page.locator("#export-count").textContent())!.match(/\((\d+) files?\)/)![1]);
  expect(files).toBeGreaterThan(30);
  hits.length = 0;
  ytLimit.searches = 25; // the third batch hits the quota half way; the batches after it are never sent
  yt.inserts = 0;
  yt.dropInserts = new Set([5]); // the 5th video never arrives: the read-back finds it missing and puts it back
  const bodies: Array<Record<string, unknown>> = [];
  const checks: Array<Record<string, unknown>> = [];
  page.on("request", (r) => {
    if (!r.url().includes("/api/google/youtube")) return;
    const b = r.postDataJSON();
    (b.verify ? checks : bodies).push(b);
  });
  try {
    await sheet.locator("#send-youtube").click();
    await expect(sheet.locator("#send-youtube")).toContainText(/Adding \d+ of \d+…/);
    await expect(page.getByTestId("toast")).toContainText("YouTube playlist created, part left out", {
      timeout: 30000,
    });
    // batches of ≤ 10, the first without a playlistId, every later one appending to it, nothing after the stop
    expect(bodies.length).toBe(3);
    expect(bodies[0]!.playlistId).toBeUndefined();
    for (const b of bodies) expect((b.queries as string[]).length).toBe(10);
    for (const b of bodies.slice(1)) expect(b.playlistId).toBe("ytpl1");
    expect(hits.filter((h) => h.url.startsWith("/google/youtube/v3/playlists?"))).toHaveLength(1);
    expect(hits.filter((h) => h.url.startsWith("/google/youtube/v3/search?"))).toHaveLength(26);
    await expect(sheet).toContainText(`Created the YouTube playlist with 25 tracks, ${files - 25} left out`);
    await expect(sheet.getByRole("button", { name: "Open in YouTube", exact: true })).toBeVisible();
    // 2026-11: the same playlist on YouTube Music, and the matched videos remembered for the Booth's YouTube source
    await expect(sheet.getByRole("button", { name: "Open in YouTube Music" })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => Object.keys(JSON.parse(localStorage.getItem("tdj-youtube-matches") ?? "{}")).length,
        ),
      )
      .toBeGreaterThanOrEqual(20);
    await expect(sheet.locator("#send-youtube")).not.toContainText("Adding");
    // the playlist read back with the DJ's account (every page), the lost 5th video put back in its own place
    await expect(page.getByTestId("youtube-verified-summary")).toHaveText("25 of 25 in YouTube, in order ✓", {
      timeout: 30000,
    });
    expect(checks).toHaveLength(1);
    expect((checks[0]!.expected as unknown[]).length).toBe(25);
    expect(yt.items.map((x) => x.videoId)).toEqual(Array.from({ length: 25 }, (_, i) => `vid${i + 1}`));
    const reads = hits.filter(
      (h) => h.method === "GET" && h.url.startsWith("/google/youtube/v3/playlistItems?"),
    );
    expect(reads.length).toBeGreaterThanOrEqual(2);
    for (const r of reads) expect(r.headers.authorization).toBe("Bearer gg-youtube");
    const list = page.getByTestId("youtube-verified-list");
    await list.locator("summary").click();
    await expect(list.locator("li[data-mark=ok]")).toHaveCount(25);
  } finally {
    ytLimit.searches = 2;
    yt.dropInserts = new Set();
  }
  await ctx.close();
});
