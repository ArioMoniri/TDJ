# Round 22: information architecture and screen spec (Player, Compose, Database, Settings)

Status: proposal for the engineers. Author: UX/IA research, 2026-11-14. Source of the requests: docs/ROADMAP.md, "Round 22 onward" §1–§8.
Builds on `docs/design/apple-native-pass.md` (tokens, `Group` / `Row`, sheets, large titles) and `motion-system.md`. Nothing here changes a musical rule; the engine features it places (skip tonight, last 4 tango, Cumparsita, bypass) already exist in `lib/booth/store.ts`.

Audit material (captured from the live deployment, deviceScaleFactor 1):
`/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/r22-ux/`
`desktop-*` (1440×900), `ipad-*` (1180×820), `phone-*` (390×844), plus `phone-contact-sheet.png` and `desktop-01-compose-tandas-crop.png`.
Note: the live build predates round 21b (23 tandas, no Skip / Cumparsita rows in the set list). The inventory below also covers the round 21 code in the repo.

References are cited as `[M#]` (Mobbin, §11) and `[P#]` (public knowledge of shipping apps, §11).

---

## 0. The decision in one paragraph

Organise every control by **what it acts on**, the way DJ apps and Spotify do: *this song* (transport bar, always at the bottom, on every page while a night runs), *the night* (the set list column, with a "Night" header holding skip / last-4-tango / Cumparsita / break / end), *the sound* (a Mix inspector with every value visible), *where it plays* (two output chips in the toolbar: **Room** and **Headphones**), and *the music* (one search side panel and one Get Info inspector shared by Player, Compose and Database). On macOS-width screens this is a sidebar + toolbar + content + right inspector window, like Apple Music and Finder. On iPad it is the same as a split view with a collapsible sidebar. On phones the Player becomes a tab, the transport is a mini bar over the tab bar, and Set / Search / Mix are a segmented control. Library and Database merge into one **Music** area; Rules, Context and Memory move to Settings. Settings becomes one page of grouped toggles with a left section list.

---

## 1. Audit: where every player feature lives today, and why it is hard to find

### 1.1 Screens as captured

| Screen | What the DJ sees | Capture |
| --- | --- | --- |
| Compose (desktop) | Large title, Regenerate / ••• / Export in the header, "Play the night" as a grey pill inside the set's summary card, energy arc, four disclosure rows, Adjust chips, then tanda cards two-up | `desktop-01-compose.png`, `desktop-01-compose-tandas-crop.png` |
| Export sheet | Cortina length stepper, Spotify, transfer service, YouTube / Dropbox / Drive greyed with "Connect in Settings" | `desktop-02-export.png` |
| Booth, not started | Now card (title, 0:30), Time card (clock, time to La Cumparsita), Next card, set list on the right, glass control strip at the bottom: Start, Next, Stop, Cortina fader, Master fader, Mix, Hold, Mute, Birthday, Break, ••• | `desktop-03-booth.png` |
| Booth, playing | Same; the strip's primary becomes Pause | `desktop-04-booth-after-onboarding.png`, `ipad-04-…`, `phone-04-…` |
| Mix sheet | A modal list mixing *actions* (Pause, Fade out now, Next with crossfade, Hold, End the tanda) with *settings* (Talk-over, Cortina and Master faders, Mute) | `desktop-05-booth-mix.png` |
| ••• "Booth" sheet | Set-up (source, output, night), Rehearsal, Link music folder, Hold, Mix…, Birthday vals, Break…, Keyboard shortcuts, Light theme, Leave the booth, End the night (round 21 adds: Play the rest then La Cumparsita, Jump to La Cumparsita now, Last 4 tandas tango only) | `desktop-06-booth-more.png` |
| Database | Segmented Songs / Orchestras / Cortinas / Rules / Context / Memory, search field, empty state | `desktop-07-database.png` |
| Library | The same 19,118 recordings, a second search field, orchestra list | `desktop-07-library.png` |
| Settings | Appearance, Region, Composing, Playback (cortina length), DJ apps, What TDJ learned, Memory, Written reviews (AI key), Connectors, Storage | `desktop-07-settings.png` |

### 1.2 Feature inventory (code: `components/booth/*`, `app/booth/page.tsx`, `Composer.tsx`, `TandaCard.tsx`, `Nav.tsx`, `app/settings/page.tsx`)

| Feature | Where it lives today | Problem |
| --- | --- | --- |
| Start / Pause / Resume | `ControlStrip` primary; space | Fine. The label changes meaning (Start · 30 s clips / Start · Spotify / End break) |
| Next at gap | `ControlStrip` icon; → | Icon only, no label; reads as "skip now" |
| Stop (fade / now) | `ControlStrip` → confirm sheet (`Sheets.tsx`); esc | Fine |
| Fade out now, Next with crossfade | `Sheets.tsx` Mix sheet; f / x | Actions on the playing song hidden in a sheet named "Mix" behind a sliders icon |
| Hold after this song | Strip icon (desktop only), Mix sheet, ••• sheet; h | Three places, no label on the strip, missing on iPad/phone strip |
| End the tanda after this song (cue cortina) | Mix sheet only; c | A tanda-level action buried in a sound sheet |
| Talk-over | Mix sheet switch; t | OK, but invisible unless the sheet is open |
| Cortina fader, Master fader | Strip (≥ 640 px), Mix sheet; ↑ ↓ | Two copies; on phone only in the sheet |
| Mute | Strip icon (desktop), Mix sheet button; m | Hidden on iPad/phone strip |
| Birthday vals | Strip cake icon (desktop), ••• sheet; b | Unlabelled cake icon; missing on iPad |
| Break | Strip coffee icon (desktop), ••• sheet | Unlabelled; missing on iPad |
| Skip tonight (per tanda) | Set-list tanda header "Skip" text button (`SetColumn.tsx`), Composer tanda ••• menu (`TandaCard.tsx`) | Good spot; tiny, no state colour on rows of a skipped tanda |
| Last 4 tandas tango only | ••• sheet row (`app/booth/page.tsx`) | A night rule hidden in an overflow menu next to "Light theme" |
| Jump to La Cumparsita now / Play the rest, then La Cumparsita | ••• sheet rows | The most time-critical end-of-night decision sits in the overflow; the "Time to La Cumparsita" counter that motivates it is in another card |
| Tap a song: Play now / Play next / Preview | Round 21 `PlaySheet` in `SetColumn.tsx` | Preview plays on *this device's default output*, which in a booth is the room; the copy asks the DJ to "use headphones", so the room hears it if they are not plugged in |
| Swap song / tanda | Set-list ⟲ icons (`SwapButton`), Composer | Fine, but the icon is the same rose as primary actions on every row: visual noise |
| Cortina fades / stop | Set-list sliders icon on cortina rows → Cortina sheet | Fine; trim exists only for cortinas |
| Per-song gain trim | `setTrim` in store, shown as "-4.6 dB" chip on the Now card | Not editable from the UI the DJ sees; no waveform |
| Source (files / Spotify / rehearsal), output device, gap, loudness, trim silence | `OnboardingSheet.tsx`, reachable from ••• → "Set-up…" | Output is display-only ("System default"); setup and sound settings mixed with first-run onboarding |
| Keyboard shortcuts | ••• → Keyboard shortcuts; ? | Fine |
| Theme | ••• → Light theme (booth), Settings → Appearance | Two places |
| Leave / End the night | ••• sheet | Fine |
| Time, ends at, on plan, tandas left, time to La Cumparsita | `TimeCard.tsx` | Fine content; takes a full card |
| Now playing | `NowCard.tsx`: tanda line, title, dots, big remaining time, progress | No orchestra era, BPM, key, energy, or waveform |
| Next | `NextCard.tsx` | Duplicates the set list's next row |
| Listen in Compose | `TandaCard` "Listen" → `MiniPlayer` (`<audio>` in `layout.tsx`) | A *second* player with its own output; not the booth engine; no headphones routing |
| BPM / key / energy per song | Compose tanda rows: key + Camelot + BPM chip, energy number + bar | The chip truncates titles ("Cosas …", "Lo Pasad…"); no BPM/key in Player or Database |
| Era (heatmap grade) | Used by the engine (`coverage.json`, 0 avoid … 4 fantastic); not shown anywhere | Requested on every song |
| Learned preferences | Settings → "What TDJ learned from your edits" and Database → Memory | Two places, neither editable per item |
| Rules | Database → Rules, `TandaRules.tsx` in Compose | Rules are settings, not data |
| Connections | Settings → Connectors (Spotify, Google, Dropbox, Deezer, MusicBrainz, Pipedream), Export rows say "Connect in Settings" | Long technical page; no status overview; YouTube is inside "Google" |
| AI keys | Settings → Written reviews | Named after one feature, not "Models" |
| Navigation | `Nav.tsx`: sidebar ≥ 1024 (Compose, Booth, Library, History, Database, Guide, Settings); tablet pill 640–1024; phone tab bar has **no Booth tab** (reached from Compose ••• or the play button) and hides while a night runs | The live page has no way back on phones except the ••• sheet's "Leave the booth" |

### 1.3 Why it is hard to find (root causes)

1. **Scope is mixed.** The Mix sheet holds song actions (fade, crossfade, hold), a tanda action (end the tanda), a mode (talk-over) and levels. The ••• sheet holds setup, night rules, end-of-night decisions, a theme toggle and navigation. A DJ looking for "end the night with La Cumparsita" has no reason to open an overflow that also says "Light theme".
2. **Icons without labels** on the strip (Hold ✋, Mute, Cake, Coffee, Mix sliders) and they disappear below 1024 px, so the iPad DJ (the main booth device) loses Hold, Mute, Birthday and Break from view.
3. **The same control in two or three places** (Hold ×3, faders ×2, theme ×2, learned prefs ×2, search ×2), so neither is "the" place.
4. **No persistent transport across pages.** The night is only controllable on `/booth`; the DJ who opens Database mid-night to find a version loses the transport. Spotify, Apple Music and every DJ app keep the player bar on every screen [M1][M4][P1][P2].
5. **No output model.** Room and preview share one output; nothing on screen says which one is sounding.
6. **Song detail is nowhere.** There is no "Get Info" for a song: versions, BPM, key, era, waveform, trim, sources, edits.

---

## 2. Research: where other apps put things

| App | Transport / now playing | Queue / set | Browser / search | Mix / transitions | Cue / headphones | Settings |
| --- | --- | --- | --- | --- | --- | --- |
| Spotify desktop [M4][P1] | Bottom bar: now playing left, transport centre, device/queue/volume right | Right panel "Queue" (Now playing, Next from) | Left "Your Library" sidebar; top search field | Playlist "Mix" button: per-transition chip between rows (Auto / Custom / None), BPM + Camelot key per row [M11][M12]; "Edit transition" with two waveforms, BPM/key and Volume/EQ/Effects presets [M9] | Connect device picker in the bar | One scrolling page: Playback group with Crossfade slider, Automix, Gapless, Normalise toggles |
| Apple Music macOS [M5][P2] | Toolbar LCD (centre): transport + now playing | Right inspector "Playing Next" with history toggle | Sidebar: Search, Library, Playlists; filter field in toolbar | Settings → Playback: Crossfade, Sound Enhancer, Sound Check | AirPlay picker in toolbar | Settings window with tabs; **Get Info** sheet per song: Details, Artwork, Lyrics, **Options (start/stop time, volume adjust)**, Sorting, File |
| YouTube Music web [M1] | Bottom bar | Right "Up next" tab with Autoplay switch | Top search | — | Cast | — |
| TIDAL / Deezer web [M3][M6] | Bottom bar; quality badge | Right "Play queue" panel with clear / per-row remove | Sidebar + top search; Deezer has "search within tracks" | — | Device | — |
| djay Pro (macOS / iPad) [P3] | Two decks top, waveform strip | Automix queue as a panel; transition style per pair | Library browser bottom half, sources sidebar (Music, Spotify-less now, Files) | Automix: transition style, duration, "start at / end at" per song | **Pre-Cue** headphones button per deck; Settings → Audio: split output (master 1/2, cue 3/4), or separate device | Settings window with tabs (Audio, MIDI, Library, Automix) |
| rekordbox [P4] | Decks top, big waveform | Playlists in tree | Browser bottom; tree sidebar left; columns BPM, Key, Rating, colour; **Related tracks** | — | Headphones CUE per channel; Preferences → Audio: Master / Headphones output routing | Preferences dialog with categories on the left |
| Serato DJ [P5] | Decks top | Crates in left sidebar of the library | Library bottom with search + columns; "Prepare" crate | — | CUE buttons per channel; Setup → Audio output | Setup screen with tabs |
| Traktor [P6] | Decks top | Playlists in browser tree | Browser bottom; **preview player** in the browser header | — | Preferences → Output Routing: Output Monitor (headphones) / Output Master | Preferences with left category list |
| Engine DJ [P7] | Decks top with track info + key/BPM | Playlists | Library view with columns | — | Cue per deck | Preferences |
| Mixxx [P8] | Decks top | Auto DJ queue in the library sidebar | Library: sidebar of sources + track table; **"Preview" column with a play button routed to the headphones** | Auto DJ transition time | Preferences → Sound Hardware: Main, Headphones (separate device or channels); headphone split | Preferences with left list |
| Output pickers (iOS) [M14][M15][M16] | — | — | — | — | System output sheet: device rows with icon and a check | — |
| Library filter panels [M17][M18][M19] | — | — | Artlist: filter panel with chips + BPM range; Epidemic: BPM / duration filters; Suno: filter popover with check rows | — | — | — |
| Settings with toggles [M20][M21][M22][M23] | — | — | — | — | — | Featurebase / Buffer / Customer.io / Plane: left section list, right grouped cards, one toggle per row with a one-line description |
| Connections [M24][M25][M26][M27] | — | — | — | — | — | Lindy: table App · Status · Used by; Linear: Connected accounts list with one "Connect" per row; Rox: Current / Not connected split; Unify: grouped by purpose with "● Connected" |
| Track detail / versions [M28][M29] | — | — | — | — | — | Untitled music app: song sheet with Key, BPM, waveform play, "Active version" and "Add new version" |

What every DJ app agrees on, and TDJ should copy:
- **Transport + now playing are one fixed bar.** Never in a sheet.
- **The queue sits beside the deck**, and queue-level controls (Automix on/off, transitions) sit on top of the queue.
- **The browser (search) is a separate pane** you can open while playing, with a **preview player routed to headphones** (Traktor, Mixxx).
- **Headphones are a named output** in preferences, and every cue control is a headphone glyph, never the play glyph.
- **Per-song info** (BPM, key, rating/colour, waveform, cue/start/stop) lives in the row and in an info panel (Apple Music Get Info, rekordbox track info).

---

## 3. Navigation model

### 3.1 Destinations (all platforms)

| # | Destination | Contains | Replaces |
| --- | --- | --- | --- |
| 1 | **Compose** | Build and shape the night | Compose |
| 2 | **Player** | Run the night | Booth (rename: the DJ calls it "the player"; keep `/booth` as an alias) |
| 3 | **Music** | Songs (versions grouped), Orchestras, Cortinas; play any version; Get Info / edit | Library **and** Database (Songs / Orchestras / Cortinas tabs) |
| 4 | **History** | Past nights | History |
| 5 | **Settings** | One page, grouped toggles; includes Rules, Learning (was Memory), Connections, Models, Language | Settings, Database → Rules / Context / Memory, Booth onboarding settings |
| — | Guide | Help menu (macOS), Settings → Help (iPad/phone) | Guide tab |

Search is not a destination: it is a **side panel** (⌘F) available on Compose, Player and Music, and a detached search tab on phones (iOS 26 pattern, already in `apple-native-pass.md` §3.1).

### 3.2 macOS width (≥ 1024 px): sidebar + toolbar + content + inspector

```
┌───────────────┬─────────────────────────────────────────────────────────────────────────────┐
│ ◉ TDJ         │ TOOLBAR (glass, 52): ‹ page title ›     [context actions]   [⌕] [ⓘ] [⧉]       │
│               ├──────────────────────────────────────────────────────┬──────────────────────┤
│ NIGHT         │                                                      │  RIGHT PANEL 320     │
│  ✎ Compose    │                 CONTENT (surface)                    │  Search │ Info │ Mix │
│  ▶ Player   ● │                                                      │  (segmented, ⌘F /    │
│ MUSIC         │                                                      │   ⌘I / ⌘M)           │
│  ♫ Songs      │                                                      │                      │
│  ◎ Orchestras │                                                      │                      │
│  ♪ Cortinas   │                                                      │                      │
│  ⏱ History    │                                                      │                      │
│               │                                                      │                      │
│ ───────────── ├──────────────────────────────────────────────────────┴──────────────────────┤
│ ⚙ Settings    │ TRANSPORT BAR (glass, 72; only while a night is loaded, on every page)       │
└───────────────┴─────────────────────────────────────────────────────────────────────────────┘
```
- Sidebar 220 px, `material-thin`, sections with 11 pt uppercase headers (Apple Music sidebar [M5]). The Player row shows a live dot (rose = room playing, blue = headphones only) and remaining tandas as a trailing count.
- Toolbar: page title left (collapses from the large title), page actions centre-right, then the three panel toggles: ⌕ Search, ⓘ Info, ⧉ sidebar. ⌘⌥S hides the sidebar, ⌘⌥I the right panel (Finder / Xcode / Apple Music).
- Right panel: one 320 px inspector with a segmented control. Opening Search from Compose, Player or Music opens the same component (§6). On Player it adds a **Mix** segment (§4.4).
- Transport bar: Spotify / Apple Music bottom bar [M4][M3], full width under content + panel, persistent across Compose, Music, History and Settings once a night is loaded (replace `MiniPlayer` on desktop when a night is loaded; `MiniPlayer` stays for plain previews when no night exists).

### 3.3 iPad (640–1366 px, touch): split view

- Landscape 1180: sidebar is a collapsible column (tap ⧉ or swipe from the edge), default **collapsed on Player** so the deck and set list get the width; default visible elsewhere. Right panel overlays as a sheet-like column at 1180 and docks at ≥ 1280.
- Portrait 820: sidebar becomes the tab-bar-at-top (iPadOS 18 floating tab bar) = the existing pill in `Nav.tsx`, now with **Player** as a tab; right panel becomes a medium-detent sheet.
- Touch targets ≥ 44 px everywhere; transport buttons 56 px.

### 3.4 Phone (< 640 px)

- Tab bar (glass capsule): **Compose · Player · Music · Settings** + detached ⌕ search tab. History moves under Music (segment) and Guide under Settings → Help. Six tabs did not fit (`db/page` note, round4-ux P1-4); four plus search does.
- The tab bar **stays visible** while a night runs (today it hides; the DJ has no way to leave). The mini transport bar docks on top of it on every tab (Spotify iOS mini player [M13]).

---

## 4. Player

### 4.1 Feature placement (the single source of truth)

| Scope | Feature | Desktop / iPad | Phone | Key |
| --- | --- | --- | --- | --- |
| This song | Play / Pause / Resume | Transport bar, centre, 56 px | Mini bar + expanded player | space |
| | Next at gap (labelled "Next at gap") | Transport bar | Expanded player | → |
| | Stop… (fade / now) | Transport bar | Expanded player | esc |
| | Fade out now | Transport bar `⋯` cluster "Fade" button with label; Mix panel | Expanded player row | f |
| | Next with crossfade | Transport bar "Crossfade" button | Expanded player | x |
| | Hold after this song | Transport bar toggle with label "Hold" | Expanded player | h |
| | Talk-over | Transport bar toggle with label "Talk" (mic glyph) | Expanded player | t |
| | Progress + waveform | Transport bar centre (waveform scrubber, read-only during the night) | Expanded player | — |
| | Room level, cortina level, mute | Transport bar right: Room fader + mute; cortina level lives in Mix | Expanded player | ↑ ↓ m |
| This tanda | End the tanda after this song (cortina next) | Now deck "End tanda" button | Now card | c |
| | Skip tonight | Set list tanda header (toggle "Skip tonight"; rows dim and get a strike-through badge) | same | s on the selected tanda |
| | Swap song / tanda | Row context menu + tanda header `⋯` | long-press menu | ⌘R |
| The night | Last 4 tandas tango only | **Night bar** at the top of the set list (switch) | Night sheet from the set list header | ⌘⇧4 |
| | Play the rest, then La Cumparsita | Night bar, next to "Time to La Cumparsita 57:25" | same | ⌘⇧C (confirm) |
| | Jump to La Cumparsita now | Night bar `⋯` (destructive style, confirm) | same | ⌘⌥C (confirm) |
| | Birthday vals | Night bar `⋯` and transport `⋯` | Night sheet | b |
| | Break… | Night bar | Night sheet | ⌘B |
| | End the night | Night bar `⋯` (destructive) | Night sheet | ⌘⇧E |
| Any song | Tap → Play now / Play next / **Pre-listen in headphones** | Row click selects, double-click = Play next, ⏎ = Play next, ⌘⏎ = Play now (fade), P = pre-listen | Tap opens the action sheet | P, ⏎, ⌘⏎ |
| | Play another version | Info panel → Versions | Info sheet | ⌘I |
| | Trim / start / stop, gain | Info panel → Waveform (drag in/out handles) | Info sheet | ⌘I |
| Sound | Crossfade, gap, fade lengths, cortina level, loudness target, trim leading silence, Spotify full tracks | **Mix** panel (§4.4) | Mix segment | ⌘M |
| Outputs | Room device, Headphones device, cue volume | Toolbar chips (§4.5) | Expanded player header | ⌘⌥O |
| Setup | Source (files / Spotify / 30 s rehearsal), music folder | Toolbar "Source" chip → popover; Settings → Playback | Settings | — |
| App | Theme, shortcuts, leave | Theme: Settings only; Shortcuts: Help menu + ?; leave: sidebar | Settings | ? |

The ••• overflow on the Player keeps only: Set-up…, Keyboard shortcuts, Leave the player. Everything else has one home above.

### 4.2 Desktop 1440 (sidebar collapsed to 0 on the Player by user choice; shown here visible)

```
┌Sidebar 220┬ TOOLBAR ─────────────────────────────────────────────────────────────────────────────────┐
│           │ Player · Golden 1935–45      [▣ Files ▾] [🔊 ROOM  MacBook Speakers ▾] [🎧 HEADPHONES  AirPods ▾]  [⌕][ⓘ][⧉]│
│           ├───────────────────────────────────────┬────────────────────────────────┬──────────────────┤
│           │ NOW · Tanda 1 of 25 · Tango           │ NIGHT  19:22 · ends 23:27      │ [Search|Info|Mix]│
│           │ Agua Florida                ▮▮▮▯ era  │ La Cumparsita in 57:25         │                  │
│           │ Ángel D'Agostino / Ángel Vargas · 1941│ [Play the rest, then Cumparsita]│  (§6 / §4.3 /    │
│           │ ●○○○ 1 of 4      128 BPM · 8A · E 56  │ [◉ Last 4 tandas tango only]    │   §4.4)          │
│           │ ▁▃▅▇▆▅▃▂▁▂▃▅▆▇▆▅▃▂ waveform  -2:16    │ [Break…] [⋯]                    │                  │
│           │ [End tanda after this song]  [⋯]      │────────────────────────────────│                  │
│           │───────────────────────────────────────│ ┃E┃ 1 TANGO · D'Agostino/Vargas │                  │
│           │ ENERGY (vertical arc)                 │ ┃ ┃  ▶ Agua Florida  ▮▮▮▯ 128 8A│                  │
│           │  t1 ●───────┤                         │ ┃ ┃    Ahora No Me…  ▮▮▮▯ 126 8A│                  │
│           │  t2 ●─────────┤                       │ ┃ ┃    …                         │                  │
│           │  t3 ●──────────────┤  (milonga)       │ ┃ ┃  ♪ cortina · Olmasa… 0:45   │                  │
│           │  …  you are here ◀                    │ ┃ ┃ 2 TANGO · Di Sarli/Rufino [Skip tonight][⋯]│   │
│           │                                       │ ┃ ┃ 3 VALS  · Caló/Iriarte    [Skip tonight][⋯]│   │
│           │ NEXT TANDA: Di Sarli / Rufino 1939–40 │                                │                  │
├───────────┴───────────────────────────────────────┴────────────────────────────────┴──────────────────┤
│ TRANSPORT  ▮▮▮▯ Agua Florida · D'Agostino 1941 │ [Fade f][Crossfade x] [❚❚ Pause] [⏭ Next at gap] [■ Stop] │ ●ROOM ▁▂▃▅ Room ━━●━ 0 dB 🔇 │ [✋Hold][🎙Talk] │
│            1:14 ▁▃▅▇▆▅▃▂▁▂▃▅▆▇▆▅▃ -2:16                                                  │ 🎧 idle                       │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

Components (new or changed):
- `PlayerToolbar` (new, `components/booth/PlayerToolbar.tsx`): title, Source chip, two `OutputChip`s, panel toggles.
- `NowDeck` (rework of `NowCard.tsx`): era badge, BPM, key, energy, waveform with remaining time, "End tanda after this song" button, `⋯` (Swap, Info).
- `EnergyRail` (new): vertical arc of the night, current position marker; replaces `NextCard.tsx` (next tanda becomes a single line below it).
- `NightBar` (new, top of `SetColumn.tsx`): clock / ends / on plan / tandas left (from `TimeCard.tsx`), Time to La Cumparsita, the two Cumparsita actions, Last 4 tango switch, Break, `⋯` (Birthday vals, End the night). `TimeCard.tsx` folds into it.
- `SetColumn.tsx`: left energy gutter (§7.1), era badge, BPM, key per row; tanda header with a labelled "Skip tonight" toggle and `⋯`; selected row state (keyboard); skipped tandas dim to 40 % with a "Skipped tonight" chip.
- `TransportBar` (replaces `ControlStrip.tsx` on ≥ 640 px): three zones, every button labelled at ≥ 1180 px and icon + tooltip below that; it lives in `app/layout.tsx` so it persists across pages.
- `RightPanel` (new, shared): segments Search (§6), Info (§4.3), Mix (§4.4).

### 4.3 Info panel (Get Info) — any song, any page

```
┌ Info ───────────────────────────── ✕ ┐
│ Agua Florida                         │
│ Ángel D'Agostino / Ángel Vargas      │
│ Tango · 1941 · 2:45                  │
│ ▮▮▮▯ D'Agostino vocal 1941: Strong   │ ← era badge + words
│ 128 BPM   8A (A♭m)   Energy 56       │
│──────────────────────────────────────│
│ ▁▃▅▇▆▅▃▂▁▂▃▅▆▇▆▅▃▂▁   [🎧 Pre-listen]│ ← waveform, drag ⟦ in / out ⟧
│ ⟦0:00.4            2:43.1⟧  Gain -4.6 dB [−][+] │
│ [Reset trim]                          │
│──────────────────────────────────────│
│ VERSIONS (same title)                 │
│ ▶ 1941 D'Agostino/Vargas   ▮▮▮▯ in set│
│ ▶ 1955 D'Agostino/T. Rufino ▮▯▯▯     │
│ ▶ 1931 Firpo (instr.)       ▮▮▯▯     │
│   [Use this version in tanda 1]       │
│──────────────────────────────────────│
│ IN TONIGHT'S SET  Tanda 1 · song 1    │
│ SOURCES  Files ✓ · Spotify ✓ · Deezer │
│ DETAILS (editable)               Edit │
│ Singer, Year, Rhythm, Vocal style,    │
│ BPM, Key, Spotify id, Deezer id …     │
│ "Your edit" badge on changed fields   │
└───────────────────────────────────────┘
```
References: Apple Music Get Info → Options (start/stop time, volume adjust) [P2]; untitled music app version sheet with Key/BPM/waveform/"Active version" [M29]; Spotify Edit transition shows BPM + key per song [M9].
Rules: Pre-listen always goes to the headphones output (§4.5). "Use this version" calls the existing swap path with the chosen recording. On the Player during the night, the playing song's waveform is read-only.

### 4.4 Mix panel (Spotify "Mix" style, every value visible)

Spotify shows the transition *between* two rows as a chip (Auto / Custom / None) and opens an editor with both waveforms, BPM and key [M11][M12][M9]. TDJ's Mix panel:

```
┌ Mix ─────────────────────────────────┐
│ TRANSITIONS                           │
│ Song → song       Gap        1.5 s [−][+] │
│ Song → cortina    Fade out   4 s   [−][+] │
│ Cortina → tanda   Gap        2 s   [−][+] │
│ Next with crossfade          3 s   [−][+] │
│ Pause / resume fade          0.8 s       │
│ Automatic crossfade (Spotify-like)  [ ]  │
│──────────────────────────────────────│
│ LEVELS                                │
│ Room (master)   ━━━━●━━  0 dB         │
│ Cortinas        ━━━●━━━  80 %         │
│ Loudness target  −16 LUFS ▾           │
│ Talk-over dip    12 dB  [ ]  (t)      │
│ Trim leading silence         [✓]      │
│──────────────────────────────────────│
│ SOURCE                                │
│ Full Spotify tracks when connected [✓]│
│ 30 s rehearsal clips          [ ]     │
│──────────────────────────────────────│
│ This tanda: Di Sarli → cortina        │
│ [Custom ›] shows both waveforms        │
└───────────────────────────────────────┘
```
Every row shows its current value in the row (no hidden values). Actions (Fade out now, Crossfade now, Hold) leave this panel and go to the transport bar.

### 4.5 Room vs headphones (the pre-listen output)

The rule: **the room is rose, the headphones are blue; a glyph and a word are always present, never colour alone.**

| Element | Room | Headphones |
| --- | --- | --- |
| Glyph | speaker (`Speaker` / `Volume2`) | headphones (`Headphones`) |
| Word | "ROOM" | "HEADPHONES" |
| Colour light / dark | `--room` #B0365C / #E0557A (= tint) | `--cue` #0064D2 / #4DA3FF (5.6:1 / 6.8:1 on surface) |
| Fill for active chips | `--room-fill` rgba(tint, .14) | `--cue-fill` #E6F0FC / #0B2340 (text 4.9:1 / 6.0:1) |
| Meter | rose bars | blue bars |
| Waveform progress | rose | blue, with diagonal 45° hatch so it differs in greyscale |

- **Output chips** in the toolbar: `[🔊 ROOM  MacBook Speakers ▾]` and `[🎧 HEADPHONES  AirPods Pro ▾]`. Clicking opens a device list in the iOS output-picker style (icon, name, check) [M14][M15][M16]. Device list from `navigator.mediaDevices.enumerateDevices()`; route with `AudioContext.setSinkId()` (room engine) and a second `AudioContext` or `HTMLAudioElement.setSinkId()` for the cue player.
- **Split mode** (djay / Mixxx [P3][P8]): when one interface has 4 outputs, "Room on 1/2, headphones on 3/4" via a 4-channel destination and a `ChannelMergerNode`.
- **Safety**: if the headphones device equals the room device (or `setSinkId` is unavailable), Pre-listen is **disabled** with the reason in the chip: "Headphones: same as the room. Pre-listen off." The current Round 21 behaviour (preview on the default output) must not ship as "headphones".
- **While pre-listening**: the toolbar chip pulses blue, the transport bar's right zone shows `🎧 Pre-listen · Corazón · 0:12 / 0:30 [■]`, and the row being heard shows a blue headphones glyph. Esc does **not** stop the room; ⇧P stops the pre-listen.
- macOS / iPadOS apps (roadmap §9): route with `AVAudioEngine` to two devices; same UI.

### 4.6 iPad landscape 1180×820

```
┌ ⧉  Player · Golden 1935–45     [🔊 ROOM ▾][🎧 HEADPHONES ▾]   [⌕][ⓘ] ┐
├────────────────────────────────┬──────────────────────────────────────┤
│ NOW  Agua Florida   ▮▮▮▯        │ NIGHT 19:22 · Cumparsita in 57:25    │
│ D'Agostino / Vargas · 1941      │ [Rest, then Cumparsita][◉ Last 4 tango]│
│ 128 · 8A · E56   ●○○○  -2:16    │──────────────────────────────────────│
│ ▁▃▅▇▆▅▃▂▁▂▃▅▆▇▆▅▃▂ waveform     │ 1 TANGO D'Agostino/Vargas            │
│ [End tanda after this song]     │  ▶ Agua Florida      ▮▮▮▯ 128 8A     │
│ ENERGY RAIL (vertical)          │    Ahora No Me…      ▮▮▮▯ 126 8A     │
│                                 │ 2 TANGO Di Sarli  [Skip tonight][⋯]  │
├─────────────────────────────────┴──────────────────────────────────────┤
│ ▮▮▮▯ Agua Florida │ [Fade][Xfade] [❚❚ Pause 56px] [⏭ Next] [■ Stop] │ Room ━●━ 🔇 │ [✋Hold][🎙Talk] │
└────────────────────────────────────────────────────────────────────────┘
```
Sidebar collapsed by default (⧉ to show). Info / Search / Mix open as a right column overlay 360 px with a grabber, dismiss by swipe right.

### 4.7 Phone 390

```
Collapsed (any tab)                     Expanded Player tab
┌──────────────────────────────┐        ┌──────────────────────────────┐
│ …page content…               │        │ Player       [🔊 Room][🎧 HP]│
│                              │        │ Agua Florida          ▮▮▮▯   │
│                              │        │ D'Agostino / Vargas · 1941   │
│                              │        │ 128 · 8A · E56   ●○○○        │
│                              │        │ ▁▃▅▇▆▅▃▂▁▂▃▅▆ -2:16           │
│┌────────────────────────────┐│        │ [Fade] [❚❚ Pause] [⏭] [■]    │
││▮▮▮▯ Agua Florida  ❚❚  ⏭    ││        │ [✋ Hold] [🎙 Talk] [End tanda]│
│└────────────────────────────┘│        │ Cumparsita in 57:25  [Night ›]│
│ [Compose][Player][Music][⚙] ⌕ │        │ [ Set | Search | Mix ]        │
└──────────────────────────────┘        │ 1 TANGO D'Agostino  [Skip][⋯] │
                                        │  ▶ Agua Florida  ▮▮▮▯ 128 8A  │
                                        └──────────────────────────────┘
```
"Night ›" opens a sheet with the NightBar contents. Row tap opens an action sheet: Play next · Play now (fade) · Pre-listen in headphones · Info · Swap.

### 4.8 Keyboard (macOS and iPad with keyboard)

| Key | Action | Exists |
| --- | --- | --- |
| space | Pause / resume (fade) | yes |
| → | Next at gap | yes |
| esc | Stop… | yes |
| f / x / h / t / c / b / m | Fade out now / crossfade next / hold / talk-over / end tanda / birthday vals / mute | yes |
| ↑ ↓ | Cortina level | yes; move to ⌥↑ ⌥↓ once ↑ ↓ select rows |
| ↑ ↓ (set list focused) | Move the selection | new |
| ⏎ / ⌘⏎ | Play selected next / play now with fade | new |
| P / ⇧P | Pre-listen selected in headphones / stop pre-listen | new |
| S | Skip tonight on the selected tanda | new |
| ⌘F / ⌘I / ⌘M | Search / Info / Mix panel | new |
| ⌘⇧C, ⌘⌥C | Play the rest then La Cumparsita / Jump to it now (both confirm) | new |
| ⌘⇧4 | Last 4 tandas tango only | new |
| ⌘1…⌘5 | Compose, Player, Music, History, Settings | new |
| ⌘, | Settings | new (macOS standard) |
| ⌘⌥S / ⌘⌥I | Toggle sidebar / right panel | new |
| ? | Shortcuts | yes |

---

## 5. Compose

Keep the large title, summary card and arc (they work). Changes:
- **Toolbar**: Regenerate · Export · **Play the night** (primary, rose, ▶) · ⌕ · ⓘ. Today "Play the night" is a grey pill inside the score card; it is the page's main exit and belongs in the toolbar (Spotify's green Play next to the title [M10]).
- **Tanda rows**: title gets the full width; BPM and key move to a fixed-width right column (`128 · 8A`, tabular, 11 pt secondary), era badge before the year, energy as the left gutter bar (§7.1). The current chip truncates titles ("Cosas …", "Lo Pasad…", `desktop-01-compose-tandas-crop.png`).
- **Search side panel** (§6) on the right at ≥ 1180 px; dragging or "Add to tanda n / Replace song n" from a result.
- Row click → selects + shows Info in the panel; double-click → pre-listen in headphones (no night running: default output, labelled "Pre-listen · this device").
- Tanda `⋯` keeps Lock, Swap, **Skip tonight** (already there in round 21).
- `TandaRules` moves to Settings → Tanda rules; Compose shows a one-line summary row "Rules: 4-4-3 · cortinas 45 s ›" that deep-links there.

```
┌ Compose ─────────────── [⟳ Regenerate] [⇪ Export] [▶ Play the night] [⌕][ⓘ] ┐
│ Golden 1935–45 · 4 h · double peak    91/100                   │ Search      │
│ energy arc ……………………………………………                                │ [title…  ] │
│ Rules: 4-4-3-4 · cortinas 45 s ›                               │ Rhythm: T M V│
│ 1 D'Agostino / Vargas 1941 ▮▮▮▯                         57 [⋯] │ results …   │
│ ┃ Agua Florida              ▮▮▮▯ 1941      128 · 8A   56       │ ▶ Corazón   │
│ ┃ Ahora No Me Conocés       ▮▮▮▯ 1941      126 · 8A   55       │   in tanda 2│
└────────────────────────────────────────────────────────────────┴────────────┘
```

---

## 6. Search side panel (Compose, Player, Music)

Patterns: Artlist and Epidemic filter rows with chips + BPM range [M17][M19]; Suno filter popover with check rows [M18]; Deezer "search within tracks" [M6]; Traktor / Mixxx preview from the browser [P6][P8].

```
┌ Search ─────────────────────── ✕ ┐
│ ⌕ title, orchestra, singer, year │
│ Rhythm  [Tango][Milonga][Vals]   │  multi-select chips (rhythm colours)
│ Years   1935 ━●━━━━●━ 1945       │
│ Orchestra ▾   Singer ▾   Instr. ◻│
│ Era  [▮▮▮▮][▮▮▮▯+]  BPM 110–140  │
│ Sort: Relevance ▾                │
│──────────────────────────────────│
│ 🎧 Corazón                 ▮▮▮▯  │
│    Di Sarli / Rufino · 1939 · T  │
│    128 · 3A · E52 · In tanda 2 ↗ │ ← "In tanda 2" chip jumps to it
│ 🎧 Corazón                 ▮▯▯▯  │
│    Di Sarli / Podestá · 1956     │
│    3 versions ›                  │ ← groups versions, opens Info → Versions
└──────────────────────────────────┘
```
- Fields: title, orchestra, singer, year (single or range), rhythm (tango / milonga / vals); optional: instrumental only, era grade ≥, BPM range. Query parses tokens like `di sarli 1940 vals`.
- Each result: era badge, rhythm letter in the rhythm colour, BPM · key · energy, and **"In tanda n"** / **"Played 21:40"** / **"Skipped tonight"** status.
- Row leading button = 🎧 pre-listen (blue). Row actions (context menu / swipe): Play next, Play now (Player only), Replace song…, Add to tanda…, Info.
- Versions are grouped (same `songs.json` work id): one row with "n versions ›".
- Phone: the detached ⌕ tab, full-screen, filters as a horizontally scrolling chip row with a "Filters" sheet.

---

## 7. Indicators: energy, BPM, key, era

All indicators have a switch in Settings → Indicators (§9) and a **Legend** (popover from any badge, and in Settings).

### 7.1 Energy (vertical arc)

- **Night level**: `EnergyRail` on the Player is the night's arc drawn top-to-bottom (time runs down, energy to the right), one dot per tanda in its rhythm colour (tango rose, vals #4FD1C5 / text #0F766E, milonga #8B7CF6 / text #6D28D9), the planned curve as a dashed line, the "you are here" marker as a rose triangle. Same data as `EnergyCurve.tsx`, rotated; Compose keeps the horizontal arc.
- **Song level**: a 3 px left gutter bar on each row whose length (or opacity on phones) maps 0–100 energy; number shown in Info and on hover. Avoid a second bar per row (today's red bar competes with the rose primary).

### 7.2 BPM and key

- Format `128 · 8A` in `font-variant-numeric: tabular-nums`, 12 pt, `--label-2`. Key in Camelot (Spotify Mix shows Camelot `11A`, `5A` [M11][M12]); the musical name (A♭m) in Info and on hover.
- Clash hint (toggle "Key clash hints", off by default for tango): if two adjacent songs differ by more than one Camelot step, the second key gets an orange dot `--clash` #B45309 / #FBBF24 (5.0:1 / 10.7:1).
- Unknown: an en dash, never "0".

### 7.3 Era badge (heatmap grade)

Data: `data/index/coverage.json`, grade per orchestra × year × mode, 0 avoid … 4 fantastic (counts today: 0: 246, 1: 110, 2: 154, 3: 175, 4: 244). Shown on every song row in Player, Compose, Search, Music.

Visual: a **four-bar signal glyph** 14×10 px (like a phone signal meter), filled bars = grade, so it reads in greyscale and for colour-blind DJs; one hue (gold) marks it as "the era indicator".

| Grade | Name (EN / TR) | Glyph | Filled bars light / dark | Empty bars light / dark |
| --- | --- | --- | --- | --- |
| 4 | Golden years / Altın yıllar | ▮▮▮▮ | `--era` #9A6700 (4.9:1 on white) / #F2C14E (10.6:1 on #181622) | — |
| 3 | Strong / Güçlü | ▮▮▮▯ | same | `--era-empty` #7A7587 (4.5:1) / #7D7890 (4.2:1), 1 px outline only |
| 2 | Fair / Orta | ▮▮▯▯ | same | same |
| 1 | Weak / Zayıf | ▮▯▯▯ | same | same |
| 0 | Outside the best years / Dönem dışı | ▯▯▯▯ + dashed outline | — | same, dashed |
| no data | — | no glyph (an empty 14 px slot keeps alignment) | | |

- Tooltip / VoiceOver: "Era: Strong (D'Agostino, vocal, 1941)".
- Grade 4 rows may also get a 1 px gold underline on the year in Info only (not in lists; keep lists calm).
- Legend popover: the five glyphs with names and "From your orchestra heatmap. Edit in Music → Orchestras."
- Editing: Music → Orchestras → orchestra → heatmap grid (years × instrumental/vocal), tap a cell to cycle 0–4; per-user overrides win; shipped defaults from `coverage.json` (roadmap §3).

---

## 8. Music (Library + Database merged)

Segments: **Songs · Orchestras · Cortinas** (+ History on phones). Search field at the top filters the current segment; the side panel filters are the same component (§6).

### 8.1 Songs: grouped by work, versions together

```
┌ Music ─ [Songs|Orchestras|Cortinas] ───────────── ⌕ corazón ─────── [Edit] ┐
│ CORAZÓN · 4 versions                                                        │
│  🎧 ▶ 1939 Di Sarli / Rufino         ▮▮▮▯ T 128 · 3A  2:51  In tonight's set│
│  🎧 ▶ 1956 Di Sarli / Podestá        ▮▯▯▯ T 120 · 3A  3:02                  │
│  🎧 ▶ 1944 Troilo / Fiorentino       ▮▮▮▮ T 124 · 10B 2:48                  │
│  🎧 ▶ 1929 Firpo (instr.)            ▯▯▯▯ T  —  · —   2:40                  │
│ CORAZÓN DE ORO · 2 versions …                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```
- Leading 🎧 = pre-listen (headphones when a night runs, this device otherwise); ▶ = play through the room when a night is loaded (confirm "Play now in the room?") or open the version in Info otherwise.
- Columns: year, orchestra / singer, era badge, rhythm letter, BPM · key, duration, status (In tonight's set / Played / Skipped).
- Click a version → Info panel with **editable fields** (title, orchestra, singer, year, rhythm, vocal style, BPM, key, gain, release date, Spotify id, Deezer id, YouTube id). Each field shows its source ("Spotify", "Deezer", "MusicBrainz", "You") and a **"Your edit"** badge; "Revert to source" per field. The DJ's edit wins over later scrapes (roadmap §3).
- Reference: rekordbox / Engine DJ column browser [P4][P7], Apple Music Get Info [P2], version sheet [M29].

### 8.2 Orchestras

List with recording counts (today's Library list) → orchestra detail: heatmap grid (era grades, editable), singers, best years summary, songs.

### 8.3 Cortinas

Today's Cortinas tab plus waveform trim (same Info component as songs).

Rules, Context and Memory leave Music for Settings (they are configuration, not catalogue).

---

## 9. Settings: one page, grouped toggles

Pattern: left section list + right grouped cards, one switch per row with a one-line description (Featurebase [M20], Buffer [M21], Customer.io [M22], Plane [M23]); the existing `Group` / `Row` primitives already render inset grouped lists. On phones the left list becomes the root list (iOS Settings).

```
┌ Settings ────────────┬──────────────────────────────────────────────────────┐
│ ⌕ Search settings    │ INDICATORS                                            │
│ General              │ Era badge                     [●] Your heatmap grade… │
│ Indicators         ● │ Energy                        [●] Bar per song + arc  │
│ Tanda rules          │ BPM                           [●]                      │
│ Night shape          │ Key (Camelot)                 [●]                      │
│ Learning             │ Key clash hints               [ ] Adjacent songs…     │
│ Playback & Mix       │ Source icons (Spotify/file)   [●]                      │
│ Headphones           │ Legend ›                                               │
│ Connections          │                                                       │
│ Models (AI)          │                                                       │
│ Language             │                                                       │
│ Storage · Help       │                                                       │
└──────────────────────┴──────────────────────────────────────────────────────┘
```

| Group | Rows (every one a switch unless noted; each with a one-line footer) | Today |
| --- | --- | --- |
| General | Theme (segmented Auto / Light / Dark), Reduce transparency, Where you usually play (picker) | Settings |
| Indicators | Era badge, Energy, BPM, Key, Key clash hints, Source icons, Rhythm colours, Legend › | new |
| Tanda rules | Tanda pattern (picker), Cortinas between tandas, One recording period per tanda, Pinned tandas respected, Last 4 tandas tango only (default for new nights), Closing with La Cumparsita, Closing harmony (off by default, round 21b) — plus the rules editor › | Database → Rules, `TandaRules.tsx`, booth ••• |
| Night shape | Arc (picker: double peak…), Warmer start, Stronger finish, Auto-improve against published sets | Compose chips, Settings → Composing |
| Learning | Learn from my swaps, pins and edits (switch) · **Learned preferences list** (each row: rule in words, weight stepper, delete; e.g. "Prefer Di Sarli 1939–41 over 1950s · weight 2 · from 3 swaps") · Forget everything (destructive) | Settings "What TDJ learned" + Database → Memory |
| Playback & Mix | Source (Files / Spotify / 30 s rehearsal), Full Spotify tracks when connected, Gap, Fades, Crossfade, Loudness target, Trim leading silence, Cortina play length + Follow the composer, Music folder › | Booth onboarding, Mix sheet, Settings → Playback, Export |
| Headphones | Room output (device), Headphones output (device), Split one interface (1/2 room, 3/4 headphones), Pre-listen length (30 s / full), Test tone per output | Booth onboarding (read-only) |
| Connections | §10 | Settings → Connectors |
| Models (AI) | §10 | Settings → Written reviews |
| Language | English · Türkçe · Español (picker), follows the system by default | new |
| Storage · Help | Database export/import, Guide ›, Keyboard shortcuts ›, About | Settings → Storage, Guide tab |

Rules: every indicator, rule and automatic behaviour has exactly one switch here (roadmap preamble); the Player and Compose may show a shortcut to the same switch (e.g. NightBar "Last 4 tandas tango only"), bound to the same state, never a second setting.

---

## 10. Connections & accounts, Models

### 10.1 Connections (music and storage)

Pattern: one list grouped by purpose with a status dot and one action per row (Unify [M27], Linear [M25]); a status table is a good desktop variant (Lindy: App · Status · Used by [M24]); connected first, then not connected (Rox [M26]).

```
CONNECTIONS
 Music services
  [●] Spotify        Connected · Premium · alex@…   Used by: Player, Export   [Reconnect] [⋯]
  [○] Deezer         Not connected                  Used by: previews, ids    [Connect]
  [○] YouTube        Not connected                  Used by: Export           [Connect]
 Files
  [●] Dropbox        Connected                       Used by: Music folder     [⋯]
  [○] Google Drive   Not connected                   Used by: Export, folder   [Connect]
  [●] This Mac       Folder: ~/Music/Tango           Used by: Player           [Change]
 Advanced ›  (own Spotify app id, Pipedream, MusicBrainz)
```
- One tap: "Connect" opens the OAuth window; on return the row turns green with a toast "Spotify connected". Expired tokens show an orange dot and **Reconnect** as the primary action (the Player toolbar shows the same orange dot on the Source chip).
- YouTube and Drive are separate rows (today both are inside "Google"); they may share one Google consent behind the scenes.
- Owner-only setup (deployment secrets) moves under Advanced with the docs link; DJs never see "the owner adds … secrets" text in the main list.
- Export rows that need a connection get an inline **Connect** button instead of "Connect in Settings".

### 10.2 Models (AI)

```
MODELS
 API keys (stored in this browser only, never on the server)
  Anthropic      •••• 4f2a   Verified 2 min ago     [Test] [Remove]
  OpenAI         Add key ›
  Model for written reviews   claude-… ▾
 Agents (ACP)
  [●] Local agent  ws://localhost:…   Connected    [Disconnect]
  [+] Add agent…  (name, endpoint, token)
 Used for: Written review · AI pick in Swap · Mood check
```
The section name is "Models", not "Written reviews"; the features that use it are listed as "Used for".

---

## 11. References

Mobbin (screens viewed in this research):
- [M1] YouTube Music web, player with Up next panel: https://mobbin.com/screens/55d879c6-3710-4626-8883-a0943cb7f96c
- [M2] Suno web, library with queue panel and bottom bar: https://mobbin.com/screens/a62f88b0-6107-4fcd-821a-42d873f80732
- [M3] TIDAL web, play queue panel + bottom bar: https://mobbin.com/screens/390d0ce8-ec6f-4764-a1a6-c9b725aea8ea
- [M4] Spotify web, Library sidebar + Queue panel + bottom bar: https://mobbin.com/screens/dcdeefb6-94d9-4588-ad4e-b2965cad2798
- [M5] Apple Music web, sidebar sections + Up next + mini player: https://mobbin.com/screens/de48a956-6060-4086-b8ed-26e80ec6ac3e
- [M6] Deezer web, search within tracks, bottom bar: https://mobbin.com/screens/a2136cbb-8170-40c5-93e7-9d837428fbc8
- [M7] SoundCloud web, waveform player: https://mobbin.com/screens/301a21e9-d189-4959-9e06-efe024cc9c2b
- [M8] Untitled music app web, floating queue + waveform bar: https://mobbin.com/screens/7c19cb8c-57ca-414d-b571-f4d4fe6c82b0
- [M9] Spotify iOS, Edit transition (two waveforms, BPM, Camelot key, Volume/EQ/Effects, Auto/Fade/Rise/Blend): https://mobbin.com/screens/041b7263-16cc-46ad-8fb7-56890d05374d
- [M10] Spotify iOS, playlist with Mix / Edit / Sort chips: https://mobbin.com/screens/e64c32b5-563a-43b0-b073-a2452f5a2eae
- [M11] Spotify iOS, Mix on: BPM + key per row, Auto transition chips: https://mobbin.com/screens/df8b5f03-678c-483a-8c0b-4bf4e721114a
- [M12] Spotify iOS, Mix: Custom / Auto / No transition between rows: https://mobbin.com/screens/db0a6fc3-efdd-4259-a26e-4d9cf4fd850a
- [M13] Spotify iOS, Queue sheet with Shuffle / Repeat / Timer: https://mobbin.com/screens/f86dc1c9-50a6-4dda-a162-85f41f167386
- [M14] Apple Podcasts iOS, output picker: https://mobbin.com/screens/b7892e24-f699-4af4-84eb-47b3d55d22bf
- [M15] Waking Up iOS, AirPlay output list: https://mobbin.com/screens/f3d71983-4ee1-4ddd-957d-fb7f697a7ab9
- [M16] Replika iOS, "Select audio device": https://mobbin.com/screens/6b2dca6f-7532-4495-b280-9dd21f368ed2
- [M17] Artlist web, filter panel with chips + BPM range + waveform rows: https://mobbin.com/screens/6354ff77-3702-4cdd-86ea-368ab0b6ee76
- [M18] Suno web, filter popover with check rows: https://mobbin.com/screens/4778e666-8f77-44ea-bf1c-e604da2407e3
- [M19] Epidemic Sound web, BPM / duration filters over a waveform list: https://mobbin.com/screens/216ff78f-6611-4210-9075-d002cb7b4c6e
- [M20] Featurebase web, settings: left list + toggles with descriptions: https://mobbin.com/screens/965bbbe2-0d63-40a5-8d0e-3b8f3db85fd0
- [M21] Buffer web, feature toggles with one-line descriptions: https://mobbin.com/screens/4b741547-5691-479c-a314-e484131f7426
- [M22] Customer.io web, grouped feature toggles: https://mobbin.com/screens/a1452449-634b-45f7-8340-447391cf7577
- [M23] Plane web, project settings: Features section list + toggle: https://mobbin.com/screens/67dae748-3470-409d-b0b5-d610604771d0
- [M24] Lindy web, Connections table (App, Used by, Status): https://mobbin.com/screens/8db0619f-693e-4b23-b588-6111e9f0d0db
- [M25] Linear web, Connected accounts: https://mobbin.com/screens/3b7417c7-551f-4935-890f-4788e4d8d334
- [M26] Rox web, Integrations: Current vs Not connected: https://mobbin.com/screens/2820d9c1-11bc-4134-9274-87035d73da60
- [M27] Unify web, integrations grouped by purpose with "● Connected": https://mobbin.com/screens/0de48d81-31f7-433e-b281-164b48058fe1
- [M28] Twenty web, right inspector with grouped rows and toggles: https://mobbin.com/screens/5f3acf6e-72f8-45a1-9b62-0387469bb15a
- [M29] Untitled music app web, song sheet: Key, BPM, waveform play, Active version, Add new version: https://mobbin.com/screens/613e7abc-e3c5-473a-8c47-88abe80c72b2

Public knowledge (shipping apps, not on Mobbin):
- [P1] Spotify desktop: Library sidebar, Now Playing / Queue right panel, bottom player bar with Connect device picker; Settings → Playback (Crossfade, Automix, Gapless, Normalise).
- [P2] Apple Music for macOS: sidebar, toolbar LCD transport, Playing Next inspector, Get Info → Options (start / stop time, volume adjustment), Settings window.
- [P3] djay Pro (macOS / iPad): decks top, library bottom, Automix queue with transition settings, per-deck Pre-Cue, Settings → Audio split output (master 1/2, headphones 3/4).
- [P4] rekordbox: tree sidebar + browser with BPM / Key / colour columns, Related Tracks, headphones CUE, Preferences → Audio master / headphones routing.
- [P5] Serato DJ: crates sidebar inside the library, decks above, Prepare crate, CUE per channel.
- [P6] Traktor Pro: browser tree, preview player in the browser header, Preferences → Output Routing (Monitor / Master).
- [P7] Engine DJ: track info with key / BPM on deck, library columns.
- [P8] Mixxx: library sidebar with Auto DJ, Preview column routed to headphones, Preferences → Sound Hardware (Main / Headphones).

---

## 12. Prioritised changes for the engineers (per file / component)

Priority = impact on "I can't find it" × night-time risk. P0 = before the next real night.

| # | P | Change | Files |
| --- | --- | --- | --- |
| 1 | P0 | **Pre-listen to a real second output.** Add `cueSinkId` / `roomSinkId` to booth settings; route the room engine with `AudioContext.setSinkId`, the cue player with its own context / `HTMLAudioElement.setSinkId`; disable Pre-listen when cue == room or unsupported, with the reason; rename "Preview only (headphones)" → "Pre-listen in headphones". | `lib/booth/store.ts`, `lib/booth/engine.ts`, `lib/booth/sources/preview.ts`, `components/booth/SetColumn.tsx` (`PlaySheet`), new `components/booth/OutputChip.tsx` |
| 2 | P0 | **Room vs headphones UI**: two output chips in the Player toolbar, `--room` / `--cue` tokens (light/dark, §4.5), pre-listen status in the transport bar, blue headphones glyph on the row being heard. | `app/globals.css`, new `components/booth/PlayerToolbar.tsx`, `components/booth/Meter.tsx` |
| 3 | P0 | **NightBar** at the top of the set list: time, ends, tandas left, Time to La Cumparsita, "Play the rest, then La Cumparsita", "Jump to La Cumparsita now" (confirm), "Last 4 tandas tango only" switch, Break, `⋯` (Birthday vals, End the night). Remove those rows from the ••• menu; fold `TimeCard`. | `components/booth/SetColumn.tsx`, `components/booth/TimeCard.tsx`, `app/booth/page.tsx` (menu array) |
| 4 | P0 | **Labelled transport bar** replacing `ControlStrip` at ≥ 640 px: zones Now / Transport (Fade, Crossfade, Pause, Next at gap, Stop) / Room level + mute / Hold, Talk. Nothing hides on iPad; labels at ≥ 1180 px, tooltips below. Mix button opens the Mix panel only (no actions inside). | `components/booth/ControlStrip.tsx` → `TransportBar.tsx`, `components/booth/Sheets.tsx` (Mix sheet becomes settings-only) |
| 5 | P0 | **Phone and iPad can always reach the Player**: add Player to the phone tab bar (Compose · Player · Music · Settings + ⌕), keep the tab bar visible while a night runs, mini transport docked over it. | `components/Nav.tsx`, `components/MiniPlayer.tsx`, `components/booth/ControlStrip.tsx` |
| 6 | P1 | **Persistent transport on every page while a night is loaded** (Spotify bottom bar): move the transport bar into `app/layout.tsx`; desktop `MiniPlayer` yields to it. | `app/layout.tsx`, `components/MiniPlayer.tsx`, new `components/booth/TransportBar.tsx` |
| 7 | P1 | **Shared search side panel** (title, orchestra, singer, year range, rhythm chips, era, BPM; "In tanda n" status; 🎧 pre-listen; Play next / Replace / Add) on Compose, Player, Music; ⌘F. | new `components/SearchPanel.tsx`, `components/SearchField.tsx`, `Composer.tsx`, `app/booth/page.tsx`, `app/database/page.tsx`, `/api/search` |
| 8 | P1 | **Info panel (Get Info)**: era, BPM, key, energy, waveform with drag in/out trim + gain stepper, versions list with play and "Use this version", sources, editable details with "Your edit" badges. ⌘I. | new `components/InfoPanel.tsx`, new `components/Waveform.tsx`, `lib/booth/store.ts` (`setTrim`, trim in/out per song), `lib/overrides.ts` |
| 9 | P1 | **Era badge** (four-bar glyph, gold `--era`, outline `--era-empty`, legend) on every row: Player set list, Now deck, Compose tanda rows, search results, Music. Grade from `coverage.json` via core. | new `components/EraBadge.tsx`, `TrackRow.tsx`, `TandaCard.tsx`, `components/booth/SetColumn.tsx`, `components/booth/NowCard.tsx`, `packages/core/src/catalog.ts` (expose grade lookup) |
| 10 | P1 | **BPM · key column + energy gutter** instead of the chip that truncates titles; same on Player rows and Now deck. | `TandaCard.tsx`, `TrackRow.tsx`, `components/booth/SetColumn.tsx`, `components/booth/NowCard.tsx` |
| 11 | P1 | **Settings rebuilt as one page with a left section list**: General, Indicators, Tanda rules, Night shape, Learning, Playback & Mix, Headphones, Connections, Models, Language, Storage · Help; every indicator/rule/automation one switch with a footer; settings search. Move Rules / Context / Memory out of Database; onboarding sheet keeps only first-run choices and links here. | `app/settings/page.tsx`, `components/Form.tsx`, `components/TandaRules.tsx`, `components/db/RulesTab.tsx`, `components/db/MemoryTab.tsx`, `components/booth/OnboardingSheet.tsx` |
| 12 | P1 | **Learned preferences as an editable list** (rule in words, weight, source count, delete, forget all) in Settings → Learning; one switch "Learn from my edits". | `app/settings/page.tsx`, `components/db/MemoryTab.tsx`, `lib/memory.ts` |
| 13 | P2 | **Music = Library + Database merged**: Songs grouped by work with all versions/years, each playable (🎧 / ▶), editable via Info; Orchestras with editable heatmap; Cortinas. Redirect `/library` and `/database` to `/music?tab=`. | `app/library/page.tsx`, `app/database/page.tsx`, `components/db/SongsTab.tsx`, `components/db/OrchestrasTab.tsx`, `components/Nav.tsx` |
| 14 | P2 | **Connections screen**: grouped by purpose, status dot, Used by, one primary action, Reconnect on expiry; YouTube and Drive as their own rows; owner setup under Advanced; inline Connect in Export. **Models** section: keys (BYOK, browser-only), model picker, ACP agents. | `components/Connectors.tsx`, `components/ExportSheet.tsx`, `app/settings/page.tsx` |
| 15 | P2 | **Navigation + shortcuts**: sidebar sections (Night / Music / Settings), Booth → Player rename (keep `/booth`), ⌘1–5, ⌘, ⌘F ⌘I ⌘M, ⏎ / ⌘⏎ / P / S on the selected row, ⌥↑↓ for cortina level; Compose toolbar gets "Play the night" as primary. | `components/Nav.tsx`, `app/booth/page.tsx` (key handler), `components/booth/Sheets.tsx` (Keyboard sheet), `Composer.tsx` |
| 16 | P2 | **Mix panel (Spotify-style)**: transitions (gap, fades, crossfade, automatic crossfade), levels (room, cortinas, loudness, talk-over dip), source (full Spotify tracks, rehearsal) with every value in its row; per-transition chip between tandas later. | `components/booth/Sheets.tsx` → `components/booth/MixPanel.tsx`, `lib/booth/store.ts` |
| 17 | P2 | **Vertical energy rail** on the Player replacing the Next card. | new `components/booth/EnergyRail.tsx`, `components/EnergyCurve.tsx` (shared scales), `components/booth/NextCard.tsx` |
| 18 | P2 | **Turkish**: string catalogue (en, tr, es) with a Language picker in Settings; Turkish glossary for DJ terms (tanda, cortina stay as is; "Ön dinleme" = pre-listen, "Salon" = room, "Kulaklık" = headphones, "Bu gece atla" = skip tonight). Check text lengths: Turkish runs ~20–30 % longer; transport labels need the icon-only fallback. | new `apps/web/src/lib/i18n/*`, every component with UI strings |
| 19 | P3 | Skipped tanda styling (40 % dim, "Skipped tonight" chip, excluded from time-left), selection state for rows, swap icon in `--label-3` instead of rose. | `components/booth/SetColumn.tsx`, `app/globals.css` |

### Acceptance checks (for `pnpm e2e` and the quality agents)
- Every action in §4.1 is reachable in ≤ 1 tap/click from the Player at 1440, 1180×820 and 390 (no overflow menu for night or song actions).
- With cue == room output, Pre-listen is disabled and says why; with two outputs, playing a pre-listen leaves the room meter unchanged.
- Era / energy / BPM / key toggles in Settings hide the indicator everywhere it appears.
- All new colours pass 4.5:1 for text and 3:1 for glyphs on `surface` light (#FFFFFF) and dark (#181622); values in §4.5 and §7.3 were checked.
- `pnpm media` regenerated after the layout lands (README captures).
