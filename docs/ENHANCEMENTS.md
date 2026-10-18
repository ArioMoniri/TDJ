# TDJ enhancements backlog (product lead synthesis, round 2 close-out)

Sources: `docs/reviews/musician-review.md` (MUS), `docs/reviews/dj-review.md` (DJ), `docs/reviews/dj-panel.md` (PANEL, backlog ids B01-B52), `docs/reviews/ux-review.md` (UX), `docs/reviews/qa-report.md` (QA, ids H/M/L), `docs/research/context-factors.md` (CTX). Round 2 = commit `f6b9c13`.

## 1. What the experts agreed on

Every reviewer reached the same verdict from a different seat: the skeleton is right (one orchestra, one singer, tight years, TTVTTM, Pugliese late, Cumparsita last, cortina after every tanda) and the music inside it is not yet booth-grade, because the engine knew *structure* but not *recordings*. The musician scored the sets 40-65 against a self-score of 88-91; the DJ scored 63-67; the panel called it "a planner that cannot yet be a booth tool"; QA found the self-score survives an empty set at 82. The shared root causes were a flat energy scalar that reads 1950s lyrical Troilo as warm-up material, no fame or danceability signal (so famous orchestras appear with their most obscure sides and medleys pass integrity), fake 170-second durations that make the clock and the exports fiction, an ending composed by accident (vals última, D'Arienzo 1937 every night), cortinas chosen per tanda by energy instead of one family per night, locks that did not survive recompose, exports that point at files that do not exist, and a scorer calibrated to the generator instead of the floor. Round 2 closed the data-free parts of that list (fame, blacklist, families, última, honest scorer, locks, swap, context, overrides merge, export hygiene, UX hierarchy). What remains is everything that needs real recordings, real time, real listening and the DJ's own data.

## 2. Backlog

Category: engine / data / ux / export / infra / ai. Priority: P0 blocks booth use for every persona, P1 blocks one persona or region, P2 clear value, P3 reach. Effort: S ≤ 2 days, M 3-7 days, L 2-4 weeks. Status: "shipped in round 2" only for work in `f6b9c13`; everything else "planned".

| ID | Enhancement | Source | Cat | Pri | Eff | Status |
|---|---|---|---|---|---|---|
| E01 | Context factor model: season, weather, event, time of night, crowd, region, holiday, mood shifts with combination rule and clamps | CTX §0-1, PANEL B34 | engine | P0 | M | shipped in round 2 |
| E02 | Per-user overrides merge layer (songs, profiles, cortinas, rules) applied in compose | PANEL B12 | data | P0 | L | shipped in round 2 |
| E03 | Fame signal in selection and opener rule; danceable blacklist (medleys, selecciones, solo de piano); concert-piece filter | MUS §1 #1 #7, DJ tells 4/12, PANEL B20/B25 | engine | P0 | M | shipped in round 2 |
| E04 | Cortina families as default, no repeat until exhausted, curated pool (placeholders removed), 30 new cortinas | DJ §5, MUS #9, PANEL B24/B16 | data | P0 | M | shipped in round 2 |
| E05 | Honest scorer: 8-tanda spacing window, unknown BPM/transfer scored low, vocal-tango última check, cortina family check, empty set = 0 | DJ §2 tell 15, MUS §4.7, PANEL B26, QA M-2 | engine | P0 | M | shipped in round 2 |
| E06 | Última tanda rule (last slot tango, tier-1 vocal shortlist) and Cumparsita varied by seed | MUS §4.2 #6, §4.5, DJ tells 2/7, PANEL B22 | engine | P0 | M | shipped in round 2 |
| E07 | Estimated per-track durations by rhythm and era (shown as approximate) | DJ tell 1, PANEL B09 | engine | P0 | S | shipped in round 2 |
| E08 | Locks honoured by compose: locked tandas kept in slot, counted for spacing | DJ UX 1, PANEL B01 | engine | P0 | M | shipped in round 2 |
| E09 | Track-level swap within a tanda (same orchestra/singer/period) | DJ UX 2, PANEL B03 | engine | P0 | M | shipped in round 2 |
| E10 | Feedback chips model: more energetic, calmer, more vals, simpler (re-plan unplayed unlocked tandas) | DJ UX 4, PANEL B37 | engine | P1 | M | shipped in round 2 |
| E11 | Export with or without cortinas; sanitised filenames; genre per rhythm; Traktor VOLUME/PRIMARYKEY | PANEL B28, QA H-3/L-2, DJ §6 | export | P0 | S | shipped in round 2 |
| E12 | Option sanitising: NaN hours, tanda sizes, era preset year bounds, cortina length | QA H-1, M-2, M-4, L-1 | infra | P0 | S | shipped in round 2 |
| E13 | Reference Spotify playlists file (public human benchmarks for comparison) | DJ §2 public benchmarks | data | P2 | S | shipped in round 2 |
| E14 | Mobbin-informed UX pass: theme restore, reduce transparency wired, glass only on control layer, 44 px targets, chip groups, curve axes/legend, export sheet a11y, next/font | UX §4.1-4.8, QA M-6 | ux | P0 | M | shipped in round 2 |
| E15 | Apply the musician's orchestra profile patch (energies, singer years, stints, shifts, bestYears, nonDanceTitles, rhythmOverride, fulvio-salamanca id, explicit tier on every entry) | MUS §2 | data | P0 | S | planned |
| E16 | TRACK_ENERGY corrections and ~150 additions with fame, dance, rhythm and optional year key | MUS §3 | data | P0 | M | planned |
| E17 | Sub-period profiles and period tables: subPeriods, bestYears, singerStints, singerShift, canonical singer weights (1.0/0.4/0.1), never cross a period inside a tanda, no non-canonical singer in peak or close | MUS #4, DJ tells 6/11, PANEL B21 | engine | P0 | M | planned |
| E18 | Two-axis energy (drive/physical vs weight/emotional) plus difficulty; phase targets in both axes; preferredPhaseByPeriod | MUS #2, DJ tell 5, PANEL B23, CTX §2 | engine | P1 | L | planned |
| E19 | Dramatic-tanda placement: Pugliese notBefore 0.6, notAfter 0.9, maxPerNight, followWith, hard dramatic-after-dramatic rule; 6 h arc with two dramatic slots | MUS #5, §4.3 #13, DJ H3 | engine | P0 | S | planned |
| E20 | Warm-up repertoire rules: opener only from warmupOnly years and fame ≥ 1, first cycle TTVTTM → TTTVTTM for ≥ 4 h, arc endpoints 48-56 / 62-68, phase labels, rhythm-shift-neutral target matching | MUS §4.2 #7-10, §4.3 #12, DJ tell 5 | engine | P0 | M | planned |
| E21 | Night-share cap per orchestra, same-singer gap 12, return only with a different singer, big-four spacing ≥ 9, tier-2 colour quota | MUS #8, §4.3 #14-15, DJ tell 10 | engine | P1 | S | planned |
| E22 | Catalogue cleaning pass shipped as `track_overrides.json`: placeholder years (x0), rhythm fixes (Pregonera, Con toda la voz), pseudo-singers, mis-dated Troilo 1938/1940, singer name normalisation, title casing | MUS #6, §4.1, DJ tell 13, PANEL B21 | data | P0 | M | planned |
| E23 | Duplicate recording dedupe (orchestra + title + date ± 1 day) with alternates[], "Takes (n)" grouping, same-title-different-take repeat rule | DJ tell 14, PANEL B25, PANEL 1.2 #6 | data | P1 | M | planned |
| E24 | Thin-pool degradation: relax singer gap, year spread, then gap, never silently; `warnings[]` on Playlist; minTier 3 for nuevo/contemporary; hide requireSpotify when cache empty | QA M-5 | engine | P1 | S | planned |
| E25 | swapTanda enforces orchestra gap on both sides and passes notBefore | QA M-1 | engine | P0 | S | shipped in round 2 |
| E26 | Event-type arc families: práctica high from tanda 1, marathon slot plateau from tanda 1 with no warm-up or Cumparsita, festival show slot with re-ramp, encuentro tempo ceilings | DJ tell 16, PANEL 1.2 #2, CTX §1.6 | engine | P1 | M | planned |
| E27 | Marathon-plateau cosine ease-out (no 18-point cliff after 90 %); planner/stats drift (cortina after last tanda, Cumparsita 190 vs 180 s) | QA L-3, L-4 | engine | P2 | S | planned |
| E28 | BPM and key detection (previews or local files), cached in user layer and `data/cache/bpm.json`; rubric C9 activates at ≥ 80 % coverage; per-orchestra tempo prior until then | MUS #7, PANEL B36, CTX §2.1 | data | P1 | L | planned |
| E29 | Transfer-tier tagging from album/label patterns and file bitrate; rule "prefer tier ≤ 2, never tier 4 in peak" | DJ gap 6, PANEL B35 | data | P1 | M | planned |
| E30 | Spotify enrichment cache populated (`pnpm index:enrich`) so previews and requireSpotify work | QA M-5, ROADMAP Phase 1 | data | P1 | M | planned |
| E31 | Spotify embed preview per track and cortina (30 s without login) and "Audition the tanda" strip | PANEL B06/B07, all four booths | ux | P0 | M | planned |
| E32 | Real durations from local files or Spotify cache; "≈" until ≥ 90 % measured; exports write real per-kind durations | PANEL B09, DJ tell 1 | data | P0 | M | planned |
| E33 | Clock view: start time, timeline sized by duration, "now" line, cards show 23:42-23:54, end anchor drops whole tandas | DJ UX 3, PANEL B10 | ux | P0 | L | planned |
| E34 | Anchors and specials: show/break with re-ramp tanda, vals de cumpleaños bank at a clock time, folklore/chacarera set, announcement, pinned última, second Cumparsita | PANEL B11, PANEL 1.1, CTX §1.10 | engine | P0 | L | planned |
| E35 | Three lock modes (tanda / slot / orchestra) with visible border state | PANEL B02 | ux | P0 | S | planned |
| E36 | "Played up to here" pointer, re-plan from here, played tandas immutable | PANEL B04, PANEL 1.2 #5 | ux | P0 | M | planned |
| E37 | Undo and history (last 20 states, toast undo, history drawer) | PANEL B05 | ux | P0 | S | planned |
| E38 | Override editors: song metadata (year, singer, rhythm, danceable, fame, neverPlay), orchestra profile, rules page with plain-language explanations and Default chips | PANEL B13/B14/B15 | ux | P0 | L | planned |
| E39 | Cortina library: own clips by Spotify link or local file, tags (late-night, danceable-risk, sing-along, instrumental), user-built families; cortina trimmer (startSec, lengthSec, fadeOutSec) exported as cues | PANEL B16/B08, DJ §5 (c)(d), PANEL 1.3 #3 | ux | P0 | M | planned |
| E40 | Cortina engine extras: time-of-night tags enforced, no lo-fi before 70 %, never same artist twice in a row, fallback ladder never below 6 candidates, length 5-90 s, per-tanda override, cue into next track | DJ §5 (e)(f), MUS §4.6, PANEL B42 | engine | P1 | S | planned |
| E41 | Import/export of the user layer (`tdj-user-v1` JSON, merge modes, round-trip test) | PANEL B17 | data | P0 | S | planned |
| E42 | Hand-over import and venue memory: paste or import the previous DJ's set, count against spacing; "avoid tandas played here in last N weeks"; "what I played" export | PANEL B19, DJ #10, PANEL 1.2 #1 | data | P1 | M | planned |
| E43 | Own-library import as catalog (folder scan, M3U, CSV, Rekordbox XML) with auto-profiles for unknown artists | PANEL B18, PANEL 1.4 #1 | data | P1 | L | planned |
| E44 | Local library match: folder picker, tag scan, fuzzy match with confidence, unmatched list, real absolute paths in every export | DJ #1, PANEL B27 | export | P0 | L | planned |
| E45 | Findings panel replaces the headline grade: per-tanda findings with one-tap fixes; numeric score behind a disclosure; "not scored" per criterion; verdict label only after post-night form | PANEL B26, DJ UX 7, PANEL §4 #1 | ux | P0 | M | planned |
| E46 | Ending card: Change última, Change Cumparsita (bank by ending mood, prefer orchestra from last 90 min), Two Cumparsitas toggle | PANEL B22 UI, §3.4, DJ tell 2 | ux | P1 | S | planned |
| E47 | Regional presets on the composer (cycle, sizes, cortina mode/length/cultures, era centre, Pugliese notBefore, Cumparsita count) with a one-line "what this changed"; remove inert Settings chips | DJ UX 10, PANEL B33, PANEL 1.1/1.3 #1 | ux | P1 | M | planned |
| E48 | "Tonight" panel: event type, start/end, attendance, level mix, season auto from date and hemisphere, weather chips or city fetch, hand-over; each effect switchable | PANEL B34, CTX §1.2-1.7 | ux | P1 | M | planned |
| E49 | Room sensor logging (temperature, humidity) and floor-exit rate per track to fit the heat factor; A/B the speculative numbers | CTX §4 | data | P2 | M | planned |
| E50 | Request queue: type orchestra/title, "next legal slot" proposal, place/later/decline, chips on timeline | DJ UX 5, PANEL B38, PANEL 1.3 #8 | ux | P1 | M | planned |
| E51 | Booth mode: forced dark, no transparency, 28 pt current tanda, next tanda, countdown to última, Mark played, feedback buttons, wake lock | DJ UX 4, PANEL B39 | ux | P1 | M | planned |
| E52 | Offline PWA: app shell plus index in IndexedDB, compose/swap/search in a Web Worker | PANEL B40, PANEL 1.2 #8 | infra | P1 | L | planned |
| E53 | Tanda cohesion modes (strict / loose / off), mood/BPM/key cohesion, custom cycle alphabets | PANEL B41, PANEL 1.4 #2 #5 | engine | P1 | M | planned |
| E54 | Print/PDF set list: A4/Letter, clock, rhythm, orchestra/singer, years, titles, cortina, anchors bold, orchestra heat-map page, titles-only variant | DJ UX 6, PANEL B30, PANEL 1.1 #7 | export | P0 | S | planned |
| E55 | Export sheet rework: "Where is your music?" step, formats grouped by app, Spotify as "share a preview" disabled without Client ID, remember last format | DJ UX 11, PANEL B31, §3.5 | ux | P1 | S | planned |
| E56 | Serato `.crate` writer (or honest relabel), VirtualDJ `.vdjfolder`, Engine DJ M3U8 guide, iTunes/Music XML, Mixxx crate; DJ-app paths with Test button in Settings | DJ §6, PANEL B29 | export | P1 | M | planned |
| E57 | Export content fixes: Rekordbox Comments without energy, cortina POSITION_MARK and CUE_V2 cues, CSV BOM and documented columns (clock_start, tanda_label, cortina in/out, fame, source_tier), XSPF location, M3U8 EXTGRP per tanda, versioned JSON schema; golden-file snapshot tests | QA L-2, DJ §6, PANEL B28, QA §9 | export | P1 | M | planned |
| E58 | Share link (seed, options, locks, anchors, user-layer hash; read-only snapshot for user-only songs) | PANEL B32 | infra | P1 | M | planned |
| E59 | Save, name and version sets; auto-save; per-set history | PANEL B46 | ux | P1 | S | planned |
| E60 | Post-night review form filling the rubric's human criteria; CSV export for the measurement plan | PANEL B45, DJ tell 15 | ux | P1 | S | planned |
| E61 | Keyboard map and one-hand gestures (J/K, L, S, Space, R, P, ⌘Z; long-press sheet, swipe to mark played) | PANEL B47 | ux | P1 | S | planned |
| E62 | Multiple AI providers (Anthropic, OpenAI, Gemini, OpenRouter) with friendly model labels, Test button, streaming into a status region | PANEL B44 | ai | P1 | M | planned |
| E63 | Written review rename and framing: "Get a written review", no sparkle icon, no "AI DJ", model name in small type | UX §2, PANEL §4 #2 | ai | P1 | S | planned |
| E64 | Copy pass: hero one sentence and collapsed after first compose, three facts per stat line, seed behind a copy chip, "energy 60" not "e60", phase off cards, Guide warm-up text corrected, per-page titles, Settings relabelled | UX §4.10, PANEL §3, §4 #6 #7 #9, QA §5 | ux | P1 | S | planned |
| E65 | Remaining mobile items: sticky compose bar above the tab bar, hero shrink, compact list view of tandas, cortina row on two lines, tab bar active pill | UX §3, §4.7, PANEL B50/§3.3 | ux | P1 | S | planned |
| E66 | Library page: empty and no-results states, filters (rhythm, singer, years, danceable, tier, venue history), row actions (play, Build tanda from here, Edit, Never play), ranked search | UX §1.5, PANEL §3.6, DJ UX 9, QA L-5 | ux | P1 | M | planned |
| E67 | Settings: labelled inputs, show/hide key, redirect URI in a copy field, connection status badge, fix `/settings` hydration error #418 | UX §1.6, §6 A11/A23, QA M-6 | ux | P1 | S | planned |
| E68 | Motion discipline: MotionConfig reducedMotion, animate only on data change, vinyl stops when idle, blobs frozen on touch | UX §4.11, §3 #11 | ux | P2 | S | planned |
| E69 | Fix e2e collection error (`test.use` inside describe) and add device projects so `pnpm e2e` runs | QA H-2 | infra | P0 | S | planned |
| E70 | Shared request schema (zod) for compose/swap/export with stable 400 codes, 413 body limit, `Object.hasOwn` on exporter lookup, no internal messages in errors | QA L-1 | infra | P1 | S | planned |
| E71 | Memoise `families(pool)` per option key (10 h all-eras compose 1.2 s → ~100 ms) | QA §6 | infra | P2 | S | planned |
| E72 | CI gates from the DoD: lint clean (a11y rules), typecheck, 9 of 11 `it.fails` markers already flipped in round 2; the rest removed as fixes land, p95 budgets, mobile 44 px and contrast assertions, export validator, catalogue data tests | QA §9 | infra | P1 | S | planned |
| E73 | Localisation (es, tr, de, it, fr) with Spanish DJ vocabulary kept | PANEL B49, PANEL 1.3 | ux | P2 | M | planned |
| E74 | Streaming resolvers beyond Spotify (Apple Music, TIDAL) behind the `Resolved` interface | PANEL B43, ROADMAP Phase 3 | data | P2 | L | planned |
| E75 | Accounts with encrypted BYOK and sync (Cognito, KMS envelope), local-first | PANEL B48, ROADMAP Phase 4 | infra | P2 | L | planned |
| E76 | Multi-DJ night planner with computed hand-overs and combined print | PANEL B52, DJ #10 | engine | P3 | M | planned |
| E77 | Public set gallery and Remotion set trailer | PANEL B51, ROADMAP Phase 4 | infra | P3 | L | planned |

Suggested order for round 3: E15 + E16 + E22 (data corrections, one week), then E31 + E32 + E33 (listen and clock), E35 + E36 + E37 + E45 (booth editing and findings), E38 + E39 + E41 (make it mine), E44 + E54 + E57 (exports that import), E17 + E19 + E20 + E21 (engine rules), then persona unlocks E42, E47, E48, E26.

## 3. Factors a great milonga set takes into account

Consolidated checklist. "State" says whether the engine can see the factor today.

### 3.1 Musical (what is inside a tanda)

| Factor | Rule a headline DJ applies | State |
|---|---|---|
| One orchestra, one singer (or instrumental), ≤ 4-year span | Never mix; duets count as one singer | done |
| Stylistic period, not just year span | Di Sarli 1939-43 / 44-48 / 51-55 / 56-58 are different orchestras; never cross a period inside a tanda | planned E17 |
| Canonical singer for the slot | Echagüe, Mauré, Rufino, Podestá, Fiorentino, Castillo, Campos, Vargas, Moreno, Chanel, Morán in prime slots; Lamas, Lemos, Cobos, Barbé never in peak or close | planned E17 |
| Fame of each recording | Track 1 is the one the floor knows; one fame ≥ 3 track per peak tanda | done E03 |
| Danceability | No medleys, selecciones, concert pieces (Responso, A fuego lento), solo piano, tango-canción recital sides, placeholder "singers" | done E03, data E22 |
| Energy as two axes plus difficulty | Drive (rhythmic vs lyrical) and weight (simple vs dramatic); late Troilo is low drive, high weight, high difficulty, not "gentle" | planned E18 |
| Tempo coherence inside the tanda | ≤ 6 % BPM spread; Tanturi-Castillo and Campos are different tempi | planned E28 |
| Tanda shape | Hammock by default: fame first, energy or second fame last, middle by energy ascending; no approx-year or fame-0 opener | partial E03, E20 |
| Rhythm correctness | Pregonera is a vals; Con toda la voz que tengo is a tango; apply overrides before cycle filtering | planned E22 |
| Rhythm-specific energy | Di Sarli milongas are slow and elegant (not +12), Canaro milongas are peak milongas, De Angelis valses are the legend | planned E15 |
| Transfer quality | Prefer TangoTunes/CTA-grade; never a 2008 compilation rip in the peak on a serious system | planned E29 |
| Cumparsita version | D'Arienzo 1951 after a rhythmic end, Di Sarli 1955 or Troilo 1943 after an intimate one, 1963 after a post-golden night; never an undated row | partial E06, E46 |

### 3.2 Structural (the night as a whole)

| Factor | Rule | State |
|---|---|---|
| Cycle | TTVTTM, varied so the last pre-Cumparsita tanda is a tango and the last V/M sits ≥ 1 tango earlier; TTT first cycle on long nights | partial E06, E20 |
| Warm-up repertoire | 1935-41 rhythmic (Canaro-Maida, Lomuto-Omar, OTV, Donato, D'Agostino, Rodríguez, Fresedo-Ray); never 1950s Di Sarli/Troilo, never Pugliese | planned E20 |
| Peaks | 1940-46 D'Arienzo, Biagi, Tanturi, Troilo-Fiorentino at 40-50 % and 75-88 %; Pugliese only 0.6-0.9, once per 4 h, twice per 6 h | partial E19 |
| Dramatic adjacency | Never Pugliese into Troilo-Rivero/Marino; follow dramatic with vals, milonga or rhythmic | planned E19 |
| Breath after the first peak | Target −6 at 50-60 % | planned E20 |
| Ending | Última is announced, tango, vocal, tier-1, energy ≥ 62; cool-down is emotional (vocal), not low | done E06 |
| Orchestra spacing and share | Big four ≥ 9 tandas apart; cap 2 appearances in ≤ 5 h; no orchestra over 25 % of the night; return with a different singer | partial E05, E21 |
| Variety | ≥ 5 orchestras per hour, tier-2 colour (Malerba, Racciatti, García, Demare-Miranda) one per cycle | planned E21 |
| Variety across nights | Jaccard overlap of tandas between consecutive sets at a venue < 0.15; venue memory | planned E42 |
| Vocal ratio | 0.70-0.85 of tango tandas vocal, shifted by context | partial E01 |
| Duration fit | Real seconds per recording; plan backward from the última; tolerance half a tanda | partial E07, E32 |
| Event-type arc | Práctica high throughout, marathon plateau from tanda 1 with hand-over, festival show slot and re-ramp, milonga two peaks | planned E26 |

### 3.3 Floor (what is happening in the room)

| Factor | Rule | State |
|---|---|---|
| Crowd size and density | Small: short cortinas, 3-track tandas, no Pugliese until 60 % present; packed: steadier pulses, long cortinas, valses ≤ 190 | done E01 |
| Level mix | Beginner-heavy: marcato-in-4, square phrasing, no rubato, slow milongas until 50 % | done E01 |
| Age mix and origin | Senior: lower half of each tempo band; young: D'Arienzo/Biagi heavy; tourists: canon only, no local-only codes | done E01 |
| Role ratio | Surplus of either role: 3-track tandas, more vals (speculative) | done E01 |
| Floor surface and acoustics | Slippery or sticky: fewer fast milongas and Biagi valses; reverberant: legato orchestras, −2 dB | done E01 |
| Live floor feedback | More energetic / calmer / simpler re-plans only what is unplayed and unlocked | done E10 |
| Requests | Next legal slot proposal, placed as locked | planned E50 |
| Specials | Vals de cumpleaños, show block with re-ramp, folklore set, sorteo pause, two Cumparsitas | planned E34 |
| Hand-over | Previous DJ's set counts against spacing; first tanda famous and at plateau | planned E42, E26 |
| Marking what was played | "Now playing" pointer, played tandas immutable, drift logged | planned E36 |

### 3.4 Context (before the night starts)

| Factor | Rule (shift to targets, clamped ±18 energy, ±8 BPM) | State |
|---|---|---|
| Season, hemisphere-corrected, scaled by latitude | Winter −3 energy, +0.05 vocal; summer +2 but prefer rhythmic over dramatic | done E01 |
| Weather and room temperature (room wins) | Heat > 28 °C: −7, peak cap 80, no milonga in the hottest hour, 3-track tandas, 60-90 s cortinas; cold: +3, rhythmic warm-up, short cortinas; rain: stretch warm-up 20 % | done E01 |
| Time of night | Afternoon práctica open with clear instrumentals; after midnight emotional energy replaces physical; deep night −4; sunrise slot −6 hammock | done E01 |
| Day of week | Thursday −2, Friday/Saturday +2, Sunday older crowd with longer sweet ending | done E01 |
| Event type (highest priority for V/M share) | Marathon day-2/3 fatigue, encuentro tempo ceilings, festival +4, práctica −3 instrumental, wedding famous titles only | done E01 |
| Region baseline | BsAs +2, Istanbul +3 bright and fast, Asia −2 dramatic valued, US tolerant of era mixing | done E01 (presets UI planned E47) |
| Holiday | NYE hard peak 23:30-23:55 and Cumparsita at midnight; Valentine's romantic preset; Carnival candombe tandas; Christmas sweet major-mode valses | done E01 |
| Mood request | Romantic, energetic, nostalgic, playful, elegant, dramatic mapped to orchestras, cortina pools and V/M share | done E01 |
| Daylight / latitude | Season multiplier 0.3-1.3; starts in daylight keep warm-up instrumental | done E01 |
| Auto-fill of context | Season from date, weather from city with consent, sensors for room | planned E48, E49 |

### 3.5 Technical (the booth and the files)

| Factor | Rule | State |
|---|---|---|
| Real recordings | Every row maps to a file the DJ owns, deduped, with alternates | planned E44, E23 |
| Real durations and clock | Per-recording seconds; wall-clock on every card; anchors | partial E07; E32, E33 |
| Listening | 30 s preview on every track and cortina; audition strip | planned E31 |
| Cortina as a signal | One family per night, cue-in and fade per clip, exported as cues, never two in a row by the same artist, lo-fi only late | done E04; E39, E40 |
| Exports that import | Sanitised filenames, real paths and volumes, per-tanda sub-playlists, cues, BOM, no energy noise in Comments | done E11; E44, E57 |
| Paper | A4 set list with clock and cortinas; thermal-printer text | planned E54 |
| Edits that survive | Locks, lock modes, undo, history, re-plan from here | done E08; E35-E37 |
| Mine | Override merge, editors, cortina library, own catalog, import/export | done E02; E38, E39, E41, E43 |
| Offline and one-hand | PWA, Web Worker compose, booth mode, 44 px, keyboard map | partial E14; E51, E52, E61 |
| Honest scoring | Unknown is unscored, findings not grades, human criteria after the night | done E05; E45, E60 |
| Input hygiene and tests | Schema at the API edge, invariant tests per rule, e2e running, export golden files | partial E12; E69, E70, E72 |

## 4. What still separates TDJ from a headline DJ

Ordered by how much of the remaining gap each closes, after round 2.

| # | Gap | Why it matters | Closes with |
|---|---|---|---|
| 1 | Nobody can hear anything | Every DJ on the panel refuses to play a tanda or cortina they have not heard; without previews the plan is a draft to re-check elsewhere | E31, E30 |
| 2 | Time is still estimated | Durations are rhythm/era guesses, there is no clock, no show block, no vals de cumpleaños, no última pinned to 02:50 | E32, E33, E34 |
| 3 | One energy scalar still inverts the eras | 1950s lyrical reads as warm-up, 1935 Canaro as plateau; sub-periods, canonical singers and drive/weight/difficulty are not in the engine | E17, E18, E20 |
| 4 | The knowledge is still the repo's, not the DJ's | Merge exists but there is no editor, no own cortina library with cue-ins, no own-library catalog, no import/export | E38, E39, E41, E43 |
| 5 | Exports still point at files that do not exist | Filenames are clean now, but no local match, no real paths or volumes, no cues, no print | E44, E54, E57 |
| 6 | Booth editing is half there | Locks hold and tracks swap, but no lock modes, no "played up to here", no undo, no requests | E35, E36, E37, E50 |
| 7 | The catalogue is a discography, not a DJ library | Placeholder years, duplicate rows, raw singer strings, wrong rhythms, no BPM/key, no transfer tier, profile patch not applied | E15, E16, E22, E23, E28, E29 |
| 8 | Dramatic placement and variety rules are lore the engine lacks | Pugliese into Troilo-Rivero, four De Angelis in 22, Di Sarli-Serpa twice while Rufino sits unused | E19, E21 |
| 9 | Presets and hand-over do nothing for a specific booth | Region chips inert, marathon slot still warms up, no previous-DJ import, no event-type arc | E26, E42, E47, E48 |
| 10 | The score is honest but still a grade | A number with no findings, no fixes, no human criteria, no floor data behind it | E45, E60, §5 |

## 5. Measurement plan (summary of dj-panel.md §5)

A set is good if the floor says so; everything the engine computes is a proxy to be calibrated against that.

### 5.1 Field A/B at real milongas

| Element | Protocol |
|---|---|
| Design | Same venue, DJ and slot, alternating weeks ABAB for 8 weeks, ≥ 4 venues across BsAs, European marathon, Istanbul, alternative; A = DJ's own set, B = TDJ set edited ≤ 30 min (edits logged); dancers blind |
| Primary outcome | Floor occupancy at track 2 of every tanda, normalised by headcount in the room; paired test per venue, mixed model across venues with tanda position as covariate |
| Secondary outcomes | Mid-tanda exits before track 3; cortina clear time; requests per hour and what was asked; DJ edit distance (share of planned tandas played unchanged); retention at 60/80/100 % of the night; post-night DJ form (E60) and 3-question door survey |
| Sample size | ~15 % SD between tandas, 8-point difference worth detecting: 8 nights per venue at 4 venues gives ~80 % power |

### 5.2 In-product telemetry (opt-in, no account)

| Signal | What it tells us |
|---|---|
| Time to first exported set; share of exports that import without missing files | Onboarding and export truth |
| Swaps, locks, re-plans, Same seed presses, findings acted on vs dismissed, most-swapped tandas | Which families the engine over-rates |
| Previews per set and swap-after-preview rate per family | Where the energy model is wrong |
| Mark-played cadence vs planned clock | Whether durations and cortina lengths are right |
| Feedback button presses by hour and region | Where the arc is too hot or too cold |
| Requests drawer: asked, placed, where | What the plan lacked |

### 5.3 Calibration loops

| Loop | Method and target |
|---|---|
| Rubric re-fit | Correlate each criterion with occupancy and exits across the A/B corpus; drop weight from criteria with no correlation; a 70 means "the room danced like a solid regular DJ" |
| Blind expert panel | Quarterly, four DJs score 20 anonymised sets (10 TDJ, 10 human) on human criteria; report agreement and gap; baseline is 66 vs self-reported 89 |
| Variety across nights | Jaccard overlap of tandas between consecutive TDJ sets per venue < 0.15 |
| Cortina signal | Clear time by family and position; a family whose clear time grows is being ignored |
| Duration truth | Mean |planned − actual| per tanda < 20 s after E32 |

### 5.4 Targets for end of Phase 2

| Target | Value |
|---|---|
| Floor occupancy at track 2 on TDJ nights vs same DJ's own nights | Non-inferior within 3 points at every venue; exits and pre-última departures not worse |
| DJ edit distance | ≤ 25 % of tandas changed before the night, ≤ 10 % in the booth |
| Connector exports importing with zero missing files (after local match) | ≥ 90 % |
| Preview availability | ≥ 95 % of golden-age tandas, 100 % of built-in cortinas |
| Rubric verdict agreeing with the blind panel's band | ≥ 80 % of sets |
