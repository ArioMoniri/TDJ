"use client";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { Disc3, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { DUR, EASE } from "@/lib/motion";

/* The dotLottie player (its chunk and its WASM) loads the first time the narrative shows, not with the page. */
const DotLottieReact = dynamic(() => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact), {
  ssr: false,
});

export const STEPS = ["Placing tandas", "Matching cortinas", "Shaping the arc", "Scoring the night"];
const STEP_MS = 450;
const SHOW_AFTER_MS = 250;

/** The four-step narrative while composing; shows only when `busy` persists past 250 ms. */
function useSteps(busy: boolean) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!busy) {
      setVisible(false);
      setStep(0);
      return;
    }
    const show = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    const tick = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), STEP_MS);
    return () => {
      clearTimeout(show);
      clearInterval(tick);
    };
  }, [busy]);
  return { visible, step };
}

/** The step line alone (used inside the phone compose bar, where there is no room for the Lottie). */
export function StepLabel({ step, className = "" }: { step: number; className?: string }) {
  return (
    <span className={`relative inline-grid overflow-hidden ${className}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={step}
          initial={{ y: 6, opacity: 0 }}
          animate={{ y: 0, opacity: 1, transition: { duration: DUR.base, ease: EASE.out } }}
          exit={{ y: -6, opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } }}
          className="col-start-1 row-start-1 block whitespace-nowrap"
        >
          {STEPS[step]}…
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Progress narrative for the compose wait (desktop hero). Mount while `busy`; hides itself for sub-250 ms responses. */
export function ComposeNarrative({ busy, className = "" }: { busy: boolean; className?: string }) {
  const reduced = useReducedMotion();
  const { visible, step } = useSteps(busy);
  const lottie = useRef<DotLottie | null>(null);
  useEffect(() => {
    if (reduced && visible) lottie.current?.setFrame(60); // the arc fully drawn
  }, [reduced, visible]);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="narrative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: DUR.fast } }}
          className={`flex-col items-center gap-1 ${className}`}
          aria-hidden // the live region in Composer already announces "Composing the night…"
          data-testid="compose-narrative"
        >
          <div className="w-40 sm:w-56" style={{ aspectRatio: "4 / 1" }}>
            <DotLottieReact
              src="/anim/compose-loading.json"
              loop
              autoplay={!reduced}
              dotLottieRefCallback={(d) => {
                lottie.current = d;
                if (reduced) d?.setFrame(60);
              }}
              style={{ width: "100%", height: "100%" }}
            />
          </div>
          <StepLabel step={step} className="text-footnote h-5 text-[var(--label-2)]" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Compose button content: the Disc3 icon spins while busy (LoaderCircle at 1.6 s under reduced motion) and the
 * label cross-fades. On phones (`steps`) the label cycles the four narrative steps instead of "Composing…".
 */
export function ComposeLabel({ busy, steps = false }: { busy: boolean; steps?: boolean }) {
  const reduced = useReducedMotion();
  const { visible, step } = useSteps(busy && steps);
  return (
    <>
      {busy && reduced ? (
        <LoaderCircle size={18} className="animate-spin" aria-hidden />
      ) : (
        <motion.span
          animate={busy ? { rotate: 360 } : { rotate: 0 }}
          transition={
            busy ? { repeat: Number.POSITIVE_INFINITY, ease: "linear", duration: 1.2 } : { duration: 0 }
          }
          className="inline-flex"
          aria-hidden
        >
          <Disc3 size={18} />
        </motion.span>
      )}
      <span className="relative inline-grid">
        <AnimatePresence mode="popLayout" initial={false}>
          {busy && steps && visible ? (
            <motion.span
              key="steps"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.fast }}
              className="col-start-1 row-start-1"
            >
              <StepLabel step={step} />
            </motion.span>
          ) : (
            <motion.span
              key={busy ? "busy" : "idle"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR.fast }}
              className="col-start-1 row-start-1 whitespace-nowrap"
            >
              {busy ? "Composing…" : "Compose the night"}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </>
  );
}
