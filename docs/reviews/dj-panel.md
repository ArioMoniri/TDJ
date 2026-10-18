# TDJ DJ panel review — four booths, one backlog

*Panel: a Buenos Aires traditional milonga DJ, a European marathon DJ, an Istanbul milonga DJ, an alternative/neo DJ, and a product manager who wrote the backlog from their notes. Reviewed in October 2026: `README.md`, `docs/ROADMAP.md`, `docs/reviews/dj-review.md`, `docs/reviews/ux-review.md`, `apps/web/src/components/*.tsx`, `apps/web/src/app/**/page.tsx`, `packages/core/src/types.ts`, the exporters in `packages/core/src/export/index.ts`, the store in `apps/web/src/lib/store.ts`, and the eleven captures in `media/screenshots/`. Nothing but this file was written.*

**Where the product stands, in one paragraph.** The engine's skeleton is correct and the previous DJ review already explained, tanda by tanda, why the music inside it is not yet booth-grade (1950s warm-ups, vals últimas, identical tandas across seeds, 170-second tracks, a self-score of 89–91 on every run). This panel took a different angle: each of us tried to use TDJ for a real event we are playing this month and wrote down where it helped, where it stopped us, and what we had to leave the app to do. The pattern is the same in all four booths. TDJ is a *planner* that cannot yet be a *booth tool*: it cannot play a bar of anything, it does not know what time it is, it forgets our edits the moment we press Compose again, it carries one person's opinions about orchestras and cortinas that we cannot change, and it exports files that every DJ app marks as missing. Every one of those is fixable, and most of them are small. The backlog below is ordered so the first ten items turn TDJ from a demo into something one of us would actually open at 23:40.

---

## 1. Booth walkthroughs

### 1.1 Buenos Aires traditional — Saturday milonga, Villa Crespo, 22:00–03:30, ~180 dancers, show at 01:00, two birthdays

I set the slider to 5.5 h, left *Golden Age 35–55*, *Classic · two peaks*, *Hammock (BsAs)*, and pressed Compose. Forty seconds later I had 29 tandas on screen with cortinas and a Cumparsita. That part is genuinely nice: the cycle is clean, no tanda mixes singers, no vals touches a milonga, and the cards read well. The *Hammock* shape being there at all tells me someone talked to a porteño.

Then the night as it will actually happen started to leak through.

**What I would love.** The energy curve is a good conversation with myself; I have never seen my own arc drawn before. The lock icon on every card is exactly the gesture I want. The "Same seed" button is the right idea (recompose but keep the night recognisable). The Library search finds "di sarli rufino" and gives me the years, which is what I check twenty times a night.

**What breaks my flow.**

1. *Nothing I do survives a recompose.* I locked tanda 9 (a Di Sarli/Rufino I liked), changed the cortina culture to add Latin, pressed Compose, and tanda 9 was gone. `lock()` in `Composer.tsx` only toggles a flag that disables the swap button; `/api/compose` receives `options` only and never sees the playlist. In the booth that means I can never touch the plan after 22:00 without losing it.
2. *No clock.* My milonga starts at 22:00 and the show is at 01:00. The cards say "#17 · peak". I need "00:52–01:04" and I need to put a silent 25-minute block where the show goes, with a re-ramp tanda after it (post-show the floor needs D'Arienzo or Biagi, not what the arc happens to land on). There is no notion of a wall-clock anywhere in `types.ts` (`Slot.position` is a 0..1 fraction) and every track is 170 s, so even if I did the arithmetic on paper it would be wrong by half an hour.
3. *Vals de cumpleaños.* Two birthdays tonight. The vals de cumpleaños is a fixed object: one vals, announced, around 00:30, the room forms a circle. I need to pin "a vals, Di Sarli or Biagi, at 00:30" and have the plan bend around it. There is no "special" concept at all; the closest thing is swapping until a vals lands there, which also re-rolls everything else about that tanda.
4. *Cortinas hop genre every tanda.* In BA the cortina is a signal, not a mood. I pick one artist (this month it will be Sandro, in a traditional room it is often Louis Armstrong or Pérez Prado, with caution) and it runs all night. "Same all night" exists as an option but then it is literally one clip; "Matched to next tanda" gives me Tarkan, Sabrina Carpenter and a-ha on consecutive cards (screenshot 03). Neither is what a BA DJ does. The DJ review's "one family per night" is the right spec. Also "Bésame mucho" and "Quizás" as cortinas will get danced in my room; "Mambo No. 5" will get mambo'd.
5. *I cannot hear anything.* I do not know "Pedime lo que querés" by Canaro 1954 from memory; I would have to open Spotify in another tab, search, listen, come back. For 29 tandas times four tracks that is my whole afternoon. A 30-second preview inline on each track row would make the difference between "plan I trust" and "plan I re-check".
6. *The ending.* The última is announced and it is a tango, vocal, from one of the five orchestras everyone expects; then La Cumparsita; in many BA rooms a second Cumparsita by a different orchestra. TDJ gave me a Lomuto vals as última on one seed and the same D'Arienzo 1937 Cumparsita on every seed. The ending is a composed object and TDJ composes it by accident.
7. *Export.* My music is FLAC on a drive, played from a laptop. The Rekordbox XML pointed at `file://localhost/Carlos%20Di%20Sarli%20%2F%20Roberto%20Rufino%20-%20Corazón.mp3`, which does not exist; the slash in the artist is not even a legal filename. The printable set list is a `.txt` with "e62" next to each tanda. What I want on paper: clock, rhythm, orchestra/singer, years, four titles, cortina. Nothing else.

**What is missing for BA specifically.** A regional preset that actually does something (the Buenos Aires chip in Settings is stored and never read); tanda of chacarera/folklore (a "special" with a different rhythm set, not in `DanceRhythm`); a sorteo/announcement pause; two-Cumparsita ending; default cortina length 30 s not 45; the ability to say "no Pugliese tonight, the organiser asked" (there is `excludeOrchestras` in `ComposeOptions` but no UI for it); and a per-venue memory ("you played this Troilo tanda here two weeks ago").

**Would I use it this Saturday?** For the first draft on Thursday afternoon, yes, gladly. In the booth, no: I would print it and then ignore it from the first request on, because the app cannot follow me.

### 1.2 European marathon — Saturday 02:00–06:00 slot, 300 dancers, hand-over from another DJ, no Cumparsita (I am not the closer)

Marathon DJing is a different sport. There is no warm-up: the floor is full when I take over, it has been dancing for 28 hours, and it will be full when I leave. The job is to keep a plateau for four hours while not repeating what the last three DJs played, and then hand the floor to the next DJ warm, not cooled down.

I set 4 h, *Marathon plateau*, *Flat* shape, cortinas *Same all night* at 30 s, and unchecked *Close with La Cumparsita*. Good: the option is there. Then the result.

**What I would love.** The plateau arc exists as a concept. `orchestraRepeatGap` and `singerRepeatGap` exist in the types. The arc chart with the dashed target line immediately showed me the problem I already knew from the DJ review: the engine under-shoots the plateau by 15–22 points because the only orchestras that reach 80 are rationed by the gap rule. That is honest and useful; it told me where I will have to intervene.

**What breaks my flow.**

1. *No hand-over input.* The previous DJ's set is the single most important input to mine. I need to paste or import "what was played in the last 4 h" (a text list, an M3U, a TDJ JSON) and have those orchestras, singers and titles count against the spacing and repeat rules of my plan. Today there is no way to tell TDJ anything about the night before my slot; it thinks the world started at tanda 1. The roadmap mentions a "what I played" export; the import side matters more.
2. *The arc starts at warm-up regardless.* Even on *Marathon plateau* the first two tandas were in the 50s with "warmup" labels. For a hand-over slot the first tanda should be at the plateau and should be a safe, famous tanda (Troilo/Fiorentino or D'Arienzo/Echagüe), because the floor needs to know in eight bars that a new DJ is competent.
3. *Cortinas at a marathon are 20–30 s and often instrumental*; some marathons are cortina-free (continuous). The slider minimum is 20 s, good; the pool has no "instrumental only" filter and the `tags` field is there but not used by the UI.
4. *Vals/milonga ratio.* Many marathons run TTVTTM, but some organisers ask for fewer milongas late at night (TTVTTTM) and some encuentros want more vals. `pattern: "custom"` with `customPattern` exists in the types; the UI exposes neither.
5. *Locked tandas are the plan.* At a marathon I rebuild the second half of my slot twice during the first half based on what I see. The flow is: lock the first six, "re-plan from here", lock three more, re-plan. With locks that do not survive and no "played up to here" pointer this is impossible.
6. *Duplicate recordings.* The catalog is a discography: "Pájaro ciego" 1941 appears three times, D'Arienzo's Cumparsita 1937 appears under two albums. Across a weekend with five DJs the real risk is playing the same *recording* twice, and the app cannot even tell me when it has listed the same recording twice itself.
7. *Exports for Traktor* (what I and most marathon DJs run) have `VOLUME=""` and a `FILE` containing `/`, so Traktor shows a red "!" on every entry. I would have to rebuild the playlist by hand from the text, which is what I do today without TDJ.
8. *Offline.* Marathon venues are sports halls with no Wi-Fi. TDJ is a Next.js app that calls `/api/compose`, `/api/swap`, `/api/search` for everything. If the page is open when the Wi-Fi drops I can still read it; I cannot swap a tanda. The roadmap lists PWA offline in Phase 3; for marathon use it is a Phase 1 item.

**What is missing for the marathon circuit.** Event-type presets (marathon slot: no warm-up, no cool-down, no Cumparsita unless closer, 30-s cortinas, plateau from tanda 1, hand-over import); "Simpler rhythm" and "Calmer" re-plan buttons for the 05:00 hour, when the plateau has to drop 10 points without anyone noticing; a hand-over export at the end of my slot that the next DJ imports in one tap; transfer-tier tagging, because at a marathon with a serious sound system a 2008 compilation rip of Biagi next to a TangoTunes transfer of the same track is audible from the bar.

**Would I use it this month?** As a pre-planner to check my own orchestra spacing, yes. In the slot, no, for the same reasons as BA plus the hand-over problem.

### 1.3 Istanbul — Friday milonga, Kadıköy, 21:00–01:30, 120 dancers, mixed levels, rain forecast

Istanbul milongas are younger and louder than BA and more traditional than Berlin: TTVTTM, D'Arienzo and Biagi carry the room, the cortina is Turkish pop and people sing along to it, and the last hour often opens up to a Pugliese tanda and, in some rooms, one nuevo tanda before the Cumparsita. October means rain, which means 20 % fewer people and a later start.

I set 4.5 h, *Golden Age*, *Classic · two peaks*, cortinas *Matched*, cultures *Turkish* + *Global*, *Trend songs*.

**What I would love.** TDJ is, as far as I know, the only playlist tool that has the word "Turkish" in it. Tarkan "Şımarık" and Mor ve Ötesi "Cambaz" on the cards made me smile; those are real Istanbul cortinas and the room will clap. The culture multi-select is the right model. The mobile layout is what I actually use at the table (I DJ from a laptop but check the plan on my phone), and it is readable.

**What breaks my flow.**

1. *The Istanbul region chip does nothing.* `settings.region` is persisted in `UserSettings` and `compose()` never reads it. I expected Istanbul to mean: 30-s cortinas, Turkish + global pool, energy centred a little higher, Pugliese allowed from 60 %, optional nuevo tanda before the close. It changed nothing on screen and the app did not tell me it changed nothing.
2. *The Turkish pool is thin and one entry is embarrassing.* The DJ review already flagged "Mezdeke-style Oriental" as a placeholder; I will say it louder: if that ever plays in Kadıköy I lose the room's respect for the night. Delete it. The pool needs Barış Manço, Ajda Pekkan, Sezen Aksu's up-tempo songs, MFÖ, Athena, Duman, Edis, Zeynep Bastık for the trend side. With six Turkish clips, "Matched" repeats "Şımarık" three times in four hours.
3. *I cannot add my own cortinas.* My cortina folder is mine; every Istanbul DJ has a slightly different one, and that difference is part of our identity. There is no way to add a clip, set its cue-in (the good 35 seconds of "Cambaz" start at 0:41), or mark it "sing-along risk". `Cortina.startSec` exists in the type and is never set and never exported.
4. *No preview.* Half the "trend" global cortinas (Sabrina Carpenter, ROSÉ) I know; the Persian and Balkan ones I do not, and I would never play a cortina I have not heard. Same for tandas: a Caló/Barbé 1952 tanda means nothing to me until I hear track 1.
5. *Weather and crowd.* Rain tonight means the floor fills 40 minutes late. I would set "start 21:00, expect slow start, first dance peak 22:30" and let the warm-up stretch. There is no event context input of any kind; the only inputs are hours and musical options.
6. *Mixed levels.* Friday in Kadıköy has beginners until midnight. I keep the first ninety minutes rhythmically simple (D'Agostino/Vargas, Canaro/Maida, Rodríguez) and save Pugliese and Troilo 50s for after 00:00. The engine's "warm-up = low energy = 1950s lyrical" inversion is the opposite of what beginners need; the DJ review explains the cause (`songEnergy` baseline + era shift) and the fix (drive/weight axes).
7. *Copy in the booth.* "e60", "w8", "seed 23801646", "#9 · peak · 1945–1946". I read "Tanda 9 · vals · 23:52". Also "Headline marathon DJ" under a 90 is simply not true and makes me trust the rest less.
8. *Requests.* In Istanbul requests are constant and polite ("abla, bir Biagi?"). I need to type "Biagi" and see "next legal slot: tanda 14, 23:40, replaces De Angelis; gap OK". Today I would scroll 25 cards looking for a swap target.

**What is missing for Istanbul.** A working preset; a bigger, curated Turkish pool with cue-ins; one "nuevo/alternative tanda allowed in last hour" toggle; Turkish UI strings (most of my dancers would use this app in Turkish, and the DJ copy is small); a sing-along/clap tag on cortinas so I can choose a quiet one after a vals de cumpleaños.

**Would I use it this month?** For the cortina half of the night, almost; for the tanda half, as a second opinion on my own plan. The gap between "almost" and "yes" is the per-user cortina database and the preview.

### 1.4 Alternative / neo — Thursday "neo & nuevo" night, Berlin, 20:00–00:00, ~70 dancers, Piazzolla to electro-tango to non-tango

I am the outlier on this panel and I know it. My nights are 30 % golden age, 30 % nuevo (Piazzolla, Pugliese 60s, Sexteto Mayor), 40 % alternative (Gotan, Bajofondo, Otros Aires, Narcotango, Tanghetto, and non-tango: Portishead, Beirut, Agnes Obel, Nils Frahm). Tandas are 3 tracks, often two or three artists that share a mood, cortinas are either absent or 15-second stingers, and BPM/key matter more than orchestra identity.

I picked *Nuevo* then *All eras*, *Single peak*, *Rising*, cortinas *None*.

**What I would love.** `EraPreset` has `nuevo` and `contemporary`; `pattern` has `tango-only` and `custom`; `tandaShape: "rising"` exists. The engine clearly was designed with hooks for me. The energy arc is more useful to me than to the traditional DJs because my nights are *all* arc; the tango canon's conventions do me less work.

**What breaks my flow.**

1. *The catalog is a 2008 golden-age discography.* With *Nuevo* selected the engine still produced tandas from Pugliese 1950s instrumentals and Troilo 1960s, which are "nuevo" by date only. Gotan Project, Bajofondo, Otros Aires, Narcotango do not exist in `songs.json`. For my night TDJ composes nothing I can play. The fix is not to add my records to the repo; it is to let me import my own library (a folder scan or a CSV/M3U) and compose from *that*.
2. *"One orchestra per tanda" is a rule I need to switch off.* My tandas are by mood: three tracks at 60–66 BPM in minor keys from three artists. `OrchestraProfile` and `families()` make orchestra the unit of a tanda; I need "artist cohesion: strict / loose / off" and a "group by" of mood/BPM/key instead.
3. *BPM and key are the whole game* for alternative sets and the app has `Song.bpm` as an optional field that is never filled. The roadmap's in-browser beat detection on previews is exactly right; key detection matters almost as much (Camelot wheel for transitions). This is the one place I would accept a slow one-off batch job over my library.
4. *Cortinas as stingers.* Minimum cortina length is 20 s in the UI (`min={20}`); I use 8–15 s or none. Also my "cortina" is sometimes the first 20 s of the next track with a long intro. I need the field to accept 5 s and the export to write a cue, not a separate file.
5. *The Rhythm type has no room for me.* `DanceRhythm` is tango/vals/milonga; `Rhythm` has candombe and foxtrot but nothing like "neo", "electro", "non-tango", "alt-vals". I will tag my tracks myself if the per-user database lets me, but the cycle planner must accept a custom cycle alphabet ("N N A N V" where N is neo-tango and A is alternative).
6. *The score is meaningless for me* and it is still displayed as a 90 with "Headline marathon DJ". If rubric criteria do not apply (singer consistency, era span, Cumparsita), the honest display is "not scored" per criterion, not 100 % for criteria that were trivially met.
7. *Preview is non-negotiable.* I programme from listening. The Spotify embed is enough: 30-second previews without login, full tracks with a Premium login in the same browser. I would spend an hour in the app if it played.
8. *Exports.* I play from Traktor with Stems and I own every file. Give me real paths and I am done; the format itself is fine. Also: an export *without* cortinas is what I need nine nights out of ten, and the exporters have no such switch (`flatten()` always emits cortina rows).

**What is missing for alternative sets.** Own-library import as the primary catalog; mood/BPM/key as tanda cohesion dimensions; custom cycle alphabets; cortinas down to 5 s or off per tanda; per-criterion "not applicable" scoring; a Spotify/Apple Music resolver that resolves *my* titles, not golden-age ones; key detection.

**Would I use it this month?** Not for a neo night, because it cannot see my music. I would use the arc view and the energy model the day the catalog becomes mine.

### 1.5 Product manager's synthesis

Four booths, one list of blockers, in the order all four DJs hit them:

1. Edits do not survive (locks cosmetic, no "played up to here", no re-plan from here).
2. No listening (no previews).
3. No time (no clock, no real durations, no anchors for show/birthday/última).
4. Not mine (orchestra profiles, cortinas, song metadata and rules are repo files; no per-user layer, no import).
5. Exports point at files that do not exist, and cannot drop cortinas.
6. The score lies, and says so in large type.

Everything else (regional presets, requests, weather, AI providers, DJ-app connectors, offline, share links) sits on top of those six. The backlog is prioritised accordingly: P0 is the six above broken into shippable pieces; P1 is what makes a specific DJ say yes; P2/P3 is reach.

---

## 2. Consolidated feature backlog

Effort: S = ≤ 2 days, M = 3–7 days, L = 2–4 weeks. Priority: P0 = blocks booth use for every persona · P1 = blocks one persona or a whole region · P2 = clear value, not blocking · P3 = reach. "DJ" in a story means any of the four unless named. Component paths are where the change lands today.

### 2.1 Keep my edits (P0)

**B01 · Locks that survive recompose** · M · P0
*As a DJ, I want tandas I lock to stay exactly where they are when I press Compose again, so I can build a night incrementally.*
AC: `/api/compose` accepts `{ options, locked: Tanda[] }`; locked tandas are reserved in their slot index before planning; spacing and repeat rules treat locked orchestras/singers/titles as played; the response preserves `locked: true`; the energy curve shows a small padlock on locked dots; `Same seed` + locks reproduces the same unlocked tandas. Unit test: lock 3 of 22, recompose 10 seeds, the 3 are byte-identical.

**B02 · Three lock modes** · S · P0 (after B01)
*As a DJ, I want to lock a tanda's position, its orchestra, or its exact tracks separately.*
AC: Long-press/right-click on the lock gives *Lock tanda* (all), *Keep this slot's rhythm* (position only; re-roll contents), *Keep orchestra, re-roll songs*. The card border shows which mode (solid / dashed / dotted). Mode is in `Tanda.locked` as `"all" | "slot" | "orchestra"`.

**B03 · Track-level swap drawer** · M · P0
*As a DJ, I want to replace one track in a tanda in two taps with candidates that keep the tanda legal.*
AC: Tap a track row → side drawer "Replace track 3 of Di Sarli / Rufino" listing up to 12 candidates: same orchestra, same singer or instrumental, same period (B21), not yet in the set, not in the hand-over log (B19); each row shows title, year, duration, fame dots, a play button (B06) and a one-tap *Use*. Keyboard ↑/↓/Enter. Undo toast for 10 s. `/api/swap` accepts `{ playlist, index, track }`.

**B04 · "Played up to here" pointer and re-plan the rest** · M · P0
*As a DJ in the booth, I want to mark the tanda that is playing now and re-plan only what comes after it.*
AC: A *Now playing* marker on the card and the curve (tap the rhythm pill → "Playing now"); *Re-plan from here* recomposes tandas after the pointer with the same options, honouring locks; played tandas are immutable and greyed; the pointer persists in the store; the clock (B10) derives "we are here" from it.

**B05 · Undo / history** · S · P0
*As a DJ, I want to undo a swap or recompose I regret.*
AC: Store keeps the last 20 playlist states; ⌘Z / a toast *Undo* reverts; history list in a drawer with timestamp and what changed ("swapped tanda 7", "recomposed from tanda 12").

### 2.2 Listen before you commit (P0)

**B06 · Spotify embed preview per track and cortina** · M · P0
*As a DJ, I want to hear 30 seconds of any track or cortina in the plan without leaving the page.*
AC: Each track row and each cortina row has a play button; tapping it mounts a Spotify embed (`open.spotify.com/embed/track/{id}`, compact height, `theme=0`) under the row; only one embed plays at a time; no Spotify login or Client ID required for the 30-s preview; with a logged-in Premium session in the same browser the embed plays the full track. Resolution: Spotify URIs come from `data/cache/spotify` (enrich job) or, when the DJ has connected Spotify, from `resolveTrack()` on demand, cached in the per-user DB (B13). Rows with no resolvable URI show *No preview* and a link to the library search in Spotify. Keyboard: Space plays/pauses the focused row. Works on iOS (user-gesture initiated).

**B07 · "Audition the tanda" strip** · S · P0 (after B06)
*As a DJ, I want to hear the first 15 s of each of the four tracks in sequence to judge the opener and the flow.*
AC: A card-level *Audition* button plays 15 s of track 1, then 2, 3, 4, then 10 s of the cortina; a progress bar shows which; Escape stops. Uses the embed API's `seek`/`play` where available; where not, falls back to sequential 30-s previews with a *Skip* button.

**B08 · Cortina trimmer** · M · P0
*As a DJ, I want to set the cue-in and length of each cortina and have the exports carry those cues.*
AC: On a cortina row, *Trim* opens a waveform-less scrubber (start, length 5–90 s, fade-out 0–5 s) with preview playback from the cue (B06); values stored in `Cortina.startSec`, `lengthSec`, new `fadeOutSec`; saved per cortina in the per-user DB so the trim applies on every future set; Rekordbox XML writes `<POSITION_MARK Name="in" Type="0" Start="…">` and a memory cue at the out point; Traktor NML writes `<CUE_V2>` in and out; M3U8/XSPF write `#EXTVLCOPT:start-time=` / `stop-time=`. Set-level default length remains in the composer and applies only to cortinas without their own trim.

### 2.3 Know what time it is (P0)

**B09 · Real durations** · M · P0
*As a DJ, I want every track to have its real length so the plan's clock is true.*
AC: `Song.durationSec` filled from, in order: the DJ's local file (B27), Spotify cache `durationMs`, a per-orchestra/era/rhythm default table (D'Arienzo 1951 tango ≈ 150 s, Pugliese 1950s ≈ 200 s, vals ≈ 165 s, milonga ≈ 140 s); UI shows "≈" when the source is a default; the header stops showing "4.05 h" and shows "4 h 03 min (≈)" until ≥ 90 % of tracks have a measured duration. Exports write the real value for *every* kind (today `flatten()` writes 170 for valses too).

**B10 · Clock view** · L · P0
*As a DJ, I want to see the night as wall-clock time with "we are here".*
AC: Start time input (default: next hour); a horizontal timeline above the cards: tandas as blocks sized by real duration, coloured by rhythm, cortinas as thin gaps, labels every 30 min; a "now" line that moves (and follows the B04 pointer when set); each card shows "23:42–23:54" instead of "#12 · build"; an end-time anchor: dragging it left drops whole tandas from the cool-down while keeping the arc shape; dragging right adds. Mobile: the timeline becomes a sticky one-line strip ("23:42 · tanda 12 of 22 · última at 02:50").

**B11 · Anchors and specials** · L · P0 (BA P0, others P1)
*As a BA DJ, I want to pin a show, a vals de cumpleaños, a folklore set, an announcement and the última at clock times and have the plan bend around them.*
AC: *Add special* on the timeline: types *Show / break* (silent block, duration, followed by a re-ramp tanda flagged `phase: "reramp"` with energy ≥ 75 and a tier-1 rhythmic orchestra), *Vals de cumpleaños* (one vals from a curated bank, announced, counted as a one-track tanda), *Folklore / chacarera* (3 tracks from a user-supplied list, not in `DanceRhythm` so it bypasses rules), *Announcement* (fixed minutes of silence), *Última* (B22), *Second Cumparsita*. Anchors are locked by definition; the planner fills around them and reports if an anchor cannot be hit within ± 4 min. Print (B30) shows anchors in bold.

### 2.4 Make it mine: per-user database (P0)

**B12 · Per-user knowledge layer with override merge** · L · P0
*As a DJ, I want to edit orchestra profiles, rules, cortinas and song metadata for myself without touching the repo, and have my edits win over the defaults.*
AC: Three layers: repo defaults (`data/knowledge`, `packages/core/src/cortinas.ts`) → regional preset (B33) → user overrides. Storage: IndexedDB in the browser (Dexie or idb), later Cognito-backed. Merge is per-field: a user override for `orchestra_profiles.darienzo.notBefore` changes only that field; arrays (`phase`, `tags`) are replaced, not concatenated, unless marked `+`. `compose()` takes a `knowledge: KnowledgeBundle` argument so the server composes with the user's layer (sent in the request body, gzipped, cached by hash). An *Overrides* page lists every override with *Reset* per row and *Reset all*.

**B13 · Song metadata editor** · M · P0 (after B12)
*As a DJ, I want to correct a year, singer, rhythm, danceability, fame or energy on any recording and mark it "never play".*
AC: In Library and on any track row: *Edit* opens a sheet with year, singer (canonical picker), rhythm, `danceable` (bool, default from the medley/concert blacklist), `fame` 0–5 stars, `energy` override, `transferTier` (B35), `neverPlay`, free note. Changes are user overrides keyed by song id; the composer excludes `danceable:false` and `neverPlay`; `fame` is used by the opener rule (B20). Bulk edit via multi-select in Library.

**B14 · Orchestra profile editor** · M · P0 (after B12)
*As a DJ, I want to change what the engine believes about an orchestra: its energy, its phase, when it may first appear, its canonical singers, its periods.*
AC: Library → orchestra → *Profile*: energy baseline, style, `phase` chips, `notBefore` slider (shown as "not before 23:30 on a 4-h night from 21:00"), tier, `singers` table with years and a canonical weight (1.0 / 0.4 / 0.1), `periods` list (B21), `eraShift`. Saving recomposes nothing; a banner on the composer says "Profiles changed · Recompose to apply".

**B15 · Rules editor** · M · P0 (after B12)
*As a DJ, I want the composition rules as a visible, editable list rather than hidden defaults.*
AC: Rules page with every `ComposeOptions` knob that is not on the composer: `orchestraRepeatGap`, `singerRepeatGap`, `maxYearSpread`, tanda sizes, `pattern`/`customPattern`, `mixVocalInstrumental`, big-four spacing, tier-2 colour quota, `include/excludeOrchestras` with a picker, "última must be tango/vocal", "no concert instrumentals", artist cohesion strict/loose/off (B41). Each rule has a one-line plain-language explanation and a *Default* chip. Rules are part of the override layer and of presets.

**B16 · Cortina library (own clips)** · M · P0 (after B12)
*As a DJ, I want to add my own cortinas, tag them, trim them and build families.*
AC: *Cortinas* page: list of built-in + user clips; *Add* by Spotify link/URI, by title/artist search (when connected), or as a local file reference (path + fingerprint, B27); fields: culture, genre, energy, year, language, `startSec`/`lengthSec`/`fadeOutSec` (B08), tags (`late-night`, `danceable-risk`, `sing-along`, `instrumental`, `cliche`, `theme:<name>`), *never use*. Families: a named ordered list of ≥ 8 clips; composer gains *Cortina family: <name>* as the default mode (B24). Built-in placeholders flagged by the DJ review ("Mezdeke-style Oriental", "Misirlou (rebetiko)" duplicate) removed from defaults.

**B17 · Import / export of the user layer** · S · P0 (after B12)
*As a DJ, I want to back up and share my overrides, profiles and cortina library.*
AC: *Export overrides* writes one JSON file (`tdj-user-v1`, with schema version and created-at); *Import* merges (user picks *replace* or *merge, mine wins* / *merge, file wins*) and reports counts; a share link (B32) can carry a read-only cortina family. Round-trip test: export → wipe → import yields identical merged knowledge hash.

**B18 · Own-library import as a catalog (alternative DJ)** · L · P1
*As an alternative DJ, I want to compose from my own music instead of the repo's golden-age index.*
AC: Import from a folder scan (B27), an M3U/M3U8, a CSV (title, artist, album, year, rhythm, bpm, key, duration, path) or a Rekordbox XML collection; rows become `Song`s in the user layer with `source:"user"`; a *Catalog* switch on the composer: *TDJ index* / *My library* / *Both*; unknown orchestras get an auto-profile (energy from BPM where present, tier 2) the DJ can edit (B14). Rhythm for user songs may be any string; the cycle planner accepts a custom alphabet (B41).

**B19 · Hand-over import and venue memory** · M · P1 (marathon P0)
*As a marathon DJ, I want to import what the previous DJs played and have it count against repeats; as a resident DJ, I want the app to remember what I played at this venue.*
AC: *Before my slot* on the composer: paste text, drop an M3U/CSV/TDJ JSON or pick a previous TDJ set; parsed into (orchestra, singer, title, year) tuples; the planner treats them as played at negative indices for spacing/title rules; a *Venue* field on the set; *History* page lists past sets by venue; a rule "avoid tandas played at this venue in the last N weeks" with N configurable (default 6). *What I played* export (B29) writes the same format so the next DJ imports it in one tap.

### 2.5 Make the music right (P0/P1, engine)

**B20 · Fame signal and opener rule** · M · P0
*As a DJ, I want the track everyone knows to open the tanda.*
AC: `Song.fame` 0–5 from: curated canon list in `data/knowledge/canon.json` (≈ 400 recordings), Spotify `popularity` where cached, user override (B13); `buildTanda` places the highest-fame track first and the highest-energy (or second-fame) fourth; tandas with zero fame-≥3 tracks in peak/close phases are penalised in selection; the candidate window widens from `need + 3` to all within ± 8 energy so variety comes from choice (fixes identical tandas across seeds).

**B21 · Period tables and canonical singers** · M · P0
*As a DJ, I want tandas that never cross a stylistic break and never put an obscure singer in a prime slot.*
AC: `OrchestraProfile.periods: Array<[from, to, label]>` for the top 25 orchestras (shipped), enforced inside tandas; singer weight per orchestra (canonical 1.0, secondary 0.4, other 0.1) multiplies family selection; rule: tier-1 orchestra with weight < 0.4 singer never in `peak`/`close`; raw singer strings normalised (`"C.dante-O.larroca"` → "Carlos Dante y Oscar Larroca").

**B22 · Última and Cumparsita as composed objects** · M · P0
*As a DJ, I want the last tanda to be a tango from an orchestra the room expects, and a Cumparsita that matches how the night ended.*
AC: Last slot forced to tango (cycle adjusted: drop the last M or insert a T); última chosen from a shortlist (vocal, tier-1, fame ≥ 3) or from the DJ's pinned choice (B11); Cumparsita bank of ≥ 8 versions with a mood tag; picker prefers an orchestra that played in the last 90 min and matches the última's energy; UI: *Ending* card with *Change última* and *Change Cumparsita* drop-downs and a *Two Cumparsitas* toggle.

**B23 · Drive/weight energy model and phase-aware eras** · L · P1
*As a DJ, I want warm-ups to be early rhythmic and peaks to be 1940–46, not the reverse.*
AC: Replace scalar energy with `drive` (rhythmic ↔ lyrical) and `weight` (simple ↔ dramatic) per orchestra/period; phase targets expressed in both; the existing `energy` stays as a derived display value; a shipped `preferredPhaseByPeriod` table; A/B against the existing model on the four reference seeds in `dj-review.md`, with the DJ panel re-scoring blind.

**B24 · Cortina families as the default** · M · P0
*As a DJ, I want one cortina family all night, never the same clip twice until the family is exhausted, and never a lo-fi clip at 21:12.*
AC: Composer cortina mode: *One family* (default; pick a family or let TDJ pick from chosen cultures) / *Matched* / *Same clip* / *None*; family rotation without repeats; energy used only as a tie-breaker inside the family; `late-night` clips excluded before 70 % of the night; `danceable-risk` clips excluded in BA/Mediterranean presets; never two consecutive clips by the same artist unless the family is single-artist.

**B25 · Danceable blacklist and duplicate-recording awareness** · M · P0
*As a DJ, I never want a medley or a concert piece in a tanda, and I want to know when two rows are the same recording or two takes of the same title.*
AC: Load-time regex blacklist (`selecci[oó]n`, `parte`, `popurr[ií]`, `fantas[ií]a`, …) plus curated `danceable:false` list; `catalog.ts` dedupes on orchestra + normalised title + date (± 1 day) into one `Song` with `alternates[]` (album/source per alternate); *same title, different take* (same orchestra, same title, different year, e.g. D'Arienzo "La Cumparsita" 1937/1943/1951) is grouped in Library with a *Takes (3)* chip; the set-level title-repeat rule treats different takes of the same title as a repeat by default (rule toggle in B15); the track swap drawer (B03) offers other takes explicitly ("same title, 1951 take").

**B26 · Honest scorer and findings panel** · M · P0
*As a DJ, I want to be told what is wrong with the set, not that I am a headline DJ.*
AC: Replace the 90/100 headline with a *Findings* list ("Tandas 13–14 are 17 points under target", "Última is a vals", "Lomuto returns at 21 after opening", "Medley in tanda 2"), each with a one-tap fix where one exists (swap, re-plan from here, change última); numeric score moves inside *How this set scored*; criteria without data show *not scored* and contribute 0, not 50–70 %; the verdict label is hidden until the DJ fills the human criteria after the night (B45); recalibrate C6/C7/C10/C11/C13 per the DJ review so the four reference seeds score in the 60s, not 89–91.

### 2.6 Exports and DJ-app connectors (P0/P1)

**B27 · Local library match** · L · P0
*As a DJ who plays from files, I want TDJ to find my actual files so exports work.*
AC: *Where is your music?* step in Export: pick a folder (File System Access API in Chromium; drag-and-drop fallback; a tiny optional desktop helper for Safari/Firefox), scan tags (ID3/Vorbis/FLAC via `music-metadata-browser`), fuzzy-match on orchestra/title/year with a confidence score, list unmatched with a *Pick file* per row; matches persist by fingerprint in the user layer; durations (B09) and transfer tier (B35) read from the file; exports write real absolute paths with the platform's volume model (Traktor `VOLUME`, `DIR`, `FILE`; Rekordbox `file://localhost/…` with full path; no `/` in filenames).

**B28 · Export with or without cortinas, and per-tanda sub-playlists** · S · P0
*As a DJ, I want to choose whether cortinas are in the exported playlist.*
AC: Export sheet gains a *Cortinas* segmented control: *Include* / *Exclude* / *As cues only* (B08); applies to all formats; Rekordbox/Traktor keep per-tanda sub-playlists and the folder gets the set name and date; M3U8 writes `#EXTGRP:` per tanda; CSV gains `clock_start`, `tanda_label`, `cortina_in_sec`, `cortina_out_sec`, `fame`, `source_tier`; JSON schema versioned.

**B29 · Honest Serato, plus VirtualDJ and Engine DJ** · M · P1
*As a Serato / VirtualDJ / Engine DJ user, I want a file my software actually imports.*
AC: Serato: write `.crate` binary (with real paths from B27) into a chosen `_Serato_/Subcrates` folder, or relabel the current CSV "Serato-friendly list (paste into a Smart Crate)"; VirtualDJ: `.vdjfolder` XML or M3U with VDJ-readable paths; Engine DJ: M3U8 with absolute paths (Engine's `m.db` is not a safe write target) and a one-paragraph import guide. Each connector in Settings → *DJ apps* has: library/collection path, *Test* button that checks the path exists, last export time.

**B30 · Print / PDF set list** · S · P0
*As a DJ, I want paper.*
AC: `/print/[id]` route, A4 and Letter, black on white, one row per tanda: clock · rhythm · orchestra / singer · years · titles · cortina; anchors and última in bold; cortinas as grey rows; footer with total time and orchestra count; second page: orchestra heat-map by half-hour; *Without cortinas* and *Titles only* toggles; printed via `window.print()` with `@media print` styles; *Save as PDF* through the browser. 80-column text variant for thermal printers stays.

**B31 · Spotify export as "share a preview", not the primary action** · S · P1
*As a DJ, I want the export sheet to lead with what I use, and to not promise Spotify when it cannot work.*
AC: Spotify button disabled with inline reason when no Client ID ("Add your Spotify Client ID in Settings to share a preview playlist"); formats grouped (*DJ software* / *Playlist files* / *Paper & other*); Spotify under *Share*; the playlist description no longer embeds the self-score.

**B32 · Share link** · M · P1
*As a DJ, I want to send tonight's plan to the organiser or the next DJ as a link.*
AC: *Share* creates a URL with the seed, options, locks, anchors and the user-layer hash (so the recipient composes the same set) or, for sets with user-only songs, a server-stored read-only snapshot with a 30-day expiry; the recipient page is read-only with *Open in my TDJ* and *Print*; no keys or settings in the link; QR code on the print page.

### 2.7 Context: region, event, season, floor (P1)

**B33 · Regional presets that do something** · M · P1 (Istanbul/BA P0)
*As a DJ, I want "Istanbul" to change the defaults the way an Istanbul DJ would.*
AC: Presets from `dj-benchmark.md` §2.4: Buenos Aires traditional, European marathon, European encuentro, Istanbul, Asia (Seoul/Tokyo), US alternative, Práctica; each sets cycle, tanda sizes, cortina mode/length/cultures, era centre, `notBefore` for Pugliese, Cumparsita count, warm-up length; the composer shows a one-line summary of what the preset changed ("Istanbul: 30-s Turkish + global cortinas, Pugliese after 60 %, one nuevo tanda allowed in the last hour") with *Customise*; presets are a layer under user overrides (B12). The Settings region chips are removed; region lives on the composer as *Preset*.

**B34 · Event context inputs** · M · P1
*As a DJ, I want to tell TDJ what kind of night it is: when, where, who, the weather, the level mix.*
AC: *Tonight* panel: event type (milonga / práctica / marathon slot / encuentro / festival milonga / neo night / wedding or show), start and end time, expected attendance, level mix (beginner-heavy / mixed / experienced), season (auto from date + hemisphere) and weather (manual chips: hot / rain / cold; optional fetch from an open weather API by city with the DJ's consent), hand-over (B19). Effects, all visible in the summary line: rain/late start stretches warm-up by 20 %; heat lowers plateau drive by 5 and prefers slower valses; beginner-heavy keeps drive high and weight low until 50 %; práctica removes warm-up/cool-down; marathon removes warm-up and Cumparsita. Each effect is a rule in B15 the DJ can switch off.

**B35 · Transfer-tier tagging** · M · P1
*As a DJ with a good sound system, I want to know which rows are good transfers and prefer them.*
AC: `Song.transferTier` 1–4 (1 = TangoTunes/CTA-grade, 4 = unknown compilation) inferred from album/label patterns (shipped mapping for TangoTunes, CTA, El Bandoneón, Euro Records, RCA Victor 100 años, Reliquias, "Listado" compilations) and from local file tags/bitrate (B27); user override (B13); composer rule "prefer tier ≤ 2, never tier 4 in peak"; Library filter by tier; rubric C12 scores from real data or shows *not scored*.

**B36 · BPM and key detection** · L · P1 (alternative P0)
*As a DJ, I want BPM and key per recording for tempo flow inside tandas and for alternative sets.*
AC: In-browser detection on previews (B06, where the preview is a direct audio stream) or on local files (B27) using `web-audio-beat-detector` and a key estimator (Krumhansl profile on chroma); results cached in the user layer and, for the shipped index, in `data/cache/bpm.json` via `pnpm index:enrich`; rubric C9 activates only when ≥ 80 % of a tanda has measured BPM; Library shows BPM/key columns; the swap drawer (B03) shows BPM delta from the tanda mean.

**B37 · Floor-feedback re-plan** · M · P1
*As a DJ, I want three big buttons that re-plan the rest of the night by feel.*
AC: In booth mode (B39): *More energy* / *Calmer* / *Simpler rhythm*, each re-plans only unplayed, unlocked tandas (B04) shifting the target arc ± 10 points or swapping to higher-drive/lower-weight families; a fourth *Shorter by 20 min* drops a tanda from the cool-down; each press is one undo step (B05) and is logged with a timestamp for the post-night review (B45).

**B38 · Request queue** · M · P1
*As a DJ, I want to type a request and be told the next legal slot.*
AC: *Requests* drawer: type orchestra, singer or title; TDJ proposes "Next legal slot: tanda 17 (tango, 00:52), replaces De Angelis / Dante; spacing OK; not played tonight"; *Place* swaps it in (locked), *Later* queues it, *Decline* keeps a note; queued requests appear as small chips on the timeline; the planner tries to honour queued requests on the next re-plan; works offline (B40) against the cached index.

**B39 · Booth mode** · M · P1
*As a DJ at 2 a.m., I want a screen I can read standing up and operate with one thumb.*
AC: Toggle in the header; forces dark, removes transparency and animation, 28-pt current tanda (orchestra / singer / years), four titles, the cortina that follows, "Next: VALS Di Sarli / Rufino 1940–41 at 00:14", countdown to última; bottom row of 44-pt-plus buttons: *Mark played* (advances B04), *More energy* / *Calmer* / *Simpler* (B37), *Request* (B38); swipe left on the current card = next; nothing requires a long press or a hover; screen stays awake (Wake Lock API).

**B40 · Offline (PWA)** · L · P1 (marathon P0)
*As a DJ in a hall with no Wi-Fi, I want compose, swap, search and booth mode to work.*
AC: Service worker caches the app shell; the index (`songs.json`, profiles, cortinas) is stored in IndexedDB on first visit (and refreshed when `meta.builtAt` changes); `compose`, `swap`, `search` run in a Web Worker from `@tdj/core` when offline (and optionally always, for latency); an *Offline ready* badge in Settings; AI review and Spotify features degrade with a clear message.

### 2.8 Alternative sets (P1 for that persona)

**B41 · Tanda cohesion modes and custom cycle alphabets** · M · P1
*As an alternative DJ, I want tandas grouped by mood/BPM/key with one or many artists, and a cycle of my own letters.*
AC: Rule *Artist cohesion*: strict (today) / loose (same artist or same `moodGroup`) / off; cohesion dimensions selectable: BPM window (± n), key compatibility (Camelot neighbours), mood tag, decade; `customPattern` accepts any letters mapped to user-defined rhythm sets (e.g. N = neo, A = alternative, V = vals); the planner validates the alphabet against the catalog in use and reports which letters cannot be filled.

**B42 · Cortinas down to 5 s, per-tanda override, "cue into next track"** · S · P1
*As an alternative DJ, I want stinger cortinas or none per tanda.*
AC: Length control accepts 5–90 s; per-tanda cortina override on the card (none / family / specific clip); *Cue into next track* writes a cue point on track 1 of the next tanda instead of a separate file; exports (B28) honour it.

**B43 · Streaming resolvers beyond Spotify** · L · P2
*As a DJ on Apple Music or TIDAL, I want previews and resolution from my service.*
AC: `Resolved` interface implemented for Apple Music (MusicKit JS, developer token BYOK) and TIDAL where API access allows; preview embeds per service; user-level choice of primary service; resolver results cached in the user layer.

### 2.9 Settings, AI, accounts (P1/P2)

**B44 · Multiple AI providers (Anthropic / OpenAI / Gemini / OpenRouter)** · M · P1
*As a DJ, I want to use the AI key I already pay for.*
AC: Settings → *Written reviews*: provider segmented control; key field with show/hide and a *Test* button; model picker with friendly labels ("Best", "Balanced", "Fast") mapped to provider model ids, plus an *Advanced* free-text model id; `/api/ai/explain` takes `x-ai-provider`, `x-ai-key`, `x-ai-model` and dispatches to Anthropic Messages, OpenAI Responses, Gemini `generateContent`, or OpenRouter (OpenAI-compatible); the prompt is shared; streaming to the UI with `aria-live`; the model list excludes internal/preview names (the current chips show `claude-fable-5-1`, which should not be user-facing); keys stay in the browser as today.

**B45 · Post-night review and human criteria** · S · P1
*As a DJ, I want to record how the night went so the score and the venue memory learn.*
AC: After the end time (or on *Close the night*), a short form: floor at opener (1–5), best tanda, worst tanda, requests received, "would play again" per tanda (thumbs), free notes; stored with the set (B19 history); the H-criteria of the rubric are filled from it and only then is a verdict label shown (B26); exportable as CSV for the measurement plan in §5.

**B46 · Save, name and version sets** · S · P1
*As a DJ, I want more than one set, with names and dates.*
AC: *Sets* page listing saved sets (name, venue, date, duration, preset, score-findings count); duplicate, rename, delete; the current single `playlist` in the store becomes `sets[]` with an active id; auto-save on every change with B05 history per set.

**B47 · Keyboard and one-hand gestures** · S · P1
*As a DJ, I want to drive the plan without a mouse.*
AC: Desktop: J/K move between tandas, L lock, S swap, Space preview, R re-plan from here, P mark played, ⌘Z undo, / focus request box, ? shows the map. Mobile: long-press a card for the action sheet (lock modes, swap, request here, play), swipe right on a card = mark played, pull-down on the timeline = jump to now. Every target ≥ 44 pt.

**B48 · Accounts with encrypted BYOK and sync** · L · P2
*As a DJ with a laptop and a phone, I want my sets, overrides and keys on both.*
AC: Cognito sign-in (roadmap Phase 4), user layer and sets synced through an API with KMS-enveloped secrets; local-first with conflict resolution (last-write-wins per record, overrides merged per field); account deletion wipes everything; no account required for anything else.

**B49 · Localisation (es, tr, de, it, fr)** · M · P2
*As an Istanbul or BA DJ, I want the app in my language.*
AC: `next-intl` with the five locales; the DJ vocabulary stays Spanish everywhere (tanda, cortina, última, vals de cumpleaños); print and share pages follow the viewer's locale; `ComposeOptions.locale` already exists and is wired.

**B50 · Mobile fixes from the UX review** · S · P0
*As a DJ on a phone, I want the tab bar not to cover the last track of every card.*
AC: `padding-bottom: calc(env(safe-area-inset-bottom) + 72px)` on the list; tab bar opacity ≥ 0.82 with top hairline; 44-pt lock/swap; cortina row on two lines; the sticky *Compose* bar from `ux-review.md` §4.7. (`ThemeSync.tsx` is already mounted in `layout.tsx` with a pre-hydration script and `globals.css` styles `:root.reduce-glass .glass`, so the theme/reduce-glass item from the UX review is done; replace the native checkbox with a switch and remove the duplicate DOM mutation in `settings/page.tsx` lines 114–118.)

**B51 · Session set trailer, public gallery** · L · P3
Roadmap Phase 4 items; unchanged, kept here so the backlog is complete.

**B52 · Multi-DJ night planner** · M · P3
*As a festival organiser, I want four DJ slots in one plan with hand-overs computed.*
AC: Slots with DJ names and times; each slot composes with the previous slot as hand-over (B19); a combined print; per-slot share links.

### 2.10 Priority summary

| Priority | Items |
|---|---|
| P0 | B01–B17 (keep edits, listen, clock, user layer), B20–B22, B24–B28, B30, B50 |
| P1 | B18, B19, B23, B29, B31–B42, B44–B47 |
| P2 | B43, B48, B49 |
| P3 | B51, B52 |

Suggested first six weeks: B01+B02+B05 (locks, undo) → B06+B08 (preview, trimmer) → B09+B10 (durations, clock) → B12+B16+B17 (user layer, cortina library, import/export) → B28+B30+B50 (export switches, print, mobile) → B26 (findings instead of score). After that the engine items (B20–B25) and the persona unlocks (B19, B33, B34, B18).

---

## 3. UI/UX comments per screen

The frame for every comment: it is 02:00, the room is dark, the DJ is standing, one hand is on the mixer and the other holds a phone or hovers over a trackpad. Every interaction must work with one thumb, no hover, no precision, and in two taps.

### 3.1 Home / Composer (01, 07, 08)

**Hierarchy.** On the phone the hero (vinyl + headline + three-clause paragraph) fills the first screen; the first control is below the fold. Once a set exists, the hero is cost. Collapse it to one line after the first compose; on mobile hide it entirely when `playlist` exists.

**Copy.**
- Headline keep: "Compose a milonga, tanda by tanda."
- Paragraph → "Pick an era and a length. TDJ builds coherent tandas, shapes the night, and picks each cortina." One sentence.
- "Length of the night" → "Tonight" with the start–end times once B10 lands ("21:00 – 01:00 · 4 h · ≈ 21 tandas"). The slider labels "1 h práctica · 4 h milonga · 8 h marathon" are good; keep.
- "Night arc" → "Shape of the night"; "Shape inside each tanda" → "Inside each tanda".
- The Cortinas row mixes two single-selects (style, trend) and looks like a multi-select error ("Matched to next tanda" + "Mix" both filled). Split into *Cortinas* (One family / Matched / Same clip / None), *Flavour* (Mix / Current hits / Classics) and *Cultures* (multi), as `ux-review.md` §4.3 proposes.
- "Close with La Cumparsita" checkbox → a switch, and the label becomes "End with La Cumparsita"; add "Two Cumparsitas" under it when the BA preset is on.
- "Cortina 45 s" → a stepper "Cortina length · 45 s" with 5-s steps and a minimum of 5.
- "Compose the night" keep; drop the sparkles icon. "Same seed" → "Recompose (same night)". Tooltip: "Keeps the character of this set and re-rolls unlocked tandas."
- Add a *Preset* row at the top of the controls ("Buenos Aires · Europe marathon · Encuentro · Istanbul · Asia · US alternative · Práctica · Custom") with the one-line "what this changed" summary. Move region out of Settings.

**Interaction.** Chip rows clip mid-word on a 1440-px desktop ("Post-golde", "Tre", "Grec"); wrap on desktop, fade-edge scroll on phones. Era should be a single-select segmented control. The Compose button must be reachable with the thumb: sticky bar above the tab bar on mobile. Add *Advanced* disclosure under the controls for cycle, sizes, gaps, year spread, include/exclude orchestras (today only reachable from the CLI).

### 3.2 Result header and energy curve (02, 09)

**The 90/100 and "Headline marathon DJ".** Remove from the header. Replace with a *Findings* strip: "3 things to look at · Última is a vals · Tandas 13–14 sag · Lomuto returns at 21". Tap a finding → scroll to the tanda with the fix buttons visible. The number lives inside "How this set scored".

**Stat line.** "4.05 h · 22 tandas · 82 tracks · 18 orchestras · seed 23801646" → "4 h 03 min · 22 tandas · 18 orchestras" and a small chip "Seed" that copies on tap. Three facts, not five.

**Curve.** Label every dot with a 3-letter orchestra code (DAR, DIS, TRO, PUG, BIA, TAN, CAL, DAG, ROD, FRE, CAN, LAU, DEA, OTV, DON, LOM); shade the gap where |actual − target| > 10; a clock axis under the phases once B10 lands; a "now" line in booth mode; dots get a shape as well as a colour (vals = ring, milonga = square) and a legend. On the phone (09) the labels render at ~6 px; render a compact variant with 12-px text. Tapping a dot already scrolls to the card; add the reverse: the active card highlights its dot.

**"Ask the AI DJ to review"** → "Get a written review" and, once B44 lands, a provider chip next to it ("with Claude"). Stream the text into a `role="status"` box with a heading "Review" and the model name in small type. Show a skeleton while waiting, never an empty box.

**Benchmark breakdown** → "How this set scored", a proper disclosure with a chevron; each factor as a bar with "score / weight" and *not scored* where there is no data.

### 3.3 Tanda cards (03, 10)

**Meta line.** "#9 · peak · 1945–1946" → "Tanda 9 · 23:52–00:03 · 1945–46". Phase names belong on the curve, not on every card.

**Energy numbers.** "87 · energy · target 75" is two numbers with a mid-dot. Keep the big number; the second line reads "target 75" and turns amber when the gap exceeds 10. Per-track bars are relative to the tanda max so they are all 85–100 % (03); use an absolute 0–100 scale or show the chosen shape as a 4-point sparkline.

**Singer strings.** "C.dante-O.larroca" (03) is a raw source string. Normalise (B21). "Instrumental" where there is no singer is right.

**Cortina row.** "Cortina · Mabel Matiz – Bir Günah Gibi · turkish-pop · e60 · 45s" → two lines on mobile: "Cortina · Mabel Matiz – Bir Günah Gibi" / "Turkish pop · 0:41–1:16 · energy 60"; a play button on the left (B06), *Trim* on the right (B08). Confirm the title (the DJ review doubts it).

**Buttons.** Lock and swap are 36 px and 4 px apart (10). Make them 44 px, 8 px apart; long-press the lock for modes (B02); swap gets a confirmation-free *Undo* toast. Add a third button only in booth mode: *Playing now*.

**One-hand at 2 a.m.** The card should answer three questions at a glance: *what rhythm, which orchestra, when*. Make the rhythm pill and the orchestra the two largest things on the card; everything else is secondary type. Twenty-two identical glass cards become wallpaper; offer a compact *list* view (one line per tanda: clock · rhythm dot · orchestra / singer · years · energy) with tap-to-expand, and remember the choice.

**Track rows.** Tap = open the replace drawer (B03); a small play button at the left of each row (B06); the year in parentheses stays. Titles are truncated on mobile ("Pagá Vos Despues Arreglamos …"); allow two lines.

### 3.4 Closing card

"Closing · La Cumparsita — Juan D'Arienzo (1937)" → an *Ending* card with two rows: "Última · Tango · Di Sarli / Rufino 1941–42 · 02:38" and "La Cumparsita · D'Arienzo 1951 · 02:51", each with a *Change* menu (B22). The wand icon reads as "magic"; use the rhythm pill style instead.

### 3.5 Export sheet (04, 11)

**Order of operations.** Step 1 *Where is your music?* (B27, skippable with "I'll use the files as-is"); step 2 *What to include*: Cortinas (Include / Exclude / Cues only), *Set name* field; step 3 formats grouped: *DJ software* (Rekordbox XML, Traktor NML, Serato crate, VirtualDJ, Engine DJ M3U), *Playlist files* (M3U8, XSPF, CSV), *Paper & sharing* (Print / PDF, Set list text, Share link, Spotify preview playlist). Remember the last format used and make it the first tile.

**Copy.** "Export set" → "Export this set". "Raw files for any DJ app, or push straight to your Spotify account." → "Download a file for your DJ software, print the set list, or share a preview." "Serato CSV" → "Serato crate" when B29 lands, otherwise "Serato-friendly list". "JSON (raw)" → "TDJ file (.json)" under *Other*. "Connect Spotify & create playlist" → disabled with "Add your Spotify Client ID in Settings to share a preview playlist" when there is no ID; otherwise "Create preview playlist in Spotify".

**Interaction.** Sheet semantics (grabber, Escape, focus trap, `aria-labelledby`); progress log as a `role="status"` list, not an 11-px `<pre>`; on mobile the primary action pinned at the bottom with safe-area padding; "XSPF (VLC/Mixxx)" wraps to two lines on the phone (11); shorten to "XSPF".

### 3.6 Library (05)

**Copy.** "Library index" → "Library". Drop "hosted in this repo under data/index". Empty state before typing: "Type an orchestra, singer, title or year. Try *di sarli rufino vals*." No-results: "Nothing matches "…". Check the spelling or try the orchestra alone."

**Rows.** The 10-px coloured rhythm label fails contrast in light mode; use 12 px and darker shades. Add duration, BPM (when known), fame stars, transfer tier and a *Takes* chip for duplicate titles (B25). Row actions: play (B06), *Build a tanda from here* (same orchestra, singer, ± 2 years → a draft tanda the DJ can insert at the next legal slot), *Edit* (B13), *Never play*.

**Filters.** Rhythm, orchestra (the chips at the bottom should *be* the filter, not look like selected toggles), singer, year range, "danceable only", "played at this venue in the last 6 weeks", tier.

### 3.7 Settings (06)

**Structure.** "Your panel" → "Settings". Sections: *Preset and rules* (link to Rules B15), *Music* (DJ apps: Rekordbox / Traktor / Serato / VirtualDJ / Engine with a library path and a *Test* button; local library folder), *Listen & share* (Spotify, Apple Music), *Written reviews* (provider, key, model), *Appearance*, *Data* (export/import overrides, offline status, wipe everything).

**Copy.** "Each user brings their own keys. They live only in this browser (localStorage) and are sent per request, never stored on the server." → "Your keys stay in this browser and are sent only with your own requests." "AI reviewer (Anthropic)" → "Written reviews". Model chips → "Best / Balanced / Fast" with an *Advanced* field for an exact id; do not show internal or preview model names. "Sent as a request header to /api/ai/explain only; never logged." → "Used only when you ask for a review. Never logged."

**Spotify.** The redirect URI is in a paragraph; put it in its own read-only field with *Copy*. Add a status badge (Connected · expires in 52 min / Not connected). Explain the Premium and Dev-Mode constraints in one line with a link, not in the paragraph.

**Appearance.** "Reduce transparency (battery / accessibility)" is a 13-px native checkbox; it works (ThemeSync), so only the control needs to become a switch (B50). Add *Booth mode* here too, with the note "also in the header".

**Region chips.** Remove; region is a preset on the composer (B33).

### 3.8 Guide

Six identical cards for six definitions; use one surface with a definition list. Fix the content error in "Energy arc": the warm-up list "Fresedo, Di Sarli, Canaro" is what the engine does and what the DJ review says is wrong; the guide should describe the intended model (early rhythmic warm-up, 1940–46 peaks, Pugliese late). "Score … ≥ 85 = headline marathon DJ" → describe findings, not grades. Add a short "How to use this in the booth" section once B39 exists.

### 3.9 Navigation and callback

Mobile header pill carries only the logo; remove it below `sm` or make it the page title + clock strip. Tab bar: raise opacity, add a pill behind the active item, 44-pt targets. The *Compose* tab icon is a sparkle; use a disc or the logo. Callback page: a spinner, a plain error ("Spotify did not return a code. Try connecting again from Settings."), never `String(e)`.

---

## 4. The ten things that most make TDJ feel AI-generated, and the fix for each

| # | Tell | Why it reads as generated | Precise fix |
|---|---|---|---|
| 1 | **"90/100 · Headline marathon DJ" on every output** (02, 09) | A product that grades itself at the top of its own scale every time has no taste; a DJ laughs at it in three seconds. | Remove the grade label from the header (B26). Show findings. Recalibrate `score.ts` so the four reference seeds land in the 60s. Show the verdict only after the DJ fills the post-night form (B45). |
| 2 | **Sparkles icon on the primary button and the Compose tab; "Ask the AI DJ"** | The sparkle is the universal 2023–26 "AI feature" glyph; "AI DJ" names the technology, not the job. | Replace `<Sparkles>` with `<Disc3>` or no icon in `Composer.tsx` line 289 and `Nav.tsx` line 8. Rename to "Get a written review". Never say "AI" in the UI; say what it does. |
| 3 | **Every track is 170 s and the header says "4.05 h"** | Two-decimal precision on fictional data is the signature of a generator that never met a file. | B09: real durations; show "≈" until measured; format as "4 h 03 min". Exporters write the real per-kind duration. |
| 4 | **Cortinas hop genre every tanda (Tarkan → Sabrina Carpenter → a-ha → Sinatra on one screen)** | A human DJ picks one voice for the night; a matcher that optimises per-tanda "energy distance" produces a jukebox. | B24: one family as the default; energy only as a tie-breaker; no repeats until the family is exhausted; `late-night` and `danceable-risk` tags respected. |
| 5 | **Identical tandas across seeds and the same D'Arienzo 1937 Cumparsita every night** | Deterministic hash jitter dressed up as a "seed" looks like variety and is not. | B20 widens the candidate window and adds fame; B22 adds a Cumparsita bank with mood matching; B19 venue memory makes repeats across nights visible and avoidable. |
| 6 | **Mid-dot stat strings everywhere** ("4.05 h · 22 tandas · 82 tracks · 18 orchestras · seed 23801646"; "#9 · peak · 1945–1946"; "turkish-pop · e60 · 45s") | Dumping every field the object has, joined by "·", is how generated UIs show data; a designed UI chooses. | Three facts per line max. Seed behind a copy chip. "e60" → "energy 60". Phase off the cards. Cortina row in two lines with a time range, not "45s". |
| 7 | **Raw identifiers in the UI**: `claude-fable-5-1`, `claude-sonnet-5-5`, `w8`, `seed`, "localStorage", "/api/ai/explain", "C.dante-O.larroca", "hosted in this repo under data/index" | Developer vocabulary leaking into product copy. | Friendly model labels with an Advanced field (B44); "score / weight" labels; normalised singer names (B21); remove repo/path references; Settings copy rewritten per §3.7. |
| 8 | **Same glass slab for every surface, same radius, same shadow, same animation** (all screens) | Uniformity without hierarchy is the look of a theme applied by rule rather than by decision. | `ux-review.md` §4.1: opaque content surfaces, glass only on header pill, tab bar, sheet and the sticky compose bar; motion only on data change; vinyl stops when idle. |
| 9 | **Generic hero copy that explains the product to itself** ("builds coherent tandas (one orchestra, one singer, tight years), shapes the energy from warm-up to peaks to La Cumparsita, and matches each cortina to what comes next") | Three clauses listing features in parentheses is marketing copy for a README, not an app a DJ opens nightly. | One sentence; collapse after the first compose; the Guide page carries the explanation. |
| 10 | **Options that do nothing and rules nobody can see**: Region chips never read by `compose()`, lock icons that do not survive a recompose, Hammock shape producing ± 2-point hash noise, "Serato CSV" that Serato cannot import | A real tool either does what the control says or does not have the control. Inert controls are the surest sign no one has used the product in anger. | Wire presets (B33) or remove the chips; make locks real (B01); make tanda shape drive real ordering via fame + energy (B20); relabel or replace the Serato export (B29). Rule: every control in the UI has a test that asserts the output changes when it changes. |

Honourable mentions: the Guide's warm-up list contradicts the DJ research; "Your panel" as a heading; the `.txt` set list printing "e62"; the 11-px grey phase labels; the Lottie vinyl spinning in the hero; the README's badge row.

---

## 5. What to measure to prove the sets are good

A set is good if the floor says so. Everything TDJ computes today is a proxy for that; the plan below is how to get the real signal and use it to calibrate the proxies.

### 5.1 Field protocol: A/B at real milongas

- **Design.** Same venue, same DJ, same slot, alternating weeks (ABAB…) for 8 weeks per venue, at ≥ 4 venues across the four regions on this panel. A = the DJ's own hand-made set; B = a TDJ set the DJ reviewed and edited for at most 30 minutes (edits logged). Dancers are not told which night is which. The DJ may deviate in the booth on either night; deviations are logged (B04 pointer + swaps + re-plans give this for free on B nights; a one-tap "went off plan" button on A nights).
- **Primary outcome: floor occupancy at track 2.** At the start of the second track of every tanda, count couples on the floor (manual tally on a phone by a helper, or a ceiling camera with the organiser's consent and no faces stored; floor density is what matters, not identity). Normalise by headcount in the room at that moment (door count or a second tally). Report the per-tanda series and the night mean; compare A vs B with a paired test per venue and a mixed model across venues (night nested in venue, tanda position as a covariate).
- **Secondary outcomes.**
  - *Mid-tanda exits:* couples leaving the floor before track 3 (a tanda the room rejects).
  - *Cortina clear time:* seconds until the floor is empty after the tanda ends (a cortina the room does not read, or a tanda people refuse to leave).
  - *Requests per hour* and *what was requested* (an orchestra the plan lacked, or a tanda it placed too late); a request is a dancer telling the DJ the plan is wrong.
  - *DJ edit distance:* share of planned tandas actually played unchanged (B4/B3 logs). On A nights, share of pre-written plan played unchanged.
  - *Retention:* headcount at 60 %, 80 % and 100 % of the night relative to peak; people leaving before the última is the strongest negative signal a milonga has.
  - *Post-night DJ form* (B45) and a 3-question dancer survey at the door on the way out ("How was the music tonight 1–5", "Best moment", "One thing you missed").
- **Sample size.** With floor occupancy varying ~ 15 % SD between tandas and an expected A/B difference worth caring about of 8 points, 8 nights per venue gives roughly 80 % power at four venues; fewer nights only tells you about disasters.

### 5.2 In-product telemetry (opt-in, no account needed)

- Time from first visit to first exported set; share of sets exported; share of exports that import without missing files (DJ-reported via a one-tap "Did the import work?" after a connector export, B29).
- Edit behaviour: swaps per set, locks per set, re-plans from here, "Same seed" presses, which findings (B26) are acted on and which are dismissed; which tandas get swapped most (an orchestra/singer the engine over-rates).
- Preview behaviour (B06): previews per set, share of previewed tracks that are then swapped (a high swap-after-preview rate on a family means the energy model is wrong for it).
- Booth-mode use: *Mark played* cadence vs planned clock (the drift tells you whether durations and cortina lengths are right); floor-feedback button presses by hour (a "Calmer" at 01:30 on BA nights, every night, means the arc is too hot there).
- Requests drawer: what was asked, whether it was placed, where.

### 5.3 Calibration loops that make the score honest

- Re-fit the rubric weights against field outcomes: each criterion's correlation with floor occupancy and exits across the A/B corpus; criteria with no correlation lose weight; the verdict thresholds are set so that a 70 means "the room danced like a solid regular DJ's night", measured, not asserted.
- Blind expert panel: once a quarter, four DJs score 20 sets (10 TDJ, 10 human, anonymised, same print format) on the rubric's human criteria; report inter-rater agreement and the TDJ-vs-human gap by criterion. The DJ review's current 66 vs self-reported 89 is the baseline to beat.
- Variety across nights: for each venue, Jaccard overlap of tandas between consecutive TDJ sets; target < 0.15 (the DJ review found identical tandas across seeds, which would be near 1.0 for some families).
- Cortina signal test: cortina clear time by family and by position in the night; a family whose clear time grows over the night is being ignored by the room.
- Duration truth: mean |planned − actual| per tanda after B09; target < 20 s.

### 5.4 What "good" looks like in numbers (targets for the end of Phase 2)

- Floor occupancy at track 2 on TDJ nights ≥ the same DJ's A nights at every venue (non-inferiority within 3 points), with mid-tanda exits and pre-última departures not worse.
- DJ edit distance ≤ 25 % of tandas changed before the night and ≤ 10 % in the booth.
- ≥ 90 % of connector exports import with zero missing files for DJs who completed the local-library match.
- Previews available for ≥ 95 % of golden-age tandas and 100 % of built-in cortinas.
- Rubric verdict agrees with the blind panel's band for ≥ 80 % of sets.

*End of panel review.*
