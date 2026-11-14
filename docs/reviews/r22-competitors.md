# Round 22: competitor survey of tango DJ apps and general DJ/music apps

Date: 2026-11-14. Scope: the ROADMAP item "Features from other tango and DJ apps (competitor survey)".

**Evidence labels.** **[W]** means checked on the web this round; the sources are listed at the end. Most of these are vendor pages or store listings, so the claims are the vendors' own. **[K]** means it comes from the reviewer's own knowledge (training data up to mid-2026) and was not re-checked this round. Prices change often, so treat them as indicative.

**TDJ baseline.** This is read from `docs/ROADMAP.md` and a quick look at `apps/web/src`. TDJ already composes 4 h nights: tandas, arc, cortina families, Cumparsita, locks, pins, swap, feedback chips and context factors. It exports to Spotify, M3U8, Traktor and Rekordbox, and keeps a saved-nights History. The Booth player already has fades, gaps, a loudness target (`loudnessTargetLUFS`), a meter, a clock card, a screen wake lock and "next" cards. It does not yet have headphone cue, measured per-track loudness, a request queue, rooms or offline mode. Those are on the roadmap.

---

## 1. Tango-specific tools

| Tool | Target user | Features relevant to TDJ | Pricing | Platforms |
|---|---|---|---|---|
| **TangoDJ** (tangodj.app, Bukdu Group) [W] | Working milonga DJs who own files | Auto-tag and Library Wizard to clean tags. A **Recordings Catalog** matches historical recordings against your collection. A **tanda manager** works at tanda level (add/move/copy whole tandas) with a one-click overview of the night's flow. It **tells you whether you need more or fewer tandas to hit your target end time**. Automatic loudness levelling, per-track EQ and VST applied automatically, automatic cortina fade-out and consistent gaps, a parametric EQ and spectrum analyser, a tempo tool, MIDI mapping. **Mobile and Watch companion** remotes. An **Info Display** window shows the audience what is playing. Imports from VirtualDJ, foobar2000, AIMP, Mixxx, Apple Music and M3U. Works offline. | $199 one-off; one machine at a time | Windows, macOS |
| **TandaBuilder** (Jan Tumpach) [W] | Mac DJs, from beginners to pros | **Two independent players** (headphone pre-listen plus live). Native CoreAudio routing. Drag-and-drop tandas with automatic cortina placement. One-click **tanda generator** (advanced controls in Pro). **Milonga history: what was played, when and how the floor responded**, which can be rearranged afterwards. Playlist import from Music, Deezer and Spotify, with each track marked **owned / missing / uncertain**. Enrichment from MusicBrainz and AcoustID; BPM and key detection. Pro adds **Automatch**, a **pre-flight check before the night** and synced lyrics. The Live player shows the cover and lyrics in large type. 29 UI languages. **Buddy** app (iPhone/Android) syncs tandas and streams the library. The site also has a Camelot wheel, track identifier, Flavor Map, orchestra profiles and a DJ ear trainer. | Free tier; Pro €49.99 lifetime or subscription; 14-day trial | macOS; Buddy on iOS/Android |
| **El Eje Player** [W] | Golden-age DJs with file libraries | Watched folders, accent-insensitive search ("di sarli 1944", "calo milonga"), **smart playlists** with rules on orchestra, singer, genre, year and lyrics. **Groups duplicate transfers and picks the best version.** Imports VirtualDJ, Traktor and Music tags and cue points. Tandas name themselves and can be saved to a **reusable tanda library** filed by orchestra and genre, then locked. Cortinas have adjustable fade. **Live mode** enforces a cortina between tandas, locks finished tandas and blocks quitting while playing. **Guardrails** flag mixed genre, a short tanda (3/4) and a missing cortina. **Preview deck** on headphones with waveform and saved Load / Fade-in / Fade-out cues. Key detection in Open Key notation, BPM, tempo 70-130 % with pitch held. Per-song EQ, "Normalize loudness", a **low-pass to reduce hiss on old transfers**. Undo and background backups. Synced lyrics with translation, a lunfardo dictionary, encyclopedia, performance and exhibition sections, a second-display video/lyrics window. Web tools: Tanda Builder, **EQ Lab** (room and transfer EQ) and an energy/flow guide. | Private beta; price not stated | macOS (iPhone remote "coming soon"); Chrome extension |
| **Play! El Recodo Tango** [W] | Dancers and learning DJs | Listening insights during playback (orchestras, musicians, style). Explore by orchestra, singer or era. **Tango Scan identifies a recording from a short audio sample.** Tanda mode and "My Tandas". "For Dancing" and "Chronology" modes. **Other versions of the track you are hearing.** Offline mode, lyrics translation, favourites and sharing. | Free | iOS, iPadOS, (macOS on Apple silicon) |
| **El Recodo** (web database) [K] | DJs, researchers | Recording database with orchestras, singers, dates and composers, plus suggested tandas. Many DJs use it as their reference for tanda building. | Free / donation | Web |
| **tango.info** [W/K] | Archivists, DJs | Discographies, works, performers and releases. **TINT** track identifiers (barcode + disc + track) so DJs can swap playlists that resolve against their own rips [W]. Already on TDJ's Phase 4 for import from links. | Free | Web |
| **TANGO-DJ.AT** [W] | Serious collectors and DJs | Database of about 110k transfers with sound samples. **Compare transfer quality across releases.** Members can correct and complete metadata. Sells LP/78 transfers and CDs. | Annual membership (price not public on the landing page) | Web |
| **TangoTunes** [K] | DJs buying golden-age files | Store of restored golden-age transfers with complete, consistent tags (orchestra, singer, recording date, genre). A common "clean source" for DJ libraries. This round's search found no TangoTunes DJ app. | Per track/album | Web store |
| **TandaMaster** [W] | Linux DJs | No playlists, only "play trees" of tandas. **Precise gaps that account for detected leading and trailing silence.** **Lock mode** blocks pause and skip during a tango, and order can only change during a cortina, which fades out gracefully if interrupted. ReplayGain. **Remaining milonga time.** **Printed A4 song sheets.** **Class mode** stops after N songs. | Free, open source (PyPI) | Linux (in principle cross-platform) |
| **TangoPlayer 1.6.8** [W] | Windows DJs (older) | Portable player with two sound cards (main plus pre-listen). | Free | Windows |
| **Embrace** (Ricci Adams) [W] | Social-dance DJs (blues, swing, tango) | Plays a single set list **with no glitches or accidental interruptions**. Shows track end times, "stop after this song", automatic gaps, graphic EQ, stereo panning. Works with the Music app library. Popular with tango DJs for its simplicity [K]. | $14.99 (also open source on GitHub) | macOS |
| **foobar2000 tango setups** (Simba Tango, ingeniero-tango) [W] | Windows DJs who customise | Two instances: one to browse and pre-listen, one live. Columns UI with a column of **pre-made tandas**. Query filters (genre + date + BPM), volume control, gaps, logging of what was played. foo_preview for previews. | Free | Windows (mac beta) |
| **MediaMonkey tango setups** [K] | Windows DJs with big tagged libraries | Rule-based auto-playlists from tags (orchestra, singer, year, genre). Scripts for gaps and cortina fades. Play history. Not tango-specific out of the box. | Free / Gold one-off | Windows, Android |
| **Mixxx used for tango** [W] | DJs who want free, open-source software | **AutoDJ with a negative fade, which makes a gap** (but then cue points are ignored). Headphone PFL, a preview deck, history, BPM and key detection, ReplayGain normalisation, recording. Tango DJs use genre codes and a "milonga suitability" rating. | Free, open source | Win, mac, Linux |
| **djay Pro used for tango** [W] | Some tango DJs | One self-described tango DJ chose it as "meeting most needs" and knew of no DJ software designed for tango (forum post). | see below | |
| **"Tango DJ Assistant", "MilongaDJ", "Tandas & Cortinas" apps** | — | No current product under these names was found this round. Tango+ (iOS) is a listening app with no DJ features [W]. TangoApp is an event guide [W]. | — | — |
| **Spotify tango playlist tools** [W] | Spotify DJs | No dedicated Spotify tanda/cortina builder was found. DJs share playlists, and generic generators exist (spotgen, Cadence). **This is TDJ's open lane.** | — | — |
| **Song-request apps (Thank You DJ)** [W] | Event DJs | Guests search and request; a repeat request counts as an upvote. Not tanda-aware. | Freemium | Web/mobile |

## 2. General DJ and music apps

| App | Target user | Features relevant to TDJ | Pricing | Platforms |
|---|---|---|---|---|
| **djay Pro** (Algoriddim) [W/K] | Mobile-to-pro DJs | **Automix** (AI transitions), Neural Mix stems (not on Spotify or Apple Music streams), Spotify catalogue mixing with **in-app Spotify playlist editing** (2026). Also Apple Music, TIDAL, SoundCloud and Beatport streaming. Headphone split cue on one output [K]. | Free; PRO about $7/month [K] | iOS, iPadOS, macOS, Windows, Android |
| **rekordbox 7** (AlphaTheta) [W] | Club DJs on Pioneer gear | **Intelligent Playlist** (rule-based), **Related Tracks**, **Collection / Streaming Radar** (AI suggestions by key, BPM and mood), Cloud Library Sync and playlist sharing, MyTag, auto gain [K], history playlists [K], Column View. | Free plus subscription (Core/Creative/Professional) | macOS, Windows, iOS |
| **Serato DJ Pro** [K] | Club and mobile DJs | Crates and **Smart Crates**, **History with export** (CSV), Serato Playlists (live online tracklist), Autoplay, streaming (TIDAL, Beatport, SoundCloud, Apple Music), stems, prepare mode. | Lite free; Pro about $249 or monthly | macOS, Windows, iPad |
| **Traktor Pro 4** (NI) [K] | Club DJs | Smart playlists, stems, Flexible beatgrid, history/archive, Beatport and Beatsource streaming, controller ecosystem. | about $149 | macOS, Windows; Traktor DJ iPad |
| **Engine DJ** (inMusic) [K] | Standalone-hardware DJs | Desktop prep for Denon/Numark units, Smart Crates, history, streaming (TIDAL, Beatport, SoundCloud, Dropbox), Engine Cloud sync. | Free | macOS, Windows, standalone hardware |
| **VirtualDJ** [W/K] | Mobile and event DJs | Automix with **"remove silence"** and a negative fade length for an exact gap. POI editor for mix-in and mix-out points. **Sandbox** (pre-listen a transition in headphones while the room plays the main deck) [K]. Remote app. Auto-gain, tracklist history, karaoke and video. | Home free; Pro about $299 or $19/month [K] | macOS, Windows, iOS |
| **Mixxx** [W/K] | Free and open-source DJs | AutoDJ (fade, gap via negative fade), preview deck, PFL, ReplayGain, BPM and key, history, crates, recording, controller mapping. | Free | Win, mac, Linux |
| **Spotify** [W/K] | Everyone | **Mix**: per-transition presets (Fade, Rise, Blend), a smooth crossfade option, **BPM and key shown per track** [W]. **AI DJ with voice and text requests**, and from Nov 2026 commentary can be switched off [W]. **Jam**: a live shared queue where guests add songs [K]. Collaborative playlists, Blend, Smart Shuffle, normalise volume, crossfade, offline downloads, Spotify Connect remote [K]. A personal licence does not cover public performance [K]. | Premium | All |
| **Apple Music** [W/K] | Everyone | **AutoMix** (tempo/key-aware transitions with beat matching and time stretch), with crossfade/off in Settings, over AirPlay from iOS 26.1 [W]. Sound Check (loudness), collaborative playlists, SharePlay, lossless, offline [K]. | Subscription | Apple platforms, Android, web |
| **TIDAL** [K] | Audiophiles and DJs | Lossless and hi-res. **The DJ Extension** licenses streaming *inside* DJ apps (djay, Serato, rekordbox, VirtualDJ). Track radio, offline. | Subscription | All |
| **Plex / Plexamp** [W] | Self-hosted libraries | **Sweet Fades** (it decides the fade point from the end of one track and the start of the next), **EBU R128 loudness levelling**, sonic analysis, **Guest DJ** (inserts sonically similar tracks), Sonic Sage/ChatGPT playlists, offline downloads. | Free core; Plex Pass for sonic features | All |
| **Roon** [K] | Audiophiles with large libraries | Rich credits metadata (composers, lyricists, performers), Focus filters, Radio continuation, DSP volume levelling, multi-zone, ARC remote. | about $15/month or lifetime | macOS, Windows, Linux core, mobile remotes |

---

## 3. Patterns that matter for a milonga DJ

1. **Two outputs, always.** Every serious tango player has pre-listen on a second device: TandaBuilder, El Eje, TangoPlayer, foobar setups, VirtualDJ, Mixxx. TDJ has it planned. It is the first thing a booth DJ checks.
2. **Booth safety.** El Eje Live mode, TandaMaster lock mode and Embrace's "no accidental interruptions" all solve the same fear: one click stops the floor. TDJ can match this cheaply.
3. **The audience screen.** TangoDJ's Info Display and TandaBuilder's large-type Live player show dancers the orchestra, singer and year. Dancers want to know "what tanda is this and which song are we on".
4. **The night as it was played.** TandaBuilder records what played, when and how the floor responded. Serato, rekordbox and Mixxx keep history. TDJ's History stores composed plans, not timestamps from the booth.
5. **Owned / missing / uncertain.** TandaBuilder and TangoDJ both reconcile a playlist with the DJ's own files. TDJ's local-file matching (Phase 3) is the same need.
6. **Transfer quality.** El Eje, TANGO-DJ.AT and TangoTunes all treat "which transfer" as a first-class field. This is planned in TDJ Phase 1 (transfer tier).
7. **Composing is rare.** Only TandaBuilder has a one-click generator, and none composes a full arc-aware night, explains it, or exports to Spotify. That is still TDJ's edge and should stay the centre.

---

## 4. Feature ideas for TDJ, ranked

**Value** is to a milonga DJ, 1-5. **Effort**: S ≤ 2 days, M 3-7 days, L 2-4 weeks. **Rank** comes from value ÷ effort (S=1, M=2, L=3), with ties broken by booth risk.
**Roadmap**: ✅ already on `docs/ROADMAP.md`; ◑ partly there (the gap is noted); ✚ new.
**Where**: Compose / Player / Music (database/library) / Settings / Rooms.
Per the ROADMAP rule, every item that is an indicator, rule or automation gets an on/off switch in Settings. Any engine rule (for example #8) needs a vitest invariant first and must keep the golden set ≥ 85.

### Top 15

| # | Idea | What it is | Who has it | Why it matters | Where | Value | Effort | Roadmap |
|---|---|---|---|---|---|---|---|---|
| 1 | **Live lock (booth safety)** | While a tango plays: pause, skip and seek need a hold or confirmation. Order can only change during a cortina, and an interrupted cortina fades out gracefully. Closing the tab triggers a `beforeunload` warning. A clear "LIVE" state. | El Eje Live mode, TandaMaster lock mode, Embrace | A single mis-tap that stops the floor is the worst booth failure. Cheap to build; wake lock already exists. | Player, Settings | 5 | S | ✚ |
| 2 | **Pre-flight check** | One "Ready for tonight?" screen. Every track resolves and plays (Spotify Premium or file), durations are real, loudness has been analysed, every tanda has a cortina, there are no duplicate sides, the output device is chosen, the cue device is present, the night fits its end time, and there is an offline cache. Each failure links to a one-tap fix. | TandaBuilder Pro pre-flight, El Eje guardrails | Turns "trust the app" into evidence 10 minutes before doors open. Reuses checks TDJ already has (cohesion, rules, benchmark). | Player (entry), Compose | 5 | S-M | ✚ |
| 3 | **Headphone pre-listen** | Cue any song or the next tanda on a second output (`setSinkId`), with an unmistakable room-vs-headphones UI and separate volume. | TandaBuilder, El Eje, TangoPlayer, VirtualDJ, Mixxx, djay | The basic booth expectation; DJs will not switch from another app without it. | Player | 5 | M | ✅ §1 |
| 4 | **Audience "now playing" display** | A full-screen, high-contrast view for a TV or projector, plus a link or QR code dancers can open on their phones. It shows the orchestra, singer, year and rhythm, "song 2 of 4", "next: vals", and "cortina" during cortinas. Artwork is optional, and nothing is shown that the DJ hides. | TangoDJ Info Display, TandaBuilder Live player, El Eje second display | Dancers count songs and want to know the orchestra. Organisers love it. It builds on Rooms (share code) and artwork (§12). | Player, Rooms | 5 | M | ✚ |
| 5 | **Measured loudness and per-track gain** | Measure EBU R128 integrated loudness per side (on preview or file) and store it in the cache. Apply gain toward `loudnessTargetLUFS`, with a per-track trim the DJ can override and a limiter. Use a different default target for cortinas. | TangoDJ, Plexamp, Mixxx, TandaMaster (ReplayGain), rekordbox auto gain, Apple Sound Check | 1930s transfers and modern cortinas differ by 6-10 dB, so riding the fader all night is the second most common booth complaint. | Player, Music, Settings | 5 | M | ◑ (target exists; "gain" in §3 scrape; no measured per-side gain) |
| 6 | **Silence-aware gaps and auto-trim** | Detect leading and trailing silence and surface noise, so the gap between songs is exact (for example 2.0 s of real silence). The DJ can then adjust with the waveform cues already planned. | TandaMaster, VirtualDJ "remove silence", Plexamp Sweet Fades | Uneven gaps make dancers think the tanda ended. Ragged 78-rpm tails are common. | Player | 4 | S-M | ◑ (§1 per-song trim/waveform is manual only) |
| 7 | **Played-night log** | During Booth playback, record the real start time of each song, skips, swaps and requests, plus a one-tap floor rating per tanda (full / ok / empty). Afterwards: an annotated timeline, CSV / tracklist export, and "send to History". It feeds learning (§5). | TandaBuilder milonga history, Serato/rekordbox/Mixxx history, foobar logging | It is the DJ's memory of what worked. Organisers ask for set lists, and it is the best training signal TDJ can get. | Player, History, Rooms (log) | 4 | S-M | ◑ (History stores plans; Rooms log is about edits) |
| 8 | **Repetition guard across nights** | For a named venue or series, avoid repeating the same tandas, opener or Cumparsita from the last N nights, with "last played here 2 weeks ago" chips. | Implied by TandaBuilder history; El Eje tanda library | Weekly milonga regulars notice repeats. TDJ already has seed variety, but it is not tied to a venue. | Compose, Settings | 4 | M | ✚ |
| 9 | **Target end-time planner** | Show "+2 tandas needed" or "−1 tanda to finish at 02:00", re-plan the unplayed tail to land on time, and run a live countdown to La Cumparsita. | TangoDJ, TandaMaster remaining time | Organisers set hard end times, and real durations drift from the plan. | Player, Compose | 4 | S | ◑ (§2 clock view "we are here"; no "tandas to add/remove") |
| 10 | **Tanda-aware dancer requests** | Dancers open a QR link and request an orchestra, singer, style or song. Requests pile up as votes, and the DJ accepts or declines. An accepted request is placed into the next fitting slot by rhythm and energy, never mid-tanda. | Spotify Jam / AI DJ requests, Thank You DJ | Requests happen anyway, verbally. Making them tanda-aware protects the structure. | Rooms, Player | 4 | M | ✅ §2 Phase 2 (request queue) — extend with a dancer link and votes |
| 11 | **Owned / missing / uncertain reconciliation** | Match a composed night to the DJ's files, a Music app library or a Spotify library. Mark each side owned / missing / uncertain, offer the nearest owned alternative, and export only what plays. | TandaBuilder, TangoDJ Recordings Catalog | File DJs cannot use a plan full of sides they do not own. This is the bridge to booth use with local files. | Music, Compose, Settings | 5 | L | ✅ Phase 3 (local-file matching) |
| 12 | **Reusable tanda library** | Save any tanda (named after its music, filed by orchestra and rhythm). Drop it into a night as a pinned tanda, and reuse it in Compose and in manual building. | El Eje tanda library, foobar "pre-made tandas" column, Play! "My Tandas" | DJs think in proven tandas. TDJ has pins per night but no library that persists across nights. | Compose, Music | 4 | S-M | ◑ (pins/locks exist) |
| 13 | **Phone remote** | Join the room code on a phone or watch to see now/next, skip to the next tanda, extend or shorten the cortina, fade now, and Jump to Cumparsita, with the live lock respected. | TangoDJ Mobile and Watch companion, TandaBuilder Buddy, El Eje iPhone remote, VirtualDJ remote, Spotify Connect | DJs dance, too. Lets the DJ leave the laptop without losing control. | Rooms, Player | 4 | M | ✚ (Rooms §12 covers co-editing, not control) |
| 14 | **Stop-after and class/práctica modes** | "Stop after this song / tanda / cortina". The end time of the current track is shown. Class mode plays N songs with no cortinas and loops a song for a teacher. | Embrace, TandaMaster class mode, El Eje performance sections | Classes and shows before a milonga are routine. These are tiny features that avoid hacks. | Player | 3 | S | ✚ (práctica exists only as a context factor) |
| 15 | **Transfer and room EQ presets** | A per-transfer EQ preset (for example a hiss low-pass for acoustic-era sides), a per-venue room EQ, and an A/B preview. The preset is stored per side and per venue. | El Eje (per-song EQ, low-pass, EQ Lab), TangoDJ (per-track EQ/VST, parametric EQ) | Old transfers sound harsh on big PAs, and DJs EQ per venue. Web Audio makes it cheap. | Player, Music, Settings | 3 | M | ✚ |

### Further ideas (ranked lower)

| # | Idea | Who has it | Why | Where | Value | Effort | Roadmap |
|---|---|---|---|---|---|---|---|
| 16 | Synced lyrics with translation (Music, and the audience display) | El Eje, TandaBuilder Pro, Play! | Dancers and DJs love knowing what the vocal tango says; Turkish/English translations fit §7. | Music, Player | 3 | M | ✚ |
| 17 | Rule-based smart playlists ("Di Sarli 1940-45 vocal tangos not played in 4 weeks") | El Eje, rekordbox Intelligent Playlist, Serato/Engine Smart Crates, MediaMonkey | Fast browsing in manual mode; complements the search panel. | Music, Compose | 3 | M | ◑ (§2 search panel) |
| 18 | "Other versions of this song", playable | Play! El Recodo, rekordbox Related Tracks | Picking the right version is core DJ craft. | Music, Compose | 4 | S-M | ✅ §3 |
| 19 | Live next-song suggestions while building by hand | rekordbox Collection Radar, Plexamp Guest DJ | Keeps a manual builder inside the rules. | Compose | 4 | M | ✅ §12 |
| 20 | Rotation analytics (orchestra share across nights, "not played in N weeks", most-requested) | Serato/rekordbox history, TandaBuilder history | Keeps a weekly DJ fresh and balanced; builds on #7. | Music, History | 3 | M | ✚ |
| 21 | Audio identification ("what is this recording?" from the mic) | Play! Tango Scan, TandaBuilder track identifier | Learn from other DJs' sets; identify untagged files. | Music | 3 | L | ✚ |
| 22 | Tag-fix export: write orchestra/singer/year/genre tags back to the DJ's files (or a CSV/foobar-style script) | TangoDJ Auto-tag and Library Wizard, El Eje "Update metadata" | Lifts the TDJ index into the DJ's existing software. | Music | 3 | M | ✚ |
| 23 | Library import from VirtualDJ / Traktor / Mixxx / foobar / Music, including cue points | El Eje, TangoDJ | Lowers the cost of switching; keeps the DJ's trims. | Music, Settings | 3 | L | ◑ (Phase 3 lists Engine import only) |
| 24 | Key notation toggle (Open Key / Camelot / musical) | El Eje Open Key, TandaBuilder Camelot, rekordbox | DJs from other genres read Camelot. | Settings | 2 | S | ◑ (§1/§2 key indicators) |
| 25 | Output device chooser with multi-channel interface routing | TandaBuilder CoreAudio, TangoPlayer two cards | Booth interfaces (Scarlett, MOTU) expose outputs 3/4 for cue. | Settings, Player | 4 | S | ◑ (part of #3) |
| 26 | Spectrum/clip warning and a "too loud for the room" alert | TangoDJ analyser, El Eje mixer | Protects the PA and the dancers' ears. | Player | 2 | S | ◑ (meter exists) |
| 27 | Pitch-preserving tempo ±% | El Eje, TangoDJ tempo tool, all DJ apps | Rarely used in traditional milongas, but asked for in marathons and classes. | Player | 2 | M | ✚ |
| 28 | Keyboard and MIDI controller mapping (play/fade/skip/cue) | TangoDJ MIDI, every DJ app | Hardware buttons are safer than a trackpad in a dark booth. | Player, Settings | 3 | M | ◑ (§8 keyboard) |
| 29 | Undo history and backup/restore of the DJ's edits | El Eje | Builds confidence for heavy editing; works well with Rooms. | Settings | 3 | S-M | ✚ |
| 30 | Offline night (cache the index, plan and audio previews/files) | Play!, TandaBuilder, TangoDJ, Spotify downloads | Venue Wi-Fi fails. | Settings, Player | 4 | L | ✅ Phase 3 PWA |
| 31 | Shared or public tanda sets, imports from El Recodo / tango.info (TINT) | rekordbox playlist sharing, tango.info TINT, Spotify collaborative playlists | Community and trust. | Rooms, Music | 3 | M | ✅ Phase 4 |
| 32 | Orchestra "flavor map" (rhythmic ↔ lyrical × era) | TandaBuilder Flavor Map, El Eje energy guide | Teaches the arc visually; fits the Orchestras redesign. | Music | 3 | M | ◑ (§12 Orchestras tab) |
| 33 | Ear trainer / orchestra quiz in the Guide | TandaBuilder ear trainer, El Eje flashcards | Onboarding for new DJs; marketing. | Guide | 2 | M | ✚ |
| 34 | Licensing notice: Spotify/Apple Music personal plans do not cover public performance. Prefer owned files or venue licences; point to TIDAL DJ Extension-style licensed streaming [K] | — | An honest note avoids trouble for organisers. | Settings, Guide | 3 | S | ✚ |
| 35 | Record the night's master output | Mixxx, VirtualDJ | For the DJ's own review; low priority. | Player | 1 | M | ✚ |

### Already covered by TDJ (no action)
Cortina families with fades and gaps (Booth), automatic tanda generation and arc (unique among competitors), per-track swap and locks (El Eje's tanda locks are equivalent), show/performance break, wake lock, era presets, export to DJ software, BYOK AI refine (Spotify AI DJ text requests are the general-music analogue).

---

## 5. Notes for the engineers

- #1, #2, #9 and #14 are S-sized and mostly reuse Booth state. They make a natural single worktree ("booth trust").
- #4 and #13 both need a read-only, live room channel. Build them on the Rooms transport from §12 rather than inventing a second one.
- #5 and #6 share one analysis pass (decode a preview or file, compute R128 and silence bounds, write to the cache next to BPM). Do them together with the Phase 1 BPM job.
- #8 is an engine rule. Following `docs/TDD.md`, write the vitest invariant first ("no tanda from the last N nights at venue V when alternatives exist") and keep the 4 h golden set ≥ 85.

## Sources

- TangoDJ: https://tangodj.app · https://www.producthunt.com/products/tangodj
- TandaBuilder: https://tandabuilder.com · https://alternativeto.net/software/tandabuilder/about/
- El Eje Player: https://el-eje.pages.dev/eleje-player-guide · https://el-eje.pages.dev/tools.html · https://el-eje.pages.dev/energy.html
- Play! El Recodo Tango: https://apps.apple.com/app/id6744903250
- TandaMaster: https://pypi.org/project/tandamaster/
- TangoPlayer: https://www.majorgeeks.com/files/details/tangoplayer.html
- Embrace: https://github.com/iccir/Embrace · https://www.macupdate.com/app/mac/57588/embrace
- foobar2000 tango setup: https://ingeniero-tango.blogspot.com/2012/06/dj-setup.html · https://github.com/grimes2/foo_preview
- Mixxx for dance DJs: https://ix5.org/tech/2016/mixxx-reference · https://hackmd.io/s/B1-oYmaOx
- tango.info TINT: https://mailman.mit.edu/pipermail/tango-l/2008-March/007461.html
- TANGO-DJ.AT: https://tango-dj.at · https://tango-dj.at/shop/members
- Thank You DJ: https://www.producthunt.com/p/thank-you-dj/thank-you-dj
- Spotify Mix: https://techcrunch.com/2025/08/19/spotifys-latest-feature-lets-you-add-your-own-transitions-to-playlists · https://alternativeto.net/news/2025/8/spotify-adds-custom-playlist-mixes-with-song-transitions-for-premium-users
- Spotify AI DJ requests: https://www.musicbusinessworldwide.com/spotify-adds-text-input-and-spanish-requests-to-ai-dj/ · https://routenote.com/radar/?p=6056
- Apple Music AutoMix: https://9to5mac.com/2025/06/16/automix-apple-music-ios-26/ · https://routenote.com/blog/apple-music-automix-airplay-update/
- Plexamp: https://forums.plex.tv/t/customizable-sweet-fade-db-level/885721 · https://www.plex.tv/en-au/blog/super-sonic-get-closer-to-your-music-in-plexamp/
- rekordbox 7: https://rekordbox.com/en/2024/02/rekordbox-ver-7-beta · https://www.digitaldjtips.com/rekordbox-7-public-beta/
- djay Pro: https://www.algoriddim.com/features · https://www.algoriddim.com/djay-pro-mac/releasenotes
- VirtualDJ Automix: https://autoupdate.virtualdj.com/wiki/AUTOMIX.html · https://virtualdj.com/forums/217799/General_Discussion/Need_a_standard_2_second_gap_between_each_of_my_songs.html
- Tango DJ practice (requests, counting songs): https://book-tejas-music.readthedocs.io/en/latest/deejays/play-for-milongas.html · https://todotango.com/english/history/chronicle/483/Tango-Djing-Part-2:-Tanda-construction
