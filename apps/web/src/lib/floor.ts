/**
 * 2026-11 (the owner: "show info useful for dancers — which number the song is in the tanda … on the 2nd song they
 * can start dancing but on the 4th they don't … and it should mirror on other screens") — what the dancers' Floor
 * screen and the Booth's Now playing view show, as one plain value derived from the Booth's plan and clock: the side
 * (orchestra, singer, rhythm, year), its place in the tanda ("Song 2 of 4") and the join-the-floor stage, a cortina's
 * countdown and the next tanda, La Cumparsita. Pure: the Booth publishes it (same window: BroadcastChannel; other
 * devices: the room), the screen only draws it.
 */

export type FloorKind = "song" | "cortina" | "closing" | "opening" | "break" | "idle";
/** song 1 "invite", 2 "a good time to start", 3 "still fine", the last "last song" */
export type FloorStage = "invite" | "start" | "fine" | "last";

export interface FloorState {
  v: 1;
  kind: FloorKind;
  title: string;
  orchestra: string;
  singer: string | null;
  rhythm: string;
  year: number | null;
  /** the song's place in its tanda (0-based) and the tanda's songs; −1 / 0 outside a tanda */
  k: number;
  n: number;
  /** 1-based tanda and how many tonight (0: the opening / closing / a break) */
  tanda: number;
  tandas: number;
  stage: FloorStage | null;
  /** the next tanda (after a cortina, or the tanda after this one) */
  next: { orchestra: string; rhythm: string; singer: string | null } | null;
  /** seconds into the item and its length; `playing` false while paused / held */
  positionSec: number;
  lengthSec: number;
  playing: boolean;
  /** the recording's second the item starts at (its cue in and cut head silence): lyrics and video line up */
  srcStartSec: number;
  /** the song's id (lyrics, video, artwork) */
  songId: string | null;
  /** when the Booth said this (ms since epoch): a viewer carries the position forward */
  at: number;
}

/** the join-the-floor stage of song `k` (0-based) of `n` */
export function floorStage(k: number, n: number): FloorStage | null {
  if (n <= 0 || k < 0) return null;
  if (k >= n - 1) return n === 1 ? "invite" : "last";
  if (k === 0) return "invite";
  if (k === 1) return "start";
  return "fine";
}

type Item = {
  kind: "track" | "cortina" | "closing" | "break";
  id?: string;
  tanda: number;
  n: number;
  title: string;
  artist: string;
  year?: number | null;
  rhythm: string;
  lengthSec: number;
};
type TandaLite = {
  orchestra: string;
  rhythm: string;
  singer: string | null;
  songs?: Array<{ singer?: string | null }>;
};
type Entity =
  | { id?: string; orchestra?: string; singer?: string | null; year?: number | null }
  | null
  | undefined;

export interface BoothLite {
  plan: { items: Item[] } | null;
  planIndex: number;
  playlist: { tandas: TandaLite[] } | null;
  entities: Entity[];
  state: string;
  started: boolean;
  position: number;
  paused?: boolean;
}

/** the Floor state of the Booth now (`now`: ms since epoch, the clock the viewers carry forward from) */
export function floorOf(b: BoothLite, now = Date.now()): FloorState {
  const items = b.plan?.items ?? [];
  const it = items[b.planIndex];
  const tandas = b.playlist?.tandas.length ?? 0;
  const base: FloorState = {
    v: 1,
    kind: "idle",
    title: "",
    orchestra: "",
    singer: null,
    rhythm: "",
    year: null,
    k: -1,
    n: 0,
    tanda: 0,
    tandas,
    stage: null,
    next: null,
    positionSec: 0,
    lengthSec: 0,
    playing: false,
    srcStartSec: 0,
    songId: null,
    at: now,
  };
  if (!it) return base;
  const e = b.entities[b.planIndex];
  const tandaOf = (n: number) => (n > 0 ? b.playlist?.tandas[n - 1] : undefined);
  // the next tanda: after a cortina or a break the one that follows; during a song the one after this tanda
  const nextT =
    it.kind === "track" ? tandaOf(it.tanda + 1) : tandaOf(it.kind === "closing" ? 0 : it.tanda + 1);
  const playing = b.started && (b.state === "playing" || b.state === "cortina") && !b.paused;
  const common = {
    ...base,
    title: it.title,
    rhythm: it.rhythm,
    year: e?.year ?? it.year ?? null,
    positionSec: Math.max(0, Math.min(b.position, it.lengthSec)),
    lengthSec: it.lengthSec,
    playing,
    songId: it.id ?? e?.id ?? null,
    tanda: it.kind === "track" || it.kind === "cortina" ? it.tanda : 0,
    next: nextT ? { orchestra: nextT.orchestra, rhythm: nextT.rhythm, singer: nextT.singer } : null,
  };
  if (!b.started && b.state === "idle") return { ...common, kind: "idle", next: null };
  if (it.kind === "track") {
    const tracks = items.filter((x) => x.kind === "track" && x.tanda === it.tanda);
    const k = tracks.findIndex((x) => x.n === it.n);
    const t = tandaOf(it.tanda);
    return {
      ...common,
      kind: "song",
      orchestra: e?.orchestra ?? t?.orchestra ?? it.artist,
      singer: e && "singer" in e ? (e.singer ?? null) : (t?.singer ?? null),
      k,
      n: tracks.length,
      stage: floorStage(k, tracks.length),
    };
  }
  if (it.kind === "cortina") return { ...common, kind: "cortina", orchestra: it.artist, singer: null };
  if (it.kind === "closing")
    return {
      ...common,
      kind: it.tanda === 0 ? "opening" : "closing",
      orchestra: e?.orchestra ?? it.artist,
      singer: e?.singer ?? null,
      next: it.tanda === 0 ? common.next : null,
    };
  return { ...common, kind: "break" };
}

/** a viewer's position now: the Booth's, carried forward from when it was said while playing */
export function floorPosition(
  f: Pick<FloorState, "positionSec" | "lengthSec" | "playing" | "at">,
  now = Date.now(),
) {
  const p = f.playing ? f.positionSec + Math.max(0, now - f.at) / 1000 : f.positionSec;
  return Math.max(0, Math.min(f.lengthSec || p, p));
}

/** seconds left in a cortina (the next tanda starts after it) */
export const floorRemaining = (f: FloorState, now = Date.now()) =>
  Math.max(0, Math.round((f.lengthSec || 0) - floorPosition(f, now)));

/** a FloorState from another device (the room): only what the screen draws, bounded */
export function cleanFloor(x: unknown): FloorState | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const s = (v: unknown, n = 120) => (typeof v === "string" ? v.slice(0, n) : "");
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const kinds: FloorKind[] = ["song", "cortina", "closing", "opening", "break", "idle"];
  const stages: FloorStage[] = ["invite", "start", "fine", "last"];
  const kind = kinds.includes(o.kind as FloorKind) ? (o.kind as FloorKind) : null;
  if (!kind) return null;
  const nx = o.next && typeof o.next === "object" ? (o.next as Record<string, unknown>) : null;
  return {
    v: 1,
    kind,
    title: s(o.title),
    orchestra: s(o.orchestra),
    singer: typeof o.singer === "string" ? s(o.singer) : null,
    rhythm: s(o.rhythm, 20),
    year: typeof o.year === "number" ? Math.round(o.year) : null,
    k: Math.round(num(o.k, -1)),
    n: Math.max(0, Math.min(12, Math.round(num(o.n)))),
    tanda: Math.max(0, Math.round(num(o.tanda))),
    tandas: Math.max(0, Math.round(num(o.tandas))),
    stage: stages.includes(o.stage as FloorStage) ? (o.stage as FloorStage) : null,
    next: nx
      ? {
          orchestra: s(nx.orchestra),
          rhythm: s(nx.rhythm, 20),
          singer: typeof nx.singer === "string" ? s(nx.singer) : null,
        }
      : null,
    positionSec: Math.max(0, num(o.positionSec)),
    lengthSec: Math.max(0, num(o.lengthSec)),
    playing: o.playing === true,
    srcStartSec: Math.max(0, num(o.srcStartSec)),
    songId: typeof o.songId === "string" && /^[\w:-]{1,80}$/.test(o.songId) ? o.songId : null,
    at: num(o.at, Date.now()),
  };
}

/* ---------------- the beat: measured, else estimated ---------------- */

/** a tango's, a vals's and a milonga's usual tempo (beats per minute) when nothing better is known */
export const TYPICAL_BPM: Record<string, number> = { tango: 120, vals: 180, milonga: 176 };

/** the tempo from tapped beats (ms): the median interval of the last ones; null with fewer than 4 taps */
export function tapTempo(times: readonly number[]): number | null {
  const xs = times.slice(-9);
  if (xs.length < 4) return null;
  const d = xs
    .slice(1)
    .map((t, i) => t - xs[i]!)
    .filter((v) => v > 150 && v < 2000)
    .sort((a, b) => a - b);
  if (d.length < 3) return null;
  const mid = d[Math.floor(d.length / 2)]!;
  return Math.round((60000 / mid) * 10) / 10;
}

/**
 * What the beat animation and the rhythm lane run on: the DJ's or the file's measured downbeat and tempo (`locked`);
 * else an estimate — the catalogue's (or the clip's measured) BPM, else the rhythm's typical tempo — phase-aligned to
 * the music's start (the measured start, else the head silence the Booth cuts).
 */
export function beatSource(o: {
  marks?: { bpm?: number; downbeatSec?: number; musicStartSec?: number } | null;
  bpm?: number | null;
  rhythm: string;
  headSec?: number | null;
}): { bpm: number; downbeatSec: number; locked: boolean; typical: boolean } {
  const m = o.marks ?? {};
  if (m.bpm && m.downbeatSec !== undefined)
    return { bpm: m.bpm, downbeatSec: m.downbeatSec, locked: true, typical: false };
  const known = m.bpm ?? o.bpm ?? null;
  const bpm = known && known > 30 && known < 260 ? known : (TYPICAL_BPM[o.rhythm] ?? 120);
  const downbeatSec = m.downbeatSec ?? m.musicStartSec ?? Math.max(0, o.headSec ?? 0);
  return { bpm, downbeatSec, locked: false, typical: !known };
}

/** where in the beat `sec` falls: the beat's number in its bar (1-based), and 0…1 since it sounded */
export function beatPhase(sec: number, bpm: number, downbeatSec: number, beatsPerBar: number) {
  const p = 60 / bpm;
  const k = Math.floor((sec - downbeatSec) / p);
  const since = (sec - downbeatSec - k * p) / p;
  const beat = (((k % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1;
  return { beat, since, bar: Math.floor(k / beatsPerBar) + 1, before: sec < downbeatSec };
}
