"use client";
import "./compose-db.css";
import "./indicators.css";
import { type Cortina, ERA_MARK_LABEL, ERA_MARKS, type EraMark } from "@tdj/core";
import { memo } from "react";
import { useIndicators } from "@/lib/booth/indicatorPrefs";
import { ERA_CLASSES, eraOf, eraOfSong } from "@/lib/era";
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

type EraSong = Pick<Song, "orchestraId" | "orchestra" | "vocal" | "year" | "yearApprox">;
type Entity = Song | Cortina | null | undefined;

/** the four bars (the Booth's glyph); `bars` of them lit */
function Bars({ cls, bars, ...rest }: { cls: EraMark; bars: number } & Record<string, unknown>) {
  return (
    <span className="booth-era" data-era={cls} {...rest}>
      {[1, 2, 3, 4].map((b) => (
        <i key={b} data-on={b <= bars || undefined} />
      ))}
    </span>
  );
}

/**
 * Round 22 — the era indicator: where a side sits in its orchestra's best years, from the DJ's heatmap grades
 * (Database › Orchestras; the shipped defaults until edited). One component in two looks:
 * - the chip (Compose, Database, search): `song`, read with the DJ's grade edits; off with `settings.eraBadges`;
 * - the four bars (the Booth): `entity`, read from the grade stamped on the side; off with the Booth's era indicator.
 * Hidden for an orchestra the heatmap does not grade.
 */
export const EraBadge = memo(function EraBadge(
  props:
    | {
        song: EraSong;
        compact?: boolean;
        /** a dot on the corner of the artwork */
        overlay?: boolean;
        className?: string;
      }
    | {
        /** the Booth's four-bar glyph for a side or cortina */
        entity: Entity;
        /** keep an empty slot when there is no era, so rows stay aligned */
        slot?: boolean;
      },
) {
  const edits = useStore((s) => s.overrides.heatmap);
  const chipOn = useStore((s) => s.settings.eraBadges !== false);
  const barsOn = useIndicators().era;
  if ("entity" in props) {
    const era = eraOf(props.entity);
    if (!barsOn) return null;
    if (!era) return props.slot ? <span className="booth-era-slot" aria-hidden /> : null;
    const glyph = (
      <Bars
        cls={era.cls}
        bars={era.bars}
        role="img"
        aria-label={`Era: ${era.label} (${era.why})`}
        data-hint={`Era: ${era.why}. ${ERA_CLASSES.find((c) => c.cls === era.cls)?.explain ?? ""}`}
        data-testid="booth-era"
      />
    );
    return props.slot ? <span className="booth-era-slot">{glyph}</span> : glyph;
  }
  const { song, compact = false, overlay = false, className = "" } = props;
  const e = chipOn ? eraOfSong(song, edits) : undefined;
  if (!e) return null;
  const text = `${e.year} is ${WHY[e.mark]} (${song.vocal ? "with a singer" : "instrumental"}).`;
  return (
    <Tip text={text} className={`${overlay ? "era-overlay" : ""} ${className}`}>
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

/** the four marks with what they mean: chips (Compose, Database) or the Booth's bars with one line each */
export function EraLegend({
  className = "",
  look = "chips",
}: {
  className?: string;
  look?: "chips" | "bars";
}) {
  if (look === "bars")
    return (
      <div className={`booth-legend ${className}`} data-testid="booth-era-legend">
        {ERA_CLASSES.map((c) => (
          <div key={c.cls}>
            <Bars cls={c.cls} bars={c.bars} aria-hidden />
            <span>
              <b className="font-semibold">{c.label}</b>
              <span className="text-[var(--label-2)]"> · {c.explain}</span>
            </span>
          </div>
        ))}
      </div>
    );
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
