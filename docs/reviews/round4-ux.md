# TDJ round 4: UX review of the Apple-native pass (live build)

Reviewed: https://d3k5k2c1l0s5ri.cloudfront.net on 2026-10-19, Chromium via Playwright. Desktop 1440×900 light and dark, tablet 820×1000, iPhone 15 Pro (393×659 CSS px, 3×, touch). 140 captures live in `/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/uxreview/` and are cited by file name (`d-` desktop, `t-` tablet, `m-` phone; `-dark`/`-light`). Intent documents: `docs/design/apple-native-pass.md`, `docs/design/motion-system.md`. Code read: every file in `apps/web/src/components/`, `apps/web/src/app/**/page.tsx`, `globals.css`, `lib/motion.ts`, `lib/hooks.ts`.

Note on `/?slow=1`: `testSlowdownMs()` only fires on `localhost`, so on the live host the compose round-trip is ~0.7 s and the four-step narrative is rarely on screen for more than one step. Loading captures were taken at 350 ms intervals instead; see §5.

---

## 0. Verdict in six lines

1. The pass landed. The app now reads as an iOS/macOS grouped-list app in both themes: large titles, inset groups, 44 pt cells, hairline separators, green switches, joined steppers, segmented controls with a sprung thumb, a sidebar on desktop, a glass tab capsule that minimises on scroll, sheets with detents, swipe actions, a `•••` menu. The old "web dashboard" smell is gone (`d-dark-compose-empty`, `d-light-compose-empty`, `m-dark-compose-top`, `d-dark-settings-full`).
2. One blocking phone bug: every tanda card is 440 px wide inside a 361 px column, so the energy number, "target", lock glyph and the right edge are clipped on every card (`m-dark-tandas`, `m-light-tandas`, `m-dark-tanda-swipe`). It is a one-class fix in `Composer.tsx` (§7, P0-1).
3. The result is the hero but it sits ~1,700 px below the form on desktop and ~2,600 px on phone; after the first compose, every later look at the set starts with a scroll past the whole form (`d-dark-compose-form-with-set`). Needs a collapsed "set-up summary" once a set exists (P1-1).
4. Three Form regressions read as web: Settings tiles rendered on the trailing side (`d-dark-settings-full` Region, Theme), picker values rendered grey although the code asks for tint (CSS specificity), and stepper rows truncating their own label on phones and tablets ("Tango tan…", "Orchestr…": `m-dark-structure`, `t-dark-compose`).
5. Motion is mostly on the right side of the line. Two things are noise: the ambient wallpaper drifts for 28 s forever on desktop, and the Disc3 glyph spins in the toolbar while the narrative that should carry the wait sits below the fold.
6. Accessibility is close. Focus ring is good, headings are right, every control is named. Fails: `--label-3` text (30 % alpha) is used for real information in four places (≈2.5:1), picker rows lose their focus ring because the `<select>` is `opacity-0`, chart dots are 37 pt, and the minimised tab bar removes four tabs from the DOM.

---

## 1. What now reads native (keep)

| Idiom | Evidence | Note |
| --- | --- | --- |
| Large title 34/41 → 17 semibold glass bar on phone | `m-dark-compose-top`, `m-dark-chrome-down`, `m-dark-db-scrolled-collapsed` | Collapse point and material are right. The bar also carries the segmented control on Database, which is exactly what Health does with its period picker. |
| macOS sidebar at ≥ 1024, title1 page heading, toolbar actions at the right | `d-dark-compose-empty`, `d-dark-library-empty` | Source-list rows at 36 pt with a tinted glyph on the active row. Good. |
| Inset groups with uppercase 13 pt headers and 13 pt footers | all `*-settings*`, `*-night-rules`, `*-tonight` | Footers do the explaining, cells stay one line. This is the biggest single win of the pass. |
| Switch (51×31, green), joined stepper 94×32, segmented 32 pt with sprung thumb | `d-dark-compose-empty`, `d-light-compose-empty` | Light-mode thumb is white with the two-layer shadow, dark-mode thumb is a 16 % fill. Correct for both. |
| Picker rows with `chevron.up.chevron.down` and the real `<select>` behind them | `d-dark-picker-focus`, `m-dark-tonight` | iOS shows its wheel, macOS its menu. Right call. |
| Tab capsule: 10 pt labels, pill spring, minimises to the active tab on scroll, returns on scroll up | `m-dark-chrome-down` (74 px capsule, icon only), `m-dark-chrome-up` (341 px, labels back) | iOS 26 behaviour, measured. |
| Compose accessory capsule above the tab bar, hides with it | `m-dark-compose-top`, `m-dark-chrome-down` | Primary action in thumb reach. |
| Sheet: grabber, medium → large detent on drag, drag to dismiss, thick material, Done/X | `m-dark-sheet-export-medium` (62 dvh), `m-dark-sheet-export-large` (92 dvh), `m-dark-sheet-cultures`, `m-light-more-menu-sheet` | The drag thresholds feel right. The desktop sheet is a centred 540 px panel with Cancel/title/Done, which is the macOS sheet. |
| Apple Music rows: 44 pt artwork tile with the rhythm colour, 17 pt title, 15 pt secondary, tabular trailing number, `•••`, hover-revealed swap | `d-dark-tandas`, `d-dark-tanda-row-hover`, `d-dark-tanda-menu` | Matches Mobbin M1/M26. The hover swap glyph is a good desktop-only affordance. |
| Swipe actions: full-height gold Lock and tint Swap behind the header row | `m-dark-tanda-swipe` | UISwipeActionsConfiguration look, haptic on snap. |
| `•••` menu as a thick-material popover on desktop and a sheet of rows on phone | `d-dark-more-menu`, `d-dark-tanda-menu`, `m-light-more-menu-sheet` | Right-click on a card also opens it (verified in code). |
| Search field 36 pt, magnifier, clear glyph, Cancel on focus, tab bar hides for the keyboard | `m-dark-library-focused`, `m-dark-library-results`, `d-dark-library-results` | Placeholder states the count ("Search 21,932 recordings"), as Insight Timer does. |
| Health-style score block: caption, large tinted number with unit, chart, right-side y labels | `d-dark-result`, `m-light-result` | Close to Mobbin M10/M11; see §2 for the two remaining deviations. |
| Guide as an article: title, 17/24 body, title3 section heads, link rows with the external glyph | `d-dark-guide`, `m-dark-guide` | Reads like Health's "About" pages. |
| Database edit mode: Edit/Done in the bar, value cells become right-aligned fields | `d-dark-db-songs-edit`, `m-dark-db-songs-edit` | Reminders-style inline editing. |
| Empty states: 120/160 px crate Lottie, one subhead line | `d-dark-library-empty`, `d-dark-db-songs` | Right size, right tone. |
| Light mode: warm grey grouped background, white cells, same tint | `d-light-compose-empty`, `d-light-settings`, `m-light-tandas` | Parity is real; the ambient wash is the only thing left to tame (§4). |

---

## 2. What still does not read native

Ordered by how much it costs the impression.

### 2.1 Phone tanda cards overflow the viewport (bug)

`m-dark-tandas`, `m-light-tandas`, `m-dark-tanda-swipe`, `m-light-tanda-listen`: the card's right edge, the energy "48 / target 44" column and the lock glyph are cut off. Measured: `main` is 393 px, the tandas grid is 361 px, but `grid-template-columns` resolves to `439.8px` and each `<article>` is 440 px. Cause: `Composer.tsx` line ~1046 uses `grid gap-3 md:grid-cols-2 …` with no explicit column below `md`, so the implicit track is sized `auto` and grows to the header cell's max-content (tile + orchestra + singer line + energy column ≈ 404–440 px). The header `h3.truncate` never gets a chance to truncate because its grid parent is already wider than the screen. Fix in P0-1.

### 2.2 The form is in the way once a set exists

`d-dark-compose-form-with-set`: with a set composed, the viewport shows four groups of settings and no trace of the set except the Export/`•••` glyphs. The result starts at ~1,700 px (desktop) and ~2,600 px (phone, after six groups and two "Tonight" lists). A native app would move the configuration behind a summary once the artefact exists (Apple Music's playlist detail puts the content first and "Edit" in the bar; Health keeps the period picker in the bar). Proposed: a `SetupSummary` row (P1-1) that replaces the form when `hasPlaylist`, with "Edit set-up" expanding it in place, and the `#result` section rendered first.

### 2.3 Settings tiles on the wrong side

`d-dark-settings-full`: Region's globe tile and Appearance's palette tile are rendered trailing (after the value, after the chevrons). `PickerRow` and `SegmentedRow` take `children` as "extra trailing controls" and Settings passes the `Tile` as children. iOS tiles are always leading. P0-4.

### 2.4 Picker values are grey, not tint, and the code thinks they are tint

`d-dark-picker-focus`, `m-dark-tonight`: "Golden Age 35–55", "Not set", "Europe" render at `rgba(246,241,232,.6)`. `Form.tsx` `PickerRow` sets `cell-value text-[var(--tint)]`, but `.cell-value { color: var(--label-2) }` is unlayered CSS in `globals.css` and outranks the Tailwind utility (which lives in `@layer utilities`). Decision: keep grey. iOS Settings trailing values are secondary grey; only menus/links are tinted, and the `chevron.up.chevron.down` already says "picker". Remove the dead class so the code matches the screen (P2-3). The same specificity trap affects `cell-value text-body` in `Row` and `Library` (harmless today, but worth knowing).

### 2.5 Stepper rows truncate their label on phone and tablet

`m-dark-structure`: "Tango tan…", "Milonga t…", "Orchestr…"; `t-dark-compose` (820 px, two columns): "Tango…", "Vals t…", "Milon…", "Orch…", "Tanda sh…", "Op…". The row has to fit label + pin (36) + value "4 tracks" + stepper (94) + gaps in 329 px. iOS never truncates a Settings label; it wraps the label or drops the secondary text. Fixes in P0-5: value shows only the number on phones (unit moves into the label: "Tango tanda, tracks" is wrong; use "Tango tanda" + value "4" and put "tracks" in the footer), pin hidden unless pinned, and the composer grid stays single-column until `lg`.

### 2.6 The pin glyph

Nine `PinOff` glyphs at `--label-3` (30 % alpha) sit in the middle of rows (`d-dark-compose-empty`). They look like disabled icons and nobody can tell what they do without the tooltip (phones have none). Native pattern for "keep my value across preset changes" is either a swipe/`•••` action or nothing visible until it is on. P0-5c: show the pin only when pinned (filled, tint) and expose "Pin / Unpin" in a row context menu (`Menu` with `contextRef`) on hover devices and on long-press on touch; add a one-line footer "Pinned values survive an era change."

### 2.7 Result header: serif set name fights the number

`d-dark-result`, `m-light-result`: Health's pattern is caption → number+unit → date, left-aligned. TDJ has caption "Score" left, verdict and thumbs right, then number left and a 22 pt serif set name right. On phone the serif name is as loud as the number and sits on the same baseline, so the eye lands on "4h golden milonga" first. Keep the serif (it is the one display moment the pass allows), but make it the caption line and demote the verdict to the line under the number (P1-2). The legend line "Line: energy · dashed: target · ● tango ◉ vals ▣ milonga" is still there; the pass said to remove it. On phone it is the widest line in the card.

### 2.8 Tab capsule and search button collide on Database/Library phones

Measured on `/database`: tab capsule spans x = −10…331, search capsule 321…381. The capsule is shoved 10 px off the left edge and overlaps the search button by 10 px (`m-dark-db-songs-edit`: "Compose" label touches the screen edge). `Nav.tsx` shifts the capsule by a fixed 36 px when a search page is active; the five-tab capsule is 341 px wide and there is no room for 36 + 60 + 12. P0-3: at the search pages shrink the capsule (drop labels to icon-only at < 400 px, or render four tabs plus the search capsule as the fifth), and compute the offset from the real widths.

### 2.9 Segmented control that scrolls

`m-dark-db-songs`: six segments in 361 px overflow (scrollWidth 395), "Memory" shows as "Mem" and nothing says it scrolls. iOS segmented controls never scroll. P1-4: four segments on phone (Songs, Orchestras, Cortinas, More ▾) with a menu for Rules/Context/Memory, or a `PickerRow`-style title menu ("Database ▾ Songs") in the large title, the way Apple Music's Library uses a sort menu.

### 2.10 Centred text in the tanda card rows

`m-light-tandas`, `d-dark-tandas`: "Listen" and "Cortina · Frank Sinatra – Fly Me to the Moon · 53 s" are centred. The rows are `<button className="cell cell-tap w-full">` without `text-left`; browsers centre button text. Every other cell is left-aligned, so these two read as buttons from a different app. P0-2.

### 2.11 Export sheet: the primary action is below the fold

`d-dark-sheet-export`, `d-light-sheet-export`: the desktop sheet is 80 vh tall and the "Connect Spotify and create playlist" button is only reachable after scrolling past nine rows. On phone it needs the large detent plus a scroll (`m-dark-sheet-export-bottom`). Native sheets pin the primary button in a footer. P1-3.

### 2.12 Loading narrative is invisible on desktop

`d-dark-loading-1/2`: the only feedback is the Disc3 spinning inside the toolbar button; the four-step narrative is rendered after the form (`ComposeNarrative … mx-auto mt-6 hidden sm:flex` at line 921) which is 1,600 px down. On a 0.7 s compose it never appears. P1-5 moves the narrative into the toolbar (`StepLabel` inside the compose button on desktop too, as the phone bar already does) and removes the spin.

### 2.13 Smaller tells

- `1940–1940` and `1941–1941` as year ranges (`d-dark-tandas`): `TandaCard.tsx` line 68 should print a single year when the two are equal.
- The "target 44" caption under the energy number duplicates the chart and gets clipped first on phones; the pass asked for it to move into the menu header. Keep on desktop ≥ `sm`, drop on phone.
- "Stored in this browser" as a disabled row inside the Database `•••` menu (`m-dark-db-more-sheet`): menus hold actions, not status. Already shown in Settings → Storage; remove from the menu.
- The ambient wallpaper is still visibly tinted behind the sidebar material and the light grouped background (`d-light-compose-empty`: peach left, lilac right). iOS grouped light is flat. Halve the radial alphas (`55 % → 28 %`) and set the drift to run once rather than infinite (§4, §5).
- Mood check sheet (`d-dark-sheet-mood`) embeds two Spotify iframes with Spotify's own dark cards inside a thick-material sheet. Reads foreign. Until the preview feature (§9.1) lands, show two `Row`s with the playlist name and an "Open in Spotify" chevron and load the iframe on tap.
- Database Songs edit on desktop shows two columns of 7-row value groups per song (`d-dark-db-songs-edit`); on macOS this would be a table. Acceptable for now; revisit with the History tab's table primitive (§9.2).

---

## 3. Hierarchy, typography, spacing, colour

**Type scale.** Everything sits on the §2.1 scale; no `text-sm/xs/lg` survivors found in the captured screens. Two deviations: the cortina row uses `text-footnote` for a row label (13 pt where every other row label is 17 pt; `d-dark-tandas`), and the energy per track is `text-subhead` next to a 17 pt title (fine, that is the Apple Music duration pattern).

**Weight.** Tanda header `h3` is `text-headline` (17 semibold) while Apple Music rows are 17 regular with a 15 secondary line; the semibold is acceptable here because the number tile already carries the rank. Keep.

**Spacing.** Group header `margin: 24 0 8`, cell padding 11/16, footers 8 above: consistent everywhere. The only off-grid gap is the desktop two-column composer grid (`md:gap-x-4` = 16) next to group headers with 24 top margin, so the second column's header does not align with the first when footers differ in length (`d-dark-compose-empty`: "Structure" at y = 126 vs "Cortinas" at y = 584 while "Night rules" is at 584; by chance aligned here, not in general). Use `md:items-start` plus `grid-auto-rows: min-content` or drop to one column until `lg` (P0-5b does this).

**Colour.** One tint (rose) for interactive text and primary buttons, chevrons tertiary, switch green, lock gold, destructive red: holds. Rhythm tiles tango/vals/milonga are the only other saturated colour and they stay inside tiles. Dark `--bg-cell` 26/24/36 on `--bg-grouped` 11/10/16 gives the cell lift without a border. Light: white on 242/239/233. Both correct.

**Contrast (computed from `globals.css`).**

| Token | Dark on cell | Light on cell | Used for |
| --- | --- | --- | --- |
| `--label` | 15.8:1 | 16.5:1 | labels |
| `--label-2` (60 %) | 6.4:1 | 5.1:1 | secondary, footers: pass |
| `--label-3` (30 %) | 2.5:1 | 2.4:1 | energy in Library rows (13 pt), "· weight 12" in the score sheet (15 pt), pin glyphs, thumbs: **fail** for text |
| `--tint` | 5.1:1 | 4.6:1 | pass |
| white on `--tint` (buttons) | 4.1:1 (#e0557a) | 4.6:1 (#c9426a) | dark-mode primary button is below 4.5:1 at 17 pt semibold (large-text threshold is 3:1 at ≥ 14 pt bold, so it passes AA as large text; flagging only) |

Fix: `--label-3` is for glyphs and placeholders only; the two text uses move to `--label-2` (P0-6).

---

## 4. Light-mode defects

- `d-light-compose-empty`, `d-light-settings`: the ambient radial gradients at 55 % alpha wash the grouped background peach and lilac and show through the sidebar's thin material as a pink gradient. Native light is flat warm grey. Drop the radial alphas to 28 % and the blob opacity to 0.14 in light (keep 0.25 in dark where it is wallpaper, not tint).
- `d-light-sheet-export`: the Rekordbox and Serato tiles are `#111` on white; at 29 pt that is fine, but the JSON/Set list tiles are `#8e8e93` on white with a white glyph (2.4:1 on the glyph). Use `#636366` for the grey tile in light.
- `m-light-result`: the phase bands in the chart are light grey blocks on a white card and read as four stripes; in dark they are nearly invisible, which is the better reading. Lower the band fill to `rgb(var(--text) / 0.03)` in light.
- `m-light-tandas`, `d-light-tandas`: the per-track energy bars (`bg-[var(--fill-3)]` track, tint fill) are crisp on white; good.
- `d-light-tanda-menu`: thick-material menu on a light card; the 0.5 px ring is visible, shadow OK.
- Light `.glass` capsules (`m-light-compose-top`): the tab bar and the compose capsule sit on near-white content, so the `rgb(255 255 255 / .18)` border disappears and the capsule edge is carried by the shadow alone. Acceptable, but iOS adds a 0.5 px `rgb(0 0 0 / .08)` ring in light. Add it under `:root[data-theme="light"], :root:not(.dark)`.
- `d-light-settings`: the mono "Redirect URI" sub-line is `label-2`, fine. The Model field value renders in tint mono (`field-value`), which here means "editable value"; Apple would use `--label` for a typed value and tint only for a chosen one. Minor.

---

## 5. Motion: what helps, what is noise

Helps (keep exactly as is):
- Tab pill and segmented thumb springs (`spring.thumb`, < 2 px overshoot).
- Score count-up from the previous value, curve draw-on on a fresh set, curve morph on recompose, card dim at 0.55 while recomposing, locked cards holding position (`d-dark-result`, verified in code).
- Card stagger capped at index 8.
- Sheet spring on phone with blur applied after settle (`.glass-settling`), scale-fade on desktop.
- Swipe snap with haptic, swap-row nudge on "nothing fits".
- Theme cross-fade on `html.theming`.
- Track-row `lineSwap` on swap.

Noise (change):
- Ambient drift: 28 s infinite `transform` animation on two 60 vmax blurred blobs, desktop only. It is the only thing moving on an idle screen and it is a constant GPU cost. Run it once on load (`animation-iteration-count: 1; animation-fill-mode: forwards`) or stop after 2 cycles.
- Disc3 rotating inside both compose buttons while busy: a spinner by another name. With the narrative moved into the button (P1-5) the glyph should stay still; the label change is the feedback.
- Active-card double emphasis: `ring-2 ring-tint` plus a scale/opacity ring pulse when picking a tanda from the curve. One is enough; keep the ring, drop the pulse.
- `.btn:active { transform: scale(0.97) }` on a 50 pt capsule reads as a web press. iOS buttons dim (`opacity: .7`) and do not scale. Switch to an opacity press (P2-4).
- `Lock` glyph `scale 0.8 → 1` pop on lock: fine, 250 ms.
- Listen row: the height animation is fine but it reveals a Spotify iframe (`d-dark-tanda-listen`), which paints late and shifts layout. Pre-size the container to the iframe height (152 px) so the reveal animates to a known height.

Reduced motion (`d-dark-reduced-motion-result`): everything collapses to fades, `.ambient` stops, Lottie sets its final frame. Correct.

Loading narrative: on the live host compose takes ≈ 0.7 s, so the 250 ms gate plus 450 ms per step shows at most "Placing tandas…" then the result (`d-dark-loading-1..4`). That is fine on phone where the label lives in the thumb bar. On desktop (§2.12) nothing visible changes except the glyph spin, then the page scrolls to the result. Put the step label in the toolbar button and let the result arrive under it.

---

## 6. Phone-specific findings

Thumb reach: the compose capsule and the tab bar are in the bottom 20 % (`m-dark-compose-top`). Export is a 44 pt icon next to Compose in the same capsule once a set exists. Good. The large-title trailing buttons (Export, `•••`) sit at the top right (`m-light-compose-top`): on iPhone 15 Pro that is out of reach, which is why the accessory capsule duplicates Export. Fine as is.

Sheet behaviour: medium (62 dvh) opens first, drag up to 92 dvh, drag down to dismiss, focus inside the body jumps to large, scrolled lists do not turn into a dismiss (verified in `Sheet.tsx` and `m-dark-sheet-export-*`). The medium detent cuts the Export groups mid-row with no scroll-edge hint (`m-dark-sheet-export-medium`); add a `scroll-edge-bottom` gradient inside the sheet body.

Tab bar: minimise/return works (§1). Two defects: the search-page overlap (§2.8) and the fact that minimising removes four `<Link>`s from the DOM, so a VoiceOver user who scrolled loses the navigation until they scroll up. Keep all five in the DOM and hide with `width: 0; opacity: 0` on the inactive ones (P0-3b).

Large title collapse: 56 px threshold, glass bar at 44 + safe area, title centred, trailing buttons re-homed in the bar (`m-dark-chrome-down`, `m-dark-db-scrolled-collapsed`). Correct. The bar has `pt-[env(safe-area-inset-top)]` and `viewportFit: cover`, so standalone mode is covered. One miss: the collapsed bar on Database shows the segmented control as a second row but the large-title version of the segmented is still in the page under it for a few pixels of scroll (`m-dark-db-scrolled-collapsed` shows "Songs Orchestras" ghosting behind the bar). Hide the in-page one while collapsed.

Scroll-edge effects: top gradient is 56 px and bottom 120 px; the content fading under the tab bar reads right (`m-dark-adjust`).

Steppers at 44 pt, switch 51×31 in a 44 pt hit area, segments 44 pt on touch, chips 44 pt: verified via computed styles. Below 44: pins (36×44), thumbs (40×44), chart dots (37×37, `r + 5` hit ring). Enlarge the dot hit area to an invisible 44 pt circle (P0-6b).

`m-dark-tanda-swipe`: swipe reveals Lock (gold) and Swap (tint) at 74 px each; a full swipe past 180 px fires Lock. Native. The swipe exposes the clipped right edge bug more (the card is already 47 px off-screen), fixed by P0-1.

Keyboard: the search field is 17 pt so iOS does not zoom; the Cancel button appears on focus; the tab bar slides down 120 % (`m-dark-library-focused`). Good.

---

## 7. Accessibility

Pass: `:focus-visible` 2 px tint ring with 2 px offset (`d-light-settings-focus`, `d-dark-focus-ring`), inside glass the ring is inset so it is not clipped; headings h1 → h2 per group, one h1 per page; no unlabelled control found by a DOM sweep across Compose and Settings; `role="status"` live regions for compose state, DB messages, test connection; `aria-pressed` on toggles; menu has `role="menu"`/`menuitem`, arrow keys, Escape; sheet traps focus and restores it.

Fail or weak:
1. `--label-3` text (§3): Library energy (13 pt), score-sheet weights (15 pt).
2. Picker rows: the `<select>` is `absolute inset-0 opacity-0`. Keyboard focus lands on it and nothing visible changes (the ring is on an invisible element). Add `.cell:has(select:focus-visible) { outline: 2px solid var(--tint); outline-offset: -2px }` (P0-6c).
3. Chart dots 37 pt (P0-6b).
4. Minimised tab bar drops links from the DOM (P0-3b).
5. `aria-hidden` on `ComposeNarrative` is right (the live region announces), but the phone button label cycles four strings while `aria-busy` is only on `#result`; add `aria-live="polite"` to the status element already present (it is) and make sure the button itself does not also announce: it has no `aria-live`, good.
6. The `Row` with `href` opens in a new tab without saying so; append `<span class="sr-only">(opens in a new tab)</span>` in Guide.
7. Swipe actions are `tabIndex={-1}` until open and the open state cannot be reached by keyboard on a touch laptop (iPad with keyboard). The `•••` menu is `hidden sm:inline-flex`, so on a phone-width touch device with a keyboard there is no keyboard path to Lock/Swap. Render the menu button on all widths but visually hide it on phones (`sr-only sm:not-sr-only`) so it stays focusable.
8. Colour-only evidence dots in Database → Context (`m-dark-db-scrolled-collapsed`) have the text "moderate evidence" beside them. Good. The Tonight rows' trailing dot has only a `title`; add `aria-label` or move the evidence word into the row sub-line.

---

## 8. Copy

| Where | Now | Change to | Why |
| --- | --- | --- | --- |
| Tonight footer | `1 shift · cortinas: themed-single-artist, jazz-standards, soul, italian-60s` | `1 shift · cortinas: themed single artist, jazz standards, soul, Italian 60s` | Raw slugs leak into UI; humanise in `ContextStrip.tsx` line 35 (`g.replace(/-/g, " ")` plus a label map). |
| Tanda sub-line | `Carmen del Moral · 1940–1940 · warm-…` | `Carmen del Moral · 1940 · warm-up` | Equal years collapse; "warm-up" must not truncate before the singer does. |
| Energy caption | `target 44` | drop on phone; desktop `of 44` under the number | Duplicates the dashed line. |
| Result header | `Score` / `Solid regular milonga DJ` | caption = set name (serif), subcaption under number = `Solid regular-milonga DJ` | Verdict reads as a grade of the person; hyphenate so it is a grade of the set. |
| Library row year | `?` | `—` with `aria-label="year unknown"` | A question mark in a numeric column reads as an error. |
| Settings → Storage footer | `Set TDJ_DB_TABLE on the server to keep the database and memory across devices.` | `Saved in this browser. Deploy with a database table to keep it across devices (see Deploy guide).` | Env-var names are not user copy. |
| Database `•••` | `Stored in this browser` (disabled row) | remove | Status is not an action; it is already in Settings. |
| Written review row value | `Reading the set…` | `Reading…` | Row values are one or two words. |
| Export footer | `Paths use a TDJ/ placeholder. Set each app's music folder in Settings.` | `Paths start with TDJ/ until you set each app's music folder in Settings.` | Says what will happen, not what is used. |
| Context rows | `Heat wave (>=30 C outside, room not air-conditioned)` | `Heat wave (≥ 30 °C outside, no air conditioning)` | Typography of units; these are data labels in `data/knowledge`, so fix at the source or in a display formatter. |
| Mood check sub | `Aren León's reference tandas` | keep | Good. |
| Compose subtitle | `Era, length and room; TDJ builds the tandas and the arc.` | keep | Good. |
| Phone compose button while busy | `Placing tandas…` → `Scoring the night…` | keep | Good. |

---

## 9. Prioritised change list (file + exact edits)

Paths are under `apps/web/src/`.

### P0 (bugs and things that read wrong on every screen)

**P0-1 Phone tanda overflow.** `components/Composer.tsx`, the tandas grid:
```tsx
- <div className="grid gap-3 md:grid-cols-2 md:items-start md:gap-4">
+ <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-start md:gap-4">
```
and in `components/TandaCard.tsx` add `min-w-0` to the article class string (`className={\`group-inset min-w-0 …\`}`). Verify `document.querySelector('#tanda-1').getBoundingClientRect().width === 361` on iPhone.

**P0-2 Left-align the two button rows in the card.** `components/TandaCard.tsx`:
```tsx
- className="cell cell-tap w-full sm:hidden"          // Listen row
+ className="cell cell-tap w-full text-left sm:hidden"
- className="cell cell-tap w-full"                    // cortina row
+ className="cell cell-tap w-full text-left"
```
and change the cortina label from `text-footnote` to the row default (drop `text-footnote`, keep `text-[var(--label-2)]`).

**P0-3 Tab capsule vs search button.** `components/Nav.tsx`:
```tsx
// a. do not hard-code the shift; make room by dropping labels on search pages
- {(minimised ? items.filter((it) => path === it.href) : items).map((it) => (
-   <MobileTab key={it.href} it={it} on={path === it.href} min={minimised} />
+ {items.map((it) => (
+   <MobileTab key={it.href} it={it} on={path === it.href} min={minimised} compact={!!searchId} hidden={minimised && path !== it.href} />
  ))}
```
In `MobileTab`, accept `compact` and `hidden`: `compact` renders the label `sr-only` and `min-w-[52px]`; `hidden` sets `className += " w-0 min-w-0 overflow-hidden opacity-0 px-0"` and `tabIndex={-1} aria-hidden` (keeps the links in the DOM for b.). Replace the translate with `translate(calc(-50% - ${searchId && !minimised ? 30 : 0}px), 0)` and confirm `tab.right + 12 <= search.left` at 393 px.

**P0-4 Leading tiles in Settings.** `app/settings/page.tsx`: `PickerRow` and `SegmentedRow` have no leading slot, so add one. In `components/Form.tsx`:
```tsx
export function PickerRow<K extends string>({ tile, … }) {
  return (
    <div className={`cell relative w-full …`} data-leading={tile ? "tile" : undefined}>
      {tile}
      <label htmlFor={id} …>
```
same for `SegmentedRow` (`tile` rendered before the label span). In Settings move `<Tile color="#007aff">…</Tile>` and `<Tile color="#8e8e93">…</Tile>` from `children` to `tile={…}`.

**P0-5 Stepper rows and the two-column form.**
a. `components/Form.tsx` `StepperRow`: on phones show the bare number.
```tsx
<span className="cell-value tabular-nums">{display ?? <NudgeValue value={`${value}${unit}`} />}</span>
```
becomes
```tsx
<span className="cell-value tabular-nums"><NudgeValue value={isPhone ? String(value) : `${value}${unit}`} /></span>
```
(`const isPhone = useMediaQuery("(max-width: 639px)")`) and append the unit to the footer of the Structure group: `"Sizes are in tracks; gap in tandas; spread in years. …"`.
b. `components/Composer.tsx`: `md:grid md:grid-cols-2 md:gap-x-4` → `lg:grid lg:grid-cols-2 lg:gap-x-6` so tablets stay single column (`t-dark-compose` truncation goes away).
c. `PinButton`: render only when `on`; move pin/unpin into a `Menu` opened by right-click/long-press on the row (`contextRef` on the row element). Footer of Structure already explains pinning.

**P0-6 Accessibility fixes.**
a. `app/library/page.tsx` line 129 and `components/Composer.tsx` line 1152: `text-[var(--label-3)]` → `text-[var(--label-2)]`.
b. `components/EnergyCurve.tsx`: add before the focus ring circle
```tsx
<motion.circle initial={false} animate={{ cx, cy }} transition={morphT} r={22} fill="transparent" style={{ pointerEvents: "all" }} />
```
so the hit area is 44 pt while the drawn dot stays 11–13 pt.
c. `app/globals.css`, after `.cell:focus-within:has(.field)`:
```css
.cell:has(> select:focus-visible) { outline: 2px solid var(--tint); outline-offset: -2px; }
```
d. `components/TandaCard.tsx`: the `Menu` className `-mr-3 hidden sm:inline-flex` → `-mr-3 max-sm:sr-only sm:inline-flex`.

### P1 (hierarchy)

**P1-1 Collapse the form once a set exists.** `components/Composer.tsx`: wrap the four groups and `ContextStrip` in
```tsx
<Disclosure open={!hasPlaylist || setupOpen} …>
```
(there is already a `Disclosure.tsx`) and render, when `hasPlaylist && !setupOpen`, a `Group` with one `Row`:
```tsx
<Group header="Set-up">
  <Row
    tile={<RhythmTile rhythm="tango" />}
    label={`${ERAS.find(([k]) => k === era)?.[1]} · ${hours} h · ${ARCS.find(([k]) => k === options.arc)?.[1]}`}
    sub={`${PATTERNS.find(([k]) => k === options.pattern)?.[1]} · cortinas ${CORTINA_STYLES.find(([k]) => k === cortinaStyle)?.[1].toLowerCase()}${chosenContextCount ? ` · ${chosenContextCount} tonight` : ""}`}
    value="Edit" chevron onClick={() => setSetupOpen(true)} />
</Group>
```
and move `<section id="result">` above it. Keep `scrollIntoView` only for the first compose. On phone this puts the score within one screen of the title.

**P1-2 Result header as a Health card.** `components/Composer.tsx` result header block:
```tsx
<div className="flex items-center justify-between gap-3">
  <h2 className="text-subhead min-w-0 truncate font-serif text-[var(--label-2)]">{playlist.name}</h2>
  <span className="flex items-center gap-1">…thumbs…</span>
</div>
<div className="flex items-baseline gap-1">
  <span className="text-large-title tabular-nums text-[var(--tint)]"><ScoreCounter …/></span>
  <span className="text-title3 text-[var(--label-2)]">/100</span>
</div>
<p className="text-footnote text-[var(--label-2)]">{playlist.score.verdict}</p>
```
and in `components/EnergyCurve.tsx` delete the `<motion.figcaption>` legend (keep `aria-describedby` pointing at an `sr-only` version of the same string).

**P1-3 Pinned primary in the Export sheet.** `components/Sheet.tsx`: add a `footer?: ReactNode` prop rendered after the scrolling body:
```tsx
{footer && <div className="shrink-0 border-t border-[var(--separator)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">{footer}</div>}
```
`components/ExportSheet.tsx`: pass the Spotify button (and the "Needs a Spotify Client ID" footnote) as `footer`, remove them from the body. Phone: open the Export sheet at `detents={["large"]}` since the content is taller than medium anyway.

**P1-4 Database segmented on phone.** `app/database/page.tsx`: on `isPhone` render `items={TABS.slice(0, 3).concat([["more", "More"]])}` and a `Menu` for the rest, or shorten labels to `Songs · Orch. · Cortinas · Rules · Context · Memory` at `text-caption1`. The first is more native.

**P1-5 Narrative in the toolbar.** `components/Composer.tsx`: `composeButton` → `<ComposeLabel busy={busy} steps />` (drop the `hidden sm:flex` `ComposeNarrative` entirely, or keep it only in the empty state). `components/ComposeNarrative.tsx` `ComposeLabel`: remove the `rotate: 360` animation, keep `Disc3` static.

**P1-6 Ambient at wallpaper level.** `app/globals.css`:
```css
.ambient { background: radial-gradient(1200px 800px at 10% 10%, color-mix(in srgb, var(--bg-a) 28%, transparent), transparent 60%), … }
.ambient::before, .ambient::after { opacity: .18; animation: drift 28s ease-in-out 1 forwards; }
:root[data-theme="light"] .ambient::before, :root[data-theme="light"] .ambient::after { opacity: .12; }
```

### P2 (polish)

- **P2-1** `components/TandaCard.tsx` line 68: `t.yearRange ? (t.yearRange[0] === t.yearRange[1] ? String(t.yearRange[0]) : \`${t.yearRange[0]}–${t.yearRange[1]}\`) : "year ?"`; wrap the "target" caption in `hidden sm:block`.
- **P2-2** `components/ContextStrip.tsx` line 35: `genres.map(humanise)` where `humanise = (g) => g.replace(/-/g, " ").replace(/\b(\d{2})s\b/, "$1s")` plus a small label map for `italian-60s → Italian 60s`.
- **P2-3** `components/Form.tsx` `PickerRow`: drop `text-[var(--tint)]` from the value span (dead class, §2.4).
- **P2-4** `app/globals.css` `.btn:active { transform: scale(0.97) }` → `.btn:active { opacity: .72 }`; `.icon-btn:active { transform: scale(0.96) }` → opacity as well.
- **P2-5** `app/globals.css` light glass ring: `:root:not(.dark):not([data-theme="dark"]) .glass { border-color: rgb(0 0 0 / .08); }`.
- **P2-6** Database `•••`: remove the "Stored in this browser" item (`app/database/page.tsx`).
- **P2-7** Sheet body: add `<div className="pointer-events-none sticky bottom-0 h-6 bg-gradient-to-t from-[var(--material-thick)]" aria-hidden />` at the end of the scrolling body so a cut row at the medium detent reads as scrollable.
- **P2-8** `app/database/page.tsx`: hide the in-page segmented while collapsed (`className={collapsed ? "invisible" : ""}` via `useToolbar().collapsed`).
- **P2-9** Score sheet rows: labels like "Tanda integrity (one orchestra, one r…" truncate (`d-dark-sheet-score`). Put the parenthetical into `sub` and keep the label short.
- **P2-10** Light-mode grey export tiles `#8e8e93 → #636366`; chart band fill in light `rgb(var(--text)/.03)`.

---

## 10. Three upcoming features: UI spec

### 10.1 Per-song play button, 30 s preview, key/BPM/compatibility badges

Idiom: Apple Music track row (Mobbin M1, M3, M26/M27). The row stays 44 pt tall; the leading number becomes a play glyph on hover/selection; metadata badges go in a 13 pt secondary line, right-aligned numbers stay tabular.

Row anatomy (`components/TrackRow.tsx`, new props `preview?: { url: string; source: "spotify" | "apple" | "local" }`, `bpm?: number`, `key?: string`, `compat?: "good" | "ok" | "clash"`):

```
[ ▶ / 1 ]  Por Calles Muertas  c. 1940                      45  ▬▬▬  ⋯
            ● 118 BPM · Dm · ✓ fits tanda                             (13 pt, label-2; on phone only)
```

- Leading slot 20 px: the track number by default; on `hover` (desktop) and when the row is the current preview, a `Play`/`Pause` glyph with `fill="currentColor"` in tint. On touch the number itself is the play target (44 pt hit area via `-m-2 p-2`). `aria-label="Play 30-second preview of Por Calles Muertas"`, `aria-pressed` while playing.
- Playing state: the tile/number cell shows a three-bar `AudioLines` animation at `--dur-loop` (1.2 s), the row background `var(--fill-4)`, and a 2 px progress hairline at the bottom of the row that fills over 30 s (`transform: scaleX`, linear). One row plays at a time (module-level `currentPreview` like `openRow` in `SwipeRow`). Preview ends → number returns, haptic 4.
- Badges: no pills. A 13 pt secondary line, dot-separated, where each fact is `glyph + value`: `Gauge` 118 BPM, `Music2` Dm, and the compatibility word. Compatibility uses colour only as reinforcement: `✓ fits` (label-2), `≈ close` (gold), `✕ clashes` (destructive), always with the word. Rules: BPM within ±4 of the tanda median = fits, ±8 = close, else clashes; key is Camelot-adjacent = fits, same mode = close, else clashes. On desktop the line is hidden by default and shown on hover or when `Show details` is on in the card `•••` menu; the trailing energy column stays the one number people scan.
- Where the audio comes from: `Song.previewUrl` from the Spotify enrich cache (`pnpm index:enrich` already stores IDs; add `preview_url`); fall back to the Listen embed when missing and grey the play glyph with tooltip "No preview for this recording".
- Desktop extra: a "Preview tanda" item in the tanda `•••` menu plays the four previews back to back (10 s each, 1 s crossfade) so the DJ hears the arc inside the tanda; the curve dot for that tanda pulses once per track change.
- Sheet variant on phone: tapping the 13 pt line opens a medium-detent sheet "Track details" with `Row`s: BPM, Key, Energy, Year (c.), Singer, Source, and an `ActionRow` "Swap for a better fit" that calls `onSwapTrack` with a `prefer: "compat"` hint.
- Motion: play glyph cross-fade 125 ms; bars loop 1.2 s; progress hairline linear; never animate blur.
- Files: `TrackRow.tsx` (row), `lib/preview.ts` (single `<audio>` element, `play(url, id)`, `stop()`, 30 s cap, `visibilitychange` pause), `TandaCard.tsx` (pass preview/bpm/key, add menu item), `globals.css` (`.row-progress`, `.bars` keyframes), `api/meta` / index to expose `bpm`, `key`, `previewUrl`.

### 10.2 History tab

Mobbin: Oura session history (grouped by day, thumbnail, metric line, play glyph) at https://mobbin.com/screens/86d5d8b6-79de-48b2-9f13-6202ddfd9578 and Waymo History (date groups, trailing number) at https://mobbin.com/screens/276cfd13-1227-4264-b816-10cd9931d005; score trend as a Health chart (M10/M11).

Navigation: sixth sibling tab is too many for the phone capsule. Put History as a row at the top of Library ("Your sets ›") on phone and as a sidebar entry under a "Library" section header on desktop (`Nav.tsx` sidebar gets `Library` → `Recordings`, `Sets`). The page itself: `app/history/page.tsx`.

Page:
- `PageHeader title="Sets"` with trailing `Menu` (Export all as JSON, Clear history…) and a `Segmented` in the bar: `All · Liked · This month`.
- Health-style summary group first: caption "Average score", large number (`ScoreCounter`), footnote "last 10 sets", and a 40-point line chart of score over time (reuse `EnergyCurve` plumbing as a `TrendChart` with one series, right-side y labels 50/100, no legend; dots are the sets, tap jumps to the row).
- Then groups by day (`section-head` "Today", "Yesterday", "Oct 12"), each `Row` with `tile={<RhythmTile rhythm="tango" />}` holding the score as the tile text (two digits, 13 pt semibold), `label` = set name (serif only here is tempting; keep sans, the row is a list), `sub` = "4 h · Golden Age · Two peaks · 22 tandas", `value` = `76` tabular in tint when liked, chevron. Swipe actions on phone: `Compare` (tint), `Delete` (destructive). Context menu on desktop: Reopen, Compare with current, Re-export…, Copy seed, Delete.
- Reopen: sets `playlist` in the store (`setPlaylist`), restores `options` from `playlist.options`, navigates to `/`, scrolls to `#result`. The History row gets a "Current" trailing value while it is open.
- Compare: a `Sheet` (large) titled "Compare" with the two set names as a 2-segment control at the top, the two curves overlaid in `EnergyCurve` (second series dashed in `--label-3`), then a `Group` of factor rows from `score.factors` showing both percentages as `cell-value` "100 % → 83 %" with the delta coloured green/red only when ≥ 5 points.
- Re-export: opens the existing `ExportSheet` with the chosen playlist injected (`ExportSheet` takes an optional `playlist` prop, defaulting to the store).
- Data: `memory.sets` already keeps the last 50 (`rememberSet`); extend `SetMemory` with `playlist` (the full object, gzipped JSON in IndexedDB on the browser path, a row on the server path) and `exports: Array<{ format, at }>`.
- Empty state: `EmptyState` with "Sets you compose land here. The score trend starts after three."
- Motion: rows `rise` with the 28 ms stagger on first paint only; the trend chart draws on once; compare sheet uses the standard sheet spring.

### 10.3 Connectors card in Settings and export destination picker

Mobbin: Google Drive account sheet (rows with service glyphs and chevrons, "Manage" tinted) at https://mobbin.com/screens/ff0c5e1c-0751-48cb-ab35-e49d4e5d9d93; Apple Notes "Select a Folder" sheet (close circle, destination list, create new) at https://mobbin.com/screens/56a7fa64-47ce-4eec-9c7a-058f35b6b245; Freeform share sheet grid (destination icons) at https://mobbin.com/screens/87ae3d88-4758-489e-81d3-e5e39c9d7e36.

Settings (`app/settings/page.tsx`), replaces the current "Spotify" group:
```
CONNECTORS
[●] Spotify            Connected · DJ Name  ›
[●] Apple Music        Not connected        ›
[●] YouTube Music      Not connected        ›
[●] TIDAL              Not connected        ›
[●] Deezer             Not connected        ›
[●] Dropbox            Connected            ›
[●] Google Drive       Not connected        ›
Footer: "Connect once; TDJ asks the service for permission in its own window and keeps only the token in this browser."
```
Each `Row` has a 29 pt `Tile` in the brand colour with a lucide glyph (Radio, Music, Play, Waves, Disc, Folder, Cloud; never the brand logo as an image, it stays a glyph tile like iOS Settings), `value` = status in secondary, `chevron`. Tapping opens a `Sheet` (medium) titled with the service name:
- Not connected: a `Group` with one `ActionRow` "Connect Spotify", footer explaining what the connection is used for ("Create playlists in your account; play 30 s previews."). The managed flow: `beginAuth()` opens the provider in a new window; the row shows `busy` with "Waiting for Spotify…" until `/callback` posts back; on success the sheet row flips to "Connected" with a 24 px `success-check` Lottie once, haptic `[10,40,10]`; failure shows a destructive footer "Spotify said no: <reason>" and the action row returns. Developer fields (Client ID, redirect URI) move to a "Developer" `Group` at the bottom of the service sheet, collapsed under a `Row` "Use your own app ›" so that the ordinary path is a single tap.
- Connected: `Row` "Account" with the display name, `Row` "Used for" with "Playlists · Previews", `ActionRow` "Reconnect", `ActionRow` destructive "Disconnect".
- Storage connectors (Dropbox, Google Drive) add a `Row` "Folder" with the chosen path and chevron → a folder picker sheet in the Apple Notes shape (list of folders, "New folder" tinted row).
- A service that has no API yet renders the row with `value="Soon"` and `disabled`; do not hide it, the list is also the promise.

Export sheet (`components/ExportSheet.tsx`): add a first group "Send to" above the file groups:
```
SEND TO
[●] Spotify         Connected    ›
[●] Apple Music     Connect      ›
[●] Dropbox         /Tango/Sets  ›
[●] Google Drive    Connect      ›
```
Rows show only services that are connected plus two not-connected ones (the rest under "More destinations ›" which opens the Settings connectors sheet). Tapping a connected streaming row runs the playlist creation inline: the row goes `busy`, the "Progress" group streams the resolve log, and the pinned footer button becomes "Open in Spotify" when done. Tapping a storage row opens a small picker sheet: format (`Segmented`: Rekordbox, Traktor, M3U8, CSV), folder `Row`, file name field, `Done` writes the file. "Include cortinas" stays the first switch; the file groups below stay for local downloads. On phone the Export sheet opens at the large detent (P1-3). The `footer` slot holds one primary button that reflects the last-used destination ("Send to Spotify" / "Save to Dropbox" / "Download Rekordbox XML"), so repeat exports are one tap.

Store and API: `settings.connectors: Record<ConnectorId, { status: "none" | "connected" | "error"; account?: string; folder?: string; expires?: number }>`, `lib/connectors/<id>.ts` each exporting `beginAuth`, `handleCallback`, `createPlaylist | putFile`, and `/api/connect/<id>` for the server-side token exchange where PKCE is not offered. Keys remain BYOK and in the browser, as today.

---

## 11. Mobbin references

Viewed and used in this review:

1. Apple Music, Playlists list (artwork tile + title + subtitle + chevron, glass bar buttons, detached search): https://mobbin.com/screens/eabdf610-5137-47b6-a550-8c2d32ff659d — baseline for Library and History rows.
2. Apple Music, song page (centred title, tinted Play capsule, "Performing Artists" rows with round avatars): https://mobbin.com/screens/e809f6a3-8f2b-4a22-9c02-e9a33cdd88ce — the Play capsule shape for "Preview tanda".
3. Apple Music web, album track-list end (row numbers, trailing durations, `•••`, 11 pt footer, sidebar): https://mobbin.com/screens/ffd1356a-86ec-4185-a19a-d48bf888d67a — per-song row and desktop sidebar.
4. Apple Music web, New (sidebar sections, two-column song rows with 40 px artwork and `•••`): https://mobbin.com/screens/ee8db412-71b0-49a8-a1ab-5d6685153abe — two-column track rows at desktop widths.
5. Apple Health, Blood Pressure (segmented period picker in the bar, caption + big number + unit, right-side y labels, tinted "Show All" row): https://mobbin.com/screens/f6471b67-8921-4d71-826b-476849a1ec61 — result header and the History trend chart.
6. Apple Health, Cycle Tracking entry sheet (large sheet, grouped radio rows, pinned Done): https://mobbin.com/screens/ff954ee3-5366-443f-b94f-5033aa701f10 — pinned footer button in sheets.
7. Google Drive, account sheet (service rows with glyph tiles, status, chevrons, Done in the bar): https://mobbin.com/screens/ff0c5e1c-0751-48cb-ab35-e49d4e5d9d93 — Connectors card.
8. Google Drive, Smart features settings (long explanatory footers under switches, glyph + sentence rows): https://mobbin.com/screens/fe3fa612-6082-486c-8591-dc3ea603c7d7 — footer copy pattern for connector permissions.
9. Oura, Session history (day headers, thumbnail, metric line with glyphs, play glyph trailing): https://mobbin.com/screens/86d5d8b6-79de-48b2-9f13-6202ddfd9578 — History rows.
10. Waymo, History (month header, rows with date/time and trailing amount, end-of-list line): https://mobbin.com/screens/276cfd13-1227-4264-b816-10cd9931d005 — History grouping and empty end state.
11. Apple Notes, Select a Folder (close circle, folder list, tinted "New Folder"): https://mobbin.com/screens/56a7fa64-47ce-4eec-9c7a-058f35b6b245 — storage destination picker.
12. Freeform, share sheet (destination icon grid, format menu under the title): https://mobbin.com/screens/87ae3d88-4758-489e-81d3-e5e39c9d7e36 — "Send to" destinations.

Also returned and consistent with the round-3 references M1–M29 in `docs/design/apple-native-pass.md` §7 (not re-cited here).

---

## 12. Checks before merging

- iPhone 15 Pro: `#tanda-1` width equals the grid width; no element in `#result` has `getBoundingClientRect().right > main.right`.
- `/database` and `/library` on phone: `tab-bar.right + 12 <= search.left`; the five tab links are in the DOM while minimised.
- Settings: every `Tile` is the first child of its cell.
- Keyboard: Tab onto "Era" shows a ring on the row.
- Contrast: no `text-[var(--label-3)]` on text nodes (grep).
- `prefers-reduced-motion`: ambient still, no drift; compose button label changes without rotation.
- Playwright test ids survive: `page-title`, `tab-bar`, `collapsed-bar`, `energy-path`, `db-changes`, `empty-state`, `export-sheet`, `reset-confirm`, `compose-status`, `compose-narrative` (the last one moves into the button; update `e2e/motion.spec.ts` line 57 accordingly).
