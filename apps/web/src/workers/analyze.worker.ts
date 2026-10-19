/// <reference lib="webworker" />
import { analyzePcm } from "@tdj/core";

/** Runs the pure-TS DSP off the main thread: { pcm, sampleRate, rhythm } → AudioFeatures. */
self.onmessage = (
  e: MessageEvent<{ id: string; pcm: Float32Array; sampleRate: number; rhythm?: string }>,
) => {
  const { id, pcm, sampleRate, rhythm } = e.data;
  try {
    const features = analyzePcm(pcm, sampleRate, { rhythmHint: rhythm });
    (self as unknown as Worker).postMessage({ id, features });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
