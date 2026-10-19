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

## Booth timing

`planBooth()` (`packages/core/src/booth.ts`, spec `docs/specs/round7-booth.md` §7) gives every set a clock the booth and the DJ-app exports share. The rule is the one DJs apply by hand: **silence of `gapSec` (2.5 s, 0.5–6) after every song and after every cortina**, none after a show break or the closing Cumparsita. A cortina plays from its cue-in to its stop second (20–90 s, the play length), its fade-out (3–6 s, default 4) ends exactly there, and the next tanda starts one gap after that silence. Gains are priors, not processing: `target − loudness` (−16 LUFS, −18…−12) clamped to ±12 dB plus the DJ's trim, reduced when a measured peak would pass −1 dBFS (never limited), cortinas 4 dB under the tandas (−8…−2). Leading silence is trimmed only on request and never beyond 3 s. `stats.wallClockSec` is this real clock; `stats.durationSec` remains the sum of recordings, so the benchmark is untouched.
