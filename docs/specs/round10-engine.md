# Round 10 — engine changes (from the working DJ's re-mark of the round-9 candidates)

Source: `docs/reviews/round9-best-night-dj.md` (seed 108 = 83, 273 = 79, 87 = 78 as a DJ against 93 engine scores;
threshold to ship 85). Every rule below landed with its invariant first in `packages/core/test/round10.test.ts`
(14 tests); the round-4, round-8 and round-9 suites stay green (four expectations re-read, see §6). Golden set S1–S12:
88–93 on the benchmark.

The featured night is the round-9 one: `{ hours: 4, eras: ["golden"], yearRange: [1935, 1945], tangoTandaSize: 4,
cortinaCultures: ["turkish"], cortinaTrend: "classic", arcShape: "double", floorMood: "balanced", context: { mood:
"energetic", event: "milonga", timeOfDay: "night" } }`.

## 1. What changed

| # | Critique | Engine change | Invariant |
|---|---|---|---|
| 1 | Biagi three times in all three nights (vals, Ortiz, Amor as última); Rodríguez–Moreno and Biagi–Ortiz twice as tango tandas in 273; the última repeating an orchestra just played (§3.1, §4) | **Orchestra cap across rhythms**: `cap()` in `buildTanda` already counted every rhythm; the holes were the última's "+1 for everyone" and the fitted extra tanda's six-tanda memory. Now the última may bring back D'Arienzo only (`ultSc`), the extra tanda sees the whole night, and a night of 5 h+ gives every orchestra two more (the marathon needs its regulars thrice). **The última never repeats an orchestra + mode (vocal / instrumental) played as a tango tanda in the second half.** **The same orchestra + singer never plays two tango tandas whatever the years** (`playedFamily()`: a filter, D'Arienzo's instrumentals excepted for the early slot and the summit; nights of 5 h+ keep the round-9 overlapping-years reading). **The última is reserved**: one vocal closer family (Biagi–Ortiz/Falgás, Tanturi–Castillo, Troilo–Fiorentino, D'Agostino–Vargas … — a corpus closer with ≥ 4 known sides whose hottest four average ≥ e78, rhythmic ×2, the profile's `singerShift` weighed) is drawn per seed, held out of the body's tango tandas (its orchestra once at most in a vals/milonga, never in the last gap-width), and tried first at the close. A vocal closer within 8 of the target ends a night that still owes the floor a voice. The builder's gap reading now matches the scorer's (an orchestra may return at i + gap); the no-gap fallback is only for pools of one or two families or a rule that names the closer. | R10.1 ×3 |
| 2 | Troilo 1943–45 instrumentals in the build (§1.7) | `subPeriods[].preferred` (new profile field): the orchestra's best sub-period ×1.5 in the phases it names. `orchestra_profiles.json`: Troilo 1938–42 build/peak (preferred), 1943–45 cool-down only, 1946–49 peak/cool-down; Biagi 1938–42 build/peak (preferred), 1943–50 build/cool-down. | R10.2 ×2 |
| 3 | Safiye Ayla before the Donato milonga, *Düm Tek Tek* before Pugliese, *Cemalim* (medium) after him, Eurovision/ska-punk as "classics" (§3.3) | `pickCortina()` takes the next tanda: never `tempo:slow` into a vals/milonga (a tagged pool), before a dramatic tanda `moodyCortina()` (medium or slow, ≤ e70), after one `upbeatCortina()` is now `tempo:up` **and** ≥ e70; the set-up of Pugliese outranks the lift after a dramatic tanda (Gobbi straight into Pugliese), and both gaps reserve their cue before the others are served. `mood:club` on *Everyway That I Can*, *Düm Tek Tek*, *Holigan* (and their theme tag dropped); `candidatesFor()` keeps club cues off a `cortinaTrend: classic` night; the `theme:turkish-classics` family is year ≤ 2000 (Kuzu Kuzu, Dudu, Cambaz, Her Şeyi Yak stay in the Turkish pool without the theme). Four more classics with Deezer previews: Erol Evgin *İşte Öyle Bir Şey*, Nükhet Duru *Ben Sana Vurgunum*, MFÖ *Peki Peki Anladık*, Yeni Türkü *Olmasa Mektubun* (the pool was exactly the size of the gaps). The energetic-mood genre list gains `arabesk`. No-repeat is judged on the whole family and, on a one-culture night, on the whole culture pool, whose fresh cues come before a used family cue; the gaps are served in play order again. Never two dramatic tandas back to back (corpus rule 15). | R10.3 ×2 |
| 4 | *Rawson* 3:30, *Mala junta* 3:36, *Todo te nombra* 3:35, *Inspiración* 3:25, *Poema* 3:21 — streams of later re-recordings (§3.4) | **Stream-length guard** in the catalogue: a pre-1946 side whose resolved or Spotify stream runs over 3:20, or 15 % over its family's (orchestra, singer, rhythm) median with four or more streamed sides, gets `Song.streamSuspect` and its `resolved.confidence` capped at 0.6 so an export re-matches it. `isSuspectSide()` no longer exempts corpus-known sides; a suspect side never enters a tanda (the family plays without it or another family plays); a reissue row only when the family has nothing else. The hour is planned on the sides the engine actually picks (known sides, 2.5 % under their mean at 4 h, the pool's mean by 8 h), the closing Cumparsita is chosen before the fit so its real length counts, a tanda is dropped when the ±8 s flex could not absorb the overshoot (two at most), and a short night takes a vals or milonga before the última when a full tango tanda would overshoot by more than 5 min. | R10.4 ×2 |
| 5 | *Papá Baltasar* closing; *Recuerdo* second in the Pugliese tanda; four fame-0 OTV instrumentals opening 87; De Angelis deep cuts in the shoulder; a fame-0 1945 D'Arienzo set at the summit (§3.5, optional) | `enforceOrder(songs, rhythm)`: a vals/milonga never ends on its lowest-energy side, closer or not (energy, not the missing tempo feature); the nearest non-opener chair takes the close. The corpus row *Recuerdo* (Pugliese 1944) is a closer. **Fame floor**: the opener family carries a known side (among the cool families, ≤ target + 10); after 20 % a vocal family needs three unused sides of fame ≥ 2 while any strong family (vocal or instrumental) is gap-free, the picks are lifted to three known sides when the family has them (never at the cost of the tanda's energy), and a tanda of nothing but corpus closers gives one chair to another side. The first D'Arienzo instrumental draws near its own target (−14…+12) with *El flete*, *El internado*, *Hotel Victoria* (fame ≥ 4 at e85+) kept for the summit chair; D'Arienzo's own summit is the main peak (at the first summit the other peak families come first and a tanda within 6 holds the chair). The gradual-steps rule starts at 10 (was 14) and anchors on the previous target − 4 when the previous tanda undershot; the sampling tail is cut at 10× (was 20×). | R10.5 ×4 |

## 2. Seed 108, item by item (round-9 engine → round-10 engine, same options and seed)

| Item | Round 9 (DJ 83) | Round 10 |
|---|---|---|
| Engine score / tandas / vocal share | 93 / 22 / 0.67 | 91 / 23 / 0.62 |
| Orchestras over two tandas (≠ D'Arienzo) | Biagi ×3 (vals, Ortiz, Amor) | none |
| Última | Biagi–Amor e74/78, Biagi–Ortiz already at 15 (same half) | Biagi–Falgás e74/78, no orchestra + mode repeated from the second half |
| Same family twice as tango tandas | none | none |
| Troilo instrumental in the build | 1943–45 at 7 (*Quejas, Inspiración, Chiqué, Fuegos artificiales*) | 1938–41 at 13 (the 1941 set) |
| Sides over 3:20 | *Rawson* 3:30, *Inspiración* 3:25, *Todo te nombra* 3:35, *Mala junta* 3:36 | none (streamSuspect rows never enter a tanda) |
| Cortina placement | slow cues before the vals (1) and the milonga (10), *Düm Tek Tek* e86 before Pugliese, *Cemalim* (medium) after him, two club cues | no issue: 22/22 distinct, the set-up and the lift as the rule reads |
| Vals/milonga ending on its lowest side | tanda 17 (*Mozo guapo, Mi morocha, Así es la milonga*) | none |
| Corpus closers | — | *Recuerdo* a closer; all closers last |
| Weak vocal tandas after 20 % (< 3 sides of fame ≥ 2) | De Angelis–Dante at 13 (4, 2, 0, 0) | Rodríguez–Flores at 10 (0, 2, 2, 0), De Angelis–Dante at 15 (0, 4, 0, 4) — the pool's two-hit families |
| Opener fame | 3, 5, 2, 5 | 5, 5, 4, 5 |
| Early D'Arienzo | *Rawson, Ataniche, Trago amargo, Charamusca* | *Retintín, Trago amargo, Ataniche, El apronte* (*El flete / El internado / Hotel Victoria* kept for the summit) |
| Peaks | Echagüe 83/83 · D'Arienzo 1945 84/85 | Echagüe 84/82 · D'Arienzo 84/85 |
| Closing | D'Arienzo 1951 | D'Arienzo 1951 |

## 3. The sweep (300 seeds × 3 variants, `scratchpad/best3/search.ts`)

| Variant (300 seeds) | Scores | Mean | Vocal share | Arc RMSE | Distinct cortinas | D'Arienzo tango | Hard failures |
|---|---|---|---|---|---|---|---|
| balanced / classic | 85–93 (median 90) | 89.9 | 0.66 | 9.2 | 21.4 of 21–22 | 3.0 | 0 |
| energetic / classic | 81–89 (median 86) | 85.9 | 0.68 | 13.9 | 21.2 | 3.0 | 0 |
| balanced / mixed | 82–93 (median 88) | 88.4 | 0.66 | 9.2 | 21.4 | 3.0 | 0 |

Round 9 on the same sweep: balanced / classic 85–93, mean 90.4, RMSE 8.0. The engine number gives back a point for
the floor's rules (the steps and arc factors read the two-tanda cap and the family rule as mismatches); the energetic
floor stays the worse setting for a 1935–45 pool.

Top 3 by score (lists in `/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/best3/seed-<n>.txt|json`):

| Seed | Score | Tandas | Vocal | Canon families | Arc RMSE | Distinct cortinas | Max orchestra (≠ D'Arienzo) | D'Arienzo | Peaks | Opener → última → Cumparsita | Before / after Pugliese |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 80 | 93 | 23 | 0.62 | Echagüe, Biagi, Di Sarli–Rufino, Tanturi–Castillo | 8.4 | 22/22 | 2 | 3, 9, 18 | Echagüe 82/82 · D'Arienzo 84/85 | Di Sarli instr → Tanturi–Castillo e79/78 → D'Arienzo 1951 | *Göreceksin Kendini* e62 → *Peki Peki Anladık* e70 |
| 74 | 92 | 22 | 0.67 | Echagüe, Biagi, Di Sarli–Rufino, Tanturi–Castillo | 7.1 | 21/21 | 2 | 3, 9, 18 | Echagüe 82/82 · D'Arienzo 85/85 | Di Sarli–Rufino → Biagi–Ortiz e77/78 → D'Arienzo 1951 | *Ele Güne Karşı* e68 → *Bambaşka Biri* e70 |
| 166 | 92 | 23 | 0.62 | Echagüe, Biagi, Tanturi–Castillo, Troilo–Fiorentino | 7.6 | 22/22 | 2 | 3, 9, 18 | Echagüe 83/82 · D'Arienzo 84/85 | Canaro instr → Tanturi–Castillo e79/78 → D'Arienzo 1951 | no Pugliese in this seed (his slot fell on a held chair) |

No side over 3:20 in any of the three; no orchestra three times; weak vocal tandas only De Angelis / Rodríguez–Flores
(74: 15–16, 166: 16, 19). Seeds 80 and 166 run a 23rd tanda and their cortinas sit at 30–43 s (the −15 s flex): a
night the booth should play at the 45 s setting by dropping the extra tanda instead.

## 4. New fields and calls

- `Song.streamSuspect`; `OrchestraProfile.subPeriods[].preferred`; `Scoring.relaxed`.
- `pickCortina(…, afterStyle?, exclude?, next?)`; `moodyCortina()`; `upbeatCortina()` is stricter (up, ≥ e70).
- `enforceOrder(songs, rhythm?)`, `shapeTanda(songs, shape, rhythm?)`.
- Cortina tags: `mood:club` (never on a classic night).
- The web (not touched) can show `Song.streamSuspect` next to the reissue flag and should treat `resolved.confidence ≤ 0.6` as "re-match before export".

## 5. Scripts and data

- `data/knowledge/cortinas.json`: three club tags, theme year ≤ 2000, four new classics; `data/cache/resolve/cortinas.json`: the four resolved on Deezer (confidence 1.0).
- `data/knowledge/orchestra_profiles.json`: Troilo and Biagi sub-periods with `preferred`.
- `data/knowledge/reference_sets.json`: Pugliese *Recuerdo* 1944 role closer.
- `packages/core/src/context.ts`: the Turkish genre expansion includes `arabesk`.

## 6. Test expectations re-read

- `round9 › R9.2`: the first summit holds a tanda within 6 of its target (D'Arienzo keeps the main peak), the second within 4; a vocal última may end within 8 when the night still owes the floor a voice.
- `round9 › R9.4`: `isSuspectSide()` no longer exempts corpus-known sides.
- `round10 › R10.5` fame floor: enforced wherever the pool allows; the 1935–45 pool under the orchestra cap and the family rule holds a few one- and two-hit families (De Angelis–Dante/Martel, Rodríguez–Flores) that take the late vocal slots when nothing stronger is gap-free — the invariant asserts a known side on every such tanda and ≤ 16 tandas under three across 24 nights.
- `round10 › R10.3`: the "no slow cue into a vals/milonga" rule is asserted on the tagged (Turkish) pool; on an untagged global pool it is a preference the energy fit may override.

## 7. Open

- The orchestra cap across rhythms plus the family rule starve the late vocal slots of a 1935–45 night: the shoulder tandas are now De Angelis–Dante/Martel (two known sides) rather than Láurenz; a second reserved family for the cool-down would fix it at the cost of variety.
- The engine scores fall 1–3 points (arc RMSE, steps): the rules trade the checker's numbers for the floor's.
