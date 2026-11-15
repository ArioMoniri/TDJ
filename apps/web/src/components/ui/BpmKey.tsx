"use client";
import { t } from "@/lib/i18n";
import "./indicators.css";
import type { Cortina, Song } from "@tdj/core";
import { memo } from "react";
import { INDICATORS } from "@/lib/booth/indicatorList";
import { useIndicators } from "@/lib/booth/indicatorPrefs";
import { bpmOf, energyOf, keyOf } from "@/lib/booth/songInfo";

/* Round 22: the BPM, key and energy chips, each with where its number came from (hover / long-press). */
type Entity = Song | Cortina | null | undefined;
const explain = (id: string) => INDICATORS.find((i) => i.id === id)?.explain ?? "";

/** "122 BPM" and "1A" chips, the source on hover / long-press; `compact` prints "122 · 1A" for a row. */
export const BpmKey = memo(function BpmKey({ e, compact = false }: { e: Entity; compact?: boolean }) {
  const ind = useIndicators();
  const bpm = ind.bpm ? bpmOf(e) : null;
  const key = ind.key ? keyOf(e) : null;
  if (!ind.bpm && !ind.key) return null;
  if (compact) {
    const parts: string[] = [];
    // wave 2: an unknown value is left out (the "– · –" placeholder read as a broken cell); the hint says it
    if (ind.bpm && bpm) parts.push(String(bpm.value));
    if (ind.key && key) parts.push(key.camelot);
    const hint = [
      ind.bpm ? (bpm ? `${bpm.value} BPM · ${bpm.source}` : t("bpmKey.bpm_unknown")) : null,
      ind.key
        ? key
          ? t("bpmKey.key_line", { camelot: key.camelot, name: key.name, source: key.source })
          : t("bpmKey.key_unknown")
        : null,
    ]
      .filter(Boolean)
      .join(" — ");
    return (
      <span className="booth-row-ind" data-hint={hint} data-testid="booth-row-bpmkey">
        {parts.join(" · ")}
      </span>
    );
  }
  return (
    <>
      {ind.bpm && bpm && (
        <span
          className="booth-ind"
          data-testid="booth-bpm"
          data-hint={bpm ? `${bpm.value} BPM · from ${bpm.source}. ${explain("bpm")}` : explain("bpm")}
        >
          {bpm ? t("bpmKey.bpm_2", { value: bpm.value }) : t("bpmKey.bpm")}
        </span>
      )}
      {ind.key && key && (
        <span
          className="booth-ind"
          data-testid="booth-key"
          data-hint={key ? `${key.name} · from ${key.source}. ${explain("key")}` : explain("key")}
        >
          {key ? `${key.camelot} · ${key.name}` : t("bpmKey.key")}
        </span>
      )}
    </>
  );
});

export function EnergyChip({ e }: { e: Entity }) {
  const on = useIndicators().energy;
  const v = energyOf(e);
  if (!on || v === null) return null;
  return (
    <span
      className="booth-ind"
      data-testid="booth-energy"
      data-hint={`Energy ${v} of 100. ${explain("energy")}`}
    >
      {t("bpmKey.energy", { v })}
    </span>
  );
}
