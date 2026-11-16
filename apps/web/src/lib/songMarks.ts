"use client";
import { BEATS_PER_BAR, beatGrid, measureTiming, type Timing } from "@tdj/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * 2026-11 — where things happen inside a side, per song id, on this device: the music's start, the first beat and
 * first downbeat (measured from the DJ's own file: a 30 s clip's seconds are not the recording's) and the singer's
 * entry (the DJ's "Mark now" while it plays; the synced lyrics' first line is shown as a hint, never stored as a
 * measurement). The DJ's own mark always wins over a measurement and survives a new measurement.
 */
export interface SongMarks {
  musicStartSec?: number;
  firstBeatSec?: number;
  downbeatSec?: number;
  bpm?: number;
  confidence?: number;
  /** where the beat numbers came from */
  beatFrom?: "file" | "dj";
  singerSec?: number;
  singerFrom?: "dj";
  /** the DJ's shift of the matched video against the recording (s; + = the video runs later) */
  videoOffsetSec?: number;
  /** the DJ's shift of synced lyrics against the recording (s) */
  lyricsOffsetSec?: number;
  measuredAt?: string;
}

interface MarksState {
  marks: Record<string, SongMarks>;
  set: (id: string, patch: Partial<SongMarks> | null) => void;
}

const MAX = 2000;
export const useMarks = create<MarksState>()(
  persist(
    (set) => ({
      marks: {},
      set: (id, patch) =>
        set((s) => {
          const marks = { ...s.marks };
          if (patch === null) delete marks[id];
          else {
            const next = { ...(marks[id] ?? {}), ...patch };
            for (const k of Object.keys(next) as Array<keyof SongMarks>)
              if (next[k] === undefined) delete next[k];
            marks[id] = next;
          }
          const keys = Object.keys(marks);
          if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) delete marks[k];
          return { marks };
        }),
    }),
    {
      name: "tdj-song-marks-v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** a measurement, merged under the DJ's own marks (a DJ's beat is never overwritten) */
export function withMeasurement(prev: SongMarks | undefined, m: Timing, at = new Date()): SongMarks {
  const p = prev ?? {};
  const own = p.beatFrom === "dj";
  return {
    ...p,
    musicStartSec: m.musicStartSec,
    ...(own
      ? {}
      : {
          firstBeatSec: m.firstBeatSec,
          downbeatSec: m.firstDownbeatSec,
          bpm: m.bpm,
          confidence: m.confidence,
          beatFrom: "file" as const,
        }),
    measuredAt: at.toISOString(),
  };
}

/** mono PCM of a decoded buffer (channels averaged) */
export function monoOf(b: AudioBuffer): Float32Array {
  const n = b.length;
  const out = new Float32Array(n);
  const ch = Math.max(1, Math.min(2, b.numberOfChannels));
  for (let c = 0; c < ch; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) out[i]! += d[i]! / ch;
  }
  return out;
}

/** measure a decoded file's timing (the first 90 s) with the side's tempo when it has one */
export function measureBufferTiming(
  b: AudioBuffer,
  o: { bpm?: number | null; rhythm?: string },
): Timing | null {
  const mono = monoOf(b);
  const head = mono.subarray(0, Math.min(mono.length, Math.round(90 * b.sampleRate)));
  // the file is the truth: its own tempo first (a catalogue BPM is an estimate), the side's tempo when none reads
  return measureTiming(head, b.sampleRate, { rhythm: o.rhythm }) ?? measureTiming(head, b.sampleRate, o);
}

/** the side's grid when its downbeat and tempo are known */
export function gridOf(m: SongMarks | undefined, rhythm: string, durationSec: number) {
  if (!m?.bpm || m.downbeatSec === undefined) return null;
  return beatGrid({
    downbeatSec: m.downbeatSec,
    bpm: m.bpm,
    durationSec,
    beatsPerBar: BEATS_PER_BAR[rhythm] ?? 4,
  });
}

/** "a 2 s lead-in", "on the beat", clamp a mark into the recording */
export const clampMark = (sec: number, durationSec?: number) =>
  Math.round(Math.max(0, Math.min(durationSec ?? 3600, sec)) * 100) / 100;
