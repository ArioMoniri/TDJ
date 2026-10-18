# TDJ web app — UX / UI review

Reviewed: `apps/web/src/app/globals.css`, `apps/web/src/components/*.tsx`, `apps/web/src/app/**/page.tsx`, `apps/web/src/app/layout.tsx`, and all 11 captures in `media/screenshots/` (desktop dark 01–06, desktop light 07, iPhone 08–11).
Lens: Apple HIG (Liquid Glass, materials, layout, accessibility) + WCAG 2.2 AA. All paths below are relative to `apps/web/src/`.

## 0. Executive summary

The app has a strong concept, good domain copy and a coherent palette. What holds it back is that **every surface is glass**, so there is no figure/ground: navigation, hero, controls, results, cards, inputs and chips are all the same semi-transparent 24 px-radius slab on an animated gradient. Apple's guidance is the opposite: glass is for the *control layer* that floats above content (nav, tab bar, sheets, floating CTA); the *content layer* sits on ordinary opaque surfaces. Fixing that one thing fixes most of the visual noise, most of the contrast problems and most of the mobile GPU cost at once.

Top 8 changes, in order of payoff:

1. Demote hero, controls, result header, tanda cards, library, settings and guide to opaque "content" surfaces; keep glass only on header pill, mobile tab bar, export sheet and (new) floating compose bar. (§4.1)
2. Wire up what is already in the UI but inert: `settings.reduceGlass` is never applied; the theme choice is not restored on reload; `.lens` / `#tdj-lens` are dead. (§4.2)
3. Raise all 36 px controls (lock, swap, close, chips) to 44 px hit areas; stop using 10–11 px text and `fillOpacity .55`. (§3, §6)
4. Make the chip rows readable: split "Cortinas" into labelled groups, wrap on desktop instead of clipping, add `aria-pressed`. (§1.1, §4.3)
5. Give the energy curve axes, a legend and keyboard access; keep its text at a readable size on phones. (§1.2, §4.5)
6. Make the export sheet a real sheet: grabber, Escape, focus trap, grouped formats, one tinted CTA. (§1.4, §4.6)
7. Mobile: shrink the hero, drop the near-empty mobile header pill, add a sticky "Compose" bar above the tab bar, respect `safe-area-inset-top` in standalone mode. (§3)
8. Typography: load real fonts with `next/font` instead of hoping for SF Pro / New York; today users on non-Apple devices get Georgia. (§2)

---

## 1. Screen-by-screen critique

### 1.1 Home / Composer (01-home-dark, 07-home-light, 08-mobile-home)

**Hierarchy.** The 5xl serif headline and the 140 px Lottie vinyl take ~45 % of the first desktop viewport and ~70 % of the phone viewport (08) before the user sees a single control. The actual job ("set hours, pick era, press Compose") starts below the fold on iPhone. The hero is a marketing block inside a tool; after the first visit it is pure cost.

**Spacing and rhythm.** Four different paddings for the same card role: hero `p-5 sm:p-8`, controls `p-4 sm:p-6`, result `p-4 sm:p-6`, tanda `p-4 sm:p-5`. Chip rows are `mt-2`, section labels `mt-3`, sections `space-y-5`, card grid `gap-3`. Nothing sits on one scale, which is why it reads as "generated" rather than designed. Pick a 4/8 scale: card padding 20/24, label-to-row 8, group-to-group 20, card-to-card 16.

**Controls grid.** The two-column grid puts *Length* and *Era* on row one and *Night arc + Shape* vs *Cortinas* on row two, so the left column is visibly shorter than the right (01, 07). Worse, the *Cortinas* row mixes two independent option groups (style: matched/constant/none, and trend: mix/trend/classics) in one scroll row, so two chips are "on" at once and it looks like a multi-select error ("Matched to next tanda" + "Mix" both filled). The culture row is a real multi-select but looks identical to the single-selects. Three different selection semantics, one visual.

**Clipping.** Era, Cortinas and Culture rows overflow on desktop and are cut mid-word ("Post-golde", "Tre", "Grec") with no fade or scroll affordance (01, 07). At 1440 px wide there is no reason to scroll; wrap instead.

**Native controls.** The checkbox and the `type=number` cortina seconds field are unstyled native widgets sitting inside a glass card — the only two elements in the app that do not follow the system. The checkbox is 13 px.

**Glass.** Hero and controls are both `glass` on top of the ambient gradient, and the sticky header is `glass` on top of them. In 02-result-arc you can see the failure mode: the pink "Compose the night" button bleeds through the header pill as a blob because the pill is only 50 % opaque. That is glass-on-glass, which Apple explicitly warns against.

**Light mode (07).** Works better than dark because the pastel background gives the white glass something to lens. But the 1 px `rgb(255 255 255/.35)` hairline is invisible on light, and `0 10px 30px rgb(0 0 0/.14)` is too heavy a shadow for a flat content card; the cards look like floating panels rather than a page.

### 1.2 Result header + energy curve (02-result-arc, 09-mobile-result)

**What works.** Title, stat line and the big 90/100 with a verdict is the right hierarchy. The curve itself (actual vs dashed target, rhythm-coloured dots) is the most "crafted" thing in the app.

**Missing scaffolding.** No y-axis ticks or label (what is 0–100?), no legend for the dashed line or the three dot colours, phase labels only where a phase starts (so "build" and "peak" sit next to each other and "cooldown" floats far right). On the phone (09) the whole SVG scales down, so the 11 px labels render at ~6 px and the dots overlap. Colour is the only encoding for rhythm (WCAG 1.4.1).

**Meta line.** "seed 23801646" is engineering state in user-facing copy; it belongs behind a "Copy seed" chip or in a tooltip. `4.05 h` should be `4 h 03 min`.

**Benchmark breakdown.** A native `<details>` with the default triangle marker, then a 2-column list of `xs` rows with `w8`-style weights. Fine as a debug panel, not as a product surface. Turn into a proper disclosure row with a chevron and give each factor a small bar.

**"Ask the AI DJ to review".** Secondary ghost button, but it is the only action here and sits alone; result text appears in a `whitespace-pre-wrap` box with no heading and no loading placeholder. There is no aria-live, so screen readers get nothing when the review arrives.

### 1.3 Tanda cards (03-tandas, 10-mobile-tandas)

**Hierarchy is good**: rhythm pill → meta → orchestra → singer → tracks → cortina. Keep it.

**The energy bars say nothing.** Width is `(s.energy / max within tanda) * 100 %`, so every bar is 85–100 % full on every card (03). Use an absolute 0–100 scale, or better, show the *shape* the user selected ("Slow → up → settle") as a 4-point sparkline, so the card proves the engine did what the control promised.

**Rhythm pill contrast.** White 11 px bold text on `from-rose-400/60 to-rose-600/40` over a dark card is roughly 2.5–3:1 — fails AA. The pill also uses a gradient, which Apple reserves for the one tinted primary action.

**Lock / swap** are 36 px (`!min-h-9`) and sit 4 px apart; on the phone (10) they are the hardest targets on the screen. Swapping has no confirmation or undo; the card just re-renders.

**Cortina row** truncates on the phone so genre/energy/length disappear (10). "e60" is cryptic. Make it two lines on mobile and spell out "energy 60".

**Repetition.** Twenty-two identical glass cards in a 2-column grid with an identical pink bar block become wallpaper. The DJ needs to scan *orchestra* and *rhythm* per tanda; everything else is secondary. A compact row view (one line per tanda: # · rhythm dot · orchestra / singer · years · energy) with a tap-to-expand card would be faster to scan and would halve the glass surface count.

### 1.4 Export (04-export, 11-mobile-export)

**Desktop (04)** is a centered modal, **mobile (11)** a bottom sheet, which is the right pattern split. Problems:

- No grabber, no slide-up motion, no Escape handling, no focus trap, no initial focus, no `aria-labelledby`.
- Eight equal-weight ghost buttons in a 2-column grid; "XSPF (VLC/Mixxx)" wraps to two lines on the phone and breaks the row rhythm. Group them: *DJ software* (Rekordbox, Traktor, Serato) / *Playlist files* (M3U8, XSPF, CSV) / *Other* (JSON, set list text).
- The Spotify CTA is `btn-primary` (correct: the one tinted action), but it reads "Connect Spotify & create playlist" even when the client ID is missing; tapping just prints a log line. Disable it with a one-line reason and link to Settings instead.
- Progress log is a `<pre>` at 11 px with no `aria-live`.

### 1.5 Library (05-library)

Clean list, good tabular numbers, rhythm label left-aligned. Issues: rhythm labels are 10 px coloured text (`text-rose-400` etc.) — on light mode `#fb7185` on cream glass is ~2.6:1 and `#2dd4bf` ~1.8:1. There is no empty state before typing and no "no results" state; the meta line says "hosted in this repo under data/index", which is README copy, not UI copy. The orchestra chips at the bottom are not interactive but are styled exactly like the selected/unselected chips in the composer, and tier-1 orchestras appear "selected". Either make them filters (click → search) or render them as plain text with a count.

### 1.6 Settings (06-settings)

"Your panel" is an odd heading; "Settings" is in the nav, use it. Inputs use placeholders as the only label (3.3.2). The API key field has no show/hide. Models are raw IDs in chips. The Spotify instruction paragraph is dense and includes the redirect URI inline; put the URI in its own copyable field with a "Copy" button (see the Mintlify reference). "Reduce transparency" is a native checkbox that **does nothing** (`settings.reduceGlass` is persisted but never read). Region chips capitalise to "Us". There is no connected-state badge; "not connected" is muted 12 px text next to the button.

### 1.7 Guide, callback

Guide: six identical glass cards for six definitions; a single surface with a definition list would be calmer. Callback: a single glass box with a string, no spinner, no error styling; errors surface as `String(e)`.

### 1.8 Navigation (all)

Desktop header pill is good glass usage (control layer). The mobile header (08) contains only the logo and "TDJ" in a 60 px pill — it costs vertical space and carries no function; remove it on mobile or make it the page title + score strip. The mobile tab bar is correct in concept but only ~50 % opaque so chips and text scroll through it legibly (08, 09, 10), and the active tab is indicated only by weight (no pill/tint).

---

## 2. Why it reads as AI-generated, and how to make it feel crafted

| Tell | Where | Fix |
|---|---|---|
| Everything is the same glass card with the same 24 px radius and the same shadow | all screens | Two tiers: opaque content surface (radius 16, hairline, no blur) and glass control layer (radius 20–24, blur). Only 4 glass elements in the whole app. |
| Serif display headline + lowercase tagline "tango dj composer" + sparkle icon on the CTA + "AI DJ" | Hero, nav, buttons | Drop the Sparkles icon (the single most recognisable "AI app" tell). Use a music-domain glyph or none. Tagline in sentence case or remove. Rename "Ask the AI DJ to review" to "Get a second opinion" / "Review this set". |
| Fonts declared but not loaded ("SF Pro Display", "New York", "Playfair Display", "Inter") | `globals.css` | Nobody outside macOS/iOS has these. Load one serif + one sans with `next/font` (e.g. Fraunces 600 for display, Inter for UI) so the type is identical on every device. |
| Pills for every option, including ones that aren't choices (orchestra counts, model IDs) | Composer, Library, Settings | Use a segmented control for 2–4 mutually exclusive choices (arc, shape, cortina style, theme), chips only for multi-select (cultures), and plain text for data. |
| Mid-dot stat strings everywhere (`4.05 h · 22 tandas · 82 tracks · 18 orchestras · seed 23801646`) | Result, Library, Tanda meta | Keep at most three facts per line, format durations as `4 h 03 min`, move seed to a copy action. |
| Gradient pink button with 24 px glow | CTAs | A tinted button is right for *one* action per screen. Flatten to a solid `rose` fill, 1 px inner highlight, no outer glow; keep gradient only if it is subtle (±6 % luminance). |
| Uniform motion: everything `rise`s in, cards stagger, vinyl spins forever | Composer | Motion should explain change. Animate only what changed (new result scrolls in, swapped card cross-fades); nothing on first paint except the result. Stop the vinyl when idle and respect reduced motion in `motion` and Lottie. |
| Over-explaining copy in the hero (three clauses) | Hero | One sentence: "Pick an era and a length. TDJ builds coherent tandas, shapes the night, and picks each cortina." Then stop. |
| Dev vocabulary in UI ("seed", "w2", "JSON (raw)", "hosted in this repo", "localStorage", "/api/ai/explain") | Result, Library, Settings | Replace with user vocabulary or hide behind "Advanced". |
| Ambient blobs drifting forever behind blurred cards | Background | Keep the gradient; drop the 28 s animation on phones (it is also what makes the backdrop-filter stack expensive). |

A crafted version of this app has: one display face used exactly twice (hero and result title), a 4/8 spacing grid, a single tinted colour used for one action per screen, opaque content, glass only where things float, motion only on data change, and copy in a DJ's vocabulary.

---

## 3. Mobile-specific fixes (iPhone captures 08–11)

1. **Touch targets.** Lock/swap (36 px), export close (36 px), all chips (36 px), native checkbox (13 px) are under Apple's 44 pt. Fix in `globals.css` (`chip` `min-height: 44px` on touch, `btn` already 44) and remove the `!min-h-9` overrides. See §4.4.
2. **Safe areas.** `viewportFit: cover` + `statusBarStyle: black-translucent` means in standalone mode the sticky header sits under the status bar. Add `padding-top: max(0.75rem, env(safe-area-inset-top))` to the header. The tab bar currently does `bottom-3` *plus* an internal `safe-b` padding, which makes it ~68 pt tall on a home-indicator iPhone; use `bottom: max(12px, env(safe-area-inset-bottom))` and no internal padding.
3. **Thumb reach.** The primary CTA is inside the controls card, often 1.5 screens down after the hero. Add a sticky action bar directly above the tab bar containing "Compose the night" (and "Export" once a playlist exists). This is the one place a tinted glass control is justified.
4. **Hero.** On `< sm` render the vinyl at 72 px beside a 2xl headline, or hide the hero entirely once `playlist` exists.
5. **Mobile header.** Remove the top pill on `< sm` (it only shows the logo) or reuse it for the page title + live score once a playlist exists.
6. **Tab bar opacity.** Raise to `--surface / .82` with blur 24 and add a top hairline; add a pill behind the active item (see Brink/Matter references). Content should be *suggested* through the bar, not readable.
7. **Sheet behaviour.** Bottom sheet needs: grabber, `translateY` spring in, drag-to-dismiss (or at least tap-outside + Escape), `max-height: 85dvh` with internal scroll, `padding-bottom: env(safe-area-inset-bottom)`, and the primary CTA pinned at the bottom of the sheet.
8. **Chip rows.** Horizontal scrolling is fine on phones, but add an edge fade so clipping is intentional, and `scroll-snap-type: x proximity`.
9. **Energy curve.** Render a shorter, taller-text variant below `sm` (W 360 / H 170, font-size 12) or give labels `vector-effect` via HTML overlays; current labels are ~6 px on 09.
10. **Cortina row** on cards: allow 2 lines on `< sm`.
11. **Performance.** Every card has `backdrop-filter: blur(18px) saturate(180%)` over two 60vmax blurred, animated pseudo-elements. On A-series phones this is the difference between 60 fps and 30 fps scrolling. Removing glass from content cards (§4.1) and freezing the blobs on touch devices resolves it.

---

## 4. Prioritised change list (file + exact edit)

P0 = correctness / accessibility blockers, P1 = large visual payoff, P2 = polish.

### 4.1 P1 — Split content surfaces from the glass control layer

`app/globals.css` — add a `surface` utility and restrict `glass` to the control layer:

```css
/* Content layer: opaque, no blur. Use for hero, controls, result, cards, settings, library, guide. */
@utility surface {
  position: relative;
  background: rgb(var(--surface) / .92);
  border: 1px solid rgb(var(--text) / .08);
  border-radius: 16px;
  box-shadow: 0 1px 2px rgb(0 0 0 / .06);
}
.dark .surface, :root:not([data-theme="light"]).auto-dark .surface { background: rgb(var(--surface) / .96); border-color: rgb(255 255 255 / .08); }

/* Glass stays for: header pill, mobile tab bar, export sheet, floating compose bar. */
@utility glass {
  position: relative;
  background: rgb(var(--surface) / .72);           /* was .55 — content bled through the nav */
  border: 1px solid rgb(var(--line) / .28);
  border-radius: var(--radius-glass);
  box-shadow: 0 8px 24px rgb(0 0 0 / .12), inset 0 1px 0 rgb(255 255 255 / .35);
  @supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    backdrop-filter: blur(24px) saturate(160%);
  }
  &::before { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
    background: linear-gradient(120deg, rgb(255 255 255 / .22), transparent 40%); }
  @media (prefers-reduced-transparency: reduce) { backdrop-filter: none; -webkit-backdrop-filter: none; background: rgb(var(--surface) / .98); }
}
```

Then swap classes:

- `components/Composer.tsx` line 148: `className="glass rise relative overflow-hidden p-5 sm:p-8"` → `className="surface relative overflow-hidden p-5 sm:p-6"`
- line 159: `className="glass rise p-4 sm:p-6"` → `className="surface p-5 sm:p-6"`
- line 198: `className="glass rise p-4 sm:p-6"` → `className="surface rise p-5 sm:p-6"` (keep `rise` here only: it is the thing that changed)
- line 220: `className="glass flex items-center gap-3 p-4"` → `className="surface flex items-center gap-3 p-4"`
- `components/TandaCard.tsx` line 387: `` `glass overflow-hidden p-4 sm:p-5 ...` `` → `` `surface overflow-hidden p-4 sm:p-5 ...` ``
- `app/library/page.tsx` lines 485, 491, 496; `app/settings/page.tsx` lines 519, 530, 537, 542; `app/guide/page.tsx` lines 580, 581; `app/callback/page.tsx` line 566: `glass` → `surface`.
- Keep `glass` in `components/Nav.tsx` (both) and `components/ExportSheet.tsx`.

Remove the dead lens code: delete `.lens` in `globals.css` line 77 and the `<svg><filter id="tdj-lens">` block in `app/layout.tsx` lines 454–459 (feTurbulence + feDisplacementMap is never referenced and costs a filter pass if it ever is).

Freeze the ambient blobs on touch devices (`globals.css`, after line 58):

```css
@media (hover: none), (prefers-reduced-motion: reduce) { .ambient::before, .ambient::after { animation: none; } }
@media (max-width: 640px) { .ambient::before, .ambient::after { filter: blur(48px); } }
```

### 4.2 P0 — Make the appearance settings actually work

`settings.reduceGlass` and `settings.theme` are persisted but only applied on click; on reload the `<html>` has neither `.dark`, `data-theme` nor `.auto-dark`, so "Dark" reverts to auto and "Reduce transparency" never does anything.

Add `components/ThemeSync.tsx`:

```tsx
"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

export function ThemeSync() {
  const { theme, reduceGlass } = useStore((s) => s.settings);
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.theme = theme === "auto" ? "" : theme;
    el.classList.toggle("dark", theme === "dark");
    el.classList.toggle("reduce-glass", reduceGlass);
  }, [theme, reduceGlass]);
  return null;
}
```

`app/layout.tsx`: import it and render `<ThemeSync />` just before `<Nav />`. Add to `<head>` a pre-hydration script so there is no flash:

```tsx
<script dangerouslySetInnerHTML={{ __html: `try{var s=JSON.parse(localStorage.getItem("tdj-v1")).state.settings;var e=document.documentElement;if(s.theme!=="auto")e.dataset.theme=s.theme;if(s.theme==="dark")e.classList.add("dark");if(s.reduceGlass)e.classList.add("reduce-glass")}catch(_){}` }} />
```

`app/globals.css`, inside the `glass` utility after the `prefers-reduced-transparency` rule:

```css
  :root.reduce-glass & { backdrop-filter: none; -webkit-backdrop-filter: none; background: rgb(var(--surface) / .98); }
```

`app/settings/page.tsx` line 544: remove the inline `document.documentElement...` mutations from the onClick; `ThemeSync` owns the DOM now. Line 545: replace the native checkbox with a switch (see §4.4 `Switch`).

### 4.3 P1 — Composer controls: wrap, group, label, segment

`components/Composer.tsx`

Replace the Cortinas block (lines 178–187) with three labelled groups:

```tsx
<div className="space-y-4">
  <Field label="Cortinas">
    <Segmented
      value={options.cortinaStyle ?? "matched"}
      onChange={(k) => setOptions({ cortinaStyle: k })}
      items={[["matched", "Matched"], ["constant", "Same all night"], ["none", "None"]]}
    />
  </Field>
  {options.cortinaStyle !== "none" && (
    <>
      <Field label="Cortina flavour">
        <Segmented value={options.cortinaTrend ?? "mixed"} onChange={(k) => setOptions({ cortinaTrend: k })}
          items={[["mixed", "Mix"], ["trend", "Current hits"], ["classic", "Classics"]]} />
      </Field>
      <Field label="Cultures" hint="Choose as many as you like">
        <div className="chip-row">
          {CULTURES.map((c) => {
            const on = (options.cortinaCultures ?? ["global"]).includes(c);
            return <button type="button" key={c} aria-pressed={on} onClick={() => toggleCulture(c)} className={`chip ${on ? "chip-on" : ""}`}>{CULTURE_LABEL[c]}</button>;
          })}
        </div>
      </Field>
      <Field label="Cortina length">
        <Stepper value={options.cortinaLengthSec ?? 45} min={20} max={90} step={5} unit="s" onChange={(v) => setOptions({ cortinaLengthSec: v })} />
      </Field>
    </>
  )}
  <Switch checked={options.closeWithCumparsita ?? true} onChange={(v) => setOptions({ closeWithCumparsita: v })} label="Close with La Cumparsita" />
</div>
```

with `const CULTURE_LABEL: Record<string,string> = { global: "Global", latin: "Latin", french: "French", italian: "Italian", brazilian: "Brazilian", turkish: "Turkish", greek: "Greek", persian: "Persian", balkan: "Balkan", arabic: "Arabic", kpop: "K-pop", afrobeats: "Afrobeats" };` (fixes "Kpop"/"Us" capitalisation; same for regions in Settings).

Use `Segmented` for Era-less single selects too (Night arc, Shape, theme, region, model). Add `components/ui.tsx`:

```tsx
"use client";
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <div role="group" aria-label={label}><div className="flex items-baseline justify-between"><span className="text-sm font-medium">{label}</span>{hint && <span className="text-muted text-xs">{hint}</span>}</div><div className="mt-2">{children}</div></div>;
}
export function Segmented<K extends string>({ value, items, onChange }: { value: K; items: Array<[K, string]>; onChange: (k: K) => void }) {
  return (
    <div role="radiogroup" className="segmented">
      {items.map(([k, l]) => <button type="button" role="radio" aria-checked={value === k} key={k} onClick={() => onChange(k)} className={`seg ${value === k ? "seg-on" : ""}`}>{l}</button>)}
    </div>
  );
}
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`switch ${checked ? "switch-on" : ""}`}><span className="switch-knob" /></button>
    </label>
  );
}
export function Stepper({ value, min, max, step, unit, onChange }: { value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label="Cortina length">
      <button type="button" className="btn btn-ghost !min-w-11 !px-0" aria-label="Decrease" onClick={() => onChange(Math.max(min, value - step))}>−</button>
      <span className="min-w-14 text-center tabular-nums" aria-live="polite">{value}{unit}</span>
      <button type="button" className="btn btn-ghost !min-w-11 !px-0" aria-label="Increase" onClick={() => onChange(Math.min(max, value + step))}>+</button>
    </div>
  );
}
```

`app/globals.css` additions:

```css
@utility chip-row { display: flex; flex-wrap: wrap; gap: .5rem; }
@media (max-width: 640px) {
  .chip-row { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; scroll-snap-type: x proximity; padding-inline: 1rem; margin-inline: -1rem;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 1rem, #000 calc(100% - 2rem), transparent); mask-image: linear-gradient(90deg, transparent, #000 1rem, #000 calc(100% - 2rem), transparent); }
  .chip-row > * { scroll-snap-align: start; }
}
.segmented { display: inline-flex; padding: 3px; border-radius: 999px; background: rgb(var(--text) / .06); gap: 2px; max-width: 100%; overflow-x: auto; }
.seg { min-height: 38px; padding: 0 .9rem; border-radius: 999px; font-size: .875rem; font-weight: 500; white-space: nowrap; color: rgb(var(--muted)); }
.seg-on { background: rgb(var(--surface)); color: rgb(var(--text)); box-shadow: 0 1px 3px rgb(0 0 0 / .18); }
.switch { position: relative; width: 51px; height: 31px; border-radius: 999px; background: rgb(var(--text) / .18); transition: background .2s; flex: none; }
.switch-on { background: #34c759; }
.switch-knob { position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 2px 4px rgb(0 0 0 / .25); transition: transform .2s; }
.switch-on .switch-knob { transform: translateX(20px); }
```

Replace the `scroll-x mt-2 flex gap-2 pb-1` wrappers in Composer (lines 168, 174, 176, 180, 184) with `chip-row` and add `aria-pressed` to every chip button. Replace the `[&>*]:min-w-0` grid (line 160) with `grid gap-6 md:grid-cols-[1.1fr_1fr]` so the length slider column does not share a row with a wrapping chip row.

### 4.4 P0 — Touch targets and the 36 px overrides

`app/globals.css` line 86: `chip { ... min-height: 36px; ...}` → `min-height: 40px;` and add:

```css
@media (hover: none) { .chip, .seg { min-height: 44px; } }
@utility icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 999px; border: 1px solid rgb(var(--text) / .12); background: rgb(var(--text) / .05); -webkit-tap-highlight-color: transparent; &:active { transform: scale(.96); } }
```

- `components/TandaCard.tsx` lines 400–401: `className="chip !min-h-9 !px-2.5"` → `className="icon-btn"` on both buttons; `gap-1` → `gap-2`. Add the index to the labels: ``aria-label={`${t.locked ? "Unlock" : "Lock"} tanda ${i + 1}`}`` and ``aria-label={`Swap tanda ${i + 1}`}``.
- `components/ExportSheet.tsx` line 301: `className="chip !min-h-9"` → `className="icon-btn"`.
- `components/Composer.tsx` line 185: native checkbox → `Switch`; line 186: number input → `Stepper`.

### 4.5 P1 — Energy curve: axes, legend, keyboard, mobile size

`components/EnergyCurve.tsx` — full replacement:

```tsx
"use client";
import type { Playlist } from "@/lib/types";

const COLORS: Record<string, string> = { tango: "#e0557a", vals: "#4fd1c5", milonga: "#8b7cf6" };
const PHASES = ["warmup", "build", "peak", "cooldown"] as const;

export function EnergyCurve({ p, onPick, active, compact = false }: { p: Playlist; onPick?: (i: number) => void; active?: number | null; compact?: boolean }) {
  const W = compact ? 360 : 720, H = compact ? 170 : 200, px = compact ? 30 : 36, py = 16, fs = compact ? 11 : 12;
  const n = Math.max(1, p.tandas.length - 1);
  const x = (i: number) => px + (i / n) * (W - px * 2);
  const y = (e: number) => H - py - 10 - (e / 100) * (H - py * 2 - 10);
  const smooth = (vals: number[]) => { if (vals.length < 3) return vals.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" "); let d = `M${x(0)},${y(vals[0]!)}`; for (let i = 1; i < vals.length; i++) { const cx = (x(i - 1) + x(i)) / 2; d += ` C${cx},${y(vals[i - 1]!)} ${cx},${y(vals[i]!)} ${x(i)},${y(vals[i]!)}`; } return d; };
  // phase bands: contiguous ranges, label centred in each band
  const bands = PHASES.map((ph) => { const idx = p.tandas.map((t, i) => (t.phase === ph ? i : -1)).filter((i) => i >= 0); return idx.length ? { ph, a: idx[0]!, b: idx[idx.length - 1]! } : null; }).filter(Boolean) as Array<{ ph: string; a: number; b: number }>;
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="group" aria-label="Energy arc of the night">
        <defs><linearGradient id="arcfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e0557a" stopOpacity=".28" /><stop offset="1" stopColor="#e0557a" stopOpacity="0" /></linearGradient></defs>
        {bands.map((b, k) => <rect key={b.ph} x={x(b.a) - (W - px * 2) / n / 2} y={py} width={(x(b.b) - x(b.a)) + (W - px * 2) / n} height={H - py * 2 - 10} fill="currentColor" fillOpacity={k % 2 ? .035 : 0} />)}
        {[0, 50, 100].map((g) => (<g key={g}><line x1={px} x2={W - px} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity=".14" strokeDasharray={g === 50 ? "2 6" : undefined} /><text x={px - 6} y={y(g) + 4} fontSize={fs} textAnchor="end" fill="currentColor" fillOpacity=".75">{g}</text></g>))}
        <path d={`${smooth(p.stats.energyArc)} L${x(p.tandas.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill="url(#arcfill)" />
        <path d={smooth(p.stats.targetArc)} fill="none" stroke="currentColor" strokeOpacity=".45" strokeWidth="2" strokeDasharray="6 6" />
        <path d={smooth(p.stats.energyArc)} fill="none" stroke="#e0557a" strokeWidth="3" strokeLinecap="round" />
        {p.tandas.map((t, i) => (
          <g key={t.index} role="button" tabIndex={onPick ? 0 : -1} aria-pressed={active === i}
             aria-label={`Tanda ${i + 1}, ${t.rhythm}, ${t.orchestra}${t.singer ? ` with ${t.singer}` : ""}, energy ${t.energy} of target ${t.targetEnergy}`}
             onClick={() => onPick?.(i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick?.(i); } }}
             style={{ cursor: onPick ? "pointer" : "default", outline: "none" }} className="focus-visible:[&>circle:last-child]:stroke-current">
            <circle cx={x(i)} cy={y(t.energy)} r={active === i ? 9 : compact ? 5 : 6.5} fill={COLORS[t.rhythm]} stroke="rgb(var(--surface))" strokeWidth="2" />
            {t.rhythm === "vals" && <circle cx={x(i)} cy={y(t.energy)} r={2} fill="#fff" />}
            {t.rhythm === "milonga" && <rect x={x(i) - 2} y={y(t.energy) - 2} width={4} height={4} fill="#fff" />}
            <circle cx={x(i)} cy={y(t.energy)} r="22" fill="transparent" stroke="none" />
          </g>
        ))}
        {bands.map((b) => <text key={b.ph} x={(x(b.a) + x(b.b)) / 2} y={H - 2} fontSize={fs} textAnchor="middle" fill="currentColor" fillOpacity=".75">{b.ph === "warmup" ? "warm-up" : b.ph === "cooldown" ? "cool-down" : b.ph}</text>)}
      </svg>
      <figcaption className="text-muted mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 rounded bg-rose-500" /> Energy</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0 w-5 border-t-2 border-dashed border-current opacity-60" /> Target arc</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.tango }} /> Tango</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.vals }} /> Vals</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS.milonga }} /> Milonga</span>
      </figcaption>
    </figure>
  );
}
```

In `Composer.tsx` line 209 render twice with Tailwind visibility: `<div className="sm:hidden"><EnergyCurve compact .../></div><div className="hidden sm:block"><EnergyCurve .../></div>` (two SVGs are cheaper than JS width measurement and keep SSR). Dots get a shape as well as colour (vals = inner dot, milonga = inner square), so rhythm is not colour-only.

### 4.6 P0 — Export sheet: dialog semantics and sheet behaviour

`components/ExportSheet.tsx` — replace the return block (lines 298–312):

```tsx
import { useEffect, useRef } from "react";
// ...
const panel = useRef<HTMLDivElement>(null);
useEffect(() => {
  if (!open) return;
  const prev = document.activeElement as HTMLElement | null;
  panel.current?.querySelector<HTMLElement>("button, a, [tabindex]")?.focus();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Tab" && panel.current) {
      const f = [...panel.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], [tabindex='0']")];
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    }
  };
  document.addEventListener("keydown", onKey);
  document.body.style.overflow = "hidden";
  return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus(); };
}, [open, onClose]);

const GROUPS: Array<[string, ExportFormat[]]> = [["DJ software", ["rekordbox", "traktor", "serato"]], ["Playlist files", ["m3u8", "xspf", "csv"]], ["Other", ["json", "setlist"]]]; // adjust keys to EXPORT_META's actual keys

return (
  <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="export-title" onClick={(e) => e.stopPropagation()}
         className="glass sheet w-full max-w-lg rounded-b-none p-5 pt-3 sm:rounded-b-[24px] sm:pt-5">
      <div className="mx-auto mb-3 h-1.5 w-9 rounded-full bg-current opacity-25 sm:hidden" aria-hidden />
      <div className="flex items-center justify-between">
        <h2 id="export-title" className="text-lg font-semibold">Export this set</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <p className="text-muted mt-1 text-sm">Download a file for your DJ software, or create the playlist in Spotify.</p>
      <div className="mt-4 max-h-[55dvh] space-y-4 overflow-y-auto">
        {GROUPS.map(([g, keys]) => (
          <div key={g}>
            <div className="text-muted mb-1.5 text-xs font-medium uppercase tracking-wide">{g}</div>
            <div className="grid grid-cols-2 gap-2">{keys.map((f) => <button type="button" key={f} onClick={() => dl(f)} className="btn btn-ghost justify-start text-sm"><Download size={15} /> {EXPORT_META[f].label}</button>)}</div>
          </div>
        ))}
      </div>
      {settings.spotifyClientId
        ? <button type="button" onClick={toSpotify} disabled={busy} className="btn btn-primary mt-4 w-full">{busy ? <Loader2 size={16} className="animate-spin" /> : null} {spotifyToken ? "Create playlist in Spotify" : "Connect Spotify and create playlist"}</button>
        : <p className="text-muted mt-4 text-center text-sm">To send this set to Spotify, add your Client ID in <a href="/settings" className="underline">Settings</a>.</p>}
      {result && <a href={result} target="_blank" rel="noreferrer" className="btn btn-ghost mt-2 w-full">Open in Spotify <ExternalLink size={14} /></a>}
      {log.length > 0 && <div role="status" aria-live="polite" className="mt-3 max-h-40 overflow-auto rounded-xl bg-black/10 p-3 text-xs leading-relaxed dark:bg-white/5">{log.map((l, i) => <div key={i}>{l}</div>)}</div>}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  </div>
);
```

`globals.css`:

```css
@keyframes sheet-up { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.sheet { animation: sheet-up .32s cubic-bezier(.2,.8,.2,1) both; }
@media (prefers-reduced-motion: reduce) { .sheet, .rise { animation: none; } }
```

### 4.7 P1 — Mobile navigation, safe areas, sticky compose bar

`components/Nav.tsx`:

- line 348: `className="sticky top-0 z-40 px-3 pt-3 sm:px-6"` → `className="sticky top-0 z-40 hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:block sm:px-6"` (desktop only; the mobile pill carries nothing).
- line 365: `className="glass glass-strong safe-b fixed inset-x-3 bottom-3 z-40 flex items-center justify-around px-1 pt-1 sm:hidden"` → `className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-center justify-around p-1 sm:hidden"`.
- line 367: ``className={`flex min-w-16 flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[11px] ${path === it.href ? "font-semibold" : "text-muted"}`}`` → ``className={`flex min-h-12 min-w-[72px] flex-col items-center justify-center gap-0.5 rounded-full px-3 text-xs ${path === it.href ? "bg-[rgb(var(--text)/.08)] font-semibold" : "text-muted"}`}``.
- Desktop nav links (line 357): add `aria-current={path === it.href ? "page" : undefined}`.
- `globals.css` line 75: `glass-strong` is only used by the tab bar and sheet; with the new `.72` base it is redundant — delete it and the class usages.

`app/layout.tsx` line 461: `pb-28` → `pb-36 sm:pb-12` (room for tab bar + sticky bar).

`components/Composer.tsx` — add after the controls section, before `{hydrated && playlist && ...}`:

```tsx
<div className="glass fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+64px)] z-30 flex items-center gap-2 p-2 sm:hidden">
  <button type="button" onClick={() => run()} disabled={busy} className="btn btn-primary flex-1">{busy ? <Loader2 size={18} className="animate-spin" /> : null} Compose the night</button>
  {playlist && <button type="button" onClick={() => setExportOpen(true)} className="icon-btn" aria-label="Export"><Share2 size={18} /></button>}
</div>
```

and hide the in-card primary button on mobile: line 190 add `hidden sm:inline-flex` to the class list.

Hero (line 148–156): add `${playlist ? "hidden sm:block" : ""}` to the section class; change `<Vinyl size={140} ...>` to `<Vinyl size={88} .../>` with `sm:` upscaling via a wrapper (`<div className="w-[88px] sm:w-[140px]">`), headline `text-2xl sm:text-5xl`.

### 4.8 P1 — Typography

`app/layout.tsx`:

```tsx
import { Inter, Fraunces } from "next/font/google";
const sans = Inter({ subsets: ["latin"], variable: "--font-sans-loaded", display: "swap" });
const serif = Fraunces({ subsets: ["latin"], weight: ["600"], axes: ["opsz"], variable: "--font-serif-loaded", display: "swap" });
// <html className={`${sans.variable} ${serif.variable}`} ...>
```

`globals.css` lines 4–5:

```css
--font-sans: var(--font-sans-loaded), -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
--font-serif: var(--font-serif-loaded), "New York", Georgia, serif;
```

Then: no text below 12 px. Replace `text-[10px]` / `text-[11px]` with `text-xs` in `Composer.tsx` line 164, `TandaCard.tsx` lines 391 and 398, `Nav.tsx` line 367, `ExportSheet.tsx` line 310, `library/page.tsx` line 492. Add `text-pretty` to the hero paragraph and `text-balance` to the h1.

### 4.9 P1 — Tanda card data honesty

`components/TandaCard.tsx` line 410: replace the relative bar with an absolute one plus the target tick:

```tsx
<span className="relative h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[rgb(var(--text)/.12)]" aria-label={`Energy ${s.energy ?? 50}`}>
  <span className="block h-full rounded-full bg-rose-500" style={{ width: `${s.energy ?? 50}%` }} />
</span>
```

Line 391 (rhythm pill): `` `rounded-full bg-gradient-to-br px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white shadow ${TONE[t.rhythm]}` `` → `` `rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${PILL[t.rhythm]}` `` with

```ts
const PILL: Record<string, string> = {
  tango: "bg-rose-600 text-white", vals: "bg-teal-700 text-white", milonga: "bg-violet-700 text-white",
};
```

(all ≥ 4.5:1 on white text). Line 398: `energy · target {t.targetEnergy}` → `of {t.targetEnergy} target`. Line 417: `e{t.cortina.energy}` → `energy {t.cortina.energy}` and add `sm:truncate` instead of `truncate` so phones get two lines.

### 4.10 P2 — Copy

- `Composer.tsx` 151–152: h1 "Compose a milonga, tanda by tanda." keep; p → "Pick an era and a length. TDJ builds coherent tandas, shapes the night from warm-up to La Cumparsita, and picks each cortina to fit what follows."
- 190: "Compose the night" keep; remove `<Sparkles />`, use `<Disc3 size={18} />` or no icon.
- 191: "Same seed" → "Recompose (same seed)"; 202: `{(playlist.stats.durationSec / 3600).toFixed(2)} h` → `${Math.floor(d/3600)} h ${String(Math.round((d%3600)/60)).padStart(2,"0")} min`; move `seed` into a `<button className="chip" onClick={copy}>Seed {seed}</button>`.
- 210: "Benchmark breakdown" → "How this set scored".
- 213: "Ask the AI DJ to review" → "Get a written review".
- `settings/page.tsx` 516: "Your panel" → "Settings"; 517: → "Keys stay in this browser and are sent only with your own requests."; 531: "AI reviewer (Anthropic)" → "Written reviews"; model chips → `Segmented` with labels "Best", "Balanced", "Fast" mapping to the IDs.
- `library/page.tsx` 487: drop "hosted in this repo under data/index". Add empty state: `{q.length < 2 && <p className="text-muted py-10 text-center text-sm">Type an orchestra, singer, title or year.</p>}` and `{q.length >= 2 && rows.length === 0 && <p ...>Nothing matches "{q}".</p>}`.
- `Nav.tsx` 353: "tango dj composer" → remove on desktop or "Tango DJ composer".

### 4.11 P2 — Motion discipline

- `TandaCard.tsx` 387: wrap the app in `<MotionConfig reducedMotion="user">` (in `layout.tsx`) and drop `initial={{ opacity: 0, y: 12 }}` on first render; animate only when `t.songs[0].id` changes (use `key` + `layout` as now, `initial={false}`).
- `Vinyl.tsx`: `autoplay={playing}` already stops when idle; also pass `autoplay={playing && !matchMedia("(prefers-reduced-motion: reduce)").matches}` via a `useReducedMotion` hook from `motion/react`.
- Remove `rise` from hero/controls (§4.1).

---

## 5. Mobbin references (what to borrow)

| Reference | Borrow |
|---|---|
| [Opal · Create Mix](https://mobbin.com/screens/1aa56e1e-a816-47c3-8d58-c9d6ea7c592a) | Dark music cards that are opaque with *one* tinted action each; a segmented filter under a sheet title — the model for tanda cards and the Era/Arc selectors. |
| [Insight Timer · playlist actions sheet](https://mobbin.com/screens/cc92baff-f411-408b-bf01-c3adf4a48045) | Sheet anatomy: grabber, context header (what is being exported), then single-column rows with leading icons and hairline dividers — adopt for the export sheet on mobile. |
| [Claude · Share sheet](https://mobbin.com/screens/ac62d150-e0cf-4bc5-aafb-bde762fc86b2) | Minimal sheet: title, one grouped option list, exactly one filled CTA pinned at the bottom — the "tint only the primary action" rule applied. |
| [Perplexity · Options sheet](https://mobbin.com/screens/d7220e78-7231-4822-ab69-169c863deff9) | Icon tiles for the 3–4 most-used targets above a list for the rest; use tiles for Spotify/Rekordbox/Traktor and a list for file formats. |
| [Stardust · Energy today](https://mobbin.com/screens/24961697-c776-4f0d-9d9c-3db687f51f8a) | Time-of-day axis with labelled ticks, filled area under the curve, a "now" marker and a two-way legend toggle, all on a dark gradient — the closest analogue to the night-arc chart. |
| [MacroFactor · Expenditure](https://mobbin.com/screens/61c71723-baab-41ff-8b56-3b66236d09da) | Y-axis ticks on the right, dashed-vs-solid legend row directly under the chart, range chips below — the legend treatment proposed in §4.5. |
| [Google Health · Heart-rate zones](https://mobbin.com/screens/75f72c14-6240-4300-9a08-ba7c532376b1) | Legend that encodes series by dash pattern as well as colour, and absolute-scale horizontal bars — fixes both the colour-only encoding and the meaningless relative energy bars. |
| [Brink · Home with floating tab bar](https://mobbin.com/screens/2e7b1b5e-14fd-4fd7-8b3c-b6d7b2651873) | Floating glass tab bar with a tinted pill behind the active item and content only *suggested* through it — target opacity/blur for the TDJ tab bar. |
| [Matter · Discover](https://mobbin.com/screens/0b904b91-7534-4504-aad0-d3d898ef0c1e) | Glass control layer (tab bar + mini player) floating over opaque content cards — the content/control split this review asks for; the mini-player is the model for the sticky compose bar. |
| [SoundCloud · Vinyl Studio](https://mobbin.com/screens/4f10ac06-8e4b-4003-8cb0-f3340d9fa2f7) | Set list editor: drag handles, per-side totals ("5 tracks, 6:30 time, 16:29 left") — add running time per phase and a total-vs-target readout above the tanda list. |
| [Insight Timer · empty playlists](https://mobbin.com/screens/d5a8b3a5-d8c3-4b29-8553-f9b8529cbe3f) | Two-line empty state (what is missing + the one action that fixes it) for Library before typing and for Composer before the first run. |
| [Buffer · API settings](https://mobbin.com/screens/796d3feb-5dd5-480b-a26f-27b0a398b685) and [Cofounder · Stripe keys](https://mobbin.com/screens/8d35c689-2898-470c-a4e1-cf9375d261e2) | One card per integration with a short "why", a status badge ("Not connected" / "Connected"), and a single action; secrets masked with explicit key-status rows — restructure the Spotify and Anthropic sections this way. |
| [Mintlify · OAuth redirect URIs](https://mobbin.com/screens/f7a25116-25cf-41e9-b15d-6f53e538f936) | The redirect URI as its own read-only field with a trailing action, not buried in a paragraph. |

---

## 6. Accessibility findings (WCAG 2.2 AA)

| # | Criterion | Finding | Where | Fix |
|---|---|---|---|---|
| A1 | 1.4.3 Contrast (min) | White 11 px text on 60 %-alpha gradient rhythm pill ≈ 2.5–3:1 | `TandaCard.tsx` 391 | §4.9 solid pills |
| A2 | 1.4.3 | `fillOpacity=".55"` phase labels and `.12` gridlines; on light mode ≈ 3:1 | `EnergyCurve.tsx` 246, 256 | §4.5 (`.75`, 12 px) |
| A3 | 1.4.3 | `text-rose-400` / `text-teal-400` / `text-violet-400` 10 px labels on light glass ≈ 1.8–2.6:1 | `library/page.tsx` 492, `guide/page.tsx` 581, `Composer.tsx` 220 | Use `-600/-700` shades in light, `-300` in dark via `dark:` variants; min 12 px |
| A4 | 1.4.3 | White 15 px on `#e0557a` ≈ 3.6:1 (needs 4.5 below 18.66 px bold / 24 px) | `btn-primary` | Darken fill to `#c9426a` (≈ 4.6:1) or set button text 18 px semibold |
| A5 | 1.4.11 Non-text contrast | Hairline `rgb(255 255 255/.35)` on light = invisible; chip borders `.3` | `globals.css` 64, 86 | `rgb(var(--text)/.14)` borders on light |
| A6 | 1.4.1 Use of colour | Rhythm encoded by colour only in chart dots | `EnergyCurve.tsx` | §4.5 inner shapes + legend |
| A7 | 2.1.1 Keyboard | Chart dots are click-only `<g>`; no focus, no Enter/Space | `EnergyCurve.tsx` 251 | §4.5 `role=button tabIndex=0` |
| A8 | 2.1.2 No keyboard trap / 2.4.3 Focus order | Dialog has no focus management; focus stays behind the overlay; no Escape | `ExportSheet.tsx` | §4.6 |
| A9 | 4.1.2 Name, role, value | Toggle chips announce as plain buttons; selected state not conveyed | all `chip`/`chip-on` buttons | `aria-pressed` (multi) or `role=radio aria-checked` (single) — §4.3 |
| A10 | 4.1.2 | Dialog lacks `aria-labelledby`; `aria-modal` without accessible name | `ExportSheet.tsx` 299 | §4.6 |
| A11 | 3.3.2 Labels | Inputs rely on placeholder only (Client ID, API key) | `settings/page.tsx` 522, 532 | Add `<label htmlFor>`; keep placeholder as example |
| A12 | 2.4.7 Focus visible | `outline-none` on library search input with no `focus-within` ring on the wrapper | `library/page.tsx` 488 | Remove `outline-none`; add `focus-within:ring-2 focus-within:ring-rose-500/60` to the label |
| A13 | 2.4.7 | No global focus style; chips and icon buttons rely on UA default which is clipped by `border-radius: 999px` + `overflow-hidden` cards | global | `globals.css`: `:focus-visible { outline: 2px solid #e0557a; outline-offset: 2px; }` |
| A14 | 2.5.8 Target size (AA = 24 px) / HIG 44 pt | 36 px lock/swap/close, 13 px checkbox | §3 | §4.4 |
| A15 | 2.3.3 Animation from interactions | `rise`, `motion.article`, Lottie ignore reduced motion (only ambient respects it) | `globals.css` 92, `TandaCard.tsx`, `Vinyl.tsx` | §4.6 css, §4.11 |
| A16 | 4.1.3 Status messages | Compose busy state, AI review arrival, export log have no `aria-live` | `Composer.tsx` 190, 215; `ExportSheet.tsx` 310 | Wrap the AI text in `<div role="status" aria-live="polite">`; add `aria-busy={busy}` on `#result`; §4.6 log |
| A17 | 1.3.1 Info & relationships | Result stats and tanda meta are mid-dot strings; benchmark factors are a `<ul>` of unlabeled percentages | `Composer.tsx` 202, 211 | Use `<dl>` for stats; label factors "score / weight" |
| A18 | 1.4.4 Resize / 1.4.12 Spacing | 10–11 px labels fall below 12 px and SVG text shrinks with width | multiple | §4.8, §4.5 |
| A19 | 1.4.13 Content on hover | SVG `<title>` tooltips are hover-only and not keyboard reachable | `EnergyCurve.tsx` 253 | §4.5 `aria-label` on the group |
| A20 | 3.2.4 Consistent identification | Non-interactive orchestra "chips" look identical to toggles; tier-1 look selected | `library/page.tsx` 498 | Render as text + count, or make them real filters |
| A21 | 2.4.6 Headings | Settings `h1` "Your panel" does not match nav label "Settings" | `settings/page.tsx` 516 | Rename |
| A22 | HIG Reduce Transparency | `prefers-reduced-transparency` handled in CSS, but the in-app "Reduce transparency" toggle is inert | `settings/page.tsx` 545 | §4.2 |
| A23 | 1.3.5 / 1.4.x (password) | API key `type=password` with no reveal control | `settings/page.tsx` 532 | Add "Show" toggle button (`aria-pressed`) |

Passing / keep: `lang="en"`, `color-scheme: light dark`, `tabular-nums`, `aria-label` on lock/swap, `aria-current` on mobile tabs, semantic `<ol>` for tracks, `overscroll-behavior-y: none`, `-webkit-tap-highlight-color: transparent`, reduced-motion on ambient, `env(safe-area-inset-bottom)` usage, `scroll-mt-24` on `#result`.

---

## 7. Suggested order of work

1. §4.2 (theme + reduce-glass wiring) and §4.4 (targets) — one hour, removes two silent failures.
2. §4.1 (surface vs glass) — half a day, the biggest visual change; retake all screenshots after this.
3. §4.3 + §4.10 (controls, copy) — one day.
4. §4.5 (chart) and §4.6 (sheet) — one day.
5. §4.7 + §4.8 + §4.9 + §4.11 — one day.
6. Re-run the WCAG table in §6 with axe + VoiceOver on iOS; everything listed should clear.
