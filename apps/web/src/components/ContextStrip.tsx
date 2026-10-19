"use client";
import { resolveContext } from "@tdj/core";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { CONTEXT_FIELDS, EVIDENCE_COLOR, EVIDENCE_LABEL, fmtShift, researchOption } from "@/lib/context";
import { fade } from "@/lib/motion";
import type { ComposeContext, ContextModel } from "@/lib/types";
import { ActionRow, Group, PickerRow } from "./Form";

/** "Tonight": one picker row per situational factor (data/knowledge/context_factors.json); the summary is the footer. */
export function ContextStrip({
  value,
  onChange,
  model,
}: {
  value: ComposeContext;
  onChange: (c: ComposeContext) => void;
  model: ContextModel | null;
}) {
  const set = (k: keyof ComposeContext, v: string | undefined) =>
    onChange({ ...value, [k]: v || undefined } as ComposeContext);
  const chosen = Object.entries(value).filter(([, v]) => !!v).length;
  const { summary, shifts } = useMemo(() => {
    if (!model || !chosen) return { summary: null, shifts: 0 };
    const rc = resolveContext(value, model);
    const baseV = model.baseline?.valsShare ?? 0.167;
    const baseM = model.baseline?.milongaShare ?? 0.167;
    const parts: string[] = [];
    if (rc.energyShift) parts.push(`energy ${fmtShift(rc.energyShift)}`);
    if (rc.tempoShift) parts.push(`tempo ${fmtShift(rc.tempoShift)}`);
    if (rc.valsShare) parts.push(`vals ${Math.round((baseV + rc.valsShare) * 100)}%`);
    if (rc.milongaShare) parts.push(`milonga ${Math.round((baseM + rc.milongaShare) * 100)}%`);
    if (rc.tandaSizeShift < 0) parts.push("tangos in threes");
    if (rc.vocalRatioShift) parts.push(`vocal ${fmtShift(Math.round(rc.vocalRatioShift * 100), "%")}`);
    const genres = [...new Set(rc.cortinaGenres)].slice(0, 4);
    if (genres.length) parts.push(`cortinas: ${genres.join(", ")}`);
    return {
      summary: parts.length ? parts.join(" · ") : "No shift from these choices.",
      shifts: parts.length,
    };
  }, [model, value, chosen]);
  const summaryText = summary ?? "Nothing set: era, arc and cortinas alone shape the set.";

  const rows = CONTEXT_FIELDS.map((f) => {
    const v = value[f.key] as string | undefined;
    const r = researchOption(model, f.key, v);
    const ev = r?.option?.evidence;
    return (
      <PickerRow
        key={f.key}
        label={f.label}
        ariaLabel={r?.factorLabel ?? f.label}
        value={v}
        placeholder="Not set"
        items={f.options.map(([k, l]) => {
          const ro = researchOption(model, f.key, k)?.option;
          const s = ro ? fmtShift(ro.energyShift) : "";
          return [k, s ? `${l} (${s})` : l];
        })}
        onChange={(k) => set(f.key, k)}
        trailingDot={ev ? (EVIDENCE_COLOR[ev] ?? "#9ca3af") : undefined}
        trailingDotTitle={ev ? EVIDENCE_LABEL[ev] : undefined}
      />
    );
  });
  const footer = (
    <span aria-live="polite" className="block">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={summaryText}
          variants={fade}
          initial="hidden"
          animate="show"
          exit="exit"
          className="block"
        >
          {shifts > 0 && (
            <span data-testid="shift-badge" className="font-medium text-[var(--label)]">
              {shifts} {shifts === 1 ? "shift" : "shifts"} ·{" "}
            </span>
          )}
          {summaryText}
        </motion.span>
      </AnimatePresence>
    </span>
  );
  return (
    <div className="md:grid md:grid-cols-2 md:gap-x-4" id="tonight">
      <Group header="Tonight">{rows.slice(0, 6)}</Group>
      <Group header="Also tonight" className="md:[&>.section-head]:visible" footer={footer}>
        {rows.slice(6)}
        {chosen > 0 && <ActionRow label="Clear tonight" onClick={() => onChange({})} />}
      </Group>
    </div>
  );
}
