# TDJ motion system

Scope: the motion vocabulary for the whole web app (apps/web) and the exact motion for the secondary surfaces: navigation, page transitions, Settings, Database, Listen, Tonight strip, Library, feedback and empty states. Stack: Next.js 16 app router, Tailwind 4 (`globals.css` `@utility` tokens), `motion` 14 (`motion/react`), `@lottiefiles/dotlottie-react`. Nothing in this document requires a new dependency.

Round-1 rules still hold: glass is the control layer only (header pill, mobile tab bar, export sheet, compose bar); content surfaces are opaque; the ambient background drifts on its own 28 s cycle and nothing else competes with it.

---

## 1. Principles

**Nocturnal.** A milonga runs from 22:00 to 04:00. The screen is a dim room; light moves slowly and only where the hand is. Fades are preferred to slides, slides are short (≤ 12 px), nothing arrives from off-screen except sheets and toasts.

**Precise.** Every animation answers one question: *what just changed and where did it go?* Movement starts at the point of interaction and ends on the thing that changed. If no state changed, nothing moves. Durations are short enough that a DJ working the booth never waits for the UI.

**Musical.** Timing follows a tempo, not a template. One beat at a tango tempo (~120 BPM) is 500 ms; the system's durations are subdivisions of that beat (125 / 250 / 375 / 500 ms). Looping ambience (listen bars, vinyl, crate) runs at musical periods (1.2 s, 3 s, 4 s) so coexisting loops never phase-lock into a strobe.

**Glass is the control layer, content stays calm.** The glass header pill, tab bar and sheets may lens, lift and highlight. Content cards (`.surface`) never scale, tilt, bounce or shimmer. They fade and settle (`.rise`) once on mount, and later only the row or cell that changed is allowed to move.

**Settle, never bounce.** Springs are critically damped or slightly over-damped. Overshoot is reserved for exactly two things: the segmented thumb and the tab pill, both of which are on glass, and both overshoot less than 2 px.

**One thing at a time.** A single interaction may trigger one hero animation plus supporting fades. Stagger is a reading aid for lists, capped at 12 items, never decoration.

### Anti-list (things TDJ does not do)

- No bouncing, wobbling or "pop" cards; no `scale(1.05)` hover on content.
- No parallax, no scroll-linked motion, no scroll-triggered reveals below the fold.
- No skeleton shimmer sweep; skeletons pulse opacity at 1.6 s, nothing travels across them.
- No gradient borders chasing around buttons, no glowing outlines that pulse forever.
- No page slides left/right that imply navigation depth that does not exist (all five tabs are siblings).
- No confetti, no full-screen success overlays, no celebratory Lottie larger than 96 px.
- No animated numbers over 600 ms; a count-up is a confirmation, not a show.
- No motion on `backdrop-filter` elements beyond `transform`/`opacity`; never animate blur radius.
- No stagger beyond 12 items; no stagger on re-render of an existing list.
- No typewriter text, no cursor blink, no "AI is thinking" dots: the DJ note appears as a single fade.
- No infinite spinners on anything that takes under 300 ms; show the result, not the wait.

---

## 2. Tokens

### 2.1 Durations

One tango beat ≈ 500 ms. Tokens are subdivisions.

| Token | ms | Use |
| --- | --- | --- |
| `--dur-xs` | 125 | Press feedback, hover colour, switch knob, icon weight swap, opacity of a chip state |
| `--dur-s` | 250 | Segmented thumb, tab pill, toast in, skeleton → content cross-fade, theme cross-fade |
| `--dur-m` | 375 | Page transition, sheet, row insert/remove, badge count-up |
| `--dur-l` | 500 | Empty state in, Spotify callback hand-off, reset confirm |
| `--dur-loop` | 1200 | Listen bars period |
| `--dur-breathe` | 3000 | Crate idle period; vinyl pulse ring |

Exit durations are always one step shorter than entry (page out 250, in 375; toast out 125, in 250).

### 2.2 Easings

| Token | Value | Character |
| --- | --- | --- |
| `--ease-settle` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Default. Fast start, long settle. Already used by `.rise` and `.sheet`. |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entering elements, toasts, pills. |
| `--ease-in` | `cubic-bezier(0.7, 0, 0.84, 0)` | Leaving elements only. |
| `--ease-breathe` | `cubic-bezier(0.45, 0, 0.55, 1)` | Loops (sine in-out). Never for interactions. |
| `--ease-linear` | `linear` | Rotation, progress bars, bar fills. |

Springs (motion/react), used only on glass controls:

| Name | Config | Use |
| --- | --- | --- |
| `spring.thumb` | `{ type: "spring", stiffness: 520, damping: 42, mass: 0.8 }` | Segmented thumb, tab pill `layoutId`. Settles in ~260 ms, overshoot < 2 px. |
| `spring.knob` | `{ type: "spring", stiffness: 700, damping: 40 }` | Switch knob. |
| `spring.sheet` | `{ type: "spring", stiffness: 380, damping: 38, mass: 1 }` | Export sheet, undo toast rise. |

### 2.3 Stagger

- `--stagger: 28ms` per item, applied only on first mount of a list, capped at 12 items (item 13+ gets `delay: 12 * 28`, i.e. they arrive together with item 12).
- Stagger direction follows reading order; never reverse.
- Stagger is disabled entirely under reduced motion and on lists that re-render from a filter (those cross-fade as a block in `--dur-s`).

### 2.4 Reduced motion policy

`prefers-reduced-motion: reduce` **and** the Settings "Reduce transparency" switch are separate. Reduced transparency changes materials only. Reduced motion:

1. Transforms are removed; everything that moved now fades in `--dur-xs`.
2. `layoutId` shared-layout animations become instant (handled by `MotionConfig reducedMotion="user"`).
3. Loops (listen bars, crate, vinyl, ambient drift) render their first frame and stop. Lottie `autoplay={false}`, CSS `animation: none`.
4. Count-ups render the final number.
5. Stagger is 0.
6. Spinners still spin (they carry meaning) but at 1.6 s per turn, as `globals.css` already does.

### 2.5 Dark / light transition policy

- Theme changes (Settings → Appearance, or OS auto) cross-fade colour tokens in `--dur-s` using a `.theming` class on `<html>` that enables `transition` on `background-color`, `color`, `border-color`, `fill`, `stroke` for 250 ms, then removes itself. No transition is set permanently (it would smear every hover).
- The ambient background does not transition; its gradients swap instantly behind the cross-fade, which the eye cannot separate from the content fade.
- `backdrop-filter` is never transitioned.
- First paint never animates: the pre-hydration script in `layout.tsx` sets the theme before CSS loads, and `.theming` is only added by user action.

### 2.6 CSS custom properties (add to `globals.css` `:root`)

```css
:root {
  --dur-xs: 125ms;
  --dur-s: 250ms;
  --dur-m: 375ms;
  --dur-l: 500ms;
  --dur-loop: 1200ms;
  --dur-breathe: 3000ms;
  --ease-settle: cubic-bezier(0.2, 0.8, 0.2, 1);
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-breathe: cubic-bezier(0.45, 0, 0.55, 1);
  --stagger: 28ms;
}
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-xs: 0ms;
    --dur-s: 0ms;
    --dur-m: 0ms;
    --dur-l: 0ms;
    --stagger: 0ms;
  }
}

/* Theme cross-fade: added to <html> for one --dur-s by ThemeSync, then removed */
html.theming,
html.theming *,
html.theming *::before,
html.theming *::after {
  transition:
    background-color 250ms var(--ease-settle),
    color 250ms var(--ease-settle),
    border-color 250ms var(--ease-settle),
    fill 250ms var(--ease-settle),
    stroke 250ms var(--ease-settle) !important;
}
html.theming .glass {
  transition: background-color 250ms var(--ease-settle) !important;
}

/* Skeleton: opacity breathe only, no sweep */
@keyframes skeleton-breathe {
  from { opacity: 0.55; }
  to { opacity: 1; }
}
.skeleton {
  border-radius: 10px;
  background: rgb(var(--text) / 0.08);
  animation: skeleton-breathe 1.6s var(--ease-breathe) infinite alternate;
}
@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; opacity: 0.8; }
}

/* Save pulse on a database cell: 1 px ring that dissolves. transform/opacity only via box-shadow on a pseudo. */
@keyframes cell-saved {
  from { box-shadow: 0 0 0 0 rgb(47 158 91 / 0.55); }
  to { box-shadow: 0 0 0 6px rgb(47 158 91 / 0); }
}
.cell-saved {
  animation: cell-saved var(--dur-l) var(--ease-out) 1;
}

/* Hover/focus on glass controls: lift is 1 px, never scale. */
@media (hover: hover) {
  .glass .chip:not(.chip-on):hover {
    background: rgb(var(--surface) / 0.85);
    transition: background var(--dur-xs) var(--ease-settle);
  }
  .surface .chip:not(.chip-on):hover,
  .btn-ghost:hover,
  .icon-btn:hover {
    background: rgb(var(--text) / 0.09);
    transition: background var(--dur-xs) var(--ease-settle);
  }
}
.glass :focus-visible {
  outline-offset: -2px; /* keep the ring inside the pill so it is not clipped by the border radius */
}
```

### 2.7 `lib/motion.ts` (shape to create; owned by the app engineer)

```ts
// apps/web/src/lib/motion.ts
import type { Transition, Variants } from "motion/react";

/** One tango beat ≈ 500 ms. Durations are subdivisions. Seconds, because motion/react takes seconds. */
export const dur = { xs: 0.125, s: 0.25, m: 0.375, l: 0.5, loop: 1.2, breathe: 3 } as const;

export const ease = {
  settle: [0.2, 0.8, 0.2, 1],
  out: [0.16, 1, 0.3, 1],
  in: [0.7, 0, 0.84, 0],
  breathe: [0.45, 0, 0.55, 1],
} as const;

export const spring = {
  thumb: { type: "spring", stiffness: 520, damping: 42, mass: 0.8 },
  knob: { type: "spring", stiffness: 700, damping: 40 },
  sheet: { type: "spring", stiffness: 380, damping: 38, mass: 1 },
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

/** Reduced-motion variants: every entry/exit becomes a 125 ms opacity change. */
export const reduced = {
  rise: { hidden: { opacity: 0 }, show: { opacity: 1, transition: t.press }, exit: { opacity: 0, transition: t.press } },
} as const;
```

Root provider (in `layout.tsx` body, wrapping `<main>`; `MotionConfig` is a client component so put it in a small `components/Motion.tsx`):

```tsx
// apps/web/src/components/Motion.tsx
"use client";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { t } from "@/lib/motion";

/** App-wide defaults: settle tween, reduced motion follows the OS. */
export function Motion({ children }: { children: ReactNode }) {
  return (
    <MotionConfig transition={t.fade} reducedMotion="user">
      {children}
    </MotionConfig>
  );
}
```

`reducedMotion="user"` makes `motion/react` strip transforms (keeps opacity) and skip layout animations when the OS asks. Components still call `useReducedMotion()` for Lottie and for anything that is not a `motion.*` element.

---

## 3. Specs

Each spec: trigger → what moves → tokens → reduced-motion fallback → code. Code targets the existing components and class names in `apps/web/src`.

### 3.1 Mobile tab bar (glass)

Reference: iOS 26 tab bar; the active pill is a single shared element that slides between tabs, the icon weight thickens as it lands.

- Trigger: route change (`usePathname()`).
- Moves: one pill (`layoutId="tab-pill"`) behind the active item, spring `thumb`. Icon `strokeWidth` 1.8 → 2.4 and label weight 500 → 600 cross-fade over `--dur-xs` (CSS transition on `stroke-width` is not animatable in SVG via CSS reliably; render both icons stacked and cross-fade opacity). The glow Lottie `tab-glow.json` plays once (600 ms) centred on the icon when the pill lands.
- Pill size: the item's box (min 60 × 48). Pill fill `rgb(var(--text)/.08)` as today.
- Reduced: pill jumps (`MotionConfig` handles it), glow does not play, icon weight swaps instantly.

```tsx
// Nav.tsx, mobile section
"use client";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { spring, t } from "@/lib/motion";

function MobileTab({ it, on }: { it: (typeof items)[number]; on: boolean }) {
  const reduced = useReducedMotion();
  const [landed, setLanded] = useState(false);
  return (
    <Link
      href={it.href}
      aria-current={on ? "page" : undefined}
      className={`relative flex min-h-12 min-w-[60px] flex-col items-center justify-center gap-0.5 rounded-full px-3 text-xs ${on ? "font-semibold" : "text-muted"}`}
      style={{ transition: `font-weight var(--dur-xs) var(--ease-settle), color var(--dur-xs) var(--ease-settle)` }}
    >
      {on && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 rounded-full bg-[rgb(var(--text)/.08)]"
          transition={spring.thumb}
          onLayoutAnimationComplete={() => setLanded(true)}
          aria-hidden
        />
      )}
      {on && landed && !reduced && (
        <span className="pointer-events-none absolute left-1/2 top-1 h-10 w-10 -translate-x-1/2" aria-hidden>
          <DotLottieReact src="/anim/tab-glow.json" autoplay loop={false} onComplete={() => setLanded(false)} />
        </span>
      )}
      <span className="relative grid h-5 w-5 place-items-center">
        {/* two stacked weights, cross-faded: stroke-width is not animatable via CSS on SVG in all engines */}
        <it.icon size={20} strokeWidth={1.8} className="col-start-1 row-start-1" style={{ opacity: on ? 0 : 1, transition: "opacity var(--dur-xs)" }} />
        <it.icon size={20} strokeWidth={2.4} className="col-start-1 row-start-1" style={{ opacity: on ? 1 : 0, transition: "opacity var(--dur-xs)" }} />
      </span>
      <span className="relative">{it.label}</span>
    </Link>
  );
}

// in Nav():
<LayoutGroup id="mobile-nav">
  <nav className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-center justify-around p-1 sm:hidden" aria-label="Primary mobile">
    {items.map((it) => <MobileTab key={it.href} it={it} on={path === it.href} />)}
  </nav>
</LayoutGroup>
```

The `tab-glow` wrapper is 40 px; the Lottie is 120 px canvas scaled, so the halo extends to ~1.4× the icon and never leaves the pill.

### 3.2 Desktop header pill (glass)

- Trigger: route change or hover.
- Moves: the dark `chip-on` fill is a shared `layoutId="nav-pill"` element sliding under the active chip (spring `thumb`). Text colour inverts over `--dur-xs` after the pill arrives (delay 60 ms so the label does not flash white on transparent).
- Hover on an inactive chip: background to `rgb(var(--surface)/.85)` in `--dur-xs`. No lift, no scale.
- Reduced: pill jumps, colours swap instantly.

```tsx
<nav className="flex items-center gap-1" aria-label="Primary">
  <LayoutGroup id="desktop-nav">
    {items.map((it) => {
      const on = path === it.href;
      return (
        <Link key={it.href} href={it.href} aria-current={on ? "page" : undefined}
          className="chip relative border-transparent bg-transparent"
          style={{ color: on ? "rgb(var(--surface))" : undefined, transition: `color var(--dur-xs) var(--ease-settle) 60ms` }}>
          {on && <motion.span layoutId="nav-pill" transition={spring.thumb} className="absolute inset-0 -z-10 rounded-full bg-[rgb(var(--text)/.9)]" aria-hidden />}
          <it.icon size={15} /> {it.label}
        </Link>
      );
    })}
  </LayoutGroup>
</nav>
```

Keep the `.chip` border on the inactive state via a wrapper if the hairline is wanted; the pill itself has no border (as `chip-on` today).

### 3.3 Page transitions

Pages are siblings; the transition is a fade-and-settle, never a directional slide. Keep it in a client `PageTransition` wrapper inside `<main>` (the root layout stays a server component).

- Out: opacity 1 → 0, 250 ms, `ease.in`. In: opacity 0 → 1, y 8 → 0, 375 ms, `ease.out`. Mode `"wait"` so the two pages never overlap (prevents double glass blur under the header).
- Scroll resets to top on `onExitComplete`.
- The header pill and tab bar are outside the wrapper and do not transition.
- Reduced: opacity only, 125 ms.
- Remove the `.rise` class from page-level cards once this is in; keep `.rise` for in-page elements that mount later (result card, search results).

```tsx
// apps/web/src/components/PageTransition.tsx
"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { reduced, rise } from "@/lib/motion";

export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname();
  const r = useReducedMotion();
  return (
    <AnimatePresence mode="wait" initial={false} onExitComplete={() => window.scrollTo({ top: 0 })}>
      <motion.div key={path} variants={r ? reduced.rise : rise} initial="hidden" animate="show" exit="exit" custom={0}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
// layout.tsx: <main …><Motion><PageTransition>{children}</PageTransition></Motion></main>
```

Note for Next 16: `AnimatePresence` keyed on pathname works with the app router as long as the wrapper lives inside `<main>` and the pages themselves have no `key`. Loading states (`loading.tsx`) are not used; pages render synchronously and fetch client-side, so there is nothing to coordinate with Suspense.

### 3.4 Segmented control, Switch, Stepper

**Segmented (`.segmented` / `.seg-on`)**

- Thumb is a shared `layoutId` per control (`layoutId={`seg-${id}`}`) with spring `thumb`; the label colour goes muted → text over `--dur-xs`.
- Press: no scale (the thumb moving is the feedback). Keyboard arrows move the thumb the same way.
- On phones where `.segmented` wraps to two rows, the thumb still animates between rows (layout animation handles it); cap the spring at 260 ms visually by the config above.
- The chips variant (`chips`) does not use a thumb; `chip-on` toggles with a `--dur-xs` background/colour transition.

```tsx
// ui.tsx Segmented: replace the className toggle with a thumb
const id = useId();
<button … className={`seg relative ${on ? "text-[rgb(var(--text))]" : ""}`} style={{ transition: "color var(--dur-xs) var(--ease-settle)" }}>
  {on && !chips && (
    <motion.span layoutId={`seg-${id}`} transition={spring.thumb}
      className="absolute inset-0 -z-10 rounded-full bg-[rgb(var(--surface))] shadow-[0_1px_3px_rgb(0_0_0/.18)]" aria-hidden />
  )}
  {l}
</button>
```

Wrap the radiogroup in `<LayoutGroup id={id}>`. Remove `.seg-on`'s background from CSS once the thumb is in (keep its colour rule).

**Switch (`.switch`)**

- Knob: `transform: translateX(20px)` with spring `knob` (CSS fallback: `transition: transform var(--dur-s) var(--ease-out)`); track colour over `--dur-s`.
- Knob squash while pressed: `width 27 → 31 px` on `:active` for ≤ 125 ms, anchored to the side it is on (iOS behaviour). Pure CSS:

```css
.switch-knob { transition: transform var(--dur-s) var(--ease-out), width var(--dur-xs) var(--ease-settle); }
.switch:active .switch-knob { width: 31px; }
.switch-on:active .switch-knob { transform: translateX(16px); }
.switch-track { transition: background var(--dur-s) var(--ease-settle); }
@media (prefers-reduced-motion: reduce) { .switch-knob, .switch-track { transition-duration: 0ms; } }
```

**Stepper**

- Press: `.icon-btn:active { transform: scale(0.96) }` already exists; keep it.
- Value change: the `<output>` cross-fades 125 ms and nudges 3 px in the direction of change (up for +, down for −). Use `AnimatePresence mode="popLayout"` keyed on the value, `initial={{ opacity: 0, y: dir * 3 }}`. Reduced: opacity only.
- Hitting min/max: the disabled button fades to 0.45 over `--dur-xs`; no shake.

### 3.5 Theme switch cross-fade

- Trigger: Segmented Theme change, Reduce-transparency switch, or OS scheme change while on `auto`.
- Moves: colour tokens cross-fade 250 ms (`html.theming`, §2.6). The segmented thumb moves at the same time; the two are the only motion.
- Reduced: `.theming` is not added (instant swap).

```tsx
// ThemeSync.tsx
useEffect(() => {
  const el = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduced && el.dataset.hydrated) {        // skip first paint
    el.classList.add("theming");
    const id = setTimeout(() => el.classList.remove("theming"), 250);
    return () => clearTimeout(id);
  }
  el.dataset.hydrated = "1";
}, [theme, reduceGlass]);
```

Apply the `data-theme`/class changes in the same effect after `.theming` is added so the transition catches them.

### 3.6 Settings: "Test connection" states

States: `idle → busy → ok | fail`. The button and the status line share one row; the status text never reflows the button.

| State | Button | Status (role=status) | Timing |
| --- | --- | --- | --- |
| idle | "Test connection" | empty (min-h-5 keeps the line) | |
| busy | `LoaderCircle` spins (1 turn / 0.9 s; 1.6 s reduced), label unchanged, button `disabled` | "Checking…" fades in after 300 ms (avoid flashing for fast answers) | |
| ok | icon swaps to `save-pulse.json` Lottie (20 px, plays once, 800 ms) then rests on its last frame | text fades in `--dur-s`, colour `--ok` | text appears at 300 ms into the Lottie (as the check completes) |
| fail | icon swaps to `error-mark.json` (20 px, once, 800 ms, includes a 2 px lateral no-shake) | text fades in, colour accent | same |

- The success/fail Lottie replaces the spinner in place (same 15 px slot, `AnimatePresence mode="wait"`, fade 125 ms), so nothing shifts.
- After `ok`, the badge "Key saved" does not change (it reflects the key, not the test). After `fail`, nothing shakes except the 2 px inside the Lottie.
- Reduced: Lottie renders its final frame (`autoplay={false}`, `segment` last frame), text fades 125 ms.

```tsx
function TestIcon({ state }: { state: "idle" | "busy" | "ok" | "fail" }) {
  const reduced = useReducedMotion();
  return (
    <span className="relative inline-grid h-5 w-5 place-items-center">
      <AnimatePresence mode="wait" initial={false}>
        {state === "busy" && (
          <motion.span key="busy" {...fadeProps}><LoaderCircle size={15} className="animate-spin" /></motion.span>
        )}
        {state === "ok" && (
          <motion.span key="ok" {...fadeProps} className="h-5 w-5">
            <DotLottieReact src="/anim/save-pulse.json" autoplay={!reduced} loop={false} />
          </motion.span>
        )}
        {state === "fail" && (
          <motion.span key="fail" {...fadeProps} className="h-5 w-5">
            <DotLottieReact src="/anim/error-mark.json" autoplay={!reduced} loop={false} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
const fadeProps = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: t.press };
```

Status text: `<motion.span key={test.text} variants={fade} initial="hidden" animate="show">` with `delay: 0.3` when state is `ok`/`fail`.

Copy button "Copied": icon swap `Copy → Check` with the same 125 ms cross-fade; label width fixed by `min-w-[5.5rem]` so the button does not jump.

### 3.7 Spotify connect flow

1. **Connect Spotify** pressed: button `:active` scale 0.97 (existing), then the page navigates to Spotify. No spinner before leaving (the browser's own navigation feedback is enough).
2. **`/callback`**: the card mounts with `rise` (375 ms). The spinner runs; the text "Connecting to Spotify…" is visible from the start (this call can take > 1 s).
3. **Success**: do not show a check on `/callback`. `router.replace("/")` runs the page transition (fade 250 out / 375 in). On Settings the badge `Not connected → Connected · n min left` cross-fades: dot colour over `--dur-s`, text via `AnimatePresence` fade. If the user lands on Compose, the Listen toggles become available; nothing animates to announce it.
4. **Error**: spinner cross-fades to `CircleAlert` (125 ms); the copy block fades in with `rise`; the "Back to Settings" button is the only control.
5. **Disconnect**: badge cross-fades back; the "Disconnect" button exits with `fade` (`AnimatePresence`) so the "Reconnect" button slides left by layout animation (`layout` prop, spring `thumb`).

Reduced: all of the above become 125 ms opacity changes; no layout slide.

### 3.8 Database tab

Header: Import / Export / Reset row and the status line. Tabs: `Segmented` (§3.4) with content cross-fade.

**Tab content switch**: `AnimatePresence mode="wait"` keyed on `tab`, `fade` variants (250 ms out / in). Content height changes are allowed to snap; do not animate height (tables are large).

**Row edit → optimistic save pulse**

- Edits write to the store immediately (`updateOverrides`). On commit (input `blur` or `change` for selects/switches) the cell runs `.cell-saved` (6 px ring in `--ok`, 500 ms, once). The `Edited` label cross-fades from "index" to "edited · revert" (`AnimatePresence`, 125 ms).
- Typing does not pulse; only the commit does. Debounce: a cell pulses at most once per 500 ms.
- Phone card layout: the ring is on the input only, never the card.
- Reduced: no ring; the label change is the confirmation.

```tsx
// db/shared.tsx: a hook the inputs call on commit
export function useSavedPulse() {
  const [on, setOn] = useState(false);
  const pulse = () => { setOn(false); requestAnimationFrame(() => setOn(true)); };
  return { className: on ? "cell-saved" : "", onAnimationEnd: () => setOn(false), pulse };
}
// in Num/Text: const p = useSavedPulse(); <input … className={`field … ${p.className}`} onBlur={p.pulse} onAnimationEnd={p.onAnimationEnd} />
```

**Undo toast** (after Revert, Delete cortina, Hide song, Reset)

- Appears bottom-centre above the tab bar on phones (`bottom: calc(env(safe-area-inset-bottom) + 76px)`), bottom-right on desktop. Glass pill, `toastIn` variants (250 ms in, 125 ms out). Single toast at a time; a new one replaces the old with a cross-fade (`AnimatePresence mode="wait"`).
- Content: "Reverted Di Sarli · Rufino · 1940" + **Undo** button. Auto-dismiss after 6 s; the countdown is not shown (no progress bar). Hover/focus pauses dismissal.
- Undo pressed: toast exits 125 ms; the row's cell(s) pulse `.cell-saved` once.
- Reduced: fade 125 ms in and out.

```tsx
<AnimatePresence mode="wait">
  {toast && (
    <motion.div key={toast.id} role="status" aria-live="polite" variants={toastIn} initial="hidden" animate="show" exit="exit"
      className="glass glass-pill fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] z-50 mx-auto flex max-w-md items-center gap-3 px-4 py-2.5 text-sm sm:inset-x-auto sm:right-6 sm:bottom-6">
      <span className="min-w-0 flex-1 truncate">{toast.text}</span>
      <button type="button" className="btn btn-ghost min-h-9 px-3 text-sm" onClick={toast.undo}>Undo</button>
    </motion.div>
  )}
</AnimatePresence>
```

**Import / Export progress**

- Export is synchronous: the button shows `Check` for 1.2 s ("Exported") with a 125 ms icon cross-fade, then returns. No toast.
- Import: file parse is fast but the store write may be async (server storage). Button label → spinner (300 ms grace before showing), then the status line fades in "Imported 14 changes from tdj-database.json." with `fade`; the `db-changes` count runs a count-up (§3.10 badge rule, 375 ms). On failure, the status line text colour is accent and the `error-mark.json` Lottie plays at 16 px before the text.
- Server storage mode only: a 2 px progress hairline at the top of the header card (`scaleX` 0 → 1, `--ease-linear`, driven by actual chunks, or indeterminate 1.2 s loop sliding 30% width). Indeterminate bars translate; they never shimmer.

**Reset confirm**

- Replace `window.confirm` with an inline confirm that expands under the Reset button: the button row gets a second line "Remove all 14 changes? **Reset** · Cancel", entering with `rise` (375 ms). The Reset button in the row becomes `btn-primary`.
- Confirm pressed: the line exits (`fade`), the count runs down to 0 (375 ms), the status line fades in "Database reset to the repo index.", and the undo toast offers Undo (keep the previous overrides in memory for 6 s).
- Reduced: inline confirm appears without rise.

**Row add / remove** (Cortinas, added songs): `motion.tr`/`motion.li` with `layout` and `rise`/`exit`; removal collapses height by layout animation on the siblings (spring `thumb`), the row itself fades 250 ms. Cap: no stagger on add; one row at a time.

### 3.9 Listen panel

**Toggle**: the "Listen" chip toggles `aria-expanded`; the panel mounts with `AnimatePresence` + `rise` (375 ms) and exits with `fade` (250 ms). Do not animate height; the panel's first child is a fixed-height skeleton, so the layout shift happens once on open.

**Embed skeleton → loaded**

- Skeleton: one `.skeleton` block per embed, exactly the iframe's height (80 track / 152 playlist) with `border-radius: 12px`. Breathe only (§2.6).
- "Finding these recordings on Spotify…" line with the spinner sits above the skeletons while resolving.
- Each iframe mounts invisible (`opacity: 0`) and fades in 250 ms on `onLoad`; the skeleton behind it fades out at the same time (`AnimatePresence mode="sync"`). Iframes cannot be animated with transform while loading without repaint cost; opacity only.
- Not-found lines ("…not on Spotify under this title.") fade in with `fade` at the same moment as the iframes resolve; no stagger.

```tsx
function Embed({ kind, id, title, height }: Props) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative" style={{ height }}>
      <AnimatePresence>{!loaded && <motion.div key="sk" className="skeleton absolute inset-0" exit={{ opacity: 0, transition: t.fade }} />}</AnimatePresence>
      <motion.iframe title={title} src={…} width="100%" height={height} loading="lazy" onLoad={() => setLoaded(true)}
        initial={{ opacity: 0 }} animate={{ opacity: loaded ? 1 : 0 }} transition={t.fade}
        style={{ borderRadius: 12, border: 0, display: "block", colorScheme: "normal" }} />
    </div>
  );
}
```

**Playing bars Lottie** (`listen-bars.json`)

- Shown at 16 px inside the "Listen" chip while the panel is open and an embed exists, to say "this tanda has audio". Spotify's iframe does not expose play state, so the bars breathe at 1.2 s as an ambient marker; they are not a play indicator and must not be labelled as one. `aria-hidden`.
- At most one bars loop per viewport: when several tandas are open, only the one nearest the viewport centre animates (IntersectionObserver, threshold 0.6); the others show frame 0. On phones this caps GPU work with the ambient blur.
- Reduced: frame 0, no loop.

**Cortina preview**: button spinner → embed, same skeleton/fade rule. "Not found on Spotify." fades in with `fade`.

### 3.10 Tonight context strip

- Chip select change: the `.ctx-chip` background inverts (`chip-on`) over `--dur-xs`; the evidence dot fades in 125 ms. No width animation (the label changes length; let it snap, the chip row scrolls).
- "Clear" chip mounts with `fade` when `chosen > 0`, exits with `fade`.
- **Applied-shift summary**: the summary line cross-fades on change (`AnimatePresence mode="wait"` keyed by the summary string, 250/125 ms).
- **Applied-shift badge** (new, next to the "Tonight" label on the right of the hint): a small pill "3 shifts" that counts up/down with a 375 ms tween. Numbers use `tabular-nums` so width is stable. Implementation with `animate()` from `motion`:

```tsx
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (reduced) { el.textContent = String(value); prev.current = value; return; }
    const ctrl = animate(prev.current, value, { duration: dur.m, ease: ease.out, onUpdate: (v) => { el.textContent = String(Math.round(v)); } });
    prev.current = value;
    return () => ctrl.stop();
  }, [value, reduced]);
  return <span ref={ref} className="tabular-nums" aria-live="polite">{value}</span>;
}
```

- The badge appears/disappears with `fade`. Its colour: `chip-on` style when count > 0.
- Reduced: numbers set directly.

The same `CountUp` is used for the Database "n changes" count and the Export sheet "103 tracks will be exported" count.

### 3.11 Library search results list

- Debounce 200 ms (existing). While `searching`, the previous results stay visible at `opacity: 0.6` (125 ms) rather than disappearing; a spinner replaces the search icon in the field.
- On a new result set: the list container cross-fades as a block (`AnimatePresence mode="wait"` keyed by `q`), and rows 1–12 stagger with `rise` at 28 ms; rows 13+ get the same delay as row 12. The "40 results" header fades in with row 1.
- When the query only narrows (new rows ⊂ old rows), skip the stagger: rows use `layout` and the removed ones fade out 250 ms. Decide by comparing id sets.
- Orchestra chip pressed: the field value changes; the list behaves as a new search.
- Empty: "Nothing matches…" is text only, no Lottie (the user is mid-typing). The Lottie empty state is for the database tabs and a never-searched Library (§3.14).
- Reduced: block cross-fade only; no stagger.

```tsx
<ul className="divide-y divide-[rgb(var(--text)/.08)]">
  {rows.map((s, i) => (
    <motion.li key={s.id} layout="position" variants={rise} custom={i} initial={fresh ? "hidden" : false} animate="show" exit="exit"
      className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm">…</motion.li>
  ))}
</ul>
```

Rows are `transform`/`opacity` only; `layout="position"` avoids size animation on long titles.

### 3.12 Toasts and alerts

- One toast region, bottom (above the tab bar on phones). `toastIn` variants. Glass pill. Auto-dismiss 6 s (undo), 3 s (informational). Never stack more than one; the newest replaces.
- Inline alerts (status lines with `role="status"`) use `fade`. Errors in accent colour, never red flashes, never shaking the field. A failed field gets a `--dur-xs` border-colour change to accent plus the message.
- Alert icons: `error-mark.json` at 16 px, played once, or `CircleAlert` static under reduced motion.

### 3.13 Skeletons

- `.skeleton` blocks only where the final size is known (embeds, meta line, orchestra chip row of 3 rows × 8 chips). Never a whole-page skeleton.
- Show after a 300 ms grace (do not flash for fast responses). Replace with content via cross-fade 250 ms; the content does not `rise` after a skeleton (it is already in place).
- Reduced: static at 0.8 opacity.

### 3.14 Empty states (Lottie)

`empty-crate.json` (200 × 160, 3 s loop; a record crate with two sleeves and a slowly turning vinyl that lifts 6 px and settles; muted palette that reads on both themes).

Used in: Database → Cortinas (no cortinas), Songs (no search yet), added songs (none), Library before the first search (replacing the plain line), Listen when no reference playlist exists.

- Layout: Lottie 120 px wide on phones, 160 px on desktop, centred; one line of copy; one action chip. Enters with `rise` 375 ms after a 300 ms grace (so it does not flash while data loads).
- Loop plays while visible (`IntersectionObserver`), stops off-screen.
- Reduced: first frame.

```tsx
export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const reduced = useReducedMotion();
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.4 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <motion.div ref={ref} variants={rise} initial="hidden" animate="show" className="flex flex-col items-center gap-3 py-8 text-center">
      <div className="w-[120px] sm:w-[160px]" aria-hidden>
        <DotLottieReact src="/anim/empty-crate.json" loop autoplay={inView && !reduced} />
      </div>
      <p className="text-muted text-sm">{children}</p>
      {action}
    </motion.div>
  );
}
```

### 3.15 Focus and hover on glass

- Focus ring: `outline: 2px solid var(--accent)` (existing), offset −2 px inside glass pills so the ring is not clipped by `overflow` or the radius.
- Hover on glass chips: background to `rgb(var(--surface)/.85)` in 125 ms. Hover on content chips: `rgb(var(--text)/.09)`. No lift, no shadow change, no scale.
- Press: `.btn:active` scale 0.97, `.icon-btn:active` 0.96 (existing). Chips get `scale(0.98)` on `:active`, 125 ms.
- Keyboard focus moving along the tab bar does not move the pill (the pill tracks the route, not focus).
- Touch: `-webkit-tap-highlight-color: transparent` everywhere (existing); the press scale is the feedback.

---

## 4. Accessibility and performance checklist

**Reduced motion**
- [ ] `MotionConfig reducedMotion="user"` at the root; every Lottie checks `useReducedMotion()` and sets `autoplay={false}`.
- [ ] CSS tokens zero out under `prefers-reduced-motion: reduce` (§2.6); loops set `animation: none`.
- [ ] Nothing conveys state by motion alone: every pulse/Lottie is paired with text in a `role="status"` region or a label change.
- [ ] Count-ups and spinners keep `aria-live="polite"`; Lottie containers are `aria-hidden`.
- [ ] Focus is never moved by an animation; `AnimatePresence mode="wait"` pages restore scroll on exit complete, not during.

**Transform / opacity only**
- [ ] Every `motion.*` element animates `opacity`, `x`, `y`, `scale`, `scaleX` only. `layout`/`layoutId` are allowed on pills, thumbs, rows (they compile to transforms).
- [ ] `box-shadow` animation only in `.cell-saved` (a 500 ms one-shot on a single cell, acceptable).
- [ ] No `height`, `width`, `top/left`, `blur()`, `backdrop-filter`, `border-radius` animations.
- [ ] Theme cross-fade transitions colours only, for 250 ms, then removes the `transition` rule.

**backdrop-filter budget**
- [ ] Max 2 glass surfaces blurring at once on phones (tab bar + one sheet or one toast). The header pill is hidden on phones; the compose bar is glass only while the result exists.
- [ ] Glass elements animate only via `transform`/`opacity` and are promoted with `will-change: transform` only while animating (`motion` does this).
- [ ] Toasts over the tab bar: the toast is glass, the tab bar is glass, nothing else blurs underneath; the ambient blobs already stop drifting on `hover: none`.
- [ ] `reduce-glass` and `prefers-reduced-transparency` turn blur off; motion stays.

**Layout thrash**
- [ ] No reading `getBoundingClientRect` in render; `layout` animations measure once per commit.
- [ ] Lists use `layout="position"` not `layout`; tables never use `layout` on `<td>`.
- [ ] Skeletons match final heights; iframes have explicit `height`.
- [ ] Toast and sheet are `position: fixed` and do not push content.

**Concurrency caps (phones)**
- [ ] ≤ 1 looping Lottie animating per viewport (bars or crate, chosen by IntersectionObserver); the vinyl on the hero stops when the compose result exists.
- [ ] ≤ 12 staggered items per mount; no stagger on re-render.
- [ ] ≤ 3 simultaneous `motion` tweens from one interaction (hero + two supporting fades).
- [ ] Lottie renderer: dotLottie's default (canvas/WASM); keep all assets ≤ 10 KB and ≤ 4 layers so decode is sub-millisecond.
- [ ] Measure with Chrome's Performance panel on a mid-range Android profile: no frame > 16 ms during a tab switch with the tab bar glass on.

---

## 5. Lottie assets created (apps/web/public/anim)

All hand-written in the `make-lottie.ts` idiom (shape layers, no images, no expressions), verified by rendering with lottie-web 5.12 in headless Chromium on dark `#17161f` and cream `#f6f1e8`. Generated by a scratch script; regenerate from the JSON if edits are needed (the structure is small enough to edit by hand).

| File | Canvas | Length | Loop | Palette | Use |
| --- | --- | --- | --- | --- | --- |
| `tab-glow.json` | 120 × 120 | 18 f / 600 ms | once | rose `#c9426a` halo 28 % + 2 px ring | Behind the active mobile tab icon when the pill lands (§3.1). Render at 40 px. |
| `save-pulse.json` | 96 × 96 | 24 f / 800 ms | once | ok green `#2f9e5b`, white check | Test connection success (§3.6), import success, optional in-cell confirmation at 16 px. Rests on final frame (full check). |
| `error-mark.json` | 96 × 96 | 24 f / 800 ms | once | rose, white cross, 2 px lateral shake at f12–20 | Test connection failure, import failure, inline alerts (§3.6, §3.12). Rests on final frame. |
| `listen-bars.json` | 80 × 80 | 36 f / 1.2 s | loop | rose, 4 bars, phase-offset, sine in-out | Listen chip marker while a panel is open (§3.9). Render at 16 px; frame 0 is a valid static icon. |
| `empty-crate.json` | 200 × 160 | 90 f / 3 s | loop | muted `#8f8aa3` crate, ink vinyl, rose label | Empty states (§3.14). Render at 120–160 px. Frame 0 is the static fallback. |

Usage pattern for all of them:

```tsx
<DotLottieReact src="/anim/<name>.json" autoplay={play && !reduced} loop={isLoop} style={{ width: "100%", height: "100%" }} />
```

Wrap in a sized `aria-hidden` box; never let a Lottie set its own size. One-shot assets end on their final frame, so they can stay mounted as the resting icon until the state changes.

Also in `public/anim` from other work in flight: `compose-loading.json`, `cortina-wave.json`, `success-check.json`, and a `crate-idle.json` duplicate of `empty-crate.json` that can be deleted. `vinyl.json` is unchanged.
