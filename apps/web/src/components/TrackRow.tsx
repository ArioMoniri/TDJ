"use client";
import { Repeat2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { DUR, EASE, lineSwap } from "@/lib/motion";
import { SwipeRow } from "./SwipeRow";

/** Apple Music track row: number, title + year, trailing tabular energy, hover swap (desktop) / swipe swap (phone). */
export function TrackRow({
  n,
  title,
  year,
  approx,
  energy,
  inFlight = false,
  nudge = 0,
  onSwap,
  disabled,
  swapLabel,
}: {
  n: number;
  title: string;
  year: number | null | undefined;
  approx?: boolean;
  energy: number;
  inFlight?: boolean;
  nudge?: number;
  onSwap: () => void;
  disabled?: boolean;
  swapLabel: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.li
      layout={reduced ? false : "position"}
      variants={lineSwap}
      initial="hidden"
      animate="show"
      exit="exit"
      className="group/row"
    >
      <SwipeRow
        leading="num"
        actions={[
          { kind: "swap", label: "Swap", icon: Repeat2, onClick: onSwap, disabled: disabled || inFlight },
        ]}
      >
        <div className="cell" data-leading="num">
          <span className="text-subhead w-5 shrink-0 text-right tabular-nums text-[var(--label-2)]">{n}</span>
          <motion.span
            className="min-w-0 flex-1 truncate"
            animate={{ opacity: inFlight ? 0.6 : 1, x: nudge && !reduced ? [0, -3, 3, 0] : 0 }}
            transition={{ duration: nudge ? 0.24 : DUR.fast }}
            key={`${title}-${nudge}`}
          >
            {title}{" "}
            <span className="text-[var(--label-2)]">
              {approx ? "c. " : ""}
              {year ?? "?"}
            </span>
          </motion.span>
          <span className="text-subhead tabular-nums text-[var(--label-2)]">
            <span className="sr-only">energy </span>
            {energy}
          </span>
          <span
            className="relative hidden h-1 w-10 overflow-hidden rounded-full bg-[var(--fill-3)] sm:block"
            aria-hidden
          >
            <motion.span
              className="block h-full w-full origin-left rounded-full bg-[var(--tint)]"
              initial={false}
              animate={{ scaleX: energy / 100 }}
              transition={{ duration: DUR.slow, ease: EASE.inOut }}
            />
          </span>
          <button
            type="button"
            onClick={onSwap}
            disabled={disabled || inFlight}
            aria-label={swapLabel}
            title="Swap this track for another of the same family"
            className="icon-btn icon-btn-bare -my-2 -mr-3 hidden h-9 w-9 opacity-0 transition-opacity focus-visible:opacity-100 disabled:opacity-0 group-hover/row:opacity-100 sm:inline-flex"
          >
            <Repeat2 size={18} strokeWidth={1.75} className={inFlight ? "animate-spin" : ""} />
          </button>
        </div>
      </SwipeRow>
    </motion.li>
  );
}
