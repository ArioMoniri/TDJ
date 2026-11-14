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
- ☐ Re-organise the player like DJ apps and Spotify: transport and now-playing always in one place, queue/set list beside it, tools (mix, fades, cortina, skip, Cumparsita) grouped where a DJ expects them (research: Mobbin, Spotify, djay, rekordbox, Serato, Traktor, Mixxx, Engine DJ).
- ☐ Headphone pre-listen (cue on a second output, `setSinkId`) of the next song or any song, without disturbing the room; unmistakable "room vs headphones" UI.
- ☐ Tap any song to play/test; play any version of a song from the database.
- ☐ Spotify "Mix" style settings in the player (crossfade, gap, automix-like transitions), with every setting and its info visible.
- ☐ Skip tonight per tanda (milongas/valses), last-4-tango mode, Jump to Cumparsita — polished UX (engine from round 21).
- ☐ Energy chart (vertical, like the night's arc), BPM and key indicators per song.
- ☐ Per-song trim and waveform with drag-to-set cue/stop.
- ☐ Premium: full Spotify tracks by default when connected.

## 2. Compose page
- ☐ Song search side panel (title, orchestra, singer, year, rhythm tango/milonga/vals), filterable, showing which tanda/part a song is in.
- ☐ Energy chart, BPM and key per song; tanda-level tone.
- ☐ Swap sheet (round 21) polish: search, suggestions, AI pick.

## 3. Database tab
- ☐ Every song's versions/years shown together, each playable.
- ☐ Scraped data (Spotify/Deezer ids, BPM, gain, key, release dates, vocal style) stored and refreshed when sources change; per-user editable; the DJ's edit wins.
- ☐ Era indicator data (the user's All_orchestras heatmap grades, `data/index/coverage.json`) editable per user; shipped as defaults for every self-deployed instance.

## 4. Era indicator (toggle)
- ☐ Colour badge on every song in the player, compose and database: where the side sits in its orchestra's best years (grade from the user's heatmap: best / good / weak / outside), with a legend.

## 5. Learning per instance (toggle)
- ☐ Every deployed instance learns from its DJ's swaps, pins and edits (like an autocorrect), applies it to future generations, and shows the learned preferences and rules as a list the DJ can edit, weight or delete.

## 6. Settings, connections and accounts
- ☐ One clear Settings layout; every indicator/rule/automation toggleable with a one-line explanation.
- ☐ Easier connections (Spotify, Deezer, YouTube, Dropbox, Drive): one "Connections" screen with status and one-tap reconnect.
- ☐ Models: API keys (BYOK) and ACP (Agent Client Protocol) connections to local/remote agents.

## 7. Language
- ☐ Turkish across every screen (and the language switch in Settings).

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
- ☐ CI green, README images and videos regenerated (`pnpm media`, `pnpm video`), deploy.

## 12. The DJ's requests of 2026-11-14 (second batch)
- ☐ Compose UI: tanda cards one shape whatever the count (3 valses vs 4 tangos), correct bar spacing, the song data menu never cropped (portal/flip), no overlaps anywhere, header on scroll uses a material that never mixes with content (the large-title → inline-title transition).
- ☐ Artwork on every song (player, compose, database) from Spotify/Deezer album art, cached; a placeholder per orchestra when none.
- ☐ Hover/long-press explanations on every feature (tooltips with the one-line "what it does"), no engineer-facing text in the UI (e.g. "Set TDJ_DB_TABLE on the server…", workspace-ID notes) — those settings are handled by the deploy and the app itself.
- ☐ Missing data (BPM, key, gain, artwork, dates): fill from every source the DJ connects (Spotify, Deezer, MusicBrainz/Discogs and others found by the council), with an "add a source" flow in Settings → Connections.
- ☐ Rooms: create a room (named, renamable), share a code, several DJs edit the same night live; a log tab of who did what; a list of previous rooms with their logs. Apps: username + room code. Web self-deploys: the same.
- ☐ Prompt the model in Compose to edit and swap songs ("make tanda 7 calmer", "swap the 2nd song for a Fiorentino"), fast and accurate, besides the manual controls; ACP agents usable exactly like API keys for every generation.
- ☐ Manual playlist creation: pick songs yourself with live suggestions/guidance for what comes next that update after each added song (switchable).
- ☐ Database → Orchestras tab redesigned (clear grouping, eras, singers, best years).
- ☐ Guide page refreshed with Lottie, illustrations and motion.
- ☐ One-click self-deploy that sets everything up (database, storage, connectors) from the app, no manual env steps.
- ☐ Features from other tango and DJ apps (competitor survey).
