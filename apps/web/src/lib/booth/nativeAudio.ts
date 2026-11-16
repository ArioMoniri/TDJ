"use client";
import { hasNative, invoke } from "@/lib/app/native";
import type { AudioEvent } from "./continuity";
import type { NativeOutput } from "./outputs";

/**
 * 2026-11: the page's side of the native audio commands (apps/desktop/src-tauri/src/audio.rs). In a browser every call
 * is a quiet no-op (`null` / `false`); the Booth then uses the web's own APIs (lib/booth/cue.ts, media.ts).
 *
 * Native → page: `window` CustomEvent `tdj:audio` whose `detail` is one of
 * - `{ type: "interruption", phase: "began" | "ended", shouldResume?: boolean }` (iOS AVAudioSession)
 * - `{ type: "route", reason: number, previous?: string[] }` (iOS route change, AVAudioSession.RouteChangeReason)
 * - `{ type: "devices" }` (macOS CoreAudio: the device list or the default output changed)
 * - `{ type: "reset" }` (iOS media services were reset)
 */
export const NATIVE_AUDIO_EVENT = "tdj:audio";

export interface NativeRoute {
  platform: string;
  outputs: NativeOutput[];
  /** iOS: the session's output channels now / at most (multi-route needs a USB interface) */
  outputChannels?: number | null;
  maxOutputChannels?: number | null;
  /** iOS: whether the session plays as `.playback` (not ambient), without mixing with others */
  category?: string | null;
  mixesWithOthers?: boolean | null;
}

export type NativeDetail =
  | { type: "interruption"; phase: "began" }
  | { type: "interruption"; phase: "ended"; shouldResume?: boolean }
  | { type: "route"; reason: number; previous?: string[] }
  | { type: "devices" }
  | { type: "reset" };

/** The native outputs, or null in a browser (or an app build without the command). */
export async function nativeRoute(): Promise<NativeRoute | null> {
  if (!hasNative()) return null;
  try {
    return await invoke<NativeRoute>("audio_route");
  } catch {
    return null;
  }
}

/** iOS: the system's AirPlay / Bluetooth route picker (AVRoutePickerView). false where there is none. */
export async function showRoutePicker(): Promise<boolean> {
  if (!hasNative()) return false;
  return invoke<boolean>("audio_route_picker").catch(() => false);
}

/** macOS: make `id` (a CoreAudio device UID) the system output the room plays on. */
export async function setSystemOutput(id: string): Promise<boolean> {
  if (!hasNative()) return false;
  return invoke<boolean>("audio_set_output", { id }).catch(() => false);
}

/**
 * While a night runs: macOS holds an App Nap / idle-sleep activity (NSProcessInfo) and the display awake; iOS keeps
 * the idle timer off and the `.playback` session active. `false` lets the device sleep again.
 */
export async function nightRunning(on: boolean): Promise<boolean> {
  if (typeof window !== "undefined")
    (window as unknown as { __TDJ_NIGHT_RUNS__?: boolean }).__TDJ_NIGHT_RUNS__ = on;
  if (!hasNative()) return false;
  return invoke<boolean>("audio_night", { on }).catch(() => false);
}

/** The native event as a Booth audio event (continuity.ts), or null for a list refresh / an unknown event. */
export function toAudioEvent(d: unknown): AudioEvent | "devices" | null {
  const x = d as Partial<NativeDetail> | null;
  if (!x || typeof x !== "object") return null;
  if (x.type === "interruption") {
    if (x.phase === "began") return { type: "interruption", phase: "began" };
    if (x.phase === "ended")
      return {
        type: "interruption",
        phase: "ended",
        shouldResume: (x as { shouldResume?: boolean }).shouldResume === true,
      };
    return null;
  }
  if (x.type === "route" && typeof (x as { reason?: unknown }).reason === "number") {
    const r = x as { reason: number; previous?: unknown };
    return {
      type: "route",
      reason: r.reason,
      previous: Array.isArray(r.previous)
        ? r.previous.filter((p): p is string => typeof p === "string")
        : undefined,
    };
  }
  if (x.type === "reset") return { type: "reset" };
  if (x.type === "devices") return "devices";
  return null;
}

/** Listen to the native audio events; returns the unsubscribe. */
export function onNativeAudio(cb: (e: AudioEvent | "devices") => void): () => void {
  if (typeof window === "undefined") return () => {};
  const h = (ev: Event) => {
    const e = toAudioEvent((ev as CustomEvent).detail);
    if (e) cb(e);
  };
  window.addEventListener(NATIVE_AUDIO_EVENT, h);
  return () => window.removeEventListener(NATIVE_AUDIO_EVENT, h);
}
