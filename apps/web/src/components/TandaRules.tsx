"use client";
import { DEFAULT_TANDA_RULES, type TandaRules } from "@tdj/core";
import { lazy, t } from "@/lib/i18n";
import { Group, PickerRow, SegmentedRow, StepperRow, SwitchRow } from "./Form";

const VOCAL_STYLES: Array<[NonNullable<TandaRules["vocalStyle"]>, string]> = lazy(() => [
  ["either", t("tandaRules.either_never_mixed")],
  ["singer-led", t("tandaRules.singer_led_cantor_sides")],
  ["rhythm-led", t("tandaRules.rhythm_led_estribillista_sides")],
  ["off", t("tandaRules.not_checked")],
]);
const TONES: Array<[NonNullable<TandaRules["tone"]>, string]> = lazy(() => [
  ["between", t("tandaRules.between_tandas_only")],
  ["inside", t("tandaRules.inside_tandas_too")],
]);

/**
 * Round 21 — "Tanda rules": the coherence rules every tanda keeps (all on by default), shown in the Composer and in
 * Settings; they travel with the night's options (and so with every saved night) and every path that edits a tanda
 * honours them. A tanda the DJ pins ("Keep my tanda as is") is exempt.
 */
export function TandaRulesGroup({
  value,
  onChange,
  id = "tanda-rules",
}: {
  value: TandaRules | undefined;
  onChange: (next: TandaRules) => void;
  id?: string;
}) {
  const r = { ...DEFAULT_TANDA_RULES, ...(value ?? {}) };
  const set = (patch: Partial<TandaRules>) => onChange({ ...(value ?? {}), ...patch });
  return (
    <Group
      header={t("tandaRules.tanda_rules")}
      id={id}
      footer={t("tandaRules.every_tanda_you_compose_improve_swap")}
    >
      <SwitchRow
        label={t("tandaRules.one_voice_per_tanda")}
        sub={t("tandaRules.all_instrumental_or_all_with_a")}
        checked={r.voice}
        onChange={(v) => set({ voice: v })}
      />
      <PickerRow
        label={t("tandaRules.vocal_style")}
        sub={t("tandaRules.singer_led_the_singer_starts_and")}
        ariaLabel={t("tandaRules.vocal_style")}
        value={r.vocalStyle}
        items={VOCAL_STYLES}
        onChange={(k) => k && set({ vocalStyle: k })}
      />
      <SegmentedRow
        label={t("tandaRules.where_the_night_rises_and_falls")}
        sub={
          r.tone === "between"
            ? t("tandaRules.each_tanda_keeps_one_tone_the")
            : t("tandaRules.a_tanda_may_build_gently_inside")
        }
        value={r.tone}
        items={TONES}
        onChange={(k) => set({ tone: k })}
      />
      <SwitchRow
        label={t("tandaRules.tempo_band")}
        sub={t("tandaRules.the_sides_measured_bpm_within_10")}
        checked={r.bpmBand}
        onChange={(v) => set({ bpmBand: v })}
      />
      <SwitchRow
        label={t("tandaRules.level_band")}
        sub={t("tandaRules.the_sides_measured_loudness_within_6")}
        checked={r.levelBand}
        onChange={(v) => set({ levelBand: v })}
      />
      <SwitchRow
        label={t("tandaRules.big_four_spread")}
        sub={t("tandaRules.di_sarli_d_arienzo_troilo_pugliese")}
        checked={r.bigFour}
        onChange={(v) => set({ bigFour: v })}
      />
      {r.bigFour && (
        <StepperRow
          label={t("tandaRules.big_four_apart")}
          sub={t("tandaRules.tandas_before_the_same_one_returns")}
          value={r.bigFourGap}
          unit={t("tandaRules.tandas")}
          min={3}
          max={10}
          step={1}
          onChange={(v) => set({ bigFourGap: v })}
        />
      )}
    </Group>
  );
}
