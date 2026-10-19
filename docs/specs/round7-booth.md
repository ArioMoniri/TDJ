# Round 7 — Booth: play the night from the app

Research and feasibility: `docs/research/booth.md` (read it first; every number below is justified there). This document is the engineering spec: a `/booth` page, a `BoothEngine` on Web Audio, three source adapters (local files, Spotify Web Playback SDK, Deezer 30 s rehearsal), and the engine/export changes in `packages/core` that give the night a timing plan both the booth and the DJ-app exports follow.

Non-goals (tango never needs them): beat-matching, key lock, loops, EQ, crossfading between songs. Phase 2 (§11): second output device for pre-listen, waveform, ducked microphone announcement.

---

## 1. Page `/booth`

Route `apps/web/src/app/booth/page.tsx` (client component, `LazyHydrate` not used: the page must be interactive before the DJ's first tap). Opens on the current set (`useStore().playlist`) or on a set chosen from History; without a set it shows the empty state "Compose a night first" with a link to `/`.

### 1.1 Layout (Apple-native, dark by default, no glass on content)

- Forces `data-theme="dark"` while mounted (the DJ can switch to light from the overflow menu; the preference is per device, `localStorage`). No wallpaper tint, no glass on the content layer; the control strip at the bottom is the only glass surface, exactly as the tab bar is elsewhere (`CLAUDE.md`: glass only on the control layer).
- Three columns on ≥ 1024 px (`Now` 5/12 · `Next + Time` 4/12 · `Set` 3/12), two rows on tablet (Now + Time on top, Set below), one column on phone (Now, controls, Next, Set as a collapsible list). The page never scrolls horizontally; the set column scrolls on its own.
- Type scale, measured at 2 m from a 14″ laptop: **Now title 34 pt semibold**, orchestra/singer/year 22 pt, remaining time of the song 44 pt tabular (monospace digits), **time to Cumparsita 44 pt**, wall clock 28 pt, next tanda 22 pt, everything else SF text sizes already in `globals.css`. Minimum contrast 7:1 for the 2 m zone.
- `Now` card: `tanda n · rhythm · orchestra / singer · years` as the eyebrow, the title, a progress bar for the song (transform-only), `k of 4` dots, remaining time, the level meter (§4), the trim chip (`−1.5 dB`), the source badge (`file` / `Spotify` / `30 s rehearsal`), a `cue` button (phase 2).
- `Next` card: the next item (a track inside the running tanda, or the cortina, or the next tanda's first track) with the same eyebrow, plus the next tanda summary and its cortina (artist – title, cue-in, planned stop second). Tapping the next tanda jumps the set column there.
- `Time` card: wall clock, planned end (start time + `stats.wallClockSec`), **time to Cumparsita** (remaining planned seconds from the playhead, §6.4), drift chip (`+2:40` late / `−1:10` early vs the plan), tandas left, break countdown when inside a break.
- `Set` column: every item of `playlist.booth.items` (§7) grouped by tanda; the current item highlighted, played items dimmed, locked tandas with the lock glyph. Interaction: **swap/reorder only ahead of the playhead**; the running tanda and everything before it are read-only (`aria-disabled`, explained in a tooltip "Playing: locked"). The swap and the per-track swap reuse the existing `/api/swap` and `/api/swap-track` flows with the current playlist and lock everything up to and including the running tanda before calling them (`locked: true` on those tandas) so the engine never touches what has played.
- Control strip (glass, bottom, 64 px tall, every control ≥ 44 × 44 px): `Start the night` (becomes **Hold / Play**), **Next at gap** (→), **Stop** (red outline; press-and-hold 600 ms or a confirm sheet; keyboard esc held 600 ms), the **cortina fader** (vertical on desktop, horizontal on phone, 0…1, default 1; drag down fades the cortina and arms the next tanda, §6.2), the **master** fader (−30…+6 dB, default 0), `Birthday vals`, `Break`, overflow (gap length, fade lengths, cortina level, loudness target, trim leading silence, media keys on/off, theme, "Link music folder", "Rehearsal (30 s)").
- Keyboard: `space` hold/play (never a cut), `→` next at gap, `esc` (held 600 ms) emergency stop, `↑/↓` cortina fader ±0.05, `c` cue the cortina now (start the cortina at the next gap instead of the remaining tracks of the tanda, i.e. "end the tanda early"), `b` birthday vals, `m` master mute toggle (20 ms ramp), `?` shortcut sheet. Shortcuts are ignored while an input has focus. All of them call the same `BoothEngine` methods the buttons do.
- Status banners (sticky under the header, never toasts that vanish): output device changed (`devicechange`), folder permission needed, Spotify not Premium / token expired, decode failed for an upcoming item (with "Pick file…"), tab in background on iPad.

### 1.2 Onboarding steps (one sheet, three rows)

1. **Source**: `Your music folder` (preferred; shows "Linked: /Music/Tango · 3 412 files · 118 of 121 matched"), `Spotify` (shows Premium status from `/api/spotify/me`; grey with "Not Premium: Spotify does not allow playback in the browser" or "Not logged in"), `30 s rehearsal` (always available when previews are resolved).
2. **Output**: current default device name (from `enumerateDevices()` once permission exists; otherwise "System default"); a `Test tone` button (−20 dBFS 440 Hz, 0.5 s, through the master, so the DJ hears the room before the first tanda).
3. **Night**: start time (default now), gap length, cortina level, loudness target, trim leading silence. These are `BoothSettings` (§6.1), persisted per device and copied into `playlist.booth.settings` when the night starts, so History shows what was played with which settings.

`Start the night` is the user gesture that creates/resumes the `AudioContext`, requests the Wake Lock, registers the Media Session and arms the first item.

---

## 2. Module layout

```
apps/web/src/lib/booth/
  engine.ts          BoothEngine: graph, scheduler, state machine, public API (§6)
  plan.ts            thin re-export of @tdj/core planBooth + wall-clock helpers (§7)
  envelope.ts        pure gain curves: fadeOutCurve(n), fadeInCurve(n), dbToGain, declick constants (§5)
  loudness.ts        BS.1770 integrated loudness + sample peak + intro detection on an AudioBuffer (worker-backed) (§5.3)
  sources/
    types.ts         SourceAdapter interface (§8)
    local.ts         File System Access + webkitdirectory adapter, folder store, matcher (§8.1)
    spotify.ts       Web Playback SDK adapter (§8.2)
    preview.ts       Deezer 30 s rehearsal adapter (§8.3)
  store.ts           zustand slice: booth state mirrored for React (position, levels, banners) (§6.5)
  persist.ts         IndexedDB (idb-keyval style, no dependency): folder handle, match map, running position (§9)
  media.ts           Wake Lock + Media Session + keep-alive element (§10)
  workers/loudness.worker.ts
apps/web/src/app/booth/page.tsx, components/booth/{NowCard,NextCard,TimeCard,SetColumn,ControlStrip,Fader,Meter,OnboardingSheet}.tsx
```

The engine has no React import; the page subscribes through `store.ts`. The engine takes an `AudioContextLike` (the subset it uses: `currentTime`, `createGain`, `createBufferSource`, `createAnalyser`, `destination`, `outputLatency`, `resume`, `suspend`, `decodeAudioData`) so tests can inject an `OfflineAudioContext` or a recording fake (§12).

---

## 3. Audio graph

```
item source (AudioBufferSourceNode) → itemGain (GainNode) ─┐
cortina source                      → cortinaGain ──────────┼→ master (GainNode) → analyser (AnalyserNode, fftSize 256) → ctx.destination
test tone (OscillatorNode, 0.5 s)   → toneGain ─────────────┘
```

- One `master` and one `analyser` for the life of the page; `itemGain`/`cortinaGain` are created per item and disconnected 1 s after the item's `ended` event.
- `itemGain.gain` carries normalisation + trim as the base value and the automation (declick ramps, emergency fade). `cortinaGain.gain` additionally multiplies by the fader (`fader × base`), implemented as a second `GainNode` in series (`cortinaFader`) so the fader can move while the automated fade-out runs without cancelling it.
- `master.gain` is the DJ's fader, set with `setTargetAtTime(value, now, 0.02)` (a 20 ms time constant: no zipper noise).
- The analyser feeds a 30 fps meter: RMS (dBFS, 300 ms integration) and peak hold (1.5 s) from `getFloatTimeDomainData`; drawn on a `<canvas>` sized to the card, `transform` only. The meter is informative; it never drives gain.

---

## 4. Level meter

`Meter.tsx`: a horizontal bar −60…0 dBFS with marks at −18 (room target region), −6, −1 (peak cap), a peak-hold tick, red above −1 dBFS. Two bars on desktop (L/R) when the buffer is stereo, one when mono. Reduced-motion: the bar updates at 10 fps without easing.

---

## 5. Envelopes, normalisation, measurements

### 5.1 Curves (`envelope.ts`, pure, unit-tested)

- `fadeOutCurve(n = 64): Float32Array` → `g[i] = 10^((−60 · i/(n−1)) / 20)` for `i < n−1`, `g[n−1] = 0`. Applied with `gain.setValueCurveAtTime(curve, t0, fadeSec)`.
- `fadeInCurve(n)` is the reverse (`g[0] = 0`).
- Declick: `DECLICK_IN = 0.005`, `DECLICK_OUT = 0.02` s, linear ramps (`setValueAtTime(0, t) ; linearRampToValueAtTime(base, t + DECLICK_IN)`), and the symmetric ramp to 0 before every `source.stop()`.
- `EMERGENCY_FADE = 1.0` s, `PAUSE_RAMP = 0.02` s.
- `dbToGain(db) = 10^(db/20)`.

### 5.2 Normalisation (`engine.ts`)

- Per item: `base = dbToGain(clamp(target − measuredLUFS, −12, +12) + trimDb)`, then `peakCap`: if `peakDbFS + (target − measuredLUFS) + trimDb > −1`, reduce the normalisation part so the sum is −1 (the trim is the DJ's and is never reduced; the UI shows "peak-capped"). Cortina: `target + cortinaLevelDb` (default −4, range −8…−2) instead of `target`.
- `measuredLUFS` comes from, in order: the adapter's measurement (local files: `loudness.ts`; Deezer: none), the user database `audio.loudnessLUFS` with `fromPreview:false`, the catalogue `audio.loudnessDb` (an RMS dBFS prior: treated as LUFS with the UI label "estimated from a preview"), else the target (gain 0 dB). Spotify items use the prior and only ever reduce (`setVolume(dbToGain(min(0, gainDb)) × master)`).
- Targets: `loudnessTargetLUFS` default −16, range −18…−12 in 1 LU steps.

### 5.3 Measurement (`loudness.ts` + worker)

- Input: an `AudioBuffer` (copied as `Float32Array` channels, transferred to the worker). Output `{ lufs, peakDbFS, truePeakDbTP (4× linear-interpolated estimate), introSec, correlation }`.
- `lufs`: BS.1770-4 K-weighting (pre-filter high-shelf + RLB high-pass biquads, coefficients at the buffer's sample rate), 400 ms blocks with 75 % overlap, absolute gate −70 LUFS, relative gate −10 LU, `−0.691 + 10·log10(Σ)`. Channel weights 1.0 for L/R (mono: one channel).
- `introSec`: first block whose RMS exceeds −40 dBFS, minus 0.3 s, clamped to [0, 3].
- `correlation`: Pearson correlation of L and R over the first 30 s; `> 0.98` → the adapter downmixes to mono at decode (halves memory).
- Budget: ≤ 250 ms for a 3 min track on a 2020 laptop; results cached in `persist.ts` by `{path, size, mtime}`.

---

## 6. `BoothEngine`

### 6.1 Settings and types

```ts
export interface BoothSettings {
  gapSec: number;            // 0.5–6, default 2.5; per-tanda override in playlist.booth
  cortinaFadeInSec: number;  // 0–2, default 0
  cortinaFadeOutSec: number; // 3–6, default 4
  cortinaLevelDb: number;    // −8…−2, default −4
  loudnessTargetLUFS: number;// −18…−12, default −16
  trimLeadingSilence: boolean; // default false, max 3 s
  mediaKeys: boolean;        // default true
}
export type BoothState = "idle" | "armed" | "playing" | "cortina" | "paused" | "stopped";
export interface BoothItemRuntime { planIndex: number; startedAt: number /* ctx time */; endsAt: number; source: SourceKind; gainDb: number; peakCapped: boolean }
```

### 6.2 State machine

```
idle ──start(setlist)──► armed ──play()──► playing ──(item ends, next is a track)──► playing
armed/playing/cortina ──hold()──► paused (finishes the current item, does not start the next)
paused ──play()──► playing | cortina
playing ──(item ends, next is a cortina)──► cortina ──(fade-out reaches 0 at stopSec, or fader pulled to 0)──► playing (next tanda, after gapSec)
any ──stop()──► stopped   (1 s fade of everything, sources stopped, position kept)
stopped ──play()──► armed → playing (restart the same item from 0)  |  stopped ──next()──► armed on the next item
playing/cortina ──next()──► (at the next gap) the following item   |  ──skipNow()──► stop() then next()
```

- `armed` means the first/next source is decoded and scheduled but not yet started (the DJ sees "Ready: tap play").
- A `hold()` during a cortina lets the cortina run to its planned stop and then waits.
- `cueCortina()` ("c"): the remaining tracks of the running tanda are skipped; the cortina becomes the next item at the next gap.
- `birthdayVals()`: if the next tanda is a vals, marks it `birthday:true` in the plan and holds before it; if not, inserts the composed birthday vals tanda (when `rules.birthdayValsAt` produced one) or shows the swap sheet filtered to vals families.
- `startBreak(minutes)`: after the current item, `paused` with a countdown; `endBreak()` plays the cortina (if `breaks[].cortina !== false`) then the next tanda.
- Every transition emits `{ at: Date.now(), from, to, planIndex, reason }` into `playlist.booth.log` (§7) so History can show the night as played.

### 6.3 Scheduler

- `schedule(item)`: `when = max(ctx.currentTime + 0.05, previous.endsAt + gap)`; `offset = trimLeadingSilence ? min(introSec, 3) : 0`; `duration = item.kind === "cortina" ? stopSec − startSec : undefined`; `source.start(when, startSec + offset, duration)`; declick ramps at `when`; for a cortina `fadeIn` at `when` (if > 0) and `fadeOut` at `when + duration − fadeOutSec` with `setValueCurveAtTime(fadeOutCurve, …, fadeOutSec)` on `cortinaGain`; `endsAt = when + (duration ?? buffer.duration − offset)`.
- Lookahead: as soon as item *n* starts, item *n+1* is decoded (adapter `prepare()`), and scheduled **immediately** with its absolute `when` (full-length lookahead so a throttled background tab still hits the gap). A `hold()` before `when` cancels it with `source.stop(ctx.currentTime)` and `disconnect()`; a changed gap re-schedules by replacing the node.
- Prefetch: `prepare()` for item *n+2* runs after *n+1* is scheduled; buffers for items `< n−1` are released (`adapter.release(id)`).
- Clock: the UI reads `ctx.currentTime − startedAt − ctx.outputLatency` for the song position; `planIndex` and `endsAt` give remaining time; the booth re-anchors the wall-clock plan at every item start (`playlist.booth.anchors.push({planIndex, wallClock})`).

### 6.4 Time to Cumparsita

`remainingSec = (current.endsAt − now) + Σ_{items after current} (itemLength + gapAfter)` where a cortina's length is its planned `stopSec − startSec` (or the fader's live position when the DJ is already pulling it), breaks count their minutes while not yet started; `timeToCumparsita = remainingSec − closingLength`. `drift = now − (startWallClock + plan.startSec[current])`.

### 6.5 Store mirror

`useBooth()` exposes `{ state, planIndex, position, remaining, timeToCumparsita, drift, meter: {rms, peak}, cortinaFader, master, banners[], settings, setSettings, actions: {start, play, hold, next, skipNow, stop, cueCortina, birthdayVals, startBreak, endBreak, setCortinaFader, setMaster, setTrim(id, db)} }`. Updates at ≤ 30 fps (meter) and on state changes; the set column subscribes to `planIndex` only.

---

## 7. `packages/core` changes

### 7.1 Types (`types.ts`)

```ts
export interface BoothPlanItem {
  n: number;                       // 1-based, same order as flatten()
  kind: "track" | "cortina" | "closing" | "break";
  id?: string;                     // song / cortina id
  tanda: number;                   // 0 = opening, tandas.length+1 = closing
  startSec: number;                // planned offset from the night's start (includes gaps and fades)
  lengthSec: number;               // track: durationSec − trimIn; cortina: stopSec − startSec; break: minutes×60
  gapAfterSec: number;             // silence after this item (0 after a break, cortina, or the closing)
  trimInSec?: number;              // cortina cue-in (Cortina.startSec) or intro trim when enabled
  stopSec?: number;                // cortina: absolute second in the clip where silence is reached
  fadeInSec?: number; fadeOutSec?: number;
  gainDb?: number;                 // normalisation prior from audio.loudnessDb vs target (undefined when unknown)
  birthday?: boolean;
}
export interface BoothPlan {
  settings: { gapSec: number; cortinaFadeInSec: number; cortinaFadeOutSec: number; cortinaLevelDb: number; loudnessTargetLUFS: number; trimLeadingSilence: boolean };
  items: BoothPlanItem[];
  wallClockSec: number;            // = last item startSec + lengthSec
  gapOverrides?: Record<number, number>; // tanda index → gapSec
  log?: Array<{ at: string; from: string; to: string; planIndex: number; reason?: string }>;   // filled by the booth
  anchors?: Array<{ planIndex: number; at: string }>;
}
export interface Playlist { …; booth?: BoothPlan }
export interface PlaylistStats { …; wallClockSec?: number; gapsSec?: number }   // real duration with gaps and planned cortina stops
```

### 7.2 Functions (`packages/core/src/booth.ts`, pure)

- `planBooth(p: Playlist, s: Partial<BoothPlan["settings"]> & { gapOverrides?, cortinaStopSec? }): BoothPlan` — walks `flatten(p, { includeCortinas: true, cortinaStopSec })`, assigns `startSec` cumulatively with one gap rule: **every item except a break and the closing is followed by `gapSec`** (per-tanda override when present). So a track → `lengthSec = durationSec − trimIn`, `gapAfterSec = gapSec` (also before a cortina: the gap between the last song and the cortina is the same silence); a cortina → `lengthSec = stopSec − startSec` (its fade reaches 0 at `stopSec`) and `gapAfterSec = gapSec`, so the next tanda starts `gapSec` after the cortina's silence; a break → `lengthSec = minutes × 60`, `gapAfterSec = 0`; the closing → `gapAfterSec = 0`. `gainDb = clamp(target − audio.loudnessDb, −12, 12)` when `audio` exists, cortina `target + cortinaLevelDb`.
- `computeStats` adds `wallClockSec` and `gapsSec` when `p.booth` exists (or computes them with default settings so every set has a real clock); `stats.durationSec` stays the sum of recordings (benchmark unchanged).
- Invariants (vitest, `packages/core/test/booth.test.ts`, written first per `docs/TDD.md`): items are in `flatten` order; `startSec` strictly increasing; `startSec[n+1] − (startSec[n] + lengthSec[n]) === gapAfterSec[n]`; a cortina's `stopSec − fadeOutSec ≥ startSec + 1` (a fade never starts before one second of cortina); `wallClockSec ≥ stats.durationSec`; `gainDb` is `undefined` without audio features and within ±12 with; a 4 h default set stays ≥ 85 on the benchmark (the plan does not touch the music).

### 7.3 Exports carry the same timing (`export/index.ts`)

- `FlatTrack` gains `startSec`, `gapAfterSec`, `fadeOutSec`, `gainDb` (from `p.booth` when present, else `planBooth` with defaults).
- M3U8: `#EXTVLCOPT:start-time=` for cortina cue-in, the existing `stop-time`, and a comment line `#TDJ:gap=2.5 gain=-1.3 fade=4` (ignored by players, read back by TDJ).
- Rekordbox XML: a second `POSITION_MARK` `Name="Cortina fade (4 s)"` at `stopSec − fadeOutSec`; `Comments` gain `· gap 2.5 s · gain −1.3 dB`.
- Traktor NML: `<CUE_V2 NAME="Cortina out" TYPE="0" START="…ms">` and `<CUE_V2 NAME="Fade" …>`; Traktor has no gap field.
- CSV / DJ CSV: columns `start_sec`, `gap_sec`, `fade_out_sec`, `gain_db`.
- JSON: the whole `booth` object. Set list (text): the planned wall-clock `23:42` prefix per tanda (start time from `booth.settings` or "T+").
- Tests: `export.test.ts` asserts the cue positions equal the plan's and that a set without `booth` exports exactly as today (snapshot unchanged except the new columns).

---

## 8. Source adapters

```ts
export type SourceKind = "file" | "spotify" | "preview";
export interface PreparedItem { kind: SourceKind; buffer?: AudioBuffer; measured?: { lufs; peakDbFS; introSec }; spotifyUri?: string; durationSec: number }
export interface SourceAdapter {
  kind: SourceKind;
  available(): Promise<{ ok: boolean; reason?: string }>;   // e.g. "Not Premium", "No folder linked"
  resolve(item: BoothPlanItem, song: Song | Cortina): Promise<"ready" | "missing">;
  prepare(item): Promise<PreparedItem>;                       // decode (file/preview) or no-op (spotify)
  release(itemId: string): void;
  // spotify only: play/seek/volume live here; the engine calls these instead of the graph
}
```

Priority per item: **file → spotify → preview**; a set can mix sources (a missing file falls back to Spotify for that one track, with the badge saying so). An item with no source shows "Find…" (the existing `ResolveSheet`, now with a `Pick file…` row that opens `showOpenFilePicker` / `<input type=file accept="audio/*">`), and the plan marks it `missing`; the night can start with missing items (they are skipped with a banner), but the start button says "3 tracks have no source".

### 8.1 Local files (`sources/local.ts`)

- **Link your music folder** (onboarding row): Chromium → `showDirectoryPicker({ id: "tdj-music", mode: "read", startIn: "music" })`, handle stored in IndexedDB (`persist.ts` key `folder`); on later visits `queryPermission({mode:"read"})`, and if not `granted`, a banner with a button that calls `requestPermission` (user gesture required). Others (Firefox, Safari, iPad) → `<input type="file" webkitdirectory multiple>`; the `FileList` is kept for the session; the banner says "Your browser cannot remember the folder: pick it again next time".
- **Index**: walk the tree (`entries()` or `webkitRelativePath`), keep `{ path, name, size, lastModified }` for audio extensions (`mp3 m4a aac flac wav ogg opus aif aiff`). For files ≤ 20 000 this is < 2 s. Read tags lazily: ID3v2 header (title/artist/album/year, TIT2/TPE1/TALB/TYER/TDRC) and ID3v1 trailer, MP4 `ilst` (©nam/©ART/©alb/©day), FLAC VorbisComment; ~300 lines, no dependency. Only the first 256 KB of each file is read for tags.
- **Matching**: build `Candidate`s `{ uri: path, name: tagTitle ?? titleFromName, artists: [tagArtist ?? artistFromName], album, albumYear: tagYear, durationMs: unknown }` and use `bestMatch(item, cands)` from `lib/match.ts` with `MATCH_THRESHOLD`; first try the exact file name the exporter would produce (`fileName(naming, flatTrack)` from `exportPaths.ts`, with and without the extension, case-insensitive, diacritics stripped); then the fuzzy pass; below threshold → `missing` with the three best candidates offered in the sheet ("Pick file…" shows them first). The match map `{ songId → { path, size, lastModified, score, manual } }` persists; a manual pick sets `manual:true` and is never overwritten.
- **Prepare**: `getFile()` → `arrayBuffer()` → `ctx.decodeAudioData` → `loudness.ts` (worker) → downmix to mono when `correlation > 0.98` → `PreparedItem`. Errors (unsupported codec, DRM-protected M4P) surface as a banner on the *next* item while the current one plays.
- Memory: at most three decoded buffers held; `release()` drops references; the page shows a small "decoding…" indicator on the next card.

### 8.2 Spotify Web Playback SDK (`sources/spotify.ts`)

- Requires the hosted session (`/api/spotify/me` → `user.product === "premium"`); otherwise `available()` returns `{ ok:false, reason: "Your Spotify account is not Premium: Spotify does not allow playback in the browser." }` and the row is grey. BYO-PKCE sessions are not supported in phase 1 (their scopes lack `streaming`).
- Server: add `user-modify-playback-state user-read-playback-state` to `SPOTIFY.scopes` in `lib/server/oauth.ts` (existing sessions are asked to log in again once); add `GET /api/spotify/access` returning `{ access, expires }` from the sealed cookie (the same object `/me` returns today, without the profile round trip) for the SDK's `getOAuthToken` callback; add `PUT /api/spotify/player/play` and `PUT /api/spotify/player/transfer` proxies so the browser never needs the token for the Web API (the SDK still needs it for `getOAuthToken`).
- Client: load `https://sdk.scdn.co/spotify-player.js` only on `/booth` after the DJ chose Spotify; `new Spotify.Player({ name: "TDJ Booth", getOAuthToken, volume: master })`; `connect()` from the `Start the night` gesture (the pattern that works on Safari); on `ready` → `transfer({ device_ids:[device_id], play:false })`; handle `not_ready`, `authentication_error` (refresh via `/api/spotify/access`), `account_error`, `playback_error`, `autoplay_failed` (banner: "Tap play again").
- Per item: `play(uri, position_ms = trimIn)` via the proxy; the engine's timeline for Spotify items uses `player_state_changed` (`position`, `duration`, `paused`) polled every 250 ms with `getCurrentState()` because the event is not emitted at the end reliably; "ended" = `paused && position === 0 && previous position > duration − 1500`; then `setTimeout(gapSec)` → next. Fades: `setVolume()` steps every **50 ms** following the same curve (`fadeOutCurve(fadeSec / 0.05)`), 25 ms for the emergency fade; on iOS no volume control, so the adapter reports `capabilities.fade = false` and the UI shows "No fades on iPad with Spotify" and stops cortinas with `pause()` at `stopSec`.
- The set column badge for Spotify items reads "Spotify · ±0.5 s gaps"; the onboarding row shows the licence note from the research ("Spotify's SDK terms restrict commercial use; check them for paid events").
- A stray transfer away from the browser (`not_ready` or state with another device) → banner "Spotify moved to another device" with `Take back` (transfer again).

### 8.3 Deezer preview (`sources/preview.ts`)

- `fetch(previewEndpoint(resolved) + "&json=1")` → fresh URL → `fetch` (CORS ok) → `decodeAudioData` → `loudness.ts` (the measurement of the preview, which is what we have). Items are capped at 30 s; cortinas at `min(stopSec − startSec, 30)`. Every badge says **"30 s rehearsal"**, the page title gains "(rehearsal)", and the Time card shows the rehearsal duration, not the night's.

---

## 9. Persistence (`persist.ts`, IndexedDB `tdj-booth`)

- `folder`: `FileSystemDirectoryHandle` (Chromium).
- `matches`: `{ [songId]: { path, size, lastModified, score, manual } }`.
- `measurements`: `{ [path|size|mtime]: { lufs, peakDbFS, introSec, correlation } }`.
- `night`: `{ playlistId, planIndex, state, startedAt, settings, trims: {[id]: db}, cortinaLevelDb, master, log, anchors }`, written on every state change and every 5 s while playing. On reload of `/booth` with a `night` younger than 12 h for the current playlist: "Resume at tanda 9, track 2?" → re-arm at that item (the audio cannot survive a reload; the position and the log do). The night is cleared when La Cumparsita finishes, or by "End the night" in the overflow menu, which also writes `booth.log` into History (`lib/history.ts`) so the set shows "played 2026-10-18 · 4:07 h · 2 holds · 1 birthday vals".
- Nothing here is ever sent to the server; the folder handle and file paths never leave the browser (`CLAUDE.md`: BYOK, never persisted server-side applies to file access as well).

---

## 10. Wake Lock and Media Session (`media.ts`)

- `navigator.wakeLock.request("screen")` on start; re-request on `visibilitychange` → visible; release on stop/end. Unsupported → a one-line banner "Keep the laptop awake (System Settings → Energy)".
- A muted, looping, silent `<audio>` (`/booth/silence.mp3`, 1 s) plays while the booth plays so the OS shows media controls and keeps iOS Safari's audio session alive. `navigator.mediaSession.metadata` = title / `orchestra · singer` / `Tanda n · rhythm` / the TDJ artwork; `setPositionState` on every item start and every 5 s; action handlers: `play` → `play()`, `pause` → `hold()` (never a cut), `nexttrack` → `next()`, `stop` → `stop()`, `previoustrack` → restart the current item. `settings.mediaKeys=false` removes the handlers (a Bluetooth headset in the room must not be able to hold the music).
- `navigator.mediaDevices.addEventListener("devicechange")` → banner "Audio output changed" (the booth cannot pin a device in phase 1).

---

## 11. Phase 2

- **Pre-listen on a second device**: `MediaStreamAudioDestinationNode` → `<audio setSinkId(headphones)>` (Chromium ≥ 49, Firefox ≥ 116, Safari ≥ 18.4); `cue` button plays 10 s of the next item's start or the cortina's cue-in on that path only. Needs `selectAudioOutput()`/`getUserMedia` permission flow. Not on iPad.
- **Waveform** of the current and next item (peaks computed in the loudness worker, 1 000 bins), used to set the cortina cue-in and stop by dragging.
- **Microphone duck** for announcements: equal-power dip to −12 dB and back over 0.5 s, `m` key, with the Media Session "pause" mapped to it when enabled.
- Spotify BYO-PKCE sessions with the `streaming` scope; `AudioContext.setSinkId` on Chromium as the simpler route for the room/cue split.
- "Mark played / requests queue / re-plan the rest of the night ±10 energy" from `docs/ROADMAP.md` Phase 2, driven by `booth.log`.

---

## 12. Tests

### 12.1 vitest (`packages/core/test/booth.test.ts`, `apps/web/src/lib/booth/*.test.ts`)

- `planBooth` invariants (§7.2).
- `envelope.ts`: `fadeOutCurve` is monotonic, first value 1, last value exactly 0, second-to-last ≈ 10^(−60/20); `fadeInCurve` mirrors it.
- `loudness.ts` on synthetic buffers (`Float32Array` sine at −20 dBFS → −20 ±0.5 LUFS after K-weighting at 1 kHz; silence → −∞ handled; a buffer starting with 1.2 s of silence → `introSec` = 0.9; identical channels → correlation 1).
- `BoothEngine` with a **recording fake context** (`currentTime` advanced by the test, `createBufferSource` returning stubs that record `start(when, offset, duration)`, gains recording `setValueAtTime`/`linearRamp`/`setValueCurveAtTime` calls, `decodeAudioData` returning buffers of a given duration):
  - gaps: after a 170 s buffer starting at t=1, the next `start(when)` is `1 + 170 + 2.5`; with `gapOverrides[3] = 4` the tracks of tanda 3 use 4.
  - cortina: `start(when, startSec, stopSec − startSec)`, a `setValueCurveAtTime` on the cortina gain at `when + (stopSec − startSec) − 4` lasting 4 s, the next tanda at `+ gapSec` after the stop.
  - normalisation: a track measured at −12 LUFS with target −16 → base gain `10^(−4/20)`; measured −30 LUFS → capped at +12 dB; peak at −3 dBFS with +8 dB wanted → gain limited so peak = −1 dBFS and `peakCapped` true.
  - emergency stop: a `setValueCurveAtTime(fadeOutCurve, now, 1)` on every live gain and `source.stop(now + 1)`; state `stopped`, `planIndex` unchanged.
  - hold: the scheduled next source gets `stop()` before its `when`; `play()` re-schedules from `now + 0.05`.
  - time to Cumparsita decreases by exactly the simulated elapsed time.
- `local.ts` matcher: `"Juan D'Arienzo - El Flete.mp3"` matches `El flete / D'Arienzo 1936`; `"01 - el_flete (1936).m4a"` matches via tags; a Troilo "El flete" does not match D'Arienzo's; manual picks survive a re-index.
- `OfflineAudioContext` option: `node-web-audio-api` (npm, Rust-backed, implements `OfflineAudioContext`) can run the same engine tests end-to-end and assert the rendered RMS envelope (silence in the gap, −60 dB at the end of the fade); add it when the fake-context tests are green, as a second project in `apps/web/vitest.config.ts` so the default run stays dependency-free.

### 12.2 Playwright (`apps/web/e2e/round7-booth.spec.ts`)

- The test page `/booth?rehearsal=1&offline=1` lets the spec inject a synthetic set (three 6 s tones at −20/−14/−26 dBFS as WAV blobs served from `e2e/fixtures/`, one 20 s cortina) through the `file` adapter with a `<input webkitdirectory>` filled by `setInputFiles`, and runs the engine on an `OfflineAudioContext` rendering 60 s at 8 kHz; the spec reads the rendered buffer via `page.evaluate` and asserts: RMS < −80 dBFS for `gapSec` after each tone, each tone's RMS within ±0.5 dB of the target (normalisation), the cortina's last 4 s decaying to < −55 dBFS at `stopSec`, and a `stop()` at 10 s giving silence from 11 s.
- UI: the Now/Next/Time cards render the expected text; `space` holds (state `paused` after the current item, verified through `data-state`); holding `esc` 600 ms stops; the set column refuses a swap on the running tanda (button `aria-disabled`) and allows it two tandas ahead; the control strip buttons are ≥ 44 px (reuse the round-4 touch-target assertion); dark theme is forced; the mini-player is hidden on `/booth`.
- Spotify adapter: mocked SDK (`window.Spotify = { Player: FakePlayer }`) and `/api/spotify/me` fixtures for `product:"premium"` and `"free"`; assert the grey row text for free, the `setVolume` step count for a 4 s fade (≈ 80 calls), and the "No fades on iPad with Spotify" banner under the tablet project's user agent.
- Keep `cd apps/web && pnpm e2e` green with Chromium at `/opt/pw-browsers/chromium`; never `playwright install`.

---

## 13. Acceptance criteria

1. On Chromium (laptop) the DJ links a folder once, 95 % of a default 4 h golden-age set's tracks match automatically from a library tagged with orchestra/title/year, the rest are picked by hand in the Find sheet, and the choices survive a reload.
2. A full night plays unattended from `Start the night` to the end of La Cumparsita with every inter-song gap equal to the setting ±1 ms (sample-accurate; verified in the offline render) and no click at any start, stop, hold or fade (no sample-to-sample jump > 0.05 at a boundary in the render).
3. Every cortina starts at its cue-in, is normalised to `target + cortinaLevelDb`, fades over `cortinaFadeOutSec` and reaches silence at the planned stop second ±10 ms; pulling the fader to 0 earlier ends it earlier and the next tanda starts `gapSec` after silence.
4. Tracks are normalised to the target by gain only: measured loudness per file, trims honoured, gain never exceeds what keeps the sample peak ≤ −1 dBFS, and the UI shows the applied gain and "peak-capped" when it applies.
5. Emergency stop fades everything to silence in 1.0 s from any state, keeps the position, and `play` restarts the same track; `hold` never interrupts a song; `next` acts at the next gap.
6. The Now / Next / Time cards are readable at 2 m: title 34 pt, remaining time and time to Cumparsita 44 pt, contrast ≥ 7:1, dark theme forced, nothing on the content layer is glass, no layout animation.
7. Time to Cumparsita and drift are correct to the second against the plan, including holds, breaks, early cortina fades and a birthday vals insertion; the plan is the same `playlist.booth` the exports write (cue points in Rekordbox/Traktor/M3U8/CSV match the booth's seconds).
8. Swaps and reorders are only possible ahead of the running tanda; the running and played tandas are locked and sent as locked to `/api/swap*`; a swap ahead updates the plan and the Next card without any audible effect.
9. Spotify: with a Premium hosted session the set plays full tracks with gaps within ±0.5 s and 50 ms volume-step fades; a non-Premium account sees the plain statement and the row is disabled; on iPad the adapter says fades are unavailable; the SDK licence note is visible on the source row.
10. Rehearsal mode plays the 30 s previews with every rule of the engine and is labelled "30 s rehearsal" on every badge; the engine's gap/fade/normalisation/stop behaviour is proven by vitest on the fake context and by the Playwright offline render; the core benchmark stays ≥ 85 on the default 4 h set; typecheck, Biome and both e2e projects are green.
11. A reload (or a crash) during the night offers "Resume at tanda n, track k" and keeps the log; the night's log lands in History when it ends.
12. Wake Lock is held while playing, the OS media controls show the tanda, the headset "pause" maps to hold (and can be disabled), and an output-device change shows a banner within 1 s.
13. Nothing about the DJ's files (handles, paths, measurements) leaves the browser.
