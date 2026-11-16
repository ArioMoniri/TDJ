import type { Song } from "@tdj/core";
import { findRoot, loadCatalog } from "@tdj/core/load";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ApiDeps } from "./deps";
import { resolve, setMbIntervalForTests } from "./net";

/**
 * "Find on services" hit rate (2026-11, the owner: "can't find for most of them"). 50 catalogue sides — the owner's
 * "Sólo Se Quiere una Vez" (Guitarras (solo singer) · Héctor Mauré · 1946), singer-with-guitars sides, instrumentals,
 * orchestra + singer sides and titles with quotes, glosses and alias titles — sent through the real `resolve`
 * handler (its real query builders) against mocked Deezer, MusicBrainz and Spotify. The mock services index the
 * same releases the way the real ones credit them: a singer-with-guitars side under the singer's own name, an
 * orchestra by its leader ("Aníbal Troilo", never "Guitarras (solo singer)"), titles without the catalogue's quotes
 * or glosses and often without accents; beside each one a modern cover, a tribute album ("Homenaje a …"), another
 * singer's version and a longer, different work of a similar name. A search answers only the releases that hold
 * every word of the query (Deezer's and Spotify's plain text), or every quoted phrase in its field (field filters,
 * MusicBrainz' Lucene). A hit: the side's own release is among the candidates the sheet shows for that service.
 */

/* ---------- the sample ---------- */

const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};
const PSEUDO = /solo singer|unspecified|^guitarras?\b|^g\.\s?barbieri/i;
const OWNER = "af3bcdc0a0";

function sample(songs: Song[]): Array<{ song: Song; kind: string }> {
  const r = rng(20261116);
  const pick = (pool: Song[], n: number, kind: string) => {
    const out: Array<{ song: Song; kind: string }> = [];
    const left = [...pool];
    while (out.length < n && left.length) {
      const s = left.splice(Math.floor(r() * left.length), 1)[0]!;
      if (s.id === OWNER || taken.has(s.id)) continue;
      taken.add(s.id);
      out.push({ song: s, kind });
    }
    return out;
  };
  const taken = new Set<string>([OWNER]);
  const tango = songs.filter((s) => ["tango", "vals", "milonga"].includes(s.rhythm) && s.year);
  const owner = songs.find((s) => s.id === OWNER)!;
  return [
    { song: owner, kind: "singer + guitars" },
    ...pick(
      tango.filter((s) => PSEUDO.test(s.orchestra) && s.singer),
      14,
      "singer + guitars",
    ),
    ...pick(
      tango.filter((s) => !s.vocal && !PSEUDO.test(s.orchestra)),
      12,
      "instrumental",
    ),
    ...pick(
      tango.filter((s) => s.vocal && s.singer && !PSEUDO.test(s.orchestra)),
      18,
      "orchestra + singer",
    ),
    ...pick(
      tango.filter((s) => /["(]/.test(s.title) || (s.altTitles?.length ?? 0) > 0),
      5,
      "quotes / glosses / alias",
    ),
  ];
}

/* ---------- the mocked services' world ---------- */

interface Rec {
  key: string;
  title: string;
  artists: string[];
  album: string;
  durationSec: number;
  year: number | null;
}
const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const toks = (s: string) => fold(s).split(" ").filter(Boolean);
const leaderOf = (o: string) =>
  PSEUDO.test(o)
    ? null
    : o
        .replace(/\(.*?\)/g, " ")
        .replace(/^orq\.\s*t[ií]pica\s*/i, "Orquesta Típica ")
        .replace(/\s+/g, " ")
        .trim();
const stripAccents = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "");

/** how the services list the side itself, and the releases beside it */
function worldFor(s: Song): { truth: Rec; others: Rec[] } {
  const h = hash(s.id);
  const leader = leaderOf(s.orchestra);
  const artists = leader ? (s.vocal && s.singer ? [leader, s.singer] : [leader]) : [s.singer ?? "Anónimo"];
  // the title as the label printed it: no quotes; a gloss "(…)" dropped or kept; often no accents
  let title = s.title.replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
  if (/\(/.test(title) && h % 2) title = title.replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (s.altTitles?.length && h % 3 === 0) title = s.altTitles[0]!;
  if (h % 3 === 1) title = stripAccents(title);
  const durationSec = Math.round(s.durationSec ?? 150 + (h % 50)) + ((h >> 3) % 5) - 2;
  const year = s.yearApprox ? null : (s.year ?? null);
  const who = leader ?? s.singer ?? "";
  const truth: Rec = {
    key: `${s.id}:truth`,
    title,
    artists,
    album: leader ? `${leader} - Sus grabaciones ${s.year}` : `${s.singer} - Tomas de radio`,
    durationSec,
    year,
  };
  const bare = stripAccents(
    s.title
      .replace(/["“”]/g, "")
      .replace(/\s*\(.*?\)\s*/g, " ")
      .trim(),
  );
  const others: Rec[] = [
    {
      key: `${s.id}:cover`,
      title: bare,
      artists: ["Orquesta Típica Misteriosa Buenos Aires"],
      album: "Tango hoy",
      durationSec: durationSec + 30,
      year: 2015,
    },
    {
      key: `${s.id}:tribute`,
      title: bare,
      artists: ["Sexteto Milonguero"],
      album: `Homenaje a ${who}`,
      durationSec: durationSec + 4,
      year: 2009,
    },
    {
      key: `${s.id}:other-work`,
      title: `${bare} de mi vida`,
      artists: artists.slice(),
      album: truth.album,
      durationSec: durationSec - 20,
      year,
    },
  ];
  if (s.vocal && s.singer && !/sosa/i.test(s.singer))
    others.push({
      key: `${s.id}:other-singer`,
      title: bare,
      artists: ["Julio Sosa"],
      album: "Julio Sosa - Grandes éxitos",
      durationSec: durationSec + 12,
      year: 1962,
    });
  return { truth, others };
}

/* ---------- the search engines ---------- */

const hasAll = (hay: string, words: string[]) => {
  const set = new Set(toks(hay));
  return words.every((w) => set.has(w));
};
/** field:"phrase" pairs (Lucene and Spotify filters) and the bare words left */
function parse(q: string) {
  const fields: Array<{ f: string; v: string }> = [];
  const ranges: Array<{ f: string; lo: number; hi: number }> = [];
  let rest = q.replace(/(\w+):\[(\d+) TO (\d+)\]/g, (_m, f, lo, hi) => {
    ranges.push({ f, lo: Number(lo), hi: Number(hi) });
    return " ";
  });
  rest = rest.replace(/(\w+):(\d{4})-(\d{4})/g, (_m, f, lo, hi) => {
    ranges.push({ f, lo: Number(lo), hi: Number(hi) });
    return " ";
  });
  rest = rest.replace(/(\w+):"((?:[^"\\]|\\.)*)"/g, (_m, f, v) => {
    fields.push({ f, v: v.replace(/\\(.)/g, "$1") });
    return " ";
  });
  rest = rest.replace(/\b(AND|OR)\b/g, " ");
  return { fields, ranges, words: toks(rest) };
}
function search(world: Rec[], q: string, kind: "deezer" | "spotify" | "musicbrainz"): Rec[] {
  const p = parse(q);
  return world.filter((r) => {
    for (const { f, v } of p.fields) {
      const hay =
        f === "artist"
          ? r.artists.join(" ")
          : f === "album" || f === "release"
            ? r.album
            : f === "track" || f === "recording"
              ? r.title
              : `${r.title} ${r.artists.join(" ")} ${r.album}`;
      if (!hasAll(hay, toks(v))) return false;
    }
    for (const g of p.ranges) {
      const v = g.f === "dur" ? r.durationSec * 1000 : g.f === "year" || /date/.test(g.f) ? r.year : null;
      if (v === null || v < g.lo || v > g.hi) return false;
    }
    if (!p.words.length) return p.fields.length > 0;
    return hasAll(
      kind === "musicbrainz"
        ? `${r.title} ${r.artists.join(" ")}`
        : `${r.title} ${r.artists.join(" ")} ${r.album}`,
      p.words,
    );
  });
}

const ids = new Map<string, string>();
const idOf = (svc: string, key: string) => {
  const k = `${svc}|${key}`;
  if (!ids.has(k)) ids.set(k, `${svc === "spotify" ? "Sp" : ""}${(hash(k) % 1e9).toString(36)}x${ids.size}`);
  return ids.get(k)!;
};
const keyOf = new Map<string, string>();
const json = (x: unknown) =>
  new Response(JSON.stringify(x), { status: 200, headers: { "content-type": "application/json" } });

function services(world: Rec[], calls: Record<string, number>) {
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.host === "api.deezer.com") {
      calls.deezer = (calls.deezer ?? 0) + 1;
      const q = url.searchParams.get("q") ?? "";
      const limit = Number(url.searchParams.get("limit") ?? 25);
      const data = search(world, q, "deezer")
        .slice(0, limit)
        .map((r) => {
          const id = idOf("deezer", r.key);
          keyOf.set(`deezer|${id}`, r.key);
          return {
            id: Number.parseInt(id, 36) || hash(id),
            _key: r.key,
            title: r.title,
            duration: r.durationSec,
            preview: `https://cdnt-preview.dzcdn.net/${id}.mp3`,
            link: `https://www.deezer.com/track/${id}`,
            artist: { name: r.artists[0] },
            album: { title: r.album, cover_medium: `https://cdn-images.dzcdn.net/${id}.jpg` },
          };
        });
      for (const d of data) keyOf.set(`deezer|${d.id}`, d._key);
      return json({ data });
    }
    if (url.host === "musicbrainz.org") {
      calls.musicbrainz = (calls.musicbrainz ?? 0) + 1;
      const q = url.searchParams.get("query") ?? "";
      const limit = Number(url.searchParams.get("limit") ?? 25);
      const recordings = search(world, q, "musicbrainz")
        .slice(0, limit)
        .map((r) => {
          const id = idOf("mb", r.key);
          keyOf.set(`musicbrainz|${id}`, r.key);
          return {
            id,
            title: r.title,
            length: r.durationSec * 1000,
            ...(r.year ? { "first-release-date": `${r.year}` } : {}),
            "artist-credit": r.artists.map((name) => ({ name })),
          };
        });
      return json({ recordings });
    }
    if (url.host === "api.spotify.com") {
      calls.spotify = (calls.spotify ?? 0) + 1;
      const q = url.searchParams.get("q") ?? "";
      const limit = Number(url.searchParams.get("limit") ?? 10);
      const items = search(world, q, "spotify")
        .slice(0, limit)
        .map((r) => {
          const id = `${idOf("spotify", r.key)}`
            .padEnd(22, "0")
            .slice(0, 22)
            .replace(/[^A-Za-z0-9]/g, "a");
          keyOf.set(`spotify|${id}`, r.key);
          return {
            id,
            uri: `spotify:track:${id}`,
            name: r.title,
            artists: r.artists.map((name) => ({ name })),
            duration_ms: r.durationSec * 1000,
            album: {
              name: r.album,
              release_date: `${r.year && r.year < 1960 ? 2004 : (r.year ?? 2010)}-01-01`,
            },
            external_urls: { spotify: `https://open.spotify.com/track/${id}` },
          };
        });
      return json({ tracks: { items } });
    }
    return new Response("not mocked", { status: 599 });
  };
}

/* ---------- the run ---------- */

type Svc = "deezer" | "musicbrainz" | "spotify";
const SVCS: Svc[] = ["deezer", "musicbrainz", "spotify"];

async function run() {
  const loaded = loadCatalog(findRoot());
  const songs = loaded.catalog.songs;
  const picked = sample(songs);
  const world: Rec[] = [];
  const truthOf = new Map<string, string>();
  for (const { song } of picked) {
    const w = worldFor(song);
    world.push(w.truth, ...w.others);
    truthOf.set(song.id, w.truth.key);
  }
  const calls: Record<string, number> = {};
  const fetcher = services(world, calls);
  vi.stubGlobal("fetch", fetcher);
  const deps = {
    catalog: () => loaded,
    fetch: fetcher,
    spotify: {
      enabled: async () => true,
      session: async () => ({ access: "test", expires: Date.now() + 3_600_000 }),
    },
  } as unknown as ApiDeps;
  const rows: Array<{ id: string; kind: string; hit: Record<Svc | "any" | "top", boolean> }> = [];
  for (const { song, kind } of picked) {
    const req = new Request("http://x/api/resolve", {
      method: "POST",
      body: JSON.stringify({
        id: song.id,
        title: song.title,
        orchestra: song.orchestra,
        singer: song.singer,
      }),
    });
    const j = (await (await resolve(req, deps)).json()) as {
      candidates: Array<{ provider: string; id: string; uri?: string }>;
    };
    const truth = truthOf.get(song.id)!;
    const isTruth = (c: { provider: string; id: string; uri?: string }) =>
      keyOf.get(
        `${c.provider}|${c.provider === "spotify" ? (c.uri ?? c.id).replace("spotify:track:", "") : c.id}`,
      ) === truth;
    const hit = Object.fromEntries(
      SVCS.map((s) => [s, j.candidates.some((c) => c.provider === s && isTruth(c))]),
    ) as Record<Svc, boolean>;
    rows.push({
      id: song.id,
      kind,
      hit: { ...hit, any: j.candidates.some(isTruth), top: !!j.candidates[0] && isTruth(j.candidates[0]) },
    });
  }
  return { rows, calls };
}

const rate = (rows: Array<{ hit: Record<string, boolean> }>, k: string) =>
  rows.filter((r) => r.hit[k]).length / Math.max(1, rows.length);

describe("Find on services: hit rate on 50 catalogue sides (mocked services, real query builders)", () => {
  beforeAll(() => setMbIntervalForTests(0));
  afterAll(() => {
    setMbIntervalForTests(1100);
    vi.unstubAllGlobals();
  });
  it("finds the side's own recording for most sides, on every service", async () => {
    const { rows, calls } = await run();
    expect(rows).toHaveLength(50);
    const table = ["deezer", "musicbrainz", "spotify", "any", "top"].map(
      (k) => `${k}: ${(rate(rows, k) * 100).toFixed(0)} %`,
    );
    const kinds = [...new Set(rows.map((r) => r.kind))].map(
      (k) =>
        `${k} (${rows.filter((r) => r.kind === k).length}): any ${(
          rate(
            rows.filter((r) => r.kind === k),
            "any",
          ) * 100
        ).toFixed(0)} %`,
    );
    console.log(
      `[find bench] ${table.join(" · ")}\n[find bench] ${kinds.join(" · ")}\n[find bench] requests ${JSON.stringify(calls)}`,
    );
    for (const r of rows) if (!r.hit.any) console.log(`[find bench] miss ${r.id} (${r.kind})`);
    const owner = rows.find((r) => r.id === OWNER)!;
    if (process.env.FIND_BENCH_BASELINE) return;
    expect(owner.hit.deezer && owner.hit.musicbrainz && owner.hit.spotify).toBe(true);
    expect(rate(rows, "deezer")).toBeGreaterThanOrEqual(0.85);
    expect(rate(rows, "musicbrainz")).toBeGreaterThanOrEqual(0.8);
    expect(rate(rows, "spotify")).toBeGreaterThanOrEqual(0.85);
    expect(rate(rows, "top")).toBeGreaterThanOrEqual(0.8);
  });
});
