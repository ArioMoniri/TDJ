"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { COHESION_COLOR, type CohesionInfo, PART_LABEL, PART_ORDER } from "@/lib/audio";
import { useMediaQuery } from "@/lib/hooks";
import { DUR, EASE } from "@/lib/motion";
import { Group } from "./Form";
import { Sheet } from "./Sheet";

/** Five tiny bars per consecutive pair: tempo / loudness / key / brightness / energy. */
function PairBars({ parts }: { parts: Record<string, number> | null }) {
  return (
    <span className="flex items-end gap-0.5" aria-hidden>
      {PART_ORDER.map((k) => {
        const v = parts?.[k];
        return (
          <span
            key={k}
            title={`${PART_LABEL[k]}: ${v == null ? "unknown" : `${Math.round(v)} %`}`}
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
                : "no analysed audio on one side"}
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
    <button
      type="button"
      className="text-caption1 -my-1 inline-flex min-h-[28px] items-center gap-1 rounded-full px-2 font-medium"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      aria-label={`Cohesion ${info.score}, ${info.label}, ${tandaLabel}`}
      aria-expanded={open}
      aria-controls={open && !isPhone ? id : undefined}
      data-testid="cohesion-badge"
      data-label={info.label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => setOpen((v) => !v)}
    >
      <span className="tabular-nums">{info.score}</span>
      <span>{info.label}</span>
    </button>
  );
  if (isPhone)
    return (
      <>
        {trigger}
        <Sheet open={open} onClose={() => setOpen(false)} title="Cohesion" trailing="Done">
          <Group
            footer={`${info.known} of ${info.pairs.length} transitions have analysed audio on both sides. Seamless ≥ 85, fine ≥ 70, audible step ≥ 55; bars are tempo, loudness, key, brightness, energy.`}
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
            aria-label="Cohesion by transition"
            initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
            transition={{ duration: DUR.base, ease: EASE.out }}
            style={{ transformOrigin: "top right" }}
            className="menu absolute right-0 top-full z-50 mt-1 w-[320px] p-2"
          >
            <PairList info={info} />
            <p className="text-caption1 px-2 pt-2 text-[var(--label-2)]">
              Bars: tempo · loudness · key · brightness · energy. Seamless ≥ 85, fine ≥ 70, audible step ≥ 55.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
