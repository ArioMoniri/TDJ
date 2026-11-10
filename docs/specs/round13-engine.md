# Round 13 — engine: the user's heatmap, best years, tanda cohesion, the golden core, transitions

Inputs (the spec): `docs/reviews/round13-best-years.md`, `round13-cohesion.md`, `round13-golden-age.md`,
`round13-transitions.md`, and the user's own heatmap `data/sources/All_orchestras.xls` → `data/index/coverage.json`.
Invariants: `packages/core/test/round13.test.ts` (25 tests). Standard pipeline: `pnpm quality` →
`docs/quality/latest.md`. Core suite: 280 tests (255 before), all green. Web vitest: 50 (48 before).

## 1. Data

| Change | Where | Source |
|---|---|---|
| Per-family `bands` (`best` / `ok` per instrumental and per singer, the review's §2 block verbatim) | `orchestra_profiles.json` | best-years §2 |
| `bandOverrides`: the reviewer's families rated above the heatmap, each entry `override: true`; **ignored unless `ComposeOptions.bandOverrides`** (off by default, not approved by the user) | `orchestra_profiles.json` | best-years §2 "Proposed overrides" |
| `goldenBands` `{core, edge, colour}` per family; colour = Canaro, Lomuto, OTV, Malerba, Rodríguez, Firpo | `orchestra_profiles.json` | golden-age §2, R10 |
| `drive: "hard"` (R+) on D'Arienzo, Biagi, Tanturi | `orchestra_profiles.json` | transitions §2.1 |
| `lineupBreaks` D'Arienzo instrumentals 1938-07, 1940-06 | `orchestra_profiles.json` | golden-age §2 (sub-periods A/B/C), cohesion R3(c) |
| Singer stints (Reynal 1940–42, Lamas 1942–43, Acuña Di Sarli 1941 / Biagi 1943–44, Calderón 1949–50, Berón with Caló 1942–44 + 1949–50, Castillo 1941–43, Moreno 1940–46, Casas 1938–42, Quintana 1944–45 …), `singerStints` for split stints, duplicate spellings removed (index spelling kept), signature-track years/singers fixed | `orchestra_profiles.json` | best-years §1.1 |
| Láurenz *Arrabal* 1937 → tango; Donato *Carnaval de mi barrio* 1939 → vals; Donato's broken singer string fixed; range-dated rows ("1933/48", "1940/70", span > 2 y): `year: null`, `dateRange: [y0, y1]` (907 rows); *Niebla del Riachuelo* (Fresedo/Ray) dated 1937 | `scripts/build_index.py` (`RHYTHM_OVERRIDE`, `SINGER_STRING_FIX`, `YEAR_OVERRIDE`, `fix_range_years`), rebuilt with `pnpm index:build` | best-years §4.1, §4.2 |
| Corpus singer spellings (Ángel Vargas, Jorge Ortiz, Floreal Ruiz, Roberto Flores) are read in the index spelling on load | `catalog.ts` `normaliseCorpusSingers` | best-years §1.1, §4.4 |
| Four benchmark checks with source lines: `yearSpread`, `goldenCore`, `transitions`, `heatmapBest` | `data/knowledge/benchmark.json` | the four reviews; the heatmap |

The data scripts that produced the profile edits are one-off; the build-script overrides are permanent.

## 2. The heatmap and best-years selection (`knowledge.ts`, `catalog.ts`, `tanda.ts`)

`load.ts` reads `coverage.json` into a `Heatmap`; the catalog stamps every dated side with `heat` (orchestra + mode +
year, 0 avoid … 4 fantastic). `familyBand()` reads the per-family bands (a singer missing from a non-empty map is
`outside`; instrumental `null` = no instrumental family).

| Rule | Implementation | Invariant |
|---|---|---|
| grade 0 never enters while the family has alternatives | `availOf` drops it (side level); a family whose every side is grade 0 is a rule miss (weight 3) | no grade-0 side in 18 nights |
| grade 1 only sides with fame ≥ 2 | `availOf` | every grade-1 side has fame ≥ 2 |
| grade 2 ×0.6, grade 4 ×1.3; band best ×1.25, ok ×1, outside ×0.45 | `sideKnowledge()` on side and family weights; per-family bands replace the orchestra-wide `bestYears` | ≥ 90 % of graded sides from grade 3–4 years |
| golden nights: an outside-band side leaves while the family has enough in band | `availOf` | — |
| the UI can say "fantastic year" | `Tanda.heat {min, mean, label}`, `Tanda.band`, reason "· heatmap: fantastic year · the family's best years"; `stats.heatBestShare` | reason and heat present |

## 3. Tanda cohesion (cohesion review R1–R10)

| Rule | Implementation | Invariant |
|---|---|---|
| R1 caps: vocal tango 2, instrumental 3, vals 2, milonga 2 (`maxYearSpread` an upper bound) | `spreadCap()`, `families()` windows | every tanda within its cap (18 nights) |
| R2/R8 one year | `tightWindow()`: the sides come from a one-year window keeping ≥ 70 % of the weight | median spread ≤ 1, ≥ 60 % within 1 year, milonga median ≤ 1 |
| R3 never cross a break | `families()` cuts a family at singer stints, line-up breaks and ≥ 18-month gaps over the whole catalogue (`familyBreaks`, `Catalog.recordingMonths`) | no tanda contains a break; Troilo 1938-07 + 1941-03 fixture = two families |
| R4 densest window | best window by Σ(fame + 1, stream, heatmap) first, the remaining years windowed again | fixture: the 1943 block wins |
| R5 session tie-break | inside `tightWindow` (date span) | — |
| R6 tempo drift | `foldedBpm()` (×½ … ×2, pulse clarity ≥ 0.7), drift over `BPM_DELTA_MAX` rejects a side | — |
| R7 small pools | vals window +1 year inside one period when it cannot fill (`poolSmall`, note "pool-small") | fixtures |
| R9 repeat families take other years | `usedFamilies.yearSet`; `availOf` drops those years | no year shared |
| R10 + the era curve | `score.ts` `eraGrade()`: effective spread (pool floor), curves 1/0.85/0.5/0.2/0 (vocal), 1/0.9/0.7/0.35/0 (instr), 1/0.8/0.45/0.1/0 (V/M), date span ≤ 12 months = 1, a break caps at 0.30 | fixture grades; featured era < 0.8 |

## 4. Golden core (golden-age review)

| Rule | Implementation | Invariant |
|---|---|---|
| R1 core share | golden nights (`isGoldenNight`: `eras: ["golden"]` or a range inside 1932–50): core sides first, then core + edge; edge ≤ round(h/2), one per family, never at a peak; non-core budget ≤ 20 % of slots; another era is a weight-5 miss | ≥ 75 % core, ≤ 3 edge, never "other" |
| R2 colour cap | ≤ floor(0.75·h), one per orchestra (Canaro two with a V/M), never adjacent, never at a peak / phase peak / t ≥ 78, one chair kept for the second half | cap on ≥ 10/12 default nights (≤ 4 always), never at a planned peak or t ≥ 78 |
| R5 album years, live albums | `flagRerecordings` (album names a year > row + 2, or live) | Verdemar 1943, Mascarita 1940 |
| R6 shared stream | the row whose year the album names keeps it; else a later row explains it | D'Arienzo Cumparsita 1937/1943 suspect, 1951 not |
| R7 closer in range | `cumparsitaWeight` and `pickClosing` read `o.yearRange`; in-range non-suspect version first, nearest year on a strict range otherwise | 1935–45 nights close inside 1935–45 |
| R8 length bands | tango 135–192 s, vals 120–185, milonga 115–175 (Pugliese/Láurenz 1943+ to 205), > 12 % off the family median | Caló *Inspiración* 2:05, Lomuto *Mano a mano* 3:16 (Troilo *Tabernero* 3:13 is in band with its family: not flagged) |
| R10 tiers | Rodríguez, OTV colour | — |

## 5. Transitions (transitions review)

`transitions.ts`: `pairScore(a, b)` (style matrix with R+/R from `drive`, energy, era with bridge cues, tempo, vocal,
style run, cortina), `nightTransitions()` (grades, H1–H6). It reproduces the review on the featured night exactly
(mean 90.9, 16/3/2, two H3).

- Composer: every family's weight × exp((S − 100)/15) into it, and out of it when the next slot is already known
  (the early D'Arienzo, the Pugliese slot); H1, H3, H5, H6, H2 near peaks and era steps (> 9 y any boundary, > 6 y
  tango → tango before the cue is chosen) are rule misses. Rules are weighed together (`preds` with weights) and the
  families breaking the least are kept; narrower layers give way when all they hold breaks a heavy rule.
- `transitions` score factor (weight 4): clamp((mean − 80)/12) with the jarring and H1/H6 discounts.
- The length fit never drops a tanda that leaves a hard-rule pair.

## 6. Benchmark (checks 14–17) and improveNight

| Check | ok | near | weight | source |
|---|---|---|---|---|
| `yearSpread` | median ≤ 1.5 y, ≥ 75 % ≤ 2 y, max ≤ 4 | median ≤ 2, ≥ 60 % | 2 | cohesion §4.2 |
| `goldenCore` | ≥ 80 % core tandas | ≥ 70 % | 1 (golden nights; info otherwise) | golden-age §5; one level down for colour over the cap or at a peak |
| `transitions` | mean 88–97, ≤ 2 jarring / 4 h, min ≥ 60, no H1/H6 | the review's own partial credit ≥ 0.35 | 3 | transitions §4 |
| `heatmapBest` | ≥ 85 % of graded sides from grade 3–4 | ≥ 70 % | 2 | the user's heatmap |

New fixers (kept only when engine score, benchmark, transition hard hits and jarring count all hold): `tighten`
(one recording period inside the tanda's own years), `heatmap` (grade 0/1 sides out), `core` (colour at a peak / over
the cap, non-core or doubly jarring tanda → a core family via the composer's own `swapTanda`, caps kept), `energy`
(same-family sides toward the planned step), `bridge` (H4: re-pair a bridge cue).

## 7. Standard pipeline

`pnpm quality` (CI after the core tests): S1–S12 and the featured night (shipped JSON re-scored, and its options
composed), `scorePlaylist` + `benchmarkNight` + `improveNight`, `docs/quality/latest.md`; non-zero when a golden night
< 85, a scored check is off on the golden set after improveNight, or improveNight lowers a number. Web: Settings →
Composing → "Auto-improve against published sets" (default on, `UserSettings.autoImprove`); `/api/compose` runs
improveNight and the change summary line says what changed ("Auto-improved against published sets: 3 changes (one
recording period, heatmap years) · engine 89 → 91 · benchmark 13/17 → 15/17").

## 8. Numbers

Default 4 h golden set S1–S12 (engine score / benchmark total):

| | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 | S11 | S12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Round 12 engine, round-12 benchmark (13 checks) | 92/89 | 91/83 | 92/93 | 93/89 | 89/83 | 93/83 | 90/89 | 92/83 | 92/89 | 90/89 | 88/87 | 92/87 |
| Round 12 engine re-scored under round 13 (17 checks) | 89/81 | 87/71 | 89/87 | 88/76 | 86/76 | 88/71 | 87/76 | 87/68 | 87/76 | 85/76 | 83/74 | 89/79 |
| Round 13 composed | 93/95 | 91/87 | 89/95 | 89/90 | 90/87 | 91/89 | 88/81 | 91/92 | 90/84 | 88/87 | 91/84 | 91/94 |
| Round 13 after improveNight | 93/95 | 92/87 | 89/95 | 89/90 | 91/90 | 92/90 | 88/85 | 91/92 | 91/84 | 88/87 | 92/95 | 92/94 |

The round-12 nights under the new checks: `goldenCore` off on all 12 (50–68 % core), `transitions` off on 8,
`yearSpread` near/off (median 1.5–2 y, 6–12 tandas crossing a break), era factor 0.59–0.77. Round 13: no check off on
the golden set after improveNight; year spread ok on all 12 (median 1 y), golden core ok on 11 (near on S7),
transitions ok or near, heatmap ok (95–100 %), era factor ≥ 0.95.

Featured night (shipped JSON, not edited here): round 12 93 / 93 (12/13). Under round 13: engine 91, benchmark 87
(14/17): era 0.64 (13 tandas over target, 9 crossing a break), `yearSpread` **off** (median 2 y, 55 % ≤ 2 y),
`goldenCore` near (82 % core, 4 colour), `transitions` ok (90.9), `heatmapBest` ok (100 %); after improveNight 91 / 95
(16/17, 17 changes, mostly `tighten`). Its options composed again (seed 181): 87 / 82 → 89 after improveNight.

300-seed sweep of the featured options: engine 83–91 (median 86; 87 after improveNight), benchmark 79–95 after
improveNight (median 89), 293/300 ≥ 85, 263/300 with no check off. Top 3: seeds 148 (91 / 94, transitions 91.4),
36 (91 / 94, 91.1), 138 (87 → 90 / 94, 91.9).

## 9. Test expectations re-read (intended behaviour)

- round4 C14: orchestra Jaccard < 0.92 (was 0.85; the purist rules narrow the bench to ~15 orchestras) and the first
  vals slot needs 2 families (was 3).
- round8 R3: the duplicate key reads `dateRange` for range-dated rows (they carry no year now); R6: at most one
  sawtooth over twelve long nights (seed 12 of the 6 h night has one).
- round9 R9.6: a night whose range ends before 1951 closes inside its range (golden-age R7), not on D'Arienzo 1951.
- benchmark.test: the shipped featured night may miss the four round-13 checks (`inRange ≥ scored − 3`); the core
  fixer may change a chair's orchestra; the instrumental check skips tandas a later fixer reworked.
- e2e benchmark.spec: the featured night's off checks exclude the four round-13 keys (and ≥ 17 checks); the
  vocal-heavy test turns auto-improve off for its compose so the sheet's own "Improve automatically" has work.

## 10. Left out

- No fixer for H2 (style triples) or for colour at a peak when no core family is free (pool exhaustion late in a 4 h
  night under the one-tanda-per-orchestra rule); the 1935–45 featured-options nights still carry 4–5 colour tandas.
- The reviewer's overrides are stored, not applied (`bandOverrides` option, off).
- The cohesion review's arc suggestions (never three peak-level slots in a row) are not implemented.
- `pnpm lint` fails in this container before and after this round on files outside it (biome 2.5 vs the 2.2 config:
  `biome.json`, `docs/specs/round*-best-night.json`, the featured JSON, `e2e/round4.spec.ts`); every file this round
  touches is clean.
