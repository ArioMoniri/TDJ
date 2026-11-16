import {
  type BoothPlanItem,
  type PlannedTransition,
  resolveTransition,
  type SilenceMode,
  silenceJoin,
  type TransitionEdit,
} from "@tdj/core";
import type { AudioParamLike } from "./engine";
import {
  applyEqPoints,
  applyIncoming,
  applyOutgoing,
  BASS_SHELF_HZ,
  curveAt,
  eqLanes,
  HIGH_SHELF_HZ,
  MID_PEAK_HZ,
  type TransitionWindow,
  transitionWindow,
} from "./transition";

/**
 * Hear a transition before the night uses it (wave 4; rebuilt 2026-11 after the owner: "the transition guide doesn't
 * really play the part of the transition between those songs"). The audition is the last N seconds of the outgoing
 * side (5–15, the DJ's choice) into the first seconds of the incoming one, exactly as the night will play it: the
 * same start points (a cue in, a cortina's start, the silent head the join cuts), the same end (a stop cue, the
 * silent tail the join cuts), the same gap, fades, overlap and EQ.
 *
 * Why the old audition did not (2026-11 trace): it took each side's plan length from second 0 of its audio (so the
 * outgoing "ended" where the plan's cuts had shortened it, a head cut early), ignored the join's silence (the gap
 * fell back to the night's setting whenever the plan's gap was 0, and the cuts were never applied), always ran 8 s,
 * and on a Spotify night it mixed two 30 s clips from the middle of the songs (or a side of silence) without saying
 * so — nothing of the real ending. Now:
 * - files: the real files, rendered with Web Audio from the computed schedule (`planAudition`, `renderTransition`);
 * - 30 s clips: the clips, said plainly ("clip: not the real ending");
 * - Spotify in this browser (Web Playback SDK): the real recordings on the SDK player — the outgoing seeked to
 *   (its end − N), played, faded with volume steps, then the incoming played from its start at the gap
 *   (`spotifyAuditionSteps`, `runAuditionSteps`);
 * - Spotify Connect: the same on the device, without fades (the device cannot; said so).
 *
 * Everything here is pure or takes its I/O as arguments (vitest: lib/booth/audition.test.ts).
 */

/** The audition's lead: seconds of the outgoing before its end (the DJ picks 5–15 s; ••• → Audition length). */
export const AUDITION_LEAD = { min: 5, max: 15, def: 8 } as const;
export const AUDITION_LEAD_CHOICES = [5, 6, 8, 10, 12, 15] as const;
export const clampLead = (s: number | null | undefined) =>
  Math.round(
    Math.min(
      AUDITION_LEAD.max,
      Math.max(AUDITION_LEAD.min, Number.isFinite(s) ? (s as number) : AUDITION_LEAD.def),
    ),
  );
const LEAD_KEY = "tdj-audition-lead";
/** this device's audition length (localStorage; per-viewer convenience) */
export function loadLead(): number {
  try {
    const v = Number(localStorage.getItem(LEAD_KEY));
    return v ? clampLead(v) : AUDITION_LEAD.def;
  } catch {
    return AUDITION_LEAD.def;
  }
}
export function saveLead(sec: number) {
  try {
    localStorage.setItem(LEAD_KEY, String(clampLead(sec)));
  } catch {}
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** What a side's audio is in the audition: the recording itself (a file, Spotify) or a 30 s clip from its middle. */
export type AuditionMedia =
  | { kind: "recording"; durationSec?: number }
  | { kind: "clip"; durationSec: number };

/** A plan row's fields the audition reads. */
export type AuditionRow = Pick<
  BoothPlanItem,
  | "kind"
  | "lengthSec"
  | "tanda"
  | "trimInSec"
  | "stopSec"
  | "cued"
  | "headCutSec"
  | "tailCutSec"
  | "headSilenceSec"
  | "tailSilenceSec"
  | "fadeOutSec"
>;

/** Where a side plays in its own audio tonight: from `srcStart` to `srcEnd` (seconds into the recording / clip). */
export interface SideSpan {
  srcStart: number;
  srcEnd: number;
}

export interface AuditionSchedule {
  leadSec: number;
  /** the editor's axis (seconds relative to the outgoing's end) at the audition's start and end */
  axisFrom: number;
  axisTo: number;
  totalSec: number;
  /** the outgoing: from `srcFrom` in its audio, at 0 on the audition's clock, for `durSec` */
  out: { srcFrom: number; durSec: number };
  /** the incoming: from `srcFrom` in its audio, at `at` on the audition's clock, for `durSec` */
  in: { srcFrom: number; at: number; durSec: number };
  /** the silence between them (0 for an overlap) */
  gapSec: number;
  /** the fades on the audition's clock (null: none) */
  fadeOut: { at: number; len: number; curve: PlannedTransition["curveOut"] } | null;
  fadeIn: { at: number; len: number; curve: PlannedTransition["curveIn"] } | null;
  window: TransitionWindow;
  /** the transition as resolved (null: Auto, the night's gap and song end fade) */
  tr: PlannedTransition | null;
  /** the join's silence as it plays: what is cut off the outgoing's tail and the incoming's head */
  tailCutSec: number;
  headCutSec: number;
  /** an overlap Spotify cannot play (one track at a time): it plays as Auto, as the night would */
  overlapDropped: boolean;
}

/**
 * The audition of the transition from `a` into `b` as the night will play it. `media` says what each side's audio is
 * (a recording, with the file's own length when known, or a clip). `external`: Spotify plays one of the sides, so
 * an overlap becomes the night's Auto (the engine's `effectiveTransition`).
 */
export function planAudition(o: {
  a: AuditionRow;
  b: AuditionRow;
  edit: TransitionEdit | null;
  /** the night's gap after `a` before any silence (the tanda's override, else Settings) */
  nightGapSec: number;
  songFadeOutSec: number;
  cortinaFadeOutSec: number;
  silenceMode: SilenceMode;
  leadSec: number;
  media: { out: AuditionMedia; in: AuditionMedia };
  external?: boolean;
}): AuditionSchedule {
  const { a, b } = o;
  const ctx = {
    from: { kind: a.kind, lengthSec: a.lengthSec, tanda: a.tanda },
    to: { kind: b.kind, lengthSec: b.lengthSec, tanda: b.tanda },
    cortinaFadeOutSec: a.kind === "cortina" ? (a.fadeOutSec ?? o.cortinaFadeOutSec) : undefined,
  };
  let tr = o.edit ? resolveTransition(o.edit, ctx) : null;
  const overlapDropped = !!(o.external && tr && tr.overlapSec > 0);
  if (overlapDropped) tr = null;
  // the join's silence: the transition's own mode (a template's) or the night's
  const overlap = !!tr && tr.overlapSec > 0;
  const tailSil = a.kind === "cortina" ? 0 : (a.tailSilenceSec ?? 0);
  const headSil = b.headSilenceSec ?? 0;
  const faded = tr
    ? tr.overlapSec > 0 || tr.fadeOutSec > 0 || tr.fadeInSec > 0
    : a.kind !== "cortina" && o.songFadeOutSec > 0;
  const j = silenceJoin(tr?.silence ?? o.silenceMode, {
    gapSec: overlap ? 0 : tr ? tr.gapSec : o.nightGapSec,
    tailSec: tailSil,
    headSec: headSil,
    faded,
  });
  const clipOut = o.media.out.kind === "clip";
  const clipIn = o.media.in.kind === "clip";
  const tailCut = clipOut ? 0 : j.tailCutSec;
  const headCut = clipIn ? 0 : j.headCutSec;
  const sa = sideSpan(a, o.media.out, { tailCutSec: tailCut });
  const sb = sideSpan(b, o.media.in, { headCutSec: headCut });
  const outLen = Math.max(0.5, sa.srcEnd - sa.srcStart);
  const inLen = Math.max(0.5, sb.srcEnd - sb.srcStart);
  let w = transitionWindow(tr, {
    outLen,
    inLen,
    gapSec: o.nightGapSec,
    songFadeOutSec: o.songFadeOutSec,
    outKind: a.kind,
    cortinaFadeOutSec: a.fadeOutSec ?? o.cortinaFadeOutSec,
  });
  // no overlap: the incoming comes in after the silence the join leaves (the engine's joinAfterTail), clips aside
  const gap = clipOut || clipIn ? w.gapSec : j.gapSec;
  if (w.overlapSec === 0 && gap !== w.inStart) {
    const shift = gap - w.inStart;
    w = {
      ...w,
      inStart: gap,
      inFade: { ...w.inFade, start: w.inFade.start + shift },
      box: { ...w.box, end: w.box.end + shift },
      gapSec: gap,
    };
  }
  const lead = clampLead(o.leadSec);
  const begins = Math.min(w.outFade.len > 0 ? w.outFade.start : 0, w.inStart, 0);
  const axisFrom = r3(Math.max(-outLen, Math.min(-lead, begins)));
  const outStop = Math.min(0, w.outStop);
  const inAfter = Math.max(w.inStart + w.inFade.len + 1, Math.max(0, w.inStart) + lead);
  const axisTo = r3(Math.min(w.inStart + inLen, inAfter));
  const fo =
    w.outFade.len > 0
      ? { at: r3(Math.max(0, w.outFade.start - axisFrom)), len: w.outFade.len, curve: w.curveOut }
      : null;
  const fi = w.inFade.len > 0 ? { at: r3(w.inStart - axisFrom), len: w.inFade.len, curve: w.curveIn } : null;
  return {
    leadSec: lead,
    axisFrom,
    axisTo,
    totalSec: r3(axisTo - axisFrom),
    out: { srcFrom: r3(sa.srcEnd + axisFrom), durSec: r3(Math.max(0.01, outStop - axisFrom)) },
    in: {
      srcFrom: r3(sb.srcStart),
      at: r3(w.inStart - axisFrom),
      durSec: r3(Math.max(0.01, axisTo - w.inStart)),
    },
    gapSec: w.overlapSec > 0 ? 0 : r3(Math.max(0, w.inStart - outStop)),
    fadeOut: fo,
    fadeIn: fi,
    window: w,
    tr,
    tailCutSec: tailCut,
    headCutSec: headCut,
    overlapDropped,
  };
}

/**
 * Where a side plays in its own audio: a clip from its start to its end (a clip is the middle of the song); a
 * recording from its start point (a cortina's start or a cue in, plus the silent head the join cuts) to its end (the
 * file's end or a stop cue, less the silent tail the join cuts). `headCutSec` / `tailCutSec` default to the plan's.
 */
export function sideSpan(
  r: AuditionRow,
  media: AuditionMedia,
  cuts: { headCutSec?: number; tailCutSec?: number } = {},
): SideSpan {
  if (media.kind === "clip") return { srcStart: 0, srcEnd: r3(media.durationSec) };
  const pinned = r.kind === "cortina" || !!r.cued;
  const trim = pinned ? (r.trimInSec ?? 0) : 0;
  const planHead = r.headCutSec ?? 0;
  const planTail = r.tailCutSec ?? 0;
  const head = cuts.headCutSec ?? planHead;
  const tail = cuts.tailCutSec ?? planTail;
  // the side's natural end: a stop cue or a cortina's stop second, else the file's end, else the plan's length
  const natural =
    pinned && r.stopSec !== undefined
      ? r.stopSec
      : !pinned && media.durationSec
        ? media.durationSec
        : trim + planHead + r.lengthSec + planTail;
  const end = Math.min(media.durationSec ?? Number.POSITIVE_INFINITY, natural) - tail;
  const start = trim + head;
  return { srcStart: r3(start), srcEnd: r3(Math.max(start + 0.5, end)) };
}

/** The side being heard at `t` seconds into the audition: the outgoing, the gap, the incoming, or both (overlap). */
export function hearingAt(s: AuditionSchedule, t: number): "out" | "gap" | "in" | "both" | "end" {
  if (t >= s.totalSec) return "end";
  const out = t < s.out.durSec;
  const inn = t >= s.in.at;
  return out && inn ? "both" : out ? "out" : inn ? "in" : "gap";
}

/* ---------- Web Audio: files and clips ---------- */

export interface AuditionSide {
  buffer: AudioBuffer;
  /** its gain (normalisation, a cortina's level) */
  gain: number;
}

/** Render the scheduled transition into one buffer (stereo, 44.1 kHz) with the engine's curves and EQ. */
export async function renderTransition(
  Off: typeof OfflineAudioContext,
  o: { out: AuditionSide; in: AuditionSide; schedule: AuditionSchedule },
): Promise<AudioBuffer> {
  const rate = 44100;
  const s = o.schedule;
  const ctx = new Off(2, Math.max(1, Math.ceil(s.totalSec * rate)), rate);
  const w = s.window;
  const lane = (side: AuditionSide) => {
    const src = ctx.createBufferSource();
    src.buffer = side.buffer;
    const low = ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = BASS_SHELF_HZ;
    low.gain.value = 0;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = MID_PEAK_HZ;
    mid.gain.value = 0;
    const high = ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = HIGH_SHELF_HZ;
    high.gain.value = 0;
    const g = ctx.createGain();
    src.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(g);
    g.connect(ctx.destination);
    return { src, low, mid, high, g };
  };
  // the outgoing's end (the axis' 0) on the audition's clock
  const outEnd = -s.axisFrom;
  const a = lane(o.out);
  a.g.gain.setValueAtTime(o.out.gain, 0);
  applyOutgoing(a.g.gain as unknown as AudioParamLike, {
    endsAt: outEnd,
    base: o.out.gain,
    window: w,
    curve: w.curveOut,
    now: 0,
    notBefore: 0.01,
  });
  a.src.start(0, Math.max(0, s.out.srcFrom), s.out.durSec);
  const b = lane(o.in);
  applyIncoming(b.g.gain as unknown as AudioParamLike, {
    when: s.in.at,
    base: o.in.gain,
    window: w,
    curve: w.curveIn,
  });
  // a short fade at the audition's end (never a click)
  const tailAt = s.in.at + s.in.durSec;
  b.g.gain.setValueAtTime(o.in.gain, Math.max(s.in.at + w.inFade.len, tailAt - 0.4));
  b.g.gain.linearRampToValueAtTime(0, tailAt);
  b.src.start(s.in.at, Math.max(0, s.in.srcFrom), s.in.durSec);
  const eq = eqLanes(w);
  if (eq) {
    const P = (f: BiquadFilterNode) => f.gain as unknown as AudioParamLike;
    applyEqPoints(P(a.low), eq.out.low, outEnd);
    applyEqPoints(P(a.mid), eq.out.mid, outEnd);
    applyEqPoints(P(a.high), eq.out.high, outEnd);
    applyEqPoints(P(b.low), eq.in.low, outEnd);
    applyEqPoints(P(b.mid), eq.in.mid, outEnd);
    applyEqPoints(P(b.high), eq.in.high, outEnd);
  }
  return ctx.startRendering();
}

/* ---------- Spotify: the real recordings on the player ---------- */

export type AuditionStep =
  | { at: number; op: "play"; uri: string; positionMs: number; side: "out" | "in" }
  | { at: number; op: "seek"; positionMs: number }
  | { at: number; op: "volume"; level: number }
  | { at: number; op: "pause" };

/** The SDK's volume steps: one every 50 ms (the night's own fades use the same rate). */
export const STEP_SEC = 0.05;

/**
 * The Spotify audition as timed steps (seconds on the audition's clock; 0 = the outgoing plays from its seek point):
 * play the outgoing and seek it to (its end − N); its fade out as volume steps (`fades`: the SDK; a Connect device
 * cannot); pause at its end when a gap follows; at the gap play the incoming from its start point (its rise as
 * volume steps); pause at the audition's end and put the volume back.
 */
export function spotifyAuditionSteps(
  s: AuditionSchedule,
  o: { uriOut: string; uriIn: string; fades: boolean },
): AuditionStep[] {
  const steps: AuditionStep[] = [];
  const ms = (sec: number) => Math.max(0, Math.round(sec * 1000));
  if (o.fades) steps.push({ at: 0, op: "volume", level: 1 });
  steps.push({ at: 0, op: "play", uri: o.uriOut, positionMs: ms(s.out.srcFrom), side: "out" });
  steps.push({ at: 0, op: "seek", positionMs: ms(s.out.srcFrom) });
  const ramp = (f: { at: number; len: number; curve: PlannedTransition["curveOut"] }, dir: "in" | "out") => {
    const n = Math.max(1, Math.round(f.len / STEP_SEC));
    for (let k = 1; k <= n; k++)
      steps.push({
        at: r3(f.at + (f.len * k) / n),
        op: "volume",
        level: Math.round(curveAt(f.curve, dir, k / n) * 1000) / 1000,
      });
  };
  if (o.fades && s.fadeOut) ramp(s.fadeOut, "out");
  // the outgoing stops at its end (or its fade's end); the gap is silence
  if (s.in.at > s.out.durSec) steps.push({ at: r3(s.out.durSec), op: "pause" });
  if (o.fades) steps.push({ at: r3(s.in.at), op: "volume", level: s.fadeIn ? 0 : 1 });
  steps.push({ at: r3(s.in.at), op: "play", uri: o.uriIn, positionMs: ms(s.in.srcFrom), side: "in" });
  if (o.fades && s.fadeIn) ramp(s.fadeIn, "in");
  steps.push({ at: r3(s.totalSec), op: "pause" });
  if (o.fades) steps.push({ at: r3(s.totalSec), op: "volume", level: 1 });
  // stable by time (a play at the same moment as a volume step keeps its place)
  return steps
    .map((x, k) => ({ x, k }))
    .sort((p, q) => p.x.at - q.x.at || p.k - q.k)
    .map((p) => p.x);
}

/** What runs the steps: the SDK player in this browser or the night's Connect device. */
export interface AuditionIO {
  play(uri: string, positionMs: number): Promise<void>;
  seek(positionMs: number): Promise<void>;
  /** 0…1 of the side's level */
  volume(level: number): void | Promise<void>;
  pause(): Promise<void>;
}

/**
 * Run the steps in time. The clock starts once the outgoing plays from its seek point (`onStart(t0)`: the playhead
 * follows it); every later step waits for its moment. Stop (`signal`) pauses and puts the volume back.
 */
export async function runAuditionSteps(
  steps: AuditionStep[],
  io: AuditionIO,
  o: {
    signal?: AbortSignal;
    now?: () => number;
    wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
    onStart?: (t0: number) => void;
    onSide?: (side: "out" | "in") => void;
  } = {},
): Promise<"done" | "stopped"> {
  const now = o.now ?? (() => Date.now());
  const wait =
    o.wait ??
    ((ms: number, signal?: AbortSignal) =>
      new Promise<void>((res) => {
        const t = setTimeout(res, Math.max(0, ms));
        signal?.addEventListener("abort", () => {
          clearTimeout(t);
          res();
        });
      }));
  const run = async (s: AuditionStep) => {
    if (s.op === "play") {
      o.onSide?.(s.side);
      await io.play(s.uri, s.positionMs);
    } else if (s.op === "seek") await io.seek(s.positionMs);
    else if (s.op === "volume") void Promise.resolve(io.volume(s.level)).catch(() => {});
    else await io.pause();
  };
  const stopped = async () => {
    await io.pause().catch(() => {});
    void Promise.resolve(io.volume(1)).catch(() => {});
    return "stopped" as const;
  };
  let k = 0;
  // the start: everything at 0 in order (volume, play, seek); the clock starts when the outgoing plays
  while (k < steps.length && steps[k]!.at === 0) {
    if (o.signal?.aborted) return stopped();
    await run(steps[k]!);
    k++;
  }
  const t0 = now();
  o.onStart?.(t0);
  for (; k < steps.length; k++) {
    const s = steps[k]!;
    const due = t0 + s.at * 1000 - now();
    if (due > 0) await wait(due, o.signal);
    if (o.signal?.aborted) return stopped();
    await run(s);
  }
  return "done";
}

/** 16-bit PCM WAV of a rendered buffer (what the pre-listen <audio> element plays). */
export function encodeWav(
  b: Pick<AudioBuffer, "numberOfChannels" | "sampleRate" | "length" | "getChannelData">,
): Blob {
  const ch = Math.max(1, b.numberOfChannels);
  const n = b.length;
  const bytes = 44 + n * ch * 2;
  const v = new DataView(new ArrayBuffer(bytes));
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, b.sampleRate, true);
  v.setUint32(28, b.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, n * ch * 2, true);
  const data = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c]![i]!));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  return new Blob([v.buffer], { type: "audio/wav" });
}
