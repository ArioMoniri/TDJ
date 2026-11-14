import { normTitle } from "./energy";
import { renight, retimeTanda } from "./swap";
import type { Phase, Playlist, Song } from "./types";

/**
 * Round 22 — the song search side panel (Compose and the Booth): one plain function over the catalogue's songs, so a
 * standalone app runs it locally. Filters by words (title, orchestra, singer), orchestra, singer ("instrumental" for
 * none), a year range and rhythm; every hit says where it sits in tonight's night.
 */

export interface Placement {
  /** tanda index (0-based); -1 for the opening Cumparsita, -2 for the closing one */
  tanda: number;
  /** chair inside the tanda (0-based) */
  track: number;
  phase?: Phase;
  rhythm?: string;
  /** "Tanda 3 · song 2 · build" */
  label: string;
}

export interface SongQuery {
  /** words matched against title, orchestra and singer (any order, accent-blind) */
  text?: string;
  orchestra?: string;
  /** a singer's name, or "instrumental" for sides without one */
  singer?: string;
  yearFrom?: number;
  yearTo?: number;
  rhythms?: string[];
  /** only sides already in tonight's night */
  inNight?: boolean;
  limit?: number;
}

export interface SongHit {
  song: Song;
  placement?: Placement;
}

const PHASE_LABEL: Record<string, string> = {
  warmup: "warm-up",
  build: "build",
  peak: "peak",
  cooldown: "cool-down",
  close: "close",
};

const norm = (x: string) => x.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’.]/g, "");

/** song id → where it sits in the night (tanda, chair, part) */
export function placements(p: Playlist | null | undefined): Map<string, Placement> {
  const out = new Map<string, Placement>();
  if (!p) return out;
  p.tandas.forEach((t, ti) =>
    t.songs.forEach((s, k) =>
      out.set(s.id, {
        tanda: ti,
        track: k,
        phase: t.phase,
        rhythm: t.rhythm,
        label: `Tanda ${ti + 1} · song ${k + 1}${t.phase ? ` · ${PHASE_LABEL[t.phase] ?? t.phase}` : ""}`,
      }),
    ),
  );
  if (p.opening && !out.has(p.opening.id))
    out.set(p.opening.id, { tanda: -1, track: 0, label: "Opens the night" });
  if (p.closing && !out.has(p.closing.id))
    out.set(p.closing.id, { tanda: -2, track: 0, label: "Closes the night" });
  return out;
}

const hasFilter = (q: SongQuery) =>
  !!(
    q.text?.trim() ||
    q.orchestra?.trim() ||
    q.singer?.trim() ||
    q.yearFrom ||
    q.yearTo ||
    q.rhythms?.length ||
    q.inNight
  );

/** the catalogue filtered and ranked: titles starting with the words first, then fame, then year */
export function searchSongs(songs: Song[], q: SongQuery, p?: Playlist | null): SongHit[] {
  if (!hasFilter(q)) return [];
  const where = placements(p);
  const terms = norm(q.text ?? "")
    .split(/\s+/)
    .filter(Boolean);
  const orch = norm(q.orchestra ?? "").trim();
  const singer = norm(q.singer ?? "").trim();
  const instrumental = singer === "instrumental";
  const rh = q.rhythms?.length ? new Set(q.rhythms) : null;
  const scored: Array<{ hit: SongHit; rank: number }> = [];
  const phrase = terms.join(" ");
  for (const s of songs) {
    if (rh && !rh.has(s.rhythm)) continue;
    if (q.yearFrom && (!s.year || s.year < q.yearFrom)) continue;
    if (q.yearTo && (!s.year || s.year > q.yearTo)) continue;
    if (orch && !norm(s.orchestra).includes(orch)) continue;
    if (instrumental ? !!s.singer : singer && !norm(s.singer ?? "").includes(singer)) continue;
    const placement = where.get(s.id);
    if (q.inNight && !placement) continue;
    let rank = 0;
    if (terms.length) {
      const title = norm(s.title);
      const hay = `${title} ${norm(s.orchestra)} ${norm(s.singer ?? "")}`;
      if (!terms.every((t) => hay.includes(t))) continue;
      if (title === phrase) rank += 4;
      else if (title.startsWith(phrase) || title.startsWith(terms[0]!)) rank += 2;
      else if (title.includes(terms[0]!)) rank += 1;
    }
    rank += Math.min(5, s.fame ?? 0) / 10;
    scored.push({ hit: placement ? { song: s, placement } : { song: s }, rank });
  }
  scored.sort(
    (a, b) =>
      b.rank - a.rank ||
      normTitle(a.hit.song.title).localeCompare(normTitle(b.hit.song.title)) ||
      (a.hit.song.year ?? 9999) - (b.hit.song.year ?? 9999),
  );
  return scored.slice(0, q.limit ?? 60).map((x) => x.hit);
}

/**
 * The DJ adds a side to a tanda from the search panel: appended, the tanda re-timed and pinned as the DJ's (the rules
 * leave a DJ's tanda alone), the night re-scored. A side already in the night is refused.
 */
export function addSide(
  p: Playlist,
  ti: number,
  songId: string,
  deps: { catalog: { songs: Song[] } },
): { playlist: Playlist; reason?: string } {
  const t = p.tandas[ti];
  const s = deps.catalog.songs.find((x) => x.id === songId || x.altIds?.includes(songId));
  if (!t || !s) return { playlist: p, reason: "no such side" };
  if (p.tandas.some((x) => x.songs.some((y) => y.id === s.id)))
    return { playlist: p, reason: "already in tonight's night" };
  const nt = {
    ...retimeTanda(t, [...t.songs, s]),
    locked: true,
    pinned: { by: "dj" as const, reason: `DJ added ${s.title}`, at: new Date().toISOString() },
  };
  const tandas = p.tandas.map((x, i) => (i === ti ? nt : x));
  try {
    return { playlist: renight(p, tandas) };
  } catch {
    // a partial night (tests, an imported file without its booth plan): the tandas are what matters
    return { playlist: { ...p, tandas } };
  }
}
