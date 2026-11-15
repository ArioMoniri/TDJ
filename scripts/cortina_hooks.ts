/**
 * 2026-11: where every cortina is recognisable. For each cue (the built-in library + data/knowledge/cortinas.json,
 * with the cached Spotify / Deezer recording length) the public LRCLIB API gives synced lyrics; the hook is the
 * chorus (the most-repeated block of ≥ 2 lines) at its first occurrence minus 1 s, else the first vocal line after an
 * intro longer than 8 s (packages/core/src/hooks.ts → pickHook). Sequential, ~300 ms apart. The result is committed
 * in data/cache/cortina_hooks.json (source, confidence, the matched lyric line).
 *
 * Audio fallback: a cue without synced lyrics (an instrumental) has no full recording in the repo — only Deezer's 30 s
 * preview, which Deezer cuts from the song's highlight at an offset it does not publish, so its energy cannot place a
 * start in the full track. Such a cue keeps start 0 here (source "none") and the Booth's own analysis or the DJ's
 * start applies when a full file plays.
 *   pnpm --filter @tdj/core exec tsx ../../scripts/cortina_hooks.ts [--force] [--only id,id]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { normTitle } from "../packages/core/src/energy";
import { type CortinaHook, type CortinaHookFile, normLyric, pickHook } from "../packages/core/src/hooks";
import { loadCatalog } from "../packages/core/src/load";
import type { Cortina } from "../packages/core/src/types";

const force = process.argv.includes("--force");
const onlyArg = process.argv.indexOf("--only");
const only = onlyArg > 0 ? new Set((process.argv[onlyArg + 1] ?? "").split(",")) : null;
const ROOT = new URL("..", import.meta.url).pathname;
const OUT = `${ROOT}data/cache/cortina_hooks.json`;
mkdirSync(`${ROOT}data/cache`, { recursive: true });
const file: CortinaHookFile = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, "utf8"))
  : { version: 1, hooks: {} };
const UA = "cortina-hooks/0.1 (synced-lyrics timing lookup)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const API = "https://lrclib.net/api";

type Lrc = {
  id: number;
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  syncedLyrics: string | null;
};
let last = 0;
async function get<T>(url: string): Promise<{ status: number; body: T | null }> {
  const wait = 300 - (Date.now() - last);
  if (wait > 0) await sleep(wait);
  last = Date.now();
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: { "user-agent": UA } });
      if (r.status === 429) {
        await sleep(3000 * (k + 1));
        continue;
      }
      return { status: r.status, body: r.ok ? ((await r.json()) as T) : null };
    } catch {
      await sleep(1500);
    }
  }
  return { status: 0, body: null };
}

/** the first artist of a credit ("Fikret Kızılok & Sibel Sezal" → "Fikret Kızılok") */
const leadArtist = (a: string) => a.split(/\s*(?:&|,| feat\.? | ft\.? | and | ve )\s*/i)[0]!.trim();
const sameTitle = (a: string, b: string) => {
  const x = normTitle(a);
  const y = normTitle(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
};
const sameArtist = (a: string, b: string) => {
  const x = normLyric(a);
  const y = normLyric(leadArtist(b));
  return x.includes(y) || y.includes(x);
};

async function lookup(c: Cortina, dur: number | undefined): Promise<{ hit: Lrc | null; why?: string }> {
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
  for (const artist of [...new Set([c.artist, leadArtist(c.artist)])]) {
    if (dur) {
      const r = await get<Lrc>(
        `${API}/get?${q({ artist_name: artist, track_name: c.title, duration: String(Math.round(dur)) })}`,
      );
      if (r.status === 0) return { hit: null, why: "lrclib unreachable" };
      if (r.body && (r.body.syncedLyrics || r.body.instrumental)) return { hit: r.body };
    }
  }
  // search: the same title and artist, synced, the nearest length
  const lists: Lrc[] = [];
  for (const params of <Array<Record<string, string>>>[
    { track_name: c.title, artist_name: leadArtist(c.artist) },
    { q: `${leadArtist(c.artist)} ${c.title}` },
  ]) {
    const r = await get<Lrc[]>(`${API}/search?${q(params)}`);
    if (r.body?.length) lists.push(...r.body);
    if (lists.some((x) => x.syncedLyrics && sameTitle(x.trackName, c.title))) break;
  }
  const ok = lists.filter(
    (x) =>
      sameTitle(x.trackName, c.title) &&
      sameArtist(x.artistName, c.artist) &&
      (x.syncedLyrics || x.instrumental),
  );
  if (!ok.length) return { hit: null, why: lists.length ? "no matching synced lyrics" : "not on LRCLIB" };
  ok.sort(
    (a, b) =>
      Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics) ||
      Math.abs(a.duration - (dur ?? a.duration)) - Math.abs(b.duration - (dur ?? b.duration)),
  );
  return { hit: ok[0]! };
}

async function main() {
  const loaded = loadCatalog(ROOT);
  const cues = loaded.cortinas;
  console.log(`${cues.length} cues`);
  let n = 0;
  for (const c of cues) {
    if (only && !only.has(c.id)) continue;
    if (!force && file.hooks[c.id] && !only) continue;
    const sp = c.spotify?.durationMs ? c.spotify.durationMs / 1000 : undefined;
    const dz = c.resolved?.durationMs ? c.resolved.durationMs / 1000 : undefined;
    const dur = sp ?? dz;
    const len = c.lengthSec ?? 45;
    const { hit, why } = await lookup(c, dur);
    let h: CortinaHook;
    if (!hit)
      h = { startSec: 0, source: "none", confidence: 0, ...(dur ? { durationSec: dur } : {}), note: why };
    else if (!hit.syncedLyrics)
      h = {
        startSec: 0,
        source: "none",
        confidence: 0,
        ...(dur ? { durationSec: dur } : {}),
        matched: `lrclib:${hit.id} ${hit.artistName} – ${hit.trackName} (${hit.duration} s)`,
        note: "instrumental: no lyrics to place a chorus; the Deezer preview's offset in the track is unknown",
      };
    else {
      const off = dur ? Math.abs(hit.duration - dur) : 0;
      const p = pickHook(hit.syncedLyrics, { durationSec: dur ?? hit.duration, lengthSec: len });
      if (!p)
        h = {
          startSec: 0,
          source: "none",
          confidence: 0,
          ...(dur ? { durationSec: dur } : {}),
          note: "synced lyrics without a sung line",
        };
      else
        h = {
          startSec: p.startSec,
          source: "lyrics",
          kind: p.kind,
          // a lyric timed on a recording of another length may sit a few seconds off
          confidence:
            Math.round(Math.max(0.1, p.confidence - (off > 10 ? 0.3 : off > 3 ? 0.1 : 0)) * 100) / 100,
          ...(p.line ? { line: p.line } : {}),
          ...(p.repeats ? { repeats: p.repeats } : {}),
          durationSec: dur ?? hit.duration,
          matched: `lrclib:${hit.id} ${hit.artistName} – ${hit.trackName} (${hit.duration} s)`,
          ...(off > 3
            ? {
                note: `lyrics timed on a ${Math.round(hit.duration)} s recording (ours ${Math.round(dur!)} s)`,
              }
            : {}),
        };
    }
    file.hooks[c.id] = h;
    n++;
    console.log(
      `${c.id.padEnd(34)} ${h.source.padEnd(6)} ${String(h.startSec).padStart(6)} ${h.kind ?? ""} ${h.confidence} ${h.line ?? h.note ?? ""}`,
    );
    if (n % 10 === 0) writeFileSync(OUT, `${JSON.stringify(sorted(file), null, 2)}\n`);
  }
  writeFileSync(OUT, `${JSON.stringify(sorted(file), null, 2)}\n`);
  const all = Object.values(file.hooks);
  console.log(
    `done: ${all.length} cues · lyrics ${all.filter((h) => h.source === "lyrics").length} · none ${all.filter((h) => h.source === "none").length}`,
  );
}
function sorted(f: CortinaHookFile): CortinaHookFile {
  return {
    version: 1,
    generatedAt: new Date().toISOString().slice(0, 10),
    hooks: Object.fromEntries(Object.entries(f.hooks).sort(([a], [b]) => a.localeCompare(b))),
  };
}
void main();
