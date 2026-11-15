"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { COHESION_COLOR, type CohesionInfo, PART_LABEL, PART_ORDER } from "@/lib/audio";
import { useMediaQuery } from "@/lib/hooks";
import { capFirst, t } from "@/lib/i18n";
import { DUR, EASE } from "@/lib/motion";
import { Group } from "./Form";
import { Sheet } from "./Sheet";
import { Tip } from "./ui/Tip";

/** Five tiny bars per consecutive pair: tempo / loudness / key / brightness / energy. */
function PairBars({ parts }: { parts: Record<string, number> | null }) {
  return (
    <span className="flex items-end gap-0.5" aria-hidden>
      {PART_ORDER.map((k) => {
        const v = parts?.[k];
        return (
          <Tip
            key={k}
            text={`${PART_LABEL[k]}: ${v == null ? t("cohesionBadge.unknown") : `${Math.round(v)} %`}`}
          >
            <span
              className="block w-1.5 rounded-sm bg-[var(--fill-3)]"
              style={{ height: 14, position: "relative" }}
            >
              <span
                className="absolute inset-x-0 bottom-0 rounded-sm"
                style={{
                  height: `${v == null ? 0 : Math.max(8, v)}%`,
                  background:
                    v == null ? "transparent" : v >= 70 ? "var(--tint)" : v >= 45 ? "#d9822b" : "#e5484d",
                }}
              />
            </span>
          </Tip>
        );
      })}
    </span>
  );
}

function PairList({ info }: { info: CohesionInfo }) {
  return (
    <div className="group-inset">
      {info.pairs.map((p, i) => (
        <div key={`${p.from}-${i}`} className="cell gap-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="text-footnote block truncate">
              {p.from} → {p.to}
            </span>
            <span className="text-caption1 block text-[var(--label-2)]">
              {p.parts
                ? PART_ORDER.filter((k) => p.parts?.[k] != null)
                    .map((k) => `${PART_LABEL[k]} ${Math.round(p.parts![k]!)}`)
                    .join(" · ")
                : t("cohesionBadge.no_analysed_audio_on_one_side")}
            </span>
          </span>
          <PairBars parts={p.parts} />
          <span className="text-footnote w-8 text-right tabular-nums text-[var(--label-2)]">
            {p.score == null ? "–" : p.score}
          </span>
        </div>
      ))}
    </div>
  );
}

/** wave 2: the badge in sentence case ("Audible step", not "Audible Step") */
export const cohesionText = (label: string) => capFirst(label);
/** wave 2: what the badge means, on hover and to assistive tech */
export const COHESION_HELP = () => t("cohesionBadge.how_smoothly_the_songs_of_this");

/** Tanda header badge with the label; tap for a popover (desktop) or sheet (phone) listing each pair's parts. */
export function CohesionBadge({ info, tandaLabel }: { info: CohesionInfo; tandaLabel: string }) {
  const [open, setOpen] = useState(false);
  const isPhone = useMediaQuery("(max-width: 639px)");
  const reduced = useReducedMotion();
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open || isPhone) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, isPhone]);
  const color = COHESION_COLOR[info.label];
  const trigger = (
    <Tip
      text={t("cohesionBadge.flow_between_songs_of_100", {
        p1: cohesionText(info.label),
        score: info.score,
        COHESION_HELP: COHESION_HELP(),
      })}
    >
      <button
        type="button"
        className="text-caption1 -my-1 inline-flex min-h-[28px] items-center gap-1 rounded-full px-2 font-medium"
        style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
        aria-label={t("cohesionBadge.cohesion_2", { score: info.score, label: info.label, tandaLabel })}
        aria-expanded={open}
        aria-controls={open && !isPhone ? id : undefined}
        data-testid="cohesion-badge"
        data-label={info.label}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{cohesionText(info.label)}</span>
      </button>
    </Tip>
  );
  if (isPhone)
    return (
      <>
        {trigger}
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title={t("cohesionBadge.cohesion")}
          trailing={t("cohesionBadge.done")}
        >
          <Group
            footer={t("cohesionBadge.cohesion_of_transitions_have_analysed_audio", {
              p1: COHESION_HELP().replace(" Tap for each transition.", ""),
              score: info.score,
              known: info.known,
              length: info.pairs.length,
            })}
          >
            <PairList info={info} />
          </Group>
        </Sheet>
      </>
    );
  return (
    <span ref={root} className="relative inline-flex">
      {trigger}
      <AnimatePresence>
        {open && (
          <motion.div
            key="pop"
            id={id}
            role="dialog"
            aria-label={t("cohesionBadge.cohesion_by_transition")}
            initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
            transition={{ duration: DUR.base, ease: EASE.out }}
            style={{ transformOrigin: "top right" }}
            className="menu absolute right-0 top-full z-50 mt-1 w-[320px] p-2"
          >
            <PairList info={info} />
            <p className="text-caption1 px-2 pt-2 text-[var(--label-2)]">
              {t("cohesionBadge.cohesion_bars_tempo_loudness_key_brightness", {
                p1: COHESION_HELP().replace(" Tap for each transition.", ""),
                score: info.score,
              })}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
