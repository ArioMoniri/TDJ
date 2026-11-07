# Round 11 — engine changes (from the working DJ's re-mark of the round-10 candidates)

Source: `docs/reviews/round10-best-night-dj.md` (seed 74 = 81, 80 = 80, 166 = 76 as a DJ against 92–93 engine
scores; threshold to ship 85). Rules R1–R7 of its §4.2 landed with their invariants first in
`packages/core/test/round11.test.ts` (8 tests); the round-4, round-8, round-9 and round-10 suites stay green (three
expectations re-read, see §5). Golden set S1–S12: 89–93 on the benchmark; featured night S1–S12: 87–89.

The featured night is unchanged: `{ hours: 4, eras: ["golden"], yearRange: [1935, 1945], tangoTandaSize: 4,
cortinaCultures: ["turkish"], cortinaTrend: "classic", arcShape: "double", floorMood: "balanced", context: { mood:
"energetic", event: "milonga", timeOfDay: "night" } }`.

## 1. What changed

| Rule | Critique | Engine change | Invariant (round11.test.ts) |
|---|---|---|---|
| R1 summit sides | The 1945 set (*Seguíme si podés, Aparcero, Don Alfonso, El pensamiento*) won the summit in all three nights; *El flete / El internado / Hotel Victoria / El cencerro* reserved and unused | `buildPeak`: a D'Arienzo instrumental at a planned peak is a **summit family** (≥ 3 unused sides of fame ≥ 3) or nothing; before the main peak that family is held for it, at the main peak it is the first layer tried; `buildTanda` lifts three sides of fame ≥ 3 into it (`lift(3, 3)` on a peak slot). The family rule lets the summit bring back the instrumental family the early slot opened (`playedFamily`: D'Arienzo instrumental at a peak is never "played") | the main-peak D'Arienzo instrumental carries ≥ 3 sides of fame ≥ 3 and never a fame-0 closer |
| R2 the shoulder | De Angelis–Dante and Rodríguez–Flores (two fame-0 sides each) at 68–73 %, Tanturi–Castillo spent at 55 % | a **second reserved family** for the shoulder (`shoulderReserve`: vocal, four known sides, a peak-phase orchestra not flagged `avoidMainPeak`, canon families ×3), held out of the body before the shoulder (its orchestra: no tango, no vals/milonga within the repeat gap of the shoulder) and tried first in the two tango slots before the main peak; **closer-class families** (vocal, four known sides, a hot four ≥ 72) weigh ×2 on 60–85 %; **two-hit families** (fewer than three known sides) only before 20 % or in the cool-down, never two adjacent; on 60–85 % a vocal family needs two unused known sides; the relaxed fallback keeps every reservation (a Biagi instrumental at 15 used to cost the última) | in 60–85 % no vocal tango tanda with fewer than two sides of fame ≥ 2; never two such tandas adjacent |
| R3 orchestra + rhythm | Láurenz milongas at 11 and 17, Tanturi tango at 6 and 12, Rodríguez tango at 10 and 16 | `playedFamily` under 5 h matches **(orchestra, rhythm)**, D'Arienzo tango excepted (his cap of three: body two when the última is his); a marathon keeps the round-9 reading. Two **canon draws** per night (seeded, beyond the two reserves) protect their orchestras — no instrumental, no other singer, as a trailing layer — until the canon family has played (a Di Sarli–Durán at 1 used to spend Di Sarli–Rufino for the night) | no orchestra plays the same rhythm twice in 4 h (D'Arienzo tango ≤ 3) |
| R4 closer side | *Maleza* (fame 0) closing Pugliese with *Hoy al recordarla* third; *La Galarcita / Azul y oro / El pensamiento* closing the summit | `enforceOrder`: the last side is a corpus closer, else one of the two hottest, and never fame 0 while a known side that is neither the opener nor the tanda's one lowest side can close; the hit stays third; a vals/milonga still never ends on its one lowest side | last = closer or top-2 by energy among the eligible sides; fame > 0 when a fame ≥ 2 side exists |
| R5 cue into a hot tanda | *Ah bu şarkıların gözü kör olsun* (e50, slow) into the summit, Zeki Müren into the última, *Üsküdar'a* into tanda 15 | `pickCortina`: into a tanda ≥ e75 the pool is `tempo:up|medium` and ≥ e60; a `tempo:slow` cue only into ≤ e70 (tagged pools); arabesk ≤ 1 per night, never into ≥ e75, off `classic` nights — a rule on the whole pool, not a preference the fit overrides; the cortina plan picks a family that can carry the hot gaps (plus the two cues each dramatic tanda reserves); a warm gap leaves the fresh up-tempo cues to the hot gaps still ahead (`plan.hotAhead`); the family is never left once its fresh cues are spent; after a drop the dropped tanda's cue (picked for the tanda that now follows) moves to the chair before | into ≥ e75 never slow and ≥ e60; slow only into ≤ e70; arabesk 0 on classic, ≤ 1 otherwise |
| R6 compression | cortinas 30–43 s under a 45 s setting in seeds 80 and 166 | the fit shrinks cues by **5 s at most** (and corrects the mean back to setting − 5 after the jitter, which is now centred); a night still too long drops the softest cool-down tango tanda whose removal keeps the cycle (never the última, never Pugliese or a dramatic tanda, never a vals/milonga onto the last two chairs), the chairs renumbered | `stats.cortinaSec ≥ setting − 5`; every cue ≥ setting − 12 |
| R7 stream guard | Pugliese *Recuerdo* 1944: index 2:35, stream 491 s, in the tanda; *Mano brava* 1:52 | `catalog.ts`: the guard reads `resolved.durationMs` / Spotify ms (the index length is capped by `plausible()` and hid the 491 s); suspect when the stream is > 200 s, **< 115 s**, or > 1.15 × the family's median stream | *Recuerdo* 1944 and *Mano brava* 1941 are `streamSuspect`; no suspect side in any tanda |

## 2. Seed 74, the eight hand-fixes of §4.1 (round-10 engine → round-11 engine, same options and seed)

| # | Hand-fix | Round 10 | Round 11 | Produced by the rules? |
|---|---|---|---|---|
| 1 | tanda 15 De Angelis–Dante → Biagi–Ortiz 1940–43 | De Angelis–Dante (0, 4, 0, 4) | **Tanturi–Castillo** 1941–42 (*Recuerdo malevo, Pocas palabras, Muñeca brava, Así se baila el tango*) e79/78 — three of the review's four sides | in substance — the chair carries the shoulder's reserved canon family; Biagi–Ortiz stays the última (the engine's reserve) |
| 2 | tanda 16 Rodríguez–Flores → Tanturi–Castillo | Rodríguez–Flores (0, 2, 2, 0) | Tanturi–Castillo is at 15; 16 is Malerba–Medina e57/83 (5, 4, 4, 4) | half — the family landed in the shoulder one chair early; the second shoulder chair is known material but soft (the closer-class pool is spent: Troilo–Fiorentino at 7, Di Sarli–Rufino at 0, D'Agostino at 12, Biagi reserved) |
| 3 | tanda 12 → D'Agostino–Vargas 1941–43 | Tanturi–Castillo | **D'Agostino–Vargas** (*Agua florida, Adiós arrabal, El yacaré, Tres esquinas*) e59/74 — the review's four sides | yes |
| 4 | última → Troilo–Fiorentino 1941 (and the Troilo vals at 14 → Rodríguez–Flores vals) | Biagi–Ortiz | Biagi–Ortiz 1940–43 e77/78 (*Ahora no me conocés … Quiero verte una vez más* closes); Troilo–Fiorentino sings at 7 (*Pa'qué seguir, Tabernero, No le digas que la quiero, Maragata*) in place of the Troilo instrumental; the vals at 14 is Rodríguez–Moreno | no — Troilo is a canon draw this night and sings early; under R3 the orchestra then has no second tango chair, so the engine keeps its reserved Biagi–Ortiz última (the review's fix 4 and its R3 contradict each other; R3 wins) |
| 5 | summit sides → *El flete, El internado, Hotel Victoria, El cencerro* | *Seguíme si podés, Aparcero, Don Alfonso, El pensamiento* (two fame 0) | *El irresistible, Derecho viejo, La morocha, Jueves* 1936–39 (3, 3, 2, 4), e86/85, *Jueves* (corpus closer) closes | yes in substance — the 1936–39 family with three sides of fame ≥ 3 and a corpus closer; tanda 3 keeps *Retintín, Trago amargo, Ataniche, Charamusca* as the review asks, so the summit takes the family's next sides |
| 6 | Pugliese order *Yuyo verde, El abrojito, Maleza, Hoy al recordarla* | *El abrojito, Yuyo verde, Hoy al recordarla, Maleza* | Pugliese instrumental 1943–45 (*Tierra querida, El remate, Tiny, El arranque*) at 19, the known sides close | yes for the rule (a fame-0 side never closes when a known side can); the Morán tanda itself was not drawn this time |
| 7 | cortinas: up-tempo into the summit and the última, *Ben sana vurgunum* for *Üsküdar'a*, *Şımarık* ↔ *Peki peki anladık* | lament into the summit, Zeki Müren into the última | into the summit *Dudu* (e80, up); into the última *Cambaz* (e72, up); *Üsküdar'a* (e40) cues D'Agostino–Vargas e59; *Ben sana vurgunum* cues the e74 vals; *Şımarık* cues the e85 Biagi vals, *Peki peki anladık* the e62 Caló vals; 21/21 distinct | yes — every hot tanda takes an up or medium cue ≥ e60, the slow cues sit before ≤ e70 tandas |
| 8 | optional: tanda 17 → Tanturi–Castillo milonga | Canaro–Maida milonga | Canaro–Maida milonga; the Tanturi–Castillo milonga plays at 5 | no — Tanturi's cap of two (milonga 5, tango 15) |

Engine score 92 → 88, 22 tandas, vocal share 0.67, arc RMSE 9.6, 21/21 distinct cortinas, cortina mean 53 s (setting 45, stretched by the fit). Canon families: Di Sarli–Rufino, Troilo–Fiorentino, D'Agostino–Vargas, D'Arienzo–Echagüe, Tanturi–Castillo, Biagi–Ortiz.

## 3. Sweep (300 seeds × balanced/classic, energetic/classic, balanced/mixed)

`scratchpad/best4/search.ts 300` (rows in `scratchpad/best4/rows.json`, dumps of the top three and of seed 74 in `scratchpad/best4/seed-<n>.txt|json`).

| Variant | Score range | Mean | Vocal share | Arc RMSE | Distinct cortinas | Hard failures | Below 85 |
|---|---|---|---|---|---|---|---|
| balanced / classic | 84–92 | 88.1 | 0.68 | 10.8 | 21.4 | 0 | 1 / 300 |
| balanced / mixed | 82–92 | 87.5 | 0.68 | 10.8 | 21.4 | 0 | 9 / 300 |
| energetic / classic | 82–88 | 84.6 | 0.67 | 15.8 | 21.4 | 0 | 127 / 300 |

Round 10 for comparison: balanced/classic 85–93 (mean 89.9), energetic 85.9, mixed 88.4. The engine score gives back one to two points for the shoulder and the uniqueness rule (the arc fit pays for them: the second shoulder chair and the e91 peak-milonga targets); the DJ's marks are what the round is for.

Top three (balanced / classic):

| Seed | Score | Tandas | Vocal share | Arc RMSE | Distinct cortinas | Peaks |
|---|---|---|---|---|---|---|
| 193 | 92 | 23 | 0.63 | 8.5 | 22/22 | Echagüe 83/82 · D'Arienzo 1940–44 instrumental 85/85 (*Canaro en París, El Huracán, Independencia, El Rey del Compás*) |
| 181 | 91 | 23 | 0.75 | 9.8 | 22/22 | D'Arienzo 79/82 · D'Arienzo 85/85 |
| 75 | 91 | 22 | 0.63 | 9.8 | 21/21 | D'Arienzo 78/82 · D'Arienzo 86/85 |

## 4. Golden set

Default 4 h golden set S1–S12: 91, 91, 91, 89, 90, 93, 89, 89, 93, 91, 90, 92. Featured night S1–S12: 89, 89, 88, 88, 88, 89, 89, 87, 87, 88, 88, 88. No hard failures.

## 5. Expectations re-read

- `round4.test.ts` per-slot family variety: a slot whose family is D'Arienzo on every seed is skipped (R1 makes the planned summit his own).
- `round9.test.ts` R9.7 / `round4.test.ts` B7: unchanged; `enforceOrder` rotates the hit behind a third-chair closer rather than swapping a corpus closer into the opening chair.
- `round10.test.ts` / `round9.test.ts` vals-milonga lowest-never-last: unchanged; `enforceOrder` now lets the fame rule yield to it (a vals whose only known side is its lowest keeps the hotter side last).
- `compose.test.ts` chair numbering after a drop: chairs are renumbered after the fit (a drop in the cool-down leaves no hole).

## 6. Not done / open

- The second shoulder chair is still the soft one on some nights under strict R3 (seed 74: Malerba–Medina e57 at 16 against t83). The pool of closer-class families is small once an orchestra's instrumental tanda has spent its tango chair; the review's own fix 4 (Troilo instrumental at 4 *and* Troilo–Fiorentino última) would break R3. A softer R3 for the última (an instrumental tanda ≥ 12 chairs earlier) would be the next lever.
- Energetic/classic nights sit at 82–88 on the benchmark: the arc fit pays for the reserved shoulder when the floor asks for e89/91 targets at 70–80 %.
