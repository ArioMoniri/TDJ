/// <reference lib="webworker" />
import { measurePcm } from "../lib/booth/loudness";

/** BS.1770 measurement off the main thread: { id, channels, sampleRate } → Measurement. */
self.onmessage = (e: MessageEvent<{ id: string; channels: Float32Array[]; sampleRate: number }>) => {
  const { id, channels, sampleRate } = e.data;
  try {
    (self as unknown as Worker).postMessage({ id, measurement: measurePcm(channels, sampleRate) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
