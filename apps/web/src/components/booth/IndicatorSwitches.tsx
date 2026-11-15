"use client";
import { INDICATORS } from "@/lib/booth/indicatorList";
import { useIndicatorPrefs, useIndicators } from "@/lib/booth/indicatorPrefs";
import { Group, SwitchRow } from "../Form";
import { EraLegend } from "./Indicators";

/** The indicator switches with their one-line explanations and the era legend (Settings and the player). */
export function IndicatorSwitches() {
  const prefs = useIndicators();
  const set = useIndicatorPrefs((s) => s.set);
  return (
    <>
      <Group
        header="Indicators"
        footer="Hover or long-press any indicator to see what it means and where the number came from. Saved on this device."
        data-testid="indicator-switches"
      >
        {INDICATORS.map((i) => (
          <SwitchRow
            key={i.id}
            label={i.label}
            sub={i.explain}
            checked={prefs[i.id]}
            onChange={(v) => set(i.id, v)}
          />
        ))}
      </Group>
      <Group header="Era badge" footer="Grades from your orchestra heatmap.">
        <div className="cell block">
          <EraLegend />
        </div>
      </Group>
    </>
  );
}
