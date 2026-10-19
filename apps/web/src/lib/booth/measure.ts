"use client";
import { type Measurement, measurePcm } from "./loudness";

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<string, { ok: (m: Measurement) => void; fail: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  try {
    worker = new Worker(new URL("../../workers/loudness.worker.ts", import.meta.url));
  } catch {
    return null;
  }
  worker.onmessage = (e: MessageEvent<{ id: string; measurement?: Measurement; error?: string }>) => {
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    if (e.data.measurement) w.ok(e.data.measurement);
    else w.fail(new Error(e.data.error ?? "Measurement failed"));
  };
  worker.onerror = () => {
    for (const w of waiting.values()) w.fail(new Error("The loudness worker crashed"));
    waiting.clear();
    worker = null;
  };
  return worker;
}

/** Copies the channels out of the buffer and measures them in the worker (main thread when workers are unavailable). */
export async function measureBuffer(buffer: AudioBuffer): Promise<Measurement> {
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
    const ch = new Float32Array(buffer.length);
    buffer.copyFromChannel(ch, c);
    channels.push(ch);
  }
  const w = getWorker();
  if (!w) return measurePcm(channels, buffer.sampleRate);
  const id = String(++seq);
  return new Promise<Measurement>((ok, fail) => {
    waiting.set(id, { ok, fail });
    w.postMessage(
      { id, channels, sampleRate: buffer.sampleRate },
      channels.map((c) => c.buffer),
    );
  }).catch(() => {
    // the worker failed (CSP, bundling): measure here instead
    const again: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
      const ch = new Float32Array(buffer.length);
      buffer.copyFromChannel(ch, c);
      again.push(ch);
    }
    return measurePcm(again, buffer.sampleRate);
  });
}
