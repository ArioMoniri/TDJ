"use client";
import { INDICATORS } from "@/lib/booth/indicatorList";
import { useIndicatorPrefs, useIndicators } from "@/lib/booth/indicatorPrefs";
import { useStore } from "@/lib/store";
import { Group, SwitchRow } from "../Form";
import { EraLegend } from "./Indicators";

/**
 * The indicator switches with their one-line explanations and the era legend (Settings and the player). Round 23: the
 * one Indicators group in Settings. The era switch also drives Compose's era badges (`settings.eraBadges`, formerly a
 * second "Indicators" group under Data sources): one switch, both stores kept in step.
 */
export function IndicatorSwitches() {
  const prefs = useIndicators();
  const set = useIndicatorPrefs((s) => s.set);
  const eraBadges = useStore((s) => s.settings.eraBadges !== false);
  const setSettings = useStore((s) => s.setSettings);
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
            label={i.id === "era" ? "Era badges" : i.label}
            sub={i.explain}
            checked={i.id === "era" ? prefs.era && eraBadges : prefs[i.id]}
            onChange={(v) => {
              set(i.id, v);
              if (i.id === "era") setSettings({ eraBadges: v });
            }}
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
