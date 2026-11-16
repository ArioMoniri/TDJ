"use client";
import type { Song } from "@tdj/core";
import { useRef, useState } from "react";
import { tapTempo } from "@/lib/floor";
import { t } from "@/lib/i18n";
import { clampMark, useMarks } from "@/lib/songMarks";
import { toast } from "@/lib/toast";
import { Group } from "../Form";
import type { PositionFn } from "./MarksGroup";
import { markText } from "./SongFacts";

/**
 * 2026-11 — lock the beat by ear while the side plays: "Mark downbeat" puts bar 1 where it sounds now (the tempo
 * stays what the estimate or the file said), "Tap tempo" takes the tempo from the DJ's taps on the beat (four or
 * more; the first tap is the downbeat). Both are the DJ's own marks (they win over a measurement).
 */
export function BeatTools({
  song,
  position,
  beat,
}: {
  song: Song;
  position?: PositionFn;
  beat: { bpm: number; downbeatSec: number; locked: boolean };
}) {
  const set = useMarks((s) => s.set);
  const taps = useRef<Array<{ ms: number; sec: number }>>([]);
  const [count, setCount] = useState(0);
  const now = () => {
    const p = position?.();
    if (!p) {
      toast(t("song.mark_needs_playing"));
      return null;
    }
    return clampMark(p.sec, song.durationSec);
  };
  const markDownbeat = () => {
    const at = now();
    if (at === null) return;
    set(song.id, { downbeatSec: at, bpm: beat.bpm, beatFrom: "dj" });
    toast(t("now.downbeat_set", { at: markText(at) }));
  };
  const tap = () => {
    const at = now();
    if (at === null) return;
    const ms = performance.now();
    const prev = taps.current[taps.current.length - 1];
    // a pause of more than 2 s starts a new count
    if (prev && ms - prev.ms > 2000) taps.current = [];
    taps.current.push({ ms, sec: at });
    setCount(taps.current.length);
    const bpm = tapTempo(taps.current.map((x) => x.ms));
    if (bpm) {
      set(song.id, { bpm, downbeatSec: taps.current[0]!.sec, beatFrom: "dj" });
      if (taps.current.length === 4) toast(t("now.tempo_set", { bpm: Math.round(bpm) }));
    }
  };
  return (
    <Group
      footer={
        beat.locked
          ? t("now.beat_locked", { bpm: Math.round(beat.bpm) })
          : count > 0 && count < 4
            ? t("now.tap_more", { n: 4 - count })
            : undefined
      }
    >
      <div className="cell gap-2">
        <button
          type="button"
          className="btn btn-ghost min-h-11 flex-1"
          onClick={markDownbeat}
          data-testid="beat-mark-downbeat"
        >
          {t("now.mark_downbeat")}
        </button>
        <button type="button" className="btn btn-ghost min-h-11 flex-1" onClick={tap} data-testid="beat-tap">
          {t("now.tap_tempo")}
        </button>
      </div>
    </Group>
  );
}
