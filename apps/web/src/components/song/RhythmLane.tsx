"use client";
import type { Song } from "@tdj/core";
import { useMemo, useRef } from "react";
import { t } from "@/lib/i18n";
import type { LyricLine } from "@/lib/lyrics";
import { gridOf, useMarks } from "@/lib/songMarks";
import type { PositionFn } from "./MarksGroup";
import { markText } from "./SongFacts";
import { usePosition } from "./usePosition";

const PX = 56; // px per second

/**
 * 2026-11 — the rhythm lane of the play view: the beat grid (from the side's tempo and its first downbeat), a bar
 * line every bar, a phrase every 8 bars, the singer's entry and the synced lyrics' lines, scrolling under a fixed
 * playhead on the Booth's own clock (each frame reads the engine: a seek or a pause shows at once, nothing drifts).
 */
export function RhythmLane({
  song,
  durationSec,
  position,
  lines,
}: {
  song: Song;
  durationSec: number;
  position?: PositionFn;
  lines?: LyricLine[];
}) {
  const marks = useMarks((s) => s.marks[song.id]);
  const grid = useMemo(() => gridOf(marks, song.rhythm, durationSec), [marks, song.rhythm, durationSec]);
  const strip = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const p = usePosition(position, {
    stepSec: 0.25,
    onFrame: (now) => {
      const el = strip.current;
      const w = box.current?.clientWidth ?? 0;
      if (el) el.style.transform = `translate3d(${Math.round(w / 2 - (now?.sec ?? 0) * PX)}px,0,0)`;
    },
  });
  const phraseNo = (sec: number) => (grid ? grid.phrases.indexOf(sec) + 1 : 0);
  const bar = grid?.bars ? new Set(grid.bars) : new Set<number>();
  const phrase = grid?.phrases ? new Set(grid.phrases) : new Set<number>();
  const beat = p && grid ? beatAt(grid.beats, grid.bars, p.sec) : null;
  return (
    <section className="min-w-0" data-testid="rhythm-lane" data-grid={grid ? "1" : undefined}>
      <h2 className="section-head flex items-baseline justify-between gap-2">
        <span>{t("song.rhythm_lane")}</span>
        <span className="normal-case tabular-nums text-[var(--label-2)]" data-testid="rhythm-lane-pos">
          {p ? markText(p.sec) : "0:00.0"}
          {beat ? ` · ${t("song.bar_beat", { bar: beat.bar, beat: beat.beat })}` : ""}
        </span>
      </h2>
      <div ref={box} className="group-inset relative h-24 overflow-hidden" aria-hidden>
        <div ref={strip} className="absolute inset-y-0 left-0" style={{ width: durationSec * PX }}>
          {grid?.beats.map((b) => (
            <span
              key={b}
              className="absolute bottom-3"
              style={{
                left: b * PX,
                width: phrase.has(b) ? 3 : bar.has(b) ? 2 : 1,
                height: phrase.has(b) ? 56 : bar.has(b) ? 36 : 18,
                background: phrase.has(b) ? "var(--tint)" : bar.has(b) ? "var(--label)" : "var(--label-3)",
              }}
            />
          ))}
          {grid?.phrases.map((ph) => (
            <span
              key={`p${ph}`}
              className="text-caption2 absolute top-1 text-[var(--tint)]"
              style={{ left: ph * PX + 4 }}
            >
              {t("song.phrase", { n: phraseNo(ph) })}
            </span>
          ))}
          {lines?.map((l) =>
            l.text ? (
              <span
                key={`l${l.at}`}
                className="absolute bottom-0 h-2 w-2 rounded-full bg-[var(--cue)]"
                style={{ left: l.at * PX - 4 }}
              />
            ) : null,
          )}
          {marks?.singerSec !== undefined && (
            <span
              className="text-caption2 absolute top-6 rounded px-1 text-white"
              style={{ left: marks.singerSec * PX, background: "var(--cue)" }}
              data-testid="rhythm-lane-singer"
            >
              {t("song.voice_marker")}
            </span>
          )}
        </div>
        <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-[var(--destructive)]" />
      </div>
      <p className="section-foot">
        {grid
          ? t("song.lane_footer", { bpm: Math.round(marks!.bpm!), at: markText(marks!.downbeatSec!) })
          : marks?.downbeatSec !== undefined
            ? t("song.lane_no_tempo")
            : t("song.lane_no_grid")}
      </p>
    </section>
  );
}

/** which bar and beat of it is sounding (1-based) */
function beatAt(beats: number[], bars: number[], sec: number): { bar: number; beat: number } | null {
  let b = -1;
  for (let i = 0; i < beats.length && beats[i]! <= sec; i++) b = i;
  if (b < 0) return null;
  let bar = 0;
  let start = -1;
  for (let i = 0; i < bars.length && bars[i]! <= beats[b]!; i++) {
    bar = i + 1;
    start = bars[i]!;
  }
  if (!bar) return null;
  const beat = beats.slice(beats.indexOf(start), b + 1).length;
  return { bar, beat };
}
