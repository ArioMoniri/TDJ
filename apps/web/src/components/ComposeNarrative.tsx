"use client";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { Disc3, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { COMPOSE_STEPS, composeStep, expectedComposeMs } from "@/lib/composeProgress";
import { t } from "@/lib/i18n";
import { DUR } from "@/lib/motion";

/* The dotLottie player (its chunk and its WASM) loads the first time the narrative shows, not with the page. */
const DotLottieReact = dynamic(() => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact), {
  ssr: false,
});

/* wave 2: the engine's own stages, timed from this browser's last composes (lib/composeProgress.ts) */
export const STEPS = COMPOSE_STEPS;
/* the narrative itself appears only for the slow cases (round8-ux.md §1.1) */
const SHOW_AFTER_MS = 900;
const TICK_MS = 200;

/** The four-step narrative while composing; shows only when `busy` persists past 900 ms. */
export function useSteps(busy: boolean) {
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState({ step: 0, share: 0 });
  useEffect(() => {
    if (!busy) {
      setVisible(false);
      setState({ step: 0, share: 0 });
      return;
    }
    const t0 = Date.now();
    const expected = expectedComposeMs();
    const show = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    const tick = setInterval(() => {
      const next = composeStep(Date.now() - t0, expected);
      setState((s) => (s.step === next.step && Math.abs(s.share - next.share) < 0.01 ? s : next));
    }, TICK_MS);
    return () => {
      clearTimeout(show);
      clearInterval(tick);
    };
  }, [busy]);
  return { visible, step: state.step, share: state.share };
}

/**
 * Wave 2 — the compose wait, said: the four stages as a stepper with a bar, and Cancel. Floats above the bottom bars
 * (control layer) for every compose and recompose; the dimmed button alone said nothing for 10 s.
 */
export function ComposeProgress({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  const reduced = useReducedMotion();
  const { visible, step, share } = useSteps(busy);
  return (
    <AnimatePresence>
      {busy && visible && (
        <motion.div
          key="compose-progress"
          initial={{ opacity: 0, y: reduced ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: DUR.fast } }}
          className="glass fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+136px)] z-40 mx-auto max-w-[520px] rounded-[22px] px-4 py-3 sm:bottom-6"
          role="group"
          aria-label={t("composeNarrative.composing_the_night")}
          data-testid="compose-progress"
        >
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="text-subhead block font-semibold" data-testid="compose-progress-step">
                {STEPS[step]}…
              </span>
              <ol className="text-caption1 mt-0.5 flex flex-wrap gap-x-1.5 text-[var(--label-2)]" aria-hidden>
                {STEPS.map((x, k) => (
                  <li
                    key={x}
                    className={
                      k === step ? "font-semibold text-[var(--label)]" : k < step ? "" : "opacity-60"
                    }
                  >
                    {k ? "→ " : ""}
                    {x}
                  </li>
                ))}
              </ol>
            </span>
            <button
              type="button"
              className="btn btn-ghost min-h-[44px] shrink-0 px-4"
              onClick={onCancel}
              data-testid="compose-cancel"
            >
              {t("composeNarrative.cancel")}
            </button>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--fill-3)]" aria-hidden>
            <div
              className="h-full w-full origin-left rounded-full bg-[var(--tint)]"
              style={{
                transform: `scaleX(${share})`,
                transition: reduced ? "none" : `transform ${TICK_MS}ms linear`,
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The step line alone (used inside the phone compose bar, where there is no room for the Lottie). One label at a
 * time: `mode="wait"` lets the old step fade out before the next fades in (`popLayout` painted both on the same
 * grid cell, round8-ux.md §1.1).
 */
export function StepLabel({ step, className = "" }: { step: number; className?: string }) {
  return (
    <span className={`relative inline-grid overflow-hidden ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={step}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: DUR.fast } }}
          exit={{ opacity: 0, transition: { duration: DUR.fast } }}
          className="col-start-1 row-start-1 block whitespace-nowrap"
        >
          {STEPS[step]}…
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Progress narrative for the compose wait (desktop hero). Mount while `busy`; hides itself for sub-900 ms responses. */
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
 * `spin={false}` keeps the glyph still (the desktop capsule: the Lottie narrative already moves, round4 P1-5).
 */
export function ComposeLabel({
  busy,
  steps = false,
  idle,
  spin = true,
}: {
  busy: boolean;
  steps?: boolean;
  /** the resting label ("Regenerate" in the phone bar once a set exists) */
  idle?: string;
  /** rotate the disc while busy (phone bar only) */
  spin?: boolean;
}) {
  const reduced = useReducedMotion();
  const { visible, step } = useSteps(busy && steps);
  return (
    <>
      {busy && reduced && spin ? (
        <LoaderCircle size={18} className="animate-spin" aria-hidden />
      ) : (
        <motion.span
          animate={busy && spin ? { rotate: 360 } : { rotate: 0 }}
          transition={
            busy && spin
              ? { repeat: Number.POSITIVE_INFINITY, ease: "linear", duration: 1.2 }
              : { duration: 0 }
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
              {busy ? t("composeNarrative.composing") : (idle ?? t("primaryBar.compose_the_night"))}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </>
  );
}
