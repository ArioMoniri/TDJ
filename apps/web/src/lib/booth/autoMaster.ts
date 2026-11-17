/**
 * 2026-11 (the owner: "the master slider should automatically match the song loudness with what's heard from the
 * speakers and the environment"): the room meter and Auto master, as pure math (the runtime in levelRuntime.ts
 * feeds them every 100 ms; the vitest feeds them known rooms).
 *
 * The room meter listens through the device's microphone (only with the DJ's permission, never recorded or sent):
 * what it hears is the music from the speakers plus the room (the crowd's chatter). `RoomEstimator` separates the two
 * without any calibration: the speakers' share of the microphone follows what the booth plays (its short-term
 * loudness), so the lowest offset between the two over the last 20 minutes is the room's acoustic coupling, and the
 * microphone's power above "playing level + coupling" is the room's own noise. Between songs (silence at the output)
 * the microphone hears the room alone. The noise floor is smoothed over ~15 s: chatter rising, not a shout.
 *
 * `AutoMaster` keeps the music's level over the crowd steady: when the noise floor rises above the level it had when
 * the DJ switched Auto on (or last moved the master), the master is nudged up by half of the rise, within the DJ's
 * maximum (default +3 dB), and back down when the room quietens. It never moves faster than 0.5 dB/s, never pushes
 * the master above +6 dB in all, never raises while the output peaks near full scale, and holds still during a
 * cortina, talk-over, mute, a pause or a gap. Off by default; a tap stops it (the boost ramps back to 0 at the rate).
 */

/** the fastest the auto master moves, dB per second (the brief: ≤ 0.5 dB/s) */
export const AUTO_MAX_RATE_DB_PER_SEC = 0.5;
/** the master + auto never goes above this (the engine's own top) */
export const AUTO_CEILING_DB = 6;
/** the output's sample peak at which the boost stops rising / starts falling (dBFS) */
export const AUTO_PEAK_STOP_DBFS = -1;
export const AUTO_PEAK_BACKOFF_DBFS = -0.3;
/** dB of master per dB of crowd noise (partial compensation: a room louder by 4 dB gets +2 dB) */
export const AUTO_SLOPE = 0.5;
/** a target this close to the boost does not start a move (no hunting) */
export const AUTO_DEADBAND_DB = 1;
export const AUTO_RANGES = {
  maxBoostDb: { min: 0.5, max: 6, step: 0.5 },
  rateDbPerSec: { min: 0.1, max: AUTO_MAX_RATE_DB_PER_SEC, step: 0.05 },
} as const;
export interface AutoConfig {
  maxBoostDb: number;
  rateDbPerSec: number;
}
export const AUTO_DEFAULTS: AutoConfig = { maxBoostDb: 3, rateDbPerSec: 0.25 };

export function autoConfig(c: Partial<AutoConfig> | null | undefined): AutoConfig {
  const num = (v: unknown, d: number, r: { min: number; max: number }) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(r.max, Math.max(r.min, v)) : d;
  return {
    maxBoostDb: num(c?.maxBoostDb, AUTO_DEFAULTS.maxBoostDb, AUTO_RANGES.maxBoostDb),
    rateDbPerSec: num(c?.rateDbPerSec, AUTO_DEFAULTS.rateDbPerSec, AUTO_RANGES.rateDbPerSec),
  };
}

/** why the auto master holds still right now */
export type AutoHold = "cortina" | "talk" | "muted" | "paused" | "gap" | "starting";

/** The hold for the booth's state (null: the music plays, the auto master may move). */
export function autoHold(s: {
  state: string;
  itemKind?: string | null;
  ducked: boolean;
  muted: boolean;
  starting?: boolean;
  sounding: boolean;
}): AutoHold | null {
  if (s.muted) return "muted";
  if (s.ducked) return "talk";
  if (s.state === "cortina" || s.itemKind === "cortina") return "cortina";
  if (s.state !== "playing") return "paused";
  if (s.starting) return "starting";
  if (!s.sounding) return "gap";
  return null;
}

const powerDb = (p: number) => (p > 0 ? 10 * Math.log10(p) : Number.NEGATIVE_INFINITY);
const dbPower = (db: number) => (Number.isFinite(db) ? 10 ** (db / 10) : 0);
/** `a` minus `b` in power, dB (−Infinity when b covers a) */
export function powerSubDb(a: number, b: number): number {
  return powerDb(dbPower(a) - dbPower(b));
}
/** The q-quantile (0…1) of `xs` (nearest rank); NaN when empty. */
export function quantile(xs: readonly number[], q: number): number {
  if (!xs.length) return Number.NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!;
}

/** below this the booth's output counts as silence (between songs): the microphone hears the room alone */
export const OUT_SILENT_DB = -50;
/** the output must be this loud for a sample to teach the coupling */
const COUPLING_MIN_OUT_DB = -40;
/** the speakers and the microphone stay put: the coupling is learned over the last 20 min (one pair a second) */
const COUPLING_WINDOW_SEC = 1200;
const COUPLING_EVERY_SEC = 1;
const COUPLING_MIN_SAMPLES = 5;
const COUPLING_QUANTILE = 0.1;
const MIC_WINDOW_SEC = 3;
const NOISE_TAU_SEC = 15;
/** after the output falls silent, the room's reverb and the speakers' delay are gone after this long */
const GAP_SETTLE_SEC = 0.6;
/** a gap's reading of the room stands this long: the estimate under the music only fills longer stretches */
const GAP_TRUST_SEC = 60;
/** a residual further than this under what the microphone hears is the subtraction's error, not a crowd */
const NOISE_MAX_UNDER_DB = 20;

export interface RoomReading {
  /** what the microphone hears over 3 s, dB re full scale (uncalibrated) */
  levelDb: number;
  /** the room's own noise (the crowd), smoothed; null until known */
  noiseDb: number | null;
  /** the speakers-to-microphone coupling, dB; null until learned */
  couplingDb: number | null;
  /**
   * 2026-11: the room for Auto master, by the one kind of reading that stands now — a gap's (the room heard alone,
   * within GAP_TRUST_SEC) or the estimate under the music — each smoothed on its own. Auto master compares a reading
   * with a baseline of the same kind: the estimate under the music can sit far above the room (the subtraction's
   * error: −45 dB for a −80 dB room under the clips' tremolo), so a baseline taken under the music hid a crowd that the
   * next gap heard plainly, and a baseline from a gap set against the music's estimate would boost a quiet room.
   */
  room: { db: number; kind: NoiseKind } | null;
}
export type NoiseKind = "gap" | "music";

export class RoomEstimator {
  private frames: Array<{ t: number; mic: number; out: number | null }> = [];
  private pairs: Array<{ t: number; d: number }> = [];
  private noise: number | null = null;
  private lastT: number | null = null;
  private silentSince: number | null = null;
  private lastSampleAt: number | null = null;
  private lastGapAt: number | null = null;
  /** the two kinds on their own (RoomReading.room) */
  private byKind: Record<NoiseKind, { db: number | null; at: number | null }> = {
    gap: { db: null, at: null },
    music: { db: null, at: null },
  };

  /**
   * One frame: `micMs` the microphone's (K-weighted) mean square; `outMs` the booth's output (K-weighted, summed)
   * mean square at the same moment — 0 between songs, null when the booth cannot see it (a Spotify Connect device).
   * Both are averaged over the same 3 s, so the music's own dynamics cancel out.
   */
  push(t: number, micMs: number, outMs: number | null): RoomReading {
    const dt = this.lastT === null ? 0 : Math.max(0, Math.min(5, t - this.lastT));
    this.lastT = t;
    this.frames.push({ t, mic: micMs, out: outMs });
    while (this.frames.length && this.frames[0]!.t <= t - MIC_WINDOW_SEC) this.frames.shift();
    const mean = (xs: number[]) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0);
    const level = powerDb(mean(this.frames.map((f) => f.mic)));
    const silentNow = outMs !== null && powerDb(outMs) < OUT_SILENT_DB;
    if (!silentNow) this.silentSince = null;
    else if (this.silentSince === null) this.silentSince = t;
    let sample: number | null = null;
    let fromGap = false;
    if (silentNow && this.silentSince !== null && t - this.silentSince >= GAP_SETTLE_SEC) {
      // between songs, once the reverb has gone: the room alone (the reading the music's estimate defers to)
      const quiet = this.frames
        .filter((f) => f.t >= this.silentSince! + GAP_SETTLE_SEC - 0.2)
        .map((f) => f.mic);
      sample = powerDb(mean(quiet));
      fromGap = true;
    } else if (!silentNow && outMs !== null && this.frames.every((f) => f.out !== null)) {
      const out = powerDb(mean(this.frames.map((f) => f.out as number)));
      const lastPair = this.pairs[this.pairs.length - 1];
      if (
        Number.isFinite(level) &&
        out >= COUPLING_MIN_OUT_DB &&
        (!lastPair || t - lastPair.t >= COUPLING_EVERY_SEC)
      ) {
        this.pairs.push({ t, d: level - out });
        while (this.pairs.length && this.pairs[0]!.t <= t - COUPLING_WINDOW_SEC) this.pairs.shift();
      }
      const c = this.coupling();
      const rest =
        c !== null && Number.isFinite(level) && Number.isFinite(out) ? powerSubDb(level, out + c) : null;
      // a crowd far under the music cannot be told from it, and a recent gap already said what the room is
      const gapRecent = this.lastGapAt !== null && t - this.lastGapAt < GAP_TRUST_SEC;
      if (rest !== null && rest >= level - NOISE_MAX_UNDER_DB && !gapRecent) sample = rest;
    }
    if (sample !== null && Number.isFinite(sample)) {
      // smoothed over NOISE_TAU_SEC of real time: the first reading of a gap after a song counts for a lot
      const since = this.lastSampleAt === null ? 0 : Math.min(GAP_TRUST_SEC, t - this.lastSampleAt);
      this.noise =
        this.noise === null
          ? sample
          : this.noise + (sample - this.noise) * (1 - Math.exp(-Math.max(dt, since) / NOISE_TAU_SEC));
      this.lastSampleAt = t;
      if (fromGap) this.lastGapAt = t;
      // the kind's own estimate: a gap's first reading after a while counts for a lot (the time since its kind's last)
      const k = this.byKind[fromGap ? "gap" : "music"];
      const sinceKind = k.at === null ? 0 : Math.min(GAP_TRUST_SEC, t - k.at);
      k.db =
        k.db === null
          ? sample
          : k.db + (sample - k.db) * (1 - Math.exp(-Math.max(dt, sinceKind) / NOISE_TAU_SEC));
      k.at = t;
    }
    const gapNow = this.lastGapAt !== null && t - this.lastGapAt < GAP_TRUST_SEC;
    const kind: NoiseKind = gapNow ? "gap" : "music";
    const kdb = this.byKind[kind].db;
    return {
      levelDb: level,
      noiseDb: this.noise,
      couplingDb: this.coupling(),
      room: kdb === null ? null : { db: kdb, kind },
    };
  }
  private coupling(): number | null {
    if (this.pairs.length < COUPLING_MIN_SAMPLES) return null;
    return quantile(
      this.pairs.map((p) => p.d),
      COUPLING_QUANTILE,
    );
  }
  reset(): void {
    this.frames = [];
    this.pairs = [];
    this.noise = null;
    this.lastT = null;
    this.silentSince = null;
    this.lastSampleAt = null;
    this.lastGapAt = null;
    this.byKind = { gap: { db: null, at: null }, music: { db: null, at: null } };
  }
}

export interface AutoInput {
  /** the room's noise floor (RoomEstimator), null while unknown */
  noiseDb: number | null;
  hold: AutoHold | null;
  /** the DJ's master fader, dB */
  masterDb: number;
  /** the output's recent sample peak (dBFS) when the booth can see it (files / clips), else null */
  outPeakDb: number | null;
  /** RoomReading.room's kind for `noiseDb` (each kind has its own baseline); unset: one kind */
  noiseKind?: NoiseKind;
}

/** with no gap to hear the room alone (a gapless night), the estimate under the music is the baseline after this long */
export const BASELINE_WAIT_SEC = 300;

export class AutoMaster {
  cfg: AutoConfig;
  /** the boost on top of the DJ's master, dB (≥ 0) */
  db = 0;
  enabled = false;
  /** the noise floor the DJ's level was set against, by the kind of reading (RoomReading.room) */
  private baselines: Record<NoiseKind, number | null> = { gap: null, music: null };
  private kind: NoiseKind = "music";
  private moving = false;
  /** the baseline for the kind of reading that stands now */
  get baseline(): number | null {
    return this.baselines.gap ?? this.baselines.music;
  }
  /** seconds of music since enabling with no gap heard yet (the music's own baseline waits for a gap first) */
  private waited = 0;

  constructor(cfg?: Partial<AutoConfig>) {
    this.cfg = autoConfig(cfg);
  }
  setConfig(c: Partial<AutoConfig>): void {
    this.cfg = autoConfig({ ...this.cfg, ...c });
  }
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.baselines = { gap: null, music: null };
    this.waited = 0;
    this.moving = false;
  }
  /** Stop: the boost ramps back to 0 at the rate (never a jump). */
  disable(): void {
    this.enabled = false;
    this.baselines = { gap: null, music: null };
    this.waited = 0;
  }
  /** The DJ moved the master: the level they chose is the one for the room as it is now. */
  rebase(): void {
    this.baselines = { gap: null, music: null };
    this.waited = 0;
  }
  /** Where the boost wants to be (before the rate limit). */
  target(i: AutoInput): number {
    const room = AUTO_CEILING_DB - i.masterDb;
    if (!this.enabled) return 0;
    let t = this.db;
    // a reading against the baseline of its own kind (RoomReading.room)
    const base = this.baselines[this.kind];
    if (!i.hold && i.noiseDb !== null && base !== null) {
      const want = Math.min(this.cfg.maxBoostDb, Math.max(0, AUTO_SLOPE * (i.noiseDb - base)));
      if (this.moving || Math.abs(want - this.db) >= AUTO_DEADBAND_DB) t = want;
    }
    if (i.outPeakDb !== null && i.outPeakDb >= AUTO_PEAK_STOP_DBFS) t = Math.min(t, this.db);
    if (i.outPeakDb !== null && i.outPeakDb >= AUTO_PEAK_BACKOFF_DBFS) t = Math.min(t, this.db - 1);
    return Math.max(0, Math.min(t, this.cfg.maxBoostDb, room));
  }
  /** Advance `dtSec`: returns the boost (dB) to apply. */
  step(dtSec: number, i: AutoInput): number {
    const dt = Math.max(0, Math.min(1, dtSec));
    this.kind = i.noiseKind ?? "music";
    if (this.enabled && this.baselines[this.kind] === null && i.noiseDb !== null && !i.hold) {
      // the room as it is when Auto master starts is the first gap's reading; the estimate under the music becomes its
      // own baseline once a gap has said what the room is, or after BASELINE_WAIT_SEC of a night with no gap
      // (unkinded readings, a single source: at once)
      const ready =
        i.noiseKind !== "music" || this.baselines.gap !== null || this.waited >= BASELINE_WAIT_SEC;
      if (ready) this.baselines[this.kind] = i.noiseDb;
      else this.waited += dt;
    }
    const t = this.target(i);
    const d = t - this.db;
    const max = Math.min(AUTO_MAX_RATE_DB_PER_SEC, this.cfg.rateDbPerSec) * dt;
    this.db += Math.max(-max, Math.min(max, d));
    if (Math.abs(t - this.db) < 1e-6) {
      this.db = t;
      this.moving = false;
    } else this.moving = true;
    if (this.db < 1e-6) this.db = 0;
    return this.db;
  }
}

/**
 * Where the boost can act, by the room's player: the graph (files, clips) and the Spotify SDK (`player.setVolume`)
 * follow every step; a Connect device gets 1 dB steps (one volume request at most every 2 s at the top rate); a
 * device without volume control cannot follow at all.
 */
export type AutoPath = "graph" | "sdk" | "connect" | "none";
export function autoPath(
  source: string | null | undefined,
  caps: { volume: boolean; gain: boolean },
): AutoPath {
  if (!caps.volume) return "none";
  if (source === "spotify") return caps.gain ? "sdk" : "connect";
  if (source === "youtube") return caps.gain ? "sdk" : "none";
  return "graph";
}
/** The boost as the path applies it (Connect: whole dB). */
export function appliedBoost(db: number, path: AutoPath): number {
  if (path === "none") return 0;
  if (path === "connect") return Math.round(db);
  return Math.round(db * 100) / 100;
}

/** Calibration: the offset that makes the microphone's reading match a phone SPL app's value. */
export function calibrationOffset(splDb: number, micDb: number): number | null {
  if (!Number.isFinite(splDb) || !Number.isFinite(micDb)) return null;
  return Math.round((splDb - micDb) * 10) / 10;
}
