# Round 9 — engine changes (from the working-DJ critique of the featured night)

Source: `docs/reviews/round8-best-night-dj.md` (72/100 as a DJ against a 92 engine score: no voice until 36 %, a
"double peak" that was not audible, the 1935–45 canon absent, suspect files, a slow cortina after Pugliese, 53 s
everywhere). Every rule below landed with its invariant first in `packages/core/test/round9.test.ts` (19 tests); the
round-4 and round-8 suites stay green (three expectations re-read, see §6). The golden set S1–S12 scores 88–94.

The night under review: `{ hours: 4, eras: ["golden"], yearRange: [1935, 1945], tangoTandaSize: 4, cortinaCultures:
["turkish"], cortinaTrend: "classic", arcShape: "double", floorMood: "balanced", context: { mood: "energetic", event:
"milonga", timeOfDay: "night" } }` — "the featured night" below.

## 1. What changed

| # | Critique | Engine change | Invariant |
|---|---|---|---|
| 1 | Five instrumental tango tandas before the first voice; vocal 47 % (§2.1, §5.1) | **Vocal governor** in `compose()`: `rules.maxInstrumentalBeforeVocal` (golden presets: 2; the planned early D'Arienzo counts as one, so one other instrumental is allowed before him) and `rules.vocalShare` (golden: `[0.55, 0.75]` of the *tango* tandas; `[0.4, 0.75]` from 5 h; off when `vocalBias` is explicit). Each tango slot gets candidate layers: must-vocal / must-instrumental when the band could no longer be met (the última is reserved as a vocal, planned peaks and the early D'Arienzo as instrumentals), a soft `vocalBias ±0.25` lean when the running share leaves the band. The última and the Pugliese slot respect the band when their pool allows. `stats.vocalTangoShare` reports it. | R9.1 ×3 |
| 2 | First-peak slot De Angelis–Martel e66/81, main peak Rodríguez–Moreno e70/85, "one hot tanda is a spike" (§2.2–2.3) | **Planned peak slots** (`peakSlotIndices()` in `arc.ts`, `Slot.peak` / `Tanda.peak`): under `arcShape: "double"` and the classic two-peak arc, the tango slot with the highest target around each summit (30–56 % and 64–93 %). A peak slot takes `phase: peak` material only (`peakOk()`), never a profile with the new `avoidMainPeak` flag (Rodríguez, Donato in `orchestra_profiles.json`), and `buildPeak()` tries up to four families per layer, then the families whose hottest unused sides average the summit, until the tanda delivers ≥ target − 4 — a third D'Arienzo is the last resort (cap 3 per 4 h kept, also at the última). The second D'Arienzo is held for the peak chair (no D'Arienzo tango within the repeat gap before a planned peak, no D'Arienzo vals/milonga there either); the early slot is drawn a full repeat gap before the first summit; Echagüe 1938–39 is the first choice for the chair on half the nights. Pugliese is never drawn onto a peak slot. `stats.arcRmse` and `stats.peaks[]` are reported. | R9.2 ×4 |
| 3 | No Canaro–Maida, Di Sarli–Rufino, D'Arienzo–Echagüe, Troilo–Fiorentino; Láurenz, Donato, Rodríguez twice (§2.4, §5.1) | `CANON_VOCAL_FAMILIES` (`rules.ts`: Canaro–Maida 1935–39, Di Sarli–Rufino 1939–43, D'Arienzo–Echagüe 1937–39, Troilo–Fiorentino 1941–44, Tanturi–Castillo 1940–43, Biagi–Ortiz/Falgás 1939–43, Caló–Berón 1941–44 — the corpus' canonical vocal tandas with popularity ≥ 3) as `ComposeOptions.preferFamilies` on the golden presets. Weight ×2.2 for an unplayed canon family that can carry the slot (×1.4 at the opener and for a soft family in a hot slot), four of the seven drawn per seed so nights differ; a second tango tanda of any orchestra ×0.3 while a canon family is still waiting; a hard layer when the remaining slots could no longer give ≥ 3 (`CANON_FAMILIES_MIN`) distinct canon families. The identical family (orchestra, singer, overlapping years, rhythm) is now a filter, not a ×0.08. | R9.3 ×2 |
| 4 | *Rawson* 3:30, *Don Esteban* 3:23, *Todo te nombra* 3:35, *El estagiario* 3:27; *Sans Souci* 1944 from a collection; *Amurado* 1940 vocal (§2.5, §5.3) | `isSuspectSide()`: a golden-era side over 3:20 unknown to the corpus stays out of a family while it has `size + 2` other sides, ×0.35 otherwise. `Song.reissue` (Altaya / Magenta / "coleccionistas" / "colección" rows, `isReissueRow()` in the catalogue) ×0.5 in the track pick. Láurenz *Amurado* Odeon 1940-07-29 is the instrumental: `SINGER_OVERRIDE` in `scripts/build_index.py` (the source carried the singer of the coupled side *Improvisando*; Casas left Láurenz in 1940 and the source has no later Casas *Amurado*, so the review's "1944 Casas vocal" cannot be confirmed), index rebuilt (the row now merges with its radio copy: 19 118 rows), the corpus entry's singer set to null. | R9.4 ×3 |
| 5 | *Firuze* (slow) after Pugliese; *Firuze* and *Cambaz* twice; all 53 s; half chart pop (§3.4, §4) | Cortinas: every non-trend Turkish row carries `theme:turkish-classics` (26 cues, one family, the Istanbul classics the review named, all five with Deezer previews) plus `tempo:up|medium|slow` and `mood:` tags; `cortinaTempo()` / `upbeatCortina()`. `pickCortina()` takes the previous tanda's style: after a dramatic tanda the cue is energy ≥ 60 and never `tempo:slow` (that gap reserves its cue before the others are served). Never the same cue twice while the family (≥ tandas/2 cues) has a fresh one; when the family can give every gap its own cue the extreme gaps are served first and a fresh cue a little further off the floor beats a repeat; a fully fresh pool is windowed by energy fit, not file order. `planCortinas()` prefers the family / pair that can carry every gap. Lengths: a seeded ±7 s jitter on top of the fitted length, never more than 15 s from the setting (`stats.cortinaSec` is the mean); the scorer checks the mean (±8 s) and each cue against the mean (±10 s). | R9.5 ×3 |
| 6 | Di Sarli 1951 after a Biagi–Ortiz última (§1, §3.5) | `cumparsitaStyle()`: a rhythmic última (D'Arienzo, Biagi, Tanturi, Rodríguez, Donato …) closes with D'Arienzo 1951 outright, another corpus rhythmic version when the última is D'Arienzo; a lyrical / balanced / dramatic one (Di Sarli, Troilo, Pugliese, Demare) with Di Sarli 1951/55. The closing-version filter is unchanged. | R9.6 |
| 7 | *La tablada* second, *Papá Baltasar* (slowest) closing, *Llorar por una mujer* in the middle, *El abrojito* opening Pugliese (§3.2) | `enforceOrder()` after `applyRoles()`: in a 4-track tanda the most famous side goes 3rd (4th when the 3rd holds a corpus closer), the slowest side never closes a tanda of ≥ 3; corpus openers and closers keep their chairs. | R9.7 ×2 |
| + | Demare valses before the última (§1.21) | `OrchestraProfile.tangoOnly` (Demare): vals / milonga families ×0.15. After Pugliese the `followWith` styles are a filter while two such families remain (the weight alone let Caló and Demare follow him). The first vals / milonga: cool families first (round 8), then known ones among the gap-free (fame or singer share), an obscure family carries its famous side. The per-night orchestra bias widened to 0.5–1.6. | round-4 B11, "after Pugliese" |

## 2. Before / after on the review's seeds (same options as the featured night, `cortinaTrend: classic`)

| Seed | Score | Vocal share of tango tandas | Instr. before first voice | Canon families | Arc RMSE | Distinct cortinas | Cortina lengths | D'Arienzo tango slots | Peak chairs (e/t at 9, 16) | After Pugliese | Closing |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 291 before | 93 | 0.60 | 0 | 2 | 7.9 | 10/21 | 50 ×21 | 3, 10 | Láurenz 70/83 · Láurenz 67/85 | e76 | Troilo 1943 |
| 291 after | 90 | 0.67 | 0 | 4 | 8.9 | 21/21 | 46–60 | 3, 9, 16 | D'Arienzo 83/83 · D'Arienzo 86/85 | e76 | D'Arienzo 1951 |
| 252 before | 93 | 0.53 | 0 | 3 | 5.7 | 13/21 | 53 ×21 | 6, 16 | Troilo 77/83 · D'Arienzo 82/85 | e76 | D'Arienzo 1937 |
| 252 after | 89 | 0.60 | 0 | 3 | 8.1 | 21/21 | 54–60 | 3, 9, 16 | D'Arienzo 82/83 · D'Arienzo 85/85 | e82 | D'Arienzo 1951 |
| 67 before | 93 | 0.67 | 1 | 2 | 7.2 | 13/21 | 53 ×21 | 3, 10 | Troilo 76/83 · Pugliese 73/85 | e84 | D'Arienzo 1951 |
| 67 after | 92 | 0.60 | 1 | 3 | 7.5 | 21/21 | 46–59 | 3, 9, 16 | D'Arienzo 80/83 · D'Arienzo 86/85 | e60 | D'Arienzo 1951 |
| 292 before | 93 | 0.60 | 0 | 4 | 7.3 | 10/21 | 50 ×21 | 3, 10 | Láurenz 67/83 · Biagi 75/85 | e82 | D'Arienzo 1951 |
| 292 after | 90 | 0.60 | 0 | 4 | 6.7 | 21/21 | 48–60 | 3, 9, 16 | D'Arienzo 79/83 · D'Arienzo 84/85 | e76 | D'Arienzo 1951 |
| 20 before (the reviewed night) | 93 | 0.47 | 5 | 2 | 8.5 | 13/21 | 53 ×21 | 4, 15 | Troilo 76/83 · Rodríguez 70/85 | *Firuze* e54 | Di Sarli 1951 |
| 20 after | 89 | 0.69 | 0 | 5 | 9.1 | 21/21 | 38–51 | 3, 16 | Biagi 80/83 · D'Arienzo 82/85 | e64 | D'Arienzo 1951 |

"Before" is the round-8 engine on the same seeds (`scratchpad/best/seed-<n>.json`); the engine score drops 1–4 points
(arc RMSE, a third D'Arienzo in the spacing/variety factors) while every item the reviewer marked moves: the voices open
the night, 3–5 canon families, both summits at or above target − 4 with peak material, 21 distinct cortinas, an upbeat
cue after Pugliese, the Cumparsita matched to the última.

## 3. The sweep (300 seeds × 3 variants, `scratchpad/best2/search.ts`)

| Variant (300 seeds) | Scores | Mean score | Vocal share | Arc RMSE | Distinct cortinas | D'Arienzo tango tandas | Hard failures |
|---|---|---|---|---|---|---|---|
| balanced / classic | 85–93 (median 90) | 90.4 | 0.65 | 8.0 | 21.0 / 21 | 2.93 | 0 |
| energetic / classic | 81–90 (median 86) | 85.9 | 0.66 | 12.7 | 21.0 / 21 | 3.00 | 0 |
| balanced / mixed | identical to balanced / classic (the Turkish classics family is the largest either way) | 90.4 | 0.65 | 8.0 | 21.0 / 21 | 2.93 | 0 |

`floorMood: "energetic"` (targets up to 90) was tried as the review suggested: the 1935–45 pool cannot hold e85+ in
every peak-phase slot, the RMSE rises to 12–13 and the score falls to 86; the balanced floor with the energetic context
stays the better setting (the round-8 finding holds). Round 8 on the same sweep: 84–92 (median 90).

Top 3 by score (lists in `/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/best2/seed-<n>.txt|json`):

| Seed | Score | Vocal share | Canon families | Arc RMSE | Distinct cortinas | D'Arienzo | Peaks | Opener → última → Cumparsita |
|---|---|---|---|---|---|---|---|---|
| 87 | 93 | 0.60 | 5 (Canaro–Maida, D'Arienzo–Echagüe, Troilo–Fiorentino, Tanturi–Castillo, Biagi–Ortiz/Falgás) | 6.9 | 21/21 | 3, 9, 16 | Echagüe 81/83 · D'Arienzo instr 85/85 | OTV instr 1937 → Biagi–Falgás → D'Arienzo 1951 |
| 273 | 93 | 0.67 | 3 (D'Arienzo–Echagüe, Tanturi–Castillo, Biagi–Ortiz) | 6.9 | 21/21 | 3, 16 | Tanturi–Castillo 79/83 · Echagüe 84/85 | D'Agostino–Vargas → Biagi–Ortiz → D'Arienzo 1951 |
| 108 | 93 | 0.67 | 4 (D'Arienzo–Echagüe, Troilo–Fiorentino, Tanturi–Castillo, Biagi–Ortiz) | 7.0 | 21/21 | 3, 9, 16 | Echagüe 83/83 · D'Arienzo instr 84/85 | D'Agostino–Vargas → Biagi–Amor → D'Arienzo 1951 |

All three: first voice at tanda 0 or 1, no instrumental run, cortina lengths 38–59 s, an upbeat cue after Pugliese
(*Kuzu Kuzu* e76, *Göreceksin Kendini* e62, *Cemalim* e64).

## 4. New fields and calls

- `NightRules.maxInstrumentalBeforeVocal`, `NightRules.vocalShare: [lo, hi]`; `ComposeOptions.preferFamilies: PreferredFamily[]` (golden presets carry `CANON_VOCAL_FAMILIES`).
- `OrchestraProfile.avoidMainPeak`, `OrchestraProfile.tangoOnly`; `Slot.peak`, `Tanda.peak`; `Song.reissue`.
- `PlaylistStats.arcRmse`, `PlaylistStats.vocalTangoShare`, `PlaylistStats.peaks[]`.
- `Cortina.tags`: `tempo:up|medium|slow`, `mood:<word>`; `pickCortina(…, afterStyle?, exclude?)`; `CortinaPlan.tandas`, `CortinaPlan.distinct`.
- Exports: `peakSlotIndices`, `peakOk`, `phasesFor`, `enforceOrder`, `isSuspectSide`, `cumparsitaStyle`, `cortinaTempo`, `upbeatCortina`, `isReissueRow`, `CANON_VOCAL_FAMILIES`, `isCanonFamily`, `matchFamily`.
- The web (not touched here) can show `stats.peaks`, `stats.arcRmse`, `stats.vocalTangoShare`, `Tanda.peak` and `Song.reissue`; `preferFamilies` must pass the composer's option whitelist.

## 5. Scripts and data

- `pnpm index:build` — `SINGER_OVERRIDE` now carries Láurenz *Amurado* 1940 → instrumental; `data/index` rebuilt (19 118 rows, one more duplicate merged).
- `data/knowledge/cortinas.json` — Turkish rows re-tagged (theme, tempo, mood); the five classics (*Hadi Bakalım*, *Bambaşka Biri*, *Dönence*, *Araba*, *Cemalim*) were already resolved on Deezer (`data/cache/resolve/cortinas.json`, confidence 1.0); `scripts/resolve_cortinas.ts` needs no re-run (only *Cevapsız Çınlama* has no match).
- `data/knowledge/orchestra_profiles.json` — `avoidMainPeak` on Rodríguez and Donato, `tangoOnly` on Demare.
- `data/knowledge/reference_sets.json` — the famous *Amurado* (Láurenz 1940) is instrumental.

## 6. Test expectations re-read

- `round4 › B9` "cortinaLengthSec is respected": the cues are jittered, so "most nights need no stretch" is measured on the fitted mean (±8 s) with every cue within 15 s.
- `booth › gain priors`: "a trim on a track without features" now picks a track that has no features instead of assuming the first one.
- `round4 › B11` first-vals and `round4 › followWith` are unchanged but now enforced by filters rather than weights (see §1 +).

## 7. Not done / open

- The scorer still has no factor for the vocal distribution, the canon or the peaks: they are composer rules with invariants and reported stats, so the benchmark number moves little (the featured night 91–93 before, 88–93 after); the DJ-quality gain is in the lists.
- The featured night takes D'Arienzo three times in nearly every seed (the reviewer's own layout, 14 % / 43 % / 76 %): the 1935–45 pool has nobody else for a second summit at e81+.
- The context mood "energetic" sets `cortinaGenres` without `arabesk`, so the three arabesk rows are out of the featured night's pool (22 of 26 cues for 21 gaps).
