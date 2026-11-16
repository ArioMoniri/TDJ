# Roadmap

Phases are sized for one worktree each (see `docs/WORKTREES.md`). ✅ shipped · 🔧 in progress · ⏳ planned.

## Phase 0 — Foundation ✅
Catalogue index in-repo (21,932 recordings, orchestra heatmap), composer engine (tandas, arc, cortinas, Cumparsita), benchmark scorer, exports, liquid-glass web app (desktop + mobile), BYOK panel, CI, SST/OIDC deploy, Remotion launch video, agent reviews.

## Phase 1 — Trust the ears 🔧
- ✅ Musician + DJ review corrections applied (44 profiles, 338 track energies, index v2 with approximate years, medley/solo-piano flags).
- ✅ Reference corpus (31 sets, 218 canonical tandas, 1,078 famous recordings, blacklist) and corpus rules in the engine.
- ✅ Context factors (season, weather, room, time, event, crowd, region, holiday, mood) with evidence grades.
- ✅ Per-user overrides database, feedback loop, locks, track swap, export with/without cortinas, multi-provider AI.
- Spotify enrichment of golden-age tandas (`pnpm index:enrich`), commit cache; `requireSpotify` option becomes useful.
- BPM/key per recording: in-browser beat detection on previews (`web-audio-beat-detector`, MIT) → `data/cache/bpm.json`; activate rubric C9.
- Transfer-tier tagging per album/label (TangoTunes, CTA, El Bandoneón, Euro Records…).

## Phase 2 — The DJ booth 🔧
- ✅ Locks that survive recompose, per-track swap, feedback chips and free-text refine, night rules (Cumparsitas, birthday vals, show break, opener/última), era presets with pinned controls, agent memory, Apple-native UI and motion system.
- Lock/unlock tandas (persisted), drag reorder, swap a single track, "avoid this orchestra tonight".
- Clock view (wall-clock timeline, "we are here"), print/PDF set list, request queue with insert-at-energy.
- Floor-feedback knob (re-plan remaining night up/down 10 energy points).
- Regional presets (Buenos Aires traditional, European marathon, Istanbul, Asia, US alternative).

## Phase 3 — Everywhere ⏳
- Serato `.crate` binary writer, VirtualDJ `.vdjfolder`, Engine DJ import; local-file matching for DJ apps (choose music folder, fuzzy match to M3U8).
- Apple Music / TIDAL / Deezer resolvers behind the same `Resolved` interface.
- PWA offline mode (index cached in IndexedDB), share link with seed + options.

## Phase 4 — Community ⏳
- Public set gallery with benchmark scores, import tandas from El Recodo / tango.info links.
- Multi-user accounts on AWS (Cognito) with encrypted BYOK storage (KMS envelope) instead of localStorage.
- Remotion "set trailer" per playlist.

---

# Round 22 onward (the DJ's requests of 2026-11-14)

Status legend: ☐ to do · ◐ in progress · ☑ done (with the commit that did it)

Every item has an on/off switch in Settings where it is an indicator, a rule or an automatic behaviour ("all indicators and features can be turned on or off in the UI").

## 0. In flight
- ◐ Round 21b — the DJ's featured night (25 tandas, pinned tandas, Tango Bardo, Bandonegro), skip tonight, last 4 tandas tango only, Jump to La Cumparsita, closing-harmony setting (OFF by default; the DJ matches manually this time), learned preferences; making the full core suite and `pnpm quality` green again.

## 1. Player (Booth) — information architecture and DJ features
- ☑ Re-organise the player like DJ apps and Spotify: transport and now-playing always in one place, queue/set list beside it, tools (mix, fades, cortina, skip, Cumparsita) grouped where a DJ expects them (research: Mobbin, Spotify, djay, rekordbox, Serato, Traktor, Mixxx, Engine DJ). (round 22 booth branch, `1b6eb3e`)
- ☑ Headphone pre-listen (cue on a second output, `setSinkId`) of the next song or any song, without disturbing the room; unmistakable "room vs headphones" UI. (round 22 booth branch, `1b6eb3e`)
- ☑ Tap any song to play/test; play any version of a song from the database. (round 22 booth branch, `1b6eb3e`)
- ☑ Spotify "Mix" style settings in the player (crossfade, gap, automix-like transitions), with every setting and its info visible. (round 22 booth branch, `1b6eb3e`)
- ☑ Skip tonight per tanda (milongas/valses), last-4-tango mode, Jump to Cumparsita — polished UX (engine from round 21). (round 22 booth branch, `1b6eb3e`)
- ☑ Energy chart (vertical, like the night's arc), BPM and key indicators per song. (round 22 booth branch, `1b6eb3e`)
- ☑ Per-song trim and waveform with drag-to-set cue/stop. (round 22 booth branch, `1b6eb3e`)
- ☑ Premium: full Spotify tracks by default when connected. (round 22 booth branch, `1b6eb3e`)

## 2. Compose page
- ☑ Song search side panel (title, orchestra, singer, year, rhythm tango/milonga/vals), filterable, showing which tanda/part a song is in (round 22: Compose and the Booth; swap in, add, preview).
- ☑ Energy chart, BPM and key per song; tanda-level tone (round 22: song-by-song chart, tone chip per tanda).
- ☑ Swap sheet (round 21) polish: search, suggestions, AI pick (round 22: ranked by fit, artwork, era).

## 3. Database tab
- ☑ Every song's versions/years shown together, each playable (round 22).
- ☑ Scraped data (Spotify/Deezer ids, BPM, gain, key, release dates, vocal style) stored and refreshed when sources change; per-user editable; the DJ's edit wins (round 22: `overrides.scraped`, core `songData`).
- ☑ Era indicator data (the user's All_orchestras heatmap grades, `data/index/coverage.json`) editable per user; shipped as defaults for every self-deployed instance (round 22: Orchestras › Edit era grades).

## 4. Era indicator (toggle)
- ☑ Colour badge on every song in the player, compose and database (round 22: the booth branch for the player; the compose/database branch for compose, database and search): where the side sits in its orchestra's best years (grade from the user's heatmap: best / good / weak / outside), with a legend.

## 5. Learning per instance (toggle)
- ☑ Every deployed instance learns from its DJ's swaps, pins and edits (like an autocorrect), applies it to future generations, and shows the learned preferences and rules as a list the DJ can edit, weight or delete. (`653e2f5`: likes teach, the featured night's edits shown in Settings; `bbf1c55`: DJ praise; `6f81be1`: dancer favourites from floor reactions and room hearts)

## 6. Settings, connections and accounts
- ☐ One clear Settings layout; every indicator/rule/automation toggleable with a one-line explanation.
- ☐ Easier connections (Spotify, Deezer, YouTube, Dropbox, Drive): one "Connections" screen with status and one-tap reconnect.
- ☐ Models: API keys (BYOK) and ACP (Agent Client Protocol) connections to local/remote agents.

## 7. Language
- ☑ Turkish across every screen (and the language switch in Settings). (`337a3cc`)

## 8. Design and motion
- ☐ Native macOS feel (sidebar, toolbar, sheets, keyboard, hover, focus rings, springs), iPadOS feel on tablets.
- ☐ Motion spec applied to navigation, sheets, player transport, tanda changes, swaps.

## 9. Apps and release
- ☐ macOS app and iPadOS app with every web feature (DJ player included).
- ☐ CI on macOS runners: build, sign, notarise (macOS), upload to App Store Connect (both), TestFlight.
- ☐ App Store assets generated automatically (screenshots per device, banners, description, keywords, what's new), reviewed by the designers.
- ☐ GitHub Release with the macOS download; "Download for macOS" button in the README.
- ☐ Needs from the owner: Apple Developer team, App Store Connect API key (Issuer ID, Key ID, .p8), signing certificates — stored as GitHub Actions secrets (names in docs/APPLE_SETUP.md).

## 10. Data rounds carried over
- ☐ Spotify ids for 99.5 % of the golden-set sides (re-measure the ratchets first).
- ☐ A gentler final vals option.

## 11. Quality loop
- ☐ Test-user agents (DJ, organiser, newcomer, iPad DJ) on web and apps → issues → engineers/designers fix → re-test.
- ◐ CI green, README images and videos regenerated (`pnpm media`, `pnpm video`), deploy. (README media re-captured after the Booth on iPad, Build by hand, search, favourites and Rooms work; deploy pending)

## 12. The DJ's requests of 2026-11-14 (second batch)
- ☐ Compose UI: tanda cards one shape whatever the count (3 valses vs 4 tangos), correct bar spacing, the song data menu never cropped (portal/flip), no overlaps anywhere, header on scroll uses a material that never mixes with content (the large-title → inline-title transition).
- ☑ Artwork on every song (player, compose, database; round 22) from Spotify/Deezer album art, cached; a placeholder per orchestra when none.
- ☐ Hover/long-press explanations on every feature (tooltips with the one-line "what it does"), no engineer-facing text in the UI (e.g. "Set TDJ_DB_TABLE on the server…", workspace-ID notes) — those settings are handled by the deploy and the app itself.
- ◐ Missing data (BPM, key, gain, artwork, dates; round 22: Deezer, MusicBrainz, Cover Art Archive, Discogs with a token, Spotify login, Settings › Data sources): fill from every source the DJ connects (Spotify, Deezer, MusicBrainz/Discogs and others found by the council), with an "add a source" flow in Settings → Connections.
- ☑ Rooms: create a room (named, renamable), share a code, several DJs edit the same night live; a log tab of who did what; a list of previous rooms with their logs. Apps: username + room code. Web self-deploys: the same. (the web keeps rooms in the deployment's DynamoDB table since `999810a`; the apps through a linked server, `69f27fc`)
- ☑ Prompt the model in Compose to edit and swap songs ("make tanda 7 calmer", "swap the 2nd song for a Fiorentino"), fast and accurate, besides the manual controls; ACP agents usable exactly like API keys for every generation.
- ☑ Manual playlist creation: pick songs yourself with live suggestions/guidance for what comes next that update after each added song (switchable).
- ☑ Database → Orchestras tab redesigned (clear grouping, eras, singers, best years; round 22).
- ☐ Guide page refreshed with Lottie, illustrations and motion.
- ☐ One-click self-deploy that sets everything up (database, storage, connectors) from the app, no manual env steps.
- ☐ Features from other tango and DJ apps (competitor survey).

## 13. Share a night between accounts, instances and apps (the DJ's request of 2026-11-14)
- ☐ Export a composed night as a `.tdjnight` file (versioned JSON: tandas, sides with every stream id, cortinas, Cumparsitas, skip/bypass flags, the night's settings and score; no keys, tokens or personal data) and import it anywhere: web, self-deployed instance, macOS and iPad apps (Files, AirDrop, drag-and-drop, "Open in T-DJ").
- ☐ Share link: "Copy link" packs the night into the URL fragment (compressed, so it never reaches a server log), or a short link stored by the instance when it has a database; opening it on any instance shows a preview, then "Import this night".
- ☐ Universal link / `tdj://night?...` opens the link straight in the installed Mac or iPad app (the apps already route `tdj://open`); QR code in the share sheet for phone → iPad.
- ☐ On import: sides resolved against the local catalogue by stable id, then title/orchestra/year; anything missing listed, never silently dropped; the imported night lands in History ("On this device") and can be edited, played and exported to Spotify like a composed one.
- ☐ Tests: export → import round-trip is identical (core vitest); a link made on one deploy opens on another (e2e); a file from the web opens in the app.

## 14. Shipped in the November rounds (the Booth on iPad and after)
- ☑ iOS 26 phone chrome (one tab capsule, actions in the navigation bar) and the Booth laid out for an iPad in landscape (`4d4e8fa`, `42deacd`).
- ☑ One tap plays any song or cortina; reorder songs inside a tanda; tanda type badges and lengths (`03d63e3`).
- ☑ Build by hand as a guided builder (`b40a5e7`).
- ☑ One search for the Library and the Database, accent-blind and typo-tolerant (`93d8627`); Booth search across tonight's night with one-tap Swap (`37f6f73`).
- ☑ Booth: start from any row, Previous / Next, seek and start point, the Controls panel (`ae22f4e`, `de94a0e`); light confirmation mid-night (`42deacd`).
- ☑ Per-transition editor laid out like a Mix editor (`c9d737e`); cortinas start at their chorus (`0216d61`).
- ☑ Dancer favourites (`6f81be1`), database popularity (`89a5877`), DJ praise as feedback (`65357a8`); the rule check before an edit (`6c29836`).
- ☑ Spotify Connect: a 404 never stops the night, plain banners (`aa1df94`).
- ☑ Artwork everywhere (`c238adf`); a cover per night (`8651fe8`); era labels in titles and covers (`20b4ef6`).
- ☑ Contemporary-orchestra importer, first Sexteto Cristal (`742cf89`, `pnpm orchestra:import`).

## 15. The DJ's requests of 2026-11-16 (open; in progress unless marked)

Release rule: when a new change is asked for, the README, store images, launch video, app builds and the release
wait until it is done, so the media always show the current UI.

**QA fixes (DJ, design and function reviews of 71956fe)** — Booth, Compose/Rooms/Import/data, Turkish and targets;
CI green and sharded (e2e under ~40 min).

**Booth**
- Phone: compact nav bar (large title collapses, scrollable chip row) and a floating transport like Apple Music
  (cover + marquee, round Play/Pause, Stop with confirm, "…" for set list, Controls, Mix).
- One player in the sidebar (desktop/iPad), merging the sidebar now-playing card and the floating mini player;
  gramophone mode (round cover, ring for time left) when narrow; draggable/resizable on phone.
- Pre-listen on a second output or device while the tanda plays to the room (jack vs speaker/headphones/phone),
  always showing where each sound goes; nothing reaches the room without confirmation.
- Enter confirms Play now in the pop-up; toasts with a close button, Esc, swipe, hover-pause.
- Energy card: Scrub as a compact pill, one-line title, labels clear of the dots.
- BoothMini's "tap again to jump" bubble anchored to the marker.
- Load a night… (Compose, History, featured, Import from Spotify/YouTube/files/text) and Clear the Booth.
- Transition editor: Audition plays the real transition per source; custom transition templates with defaults per
  boundary and rhythm; an informed Spotify shape and real waveforms from a matching local file.
- Now playing redesign (artwork backdrop, progress, transport, tabs Lyrics · Video · Rhythm · About), an
  always-working beat animation (estimated grid from BPM, tap to lock), Find a video, Song info over Now playing.
- Floor screen for dancers (song N of 4, a join-the-floor strip, cortina countdown, next tanda, lyrics or video),
  mirrored to a second display, a Mac external monitor, or any device via the room's dancer link.

**Songs, lyrics and Song DNA**
- Song details and Song DNA from every song (right-click / long-press menu, ⓘ, "i"), including the Booth's
  Song info; Back between DNA pages; a redesigned recordings-over-the-years chart; covers on every version;
  correct "This recording"; reissue years marked.
- Lyrics follow the playing song in real time; tap a line to play from there (Booth rules apply); lyrics found
  automatically (query ladder, by work) with optional Musixmatch/Genius (own key) and paste.
- "Measure from your file" works or says why; covers for solo-singer-with-guitars sides.

**Compose, Build by hand, Rooms, History**
- Edit guide as an opaque card that never covers the inspector or the player.
- Build by hand: Undo/Redo/Reset in the header, Fill menu (next tanda / one TTVTTM cycle / to length / all),
  two-line suggestion rows, equal chip heights.
- Delete nights from Recent nights and History (with Undo; never the playing night).
- Rooms: start empty; full night editor.

**Everywhere**
- Redo also on ⌘Y / Ctrl+Y (editable); shake to undo on phones and tablets (asks first).
- Battery saver (Off / Auto / On) for web and apps, never touching playback timing.
- Sidebar open/close and drag at 60 fps.

**Repository and release**
- No public web instance: "Deploy your own" (one-line install, `tdj` CLI with guide, one-click AWS via a fork).
- CONTRIBUTING, issue forms, PR template, Code of Conduct, Security, Support.
- License: PolyForm Noncommercial 1.0.0 (Ariorad Moniri); "Developed by Ariorad Moniri" in About, Guide,
  sidebar, CLI, store text and the app's About panel.
- README: one 840 px media column, App Store-style buttons, laptop lid-open hero animation, better phone frames,
  real music in waveform captures, no tooltips in captures.
- Then: README and store screenshots (iPhone, iPad, Mac; en + tr), banner, launch video, v1.0.0 release from one
  commit (web + DMG + Mac App Store + iOS), DMG auto-update checked, TestFlight, App Store submission.
