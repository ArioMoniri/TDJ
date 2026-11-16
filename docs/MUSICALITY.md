# Musicality: what TDJ calculates per tango, vals, milonga and era

Source: `docs/research/context-factors.md` (evidence-graded) and `data/knowledge/context_factors.json` (machine-readable, loaded by the engine). The engine today uses orchestra/era/singer/fame priors plus any BPM/energy overrides from the user database; the per-feature formulas below are the target model that BPM/key detection (roadmap Phase 1) will feed.

## Per-rhythm features and formulas
## axes
- **energy**: 0-100; 0.55*physical + 0.45*emotional (musicology.md s2.2)
- **danceability**: 0-100; readiness of a social dancer to walk to it; canción forced <= 25
- **difficulty**: 0-100; rubato, irregular phrasing, dominant singer, density, fast/slow extremes
- **valence**: -1..+1 perceived pleasantness (mode, harmonic complexity, contour)
- **arousal**: 0..1 perceived activation (loudness, tempo, spectral flux, rhythmic regularity)
## beginnerWeight
- **beginner**: 1.0
- **mixed**: 0.5
- **advanced**: 0.2
## features
### tempo
- **unit**: quarter-note BPM (vals also bars/min = BPM/3)
- **compute**: beat tracker + folding per musicology.md s0; cross-check reference durations
#### tango
- **physicalPerBpm**: 0.9
- **pivot**: 124
##### danceablePeak
- 118
- 134
##### difficultyBelow
- 112
- 8
##### difficultyAbove
- 138
- 6
#### vals
- **physicalPerBpm**: 0.6
- **pivot**: 180
##### danceablePeak
- 170
- 190
##### difficultyAbove
- 195
- 10
#### milonga
- **physicalPerBpm**: 0.8
- **pivot**: 112
##### danceablePeak
- 104
- 120
##### difficultyAbove
- 124
- 15
#### cancion
- **note**: tempo irrelevant to danceability; arousal only
### marcato
#### values
- in2
- in4
- pesante
- yumba
- **compute**: onset-strength energy at 2x pulse vs 1x pulse; or orchestra/era prior
#### tango
##### in4
- **physical**: 6
- **danceableBeginner**: 8
##### in2
- **physical**: -2
- **danceableAdvanced**: 4
##### pesante
- **emotional**: 4
- **difficulty**: 4
##### yumba
- **emotional**: 6
- **difficulty**: 8
#### vals
##### strongBeat1
- **physical**: 4
- **label**: lift
##### evenThree
- **emotional**: 3
- **label**: floating
#### milonga
- **habaneraRatio**: share of 3-3-2 vs straight 4; more 3-3-2 -> difficulty +5, valence +0.05
### syncopation
- **compute**: Longuet-Higgins & Lee index on onset grid, or style prior
#### levels
- low
- medium
- high
#### tango
##### medium
- **arousal**: 0.05
- **valence**: 0.05
##### high
- **difficulty**: 8
- **danceableBeginner**: -4
#### milonga
##### densityLow
- **danceable**: 4
##### densityHigh
- **physical**: 6
- **difficulty**: 8
### phrasing
- **compute**: self-similarity matrix; phrase-length histogram
#### square
- **danceable**: 6
- **difficulty**: -8
#### irregular
- **difficulty**: 10
### arrastre
- **compute**: 60-250 Hz energy rise over ~150 ms before beat 1; occurrence rate
#### strong
- **emotional**: 6
- **physical**: 2
- **difficulty**: 6
- **valence**: -0.1
#### valsMild
- **energy**: 2
### variacion
- **compute**: onset-density spike > 2x median in final 15%, high register
#### present
- **energy**: 4
- **arousal**: 0.1
- **difficulty**: 4
- **slotHint**: tanda closer
### lyricalVsRhythmic
- **compute**: sustained-tone energy / percussive onset energy (spectral flux)
#### rhythmic
- **physical**: 8
- **valence**: 0.05
#### lyrical
- **emotional**: 6
- **physical**: -6
- **arousal**: -0.1
#### dramaticAlternating
- **difficulty**: 10
### singerRole
- **compute**: vocal activity ratio (VAR) via source separation
#### thresholds
##### estribillista
- 0
- 0.25
##### cantorDeOrquesta
- 0.25
- 0.55
##### cantorDominant
- 0.55
- 1.0
#### estribillista
- **emotional**: 2
- **danceable**: 2
#### cantorDeOrquesta
- **emotional**: 8
#### cantorDominant
- **emotional**: 10
- **danceable**: -8
- **difficulty**: 6
- **cancionRule**: VAR > 0.6 and rubato -> cancion, danceable <= 25, never in a tanda
### dynamics
- **compute**: EBU R128 loudness range (LRA, LU); short-term loudness std
#### lraLow
- **max**: 5
- **emotional**: -4
#### lraNormal
- 5
- 9
#### lraHigh
- **min**: 9
- **emotional**: 6
- **difficulty**: 4
### keyMode
- **compute**: Krumhansl/Temperley key profiles on the A part; verify with sheet key
#### minor
- **valence**: -0.15
- **emotional**: 5
#### major
- **valence**: 0.2
- **physical**: -3
#### valsMajor
- **valence**: 0.25
#### milongaMajor
- **valence**: 0.1
### arrangementDensity
- **compute**: spectral flatness + simultaneous pitched streams, or orchestra prior
#### sparse
- **emotional**: -6
- **danceable**: 2
#### dense
- **emotional**: 6
- **difficulty**: 4
### duration
#### tango
##### normal
- 140
- 190
##### longPenaltyAbove
- 210
- 3
- **snackBelow**: 130
- **tandaBudgetSec**: 750
#### vals
##### normal
- 140
- 180
#### milonga
##### normal
- 120
- 160
- **fatigueAbove**: 170
#### cancion
##### normal
- 180
- 240
### pulseClarity
- **compute**: beat salience / pulse clarity percentile
- **danceablePerPercentilePoint**: 0.3
- **note**: strongest predictor of beginner danceability and memory salience
### transferQuality
- **compute**: label tier, SNR, speed check vs reference duration
- **note**: affects loudness normalisation and arousal; not energy class
## formulas
### tango
- **physical**: base_phys + 0.9*(bpm-124) + marcato4*6 - lyrical*6 + instrumental*4 + era_phys
- **emotional**: base_emo + vocal*8 + singerDrama*6 + minor*5 + rubato(8|14) + dense*6 + lraHigh*6 + arrastre*6 + era_emo
- **energy**: 0.55*physical + 0.45*emotional
- **danceability**: 70 + pulseClarity*0.3 + square*6 + marcato4*8*beginnerWeight - rubato*12 - dominantSinger*8 - abs(bpm-126)*0.5
- **difficulty**: base_diff + rubato*14 + irregularPhrase*10 + dominantSinger*6 + dense*4 + arrastre*6 + syncHigh*8 + (bpm<112)*8 + (bpm>138)*6
- **valence**: -0.15*minor + 0.2*major + 0.05*rhythmic - 0.1*arrastre - 0.1*dramaticSinger + 0.1*playfulSync
- **arousal**: clamp(0.45 + 0.004*(bpm-124) + 0.25*loudnessNorm + 0.15*spectralFlux + 0.1*rhythmicRegularity, 0, 1)
### vals
- **physical**: base_phys + 0.6*(bpm-180) + strongBeat1*4 + instrumental*3
- **emotional**: base_emo + vocal*6 + minor*6 + dense*5 + rubato*8
- **energy**: min(85, 0.55*physical + 0.45*emotional)
- **danceability**: 75 + pulseClarity*0.3 - (bpm>195)*10 - rubato*10
- **difficulty**: base_diff + (bpm>195)*10 + rubato*10 + irregular*8
- **valence**: 0.25*major - 0.1*minor + 0.1*lyrical
- **arousal**: clamp(0.5 + 0.005*(bpm-180) + 0.2*loudnessNorm, 0, 1)
### milonga
- **physical**: base_phys + 10 + 0.8*(bpm-112) + syncDensity*6
- **emotional**: base_emo - 4 + vocal*4 + candombe*4
- **energy**: 0.55*physical + 0.45*emotional
- **danceability**: 70 + pulseClarity*0.3 - (bpm>124)*15 - syncHigh*8 + habanera*4
- **difficulty**: base_diff + 10 + (bpm>124)*15 + syncHigh*8 + traspieDensity*6
- **valence**: 0.2 + 0.1*major - 0.1*candombe
- **arousal**: clamp(0.6 + 0.005*(bpm-112) + 0.2*loudnessNorm, 0, 1)
### cancion
- **danceability**: min(25, computed)
- **energy**: tango formula, flagged nonDanceable=true
- **valence**: mode + lyric sentiment
- **arousal**: loudness/LRA driven
- **engineRule**: never inside a tanda; homenaje single or show spot only

## Era table
- **note**: Quarter-note BPM per musicology.md s0. Typical tanda means; orchestra_profiles.json overrides.
## eras
- **id**: guardiaVieja
- **label**: Guardia Vieja / Guardia Nueva sextets
### years
- 1900
- 1934
### bpm
#### tango
- 118
- 130
#### vals
- 160
- 175
#### milonga
- 100
- 112
- **marcato**: in2 bright (some in4: Firpo, OTV)
- **syncopation**: low-medium
- **arrastre**: rare
- **variacion**: some (Firpo, De Caro)
- **lyricalToRhythmic**: 40:60
- **singerRole**: estribillista
### lraLU
- 3
- 6
- **mode**: mixed, many major
- **arrangementDensity**: sparse
### durationSec
- 150
- 180
### energy
- 35
- 50
### danceability
- 70
- 80
### difficulty
- 20
- 35
- **valence**: 0.1
- **arousal**: 0.4
### placement
- warmup
- breath
- afternoon
- nostalgic
- **id**: golden1935_40
- **label**: Golden early (D'Arienzo revolution)
### years
- 1935
- 1940
### bpm
#### tango
- 126
- 140
#### vals
- 180
- 200
#### milonga
- 106
- 120
- **marcato**: in4 staccato
- **syncopation**: medium-high (Biagi)
- **arrastre**: light
- **variacion**: frequent
- **lyricalToRhythmic**: 25:75
- **singerRole**: estribillista -> short cantor
### lraLU
- 4
- 7
- **mode**: minor
- **arrangementDensity**: medium
### durationSec
- 140
- 170
### energy
- 65
- 85
### danceability
- 85
- 95
### difficulty
- 25
- 40
- **valence**: 0.05
- **arousal**: 0.75
### placement
- warmup
- build
- peak
- cold
- young
- beginner
- **id**: golden1941_45
- **label**: Golden mid (singers become stars; 1941 peak)
### years
- 1941
- 1945
### bpm
#### tango
- 118
- 130
#### vals
- 172
- 190
#### milonga
- 106
- 118
- **marcato**: in4 (Tanturi, D'Arienzo-Maure) and in2 (Di Sarli, Troilo)
- **syncopation**: medium
- **arrastre**: medium (Troilo)
- **variacion**: occasional
- **lyricalToRhythmic**: 50:50
- **singerRole**: cantor de orquesta
### lraLU
- 5
- 8
- **mode**: minor
- **arrangementDensity**: medium-dense
### durationSec
- 150
- 190
### energy
- 55
- 75
### danceability
- 80
- 92
### difficulty
- 30
- 50
- **valence**: -0.05
- **arousal**: 0.6
### placement
- build
- middle
- romantic
- nostalgic
- heat-safe
- **id**: golden1946_55
- **label**: Golden late (grand style)
### years
- 1946
- 1955
### bpm
#### tango
- 108
- 124
#### vals
- 168
- 186
#### milonga
- 108
- 124
- **marcato**: in2 pesante; yumba (Pugliese)
- **syncopation**: medium (Pugliese high)
- **arrastre**: strong
- **variacion**: occasional dramatic
- **lyricalToRhythmic**: 65:35
- **singerRole**: cantor dominant
### lraLU
- 7
- 11
- **mode**: minor
- **arrangementDensity**: dense
### durationSec
- 170
- 210
### energy
- 60
- 85
### danceability
- 65
- 85
### difficulty
- 50
- 85
- **valence**: -0.15
- **arousal**: 0.65
### placement
- peak
- late
- closing
- dramatic
- asia
- after-midnight
- **id**: post55
- **label**: Post-golden
### years
- 1956
- 1975
### bpm
#### tango
- 104
- 144
#### vals
- 168
- 190
#### milonga
- 116
- 132
- **marcato**: in4 very fast (D'Arienzo 60s) or in2 slow (Di Sarli 56-58)
- **syncopation**: medium
- **arrastre**: strong
- **variacion**: frequent (show)
- **lyricalToRhythmic**: 50:50
- **singerRole**: cantor dominant, stereo crooning
### lraLU
- 8
- 12
- **mode**: minor
- **arrangementDensity**: very dense
### durationSec
- 160
- 220
### energy
- 55
- 90
### danceability
- 50
- 75
### difficulty
- 45
- 75
- **valence**: -0.1
- **arousal**: 0.6
### placement
- late milongas
- closing Di Sarli
- sparingly
- **id**: nuevo
- **label**: Nuevo (Piazzolla lineage)
### years
- 1955
- 1990
### bpm
#### tango
- 80
- 160
- **vals**: None
- **milonga**: None
- **marcato**: 3-3-2 ostinato, no walking marcato
- **syncopation**: high
- **arrastre**: strong
- **variacion**: virtuosic
- **lyricalToRhythmic**: 70:30
- **singerRole**: none / art-song
### lraLU
- 10
- 16
- **mode**: minor/modal
- **arrangementDensity**: dense contrapuntal
### durationSec
- 210
- 360
### energy
- 40
- 80
### danceability
- 10
- 35
### difficulty
- 85
- 100
- **valence**: -0.2
- **arousal**: 0.55
### placement
- alternative slot only
- show spot
- **id**: contemporary
- **label**: Contemporary orquestas tipicas
### years
- 1995
- 2026
### bpm
#### tango
- 112
- 134
#### vals
- 172
- 192
#### milonga
- 108
- 124
- **marcato**: per model orchestra
- **syncopation**: medium
- **arrastre**: per model
- **variacion**: occasional
- **lyricalToRhythmic**: 50:50
- **singerRole**: crooner cantor (hi-fi)
### lraLU
- 8
- 12
- **mode**: minor
- **arrangementDensity**: dense hi-fi
### durationSec
- 160
- 210
### energy
- 55
- 80
### danceability
- 70
- 85
### difficulty
- 35
- 55
- **valence**: 0.0
- **arousal**: 0.6
### placement
- festival first third
- <= 1-2 tandas per 4 h traditional
- **id**: electro
- **label**: Electro / fusion
### years
- 1999
- 2026
### bpm
#### tango
- 100
- 130
- **vals**: None
- **milonga**: None
- **marcato**: programmed 4-on-floor + marcato sample
- **syncopation**: low
- **arrastre**: sampled
- **variacion**: none
- **lyricalToRhythmic**: 50:50
- **singerRole**: spoken/sung hooks
### lraLU
- 3
- 6
- **mode**: minor
- **arrangementDensity**: layered
### durationSec
- 210
- 300
### energy
- 60
- 80
### danceability
- 50
- 70
### difficulty
- 20
- 40
- **valence**: 0.05
- **arousal**: 0.65
### placement
- alternative slot only
## contextPreferences
### heatHumidLateSenior
- golden1941_45
- golden1946_55-lyrical
### coldYoungFestivalEnergetic
- golden1935_40
- golden1941_45-in4
- post55-fast-milongas
### beginnerCrowdedReverberant
- golden1935_40-instrumental
- golden1941_45-square
### nostalgicRomanticValentinesSundayAsia
- golden1941_45-vocal
- golden1946_55-lyrical
- guardiaVieja-vals

## What the engine reads from `orchestra_profiles.json` (round 4)

Every curated field is now consumed by `packages/core/src/{tanda,compose,catalog}.ts`; the test file `packages/core/test/round4.test.ts` holds one invariant per rule.

| Field | Where | Effect |
|---|---|---|
| `phase`, `notBefore`, `notAfter`, `neverClose` | `buildTanda` | hard phase filter (an orchestra programmed for other phases enters only when fewer than three fitting families exist). The **close** slot accepts `peak` and `cooldown` orchestras alike, and the última bypasses the phase filter entirely so D'Arienzo / Pugliese / Di Sarli can close. |
| `subPeriods[{years, phase, difficulty, danceable}]` | `buildTanda` | the family's mean (dated) year picks the sub-period; its `phase` replaces the profile phase, an empty list excludes the family (Troilo ≥ 1950, Di Sarli 1950s in the warm-up), `danceable:"limited"` ×0.3, `difficulty` feeds the beginner filter. |
| `bestYears` | `buildTanda` | families whose mean year lies outside the window weigh ×0.5 (Laurenz/del Río 1952 no longer reaches a peak). |
| `singerShift` | `buildTanda` | weight ×(1 + shift·0.08): Demare–Miranda +2 → ×1.16, Quintana −2 → ×0.84, Goyeneche −8 → ×0.36. |
| `singers` | `energy.ts` | an atypical singer/year pairing loses 2 energy points (unchanged). |
| `singerDanceable`, `nonDanceSingers` | `Catalog.singerOk` | the family is excluded (Tita Merello, Nelly Omar, "Solo de Piano"). |
| `nonDanceTitles` | `Catalog.nonDance` | a bare title bans every version; `"Title (1963)"` bans that year only (Troilo's 1944 *Quejas de bandoneón* stays, the 1963 one goes). Title-level bans in `energy.ts` were reduced to real concert pieces; *Mala junta* and *Café Domínguez* are back, with `BLACKLIST_VERSIONS` banning only the 1960s+ re-recordings. |
| `maxPerNight` (number or `{"4": n, "6": m}`) | `makeScoring` | resolved by tonight's hours; `puglieseOnce` defaults to *hours < 6*, so a 6 h night gets two Pugliese slots (instrumental from ~45 %, the second after 75 %). |
| `shareOfNightMax` | `buildTanda` | per-orchestra cap = min(cap, ceil(share × slots)). |
| `followWith` | `buildTanda` | after a tanda whose profile lists `followWith`, a tango family of a listed style (or `balanced`) weighs ×2.5, others ×0.2 — after Pugliese comes a vals, a milonga or a rhythmic tango. |
| `warmupOnly {vocal, years}` | `buildTanda` | in the warm-up only that material of the orchestra is viable (D'Arienzo: 1935–39 instrumentals); anything else ×0.1. |
| `difficulty` | `buildTanda` | with a beginner floor (`maxDifficulty` 60 from the context) families above it are excluded while three alternatives remain. |
| `cumparsitaVersions` | `compose.ts` | together with the corpus `role:"cumparsita"` years and `rules.ts` `CUMPARSITA_CLOSING_YEARS`: the closing, opening and "own" Cumparsita are filtered to those exact years, never a `yearApprox` row, instrumental unless the listed version is vocal; post-golden nights close with a version of their own era (D'Arienzo 1963, Troilo 1963, De Angelis 1961). |
| `rhythmShift`, `rhythmOverride`, `signatureTracks` | — | **not wired**: rhythm shifts are covered by the per-track `track_energy.json` gradient, `rhythmOverride` belongs in the index build (`scripts/build_index.py`). |

### Placeholder years

Rows with `yearApprox:true` ("1940" for an undated 1940s transfer) never anchor a family's year window: they form a separate *undated* family per orchestra/singer (weight ×0.25, each track ×0.6), earn no warm-up bonus and the tanda's `yearRange` is built from dated rows only (`null` when there are none; the reason text says "c. 1940").

### The night as the corpus describes it

- **First D'Arienzo**: one tango slot between 8 % and 33 % of the night is drawn per seed; it gets the 1935–39 instrumental tanda as a planned early peak (target raised to 72). If no D'Arienzo tango tanda exists by 38 %, the next build/peak slot forces one; a second one is forced from 70 %. Tango count 2–3 per 4 h; D'Arienzo's vals/milonga never steal those slots.
- **Pugliese**: with `puglieseOnce`, his slot is drawn around the corpus median (0.87) and planned at ≥ 74; he is excluded from the body before it. He may also be the última. Beginner floors (`avoidStyles` dramatic, difficulty > 60) get no Pugliese.
- **Última**: tango, target +8, candidates from the corpus closer pool (Pugliese, D'Arienzo, D'Agostino–Vargas, Di Sarli, De Angelis instrumental, Troilo, Tanturi, Caló, Rodríguez, Biagi), families the corpus knows, delivered energy ≥ target−4 (up to six draws, the strongest otherwise). `ultimaRule:"pugliese"` reserves Pugliese for it; `"d-arienzo-rhythmic"` is an instrumental D'Arienzo.
- **Colour tanda** (`rules.colourTanda`): one softer tanda (Caló, Fresedo, Demare, De Angelis, Pirincho, Canaro) in the breather after the first peak, target −6, noted "colour tanda".
- **Track order**: the energy shape first, then the corpus `role` (an opener opens, a closer closes) and, when roles are known, the least famous track third. Famous recordings' corpus energy is a prior blended 50/50 with the per-track model, so the tracks of one family keep a gradient.
- **Variety**: every orchestra gets a seed-drawn 0.6–1.4 "mood" factor for the night, the warm-up and vals/milonga slots sample from a flatter top-10 window, the long tail (20× below the best) never enters it, and fame-0 one-off singers are out of the opening slots (OTV/del Moral, Lomuto/Díaz valses). The first vals slot uses the warm-up vals bank (Canaro, Rodríguez, Donato, Lomuto); Biagi belongs at the second.
- **Steps**: a family more than 14 points away from the previous tanda beyond what the arc planned is down-weighted.
- **Cortinas**: one family or a compatible pair (swing+jazz, canzone+chanson, soul+funk, turkish-pop+turkish-rock …) sized to the night (≥ max(4, tandas/4) cues), least-recently-used cycling, never the same cue within four tandas, energy fit (≤20 under/over the next tanda minus 8) decided before freshness; Guardia Vieja nights use pre-1936 jazz sides. Lo-fi, surf, Twist and Shout, cumbia, Mesečina and 2024 pop left the global pool.
- **Context** (`context.ts`): research genres are mapped to the pool's genre ids and to cultures (Istanbul → turkish/greek); `vocalRatioShift` → `vocalBias` (vocal families ×(1+3·bias)), `tempoShift` weighs orchestras by their profile bpm against the rhythm's pivot, heat takes the *minimum* milonga share across applied factors, beginner/encuentro/milonguero fall back to the built-in style preferences when the research model has none.

### Option precedence

`compose()` layers, lowest first: `DEFAULT_OPTIONS` → `ERA_SETTINGS[eras[0]]` → `overrides.rules` (the DJ's standing database rules) → the request (`partial`) → context shifts, which never touch a key the request set explicitly. `partial.explicit` names the explicit keys; without it every key present in the request is explicit. `playlist.options.contextApplied` lists what the context changed and what it skipped. `pattern:"TTVTTM-strict"` is never rewritten by context (`"classic"` may become a custom cycle under heat or an afternoon).

## Succession: which tanda follows which (2026-11)

The owner: "keep in mind in the creation pipeline which orchestra or singer comes after which singer/orchestra, in terms of energy etc."

### Audit: how compose chose tanda i + 1 before this

- **Plan** (`arc.ts`): `planSlots` gives every slot a rhythm from the cycle (TTVTTM by default, the rhythm counters), a phase (warm-up, build, peak, cool-down, close) and a target energy from the arc preset; planned summits (`peak`), the early D'Arienzo slot and the Pugliese slot are drawn per seed.
- **The draw** (`tanda.ts buildTanda`): the families that fit the slot are filtered (repeat gaps per orchestra and singer, caps per night, phases, `followWith` after Pugliese, never two dramatic in a row, the colour / edge / golden-core caps, the fame floor) and the strict panel's per-slot rules are weighed together (fewest broken rules stay). The survivors are drawn by weight: energy fit to the target, phase, tier, fame, canon families, banks for vals and milonga, the gradual-step rule (more than 14 points from the previous tanda beyond the plan costs), the learned families, dancer favourites.
- **Pairwise succession already existed** as the round-13 transition model (`transitions.ts pairScore`): 100 minus style (an R+ / R / L / B / D matrix), energy step against the plan, era, tempo, vocal alternation, style runs and cortina terms, plus hard rules H1–H6. It weighs both the step into a candidate and the step into the planned next tanda (`exp((S − 100) / 15)`), filters hard-rule breaks, and the night's `transitions` check scores it. **Bridge cues** (`isBridge`: a medium or slow cortina whose energy sits between the two tandas) halve the era penalty and let a > 6-year tango step pass.
- **Big four** (`coherence.ts bigFourProblems`, `night_shape.json`): after the draw a repair spreads Di Sarli, D'Arienzo, Troilo and Pugliese over the quartiles and away from each other.
- **What was missing**: what real DJs play after what (the 31 reference sets and the 168 cached set-blog sets were read for fame, roles and popularity only, never for order); the singers' voices; sound families (an orchestra after its own school); key and brightness; pairs the DJ made by hand; and any explanation of a pair in the UI.

### The model (`packages/core/src/succession.ts`)

S(A → B) is a sum of signed points, each with what it read, mapped to −1 … +1 by tanh(points / 12); ≥ 6 points is "follows well", ≤ −6 a warning (and any part at −3 or worse names one: two rhythmic / dramatic / lyrical in a row, an energy jump, a big jump in recording sound, two similar voices, the same singer, one sound family, rare in DJ sets).

| Part | Reads | Points |
|---|---|---|
| energy | A's last side vs B's first side against the arc's planned step (B's target − A's) | +4 within 4 of the plan, −0.5 a point beyond, ≥ −10 |
| style | tango → tango classes (transitions.ts `styleClass`): `succession_curated.json styleMatrix` (R+ → L +5, L → R +4, R → R −3, R+ → R+ −8, D → D −10 …) plus 3 × log2 of the corpus lift of that class pair (±3) | |
| era | the mean years: +2 within 3 years, −1 a year beyond (≥ −10); ≤ 1935 ↔ ≥ 1950 another −4; halved around a vals / milonga | |
| voice | both vocal: same singer −6; same class (high tenor −5, tenor −2, baritone −2, female −1); a contrast +2 (`voices`, 60 singers, estimates) | |
| tempo | same rhythm, measured tempo else the profile's band: +1 within 6 BPM, −0.4 a BPM beyond (≥ −6) | |
| key | analysed sides only: Camelot distance ≤ 1 +1, ≥ 3 −1; a brightness jump > 800 Hz −1 | |
| lineage | two orchestras of one sound family (`lineages`: the D'Arienzo, Di Sarli, Pugliese, Caló and Troilo schools) −3 | |
| corpus | the smoothed lift of A → B among the mined transitions: P = (c + 4·p_B) / (n_A + 4), lift = P / p_B, 2.5 × log2(lift) in −3 … +6 (n_A ≥ 3), + 0.5 a family-pair count (≤ +2); never positive on a same-kind style run (some set lists play the D'Arienzo school back to back; the strict panel does not) | |
| learned | the DJ's pairs (edits, praise, floor reactions) | 1.5 a point, −1.5 … +4.5 |

**Data** (`pnpm knowledge:succession` → `data/knowledge/succession.json`, committed, deterministic): 31 reference sets (504 transitions, weight 1) and 168 set-blog sets from the popularity cache (2,704 transitions, weight 0.5, so one DJ's habits never outvote the panel) — 3,208 transitions (1,856 weighted), 1,245 tango → tango; 502 orchestra pairs, 680 family pairs seen twice or more, 24 style-class pairs, each `[raw, weighted]`. D'Arienzo → Di Sarli 34×, Di Sarli → D'Arienzo 38×, Biagi → D'Arienzo 45×. The curated inputs live in `data/knowledge/succession_curated.json`; no orchestra is named in engine code.

**Compose** (`tanda.ts` weight): w × exp(0.03 × points) for the step from the previous tanda and into the planned next one, over the parts pairScore does not already carry (style alternation, voice, lineage, corpus, learned, key — not energy, era or tempo, so the arc is not counted twice). Two big-four orchestras back to back: compose leaves their style and corpus bonus to the big-four spread rule and takes 4 points off (the explanation still shows "common in DJ sets"). **Swap choices** (`swapTandaOptions`): nearest the plan in bands of 4 energy points, inside a band the best flow (into it + out of it). **Build by hand** (`suggestNext`): + 0.8 × the same points and the one-line why.

**Learning** (`learn.ts pairEdits`): a replaced tanda's new pairs +1, the broken ones −0.5 (−1 … 3); a praised tanda is one ♥ for the pair into and out of it (+0.25, ≤ +0.5 a pair — the Troilo T14 praise is one ♥, not a rule); floor reactions below. The repo store's overrides accept `pair:<a>><b>`.

**UI**: Compose's tanda inspector and the swap sheet's suggested tandas show one line — "Follows Juan D'Arienzo well: lyrical after driving, common in DJ sets (34×), energy +2" or "Two rhythmic tandas in a row: …" (en + tr, `lib/succession.ts`).

### Floor reactions: live adaptation and learning (`adapt.ts`, `floor.ts`)

After a tanda's Floor full ♥ / OK / Floor emptied in the Booth (the room's hearts stand in for a tap: ≥ 2 a song is "full"), the next three unplayed tandas — never a played, pinned, locked, summit or última chair — are weighed against the engine's own alternatives for each chair: the succession into and out of it, the plan, and the reaction (emptied: the plan read 6 higher, energy over the plan, dancer favourites, known sides, fewer fame-0 sides, never cooler than it was; full: keep the line; ok: small corrections). An alternative must gain 4 (emptied), 8 (ok) or 14 (full), + 1.5 per tanda further away; at most one suggestion comes back as the Booth's card ("The floor emptied after Pedro Láurenz. Tanda 8: swap Edgardo Donato for Rodolfo Biagi 1941–1942 (energy +12, flows better) · Apply · Keep"). Apply goes through the rule check and the undo history; nothing changes the room by itself; compose never runs it (the golden set is unaffected).

The reaction also teaches (`learnFromFloor`, unless Settings → learning → Floor reactions is off): the pair into the tanda ±0.25 (−0.5 … +0.75) and the energy step into its role (`build|up`, ±0.2 within ±0.6), read by the succession's learned part. A changed tap replaces its lesson, a tap taken back removes it. The family itself stays the dancer-favourites tracker's (it reads the same taps), so nothing counts twice.

### Quality (`pnpm quality`, default 4 h golden set, engine score)

| Seed | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 | S10 | S11 | S12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| before | 90 | 89 | 90 | 89 | 90 | 90 | 88 | 89 | 90 | 89 | 91 | 90 |
| after | 90 | 89 | 88 | 89 | 90 | 90 | 88 | 89 | 90 | 89 | 91 | 91 |

Mean 89.6 before and after (S3 −2, S12 +1); every seed ≥ 88. The benchmark totals rise 1,020 → 1,032 (S3 75 → 82, S12 82 → 87, S1 88 → 88). Over the golden set and the five round-14 panel nights the strict panel's rhythmic runs fall 7 → 4, opener 11 → 7, lastSide 12 → 7, preSummit 6 → 2; energyStep 11 → 12 and tandaTone 79 → 84 rise; 3 h nights' back-to-back big-four pairs 1.50 → 1.42, and a second 3 h seed of twelve keeps an empty quartile (recorded as a fallback; round21.test.ts allows two). The featured night's shipped JSON, its pinned tandas and its one-night exceptions are untouched (succession.test.ts).

## Booth timing

`planBooth()` (`packages/core/src/booth.ts`, spec `docs/specs/round7-booth.md` §7) gives every set a clock the booth and the DJ-app exports share. The rule is the one DJs apply by hand: **silence of `gapSec` (2.5 s, 0.5–6) after every song and after every cortina**, none after a show break or the closing Cumparsita. A cortina plays from its cue-in to its stop second (20–90 s, the play length), its fade-out (3–6 s, default 4) ends exactly there, and the next tanda starts one gap after that silence. Gains are priors, not processing: `target − loudness` (−16 LUFS, −18…−12) clamped to ±12 dB plus the DJ's trim, reduced when a measured peak would pass −1 dBFS (never limited), cortinas 4 dB under the tandas (−8…−2). Leading silence is trimmed only on request and never beyond 3 s. `stats.wallClockSec` is this real clock; `stats.durationSec` remains the sum of recordings, so the benchmark is untouched.
