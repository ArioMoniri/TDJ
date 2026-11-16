import { create } from "zustand";

/**
 * 2026-11 (the owner: "on phones, shaking the phone is undo"): iOS's Shake to Undo for the one edit history
 * (lib/editHistory.ts), on phones and tablets. Three parts, the first two pure:
 * - ShakeDetector: motion samples in, "a shake" out. A shake is a few hard pushes back and forth within half a
 *   second (≥ 4 alternating peaks over 12 m/s² of linear acceleration); a step or a bump makes one or two, walking
 *   stays far below the threshold. After a shake it rests a second (one shake, one alert).
 * - shakeAlert: what the alert offers — "Undo <label>?" (Cancel / Undo), or "Redo <label>?" when the last thing done
 *   on this page was an undo (with "Undo <label>" too when there is still something to undo). Nothing to offer: no
 *   alert. Never an undo without the alert (components/ShakeUndo.tsx).
 * - the switch (Settings → Keyboard & gestures): on by default on a touch device; on iOS the motion needs
 *   DeviceMotionEvent.requestPermission() from a tap, so the switch reads on only once the permission is granted, and
 *   turning it on asks. The Tauri iOS app's WKWebView has the same web API (WebKit asks with its own prompt when the
 *   app does not answer itself), so no native bridge is needed. Kept in this browser only.
 */

export interface MotionSample {
  /** linear acceleration (without gravity), m/s² */
  x: number;
  y: number;
  z: number;
  /** ms */
  t: number;
}

export interface ShakeOptions {
  /** a push counts from this much linear acceleration (m/s²) */
  threshold?: number;
  /** the pushes of one shake fall within this (ms) */
  windowMs?: number;
  /** alternating pushes that make a shake */
  peaks?: number;
  /** after a shake, nothing for this long (ms) */
  cooldownMs?: number;
}

export const SHAKE_DEFAULTS: Required<ShakeOptions> = {
  threshold: 12,
  windowMs: 500,
  peaks: 4,
  cooldownMs: 1000,
};

interface Peak {
  x: number;
  y: number;
  z: number;
  m: number;
  t: number;
}

export class ShakeDetector {
  private o: Required<ShakeOptions>;
  private peaks: Peak[] = [];
  private restUntil = Number.NEGATIVE_INFINITY;
  /** the gravity estimate, for samples that only carry acceleration including gravity */
  private g: [number, number, number] | null = null;

  constructor(o: ShakeOptions = {}) {
    this.o = { ...SHAKE_DEFAULTS, ...o };
  }

  reset() {
    this.peaks = [];
    this.g = null;
  }

  /** one sample of linear acceleration; true when it completes a shake */
  push(s: MotionSample): boolean {
    if (![s.x, s.y, s.z, s.t].every(Number.isFinite)) return false;
    const m = Math.hypot(s.x, s.y, s.z);
    this.peaks = this.peaks.filter((p) => s.t - p.t <= this.o.windowMs);
    if (s.t < this.restUntil || m < this.o.threshold) return false;
    const last = this.peaks.at(-1);
    if (last && last.x * s.x + last.y * s.y + last.z * s.z >= 0) {
      // the same push still going: keep its strongest moment
      if (m > last.m) this.peaks[this.peaks.length - 1] = { ...s, m };
      return false;
    }
    this.peaks.push({ ...s, m });
    if (this.peaks.length < this.o.peaks) return false;
    this.peaks = [];
    this.restUntil = s.t + this.o.cooldownMs;
    return true;
  }

  /**
   * a devicemotion event's numbers: its linear `acceleration` when the device gives it, else the acceleration
   * including gravity with gravity filtered out (a slow low-pass estimate taken away)
   */
  pushMotion(
    e: {
      acceleration?: { x: number | null; y: number | null; z: number | null } | null;
      accelerationIncludingGravity?: { x: number | null; y: number | null; z: number | null } | null;
    },
    t: number,
  ): boolean {
    const a = e.acceleration;
    if (a && a.x !== null && a.y !== null && a.z !== null) return this.push({ x: a.x, y: a.y, z: a.z, t });
    const ag = e.accelerationIncludingGravity;
    if (!ag || ag.x === null || ag.y === null || ag.z === null) return false;
    const raw: [number, number, number] = [ag.x, ag.y, ag.z];
    if (!this.g) {
      this.g = raw;
      return false;
    }
    const g = this.g;
    for (let i = 0; i < 3; i++) g[i] = 0.8 * g[i]! + 0.2 * raw[i]!;
    return this.push({ x: raw[0] - g[0], y: raw[1] - g[1], z: raw[2] - g[2], t });
  }
}

/* ---------- the alert ---------- */

export interface ShakeChoice {
  kind: "undo" | "redo";
  label: string;
}
export interface ShakeAlertModel {
  /** the question's own action ("Undo Tanda 3 was locked?") */
  main: ShakeChoice;
  /** the other one, when there is one too (after an undo: Redo, and Undo the edit before) */
  other?: ShakeChoice;
}

/**
 * What a shake offers: after an undo on this page, its redo first (and the undo before it, when there is one), else
 * the undo of the newest edit; null when there is nothing either way.
 */
export function shakeAlert(o: {
  undo: string | null;
  redo: string | null;
  lastWasUndo: boolean;
}): ShakeAlertModel | null {
  const undo: ShakeChoice | null = o.undo !== null ? { kind: "undo", label: o.undo } : null;
  const redo: ShakeChoice | null = o.redo !== null ? { kind: "redo", label: o.redo } : null;
  if (o.lastWasUndo && redo) return undo ? { main: redo, other: undo } : { main: redo };
  if (undo) return { main: undo };
  return null;
}

/* ---------- the switch ---------- */

const PREF = "tdj-shake-undo";
const GRANTED = "tdj-shake-motion";

type Perm = "granted" | "denied" | "default";
type MotionCtor = { requestPermission?: () => Promise<Perm> };
const motionCtor = (): MotionCtor | null =>
  typeof window !== "undefined" && "DeviceMotionEvent" in window
    ? (window.DeviceMotionEvent as unknown as MotionCtor)
    : null;

/** the device reports motion at all */
export const hasMotion = () => motionCtor() !== null;
/** iOS 13+: motion only after DeviceMotionEvent.requestPermission() from a tap */
export const needsMotionPermission = () => typeof motionCtor()?.requestPermission === "function";
/** a phone or a tablet (the switch's default) */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (navigator.maxTouchPoints ?? 0) > 0 && window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

const read = (k: string) => {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(k) : null;
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {}
};

interface ShakePrefState {
  /** the DJ's choice; null: the default (on for a touch device) */
  pref: boolean | null;
  /** iOS granted motion on this device (remembered: WebKit keeps the grant, asking again is silent) */
  granted: boolean;
}
export const useShakePref = create<ShakePrefState>(() => {
  const p = typeof window !== "undefined" ? read(PREF) : null;
  return {
    pref: p === "on" ? true : p === "off" ? false : null,
    granted: typeof window !== "undefined" && read(GRANTED) === "1",
  };
});

/** the DJ wants shake to undo here (their choice, else on for a touch device with motion) */
export const shakeWanted = (s: ShakePrefState = useShakePref.getState()) =>
  s.pref ?? (isTouchDevice() && hasMotion());
/** shake to undo listens now: wanted, and (on iOS) motion granted */
export const shakeOn = (s: ShakePrefState = useShakePref.getState()) =>
  shakeWanted(s) && hasMotion() && (!needsMotionPermission() || s.granted);

/** iOS: ask for motion (from a tap); true when granted */
export async function requestMotion(): Promise<boolean> {
  const ask = motionCtor()?.requestPermission;
  if (typeof ask !== "function") return hasMotion();
  try {
    const ok = (await ask.call(motionCtor())) === "granted";
    useShakePref.setState({ granted: ok });
    write(GRANTED, ok ? "1" : null);
    return ok;
  } catch {
    return false;
  }
}

/**
 * the switch: on asks for motion first on iOS (call it from the tap); "denied" when iOS said no (the switch stays
 * off), else what it is now
 */
export async function setShakeUndo(on: boolean): Promise<"on" | "off" | "denied"> {
  if (on && needsMotionPermission() && !(await requestMotion())) return "denied";
  useShakePref.setState({ pref: on });
  write(PREF, on ? "on" : "off");
  return on ? "on" : "off";
}
