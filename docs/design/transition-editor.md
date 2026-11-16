# The Booth's transition editor

The owner's November 2026 review said the editor "still is not like Spotify or other DJ apps" and asked why it said Beta.
This note records what we took from those apps, and how each idea maps to `components/booth/TransitionSheet.tsx`,
`transition.css`, `lib/booth/transition.ts` and `lib/booth/transitionView.ts`.

## References

- **Spotify Mix editor** (iOS, "Edit transition", seen on Mobbin): the outgoing song's row on top, then two stacked
  waveforms on one time axis with a box per lane over the transition, then the incoming song's row. Below them sit the
  Volume / EQ / Effects rows and the presets (Custom, Auto, Fade, Rise …), with BPM and key on each row. Spotify
  labels its own editor Beta. The press describes presets as starting points that you then adjust, with volume
  ("overlap"), EQ ("centre/end bass swap") and effect curves.
- **djay Pro (Automix)**: a transition style (Fade, Filter, EQ …) and a length in bars or seconds, plus crossfader
  curves (Linear, Constant Power, Dipped, Cut). Start and end points can be set from the keyboard.
- **DJ.Studio**: a handle on each edge of the transition, dragged to set where it starts and ends. Outside the handles
  the side that isn't playing is muted. Each transition has its own volume and EQ automation lanes, and you can edit
  the curves directly instead of only picking a preset.
- **Rekordbox / Serato**: a beat grid on the waveform (bar lines stronger than beats), snap to the grid that you can
  turn off, and cue markers (the first downbeat, memory cues) drawn on the track.

## What we took

| Idea | Where in T-DJ |
| --- | --- |
| Two stacked lanes, outgoing end on top, incoming start below, the song rows above and below them | `Stage` lanes, `Side` rows |
| Real waveforms (low / mid / high bands) | file or the 30 s clip that actually plays (`waveformOf`, `spectral.ts`) |
| No fake waveform for audio the browser can't read | Spotify: a smooth, hatched, dashed **estimated shape** from length, energy and measured silence, with the caption "Estimated shape (Spotify audio isn't available to the browser)". A clip drawn for a side that plays the full Spotify track would be the wrong audio, so that side gets the estimate too |
| A time ruler | seconds relative to the outgoing's end (−4 s … 0 … +2 s); the step adapts to the zoom (`rulerTicks`) |
| Beat grid when BPM is known; snap toggle | beat and bar ticks in the ruler and across the lanes; **Snap** in the toolbar (off, or disabled with the reason, when no BPM is known) |
| Handles per lane (DJ.Studio, Spotify boxes) | `editorEdges`: blend = overlap start across both lanes, outgoing fade end, incoming rise end; fade = fade-out start, where the incoming comes in, rise end; gap = where the incoming comes in. Pointer drag, or ← → (a beat, or a bar with Shift) |
| Curves drawn on the waveforms and editable | the yellow volume line per lane with a **bend knob**: up = equal power, middle = linear, down = S-curve (↑ ↓ on the keyboard). djay's curve names appear in the Volume row |
| EQ automation on the lanes | low (pink), mid (amber), high (cyan) lines. EQ row: None, **Centre bass swap**, **Three-band swap** (lows swap at the centre, mids and highs hand over across the overlap). The engine adds a peaking mid band between its shelves |
| Overlap shaded | a tinted band across both lanes over the overlap |
| Cue markers | the incoming's **Music in** (end of its measured silent head) and **First beat** (first strong low-band onset of a decoded side). We have no vocal-entry data yet, so we don't draw a marker for it |
| Silence | the sides' own silence greyed (as before) and the "Silence heard" line |
| Transport in a toolbar, not over the waveform | toolbar under the lanes: **Audition**, the length pill, the **Gap** pill (fade, cortina cut), zoom − / fit / +, Snap. Ctrl or ⌘ with the scroll wheel also zooms |
| Lengths in bars or seconds | ••• → Lengths in bars / seconds |
| Presets as starting points | Auto, Fade, Rise, Blend, Gap (+ Cortina cut after a cortina). The Volume and EQ rows always open: picking a curve where nothing fades adds a Fade, and picking an EQ swap without an overlap switches to Blend (each option says so) |

## Where it plays (said in the editor)

- **Files and 30 s clips**: everything as drawn. Web Audio gain curves (`setValueCurveAtTime`), the overlap, and
  lowshelf / peaking / highshelf `BiquadFilter` automation, in the engine and in the offline-rendered audition.
- **Spotify in this browser (Web Playback SDK)**: the fades (volume steps) and the gap. An edited fade retimes the
  outgoing's end (`ExternalHandle.retime`) and the incoming rises. Spotify plays one track at a time, so there is no
  overlap and no EQ.
- **Spotify Connect** (iPad / iPhone Spotify app): the device can't fade, so only the gap plays. The editor names the
  device and says so.

## Audition

The owner (2026-11): "the transition guide doesn't really play the part of the transition between those songs". The
old audition took each side's plan length from second 0 of its audio (so a head cut ended the outgoing early), ignored
the join's silence (the gap fell back to the night's setting whenever the plan's gap was 0, and no cut was applied),
always ran 8 s, and on a Spotify night it mixed two 30 s clips from the middle of the songs (or a side of silence)
without saying so. Now `planAudition` (`lib/booth/audition.ts`) lays out the last N seconds of the outgoing side
(5–15 s, ••• → Audition length) into the first seconds of the incoming one exactly as the night will play it: the
start points (a cue in, a cortina's start, the silent head the join cuts), the end (a stop cue, the cut tail), the
gap, fades, overlap and EQ, and the transition's own silence mode.

| Source | What plays |
| --- | --- |
| Your files | The real files, rendered offline with the engine's curves and EQ (`renderTransition`) |
| 30 s clips | The clips, said plainly: "Clip: not the real ending" (a clip is the middle of the song) |
| Spotify in this browser (SDK) | The real recordings on the player: seek the outgoing to (its end − N), play, fade in volume steps, then play the incoming from its start at the gap (`spotifyAuditionSteps`, `runAuditionSteps`) |
| Spotify Connect | The same on the device, without fades (said so); an overlap plays as the night's gap, as it will tonight |

A playhead runs across both lanes in step with what is heard (the cue player's clock, or the wall clock from when
Spotify started); Space starts and stops it inside the editor; Stop (the same button) stops it, and closing the editor
does too. It goes to the headphones output when one is chosen. Before the night it plays on this device (Spotify on
its own player). During the night, with no headphones chosen, it asks first ("Play the audition in the room?"); a
Spotify night plays the clips then, since the player is the room's.

## Templates

"Save as template…" (the presets' head, or •••) keeps the transition as it is now — preset, lengths, curves, EQ and
silence — under a name, on this device (`lib/booth/transitionTemplates.ts`). Templates sit after the presets (Auto,
Fade, Rise, Blend, Gap + the DJ's own). Settings → Booth → Transitions renames, edits, reorders and deletes them and sets
the defaults per kind of join (song → song inside a tanda, last song → cortina, cortina → next tanda, into La
Cumparsita) and, inside a tanda, per rhythm; Auto then means that template (the plan's `defaultTransitions`; an edit of
the DJ's own always wins). ••• → Apply to the whole tanda / night previews the joins of the same kind it changes and
records one entry in the shared edit history (⌘Z). The owner's personal export carries the templates (Settings →
Owner → Transition templates).

## Spotify lanes

A side Spotify plays is drawn from the DJ's own file of the same recording when the linked folder has one ("From your
file"). Otherwise the estimate is informed, still hatched and labelled Estimated: its level and swing from the 30 s
clip's envelope (or the analysed loudness), nudged by the catalogue energy, an 8-bar phrase swell at its BPM, the
ending of its rhythm (a tango's final chord, a vals' held note), and its measured silence and length. A line says what
shaped it, and, without a file, "Link your music folder" links one.

## Layout

A sheet up to 760 px wide on iPad and desktop, full screen on iPhone. Content sits on 24 px edges in the sheet
(16 px on the phone, where the lanes run full width). Every target is at least 44 px. The editor has light and dark
themes and is translated into English and Turkish. The "Beta" pill has been removed.
