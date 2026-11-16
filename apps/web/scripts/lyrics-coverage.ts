/**
 * 2026-11 — how many sides LRCLIB has lyrics for (song details → Lyrics), measured on a seeded sample of the index's
 * golden-age vocal sides (and the famous ones from the reference sets), with the app's own matching
 * (src/lib/lyrics.ts): before (the two side searches) and after (the whole ladder and the match by work). Prints
 * counts only: no lyrics are stored. `pnpm --filter @tdj/web exec tsx scripts/lyrics-coverage.ts [n] [--mock]`
 * (network: lrclib.net; about one request every 400 ms; --mock answers from a canned world, offline).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normTitle, type Song } from "@tdj/core";
import {
  bestLyrics,
  type LrclibRecord,
  lrclibQueries,
  lrclibRecords,
  lyricsOf,
  pickRecord,
} from "../src/lib/lyrics";

const root = join(__dirname, "../../..");
const songs = JSON.parse(readFileSync(join(root, "data/index/songs.json"), "utf8")) as Song[];
const ref = JSON.parse(readFileSync(join(root, "data/knowledge/reference_sets.json"), "utf8")) as {
  famousRecordings: Array<{ title: string; orchestraId: string }>;
};
const famous = new Set(ref.famousRecordings.map((f) => `${normTitle(f.title)}|${f.orchestraId}`));
const mock = process.argv.includes("--mock");
const n = Number(process.argv.slice(2).find((a) => /^\d+$/.test(a)) ?? 120);
let seed = 181;
const rnd = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const pool = songs.filter(
  (s) => s.vocal && s.year && s.year >= 1935 && s.year <= 1955 && s.rhythm !== "other",
);
const fam = pool.filter((s) => famous.has(`${normTitle(s.title)}|${s.orchestraId}`));
const pick = (xs: Song[], k: number) => [...xs].sort(() => rnd() - 0.5).slice(0, k);
const sample = [...pick(fam, Math.round(n / 2)), ...pick(pool, Math.round(n / 2))];
const slow = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** the mocked world: only another singer's recording of each work has words (the case the ladder adds) */
const canned = (u: string): Response => {
  if (u.includes("/api/get")) return new Response("", { status: 404 });
  const q = new URL(u).searchParams;
  if (q.get("artist_name") || q.get("q")) return Response.json([]);
  const title = q.get("track_name") ?? "";
  const rec: LrclibRecord = {
    id: title.length,
    trackName: title,
    artistName: "Julio Sosa",
    duration: 200,
    plainLyrics: "letra",
  };
  return Response.json([rec]);
};
const f = (async (u: RequestInfo | URL, i?: RequestInit) => {
  if (mock) return canned(String(u));
  await slow(400);
  return fetch(u, {
    ...i,
    headers: { ...(i?.headers ?? {}), "user-agent": "T-DJ lyrics coverage (open source)" },
  });
}) as typeof fetch;

async function before(s: Song): Promise<string> {
  const recs: LrclibRecord[] = [];
  let answered = false;
  for (const u of lrclibQueries(s)) {
    try {
      const r = await f(u);
      if (!r.ok) continue;
      answered = true;
      const j = (await r.json()) as LrclibRecord[];
      if (Array.isArray(j)) recs.push(...j);
      if (pickRecord(recs, s)?.syncedLyrics) break;
    } catch {}
  }
  return answered ? lyricsOf(pickRecord(recs, s)).state : "error";
}
async function after(s: Song): Promise<string> {
  const { all, answered } = await lrclibRecords(s, f);
  if (!answered) return "error";
  const l = bestLyrics(all, s);
  return l.match?.kind === "work" ? `${l.state} (work)` : l.state;
}

(async () => {
  const tally = { before: {} as Record<string, number>, after: {} as Record<string, number> };
  const famT = { before: {} as Record<string, number>, after: {} as Record<string, number> };
  for (const [i, s] of sample.entries()) {
    const b = await before(s);
    const a = await after(s);
    tally.before[b] = (tally.before[b] ?? 0) + 1;
    tally.after[a] = (tally.after[a] ?? 0) + 1;
    if (i < Math.round(n / 2)) {
      famT.before[b] = (famT.before[b] ?? 0) + 1;
      famT.after[a] = (famT.after[a] ?? 0) + 1;
    }
  }
  const sum = (t: Record<string, number>, re: RegExp) =>
    Object.entries(t)
      .filter(([k]) => re.test(k))
      .reduce((x, [, v]) => x + v, 0);
  console.log(
    JSON.stringify(
      { mode: mock ? "mock" : "live", sample: sample.length, all: tally, famousHalf: famT },
      null,
      1,
    ),
  );
  console.log(
    `with words: ${sum(tally.before, /^(synced|plain)/)} → ${sum(tally.after, /^(synced|plain)/)} of ${sample.length}; synced: ${sum(tally.before, /^synced/)} → ${sum(tally.after, /^synced/)}`,
  );
})();
