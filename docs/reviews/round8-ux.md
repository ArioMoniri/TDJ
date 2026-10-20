# TDJ round 8: product-design review of the live build

Reviewed: https://d3k5k2c1l0s5ri.cloudfront.net on 2026-10-20, headless Chromium via Playwright. Viewports: iPhone 15 Pro (393 × 659 CSS px, 3×, touch), iPad (820 × 1180, touch), 1024 × 768, 1440 × 900. Dark and light. States: empty home, composing, result, tanda list with the mini-player, Export and Adjust sheets, tanda menu, score sheet, Booth empty / idle / onboarding / playing / holding (rehearsal mode with mocked 30 s previews), History (empty and with a night), Database, Library, Guide, Settings and every connector sheet, `/admin` locked. 57 captures live in `docs/reviews/round8-ux/` and are cited by file name (`m-` phone, `t-` tablet, `l-` 1024, `d-` desktop; `-dark` / `-light`). Measurements (contrast, hit sizes, font sizes, glass elements, layout rectangles) were taken in-page with `getComputedStyle` / `getBoundingClientRect` and are quoted inline.

Earlier rounds are not repeated. Where a round-4 or round-7 item is mentioned it is only to say whether it landed.

---

## 0. Verdict

1. **The native pass holds up.** Grouped forms, 44 pt cells, large titles that collapse into a 17 pt glass bar, sheets with detents, swipe actions, the sidebar at ≥ 1024, light/dark parity: all still correct (`d-dark-home-empty`, `d-light-home-empty`, `m-dark-settings`, `m-dark-export-sheet`). Round 4's P0 list is done: no tanda overflow on phone, stepper labels no longer truncate, tiles lead their rows, the tab capsule and the search button no longer collide (`m-dark-database`), the form folds behind a "Set-up" row once a set exists (`d-dark-after-compose-top`), the Export sheet pins its primary (`m-dark-export-sheet`). Round 7's corner fixes hold in Chromium at every width.
2. **The first run is a form, not a product.** A new DJ lands on 38 controls across six groups (4,100 px tall on a phone, `m-dark-home-empty-full`) under a one-line subtitle. Nothing says what TDJ produces, what a score is, or that the whole thing takes one tap. Apple Health, Oura and Apple Music all open on the *result* of the thing they do, with the set-up one tap away. §3 proposes the empty home.
3. **The Booth is not yet a stage tool.** Phone: the control strip is 150 px tall and covers the Next card and the whole Time card, the tab bar stays under it during a night (`m-dark-booth-playing`, `m-dark-booth-hold`). 1024: "TIME TO LA C…", "ends 07:08 (rehea" and the Next title wrap word-by-word (`l-dark-booth-playing`). Every width: a 72 % empty area under the Now card at 1440, a duplicated "30 s rehearsal" chip, a brown banner that says "N items have no source and will be skipped" at the moment the DJ presses Start, "Find…" text buttons on every row, set-column rows numbered 6, 7, 8 inside tanda 2. The 34/44 pt type and the 44 pt controls from the spec are there; the information architecture around them is not (§1, changes 5–8).
4. **The primary action is in the wrong place after the first compose.** Desktop and tablet keep "Compose the night" as the one tinted capsule in the toolbar after a set exists (`d-dark-after-compose-top`, `t-dark-after-compose-top`); a second tap silently replaces the set the DJ just read. The phone bar gets this right (Regenerate secondary, Export primary). Change 2.
5. **Two visible motion bugs**: the compose narrative paints two step labels on top of each other ("Placing tandas…" over "Matching cortinas…", `m-dark-composing`); the phone result header's "Play the night" capsule wraps into three lines (`m-dark-after-compose-top`). Changes 1 and 4.
6. **Copy still leaks the engineering.** "0 changes", "Needs a Client ID", "Keyless", "Unreachable", "weight 10", "85 seamless", "Seed 741930162", "stage production", "Aren León's reference tandas", "every rule of the booth on 30 s of each item". A DJ reads none of these as their own words. §2 lists each one with a replacement.
7. **Accessibility**: focus rings, names and roles are good; 44 pt is met everywhere except the key/BPM chips (55 × 28), the 40 × 40 tanda tiles and the 40 × 44 like/dislike glyphs. Contrast fails are all in disabled or tertiary text (`rgba(246,241,232,.3)` at 2.5:1 on "Connect Spotify", "Unlock", "Spotify" in the Booth source list) and in the tint-on-light phone labels (4.09:1 at 10 pt, `m-light-*`). §2.

---

## 1. The twelve highest-impact changes

Paths are under `apps/web/src/`. "Before" is what the capture shows; "after" is what a native app would show and the exact edit.

### 1. Compose narrative paints two labels at once (phone bar and desktop capsule)

**Before** (`m-dark-composing`): 350 ms into a compose, the bar shows "Placing tandas…" and "Matching cortinas…" superimposed at full opacity. `StepLabel` uses `AnimatePresence mode="popLayout"`; the exiting span is popped out of the grid flow and, inside an `inline-grid` with `overflow-hidden`, lands on the same cell as the entering one before its exit tween has started. With a 0.7 s round-trip on the live host the DJ sees the collision more often than a clean step.

**After**: one label at a time, crossfading as iOS does in the Music "Loading…" pill. `components/ComposeNarrative.tsx`, `StepLabel`:
```tsx
- <AnimatePresence mode="popLayout" initial={false}>
+ <AnimatePresence mode="wait" initial={false}>
    <motion.span
      key={step}
-     initial={{ y: 6, opacity: 0 }}
-     animate={{ y: 0, opacity: 1, transition: { duration: DUR.base, ease: EASE.out } }}
-     exit={{ y: -6, opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } }}
+     initial={{ opacity: 0 }}
+     animate={{ opacity: 1, transition: { duration: DUR.fast } }}
+     exit={{ opacity: 0, transition: { duration: DUR.fast } }}
```
and in `useSteps` raise `STEP_MS` so a step is readable (≥ 700 ms) and never advance past the step the engine has actually reached when the response arrives in under a second: show "Composing…" only when `busy` lasts < 900 ms (`SHOW_AFTER_MS = 900`). On the live host that means the narrative appears for the slow cases only, which is what it is for.

### 2. After a set exists, the toolbar's tinted capsule must be Regenerate, not Compose

**Before** (`d-dark-after-compose-top`, `t-dark-after-compose-top`, `l-dark-after-compose-top`): with a 91-point set on screen, the only filled capsule in the toolbar still reads "Compose the night". One click discards the set with no confirmation. Apple Music never shows "Create playlist" as the primary of a playlist you are looking at; Health shows "Add Data" only on the data type's own page. The phone bar already does the right thing (`m-dark-after-compose-top`: Regenerate ghost, Export tinted).

**After**: the toolbar mirrors the phone bar. `components/Composer.tsx`, `composeButton` (line ≈ 1100):
```tsx
- className="btn btn-primary min-h-[44px] lg:min-h-[40px] lg:px-4 lg:text-subhead"
+ className={`btn ${hasPlaylist ? "btn-ghost" : "btn-primary"} min-h-[44px] lg:min-h-[40px] lg:px-4 lg:text-subhead`}
  …
- <ComposeLabel busy={busy} steps={!!playlist} />
+ <ComposeLabel busy={busy} steps={!!playlist} idle={hasPlaylist ? "Regenerate" : "Compose the night"} />
```
and promote Export to the tinted capsule when `hasPlaylist` (line ≈ 1152): `className="btn btn-primary min-h-[40px] px-4 text-subhead"` with the label "Export" next to the `share` glyph, keeping the `icon-btn` only for `•••`. Keyboard: keep ⌘↩ on Regenerate (it is the same action) and add ⌘E to Export (round5-design §1 asked for it; it is not wired).

### 3. The empty home needs a hero, not a subtitle (first run)

**Before** (`m-dark-home-empty`, `d-dark-home-empty`): title "Compose", subtitle "Era, length and room; TDJ builds the tandas and the arc.", then the NIGHT group. A first-time DJ does not know that (a) the defaults already describe a normal 4 h Golden Age milonga, (b) one tap produces a scored, playable, exportable set, (c) everything below the fold is optional. On the phone the only cue is the tinted bar, which also covers the form's own footer ("Guide: 2 h práctica · …" is hidden under it in `m-dark-home-empty`).

**After**: see §3 for the copy and layout. Code: `components/Composer.tsx`, above the NIGHT group when `!hasPlaylist`:
```tsx
{!hasPlaylist && hydrated && (
  <section className="group-inset mb-6 p-5" aria-labelledby="first-run-title">
    <h2 id="first-run-title" className="text-title2 font-semibold">A night, composed</h2>
    <p className="text-subhead mt-1 text-[var(--label-2)]">
      Four hours of Golden Age tandas with cortinas, scored against 24 house rules. Change anything below, or just compose.
    </p>
    <ul className="mt-4 grid gap-2 sm:grid-cols-3">{/* three Row-style items: Compose → read the score → Play or Export */}</ul>
    <button type="button" className="btn btn-primary mt-4 min-h-[50px] w-full sm:w-auto" onClick={() => run()}>Compose a 4 h milonga</button>
  </section>
)}
```
and drop the `subtitle` prop on `PageHeader` (line 1148). On the phone, the bar's label stays "Compose the night"; the hero button is the same action, so no second primary.

### 4. "Play the night" wraps into three lines on the phone result header

**Before** (`m-dark-after-compose-top`, `m-light-tandas`): the ghost capsule in the result header is 160 × 44 on desktop but on the phone it shrinks to a 100 px pill with "Play / the / night" on three lines, pushing the serif set name to "Milonga · 4 h · Go…". It is the most prominent control on the screen and it looks broken.

**After**: on phones the Booth entry is an icon-only 44 pt tinted button in the header, the full label stays on ≥ 640 px. `components/Composer.tsx` line ≈ 1193:
```tsx
<button
  type="button"
- className="btn btn-ghost -my-2 min-h-11 px-3"
+ className="btn btn-ghost -my-2 min-h-11 shrink-0 whitespace-nowrap px-3 max-sm:h-11 max-sm:w-11 max-sm:px-0"
  data-testid="play-the-night"
  aria-label="Booth: play the night"
  …
- <Play size={16} fill="currentColor" strokeWidth={0} aria-hidden /> Play the night
+ <Play size={16} fill="currentColor" strokeWidth={0} aria-hidden /><span className="max-sm:sr-only"> Play the night</span>
```
and let the set name take the freed width (`h2` keeps `min-w-0 truncate`). Also add Booth to the phone `•••` sheet as the first item (it is there today, but fourth).

### 5. Booth on the phone: the strip hides the Next and Time cards, and the tab bar stays

**Before** (`m-dark-booth-idle`, `m-dark-booth-playing`, `m-dark-booth-hold`): the strip is 150 px tall (three wrapped rows: primary + next + stop, Cortina fader, Master fader + `•••`), fixed 68 px above the tab bar; the NEXT card's title is under it and the TIME card ("06:35 · ends 07:03 · TIME TO LA CUMPARSITA 28:10") is 600 px below the fold. During a night the six tabs remain one accidental tap away from leaving the page. Measured: `booth-strip` 150 × 369 at `bottom: 80`, `booth-next` top 836, `booth-time` top ≈ 1240, viewport 659.

**After**: a 64 pt strip as the spec says, faders in a sheet, the tab bar dismissed while a night runs, and the three numbers the DJ needs at the top in a fixed order. `app/globals.css`:
```css
@media (max-width: 639px) {
  .booth-strip { flex-wrap: nowrap; min-height: 64px; gap: 8px; }
  .booth-strip .booth-fader { display: none; }            /* faders move to a "Levels" sheet (•••) */
  [data-booth][data-booth-live] nav[aria-label="Primary mobile"] { transform: translate(-50%, 120%); opacity: 0; pointer-events: none; }
  [data-booth][data-booth-live] .booth-strip { bottom: max(0.75rem, env(safe-area-inset-bottom)); }
}
```
`app/booth/page.tsx`: set `el.dataset.boothLive = "1"` when `started` and remove it on `endNight`; add a "Leave the booth" item to the `•••` sheet so the page is still escapable. `components/booth/ControlStrip.tsx`: when `!wide`, render the two `Fader`s inside a `Sheet title="Levels"` opened by a `SlidersHorizontal` icon button, and keep Hold / Next / Stop / Levels / `•••` as the five 44 pt controls. On the phone also move `TimeCard` above `NextCard` in `booth-grid` (`order: -1` on `.booth-col-mid > [data-testid="booth-time"]`): time to Cumparsita is the glanceable number; the next title is a second look.

### 6. Booth at 1024 and 1440: the layout wastes the Now column and breaks the mid cards

**Before** (`l-dark-booth-playing`): at 1024 the mid row is two 240 px cards; "TIME TO LA C…" is truncated, "ends 07:08 (rehea" clips, the Next title breaks per word. At 1440 (`d-dark-booth-idle`) the Now card is 214 px tall in a 900 px viewport and the 230 px gap under it is empty; Next and Time only start at y = 440. A stage display should put the biggest number where the eye lands at 2 m.

**After**: at ≥ 1024 stack the Now column as Now → Time → Next with the Time card's two numbers side by side, and let the Set column take the remaining height. `app/globals.css` in the `@media (min-width: 1024px)` block:
```css
.booth-col-mid { grid-template-columns: minmax(0, 1fr); }              /* one column, Time above Next */
.booth-col-mid > [data-testid="booth-time"] { order: -1; }
.booth-card[data-testid="booth-time"] .booth-time-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
```
`components/booth/TimeCard.tsx`: put the clock + "ends" in the first cell and "TIME TO LA CUMPARSITA" + 44 pt in the second; never truncate the label (`whitespace-normal`). `components/booth/NextCard.tsx`: `booth-mid` title gets `text-wrap: balance` and a two-line clamp. Keep the 1600+ three-column variant.

### 7. The "no source" banner and the "Find…" column read as failures on a normal night

**Before** (`d-dark-booth-playing`: "42 items have no source and will be skipped."; `m-dark-booth-playing`: "51 items"; `t-dark-booth-playing`: "44 items"): in rehearsal mode the cortinas and any track without a Deezer preview have no source, which is expected, yet the DJ gets an amber banner at the instant they press Start and a red "Find…" link on every such row. The count also changes between runs (34 – 51 for the same set) because preview availability varies, so it looks random.

**After**: say what it means, once, in the Now card's chip row, and make "Find…" a row action rather than a column. `lib/booth/store.ts` line 433:
```ts
- if (missing) pushBanner({ key: "missing", text: `${missing} item${missing === 1 ? " has" : "s have"} no source and will be skipped.` });
+ if (missing && !rehearsal)
+   pushBanner({ key: "missing", text: `${missing} of ${plan.items.length} items have no file yet: they are skipped. Link your music folder to play them.`, action: { label: "Link folder…", onClick: linkFolder } });
```
(in rehearsal the Now chip "30 s rehearsal · cortinas skipped" says it; add `rehearsal && missing ? "cortinas skipped" : null` to the chip list in `NowCard.tsx` line 128). `components/booth/SetColumn.tsx` line ≈ 240: render `Find…` only on hover/focus (`opacity-0 group-hover:opacity-100 focus-visible:opacity-100`) on desktop and move it into the row's `•••` on touch; the row's `· no source` suffix already carries the state.

### 8. Booth Now card: duplicated chip, and the set column counts plan items, not tracks

**Before** (`d-dark-booth-idle`, every booth capture): "30 s rehearsal · 30 s rehearsal" — `SOURCE_LABEL.preview` and the `rehearsal &&` chip are the same string. The set column numbers rows 1-4 in tanda 1 and 6-9 in tanda 2 (`d-dark-booth-playing`), because `it.n` is the plan index; the DJ thinks in "track 2 of tanda 7".

**After**: `components/booth/NowCard.tsx` line 128:
```tsx
- {rehearsal && <span className="booth-chip">30 s rehearsal</span>}
+ {rehearsal && src !== "preview" && <span className="booth-chip">30 s rehearsal</span>}
```
`components/booth/SetColumn.tsx` line 219: `{it.kind === "cortina" ? "♪" : it.kind === "break" ? "—" : it.k + 1}` where `k` is the index inside the tanda (add it in `@tdj/core planBooth` next to `n`, or compute `items.slice(0, i).filter(x => x.tanda === it.tanda && x.kind === "track").length`). Also drop "0:30" from every row in rehearsal (`m-dark-booth-playing`): the column should show the planned length so the DJ can read the night, with "30 s" only in the Now chip.

### 9. The Export sheet's pinned primary is a dead end for a new DJ

**Before** (`m-dark-export-sheet`, `d-dark-export-sheet`): the only tinted button is a disabled "Connect Spotify and create playlist" with "Needs a Spotify Client ID. Add one in Settings." under it. The things that work with no set-up (M3U8, Rekordbox XML, CSV) are rows above the fold line, below two paragraphs about cortina trimming. Apple's share sheet puts the available destinations first and never pins a disabled action.

**After**: the pinned footer is the best destination that works *now*; Spotify is a row until it is connected. `components/ExportSheet.tsx` line 647:
```tsx
- footer={spotifyButton}
+ footer={hosted || spotifyToken ? spotifyButton : (
+   <button type="button" className="btn btn-primary min-h-[50px] w-full" onClick={() => download("m3u8")} data-testid="export-primary">
+     <Download size={18} aria-hidden /> Save for VLC and the Booth (M3U8)
+   </button>
+ )}
```
Move the "82 songs + 21 cortinas …" paragraph into the group footer of DJ SOFTWARE (it explains those files) and shorten the top group's footer to one sentence: "Cortinas stop at 45 s in files and in the Booth; Spotify plays them in full." Keep the Spotify row's trailing text but say what to do: "Set up in Settings ›".

### 10. Settings opens on connectors and status jargon; the DJ's own preferences are last

**Before** (`d-dark-settings`, `m-dark-settings`, `d-dark-settings-full`): group order is SEND YOUR SET TO (Spotify "Needs a Client ID", Google "Not enabled", Dropbox "Not enabled", Owner setup), ALSO USED (Deezer "Keyless", MusicBrainz "Keyless"), ADVANCED (webhook "Not set"), WRITTEN REVIEWS ("No key"), MEMORY, DJ APPS, PLAYBACK, REGION, APPEARANCE, STORAGE. Four of the first five rows are things the DJ cannot do anything about on this deployment. iOS Settings leads with the things you change most (Appearance, Region, Playback) and groups "accounts" under one row.

**After**: `app/settings/page.tsx` line ≈ 207, reorder: Appearance → Region → Playback → DJ apps → Memory → *Accounts* (one `Row` "Accounts and services" with sub "Spotify · Google · Dropbox · webhook", value "1 needs set-up", chevron, opening the current `<Connectors />` in a sheet or a sub-page) → Written reviews → Storage → Owner setup (last, with the key tile). Status values become plain: "Not enabled" → "Off", "Needs a Client ID" → "Set up", "Keyless" → "Built in", "No key" → "Off", "Not set" → "Off", "Unreachable" → "Offline". The amber dot stays only when the DJ can fix it here.

### 11. Score and cohesion copy expose the model, not the music

**Before** (`m-dark-score-sheet`: "100 % · weight 10", "0 violating tandas", "≤4–6 years"; `d-dark-tandas-miniplayer`: "85 seamless", "71 fine", "58 audible step"; `d-dark-history-detail`: "Seed 741930162 · Headline marathon DJ · 10/20/2026, 6:36:33 AM"). Health shows "Resting heart rate 58 bpm · Normal" and puts the derivation behind "About". Oura shows a 0–100 score with three-word descriptors and the contributors as named bars, never their weights.

**After**: `components/Composer.tsx` line 1560: drop `· weight {f.weight}`; show the factor as `label` / `sub` / value "100 %" and a bar whose *length* is the weight (the weight is still visible, as width). Put the rule ("≤ 1 singer per tanda") in `sub` only. `components/CohesionBadge.tsx` line 86: label the chip by name only ("Seamless", "Fine", "Audible step") with the number in `aria-label` and in the popover; use `text-[var(--label-2)]` for "Audible step" instead of amber so it is a note, not a warning. `app/history/page.tsx` line 296: footer `"Composed 20 Oct, 06:36 · seed in •••"` (the seed stays under Copy seed).

### 12. Three glass layers stack on the phone while previewing

**Before** (`m-dark-miniplayer`): from the bottom, the tab capsule, the minimised primary pill, then the mini-player: three separate glass surfaces, 230 px of chrome, over a card that is also showing "85 seamless". Apple Music docks the mini-player *onto* the tab bar as one piece; Spotify does the same with the now-playing bar.

**After**: the mini-player becomes the top edge of the tab bar region, and the primary pill hides while it is open. `components/MiniPlayer.tsx` line 83: on `< 640 px` position it at `bottom: calc(max(0.75rem, env(safe-area-inset-bottom)) + 60px)` with `inset-x-3`, `rounded-t-[22px] rounded-b-none`, and give the tab bar `data-docked` so its top corners square off (`[data-docked] { border-top-left-radius: 0; border-top-right-radius: 0 }`). `components/PrimaryBar.tsx`: add `hidden={hidden || playerOpen}` using `usePlayer((s) => s.open)`. One glass unit, 110 px.

---

## 2. Page-by-page smaller fixes

### Compose (empty)
- `d-dark-home-empty`: nine `PinOff` glyphs still render in the rows at 30 % alpha (round-4 P0-5c not done). Keep the glyph only when pinned.
- "Tanda shape · Slow, up, settle" and "Cycle · Classic TTVTTM" are jargon for a first run; add `sub` lines ("energy inside each tanda", "tango, tango, vals, tango, tango, milonga").
- Phone: the primary bar covers the NIGHT group's footer and the STRUCTURE header (`m-dark-home-empty`). Add `scroll-padding-bottom` / `padding-bottom: 140px` on `main` when the bar is shown.
- Tablet (`t-dark-home-empty`): the top pill has no Booth tab, and "phones and tablets reach it from the result's actions" (Nav.tsx line 21) means a DJ with an iPad in the booth has no way back to the Booth after visiting Settings mid-night except the result header. Add Booth to `items` for ≥ 640 px; on phones keep it out of the capsule but add it to the `•••` sheet first.

### Compose (result)
- Legend "Line: energy · dashed: target · ● tango ◉ vals ▣ milonga" is still drawn (round-4 P1-2 said to move it to `sr-only`). Health labels the axis once and lets colour carry the series.
- "Mood check · Your set next to Aren León's reference tandas": name the yardstick as a thing, not a person: "Against reference tandas (Aren León)".
- "Written review" row has no value; show "Off · needs an AI key" or "Ready" so the DJ knows before tapping.
- Phone: like/dislike are 40 × 44, tanda tiles 40 × 40, key/BPM chips 55 × 28 (`m-dark-tandas`). Make the chip a non-interactive label with the details on the row's `•••`, or give it `min-h-11`.
- "Listen" row on phones shows a chevron *and* a `•••` (`m-dark-tandas`): one disclosure per row. Move the tanda actions to the header row's `•••` only.
- Track titles truncate at 393 px ("La Vida M…", "Hoy al Re…") because the key chip and the year take 170 px. Drop the year on phones (it is in the tanda header) and the chip when the title would truncate.
- Desktop toolbar: the `share` icon and the Export action both exist; after change 2 the icon goes.
- The Spotify embed under "Listen" (`d-dark-tandas-miniplayer`) is a 190 px Spotify-branded card in the middle of an Apple-style list. Put it behind the row (collapsed by default on desktop too) and make the 30 s row-play the primary listen affordance.

### Composing
- Change 1. Also the `Disc3` glyph spins in the desktop capsule for a 0.7 s request; round-4 P1-5 asked for it to be static. Keep the spin for the phone bar only, where there is no Lottie.

### Booth
- Changes 5–8. In addition:
- "Booth (rehearsal)" as the page title: keep the title "Booth" and show the mode as a chip under it; a title that changes width shifts the whole header.
- Idle status "Ready: tap Start the night" duplicates the button. Use "Ready" and let the button speak.
- Hold → primary "Keep going" while the status says "Holding after this song" (`m-dark-booth-hold`): the DJ is looking for the thing that cancels the hold; label it "Cancel hold" and keep "Play" for the paused state.
- Stop button: the red ring makes it look *active* while nothing is playing (`m-dark-booth-idle`). Render it `text-[var(--label-3)]` until `started`.
- The Level meter is green across its whole length at −18 dBFS; Logic and Apple's own meters go green → yellow → red by level, not a single green. Colour the segment above −6 yellow and above −1 red.
- Set column: the lock glyph on tanda 1 is 30 % grey and means "read-only because it is playing"; add `title="Playing now"` and use the filled lock in tint.
- Onboarding sheet (`d-dark-booth-onboarding`): the "Spotify" row is grey text at 2.5:1 with "Not logged in with Spotify." Disabled rows should still be 4.5:1 for the label; use `--label-2` and put the reason in `sub` only.
- "Deezer previews: every rule of the booth on 30 s of each item" → "30-second clips, so you can rehearse the night without your files."
- Light theme in the booth (`d-light-booth-playing-light`) works; the brown banner becomes pale yellow on white, which is fine; the meter's green is 3.1:1 on white, below the 3:1 line only by rounding. Darken it one step in light.

### History
- Row: "Tue · Golden age · 4 h" with value "Current" and the sub "06:36 AM · 4 h · Golden Age · Two peaks · 22 tandas · played 2026-10-20 · 0:00 h · 0 holds · rehearsal": the sub repeats the title and shows an ISO date. Make the title the event or venue when known, otherwise "Tuesday milonga", and the sub "4 h · 22 tandas · Golden Age · rehearsed 06:36". A night that was rehearsed for 40 s should not be logged as "played 0:00 h"; threshold at 10 min, otherwise "rehearsed".
- Detail sheet (`d-dark-history-detail`): "91/100 4 h · Golden Age · Two peaks · 22 tandas · played …" runs the score into the metadata on one line; put the score on its own line as the Compose header does.
- Empty state: a crate and one line, fine; it should offer "Compose a night" as the Booth's empty state does (the Library empty state `m-dark-library-empty` has the same crate).

### Database
- "Index built Oct 18, 2026 · 21,932 songs · 0 changes" → "21,932 recordings · updated 18 Oct". "Changes" are the DJ's edits; show them in the YOUR RECORDINGS group instead.
- Phone segmented control is six items at 15 pt; "Orch." is the only abbreviation. Round-4 P1-4 proposed 3 + More; still open.
- The crate illustration with "Search the index to edit a recording, or add your own below." is fine, but it is the same illustration as Library and the Booth; use a different crate state per page or none.

### Library
- Good. The orchestra list at 1440 is centred in a 1000 px column while Compose is 1360 px wide; align both to the same max width.

### Guide
- Reads well. "HOUSE RULES" and "READ MORE" are headers inside an article; use title3 heads, not uppercase group headers.

### Settings
- Change 10. Also: the "Owner setup" row with a key tile belongs to the person who deployed the app, not the DJ; hide it when the deployment already has its providers configured.
- Spotify sheet (`d-light-connector-spotify`, `m-dark-connector-spotify`): a 60-word footer explaining developer apps and redirect URIs. Keep "Connect Spotify" enabled, and if it fails open the existing "Spotify did not let you in" sheet, which already has the explanation.
- Webhook sheet (`d-dark-connector-webhook`): the footer lists headers and query parameters; move that to the Guide and leave "Paste a Pipedream, Make, Zapier or n8n URL. TDJ sends the exported file there."
- Phone light: tab labels at 10 pt tint on the glass measure 4.09:1 (`m-light-settings`); iOS uses a darker tint for text on light glass. Set `--tint-text` one step darker in light and use it for tab labels and 13 pt links.

### Admin
- `/admin` (`d-dark-admin`, `m-dark-admin`) is a fair iOS form: one field, one action, one footer. Fixes: the title truncates to "Owner se…" on the phone because "Owner guide" sits in the trailing slot; make the link an `icon-btn` with the book glyph on phones. The URL line "https://… · stage production" is for the owner; keep it but drop "stage". "Unlock" disabled is 2.5:1; a disabled button may be low contrast, but then the field needs a visible placeholder ("Paste the code") so the page is not two grey words.

### Global
- The tab capsule and the primary bar both minimise on scroll, but the minimised primary pill sits exactly where a tanda header's `•••` is (`m-light-tandas`); shift it to the right edge (`right: 12px; left: auto`) so it never covers a row control.
- Ambient wallpaper: the light theme still shows a peach-to-lilac wash behind white cards (`d-light-home-empty`). Round-4 P1-6 and round-5 §3 asked for a non-tinting wallpaper; the cards are white but the page is not neutral. Reduce to 6 % as the Health background does.
- Focus: `select` behind picker rows now shows the ring (round-4 P0-6c done).

---

## 3. First-run flow proposal

What a new DJ sees today: "Compose" + 38 controls. What they should see: the product, with the set-up folded.

**Empty home (phone and desktop)**

```
Compose                                          [desktop: Compose the night]

┌────────────────────────────────────────────────────────────────┐
│  A night, composed                                              │
│  Four hours of Golden Age tandas with cortinas, scored against  │
│  24 house rules. Change anything, or just compose.             │
│                                                                  │
│  ①  Compose      one tap builds the set and scores it           │
│  ②  Read         the energy arc, the tandas, the cortinas        │
│  ③  Play or send Booth plays it from your files; Export sends   │
│                  it to VLC, Rekordbox or Spotify                 │
│                                                                  │
│  [ Compose a 4 h milonga ]        Or set up the night below ↓    │
└────────────────────────────────────────────────────────────────┘

SET-UP                                                      (folded)
  4 h · Golden Age · Two peaks · Family cortinas              Edit ›
```

- The hero is a `group-inset` on `surface` (no glass; content layer). The three steps are `Row`s with number tiles, not prose.
- The form is folded on first run exactly as it is folded after a set exists today (`Disclosure` + the "Set-up" summary row). The row's value states the defaults so the DJ knows what one tap will do. Tapping Edit opens the groups in place.
- Phone bar: "Compose the night" unchanged. Desktop toolbar: "Compose the night" unchanged until the first set, then change 2 applies.
- After the first compose: scroll to the result, and show a one-time footnote under the score ("Tap a chip to adjust, lock a tanda to keep it, Export when you are happy") that disappears on the second compose (`localStorage` key `tdj-first-set-seen`).
- Health does exactly this on a fresh install: a summary card explaining what will appear, with the set-up in a sheet. Oura's first screen is a score card with "Today" and the explanation under it. Apple Music's empty Library is a one-line empty state with the primary action in the bar, not a form.

**Copy for the folded set-up row**, from the current state: `${hours} h · ${eraLabel} · ${arcLabel} · ${cortinaStyle} cortinas` (e.g. "4 h · Golden Age · Two peaks · Family cortinas"), value "Edit".

**Booth first run**: the "Compose a night first" empty state is right. Once a set exists, the first visit should open the onboarding sheet automatically (it does not today; the DJ has to find "Set-up" under `•••`), and the "Start" button label should name the source: "Start with 30 s clips" / "Start from your files" / "Start with Spotify".

---

## 4. Reference patterns used

| App | Pattern borrowed | Where it applies |
| --- | --- | --- |
| Apple Health | Summary card first; derivation behind "About"; one axis label and colour for series; period picker in the collapsed bar | §3 hero, change 11, result legend, Database segmented |
| Apple Music | Mini-player docked onto the tab bar as one glass unit; playlist page shows the content with "Edit" one tap away; destructive or replacing actions never the only tinted capsule | changes 2, 12; folded set-up row |
| Spotify | Now-playing bar at the top edge of the tab bar; "Find…"-style secondary actions hidden until hover; dense set list with the current row tinted | changes 7, 12; booth set column |
| Oura | Score 0–100 with a three-word verdict and named contributors (no weights); descriptors over numbers on chips | change 11 |

---

## 5. Captures

`docs/reviews/round8-ux/`, 57 files, 1600 px wide max, 256-colour PNG. Phone: `m-dark-home-empty`, `m-dark-home-empty-full`, `m-dark-composing`, `m-dark-after-compose-top`, `m-dark-tandas`, `m-dark-miniplayer`, `m-dark-bar-minimised`, `m-dark-adjust-sheet`, `m-dark-export-sheet`, `m-dark-score-sheet`, `m-dark-booth-idle`, `m-dark-booth-onboarding`, `m-dark-booth-playing`, `m-dark-booth-hold`, `m-dark-history`, `m-dark-database`, `m-dark-library-empty`, `m-dark-settings`, `m-dark-connector-spotify`, `m-dark-admin`, `m-light-home-empty`, `m-light-after-compose-top`, `m-light-tandas`, `m-light-settings`, `m-light-booth-idle`. Tablet: `t-dark-home-empty`, `t-dark-after-compose-top`, `t-dark-booth-idle`, `t-dark-booth-playing`, `t-dark-history`. 1024: `l-dark-after-compose-top`, `l-dark-booth-idle`, `l-dark-booth-playing`. Desktop: `d-dark-home-empty`, `d-dark-after-compose-top`, `d-dark-tandas-miniplayer`, `d-dark-miniplayer`, `d-dark-export-sheet`, `d-dark-booth-idle`, `d-dark-booth-onboarding`, `d-dark-booth-playing`, `d-dark-history-detail`, `d-dark-database`, `d-dark-library`, `d-dark-guide`, `d-dark-settings`, `d-dark-settings-full`, `d-dark-connector-google`, `d-dark-connector-webhook`, `d-dark-admin`, `d-light-home-empty`, `d-light-after-compose-top`, `d-light-result`, `d-light-export-sheet`, `d-light-booth-playing-light`, `d-light-connector-spotify`, `d-light-settings`.
