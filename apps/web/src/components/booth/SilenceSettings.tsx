"use client";
import type { SilenceMode } from "@tdj/core";
import { Check } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { Group, SwitchRow } from "../Form";
import { useTip } from "../ui/Tip";

/**
 * 2026-11 (the owner: "some songs play a lot of silent moments; those should be counted as the gap between
 * songs"): Settings → Booth → Gaps, and the same choice in the Booth's Mix sheet. Three modes as one clear choice —
 * "Silence counts as the gap" (recommended, the default), "Gap after the music ends", "Off" — and the opt-in
 * per-era estimate for streamed sides, which the browser cannot hear.
 */
export type SilencePatch = { mode?: SilenceMode; estimate?: boolean };

const MODES: SilenceMode[] = ["gap", "after", "off"];
const label = (m: SilenceMode) =>
  m === "gap" ? t("booth.silence.gap") : m === "after" ? t("booth.silence.after") : t("booth.silence.off");
const sub = (m: SilenceMode) =>
  m === "gap"
    ? t("booth.silence.gap_sub")
    : m === "after"
      ? t("booth.silence.after_sub")
      : t("booth.silence.off_sub");
const tip = (m: SilenceMode) =>
  m === "gap"
    ? t("booth.silence.gap_tip")
    : m === "after"
      ? t("booth.silence.after_tip")
      : t("booth.silence.off_tip");

/** The app setting (unset = the silence counts as the gap). */
export function useSilenceMode(): SilenceMode {
  return useStore((s) =>
    s.settings.boothSilence === "after" || s.settings.boothSilence === "off"
      ? s.settings.boothSilence
      : "gap",
  );
}

function ModeRow({ mode, checked, onPick }: { mode: SilenceMode; checked: boolean; onPick: () => void }) {
  const tg = useTip(tip(mode));
  return (
    // biome-ignore lint/a11y/useSemanticElements: a checkmark row in a radiogroup (iOS Settings), not a radio glyph
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      {...(tg.props as object)}
      onClick={() => {
        haptic(4);
        onPick();
      }}
      className="cell cell-tap w-full text-left"
      data-testid={`booth-silence-${mode}`}
    >
      {tg.tag}
      <span className="min-w-0 flex-1">
        <span className="cell-label">{label(mode)}</span>
        <span className="text-footnote cell-sub block text-[var(--label-2)]">{sub(mode)}</span>
      </span>
      <span className="grid h-5 w-5 place-items-center">
        {checked && <Check size={18} strokeWidth={2.5} className="text-[var(--tint)]" aria-hidden />}
      </span>
    </button>
  );
}

/** The three modes as radio rows (inside any group). */
export function SilenceModeRows({ onChange }: { onChange?: (p: SilencePatch) => void }) {
  const mode = useSilenceMode();
  const setSettings = useStore((s) => s.setSettings);
  const pick = (m: SilenceMode) => (onChange ? onChange({ mode: m }) : setSettings({ boothSilence: m }));
  return (
    <div role="radiogroup" aria-label={t("booth.silence.label")} data-testid="booth-silence" data-mode={mode}>
      {MODES.map((m) => (
        <ModeRow key={m} mode={m} checked={mode === m} onPick={() => pick(m)} />
      ))}
    </div>
  );
}

/** The whole group: the modes, then "Estimate silence for streaming tracks" (off unless the DJ turns it on). */
export function SilenceGroup({
  onChange,
  header = t("settings.gaps.header"),
}: {
  onChange?: (p: SilencePatch) => void;
  header?: string;
}) {
  const estimate = useStore((s) => s.settings.boothSilenceEstimate === true);
  const setSettings = useStore((s) => s.setSettings);
  return (
    <Group header={header} footer={t("settings.gaps.footer")} data-testid="settings-gaps">
      <SilenceModeRows onChange={onChange} />
      <SwitchRow
        label={t("booth.silence.estimate")}
        sub={t("booth.silence.estimate_sub")}
        tip={t("booth.silence.estimate_tip")}
        checked={estimate}
        onChange={(v) => (onChange ? onChange({ estimate: v }) : setSettings({ boothSilenceEstimate: v }))}
      />
    </Group>
  );
}
