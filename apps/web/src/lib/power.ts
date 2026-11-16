import { create } from "zustand";

/**
 * 2026-11 — Battery saver (the owner: "a battery saving mode for lower usage, for the apps and web").
 *
 * One module owns the mode, the device's power signals and the helpers the loops use, so each loop site changes by
 * a line (scripts/power-probe.ts measures them):
 * - `resolveSaver`: Off / Auto / On → on or off, and why (pure; vitest);
 * - `powerFrame` / `cancelPowerFrame`: requestAnimationFrame with a frame budget — 4 fps while saving: the next frame
 *   is asked for only after the budget has passed (a timer, then one rAF), so the browser is not woken 60 times a
 *   second to skip 56 of them;
 * - `skipPoll` / `pollEvery`: longer polling while saving, with an immediate re-sync on focus, on the tab coming back
 *   and whenever the caller says the moment is urgent (a start, a seek, the end of a track);
 * - `idleAfter`: a callback after a quiet spell while saving (the search worker is let go).
 *
 * Never here: anything that schedules sound. The engine plans every start, gap and fade on the AudioContext clock and
 * Spotify's commands run on their own timers; the saver only changes how often the screen and the polls look at them
 * (power.audio.test.ts runs a night with the saver on and off and compares every scheduled call).
 */

export type PowerMode = "off" | "auto" | "on";
export type Thermal = "nominal" | "fair" | "serious" | "critical";
export interface PowerSignals {
  /** 0…1 (Battery Status API, or the app's native reading); null where the device does not say */
  batteryLevel: number | null;
  /** plugged in; null where unknown */
  charging: boolean | null;
  /** macOS / iOS Low Power Mode (the apps) */
  lowPowerMode: boolean | null;
  /** macOS / iOS thermal state (the apps) */
  thermal: Thermal | null;
  /** hints: the DJ asked the system for less motion, or for less data */
  reducedMotion: boolean;
  saveData: boolean;
}
export type SaverReason =
  | "manual"
  | "low-power-mode"
  | "thermal"
  | "battery-low"
  | "battery-unplugged"
  | null;
export interface SaverState {
  active: boolean;
  reason: SaverReason;
}

/** below this, unplugged: Auto saves */
export const AUTO_UNPLUGGED_BELOW = 0.3;
/** at or below this, Auto saves even while charging (a slow charger on a long night still loses) */
export const AUTO_LOW = 0.1;
/** with a hint (Reduce Motion, Save Data) Auto saves on battery from this level */
export const AUTO_HINTED_BELOW = 0.5;
/** the UI's frame budget while saving: 4 fps */
export const SAVER_FRAME_MS = 250;

export const NO_SIGNALS: PowerSignals = {
  batteryLevel: null,
  charging: null,
  lowPowerMode: null,
  thermal: null,
  reducedMotion: false,
  saveData: false,
};

/**
 * Off never saves, On always does. Auto saves when the system says so (Low Power Mode, a serious or critical thermal
 * state), when the battery is low (≤ 10 %, even charging), or unplugged under 30 % — under 50 % when the DJ's system
 * hints at it (Reduce Motion, Save Data). Without a battery reading Auto follows the system alone.
 */
export function resolveSaver(mode: PowerMode, s: PowerSignals): SaverState {
  if (mode === "off") return { active: false, reason: null };
  if (mode === "on") return { active: true, reason: "manual" };
  if (s.lowPowerMode) return { active: true, reason: "low-power-mode" };
  if (s.thermal === "serious" || s.thermal === "critical") return { active: true, reason: "thermal" };
  const level = s.batteryLevel;
  if (level !== null && Number.isFinite(level)) {
    if (level <= AUTO_LOW) return { active: true, reason: "battery-low" };
    const below = s.reducedMotion || s.saveData ? AUTO_HINTED_BELOW : AUTO_UNPLUGGED_BELOW;
    if (s.charging === false && level < below) return { active: true, reason: "battery-unplugged" };
  }
  return { active: false, reason: null };
}

/** the minimum time between two frames of a loop whose own budget is `baseMs` */
export const frameBudget = (baseMs: number, saving: boolean): number =>
  saving ? Math.max(baseMs, SAVER_FRAME_MS) : baseMs;
/** a frame is due once its budget has passed (1 ms of slack: rAF timestamps land a hair early) */
export const frameDue = (last: number, now: number, budgetMs: number): boolean => now - last >= budgetMs - 1;
/** how often a poll runs */
export const pollEvery = (baseMs: number, saverMs: number, saving = isSaving()): number =>
  saving ? Math.max(baseMs, saverMs) : baseMs;

/* ---------------------------------------------------------------- the store */

const KEY = "tdj-power";
function loadMode(): PowerMode {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return v === "on" || v === "auto" || v === "off" ? v : "auto";
  } catch {
    return "auto";
  }
}

interface PowerStore extends SaverState {
  mode: PowerMode;
  signals: PowerSignals;
  /** the source of the battery reading (for Settings' line) */
  from: "browser" | "app" | null;
  setMode: (m: PowerMode) => void;
  setSignals: (p: Partial<PowerSignals>, from?: "browser" | "app") => void;
}

export const usePower = create<PowerStore>()((set, get) => ({
  mode: "auto",
  signals: NO_SIGNALS,
  from: null,
  active: false,
  reason: null,
  setMode: (mode) => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {}
    set({ mode, ...resolveSaver(mode, get().signals) });
  },
  setSignals: (p, from) => {
    const signals = { ...get().signals, ...p };
    set({ signals, ...(from ? { from } : {}), ...resolveSaver(get().mode, signals) });
  },
}));
// the saved mode, before anything reads it (the module loads on the client before the first loop starts)
if (typeof window !== "undefined") {
  const mode = loadMode();
  usePower.setState({ mode, ...resolveSaver(mode, NO_SIGNALS) });
}

export const isSaving = (): boolean => usePower.getState().active;
export const useSaving = (): boolean => usePower((s) => s.active);

/* ---------------------------------------------------------------- frames */

type Pending = { timer: ReturnType<typeof setTimeout> | null; raf: number };
const pending = new Map<number, Pending>();
let seq = 0;
const hasRaf = () => typeof requestAnimationFrame === "function";

/**
 * requestAnimationFrame within a frame budget. Not saving: exactly `requestAnimationFrame(cb)` (the loop keeps its own
 * budget). Saving: one frame after `SAVER_FRAME_MS` (minus a frame) — a timer first, so the page is not woken by the
 * frames it would skip. The id is negative then; `cancelPowerFrame` takes either kind.
 */
export function powerFrame(cb: FrameRequestCallback, saving = isSaving()): number {
  if (!hasRaf()) return 0;
  if (!saving) return requestAnimationFrame(cb);
  const id = --seq;
  const p: Pending = { timer: null, raf: 0 };
  pending.set(id, p);
  p.timer = setTimeout(() => {
    p.timer = null;
    p.raf = requestAnimationFrame((t) => {
      pending.delete(id);
      cb(t);
    });
  }, SAVER_FRAME_MS - 17);
  return id;
}
export function cancelPowerFrame(id: number): void {
  if (!id) return;
  if (id > 0) {
    if (hasRaf()) cancelAnimationFrame(id);
    return;
  }
  const p = pending.get(id);
  if (!p) return;
  if (p.timer) clearTimeout(p.timer);
  if (p.raf && hasRaf()) cancelAnimationFrame(p.raf);
  pending.delete(id);
}

/* ---------------------------------------------------------------- polls */

const lastPoll = new WeakMap<object, number>();
/** bumped on focus / the tab coming back: every gated poll runs at its next tick */
let epoch = 0;
const seenEpoch = new WeakMap<object, number>();
/**
 * A poll that runs on a short timer: true when this run should be skipped because the saver is on, the last run for
 * `key` was less than `saverMs` ago, and the moment is not `urgent`. Off, it never skips.
 */
export function skipPoll(key: object, saverMs: number, urgent = false, at = Date.now()): boolean {
  if (!isSaving() || urgent || seenEpoch.get(key) !== epoch) {
    seenEpoch.set(key, epoch);
    lastPoll.set(key, at);
    return false;
  }
  const last = lastPoll.get(key);
  if (last !== undefined && at - last < saverMs) return true;
  lastPoll.set(key, at);
  return false;
}
/** this key's next poll runs, whatever the saver says (a poke: the app came back, the DJ asked) */
export function forgetPoll(key: object): void {
  seenEpoch.delete(key);
}
/** re-sync now: the next tick of every gated poll runs (focus, visibility, a seek) */
export function resyncPolls(): void {
  epoch++;
}

/* ---------------------------------------------------------------- idle */

const idle = new Map<string, ReturnType<typeof setTimeout>>();
/** while saving, `fn` runs after `ms` without another call for `key`; off, nothing is scheduled */
export function idleAfter(key: string, ms: number, fn: () => void): void {
  const old = idle.get(key);
  if (old) clearTimeout(old);
  idle.delete(key);
  if (!isSaving()) return;
  idle.set(
    key,
    setTimeout(() => {
      idle.delete(key);
      if (isSaving()) fn();
    }, ms),
  );
}

/* ---------------------------------------------------------------- the device's signals */

interface BatteryLike {
  level: number;
  charging: boolean;
  addEventListener(t: string, cb: () => void): void;
}
interface NativePower {
  lowPowerMode?: boolean | null;
  thermal?: string | null;
  batteryLevel?: number | null;
  charging?: boolean | null;
}

const THERMAL: readonly Thermal[] = ["nominal", "fair", "serious", "critical"];
/** the app's native reading as signals (unknown fields stay unknown) */
export function fromNative(n: NativePower | null | undefined): Partial<PowerSignals> {
  if (!n) return {};
  const out: Partial<PowerSignals> = {};
  if (typeof n.lowPowerMode === "boolean") out.lowPowerMode = n.lowPowerMode;
  if (typeof n.thermal === "string" && (THERMAL as readonly string[]).includes(n.thermal))
    out.thermal = n.thermal as Thermal;
  if (typeof n.batteryLevel === "number" && n.batteryLevel >= 0 && n.batteryLevel <= 1)
    out.batteryLevel = n.batteryLevel;
  if (typeof n.charging === "boolean") out.charging = n.charging;
  return out;
}

let watching = false;
/** start reading the device (once): the Battery Status API, the media hints, and the app's native state */
export function watchPowerSignals(): void {
  if (watching || typeof window === "undefined") return;
  watching = true;
  const st = usePower.getState();
  // hints
  if (typeof matchMedia === "function") {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const data = matchMedia("(prefers-reduced-data: reduce)");
    const read = () => st.setSignals({ reducedMotion: mq.matches, saveData: data.matches || saveData() });
    read();
    mq.addEventListener?.("change", read);
    data.addEventListener?.("change", read);
  }
  // the browser's battery (Chromium; Safari and Firefox have none)
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
  if (typeof nav.getBattery === "function")
    void nav
      .getBattery()
      .then((b) => {
        const read = () =>
          usePower.getState().setSignals({ batteryLevel: b.level, charging: b.charging }, "browser");
        read();
        b.addEventListener("levelchange", read);
        b.addEventListener("chargingchange", read);
      })
      .catch(() => {});
  // the apps: Low Power Mode, the thermal state and the battery (src-tauri/src/power.rs), every minute
  void import("@/lib/app/native").then(({ hasNative, invoke }) => {
    if (!hasNative()) return;
    const ask = () =>
      invoke<NativePower>("power_state")
        .then((n) => usePower.getState().setSignals(fromNative(n), "app"))
        .catch(() => {});
    void ask();
    setInterval(ask, 60_000);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && void ask());
  });
  // back to the page: every gated poll asks at once
  const back = () => document.visibilityState === "visible" && resyncPolls();
  window.addEventListener("focus", back);
  document.addEventListener("visibilitychange", back);
}
function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return c?.saveData === true;
}

/** the apps: tell the native side (the Mac lets the display dim during a night while saving) */
export function tellNative(on: boolean): void {
  void import("@/lib/app/native").then(({ hasNative, invoke }) => {
    if (hasNative()) void invoke("power_saver", { on }).catch(() => {});
  });
}
