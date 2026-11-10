# Round 15 — DJ review, second pass: the round-14 engine's three best nights (seeds 255, 97, 156)

**What this is:** the same reviewer and the same strictness as `round14-dj.md`, applied to the three strict-clean nights of the round-14 sweep (`docs/specs/round14-engine.md` §6).

**Nights:**

| Seed | Engine | Benchmark | Checks passed | Notes from the run |
|---|---|---|---|---|
| 255 | 88 | 91 | 16/18 | cycle off |
| 97 | 87 | 94 | 16/18 | cycle near |
| 156 | 86 | 93 | 16/18 | — |

**Shared preset:** 1935–45, 4 h, Turkish cortinas, double peak, `cortinaLengthSec 45`.

**Sources:** I read the `.txt` listings and the `.json` plans in `scratchpad/best6/`.

**Conventions:**
- Tanda numbers are 0-based.
- Cue *n* is the cortina after tanda *n*.
- R+ means a hard-drive orchestra (D'Arienzo, Biagi, Tanturi). The tango-only sequence means the tango tandas in order, with valses and milongas between them ignored.

---

## 1. Verdicts

| Night | My mark as is | Blockers | Mark after the fixes in §3 | Verdict |
|---|---|---|---|---|
| **156** | **85** | 0 | ~90 | **The one to ship.** The cycle is intact, the structure is right, and the energy faults can be bridged live |
| 255 | 83 | 1 (no vals until 1:25) | ~90 | Best ending and best opening, but the broken cycle is a blocker |
| 97 | 80 | 1 (no vals until 1:25) | ~87 | The última is an edge-band Biagi/Amor set while Tanturi/Castillo was spent at 1:05 |

### What round 14 fixed

The rule-level work landed. All three nights now have:
- every side in range
- no colour orchestra at a peak
- Pugliese 2–3 slots before the last summit, with Troilo or a milonga between
- D'Arienzo/Echagüe on peak 1
- the full 9/9 canon, including the Di Sarli/Rufino tango and the Troilo/Fiorentino tango
- one tango tanda per singer
- no rhythmic tango triples
- at most 3 vocal tango tandas in a row
- no *Şımarık*
- no cortina artist more than twice

### Seed 156

**Strengths**
- The opener is Di Sarli instrumental 1940.
- The last four tandas are Caló/Berón, the Tanturi/Castillo vals, Troilo instrumental and Biagi/Ortiz. That is a good ending.
- Cortinas run 35–48 s.

**Faults, all should-fix**
- **1→2 is jarring.** The warm-up vals is Rodríguez/Flores at e79 (*Fru Fru* at e84) on a slot targeted at 59.
- **6→7 is jarring:** Biagi instrumental at e77 into Di Sarli/Rufino at e61.
- **18→19 is jarring:** the D'Arienzo summit at e86 into Caló/Berón at e58.
- **#12–#13 are two rhythmic instrumental tango tandas back to back:** Tanturi, then Donato.
- **Two sides have no stream:** *La Mimada* and *El Mismo Dolor*.

### Seed 255

**Strengths:** the musically best night.
- It opens with Di Sarli/Rufino 1939–40.
- Pugliese sits at #15, then Troilo/Fiorentino, then the Di Sarli milonga, then the D'Arienzo summit.
- The ending is Láurenz/Casas, then the Tanturi/Castillo última.

**Faults**
- **Blocker:** slot 2 is a tango, so the floor gets five tango tandas and a milonga before the first vals at #8.
- **The vals and tango at #19–#20 are swapped:** the cycle check reports 3 tandas off the cycle.
- **Cortinas are stretched to 47–60 s,** against a 45 s setting, to fill 4 h with 22 tandas.
- **6→7 is the same jarring pattern** as in seed 156.
- **The last summit drops 24 points into the Caló/Iriarte vals.**

### Seed 97

**Faults**
- **Blocker:** the same missing first vals as seed 255.
- **The night's canonical última tanda is spent at #6 (1:05):** Tanturi/Castillo, ending on *Así se baila el tango*.
- **The actual última is weak:** Biagi/Alberto Amor 1944–45, golden *edge*, mean fame 3.0.
- **Two jarring transitions:** 6→7 and 18→19, the same patterns as in the other nights.
- **Cortinas run 47–60 s.**

---

## 2. Status of my round-14 items

| Item | Status in 255 / 97 / 156 | Note |
|---|---|---|
| B1 range | **gone** | Every side is in 1935–45. 97's última is in range but in Biagi's *edge* band (N4) |
| B2 colour at a peak | **gone** | Colour: Canaro milonga plus a Rodríguez tanda, never on a peak slot |
| B3 summit straight into Pugliese | **gone** | Pugliese at #15 or #16. 255 follows him with Troilo/Fiorentino; 97 and 156 with the Di Sarli/Rufino milonga |
| B4 fixer parity | **gone** | improveNight made 1–2 changes, all strict-panel edits; no conversion to an instrumental tanda remains |
| S1 rhythmic runs | **mostly gone** | No tango triple. New: two rhythmic **instrumental** tango tandas back to back (N5) |
| S2 D'Arienzo peak chair | **gone** | Echagüe 1938–39 on peak 1 in all three |
| S3 D'Arienzo rotation | **gone, at a cost** | The repair replaced the early D'Arienzo instrumental with Troilo (255 #3, 97 #3: *"replaces Juan D'Arienzo instrumental"*) instead of re-windowing it. This is why D'Arienzo plays only 2 tango tandas (N10) |
| S4 one tango tanda per singer | **gone** | — |
| S5 canon 8/9 | **gone (9/9)** | Pugliese/Chanel also appears in 97 and 156 (my old taste item T4) |
| S6 vocal runs and instrumental per hour | **gone** | — |
| S7 wedge before the última | **gone** | — |
| S8 unknown sides | **mostly gone** | *La Mimada* (fame 0, no stream) is still in all three; see N7 |
| S9 club cues and artist repeats | **partly** | *Şımarık* is gone and artist counts are ≤ 2. "Pop/rock ≤ 1 per hour" was not implemented (spec §6): *Araba* precedes the D'Arienzo summit in all three nights (N9) |
| S10 cue mood | **gone** | The cue before Pugliese is *Dağlar Dağlar* or *Tamirci Çırağı* |
| S11 colour budget | **gone** | 2 colour tandas per night, at least 4 slots apart |
| S12 peak window | **gone** | Peaks only at #9 and #18. The admitted cost is the jarring drop after the last summit (N3) |

---

## 3. New flaws

### Blocker

**N1. The first vals slot is a tango, so the cycle breaks**
- **Where:**
  - **255 #2:** D'Agostino/Vargas sits in the vals slot. Also #19 (vals) and #20 (tango) are swapped, so the cycle is off by 3 tandas.
  - **97 #2:** D'Agostino/Vargas; the cycle is off by 1.
- **Problem:**
  - The floor gets #0–#4, five tango tandas (about 1 h), then a milonga.
  - The first vals comes at #8, about 1 h 25 into the night.
  - On a milonga this is a structural fault, not a statistic. The vals dancers leave or sit out the whole first hour.
  - Spec §6 admits the regression: when the only famous vals family is blocked by the repeat gap, the slot falls back to a tango.
- **Rule:**
  - On `pattern: "classic"`, `tandas[i].rhythm === TTVTTM[i mod 6]` is a **hard** rule, and the first vals is ≤ 40 minutes in.
  - When the preferred vals family is blocked by the gap, the composer must try, in order:
    1. move a vals family from a later vals slot
    2. a second-choice core vals family with mean fame ≥ 3
    3. a colour vals within the colour budget

    It never converts the slot to a tango.
  - The panel reads a missing vals before 40 min as a blocker.
- **Fix for 255** (23 tandas, cortinas back to 45 s):

  | Slot | Today | Change |
  |---|---|---|
  | 2 | D'Agostino/Vargas | **Caló/Iriarte vals**, moved from #19, with *Luna de Plata* (1943) replacing the unstreamable *El Mismo Dolor* (e62 for a target of 59) |
  | 3 | Troilo instrumental | **D'Agostino/Vargas 1941** |
  | 4 | Donato instrumental | **Troilo instrumental 1941**; Donato instrumental leaves, Donato keeps the #11 milonga |
  | 19 | Caló/Iriarte vals | **Láurenz/Casas**, moved from #20 |
  | 20 | Láurenz/Casas | **Biagi/Ibáñez vals 1938** (Lejos de Ti, Viejo Portón, Loca de Amor). Biagi then plays #6, #12 and #20: two tangos plus a vals, within the cap |
  | 21 | Tanturi/Castillo | **De Angelis/Dante 1944–45** (Melenita de Oro, Cruz de Palo, Vieja Luna, No Me Importa su Amor; e≈67), within 12 of the última |
  | 22 | — | **Tanturi/Castillo última** |

  Gaps, singers, the canon (9/9), vocal runs (≤ 3) and instrumentals per hour all hold.

- **Fix for 97:**

  | Slot | Today | Change |
  |---|---|---|
  | 1 | Rodríguez/Moreno | **D'Agostino/Vargas**; Rodríguez/Moreno leaves |
  | 2 | D'Agostino/Vargas | **Canaro/Maida vals 1935** (Sueño de Muñeca, Tú y Yo, Yo Quiero que Sepas). Canaro then has a vals at #2 and the milonga at #11, which keeps the colour budget at 2 tandas, 9 apart |

  The night then runs about 3.85 h at 45 s cues. The composer must plan 23 slots. Under the gap rules there is no clean tango left for the slot before the última, which is a large part of why 97 ranks third.

### Should-fix

**N2. The same jarring transition at 6→7 in all three nights**
- **Where:**

  | Night | 6→7 | Engine score |
  |---|---|---|
  | 255 | Biagi/Ortiz (e79, target 68) → Di Sarli instrumental (e60, target 74) | 63.1 jarring, H3 |
  | 97 | Tanturi/Castillo (e78, target 68) → Di Sarli instrumental (e61, target 74) | 70 jarring, H3 |
  | 156 | Biagi instrumental (e77, target 68) → Di Sarli/Rufino (e61, target 74) | 69.6 jarring, H3 |

- **Problem:**
  - The builder fills slot 6 with an R+ tanda that is 9–11 points over its target, then slot 7 with a lyrical tanda that is 13 under.
  - The plan rises here (68 → 74). The night falls 17–19 points.
  - Within each pair, the boundary sides make it worse: the R+ tanda ends on its hottest side (*Quiero Verte una Vez Más* e84, *Así Se Baila el Tango* e85), and the lyrical tanda opens on its softest (*La Trilla* e54, *Catamarca* e57).
- **Rule:**
  - Never place an R+ tanda more than 8 over its target directly before a lyrical tanda more than 10 under its target.
  - Repair, in order:
    1. swap the two tandas when gaps, vocal runs and the other rules allow it
    2. otherwise order the boundary sides so that `|last(a).energy − first(b).energy| ≤ 15`, keeping the panel's opener and lastSide rules
  - The "reorder" phase of `strictRepair` should try both.
- **Fix** (a slot swap would break the Biagi gap in 255 and the vocal run in 156, so use side order in all three):
  - **255:** end Biagi/Ortiz on *Humillación* (e77, fame 4) and open Di Sarli on *Milonguero Viejo* (e66, fame 4), ending on *La Trilla*.
  - **97:** end Tanturi/Castillo on *Pocas Palabras* (e75, fame 5) and open Di Sarli on *Milonguero Viejo*.
  - **156:** end Biagi on *Unión Cívica* (e74, fame 4) and open Di Sarli/Rufino on *Cascabelito* (e63, fame 4).

**N3. The release after the last summit is too deep**
- **Where:**

  | Night | 18→19 | Drop | Engine score |
  |---|---|---|---|
  | 255 | D'Arienzo (e86) → Caló/Iriarte vals (e62) | −24 | unplanned step 16 |
  | 97 | D'Arienzo (e85) → Caló/Berón (e58) | −27 | 71.5 jarring, H3 |
  | 156 | D'Arienzo (e86) → Caló/Berón (e58) | −28 | 69.3 jarring, H3 |

- **Problem:**
  - Peak-run capping (S12) correctly ended the plateau, but the very next slot now holds the softest tanda of the night, behind a slow cue: *İstanbul'da Sonbahar* at e50, *Resimdeki Gözyaşları* at e48.
  - The floor goes from the top of the night to the bottom in one cortina, with 45 minutes left.
  - The lyrical release belongs two tandas after the summit, not one.
- **Rule:**
  - The tanda right after the last summit has energy ≥ summit − 18 and ≥ its target − 10.
  - The cue between them is `tempo:medium`.
- **Fix:**
  - **97 #19 and 156 #19:** replace Caló/Berón with **De Angelis/Dante 1944–45** (e≈67, a new orchestra, gaps clear). Caló stays in the night through the Iriarte vals, which satisfies the canon.
  - **255:** solved by N1, because #19 becomes Láurenz/Casas at e67.

**N4. The última is weaker than a tanda already spent**
- **Where:**
  - **97 #21:** Biagi/Amor 1944–45, golden *edge*, mean fame 3.0. *Nada* has fame 2.
  - Meanwhile Tanturi/Castillo (mean 4.5, ending on *Así se baila el tango*) played at #6.
  - **156 #3:** the same Tanturi/Castillo set at 0:40, but its última (Biagi/Ortiz, 3.75) is acceptable.
- **Problem:** the última is the night's signature. An edge-band set with an unknown side is not one.
- **Rule:**
  - The última is a **core-band** family.
  - Its mean fame is ≥ (the highest mean fame of the night's vocal tango tandas) − 0.75.
- **Fix:** **97 #21** → **Biagi/Ortiz 1940** (Quiero Verte una Vez Más, Todo Te Nombra, Pinta Orillera, Guapo y Varón). Biagi stays at two tandas plus the vals at #14, with gaps of 7.

**N5. Two rhythmic instrumental tango tandas back to back**
- **Where:**
  - **97:** #12 Donato instrumental, then #13 Tanturi instrumental.
  - **156:** #12 Tanturi instrumental, then #13 Donato instrumental.
  - In both nights, #11–#14 (Canaro milonga, the two instrumentals, the Biagi vals) is four rhythmic tandas in a row.
- **Problem:**
  - Same character, back to back: what the user asked never to hear.
  - `rhythmicRun` only counts triples.
  - The Donato instrumental tanda is also weak and identical in all three nights: 1936–39, a 3-year spread, era grade 0.70, mean fame 3.25.
- **Rule:** in the tango-only sequence, two adjacent **instrumental** tandas must differ in coarse class (rhythmic versus L, B or D).
- **Fix:**
  - **97 #12 and 156 #13:** replace the Donato instrumental with **Donato/Lagos tango 1938–40** (El Adiós, Lágrimas, Soy Mendigo, Mis Pesares).
  - Lagos then sings one milonga and one tango, which satisfies singerOnce. The Donato gap is 7 or 8.
  - Vocal runs stay ≤ 3 in both nights.
  - The night gets Donato's real treasure, the vocal tanda, instead of his filler instrumentals.

**N6. Cortinas stretched to fill the clock**
- **Where:** 255 and 97. 16 of the 21 cues run 47–60 s against `cortinaLengthSec 45`, for example *Dönence* at 60 s, *Kış Güneşi* at 59 s and *Yaz Gazeteci Yaz* at 59 s. 156, with 23 tandas, runs 35–48 s.
- **Problem:**
  - A one-minute cortina on an encuentro floor is a dead minute.
  - The stretch hides a missing tanda: 22 tandas instead of 23.
  - The benchmark range (30–90 s) is too loose to catch it.
- **Rule:**
  - Every cue is within `cortinaLengthSec ± 10`.
  - The night's length is met by the number of tandas, never by cortina length. A 4 h night with 4/3/3 tandas has 23.
- **Fix:** N1 for 255. Plan 23 slots for 97.

**N7. The same two unplayable sides in every night**
- **Where:**
  - *La Mimada* (Donato/Lagos milonga 1939): fame 0, no stream, estimated 2:00. In 255 #11, 97 #5 and 156 #5.
  - *El Mismo Dolor* (Caló/Iriarte vals 1945): no stream. In 255 #19, 97 #8 and 156 #8.
- **Problem:**
  - The `stream` rule allows one unstreamable side **per tanda**, so a night can carry several holes.
  - Played from streams, each hole is a gap in a 3-song tanda.
- **Rule:**
  - A side without a stream is admitted only when no streamable side of the same family within the tanda's year window exists.
  - A night carries at most one such side, and the UI marks it "needs your file".
- **Fix:**
  - *La Mimada* → *Campo Afuera* or *Porteña Linda* (Donato/Lagos 1940; the milonga spread of 2 years holds), whichever resolves.
  - *El Mismo Dolor* → *Luna de Plata* (Caló/Iriarte 1943; the vals spread of 2 years holds).

**N8. The warm-up vals is a hot one**
- **Where:** **156 #2** Rodríguez/Flores (Tengo Mil Novias e77, Las Espigadoras e76, Fru Fru e84). It averages e79 on a slot targeted at 59, and 1→2 is jarring (66) coming from D'Agostino 1944–45 at e55.
- **Problem:** spec §6 relaxed the test to "a little hotter than the slot". +20 is not a little.
- **Rule:** the first vals is ≤ its target + 10, and its last side is ≤ its target + 15.
- **Fix:** **156 #2** → **Canaro/Maida vals 1935** (Sueño de Muñeca, Tú y Yo, Yo Quiero que Sepas). Canaro is then at #2 (vals) and #11 (milonga); colour stays at 2 tandas, 9 apart. *Optional:* #1 → D'Agostino/Vargas **1941** (Agua Florida, Adiós Arrabal, El Yacaré, Tres Esquinas; mean fame 4.75) instead of 1944–45 (3.25). The 1941 sides are free in this night.

**N9. A dance-pop cortina before the summit (S9, still open)**
- **Where:**
  - *Araba* (Mustafa Sandal, e82): cue 17 in 255 and 156, cue 8 in 97. It always precedes a D'Arienzo summit.
  - *Kuzu Kuzu* (Tarkan): cue 21 in 156, before the última.
  - From cue 13 onward, 255 has five pop or rock cues.
- **Problem:** these are the songs the floor will keep dancing to. Right before a summit, the floor never clears.
- **Rule:**
  - At most one `mood:pop` or `mood:rock` cue per hour.
  - Never a `mood:pop` cue directly before a planned peak or the última.
- **Fix:**
  - The cue before the summit → *İşte Öyle Bir Şey* or *Bambaşka Biri* style: festive, Turkish classic, medium or up tempo.
  - 156 cue 21 → *Göreceksin Kendini*.

### Judged, accepted

**N10. D'Arienzo plays only 2 tango tandas.**

**Verdict: accept for these nights.** The engine reports "darienzo near" and the darienzo factor is 0.60. My reasons:
- Both summits are D'Arienzo, in two different periods and modes: Echagüe 1938–39 and the 1937–38 instrumentals.
- The nights carry 5–6 hard-drive tango tandas in all: Biagi ×2–3 and Tanturi ×2–3.
- The floor does not miss a third D'Arienzo.

The cost is that hour 1 has no D'Arienzo. This came from the repair replacing the early D'Arienzo instrumental instead of re-windowing it.

**Rule for the engine:** when `rotation` fails on D'Arienzo, re-window first. Take 1935–36 for the early tanda and the 1939 instrumentals (Maipo, No Me lo Digas, Yunta Brava …) for the summit, and replace the family only if no window passes. The `darienzo` benchmark and factor accept 2 tandas when both summits are D'Arienzo and the night has ≥ 5 R+ tango tandas.

**N11. Seed 255, steps 0.17 (five unplanned steps over 14).** I judged each step:

| Step | What happens | Verdict |
|---|---|---|
| 3→4 | Troilo instrumental (e76) → Donato instrumental (e63) | Fix (goes away with N1) |
| 6→7 | Biagi/Ortiz → Di Sarli instrumental | Fix (N2) |
| 12→13 | Biagi instrumental (e77) → Caló/Berón (e58), slow cue | **Accept.** A deliberate contrast into the breather between the peaks |
| 13→14 | Caló/Berón (e58) → Rodríguez/Flores vals (e79), up cue *Cambaz* | **Accept.** A planned lift into a vals |
| 18→19 | D'Arienzo summit → Caló/Iriarte vals | Fix (N3) |

**Rule for the engine:** the `steps` factor should not count a tango → vals or tango → milonga lift of ≤ +22 behind a `tempo:up` cue, nor a drop into a lyrical tango behind a slow cue when the slot is not hot (target < 75).

**N12. Seed 255, the jarring transition.** This is 6→7 (63.1, H3): reject, and fix by N2. It is the only jarring boundary in 255. The other fine-rated ones are acceptable:
- 3→4 is fixed by N1.
- 12→13 and 13→14 are accepted (N11).
- 14→15 (79.2, the Rodríguez vals into Pugliese with a moody cue) is accepted.
- 18→19 is fixed by N1 and N3.

---

## 4. Taste

- **T1. Both summits are D'Arienzo in all three nights.** This is unchanged from round 14. Biagi or Tanturi could carry peak 1.
- **T2. The milonga before the last summit is Di Sarli/Rufino in all three nights:** Zorzal, La Mulateada, Pena Mulata, which is a lyrical milonga. A Donato or Canaro milonga would lift the floor into D'Arienzo better. In all three nights the swap is blocked by the gap rule (Di Sarli would sit 4 from his other tanda).
- **T3. Seeds converge even more than in round 14.** These tandas are identical in all three nights:
  - Di Sarli/Rufino milonga (#17), D'Arienzo/Echagüe (#9), D'Arienzo instrumental 1937–38 (#18), Láurenz/Podestá (#10: Garúa, Recién, Todo, Que Nunca Me Falte)
  - the Canaro/Maida milonga, the Donato/Lagos milonga, the Caló/Iriarte vals, the Tanturi instrumentals, the Troilo instrumentals
  - Tanturi/Castillo as a tango and as a vals, the Troilo/Fiorentino tango, Pugliese at #15 or #16

  That is about 80 % the same night. For a weekly milonga, the round-14 T7 rule (overlap ≤ 50 % with the user's last nights) is now the most useful missing check.
- **T4. The closer is Tanturi 1940 *La Cumparsita* (fame 2) in all three.** In 255 it follows a Tanturi última, so the same orchestra plays twice in a row. I prefer Di Sarli 1942 or Troilo 1943.
- **T5. 255 #1: a Tanturi instrumental (R+) as the second tanda of the night,** at e65 on a target of 56. It is lively for 0:15. I would place it in hour 2.
- **T6. The double peak is now two single summit tandas,** with build slots in between. It is fine on the floor, but the "double peak" reads more like a rolling build. The targets of #10 and #11 (75 and 77) could stand 2–3 points higher.

---

## 5. Final verdict

**Would I ship the best of these as is? Yes: seed 156, mark 85/100.**
- It is the only night with the TTVTTM cycle intact.
- It has 0 blockers, 9/9 canon, Pugliese correctly placed, Echagüe on peak 1, colour away from the peaks and 35–48 s cortinas.
- Its three jarring transitions are energy handovers that an attentive DJ bridges with the cortina.

**One condition:** the two unstreamable sides (*La Mimada*, *El Mismo Dolor*) must be in the user's own library. If the night must play entirely from streams, the answer is **no** until N7's two side swaps are made. Then it ships at 86.

With N3, N5, N7, N8 and N9 applied, seed 156 is about 90. With N1 applied, seed 255 becomes the better night, also about 90, with the stronger opening and ending. 255 as is cannot ship: no vals for the first 85 minutes.
