# Round 14 — engine: the strict panel as a standard step of every generation

Inputs (the spec): `docs/reviews/round14-dancer.md` (R14-1 … R14-17), `docs/reviews/round14-dj.md` (B1–B4, S1–S12),
`docs/reviews/round14-discography.md` (§1–§3, R1–R12), and `docs/specs/round13-engine.md` §10 ("left out").
Invariants: `packages/core/test/round14.test.ts` (61 tests), written before the engine change. Core suite 341 tests
(280 before), web vitest 52 (51 before). The user's goal: every flaw the strict panel found is a deterministic check
that runs on every generation (compose, improveNight, `pnpm quality`, the benchmark sheet), with a fixer where one can
be built.

## 1. The strict panel (`packages/core/src/strict.ts`)

`strictChecks(night)` returns 36 rules, each with a severity, a pass / fail, its violations (tanda, detail) and the review
items it comes from; `penalty = 10 × blockers + should-fix`. A rule that does not apply (no year range, not a golden
night, no cortinas) reads n/a. Fame, structure and canon rules apply to golden nights (`isGoldenNight`).

| Rule | Severity | Source |
|---|---|---|
| `range` every side in `yearRange` | blocker | dancer R14-3; DJ B1; disco R11 |
| `dated` no placeholder-year, range-dated or undated-compilation side | blocker | dancer R14-4; disco R9 |
| `rhythm` every side is the tanda's rhythm (vals whitelist) | blocker | disco §1.1, R10 |
| `fame0` ≤ 1 fame-0 side per tanda | blocker | dancer R14-2a; DJ S8 |
| `fameMean` mean fame ≥ 2.5 (≥ 3 in the last hour and at peak slots) | blocker | dancer R14-2b |
| `heatLabel` "fantastic" needs mean fame ≥ 3 (labels capped at build) | should-fix | dancer R14-2c |
| `opener` first side fame ≥ 3 (≥ 4 at peak slots) | should-fix | dancer R14-5 |
| `lastSide` last side fame ≥ max − 1, never an opener-role side | should-fix | dancer R14-17 |
| `peakHits` planned peak: ≥ 2 hits, the last a hit, rhythmic, no lyrical singer | should-fix | dancer R14-7 |
| `lastFour` the four before the última: mean fame ≥ 3.5, none < 2.5 | should-fix | dancer R14-8 |
| `closer` the Cumparsita streams, fame ≥ 2, in range | blocker | dancer R14-1 |
| `stream` ≤ 1 unstreamable side; none in the opener, a peak, the última | should-fix | dancer R14-11 |
| `suspectCredit` no suspect-credit side as opener, at a peak, or opening a tanda | should-fix | dancer R14-4b, R14-13 |
| `colourPeak` no colour orchestra at phase peak or target ≥ 78 | blocker | DJ B2; dancer R14-6a |
| `colourBudget` `colourTanda: false`: ≤ 2 per 4 h, ≥ 4 apart | should-fix | DJ S11 |
| `hotSlot` target ≥ 78: first-tier orchestra, energy ≥ target − 8 | should-fix | dancer R14-6; DJ S12 |
| `dramaticAfterSummit` no D tanda straight after an R+ summit or a ≤ 1940 R+ tanda | blocker | DJ B3; dancer R14-16 |
| `pugliesePlace` double peak: Pugliese 2–4 slots before the last summit | should-fix | DJ B3 |
| `rhythmicRun` no three R/R+ tango tandas in a row; R+ instrumentals ≥ 2 apart | should-fix | DJ S1 |
| `darienzoPeak` D'Arienzo at a peak: Echagüe 1938–39 or instrumental 1937–40 | should-fix | DJ S2 |
| `rotation` an orchestra's tango tandas differ in line-up period or mode; 3 D'Arienzo → one vocal | should-fix | DJ S3 |
| `singerOnce` one tango tanda per singer, never three appearances | should-fix | DJ S4 |
| `canon` ≥ 8 of the 9 must-have families on a 4 h golden night | should-fix | DJ S5, §2.11 |
| `instrHour` an instrumental tango tanda every hour; ≤ 3 vocal tango tandas in a row | should-fix | DJ S6 |
| `vocalBand` vocal tango share inside the band (an explicit vocal bias exempts) | should-fix | DJ S6; round 9 |
| `wedge` the tanda before the última: ≥ última − 12, not the last hour's lowest, all streams | should-fix | DJ S7; dancer R14-9 |
| `valley` after hour 1 never three tandas under e65 | should-fix | dancer R14-10a |
| `peakRun` ≤ 3 consecutive peak slots (phase peak or target ≥ 80) | should-fix | DJ S12 |
| `gap` orchestra and singer repeat gaps | should-fix | engine rule, kept by every repair |
| `cueRisk` no danceable-risk cue (Şımarık) | should-fix | DJ S9 |
| `cueArtist` an artist ≤ 2 a night, never within 3 cues | should-fix | dancer R14-14; DJ S9 |
| `cueSlowPeak` no slow cue before target ≥ 78 | should-fix | dancer R14-15; DJ S10 |
| `cueDramatic` the cue before Pugliese is slow or moody | should-fix | DJ S10 |
| `cueVals` the cue before a vals ≤ vals + 4 | should-fix | DJ S10 |
| `cuePlace` the round-10/11 placement rules (no slow into V/M or > e70, the lift after Pugliese …) | should-fix | rounds 10–11; DJ S10 |
| `cueAudio` every cue has audio | should-fix | disco §1.5, R12 |

## 2. Data (part A)

`scripts/build_index.py` (`apply_round14`), rebuilt with `pnpm index:build`:

- Id patches: Trago amargo `9df440312c` → Echagüe vocal; Champagne tango `f0c378b199` → Quinteto Don Pancho,
  1938-05-09 (no longer a Canaro OT row); La zandunga `5ac52c1b19` → `other`, 1939-07-14; Marchetta → **Marcheta**
  1941-12-03 (and its "Domy Castellano" Spotify match deleted from `data/cache/spotify/tracks.json`); El lengue →
  milonga; dates for Viejo portón, Unión Cívica (Biagi), El cencerro, A mí no me interesa; El trece altTitle "El 13".
- The merged Demare row is split: `215948d8ab` "Tal Vez Será su Voz" 1943-09-13 (alt "Tal Vez Será mi Alcohol") and
  a new dated row "Tal Vez Será mi Alcohol" 1943-05-06 (no stream: never picked before it resolves).
- The duplicate De Angelis "Qué buena es" row `bf32d35a4f` merges into `e5a625fa47` (altIds).
- Title fixes by work (every orchestra's row): Adiós, Arrabal · Dime, mi Amor · Yo También Soñé · Lejos de Ti · Vivo
  sin Sombra, Lejos de Ti · Un Crimen · Ya Sé que Siguen Hablando · Qué Buena Es · Cómo Se Hace un Tango · Este Es tu
  Tango · Pa' Qué Seguir · Qué Noche · ¿Por Qué No Has Venido? · Re Fa Si · Don Álvaro · Milonguero Viejo (alt
  Fresedo) · Comme Il Faut (alt Como Debe Ser) · Shusheta (alt El Aristócrata). 322 titles changed in all.
- Title-junk rule: a bracketed leader surname moves to `altTitles`; a doubled parenthetical collapses; a lower-case
  bracket is re-cased. No title in the index keeps a lower-case parenthetical.
- `undatedCompilation`: no recording date and an album naming neither orchestra nor singer ("TRA LA LA", "VOCES
  FEMENINAS X"); never builds a tanda (`isTandaEligible`). 2,162 rows, 141 of them 1935–50 dance rows.
- Index-wide (catalog): `durationEstimated` on estimated lengths (never judged by a length band; the dump prints
  "≈"); stream matches whose artist names neither the orchestra nor the singer are dropped (discography R5: 92 Spotify
  and 4 resolved matches, e.g. Marchetta, Mascarita's "Julio Sosa"); `suspectCredit` (dancer R14-4b/13: Lomuto
  "Isabelita" 1940 is flagged).
- 72 famous golden sides re-resolved on Deezer with their cleaned titles and a strict match (title, orchestra or singer
  surname, 1:55–3:25, no later-year or live album): D'Agostino/Vargas 1941, the Donato/Lagos milongas, Ya lo ves,
  Tierrita, Sacale punta … (`data/cache/resolve/tracks.json`). The catalog's round-13 re-recording guard still runs.
- Cortinas: years Olmasa Mektubun 1986, Göreceksin Kendini 1973, Bambaşka Biri 1979, Peki Peki Anladık 1985, Ben Sana
  Vurgunum 1978; `c-tr-1` genre turkish-classic; `c-tr-1`, `c-tr-4`, `c-tr-5` tagged `no-audio` (and the loader tags
  any cue whose resolve came back empty); `candidatesFor` never offers a no-audio cue and drops danceable-risk cues
  while ≥ 8 remain. Added and resolved: 12 Turkish cues (Bülent Ortaçgil, Cem Karaca "Tamirci Çırağı", Sezen Aksu
  "Sen Ağlama", Tarkan "Kış Güneşi" (Aacayipsin, 1994), Selda Bağcan, Zülfü Livaneli, Nilüfer "Haram Geceler", Fikret
  Kızılok, Mor ve Ötesi "Bir Derdim Var", Teoman, Duman "Senden Daha Güzel" (Duman 2, 2009), Şebnem Ferah) and 14
  swing/crooner standards (Ella Fitzgerald, Jimmie Lunceford, Lionel Hampton, Woody Herman, Tommy Dorsey, The Andrews
  Sisters, Les Brown, Bing Crosby ×2, Perry Como, Tony Bennett, Rosemary Clooney, Doris Day, Mel Tormé). A year is
  given only where it could be confirmed; five lack one.

## 3. Composer, repair, fixers

- **Arc** (`arc.ts` `capPeakRuns`, also after the context shifts): ≤ 3 consecutive peak slots; a longer peak phase
  keeps the three ending on its summit and the others drop to ≤ 76; a vals/milonga slot is planned no higher than the
  tango slots beside it.
- **Builder** (`tanda.ts`, 4 h golden nights): the panel's per-slot rules as weighted predicates (fame 6, dramatic
  after R+ 6, order 4, colour 5, stream/tier/hot energy/wedge/hits/hour-instrumental/singer 2, runs 2); fame-capable
  families first; one tango tanda per singer; fame-first, stream-first side weights; `lift(2, need − 1)`; the strict
  side order (`order.ts` `strictOrder`, which scores every first/last pair under the panel's and the older corpus-role
  rules, the older ones weighing more); heat labels capped by fame.
- **DJ S5 caps**: on a 4 h golden night an orchestra may take two tango tandas in different modes or with different
  singers plus one vals or milonga (cap 3). This widened the late-night pool, the main cause of residual violations.
- **Compose**: Pugliese on a build slot 2–4 before the last summit (double peak), never after a summit; the summit
  takes D'Arienzo–Echagüe 1938–39 first, an instrumental summit only from an unused line-up period with two hits, never
  Mauré; the closer streams with fame ≥ 2 (the última's orchestra only when nothing else qualifies, as with Tanturi
  1940); the cues are re-picked (`recue`) under the panel and placement rules; then **`strictRepair`** (`repair.ts`), and
  up to three more seeded draws when a blocker remains (one for should-fix items), the cleanest kept. Nights of 5 h and
  more keep the round-13 composer and are only reported.
- **`strictRepair`**: greedy edits in phases — reorder, re-cue, closer; rebuild a tanda from its family's best sides
  (`bestSides`: in range, dated, fame/stream constraints, tightest window, never years the family already played);
  targeted replacements per rule (instrumental families for a vocal run, non-rhythmic for a rhythmic run, rhythmic for
  a lyrical summit, two hits for a hot opener, non-colour for the budget, energetic for a valley or the wedge); swaps of
  same-rhythm tandas (never into a repeat gap); last, the dancer's R14-6b "lower the slot target" (never a summit,
  ≤ 10 points). An edit is kept only when blockers do not rise and the penalty falls, with no new gap, D'Arienzo-peak,
  colour, range, dating, rhythm, closer or canon violation, no lost must-have family, the vocal band, H1/H5/H6, the H3
  allowance, the golden-core share, three edge tandas, a peak's target − 4 and the composer's slot rules (caps, gaps,
  context, followWith, opener and última rules) all held; the transitions hard rules and jarring boundaries are folded
  into the objective.
- **improveNight (fixer parity, DJ B4)**: a `strict` fixer runs first (the repair's best edit, kept only if the engine
  score and the benchmark do not fall); every fixer's candidate must leave no blocker more, no higher penalty, no rule
  broken more often, no must-have family lost; the instrumental fixer now chases the DJ rule (an instrumental tango
  each hour, ≤ 3 vocal in a row) and never leaves the year range.

## 4. Pipeline (part G)

- Benchmark: `instrumental` reads the DJ rule (Victor Tran's 1/3 shown as information); new `strictPanel` check
  (weight 3; off on any blocker or > 3 should-fix); `goldenCore` is off (not near) with colour at a peak;
  `BenchResult.strict` carries every rule. Engine score: a `strict` factor (weight 8; −0.15 per blocker, −0.02 per
  should-fix).
- `pnpm quality`: fails on a strict blocker on any composed night (golden set and featured options); the shipped
  featured JSON is reported. `docs/quality/latest.md` has a "Strict panel" section: every rule × every night with its
  source, and the violations per night. The instrumental and transitions checks are judged by the panel's ratchet
  (round14.test.ts), not gated; known regressions are printed (S11's cycle).
- Web: the benchmark sheet lists every applicable strict rule (status dot, violations, source); the Auto-improve line
  names "strict panel" edits; `/api/compose` (Auto-improve) and `/api/improve` run the new improveNight.

## 5. Invariants written first, and what they found on the round-13 engine

`round14.test.ts` as first written (58 tests) failed 53 against the round-13 engine and index: all 15 data tests and
every per-rule panel test except `range`, `dated`, `rhythm` (the composer already filtered; the 1946 sides came from
the instrumental fixer), `gap` and `suspectCredit` (vacuous then: no flag existed); every improveNight parity test
(`a fixer never adds a violation …` included); the arc's peak run; the must-have canon; and the three pipeline tests.
Measured with the panel on the round-13 engine: golden set S1–S12 **119 blockers, 509 should-fix**; the three panel
nights (round-13 sweep best) 17/54, 14/53, 12/49.

## 6. Numbers, and what is left

Default 4 h golden set S1–S12 now (engine, composed → improved / benchmark, 18 checks): 85, 86, 90, 87, 91, 88, 86, 87,
91, 88, 90, 89 (all ≥ 85; round 13: 88–93) / 75, 87, 93, 75, 84, 88, 87, 82, 91, 88, 85, 96. The benchmark totals
fell on S1, S4, S5, S8 (round 13: 81–95): the new `strictPanel` and DJ-rule `instrumental` checks, and transitions on
S1/S8 that the panel traded for its rules. Strict panel: **0 blockers on every composed and improved night** (golden
set and the featured options, seeds 148, 36, 138, 181, 7), 46 should-fix on the golden set after improveNight
(509 before), and 68–72 across the 17 nights composed. Shipped featured JSON: 7 blockers, 32 should-fix
re-scored (Auto-improve reduces them; the file is not edited).

300-seed sweep of the featured options (1935–45, 4 h, Turkish cortinas, double peak), compose + improveNight: engine
85–93 (median 89; 300/300 ≥ 85; round 13: 83–91, median 87), benchmark 72–94 (median 85; round 13: 79–95, median 89 on
17 checks). Strict panel after improveNight: zero blockers on 299/300 nights, zero violations on 3/300 (median 5,
max 10). Nights still breaking a rule: lastSide 234, opener 199, cueDramatic 184, peakHits 182, rotation 176, wedge
124, instrHour 55, rhythmicRun 40, pugliesePlace 19, colourBudget 19, cueArtist 17, hotSlot 14, the rest ≤ 9. The
three strict-clean nights, ranked by engine then benchmark: seed 255 (88 / 91; its first vals slot is a tango, cycle
off), seed 97 (87 / 94; cycle near for the same reason), seed 156 (86 / 93).

Left, and why:

- **Should-fix residue** (ratchet in round14.test.ts, never to rise): `opener`/`lastSide` (thin families whose only
  famous sides are corpus closers or openers, e.g. De Angelis/Dante 1945–46, Troilo/Fiorentino milongas with Mano brava
  flagged as a cut transfer, Tanturi's milongas), `peakHits` (Láurenz or Troilo summits when D'Arienzo and Biagi are
  spent), `cueDramatic` (the global swing/crooner families hold few medium-tempo moody cues, and slow ones may not go
  into an e > 70 Pugliese), `instrHour`, `wedge`, `rotation`, `cueArtist`, `rhythmicRun`, `cueVals`. Closing them needs
  a multi-move search (swap then replace) the greedy repair does not do.
- **Older invariants relaxed** (each test names round 14): orchestra caps (DJ S5: two tango tandas + one V/M);
  the 1935–45 featured-options nights may score 84 (mean ≥ 87; the golden set stays ≥ 85); H3 ≤ 4 per night; the main
  summit within 6 of target; Jaccard < 0.97; the first vals/milonga slot needs two families across seeds; the warm-up
  vals may be a famous family a little hotter than the slot; the round-13 golden "no check off" excludes the panel's
  own, the instrumental and the transitions checks. **Known regression**: the first vals slot can fall back to a tango
  when the only famous vals family is gap-blocked (S11: three tandas off the cycle; sweep seeds 255 and 97 too);
  letting an obscure family take it instead creates a fame blocker, which the panel ranks worse.
- Not done: the discography R4 per-match re-recording audit (Retintín's Deezer match, Woody Herman's 1945–47 album, Mel
  Tormé's 1960 album, the "Altın Düetler" and "Yeniden Yetmişe" Turkish matches); R6 vocal-consistency flags beyond
  Trago amargo; the DJ's "pop/rock cue at most once an hour"; dancer R14-10b (a rhythmic tanda in every four); taste
  items T1–T10. `pnpm index:enrich` (Spotify) was not run. README media were not regenerated.
- Cost: a golden compose is ~0.5–1.5 s (was ~0.2 s); the core suite runs ~330 s (170 s).
