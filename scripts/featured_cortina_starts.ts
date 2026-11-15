/**
 * 2026-11: the featured night's cortinas start at their chorus. Sets only `tandas[].cortina.startSec` in
 * apps/web/public/featured/golden-double-peak.json from data/cache/cortina_hooks.json (validated: start + the cue's
 * length ≤ the recording); the songs, the order, the uris and everything else stay byte for byte.
 *   pnpm --filter @tdj/core exec tsx ../../scripts/featured_cortina_starts.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { cortinaDurationSec, validCortinaStart } from "../packages/core/src/hooks";
import { loadCatalog } from "../packages/core/src/load";
import type { Playlist } from "../packages/core/src/types";

const ROOT = new URL("..", import.meta.url).pathname;
const PATH = `${ROOT}apps/web/public/featured/golden-double-peak.json`;
const raw = readFileSync(PATH, "utf8");
const night = JSON.parse(raw) as Playlist;
if (JSON.stringify(night) !== raw.replace(/\n$/, ""))
  throw new Error("the featured file does not round-trip");
const pool = new Map(loadCatalog(ROOT).cortinas.map((c) => [c.id, c]));
for (const t of night.tandas) {
  const c = t.cortina;
  if (!c) continue;
  const pooled = pool.get(c.id);
  const hook = pooled?.hook;
  if (!hook || hook.source === "none") continue;
  const start = validCortinaStart(
    hook.startSec,
    c.lengthSec ?? 45,
    cortinaDurationSec(pooled) ?? cortinaDurationSec(c),
  );
  c.startSec = start;
  console.log(
    `${c.id.padEnd(30)} ${String(start).padStart(6)}  ${hook.kind} ${hook.confidence}  ${hook.line ?? ""}`,
  );
}
writeFileSync(PATH, JSON.stringify(night) + (raw.endsWith("\n") ? "\n" : ""));
