"use client";
import { DEFAULT_TANDA_RULES, type TandaRules } from "@tdj/core";
import { Group, PickerRow, SegmentedRow, StepperRow, SwitchRow } from "./Form";

const VOCAL_STYLES: Array<[NonNullable<TandaRules["vocalStyle"]>, string]> = [
  ["either", "Either, never mixed"],
  ["singer-led", "Singer-led (cantor sides)"],
  ["rhythm-led", "Rhythm-led (estribillista sides)"],
  ["off", "Not checked"],
];
const TONES: Array<[NonNullable<TandaRules["tone"]>, string]> = [
  ["between", "Between tandas only"],
  ["inside", "Inside tandas too"],
];

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
      header="Tanda rules"
      id={id}
      footer="Every tanda you compose, improve, swap or let the AI refine keeps these. A tanda you pin (Keep my tanda as is) is yours: its exceptions are shown, never fixed."
    >
      <SwitchRow
        label="One voice per tanda"
        sub="All instrumental or all with a singer"
        checked={r.voice}
        onChange={(v) => set({ voice: v })}
      />
      <PickerRow
        label="Vocal style"
        sub="Singer-led: the singer starts and leads. Rhythm-led: the orchestra starts, the singer comes in later"
        ariaLabel="Vocal style"
        value={r.vocalStyle}
        items={VOCAL_STYLES}
        onChange={(k) => k && set({ vocalStyle: k })}
      />
      <SegmentedRow
        label="Where the night rises and falls"
        sub={
          r.tone === "between"
            ? "Each tanda keeps one tone; the changes happen between tandas"
            : "A tanda may build gently inside"
        }
        value={r.tone}
        items={TONES}
        onChange={(k) => set({ tone: k })}
      />
      <SwitchRow
        label="Tempo band"
        sub="The sides' measured BPM within 10 % (vals, milonga 12 %)"
        checked={r.bpmBand}
        onChange={(v) => set({ bpmBand: v })}
      />
      <SwitchRow
        label="Level band"
        sub="The sides' measured loudness within 6 dB"
        checked={r.levelBand}
        onChange={(v) => set({ levelBand: v })}
      />
      <SwitchRow
        label="Big four spread"
        sub="Di Sarli, D'Arienzo, Troilo, Pugliese: one in every quarter of the night, never back to back"
        checked={r.bigFour}
        onChange={(v) => set({ bigFour: v })}
      />
      {r.bigFour && (
        <StepperRow
          label="Big four apart"
          sub="Tandas before the same one returns (never fewer than the orchestra gap)"
          value={r.bigFourGap}
          unit=" tandas"
          min={3}
          max={10}
          step={1}
          onChange={(v) => set({ bigFourGap: v })}
        />
      )}
    </Group>
  );
}
