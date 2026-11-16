"use client";
import type { Song } from "@tdj/core";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { clampMark, useMarks } from "@/lib/songMarks";
import { toast } from "@/lib/toast";
import { Group } from "../Form";
import { markText } from "./SongFacts";

/** where a side sounds now: the second in its recording and whether it plays (null: not playing here) */
export type PositionFn = () => { sec: number; playing: boolean } | null;

/**
 * 2026-11 — "Singer comes in at 0:41", "First downbeat at 0:00.6": the DJ marks them by tapping "Mark now" while the
 * side plays (the Booth, or a pre-listen of the file), and "Measure" reads the music's start, first beat and first
 * downbeat from the DJ's file. A mark is per side, on this device, and the DJ's own wins over a measurement.
 */
export function MarksGroup({
  song,
  position,
  onMeasure,
  lyricsHint,
}: {
  song: Song;
  position?: PositionFn;
  /** measure from the DJ's file (the Booth with a linked file); resolves to why not, or null */
  onMeasure?: () => Promise<string | null>;
  /** the synced lyrics' first sung line (a hint for the singer's entry) */
  lyricsHint?: number | null;
}) {
  const m = useMarks((s) => s.marks[song.id]);
  const set = useMarks((s) => s.set);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const now = () => {
    const p = position?.();
    if (!p) {
      toast(t("song.mark_needs_playing"));
      return null;
    }
    return clampMark(p.sec, song.durationSec);
  };
  const bpm = song.tempo?.bpm ?? song.audio?.bpm ?? song.deezer?.bpm ?? song.bpm ?? undefined;
  const rows: Array<{
    key: string;
    label: string;
    value: number | undefined;
    from?: string;
    mark?: () => void;
    clear?: () => void;
  }> = [];
  if (song.vocal)
    rows.push({
      key: "singer",
      label: t("song.singer_in_label"),
      value: m?.singerSec,
      from: m?.singerSec !== undefined ? t("song.your_mark") : undefined,
      mark: () => {
        const at = now();
        if (at !== null) {
          set(song.id, { singerSec: at, singerFrom: "dj" });
          toast(t("song.singer_marked", { at: markText(at) }));
        }
      },
      clear: () => set(song.id, { singerSec: undefined, singerFrom: undefined }),
    });
  rows.push({
    key: "downbeat",
    label: t("song.downbeat_label"),
    value: m?.downbeatSec,
    from:
      m?.downbeatSec === undefined
        ? undefined
        : m.beatFrom === "dj"
          ? t("song.your_mark")
          : t("song.measured_file", { pct: Math.round((m.confidence ?? 0) * 100) }),
    mark: () => {
      const at = now();
      if (at !== null) {
        set(song.id, { downbeatSec: at, bpm: m?.bpm ?? bpm, beatFrom: "dj" });
        toast(t("song.downbeat_marked", { at: markText(at) }));
      }
    },
    clear: () => set(song.id, { downbeatSec: undefined, firstBeatSec: undefined, beatFrom: undefined }),
  });
  if (m?.musicStartSec !== undefined)
    rows.push({
      key: "start",
      label: t("song.music_starts"),
      value: m.musicStartSec,
      from: t("song.measured"),
    });
  return (
    <Group
      header={t("song.marks")}
      footer={
        lyricsHint != null && song.vocal && m?.singerSec === undefined
          ? t("song.lyrics_hint", { at: markText(lyricsHint) })
          : !position
            ? t("song.marks_footer_booth")
            : undefined
      }
      data-testid="song-marks"
    >
      {rows.map((r) => (
        <div key={r.key} className="cell" data-testid={`song-mark-${r.key}`}>
          <span className="min-w-0 flex-1">
            <span className="block">{r.label}</span>
            <span className="text-footnote block text-[var(--label-2)]">
              {r.value !== undefined
                ? `${markText(r.value)}${r.from ? ` · ${r.from}` : ""}`
                : t("song.not_marked")}
            </span>
          </span>
          {r.value !== undefined && r.clear && (
            <button type="button" className="btn-plain min-h-11 px-2" onClick={r.clear}>
              {t("song.clear")}
            </button>
          )}
          {position && r.mark && (
            <button
              type="button"
              className="btn-plain min-h-11 px-2 text-[var(--tint)]"
              onClick={r.mark}
              data-testid={`song-mark-${r.key}-now`}
            >
              {t("song.mark_now")}
            </button>
          )}
        </div>
      ))}
      {onMeasure && (
        <button
          type="button"
          className="cell cell-tap w-full justify-center text-[var(--tint)] disabled:text-[var(--label-3)]"
          disabled={busy}
          data-testid="song-measure"
          data-result={result ?? undefined}
          onClick={async () => {
            setBusy(true);
            try {
              const why = await onMeasure();
              setResult(why ?? "ok");
              toast(why ?? t("song.measured_done"));
            } catch (e) {
              setResult(String(e));
              toast(t("song.measure_nothing"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t("song.measuring") : t("song.measure_file")}
        </button>
      )}
    </Group>
  );
}
