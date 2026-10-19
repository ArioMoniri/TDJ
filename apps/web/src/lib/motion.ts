import type { Transition, Variants } from "motion/react";

/**
 * TDJ motion tokens (docs/design/motion-system.md §2, merged with motion-composer.md §0).
 * One tango beat ≈ 500 ms; durations are subdivisions. Seconds, because motion/react takes seconds.
 */
export const dur = {
  xs: 0.125,
  s: 0.25,
  m: 0.375,
  l: 0.5,
  loop: 1.2,
  breathe: 3,
  /** composer-only: the result header + score count-up */
  reveal: 0.7,
  /** composer-only: energy curve draw-on */
  draw: 0.9,
} as const;

export const ease = {
  settle: [0.2, 0.8, 0.2, 1],
  out: [0.16, 1, 0.3, 1],
  in: [0.7, 0, 0.84, 0],
  breathe: [0.45, 0, 0.55, 1],
  /** things moving from A to B on screen (composer morphs, nudges) */
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const spring = {
  /** Segmented thumb, tab pill `layoutId`. Settles in ~260 ms, overshoot < 2 px. */
  thumb: { type: "spring", stiffness: 520, damping: 42, mass: 0.8 },
  /** Switch knob. */
  knob: { type: "spring", stiffness: 700, damping: 40 },
  /** Export sheet, undo toast rise. */
  sheet: { type: "spring", stiffness: 380, damping: 38, mass: 1 },
  /** Lock icon dip, energy-curve dots, download check (composer "snappy"). */
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.8 },
  /** Layout moves, card swaps (composer "gentle"). */
  gentle: { type: "spring", stiffness: 300, damping: 32, mass: 1 },
} as const satisfies Record<string, Transition>;

/** Tween presets. Pick by what the element is doing, not by where it is. */
export const t = {
  press: { duration: dur.xs, ease: ease.settle },
  fade: { duration: dur.s, ease: ease.settle },
  enter: { duration: dur.m, ease: ease.out },
  exit: { duration: dur.s, ease: ease.in },
  settle: { duration: dur.l, ease: ease.settle },
} as const satisfies Record<string, Transition>;

/** Stagger: 28 ms per item, capped at 12. Use as `transition={{ ...t.enter, delay: staggerDelay(i) }}`. */
export const STAGGER_MS = 28;
export const STAGGER_CAP = 12;
export const staggerDelay = (i: number) => (Math.min(i, STAGGER_CAP) * STAGGER_MS) / 1000;

/** Composer stagger steps (seconds). Cards are capped at index 8 (everything past the fold arrives together). */
export const STAGGER = { cards: 0.03, dots: 0.028, bars: 0.03, bands: 0.06 } as const;
export const CARD_STAGGER_CAP = 8;

/** Variants shared by pages, rows, toasts. `custom` is the item index for stagger. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { ...t.enter, delay: staggerDelay(i) } }),
  exit: { opacity: 0, y: 0, transition: t.exit },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: t.fade },
  exit: { opacity: 0, transition: t.exit },
};

export const sheetUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: spring.sheet },
  exit: { opacity: 0, y: 16, transition: t.exit },
};

export const toastIn: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { ...t.fade, ease: ease.out } },
  exit: { opacity: 0, y: 6, transition: { duration: dur.xs, ease: ease.in } },
};

/** Composer row/line swap: old text leaves up, new text arrives from below. */
export const lineSwap: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: dur.s, ease: ease.settle } },
  exit: { opacity: 0, y: -6, transition: { duration: dur.xs, ease: ease.in } },
};

/** Reduced-motion variants: every entry/exit becomes a 125 ms opacity change. */
export const reduced = {
  rise: {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: t.press },
    exit: { opacity: 0, transition: t.press },
  },
} as const satisfies Record<string, Variants>;

/* ---- Composer aliases (docs/design/motion-composer.md §0 names) ---- */
export const DUR = {
  instant: 0.08,
  fast: dur.xs,
  base: dur.s,
  slow: dur.l,
  reveal: dur.reveal,
  draw: dur.draw,
} as const;
export const EASE = { out: ease.settle, in: ease.in, inOut: ease.inOut, linear: [0, 0, 1, 1] } as const;
export const SPRING = { snappy: spring.snappy, gentle: spring.gentle, sheet: spring.sheet } as const;
