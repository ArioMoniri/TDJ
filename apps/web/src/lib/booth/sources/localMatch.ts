import { fileName } from "@/lib/exportPaths";
import { bestMatch, type Candidate, MATCH_THRESHOLD, type MatchItem, norm } from "@/lib/match";
import type { MatchMap, MatchRecord } from "../persist";
import type { BoothRow } from "../plan";
import type { Tags } from "./tags";

/** One audio file in the linked folder (what the index keeps; the handle / File lives in the adapter). */
export interface FolderEntry {
  /** relative path inside the folder */
  path: string;
  name: string;
  size: number;
  lastModified: number;
  tags?: Tags;
}
export const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|opus|aif|aiff)$/i;
export const isAudioName = (name: string) => AUDIO_EXT.test(name);

/** "Juan D'Arienzo - El Flete.mp3" → artist + title; "01 - el_flete (1936).m4a" → title + year, no artist. */
export function parseName(name: string): { title: string; artist?: string; year?: number } {
  let base = name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/_/g, " ")
    .trim();
  let year: number | undefined;
  base = base.replace(/[([]\s*((?:1[89]|20)\d\d)\s*[)\]]/g, (_, y: string) => {
    year ??= Number(y);
    return " ";
  });
  base = base
    .replace(/^\s*\d{1,3}\s*[-._)]\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const parts = base.split(/\s[-–—]\s/);
  if (parts.length >= 2) {
    const artist = parts[0]!.trim();
    const title = parts.slice(1).join(" - ").trim();
    return { title, artist: artist || undefined, year };
  }
  return { title: base, year };
}

/** A search candidate for `bestMatch`: tags first, the file name as the fallback. */
export function candidateFor(e: FolderEntry): Candidate {
  const parsed = parseName(e.name);
  const artist = e.tags?.artist ?? parsed.artist;
  return {
    uri: e.path,
    name: e.tags?.title ?? parsed.title,
    artists: artist ? [artist] : [],
    album: e.tags?.album ?? "",
    albumYear: e.tags?.year ?? parsed.year ?? null,
    durationMs: 0,
  };
}

/** The item as the matcher scores it. */
export function matchItemFor(it: BoothRow): MatchItem {
  const orchestra = it.artist.split(" / ")[0] ?? it.artist;
  return {
    id: it.id ?? String(it.n),
    title: it.title,
    orchestra,
    singer: it.singer ?? null,
    year: it.year ?? null,
    durationSec: it.kind === "cortina" ? null : it.lengthSec,
  };
}

const noExt = (s: string) => s.replace(/\.[a-z0-9]+$/i, "");
const nameKey = (s: string) => norm(noExt(s));

export interface MatchOutcome {
  record: MatchRecord | null;
  /** the three best candidates for the "Pick file…" sheet when nothing cleared the threshold */
  suggestions: FolderEntry[];
}

/**
 * Match one plan item against the folder: the exact file name the exporter would produce first (with and without
 * the extension, case-insensitive, diacritics stripped), then the fuzzy `bestMatch` pass. A manual record in
 * `prev` is kept as is, as long as the file is still there.
 */
export function matchOne(
  it: BoothRow,
  entries: FolderEntry[],
  o: { naming?: string; prev?: MatchRecord; byName?: Map<string, FolderEntry[]> } = {},
): MatchOutcome {
  const id = it.id ?? String(it.n);
  if (o.prev?.manual) {
    const still = entries.find((e) => e.path === o.prev!.path);
    if (still)
      return { record: { ...o.prev, size: still.size, lastModified: still.lastModified }, suggestions: [] };
  }
  const byName = o.byName ?? indexByName(entries);
  const orchestra = it.artist.split(" / ")[0] ?? it.artist;
  const flat = {
    n: it.n,
    kind: it.kind,
    id,
    tanda: it.tanda,
    title: it.title,
    artist: it.artist,
    year: it.year,
    rhythm: it.rhythm,
    durationSec: it.lengthSec,
    singer: it.singer,
    orchestra,
    planIndex: it.n - 1,
    startSec: it.startSec,
    gapAfterSec: it.gapAfterSec,
  };
  // the exporter's spelling ("Orchestra / Singer - Title") and the orchestra-only one
  const expected = [fileName(o.naming ?? "", flat), fileName(o.naming ?? "", { ...flat, artist: orchestra })];
  const exact = expected.map((x) => byName.get(nameKey(x))?.[0]).find(Boolean);
  if (exact)
    return {
      record: { path: exact.path, size: exact.size, lastModified: exact.lastModified, score: 1 },
      suggestions: [],
    };
  const item = matchItemFor(it);
  const cands = entries.map(candidateFor);
  const best = bestMatch(item, cands, MATCH_THRESHOLD);
  if (best) {
    const e = entries.find((x) => x.path === best.uri)!;
    return {
      record: { path: e.path, size: e.size, lastModified: e.lastModified, score: best.score },
      suggestions: [],
    };
  }
  // below threshold: the three closest by title, for the sheet
  const scored = entries
    .map((e, i) => ({ e, s: scoreTitleOnly(item, cands[i]!) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
    .filter((x) => x.s > 0.3)
    .map((x) => x.e);
  return { record: null, suggestions: scored };
}
function scoreTitleOnly(item: MatchItem, c: Candidate): number {
  const a = norm(item.title);
  const b = norm(c.name);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = new Set(a.split(" "));
  const B = b.split(" ");
  const hit = B.filter((w) => A.has(w)).length;
  return hit / Math.max(A.size, B.length);
}
export function indexByName(entries: FolderEntry[]): Map<string, FolderEntry[]> {
  const m = new Map<string, FolderEntry[]>();
  for (const e of entries) {
    const k = nameKey(e.name);
    const list = m.get(k);
    if (list) list.push(e);
    else m.set(k, [e]);
  }
  return m;
}

/** Match every song/cortina item; `prev` records marked manual survive a re-index. */
export function matchAll(
  items: BoothRow[],
  entries: FolderEntry[],
  prev: MatchMap = {},
  naming = "",
): { matches: MatchMap; suggestions: Record<string, FolderEntry[]> } {
  const byName = indexByName(entries);
  const matches: MatchMap = {};
  const suggestions: Record<string, FolderEntry[]> = {};
  for (const it of items) {
    if (it.kind === "break") continue;
    const id = it.id ?? String(it.n);
    if (matches[id]) continue;
    const r = matchOne(it, entries, { naming, prev: prev[id], byName });
    if (r.record) matches[id] = r.record;
    else if (r.suggestions.length) suggestions[id] = r.suggestions;
  }
  return { matches, suggestions };
}
