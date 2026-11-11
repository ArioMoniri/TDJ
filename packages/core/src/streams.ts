import type { ResolvedTrack } from "./audio/index";
import { normTitle } from "./energy";
import type { Song } from "./types";

/**
 * Round 15 — the stream audit (docs/reviews/round15-discography.md §5, R4a–R4d). Pure: reads the index rows and the
 * two stream caches (Deezer resolve, Spotify) and reports every match the panel would reject. `scripts/audit_streams.ts`
 * runs it after `pnpm index:build` and fails the build on R4a/R4b; `--fix` unbinds the wrong owners of a shared id
 * (`fixSharedStreams`). The catalog applies R4b–R4d at load (`streamVerdict`).
 */
type Row = Pick<Song, "id" | "title" | "orchestra" | "orchestraId" | "singer" | "vocal" | "year" | "date"> & {
  altIds?: string[];
};
type SpotifyEntry = { uri?: string; durationMs?: number; album?: string; matched?: string } | null;

/** a dd/mm/yyyy recording date in a restoration title ("Recuerdo (Buenos Aires 08/01/1941 Restauración 2022)") */
export function titleDate(title: string | undefined | null): number | null {
  const m = /\b(\d{1,2})\/(\d{1,2})\/(19\d\d)\b/.exec(title ?? "");
  if (!m) return null;
  const d = Number(m[1]),
    mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  return Date.UTC(Number(m[3]), mo - 1, d);
}
const rowDate = (r: Pick<Row, "date">) =>
  r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? Date.parse(r.date) : null;
/** R4b: the stream title's date and the row's date differ by more than 31 days */
export function dateMismatch(r: Pick<Row, "date">, streamTitle: string | undefined | null): boolean {
  const a = titleDate(streamTitle),
    b = rowDate(r);
  return a !== null && b !== null && Math.abs(a - b) > 31 * 864e5;
}
/** years an album title names ("(1939-1940), Vol. 4", "Serie 78 RPM 1940-1947") as an inclusive span */
export function albumSpan(album: string | undefined | null): [number, number] | null {
  const ys = [...(album ?? "").matchAll(/\b(19[2-9]\d)\b/g)].map((m) => Number(m[1]));
  if (!ys.length) return null;
  return [Math.min(...ys), Math.max(...ys)];
}

const sur = (x: string | null | undefined) =>
  normTitle(x ?? "")
    .split(" ")
    .filter((w) => w.length > 2);
/** the singers a stream credit names: full index singer names found in the artist string */
export function creditedSingers(artist: string, singers: string[]): string[] {
  const a = ` ${normTitle(artist)} `;
  return singers.filter((s) => a.includes(` ${normTitle(s)} `));
}
/** R4d: the credit names a singer the row does not have (an instrumental row, or another voice) */
export function creditNamesOther(
  r: Row,
  artist: string | undefined | null,
  singers: string[],
): string | null {
  if (!artist) return null;
  const named = creditedSingers(artist, singers);
  const mine = normTitle(r.singer ?? "");
  const orch = normTitle(r.orchestra);
  for (const n of named) {
    const k = normTitle(n);
    if (k === mine || orch.includes(k) || (mine && (mine.includes(k) || k.includes(mine)))) continue;
    // a surname-only overlap with the row's own singer ("Chato Flores" vs "Roberto Chato Flores") is the same voice
    const ms = sur(r.singer).at(-1);
    if (ms && sur(n).at(-1) === ms) continue;
    // a duet row ("C. Bermudez - J. Linares") names each voice by surname
    const ns = sur(n).at(-1);
    if (ns && mine && sur(r.singer).includes(ns)) continue;
    return n;
  }
  return null;
}

/** the credit carries the orchestra's or the singer's surname, or an orquesta típica (catalog.matchNamesArtist) */
const namesRow = (r: Row, artist: string) => {
  const a = normTitle(artist);
  const keys = [...sur(r.orchestra).slice(-1), ...sur(r.singer).slice(-1), "orquesta", "tipica", "orchestra"];
  return keys.some((k) => a.includes(k));
};

export interface StreamAudit {
  /** R4a: one stream id bound to rows of different dates, orchestras or singers */
  shared: Array<{ streamId: string; rows: string[]; keep: string | null }>;
  /** R4b: the stream title's date and the row's date differ by more than 31 days */
  dateMismatch: Array<{ row: string; title: string; date: string | null; stream: string }>;
  /** R4c: Spotify and Deezer lengths disagree beyond −14 … +8 s (Spotify − Deezer) */
  lengthMismatch: Array<{ row: string; spotifySec: number; deezerSec: number }>;
  /** R4d: the credit names a singer the row lacks */
  creditMismatch: Array<{ row: string; artist: string; names: string }>;
}

/** the singers worth matching in a credit: every index singer with at least three rows */
export function knownSingers(rows: Row[]): string[] {
  const n = new Map<string, number>();
  for (const r of rows) if (r.singer) n.set(r.singer, (n.get(r.singer) ?? 0) + 1);
  return [...n]
    .filter(
      ([s, k]) => k >= 3 && normTitle(s).split(" ").length >= 2 && !/^(orquesta|coro|duo|trio)/i.test(s),
    )
    .map(([s]) => s)
    .sort();
}

/** the row that keeps a shared stream (null: none of them can be shown to own it) */
export function sharedKeeper(
  rows: Row[],
  track: { title?: string; album?: string; artist?: string },
): Row | null {
  const td = titleDate(track.title);
  if (td !== null) {
    const hit = rows.filter((r) => {
      const d = rowDate(r);
      return d !== null && Math.abs(d - td) <= 31 * 864e5;
    });
    return hit[0] ?? null;
  }
  let pool = rows.slice();
  const span = albumSpan(track.album);
  if (span) {
    const fit = pool.filter((r) => r.year && r.year >= span[0] && r.year <= span[1]);
    if (fit.length) pool = fit;
    else if (pool.every((r) => r.year)) return null;
  }
  // the credit's singer (or none for an instrumental credit) decides between voices
  if (pool.length > 1 && track.artist) {
    const a = ` ${normTitle(track.artist)} `;
    const voiced = pool.filter((r) => r.singer && sur(r.singer).some((w) => a.includes(` ${w} `)));
    if (voiced.length) pool = voiced;
    else {
      const instr = pool.filter((r) => !r.vocal);
      if (instr.length) pool = instr;
    }
  }
  // a dated row over an undated one; then the earliest recording (the golden row the resolver searched for)
  const dated = pool.filter((r) => r.year);
  if (dated.length) pool = dated;
  return pool.sort((x, y) => (x.year ?? 9999) - (y.year ?? 9999) || x.id.localeCompare(y.id))[0] ?? null;
}

const sig = (r: Row) => `${r.orchestraId}|${r.date ?? ""}|${normTitle(r.singer ?? "")}|${normTitle(r.title)}`;

/** Run R4a–R4d over the index rows and the caches. */
export function auditStreams(
  songs: Row[],
  resolved: Record<string, ResolvedTrack | null>,
  spotify: Record<string, SpotifyEntry>,
): StreamAudit {
  const byId = new Map<string, Row>();
  for (const s of songs) {
    byId.set(s.id, s);
    for (const a of s.altIds ?? []) if (!byId.has(a)) byId.set(a, s);
  }
  const singers = knownSingers(songs);
  const groups = new Map<string, Array<{ key: string; row: Row }>>();
  const push = (sid: string, key: string) => {
    const row = byId.get(key);
    if (!row) return;
    groups.set(sid, [...(groups.get(sid) ?? []), { key, row }]);
  };
  for (const [k, v] of Object.entries(resolved)) if (v?.id) push(`${v.provider}:${v.id}`, k);
  for (const [k, v] of Object.entries(spotify)) if (v?.uri) push(v.uri, k);
  const shared: StreamAudit["shared"] = [];
  for (const [sid, xs] of groups) {
    const rows = [...new Map(xs.map((x) => [x.row.id, x.row])).values()];
    if (rows.length < 2 || new Set(rows.map(sig)).size < 2) continue;
    const tr = sid.startsWith("spotify:")
      ? {
          title: (spotify[xs[0]!.key]?.matched ?? "").split(" – ")[1],
          album: spotify[xs[0]!.key]?.album,
          artist: (spotify[xs[0]!.key]?.matched ?? "").split(" – ")[0],
        }
      : (resolved[xs[0]!.key] ?? {});
    shared.push({ streamId: sid, rows: xs.map((x) => x.key), keep: sharedKeeper(rows, tr)?.id ?? null });
  }
  const dm: StreamAudit["dateMismatch"] = [];
  const lm: StreamAudit["lengthMismatch"] = [];
  const cm: StreamAudit["creditMismatch"] = [];
  for (const [k, row] of byId) {
    if (row.id !== k) continue;
    const ids = [row.id, ...(row.altIds ?? [])];
    const rz = ids.map((i) => resolved[i]).find((x) => x?.id) ?? null;
    const sp = ids.map((i) => spotify[i]).find((x) => x?.uri) ?? null;
    if (rz && dateMismatch(row, rz.title))
      dm.push({ row: row.id, title: row.title, date: row.date ?? null, stream: rz.title });
    if (rz?.durationMs && sp?.durationMs) {
      const d = (sp.durationMs - rz.durationMs) / 1000;
      if (d < -14 || d > 8)
        lm.push({
          row: row.id,
          spotifySec: Math.round(sp.durationMs / 1000),
          deezerSec: Math.round(rz.durationMs / 1000),
        });
    }
    for (const artist of [rz?.artist, sp?.matched?.split(" – ")[0]]) {
      // (a credit naming neither the orchestra nor the singer is dropped at load, round 14 R5: it plays nothing)
      if (!artist || !namesRow(row, artist)) continue;
      const o = creditNamesOther(row, artist, singers);
      if (o) {
        cm.push({ row: row.id, artist: artist!, names: o });
        break;
      }
    }
  }
  return { shared, dateMismatch: dm, lengthMismatch: lm, creditMismatch: cm };
}

/** R4a fix: every shared id stays on its keeper only; the other rows' cache entries become null (never searched again) */
export function fixSharedStreams(
  a: StreamAudit,
  resolved: Record<string, ResolvedTrack | null>,
  spotify: Record<string, SpotifyEntry>,
  songs: Row[],
): {
  resolved: Record<string, ResolvedTrack | null>;
  spotify: Record<string, SpotifyEntry>;
  cleared: string[];
} {
  const r = { ...resolved },
    s = { ...spotify };
  const cleared: string[] = [];
  const owner = new Map<string, string>();
  for (const x of songs) {
    owner.set(x.id, x.id);
    for (const al of x.altIds ?? []) owner.set(al, x.id);
  }
  for (const g of a.shared)
    for (const key of g.rows) {
      if (g.keep && owner.get(key) === g.keep) continue;
      if (g.streamId.startsWith("spotify:")) s[key] = null;
      else r[key] = null;
      cleared.push(key);
    }
  for (const d of a.dateMismatch) {
    const keys = [d.row, ...(songs.find((x) => x.id === d.row)?.altIds ?? [])];
    for (const k of keys)
      if (r[k] && dateMismatch({ date: d.date }, r[k]!.title)) {
        r[k] = null;
        cleared.push(k);
      }
  }
  return { resolved: r, spotify: s, cleared };
}

/**
 * Round 15 (export matching): every cached Spotify id against its index row with the match rules (title, orchestra
 * and singer credit, a dated title, the Deezer length as the reference, a later album) and R4a (one id, one recording).
 */
export function auditSpotifyCache(
  songs: Array<Row & { altTitles?: string[] }>,
  spotify: Record<string, SpotifyEntry>,
  resolved: Record<string, ResolvedTrack | null>,
  problem: (
    row: Row & { altTitles?: string[] },
    c: { name: string; artists: string[]; album?: string; durationMs?: number },
    ref?: number | null,
  ) => string | null,
): { checked: number; rejected: Array<{ row: string; uri: string; why: string }> } {
  const byId = new Map<string, Row & { altTitles?: string[] }>();
  for (const s of songs) {
    byId.set(s.id, s);
    for (const a of s.altIds ?? []) if (!byId.has(a)) byId.set(a, s);
  }
  const shared = new Set(auditStreams(songs, {}, spotify).shared.flatMap((g) => g.rows));
  let checked = 0;
  const rejected: Array<{ row: string; uri: string; why: string }> = [];
  for (const [k, v] of Object.entries(spotify)) {
    if (!v?.uri) continue;
    const row = byId.get(k);
    if (!row) continue;
    checked++;
    if (shared.has(k)) {
      rejected.push({ row: k, uri: v.uri, why: "one Spotify id bound to several recordings" });
      continue;
    }
    const [artist = "", ...rest] = (v.matched ?? "").split(" – ");
    const name = rest.join(" – ") || row.title;
    const rz = resolved[k] ?? resolved[row.id];
    // (a Deezer restoration runs 10–15 s long: never the reference, discography §3)
    const ref = rz?.durationMs && !/restaur/i.test(`${rz.title} ${rz.album}`) ? rz.durationMs / 1000 : null;
    const why = problem(
      row,
      { name, artists: artist.split(/,\s*/), album: v.album, durationMs: v.durationMs },
      ref,
    );
    if (why) rejected.push({ row: k, uri: v.uri, why });
  }
  return { checked, rejected };
}
