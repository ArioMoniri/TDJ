# Round 22 — test-user panel on the live site

Date: 2026-11-14 · Site: https://d3k5k2c1l0s5ri.cloudfront.net · Method: Playwright (Chromium /opt/pw-browsers/chromium, deviceScaleFactor 1), axe-core 4.10.2 for WCAG 2.1 AA, Playwright aria snapshots.
Screenshots: `/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/r22-test/` (written `S/` below). Scripts that reproduce every step are in `S/scripts/` (`p1*` DJ, `p2*` organiser, `p3*` newcomer, `p4*` accessibility).

> **Read this first.** The live site was last deployed on **12 Nov 02:19 UTC** (`last-modified` of `/featured/golden-double-peak.json`). Nothing from round 21 is live: the Swap sheet, booth row play, Skip tonight, Last 4 tandas tango only, Jump to La Cumparsita, and the 25-tanda featured night (live has 23, the repo has 25). Every finding below is from the live build. Items marked *(re-test after deploy)* may already be fixed on `main`. Items marked *(still in HEAD)* were checked against the current source.

## Counts

| Severity | Count |
|---|---|
| Blocker | 2 |
| Major | 10 |
| Minor | 16 |
| Polish | 8 |
| **Total** | **36** |

---

## Persona 1 — Milonga DJ, MacBook 1440×900

| # | Task | Result | Time / steps | Issues |
|---|---|---|---|---|
| 1 | Open `/?featured=golden-double-peak` | OK. Score 91, 23 tandas, 4 h 01 min | 4.8 s to network idle · 1 step | B1 (23, not 25 tandas), P1 (console error) |
| 2 | Review tandas | OK, but titles are cut off in the 2-column grid | — | M8, P3, m14, m15 |
| 3 | Swap a song (track 2 of tanda 2) | Partial. The swap button only appears on hover. Clicking it replaces the song at once, with no choice and no undo. The new song was worse: Cosas Olvidadas (136 BPM) became Patotero Sentimental (108 BPM, no clip), and the tanda went from "Audible step 56" to "Jarring 44" | 0.8 s · hover + 1 click | M1, M2 |
| 4 | Swap a whole tanda | Partial. Instant replacement (Di Sarli → Rodríguez) with no picker. Server round trip 3.2 s | 3.5 s · hover + 1 click | M1, M6 |
| 5 | Lock a tanda, then Regenerate | OK. Tanda 3 was kept and the note "1 locked tanda stays where it is" appeared. Two lock icons show on the locked card | 1.9 s regenerate | m1, M4 (no undo) |
| 6 | Track "•••" menu | Only "Find on services…" and "Analyse in browser". No Swap, Play, Skip or Open in database | 1 click | M2 |
| 7 | Tap a song to test it | Compose: OK. The row number becomes ▶ on hover and plays a 30 s Deezer preview in a mini player. Booth: tapping a row does nothing on live (round-21 row play not deployed) | 1 click | B2, m8 (mini player covers the cards) |
| 8 | Open Play the night | OK. Opens `/booth` in rehearsal (30 s clips) | 3.3 s · 1 click | m6 |
| 9 | Start / Pause / Resume | OK. "Paused: tap Resume". Song countdown runs | 1 click each | B2 (intermittent 403 skips) |
| 10 | Stop | OK. A confirm sheet offers "Fade out and stop (3 s)" or "Stop now"; Esc and Enter are documented | 2 clicks | — |
| 11 | Skip a tanda | **Fail.** Only "Next at gap" exists, and it skips one queued item, not the tanda | — | B1 |
| 12 | Jump to La Cumparsita | **Fail.** Not in the booth "More" menu (Set-up, Rehearsal, Link music folder, Hold, Mix, Birthday vals, Break, Keyboard shortcuts, Light theme, Leave, End the night) | — | B1 |
| 13 | Change cortina / master volume | OK. Sliders announce "75 %" and "-5 dB" | Arrow keys | — |
| 14 | Find fades | OK. The "Mix: levels and fades" icon opens a full sheet (pause fade, fade-out, crossfade, song-end fade, cortina in/out, gap). Each cortina row also has its own fades button. Both are icon-only | 1 click | P6 |
| 15 | Tell the DJ "no Biagi" | Works, but rebuilt 22 of 23 tandas (score 91 → 86) | **29.9 s** | M4, M6 |
| 16 | Export to Spotify | OK. "Spotify · Log in" in the Export sheet redirects to accounts.spotify.com in the same tab (stopped there) | 5 s · 2 clicks | — |
| 17 | M3U8 download | Downloads in 0.3 s, but the file holds 108 `spotify:track:` URIs and no file paths. The sheet closes after each download | 2 clicks | M5, m7 |

Screens: `S/dj-01-featured.png`, `S/dj-02-swap-sheet.png` (instant swap result, Jarring), `S/dj-03-track-menu.png`, `S/dj-05-swap-tanda.png`, `S/dj-07-tap-play.png`, `S/dj-10-booth.png`, `S/dj-14-booth-more.png`, `S/dj-17-booth-stopped.png`, `S/dj-18-booth-403.png`, `S/dj-20-mix-sheet.png`, `S/dj-28-booth-swap.png`, `S/dj-30-export.png`, `S/dj-32-spotify-oauth.png`, `S/dj-09b-tell-dj-apply.png`.

## Persona 2 — Organiser, iPad 1180×820 landscape and 820×1180 portrait (touch, iPad UA)

| # | Task | Result | Time / steps | Issues |
|---|---|---|---|---|
| 1 | Open home | OK. A 3-step intro, a "Compose a 4 h milonga" CTA and a Featured night card, with the settings below | 4.6 s | — |
| 2 | Set length to 3 h | Partial. Tapping the slider track did not move it; arrow keys did ("3 h · ≈16 tandas") | 2–3 tries | m10 |
| 3 | Change era to Golden extended, arc to Single peak, cortinas to Matched, Birthday vals on | OK. The arc segmented control is 28 px tall | 4 taps | m2, P4 |
| 4 | Compose | OK: "3 h 06 min · 17 tandas · 14 orchestras · matched cortinas", score 92 | **4.6 s landscape / 22.3 s portrait** (same request) | M6 |
| 5 | Change era/rules after composing | Hard. The settings panel disappears. The only way back is "Edit" in a SET-UP card at the very bottom (y ≈ 8 100 px; the portrait page is 9 669 px tall) | Long scroll + 1 tap | M7 |
| 6 | Swap or lock on touch | Swap and Lock buttons have computed opacity 0 on touch. Lock and Swap tanda are also in the tanda "•••" menu, but there is no visible way to swap a single track | — | M2 |
| 7 | Database tab: find "Cosas Olvidadas" | OK. 8 copies show as cards with Year, Singer, Rhythm, Energy, BPM, Resolved, Analysed audio, Spotify URI and a "Shown in sets" toggle. No play button on any version | 2.8 s | m11, missing §3 |
| 8 | Edit a song (energy 48 → 60) | OK. Edit → field → "1 change", with Revert per card. In edit mode the values look like disabled grey placeholders | 3 taps | m11 |
| 9 | Find learned preferences | Found under Database › Memory: "Nothing learned yet. Repeated feedback becomes a preference". Swaps and locks are not learned | 2 taps | m13 |
| 10 | Change language | **Not available.** Settings has no language control (no Turkish) | — | missing §7 |
| 11 | Booth in portrait | OK. Now / Next / Time cards above the set list, transport in a floating bar. A default 4 h night shows "**21 not rehearsable**" | — | M3 |

Screens: `S/ipad-01-home.png`, `S/ipad-02-settings-set.png`, `S/ipad-05-composed.png`, `S/ipad-p-03-bottom-edit.png`, `S/ipad-p-05-booth.png`, `S/ipad-11-db-search.png`, `S/ipad-14-db-edited.png`, `S/ipad-15-db-memory.png`, `S/ipad-20-settings-full.png`.

## Persona 3 — Newcomer, phone 390×844 (touch, iPhone UA)

| # | Task | Result | Time / steps | Issues |
|---|---|---|---|---|
| 1 | Understand what the app does | Good. "A night, composed": Compose → Read → Play or send, plus "Compose the night is in the bar below" | 3.2 s | P5 |
| 2 | Compose a night | OK: "3 h 56 min · 22 tandas", score 88 | **14.1 s**, with only "Composing…" shown | M6 |
| 3 | Play it | Hard to find. The result card's play control is an unlabelled 44 px ▶ icon. The bottom bar offers Regenerate / Export / •••, and the tab bar has no Booth | 1 tap once found | m3 |
| 4 | Start in the booth | Plays (countdown 0:26), but "**18 not rehearsable**", so a third of the night is skipped | 4.2 s | M3, B2 |
| 5 | Find help | The Guide tab explains tandas, the cycle, arc and cortinas well, but never mentions the app's own words ("cohesion", "rehearsal", key codes like "3A"). It is 12 270 px long on a phone with no table of contents | 1 tap | m12 |
| 6 | Tap "Jarring" / cohesion chip | Good. The sheet explains transitions with tempo/loudness/key bars and the thresholds | 1 tap | — |
| 7 | Library / History | OK. History stays empty until a compose finishes scoring, which is correct | — | — |

Screens: `S/phone-01-home.png`, `S/phone-02-composed.png`, `S/phone-04-booth-playing.png`, `S/phone-10-guide.png`, `S/phone-13-cohesion.png`.

## Persona 4 — Accessibility (keyboard only, focus, contrast, names)

| # | Task | Result | Issues |
|---|---|---|---|
| 1 | axe WCAG 2.1 AA: compose, booth, settings, database, guide, library | Only colour-contrast fails: compose 4, **booth 108**, settings 2, database/guide/library 0 | M9 |
| 2 | Keyboard through compose | Every control is reachable and focus rings show, including the energy-curve nodes. No skip link: 8 nav links and 23 curve nodes come before "How this set scored" (tab stop 38). Each track row takes 4 stops (row `li`, Play, Swap, actions). Hover-only Swap/Lock appear on focus (good) | M10 |
| 3 | Keyboard through the booth | The shortcuts are good (space, esc, →, f, x, h, t, ↑/↓, c, b, m, ?). By Tab, the transport (Start, faders, Mix…) comes after the whole set list, more than 120 stops | M10 |
| 4 | Keyboard through settings | All reachable. The file-naming input and API-key input show no focus ring. The Region select is an opacity-0 native select under a styled cell (works, the ring lands on the cell) | m4 |
| 5 | Screen-reader names | No unnamed buttons or links on any page (aria snapshot `S/a11y-booth-snapshot.yml`). Weak names: booth "Swap track 6" (global index, no title); the "Tell the DJ", Database search and API key inputs are named only by placeholder | m4, m5 |
| 6 | Touch-target sizes (CLAUDE.md ≥ 44 px) | Lock/Swap 36×36, adjust chips 32 px tall, arc radios 28 px, steppers 47×32, key chips 28 px; phone curve nodes 40×40, 14 px apart | m2 |

Screens: `S/a11y-compose-tab25-crop.png` (curve node focus ring), `S/a11y-booth-tab10.png`, `S/a11y-settings-tab12.png`.

---

## Consolidated issue list (de-duplicated, ranked)

`S/` = `/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/r22-test/`

### Blocker

**B1. Live site is about 2.5 days behind `main`; the DJ's round-21 features are missing.**
- Page: all (Compose, Booth).
- Steps: open the featured night, then open the Booth "More" menu.
- Expected: 25 tandas; Skip tonight per tanda; Jump to La Cumparsita and Play the rest, then La Cumparsita; the Swap sheet; booth row play.
- Actual: 23 tandas. None of those controls exist. `last-modified: Thu, 12 Nov 2026 02:19:07 GMT` on `/featured/golden-double-peak.json`. Commits `dffd37f`, `6ec7942` and `bef8c3b` (14 Nov) are not deployed.
- Screens: `S/dj-14-booth-more.png`, `S/dj-01-featured.png`.
- Fix: deploy (`.github/workflows` "Deploy to AWS" / `pnpm deploy`, docs/DEPLOY.md), then re-run this panel.

**B2. Rehearsal clips and tap-to-test fail at random with 403 (expired Deezer link); the booth skips the songs.** *(still in HEAD)*
- Page: Booth (also Compose ▶ and Database "Analyse").
- Steps: load a set, reload `/booth`, Start.
- Expected: the clip plays.
- Actual: the banners read "Agua Florida: Preview request failed (403) (skipped)" and "Ahora No Me Conocés: … (skipped)". `/api/preview?…&json=1` returned a `cdnt-preview.dzcdn.net` URL whose `hdnea=exp=` was already about 4 minutes in the past (the response was `x-cache: Miss`, so the stale link came from the Lambda).
- Cause: `apps/web/src/app/api/preview/route.ts` caches the link for `TTL = 6 h` per instance (its comment assumes the link lasts about 24 h, but Deezer links expire in about 15 min). It also sends `cache-control: private, max-age=3600`. `apps/web/src/lib/booth/sources/preview.ts:79` throws on the first 403 without fetching a fresh link.
- Fix: cache until `exp - 60 s` parsed from `hdnea`; on a 403, refetch with a cache-buster once; drop the browser max-age to below the expiry.
- Screen: `S/dj-18-booth-403.png`.

### Major

**M1. Swap replaces at once with a random, often worse, often unplayable pick; there is no choice and no undo.** *(re-test after deploy: the round-21 `SwapSheet.tsx` is not live)*
- Page: Compose and Booth.
- Steps: hover track 2 of tanda 2 → Swap.
- Expected: a sheet with candidates, preview, and why each fits; undo.
- Actual: Cosas Olvidadas (136 BPM) became Patotero Sentimental (108 BPM, "Find on services", no clip), and the tanda went from "Audible step 56" to "Jarring 44". In the booth, swapping track 2 gave "Pero Yo Sé" (no clip), and "not rehearsable" went from 1 to 5. The toast "Track 2 of tanda 1 swapped" has no Undo.
- Screens: `S/dj-02-swap-sheet.png`, `S/dj-28-booth-swap.png`.
- Files: `apps/web/src/components/TrackRow.tsx`, `TandaCard.tsx`, `booth/SetColumn.tsx`, `app/api/swap/route.ts`, `app/api/swap-track/route.ts`.

**M2. Swap and Lock are invisible on touch, and the track menu has no Swap.** *(still in HEAD)*
- Page: Compose (iPad, phone).
- Steps: on the iPad, look for a way to swap one song.
- Expected: a visible control, or Swap in the "•••" menu.
- Actual: `opacity-0 … group-hover/row:opacity-100` (computed opacity 0 on touch). The track "•••" menu has only "Find on services…" and "Analyse in browser".
- Files: `TrackRow.tsx` (group-hover/row), `TandaCard.tsx:286,298`.
- Screens: `S/dj-03-track-menu.png`, `S/ipad-05-composed.png`.

**M3. Default nights are largely unrehearsable.**
- Page: Booth.
- Steps: compose the default 4 h night → Play the night.
- Expected: nearly every track has a clip; the composer prefers recordings it can play.
- Actual: "21 not rehearsable" (iPad) and "18 not rehearsable" (phone), against 1 on the featured night. A newcomer hears a third of the night skipped.
- Files: `components/booth/NowCard.tsx:145`; clip coverage and the engine's track choice (`packages/core/src/tanda.ts`, `data/cache/*`).
- Screens: `S/ipad-p-05-booth.png`, `S/phone-04-booth-playing.png`.

**M4. Targeted requests and Regenerate throw away the whole night with no confirm or undo.**
- Page: Compose.
- Steps: featured night → "Tell the DJ: no Biagi" → Apply. Or press Regenerate.
- Expected: only the Biagi tandas change; a curated night asks before being replaced, or offers Undo.
- Actual: "22 tandas replaced (1, 2, 3 …) · score 91 → 86". Regenerate replaced the featured night (91 → 87) silently.
- Files: `components/FeedbackBar.tsx`, `components/Composer.tsx`, `app/api/ai/refine/route.ts`.
- Screen: `S/dj-09b-tell-dj-apply.png`.

**M5. The M3U8 exports cannot be played in VLC; two buttons give the same file.**
- Page: Export sheet.
- Steps: Export → "M3U8 playlist" and "Save for VLC and the Booth (M3U8)".
- Expected: file paths (or a clear "needs a music folder" warning) for VLC.
- Actual: both files are byte-identical, 108 entries, all `spotify:track:` URIs, 0 file paths.
- Files: `components/ExportSheet.tsx:810`, `lib/download.ts`, `lib/exportPaths.ts`.
- Saved files: `S/dl-*.m3u8`.

**M6. Compose and refine are slow, and the wait is unexplained.**
- Page: Compose.
- Measured: the same 4 h compose took 4.6 s, 14.1 s and 22.3 s; Tell the DJ took 29.9 s; a tanda swap took 3.2 s. The only feedback is "Composing…" and "Scoring the night…" on the button.
- Expected: under 5 s, or stepwise progress.
- Files: `app/api/compose/route.ts` (cold start, auto-improve pass), `components/Composer.tsx`.

**M7. After composing, the night's settings are only reachable from the very bottom.**
- Page: Compose (all sizes).
- Steps: compose, then try to change the era.
- Expected: Edit/Settings next to the title or in the header.
- Actual: "SET-UP · Edit" card after the closing Cumparsita (iPad portrait page is 9 669 px tall).
- File: `components/Composer.tsx:1810`.
- Screen: `S/ipad-p-03-bottom-edit.png`.

**M8. Song titles are truncated in the 1440 tanda grid.**
- Page: Compose (two columns at 1440).
- Actual: "Patotero …", "Lo Pasad…", "En un Be…", "Luna de P…", because key/BPM chips and energy bars take the width.
- Expected: titles win; demote the chips or wrap the line.
- File: `components/TrackRow.tsx`.
- Screen: `S/dj-02-swap-sheet.png`.

**M9. Contrast fails (WCAG 1.4.3).**
- Booth: 108 nodes; set-list durations and meta at 2.45–2.54:1 (`--label-3` on the dark surface).
- Compose: the "Jarring" chip is 3.25:1 (#e5484d on #fbe5e6); the Regenerate label is 3.66:1.
- Settings: the theme segments are 4.43:1.
- Files: `app/globals.css` (booth tokens), `components/CohesionBadge.tsx`, `components/PrimaryBar.tsx`.
- Data: `S/axe.json`.

**M10. Keyboard order in the booth and compose is costly.**
- No skip link. In the booth, the transport and faders come after the whole set list (more than 120 tab stops). In compose there are 4 stops per track.
- Expected: skip link; transport early in the DOM (or a landmark plus `F6`); the row `li` not tabbable when it holds buttons.
- Files: `app/layout.tsx`, `app/booth/page.tsx`, `components/booth/ControlStrip.tsx`, `TrackRow.tsx`.

### Minor

| ID | Issue | Page / steps | Expected vs actual | Screen | Likely file |
|---|---|---|---|---|---|
| m1 | Locked tanda shows two lock icons (a pink "Unlock" button and an amber lock badge) | Compose, lock tanda 3 | One state icon vs two | `S/dj-07-tap-play.png` | `components/TandaCard.tsx` |
| m2 | Touch targets < 44 px (CLAUDE.md rule) | Compose, Composer settings | ≥ 44 px vs Lock/Swap 36, chips 32, arc radios 28, steppers 47×32, key chips 28; phone curve nodes 40 px overlapping | `S/ipad-01-home.png` | `TandaCard.tsx`, `Composer.tsx`, `EnergyCurve.tsx`, `ui.tsx` |
| m3 | Phone: no Booth tab; "Play the night" is an unlabelled ▶ icon; the bottom bar shows Regenerate/Export, not Play | Phone result | A visible "Play the night" vs icon only | `S/phone-02-composed.png` | `components/Nav.tsx`, `Composer.tsx:1579`, `PrimaryBar.tsx` |
| m4 | Inputs named only by placeholder; no focus ring on the file-naming and API-key inputs | Compose "Tell the DJ", Database search, Settings | A `<label>`/aria-label and a ring vs none | `S/a11y-settings-tab12.png` | `FeedbackBar.tsx:78`, `db/SongsTab.tsx:193`, `app/settings/page.tsx` |
| m5 | Booth swap buttons named "Swap track 6" (global index, no title) | Booth set list | "Swap Corazón (tanda 2, track 1)" | `S/a11y-booth-snapshot.yml` | `booth/SetColumn.tsx:437` |
| m6 | In rehearsal, "Time to La Cumparsita 57:25" sits next to "full night 4:05:21 · ends 23:30" with no explanation | Booth before start | One clear time, or a "rehearsal" label on the big number | `S/dj-10-booth.png` | `booth/TimeCard.tsx` |
| m7 | Export sheet closes after every download | Export → M3U8 | Stays open for a second format | `S/dj-31-after-m3u.png` | `ExportSheet.tsx` |
| m8 | Toast covers the booth Break/More buttons; the compose mini player covers tanda cards | Booth swap; Compose ▶ | Clear of controls | `S/dj-28-booth-swap.png`, `S/dj-07-tap-play.png` | `GlobalToast.tsx`, `MiniPlayer.tsx` |
| m9 | Estimates disagree: "4 h · ≈21 tandas" composes 23; compose says 4 h 01–04, booth says 4:05–4:10 | Composer → Booth | Same number in both | `S/ipad-p-02-composed.png` | `Composer.tsx`, `booth/TimeCard.tsx` |
| m10 | Length slider ignores a tap on the track (touch) and has no stepper | iPad Composer | Tap-to-set or ± buttons | `S/ipad-02-settings-set.png` | `Composer.tsx` |
| m11 | Database edit mode: values look like disabled grey placeholders, no field borders; versions are not playable | Database → Edit | Clear editable fields; ▶ per version | `S/ipad-14-db-edited.png` | `db/SongsTab.tsx` |
| m12 | The Guide never explains the app's own terms (cohesion, rehearsal, "3A" keys, BPM) and has no table of contents (12 270 px on a phone) | Guide | A how-to section and a TOC | `S/phone-10-guide-full.png` | `components/GuideSections.tsx`, `app/guide/page.tsx` |
| m13 | Learned preferences are buried (Database › Memory) and learn only from chips, not swaps or locks; "Track energy" asks for a developer key `title\|orchestra-id` | Database › Memory/Rules | Settings entry plus learning from edits | `S/ipad-15-db-memory.png`, `S/ipad-16-db-rules.png` | `db/MemoryTab.tsx`, `db/RulesTab.tsx`, `lib/memory.ts` |
| m14 | Title says "Turkish cortinas"; summary says "family cortinas" | Featured night header | One wording | `S/dj-01-featured.png` | `Composer.tsx` |
| m15 | Energy-chart phase labels don't match the shaded bands ("build" and "peak" bunched mid-chart) | Compose chart | Labels centred in their bands | `S/a11y-compose-tab25-crop.png` | `components/EnergyCurve.tsx` |
| m16 | The default 4 h night ends with a "Jarring" última (Tanturi/Castillo) after a Pugliese "cool-down" at energy 82 vs target 74 | Compose, iPad portrait | A cohesive, calmer close | `S/ipad-p-03-bottom-edit.png` | `packages/core/src/arc.ts`, `tanda.ts` (needs a vitest invariant first) |

### Polish

| ID | Issue | Screen / evidence | Likely file |
|---|---|---|---|
| P1 | Every compose load logs `Failed to load animation data from URL: /anim/vinyl.json. AbortError` | console | `components/Vinyl.tsx` |
| P2 | Each page logs `net::ERR_ABORTED` for `?_rsc=` prefetches of every nav route (cancelled Next prefetch, harmless noise) | network log | `components/Nav.tsx` (`prefetch`) |
| P3 | Key chips "A♯m · 3A 136": tiny monospace grey, BPM has no unit | `S/dj-02-swap-sheet.png` | `TrackRow.tsx`, `AudioDetails.tsx` |
| P4 | Truncated helper text on the iPad: Arc ("…one climb to t…"), Cycle, "Orchestra repeat …" | `S/ipad-01-home.png` | `Composer.tsx` |
| P5 | Phone: the "Compose" large title sits flush at the top edge | `S/phone-01-home.png` | `components/PageHeader.tsx` |
| P6 | Mix, Hold, Mute, Birthday and Break in the booth strip are icon-only; a DJ must hover to learn them | `S/dj-10-booth.png` | `booth/ControlStrip.tsx` |
| P7 | Booth "Next" card repeats the tanda header above the next song and again in the next-tanda card | `S/dj-10-booth.png` | `booth/NextCard.tsx` |
| P8 | iPad portrait: on scroll the nav pill collapses to icons only | `S/ipad-p-03-bottom-edit.png` | `components/Nav.tsx` |

---

## DJ requests (ROADMAP "Round 22 onward"): missing or hard to find on live

| Roadmap item | State on live |
|---|---|
| §1 Player IA like DJ apps (transport, queue, grouped tools) | Partial. Transport in a bottom strip, set list on the right; tools are spread over 6 icons and a "More" menu |
| §1 Headphone pre-listen (`setSinkId`, room vs headphones) | **Missing.** Set-up has one "Output · Device" only |
| §1 Tap any song to play/test; any version from the database | Compose: 30 s clip only. Booth: row tap does nothing (not deployed). Database: no ▶ on versions |
| §1 Spotify-"Mix"-style settings | Present (Mix sheet: crossfade, gap, fades) but behind an unlabelled icon |
| §1 Skip tonight, last 4 tango, Jump to Cumparsita | **Not live** (B1) |
| §1 Vertical energy chart, BPM and key per song in the player | **Missing** in the booth (no BPM/key on set rows) |
| §1 Per-song trim and waveform cue/stop | **Missing**; only the cortina has "Stop at" |
| §2 Song search side panel in Compose | **Missing**; search exists only in Library and Database |
| §2 Energy/BPM/key per song in Compose | Present at desktop width (key chips); hidden on phone |
| §2 Swap sheet with search, suggestions and AI pick | **Not live** (M1) |
| §3 All versions of a song together, each playable | Versions show as separate cards; none playable |
| §3 Scraped data editable (key, gain, release date, vocal style) | Partial: Year, Singer, Rhythm, Energy, BPM and Spotify URI are editable; key, gain, release date and vocal style are not |
| §3/§4 Era indicator (heatmap grades) and its editor | **Missing** |
| §5 Learning from swaps, pins and edits, editable list | **Missing**; only chip feedback, read-only (m13) |
| §6 Every indicator and rule toggleable in Settings | **Missing** (no toggles for key chips, cohesion badges and similar) |
| §6 One Connections screen | Partial: "Accounts and services" lists Spotify, Google and Dropbox; no YouTube row of its own, no ACP |
| §7 Turkish and a language switch | **Missing** |
| §8 macOS/iPadOS feel | Sidebar, focus rings and booth shortcuts are present; touch targets and hover-only controls fall short (M2, m2) |
