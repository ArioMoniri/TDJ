# Round 15: the dancer's second pass (seeds 255, 97, 156)

Reviewer: the same strict milonguera as in round 14. The question is the same: would I get up, would I stay up, and would I go home happy.

Spec: golden era 1935–45, 4 h, 4 tangos per tanda, 3 valses or milongas per tanda, Turkish cortinas, double peak. Sources: `scratchpad/best6/seed-{255,97,156}.{txt,json}`. The engine rules come from `docs/specs/round14-engine.md`. The engine's strict panel reports 0 blockers and 0 should-fix on all three nights. This review checks that claim from the floor.

Hours below come from the cumulative tanda and cortina lengths: hour 1 is about T0–T5, hour 2 T6–T11, hour 3 T12–T17, hour 4 T18 to the end.

---

## 1. Verdicts

### Seed 156: **the best, and the first night I would dance to the end**

- **The cycle is right.** It runs T T V T T M all night, with 4 valses and 3 milongas. The cortinas are 35–48 s.
- **Hour 1 is lovely.** Di Sarli instrumental 1940 opens, then D'Agostino, then the Rodríguez/Flores valses (Tengo Mil Novias, Fru Fru), Tanturi/Castillo, Láurenz/Casas and the Donato milonga.
- **The first peak is a real summit.** D'Arienzo/Echagüe 1938–39: Pensalo Bien, Ansiedad, Trago Amargo, No Mientas.
- **The vals is the best in all three nights.** Biagi/Ibáñez 1938: Lejos de Ti, Viejo Portón, Loca de Amor.
- **Hour 4 is the best I have reviewed in two rounds.** D'Arienzo instrumental, then Caló/Berón, then the Tanturi/Castillo valses, then Troilo instrumental 1941 as the wedge, then a Biagi/Ortíz última that ends on Quiero Verte una Vez Más, then the Tanturi Cumparsita.
- **What still bothers me:**
  - The D'Agostino tanda (T1) is from the weak 1944–45 years, and it jumps +24 into the valses.
  - After the second summit the night falls 28 points into Caló/Berón (T18 → T19).
  - The second summit has no fame-5 side.
  - La Mimada (milonga) and El Mismo Dolor (vals) have no stream, and both sit in 3-side tandas.

### Seed 97: second

- It has the same strong blocks: the Di Sarli/Rufino 1939–40 opening, Troilo instrumental, the Echagüe summit, Láurenz/Podestá, the Tanturi instrumentals and the Di Sarli/Rufino milonga.
- **But there is no vals for the first 80 minutes.** T0–T4 are five tango tandas, then a milonga, then two more tangos, and the first vals comes at T8. In Buenos Aires the women complain to the organiser by the third tango tanda.
- **The cortinas run 47–60 s,** against a 45 s setting.
- **The última is Biagi/Amor 1944–45:** golden "edge", mean fame 3.0, with a fame-2 side (Nada).
- **After the summit it drops into Caló/Berón:** −27, graded jarring.

### Seed 255: third

- **The same 80-minute wait for the first vals,** with only 3 valses all night, and the same 47–60 s cortinas.
- **Five unplanned energy steps over 14,** including Biagi/Ortíz e79 → Di Sarli instrumental e60 (T6 → T7, jarring, with a slow cortina between them).
- **The última's "Recuerdo" has a date that disagrees with its stream:** the index says 1942-11-04, the Deezer title says 08/01/1941.
- **Its hour 4 is good.** D'Arienzo, then Caló/Iriarte vals, then Láurenz/Casas, then Tanturi/Castillo.

---

## 2. Round 14 items: gone or not

| R14 | Item | Status in the three nights |
|---|---|---|
| R14-1 | Closing Cumparsita unplayable or fame 0 | **Gone.** Tanturi 1940, fame 2, streams, in all three |
| R14-2 | Dead tandas | **Gone.** The lowest tanda mean fame is 3.0. Heat labels are capped (Rodríguez now reads "good") |
| R14-3 | Sides outside 1935–45 | **Gone** |
| R14-4 | Undated or misattributed rows | **Gone** (Champagne Tango now belongs to D'Arienzo, and Trago Amargo is now credited to Echagüe) |
| R14-5 | Fame-0 openers | **Gone.** But La Mimada (fame 0, no stream) still sits mid-tanda in all three nights. See N3 |
| R14-6 | Colour or soft tanda at a peak | **Gone.** Rodríguez only plays in hour 1 or as a vals |
| R14-7 | Peak without hits, or a lyrical peak | **First summit fixed** (Echagüe is a real summit). **Second summit only partly fixed:** D'Arienzo 1937–38 at mean fame 3.25–3.5 with no fame-5 side. See N5 |
| R14-8 | Weak hour 4 | **Gone.** Tanda means are 3.0–5.0 |
| R14-9 | Soft tanda before the última | **Gone** (Láurenz/Casas, the Tanturi valses, Troilo instrumental) |
| R14-10 | Valley | **Gone** |
| R14-11 | Unplayable sides at key moments | **Mostly gone.** Two sides with no stream remain, both in 3-side tandas. See N3 |
| R14-12 | Title junk | **Gone** ("Milonguero Viejo", "Adiós, Arrabal") |
| R14-13 | Credits | **Fixed** (Trago Amargo / Echagüe; Tierrita is no longer used) |
| R14-14 | Cortina artist repeats | **Gone.** No artist within 3 cortinas of itself, and Şımarık is gone |
| R14-15 | Slow cortina into a peak | **Gone.** An up-tempo cortina comes before every summit |
| R14-16 | D'Arienzo straight into Pugliese | **Gone.** Pugliese now sits 2–3 tandas before the summit. A new cliff takes its place. See N2 |
| R14-17 | Best side not last | **Mostly gone.** It remains as a taste point in the 255 última |

The round 14 engine work removed every blocker I raised. What follows is new, or was hidden behind the old problems.

---

## 3. New blockers and should-fix items

### N1. No vals for the first 80 minutes — **blocker**
- **Where:** seed 255 (T0–T4 tango, M5, T6–T7 tango, first vals at V8) and seed 97 (the same shape). Each night has only 3 valses. The engine itself reports `cycle off` (255) and `near` (97), yet the strict panel passes, because it has no rule for the tanda cycle.
- **Problem:** Five tango tandas in a row to open the night is something no traditional milonga does. Vals lovers sit for 80 minutes.
- **Rules (add to `strict.ts` as a blocker):**
  - The first vals is within the first 3 tandas.
  - Never more than 2 tango tandas in a row.
  - On a 4 h night, the vals count is the milonga count ± 1.
  - The "known regression" in `round14-engine.md` §6 (the first vals slot falls back to a tango) must not be accepted as a strict-clean result.
- **Fixes:**
  - **255:** T2 becomes Rodríguez/Moreno valses 1940–41 (Isabelita, Con tu Mirar, Por Aquí... por Allá...); Rodríguez/Flores at V14 is 12 slots away. D'Agostino/Vargas 1941 moves to T4, in place of the Donato instrumental tanda (fame 3.25, 3-year spread). Donato keeps its M11 milonga.
  - **97:** T1 becomes D'Agostino/Vargas 1941, which drops the Rodríguez/Moreno tango. T2 becomes the De Angelis duet valses 1944–45 (Pregonera, Soñar y Nada Más, Mi Novia de Ayer); De Angelis is not used in 97.

### N2. The cliff after the second summit — **should-fix**
- **Where:**
  - 156: T18 D'Arienzo (e86) → T19 Caló/Berón (e58), a drop of 28 points, jarring at 69.3, with a slow Cem Karaca cortina between them.
  - 97: T18 (e85) → T19 Caló/Berón (e58), −27, jarring at 71.5.
  - 255: T18 (e86) → V19 Caló/Iriarte (e62), −24.
- **Problem:** Moving Pugliese away from the summit solved R14-16. The slot after the summit now gets the softest lyrical tango of the night, 18 points under its own target of 76. A breath after D'Arienzo is fine. A fall off a cliff is not.
- **Rule:** the tanda after a summit has energy ≥ summit − 18 and ≥ its own slot target − 8. If it is a tango, its class is not L (lyrical). The cortina between them is medium, not slow.
- **Fixes:**
  - **97:** swap T19 Caló/Berón with T15 Troilo/Fiorentino (B class, e67). The gaps hold: Troilo T3/T19, Caló V8/T15.
  - **156:** T19 becomes Troilo instrumental (from T21, e76, −10). T21 becomes Láurenz/Podestá (from T10, e67, which passes the wedge rule at ≥ 66). T10 becomes Caló/Berón. That leaves a −22 drop after the first summit (e80), which is acceptable mid-night.
  - **255:** taste only. A vals after the summit is a classic breath. Fix its missing stream (N3).

### N3. A side with no stream inside a 3-side tanda — **should-fix** (blocker if the DJ plays from streams only)
- **Where:**
  - The Donato/Lagos milonga in all three nights (255 M11, 97 M5, 156 M5): La Mimada, fame 0, `NO-STREAM`, length estimated (≈2:00).
  - The Caló/Iriarte vals in all three nights (255 V19, 97 V8, 156 V8): El Mismo Dolor, `NO-STREAM`.
- **Problem:** The `stream` rule allows one side with no stream per tanda. In a 3-side milonga or vals, that leaves a 2-side tanda, and the floor notices. La Mimada is also the same fame-0 side I flagged in round 14 as an opener. It has moved to the middle, but it is still there in every night.
- **Rule:** in 3-side tandas every side streams and no side has fame 0. The current allowances (≤ 1 fame-0 side, ≤ 1 unstreamable side) apply only to 4-side tandas.
- **Fixes:**
  - La Mimada → Porteña Linda (1940) or Campo Afuera (1940), both Lagos. This gives a 1938–40 spread of 2 years. Check their streams.
  - El Mismo Dolor → Luna de Plata (1943, streams, fame 2). The other choice is to give the slot to a 3-for-3 vals family (Biagi/Ibáñez, Rodríguez/Moreno, De Angelis duets).

### N4. Cortinas longer than the setting — **should-fix**
- **Where:** 255 runs 47–60 s and 97 runs 47–60 s, with `cortinaLengthSec: 45` (eleven cortinas in 255 are over 50 s). 156 runs 35–48 s, so the engine can do it.
- **Problem:** 21 cortinas × 10–15 s too long is 4–5 minutes of people standing on the floor. In Buenos Aires a cortina is 30–40 s. A 60 s Dönence is a song, not a cortina.
- **Rule:** every cortina's `lengthSec` is ≤ `cortinaLengthSec + 5` and never over 50. The `cortinaLength` benchmark check, which still reads "ok" on these nights, must fail them.
- **Fix:** trim every cortina to 40–45 s on 255 and 97.

### N5. The last summit has no anthem — **should-fix**
- **Where:**
  - 255 T18: El Cencerro 4, La Catrera 3, El Porteñito 2, El Esquinazo 4 (mean 3.25).
  - 97 T18: El Cencerro 4, El Caburé 3, Qué Noche 3, El Esquinazo 4 (3.5).
  - 156 T18: El Cencerro 4, Qué Noche 3, Champagne Tango 3, El Esquinazo 4 (3.5).
- **Problem:** `peakHits` passes with two fame-4 sides. But the top of the night needs one tango the whole room knows from the first bar. The first summit (Echagüe, with Pensalo Bien and No Mientas at fame 5) has it. The second does not.
- **Rule:** the last summit holds ≥ 1 side with fame 5 and has a mean fame ≥ 3.75.
- **Fix:** take one or two of the canonical 1937–39 instrumentals in the index: El Choclo (1937), Rodríguez Peña (1938), Derecho Viejo (1939), La Morocha (1937). For example: El Cencerro, El Choclo, Rodríguez Peña, El Esquinazo. This holds if the fame data rates El Choclo or Derecho Viejo at 5. If it rates none of them at 5, the gap is in the fame data, not the night.

### N6. A family played in its weak years when its best years are free — **should-fix**
- **Where:** 156 T1, D'Agostino/Vargas 1944–45: A Quién Le Puede Importar 3, Rondando tu Esquina 3, Caricias 4, Mano Blanca 3. Mean fame 3.25, e49–58. Then it jumps +24 into the Rodríguez valses (jarring, 66). The 1941 tanda (Agua Florida, Adiós Arrabal, El Yacaré, Tres Esquinas, mean 4.75, all streaming) is not used in the night.
- **Rule:** a family's tanda takes its best-fame window unless that window is already played in the night. The tanda's mean fame is ≥ the family's best mean − 0.75.
- **Fix:** 156 T1 becomes D'Agostino/Vargas 1941.

### N7. A weak última — **should-fix**
- **Where:** 97 T21, Biagi/Amor 1944–45: Tus Labios Me Dirán 4, Nada 2, Café de los Angelitos 3, Seamos Amigos 3. Golden "edge", mean fame 3.0.
- **Problem:** The last tanda is the one people remember on the way home. It should be beloved, not acceptable.
- **Rule:** the última is golden core, has mean fame ≥ 4, and has every side at fame ≥ 3.
- **Fix:** use Biagi/Ortíz 1940–41 (156's última: Ahora No Me Conocés, Humillación, Zaraza, Quiero Verte una Vez Más). Biagi's V14 Falgás vals is 7 slots earlier, so the gap holds.

### N8. Unplanned energy jolts — **should-fix**
- **Where:** 255 has 5 steps over 14 (its `steps` factor is 0.17):
  - T2 → T3: +17.
  - T6 → T7: Biagi/Ortíz e79 → Di Sarli instrumental e60, −19, jarring, with the slow Tarkan "Kış Güneşi" between them.
  - T13 → V14: +21.
  - T17 → T18: +18.
  - T18 → V19: −24.
- **Problem:** The engine already measures these jolts, but the strict panel does not gate them.
- **Rule:** adjacent tandas differ by ≤ 16 points of energy, except a planned lift into a summit (≤ 20) and the vals breath after a summit (≤ 24). An unplanned step beyond that is a strict should-fix.
- **Fix:** in 255, Biagi/Ortíz is too hot for a t68 build slot. The repair needs the two-move search that §6 of the engine spec says it lacks. For example, move Biagi/Ortíz to the última (Tanturi/Castillo then goes to T6) and make the cortina after T6 medium.

### N9. A stream whose title disagrees with the row's date — **should-fix (data)**
- **Where:** 255 T21, Tanturi/Castillo "Recuerdo". The index has `79264f596c` at 1942-11-04, but the Deezer match is titled "Recuerdo (Buenos Aires 08/01/1941 Restauración 2022)". Either the row's date is wrong or the stream is a different take. Recuerdo is Pugliese's tango, so check the vocal credit as well. 97 and 156 use the clean Recuerdo Malevo (1941-12-23, and its stream title carries the same date).
- **Rule:** when a matched stream title or album carries a full date, it must equal the row date within ± 31 days. Otherwise the side is `streamSuspect` and cannot be an opener, a summit side or an última side.
- **Fix:** 255 T21 → Recuerdo Malevo, as in 97 and 156.

---

## 4. Taste

- **T1.** The three nights are near-copies. The Di Sarli/Rufino milonga is the same in all three, at M17. Caló/Berón, Láurenz/Podestá, Láurenz/Casas (the same four sides for the sixth night in a row), the Canaro/Maida milonga, the Donato milonga, the Caló/Iriarte vals, the Echagüe summit, the D'Arienzo 1937–38 summit, the Tanturi instrumentals and the Tanturi/Castillo valses all repeat. One night is fine. A weekly milonga would notice in two weeks.
- **T2.** The night leans on a few orchestras. 156 has Biagi ×3, Di Sarli ×3, and Tanturi ×3 plus the Cumparsita. 255 has Di Sarli ×3 and Tanturi ×3 plus the Cumparsita. De Angelis and Fresedo never appear.
- **T3.** 156 spends the classic Tanturi/Castillo tango tanda (Así Se Baila el Tango) at 0:35, at e78 in a t72 warm-up slot. I would keep it for hour 2 or 3.
- **T4.** In the 255 última, Así Se Baila el Tango (5, e85) is in slot 3, and the night ends on Pocas Palabras. I would end on Así Se Baila el Tango.
- **T5.** The Donato instrumental tanda 1936–39 (El Chamuyo, El Estagiario, Pasión Criolla, La Tablada) is in every night. All its sides are fame 3 or 4, and it spreads over 3 years. It is honest filler.
- **T6.** Pugliese/Chanel (97, 156) is the right vocal Pugliese for dancers, and 255 plays Pugliese instrumental. All three are fine. Farol (1943, 3:20) has no heatmap grade.
- **T7.** Tarkan "Kuzu Kuzu" right before the última (156) makes the room smile. Some will find it too much pop for the last cortina.

---

## 5. New rules for the strict panel

| # | Rule | Severity |
|---|------|----------|
| R15-1 | Tanda cycle: the first vals within the first 3 tandas; ≤ 2 tango tandas in a row; vals count = milonga count ± 1 | blocker |
| R15-2 | After a summit: energy ≥ summit − 18 and ≥ slot target − 8; a tango there is not class L; the cortina between is not slow | should-fix |
| R15-3 | 3-side tandas: every side streams, no side at fame 0 | should-fix (blocker when playing from streams) |
| R15-4 | Cortina length ≤ setting + 5 s, never over 50 s; the `cortinaLength` check must enforce it | should-fix |
| R15-5 | Last summit: ≥ 1 side at fame 5, mean fame ≥ 3.75 | should-fix |
| R15-6 | A family's tanda: mean fame ≥ the family's best mean − 0.75 unless that window is already played | should-fix |
| R15-7 | Última: golden core, mean fame ≥ 4, every side at fame ≥ 3 | should-fix |
| R15-8 | Adjacent tandas differ by ≤ 16 energy (summit lift ≤ 20, post-summit vals ≤ 24) | should-fix |
| R15-9 | A stream title or album with a full date must match the row date ± 31 days, else `streamSuspect` | should-fix (data) |

---

## 6. Final verdict

**Would I, as the strictest milonguera, be happy with the best of these nights as it stands? Yes: seed 156**, on one condition. The DJ must own files for the two sides with no stream (La Mimada and El Mismo Dolor). From streams only, the answer is **no**, because a milonga tanda and a vals tanda each drop to two sides.

In seed 156 nothing makes me sit down or go to the organiser. I would dance to the end and leave happy. It is not perfect. I would still notice the D'Agostino 1944–45 tanda at T1, the drop into Caló after the second summit, and a second summit with no anthem (N6, N2, N5).

Seeds 255 and 97 are **no** as they stand: 80 minutes before the first vals is a blocker on any traditional floor (N1).
