# DJ controllers and the virtual controller (2026-11)

The owner: *"the connected controller's settings should be inherited and shown digitally, or there should be a digital
controller — a simulator that acts like a real controller — a function other DJ apps have."* Read as: hardware DJ
controller (MIDI) support, MIDI Learn, a live mirror of the controller's faders and knobs, and an on-screen controller
that drives the Booth exactly like the hardware does.

## What other DJ apps do (research, Nov 2026)

| App | Controllers | Custom mapping | Notes |
|---|---|---|---|
| **djay Pro** (Mac, iPad, iPhone, Windows) | large list of native mappings, plug-and-play | MIDI Learn (Pro subscription): press a control, the note/CC lands in the mapping table | iPad: native mappings over USB-C; MIDI Learn on iOS came later than on Mac |
| **Serato DJ** | "official" hardware list (unlocks the app), each mapping written by Serato with the maker | MIDI mapping mode: click a software control, move the hardware one; saved as XML presets | LED feedback only for official mappings or "MIDI output" option |
| **rekordbox** | Pioneer DJ / AlphaTheta controllers (DDJ-FLX4, DDJ-400, DDJ-200…) native, a few third party | MIDI LEARN window: pick a function, press a control; export/import `.midi.csv` | the DDJ-400/FLX4 are rekordbox-first devices |
| **Mixxx** (GPL) | community mappings for ~150 controllers | `.midi.xml` (MIDI → control) + optional JavaScript per controller; a MIDI Learning Wizard | the mapping files are GPL-2.0+: **not copied** here |
| **VirtualDJ** | ~400 native controllers | VDJScript mappings, "Learn" | |
| **Traktor** | Native Instruments S2/S4 (HID), many MIDI | Controller Manager: Learn, `.tsi` | the S2/S4 MK3 speak HID, not class-compliant MIDI, by default |

Common pattern we follow: **built-in mappings for the common controllers + MIDI Learn on top + export/import**, with
LED feedback from the app's state and *soft takeover* (Mixxx's term: a fader takes over only when it passes the
software value, so nothing jumps).

### Controllers DJs carry

Pioneer **DDJ-FLX4 / DDJ-400** (the best-selling 2-channel controllers; 4-channel USB audio: master on ch 1–2,
headphones on ch 3–4), **DDJ-200** (Bluetooth/phone first), Numark **Mixtrack** Pro/Platinum FX, Hercules
**DJControl Inpulse** 200/300/500 and DJControl Mix, Native Instruments **Traktor S2/S4** (HID), Reloop
Buddy/Ready/Mixon. Tango DJs mostly play from a laptop with a sound card or a simple 2-channel controller used for its
audio interface (room + headphones), or a small MIDI pad (Akai LPD8, Korg nanoPAD) for a few buttons next to the
laptop.

### Web MIDI, per platform

| Platform | Web MIDI | Notes |
|---|---|---|
| Chrome, Edge, Opera (desktop, Android) | yes | secure context; since Chrome 124 **every** `requestMIDIAccess()` shows a permission prompt (we never ask for SysEx) |
| Firefox (desktop, ≥ 108) | yes | gated behind a site-permission add-on prompt |
| Safari (macOS, iOS, iPadOS) and every iOS browser (all WebKit) | **no** | WebKit declined Web MIDI (fingerprinting); a third-party Safari extension exists but is not something we rely on |
| T-DJ for Mac / iPad / iPhone (Tauri, WKWebView) | n/a in the web view | **native CoreMIDI** through the `midir` crate (MIT): `midi_ports`, `midi_open`, `midi_close`, `midi_send` commands and a `tdj:midi` page event |

So: Chrome/Edge on the laptop, or the T-DJ app on Mac and iPad. An iPad with USB-C takes a class-compliant controller
(the DDJ-FLX4 and DDJ-400 are class-compliant) directly; CoreMIDI sees it like on the Mac. Safari users are told why
and pointed to the app or Chrome; the **virtual controller works everywhere**.

## What T-DJ supports

### Two layers

1. **Mapping: MIDI → physical control.** A controller's message list (note / CC per status byte) names its controls in
   one vocabulary: deck A/B `play`, `cue`, `pfl` (headphone cue), `level` (channel fader), `eqHi/eqMid/eqLow`, `trim`,
   `filter`, `jog`, `jogSide`, `jogTouch`, `load`, `pad1…8`; the mixer's `xfader`, `master`, `hpMix`, `hpLevel`,
   `browse`, `browsePress`, `shift`. Every control's position feeds the **mirror** whether or not it does anything.
2. **Assignment: control → Booth function**, fixed by tango's needs (below). MIDI Learn binds a message straight to a
   Booth function and overrides the assignment.

The virtual controller sends the same controls into the same runtime, so it behaves exactly like the hardware.

### Decks are roles, not players

Tango is one song at a time at its original tempo: there is no beatmatching, no second song running in parallel.
Deck **A is NOW** (what the room hears), deck **B is NEXT** (what comes; its CUE / headphone button pre-listens it).
They never swap: a DJ's left hand is always on the room. **Tempo / pitch faders, sync and key lock are not used**
(the night plays every recording at its original speed) — they are mirrored and say so.

### The Booth functions a controller can drive

| Function | Default control (DDJ-FLX4 / DDJ-400) | Night safety |
|---|---|---|
| Play / Pause (Start before the night) | A PLAY | pausing the room mid-night: press twice (arm, confirm) |
| Next now (fade to the next item) | B PLAY | press twice mid-night |
| Previous | B pad 1 | press twice mid-night |
| Skip the next song | B pad 2 | the running song plays on; Undo |
| Stop (fade out and stop) | B pad 3 | **always** press twice, and only when the night runs |
| Fade out now (a cortina cut short) | A CUE | press twice mid-night; not on Spotify Connect |
| Skip the rest of this tanda (to its cortina) | B pad 5 | press twice mid-night |
| Cue the next song (or the browsed one) to the headphones / stop the pre-listen | B CUE, B headphone CUE | never touches the room |
| Room volume (master) | A channel fader (soft takeover), a MASTER knob when the controller sends one | volume, no confirm |
| Cortina fader | (Learn) | — |
| Crossfade into the next | crossfader moved across to B (arms), BROWSE press confirms; B pad 4 | arms mid-night; moving back cancels |
| Seek in the playing song | A jog (fine scrub; SHIFT ×10) | the target is shown; mid-night BROWSE press (or Confirm on screen) confirms; the song plays on meanwhile |
| Room EQ (low / mid / high shelf on the room) | A EQ knobs | files and clips only — Spotify / YouTube: disabled with the reason |
| Talk (dip the music) · Mute · Hold after this song · Undo | A pads 1–4 | Mute mid-night asks twice (unmuting never waits) |
| Floor full · OK · emptied (the playing song) | A pads 5–7 | — |
| Find songs | A pad 8 | — |
| Browse the coming songs · Load = Play next | BROWSE turn, B jog · LOAD A/B | Load is a queue change, not a room cut |
| Confirm what is armed | BROWSE press | — |

What a function cannot do on the room's player is disabled with the reason (Spotify Connect: no crossfade, no EQ,
maybe no volume — the same capabilities the Controls panel uses).

### LED feedback

Over MIDI out, from the Booth's state: A PLAY lit while playing, B CUE / headphone CUE lit while pre-listening, A pads
lit for Talk / Mute / Hold. Pioneer's convention (same note, velocity 127 on / 0 off).

### Built-in mappings

Written for T-DJ from the public message lists (Pioneer DJ's "List of MIDI Messages" for the DDJ-400; the FLX4 keeps
the 400's layout), not copied from Mixxx (GPL) or any app:

- **Pioneer DDJ-FLX4** and **DDJ-400** — decks on MIDI ch 1/2, mixer on ch 7, pads (HOT CUE mode) on ch 8/10; channel
  faders and crossfader 14-bit.
- **Generic 2-deck** — T-DJ's own documented layout (decks on ch 1/2, mixer on ch 3; notes 0–4 transport, 8–15 pads,
  CC 7 levels, 16–20 EQ/trim/filter, relative CC 22 jog), the layout the virtual controller speaks and a starting
  point for TouchOSC-style surfaces or any controller after a few Learns.
- **8-pad controller** (Akai LPD8, Korg nanoPAD, any pad that sends notes 36–43 on any channel): Play/Pause, Next,
  Talk, Mute, Hold, Cue next, Floor full, Floor emptied; knobs CC 1/2 → room volume / cortina fader.

Mappings are matched by port name, saved per controller on this device (localStorage), and export / import as JSON
(`{ "format": "tdj-controller-mapping", "version": 1, … }`).

### MIDI Learn

In the controller sheet: tap a Booth function, move or press a control → bound. Note-offs are ignored, a 14-bit
fader pair (CC n + n+32) is recognised, a relative encoder (values around 1/127 or 63/65) is recognised. A message
already bound elsewhere moves to the new function (said in the toast).

### Inherit and show

The controller sheet shows each port (name, manufacturer, in/out) and a **digital mirror**: every fader, knob,
crossfader position, button press, jog movement, the pad bank — live. What the controller does in hardware only (the
DDJ's master and headphone level knobs are analog) is labelled "hardware". MIDI controllers have no "read the state"
request; positions appear as soon as a control moves (Pioneer controllers send their faders when the software
connects on some firmware; we listen either way).

### Audio routing

When a controller's MIDI port appears and an audio output with the same name exists (a DDJ is both), T-DJ offers to
play the room on its ch 1–2 and the headphones on ch 3–4 (lib/booth/outputs.ts / routing.ts). It is an offer, never
an automatic switch, and mid-night it waits for a confirmation.

## Not supported (and why)

- Tempo / pitch, sync, key lock, loops, beat FX, sampler: tango plays recordings at their original tempo and length.
- HID-only controllers (Traktor S2/S4 MK3 in HID mode): no HID in browsers' MIDI, no HID here yet.
- Mapping scripts (Mixxx JS, VDJScript): a declarative mapping + Learn covers a tango booth.

## Review passes (two personas, walked in the running app with a fake Web MIDI DDJ-400)

**A tango DJ who plays milongas weekly on a DDJ** — fixed: a "fade it out now" on the controller (NOW's CUE, twice
mid-night: a cortina that runs long), Skip the rest of the tanda (NEXT pad 5), Mute asks twice mid-night (a pad is
easy to hit; unmuting never waits), the headphone CUE pre-listens the browsed song when one is chosen. Open: PLAY's
LED does not blink while paused; Load (Play next) has no Undo yet; NOW's headphone CUE does nothing (the DDJ's own
CUE/MASTER mix knob blends the room into the headphones).

**A club / open-format DJ (Serato, rekordbox)** — fixed: with the sheet closed, BROWSE, the jog seek, the headphone cue
and confirmations answer in a toast; the mirror redraws once per frame (a spinning jog is hundreds of messages a
second); a controller unplugged mid-set says so and the night plays on. Open: SHIFT layers are not learnable (a
learned message is learned as sent); no LED for the armed state; Learn adds a message to a function (the built-in one
stays) rather than replacing it — Forget / Built-in mapping undo it.

## What needs a real controller to verify

Exact jog resolution (seconds per tick), the DDJ pads' channel in HOT CUE mode, LED velocity conventions on the FLX4,
the 14-bit LSB order, and CoreMIDI hot-plug on iPad (polled every 2 s).
