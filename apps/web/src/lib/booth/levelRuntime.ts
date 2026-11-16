"use client";
import { create } from "zustand";
import {
  AUTO_DEFAULTS,
  type AutoConfig,
  type AutoHold,
  AutoMaster,
  type AutoPath,
  appliedBoost,
  autoConfig,
  autoHold,
  autoPath,
  calibrationOffset,
  RoomEstimator,
} from "./autoMaster";
import type { BoothEngine } from "./engine";
import {
  frameStats,
  K_HIGHPASS,
  K_SHELF,
  LevelMeter,
  type MeterReading,
  type NormalisationPath,
  normalisationPath,
  SILENT_READING,
  type SongLoudness,
  songLoudness,
} from "./level";
import { boothEngine, roomCaps, useBooth } from "./store";

/**
 * 2026-11 — the level meter, the per-song loudness the Booth shows, the room meter and Auto master at runtime. The
 * math is in level.ts and autoMaster.ts; this module owns the audio taps and the loops, and keeps its own small
 * store (`useLevels`) so the booth store and the engine only gained `setAutoDb`.
 *
 * - The meter taps the engine's master (after the DJ's fader, before the speakers): a channel splitter into two raw
 *   analysers (sample peak) and the K-weighting biquads into two more (loudness). Nothing it adds reaches the
 *   output. Spotify and YouTube play outside the page's audio graph: no meter, the side's known loudness instead.
 * - The room meter listens through the microphone only after the DJ switches it on (the browser asks). Its audio
 *   goes to an analyser and nowhere else: never recorded, never sent, never played. Off, the tracks are stopped.
 */

export type LiveSource = "graph" | "spotify" | "youtube" | "idle";
export type RoomStatus = "off" | "asking" | "on" | "denied" | "unsupported";

interface LevelState {
  reading: MeterReading;
  live: LiveSource;
  /** the playing side's loudness (measured, cached or the catalogue's) */
  song: SongLoudness | null;
  norm: NormalisationPath;
  room: { status: RoomStatus; levelDb: number | null; noiseDb: number | null; calOffset: number | null };
  auto: { enabled: boolean; db: number; hold: AutoHold | null; path: AutoPath };
  cfg: AutoConfig;
}

const PREFS_KEY = "tdj-booth-room";
const CACHE_KEY = "tdj-booth-loudness";
function loadPrefs(): { cfg: AutoConfig; calOffset: number | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as {
      cfg?: Partial<AutoConfig>;
      calOffset?: number | null;
    } | null;
    return {
      cfg: autoConfig(raw?.cfg),
      calOffset: typeof raw?.calOffset === "number" && Number.isFinite(raw.calOffset) ? raw.calOffset : null,
    };
  } catch {
    return { cfg: { ...AUTO_DEFAULTS }, calOffset: null };
  }
}
function savePrefs() {
  try {
    const s = useLevels.getState();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ cfg: s.cfg, calOffset: s.room.calOffset }));
  } catch {}
}
/** per-side loudness measured from a file or a 30 s clip, kept for the nights that play the side from Spotify */
let cache: Record<string, SongLoudness> | null = null;
function loudnessCache(): Record<string, SongLoudness> {
  if (cache) return cache;
  try {
    cache = (JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}") as Record<string, SongLoudness>) ?? {};
  } catch {
    cache = {};
  }
  return cache;
}
function remember(id: string, v: SongLoudness) {
  const c = loudnessCache();
  const old = c[id];
  // a file's measurement outranks a clip's
  if (old && old.from === "file" && v.from !== "file") return;
  if (old && old.from === v.from && Math.abs(old.lufs - v.lufs) < 0.05) return;
  c[id] = { lufs: Math.round(v.lufs * 10) / 10, from: v.from };
  const keys = Object.keys(c);
  if (keys.length > 3000) for (const k of keys.slice(0, keys.length - 3000)) delete c[k];
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {}
}

export const useLevels = create<LevelState>()(() => ({
  reading: SILENT_READING,
  live: "idle",
  song: null,
  norm: "graph",
  room: { status: "off", levelDb: null, noiseDb: null, calOffset: null },
  auto: { enabled: false, db: 0, hold: null, path: "graph" },
  cfg: { ...AUTO_DEFAULTS },
}));

/* ---------- the output taps ---------- */
interface Taps {
  raw: AnalyserNode[];
  k: AnalyserNode[];
  buf: Float32Array<ArrayBuffer>;
}
const taps = new WeakMap<object, Taps | null>();
function tapsFor(eng: BoothEngine): Taps | null {
  if (taps.has(eng)) return taps.get(eng) ?? null;
  let t: Taps | null = null;
  try {
    const ctx = eng.ctx as unknown as AudioContext;
    const master = eng.master as unknown as AudioNode;
    if (typeof ctx.createChannelSplitter !== "function" || typeof ctx.createBiquadFilter !== "function")
      throw new Error("no splitter");
    const an = () => {
      const a = ctx.createAnalyser();
      a.fftSize = 2048;
      return a;
    };
    const split = ctx.createChannelSplitter(2);
    master.connect(split);
    const shelf = ctx.createBiquadFilter();
    shelf.type = K_SHELF.type;
    shelf.frequency.value = K_SHELF.frequency;
    shelf.gain.value = K_SHELF.gain;
    const hp = ctx.createBiquadFilter();
    hp.type = K_HIGHPASS.type;
    hp.frequency.value = K_HIGHPASS.frequency;
    hp.Q.value = K_HIGHPASS.Q;
    master.connect(shelf);
    shelf.connect(hp);
    const ksplit = ctx.createChannelSplitter(2);
    hp.connect(ksplit);
    const raw = [an(), an()];
    const k = [an(), an()];
    split.connect(raw[0]!, 0);
    split.connect(raw[1]!, 1);
    ksplit.connect(k[0]!, 0);
    ksplit.connect(k[1]!, 1);
    t = { raw, k, buf: new Float32Array(2048) };
  } catch {
    t = null;
  }
  taps.set(eng, t);
  return t;
}
/** One frame off the taps: the sample peak and the K-weighted mean square summed over L / R. */
function readTaps(t: Taps): { peak: number; msK: number } {
  let peak = 0;
  let msK = 0;
  for (const a of t.raw) {
    a.getFloatTimeDomainData(t.buf);
    peak = Math.max(peak, frameStats(t.buf).peak);
  }
  for (const a of t.k) {
    a.getFloatTimeDomainData(t.buf);
    msK += frameStats(t.buf).ms;
  }
  return { peak, msK };
}

/* ---------- the room microphone ---------- */
interface Mic {
  stream: MediaStream;
  ctx: AudioContext;
  own: boolean;
  nodes: AudioNode[];
  an: AnalyserNode;
  buf: Float32Array<ArrayBuffer>;
}
let mic: Mic | null = null;
const room = new RoomEstimator();
const auto = new AutoMaster();
const meter = new LevelMeter();
let lastOutMs: number | null = null;

export async function startRoom(): Promise<RoomStatus> {
  if (mic) return "on";
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md?.getUserMedia) {
    setRoom({ status: "unsupported" });
    return "unsupported";
  }
  setRoom({ status: "asking" });
  let stream: MediaStream;
  try {
    // the room as it is: no echo cancelling, noise suppression or automatic gain (they would hide the crowd)
    stream = await md.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
  } catch {
    setRoom({ status: "denied" });
    return "denied";
  }
  const eng = boothEngine();
  const own = !eng;
  const ctx = (eng?.ctx as unknown as AudioContext | undefined) ?? new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  const shelf = ctx.createBiquadFilter();
  shelf.type = K_SHELF.type;
  shelf.frequency.value = K_SHELF.frequency;
  shelf.gain.value = K_SHELF.gain;
  const hp = ctx.createBiquadFilter();
  hp.type = K_HIGHPASS.type;
  hp.frequency.value = K_HIGHPASS.frequency;
  hp.Q.value = K_HIGHPASS.Q;
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  // the microphone goes to the analyser and nowhere else (never to the speakers)
  src.connect(shelf);
  shelf.connect(hp);
  hp.connect(an);
  mic = { stream, ctx, own, nodes: [src, shelf, hp, an], an, buf: new Float32Array(2048) };
  room.reset();
  setRoom({ status: "on" });
  ensureLoops();
  return "on";
}
export function stopRoom(): void {
  stopAuto();
  if (mic) {
    for (const tr of mic.stream.getTracks()) tr.stop();
    for (const n of mic.nodes) n.disconnect();
    if (mic.own) void mic.ctx.close().catch(() => {});
  }
  mic = null;
  room.reset();
  setRoom({ status: "off", levelDb: null, noiseDb: null });
}
function setRoom(p: Partial<LevelState["room"]>) {
  useLevels.setState((s) => ({ room: { ...s.room, ...p } }));
}

/* ---------- Auto master ---------- */
export function startAuto(): boolean {
  if (!mic) return false;
  auto.enable();
  useLevels.setState((s) => ({ auto: { ...s.auto, enabled: true } }));
  ensureLoops();
  return true;
}
/** One tap: Auto master stops; the boost it added ramps back to 0 (never a jump). */
export function stopAuto(): void {
  auto.disable();
  useLevels.setState((s) => ({ auto: { ...s.auto, enabled: false } }));
}
export function setAutoConfig(c: Partial<AutoConfig>): void {
  auto.setConfig(c);
  useLevels.setState({ cfg: auto.cfg });
  savePrefs();
}
/** One-time calibration: what a phone SPL app reads in the room right now. */
export function calibrate(splDb: number | null): void {
  const lvl = useLevels.getState().room.levelDb;
  const raw = lvl === null ? null : lvl - (useLevels.getState().room.calOffset ?? 0);
  setRoom({ calOffset: splDb === null || raw === null ? null : calibrationOffset(splDb, raw) });
  savePrefs();
}
export function clearClip(): void {
  meter.clearClip();
  useLevels.setState((s) => ({ reading: { ...s.reading, clip: false } }));
}

/* ---------- the loops ---------- */
let users = 0;
let raf = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let lastAutoT = 0;
let prefsLoaded = false;
let unsubMaster: (() => void) | null = null;

/** Mount the meter (ref-counted: the Now card's meter and the Mixer's share one loop). */
export function attachLevels(): () => void {
  users++;
  ensureLoops();
  return () => {
    users = Math.max(0, users - 1);
    // the room meter and Auto master keep running while on (they act on the room, not on a view)
    if (!users && !mic && !auto.enabled && !useLevels.getState().auto.db) stopLoops();
  };
}

function ensureLoops() {
  if (!prefsLoaded && typeof window !== "undefined") {
    prefsLoaded = true;
    // for tests and the console (nothing private: the boost and whether the microphone is on)
    (window as unknown as { __tdjLevels?: typeof levelDebug }).__tdjLevels = levelDebug;
    const p = loadPrefs();
    auto.setConfig(p.cfg);
    useLevels.setState((s) => ({ cfg: auto.cfg, room: { ...s.room, calOffset: p.calOffset } }));
    // the DJ moved the master: the level they chose is the one for the room as it is now
    unsubMaster = useBooth.subscribe((s, prev) => {
      if (s.master !== prev.master) auto.rebase();
    });
  }
  if (!raf && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(frame);
  // the room loop runs on a timer: a hidden tab (rAF paused) still follows the room (throttled to ~1 Hz)
  if (!timer && typeof setInterval === "function") timer = setInterval(roomTick, 100);
}
function stopLoops() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (timer) clearInterval(timer);
  timer = null;
  unsubMaster?.();
  unsubMaster = null;
  prefsLoaded = false;
}

let lastFrame = 0;
function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (now - lastFrame < (reduced ? 100 : 33)) return;
  lastFrame = now;
  sampleOutput(now / 1000);
}

/** The output side: the meter for files and clips, the static loudness for Spotify / YouTube. */
function sampleOutput(t: number) {
  const eng = boothEngine();
  const b = useBooth.getState();
  const src = b.sources[b.planIndex];
  const live = b.state === "playing" || b.state === "cortina";
  const external = src === "spotify" || src === "youtube";
  const next: Partial<LevelState> = {
    live: external ? (src as LiveSource) : live ? "graph" : "idle",
    norm: normalisationPath(src, roomCaps(b)),
  };
  // the side's loudness
  const it = b.plan?.items[b.planIndex];
  const ent = b.entities[b.planIndex] as { audio?: { loudnessDb?: number } | null } | null | undefined;
  const cur = eng?.current && eng.current.planIndex === b.planIndex ? eng.current : null;
  const from = cur?.source === "file" ? "file" : cur?.source === "preview" ? "clip" : null;
  const song = songLoudness({
    measured: cur?.measured ?? null,
    measuredFrom: from,
    cached: it?.id ? (loudnessCache()[it.id] ?? null) : null,
    catalogueDb: ent?.audio?.loudnessDb ?? null,
  });
  if (song && it?.id && (song.from === "file" || song.from === "clip")) remember(it.id, song);
  const old = useLevels.getState().song;
  if (old?.lufs !== song?.lufs || old?.from !== song?.from) next.song = song;
  // the meter (the graph: files, clips — and the silence of a paused night)
  const tp = eng ? tapsFor(eng) : null;
  if (tp && !external) {
    const f = readTaps(tp);
    lastOutMs = f.msK;
    next.reading = meter.push({ t, peak: f.peak, msK: f.msK });
  } else {
    lastOutMs = null;
    meter.reset();
    if (useLevels.getState().reading !== SILENT_READING) next.reading = SILENT_READING;
  }
  useLevels.setState(next);
}

function roomTick() {
  const now = performance.now() / 1000;
  const dt = lastAutoT ? now - lastAutoT : 0.1;
  lastAutoT = now;
  // a hidden tab has no rAF: keep the output side fresh for the room loop
  if (typeof document !== "undefined" && document.visibilityState === "hidden") sampleOutput(now);
  const eng = boothEngine();
  const b = useBooth.getState();
  const lv = useLevels.getState();
  const src = b.sources[b.planIndex];
  const caps = roomCaps(b);
  const external = src === "spotify" || src === "youtube";
  const sounding = external
    ? !!eng?.current?.started && !b.starting && b.position > 0.3
    : lastOutMs !== null && lastOutMs > 1e-5;
  let roomPatch: Partial<LevelState["room"]> | null = null;
  let noise: number | null = lv.room.noiseDb;
  if (mic) {
    mic.an.getFloatTimeDomainData(mic.buf);
    const micMs = frameStats(mic.buf).ms;
    // the output as the room estimator needs it: the graph's own power; outside the graph only the gaps are known
    const outMs = external ? (sounding ? null : 0) : (lastOutMs ?? 0);
    const r = room.push(now, micMs, outMs);
    const cal = lv.room.calOffset ?? 0;
    noise = r.noiseDb === null ? null : r.noiseDb + cal;
    roomPatch = {
      levelDb: Number.isFinite(r.levelDb) ? Math.round((r.levelDb + cal) * 10) / 10 : null,
      noiseDb: noise === null ? null : Math.round(noise * 10) / 10,
    };
  }
  const path = autoPath(src, caps);
  const hold = autoHold({
    state: b.state,
    itemKind: b.plan?.items[b.planIndex]?.kind ?? null,
    ducked: b.ducked,
    muted: b.muted,
    starting: b.starting,
    sounding,
  });
  const db = auto.step(dt, {
    noiseDb: noise,
    hold: path === "none" ? (hold ?? "paused") : hold,
    masterDb: b.master,
    outPeakDb: external ? null : Number.isFinite(lv.reading.holdDb) ? lv.reading.holdDb : null,
  });
  if (eng) {
    const want = appliedBoost(db, path);
    if (Math.abs(want - eng.autoDb) > 1e-3) eng.setAutoDb(want);
  }
  const a = lv.auto;
  if (a.db !== db || a.hold !== hold || a.path !== path || a.enabled !== auto.enabled || roomPatch)
    useLevels.setState((s) => ({
      auto: { enabled: auto.enabled, db, hold, path },
      ...(roomPatch ? { room: { ...s.room, ...roomPatch } } : {}),
    }));
  if (!users && !mic && !auto.enabled && !db) stopLoops();
}

/** for the e2e: the runtime's moving parts */
export const levelDebug = () => ({
  autoDb: auto.db,
  baseline: auto.baseline,
  enabled: auto.enabled,
  mic: !!mic,
});
