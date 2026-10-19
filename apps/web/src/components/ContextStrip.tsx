"use client";
import { resolveContext } from "@tdj/core";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { CONTEXT_FIELDS, EVIDENCE_COLOR, EVIDENCE_LABEL, fmtShift, researchOption } from "@/lib/context";
import { fade } from "@/lib/motion";
import type { ComposeContext, ComposeOptions, ContextModel } from "@/lib/types";
import { CountUp } from "./CountUp";
import { ActionRow, Group, PickerRow } from "./Form";

const GENRE_LABEL: Record<string, string> = {
  "themed-single-artist": "one-artist theme",
  "jazz-standards": "jazz standards",
  "italian-60s": "Italian 60s",
  "rock-nacional": "rock nacional",
  "french-chanson": "French chanson",
  "bossa-nova": "bossa nova",
};
const LABEL_KEY: Record<string, string> = {
  tangoTandaSize: "tango tanda size",
  valsTandaSize: "vals tanda size",
  milongaTandaSize: "milonga tanda size",
  pattern: "cycle",
  customPattern: "cycle",
  cortinaGenres: "cortina genres",
  cortinaLengthSec: "cortina length",
};
/** "themed-single-artist" → "one-artist theme", "italian-60s" → "Italian 60s". */
export const humaniseGenre = (g: string) => GENRE_LABEL[g] ?? g.replace(/-/g, " ");

/**
 * "Tonight": one picker row per situational factor (data/knowledge/context_factors.json). The footer counts the
 * DJ's choices and, once a set exists, reads what the engine applied from its final options (`applied`) rather than
 * from the resolved context alone: an explicit tanda size or cycle wins over the context and is reported as such.
 */
export function ContextStrip({
  value,
  onChange,
  model,
  applied = null,
  regionFromSettings = false,
}: {
  value: ComposeContext;
  onChange: (c: ComposeContext) => void;
  model: ContextModel | null;
  /** the last composed set's final options */
  applied?: Partial<ComposeOptions> | null;
  /** the only thing set is the region that Settings filled in */
  regionFromSettings?: boolean;
}) {
  const set = (k: keyof ComposeContext, v: string | undefined) =>
    onChange({ ...value, [k]: v || undefined } as ComposeContext);
  const chosen = Object.entries(value).filter(([, v]) => !!v).length;
  const onlyRegion = chosen === 1 && !!value.region && regionFromSettings;
  const { summary, shifts } = useMemo(() => {
    if (!model || !chosen || onlyRegion) return { summary: null, shifts: 0 };
    const rc = resolveContext(value, model);
    const baseV = model.baseline?.valsShare ?? 0.167;
    const baseM = model.baseline?.milongaShare ?? 0.167;
    const parts: string[] = [];
    if (rc.energyShift) parts.push(`energy ${fmtShift(rc.energyShift)}`);
    if (rc.tempoShift) parts.push(rc.tempoShift < 0 ? "slower tempo" : "faster tempo");
    const pattern = applied?.customPattern;
    if (applied) {
      // what the engine finally did with the shares and sizes
      if (pattern && applied.pattern === "custom") {
        const v = Math.round(((pattern.match(/V/g)?.length ?? 0) / pattern.length) * 100);
        const m = Math.round(((pattern.match(/M/g)?.length ?? 0) / pattern.length) * 100);
        parts.push(`vals ${v}%`, `milonga ${m}%`);
      }
      if (applied.tangoTandaSize === 3) parts.push("tango tandas of 3");
      else if (rc.tandaSizeShift < 0) parts.push("tango tandas of 4 (your choice kept)");
    } else {
      if (rc.valsShare) parts.push(`vals ${Math.round((baseV + rc.valsShare) * 100)}%`);
      if (rc.milongaShare) parts.push(`milonga ${Math.round((baseM + rc.milongaShare) * 100)}%`);
      if (rc.tandaSizeShift < 0) parts.push("tango tandas of 3");
    }
    if (rc.vocalRatioShift) parts.push(rc.vocalRatioShift < 0 ? "fewer vocals" : "more vocals");
    const genres = [
      ...new Set((applied?.cortinaGenres?.length ? applied.cortinaGenres : rc.cortinaGenres) ?? []),
    ].slice(0, 4);
    const main = parts.length ? parts.join(", ") : "no shift";
    // the engine reports which context shifts it skipped because the DJ had set the key explicitly
    const skipped = (applied?.contextApplied?.skipped ?? []).map((k) => LABEL_KEY[k] ?? k);
    return {
      summary: `From tonight's choices: ${main}.${genres.length ? ` Cortinas: ${genres.map(humaniseGenre).join(", ")}.` : ""}${skipped.length ? ` Your own ${skipped.join(", ")} kept.` : ""}`,
      shifts: parts.length,
    };
  }, [model, value, chosen, applied, onlyRegion]);
  const summaryText =
    summary ??
    (onlyRegion
      ? `Region ${value.region === "buenos-aires" ? "Buenos Aires" : value.region === "us" ? "US" : (value.region ?? "")[0]!.toUpperCase() + (value.region ?? "").slice(1)} (from Settings). Set season, room or crowd to shape the night.`
      : "Nothing set: era, arc and cortinas alone shape the set.");

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
              <CountUp value={chosen - (onlyRegion ? 1 : 0)} />{" "}
              {chosen - (onlyRegion ? 1 : 0) === 1 ? "choice" : "choices"} ·{" "}
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
