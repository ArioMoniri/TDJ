# Round 4 — web spec: play, analyse, index, history, editable guide

Engine side already landed (see `packages/core/src/audio/*`, `data/cache/resolve/tracks.json`, `data/cache/audio/features.json`, `docs/research/audio-features.md`, `data/knowledge/audio_model.json`). Songs returned by `/api/compose` and `/api/search` now carry:

- `song.resolved` — `{ provider:"deezer", id, title, artist, album, durationMs, previewUrl (30 s MP3, CORS *), url, artwork, confidence }` or null
- `song.audio` — `AudioFeatures` `{ bpm, bpmCandidates, key, mode, camelot, keyConfidence, loudnessDb, loudnessRange, brightnessHz, onsetsPerSec, energy, chroma }` or null
- `tanda.cohesion` — 0..100 badge (`cohesionLabel()` in core: seamless ≥85, fine ≥70, audible step ≥55, jarring)
- score card has a `cohesion` factor.

## 1. Per-song play button (every track row, every screen that lists songs)
- `TrackRow` gets a leading 44 px play/pause control (replaces the number while playing; number returns on pause). One global `usePlayer` store (Zustand) so only one preview plays at a time; a persistent mini-player bar sits above the tab bar (glass, title · orchestra · year, progress scrubber, 30 s preview badge, close). Keyboard: space toggles when a row is focused.
- Source order: Spotify full track when the user is connected and the song has a `spotify.id` (use the existing `Listen` embed approach but inline), else `resolved.previewUrl` via `<audio>`; if neither, the button becomes "Find" (see §3).
- Mobile: tap play never triggers the swipe-swap gesture; audio plays through `<audio playsInline>`.

## 2. Notes, keys and compatibility
- Track row trailing cluster shows `key` as Apple-style monospace chip (`F♯m · 11A`) and BPM when `audio` exists; tooltip/long-press sheet with loudness, brightness, onsets, keyConfidence, "analysed from 30 s preview (edition: Deezer)" caveat.
- Tanda card header shows the cohesion badge with the label and a popover listing each consecutive pair's parts (tempo/loudness/key/brightness/energy as 5 tiny bars). Colours: seamless = accent, fine = neutral, audible step = amber, jarring = rose.
- "Analyse in browser" action on a track row without `audio` but with `previewUrl`: fetch the preview, `AudioContext.decodeAudioData`, downmix, run `analyzePcm` from `@tdj/core` inside a Web Worker (`apps/web/src/workers/analyze.worker.ts`), write the result into user overrides `songs[id].audio` (new field in `AppOverrides.songs` patch), toast "Analysed: F♯ minor · 118 BPM". Core already merges `patch.audio`.
- Tanda card menu: "Analyse all tracks" runs the worker over the tanda.

## 3. Find / index a song from a service
- `POST /api/resolve` `{ id | title, orchestra, singer? }` → server queries Deezer search (keyless) and MusicBrainz recordings (`fmt=json`, UA header) and returns up to 5 candidates with `{ provider, id, title, artist, album, year?, durationMs, previewUrl, url, artwork, confidence }` plus `suggestions: { year?, singer?, durationSec? }` derived from MusicBrainz first-release date (never use streaming release dates as recording year; see research §7).
- Track row menu → "Find on services…" opens a sheet with candidates (artwork, title, artist, duration, play preview); "Use this" stores `songs[id].resolved = candidate` in overrides and, when the catalogue year is approximate or missing, offers one-tap "Apply year 1941" / "Apply singer" chips that write `songs[id].year/singer` (existing override fields). Database → Songs tab shows a "resolved" column/icon and the same actions.

## 4. History tab (previous generations)
- New bottom-tab "History" (icon `Clock`) at `/history`. Every successful compose/refine/swap stores a snapshot `{ id, createdAt, title (auto: "Sat · Golden age · 4 h"), options, playlist, score }` in IndexedDB (`tdj-history-v1`, keep last 50) and in server DB when storage mode is server (`/api/db` gets a `history` array; cap 50).
- List: grouped by day, rows with score ring, hours, era, tanda count; swipe-to-delete; tap opens the set read-only with the same TandaCard list, buttons: Reopen in Compose (loads options + playlist into the store), Re-export (existing ExportSheet), Compare (pick a second set: side-by-side score factors and orchestra list), Rename, Delete. Header shows a tiny score trend sparkline across the last 20.

## 5. Editable Guide and house rules
- Guide page gains an "Edit" mode: each section's text is editable (contenteditable textarea in a sheet) and stored in overrides `guide: Record<sectionId, string>`; a "House rules" section (free text, max 2000 chars) is appended to AI prompts (`/api/ai/review` and `/api/ai/refine` already receive overrides → `lib/server/llm.ts` adds `overrides.guide.houseRules` after DJ_RULES). "Reset section" restores the built-in text. Changes count in the Database header.

## 6. Connectors card (Settings)
- Settings → Connectors card: Spotify (existing), Deezer (keyless, "used for previews and metadata", status check `GET https://api.deezer.com/infos`), MusicBrainz (keyless), and a "Bring your own automation" row that explains webhook export: `POST /api/export` already supports formats; add an `Export → Webhook` destination in ExportSheet that POSTs the chosen format to a user-entered URL (stored in overrides `connectors.webhookUrl`, never server-side), suitable for Pipedream/Make/Zapier/n8n. Wait for `docs/research/connectors.md` if present and prefer its recommendation for naming.

## Non-negotiables
- Keep the Apple-native language (grouped forms, SF-like type, 44 px targets, glass only on control layer). Reduced-motion respected. No new deps except if strictly needed.
- `pnpm --filter @tdj/web typecheck && pnpm biome check apps/web` clean; add e2e `apps/web/e2e/round4.spec.ts` (play button renders, analyse worker produces key/bpm on a synthetic preview via route mock, history snapshot appears after compose, guide edit persists after reload, resolve sheet lists candidates with mocked API).
- Keys/URLs are BYOK and live in the browser only.
