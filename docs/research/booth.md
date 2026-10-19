# Booth: playing the night from the browser (research, 2026-10-19)

Scope: what a tango DJ actually does between pressing "play" on the first tanda and the last chord of La Cumparsita, what that means in audio-engineering terms, and which of it a browser can do today, per audio source TDJ already knows (30 s Deezer previews, Spotify through the hosted login, the DJ's own files). The implementation spec that follows from this is `docs/specs/round7-booth.md`.

"Verified today" = read from the primary page on 2026-10-19 (URL given). "Practice" = what working DJs do, with the published source that states it when one exists; where the written sources are thin (gap lengths inside a tanda are folklore passed on in booths, not in books) the figure is marked as such and the spec makes it a setting rather than a constant.

---

## 0. TL;DR

1. **Tango DJs do not mix.** Songs inside a tanda are separated by a short silence (practice: ~1–5 s, most often 2–3 s; never a crossfade); the cortina is the only thing that is faded, by hand, at the moment the floor has cleared. A booth player is therefore a *gapped, gain-staged jukebox with a fader on the cortina*, not a DJ mixer. Beat-matching, key-locking, loops and EQ-kill are irrelevant.
2. **What the DJ must see at 2 m**: what is playing, what is next, the clock, time left to La Cumparsita, where the cortina fader is. Everything else can be small.
3. **Three sources, three verdicts.**
   - **Local files + Web Audio** (Chromium on a laptop): everything a tango night needs is possible with sample accuracy: gaps, fades, loudness normalisation, intro trim, declick, a pre-listen output on a second device. This is the real booth. Firefox and Safari cannot keep a folder handle between sessions; on iPad the folder must be re-picked each session through `<input webkitdirectory>`, and there is no second output device.
   - **Spotify Web Playback SDK**: works only with Premium, only as a single Spotify Connect device in the tab, fades only through `setVolume()` polling (no fade on iOS at all: volume is not settable), gaps only through pause/play with network latency, and the SDK licence forbids use in commercial projects without Spotify's written approval. Usable for a rehearsal or a small práctica; not a tool to promise for a marathon booth.
   - **Deezer 30 s previews**: rehearsal only ("30 s rehearsal" badge). The link expires (~24 h), the excerpt is from an unknown offset, the loudness we measured is the preview's, not the DJ's file.
4. **Loudness**: our `features.loudnessDb` is the mean RMS (dBFS) of a 30 s Deezer preview excerpt, not EBU R128 and not of the DJ's file. It is a *prior* for the trim; for local files the booth measures BS.1770 integrated loudness on decode (one pass over the decoded buffer, ~100 ms in a worker) and normalises gently to a room target (default −16 LUFS, range −18…−12), **by gain only, never through a limiter**: if the gain needed would push the measured sample peak above −1 dBFS, the gain is capped and the track plays a little quieter.
5. **Engine change**: the timing of a night is a property of the set, not of the player: `packages/core` gets a `planBooth()` that turns a `Playlist` into start/end times per item including gaps, cortina fades and the stop second, and `PlaylistStats.wallClockSec`; exports carry the same cue points so a Rekordbox/Traktor/VLC user plays the same night the booth would.

---

## 1. DJ practice

### 1.1 Inside a tanda: gaps, not crossfades

- A tanda is three or four recordings of one orchestra, one singer, a few years, played *as recorded*: full intro, full ending, then a short silence while couples stay in the embrace, talk a little, and wait for the next song. No crossfade, no talk-over, no EQ change. Michael Lavocah's account of tanda construction describes the tanda as the unit and the cortina as the only transition device, and warns that the first song must "accurately reflect the tanda" or "the dancers start to lose trust in the DJ" (Lavocah, *Tango DJing Part 2: Tanda construction*, https://www.todotango.com/english/history/chronicle/483/Tango-Djing-Part-2:-Tanda-construction, read today).
- **How long is the silence.** No published guide gives one number; the figures in the record are all practitioner settings: a RadioBOSS user describes the "usual for a tango community" as a pause of about 4–5 s after each song (https://www.djsoft.net/community/goto/post?id=36194); a BallroomDJ 4 user runs a 4 s gap with a 7 s fade-out for ballroom and adds that the values are personal (https://ballroomdj.org/forum/viewtopic.php?p=807); the Audacious feature request for tango playback asks for "a few seconds of silence between songs" and points at Mixxx's AutoDJ convention where a negative transition time means silence (https://redmine.audacious-media-player.org/issues/779); on Tango-L, a DJ who plays in Buenos Aires reports that there "even the space between songs within a tanda are expected to be longer than in the USA" (Jackie Ling Wong, 2006-10-07, https://mailman.mit.edu/pipermail/tango-l/2006-October/002140.html), and another poster notes that more than five seconds of pause "would break the spell". In practice the milonguero-style booths this product targets (marathons, encuentros) sit at **2–3 s**; 1 s feels rushed on a slow Di Sarli, 4–5 s is a Buenos Aires salon feel. **TDJ default: 2.5 s, range 0.5–6 s, per set, with a per-tanda override** (a vals tanda often gets slightly less, a Pugliese tanda slightly more because the endings ring).
- **Gapless is wrong** for this music: a transfer's leading silence and surface noise are part of the recording; the gap is silence from the *player*, not the record, so the noise floor of the next track starting is what the dancers hear as "next song". The booth must never trim the *ending* of a track.

### 1.2 The cortina: the only fade

- The cortina's job is to clear the floor; its length is "until the floor empties", which Lavocah puts at as little as ten seconds early in the night and "over a minute" when the room is full, and in Argentina long "regardless of how quickly the floor empties"; "many DJs prefer to fade out the cortina manually, so that they can control the length of time for which it plays"; and "it's important that the cortina does not overwhelm the music which it frames" (Lavocah, Part 2, URL above). Tangology101's DJ guide gives the common range: "short 30 to 60 second snippets of songs that are not meant for dancing" (https://tangology101.com/main.cfm/title/How-to-DJ-a-Milonga/id/265). The 2006 Tango-L thread spans the whole spectrum from 30–45 s to "not shorter than 1.5 minutes" (https://mailman.mit.edu/pipermail/tango-l/2006-October/002108.html, …/002106.html).
- Consequences for the player: (a) the cortina has a **cue-in** (`Cortina.startSec`, already in the model), (b) it has a **planned stop second** (`cortinaLengthSec`, exported today as `stopSec`, 20–90 s), (c) it is **faded out over 3–6 s so that silence is reached exactly at the stop second** (fade starts at `stopSec − fadeOut`), (d) the DJ can **pull the fader early** when the floor is clear or **hold** it when it is not, and (e) a **fade-in of 0–2 s** is optional, because many cortina clips are cut mid-phrase. A rehearsed cortina with its own engineered fade (the "about one minute in length, including pre-engineered fade-out" clips a Colorado host describes in the Tango-L thread) is played with fade-out 0.
- Level: a cortina is played **−2 to −8 dB below the tandas** (Lavocah's "must not overwhelm"; the opposite, a cortina that is louder than the tanda, is the common amateur tell our audio-features research already flags, `docs/research/audio-features.md` §1.6). The booth exposes this as the "cortina level" trim, default −4 dB, remembered per set.

### 1.3 Levels across 78-rpm transfers

- Golden-age recordings reach the DJ as transfers of very different editions: the same recording on two reissues measured 3.5 LU apart (−8.7 vs −12.2 LUFS, identical LRA) in our own measurement (`docs/research/audio-features.md` §1); brick-walled compilations (crest factor < 10 dB) are the editions DJs reject; the better transfer labels (CTA, TangoTunes, El Bandoneón, Euro Records) are documented and compared on tango-dj.at (https://tango-dj.at/DJ-ing/resources/cta.htm, 78-rpm sound samples) and on Jens-Ingo Brodesser's DJ blog, which argues that most playback problems come from "the quality of the sources themselves, the transfers, the restorations, the mastering choices rather than from sampling rates or file formats" (https://jens-ingo.all2all.org/?p=4481) and reviews the TangoTunes D'Arienzo transfers (https://jens-ingo.all2all.org/?p=1794).
- What DJs do: pre-listen on headphones and set a trim per track ("I make notes of tandas that might need volume adjusting", Tangology101, URL above), then ride the master fader a little between a loud 1950s De Angelis and a quiet 1928 Canaro. The booth replaces the notes with a measured loudness per file and a per-track trim the DJ can still nudge; the master fader stays.
- Rule of thumb the booth should encode: tracks of one tanda within **±2 LU** of each other (our cohesion model already scores this), cortina **−2…−8 dB** below, no track ever louder than the room target, **no limiter** (a limiter on a 1940 Troilo is what makes it sound like a bootleg).

### 1.4 Pre-listening

- Before a tanda starts, the DJ wants to hear (a) the first bars of the next tanda's first track to confirm it is the right file and edition, and (b) the cortina's cue-in point. This needs a **second audio output** (headphones on the laptop jack or a USB interface) while the room keeps playing on the first. Lavocah's caution applies: too much pre-listening and "one's attention is taken away from the floor" (Part 2, URL above), so the pre-listen is a 10 s "cue" button, not a second deck.
- In the browser this is only possible where `AudioContext.setSinkId()` / `HTMLMediaElement.setSinkId()` exist (§3.6). Phase 2.

### 1.5 Emergency stop, hold, skip

- **Stop now**: something is wrong (wrong file, a loud click, a medical situation on the floor, the venue asks for silence). The right behaviour is a **1 s fade to silence**, not a cut (a cut at full level is a loud click through a PA). After the stop the booth stays where it was so the DJ can resume the same track from the start, or go to the next one.
- **Hold**: finish the current song, then do not start the next one until the DJ presses play (announcements, a birthday, the organiser's thank-you). Different from pause: the music is never interrupted mid-song.
- **Skip**: go to the next track at the next gap, not now (the dancers finish the song). "Skip now" is the emergency stop plus next.

### 1.6 The clock, the Cumparsita, birthdays and breaks

- A milonga ends at a published time; a marathon's DJ slot ends when the next DJ takes over. The DJ constantly recomputes "how many tandas fit before La Cumparsita". The booth shows **wall-clock now**, **planned end**, **time to Cumparsita** (remaining items including gaps and cortinas at their planned stop seconds), and **drift** against the plan (positive when the DJ held or let cortinas run long). La Cumparsita closes the night; it is the signal that the evening is over (https://draft.tangoandchaos.org/pages/03/03_20_cumparsita; https://www.tanguito.co.uk/?p=5864). TDJ already composes one or two closing versions (`rules.cumparsitaCount`).
- **Birthday vals**: the organiser brings the birthday person to the floor, the DJ plays a vals (often a short one, or one famous enough to sing along) and the room queues to dance a few bars each; the DJ usually says a word on the microphone first. In the model this is `rules.birthdayValsAt` (a vals tanda reserved at a fraction of the night). In the booth it is a **"Birthday vals" action**: hold before the next vals tanda, an optional ducked announcement (phase 2), then play the tanda; the booth marks it so the history says what happened.
- **Show break**: `Playlist.breaks[]` already carries `{afterTanda, minutes}`; the booth shows a **countdown** with a "resume" button and plays the cortina, or not (`rules.cortinaBeforeCumparsita` has the same shape), when the show ends.

### 1.7 What the DJ sees on the laptop next to the mixer, and what must be legible at 2 m

A booth is dark; the laptop is on a table at arm's length but the DJ is often standing, a step away, dancing on the spot, or talking to someone. Observed layouts of booth screens (Embrace, El Tango DJ, Mixxx in "music player" mode, and the printed set list most DJs keep next to the laptop) converge on:

| Zone | Legible at 2 m (≥ 28 pt) | Legible at 60 cm (≥ 15 pt) |
|---|---|---|
| Now | title · orchestra · singer · year, **track n/4 of the tanda**, remaining time in the song, a level meter | energy, key/BPM chips, the edition/file name, trim |
| Next | next tanda: rhythm · orchestra · singer · years; next cortina | the four titles, cue-in, stop second |
| Time | wall clock, **time to Cumparsita**, drift | planned end, tandas left, break countdown |
| Controls | play/hold, **stop** (red, needs a long press or a confirm), cortina fader, master | gap length, fade length, cortina level, pre-listen |
| Set | a column with the whole night, current position highlighted, locked tandas, "swap" only ahead of the playhead | per-track details on tap |

Dark background, no glass, no animation that moves content (a level meter and a progress bar are the only moving things), everything ≥ 44 px touch, keyboard-first: **space** play/hold, **→** next at the gap, **esc** (held) emergency stop, **↑/↓** cortina fader, **c** cue the cortina, **b** birthday vals.

---

## 2. Audio engineering

### 2.1 Loudness normalisation

- **Measure.** ITU-R BS.1770 K-weighted integrated loudness with the −70 LUFS absolute and −10 LU relative gates (the model already specified in `docs/research/audio-features.md` §1.6). For a decoded `AudioBuffer` this is: K-weighting (a high-shelf + high-pass biquad pair, coefficients in BS.1770-4 Table 1), mean square per 400 ms block with 75 % overlap, gating, −0.691 + 10·log10. A 3-minute mono buffer is ~8 M samples: well under 200 ms in a Worker, so the booth measures **the DJ's actual file** at decode time; our catalogue `loudnessDb` (mean RMS dBFS of a 30 s Deezer preview, `packages/core/src/audio/dsp.ts` `AudioFeatures.loudnessDb`) is only the prior shown before decode and the value used for Spotify/preview sources where we cannot measure. Keep the measured value in the per-user database as `audio.loudnessLUFS` (full-file, `fromPreview:false`) so the second night does not re-measure.
- **Target.** Room playback, not broadcast: **−16 LUFS integrated** default (speech-like level that leaves a DJ mixer's gain structure sensible; −23 LUFS R128 is too quiet for a PA driven from a laptop headphone output), user range −18…−12. Gain per track `g = target − measured` (dB), applied on the track's `GainNode`, **clamped to [−12, +12] dB**, plus the DJ's trim.
- **Never limit.** Compute the buffer's sample peak (and, cheaply, a 4× oversampled true-peak estimate) during the same pass; if `peak + g > −1 dBFS`, reduce `g` so the peak lands at −1 dBFS. A quiet, dynamic 1930s side then plays a little under target instead of being squashed. Document the capped value in the UI ("−16 target, playing at −17.4 LUFS: peak-limited gain").
- **Cortina gain staging.** The cortina's gain is `targetCortina = target + cortinaLevel` with `cortinaLevel ∈ [−8, −2] dB` (default −4), applied after the cortina's own normalisation. Modern pop cortinas are 6–10 LU louder than a 78 transfer; normalising them *down* is exactly what the "not louder than the tanda" rule needs.
- **Editions.** When the DJ's file is a different edition than the one we analysed, the preview prior can be off by ±3.5 LU; the measured value wins and is stored per file hash + size so a re-rip is re-measured.

### 2.2 Fade curves

- **Fade-out to silence (cortina stop, emergency stop)**: a linear amplitude ramp sounds like it drops early and then lingers; an exponential (linear-in-dB) ramp sounds even but cannot reach 0 (`exponentialRampToValueAtTime` throws for 0: MDN notes "the value needs to be positive", https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/exponentialRampToValueAtTime, read today). Use **`setValueCurveAtTime` with a precomputed curve** (linear interpolation between the array values, last value guaranteed: https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/setValueCurveAtTime, read today): `g(t) = 10^((−60·t)/20)` for t ∈ [0,1) over the fade length, then exactly 0 at the end (−60 dB is inaudible in a room; the final step from −60 dB to 0 is click-free). 64 points are enough for a 6 s fade.
- **Fade-in (cortina)**: perceptually the mirror image, same curve reversed, 0–2 s; most DJs leave it at 0 and rely on the cue-in point.
- **Equal-power** (cos/sin) curves are for *crossfades*, where two signals overlap and must sum to constant power. The booth never crossfades two tracks, so equal-power is only used for one thing: the optional ducked announcement (phase 2), where the music is held at −12 dB under the microphone and brought back.
- **Declick.** Never set a `gain.value` directly while audio flows. Every start uses a 5 ms linear ramp from 0 (the track may start at a non-zero sample when `introSec` trims into the audio), every stop a 10–20 ms ramp to 0 before `source.stop()`; the emergency stop is 1 s of the −60 dB curve; pause is 20 ms down, resume 20 ms up.

### 2.3 Gap timing and sample-accurate scheduling

- `AudioBufferSourceNode.start(when, offset, duration)`: `when` is an absolute time on the context clock ("in the same time coordinate system used by the AudioContext"; a `start()` can be called only once per node: https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start, read today). The scheduler therefore computes `startAt[n+1] = startAt[n] + (duration[n] − trimIn[n]) + gap` on the context clock and schedules the next source **one gap ahead**, with a lookahead timer (a 100 ms `setTimeout`/`setInterval` loop that schedules anything due in the next 500 ms; the "two clocks" pattern, https://web.dev/articles/audio-scheduling, not re-verified today). Jitter from the JS timer never reaches the audio: the gap is exact to the sample. The wall-clock "remaining" display derives from the same numbers plus `AudioContext.outputLatency` (seconds between the graph handing a buffer out and the device playing it, https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency, read today) so the progress bar is not ahead of the room.
- A **hold** cancels the scheduled next source (`source.stop(now)` before it started is allowed, or simply never schedule until the DJ presses play). A **skip at the gap** replaces the next scheduled item. Since a started node cannot be re-scheduled, every item is a fresh `AudioBufferSourceNode` from the same `AudioBuffer`.
- **Pre-roll buffering.** Decoding is the only expensive step: `decodeAudioData` resamples to the context rate and returns float32 PCM (https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData, read today). A 3 min stereo track at 48 kHz is 180 × 48 000 × 2 × 4 B ≈ **69 MB**; mono ≈ 35 MB. Golden-age transfers are mono or dual-mono, so the booth **downmixes to mono on decode when the two channels correlate > 0.98**, keeps at most **three decoded buffers** (current, next, next+1 ≈ 100–200 MB), decodes the next tanda's first track during the cortina, and drops buffers two tracks behind the playhead. Decoding a 3 min MP3 takes 0.3–1 s on a 2020 laptop and 1–2 s on an iPad; "two tracks ahead" covers a 2.5 s gap with margin. Cortinas (≤ 90 s used) are decoded on demand with `duration = stopSec`.
- **Intro trim.** `introSec` (seconds until the level first reaches −30 dBFS) exists in the catalogue for previews only (offset unknown, so it is 0 for almost every row) and is **measured on the decoded file** in the booth (first sample above −40 dBFS, minus 0.3 s of pre-roll so the needle-drop noise is kept). It is applied as `offset` in `start(when, offset)` **only when the DJ enables "trim leading silence"** (default off: the leading surface noise is part of the gap feel for many DJs) and never trims more than 3 s.

### 2.4 Graph

```
per item:  AudioBufferSourceNode ─► GainNode(item: norm + trim + fades) ─┐
                                                                          ├─► GainNode(master) ─► AnalyserNode ─► destination
cortina:   AudioBufferSourceNode ─► GainNode(cortina: norm + level + fader) ┘                      └─► (phase 2) MediaStreamDestination ─► <audio sinkId=headphones> for cue
```

The master gain is the fader the DJ touches; the per-item gain is automation; the `AnalyserNode` (fftSize 256, `getFloatTimeDomainData`) gives a 30 fps RMS/peak meter with no extra nodes. Only `transform`/`opacity` move on screen, inside the existing performance budget.

---

## 3. Feasibility per source (verified from official docs today unless marked)

### 3.1 Deezer 30 s previews (what we have)

- `GET https://api.deezer.com/track/{id}` returns `preview` (a signed MP3 URL; the `hdnea=exp=…` parameter on the link we fetched today expires after ~24 h, which is why `/api/preview` refreshes it), `duration`, `gain` (−12.4 dB on the sample track: Deezer's whole-track replay-gain value for that edition) and `isrc` (live response read today; the documentation page itself is behind a login, https://developers.deezer.com/api/track). Previews allow cross-origin fetches, so Web Audio can decode them.
- Verdict: **rehearsal only.** Everything the engine does (gaps, fades, normalisation, scheduling) works on a 30 s buffer, so the booth can play a whole night "in miniature" (every song cut at 30 s, cortinas cut at their stop second) to check the flow, and the e2e suite can use it. On a real night it is useless: unknown excerpt offset, 30 s, expiring links, and no right to public performance. Label it "30 s rehearsal" everywhere.

### 3.2 Spotify Web Playback SDK (hosted login)

Read today: https://developer.spotify.com/documentation/web-playback-sdk, …/reference, …/tutorials/getting-started; endpoints https://developer.spotify.com/documentation/web-api/reference/transfer-a-users-playback and …/start-a-users-playback.

- **Premium only**: "The Web Playback SDK requires a Spotify Premium subscription (mobile only types of premium subscriptions are excluded)"; the SDK raises `account_error` for non-Premium accounts. `GET /me` returns `product`, which `lib/server/spotify.ts` `profile()` already reads, so the booth can say plainly "Your Spotify account is not Premium: Spotify does not allow playback in the browser" before loading the SDK.
- **Licence**: "This SDK must not be used in commercial projects without Spotify's prior written approval." TDJ is open source and self-deployed per DJ, but a DJ paid to play a milonga is a commercial use of the music; the research cannot resolve this, the UI must not hide it.
- **Device model**: the SDK "creates a local Spotify Connect device in the browser". Playback is started with `PUT /v1/me/player/play?device_id=…` `{uris:[one track], position_ms}` (scope `user-modify-playback-state`, "This API only works for users who have Spotify Premium") or moved with `PUT /v1/me/player` `{device_ids:[id], play:true}` (a single id only; "The order of execution is not guaranteed when you use this API with other Player API endpoints"). Our hosted login requests `playlist-modify-* user-read-email streaming user-read-private` (`apps/web/src/lib/server/oauth.ts`): the booth needs **`user-modify-playback-state` and `user-read-playback-state` added** and a route that hands the browser a short-lived access token for the SDK's `getOAuthToken` callback (the SDK "needs an access token"; the hosted cookie is httpOnly so a `GET /api/spotify/access` is required).
- **Fades**: `setVolume(volume)`: "Between 0 and 1"; and on the same reference page, **"On iOS, JavaScript cannot set volume."** So fades are 50 ms `setVolume` steps on desktop (20 steps/s, audible but acceptable for a 4 s cortina fade; a 1 s emergency fade in 20 steps is a stutter, use 25 ms) and **impossible on iPad**.
- **Gaps**: no scheduling API. Playing one URI per call and waiting for `player_state_changed` with `paused:true` at `position ≈ duration`, then a `setTimeout(gap)` and the next `play` call gives a gap of `gap + network latency` (typically +200–800 ms, variable). Fine for a práctica, not sample-accurate, and the first ~100 ms of a track are sometimes swallowed by the stream start.
- **Intro trim**: `position_ms` on the play call or `seek(position_ms)`; works.
- **Loudness**: Spotify's own normalisation is a client setting the SDK does not expose; our `loudnessDb` prior can drive `setVolume` (volume is linear amplitude; `10^(g/20)`), which only ever *reduces* level. No measurement is possible (no PCM access: the stream is DRM).
- **DRM / EME**: `initialization_error` is documented as "the browser cannot create a player, usually due to missing EME support"; cross-origin iframes need `encrypted-media` and `autoplay` permissions. Browsers with EME disabled (privacy builds, some kiosk setups) cannot play.
- **Autoplay / iOS**: "On iOS, the playback does not start automatically after transferring playback"; `activateElement()` "needs to be called in advance. Otherwise it will be in pause state once it's transferred"; community reports that `activateElement()` is unreliable on Safari and that calling `connect()` from the first user gesture is the working pattern (https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-Playing-song-directly-in-browser-issues-IOS/td-p/5538195, secondary). The browser device also appears in the DJ's phone Spotify app: a stray tap on the phone takes playback away from the booth mid-tanda.
- Verdict: **usable with caveats on a laptop (Chromium/Firefox/Safari desktop) for a práctica or a small milonga: Premium, full tracks, fades by polling, gaps ±0.5 s, no measurement, licence question. Not usable on iPad for fades. Never promise it as the marathon booth.**

### 3.3 The DJ's own files: File System Access API + Web Audio

Read today: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API, https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker, https://caniuse.com/native-filesystem-api, https://caniuse.com/audio-api.

- **Picker and persistence**: `showDirectoryPicker({ id, mode:"read", startIn:"music" })` needs a secure context and transient user activation ("Thrown if … it was not called via a user interaction such as a button press"); handles "can also be serialized into an IndexedDB database instance", so the DJ links the folder once; on the next visit the stored handle needs `queryPermission()`/`requestPermission({mode:"read"})` from a click ("Resume: re-open your music folder"). The folder is iterated recursively (`for await (const [name, h] of dir.entries())`), file names and the 128 bytes of ID3v1 / the ID3v2 header are read for matching.
- **Support**: caniuse lists the File System Access API as supported in **Chrome ≥ 105, Edge ≥ 105, Opera ≥ 91** and **not supported in Firefox (any), Safari (any), iOS Safari (any), Chrome for Android, Samsung Internet**; Mozilla's standards position is "harmful". So the persisted folder is **Chromium on a laptop only**; everywhere else §3.7 applies.
- **Playback**: Web Audio is universal (Chrome ≥ 14, Firefox ≥ 25, Safari ≥ 6, iOS Safari ≥ 6; 97 % global per caniuse). `decodeAudioData` handles MP3, AAC/M4A, FLAC (Chromium, Firefox, Safari ≥ 14.1 for FLAC in `<audio>`; Web Audio FLAC decode in Safari is reported to work but not documented: treat as "test on device"), WAV, Ogg/Opus (not Safari). The `AudioContext` must be created or resumed from a user gesture (Chrome: it "will be created in the 'suspended' state, and you will need to call resume() after the user gesture", https://developer.chrome.com/blog/autoplay, read today; WebKit: "Websites should assume any use of `<video>` or `<audio>` requires a user gesture click to play", https://webkit.org/blog/7734/auto-play-policy-changes-for-macos/, read today). The booth's "Start the night" button is that gesture; afterwards the context runs all night.
- **Matching files to the set**: the exports already name files `{artist} - {title}.mp3` with the DJ's naming pattern (`apps/web/src/lib/exportPaths.ts`, `DEFAULT_NAMING`), and DJ libraries are usually tagged (orchestra in Artist, title, year). Matching is (1) exact file-name match against the pattern, (2) tag/filename fuzzy match scored by the existing `lib/match.ts` (`bestMatch` over candidates with title, artists, year, duration), (3) manual pick in the existing "Find on services" sheet, which gets a "Pick file…" row. The match map (song id → relative path + file size + mtime) is persisted so one night's work serves all later sets.
- Verdict: **the real booth.** Everything in §2 works with sample accuracy; the only cost is a one-time folder link and a matching pass. Firefox/Safari users on a laptop can still pick the folder each session (§3.7).

### 3.4 Second output device (pre-listen)

Read today: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/setSinkId, https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId, https://caniuse.com/mdn-api_audiocontext_setsinkid, https://caniuse.com/mdn-api_htmlmediaelement_setsinkid.

- `AudioContext.setSinkId(deviceId)`: Chrome/Edge ≥ 110, Opera ≥ 96, Chrome for Android 155; **not** Firefox, **not** Safari/iOS. Needs device permission ("the user can be prompted to grant the required permission via a `MediaDevices.getUserMedia()` call"; `enumerateDevices()` then lists `audiooutput` devices) and may be blocked by the `speaker-selection` Permissions-Policy.
- `HTMLMediaElement.setSinkId(deviceId)`: Chrome ≥ 49, Edge ≥ 17, Firefox ≥ 116, Safari ≥ 18.4, iOS Safari ≥ 18.4 (caniuse); permission via `selectAudioOutput()` prompt or granted device.
- Practical design: the room graph stays on the context's default sink; the **cue** path is a `MediaStreamAudioDestinationNode` feeding an `<audio>` element with `setSinkId(headphones)`. This works in every browser that has the media-element method (now including Safari 18.4+) without touching the context sink. On iPad the "second device" is Bluetooth headphones *or* the dock, not both: iPadOS routes all audio to one output, so there is no pre-listen on iPad.
- Verdict: **phase 2, Chromium and Safari ≥ 18.4 on a laptop; not on iPad.**

### 3.5 Media Session and Wake Lock

Read today: https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API, …/MediaSession/setPositionState, https://caniuse.com/mdn-api_mediasession, https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API, https://caniuse.com/wake-lock.

- **Media Session**: Chrome ≥ 73, Edge ≥ 79, Firefox ≥ 82, Safari ≥ 15, iOS Safari ≥ 15. Metadata (title/artist/album/artwork) and action handlers (`play`, `pause`, `stop`, `nexttrack`, `seekto`…), `setPositionState({duration, position, playbackRate})`. Important caveat (not stated on MDN, observed behaviour): the OS media controls attach to a *playing media element*; pure Web Audio playback shows no lock-screen controls in Chrome unless a (silent, looping) `<audio>` element is playing. The booth keeps one such element alive so the headset/keyboard media keys map to hold/play and the lock screen shows the tanda. **Risk**: a Bluetooth headset's "pause" button then pauses the room. The booth maps `pause` to **hold** (finish the song), never to a cut, and lets the DJ disable media keys.
- **Wake Lock**: Chrome ≥ 84, Edge ≥ 84, Firefox ≥ 126, Safari ≥ 16.4, iOS Safari ≥ 16.4 (Baseline 2025). `navigator.wakeLock.request("screen")`; "previously acquired locks are automatically released when document becomes inactive", so re-request on `visibilitychange`. A screen lock does not stop audio on a laptop, but macOS *display sleep* can throttle a background tab and some laptops drop the audio device on lid-close; the booth asks for the lock and tells the DJ to disable lid-close sleep. **A browser tab in the background is throttled** (timers ≥ 1 s): the lookahead scheduler must schedule the next item as soon as the current one starts (full-length lookahead, not 500 ms) so a backgrounded tab still plays the gap correctly.

### 3.6 iPad

- No File System Access API (caniuse, any iOS version). `<input type="file" webkitdirectory>` is Baseline 2025 ("Since August 2025, this feature works across the latest devices"); `files` is flat with `webkitRelativePath` set. The folder lives in the Files app (iCloud Drive or a USB stick); the DJ picks it **each session**, the `File` objects stay valid for the session, matching is cached by name/size so it is instant. Decoding on an A-series iPad takes 1–2 s per track; the two-ahead policy holds.
- Web Audio works; `AudioContext` needs the start gesture; the device goes to the dock/Bluetooth; background tabs stop Web Audio on iOS after some seconds unless a media element is playing (the Media Session keep-alive element in §3.5 is also what keeps the booth alive when the DJ switches apps; still, the spec says: **keep Safari in the foreground**, Guided Access is the DJ's friend).
- Spotify SDK on iPad: Premium, plays, but **no volume control** (no fades) and the autoplay quirks above: "partial".
- No second output device, no `setSinkId` on the context.
- Verdict: **local files on an iPad work for a night, with a folder pick at the start and the tab in the foreground; no pre-listen, no persisted folder.**

### 3.7 Firefox and Safari on a laptop

- Local files: pick the folder per session with `webkitdirectory` (supported), Web Audio does the rest; no persisted handle. Pre-listen: Safari ≥ 18.4 via media element `setSinkId`; Firefox ≥ 116 the same. Spotify SDK: supported browsers per Spotify ("Chrome, Firefox, Safari and Microsoft Edge").

### 3.8 What a browser cannot do (today)

- Keep a folder permission across sessions outside Chromium.
- Play through two output devices from one `AudioContext` outside Chromium (Safari/Firefox: only the media-element route).
- Set volume on iOS media playback (Spotify SDK and `<audio>`); Web Audio gain is unaffected, which is why the local-file path is the only one with fades on iPad.
- Guarantee audio in a background tab on iOS, or exact timers in a background tab anywhere (schedule ahead).
- Read Spotify PCM (DRM), hence no measured loudness and no sample-accurate gaps on Spotify.
- Prevent the OS from stealing the output device (a plugged-in headset, a Bluetooth reconnect): the booth must detect `devicechange` and show a red banner; it cannot prevent it.
- Act as a Spotify Connect *controller* for the DJ's phone with sub-second timing (the Web API has no scheduling and "order of execution is not guaranteed").

---

## 4. Decision

Build the booth around **local files + Web Audio** (full feature set, Chromium laptop first, iPad and Firefox/Safari with a per-session folder pick), keep **Spotify SDK** as a secondary adapter with its limits stated in the UI (Premium check, licence note, "fades by volume steps", "no fades on iPad"), and keep **Deezer previews** as the rehearsal mode that also powers the automated tests. Put the night's timing (gaps, cortina fades, stop seconds, normalisation gains) into `packages/core` so the exports and the booth agree to the second.

Sources not already linked inline: Audacious tango-pause request https://redmine.audacious-media-player.org/issues/779 · Traktor "5-second silent mp3" workaround https://community.native-instruments.com/discussion/comment/12288 · Algoriddim gap request for tango/swing https://community.algoriddim.com/t/please-enable-a-gap-in-automix-we-need-it-for-swing-ballroom-similar-events/4452 · Mixxx Auto DJ modes https://manual.mixxx.org/latest/en/chapters/djing_with_mixxx.html (read today: transition time in seconds, "Full Track", "Skip Silence" modes) · tango-dj.at database of 90 000+ transfers https://tango-dj.at/mailings/2017/2017-04-1.htm, https://tango-dj.at/homepage-archive/homepage-2022.htm · Tango-L cortina thread https://mailman.mit.edu/pipermail/tango-l/2006-October/002108.html · TDJ's own `docs/research/audio-features.md` §1.6 (loudness model) and `docs/ENHANCEMENTS.md` E33/E39/E51/E61 (clock view, cortina trimmer, booth mode, keyboard map).
