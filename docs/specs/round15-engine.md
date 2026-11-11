# Round 15 — engine: the second strict panel on every generation

Inputs (the spec): `docs/reviews/round15-dancer.md` (N1–N9, T1–T7, R15-1 … R15-9), `docs/reviews/round15-dj.md`
(N1–N12, T1–T6), `docs/reviews/round15-discography.md` (§1–§5, R4a–R4d, R6b, R12b, R13), and the "not met" list and
should-fix ratchet of `docs/specs/round14-engine.md` §6. Invariants: `packages/core/test/round15.test.ts`, written before
the engine change and run on the round-14 engine (§5). The panel now holds 55 rules (36 + 19); every one runs in
`compose` (the repair's acceptance rule), `improveNight` (fixer parity), `pnpm quality` (any blocker fails the run) and
the benchmark sheet (the web sheet lists every applicable rule with its source).

## 1. The round-15 rules (`packages/core/src/strict.ts`)

| Rule | Severity | What | Source |
|---|---|---|---|
| `cycle` | blocker | classic pattern: tanda *i* < última is `TTVTTM[i mod 6]`, the última a tango, never three tangos in a row, valses = milongas ± 1, the first vals starts ≤ 40 min | dancer N1 (R15-1); DJ N1 |
| `vocalSide` | blocker | a singer's tanda holds only that singer's sides; an instrumental tanda no sung side | discography R6b |
| `afterSummit` | should-fix | the tanda after the last summit: energy ≥ summit − 18, not a lyrical (L) tango, the cue between not slow | dancer N2; DJ N3 |
| `energyStep` | should-fix | adjacent tandas ≤ 16 apart; 20 for a planned lift or release (into a summit, or the plan itself moves ≥ 8 the same way) | dancer N8; DJ N11 |
| `hotCold` | should-fix | an R+ tanda > 8 over its target straight into one > 10 under its target while the plan rises: boundary sides within 15 | DJ N2 |
| `firstVals` | should-fix | the warm-up vals ≤ target + 10, its last side ≤ target + 15 | DJ N8 |
| `lastSummit` | should-fix | the last summit holds a fame-5 side, mean fame ≥ 3.75 | dancer N5 |
| `ultima` | should-fix | golden core, every side fame ≥ 3, mean ≥ 4, within 0.75 of the night's best vocal tango tanda | dancer N7; DJ N4 |
| `bestWindow` | should-fix | mean fame within 0.75 of the family's best streamable window still free tonight (years another tanda of the family plays are taken; a D'Arienzo summit is judged inside DJ S2's years) | dancer N6; DJ N8 |
| `instrCharacter` | should-fix | two adjacent instrumental tango tandas (tango-only sequence) differ in coarse class (rhythmic vs L, B, D) | DJ N5 |
| `stream3` | should-fix | a 3-side tanda: every side streams, none fame 0 | dancer N3; DJ N7 |
| `streamNight` | should-fix | ≤ 1 unstreamable side a night, and only when the family has no streamable alternative in the tanda's years | DJ N7 |
| `suspectStream` | should-fix | no suspect-stream side (R4b–R4d) in the opener, a summit or the última | dancer N9 |
| `cueLength` | should-fix | every cue within the setting ± 5 s, never over 50 s (unless the setting itself is longer) | dancer N4; DJ N6 |
| `cuePopPeak` | should-fix | no dance-pop cue (mood:pop/club, Araba now tagged pop) straight before a summit or the última | DJ N9 |
| `cuePopHour` | should-fix | at most one pop or rock cue an hour (the round-14 S9 leftover) | DJ N9 |
| `cueMeta` | should-fix | every cue has a year and its original record (no duet, live, remix, re-recording album) | discography R12b |

`bestWindow` and the "no alternative" half of `streamNight` read the catalogue the last `Catalog` registered
(`active.ts`); without one (a browser view of a JSON) they read n/a.

## 2. Data (discography §4)

- `scripts/build_index.py` `apply_round15`: Recuerdo `79264f596c` (Tanturi 1942-11-04) instrumental; titles El Último
  Adiós, ¡Cómo Has Cambiado, Pebeta!, Mirame de Frente, Fru Fru (alt Frou Frou), Milongueando en el 40 (alt "… en el
  Cuarenta"; the catalogue's fame join now follows `altTitles`, so the retitled works keep their corpus fame and Mirame
  de Frente gains its fame 4); **R13** `rhythmCode` recomputed from `rhythm` after every patch (66 rows changed; a T/V/M
  code on another rhythm reads ND, source codes of other genres are kept).
- **Stream audit** (`packages/core/src/streams.ts`, `scripts/audit_streams.ts`, run by `pnpm index:build` after the
  Python build; exits 1 on R4a or R4b): **R4a** 153 stream ids were bound to rows of different dates, orchestras or
  singers (146 in the review's count); `--fix` kept each on its keeper (a dated stream title within 31 days; else the
  row whose year the album title spans; else the row whose singer — or instrumental mode — the credit names; else the
  earliest dated row) and cleared 357 cache entries. The review's cases all land: Milonguero viejo 6824859 on the 1940
  row, Corazón on Rufino 1939, El incendio on 1940, La catrera on 1938, Humillación on Ortiz 1941, La mulateada on
  Rufino 1941, Recuerdo 1903385817 on the 1941 vals. **R4b** (dd/mm/yyyy in the stream title vs the row, ±31 days): the
  Recuerdo match is dropped (catalogue and cache). **R4c**: when Spotify and Deezer disagree by more than 8 s the side
  takes the Deezer length (8 rows; Pensalo bien 2:17 → 2:30). **R4d**: a credit naming an index singer the row lacks
  marks the side `streamSuspect` (8 live matches: Tengo mil novias "cantan Armando Moreno", Retintín and Don Esteban
  "canta Alberto Echagüe" on instrumental rows, Amurado, Calla corazón …). The review's "check by ear" for Tengo mil
  novias is therefore kept off the opener, summit and última chairs until a listen clears it.
- Cortinas (`data/knowledge/cortinas.json`, `data/cache/resolve/cortinas.json`): years from MusicBrainz first-release
  dates and Deezer album dates — Sil Baştan 2001 (Perdeler), Haram Geceler 1992 (Yine Yeni Yeniden, Nilüfer's solo
  studio album; tagged `audio:original`), Yaz Gazeteci Yaz 1976 (Selda), Bu Kalp Seni Unutur mu 1993 (Yana Yana),
  İstanbul'da Sonbahar 2001 (Gönülçelen), Leylim Ley 1975 (Eşkiya Dünyaya Hükümdar Olmaz). Re-resolved to the
  original records: İşte Öyle Bir Şey (album "İşte Öyle Bir Şey", 3:00, not "Altın Düetler"), Göreceksin Kendini
  (the 1973 single, 2:21, not "Yeniden Yetmişe"), Azzurro (not the Arena di Verona live). Ben Sana Vurgunum stays on
  Melankoli (Deezer album date 1978-06-02: the original). Nina Simone's only match is the HONNE remix: tagged
  `no-audio`. `candidatesFor` drops cues without a year or with re-recorded audio while eight others remain.

## 3. Composer, builder, repair

- **Cycle** (`arc.ts` `planSlots`, `compose.ts`): a classic night's slot count never puts the última (always a tango)
  on a V/M chair (the nearer legal count wins); a vals or milonga slot never turns into a tango — the first choice
  failing, a second-choice family of the same rhythm among the gap-free ones (any phase, caps relaxed, the D'Arienzo
  and Pugliese holds kept), and for a golden late or hot slot that still lands under the fame floor, a known family
  that streams (another family of a played orchestra allowed) three chairs from its orchestra's last tanda (the gap a
  should-fix rather than a fame blocker). The round-14 known regression (S11's three tandas off the cycle; seeds 255
  and 97 with no vals for 80 minutes) is gone: every composed night of the golden set and the panel seeds follows
  TTVTTM.
- **Clock** (`fitLength`): cue jitter ±4 s, the fit stretches or shrinks the cues by 5 s at most (round 11: +15), a
  cue is never outside the setting ± 5 or over 50 s; the night is met with tandas — on the cycle only the chair before
  the última may be dropped and a chair added there takes the cycle's rhythm, each only to a legal count. Nights land
  within one tango tanda of the hours (most within 3 min).
- **Summits**: on a golden night of < 5 h the first summit takes the D'Arienzo instrumental summit family (1937–40) and
  the last one D'Arienzo–Echagüe 1938–39 (Pensalo bien, No mientas, Ansiedad: fame 5) — dancer N5 (the reverse of
  round 14).
- **Última**: the reserved closer of a golden night must hold a tanda of beloved core-years sides that stream (every
  side fame ≥ 3, mean ≥ 4); the repair's `bestSides` rewards it and an `ultimaEdits` phase may give the última to
  another core vocal closer family (D'Agostino, Di Sarli, Troilo, Tanturi, Biagi, Caló).
- **Warm-up vals**: the first vals of a golden night is the coolest family that can fill it with known, streamable
  sides, whatever the phase tables (Caló–Iriarte 1943–45 at e62 before Rodríguez–Flores at e79).
- **Builder** (`tanda.ts`, golden 4 h): sides that stream first while the family has enough (a 3-side tanda never a
  fame-0 side); new weighed predicates: step ≤ 16/20, no lyrical release after the last summit, adjacent instrumental
  character, the warm-up vals ≤ target + 10, the family's best window, the last hour's instrumental (after the
  Echagüe summit); `runOk` and the hourly instrumental now weigh 3. On a golden night the early D'Arienzo may take the
  1935–36 hits (the summit's years are 1937–40).
- **Repair** (`repair.ts`): the new rules count in the penalty and as structural targets (swaps); targeted
  replacements for energyStep (either side, a family within 14 of its neighbours), afterSummit, firstVals,
  lastSummit (a rhythmic family with a fame-5 side), instrCharacter; the boundary reorder for hotCold (every
  last/first pair within 15); `bestSides` streams every side on a golden night; `recue` keeps no slow cue after the
  last summit, no dance-pop into a summit or the última, ≤ 1 pop/rock cue an hour, and prefers a cue heard earlier (not
  within four) that passes the panel to a fresh one that does not. `compose` gives a night with should-fix items two
  extra draws (was one).
- **Benchmark**: `cortinaLength` reads the setting ± 5 s (≤ 50 s) instead of the corpus 30–90 s band (a 58 s cue on a
  45 s night is no longer "ok"). `pnpm quality` also composes the three reviewed seeds (255, 97, 156) and fails on any
  blocker; S11's known cycle regression is removed from its "known" list.

## 3b. Song order, night shape, export matching (the user's additions to round 15)

- **Song order** (`order.ts` `orderVerdictOf`, strict `sideOrder`, should-fix): inside every tanda an inviting opener
  (fame ≥ 3 when the tanda has such a side, never the one slowest side), no dip mid-tanda (a side 10 under both
  neighbours), the best-loved side last or third, no title twice in a row, no back-and-forth across the years. The
  verdict is a cost term (3 per item) inside `strictOrder`, so the builder, the repair's reorder phase and every
  fixer order sides by it, under the older corpus-role and panel rules (10–20 each). The dump prints the per-tanda
  verdict ("order ok" or its items); the benchmark sheet lists the rule's violations with their tandas.
- **Night shape as settings** (`NightRules`): `openerOrchestra`, `ultimaOrchestra` + `ultimaSinger` (null =
  instrumental), `closer` (`auto` | `in-range` | `felicia` | `none`), `warmupTandas`, `cooldown` (`lift` | `gentle`),
  besides `openerRule`, `ultimaRule`, `openWithCumparsita`, `closeWithCumparsita`. The composer honours them (the named
  opener's families first; the named última reserved like the drawn one and built first; Felicia or no closer); a
  setting the year range cannot meet falls back and says so (`stats.settingFallbacks`, shown in the result footer).
  The strict `nightShape` rule (blocker) reads the settings, not hard-coded families, and accepts a recorded
  fallback; the repair's slot rules and `PARETO` keep it (no edit moves the opener, the última or the closer off the
  setting), and improveNight's fixers cannot add a blocker. The web Composer exposes Open with, Última with, Closer,
  Warm-up and Cool-down (persisted with the night's options). `nightShapeLine` prints "Night shape: opened by …,
  última …, closer …" in the dump and in `docs/quality/latest.md`.
- **Export matching** (`packages/core/src/matchRules.ts` `matchProblem`): a candidate is rejected when it names
  another work (Marchantia is not Marcheta; alternative titles count), names neither the orchestra nor the singer,
  credits a singer on an instrumental side or another voice on a sung one, carries a recording date or an album era
  that is not the row's, or runs outside −14 … +8 s (+16 for a restoration) of a known (never estimated) length. The
  web matcher (`apps/web/src/lib/match.ts` `rejectReason` in `bestMatch`, the server route and the browser path), the
  DJ's remembered matches (`spotifyPlanFor` / `storedMatchOk`, the browser cache in `resolveTrack`) and the ids a
  night's JSON carries all pass through it; a rejected stored match is dropped and the side searched again. The
  Export sheet lists every side it could not match ("Not matched", never a silent skip); the playlist order is the
  night's (orderSpotifyUris unchanged). **Cache audit** (`scripts/audit_spotify.ts`, a `pnpm quality` gate): **377
  cached Spotify ids checked, 91 rejected and cleared** (wrong works such as "Vamos México" for a Libertad Lamarque
  row, sung credits on instrumental rows, other singers, Spotify transfers off the Deezer length); 286 remain, 0
  rejected. A later album counts when its first year is more than two after the recording (the e2e's D'Arienzo
  Cumparsita trap on a "1956-1958" album found the first threshold, five years, too loose). `pnpm index:enrich` was not re-run (the cleared rows are searched at export under the same rules).

## 4. Variety (dancer T1, DJ T3)

Not done beyond what the rules changed (the warm-up vals, the summit order and the última fame floor move tandas
between seeds). The Láurenz–Casas tanda repeats because the family has exactly four sides the corpus knows; a
cross-seed overlap rule (round-14 T7, "≤ 50 % with the user's last nights") needs the user's history and stays open.

## 5. Invariants written first, and what they found on the round-14 engine

`round15.test.ts` as first written (38 tests) failed 28 on the round-14 engine and index: every data test except
R12b (the pool filter landed with the test), 14 of the 17 panel rules (`vocalSide`, `hotCold`, `suspectStream`,
`cueMeta` passed), the cycle test, the clock test, the benchmark cortina-length test, the 3-side stream test and the
title test. Measured with the round-15 panel on the round-14 engine (golden set S1–S12 + featured seeds 255, 97, 156,
148, 36): **11 blockers (cycle 10, fameMean 1), 421 should-fix** — cueLength 163, energyStep 48, streamNight 25,
stream3 18, firstVals 17, afterSummit 15, cuePopHour 14, bestWindow 12, lastSummit 8, ultima 5, cuePopPeak 3,
instrCharacter 2, and the round-14 rules (opener 20, lastSide 17, cueDramatic 13, peakHits 11, cueArtist 11, rotation
6, …). The golden set's engine scores read 81–88 under the wider panel (its strict factor counts every should-fix).

## 6. Numbers, and what is left

- **Golden set S1–S12** (default 4 h, `pnpm quality`): engine 89, 89, 88, 88, 87, 90, 90, 90, 89, 90, 87, 89
  composed → 89, 90, 88, 89, 87, 90, 90, 90, 89, 90, 87, 90 improved (all ≥ 85; round 14: 85–91); benchmark 79–91.
  Strict panel: **0 blockers on every composed and improved night** of the golden set, the featured options
  (seeds 181, 255, 97, 156) and the 17 test nights; `pnpm quality` passes (the shipped featured JSON, reported only,
  re-scores 7 blockers / 61 should-fix). The stream audit gates the run: 286 cached Spotify ids, 0 rejected; shared
  stream ids 0; dated stream titles off their row 0.
- **The 17 test nights** (golden set + featured seeds 255, 97, 156, 148, 36), composed, measured with the round-15
  panel: round-14 engine **11 blockers, 421 should-fix** → now **0 blockers, 237 should-fix**, of which 91 are the
  new song-order items (`sideOrder`, which did not exist; weighted ¼ in the penalty) — 146 without them. Round-15
  rules: cueLength 163 → 0, streamNight 25 → 0, stream3 18 → 0, cuePopHour 14 → 10, energyStep 48 → 30, afterSummit
  15 → 6, firstVals 17 → 12, bestWindow 12 → 3, lastSummit 8 → 7, ultima 5 → 0, cuePopPeak 3 → 0, cycle 10 → 0.
  After improveNight the golden set holds 129 should-fix (57 sideOrder; round-14 rules 42, ≤ 46).
- **The round-14 should-fix ratchet** (round14.test.ts, its 17 nights): opener 14 → 23, lastSide 16 → 15, peakHits
  10 → 10, instrHour 4 → 6, cueDramatic 9 → 9, rotation 4 → 0, wedge 4 → 5, cueArtist 4 → 1, rhythmicRun 2 → 3,
  cueVals 1 → 1; new entries gap 3, colourBudget 4, lastFour 1 (each test names its reason). The ratchet **rose** on
  opener, instrHour, wedge, rhythmicRun, gap, colourBudget and lastFour: the hard cycle takes a tango chair out of the
  first five slots and never moves the última; the Echagüe last summit sends Biagi, Tanturi or Troilo to the first
  summit and the last hour loses its D'Arienzo instrumental; the song-order cost inside `strictOrder` trades some
  famous openers for an inviting, non-slowest one; a famous vals four chairs from its orchestra beats an unknown one
  (a fame blocker). Older invariants relaxed with a round-15 note in each test: night length within one tango tanda on
  the classic cycle (was half a tanda / 6 min), the cortina-variety Jaccard < 0.83 (0.8), the corpus-role order tests
  skip sets that allow no order keeping every rule, a vals chair is no sawtooth in long nights (≤ 2), H5 ≤ 2, one of
  24 nights may sit at a vocal share of 0.5. Restored: the S11 cycle regression (gone), the first D'Arienzo is never
  given away by a targeted edit (round-4 A3).
- **300-seed sweep** (featured options, compose + improveNight; scratchpad best7): engine 85–92 (median 89; 300/300 ≥
  85), benchmark 75–91 (median 88). Zero blockers on 299/300; **no night is strict-clean** (violations per night 7–25,
  median 17, sideOrder in all 300). Most frequent: sideOrder 300, cuePopHour 291, energyStep 257, opener 256,
  afterSummit 223, lastSummit 223, peakHits 208. Top three (fewest violations, then engine, benchmark): seed 12 (7: opener,
  rhythmicRun, energyStep, cuePopHour, sideOrder; engine 92, benchmark 91), seed 180 (8; 91 / 91), seed 194 (9; 92 /
  88).
- Tests: core 388 (was 341), all pass; web vitest 59 (51); e2e 131 pass, 1 skipped (round15-export.spec.ts new; the
  connectors mock's "right recording" now carries no length, the history and API-timing specs wait longer for a
  golden compose of 3–5 s, the night-length bound reads one tango tanda). `pnpm build` and the typechecks pass;
  `pnpm quality` passes.

Left, and why:

- `firstVals` (12): the default golden arc plans the first vals at 50 and the index's warm-up-worthy valses (known,
  streaming) sit at e62 or more (Caló–Iriarte is the coolest), so the S nights miss by 2; the featured options pass.
- `energyStep`, `afterSummit`, `lastSummit`: the lift into the Rodríguez–Flores vals, the release after a summit into
  the Caló / Di Sarli lyrical families, and nights where only the D'Arienzo instrumentals can reach the last summit's
  energy (the 1937–40 instrumentals hold no fame-5 side in the corpus); the greedy repair cannot do the swap-then-
  replace these need.
- `cuePopHour` (291 sweep nights): the Turkish pool's up-tempo cues are mostly pop or rock; the re-cue prefers a fresh
  cue to a pop-free repeat (the round-9 rule "never the same cue twice").
- `sideOrder`: a quarter-weight should-fix; most items are corpus-opener/closer roles that conflict with "not the
  slowest side first" and "the best-loved side last or third".
- Variety (§4), a listen for the R4d-flagged matches, `pnpm index:enrich` (the 91 cleared Spotify rows are searched at
  export under the same rules), README media — not done.
