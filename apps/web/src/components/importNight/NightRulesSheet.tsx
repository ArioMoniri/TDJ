"use client";
import { type ComposeOptions, ERA_SETTINGS, type NightRules } from "@tdj/core";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { Group, PickerRow, StepperRow, SwitchRow } from "../Form";
import { NightClosingGroup } from "../NightClosing";
import { Sheet } from "../Sheet";
import { TandaRulesGroup } from "../TandaRules";

const PATTERNS = (): Array<[ComposeOptions["pattern"], string]> => [
  ["classic", t("composer.classic_ttvttm")],
  ["TTVTTM-strict", t("composer.strict_ttvttm")],
  ["TVTM", "TVTM"],
  ["TMTV", "TMTV"],
  ["tango-only", t("composer.tango_only")],
  ["custom", t("composer.custom")],
];
const CORTINA_STYLES = (): Array<[ComposeOptions["cortinaStyle"], string]> => [
  ["family", t("composer.family")],
  ["matched", t("composer.matched")],
  ["constant", t("composer.same")],
  ["none", t("composer.none")],
];

/**
 * 2026-11 — "Night rules" (the owner: "the user should also see those settings via a button in the Booth tab"): the
 * Compose tab's night and tanda rules as a sheet — the rhythm cycle, the last four tandas tango, the closing and the
 * opening La Cumparsita, the cortinas, the orchestra gap and the year spread, and the tanda rules. The same settings
 * (the app's store, as Compose reads and writes them): a change here is a change there, and the review of the night
 * (ReviewPanel / ReviewBanner) reads them again at once.
 */
export function NightRulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const options = useStore((s) => s.options);
  const setOptions = useStore((s) => s.setOptions);
  const era = (options.eras ?? ["golden"])[0] ?? "golden";
  const eraDefaults = ERA_SETTINGS[era] ?? ERA_SETTINGS.golden!;
  const rules: NightRules = { ...eraDefaults.rules, ...(options.rules ?? {}) };
  const setRules = (patch: Partial<NightRules>) =>
    setOptions({ rules: { ...(options.rules ?? {}), ...patch } });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("composer.night_rules")}
      trailing={t("booth.sheets.done")}
      detents={["large"]}
      testId="night-rules-sheet"
    >
      <Group
        header={t("nightRules.cycle_header")}
        footer={t("nightRules.footer")}
        data-testid="night-rules-cycle"
      >
        <PickerRow
          label={t("composer.cycle")}
          sub={t("composer.the_rhythm_order_the_night_repeats")}
          ariaLabel={t("composer.cycle")}
          value={options.pattern ?? eraDefaults.pattern ?? "classic"}
          items={PATTERNS()}
          onChange={(k) => k && setOptions({ pattern: k })}
        />
        <SwitchRow
          label={t("composer.last_4_tandas_tango_only")}
          sub={t("composer.the_player_skips_a_vals_or")}
          checked={!!rules.lastFourTango}
          onChange={(v) => setRules({ lastFourTango: v || undefined })}
        />
        <SwitchRow
          label={t("composer.closing_matches_the_ultima")}
          sub={t("composer.la_cumparsita_by_the_last_tanda")}
          checked={!!rules.cumparsitaHarmony}
          onChange={(v) => setRules({ cumparsitaHarmony: v || undefined })}
        />
        <SwitchRow
          label={t("composer.mixed_milonga_and_vals_tandas")}
          sub={t("composer.allow_more_than_one_orchestra_inside")}
          checked={!!rules.mixedMilongaVals}
          onChange={(v) => setRules({ mixedMilongaVals: v })}
        />
        <PickerRow
          label={t("composer.cortinas")}
          ariaLabel={t("composer.cortinas")}
          value={options.cortinaStyle ?? eraDefaults.cortinaStyle ?? "family"}
          items={CORTINA_STYLES()}
          onChange={(k) => k && setOptions({ cortinaStyle: k })}
        />
        <StepperRow
          label={t("composer.orchestra_repeat_gap")}
          tip={t("composer.how_many_tandas_pass_before_the")}
          value={options.orchestraRepeatGap ?? eraDefaults.orchestraRepeatGap ?? 6}
          unit={t("composer.tandas_2")}
          min={1}
          max={12}
          step={1}
          onChange={(v) => setOptions({ orchestraRepeatGap: v })}
        />
        <StepperRow
          label={t("composer.year_spread")}
          tip={t("composer.how_many_years_apart_the_songs")}
          value={options.maxYearSpread ?? eraDefaults.maxYearSpread ?? 4}
          unit=" y"
          min={1}
          max={15}
          step={1}
          onChange={(v) => setOptions({ maxYearSpread: v })}
        />
      </Group>
      <NightClosingGroup />
      <TandaRulesGroup
        id="night-rules-tanda"
        value={options.tandaRules}
        onChange={(tandaRules) => setOptions({ tandaRules })}
      />
    </Sheet>
  );
}
