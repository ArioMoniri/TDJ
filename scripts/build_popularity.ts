/**
 * 2026-11 — the dancer-popularity prior per recording (packages/core/src/popularity.ts), built offline into the
 * committed data/knowledge/dancer_popularity.json from evidence of play that is not the DJ's own:
 *
 *   djSets           data/knowledge/reference_sets.json `sets` (31 public DJ sets): plays per recording, distinct DJs,
 *                    first / last set date, the tanda's slot role from its position in the set
 *   canonicalTandas  the same file's 218 canonical tandas (× their popularity / 5) and their phase
 *   famous           the same file's 1,078 famous recordings (fame 0–5, opener / closer role)
 *   setlists         public milonga set lists: Chris Jordan's DJ setblog (chrisjj.com/tango/cjjsets, robots.txt allows
 *                    it), the sets not already in the corpus; fetched once, ≥ 1.5 s apart, parsed into
 *                    data/cache/popularity/setlists.json
 *   tangoInfo        probed: tango.info is reachable, but it publishes no play counts (works, performances, tracks)
 *   deezer           `rank` of every side with a Deezer id (GET api.deezer.com/track/{id}, keyless, ≥ 150 ms apart,
 *                    a 429 or quota error waits); cached in data/cache/popularity/deezer.json
 *   spotify          `popularity` via GET /v1/tracks?ids= in batches of 50 (client credentials: SPOTIFY_CLIENT_ID /
 *                    SECRET), Retry-After backoff; cached in data/cache/popularity/spotify.json with its status
 *
 * Night logs (the DJ's own played nights) stay with the favourites tracker at runtime: never read here.
 *
 * Every source is normalised by rank percentile within the recording's orchestra and era (popularity.ts
 * rankPercentiles) and combined with POPULARITY_WEIGHTS over the sources that worked. Idempotent: network results
 * are cached (re-fetched after --maxAge days, default 30), `asOf` is the latest evidence date, and the output only
 * changes when the evidence does.
 *
 *   pnpm popularity:build [--offline] [--refresh] [--maxAge=30] [--skip=setlists,deezer,spotify]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { ResolvedTrack } from "../packages/core/src/audio/index";
import { normTitle } from "../packages/core/src/energy";
import type { SlotRole } from "../packages/core/src/favourites";
import { loadCatalog } from "../packages/core/src/load";
import {
  combineScore,
  type DancerPopularity,
  POPULARITY_SOURCES,
  POPULARITY_WEIGHTS,
  type PopularityEntry,
  type PopularitySource,
  rankPercentiles,
  roleOfFamous,
  roleOfPhase,
  roleOfPosition,
  roleScores,
  type SourceStatus,
} from "../packages/core/src/popularity";
import type { Song } from "../packages/core/src/types";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  }),
);
const ROOT = new URL("..", import.meta.url).pathname;
const CACHE = `${ROOT}data/cache/popularity/`;
const OUT = `${ROOT}data/knowledge/dancer_popularity.json`;
mkdirSync(CACHE, { recursive: true });
const offline = args.offline === "true";
const refresh = args.refresh === "true";
const maxAgeDays = Number(args.maxAge ?? 30);
const skip = new Set(
  String(args.skip ?? "")
    .split(",")
    .filter(Boolean),
);
const UA = "TDJ/0.1 (tango DJ composer; offline popularity build)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();
const day = (iso: string) => iso.slice(0, 10);
const due = (at?: string) => refresh || !at || Date.now() - Date.parse(at) > maxAgeDays * 864e5;
const readJson = <T>(p: string, d: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : d);
const writeJson = (p: string, x: unknown) => writeFileSync(p, `${JSON.stringify(x, null, 1)}\n`);
const log = (...a: unknown[]) => console.log("[popularity]", ...a);

/* ---------- the catalogue and the matcher ---------- */

const deps = loadCatalog(ROOT);
const songs = deps.catalog.songs;
const byKey = new Map<string, Song[]>();
for (const s of songs)
  for (const t of [s.title, ...(s.altTitles ?? [])]) {
    const k = `${s.orchestraId}|${normTitle(t)}`;
    const arr = byKey.get(k) ?? [];
    if (!arr.includes(s)) arr.push(s);
    byKey.set(k, arr);
  }
const surnames = (x?: string | null) =>
  new Set(
    normTitle(x ?? "")
      .split(/\s+-\s+|,|\by\b|&|\//)
      .map((p) => p.trim().split(/\s+/).pop() ?? "")
      .filter((p) => p.length > 2),
  );

interface Wanted {
  orchestraId: string;
  title: string;
  /** null: instrumental; undefined: unknown */
  singer?: string | null;
  year?: number | null;
  years?: [number, number] | null;
}
/** the recordings a corpus row names, each with its share (an ambiguous row splits its credit) */
function match(w: Wanted): Array<{ song: Song; w: number }> {
  let c = byKey.get(`${w.orchestraId}|${normTitle(w.title)}`) ?? [];
  if (!c.length) return [];
  const narrow = (f: (s: Song) => boolean) => {
    const n = c.filter(f);
    if (n.length) c = n;
  };
  if (w.year) {
    narrow((s) => !!s.year && Math.abs(s.year - w.year!) <= 1);
    narrow((s) => s.year === w.year);
  } else if (w.years) narrow((s) => !!s.year && s.year >= w.years![0] - 1 && s.year <= w.years![1] + 1);
  if (w.singer === null) narrow((s) => !s.vocal);
  else if (w.singer) {
    const want = surnames(w.singer);
    narrow((s) => [...surnames(s.singer)].some((x) => want.has(x)));
  }
  narrow((s) => !s.transcription);
  narrow((s) => !s.reissue);
  narrow((s) => !s.yearApprox);
  return c.map((song) => ({ song, w: 1 / c.length }));
}

/** orchestra names as set lists spell them → orchestra id */
const ORCH = (() => {
  const m = new Map<string, string>();
  const rows = readJson<Array<{ id: string; name: string; count: number }>>(
    `${ROOT}data/index/orchestras.json`,
    [],
  );
  const last = new Map<string, string[]>();
  for (const o of rows) {
    m.set(normTitle(o.name), o.id);
    if (o.count >= 30) {
      const l = normTitle(o.name).split(/\s+/).pop()!;
      last.set(l, [...(last.get(l) ?? []), o.id]);
    }
  }
  for (const [l, ids] of last) if (ids.length === 1 && !m.has(l)) m.set(l, ids[0]!);
  const alias: Record<string, string> = {
    "orquesta tipica victor": "orquesta-tipica-victor",
    otv: "orquesta-tipica-victor",
    "juan darienzo": "juan-d-arienzo",
    "juan d'arienzo": "juan-d-arienzo",
  };
  for (const [k, v] of Object.entries(alias)) if (rows.some((o) => o.id === v)) m.set(normTitle(k), v);
  return m;
})();
const orchestraIdOf = (name: string): string | undefined => {
  const n = normTitle(name);
  return ORCH.get(n) ?? ORCH.get(n.split(/\s+/).pop() ?? "");
};

/* ---------- evidence accumulators ---------- */

interface Acc {
  djSets: { n: number; djs: Set<string>; dates: string[] };
  canonicalTandas: { n: number; v: number; ids: string[] };
  famous: { fame: number; role?: string };
  setlists: { n: number; dates: string[] };
  deezer: { rank: number; at: string };
  spotify: { popularity: number; at: string };
  placed: Partial<Record<SlotRole, number>>;
}
const acc = new Map<string, Partial<Acc>>();
const get = (id: string) => {
  let a = acc.get(id);
  if (!a) {
    a = {};
    acc.set(id, a);
  }
  return a;
};
const place = (a: Partial<Acc>, role: SlotRole | undefined, w: number) => {
  if (!role) return;
  a.placed = a.placed ?? {};
  a.placed[role] = (a.placed[role] ?? 0) + w;
};
const status: Record<PopularitySource, SourceStatus> = Object.fromEntries(
  POPULARITY_SOURCES.map((s) => [s, { status: "skipped" } as SourceStatus]),
) as Record<PopularitySource, SourceStatus>;
const dates: string[] = [];

/* ---------- 1. the committed corpus ---------- */

interface SetFile {
  sets: Array<{
    id: string;
    dj?: string;
    year?: number;
    source?: string;
    tandas: Array<{
      position?: number;
      orchestraId: string;
      singer?: string | null;
      years?: [number, number];
      titles: string[];
    }>;
  }>;
  canonicalTandas: Array<{
    id: string;
    orchestraId: string;
    singer?: string | null;
    years?: [number, number];
    titles?: string[];
    phase?: string;
    popularity?: number;
  }>;
  famousRecordings: Array<{
    title: string;
    orchestraId: string;
    singer?: string | null;
    year?: number;
    fame?: number;
    role?: string;
  }>;
}
const REF = readJson<SetFile>(`${ROOT}data/knowledge/reference_sets.json`, {
  sets: [],
  canonicalTandas: [],
  famousRecordings: [],
});
const setDate = (s: { id: string; year?: number }) =>
  s.id.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? String(s.year ?? "");
const corpusDates = new Set<string>();
const unmatched = { sets: 0, tandas: 0, famous: 0, setlists: 0 };
{
  let n = 0;
  for (const s of REF.sets) {
    const date = setDate(s);
    corpusDates.add(date);
    dates.push(date);
    s.tandas.forEach((t, i) => {
      const role = roleOfPosition(i + 1, s.tandas.length);
      for (const title of t.titles) {
        const m = match({ orchestraId: t.orchestraId, title, singer: t.singer, years: t.years });
        if (!m.length) unmatched.sets++;
        for (const { song, w } of m) {
          const a = get(song.id);
          a.djSets = a.djSets ?? { n: 0, djs: new Set(), dates: [] };
          a.djSets.n += w;
          a.djSets.djs.add(s.dj ?? s.id);
          a.djSets.dates.push(date);
          place(a, role, w);
          n++;
        }
      }
    });
  }
  status.djSets = { status: "ok", note: `${REF.sets.length} sets in data/knowledge/reference_sets.json` };
  for (const t of REF.canonicalTandas) {
    const role = roleOfPhase(t.phase);
    for (const title of t.titles ?? []) {
      const m = match({ orchestraId: t.orchestraId, title, singer: t.singer, years: t.years });
      if (!m.length) unmatched.tandas++;
      for (const { song, w } of m) {
        const a = get(song.id);
        a.canonicalTandas = a.canonicalTandas ?? { n: 0, v: 0, ids: [] };
        a.canonicalTandas.n += w;
        a.canonicalTandas.v += (w * (t.popularity ?? 3)) / 5;
        if (!a.canonicalTandas.ids.includes(t.id)) a.canonicalTandas.ids.push(t.id);
        place(a, role, w);
      }
    }
  }
  status.canonicalTandas = { status: "ok", note: `${REF.canonicalTandas.length} canonical tandas` };
  for (const f of REF.famousRecordings) {
    const m = match({ orchestraId: f.orchestraId, title: f.title, singer: f.singer, year: f.year });
    if (!m.length) unmatched.famous++;
    for (const { song, w } of m) {
      const a = get(song.id);
      const fame = (f.fame ?? 3) * w;
      if (!a.famous || a.famous.fame < fame) a.famous = { fame, ...(f.role ? { role: f.role } : {}) };
      place(a, roleOfFamous(f.role), w);
    }
  }
  status.famous = { status: "ok", note: `${REF.famousRecordings.length} famous recordings` };
  log(`corpus: ${n} set plays matched; unmatched rows`, unmatched);
}

/* ---------- 2. public set lists (chrisjj.com) ---------- */

interface SetList {
  url: string;
  date: string;
  tandas: Array<{ rhythm: string; tracks: Array<{ artist: string; title: string; year: number | null }> }>;
  fetchedAt: string;
}
interface SetListCache {
  index?: { urls: string[]; fetchedAt: string };
  sets: Record<string, SetList | { url: string; error: string; fetchedAt: string }>;
}
const SL_FILE = `${CACHE}setlists.json`;
const slCache = readJson<SetListCache>(SL_FILE, { sets: {} });
const SL_BASE = "https://www.chrisjj.com/tango/cjjsets/";
const decode = (x: string) =>
  x
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .trim();
async function get200(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { "user-agent": UA } }).catch(() => null);
    if (!r) return null;
    if (r.status === 429 || r.status === 503) {
      await sleep(Number(r.headers.get("retry-after") ?? 10) * 1000);
      continue;
    }
    return r.ok ? await r.text() : null;
  }
  return null;
}
function parseSetList(url: string, html: string): SetList {
  const date = url.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  const tandas: SetList["tandas"] = [];
  let cur: SetList["tandas"][number] | null = null;
  for (const row of html.split(/<tr\b/i).slice(1)) {
    const cells = row
      .split(/<td\b[^>]*>/i)
      .slice(1)
      .map(decode);
    const genre = (cells[1] ?? "").toLowerCase();
    if (/^(tango|vals|milonga)$/.test(genre) && cells[2] && cells[3]) {
      if (!cur || cur.rhythm !== genre) {
        cur = { rhythm: genre, tracks: [] };
        tandas.push(cur);
      }
      const y = Number((cells[4] ?? "").match(/\b(19|20)\d{2}\b/)?.[0]);
      cur.tracks.push({ artist: cells[2], title: cells[3], year: Number.isFinite(y) && y > 0 ? y : null });
    } else if (/curtain|cortina|break/i.test(row.slice(0, 200))) cur = null;
  }
  return { url, date, tandas: tandas.filter((t) => t.tracks.length >= 2), fetchedAt: now() };
}
async function fetchSetLists() {
  if (skip.has("setlists")) return;
  if (!offline && (due(slCache.index?.fetchedAt) || !slCache.index)) {
    const robots = await get200("https://www.chrisjj.com/robots.txt");
    if (robots && /Disallow:\s*\/tango\b/i.test(robots)) {
      status.setlists = { status: "blocked", note: "robots.txt disallows /tango", checkedAt: now() };
      return;
    }
    const html = await get200(SL_BASE);
    if (html) {
      const urls = [...html.matchAll(/class='setlink' href='([^']+)'/g)].map((m) => SL_BASE + m[1]);
      slCache.index = { urls, fetchedAt: now() };
    }
  }
  const urls = (slCache.index?.urls ?? []).filter(
    (u) => !corpusDates.has(u.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "-"),
  );
  if (!offline) {
    let fetched = 0;
    for (const u of urls) {
      const c = slCache.sets[u];
      if (c && !("error" in c)) continue; // a published set list does not change
      if (c && "error" in c && !due(c.fetchedAt)) continue;
      const html = await get200(u);
      slCache.sets[u] = html ? parseSetList(u, html) : { url: u, error: "unreachable", fetchedAt: now() };
      fetched++;
      if (fetched % 20 === 0) {
        log(`set lists: ${fetched} fetched`);
        writeFileSync(SL_FILE, `${JSON.stringify(slCache)}\n`);
      }
      await sleep(1500);
    }
    writeFileSync(SL_FILE, `${JSON.stringify(slCache)}\n`);
  }
  const ok = urls.map((u) => slCache.sets[u]).filter((x): x is SetList => !!x && !("error" in x));
  if (!ok.length) {
    status.setlists = {
      status: offline ? "skipped" : "blocked",
      note: "no set list reachable",
      checkedAt: now(),
    };
    return;
  }
  const missedArtists = new Map<string, number>();
  for (const s of ok) {
    dates.push(s.date);
    s.tandas.forEach((t, i) => {
      const role = roleOfPosition(i + 1, s.tandas.length);
      for (const tr of t.tracks) {
        // "Lucio Demare, singer Juan Carlos Miranda", "Ángel D'Agostino, singer Ángel Vargas, reciter …", "singer Alberto Castillo"
        const orch = /^singers?\s/i.test(tr.artist) ? "" : (tr.artist.split(/,\s*/)[0] ?? "");
        const singerPart = tr.artist.match(/\bsingers?\s+([^,]+)/i)?.[1];
        const oid = orchestraIdOf(orch ?? "");
        if (!oid) {
          missedArtists.set(orch ?? "", (missedArtists.get(orch ?? "") ?? 0) + 1);
          unmatched.setlists++;
          continue;
        }
        const m = match({ orchestraId: oid, title: tr.title, singer: singerPart ?? null, year: tr.year });
        if (!m.length) unmatched.setlists++;
        for (const { song, w } of m) {
          const a = get(song.id);
          a.setlists = a.setlists ?? { n: 0, dates: [] };
          a.setlists.n += w;
          a.setlists.dates.push(s.date);
          place(a, role, w);
        }
      }
    });
  }
  const top = [...missedArtists.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  log(`set lists: ${ok.length} sets; unmatched tracks ${unmatched.setlists}; unknown artists`, top);
  status.setlists = {
    status: "ok",
    note: `${ok.length} public set lists (Chris Jordan's DJ setblog, chrisjj.com) not already in the corpus`,
    checkedAt: slCache.index?.fetchedAt,
  };
}

/* ---------- 3. tango.info and other DJ play data: probes ---------- */

interface Probe {
  url: string;
  reachable: boolean;
  code?: number;
  note: string;
  checkedAt: string;
}
const PROBE_FILE = `${CACHE}probes.json`;
const probes = readJson<Record<string, Probe>>(PROBE_FILE, {});
async function probe(key: string, url: string, note: (code: number, body: string) => string) {
  if (offline || !due(probes[key]?.checkedAt)) return probes[key];
  const r = await fetch(url, { headers: { "user-agent": UA } }).catch((e: Error) => e);
  probes[key] =
    r instanceof Error
      ? { url, reachable: false, note: `unreachable (${r.message})`, checkedAt: now() }
      : {
          url,
          reachable: r.ok,
          code: r.status,
          note: note(r.status, r.ok ? await r.text() : ""),
          checkedAt: now(),
        };
  await sleep(1000);
  return probes[key];
}
async function probeTangoInfo() {
  const robots = await probe("tango.info robots", "https://tango.info/robots.txt", (c, b) =>
    c === 200 ? `robots.txt: ${b.replace(/\s+/g, " ").trim()}` : `HTTP ${c}`,
  );
  const work = await probe("tango.info work", "https://tango.info/T0370120130", (c, b) =>
    c === 200
      ? /played|plays|DJ play/i.test(b.replace(/<[^>]*>/g, " "))
        ? "work page lists plays"
        : "work page: performances / tracks / videos only, no play counts"
      : `HTTP ${c}`,
  );
  await probe("tangodj.net", "https://tangodj.net/", (c) => `HTTP ${c}`);
  await probe("tangotoolkit.com", "https://www.tangotoolkit.com/robots.txt", (c) => `HTTP ${c}`);
  writeJson(PROBE_FILE, probes);
  status.tangoInfo =
    work?.reachable && /no play counts/.test(work.note)
      ? {
          status: "no-data",
          note: `tango.info is reachable (${robots?.note ?? "robots.txt unread"}) but publishes no per-recording play counts; ${work.note}`,
          checkedAt: work.checkedAt,
        }
      : work?.reachable
        ? { status: "no-data", note: work.note, checkedAt: work.checkedAt }
        : {
            status: offline && !work ? "skipped" : "blocked",
            note: work?.note ?? "not probed",
            checkedAt: work?.checkedAt,
          };
}

/* ---------- 4. Deezer rank ---------- */

const DZ_FILE = `${CACHE}deezer.json`;
const dz = readJson<Record<string, { id: string; rank?: number; error?: string; fetchedAt: string }>>(
  DZ_FILE,
  {},
);
async function deezer() {
  if (skip.has("deezer")) return;
  const ids = new Set(songs.map((s) => s.id));
  const want = new Map<string, string>();
  const resolved = readJson<Record<string, ResolvedTrack | null>>(
    `${ROOT}data/cache/resolve/tracks.json`,
    {},
  );
  for (const [k, v] of Object.entries(resolved))
    if (v?.provider === "deezer" && v.id) want.set(k, String(v.id));
  const dc = readJson<Record<string, { id?: string } | null>>(`${ROOT}data/cache/deezer/tracks.json`, {});
  for (const [k, v] of Object.entries(dc)) if (v?.id && !want.has(k)) want.set(k, String(v.id));
  let fetched = 0;
  let failed = 0;
  if (!offline)
    for (const [k, id] of want) {
      if (!ids.has(k)) continue;
      const c = dz[k];
      if (c && c.id === id && !due(c.fetchedAt)) continue;
      let rec: (typeof dz)[string] | null = null;
      for (let attempt = 0; attempt < 6 && !rec; attempt++) {
        const r = await fetch(`https://api.deezer.com/track/${id}`, { headers: { "user-agent": UA } }).catch(
          () => null,
        );
        if (!r) break;
        if (r.status === 429) {
          await sleep(Number(r.headers.get("retry-after") ?? 5) * 1000);
          continue;
        }
        const j = (r.ok ? await r.json() : null) as {
          rank?: number;
          error?: { code?: number; message?: string };
        } | null;
        if (j?.error?.code === 4) {
          await sleep(5000);
          continue;
        }
        rec =
          j && typeof j.rank === "number"
            ? { id, rank: j.rank, fetchedAt: now() }
            : { id, error: j?.error?.message ?? `HTTP ${r.status}`, fetchedAt: now() };
      }
      if (!rec) {
        failed++;
        continue;
      }
      dz[k] = rec;
      fetched++;
      if (fetched % 200 === 0) {
        log(`deezer: ${fetched} fetched`);
        writeJson(DZ_FILE, dz);
      }
      await sleep(150);
    }
  writeJson(DZ_FILE, dz);
  let n = 0;
  for (const [k, v] of Object.entries(dz))
    if (ids.has(k) && typeof v.rank === "number" && v.rank > 0) {
      get(k).deezer = { rank: v.rank, at: day(v.fetchedAt) };
      dates.push(day(v.fetchedAt));
      n++;
    }
  status.deezer = n
    ? { status: "ok", note: `rank of ${n} sides with a Deezer id (api.deezer.com/track/{id})`, songs: n }
    : {
        status: offline ? "skipped" : "blocked",
        note: failed ? `${failed} requests failed` : "no Deezer ids",
      };
  log(`deezer: ${fetched} fetched, ${failed} failed, ${n} with a rank`);
}

/* ---------- 5. Spotify popularity ---------- */

interface SpCache {
  status?: SourceStatus;
  tracks: Record<string, { popularity: number; fetchedAt: string }>;
}
const SP_FILE = `${CACHE}spotify.json`;
const sp = readJson<SpCache>(SP_FILE, { tracks: {} });
async function spotify() {
  if (skip.has("spotify")) return;
  const cached = readJson<Record<string, { uri?: string } | null>>(
    `${ROOT}data/cache/spotify/tracks.json`,
    {},
  );
  const want = Object.entries(cached)
    .filter(([, v]) => v?.uri?.startsWith("spotify:track:"))
    .map(([k, v]) => [k, v!.uri!.slice(14)] as const)
    .filter(([k]) => refresh || due(sp.tracks[k]?.fetchedAt));
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!offline && want.length && (!id || !secret))
    sp.status = { status: "skipped", note: "SPOTIFY_CLIENT_ID / SECRET not set", checkedAt: now() };
  else if (!offline && want.length && (refresh || due(sp.status?.checkedAt) || sp.status?.status === "ok")) {
    const tr = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }).catch(() => null);
    const tok = tr?.ok ? ((await tr.json()) as { access_token?: string }).access_token : undefined;
    if (!tok)
      sp.status = { status: "blocked", note: `token: HTTP ${tr?.status ?? "unreachable"}`, checkedAt: now() };
    else {
      const headers = { authorization: `Bearer ${tok}` };
      let got = 0;
      let note = "";
      for (let i = 0; i < want.length; i += 50) {
        const batch = want.slice(i, i + 50);
        let r: Response | null = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          r = await fetch(`https://api.spotify.com/v1/tracks?ids=${batch.map((b) => b[1]).join(",")}`, {
            headers,
          }).catch(() => null);
          if (r?.status !== 429) break;
          const wait = Number(r.headers.get("retry-after") ?? 30);
          if (wait > 600) {
            note = `rate-limited: Retry-After ${wait} s`;
            break;
          }
          log(`spotify 429 → wait ${wait}s`);
          await sleep(wait * 1000);
        }
        if (!r?.ok) {
          note = note || `GET /v1/tracks?ids= → HTTP ${r?.status ?? "unreachable"}`;
          // does a single-track read carry popularity? (it tells "batch forbidden" from "field removed")
          const one = await fetch(`https://api.spotify.com/v1/tracks/${batch[0]![1]}`, { headers }).catch(
            () => null,
          );
          const j = one?.ok ? ((await one.json()) as { popularity?: number }) : null;
          note +=
            j && typeof j.popularity !== "number"
              ? "; GET /v1/tracks/{id} answers without a popularity field for this app"
              : j
                ? "; single-track reads carry popularity (not used: batches only)"
                : `; GET /v1/tracks/{id} → HTTP ${one?.status ?? "unreachable"}`;
          break;
        }
        const j = (await r.json()) as { tracks?: Array<{ id: string; popularity?: number } | null> };
        for (const [k, tid] of batch) {
          const t = j.tracks?.find((x) => x?.id === tid);
          if (t && typeof t.popularity === "number") {
            sp.tracks[k] = { popularity: t.popularity, fetchedAt: now() };
            got++;
          }
        }
        await sleep(500);
      }
      sp.status =
        got > 0
          ? { status: "ok", note: `popularity of ${got} tracks${note ? ` (${note})` : ""}`, checkedAt: now() }
          : { status: "blocked", note: note || "no popularity returned", checkedAt: now() };
    }
    writeJson(SP_FILE, sp);
  }
  const ids = new Set(songs.map((s) => s.id));
  let n = 0;
  for (const [k, v] of Object.entries(sp.tracks))
    if (ids.has(k) && v.popularity > 0) {
      get(k).spotify = { popularity: v.popularity, at: day(v.fetchedAt) };
      dates.push(day(v.fetchedAt));
      n++;
    }
  status.spotify =
    n > 0
      ? { status: "ok", note: sp.status?.note, songs: n, checkedAt: sp.status?.checkedAt }
      : (sp.status ?? { status: "skipped", note: "never fetched" });
  log("spotify:", status.spotify);
}

/* ---------- combine ---------- */

function build(): DancerPopularity {
  const songById = new Map(songs.map((s) => [s.id, s]));
  const group = (id: string) => {
    const s = songById.get(id)!;
    return `${s.orchestraId}|${s.era}`;
  };
  const value: Record<PopularitySource, (a: Partial<Acc>) => number> = {
    djSets: (a) => a.djSets?.n ?? 0,
    canonicalTandas: (a) => a.canonicalTandas?.v ?? 0,
    famous: (a) => a.famous?.fame ?? 0,
    setlists: (a) => a.setlists?.n ?? 0,
    tangoInfo: () => 0,
    deezer: (a) => a.deezer?.rank ?? 0,
    spotify: (a) => a.spotify?.popularity ?? 0,
  };
  const pct = {} as Record<PopularitySource, Map<string, number>>;
  for (const src of POPULARITY_SOURCES)
    pct[src] = rankPercentiles(
      [...acc.entries()].map(([id, a]) => ({ key: id, group: group(id), value: value[src](a) })),
    );
  const available = POPULARITY_SOURCES.filter((s) => status[s].status === "ok");
  const out: DancerPopularity["songs"] = {};
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const span = (ds: string[]) => {
    const s = [...ds].sort();
    return { first: s[0]!, last: s[s.length - 1]! };
  };
  for (const id of [...acc.keys()].sort()) {
    const a = acc.get(id)!;
    const p = Object.fromEntries(POPULARITY_SOURCES.map((s) => [s, pct[s].get(id) ?? 0])) as Record<
      PopularitySource,
      number
    >;
    const s = combineScore(p, available);
    if (s <= 0) continue;
    const ev: PopularityEntry["ev"] = {};
    if (a.djSets)
      ev.djSets = { n: r1(a.djSets.n), djs: a.djSets.djs.size, ...span(a.djSets.dates), pct: p.djSets };
    if (a.canonicalTandas)
      ev.canonicalTandas = { n: r1(a.canonicalTandas.n), ids: a.canonicalTandas.ids, pct: p.canonicalTandas };
    if (a.famous)
      ev.famous = {
        fame: r1(a.famous.fame),
        ...(a.famous.role ? { role: a.famous.role } : {}),
        pct: p.famous,
      };
    if (a.setlists) ev.setlists = { n: r1(a.setlists.n), ...span(a.setlists.dates), pct: p.setlists };
    if (a.deezer && available.includes("deezer")) ev.deezer = { ...a.deezer, pct: p.deezer };
    if (a.spotify && available.includes("spotify")) ev.spotify = { ...a.spotify, pct: p.spotify };
    const placed = a.placed
      ? Object.fromEntries(Object.entries(a.placed).map(([r, v]) => [r, r1(v ?? 0)]))
      : undefined;
    const roles = placed ? roleScores(s, placed) : undefined;
    out[id] = { s, ...(roles ? { roles } : {}), ...(placed && roles ? { placed } : {}), ev };
  }
  for (const src of POPULARITY_SOURCES)
    if (status[src].status === "ok") status[src].songs = Object.values(out).filter((e) => e.ev[src]).length;
  return {
    version: 1,
    asOf: dates.filter(Boolean).sort().pop() ?? "",
    about:
      "Dancer-popularity prior per recording (song id) from evidence of play that is not the DJ's own; built by scripts/build_popularity.ts (pnpm popularity:build), read by packages/core/src/popularity.ts. s: 0–1 (weighted mean of per-source rank percentiles within orchestra and era, over the sources with status ok); roles: s per slot role where the data places the song; ev: the evidence per source with counts, dates and its percentile.",
    weights: { ...POPULARITY_WEIGHTS },
    sources: status,
    songs: out,
  };
}

async function main() {
  await fetchSetLists();
  await probeTangoInfo();
  await deezer();
  await spotify();
  const P = build();
  // one song per line: a rebuild diffs by recording
  const lines = Object.entries(P.songs).map(([id, e]) => `  ${JSON.stringify(id)}: ${JSON.stringify(e)}`);
  const head = JSON.stringify({ ...P, songs: undefined }, null, 1).replace(/\n}$/, "");
  writeFileSync(OUT, `${head},\n "songs": {\n${lines.join(",\n")}\n }\n}\n`);
  const featured = readJson<{ tandas?: Array<{ songs: Song[] }> }>(
    `${ROOT}apps/web/public/featured/golden-double-peak.json`,
    {},
  );
  const fIds = new Set((featured.tandas ?? []).flatMap((t) => t.songs.map((s) => s.id)));
  const fHit = [...fIds].filter((id) => P.songs[id]).length;
  log(
    `wrote ${Object.keys(P.songs).length} of ${songs.length} songs; featured night ${fHit}/${fIds.size}; sources`,
    Object.fromEntries(
      POPULARITY_SOURCES.map((s) => [
        s,
        `${P.sources[s].status}${P.sources[s].songs ? ` (${P.sources[s].songs})` : ""}`,
      ]),
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
