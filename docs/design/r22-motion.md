# Round 22: motion and interaction spec (native macOS / iPadOS)

Scope: `apps/web` (Next 16, Tailwind 4, `motion` 14, lucide) and the macOS / iPadOS wrappers planned in ROADMAP §9. This spec covers ROADMAP §1 (player IA, headphone pre-listen, tap to play, skip tonight, Jump to La Cumparsita, energy/BPM/key), §2 (search side panel, swap sheet), §3 (database versions), §4 (era indicator), §6 (Settings toggles), §7 (Turkish) and §8 (design and motion).

It builds on and does not repeat:

- `docs/design/motion-system.md`: principles (nocturnal, precise, musical, settle-never-bounce), the anti-list, beat-based durations.
- `docs/design/motion-composer.md`: Compose-flow choreography.
- `docs/design/apple-native-pass.md`: type scale, radii, materials, grouped lists, sheets with detents.
- `docs/design/performance-budget.md`.

Where this document disagrees with them, this document wins for round 22. Every deviation is marked **Δ**.

Evidence: live captures from https://d3k5k2c1l0s5ri.cloudfront.net, recorded on 2026-11-14 with Playwright (Chromium 1194) at 1440×900 dark ("mac") and 1180×820 light with touch ("ipad"). Videos and frame sequences: `/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/r22-motion/` (`video-mac/`, `video-ipad/`, `video-booth/`, `mac-*.png`, `ipad-*.png`, `b-*.png`, script `rec.js`/`rec2.js`).

---

## 0. Principles for round 22

The round-1 principles still apply. Round 22 adds six rules. They decide every case below.

1. **The audio clock leads and the UI follows.** Anything that shows audio state (progress, crossfade, fades, cue position, the tanda change) is driven by `AudioContext.currentTime`. It is scheduled once as a CSS or WAAPI animation and resynced at most once per second, never written per frame through React. When the UI drops frames, the picture is late. The sound must never be late.
2. **Room and headphones never look alike.** Room is warm and solid. Headphones are cool and striped. The two also differ in icon, label and position on screen, so colour is never the only difference. One glance across a dark booth from a metre away must tell them apart (§6).
3. **Pointer is not touch.** On a Mac (`(hover: hover) and (pointer: fine)`) controls do not scale on press, menus open instantly at the cursor, rows are 28 to 32 px and the keyboard can do everything. On an iPad (`(pointer: coarse)`) rows are 44 px, presses shrink to 0.97, menus open from a long press with a lifted preview, and a trackpad gets the hover highlight. Same components, two densities (§3.6).
4. **A window, not a page.** The sidebar, toolbar, player bar and inspector stay fixed. Only content panes scroll, each on its own, with rubber-band at the edges. Nothing scrolls the window chrome away. Page changes are instant swaps of the detail pane, not cross-page fades (**Δ** motion-system §3.3).
5. **Direct manipulation over dialogs.** Right-click or long press on any song gives a context menu. Drag reorders. Hover reveals row actions. A sheet is only for a decision that needs a form. A list of commands is a menu, never a sheet with a Cancel button (**Δ** the Booth ••• today).
6. **Every indicator has a switch and a legend.** Energy, BPM, key, era and the motion level itself are toggles in Settings (ROADMAP "every indicator can be turned off"). Turning one off removes it with a 125 ms fade and lets the row reflow with the `smooth` spring, so nothing jumps.

---

## 1. Inventory: what exists today

### 1.1 Tokens

| Layer | Where | Values |
| --- | --- | --- |
| Durations (s) | `lib/motion.ts` `dur` | xs .125 · s .25 · m .375 · l .5 · loop 1.2 · breathe 3 · reveal .7 · draw .9 |
| Durations (CSS) | `globals.css` `--dur-*` (l.131–147) | the same, plus `--dur-instant` 80 ms |
| Easings | `ease` / `--ease-*` | settle (.2,.8,.2,1) · out (.16,1,.3,1) · in (.7,0,.84,0) · breathe · inOut (.65,0,.35,1) |
| Springs | `spring` | thumb 520/42/.8 · knob 700/40 · sheet 380/38/1 · snappy 520/34/.8 · gentle 300/32/1 (stiffness/damping/mass) |
| Tweens | `t` | press, fade, enter, exit, settle |
| Stagger | `STAGGER_MS` 28, cap 12; composer `STAGGER` | |
| Variants | `rise`, `fade`, `sheetUp`, `toastIn`, `lineSwap`, `reduced.rise` | |
| Materials | `--material-thick/regular/thin/ultrathin`, `--blur-*` 20/16/12 | `.glass`, `.sheet-material`, `.material-thin` sidebar |
| Haptics | `lib/haptics.ts` `haptic(ms)` → `navigator.vibrate` (Android only; silent under reduced motion) | used in Sheet, SwipeRow, ControlStrip, Form, Menu, TrackRow, TandaCard, ExportSheet |

### 1.2 Behaviour already right

- `MotionConfig reducedMotion="user"` app-wide (`components/Motion.tsx`).
- The macOS cursor rule is in place: `cursor: default` on buttons, `text` on fields, `pointer` only on links (`globals.css` l.238).
- `:focus-visible` uses a 2 px tint outline and an inset ring inside glass.
- Sheets have a grabber, medium and large detents and drag to dismiss on phones. Blur is applied only after the spring settles (`.glass-settling`). There is a focus trap, Escape closes and the page behind does not scroll.
- The desktop menu (`Menu.tsx`) is an anchored popover: opacity plus scale from 0.96, 250 ms.
- The sidebar ≥ 1024 px is a source list with a `layoutId` selection pill.
- The meter draws on canvas at 30 fps (10 fps with reduced motion). The engine schedules fades as `AudioParam` automation (`setTargetAtTime`, `linearRampToValueAtTime`).
- Booth keyboard: space, →, Esc (stop confirm), f, x, h, t, ↑/↓, c, b, m, ?. Ignored while typing or while a dialog is open.

### 1.3 Measured on the live app

| # | Observation | Evidence |
| --- | --- | --- |
| M1 | **Cumulative layout shift 0.21 on desktop and 0.15 on iPad** over compose → Library → Booth → Database → Settings. Google's "good" threshold is 0.1. Library renders its header, then about 300 px of empty space, then the orchestra list arrives. | `log-mac.json`, `mac-06-nav-Library-f1.png` |
| M2 | **Navigation does not answer at once.** 80 ms after a sidebar click the old page is still shown, because `PageTransition` uses `AnimatePresence mode="wait"`: the exit runs first, then the new route loads, then it fades in. A click on the sidebar followed by "networkidle" took 1.4–2.3 s. | `mac-06-nav-Database-f0.png` shows Booth after Database was clicked |
| M3 | Two long tasks (53, 58 ms) on the iPad run during navigation. | `log-ipad.json` |
| M4 | **Right-click opens the browser's own menu.** There is no `onContextMenu` anywhere in `apps/web/src`. | `b-04-right.png` |
| M5 | **The Booth ••• opens a centred modal sheet** with "Cancel" and 44 px rows, each with a separator. This is an iOS action sheet on a Mac. A Mac menu is anchored, has 22 to 24 px rows and separates only groups. | `b-10-more-f2.png` |
| M6 | Headings and labels can be selected as text (`user-select: auto` on body and h1). Dragging across the sidebar selects text, which reads as a web page. | `log-*.json` |
| M7 | The whole document scrolls. `body { overscroll-behavior-y: none }` turns off the macOS and iPadOS rubber-band. | `globals.css` l.232 |
| M8 | Sidebar rows are 36 px on a touch iPad, under the 44 px touch-target rule in CLAUDE.md. | `ipad-07-Settings.png` |
| M9 | On the iPad Settings page the Theme segmented control's track stretches to the full cell width while the three segments sit at the left. The thumb and track proportions are broken. | `ipad-07-Settings.png` |
| M10 | The Booth is split four ways. Transport is a floating capsule at the bottom centre. Now-playing is at the top left, Next and Time are in the middle and the set is at the right. The eye travels across the whole screen to connect "what is playing" with "the play button". DJ apps and Spotify keep now-playing beside the transport. | `b-09-playing.png` |
| M11 | Every 33 ms the store `tick()` writes `position`, `remaining`, `meter` and `drift` into zustand, which re-renders every component subscribed to them (NowCard, TimeCard, SetColumn rows). `Meter.tsx` calls `getComputedStyle` on every drawn frame, which forces a style recalculation. | `lib/booth/store.ts` l.905, `components/booth/Meter.tsx` l.40 |
| M12 | The AudioContext is created without `latencyHint`. The default `"interactive"` uses the smallest buffer, so main-thread stalls are most likely to cause underruns on iPad. | `lib/booth/store.ts` l.465 |
| M13 | **Audition (round 21) plays through the default output, which is the room.** There is no second-output path, so a "test" during the night is heard by the dancers. | `store.ts` l.173 comment |
| M14 | **Reduced motion sets every `--dur-*` to 0 ms.** The policy in motion-system §2.4 says these should become 125 ms fades. State changes therefore jump with no fade at all. | `globals.css` l.149 |
| M15 | Compose rows truncate titles ("Cosas …", "Volver a S…") to make room for key and BPM chips plus `•••`. The indicators push the music out. | `b-02-tandas.png` |

### 1.4 What feels web-like, ranked

1. Navigation waits (M2), then cross-fades the whole page (principle 4).
2. The whole page scrolls, including the large title, with no rubber-band (M7).
3. There are no context menus (M4) and command lists open as modal sheets (M5).
4. Layout shift while data loads (M1).
5. Text selection on chrome (M6).
6. There is no ⌘ vocabulary: no ⌘F, ⌘K, ⌘, (Settings), ⌘1…7, ⌘⌃S (sidebar), ⌘⌥I (inspector), and no shortcut hints in menus. The `MenuItem.shortcut` field exists but is unused.
7. Selection model: rows can be clicked but not *selected*. There is no accent-filled selected row, no ↑/↓ to move a selection, no Return to act, no Space to preview.
8. The focus ring is a 2 px outline offset 2 px. macOS draws a 3 to 4 px halo in the accent colour at about 50 % alpha that follows the control's corner radius.
9. Desktop sheets put "Cancel" at the top left (iOS). A macOS sheet has its buttons at the bottom right: the default button rightmost on Return, Cancel to its left on Esc.
10. On a Mac every glass button darkens and scales the same way as on touch. On macOS, press is a fill change and only toolbar items show a hover bezel.

---

## 2. Research: what we are matching

### 2.1 macOS (Tahoe 26) and iPadOS (26) HIG patterns we adopt

| Pattern | macOS | iPadOS | TDJ decision |
| --- | --- | --- | --- |
| **Sidebar** | Source list, 200–280 pt, rows 28 pt (medium), section headers 11 pt semibold secondary, selection is an accent-tinted capsule (grey when the window is inactive). Floating Liquid Glass inset panel in Tahoe. Collapse with ⌘⌃S or the toolbar button. | 320 pt, rows 44 pt, can collapse to a tab bar (iPadOS 18+ "sidebar adaptable"). | Width 232 px on Mac and 300 px on iPad. Rows 30 px pointer and 44 px touch. Section headers "Play", "Prepare", "Know", "App". Collapsible on Mac (§4.2). On iPad portrait the sidebar becomes an overlay. |
| **Toolbar** | Unified toolbar, 52 pt, title leading, actions trailing, search field trailing, hover bezel on items. | Navigation bar with large title collapsing on scroll. | The toolbar is fixed (it does not scroll away). It holds the title, page actions and the ⌘F search. The large title collapses into it only on phones. |
| **Inspector** | Trailing panel 260–320 pt (⌘⌥I), in Pages, Keynote and Finder. | Trailing column, or a sheet in compact width. | The Booth set list, Compose search panel and swap all use the **inspector slot** on wide screens and a sheet in compact width. |
| **Sheets** | Centred in the window, scale 0.98→1 with a fade, about 250 ms. Buttons at the bottom right, Return is default and Esc cancels. The window dims slightly. | Form sheet, centred, 540×620. Page sheet on large. Detents on compact. | Desktop sheets get a bottom-right button row. "Cancel" is removed from the top bar on pointer devices. |
| **Popovers** | Anchored with an arrow, transient (outside click closes), no scrim. | Same, plus a scale-in from the anchor. | Output picker, BPM/key legend, era legend, the swap "why" all use popovers, not sheets. |
| **Menus and context menus** | Appear instantly at the cursor. 13 pt items, 22 pt rows, group separators, ⌘ glyphs right-aligned. The chosen item blinks once and the menu fades out in about 150 ms. | Long press: the source lifts (scale ≈ 1.03 with shadow), the rest blurs, and the menu springs out of the source. | A new `ContextMenu.tsx` on every song, tanda and cortina row, with the two behaviours (§5.15). |
| **Segmented control** | 22–28 pt, segments equal width, the thumb slides about 200 ms. | 32 pt. | Fix M9: the track hugs the segments (`inline-grid`, `grid-auto-columns: 1fr`). |
| **Hover** | Rows do not highlight on hover in lists (selection does). Toolbar items show a bezel. Links and row actions appear on hover. | With a pointer: hover highlight morphs to the button shape ("pointer effects"). | Row actions appear on hover. Rows get no hover fill on Mac. On iPad with a trackpad rows get a fill-4 highlight. |
| **Focus** | Keyboard focus ring: accent halo 3 pt, follows the corner radius. Full Keyboard Access moves Tab through every control. | Focus ring on hardware keyboard, same style. | §7.2. |
| **Keyboard** | Menu bar commands with shortcuts. ⌘, Settings, ⌘F Find, ⌘W, ⌘1… views, Space play/pause in media apps, ⌘→ next. | Hold ⌘ to see the shortcuts HUD. | A command registry (`lib/commands.ts`) feeds the menus, the shortcuts sheet, the wrapper's menu bar and the ⌘ HUD (§7.3). |
| **Drag and drop** | The item lifts with a shadow under the pointer. Others make room with a spring. The drop target gets an insertion line. | Long press lifts the item, which follows the finger. Others part. | Drag reorder within and between tandas. Drag a search result into a tanda (§5.14). |
| **Materials / vibrancy** | Sidebar and toolbar are translucent over the wallpaper or the window behind. Content is opaque. | Same. | Already right: glass is used only on the control layer. In the wrapper, the sidebar uses the native `.sidebar` vibrancy and the web layer is transparent (§4.5). |
| **Window chrome** | Traffic lights at (20, 20) inside the sidebar or toolbar. Content runs to the window edge. The toolbar is the drag region. Full-screen hides the toolbar until the pointer reaches the top. | Stage Manager windows resize freely, and the iPadOS 26 menu bar and traffic lights are available. | §4.5. |

### 2.2 DJ and music apps

| App | What we take | What we leave |
| --- | --- | --- |
| **Spotify desktop** | A three-zone layout: the library (sidebar) on the left, the main view in the centre and a **queue / now-playing panel on the right**. A **persistent player bar** at the bottom: now playing on the left, transport and scrubber in the centre, output device, queue and volume on the right. The playing row shows an equaliser glyph in place of its number. The Crossfade and Automix settings each have a one-line explanation. (Mobbin: [Spotify web player](https://mobbin.com/screens/dcdeefb6-94d9-4588-ad4e-b2965cad2798?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp), [Spotify song menu](https://mobbin.com/screens/facdc774-78cf-4c5f-a873-b70201c92bed?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp)) | Shuffle and repeat, which mean nothing in a milonga. |
| **TIDAL / Deezer / Suno** | A play queue as a closable right panel with "Now playing" over "Next up". A row hover reveals add/remove. ([TIDAL](https://mobbin.com/screens/dc12eb80-5356-4401-a0f5-07251bfd1ae7?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp), [Suno](https://mobbin.com/screens/a62f88b0-6107-4fcd-821a-42d873f80732?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp), [Deezer queue](https://mobbin.com/screens/df7d4a58-5a6d-4bae-bf3f-e3d299abbda2?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp)) | |
| **YouTube Music** | A context menu on a queue row offers Play next, Add to queue and Remove from queue ([screen](https://mobbin.com/screens/e7a25966-6b2b-410b-b2b1-d8670b5c259d?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp)). | |
| **Apple Music** (iOS 26) | A glass context menu: a quick-action row (Favorite, Share) on top, then grouped commands, then Play Next / Play After at the bottom near the thumb ([screen](https://mobbin.com/screens/9bbd868b-2e15-4da4-a7db-0b2124ec9e7e?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp)). The macOS Music mini player and the Up Next popover. | |
| **Artlist / SoundCloud** | An inline waveform per row with a scrub. A row play button that appears on hover ([Artlist](https://mobbin.com/screens/734a78da-ef90-4239-ac0a-b22e9a31873a?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp)). | |
| **djay Pro** (from memory, not Mobbin) | A per-deck headphone **cue button that lights** when the deck is in the headphones. A split-output setting with a clear "Pre-cue via headphones" device row. A crossfader that animates on automix. | Two-deck visuals. TDJ is a playlist booth, not a turntable. |
| **rekordbox / Serato / Traktor** (from memory) | A lit **CUE (headphones) button** in a distinct colour per deck, mixed with a "cue/master" knob. Key shown in the Camelot notation with the **Camelot colour wheel** (also Mixed In Key). BPM tabular. Energy 1–10. A colour strip per track. | Waveform zoom and beat grids. |

What these apps share and TDJ must adopt:

1. Now playing and transport sit together in one bar that never moves.
2. Headphone cue is a lit, separately coloured state on the item that is cued.
3. The queue or set list is a column you scan, with the playing row marked by an animated glyph.
4. Key is coloured by the Camelot wheel.
5. Every row is a target for play, cue and context menu.

---

## 3. Tokens (round 22)

### 3.1 Springs: Apple-style, described by duration and bounce

`motion` 14 accepts `{ type: "spring", visualDuration, bounce }`. These map one-to-one to SwiftUI's `.smooth`, `.snappy` and `.bouncy`, so the wrapper's native code can use the same numbers. The old stiffness/damping springs stay as aliases until migrated.

| Token | visualDuration | bounce | SwiftUI twin | Use |
| --- | --- | --- | --- | --- |
| `spring.smooth` | 0.35 | 0 | `.smooth` | Layout moves, sidebar and inspector collapse, rows reflowing, indicator on/off |
| `spring.snappy` | 0.25 | 0.08 | `.snappy` | Selection pill, segmented thumb, switch knob, output switch |
| `spring.sheet` | 0.40 | 0 | `.smooth(duration: 0.4)` | Sheets and popovers in, the search panel |
| `spring.drag` | 0.30 | 0 | `.interactiveSpring` | Release after a drag. **Carries the gesture's velocity.** |
| `spring.land` | 0.30 | 0.12 | `.snappy(extraBounce: .04)` | **Only** a dropped row landing and the "tanda changed" number tick. The one place a tiny overshoot (≤ 2 px) is allowed outside glass (**Δ** motion-system "settle never bounce": a drop needs a felt landing). |

Alias map: `thumb`/`knob` → `snappy`, `gentle` → `smooth`, `sheet` → `sheet`, `snappy`(old) → `snappy`.

### 3.2 Durations (tweens)

The beat-subdivision durations stay. These are added:

| Token | ms | Use |
| --- | --- | --- |
| `--dur-0` | 0 | Menus appearing on Mac, page swap, selection |
| `--dur-hover-in` | 80 | Hover fill and row actions appearing |
| `--dur-hover-out` | 160 | Hover fill and row actions leaving (out is slower than in, as in macOS) |
| `--dur-menu-out` | 150 | Menu or context menu dismiss, after the 2-blink selection flash (2 × 40 ms) |
| `--dur-tanda` | 600 | Tanda boundary hand-off in the player bar (≈ one beat plus a quarter) |
| `--dur-crossfade` | *runtime* | Set from the engine's actual fade length. The visual crossfade lasts exactly as long as the audio fade. |
| `--dur-toast` | 4000 | Toast dwell (8000 when it carries Undo) |

### 3.3 Easings

The existing easings stay. One is added:

- `--ease-audio: linear`. Any visual that mirrors an `AudioParam` ramp (crossfade bars, fade-out ring, cue progress) uses the same curve as the audio. `linearRampToValueAtTime` maps to `linear`. `setTargetAtTime` maps to an exponential approach: use `linear(0, 0.39 10%, 0.63 20%, 0.78 30%, 0.86 40%, 0.92 50%, 0.95 60%, 0.97 70%, 1)`, a CSS `linear()` approximation of 1−e^(−t/τ) with τ = duration/6, which matches the engine's `fade/6`.

### 3.4 Distances and scales

| Token | Value | Use |
| --- | --- | --- |
| `--d-nudge` | 2 px | Press nudge on touch, the drop overshoot cap |
| `--d-rise` | 8 px | Entry rise (**Δ** from 10 px: denser Mac layouts) |
| `--d-slide` | 12 px | Max content slide (toasts, line swap) |
| `--d-panel` | panel width | Sidebar, inspector and search panel slide by their own width, clipped. Content never travels further than that. |
| `--s-press-touch` | 0.97 | Touch press on buttons and rows |
| `--s-press-pointer` | 1 | **No scale on Mac.** Press darkens the fill (`--fill-2` → `--fill-1`). |
| `--s-pop` | 0.96 → 1 | Popover and context-menu entry on touch |
| `--s-lift` | 1.03 | Long-press lift and drag lift |

### 3.5 Reduced motion and reduced transparency

| Category | Default | `prefers-reduced-motion: reduce` (or Settings → Motion → Reduce) |
| --- | --- | --- |
| Moves (slides, springs, layout) | as specified | 125 ms opacity cross-fade at the destination. `layout` animations are instant. |
| Panel open/close | slide by width | Panel fades in place over 125 ms. The content beside it reflows instantly. |
| Audio-mirroring visuals (progress, crossfade, cue) | continuous | **Kept**, because they carry information. Updated at 10 fps (as today) with no easing. |
| Loops (equaliser glyph, on-air pulse) | 1.2 s loop | A static glyph. The on-air dot is solid. |
| Count-ups, number ticks | 250–375 ms | The final value is shown directly |
| Haptics | on | on (**Δ** `haptics.ts`: vibration is not motion. Respect only the Settings "Haptics" switch.) |

**Fix for M14.** Under reduced motion do not zero the durations. Set them to the fade value and drop the transforms:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --dur-xs: 125ms; --dur-s: 125ms; --dur-m: 125ms; --dur-l: 125ms;
    --d-rise: 0px; --d-slide: 0px; --s-press-touch: 1; --s-pop: 1; --s-lift: 1;
  }
}
:root[data-motion="reduce"] { /* same block; set from Settings → Motion (§9) */ }
```

Reduced transparency (existing switch) changes materials only. `material-*` become opaque `--bg-cell` and the motion stays as it is.

### 3.6 Platform and density detection

```ts
// lib/platform.ts (new)
export const isPointer = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
export const isTouch = () => matchMedia("(pointer: coarse)").matches;
export const isWrapper = () => typeof window !== "undefined" && "__TDJ_NATIVE__" in window; // set by the macOS/iPadOS shell
export const isMac = () => /Mac/.test(navigator.platform) && !isTouch(); // ⌘ vs Ctrl glyphs
```

```css
/* globals.css: one density switch, every row and control reads it */
:root { --row-h: 44px; --row-h-dense: 44px; --menu-row-h: 44px; --sidebar-row-h: 44px; }
@media (hover: hover) and (pointer: fine) {
  :root { --row-h: 36px; --row-h-dense: 30px; --menu-row-h: 24px; --sidebar-row-h: 30px; }
}
```

Touch targets stay ≥ 44 px on touch (CLAUDE.md) and fixes M8. Pointer density follows macOS list metrics.

### 3.7 `lib/motion.ts` additions (shape for the engineer)

```ts
export const spring2 = {
  smooth: { type: "spring", visualDuration: 0.35, bounce: 0 },
  snappy: { type: "spring", visualDuration: 0.25, bounce: 0.08 },
  sheet:  { type: "spring", visualDuration: 0.40, bounce: 0 },
  drag:   { type: "spring", visualDuration: 0.30, bounce: 0 },
  land:   { type: "spring", visualDuration: 0.30, bounce: 0.12 },
} as const satisfies Record<string, Transition>;

export const hover = { in: 0.08, out: 0.16 } as const;
export const menuOut = { duration: 0.15, ease: ease.in } as const;

/** Popover / context menu: instant on a Mac, sprung from the anchor on touch. */
export const popover = (pointer: boolean): Variants => ({
  hidden: pointer ? { opacity: 0 } : { opacity: 0, scale: 0.96 },
  show: pointer ? { opacity: 1, transition: { duration: 0 } } : { opacity: 1, scale: 1, transition: spring2.sheet },
  exit: { opacity: 0, transition: menuOut },
});

/** Panels that slide by their own width (sidebar, inspector, search panel). */
export const panel = (side: "left" | "right"): Variants => ({
  hidden: { x: side === "left" ? "-100%" : "100%" },
  show: { x: 0, transition: spring2.smooth },
  exit: { x: side === "left" ? "-100%" : "100%", transition: spring2.smooth },
});
```

---

## 4. Window model and layout

### 4.1 The shell (≥ 1024 px pointer, ≥ 1024 px iPad landscape)

```
┌──────────┬─────────────────────────────────────────────┬──────────────┐
│ ● ● ●    │ Toolbar: Title        [actions]   [⌘F 🔍]   │              │
│ Sidebar  ├─────────────────────────────────────────────┤  Inspector   │
│ 232 px   │                                             │  320 px      │
│ (glass)  │  Detail pane (scrolls on its own)           │  (Set list / │
│          │                                             │  Search /    │
│          │                                             │  Swap / Info)│
├──────────┴─────────────────────────────────────────────┴──────────────┤
│ Player bar 72 px (glass): Now playing · transport + scrub · outputs · levels │
└────────────────────────────────────────────────────────────────────────┘
```

- `html, body { height: 100%; overflow: hidden }` on the shell. Each pane is `overflow: auto; overscroll-behavior: contain`. Fixes M7: the panes get native rubber-band in Safari and in the WKWebView wrapper, and the chrome never scrolls.
- The **player bar is global** once a night is loaded (or a song is auditioned): it shows on every page, as in Spotify. The Booth page becomes the *expanded* player: set list, tools and big clock.
- Between 640 and 1024 px (iPad portrait, small windows) the sidebar is an overlay (slides over with a scrim, swipe or ⌘⌃S). The inspector becomes a sheet at the medium detent.
- Under 640 px: the existing tab bar plus a mini player above it (`MiniPlayer.tsx`) that expands to the Booth.

### 4.2 Sidebar

- Sections: **Play** (Booth), **Prepare** (Compose, Library), **Know** (Database, History, Guide), then Settings pinned to the foot. On a Mac, Settings also opens with ⌘, as a window-modal sheet.
- Row: `--sidebar-row-h`, 13 px label (`text-subhead` on touch), icon 16 px. Selection is an accent-tinted capsule `rgb(var(--tint-rgb) / .18)` with the label in `--label`. It turns grey (`--fill-3`) when the window is not focused (`document.hasFocus()` → `data-window-inactive` on `<html>`).
- No hover fill on Mac (macOS source lists do not hover-highlight). On iPad with a trackpad: `--fill-4`.
- Collapse with ⌘⌃S or the toolbar button: the sidebar slides `x: -100%` with `spring.smooth`. The detail pane's `padding-left` animates with it (its `grid-template-columns` from `232px 1fr` to `0 1fr`, animated through `layout` on the shell). Its contents do **not** fade.
- When the night is live, the Booth row shows a live dot: a 6 px rose dot that pulses at 1.2 s while playing, is steady when paused, and is hidden under reduced motion. It turns cyan while the headphones are in use (§6).

### 4.3 Toolbar

- 52 px, fixed, `material-thin`, with a scroll-edge hairline that fades in once the pane below scrolls more than 0 px (existing `scroll-edge-top`).
- Title on the left in 15/600 (Mac) or 17/600 (iPad). On a Mac the large title does not collapse: the title *is* the toolbar title. iPad keeps the large-title collapse.
- Items are 28 px tall icon buttons with a hover bezel (`--fill-4` → `--fill-3`, 80/160 ms), with no scale and a tooltip after 600 ms (native delay). Primary action (Compose, Export) is a tinted capsule at the trailing end.

### 4.4 Inspector (the right column)

One slot, four contents: **Set list** (Booth), **Search** (Compose, Library), **Swap** (from a row), **Info** (the selected song: versions, BPM, key, era, energy, trim). It opens with ⌘⌥I or the toolbar button.

- Open: `panel("right")`, 320 px, and the detail pane narrows with `spring.smooth`. On iPad portrait it overlays.
- Changing content inside an open inspector cross-fades (125 ms out, 250 ms in, `y: 4 → 0`). The panel does not slide again.
- Width is drag-resizable 280–440 px (`col-resize` cursor on the 6 px edge, as Finder does). The width is stored in `localStorage`.

### 4.5 Desktop and iPad wrapper chrome (ROADMAP §9)

- macOS window: `titleBarStyle: hiddenInset` (or `NSWindow.titlebarAppearsTransparent` with `fullSizeContentView`). The traffic lights sit inside the sidebar. The sidebar's first 52 px is a drag region: `-webkit-app-region: drag` on `.toolbar`, `no-drag` on every control inside it.
- The wrapper sets `window.__TDJ_NATIVE__ = { platform: "macos" | "ipados", vibrancy: true }` and the class `html.native`. Under `html.native` the sidebar background is `transparent`, so the native `NSVisualEffectView(.sidebar)` shows through. The toolbar uses `.headerView` material.
- In a PWA, use Window Controls Overlay: `display_override: ["window-controls-overlay"]` and `env(titlebar-area-x/width/height)` for the toolbar padding.
- Full screen: the toolbar hides and reveals when the pointer reaches the top edge (`spring.smooth`, 0.35 s).
- The native menu bar is generated from `lib/commands.ts` (§7.3). The web UI never draws a fake menu bar.
- iPadOS 26: the same commands feed `UIMenuBuilder`, so the menu bar and the ⌘ HUD come for free.

---

## 5. Per-surface choreography

Format: **trigger** → what moves, with which token. *RM* is the reduced-motion fallback. *Audio* is the rule the visual must obey.

### 5.1 Navigation (sidebar and tab bar)

- **Click a sidebar row** → the selection capsule moves at once (`layoutId` with `duration: 0` on a Mac: macOS selection does not travel). On touch it uses `spring.snappy`. The detail pane swaps **instantly**. The new page's *content blocks that are already cached* show at once. Data still loading shows a **reserved-height skeleton** (§7.6), never an empty gap.
- **Δ** `PageTransition.tsx`: remove `mode="wait"` and the exit. Keep only a 125 ms opacity fade-in on the incoming pane, and only on touch (`isTouch()`). Mac: none.
- Prefetch every sidebar route on hover (`<Link prefetch>` is default; add `router.prefetch` on `pointerenter` for data loaders) so the swap has data.
- Scroll position is kept per pane (Mac apps remember it) instead of `scrollTo(0)` on every route change.
- *RM:* same (it is already a cut).

### 5.2 Sidebar and inspector collapse

- See §4.2 and §4.4. The collapse runs on `transform` only. The detail pane's width change uses `motion`'s `layout` on the grid container, which animates through a transform.
- Toggle button icon: `sidebar.left` style glyph, no animation.
- *RM:* panels fade in place over 125 ms. The detail pane reflows instantly.

### 5.3 Sheets and popovers

- **Sheet on a pointer device** → scrim 0 → 0.25 over 250 ms. Panel `scale: 0.98 → 1`, `opacity: 0 → 1`, `spring.sheet`. Close: 150 ms opacity with `ease.in`, no scale. Buttons at the bottom right: `[Cancel] [Primary]`. Return triggers primary and Esc triggers Cancel. Remove the top-left "Cancel" on pointer devices (**Δ** apple-native-pass §3.6, which stays right for touch).
- **Sheet on touch** → unchanged (detents, grabber, drag). Swap `SPRING.sheet` for `spring2.sheet` and carry the drag velocity into the settle (`spring.drag` with `velocity: info.velocity.y`).
- **Popover** → `popover(isPointer())`. Anchored to the trigger, with a 12 px arrow, `material-regular`, no scrim, closes on outside pointerdown or Esc, and focus returns to the trigger.
- *RM:* 125 ms fades and no scale.

### 5.4 Player bar: transport start / pause / resume / stop

| Moment | Visual | Audio rule |
| --- | --- | --- |
| **Start the night** (big button) | The button morphs into the Pause button with `layoutId`, `spring.snappy`. The **on-air indicator** (a rose dot plus "ROOM") fades in at 250 ms. The progress bar starts its CSS animation (§8.2). | The visual starts on the engine's `started` event, not on click. If the engine takes 300 ms to unlock, the button shows a 125 ms pressed state, then a determinate ring after 300 ms. |
| **Pause** (Space) | The glyph cross-fades play↔pause in 125 ms. Progress freezes by setting `animation-play-state: paused` at the engine's reported position. The title dims to `--label-2` over the length of the engine's pause fade (0.8 s). The on-air dot stops pulsing and turns hollow. | The visual dim follows the `--dur-crossfade` set from the pause ramp length. |
| **Resume** | The reverse of pause. The progress animation resumes after one resync to `currentTime`. | |
| **Stop (confirm)** | The Stop button press opens a **popover** anchored to it on a Mac with two choices, "Fade out and stop" (default, Return) and "Stop now". On touch it opens an action sheet. After a choice: a ring around the stop button drains over the fade length with `--ease-audio`, then the on-air dot goes out. | |
| **Mute / talk-over (duck)** | The master level readout steps down. A "Talk-over" capsule slides into the bar (`y: 8 → 0`, `spring.snappy`). | Same duration as the duck ramp. |

### 5.5 Track change (within a tanda)

- **Player bar** → the outgoing title and subtitle slide `y: 0 → -6` and fade out over 125 ms. The incoming slide `6 → 0` and fade in over 250 ms (`lineSwap`, existing). The artwork tile cross-fades. "k of n" dots: the next dot fills with `spring.snappy`.
- **Set list** → the playing-row marker (equaliser glyph and tinted background) moves to the next row with `layoutId="now-row"` and `spring.smooth`. The finished row's text drops to `--label-3` over 375 ms. If the new row is outside the visible part of the list and the DJ has not scrolled in the last 10 s, the list scrolls it into view (`scrollIntoView({ block: "nearest", behavior: "smooth" })`). It never scrolls while the pointer is over the list.
- *RM:* cross-fades only. The marker jumps.

### 5.6 Crossfade (and fade-out now)

- On `crossfadeStart(durationSec)` from the engine, set `--dur-crossfade` on the player bar. Two thin bars under the scrubber, outgoing (rose, shrinking) and incoming (rose, growing), animate `transform: scaleX` with `--ease-audio` for exactly that duration. Both titles are visible and overlap: the outgoing in `--label-2`, the incoming in `--label`. They swap at the midpoint.
- "Fade out now" (f): a ring around the play button drains over the fade length.
- *Audio:* never start the visual on the click. Start it on the engine's event, which carries the scheduled `AudioContext` time, and add the CSS `animation-delay` for `when - ctx.currentTime`.
- *RM:* the bars still run (they are informative), linear, at 10 fps.

### 5.7 Tanda change (the cortina and the next tanda)

The biggest moment of the night. It is choreographed in three beats:

1. **Cortina starts:** the player bar's artwork tile becomes the cortina tile (grey, `♪`). The eyebrow reads "Cortina · 0:45". The progress fill colour cross-fades from rose to `--label-2` over 250 ms. The set list collapses the finished tanda into one summary row ("Tanda 3 · Calo / Iriarte · played"): its height animates to 36 px with `layout` and `spring.smooth`, and its rows fade over 125 ms first.
2. **During the cortina:** the next tanda's header in the set list gets the **"Up next" rail**, a 3 px rose bar on its leading edge that grows top to bottom over the cortina's length (`--ease-audio`). This is the DJ's countdown.
3. **Next tanda starts:** the tanda number in the player bar ticks (`7 → 8`, the digits roll 6 px with `spring.land`). The orchestra line cross-fades. The energy chart's "now" marker moves to the next point with `spring.smooth` (§5.12).

*RM:* every step becomes a cross-fade. The rail fills linearly at 10 fps.

### 5.8 Skip tonight (per tanda)

- A **context menu** item "Skip tonight" (also ⌘⌫ on a selected tanda, and a button on the tanda's header row on hover).
- Skipping: the tanda's rows get `opacity: .45` and a strikethrough on the header over 250 ms. The tanda **does not collapse at once**: it holds for 1 s, then compresses to a 32 px "Skipped · Undo" row with `spring.smooth`, so the DJ sees what left. The following tandas move up with the same `layout` spring. The total time readout and "Time to La Cumparsita" re-count with a 250 ms number roll.
- A toast "Tanda 9 skipped tonight · Undo" (8 s, with Undo, ⌘Z).
- If the skipped tanda is the *next* tanda, the "Up next" rail jumps to the new next tanda (fade 125 ms, then grow).
- *RM:* opacity change and an instant reflow.

### 5.9 Jump to La Cumparsita

Two commands, as in round 21: "Play the rest, then La Cumparsita" and "Jump to La Cumparsita now".

- **Play the rest, then…** → no motion in the set list beyond a **flag**: the La Cumparsita row moves (`layoutId`, `spring.smooth`, one 375 ms move) to sit right after the current tanda's cortina. The tandas in between fade to `.45` and fold into one "Not tonight (5 tandas)" row. The Time-to-Cumparsita clock re-counts and turns rose.
- **Jump now** (destructive for the dancers) → a confirm popover with the default "Fade out and play La Cumparsita". It shows the fade length, as in 5.4. On confirm: the crossfade visuals (5.6), then the La Cumparsita row becomes the now-row. The "closing" eyebrow and the on-air dot stay on.
- The menu shortcut is ⌘⇧E ("End"), only after a confirm.
- *RM:* cross-fades and an instant move.

### 5.10 Swap sheet (row → replace a song or a tanda)

- **Wide screens:** swap opens **in the inspector**, not a modal, so the DJ sees the tanda being changed. **Compact:** a sheet at the medium detent.
- The source row gets the **selection** treatment (accent-tinted) while the swap is open. Candidates list: the current song pinned at the top ("Now in the set"), then suggestions, then the "AI pick" row (it shows a determinate "Thinking…" only after 300 ms, and never shows dots, per the anti-list).
- **Hover a candidate:** row actions fade in (80 ms): ▶ Cue (headphones), "Use". Space cues the selected candidate in the headphones (§6). ↑/↓ moves the selection and Return uses it.
- **Use** → the candidate row flies to the set list slot through a shared `layoutId` (title text only, `spring.smooth`). The old title in the set leaves with `lineSwap`. The new row flashes the save pulse (existing `cell-saved`, 500 ms, rose instead of green). Toast "Swapped · Undo".
- The search field at the top filters live (5.11).
- *RM:* cross-fade in place and no flight.

### 5.11 Search side panel (Compose and Library)

- **Open:** ⌘F or the toolbar magnifier → the inspector opens on Search (§4.4) and the field is focused at once. On compact screens it is a full-height sheet with the field focused and the keyboard up.
- **Filtering:** results update on every keystroke from the local index (Web Worker, debounce 0 ms for ≤ 20 k rows, 60 ms above). Results **never animate in or out per row** while typing, because that is churn. The list cross-fades as a whole, 80 ms, only when the result count changes by more than 50 %. Matched characters are in `--label` 600 weight and the rest in `--label-2`.
- **Facet chips** (Tango / Milonga / Vals, orchestra, singer, year range) sit under the field as a segmented control (rhythm) and token chips (others). Adding a token: the chip slides in from the field (`spring.snappy`, `x: -8 → 0`). Backspace in an empty field removes the last token, as in macOS Mail.
- **"In tonight" marker:** a result that is in the set shows "T7 · 2" (tanda 7, song 2) in a trailing tinted capsule. Hover or a click on it scrolls the set to that row and pulses it once (`cell-saved`).
- Rows can be dragged into a tanda (5.14). A right-click gives the context menu (5.15).
- *RM:* same, minus the token slide.

### 5.12 Era, energy, BPM and key indicator updates

- These are informational, so they change **in place**. A value changing (after a swap, a recompute or a Spotify enrichment) cross-fades the old value out (125 ms) and the new in (250 ms). Number ticks of up to 3 digits roll 6 px with `spring.snappy`. Colours cross-fade over 250 ms (`transition: background-color var(--dur-s) var(--ease-settle)`).
- **Energy chart (vertical, beside the set list):** the "now" marker moves point to point with `spring.smooth`. A recomposed curve morphs path to path over 375 ms only if both paths have the same point count. Otherwise it cross-fades. Never redraw on scroll.
- **Turning an indicator off in Settings:** the column fades over 125 ms, then the row reflows with `spring.smooth`. On again: the reflow happens first and the fade-in after. Nothing truncates the title more than it is truncated today (fix M15: indicators live in a trailing fixed-width column of at most 112 px, and the title gets `min-width: 40%` before the indicators shrink to icons only).
- Visual definitions: §6.4.

### 5.13 Toasts and errors

- **Toast:** bottom centre above the player bar. `toastIn` (existing) with `--d-slide` 12 px, `spring.snappy`. One at a time: a new toast replaces the old with a cross-fade, never stacks. Dwell `--dur-toast`. Hovering it pauses the timer. ⌘Z triggers its Undo.
- **Inline error** (field, connection test): the field ring turns `--destructive` over 125 ms and a footnote appears under it (height reserved, so nothing jumps). **No shake** on Mac. macOS shakes only the login window. An iPad may use a single 4 px shake for a wrong password field.
- **Playback errors** (missing file, Spotify drop): a **banner in the player bar**, not a toast. It slides down from under the bar's top edge (`y: -100% → 0`, `spring.snappy`), is amber (`--system-gold`), shows the action ("Skip to next" / "Find file…") and stays until resolved. Audio-critical errors also flash the on-air dot amber twice (2 × 250 ms).
- *RM:* fades.

### 5.14 Drag reorder (songs within a tanda, tandas within the night, search result → tanda)

- **Pointer:** the drag starts after 4 px of movement. The row lifts (`scale 1.03`, `shadow 0 8 24 / .25`, 125 ms) and follows the pointer 1:1. Other rows part with `layout` and `spring.smooth`. The drop target shows a 2 px tint **insertion line** with 6 px round end caps (Finder style). Dragging onto a tanda header highlights the whole tanda (`--fill-3`). Esc cancels: the row returns with `spring.drag`.
- **Touch:** a long press of 350 ms lifts the row. A selection haptic marks the lift. Edge auto-scroll starts in the top and bottom 48 px at a speed proportional to the depth.
- **Drop:** `spring.land` (one ≤ 2 px settle). The rules engine re-validates (tanda coherence). A drop that breaks a rule is **allowed** but the tanda's header gets an amber "Mixed orchestras" note that fades in, so the DJ's edit wins (ROADMAP §3).
- **Keyboard equivalent:** ⌥⌘↑ / ⌥⌘↓ moves the selected row (and announces "Moved to position 3 of 4" through an `aria-live` region).
- **Never during playback** for the *current* row, which is locked. The playing tanda's other rows can move. Moving a row before the now-row shows a popover asking "Play it next?".
- Implementation: `motion`'s `Reorder.Group` for one list. For cross-list moves, use pointer events plus `layoutId` (no new dependency). `Reorder` is fine for ≤ 30 items, and a tanda has 3–4 rows.

### 5.15 Context menus (new)

| Target | Items (groups separated) |
| --- | --- |
| Song row (set, search, database) | **Cue in headphones** (Space) · Play now in the room… (⌘↩) / Play next (⌥↩) · — · Swap… (⌘R) · Show versions (⌘I) · Find file… · — · Skip tonight · Pin (lock) · — · Copy "Title – Orchestra (Year)" |
| Tanda header | Skip tonight (⌘⌫) · Lock tanda · Swap tanda… · — · Move up / Move down · — · Show in energy chart |
| Cortina row | Cue in headphones · Change cortina… · Set length… |

- On a Mac the menu appears **instantly** at the cursor (no animation), with 24 px rows, 13 px text, the shortcut glyphs right-aligned in `--label-3`, and `material-thick` with a 0.5 px border. Choosing an item makes it blink twice (2 × 40 ms tint on/off), then the menu fades over 150 ms and the action runs at the start of the fade.
- On an iPad, a long press of 500 ms lifts the row (`--s-lift`). The rest of the list dims to 0.6. The menu springs from the row (`popover(false)`). An iPad with a trackpad: a two-finger click behaves as on the Mac.
- Keyboard: the ≣ menu key or ⇧F10 opens the menu for the selected row. Arrows and Return work inside the menu, and type-ahead selects by first letter.
- `Menu.tsx` keeps the anchored popover. The **Booth ••• becomes this popover on a pointer device** (fixes M5). It stays a sheet on a phone.

### 5.16 Database versions (ROADMAP §3)

- A song row expands to show its versions (years, orchestras) with a disclosure triangle. ⌘→ / ⌘← or a click expands and collapses. The children's height animates with `layout` and `spring.smooth`, and the triangle rotates 90° over 150 ms. On a Mac the expansion is instant if more than 10 children (Finder behaviour).
- Each version row has ▶ (cue in headphones by default during a night, or play in the room when the night is not running) and an era pip.
- Editing a value: double-click or Return enters edit mode (macOS rename behaviour). Esc reverts, Return or Tab commits, and the save pulse (`cell-saved`) confirms.

### 5.17 Settings with toggles (ROADMAP §6)

- On a Mac: ⌘, opens Settings as a **window-modal sheet** with a sidebar of panes (General, Player, Indicators, Connections, Models, Language, Motion). It does not navigate away from the current page. On iPad and phone: the Settings page as now.
- Switch: knob `spring.snappy`, track colour 125 ms. **The effect is live**: switching an indicator off updates the page behind the sheet at once (5.12). Toggles whose effect cannot be seen from the sheet show a one-line footer.
- Language switch (Turkish): the swap is instant. The whole UI re-renders in one frame and no text animates. Wider Turkish strings must not change any control's height. Test that rows stay one line at 30 px in `tr` (Turkish averages about 15 % longer than English, and "Ayarlar", "Kulaklık" and "Salon" fit). Use `lang="tr"` so `text-transform: uppercase` produces "İ" correctly. Section headers use `uppercase`, so this matters.

---

## 6. Room vs headphones: the visual language

The DJ must never have to think "where is this going?". Five channels say it at the same time. Losing any one of them still leaves four.

| Channel | **Room** (what the dancers hear) | **Headphones** (pre-listen, only the DJ) |
| --- | --- | --- |
| Colour token | `--room`: rose `#E0557A` dark / `#C9426A` light (the app tint) | `--cue`: cyan `#64D2FF` dark / `#0071A4` light (Apple systemCyan; 4.6:1 on white) |
| Glyph | speaker `Volume2` filled | headphones `Headphones` |
| Label | "ROOM" (Turkish "SALON") | "HEADPHONES" (Turkish "KULAKLIK") |
| Fill pattern | solid progress fill | **diagonal stripes** on the cue progress (`repeating-linear-gradient(135deg, var(--cue) 0 6px, transparent 6px 10px)`), which also works in greyscale and for colour-blind users |
| Place on screen | the player bar's centre (transport) and the now-row in the set | a separate **Cue strip** docked *above* the player bar, inset 12 px, never inside it |
| Liveness | on-air dot: solid rose, pulsing 1.2 s while playing | a cue strip that is present only while a cue exists |

### 6.1 Cue strip (new component `CueStrip.tsx`)

```
┌──────────────────────────────────────────────────────────────────┐
│ 🎧 HEADPHONES  Ninguna · Calo / Iriarte 1942  ▮▮▮▯▯▯▯ 0:42 / 2:56  ▶❚❚  ✕ │   ← cyan, stripes, 48 px
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ ● ROOM  Agua Florida · D'Agostino 1941   ⏮ ❚❚ ⏭  ━━━━━━━━━━  🔈 Room ▾ 🎧 Cue ▾ │  ← player bar
└──────────────────────────────────────────────────────────────────┘
```

- **Appear:** it slides up from behind the player bar (`y: 100% → 0`, `spring.snappy`, clipped by the bar). It pushes nothing and floats over content, and the content pane gets matching bottom padding through the same `layout` transition, so the last row stays reachable.
- **Its own transport:** play/pause, scrub (drag), a ±10 s nudge (← → while the cue strip has focus), and close (Esc, ✕). Scrubbing the cue never touches the room.
- **Disappear:** the strip slides down over 250 ms. The cued row loses its cyan edge over 125 ms.
- The **cued row** in any list: the number column is replaced by the headphone glyph in `--cue`, there is a 3 px cyan leading edge, and an inline striped mini-progress runs under the title. The **room row**: an animated equaliser glyph in `--room` with a tinted background. A row can be both (the DJ cues the song that is playing): both edges stack, cyan inside rose.
- **The sidebar Booth dot** turns into a split dot (half rose, half cyan) while a cue is active. Mini player on phones: a cyan headphone badge.

### 6.2 Output picker (popover)

- Two rows: **Room output** and **Headphones output**, each a menu of `navigator.mediaDevices.enumerateDevices()` audio outputs, chosen with `selectAudioOutput()` where available.
- Each row shows a live 4 px level meter in its own colour, so the DJ can *see* which device is getting sound.
- **Safety rules (engine side, visible in UI):**
  1. If the headphones device equals the room device (same `deviceId` or both "default"), cue is **disabled**. The cue button shows a slashed headphone glyph and the tooltip "Choose a headphones output that is not the room". Playing a cue is impossible, not merely discouraged.
  2. If `HTMLMediaElement.setSinkId` and `AudioContext.setSinkId` are both unsupported (WebKit-based browsers today, including iPad Safari), cue is disabled with "Headphone pre-listen needs Chrome or Edge, or the TDJ app". In the macOS/iPadOS wrapper the native layer routes the cue to the second device.
  3. When a device disappears (headphones unplugged), the cue stops **at once** (it never falls back to default output, which is the room). A banner reads "Headphones disconnected · cue stopped".
- **Fixes M13:** the round-21 audition path must go through the cue output. While a night is live and no separate cue output exists, "tap to test" is disabled and the row shows "Cue unavailable".

### 6.3 Tap any song: what the tap does

| State | Single tap / click | Double-click / Return | Space | ⌘↩ |
| --- | --- | --- | --- | --- |
| Night not started | Select | Play in room (rehearsal) | Cue in headphones (or room if no cue device, labelled "ROOM") | Play in room |
| Night live | Select | **Cue in headphones** (never the room) | Cue in headphones | "Play now in the room…" confirm popover: "Fade current song (3 s) and play *Ninguna* in the room" [Cancel] [Play in room] |
| Night live, touch | Select, and the row shows its trailing 🎧 and ▶ buttons | — | — | Long press → context menu |

The room is never one accidental tap away during a night. Pre-listen always is.

### 6.4 Indicator visuals (energy, BPM, key, era)

| Indicator | Visual | Colour |
| --- | --- | --- |
| **Energy** (0–100) | A 3 × 14 px vertical bar in the row's trailing column, plus the number on hover or in the Info inspector. Tanda header: a 5-point sparkline. Booth: a **vertical energy chart** beside the set list, with time running down so it aligns with the rows, and a "now" marker. | Sequential: `--energy-lo` `#5E7CE2` → `--energy-hi` `#F2994A`, interpolated with `color-mix(in oklch, …)`. This avoids rose (room) and cyan (cue). |
| **BPM** | Tabular number, `text-caption1`, `--label-2`. ±6 % from the tanda's median is shown in `--system-gold` (a tempo jump). | Neutral by default |
| **Key** | Camelot code ("8A") in a 22 px capsule tinted with the Camelot wheel colour (the 12 hues of the industry wheel, A = lighter, B = darker). A capsule turns into an outline when the key clashes with the previous song's key (more than one step on the wheel). | Camelot wheel |
| **Era** | A 10 px **pip** before the year: **best** filled gold `#E8B85A` · **good** filled `--label-2` · **weak** half-filled `--label-3` · **outside** hollow ring. Shape and fill differ as well as colour. A legend popover sits on the column header ("Era ⓘ"). | Gold is reserved for the era pip and the lock. The lock is a glyph, never a pip. |

Every indicator has a Settings switch (§5.17). Under reduced transparency or high contrast (`prefers-contrast: more`), capsules get a 1 px `--label-3` border.

---

## 7. Native-feel checklist

### 7.1 Cursor and hover

- [ ] Arrow cursor on every control. `pointer` only on real links that leave the app (Guide links, Spotify). Already done, but audit the new components.
- [ ] `col-resize` on panel edges, `grab`/`grabbing` on drag handles only while dragging (Finder shows the arrow until the drag starts).
- [ ] Hover reveals row actions (80 ms in, 160 ms out). No hover fill on list rows on a Mac. Toolbar items get a bezel.
- [ ] Tooltips (`title` is not enough: build `Tooltip.tsx`) after 600 ms of hover, instant for 1.5 s after one has shown (macOS "tooltip warm"), 11 px on `material-thick`. Include the shortcut: "Pause  Space".

### 7.2 Focus rings

```css
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgb(var(--tint-rgb) / 0.5);   /* macOS halo; follows border-radius */
  border-radius: inherit;
  transition: box-shadow var(--dur-instant) var(--ease-settle);
}
/* rows and cells: the ring sits inside so it is never clipped by the list */
.cell:focus-visible, .menu-item:focus-visible, .side-row:focus-visible {
  box-shadow: inset 0 0 0 3px rgb(var(--tint-rgb) / 0.5);
}
/* the cue world keeps its own ring colour */
[data-output="cue"] :focus-visible { box-shadow: 0 0 0 3px rgb(100 210 255 / 0.55); }
@media (forced-colors: active) { :focus-visible { outline: 2px solid CanvasText; } }
```

- [ ] Lists are one tab stop. Arrows move inside them (roving `tabindex`). Home/End go to the ends and type-ahead selects. This matches macOS table views.

### 7.3 Keyboard shortcuts (`lib/commands.ts`, new)

One registry: `{ id, title, titleTr, keys: "⌘F", when: (ctx) => boolean, run }`. It feeds the context menus, the ••• menus, tooltips, the Shortcuts sheet (?), the native menu bar and an `aria-keyshortcuts` attribute on every button.

| Keys | Command | Scope |
| --- | --- | --- |
| Space | Play/pause (Booth). When a list row is selected and the night is live: cue the row in the headphones | global, not in fields |
| ⌘→ / ⌘← | Next / restart song (room) | global |
| ⌥Space | Play/pause the **cue** | global |
| Esc | Close the popover, sheet or cue strip, in that order. Stop confirm only when nothing else is open (already) | global |
| ⌘F | Search panel | Compose, Library, Database |
| ⌘K | Command palette (every command by name; Turkish titles included) | global |
| ⌘1 … ⌘7 | Sidebar destinations | global |
| ⌘⌃S / ⌘⌥I | Toggle sidebar / inspector | global |
| ⌘, | Settings | global |
| ⌘Z / ⇧⌘Z | Undo / redo (swap, skip, reorder, edit) | global |
| ⌘R | Swap selected | lists |
| ⌘⌫ | Skip tonight (tanda) | Booth, Compose |
| ⌥⌘↑ / ⌥⌘↓ | Move selected row | lists |
| ⌘I | Info inspector for the selection | lists |
| ⇧⌘E | Jump to La Cumparsita… (confirm) | Booth |
| ? | Shortcuts sheet | global |

The single-letter Booth keys (f, x, h, t, c, b, m) stay for DJs used to them. They are listed in the sheet and **disabled while a list row has focus**, so type-ahead works. On Windows and Linux, ⌘ shows as Ctrl.

### 7.4 Context menus

See §5.15. Every row and header. `onContextMenu` calls `preventDefault()` only on those targets, so text fields keep the system menu (spelling, paste).

### 7.5 Selection

- [ ] `user-select: none` on the shell (sidebar, toolbar, player bar, buttons, row labels, section headers). `text` on Guide body, notes and error messages, so they can be copied (fixes M6).
- [ ] Selected row: `--tint` fill at 0.9 with white text when the pane has focus, `--fill-2` when not (macOS key/non-key). ⇧-click selects a range and ⌘-click toggles one row (multi-skip, multi-move).
- [ ] `::selection { background: rgb(var(--tint-rgb) / .35) }`.

### 7.6 Scroll physics and layout stability

- [ ] Panes scroll and the window does not (§4.1). `overscroll-behavior: contain` on panes gives rubber-band inside them. Remove `overscroll-behavior-y: none` from `body` once the shell owns scrolling.
- [ ] `scrollbar-gutter: stable` on panes, so content does not shift when a scrollbar appears. `scrollbar-width: thin` plus macOS overlay scrollbars.
- [ ] **CLS budget 0.02** (from 0.21). Every async block reserves its height: Library list `min-height: calc(var(--row-h) * 12)`, the composer result header has a fixed height, images and tiles have explicit sizes, and fonts use `size-adjust` fallbacks. A Playwright check in `apps/web/e2e`: `layout-shift` sum < 0.05 across the sidebar walk.
- [ ] No content jump when a toast, banner, cue strip or indicator appears: they overlay or animate their space with `layout`.
- [ ] `content-visibility: auto; contain-intrinsic-size: auto var(--row-h)` on long lists (Library 19 k rows, Database). Long lists over 500 rows are virtualised.

### 7.7 Haptics (twins)

`haptics.ts` stays as it is for Android. Add an `impact(kind: "selection" | "light" | "success" | "warning")` API that the wrapper maps to `UIImpactFeedbackGenerator` / `NSHapticFeedbackManager` (Force Touch trackpad: `.alignment` on snaps and `.levelChange` on detents). Fire points: drag lift and drop (selection), detent change (light), skip/swap success (success), cue blocked (warning). They are not tied to reduced motion. The new Settings → "Haptics" switch controls them.

---

## 8. Performance and audio safety budgets

### 8.1 Budgets

| Metric | Budget | Today |
| --- | --- | --- |
| Frame rate during playback, Booth open, on an M1 Air and an iPad (A14) | 60 fps steady, no frame > 16.7 ms during a crossfade | not measured, risk M11 |
| Long tasks (> 50 ms) while `state === "playing"` | **0** | 2 seen during navigation (M3) |
| React commits per second while playing | ≤ 2 (one per second for clocks) | ≈ 30 (M11) |
| CLS across the sidebar walk | < 0.05 | 0.21 / 0.15 (M1) |
| Interaction to next paint (sidebar click, row click, Space) | < 100 ms | sidebar 1.4–2.3 s to settled (M2) |
| Audio underruns (`AudioContext` `playbackStats` where available, otherwise `onstatechange`/drift) | 0 in a 4 h soak | — |

### 8.2 Rules

1. **Clocks off React.** Replace the 30 fps `useBooth.setState({ position, remaining, meter, drift })` (M11) with:
   - Progress: one CSS animation per item, `@keyframes progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }`, `animation-duration: <length>s`, and a negative `animation-delay: -<position>s` set on track start, pause, resume, seek and **once per second** resync, when drift exceeds 100 ms.
   - Clocks (remaining, Time to La Cumparsita): a `useSyncExternalStore` on a 1 Hz ticker. Text changes once per second, which is what a clock needs.
   - Meter: read the analyser inside the meter's own rAF (it already does). Cache the colours once per theme change (fix the per-frame `getComputedStyle`, M11) and draw with `OffscreenCanvas` in a worker where supported.
2. **Animate only `transform` and `opacity`** (and `background-color` for 250 ms colour cross-fades on ≤ 20 elements). Never `width`/`height`/`top`. `layout` animations are transform-based, so they are allowed. Never animate `backdrop-filter` (existing rule).
3. **`will-change` only while animating** (set on `onAnimationStart`, cleared on complete). The existing `Sheet` sets `willChange: transform` permanently, so keep it only during drag.
4. **Audio context:** `new AudioContext({ latencyHint: "playback" })` (M12). The larger buffer gives the engine 40–80 ms of slack against main-thread stalls. TDJ has no live-latency need, since fades are scheduled.
5. **Schedule ahead:** every fade, crossfade and cue start is an `AudioParam` automation scheduled ≥ 150 ms ahead, on the audio clock. The UI's click handler only *requests* it. Any visual starts from the engine's event plus the scheduled time (§5.6).
6. **No heavy work on the main thread during playback:** search filtering, energy recompute, rules validation after a drop, Spotify enrichment and JSON parsing of the index all run in the existing `workers/` or a new `search.worker.ts`. Any main-thread task during playback is chunked under 8 ms with `scheduler.yield()` (fallback `setTimeout(0)`).
7. **Route changes during playback** must not re-create the engine or the player bar. The player bar lives in the root layout, outside `PageTransition`.
8. **Under memory pressure** (iPad), pause the meter and the equaliser glyph animations when `document.hidden`. The audio continues.
9. **Gate in CI:** a Playwright performance test plays a 2-minute rehearsal on the Booth with `--enable-precise-memory-info`, collects `longtask` entries and asserts there are none during playback. It also asserts React commit count ≤ 3/s using the React profiler build flag.

---

## 9. Dark and light

- Dark is the booth default (a dim room). The Booth page follows the theme but offers **"Booth always dark"** (Settings → Player, default on): `[data-booth] { color-scheme: dark }` scope override.
- Every token in §6 has a light and a dark value with contrast ≥ 4.5:1 for text and ≥ 3:1 for the glyphs and the striped fill against its background. `--cue` light `#0071A4` and `--room` light `#C9426A` are both ≥ 4.5:1 on white.
- Materials in light: `material-thin` over the grouped background, with a 0.5 px `--separator` border on glass so the bars do not dissolve on white.
- The theme switch keeps the 250 ms `.theming` cross-fade (existing). It never runs while a crossfade is running: queue it to the end of the fade.
- A new Settings → **Motion** group: "Reduce motion" (Follow system / On), "Haptics" (On/Off), "Animated playing indicator" (On/Off). The values write `data-motion` and `data-haptics` on `<html>`.

---

## 10. Implementation notes per file

Paths are under `apps/web/src`. "New" means a new file. The engineer owns all edits. This doc changes no code.

### `lib/motion.ts`
- Add `spring2`, `hover`, `menuOut`, `popover()`, `panel()` (§3.7). Alias the old springs to the new ones after the migration.
- Add `useAudioVisual(eventTime: number, durationSec: number)`, a hook that returns `{ style: { animationDuration, animationDelay } }` computed from `ctx.currentTime`.

### `app/globals.css`
- Tokens in §3.2–3.6 under `:root`. Reduced-motion block per §3.5 (replaces l.149–156).
- `:focus-visible` per §7.2 (replaces l.234–237).
- `.app-shell` grid. `body` overflow and overscroll per §4.1 and §7.6.
- `user-select` rules per §7.5.
- New utilities:

```css
@utility row-actions {
  opacity: 0;
  transition: opacity var(--dur-hover-out) var(--ease-settle);
  .cell:hover &, .cell:focus-within &, .cell[aria-selected="true"] & {
    opacity: 1; transition-duration: var(--dur-hover-in);
  }
  @media (hover: none) { opacity: 1; }
}
@utility cue-stripes {
  background: repeating-linear-gradient(135deg, var(--cue) 0 6px, rgb(from var(--cue) r g b / .35) 6px 10px);
}
@keyframes progress { from { transform: scaleX(0) } to { transform: scaleX(1) } }
.progress-fill { transform-origin: left; animation: progress linear both; animation-play-state: var(--play, running); }
@utility press {
  transition: transform var(--dur-xs) var(--ease-settle), background-color var(--dur-xs) var(--ease-settle);
  &:active { transform: scale(var(--s-press-touch)); background: var(--fill-1); }
}
```

### `components/PageTransition.tsx`
- Remove `mode="wait"` and the exit variant. On touch only, run a 125 ms opacity fade-in of the incoming pane. Drop `scrollTo(0)` in favour of per-pane scroll restoration (§5.1).

```tsx
const pointer = useMediaQuery("(hover: hover) and (pointer: fine)");
return pointer ? <>{children}</> : (
  <motion.div key={path} initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { duration: 0.125 } }}>{children}</motion.div>
);
```

### `app/layout.tsx` (with a new `components/AppShell.tsx`)
- `AppShell` owns the grid (sidebar | toolbar + detail | inspector, player bar). The **player bar and cue strip are rendered here**, outside `PageTransition` (§8.2 rule 7).
- `html.native` and `data-window-inactive` (blur/focus listeners).

### `components/Nav.tsx`
- Sidebar sections, `--sidebar-row-h`, the accent selection capsule, the inactive-window grey, no hover fill on pointer. `layoutId="side-pill"` with `transition={isPointer ? { duration: 0 } : spring2.snappy}`. The live dot (rose/cyan/split). Collapse with `panel("left")`. Hover-prefetch.

### `components/PageHeader.tsx` (with a new `Toolbar.tsx`)
- On pointer devices the title renders into the fixed toolbar (no large-title collapse). `-webkit-app-region: drag` on the toolbar, `no-drag` on its children.

### `components/Sheet.tsx`
- Pointer: bottom-right button row (`[Cancel] [Primary]`, Return/Esc), no top-left Cancel, enter `scale .98→1` with `spring2.sheet`, exit opacity 150 ms. Touch: keep the detents and carry the drag velocity: `animate(y, 0, { ...spring2.drag, velocity: info.velocity.y })`. Set `willChange` only during drag.

### `components/Menu.tsx` (and a new `components/ContextMenu.tsx`)
- `popover(isPointer())` variants. 24 px rows on pointer, shortcut glyphs from `lib/commands.ts`, group separators only. The 2-blink selection then `menuOut`. Roving focus, type-ahead.
- `ContextMenu`: a `useContextMenu(target, items)` hook. `contextmenu` on pointer, a 500 ms long press with `--s-lift` on touch. The menu is positioned at the cursor and flipped to stay in the viewport.
- Booth `•••` on a pointer device → `Menu` popover, not `Sheet` + `MenuList` (`app/booth/page.tsx` l.312).

### `components/booth/*` (player re-organisation, ROADMAP §1)
- **New `PlayerBar.tsx`** (global, 72 px glass): leading — artwork tile, title/eyebrow (`lineSwap`), on-air dot + "ROOM". Centre — ⏮ ❚❚ ⏭, Stop, the scrubber with `.progress-fill`, crossfade bars (§5.6). Trailing — Output popover (§6.2), Cue button, Cortina and Master faders (from `ControlStrip`), Mix…, •••.
- `NowCard.tsx`, `NextCard.tsx`, `TimeCard.tsx` → the expanded Booth's header band above the set: the big clock "Time to La Cumparsita" and the next tanda. Keep their content, drop `position` subscriptions (1 Hz clock hook).
- `SetColumn.tsx` → `SetList.tsx` with roving focus, the selection model, row actions, the `layoutId="now-row"` marker, tanda collapse after play (§5.7), the Up-next rail, the skip treatment (§5.8), drag reorder (§5.14) and the context menu.
- **New `CueStrip.tsx`** and **new `EnergyColumn.tsx`** (vertical chart aligned to rows, §6.4).
- `ControlStrip.tsx` → retire after `PlayerBar` lands. On phones the five-button row becomes the expanded mini player's transport.
- `Meter.tsx`: cache colours on theme change. Draw at 30 fps through `OffscreenCanvas` where available.

### `lib/booth/store.ts` and `engine.ts` (engine owner)
- `latencyHint: "playback"`.
- A **cue path**: a second `AudioContext` or a `MediaElementAudioSourceNode` into an `<audio>` with `setSinkId(cueDeviceId)`. Refuse when `cueDeviceId === roomDeviceId`, stop on `devicechange` if the device is gone (§6.2). Move `auditionItem` onto it (M13).
- Emit events with audio times: `trackStart {i, at, length}`, `crossfade {at, sec}`, `pause {at, ramp}`, `cue {i, at, length}`. Drop the 30 fps `position` writes (§8.2).

### `components/SwapSheet.tsx` (with a new `components/Inspector.tsx`)
- `Inspector` hosts Set / Search / Swap / Info, with `panel("right")`, a resizable edge and content cross-fades (§4.4). `SwapSheet` renders inside it on wide screens and stays a `Sheet` on compact. Selection, Space-to-cue, Return-to-use, and the shared-`layoutId` title flight into the set (§5.10).

### `components/SearchField.tsx` (with a new `components/SearchPanel.tsx` and `workers/search.worker.ts`)
- ⌘F focus. Token chips (rhythm segmented, orchestra/singer/year tokens, Backspace removes the last one). Results from the worker. The whole-list 80 ms cross-fade rule. The "T7 · 2" in-tonight capsule. Draggable rows.

### `components/TrackRow.tsx`, `TandaCard.tsx`
- The trailing indicator column ≤ 112 px, the title `min-width: 40%` (M15). `row-actions`. Context menu. Era pip, Camelot capsule, energy bar per §6.4, each behind its Settings toggle.

### `components/Toast.tsx`, `GlobalToast.tsx`
- Replace rather than stack. Hover pauses. ⌘Z runs Undo. Position above the player bar (read `--player-h`).

### `components/ui.tsx` / `Form.tsx`
- Segmented control: `inline-grid; grid-auto-flow: column; grid-auto-columns: 1fr` so the track hugs the segments (M9). Thumb `spring2.snappy`. Switch knob `spring2.snappy`.

### New `lib/commands.ts`, `lib/platform.ts`, `components/Tooltip.tsx`, `components/CommandPalette.tsx`
- §7.3, §3.6, §7.1. The palette uses `popover` motion, opens centred, 600 px wide, results update without per-row animation.

### `lib/haptics.ts`
- Add `impact(kind)` with the wrapper bridge (`window.webkit?.messageHandlers?.haptic?.postMessage(kind)`). Gate on `data-haptics` and not on reduced motion (§7.7).

### i18n (Turkish)
- All new strings go through the existing message layer with `tr` entries: SALON, KULAKLIK, "Bu gece atla" (Skip tonight), "La Cumparsita'ya geç" (Jump to La Cumparsita), "Kulaklıkta dinle" (Cue in headphones), "Salonda çal" (Play in room). Set `<html lang>` from the setting so the uppercase İ/I rules apply.

---

## 11. Implementation order

1. Clocks off React, `latencyHint`, meter colour cache (§8.2). These are safety work and must land before any new motion.
2. The cue path and the room/headphones language (§6). Audition goes through cue. The safety rules.
3. AppShell: panes scroll, fixed toolbar, global player bar, no `mode="wait"`, CLS reservations.
4. Commands registry, context menus, Booth ••• as a popover, focus ring, selection model.
5. SetList (now-row, tanda change, skip, Cumparsita), crossfade visuals.
6. Inspector, search panel, swap in the inspector, drag reorder.
7. Indicators with toggles, Settings sheet with Motion/Haptics, Turkish.
8. Wrapper chrome (traffic lights, vibrancy, menu bar, haptics bridge).

After each step: `pnpm --filter @tdj/core test`, `cd apps/web && pnpm e2e`, the performance test (§8.2 rule 9), then `pnpm media` to regenerate README captures (CLAUDE.md).

## 12. Acceptance checks

- [ ] From a metre away in a dark room, a tester names room vs headphones correctly 10/10 times in greyscale screenshots.
- [ ] During a live night, no single tap or click sends audio to the room. Only ⌘↩ plus a confirm, or the transport, does.
- [ ] Unplugging the headphones during a cue: silence in the room, banner shown.
- [ ] Sidebar click → new pane painted in < 100 ms (cached data) on an M1. CLS < 0.05.
- [ ] 4 h soak with the Booth open: 0 underruns, 0 long tasks during playback, ≤ 3 React commits/s.
- [ ] Every command is reachable by keyboard and listed with its shortcut. Right-click works on every row.
- [ ] Reduced motion: nothing translates or scales, the audio-progress visuals still move, and haptics follow their own switch.
- [ ] Turkish: no row wraps at 1180 px, uppercase "İ" is correct.
