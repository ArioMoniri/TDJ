"use client";
import { create } from "zustand";
import { t } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/en";
import { effectiveSong } from "./audio";
import {
  MeasureError,
  type MeasureFailure,
  measureAction,
  measureBytes,
  measureFailure,
  withTimeout,
} from "./measureSource";
import { useStore } from "./store";
import { toast } from "./toast";
import type { AudioFeatures, Song } from "./types";

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<string, { ok: (f: AudioFeatures) => void; fail: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../workers/analyze.worker.ts", import.meta.url));
  worker.onmessage = (e: MessageEvent<{ id: string; features?: AudioFeatures; error?: string }>) => {
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    if (e.data.features) w.ok(e.data.features);
    else w.fail(new Error(e.data.error ?? t("analyze.analysis_failed")));
  };
  worker.onerror = () => {
    for (const w of waiting.values()) w.fail(new Error(t("analyze.the_analysis_worker_crashed")));
    waiting.clear();
    worker = null;
  };
  return worker;
}

/** Decode the bytes (an offline context: no user gesture needed), downmix to mono, analyse in the worker. */
export async function analyzeBytes(bytes: ArrayBuffer, rhythm?: string): Promise<AudioFeatures> {
  const w = window as unknown as {
    OfflineAudioContext?: typeof OfflineAudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
    AudioContext?: typeof AudioContext;
  };
  const Off = w.OfflineAudioContext ?? w.webkitOfflineAudioContext;
  let decoded: AudioBuffer;
  try {
    if (Off) decoded = await new Off(1, 1, 44100).decodeAudioData(bytes.slice(0));
    else if (w.AudioContext) {
      const ctx = new w.AudioContext();
      try {
        decoded = await ctx.decodeAudioData(bytes.slice(0));
      } finally {
        void ctx.close().catch(() => {});
      }
    } else throw new MeasureError("no-audio");
  } catch (e) {
    if (e instanceof MeasureError) throw e;
    throw new MeasureError("decode");
  }
  const n = decoded.length;
  const pcm = new Float32Array(n);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const ch = decoded.getChannelData(c);
    for (let i = 0; i < n; i++) pcm[i]! += ch[i]! / decoded.numberOfChannels;
  }
  const id = String(++seq);
  const wk = getWorker();
  return new Promise<AudioFeatures>((ok, fail) => {
    waiting.set(id, { ok, fail });
    wk.postMessage({ id, pcm, sampleRate: decoded.sampleRate, rhythm }, [pcm.buffer]);
  });
}

/** (kept for callers with a URL) a clip by URL: through the measure ladder's network rules */
export async function analyzePreview(previewUrl: string, rhythm?: string): Promise<AudioFeatures> {
  const r = await fetch(previewUrl);
  if (!r.ok) throw new MeasureError(r.status === 404 ? "gone" : "network");
  return analyzeBytes(await r.arrayBuffer(), rhythm);
}

const NOTE_NAMES: Record<string, string> = { "C#": "C♯", "D#": "D♯", "F#": "F♯", "G#": "G♯", "A#": "A♯" };
/** "F♯m · 11A" */
export function keyLabel(a: Pick<AudioFeatures, "key" | "mode" | "camelot">): string {
  const k = NOTE_NAMES[a.key] ?? a.key;
  return `${k}${a.mode === "minor" ? "m" : ""} · ${a.camelot}`;
}
/** "F♯ minor · 118 BPM" */
export function featuresSummary(a: AudioFeatures): string {
  const k = NOTE_NAMES[a.key] ?? a.key;
  return t("analyze.bpm", { k, mode: a.mode, p1: Math.round(a.bpm) });
}

/* ---- store-aware helpers ---- */

const inFlight = new Set<string>();
/** QA fix 2026-11: how far each side's measuring is (0..1), for "Measuring… 40 %" on its row */
export const useMeasuring = create<{ progress: Record<string, number> }>(() => ({ progress: {} }));
const setProgress = (id: string, p: number | null) =>
  useMeasuring.setState((s) => {
    const progress = { ...s.progress };
    if (p === null) delete progress[id];
    else progress[id] = p;
    return { progress };
  });
/** True while this song is being analysed (for spinners). */
export const isAnalysing = (id: string) => inFlight.has(id);
/** a measure must finish in this long (the clip, the decode and the analysis) */
export const MEASURE_TIMEOUT_MS = 25_000;

/** the one line a failure says, and its action */
export function measureMessage(reason: MeasureFailure, title: string): string {
  return t(`analyze.fail_${reason.replace("-", "_")}` as MsgKey, { title });
}

/**
 * "Measure from your file": the DJ's file, else the 30 s clip through the app (lib/measureSource ladder) → features →
 * the user database `songs[id].audio` → a toast with what it found (BPM, key, energy, loudness, intro). A failure says
 * why in one line with its action ("Find it on a service", "Link your music folder", "Try again").
 */
export async function analyseSong(
  song: Song,
  rhythm?: string,
  quiet = false,
  actions: { find?: () => void } = {},
): Promise<AudioFeatures | null> {
  if (inFlight.has(song.id)) {
    if (!quiet) toast(measureMessage("busy", song.title));
    return null;
  }
  const eff = effectiveSong(song, useStore.getState().overrides);
  inFlight.add(song.id);
  setProgress(song.id, 0);
  try {
    const run = async () => {
      const { localFileOf } = await import("./booth/store");
      const { bytes } = await measureBytes(eff, {
        localFile: localFileOf,
        fetch: (u, i) => fetch(u, i),
        onProgress: (p) => setProgress(song.id, 0.1 + 0.5 * p),
      });
      setProgress(song.id, 0.7);
      return analyzeBytes(bytes, rhythm ?? song.rhythm);
    };
    const features = await withTimeout(run(), MEASURE_TIMEOUT_MS);
    useStore.getState().updateOverrides((o) => ({
      ...o,
      songs: { ...(o.songs ?? {}), [song.id]: { ...(o.songs?.[song.id] ?? {}), audio: features } },
    }));
    if (!quiet) toast(t("analyze.measured", { title: song.title, summary: measuredSummary(features) }));
    return features;
  } catch (e) {
    const reason = measureFailure(e);
    if (!quiet) {
      const act = measureAction(reason);
      if (act === "find" && actions.find)
        toast(measureMessage(reason, song.title), actions.find, t("analyze.find"));
      else if (act === "retry")
        toast(
          measureMessage(reason, song.title),
          () => void analyseSong(song, rhythm, quiet, actions),
          t("analyze.try_again"),
        );
      else toast(measureMessage(reason, song.title));
    }
    return null;
  } finally {
    inFlight.delete(song.id);
    setProgress(song.id, null);
  }
}

/** "118 BPM · F♯ minor · energy 62 · −14.2 dB · intro 1.2 s" */
export function measuredSummary(a: AudioFeatures): string {
  return [
    `${Math.round(a.bpm)} BPM`,
    `${NOTE_NAMES[a.key] ?? a.key} ${a.mode}`,
    t("analyze.energy_n", { n: Math.round(a.energy) }),
    `${a.loudnessDb.toFixed(1).replace("-", "−")} dB`,
    a.introSec > 0.05 ? t("analyze.intro_s", { s: a.introSec.toFixed(1) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Measure all" on a tanda: sequential, one toast at the end (the sides with nothing to measure counted apart). */
export async function analyseTanda(songs: Song[], rhythm: string): Promise<number> {
  let n = 0;
  let failed = 0;
  for (const s of songs) {
    const eff = effectiveSong(s, useStore.getState().overrides);
    if (eff.audio) continue;
    if (await analyseSong(s, rhythm, true)) n++;
    else failed++;
  }
  toast(
    n
      ? `${t("analyze.measured_n", { n })}${failed ? ` ${t("analyze.without_a_preview", { skipped: failed })}` : ""}`
      : failed
        ? t("analyze.no_preview_yet_use_find_on", {
            skipped: failed,
            p1: failed === 1 ? t("analyze.track_has") : t("analyze.tracks_have"),
          })
        : t("analyze.every_track_in_this_tanda_is"),
  );
  return n;
}
