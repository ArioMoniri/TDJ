/**
 * 2026-11 — how many sides LRCLIB has lyrics for (song details → Lyrics), measured on a seeded sample of the index's
 * golden-age vocal sides (and the famous ones from the reference sets), with the app's own matching
 * (src/lib/lyrics.ts). Prints counts only: no lyrics are stored. `pnpm --filter @tdj/web exec tsx
 * scripts/lyrics-coverage.ts [n]` (network: lrclib.net; about one request every 400 ms).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normTitle, type Song } from "@tdj/core";
import { loadLyrics } from "../src/lib/lyrics";

const root = join(__dirname, "../../..");
const songs = JSON.parse(readFileSync(join(root, "data/index/songs.json"), "utf8")) as Song[];
const ref = JSON.parse(readFileSync(join(root, "data/knowledge/reference_sets.json"), "utf8")) as {
  famousRecordings: Array<{ title: string; orchestraId: string }>;
};
const famous = new Set(ref.famousRecordings.map((f) => `${normTitle(f.title)}|${f.orchestraId}`));
const n = Number(process.argv[2] ?? 120);
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
const f = async (u: RequestInfo | URL, i?: RequestInit) => {
  await slow(400);
  return fetch(u, {
    ...i,
    headers: { ...(i?.headers ?? {}), "user-agent": "T-DJ lyrics coverage (open source)" },
  });
};

(async () => {
  const count = { synced: 0, plain: 0, instrumental: 0, none: 0, error: 0 };
  const famCount = { synced: 0, plain: 0, instrumental: 0, none: 0, error: 0 };
  for (const [i, s] of sample.entries()) {
    const isFam = i < Math.round(n / 2);
    try {
      const l = await loadLyrics(s, f as typeof fetch);
      count[l.state]++;
      if (isFam) famCount[l.state]++;
    } catch {
      count.error++;
      if (isFam) famCount.error++;
    }
  }
  console.log(JSON.stringify({ sample: sample.length, famousHalf: famCount, all: count }, null, 1));
})();
