/**
 * The catalogue search on the full index, in Node (2026-11, "the search is so slow"): how long core `searchSongs`
 * takes per keystroke (every prefix of a few typical queries, 3 runs each), how long the server's index takes to
 * build, and what the browser's search worker pays once: the snapshot's size, its parse and its index build.
 *
 *   pnpm --filter @tdj/web exec tsx scripts/search-bench.ts
 */
import { searchSongs } from "@tdj/core";
import { loadCatalog } from "@tdj/core/load";
import { snapshotOf } from "../src/lib/api/searchSnapshot";
import { indexFromSnapshot } from "../src/lib/searchSnapshot";

const ms = (a: number) => `${(performance.now() - a).toFixed(0)} ms`;
let t = performance.now();
const loaded = loadCatalog();
console.log(`load the catalogue: ${ms(t)}`);
t = performance.now();
const ix = loaded.catalog.searchIndex();
console.log(`build the server's index: ${ms(t)} (${ix.songs.length} sides)`);

t = performance.now();
const snap = snapshotOf(loaded.catalog, loaded.meta);
const wire = snap.parts.map((p) => JSON.stringify(p));
console.log(
  `snapshot: ${snap.parts.length} parts, ${(wire.reduce((a, s) => a + s.length, 0) / 1e6).toFixed(1)} MB (built in ${ms(t)})`,
);
t = performance.now();
const parts = wire.map((s) => JSON.parse(s));
console.log(`parse the snapshot: ${ms(t)}`);
t = performance.now();
const client = indexFromSnapshot(parts);
console.log(`build the browser's index: ${ms(t)}`);

const prefixes = (s: string) =>
  Array.from({ length: s.length }, (_, i) => s.slice(0, i + 1)).filter((x) => x.trim().length >= 2);
const QUERIES = [
  "di sarli",
  "pugliese 40s",
  "la cumparsita",
  "d'arienzo instrumental",
  "fiorentino troilo",
  "otv vals",
  "pugliese yumba",
  "mal",
  "tango",
  "zzqqx",
];
for (const [name, index] of [
  ["server index", ix],
  ["browser index", client],
] as const) {
  const all: number[] = [];
  for (const q of QUERIES) {
    const ts: number[] = [];
    for (const p of prefixes(q))
      for (let k = 0; k < 3; k++) {
        const a = performance.now();
        searchSongs(index, p, { limit: 50 });
        ts.push(performance.now() - a);
      }
    ts.sort((a, b) => a - b);
    all.push(...ts);
    console.log(
      `  ${name} ${q.padEnd(24)} median ${ts[Math.floor(ts.length / 2)]!.toFixed(2)} ms  max ${ts.at(-1)!.toFixed(2)} ms`,
    );
  }
  all.sort((a, b) => a - b);
  const at = (p: number) => all[Math.min(all.length - 1, Math.floor(all.length * p))]!.toFixed(2);
  console.log(
    `${name}: n=${all.length} p50 ${at(0.5)} ms  p95 ${at(0.95)} ms  max ${all.at(-1)!.toFixed(2)} ms`,
  );
}
