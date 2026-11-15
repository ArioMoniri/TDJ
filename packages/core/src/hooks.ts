/**
 * 2026-11: where a cortina starts. A cortina must be told from tango at once, so it plays from its most recognisable
 * part — the chorus (the most-repeated block of synced lyrics), else the first vocal line after a long intro — not
 * from the intro. The data lives in `data/cache/cortina_hooks.json` (scripts/cortina_hooks.ts, LRCLIB synced lyrics);
 * the DJ can set or adjust a cortina's start in the Booth (`CortinaEdit.startSec`), and Settings → Cortinas turns the
 * chorus start off (every cortina then plays from 0). Pure: no I/O here.
 */
import type { Cortina } from "./types";

/** the hook starts this long before the chorus's first sung line, so its first word is never clipped */
export const CORTINA_HOOK_LEAD_SEC = 1;
/** an intro longer than this is skipped when the song has no chorus */
export const CORTINA_LONG_INTRO_SEC = 8;

export type HookKind = "chorus" | "first-vocal" | "intro-short" | "energy" | "manual";
export type HookSource = "lyrics" | "audio" | "manual" | "none";

export interface PickedHook {
  /** seconds into the recording where the cortina starts */
  startSec: number;
  kind: Exclude<HookKind, "manual">;
  /** 0..1: how sure the start is the recognisable part */
  confidence: number;
  /** the sung line at the start (lyrics) */
  line?: string;
  /** how often the chorus block comes back (chorus only) */
  repeats?: number;
}

/** One cortina's committed hook (data/cache/cortina_hooks.json). */
export interface CortinaHook {
  startSec: number;
  source: HookSource;
  kind?: HookKind;
  confidence: number;
  line?: string;
  repeats?: number;
  /** the recording length the hook was found on (s) */
  durationSec?: number;
  /** what was matched (LRCLIB id, artist – title, duration) */
  matched?: string;
  note?: string;
}
export type CortinaHookFile = { version?: number; generatedAt?: string; hooks: Record<string, CortinaHook> };

export interface LyricRow {
  t: number;
  text: string;
}

/** `[mm:ss.xx] text` lines, sorted by time; a line without text is kept (an instrumental break). */
export function parseSyncedLyrics(lrc: string | null | undefined): LyricRow[] {
  const out: LyricRow[] = [];
  for (const raw of (lrc ?? "").split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of tags) {
      const t = Number(m[1]) * 60 + Number(m[2]!.replace(":", "."));
      if (Number.isFinite(t)) out.push({ t, text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** lower case, no accents, no punctuation: two sung lines that only differ in those are the same line */
export function normLyric(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * The cortina's start from synced lyrics: the chorus — the most-repeated block of ≥ 2 consecutive lines (more
 * repeats first, then the longer block, then the earlier) — at its first occurrence minus `CORTINA_HOOK_LEAD_SEC`.
 * With `durationSec` and `lengthSec`, a chorus whose first occurrence leaves less than the play length is passed
 * over. No chorus: the first vocal line after an intro longer than 8 s; a shorter intro plays from 0. Null when
 * the text has no timestamps or no sung line.
 */
export function pickHook(
  lrc: string | null | undefined,
  o: { durationSec?: number; lengthSec?: number } = {},
): PickedHook | null {
  const rows = parseSyncedLyrics(lrc)
    .map((r) => ({ ...r, n: normLyric(r.text) }))
    .filter((r) => r.n.length > 0);
  if (!rows.length) return null;
  const fits = (start: number) =>
    !o.durationSec || !o.lengthSec || start + o.lengthSec <= o.durationSec + 1e-9;
  type Cand = { key: string; k: number; count: number; first: number };
  const cands: Cand[] = [];
  for (let k = 2; k <= 4; k++) {
    const seen = new Map<string, { count: number; first: number; lastEnd: number }>();
    for (let i = 0; i + k <= rows.length; i++) {
      const lines = rows.slice(i, i + k).map((r) => r.n);
      // a block of one line said k times is a refrain word, not a chorus
      if (new Set(lines).size < 2) continue;
      const key = lines.join("\n");
      const s = seen.get(key);
      if (!s) seen.set(key, { count: 1, first: i, lastEnd: i + k });
      else if (i >= s.lastEnd) {
        s.count++;
        s.lastEnd = i + k;
      }
    }
    for (const [key, s] of seen) if (s.count >= 2) cands.push({ key, k, count: s.count, first: s.first });
  }
  cands.sort((a, b) => b.count - a.count || b.k - a.k || a.first - b.first);
  for (const c of cands) {
    const start = round1(Math.max(0, rows[c.first]!.t - CORTINA_HOOK_LEAD_SEC));
    if (!fits(start)) continue;
    return {
      startSec: start,
      kind: "chorus",
      confidence: Math.min(0.9, 0.6 + 0.1 * Math.min(3, c.count - 1)),
      line: rows[c.first]!.text,
      repeats: c.count,
    };
  }
  const first = rows[0]!;
  if (first.t <= CORTINA_LONG_INTRO_SEC)
    return { startSec: 0, kind: "intro-short", confidence: 0.4, line: first.text };
  const start = round1(Math.max(0, first.t - CORTINA_HOOK_LEAD_SEC));
  if (!fits(start)) return { startSec: 0, kind: "intro-short", confidence: 0.3, line: first.text };
  return { startSec: start, kind: "first-vocal", confidence: 0.5, line: first.text };
}

/**
 * The audio fallback over a full recording's loudness envelope (one value per `hopSec`): the first sustained rise
 * (≥ 4 s) to the loud part (85 % of the 90th percentile, smoothed over 2 s) after the intro, minus the lead. Null for
 * a track without a clear loud part. A Deezer 30 s preview is not a full recording (it is cut from the song's
 * highlight at an offset Deezer does not publish), so it can only be a hint, never a start.
 */
export function energyHook(env: number[], hopSec: number): PickedHook | null {
  if (env.length < 8 || !(hopSec > 0)) return null;
  const w = Math.max(1, Math.round(2 / hopSec));
  const sm = env.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - (w >> 1)); j < Math.min(env.length, i + w - (w >> 1)); j++) {
      s += env[j]!;
      n++;
    }
    return s / n;
  });
  const sorted = [...env].sort((a, b) => a - b);
  const pct = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  const p90 = pct(0.9);
  const p10 = pct(0.1);
  if (!(p90 > 0) || p90 - p10 < 0.25 * p90) return null;
  const thr = 0.85 * p90;
  const hold = Math.max(1, Math.round(4 / hopSec));
  for (let i = 0; i + hold <= sm.length; i++) {
    if (sm[i]! < thr) continue;
    let ok = true;
    for (let j = i; j < i + hold; j++) if (sm[j]! < thr * 0.9) ok = false;
    if (!ok) continue;
    const t = i * hopSec;
    if (t <= CORTINA_LONG_INTRO_SEC) return null;
    return { startSec: round1(Math.max(0, t - CORTINA_HOOK_LEAD_SEC)), kind: "energy", confidence: 0.45 };
  }
  return null;
}

/**
 * The validated start: ≥ 0, and start + length ≤ duration (a start too late is pulled back so the cortina ends at
 * the track's end; a track shorter than the length plays from 0). Unknown duration: the start as given.
 */
export function validCortinaStart(
  startSec: number | null | undefined,
  lengthSec: number,
  durationSec: number | null | undefined,
): number {
  const s = Number(startSec);
  let v = Number.isFinite(s) && s > 0 ? s : 0;
  const d = Number(durationSec);
  if (Number.isFinite(d) && d > 0) {
    if (d <= lengthSec) return 0;
    v = Math.min(v, d - lengthSec);
  }
  return round1(Math.max(0, v));
}

/** The recording length a cortina plays from (Spotify's, else Deezer's), seconds; undefined when unknown. */
export function cortinaDurationSec(
  c: Pick<Cortina, "spotify" | "resolved"> & { hook?: CortinaHook | null },
): number | undefined {
  const ms = c.spotify?.durationMs ?? c.resolved?.durationMs;
  if (typeof ms === "number" && ms > 0) return ms / 1000;
  const h = c.hook?.durationSec;
  return typeof h === "number" && h > 0 ? h : undefined;
}

/** "0:42" */
export function clockLabel(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Compose output (Settings → Cortinas → "Start cortinas at the chorus", on by default): every cortina of the night
 * starts at its validated hook when on, at 0 when off. The night's cortina length is the play length.
 */
export function withCortinaStarts<P extends { tandas: Array<{ cortina: Cortina | null }> }>(
  p: P,
  on: boolean,
  fallbackLengthSec = 45,
): P {
  let changed = false;
  const tandas = p.tandas.map((t) => {
    const c = t.cortina;
    if (!c) return t;
    const len = c.lengthSec ?? fallbackLengthSec;
    const want = !on ? 0 : c.hook && c.hook.source !== "none" ? c.hook.startSec : (c.startSec ?? 0);
    const startSec = on ? validCortinaStart(want, len, cortinaDurationSec(c)) : 0;
    if (startSec === c.startSec) return t;
    changed = true;
    return { ...t, cortina: { ...c, startSec } };
  });
  return changed ? { ...p, tandas } : p;
}
