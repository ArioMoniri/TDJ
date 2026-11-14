"use client";
import "./compose-db.css";
import { ERA_MARK_LABEL, ERA_MARKS, type EraMark } from "@tdj/core";
import { memo } from "react";
import { eraOfSong } from "@/lib/era";
import { useStore } from "@/lib/store";
import type { Song } from "@/lib/types";
import { Tip } from "./Tip";

const SHORT: Record<EraMark, string> = { best: "Best", good: "Good", weak: "Uneven", outside: "Outside" };
const WHY: Record<EraMark, string> = {
  best: "the orchestra's best years",
  good: "good years for the orchestra",
  weak: "uneven years: single tracks rather than whole tandas",
  outside: "outside the orchestra's best years",
};

/**
 * Round 22 — the era indicator: where a side sits in its orchestra's best years, from the DJ's heatmap grades
 * (Database › Orchestras; the shipped defaults until edited). Hidden when the DJ turns era badges off, and for an
 * orchestra the heatmap does not grade.
 */
export const EraBadge = memo(function EraBadge({
  song,
  compact = false,
  className = "",
}: {
  song: Pick<Song, "orchestraId" | "orchestra" | "vocal" | "year" | "yearApprox">;
  compact?: boolean;
  className?: string;
}) {
  const edits = useStore((s) => s.overrides.heatmap);
  const on = useStore((s) => s.settings.eraBadges !== false);
  const e = on ? eraOfSong(song, edits) : undefined;
  if (!e) return null;
  const text = `${e.year} is ${WHY[e.mark]} (${song.vocal ? "with a singer" : "instrumental"}).`;
  return (
    <Tip text={text} className={className}>
      <span
        className="era-badge"
        data-mark={e.mark}
        data-compact={compact || undefined}
        data-testid="era-badge"
        role="img"
        aria-label={ERA_MARK_LABEL[e.mark]}
      >
        {compact ? null : SHORT[e.mark]}
      </span>
    </Tip>
  );
});

/** the four marks with what they mean */
export function EraLegend({ className = "" }: { className?: string }) {
  return (
    <span className={`flex flex-wrap items-center gap-2 ${className}`} data-testid="era-legend">
      {ERA_MARKS.map((m) => (
        <Tip key={m} text={`${ERA_MARK_LABEL[m]}: ${WHY[m]}.`}>
          <span className="era-badge" data-mark={m}>
            {SHORT[m]}
          </span>
        </Tip>
      ))}
    </span>
  );
}
