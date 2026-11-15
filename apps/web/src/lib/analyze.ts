"use client";
import { t } from "@/lib/i18n";
import { effectiveSong } from "./audio";
import { previewEndpoint } from "./player";
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

/** Decode on the main thread (workers have no AudioContext), downmix to mono, analyse in the worker. */
export async function analyzePreview(previewUrl: string, rhythm?: string): Promise<AudioFeatures> {
  // our /api/preview?json=1 answers { url } with the provider's current signed link; anything else is fetched as is
  let src = previewUrl;
  if (previewUrl.startsWith("/api/preview")) {
    const j = await fetch(previewUrl)
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    if (!j?.url) throw new Error(t("analyze.no_preview_available_right_now"));
    src = j.url as string;
  }
  const r = await fetch(src, { mode: "cors" });
  if (!r.ok) throw new Error(t("analyze.preview_request_failed", { status: r.status }));
  const buf = await r.arrayBuffer();
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error(t("analyze.this_browser_cannot_decode_audio"));
  const ctx = new Ctx();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } finally {
    void ctx.close().catch(() => {});
  }
  const n = decoded.length;
  const pcm = new Float32Array(n);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const ch = decoded.getChannelData(c);
    for (let i = 0; i < n; i++) pcm[i]! += ch[i]! / decoded.numberOfChannels;
  }
  const id = String(++seq);
  const w = getWorker();
  return new Promise<AudioFeatures>((ok, fail) => {
    waiting.set(id, { ok, fail });
    w.postMessage({ id, pcm, sampleRate: decoded.sampleRate, rhythm }, [pcm.buffer]);
  });
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
/** True while this song is being analysed (for spinners). */
export const isAnalysing = (id: string) => inFlight.has(id);

/**
 * "Analyse in browser": preview → features → user database `songs[id].audio` → toast "Analysed: F♯ minor · 118 BPM".
 * Returns the features, or null when the song has no preview or the analysis failed (the toast says so).
 */
export async function analyseSong(song: Song, rhythm?: string, quiet = false): Promise<AudioFeatures | null> {
  const st = useStore.getState();
  const eff = effectiveSong(song, st.overrides);
  const url = eff.resolved?.previewUrl ? `${previewEndpoint(eff.resolved)}&json=1` : null;
  if (!url) {
    if (!quiet) toast(t("analyze.no_preview_for_use_find_on", { title: song.title }));
    return null;
  }
  if (inFlight.has(song.id)) return null;
  inFlight.add(song.id);
  try {
    const features = await analyzePreview(url, rhythm ?? song.rhythm);
    useStore.getState().updateOverrides((o) => ({
      ...o,
      songs: { ...(o.songs ?? {}), [song.id]: { ...(o.songs?.[song.id] ?? {}), audio: features } },
    }));
    if (!quiet) toast(`Analysed: ${featuresSummary(features)}`);
    return features;
  } catch (e) {
    if (!quiet) toast(t("analyze.could_not_analyse", { title: song.title, message: (e as Error).message }));
    return null;
  } finally {
    inFlight.delete(song.id);
  }
}

/** "Analyse all tracks" on a tanda: sequential, one toast at the end. */
export async function analyseTanda(songs: Song[], rhythm: string): Promise<number> {
  let n = 0;
  let skipped = 0;
  for (const s of songs) {
    const eff = effectiveSong(s, useStore.getState().overrides);
    if (eff.audio) continue;
    if (!eff.resolved?.previewUrl) {
      skipped++;
      continue;
    }
    if (await analyseSong(s, rhythm, true)) n++;
  }
  toast(
    n
      ? `Analysed ${n} ${n === 1 ? "track" : "tracks"}${skipped ? ` ${t("analyze.without_a_preview", { skipped })}` : ""}`
      : skipped
        ? t("analyze.no_preview_yet_use_find_on", {
            skipped,
            p1: skipped === 1 ? t("analyze.track_has") : t("analyze.tracks_have"),
          })
        : t("analyze.every_track_in_this_tanda_is"),
  );
  return n;
}
