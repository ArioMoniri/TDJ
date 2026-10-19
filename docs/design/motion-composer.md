# Motion spec: the Compose flow

Scope: `Composer.tsx`, `TandaCard.tsx`, `EnergyCurve.tsx`, `ExportSheet.tsx`, `FeedbackBar.tsx`, `ui.tsx`, `globals.css`, and the Lottie files in `apps/web/public/anim/`. Stack: `motion` 14 (`motion/react`), Tailwind 4, `@lottiefiles/dotlottie-react`.

This document is implementation-ready. Every moment has a purpose, trigger, duration, easing token, choreography, reduced-motion fallback and the code to paste. Nothing here touches layout or copy; it only decides how state changes are shown.

Reference flows reviewed on Mobbin while writing this (motion patterns, not visuals): staged generation copy in [Wabi's "Creating plan" stepper](https://mobbin.com/screens/74077ac9-bcc0-481b-88f1-0ddea0c52d11) and [Perplexity's task log](https://mobbin.com/screens/1a125ff3-7754-4b36-adb2-db05cb7b34a5); dimmed-stage loading in [Once](https://mobbin.com/screens/a20cda83-511a-4bff-a9a3-e7890d3b3486) and [Polarsteps](https://mobbin.com/screens/82fc6f83-a013-45e5-8a61-5dbb8f966e62); Spotify's [queue sheet](https://mobbin.com/screens/f86dc1c9-50a6-4dda-a162-85f41f167386), [now-playing toast "Added to Driving Playlist"](https://mobbin.com/screens/ea9de8a4-a66d-4915-8af8-2c10e3807cb6) and the [DJ pulse screen](https://mobbin.com/screens/e5a03920-10ee-4981-a704-7f90611987f3); chart emphasis in [Cofounder's daily activity curve](https://mobbin.com/screens/2f7a876a-0cb0-4ec2-b47b-e2c6f119f566) and [Delphi insights](https://mobbin.com/screens/81ecd65b-c4a3-4827-b2a3-359105f4a145); sheet grammar in [Perplexity's options sheet](https://mobbin.com/screens/d7220e78-7231-4822-ab69-169c863deff9), [v0's share sheet](https://mobbin.com/screens/51ceeac6-cfa5-48b8-bdcb-f2d96b3ccc1c) and the [LinkedIn "Link copied" banner](https://mobbin.com/screens/2c37a45e-8baf-4cf1-a6cb-78e48e3d34a4).

---

## 0. Tokens

Create `apps/web/src/lib/motion.ts` and import from it everywhere. Do not inline numbers in components.

```ts
// apps/web/src/lib/motion.ts
import type { Transition, Variants } from "motion/react";

/** Durations (seconds). Names describe the job, not the number. */
export const DUR = {
  instant: 0.08, // state flips: pressed, checked
  fast: 0.16,    // exits, hover, icon swaps
  base: 0.24,    // most enters, sheet on desktop
  slow: 0.4,     // sheet on phones, card morphs
  reveal: 0.7,   // result header + score
  draw: 0.9,     // energy curve draw-on
} as const;

/** Easings as motion-compatible cubic-bezier tuples. */
export const EASE = {
  out: [0.2, 0.8, 0.2, 1],    // emphasized decelerate: things arriving (matches .rise / .sheet in globals.css)
  in: [0.4, 0, 1, 1],         // accelerate: things leaving
  inOut: [0.65, 0, 0.35, 1],  // things moving from A to B on screen
  linear: [0, 0, 1, 1],
} as const;

/** Springs for physical UI (toggles, sheets, dots). */
export const SPRING = {
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.8 },   // toggles, pops, chips
  gentle: { type: "spring", stiffness: 300, damping: 32, mass: 1 },     // layout moves, card swaps
  sheet: { type: "spring", stiffness: 420, damping: 40, mass: 1 },      // bottom sheet
} as const satisfies Record<string, Transition>;

export const STAGGER = { cards: 0.03, dots: 0.028, bars: 0.03, bands: 0.06 } as const;

/** Enter/exit for anything that appears in flow. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE.out } },
  exit: { opacity: 0, y: -6, transition: { duration: DUR.fast, ease: EASE.in } },
};
```

CSS tokens mirror the same values (add to `:root` in `globals.css`):

```css
:root {
  --dur-instant: 80ms; --dur-fast: 160ms; --dur-base: 240ms; --dur-slow: 400ms;
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
```

Reduced motion: `<MotionConfig reducedMotion="user">` already wraps the Composer. Under it, motion drops transforms but keeps opacity, which is the fallback we want almost everywhere. Where a moment needs a specific fallback (count-up, draw-on, Lottie), it is called out below and gated with `useReducedMotion()`.

---

## 1. Critique of the current flow from a motion perspective

What exists today: `.rise` on the result surface (one-shot 450 ms), `.sheet` slide-up on the export dialog (enter only, no exit), `layout` on `TandaCard` with `initial={false}` (so swaps never animate in or out), `animate-spin` on loaders, the vinyl Lottie spinning while busy, chevron rotate on `<details>`, the switch knob and `:active` scale on buttons.

Where motion is missing and the UI pays for it:

1. **Compose is a black box for 1–3 s.** The only feedback is a spinning disc in the hero (hidden on phones once a set exists) and a spinner in the button. The user cannot tell whether the app is working, hung, or what it is doing. The result then appears in one frame and the page scrolls. The jump from "nothing" to "22 cards + chart + score" is the single most disorienting moment in the app.
2. **Score and curve appear fully formed.** The score (80/100) is the headline payoff and the curve is the product's whole argument ("the night has a shape"). Both deserve to be read in, not pasted in.
3. **Recompose and feedback chips replace everything silently.** Locked tandas are promised to "stay where they are", but nothing on screen shows them staying while the others change; every card remounts (the key includes the first song id) with `initial={false}`, so the grid just flickers to a new state. The user cannot verify the promise.
4. **Tanda swap and per-track swap have no before/after.** The RefreshCw icon spins, then the text changes in place. Because tanda names and song titles are similar-length, a user often doesn't notice what changed.
5. **Lock has no acknowledgement beyond an icon glyph swap** (LockOpen → Lock) and a tiny "locked" label. This is a stateful decision that affects the next compose; it needs a physical click.
6. **Export sheet closes instantly** (component returns `null`), so the success path, Spotify's long resolve loop and the download have no closing beat. "Open in Spotify" simply appears.
7. **Score breakdown**: `<details>` snaps open; the factor bars are already at full width, so the user doesn't read them as magnitudes.
8. **Cortina rows are inert.** They are the one place where "preview" is a natural micro-interaction and nothing invites it.
9. **Error states** replace the live region text; the compose button offers no "that didn't take" cue.

Where motion would be noise, and is deliberately excluded:

- The controls panel (slider, chips, segmented, stepper). These are frequent, low-stakes edits; the 150 ms `:active` scale and `chip-on` colour change are enough. No layout animation on chip rows (it would fight the horizontal scroll-snap on phones).
- The ambient background already drifts (28 s). Nothing else in the page may move continuously while idle. The hero vinyl spins only while composing; keep it so.
- Hover effects on tanda cards (lift/shadow). Cards are dense information surfaces, and 22 of them lifting under a moving pointer is distraction. Hover is reserved for the cortina row and buttons.
- Continuous glow/pulse on the primary button. Once.
- Page-level transitions between routes. Out of scope and not wanted.

Principle for the whole page: **motion explains causality** (what I pressed → what changed → what stayed), and the only decorative motion is the 1.3 s reveal of a freshly composed night.

---

## 2. Motion spec per moment

### 2.1 Compose button press and the composing state

**Purpose.** Confirm the press instantly, then narrate a 1–3 s wait in the product's own vocabulary so it feels like work, not latency. Target ≤ 2 s of visible narrative; never delay the result to finish the narrative.

**Trigger.** `run()` sets `busy`. Narrative shows only if `busy` persists > 250 ms (prevents flashing on fast responses); once shown, it runs until the response and then hands off to the reveal (§2.2).

**Choreography (desktop).**

| t (ms) | element | change |
|---|---|---|
| 0 | `.btn-primary` | pressed scale 0.97 (CSS, exists); label crossfades "Compose the night" → "Composing…" (`DUR.fast`) and `Disc3` icon rotates continuously (replace the `LoaderCircle` swap; the icon already looks like a record). |
| 0 | hero vinyl | `playing` → spins (exists) |
| 250 | hero (right of the vinyl on `sm:`, below title on phones) | `ComposeNarrative` mounts: `compose-loading.json` plays (loop) with the step line beneath it |
| 250 → +450 each | step line | "Placing tandas" → "Matching cortinas" → "Shaping the arc" → "Scoring the night". Each step: old text exits `y:-6, opacity:0` (`DUR.fast`, `EASE.in`), new enters `y:6→0, opacity 0→1` (`DUR.base`, `EASE.out`). The last step holds until the response. |
| response | everything above | narrative exits (`opacity 0`, `DUR.fast`), button label returns, reveal begins |

**Easing tokens.** Label crossfade `EASE.out`/`EASE.in`; icon spin linear 1.2 s/turn.

**Reduced motion.** Icon does not spin (use the existing `LoaderCircle` with the 1.6 s rule in `globals.css`); step texts crossfade with opacity only (`MotionConfig` handles this); Lottie does not play, show frame 60 of `compose-loading.json` as a still (`autoplay={false}` + `dotLottie.setFrame(60)`).

**Implementation.**

```tsx
// apps/web/src/components/ComposeNarrative.tsx
"use client";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { DUR, EASE } from "@/lib/motion";

const STEPS = ["Placing tandas", "Matching cortinas", "Shaping the arc", "Scoring the night"];
const STEP_MS = 450;
const SHOW_AFTER_MS = 250;

/** Progress narrative for the compose wait. Mount while `busy`; it hides itself for sub-250 ms responses. */
export function ComposeNarrative({ busy }: { busy: boolean }) {
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const lottie = useRef<DotLottie | null>(null);

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

  useEffect(() => {
    if (reduced) lottie.current?.setFrame(60); // the arc fully drawn
  }, [reduced, visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="narrative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: DUR.fast } }}
          className="flex flex-col items-center gap-1"
          aria-hidden // the live region in Composer already announces "Composing the night…"
        >
          <div className="w-40 sm:w-56">
            <DotLottieReact
              src="/anim/compose-loading.json"
              loop
              autoplay={!reduced}
              dotLottieRefCallback={(d) => (lottie.current = d)}
            />
          </div>
          <div className="relative h-5 overflow-hidden text-xs text-muted">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={step}
                initial={{ y: 6, opacity: 0 }}
                animate={{ y: 0, opacity: 1, transition: { duration: DUR.base, ease: EASE.out } }}
                exit={{ y: -6, opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } }}
                className="block"
              >
                {STEPS[step]}…
              </motion.span>
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

Button label (replace the `{busy ? <LoaderCircle/> : <Disc3/>} Compose the night` fragment in both the desktop button and the sticky phone bar):

```tsx
import { motion, AnimatePresence } from "motion/react";
import { DUR } from "@/lib/motion";

function ComposeLabel({ busy }: { busy: boolean }) {
  return (
    <>
      <motion.span
        animate={busy ? { rotate: 360 } : { rotate: 0 }}
        transition={busy ? { repeat: Infinity, ease: "linear", duration: 1.2 } : { duration: 0 }}
        className="inline-flex motion-reduce:animate-none"
      >
        <Disc3 size={18} />
      </motion.span>
      <span className="relative inline-grid">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={busy ? "busy" : "idle"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DUR.fast }}
            className="col-start-1 row-start-1"
          >
            {busy ? "Composing…" : "Compose the night"}
          </motion.span>
        </AnimatePresence>
      </span>
    </>
  );
}
```

Mount `<ComposeNarrative busy={busy} />` inside the hero `section`, as a sibling after the `Vinyl`, with `className="hidden sm:flex"`; on phones mount it inside the sticky compose bar instead (see §3.1). Keep `disabled={busy}` on the button.

### 2.2 Result reveal (score, energy curve, phase bands)

**Purpose.** Turn "a set exists" into "the night has a shape and it scored 80". The user's eye should land on the score, then read the curve left-to-right as the line is drawn, in the same order a DJ thinks about the night.

**Trigger.** `playlist` changes from `null`, or a compose with a different `playlist.options.seed` (full reveal). A recompose/feedback with the same hours and a same-length `tandas` array uses the morph variant (§2.5) instead.

**Choreography (1 300 ms total; nothing after the reveal is blocked).**

| t (ms) | element | change | transition |
|---|---|---|---|
| 0 | `#result > .surface` | `.rise` (exists) | 450 ms `EASE.out` |
| 40 | `h2` + meta `dl` | opacity 0→1, y 6→0 | `DUR.base`, `EASE.out` |
| 120 → 920 | score number | counts 0 → `score.total`; the "/100" and verdict fade in at 700 | 800 ms, `EASE.out` (fast early, slow landing, like a tape counter settling) |
| 0 → 300 | phase bands (`rect`) | fillOpacity 0 → 0.05 / 0 | stagger `STAGGER.bands`, `DUR.base` |
| 200 | grid lines + axis labels + target arc (dashed) | opacity 0→1 | `DUR.base` |
| 300 → 1200 | energy path | `pathLength` 0→1 | `DUR.draw`, `EASE.out` |
| 300 + i/n·900 | dot i | scale 0→1 with `SPRING.snappy` (overshoot ~8 %) as the line passes it | per dot |
| 1100 | area fill (gradient) | opacity 0→1 | `DUR.slow` |
| 1200 | legend `figcaption` | opacity 0→1 | `DUR.base` |

**Reduced motion.** Score renders at its final value immediately; path has `pathLength: 1`; dots and bands appear with opacity only (`DUR.base`); no stagger beyond 3 elements.

**Implementation: score count-up.**

```tsx
// apps/web/src/components/ScoreCounter.tsx
"use client";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import { EASE } from "@/lib/motion";

export function ScoreCounter({ value, playKey }: { value: number; playKey: string | number }) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const rounded = useTransform(mv, (v) => Math.round(v));
  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration: 0.8, delay: 0.12, ease: EASE.out });
    return () => c.stop();
  }, [value, playKey, reduced, mv]);
  return (
    <span className="tabular-nums" aria-label={`${value} of 100`}>
      <motion.span aria-hidden>{rounded}</motion.span>
    </span>
  );
}
```

Use in `Composer.tsx` (the `{playlist.score.total}` slot): `<ScoreCounter value={playlist.score.total} playKey={playlist.options.seed} />`. Wrap the `/100` and verdict in `<motion.span initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.7, duration:DUR.base}}>` keyed on the seed. The live region already announces "Set ready: N tandas."; keep the number out of it to avoid reading intermediate values.

**Implementation: EnergyCurve draw-on.** Convert the SVG primitives in `EnergyCurve.tsx` to `motion.*` and drive them from one `variants` tree so the whole figure sequences from a single `animate="show"`. The data math is unchanged.

```tsx
import { motion, useReducedMotion } from "motion/react";
import { DUR, EASE, SPRING, STAGGER } from "@/lib/motion";

// inside EnergyCurve(): add a `playKey` prop (playlist.options.seed) and
const reduced = useReducedMotion();
const n = Math.max(1, p.tandas.length - 1);
const dotDelay = (i: number) => (reduced ? 0 : 0.3 + (i / n) * DUR.draw);

const figure = { hidden: {}, show: {} }; // parent only orchestrates via children's own delays
const band = {
  hidden: { fillOpacity: 0 },
  show: (k: number) => ({ fillOpacity: k % 2 ? 0.05 : 0, transition: { delay: k * STAGGER.bands, duration: DUR.base } }),
};
const fade = (delay: number) => ({
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { delay, duration: DUR.base } },
});
const line = {
  hidden: { pathLength: 0, opacity: 1 },
  show: { pathLength: 1, transition: { delay: 0.3, duration: DUR.draw, ease: EASE.out } },
};
const dot = {
  hidden: { scale: 0 },
  show: (i: number) => ({ scale: 1, transition: { ...SPRING.snappy, delay: dotDelay(i) } }),
};

return (
  <figure className="m-0">
    <motion.svg key={playKey} variants={figure} initial="hidden" animate="show" viewBox={...} ...>
      {bands.map((b, k) => (
        <motion.rect key={b.ph} custom={k} variants={band} fill="currentColor" ... />
      ))}
      <motion.g variants={fade(0.2)}>{/* grid lines + y labels + dashed target path */}</motion.g>
      <motion.path d={area} fill={`url(#${id})`} variants={fade(1.1)} />
      <motion.path
        d={smooth(p.stats.energyArc)}
        fill="none" stroke="#e0557a" strokeWidth="3" strokeLinecap="round"
        variants={line}
        style={{ pathLength: reduced ? 1 : undefined }}
      />
      {p.tandas.map((t, i) => (
        <motion.g key={t.index} custom={i} variants={dot} style={{ transformOrigin: `${x(i)}px ${y(t.energy)}px`, transformBox: "fill-box" }} ...>
          {/* existing circles; the focus ring circle stays unanimated */}
        </motion.g>
      ))}
      <motion.g variants={fade(1.2)}>{/* phase labels */}</motion.g>
    </motion.svg>
    <motion.figcaption variants={fade(1.2)} initial="hidden" animate="show" ...>{/* legend */}</motion.figcaption>
  </figure>
);
```

Notes for the engineer:
- `pathLength` on `motion.path` sets `stroke-dasharray`/`stroke-dashoffset` under the hood; do not also set `strokeDasharray` on the energy path (the target arc keeps its own dashes and is only faded).
- `transformOrigin` on an SVG `g` needs `transformBox: "fill-box"`; the hit-area circle (`r=20`) is inside the group and scales with it, which is fine because by frame 1 the dots are full size.
- Both `EnergyCurve` instances (compact + full) are mounted but one is hidden via CSS; the hidden one still runs timers. Render only the one that matches the breakpoint (a `useMediaQuery("(min-width: 640px)")` hook) to halve the work.

### 2.3 Tanda card entrance, swap and layout

**Purpose.** On first reveal, cards arrive in reading order so the grid feels placed, not dumped. On swap, the old tanda visibly leaves and the new one visibly arrives in the same slot.

**Trigger.** Mount of `TandaCard` (entrance), key change at the same index (swap), index/position change (layout move).

**Choreography.**
- Entrance: opacity 0→1, y 12→0, `DUR.slow`-ish 320 ms `EASE.out`, delay `min(i, 8) × STAGGER.cards` (cap: cards 9+ are below the fold on every viewport and must not wait).
- Swap out: the old card: opacity 1→0, scale 1→0.98, `DUR.fast`, `EASE.in`. Swap in: opacity 0→1, y 8→0, `DUR.base`, `EASE.out`. Via `AnimatePresence mode="popLayout"` on the grid so siblings never jump.
- Layout: `layout` prop stays; transition `SPRING.gentle`. Locked cards get `layout="position"` so their size never animates (contents don't change).
- Busy (swap in flight): card content opacity 1→0.6 over `DUR.base`; the `RefreshCw` spins (exists). No skeletons: the request is sub-second.
- Energy number (`t.energy`) counts from old to new over `DUR.slow` after a swap (reuse `ScoreCounter` with the tanda's key as `playKey`).

**Reduced motion.** Opacity only, no stagger (delay 0), layout animations off (`layout={false}` when `reduced`).

**Implementation.** In `Composer.tsx` wrap the grid:

```tsx
import { AnimatePresence } from "motion/react";
...
<div className="grid gap-4 md:grid-cols-2">
  <AnimatePresence mode="popLayout" initial={false}>
    {playlist.tandas.map((t, i) => (
      <TandaCard key={`${t.index}-${t.songs[0]?.id}`} t={t} i={i} revealKey={playlist.options.seed} ... />
    ))}
  </AnimatePresence>
</div>
```

In `TandaCard.tsx` replace the `motion.article` props:

```tsx
import { motion, useReducedMotion } from "motion/react";
import { DUR, EASE, SPRING, STAGGER } from "@/lib/motion";

const reduced = useReducedMotion();
<motion.article
  layout={reduced ? false : t.locked ? "position" : true}
  initial={{ opacity: 0, y: reduced ? 0 : 12 }}
  animate={{ opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE.out, delay: reduced ? 0 : Math.min(i, 8) * STAGGER.cards } }}
  exit={{ opacity: 0, scale: reduced ? 1 : 0.98, transition: { duration: DUR.fast, ease: EASE.in } }}
  transition={SPRING.gentle} // layout
  style={{ willChange: "transform, opacity" }}
  className={`surface overflow-hidden p-4 sm:p-5 ${active ? "ring-2 ring-[var(--accent)]" : ""}`}
  ...
>
  <motion.div animate={{ opacity: busy ? 0.6 : 1 }} transition={{ duration: DUR.base }}>
    {/* existing card body */}
  </motion.div>
</motion.article>
```

`initial={false}` must go; `AnimatePresence initial={false}` on the parent is what suppresses the entrance on hydration, while allowing it for a new set. Because `popLayout` positions exiting elements absolutely, the grid must not use `gap` that depends on the exiting card; the existing `grid gap-4` is fine.

### 2.4 Lock toggle

**Purpose.** A lock is a promise for the next compose. It needs a physical click and a persistent, calm marker.

**Trigger.** `onLock` → `t.locked` flips.

**Choreography (220 ms).**
- Icon: `LockOpen` ↔ `Lock` crossfade with a scale dip 1 → 0.85 → 1 (`SPRING.snappy`), locking adds a -8° → 0° rotate of the shackle (the whole icon; good enough at 16 px).
- Button background: `rgb(var(--text)/.05)` → `rgb(var(--text)/.12)` when pressed-on (`aria-pressed`), `DUR.fast`.
- "locked" label: width 0 → auto with opacity, `DUR.base`, via `AnimatePresence` (it sits in a flex-wrap row; animate `opacity` + `x: -4→0` only, let flex handle width).
- Card: 1 px hairline border tone → `--color-gold` at 40 % opacity, `DUR.base`. Gold is "golden age" in the palette and reads as "kept". Not the accent (accent = primary action).
- Swap buttons disabled state fades (already via `:disabled` opacity).

**Reduced motion.** Crossfade only; border tone still changes (colour is not motion).

**Implementation.**

```tsx
// in TandaCard.tsx
<motion.button
  type="button"
  onClick={onLock}
  className="icon-btn"
  aria-pressed={!!t.locked}
  aria-label={`${t.locked ? "Unlock" : "Lock"} tanda ${i + 1}`}
  whileTap={{ scale: 0.92 }}
  animate={{ backgroundColor: t.locked ? "rgb(var(--text) / 0.12)" : "rgb(var(--text) / 0.05)" }}
  transition={{ duration: DUR.fast }}
>
  <AnimatePresence mode="popLayout" initial={false}>
    <motion.span
      key={t.locked ? "locked" : "open"}
      initial={{ scale: 0.85, opacity: 0, rotate: t.locked ? -8 : 0 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      exit={{ scale: 0.85, opacity: 0 }}
      transition={SPRING.snappy}
      className="inline-flex"
    >
      {t.locked ? <Lock size={16} /> : <LockOpen size={16} />}
    </motion.span>
  </AnimatePresence>
</motion.button>

// "locked" chip in the header row
<AnimatePresence initial={false}>
  {t.locked && (
    <motion.span
      key="locked"
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -4 }}
      transition={{ duration: DUR.base, ease: EASE.out }}
      className="text-muted inline-flex items-center gap-1 text-xs"
    >
      <Lock size={11} /> locked
    </motion.span>
  )}
</AnimatePresence>

// article border: add to the className
${t.locked ? "border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)]" : ""}
// and `transition-colors duration-[var(--dur-base)]`
```

Because the swap button is disabled while locked, nothing else on the card needs to move. Android gets a haptic tick here (§3.4).

### 2.5 Per-track swap

**Purpose.** Show exactly which line changed and whether its energy went up or down.

**Trigger.** `onSwapTrack(k)`; the `li` key is `s.id`, so a successful swap remounts that row.

**Choreography.**
- In flight: the row's `RefreshCw` spins (exists); the title dims to 0.6 (`DUR.fast`).
- On change: old row text exits up (`y:-6, opacity 0`, `DUR.fast`, `EASE.in`), new enters from below (`y:6→0`, `DUR.base`, `EASE.out`); the energy bar animates `scaleX` from the old to the new width over `DUR.slow` with `EASE.inOut`; the year in parentheses rides with the title.
- On "no other recording fits": the row does a 1-cycle horizontal nudge (`x: [0, -3, 3, 0]`, 240 ms) and the note under the FeedbackBar fades in (exists via `note`). No colour change; this is information, not an error.

**Reduced motion.** Crossfade, bar jumps, no nudge.

**Implementation.** Wrap the `<ol>` in `AnimatePresence mode="popLayout" initial={false}` and make the `li` a `motion.li` with `variants={rise}` (`initial="hidden" animate="show" exit="exit"`), `layout="position"`. The energy bar becomes transform-only:

```tsx
<span className="relative h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-[rgb(var(--text)/.12)] sm:w-16" role="img" aria-label={`Energy ${s.energy ?? 50} of 100`}>
  <motion.span
    className="block h-full w-full origin-left rounded-full bg-[#e0557a]"
    initial={false}
    animate={{ scaleX: (s.energy ?? 50) / 100 }}
    transition={{ duration: DUR.slow, ease: EASE.inOut }}
  />
</span>
```

(The same `scaleX` pattern replaces every `style={{ width: \`${x}%\` }}` bar on the page, including the score factors in §2.8: width animation reflows, `scaleX` does not.)

For the nudge, lift a `nudgeKey` state in `TandaCard` that increments when `onSwapTrack` resolves without a change (Composer passes `swapResult: "same" | null` or calls a ref callback), and animate the row: `animate={nudge ? { x: [0, -3, 3, 0] } : { x: 0 }} transition={{ duration: 0.24 }}`.

### 2.6 Feedback chip tap and "Tell the DJ" → recompose

**Purpose.** Make "locked tandas stay where they are" visibly true, and show the set reshaping rather than being replaced.

**Trigger.** `feedback(f)` or `refine(text)` → `busy` → `setPlaylist(next)`.

**Choreography.**
1. Chip press: `whileTap scale 0.96`; the tapped chip switches to `chip-on` for the duration of `busy` (so the user sees which adjustment is being applied) and its text is prefixed by a 14 px spinning `LoaderCircle`. Other chips keep `disabled` opacity.
2. Settling state (while `busy`): every unlocked card animates to `opacity 0.55, scale 0.985` (`DUR.base`); locked cards stay at 1 and their gold hairline brightens to 70 % (`DUR.base`). The curve's energy path and dots drop to opacity 0.4; bands and target arc stay (the target is what the feedback changes least). No blur filters.
3. New playlist arrives:
   - Cards whose key survives (locked, or identical first song) do not remount: `layout` moves them to their new slot with `SPRING.gentle`; locked cards almost always keep the slot, so they simply un-dim.
   - Cards whose key changed exit (`DUR.fast`) and the replacements enter staggered by `STAGGER.cards` from the first changed index, not from 0.
   - Score counts from the old value to the new (not from 0). Pass the previous total to `ScoreCounter` as the motion value's start: `mv.set(prev)` before `animate`.
   - Curve morphs: same `tandas.length` → `motion.path` animates the `d` attribute from old to new (`DUR.slow`, `EASE.inOut`); dots animate `cx`/`cy` with the same transition; bands animate `x`/`width`. Different length → fall back to the §2.2 draw-on (set a new `playKey`).
4. The result section does **not** scroll-into-view on recompose (it does on first compose). The user is already looking at it; a scroll jump is the single most common cause of "what just happened".

**Reduced motion.** No dimming scale (opacity only); curve path snaps; score snaps.

**Implementation.**

```tsx
// Composer.tsx: track which chip is in flight and the previous score
const [pendingChip, setPendingChip] = useState<Feedback | null>(null);
const prevScore = useRef<number | null>(null);
// in feedback(): setPendingChip(f); try { ... } finally { setPendingChip(null); }
// before setPlaylist(p): prevScore.current = playlist?.score.total ?? null;
// in run(): only scrollIntoView when `!playlist` (first set) or when opts?.hours changed.

// FeedbackBar.tsx chip
<motion.button
  type="button"
  key={k}
  className={`chip ${pending === k ? "chip-on" : ""}`}
  disabled={busy}
  whileTap={{ scale: 0.96 }}
  onClick={() => onFeedback(k)}
>
  {pending === k && <LoaderCircle size={14} className="animate-spin" />} {l}
</motion.button>

// TandaCard.tsx: settling prop
<motion.article
  animate={{
    opacity: settling && !t.locked ? 0.55 : 1,
    scale: settling && !t.locked && !reduced ? 0.985 : 1,
  }}
  transition={{ duration: DUR.base, ease: EASE.out }}
  ...
/>
```

Curve morph: in `EnergyCurve`, when `p.tandas.length` equals the previous render's length, render `motion.path` with `animate={{ d: smooth(p.stats.energyArc) }}` and `transition={{ duration: DUR.slow, ease: EASE.inOut }}`, and `motion.circle` with `animate={{ cx, cy }}`. Motion interpolates `d` strings when the command structure matches, which `smooth()` guarantees for equal point counts. Keep `initial={false}` on these in morph mode so they do not re-run the draw-on.

### 2.7 Export sheet open/close and success state

**Purpose.** Modal commitment on open; a release on close; one unmistakable "it worked" beat after a multi-second Spotify resolve.

**Trigger.** `exportOpen` true/false; `result` set after `createPlaylist`; `dlBusy` cleared after a download.

**Choreography.**
- Open, phones (`< sm`): backdrop opacity 0→1 (`DUR.base`); panel `y: 100% → 0` with `SPRING.sheet` (≈ 380 ms to rest, slight overshoot of ~4 px is acceptable and reads as physical). Drag handle fades in with the panel.
- Open, desktop: backdrop as above; panel `opacity 0→1, scale 0.96→1, y 12→0`, `DUR.base`, `EASE.out`.
- Close: backdrop `DUR.fast`; phones `y → 100%` with `DUR.base` `EASE.in`; desktop `opacity → 0, scale → 0.98` `DUR.fast` `EASE.in`. The component must stay mounted through the exit (`AnimatePresence`), so move the `if (!open || !playlist) return null;` after the presence boundary.
- Download success: the pressed export button's `Download` icon crossfades to `Check` for 1.2 s (`SPRING.snappy` scale 0.6→1), then back. No Lottie here: eight buttons, 15 px icons.
- Spotify success: the primary button's label crossfades to "Playlist created" and `success-check.json` plays once (1.2 s) at 24 px in the icon slot; at 700 ms the "Open in Spotify" link rises in (`rise` variants) and takes focus. The log box below keeps its live region.
- Spotify error: button returns to idle, the log line appears, and the panel nudges `x: [0,-4,4,-2,0]` 280 ms.

**Reduced motion.** Backdrop and panel crossfade (`DUR.base`); Lottie shows its final frame (`setFrame(35)`); no nudge.

**Implementation.**

```tsx
// ExportSheet.tsx
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { DUR, EASE, SPRING, rise } from "@/lib/motion";

export function ExportSheet({ open, onClose }) {
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 639px)");
  ...
  const panelMotion = isPhone
    ? { initial: { y: "100%" }, animate: { y: 0, transition: SPRING.sheet }, exit: { y: "100%", transition: { duration: DUR.base, ease: EASE.in } } }
    : { initial: { opacity: 0, scale: 0.96, y: 12 }, animate: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR.base, ease: EASE.out } }, exit: { opacity: 0, scale: 0.98, transition: { duration: DUR.fast, ease: EASE.in } } };

  return (
    <AnimatePresence>
      {open && playlist && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.button
            type="button"
            className="absolute inset-0 cursor-default bg-black/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: DUR.base } }} exit={{ opacity: 0, transition: { duration: DUR.fast } }}
            onClick={onClose} aria-label="Close export sheet" tabIndex={-1}
          />
          <motion.div
            ref={panel}
            role="dialog" aria-modal="true" aria-labelledby="export-title" aria-describedby="export-desc"
            className="glass relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-b-none p-5 pt-3 sm:rounded-b-[24px] sm:pt-5"
            style={{ willChange: "transform" }}
            {...panelMotion}
            // phone drag-to-dismiss, see §3.2
          >
            ... existing content ...
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

Remove the `.sheet` class from the panel (its CSS keyframe would double the enter). Keep the focus/scroll-lock effect; it already keys on `open`.

Spotify success button:

```tsx
const check = useRef<DotLottie | null>(null);
const [done, setDone] = useState(false);
// after setResult(pl.external_urls.spotify): setDone(true); check.current?.play();

<button type="button" onClick={toSpotify} disabled={busy || done} className="btn btn-primary mt-4 w-full">
  <span className="inline-grid h-6 w-6 place-items-center">
    {done ? (
      <DotLottieReact
        src="/anim/success-check.json"
        autoplay={!reduced}
        loop={false}
        dotLottieRefCallback={(d) => { check.current = d; if (reduced) d?.setFrame(35); }}
        style={{ width: 24, height: 24 }}
      />
    ) : busy ? <LoaderCircle size={16} className="animate-spin" /> : null}
  </span>
  <AnimatePresence mode="popLayout" initial={false}>
    <motion.span key={done ? "done" : "idle"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DUR.fast }}>
      {done ? "Playlist created" : spotifyToken ? "Create playlist in Spotify" : "Connect Spotify and create playlist"}
    </motion.span>
  </AnimatePresence>
</button>

<AnimatePresence>
  {result && (
    <motion.a key="open" variants={rise} initial="hidden" animate="show" exit="exit" transition={{ delay: 0.7 }}
      href={result} target="_blank" rel="noreferrer" className="btn btn-ghost mt-2 w-full" ref={(el) => el?.focus()}>
      Open in Spotify <ExternalLink size={14} />
    </motion.a>
  )}
</AnimatePresence>
```

Download buttons: keep a `justDone: ExportFormat | null` state set for 1 200 ms after `downloadBlob`, and render `{justDone === f ? <motion.span initial={{scale:0.6}} animate={{scale:1}} transition={SPRING.snappy}><Check size={15}/></motion.span> : <Download size={15}/>}`.

### 2.8 Score breakdown disclosure ("How this set scored")

**Purpose.** Reveal the factor bars as magnitudes: grow them so the eye compares lengths.

**Trigger.** Disclosure toggles.

**Choreography.** Chevron rotates 180° (`DUR.base`, exists via `transition-transform`). Content height 0 → auto (`DUR.base`, `EASE.out`) with opacity. Each factor bar `scaleX` 0 → score over `DUR.slow`, staggered `STAGGER.bars`, starting 80 ms after the height animation begins. Close: height → 0 and opacity → 0 in `DUR.fast`; bars do not animate on close.

**Reduced motion.** Height still animates (it is a size change, not a transform, and under 300 ms); bars render at full scale immediately.

**Implementation.** `<details>` cannot animate height. Replace the two `<details>` blocks with a `Disclosure` component that keeps the same semantics (`button[aria-expanded][aria-controls]` + region):

```tsx
// apps/web/src/components/Disclosure.tsx
"use client";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useId, useState } from "react";
import { DUR, EASE } from "@/lib/motion";

export function Disclosure({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="mt-3 text-sm">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 text-left text-sm font-medium">
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: DUR.base, ease: EASE.out }} className="inline-flex">
          <ChevronDown size={16} />
        </motion.span>
        {summary}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: { height: { duration: DUR.base, ease: EASE.out }, opacity: { duration: DUR.fast, delay: 0.06 } } }}
            exit={{ height: 0, opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

Factor bars inside: `motion.div className="h-full w-full origin-left rounded-full bg-[rgb(var(--text)/.6)]" initial={{ scaleX: 0 }} animate={{ scaleX: f.score }} transition={{ duration: DUR.slow, ease: EASE.out, delay: 0.08 + idx * STAGGER.bars }}`. Keep `role="img"` + `aria-label` on the track.

Use the same component for "Mood check". The `MoodCheck` content is heavier (embeds); its `children` should be rendered only when open, which the `AnimatePresence` branch already guarantees.

### 2.9 Cortina row hover and tap preview

**Purpose.** Invite a listen. The cortina is the one line on the card that a DJ wants to audition quickly.

**Trigger.** Pointer hover (`@media (hover: hover)`), focus-visible, or tap/click on the row (toggles the preview). The row becomes a `button` (`aria-expanded`, `aria-controls` → the `CortinaPreview` wrapper) when a cortina exists; the existing `listen` toggle still opens it too.

**Choreography.**
- Hover/focus: row background `rgb(var(--text)/.04)` → `.07` (`DUR.fast`); the `AudioLines` icon is replaced by `cortina-wave.json` which plays while hovered and freezes on frame 0 when the pointer leaves (not a reset-jump: `pause()` then `setFrame(0)` after a 160 ms opacity dip).
- Tap/click: `whileTap scale 0.995` (the row is wide; anything more looks wobbly); preview panel height 0 → auto (`DUR.base`, `EASE.out`); the wave keeps playing while the preview is open (it is the "now previewing" indicator, like the Spotify playing-bars glyph).
- Close: panel height → 0 `DUR.fast`; wave stops.

**Reduced motion.** No wave playback; the Lottie shows frame 0 (static bars) and the `AudioLines` icon is used instead; background change stays.

**Implementation.**

```tsx
// in TandaCard.tsx, replace the cortina block
const [cortinaOpen, setCortinaOpen] = useState(false);
const wave = useRef<DotLottie | null>(null);
const [hover, setHover] = useState(false);
const playing = (hover || cortinaOpen) && !reduced;
useEffect(() => { playing ? wave.current?.play() : (wave.current?.pause(), wave.current?.setFrame(0)); }, [playing]);

{t.cortina && (
  <div className="mt-3 rounded-xl border border-[rgb(var(--text)/.08)] text-xs">
    <motion.button
      type="button"
      onClick={() => setCortinaOpen((v) => !v)}
      onHoverStart={() => setHover(true)}
      onHoverEnd={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      whileTap={{ scale: 0.995 }}
      animate={{ backgroundColor: hover || cortinaOpen ? "rgb(var(--text) / 0.07)" : "rgb(var(--text) / 0.04)" }}
      transition={{ duration: DUR.fast }}
      aria-expanded={cortinaOpen}
      aria-controls={`cortina-${i + 1}`}
      className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left"
    >
      <span className="mt-0.5 inline-grid h-4 w-5 shrink-0 place-items-center">
        {reduced ? (
          <AudioLines size={14} className="opacity-70" />
        ) : (
          <DotLottieReact src="/anim/cortina-wave.json" loop autoplay={false} dotLottieRefCallback={(d) => (wave.current = d)} style={{ width: 20, height: 10 }} />
        )}
      </span>
      <span className="min-w-0">
        <b>Cortina</b> · {t.cortina.artist} – {t.cortina.title}
        <span className="text-muted block sm:inline"> · {t.cortina.genre} · energy {t.cortina.energy} · {t.cortina.lengthSec ?? 45} s</span>
      </span>
    </motion.button>
    <AnimatePresence initial={false}>
      {cortinaOpen && (
        <motion.div id={`cortina-${i + 1}`} key="preview" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: DUR.base, ease: EASE.out }} className="overflow-hidden px-3 pb-2">
          <CortinaPreview c={t.cortina} />
        </motion.div>
      )}
    </AnimatePresence>
  </div>
)}
```

`motion`'s `onHoverStart` only fires for real pointers (it filters touch), so phones never get stuck in the hover state. Twenty-two tiny Lottie players are acceptable because they are paused (no rAF) until hovered; see §4 for the IntersectionObserver rule if it ever becomes a problem.

### 2.10 Empty and error states

**Empty (no set yet).** Nothing moves. The hero vinyl is still; the controls are static. The sole affordance is the primary button. Do not add an "idle breathing" animation to the button; the first compose is the reward.

**Compose error** (`error` set: "Could not compose this set." / "Could not reach the composer. Try again.").
- The live region line enters with `rise` (`y 6→0`) in accent colour (exists colour-wise).
- The compose button nudges horizontally `x: [0, -4, 4, -2, 0]` over 280 ms, `EASE.inOut` — once. This is the "that didn't take" cue; the amplitude is small so it reads as a head-shake, not an alarm.
- The vinyl stops (already: `playing={busy}`), the narrative exits (§2.1).
- Reduced motion: text appears (opacity), no nudge.

```tsx
// Composer.tsx: wrap the primary button in motion and key the nudge on the error string
const [errorKey, setErrorKey] = useState(0);
// in run() catch/!r.ok branches: setErrorKey((k) => k + 1);
<motion.button
  key="compose"
  type="button"
  onClick={() => run()}
  disabled={busy}
  className="btn btn-primary hidden sm:inline-flex"
  animate={error && !reduced ? { x: [0, -4, 4, -2, 0] } : { x: 0 }}
  transition={{ duration: 0.28, ease: EASE.inOut }}
  // re-trigger on repeated identical errors:
  custom={errorKey}
>
```

(`animate` with an array keyframe re-runs whenever the array identity changes; build it inline inside a `useMemo` keyed on `errorKey` so a repeated identical error still nudges.)

**Per-track "no other recording fits"**: see §2.5 (row nudge + note).

**Export errors**: §2.7 (panel nudge + log line).

**Spotify "Finding these recordings…" inside Listen**: keep the spinner; add nothing.

---

## 3. Mobile

The phone layout is different enough (sticky compose bar, bottom tab bar, compact curve, hidden hero after the first set) that the choreography above needs these adjustments.

### 3.1 Sticky compose bar carries the narrative

On phones the hero is hidden once a set exists, so the vinyl and `ComposeNarrative` are off-screen. Put the narrative *in* the bar: while `busy`, the button label cycles the four steps instead of "Composing…" (same `AnimatePresence` text swap as §2.1, in the 44 px button; the `Disc3` icon spins). The Lottie is not shown on phones (the bar is 56 px tall and sits on a backdrop-filter; see §4). The tab bar does not change.

```tsx
// in the sticky bar button
{busy ? <StepLabel /> : "Compose the night"}
// StepLabel = the inner AnimatePresence text block from ComposeNarrative, exported separately
```

### 3.2 Export sheet: drag to dismiss

Add to the phone variant of the panel in §2.7:

```tsx
drag={isPhone && !reduced ? "y" : false}
dragConstraints={{ top: 0, bottom: 0 }}
dragElastic={{ top: 0, bottom: 0.6 }}
dragMomentum={false}
onDragEnd={(_, info) => {
  if (info.offset.y > 120 || info.velocity.y > 600) onClose();
}}
```

The drag handle (`h-1.5 w-9`) is the visual cue; the whole panel is the drag surface except the scrollable formats list (`overflow-y-auto`), which must set `data-no-drag` and `onPointerDownCapture={(e) => e.stopPropagation()}` when it is scrolled past 0 so a scroll never becomes a dismiss. On release below threshold the panel springs back with `SPRING.sheet`.

### 3.3 Curve dot → card: a visible hand-off

Tapping a dot on the compact curve already scrolls the card into view with `block: "center"` and sets `active` (accent ring). Add a one-shot ring pulse on arrival so the eye lands on the right card after the scroll: ring width 2 → 5 → 2 px over 500 ms, `EASE.inOut`, triggered when `active` becomes true (`motion.article` `animate={{ boxShadow: ... }}` is expensive; use an absolutely positioned `motion.span` with `inset-0 rounded-[16px] ring-[var(--accent)]` animating `scale: [1, 1.015, 1]` and `opacity: [1, 0.6, 1]`). Reduced motion: static ring.

Dots on the compact curve are 5 px with a 20 px invisible hit circle; that is below a 44 px target. Do not shrink the chart; instead the `onPick` handler should accept the nearest dot within 22 px of the touch (`pointerdown` on the `svg`, map clientX to the nearest `x(i)`), so a thumb near the line always lands. No motion change, but it makes the hand-off above reliable.

### 3.4 Haptics-equivalent cues

`navigator.vibrate` works on Android Chrome only; iOS Safari ignores it, so every haptic has a visual twin.

| moment | Android | visual twin (all platforms) |
|---|---|---|
| lock toggle | `vibrate(8)` | icon scale dip (§2.4) |
| sheet snaps open / dismissed | `vibrate(6)` | spring overshoot (§2.7) |
| compose complete | `vibrate([10, 40, 10])` | score count-up landing; the live region announcement |
| chip tap (feedback) | none | `chip-on` + spinner |
| error nudge | `vibrate([20, 30, 20])` | horizontal nudge |

```ts
// apps/web/src/lib/haptics.ts
export const haptic = (pattern: number | number[]) => {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate?.(pattern);
  } catch { /* unsupported */ }
};
```

### 3.5 Thumb-driven gestures to keep (and not animate)

- Chip rows: scroll-snap (exists). No layout animation.
- Tanda cards: no swipe-to-swap. A horizontal swipe on a card conflicts with the chip rows above and with browser back gestures; the swap button is 44 px and in the thumb zone on the right.
- The result section's `scrollIntoView` on first compose: keep, but it must wait for the compose bar to settle: call it inside `requestAnimationFrame` after `setPlaylist` (exists) and use `block: "start"` with `scroll-mt-24` (exists) so the sticky bar does not cover the score.
- Bottom tab bar: untouched.

---

## 4. Performance rules

1. **Animate only `transform` and `opacity`** on anything that can be on screen with more than a few siblings (cards, rows, dots, bars). This spec converts every `width: %` bar to `scaleX` with `origin-left`. The exceptions are deliberate and bounded: `height: auto` on two disclosures and the cortina preview (one at a time, `overflow-hidden`), `backgroundColor` on one hovered row, and SVG `d`/`cx`/`cy` morphs on a single chart.
2. **`will-change` only while animating.** Motion adds `will-change: transform` during transitions and removes it after. Static `style={{ willChange }}` is set in this spec only on the export panel (lives < 1 s) and tanda cards (which are the layout-animated set). Never put `will-change` on `.glass`; promoting a backdrop-filtered layer doubles its memory.
3. **`backdrop-filter` is the most expensive pixel on a phone.** It exists on the header pill, the mobile tab bar, the sticky compose bar and the export sheet. Rules:
   - Never animate the size or position of a blurred element while content under it is also animating. The export sheet animates `transform` only (compositor), and the tanda grid is static while it opens.
   - On phones, the sheet's blur is applied *after* it settles: add `className="glass-settling"` during the enter transition (`onAnimationStart`/`onAnimationComplete`) with `.glass-settling { backdrop-filter: none; background: rgb(var(--surface)/.96) }`; the blur fades in via `transition: backdrop-filter 160ms` once settled. Visually indistinguishable at 24 px blur, and it keeps the spring at 60 fps on an A13/Pixel 6a.
   - Do not put a Lottie inside a `.glass` element on phones (§3.1 keeps the narrative text-only in the bar).
   - `prefers-reduced-transparency` and `.reduce-glass` already turn blur off; keep that path exercised in QA.
4. **Budget.** 16.6 ms per frame; our worst frame is the result reveal at ~t = 400 ms when the curve draw, 8 staggered cards and the score counter overlap. Caps: stagger at most 9 cards (index cap in §2.3), 22 dots (one chart mounted, not two), 1 count-up. Measured target: no frame > 12 ms in Chrome's Performance panel on a 4× CPU throttle for the reveal; no frame > 8 ms for any single interaction (lock, swap, chip).
5. **Lottie hygiene.** SVG renderer (dotLottie default on `.json`), ≤ 7 layers per file (ours: 7, 4, 5), no masks, no effects. Pause when off-screen: wrap `DotLottieReact` in a `useInView` (`motion/react`) gate and call `pause()`/`play()` on change. Cortina waves are paused by default and only ever play one at a time (hover) or the open ones (preview). `vinyl.json` plays only while `busy`.
6. **No blur filters on content** (`filter: blur()` on dimmed cards would force a re-rasterise of 22 surfaces); dimming is opacity + 1.5 % scale.
7. **Layout animations are bounded** to the tanda grid (`layout` on `motion.article`) and the per-track rows (`layout="position"`). Never put `layout` on anything inside a horizontally scrolling chip row.
8. **Reduced motion is a first-class path**, not a kill switch: `MotionConfig reducedMotion="user"` plus the explicit `useReducedMotion()` branches above. QA must run the whole flow with "Reduce motion" on and confirm every state is still *communicated* (locked, swapped, created, errored).
9. **Respect `aria-live`.** Nothing in this spec adds spoken noise: count-ups are `aria-hidden` next to a static `aria-label`, Lottie is `aria-hidden`, narrative text is `aria-hidden` because the existing live region already says "Composing the night…".

---

## 5. Lottie assets

All hand-written in the `make-lottie.ts` idiom (30 fps, shape layers only, `v: 5.9.0`), colours taken from `globals.css`. Each was rendered with lottie-web 5.12.2 in headless Chromium and checked frame by frame before being committed.

| file | size | canvas | length | loop | used in | notes |
|---|---|---|---|---|---|---|
| `public/anim/vinyl.json` | 9.3 KB | 400×400 | 4 s | yes | hero (`Vinyl.tsx`), plays while `busy` | existing; unchanged |
| `public/anim/compose-loading.json` | 6.7 KB | 480×120 | 3 s | yes | `ComposeNarrative` (desktop hero) §2.1 | six tanda pills (tango rose ×4, vals teal, milonga violet) pop in with a 5-frame stagger and 8 % overshoot; a white 70 % arc draws left-to-right across their tops from f28–f62 (trim path); everything fades f78–f88 so the loop restarts clean. Reduced-motion still: frame 60. |
| `public/anim/success-check.json` | 2.9 KB | 200×200 | 1.2 s | no | Spotify success button §2.7 | outer ring draws on (trim, f0–f18, 45 % green), green disc pops 0→112→100 % (f0–f20), white check draws (f10–f24, 9 px round caps), soft burst ring expands 100→160 % while fading (f12–f32). Final still: frame 35. Colour `#2f9e5b` (= `.switch-on`). |
| `public/anim/cortina-wave.json` | 4.8 KB | 120×60 | 1.2 s | yes | cortina row §2.9 | five 10 px stroked bars (round caps) whose top vertex breathes between 12 and 40 units out of phase, ease-in-out; built as path-vertex animation (not scaleY) so the caps stay round. Frame 0 is the paused state. Colour `#e0557a` (energy line). |

Regeneration: the generator for the three new files follows `apps/web/scripts/make-lottie.ts` exactly (same `layer`/`ellipse`/`ring` helpers plus `tm` trim paths and animated `sh` vertices). If the files need edits, add the three blocks to that script rather than hand-editing JSON; the pills' x positions are `48 + i·77`, the check path is `(-26,2) → (-8,20) → (28,-18)`, the bar baseline is `y = 50`.

Verification recipe (used here; re-run after any edit): load `lottie.min.js` 5.12.2 into a `page.setContent` document with Playwright, `loadAnimation({ renderer: "svg", autoplay: false, animationData })`, `goToAndStop(frame, true)` at three frames, screenshot, and look. Frames checked: compose-loading 12/45/70, success-check 6/16/30, cortina-wave 0/12/24.

---

## 6. Implementation order

1. `lib/motion.ts` tokens, `Disclosure.tsx`, bar `scaleX` conversions (no visual risk, unlocks everything else).
2. Export sheet presence + success Lottie (§2.7, §3.2).
3. Tanda card presence/stagger/lock/track swap (§2.3–2.5).
4. Compose narrative + button label (§2.1, §3.1).
5. Result reveal: score counter, curve draw-on, then the morph path for recompose (§2.2, §2.6).
6. Cortina row (§2.9), error nudges (§2.10), haptics (§3.4).

Each step is independently shippable and testable with "Reduce motion" on and off.
