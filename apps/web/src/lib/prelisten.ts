"use client";
import { create } from "zustand";
import type { PrelistenWhy } from "./booth/prelistenRoute";

/**
 * 2026-11 — a tap on a song while the Booth plays a night to the room, and no output a pre-listen can safely use:
 * the one sheet that asks (components/PrelistenSheet.tsx), mounted once in the layout. `retry` plays the same row
 * again once the DJ picked headphones (or chose this device's speaker); the room is never touched.
 */
export interface PrelistenAsk {
  title: string;
  why: PrelistenWhy;
  /** play the asked row again; `speaker`: on this device's speaker (lib/booth/prelistenRoute.ts speakerFor) */
  retry: (o?: { speaker?: boolean }) => Promise<boolean>;
}
export const usePrelistenAsk = create<{ ask: PrelistenAsk | null }>()(() => ({ ask: null }));
export const askPrelisten = (ask: PrelistenAsk) => usePrelistenAsk.setState({ ask });
export const closePrelistenAsk = () => usePrelistenAsk.setState({ ask: null });

/** the DJ chose "this device's speaker anyway" — for this tab's session only (a reload asks again) */
let speakerOk = false;
export const speakerChosen = () => speakerOk;
export function chooseSpeaker(on: boolean) {
  speakerOk = on;
}

/** iPhone / iPad: a web page has one audio output whatever the browser reports (lib/booth/sources/spotify.ts) */
export const appleMobile = (ua = typeof navigator !== "undefined" ? navigator.userAgent : "") =>
  /iPad|iPhone|iPod/.test(ua) ||
  (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
