# Round 20 — Stop, pause and fade in the booth; hearing it

Complaint: "stopping music is too hard also dj and fade in fade out parts and features not added and cant hear
music". Scope: the booth (`apps/web/src/app/booth`, `components/booth/*`, `lib/booth/**`) and one timing input in
`packages/core/src/booth.ts` (per-cortina envelopes). Round 18's lengths, clips and layout are kept (its specs pass).
The night's musical content is unchanged.

## 1. Causes found (live site, featured night → Play the night)

| Complaint | Cause (evidence) |
|---|---|
| Stopping is too hard | While playing, the main button was **Hold** (`aria-label "Hold after this song"`): it lets the song finish. The only immediate stop was the square, which needed a **600 ms press-and-hold** (`STOP_HOLD_MS`); a tap did nothing visible. Esc also had to be held 600 ms. There was no Pause / Resume at all: the engine's only states after `playing` were "hold" (wait for the end) or "stop" (fade 1 s, restart the song from 0). |
| Fade in / fade out "not added" | The plan carried `fadeInSec` / `fadeOutSec` / `stopSec` for cortinas and the Set-up sheet had night-level cortina fade steppers, but nothing the DJ can use while playing: no fade out now, no crossfade, no per-cortina envelope, no song end fade, no talk-over. The round-7 spec's phase-2 "microphone duck" was never wired; "cue the cortina" was keyboard-only (`c`). |
| Wrong banner in 30 s clip mode | `store.start()` showed "N of 108 items have no file yet … Link your music folder" whenever `sourceMode !== "preview"`. The featured night opens in **file** mode and falls back to clips for every item (`rehearsal` is true), so the local-files banner appeared over a rehearsal (round 8 #7 had removed it for `?rehearsal=1` only). |
| Can't hear | See §3. In headless Chromium the engine fetched, decoded and ran (meter moving), so the graph was correct; the losses are on the device side: the iOS silent switch, the unlock steps running after `await`s, and the OS suspending the context. |

## 2. What changed

### Transport (control layer only: the strip and sheets are glass, the cards stay on `surface`)

| Control | Before | After |
|---|---|---|
| Primary while playing | Hold (after this song) | **Pause** (one tap, 0.8 s fade; `space`). Paused → **Resume** from where it stopped, with the same fade in. During a break: End break. |
| Stop | press-and-hold 600 ms (esc held 600 ms) | **one tap** opens "Stop the music?": **Fade out and stop (3 s)** (focused: Enter) or **Stop now** (0.1 s declick). Esc opens the same sheet; esc again keeps playing. Play restarts the same song. |
| Hold after this song | the primary button | the hand button on the strip (≥ 1200 px), the Mix sheet, the ••• menu, `h`; it toggles (Cancel hold) |
| Fade out now | — | Mix sheet / `f`: the song fades over 4 s (−60 dB log curve), the next item follows at the gap after the silence |
| Next with crossfade | — | Mix sheet / `x`: the next item starts now while the running one fades out over 3 s. Spotify plays one track at a time, so there it is "fade out now". Never automatic (round 7's non-goal "no crossfading between songs" stays the default). |
| Talk-over | — (round-7 phase 2) | Mix sheet switch / `t`: the master dips 12 dB over 0.5 s and back; a "talk-over · −12 dB" chip on the Now card |
| End the tanda after this song | `c` only | also in the Mix sheet |
| Shortcuts | space = hold, esc held = stop | space pause/resume, esc stop…, → next at gap, f, x, h, t, c, b, m, ↑/↓, ? (the Keyboard sheet and the Mix rows show them; the hints hide on touch screens) |
| Media keys / lock screen | pause = hold | pause = Pause (0.8 s fade); the Set-up "Media keys" switch still removes them |

Phone strip (390 px): Pause · Next · Stop · Mix · ••• (one 64 px row, every button ≥ 44 px). Desktop: Pause · Next ·
Stop · Cortina fader · Master fader · Mix · Hold · Mute · Birthday vals · Break · •••.

### Fades the DJ sets

- **Mix sheet** (was Levels; same test ids): Now (the actions above), the two faders and Mute, and **Fades**:
  pause/resume fade (0–3 s, 0.8), fade out now (1–10, 4), crossfade (1–8, 3), fade out and stop (0.5–8, 3),
  **song end fade (0–8 s, default 0: dancers dislike faded tango sides)**, cortina fade-in / fade-out (the night's,
  0–2 / 3–6), and the gap between items (0.5–6). Saved on the device; the plan settings (gap, cortina fades) now
  re-time the night also while it plays (the playhead stays; what is ahead follows).
- **Per cortina** (the sliders button on each cortina row of the set): fade in (0–4 s), fade out (0–10 s), stop at
  (20–90 s), "plays for", and "Use the night's settings". Saved with the set as `booth.cortinaEdits`
  (`packages/core`: `BoothInputs.cortinaEdits`, `CORTINA_EDIT_RANGES`), so History and the DJ-app exports carry it and
  the night is re-timed; a fade never takes more than the cortina minus 1 s. A cortina already queued is rebuilt
  (`replacePlan` now re-schedules any queued item whose start is ahead); the one playing keeps its envelope.
- **Engine** (`lib/booth/engine.ts`): `pause(fade)`, resume via `play()` (`schedule(i, when, { from, fadeIn })`
  starts the buffer at the paused offset; the clock carries on from there), `stop(reason, fadeSec)`, `fadeOutNow`,
  `crossfadeNext`, `setDucked`, the song end fade in `schedule`, and the outgoing item of a crossfade is tracked so
  Stop / Pause silence it too (found by the e2e: "Stop now" 1 s after a crossfade left the 3 s tail playing). A fade
  curve that cannot be scheduled (a browser without `cancelAndHoldAtTime` mid-ramp) falls back to an exponential
  approach instead of throwing. Spotify: pause = `stop(fade)` with volume steps, resume = `startItem` at the position
  with the fade in; the song end fade uses the same volume ramps (none on iPad: `capabilities.fade = false`).

### Banner

The local-files banner shows only when the night plays from files (`!rehearsal && sourceMode !== "preview"`). In clip
mode the Now card's "1 not rehearsable: no clip of the Spotify recording" is the only note.

## 3. "Can't hear": analysis

Measured in Chromium (e2e `round20-booth.spec.ts`): 1.5 s after Start the AudioContext is `running` and the master
output (the analyser right before `destination`) reads about −15 dBFS RMS on the test tone; Pause reaches < −70 dBFS
in under a second; fade out now is > 10 dB down 1.5 s into a 4 s fade, silent at its end, and the next item comes
back audible; a crossfade never drops below −50 dBFS. Unit tests pin the gain chain defaults: master at unity
(0 dB), not muted, not ducked, cortina fader 1, song fade 0, an unmeasured track at 0 dB.

| Cause | Fixed in the app | Depends on the device |
|---|---|---|
| iPhone / iPad silent switch mutes Web Audio (Safari plays it through the "ambient" session) | `navigator.audioSession.type = "playback"` (Safari 16.4+) in the Start / Play tap; the silent keep-alive `<audio>` now starts **inside the tap** (it was started after several `await`s, where iOS refuses `play()`), which moves older iOS to the playback session too | iOS < 16.4 with the switch on and a blocked keep-alive: still silent. Tell the user: switch the ring/silent switch off or turn the volume up with the side buttons while the booth plays. |
| Unlock after `await` | the context is created, resumed and primed (a one-sample buffer started) synchronously in the tap (`lib/booth/unlock.ts`) | — |
| The OS suspends / interrupts the context (call, Siri, Bluetooth route change, screen lock) | the engine resumes it on `statechange` while the night is live; the page resumes on `visibilitychange`; if the context is still not running 1.5 s after Start / Play, a banner says so with **Turn sound on** (a tap that resumes it) | Background audio on a locked iPhone can still be stopped by iOS. |
| Too quiet | defaults pinned by tests (above); clips are normalised to −16 LUFS (−4 dB for cortinas) and never raised past −1 dBFS peak | The device volume, the output chosen (AirPlay / Bluetooth), a muted tab (Chrome tab mute), or the system output. |
| Spotify mode | — | Needs Premium and a browser the Web Playback SDK supports; no volume ramps on iPad (fades become cuts). |

What to tell the user to check: the phone's silent switch and volume buttons while the booth plays; the tab is not
muted (desktop: right-click the tab); the right output (Control Centre / sound settings); in Spotify mode, Premium.
If the "Turn sound on" banner appears, tap it.

## 4. DJ features: promised vs wired

| Feature (spec) | Before | Now |
|---|---|---|
| Hold / play (round 7 §1.1) | wired (primary) | wired (strip ≥ 1200, Mix, •••, `h`) |
| Pause / resume | — | **added** |
| Emergency stop (round 7: "press-and-hold 600 ms **or a confirm sheet**") | press-and-hold only | **one tap + confirm**, two fade lengths |
| Next at gap (→) | wired | wired |
| Skip now (`skipNow`, round 7 §6.2) | engine only | covered by Next with crossfade / Fade out now |
| Cue the cortina (`c`) | key only | wired (Mix sheet) |
| Birthday vals (`b`) | wired | wired |
| Break with countdown | wired | wired |
| Cortina fader (pull to 0 ends the cortina) | wired | wired |
| Master fader, mute (`m`) | wired | wired |
| Night settings: gap, cortina fade in/out, level, loudness, trim | Set-up sheet (before the night) | Set-up and Mix; re-time also during the night |
| Per-cortina fade in / fade out / stop at | plan field only | **added** (set row → Cortina sheet, saved with the set) |
| Song end fade | — | **added** (default 0) |
| Fade out now, Next with crossfade | — | **added** |
| Microphone duck / talk-over (round 7 §11, phase 2) | — | **added** (switch + `t`; no microphone input: the DJ speaks over the dip) |
| Per-item trim (`setTrim`) | engine + store, no UI | left (the Now card shows the applied gain) |
| Pre-listen / `cue` on a second output (round 7 §11, phase 2) | — | left: needs `setSinkId` / `selectAudioOutput`, not on iPad |
| Waveform and drag-to-set cue/stop (round 7 §11) | — | left (the Cortina sheet's steppers set the stop second) |
| Test tone | wired (Set-up) | wired |

## 5. Tests

- `packages/core/test/booth.test.ts`: per-cortina edits (clamps, re-timing with exact gaps, survive `attachBooth`, no
  key without edits).
- `apps/web/src/lib/booth/engine.test.ts` (round 20 block): audible defaults; unmeasured track at 0 dB; context
  resumed on `statechange`; pause/resume (fade, position, re-queue, log, not a hold in History); stop fade lengths;
  fade out now; crossfade; Stop after a crossfade silences the tail; song end fade; talk-over; Spotify pause/resume;
  a queued cortina rebuilt after an edit.
- `apps/web/src/lib/booth/unlock.test.ts`: the audio session, resume and priming happen synchronously and never throw.
- `apps/web/e2e/round20-booth.spec.ts`: audible output after Start (non-silent RMS, context running), Pause/Resume
  one tap (and space) with the output measured, fade out now and crossfade measured, Stop tap + confirm and esc +
  Enter, the cortina sheet (saved, re-timed, reset), no files banner in clip mode, ≥ 44 px, no overflow at 390 and
  1440.
- Older booth specs updated: round 7 (h holds, space pauses/resumes, esc + Enter stops), round 8 QA (Pause after a
  break ends), round 18 (esc → Stop now).
