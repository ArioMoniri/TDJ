# Performance budget

The composer is judged on a phone first. Every change to `apps/web` keeps the numbers below, measured with the
probe against a local production build:

```sh
cd apps/web && pnpm build && pnpm start          # in one terminal
TDJ_URL=http://localhost:3000 pnpm --filter @tdj/web perf   # in another (needs Chromium at /opt/pw-browsers/chromium)
```

`pnpm --filter @tdj/web perf` without `TDJ_URL` probes the deployed site. The probe (`apps/web/scripts/perf-probe.ts`)
loads `/`, presses **Compose the night**, waits for `#result` plus three seconds, scrolls, and prints one JSON line per
device: a 1440 × 900 desktop at native speed and an iPhone 15 Pro at 4× CPU throttling.

## Budget

| Metric (per run)                            | Phone, 4× CPU | Desktop, 1× |
| ------------------------------------------- | ------------- | ----------- |
| Longest long task during/after compose      | < 250 ms      | < 120 ms    |
| Long tasks, total                           | < 900 ms      | —           |
| Compose → result on screen, minus the API   | < 1.5 s       | —           |
| Scroll frame time, p95                      | ≤ 17 ms       | ≤ 17 ms     |
| DOM nodes after a 4 h compose               | < 2 500       | < 2 500     |
| JS transferred for `/` (modern browsers)    | ≤ 260 KB      | ≤ 260 KB    |

The API itself (`/api/compose`, ~0.8 s locally for 4 h) is engine time and is reported separately by the probe as
`composeMs` minus the request; the budget is about what the browser does with the answer.

## Where the numbers come from (and what keeps them)

- **Cards and rows are memoised and subscribe narrowly.** `TandaCard` / `TrackRow` are `React.memo`; the composer
  hands them stable callbacks (`onSwap(i)`, `onSwapTrack(i, k)`, `onLock(i)`), a row subscribes to its own song patch
  and its own playing state (not the whole player store, which ticks 4× a second), and `effectiveSong` /
  `cohesionFor` are cached per song/tanda object + patch identity. One swap re-renders one card, not 88 rows.
- **Layout animations only on the card being touched.** `layout` on every card and `layout="position"` on every row
  made motion measure 110 elements per render. Now only the card being swapped or just locked passes
  `animateLayout`; everything else renders with `layout={false}`.
- **The result renders from a deferred value.** `Composer` renders the set from `useDeferredValue(playlist)`: the
  22-card render is time-sliced (React yields to input and paint) and commits once, so the e2e contract (every card
  is in the DOM the moment `#result` is visible) holds without a 2 s task. Cards also carry
  `content-visibility: auto` with an intrinsic size, so the browser lays out and paints only the ones near the fold.
- **The set-up form is a memoised component** (`SetupForm`): it re-renders on option changes only, never while a
  result mounts, and stays folded under the summary row once a set exists.
- **No animated blur.** The ambient wallpaper is static radial gradients; the former `filter: blur(80px)` layers with a
  28 s transform drift are gone. Material blur radii are capped at 20 px, and glass (backdrop-filter) is used only
  on the control layer: tab bar, header pill, sidebar, sheets, menus, toast, mini player, compose accessory bar.
  Sheets drop their blur while the spring runs (`glass-settling`).
- **Fewer DOM nodes per row.** The glyphs a set repeats 100+ times come from one SVG `<symbol>` sprite
  (`components/Icons.tsx`): 2 nodes per icon instead of 3–7. Phone-only and desktop-only controls render by media
  query (one shared `matchMedia` per query via `useSyncExternalStore`) instead of both being in the DOM and CSS-hidden.
  Energy bars and title nudges are CSS transitions/keyframes rather than `motion` values (one motion element per row).
- **Lazy code.** The export sheet, Mood check, Listen embeds, Find-on-services and Audio-details sheets, the vinyl and
  the compose-narrative Lottie (65 KB chunk + 1.2 MB WASM) load on first use through `next/dynamic`; the Lottie-based
  pieces mount only at the breakpoints where they are visible.
- **Smaller, cacheable payloads.** `/api/compose`, `/api/swap` and `/api/swap-track` drop `audio.chroma` (the one
  field no view reads; History already stripped it). `/api/meta` is served with `Cache-Control` so the composer,
  Library and Database pages share one copy. History writes to IndexedDB in idle time after the result has painted.
- **Reduced motion is unchanged**: the probe runs with motion on; the e2e `motion.spec.ts` checks the reduced path.

## Results

Same machine, local production build, best of three probe passes after the change (the baseline is the live site as
measured before the work; the "before" column for the local build is the first local probe of the unchanged code).

| Metric                              | Phone 4× before (live / local) | Phone 4× after | Desktop before (live / local) | Desktop after |
| ----------------------------------- | ------------------------------ | -------------- | ----------------------------- | ------------- |
| Longest long task                   | 2 481 / 2 206 ms               | **214 ms**     | 436 / 327 ms                  | **91 ms**     |
| Long tasks, total                   | 3 979 / 3 603 ms               | 1 203 ms       | 592 / 563 ms                  | **143 ms**    |
| Compose → `#result` (incl. ~0.8 s API, +3 s probe wait) | 7.4 / 6.3 s | 4.8 s      | 5.5 / 3.9 s                   | 3.9 s         |
| Scroll frame p95                    | 26 / 39 ms                     | 45 ms          | 21 / 19 ms                    | **17 ms**     |
| DOM nodes after compose             | — / 5 141                      | 3 403          | 4 374 / 4 373                 | 3 424         |
| `/api/compose` for 4 h              | 112 KB                         | 104 KB         | 105 KB                        | 99 KB         |

What is still above budget on the phone, and why:

- **Long-task total (~1.2–1.4 s at 4×).** What remains is the page's own start-up: first layout of the server HTML
  (~100 ms), module evaluation of react-dom + motion (~190 ms), two hydration tasks (shell ~200 ms, lazily hydrated
  form ~230 ms) and the result commit itself (~130 ms + ~90 ms layout). The compose-time tasks are all under 250 ms.
  The next step would be shrinking what hydrates (the three navigation variants and the form's motion elements) or
  moving the form to a server-rendered island with a lighter client.
- **Scroll p95 (~45–55 ms at 4×, software-rendered headless Chromium).** A plain page (`/guide`) measures 20–23 ms
  on the same setup, so the floor is the harness; the composer adds the first layout of cards as they become
  relevant (`content-visibility: auto`) and the glass bars' backdrop blur (~6–8 ms per frame when measured with
  `backdrop-filter: none`). The app's own per-frame work is now zero: scroll handlers neither enter React nor read
  layout unless the tab bar flips.
- **DOM nodes (~3 400).** Each card is ~115 nodes (4 rows × ~20 + header); the folded set-up form (~400 nodes) stays
  mounted because the e2e contract reads its controls while folded. Reaching 2 500 would need the form unmounted or
  the rows redesigned around fewer elements.
