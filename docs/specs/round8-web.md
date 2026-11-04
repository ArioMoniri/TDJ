# Round 8 — web: what changed and why

Implements the twelve changes and the page-by-page fixes of `docs/reviews/round8-ux.md` (except change 9, the
Export sheet, which is handled separately). Before captures: `docs/reviews/round8-ux/`; after captures, same names,
phone 393 × 659 and desktop 1440 × 900: `docs/reviews/round8-ux-after/`. Tests: `apps/web/e2e/round8-ux.spec.ts`
plus the round-4/5/6/7 and motion specs that asserted the old behaviour.

## The twelve changes

| # | Change | Where |
| --- | --- | --- |
| 1 | The compose narrative paints one step at a time: `StepLabel` cross-fades with `AnimatePresence mode="wait"` (no `popLayout` collision); a step lasts 700 ms and the narrative appears only when a compose lasts past 900 ms. The desktop capsule's disc no longer spins (`spin={false}`, round-4 P1-5); the phone bar keeps the spin. | `components/ComposeNarrative.tsx`, `Composer.tsx` |
| 2 | With a set on screen the toolbar's tinted capsule is **Export** (`toolbar-export`, ⌘E) and **Regenerate** is the ghost next to it (`toolbar-regenerate`, ⌘↩), mirroring the phone bar; the share icon-button is gone. Below 1024 px the Regenerate is an icon-only twin so the tablet pill never overflows; phones keep Regenerate in the primary bar only. | `Composer.tsx` |
| 3 | First run: a hero card ("A night, composed") above the form says what one tap produces, with three numbered rows and a tinted "Compose a 4 h milonga" on ≥ 640 px (the phone bar is the same action). The page subtitle and the duplicated empty-state copy are gone; the form stays open under it (the e2e contract reads its controls before the first compose, so folding it on first run is deferred). | `Composer.tsx` |
| 4 | Phone result header: "Play the night" is a 44 pt icon-only ghost (label `sr-only`), so it no longer wraps to three lines and the serif set name keeps its width. Booth is the first item of the phone `•••` sheet. Like / dislike are 44 × 44. | `Composer.tsx` |
| 5 | Phone booth: one 64 pt row (Hold / Next / Stop / **Levels** / •••); the cortina and master faders live in a Levels sheet. While a night runs (`html[data-booth-live]`) the tab bar leaves and the strip takes its place; "Leave the booth" in `•••` is the way out. The Time card sits above Next on phones. | `app/booth/page.tsx`, `booth/ControlStrip.tsx`, `booth/Sheets.tsx`, `globals.css` |
| 6 | ≥ 1024 px: the mid cards are one column, Time above Next, the clock + "ends" and the Cumparsita number side by side (`.booth-time-row`); the label never truncates, the Next title balances on two lines at most. | `booth/TimeCard.tsx`, `booth/NextCard.tsx`, `globals.css` |
| 7 | The amber "N items have no source" banner is gone in a rehearsal (the Now chip says "N without a clip, skipped"); from files it says what it means and offers "Link folder…". "Find…" shows on hover / focus where there is a pointer; on touch it stays. | `lib/booth/store.ts`, `booth/NowCard.tsx`, `booth/SetColumn.tsx`, `globals.css` |
| 8 | The Now card never repeats "30 s rehearsal" (the chip hides when the source badge already says it). The set column numbers tracks inside their tanda (1–4, not 6–9) and shows the planned length (the 30 s lives in the Now chip). | `booth/NowCard.tsx`, `booth/SetColumn.tsx` |
| 9 | Export sheet: not in this round (handed over separately). | — |
| 10 | Settings order: Appearance → Region → Playback → DJ apps → Memory → Accounts and services (the connector rows, with the Owner setup row last inside it) → Written reviews → Storage. Statuses in plain words: "Needs a Client ID" → "Set up", "Not enabled" → "Off", "Keyless" → "Built in", "Unreachable" → "Offline", "No key" / "Not set" → "Off". Shorter Spotify, "Also used" and webhook footers. The connector rows stay inline (the connectors and admin specs read them by id on `/settings`), not behind one row. | `app/settings/page.tsx`, `components/Connectors.tsx` |
| 11 | Score sheet: "100 %" per factor, the bar's **length** is the weight (no "· weight 10"); the rule stays in the sub-line. Cohesion chips carry the name only ("Seamless"), the number is in the accessible name and the popover; "Audible step" is a secondary label, not amber. History detail: "Composed 20 Oct, 06:36 · verdict · seed under •••". | `Composer.tsx`, `CohesionBadge.tsx`, `lib/audio.ts`, `app/history/page.tsx` |
| 12 | Phone: the mini-player docks onto the tab bar as one glass unit (square bottom corners meet the bar's squared top, `data-docked`), and the primary bar / pill hide while it is open. | `MiniPlayer.tsx`, `PrimaryBar.tsx`, `Composer.tsx`, `globals.css` |

## Page-by-page

- **Compose (empty)**: unpinned pin glyphs show only on hover / focus with a pointer (faint on touch); "Tanda shape"
  and "Cycle" have sub-lines; the phone `main` pads 210 px under the primary bar (`html[data-primary-bar]`) so the
  last rows clear it; the tablet pill gains a Booth tab (phones keep six).
- **Compose (result)**: the curve legend is `sr-only` (colour carries the series); "Mood check · Against reference
  tandas (Aren León)"; the Written review row says "Ready" or "Off · needs an AI key" (the organiser's shared key
  counts); phones drop the year on track rows and the key chip becomes a label (details on `•••`); the tanda
  actions `•••` sits on the header row at every width, so the Listen row has one disclosure.
- **Booth**: title "Booth" with a "Rehearsal · 30 s clips" chip; idle status "Ready"; "Cancel hold" while a hold is
  pending; the stop ring is red only once a night runs; the running tanda's lock is a filled tint lock titled
  "Playing now"; the Start button names the source ("Start with 30 s clips" / "Start from your files" / "Start with
  Spotify"); the onboarding Spotify row keeps a 4.5:1 label with the reason in the sub-line; rehearsal copy
  "30-second clips, so you can rehearse the night without your files"; a darker light-theme green for the meter.
- **History**: titles are the event ("Tuesday milonga", "Saturday práctica"), the sub-line "4 h · 22 tandas ·
  Golden age · Two peaks · composed 06:36 / rehearsed 06:36 / played 3:58 h"; a night under ten minutes is
  "rehearsed", never "played 0:00 h"; the detail sheet puts the score on its own line; the empty state offers
  "Compose a night".
- **Database**: "21,932 recordings · updated 18 Oct"; the edits count appears only once there are edits (the
  `db-changes` node stays for assistive tech); phones get Songs · Orchestras · Cortinas · More ▾ (a sheet with
  Rules, Context, Memory; the More segment names the open one).
- **Guide**: "House rules" and "Read more" are title3 heads (`Group titleHeader`), not uppercase group headers.
- **Admin**: on phones the Owner guide link is a book glyph (the title stayed whole); the subtitle drops "stage";
  the unlock field has a placeholder ("Paste the code" / "Enter the passphrase").
- **Global**: the minimised primary pill sits at the right edge (never over a tanda header's `•••`); the light
  wallpaper is near neutral (`--ambient-wash` 14 %, blobs 6 %, also under `prefers-color-scheme: light`);
  `--tint-text` is one step darker rose in light for the 10 pt tab labels.

## Deferred (deliberately)

- Folding the set-up form on first run (round-3/4 specs drive the form's controls before the first compose).
- Opening the booth onboarding sheet automatically on the first visit (a sheet under the strip blocks the keyboard
  and the Start button the round-7 spec drives).
- A different crate illustration per empty state (needs new Lottie assets); aligning the Library column width with
  Compose; moving "Find…" into a per-row `•••` on touch (it stays visible there); enabling "Connect Spotify" without
  a Client ID (there is nothing to connect with); the Export sheet (change 9).

## Performance

No new glass layers: the Levels sheet is the existing `Sheet`, the docked player replaces three stacked surfaces
with one, the hero is a `group-inset` on the content layer, and the booth tab-bar hide is `visibility`. Nothing was
added to the compose-time render path (the hero unmounts with the first set).
