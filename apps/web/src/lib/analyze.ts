"use client";
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
    else w.fail(new Error(e.data.error ?? "Analysis failed"));
  };
  worker.onerror = () => {
    for (const w of waiting.values()) w.fail(new Error("The analysis worker crashed"));
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
    if (!j?.url) throw new Error("no preview available right now");
    src = j.url as string;
  }
  const r = await fetch(src, { mode: "cors" });
  if (!r.ok) throw new Error(`Preview request failed (${r.status})`);
  const buf = await r.arrayBuffer();
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("This browser cannot decode audio");
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
  return `${k} ${a.mode} · ${Math.round(a.bpm)} BPM`;
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
    if (!quiet) toast(`No preview for ${song.title}: use "Find on services" first.`);
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
    if (!quiet) toast(`Could not analyse ${song.title}: ${(e as Error).message}`);
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
      ? `Analysed ${n} ${n === 1 ? "track" : "tracks"}${skipped ? ` · ${skipped} without a preview` : ""}`
      : skipped
        ? `${skipped} ${skipped === 1 ? "track has" : "tracks have"} no preview yet: use "Find on services"`
        : "Every track in this tanda is already analysed",
  );
  return n;
}
