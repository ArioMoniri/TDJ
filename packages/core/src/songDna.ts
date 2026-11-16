import WORKS from "../../../data/knowledge/works.json";
import type { ReferenceCorpus } from "./catalog";
import { normTitle } from "./energy";
import type { Song } from "./types";

/**
 * 2026-11 — "Song DNA" (the owner: like Spotify's SongDNA or WhoSampled credits): a work's credits (composer = música,
 * lyricist = letra, the year it was written, from data/knowledge/works.json or the DJ's own entry), every recording
 * of it in the index (every orchestra, every voice, every year), the orchestra's and the singer's other recordings
 * around that year, related works (the same composer or lyricist), the tanda family the side fits and the canonical
 * tandas that hold it; and the orchestra and singer pages built the same way. Pure: the routes hand in the songs.
 */

export interface WorkCredit {
  title: string;
  composers: string[];
  lyricists: string[];
  /** the year the work was written (not a recording date) */
  year: number | null;
  /** no lyricist: an instrumental work (a vocal recording of it is the rare exception) */
  instrumental: boolean;
  source: "knowledge" | "dj";
}
export type CreditEdit = { composers?: string[]; lyricists?: string[]; year?: number | null };

const credit = (title: string, w: CreditEdit, source: WorkCredit["source"]): WorkCredit => ({
  title,
  composers: w.composers ?? [],
  lyricists: w.lyricists ?? [],
  year: w.year ?? null,
  instrumental: !(w.lyricists ?? []).length,
  source,
});

/** the curated credits by work key (normTitle) */
export const WORK_CREDITS: Map<string, WorkCredit> = new Map(
  (WORKS.works as Array<{ title: string } & CreditEdit>).map((w) => [
    normTitle(w.title),
    credit(w.title, w, "knowledge"),
  ]),
);

/** a work's credits: the DJ's entry (by work key) over the curated one; null when neither knows the work */
export function workCredit(title: string, own?: Record<string, CreditEdit> | null): WorkCredit | null {
  const k = normTitle(title);
  const mine = own?.[k];
  if (mine) return credit(WORK_CREDITS.get(k)?.title ?? title, mine, "dj");
  return WORK_CREDITS.get(k) ?? null;
}

/** the works these people wrote (composer or lyricist), the given work left out */
export function worksBy(people: readonly string[], except?: string): WorkCredit[] {
  const who = new Set(people.map((p) => normTitle(p)));
  const skip = except ? normTitle(except) : null;
  return [...WORK_CREDITS.entries()]
    .filter(([k, w]) => k !== skip && [...w.composers, ...w.lyricists].some((p) => who.has(normTitle(p))))
    .map(([, w]) => w)
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title));
}

/** one recording as the DNA pages print it */
export interface DnaRecording {
  id: string;
  title: string;
  rhythm: string;
  orchestra: string;
  orchestraId: string;
  singer: string | null;
  singerId: string | null;
  vocal: boolean;
  year: number | null;
  date?: string | null;
  yearApprox?: boolean;
  durationSec?: number;
  durationEstimated?: boolean;
  transcription?: boolean;
  /** Spotify has it / a 30 s preview exists */
  spotify?: boolean;
  preview?: boolean;
  fame?: number;
  /** the side the page is about */
  current?: boolean;
}

export function dnaRecording(s: Song, currentId?: string): DnaRecording {
  return {
    id: s.id,
    title: s.title,
    rhythm: s.rhythm,
    orchestra: s.orchestra,
    orchestraId: s.orchestraId,
    singer: s.singer,
    singerId: s.singerId,
    vocal: s.vocal,
    year: s.year,
    ...(s.date ? { date: s.date } : {}),
    ...(s.yearApprox ? { yearApprox: true } : {}),
    ...(s.durationSec ? { durationSec: s.durationSec } : {}),
    ...(s.durationEstimated ? { durationEstimated: true } : {}),
    ...(s.transcription ? { transcription: true } : {}),
    ...(s.spotify?.uri ? { spotify: true } : {}),
    ...(s.resolved?.previewUrl ? { preview: true } : {}),
    ...(s.fame ? { fame: s.fame } : {}),
    ...(currentId && s.id === currentId ? { current: true } : {}),
  };
}

const byYear = (a: DnaRecording, b: DnaRecording) =>
  (a.year ?? 9999) - (b.year ?? 9999) ||
  (a.date ?? "").localeCompare(b.date ?? "") ||
  a.orchestra.localeCompare(b.orchestra) ||
  a.id.localeCompare(b.id);

export interface SongDna {
  song: DnaRecording;
  work: {
    key: string;
    title: string;
    credit: WorkCredit | null;
    /** recordings of the work in the index */
    count: number;
    orchestras: number;
    firstYear: number | null;
    lastYear: number | null;
  };
  /** every recording of the work, oldest first */
  recordings: DnaRecording[];
  /** the orchestra's other works within two years */
  orchestraAround: DnaRecording[];
  /** the singer's other recordings (any orchestra) within three years */
  singerAround: DnaRecording[];
  /** works by the same composer or lyricist, with how many recordings the index has of each */
  related: Array<{ credit: WorkCredit; recordings: number; songId?: string }>;
  /** the sides a tanda with this one is made of: same orchestra, voice and rhythm, within two years */
  family: { years: [number, number] | null; sides: DnaRecording[] };
  /** reference-set tandas (data/knowledge/reference_sets.json) that hold the work by this orchestra */
  canonical: Array<{
    id: string;
    titles: string[];
    years?: [number, number];
    phase?: string;
    singer?: string | null;
  }>;
}

const ORCH_WINDOW = 2;
const SINGER_WINDOW = 3;
const FAMILY_WINDOW = 2;
const AROUND_MAX = 40;

export function songDna(
  songs: readonly Song[],
  id: string,
  o: { corpus?: ReferenceCorpus; credits?: Record<string, CreditEdit> | null } = {},
): SongDna | null {
  const me = songs.find((s) => s.id === id || s.altIds?.includes(id));
  if (!me) return null;
  const key = normTitle(me.title);
  const rec = (s: Song) => dnaRecording(s, me.id);
  const recordings = songs
    .filter((s) => normTitle(s.title) === key)
    .map(rec)
    .sort(byYear);
  const years = recordings.map((r) => r.year).filter((y): y is number => typeof y === "number");
  const near = (s: Song, w: number) => !!me.year && !!s.year && Math.abs(s.year - me.year) <= w;
  const orchestraAround = songs
    .filter((s) => s.orchestraId === me.orchestraId && normTitle(s.title) !== key && near(s, ORCH_WINDOW))
    .map(rec)
    .sort(byYear)
    .slice(0, AROUND_MAX);
  const singerAround = me.singerId
    ? songs
        .filter((s) => s.singerId === me.singerId && s.id !== me.id && near(s, SINGER_WINDOW))
        .map(rec)
        .sort(byYear)
        .slice(0, AROUND_MAX)
    : [];
  const c = workCredit(me.title, o.credits);
  const counts = new Map<string, { n: number; id: string }>();
  for (const s of songs) {
    const k = normTitle(s.title);
    const e = counts.get(k);
    if (e) e.n++;
    else counts.set(k, { n: 1, id: s.id });
  }
  const related = c
    ? worksBy([...c.composers, ...c.lyricists], me.title).map((w) => {
        const e = counts.get(normTitle(w.title));
        return { credit: w, recordings: e?.n ?? 0, ...(e ? { songId: e.id } : {}) };
      })
    : [];
  const family = me.year
    ? songs
        .filter(
          (s) =>
            s.orchestraId === me.orchestraId &&
            s.rhythm === me.rhythm &&
            s.vocal === me.vocal &&
            (s.singerId ?? null) === (me.singerId ?? null) &&
            !s.transcription &&
            !s.yearApprox &&
            near(s, FAMILY_WINDOW),
        )
        .map(rec)
        .sort(byYear)
    : [];
  const fy = family.map((f) => f.year!).filter(Boolean);
  const canonical = (o.corpus?.canonicalTandas ?? [])
    .filter((t) => t.orchestraId === me.orchestraId && (t.titles ?? []).some((x) => normTitle(x) === key))
    .map((t) => ({
      id: t.id,
      titles: t.titles ?? [],
      years: t.years,
      phase: t.phase,
      singer: t.singer ?? null,
    }));
  return {
    song: rec(me),
    work: {
      key,
      title: c?.title ?? me.title,
      credit: c,
      count: recordings.length,
      orchestras: new Set(recordings.map((r) => r.orchestraId)).size,
      firstYear: years.length ? Math.min(...years) : null,
      lastYear: years.length ? Math.max(...years) : null,
    },
    recordings,
    orchestraAround,
    singerAround,
    related,
    family: { years: fy.length ? [Math.min(...fy), Math.max(...fy)] : null, sides: family },
    canonical,
  };
}

/* ---------- orchestra and singer pages ---------- */

export interface PersonRow {
  id: string | null;
  name: string;
  count: number;
  years: [number, number] | null;
}
export interface WorkRow {
  title: string;
  count: number;
  songId: string;
  years: [number, number] | null;
}
export interface PeopleDna {
  id: string;
  name: string;
  count: number;
  vocal: number;
  instrumental: number;
  years: [number, number] | null;
  byYear: Record<number, number>;
  rhythms: Record<string, number>;
  /** orchestra page: its singers; singer page: the orchestras */
  singers: PersonRow[];
  orchestras: PersonRow[];
  /** the works recorded most often (then the best-known) */
  works: WorkRow[];
  /** the best-known recordings (fame, then year) */
  highlights: DnaRecording[];
}

const span = (ys: number[]): [number, number] | null =>
  ys.length ? [Math.min(...ys), Math.max(...ys)] : null;

function people(rows: readonly Song[], keyOf: (s: Song) => [string | null, string] | null): PersonRow[] {
  const m = new Map<string, { id: string | null; name: string; n: number; ys: number[] }>();
  for (const s of rows) {
    const k = keyOf(s);
    if (!k) continue;
    const id = k[0] ?? k[1];
    const e = m.get(id) ?? { id: k[0], name: k[1], n: 0, ys: [] };
    e.n++;
    if (s.year) e.ys.push(s.year);
    m.set(id, e);
  }
  return [...m.values()]
    .map((e) => ({ id: e.id, name: e.name, count: e.n, years: span(e.ys) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function summary(id: string, name: string, rows: readonly Song[]): PeopleDna {
  const by: Record<number, number> = {};
  const rhythms: Record<string, number> = {};
  for (const s of rows) {
    if (s.year && !s.yearApprox) by[s.year] = (by[s.year] ?? 0) + 1;
    rhythms[s.rhythm] = (rhythms[s.rhythm] ?? 0) + 1;
  }
  const works = new Map<string, { title: string; n: number; id: string; ys: number[]; fame: number }>();
  for (const s of rows) {
    const k = normTitle(s.title);
    const e = works.get(k) ?? { title: s.title, n: 0, id: s.id, ys: [], fame: 0 };
    e.n++;
    if (s.year) e.ys.push(s.year);
    if ((s.fame ?? 0) > e.fame) {
      e.fame = s.fame ?? 0;
      e.id = s.id;
    }
    works.set(k, e);
  }
  return {
    id,
    name,
    count: rows.length,
    vocal: rows.filter((s) => s.vocal).length,
    instrumental: rows.filter((s) => !s.vocal).length,
    years: span(rows.filter((s) => s.year && !s.yearApprox).map((s) => s.year!)),
    byYear: by,
    rhythms,
    singers: people(rows, (s) => (s.singer ? [s.singerId, s.singer] : null)),
    orchestras: people(rows, (s) => [s.orchestraId, s.orchestra]),
    works: [...works.values()]
      .sort((a, b) => b.n - a.n || b.fame - a.fame || a.title.localeCompare(b.title))
      .slice(0, 60)
      .map((e) => ({ title: e.title, count: e.n, songId: e.id, years: span(e.ys) })),
    highlights: rows
      .filter((s) => (s.fame ?? 0) > 0)
      .sort((a, b) => (b.fame ?? 0) - (a.fame ?? 0) || (a.year ?? 9999) - (b.year ?? 9999))
      .slice(0, 24)
      .map((s) => dnaRecording(s)),
  };
}

export function orchestraDna(songs: readonly Song[], orchestraId: string): PeopleDna | null {
  const rows = songs.filter((s) => s.orchestraId === orchestraId);
  return rows.length ? summary(orchestraId, rows[0]!.orchestra, rows) : null;
}

export function singerDna(songs: readonly Song[], singerId: string): PeopleDna | null {
  const rows = songs.filter((s) => s.singerId === singerId);
  return rows.length ? summary(singerId, rows[0]!.singer ?? singerId, rows) : null;
}
