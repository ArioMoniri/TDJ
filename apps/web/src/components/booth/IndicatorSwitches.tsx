"use client";
import { INDICATORS } from "@/lib/booth/indicatorList";
import { useIndicatorPrefs, useIndicators } from "@/lib/booth/indicatorPrefs";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { Group, SwitchRow } from "../Form";
import { EraLegend } from "../ui/EraBadge";

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
        header={t("booth.indicatorSwitches.indicators")}
        footer={t("booth.indicatorSwitches.hover_or_long_press_any_indicator")}
        data-testid="indicator-switches"
      >
        {INDICATORS.map((i) => (
          <SwitchRow
            key={i.id}
            label={i.id === "era" ? t("booth.indicatorSwitches.era_badges") : i.label}
            sub={i.explain}
            checked={i.id === "era" ? prefs.era && eraBadges : prefs[i.id]}
            onChange={(v) => {
              set(i.id, v);
              if (i.id === "era") setSettings({ eraBadges: v });
            }}
          />
        ))}
      </Group>
      <Group
        header={t("booth.indicatorSwitches.era_badge")}
        footer={t("booth.indicatorSwitches.grades_from_your_orchestra_heatmap")}
      >
        <div className="cell block">
          <EraLegend look="bars" />
        </div>
      </Group>
    </>
  );
}
