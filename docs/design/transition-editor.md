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

The audition plays the last ~8 s of the outgoing side, the transition itself, and ~8 s of the incoming side. It is
rendered offline with the same curves and EQ the engine uses. It goes to the headphones output when one is chosen.
Before the night it plays on this device. During the night, with no headphones chosen, it asks first ("Play the
audition in the room?") and only plays in the room after you confirm.

## Layout

A sheet up to 760 px wide on iPad and desktop, full screen on iPhone. Content sits on 24 px edges in the sheet
(16 px on the phone, where the lanes run full width). Every target is at least 44 px. The editor has light and dark
themes and is translated into English and Turkish. The "Beta" pill has been removed.
