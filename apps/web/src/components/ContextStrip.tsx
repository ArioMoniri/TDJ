"use client";
import { resolveContext } from "@tdj/core";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { CONTEXT_FIELDS, EVIDENCE_COLOR, EVIDENCE_LABEL, fmtShift, researchOption } from "@/lib/context";
import { getLocale, t } from "@/lib/i18n";
import { fade } from "@/lib/motion";
import type { ComposeContext, ComposeOptions, ContextModel } from "@/lib/types";
import { CountUp } from "./CountUp";
import { ActionRow, Group, PickerRow } from "./Form";

const GENRE_LABEL: Record<string, string> = {
  get "themed-single-artist"() {
    return t("contextStrip.one_artist_theme");
  },
  get "jazz-standards"() {
    return t("contextStrip.jazz_standards");
  },
  get "italian-60s"() {
    return t("contextStrip.italian_60s");
  },
  get "rock-nacional"() {
    return t("contextStrip.rock_nacional");
  },
  get "french-chanson"() {
    return t("contextStrip.french_chanson");
  },
  get "bossa-nova"() {
    return t("contextStrip.bossa_nova");
  },
};
const LABEL_KEY: Record<string, string> = {
  get tangoTandaSize() {
    return t("contextStrip.tango_tanda_size");
  },
  get valsTandaSize() {
    return t("contextStrip.vals_tanda_size");
  },
  get milongaTandaSize() {
    return t("contextStrip.milonga_tanda_size");
  },
  get pattern() {
    return t("contextStrip.cycle");
  },
  get customPattern() {
    return t("contextStrip.cycle");
  },
  get cortinaGenres() {
    return t("contextStrip.cortina_genres");
  },
  get cortinaLengthSec() {
    return t("contextStrip.cortina_length");
  },
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
    if (rc.energyShift) parts.push(t("contextStrip.energy", { energyShift: fmtShift(rc.energyShift) }));
    if (rc.tempoShift)
      parts.push(rc.tempoShift < 0 ? t("contextStrip.slower_tempo") : t("contextStrip.faster_tempo"));
    const pattern = applied?.customPattern;
    if (applied) {
      // what the engine finally did with the shares and sizes
      if (pattern && applied.pattern === "custom") {
        const v = Math.round(((pattern.match(/V/g)?.length ?? 0) / pattern.length) * 100);
        const m = Math.round(((pattern.match(/M/g)?.length ?? 0) / pattern.length) * 100);
        parts.push(t("contextStrip.vals_2", { v }), t("contextStrip.milonga_2", { m }));
      }
      if (applied.tangoTandaSize === 3) parts.push(t("contextStrip.tango_tandas_of_3"));
      else if (rc.tandaSizeShift < 0) parts.push(t("contextStrip.tango_tandas_of_4_your_choice"));
    } else {
      if (rc.valsShare) parts.push(t("contextStrip.vals", { p1: Math.round((baseV + rc.valsShare) * 100) }));
      if (rc.milongaShare)
        parts.push(t("contextStrip.milonga", { p1: Math.round((baseM + rc.milongaShare) * 100) }));
      if (rc.tandaSizeShift < 0) parts.push(t("contextStrip.tango_tandas_of_3"));
    }
    if (rc.vocalRatioShift)
      parts.push(rc.vocalRatioShift < 0 ? t("contextStrip.fewer_vocals") : t("contextStrip.more_vocals"));
    const genres = [
      ...new Set((applied?.cortinaGenres?.length ? applied.cortinaGenres : rc.cortinaGenres) ?? []),
    ].slice(0, 4);
    const main = parts.length ? parts.join(", ") : t("contextStrip.no_shift");
    // the engine reports which context shifts it skipped because the DJ had set the key explicitly
    const skipped = (applied?.contextApplied?.skipped ?? []).map((k) => LABEL_KEY[k] ?? k);
    return {
      summary: t("contextStrip.from_tonight_s_choices", {
        main,
        p1: genres.length
          ? ` ${t("contextStrip.cortinas", { p1: genres.map(humaniseGenre).join(", ") })}`
          : "",
        p2: skipped.length ? ` ${t("contextStrip.your_own_kept", { skipped: skipped.join(", ") })}` : "",
      }),
      shifts: parts.length,
    };
  }, [model, value, chosen, applied, onlyRegion]);
  const summaryText =
    summary ??
    (onlyRegion
      ? t("contextStrip.region_from_settings_set_season_room", {
          // the region in the words its row shows ("Avrupa", not "Europe": QA 2026-11)
          p1:
            CONTEXT_FIELDS.find((f) => f.key === "region")?.options.find(([k]) => k === value.region)?.[1] ??
            (value.region === "buenos-aires"
              ? t("contextStrip.buenos_aires")
              : value.region === "us"
                ? t("contextStrip.us")
                : (value.region ?? "")[0]!.toUpperCase() + (value.region ?? "").slice(1)),
        })
      : t("contextStrip.nothing_set_era_arc_and_cortinas"));

  const rows = CONTEXT_FIELDS.map((f) => {
    const v = value[f.key] as string | undefined;
    const r = researchOption(model, f.key, v);
    const ev = r?.option?.evidence;
    return (
      <PickerRow
        key={f.key}
        label={f.label}
        tip={
          // the research notes are English knowledge data (glossary): only an English tip quotes them
          (getLocale() === "en" ? r?.option?.notes : undefined) ??
          t("contextStrip.tonight_it_moves_the_energy_the", { p1: f.label.split(" (")[0] })
        }
        ariaLabel={r?.factorLabel ?? f.label}
        value={v}
        placeholder={t("contextStrip.not_set")}
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
              {chosen - (onlyRegion ? 1 : 0) === 1 ? t("contextStrip.choice") : t("contextStrip.choices")} ·{" "}
            </span>
          )}
          {summaryText}
        </motion.span>
      </AnimatePresence>
    </span>
  );
  return (
    <div className="md:grid md:grid-cols-2 md:gap-x-4" id="tonight">
      <Group header={t("contextStrip.tonight")}>{rows.slice(0, 6)}</Group>
      <Group header={t("contextStrip.also_tonight")} className="md:[&>.section-head]:visible" footer={footer}>
        {rows.slice(6)}
        {chosen > 0 && (
          <ActionRow
            label={t("contextStrip.clear_tonight")}
            tip={t("contextStrip.forget_tonight_s_room_crowd_and")}
            onClick={() => onChange({})}
          />
        )}
      </Group>
    </div>
  );
}
