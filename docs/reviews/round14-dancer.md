# Round 14: the dancer's review (seeds 148, 36, 138)

Reviewer: a strict milonguera, 30 years at Canning, El Beso and Lo de Celia, and a regular in Istanbul. I judge from the floor: would I get up, would I stay up, and would I go home happy.

Spec: golden era 1935–45 (`yearRange [1935, 1945]`), 4 h, 4 tangos per tanda, 3 valses or milongas per tanda, Turkish cortinas, double peak. Sources: `scratchpad/best5/seed-{148,36,138}.{txt,json}`. Hours below come from the cumulative tanda and cortina lengths: hour 1 = T0–T5, hour 2 = T6–T11, hour 3 = T12–T17, hour 4 = T18–T22.

Points from round 13 are repeated only where they are still present. Each such point is marked **(R13, still present)**.

---

## 1. Verdicts

### Seed 36: **my choice**, after four fixes

- **Best first peak of the three.** It runs Troilo instrumental 1941 (Cachirulo, Milongueando en el Cuarenta, El Tamango, Guapeando, all fame 5), then Biagi valses, then D'Arienzo 1935–36 (Comme Il Faut, Lorenzo, Hotel Victoria, El Flete), then Tanturi/Castillo. I would not sit down for 45 minutes. This is what a peak should feel like.
- The Di Sarli/Rufino milonga (Zorzal, La Mulateada, Pena Mulata, all fame 5) is the best milonga tanda in all three nights. The instrumental Pugliese (Tierra Querida, El Remate, Flor de Tango, El Arranque) is a proper late-night Pugliese. The closing Tanturi Cumparsita (1940) can be streamed.
- **What kills it as it stands:**
  - At 2:05 the night plays four Orquesta Típica Víctor sides with fame 0 that cannot be streamed (T12). The floor empties.
  - At 1:03, De Angelis/Martel plays three sides with fame 0 (T6).
  - The second peak has no ramp. Di Sarli instrumental (e63) and then Malerba (e58) sit in slots that ask for 78 and 83 (T15–T16). From the milonga at T11 to the milonga at T17 there are five tandas with no rhythmic tango.
  - Two Di Sarli sides from 1946 are outside the night's range (T15).
  - A Demare/Berón tanda (e53) sits right before the última, and none of its four sides can be streamed (T21).
- Fix those and it is a night I would recommend to a friend.

### Seed 148: second

- Best opening for Buenos Aires ears: Canaro/Maida, then Di Sarli 1940 instrumental. It has the best vals of the three, Biagi/Ibáñez 1938 (Lejos de Tí, Viejo Portón, Loca de Amor). The climb into the second peak is good (Troilo/Fiorentino, Biagi instrumental, Láurenz milonga, D'Arienzo).
- **But hour 4 falls apart.** After the summit come Pugliese/Morán (mean fame 1.75, listening Pugliese), a Di Sarli/Rufino vals with two of three sides at fame 0, and De Angelis instrumentals from 1946 (three sides outside the range, mean fame 1.5). That is 35 minutes in which the good dancers go for their coats before the Tanturi última.
- The first vals is three Lomuto sides, all fame 0 (T2). The first peak is the lyrical Mauré D'Arienzo, followed by Rodríguez instrumentals in a peak slot. The second D'Arienzo summit has no hit (fame 2–3). The closing Cumparsita is Donato 1935, fame 0, with no stream.

### Seed 138: third

- It has the best second-peak climb: Troilo instrumental, then Biagi/Ortíz, then Láurenz milonga, then D'Arienzo 1937–38.
- It also has the most dead tandas, and two of them come in the last hour:
  - Canaro instrumentals 1937–38 in hour 1 (T1): three sides at fame 0, none streamable, one undated row on a "TRA LA LA" album.
  - A Donato/Lagos vals in hour 4 (T20): three sides at fame 0, none streamable.
  - De Angelis/Martel just before the última (T21): three sides at fame 0.
- Add the Donato Cumparsita (fame 0, no stream), back-to-back Zeki Müren cortinas, and the worst transition of the three nights (D'Arienzo into Pugliese, 61.7). An organiser would hear complaints.

**Choice: seed 36**, with fixes 2, 3, 6 and 9 below applied. If no fixes are allowed, seed 148, because its dead spots come early and in hour 4 rather than at the centre of the night. Hour 4 still has to be fixed.

---

## 2. Blockers and should-fix items (each with a deterministic rule)

Severity: **blocker** = a strict dancer sits down or complains to the organiser. **should-fix** = the floor notices.

### 1. The closing Cumparsita cannot be played and nobody knows it — blocker
- **Where:** seeds 148 and 138, CLOSING. Donato 1935-05-06, `fame 0`, `spotify null`, `resolved null`.
- **Problem:** The round 13 R7 fix (stay inside the night's range) overshot. It swapped the 1951 D'Arienzo for an obscure Donato row that has no stream. The last track of the night is the one every dancer waits for.
- **Rule:** the closing Cumparsita must be resolvable, have `fame ≥ 2`, and have a year inside `yearRange`. If no candidate passes, fall back to the best-fame resolvable version and add a note, rather than an unplayable one.
- **Fix:** use Tanturi 1940 (`65778bef23`, resolved on Deezer, fame 2), as seed 36 does. Láurenz 1940 (instrumental) is in the index as a second candidate; its stream needs checking.

### 2. Dead tandas (several fame-0 sides, or mean fame under 2) — blocker
- **Where:**
  - 148: T2 Lomuto/Díaz vals (0/0/0), T20 Di Sarli/Rufino vals (2/0/0, mean 0.67), T21 De Angelis (2/2/2/0, mean 1.5).
  - 36: T12 OTV (0/0/0/0), T6 De Angelis/Martel (4/0/0/0).
  - 138: T1 Canaro instrumental (0/0/0/3), T20 Donato/Lagos vals (0/0/0), T21 De Angelis/Martel (4/0/0/0).
- **Problem:** Nobody at a milonga waits for four sides they have never heard. The heatmap still labels every one of these tandas "fantastic", because the heat is per orchestra and year, not per side. That hides the problem from the score.
- **Rules:**
  - (a) A tanda holds at most 1 side with `fame 0`.
  - (b) Mean side fame per tanda is ≥ 2.5. In hour 4 and in peak slots it is ≥ 3.
  - (c) The tanda's `heat.label` is capped by its mean fame: "fantastic" needs mean fame ≥ 3.
- **Fixes (every side below is in the index):**
  - 148 T2 → De Angelis duet valses 1944–45: Pregonera, Soñar y Nada Más, Mi Novia de Ayer.
  - 148 T20 → Rodríguez/Moreno valses: Isabelita (fame 4), Con tu Mirar (fame 3), Tengo Mil Novias.
  - 148 T21 → Troilo instrumental 1941: Cachirulo, El Tamango, Milongueando en el Cuarenta, Guapeando. T15 is 6 slots earlier, so the gap holds.
  - 36 T6 → Canaro/Maida 1935–36. Use 148's T0 sides, all streamable.
  - 36 T12 → D'Agostino/Vargas 1942: Un Tropezón, Hay que Vivirla Compadre, Viejo Coche, Pero Yo Sé.
  - 138 T1 → Canaro/Maida 1935–36.
  - 138 T20 → the Rodríguez/Moreno vals trio above.
  - 138 T21 → D'Agostino/Vargas 1942, as above.

### 3. Sides outside the night's year range — blocker
- **Where:** 148 T21 De Angelis: El Entrerriano, El Chañar and El Taladro are all 1946. 36 T15 Di Sarli: El Caburé and El Once are 1946.
- **Problem:** The organiser advertised 1935–45. A purist will hear the late-40s Di Sarli sound straight away. The engine prints the tanda's range as "1945–1946" and "1943–1946", so it knows.
- **Rule:** every dance side has `year ∈ options.yearRange`. This is a hard filter, not an `era` grade.
- **Fixes:** 148 T21 → Troilo instrumental 1941 (as in item 2). 36 T15 → Di Sarli instrumental 1940: La Trilla, El Incendio, Catamarca, Shusheta.

### 4. An undated or probably misattributed row in a dated night — blocker
- **Where:** 138 T1, Canaro "Champagne Tango": `date null`, album "TRA LA LA". The engine still prints the tanda as 1937–1938.
- **Problem:** Champagne Tango is D'Arienzo's 1938 hit, and seed 36 plays it at T18. An undated Canaro row from an unrelated compilation is either a crossed credit or a late take.
- **Rule:**
  - (a) Every dance side has a year.
  - (b) Flag a row as `suspectCredit` when its title has `fame ≥ 3` in another orchestra within ±2 years, this row has `fame 0`, and it has no date.
- **Fix:** drop the row (and the whole tanda, see item 2).

### 5. Fame-0 tanda openers — should-fix
- **Where:**
  - 148: T2 La Zandunga, T5 La Mimada, T10 Jueves, T17 El Criollito Oriental.
  - 36: T8 Marchetta, T11 La Mimada, T12 El Amanecer.
  - 138: T1 Pura Parada, T8 Marchetta, T17 El Criollito Oriental, T20 Sólo un Recuerdo.
- **Problem:** The first 10 seconds decide whether I accept the cabeceo. A side nobody knows as the opener means the floor fills at side 2.
- **Rule:** the first side of every tanda has `fame ≥ 3`. In peak slots it has `fame ≥ 4`.
- **Fixes:**
  - Láurenz/Podestá milonga: open with Yo Soy de San Telmo, then Maldonado. Swap El Criollito Oriental for a third Láurenz milonga with fame ≥ 3, for example Milonga de mi Flor (1940) if the 1940/1943 spread is acceptable.
  - Donato milonga: La Milonga que Faltaba, then a known third side, then Sacale Punta.
  - Biagi 1941 valses: replace them with Biagi/Ibáñez 1938 (Lejos de Tí 5, Viejo Portón 4, Loca de Amor 5).

### 6. Colour or soft tanda in a peak slot — should-fix (R13 R2, still present)
- **Where:**
  - 148 T10: Rodríguez instrumental, e66 against a target of 82, opener at fame 0.
  - 138 T10: Rodríguez/Moreno, e67 against 82.
  - 36 T16: Malerba/Medina, e58 against 83. It follows Di Sarli instrumental at e63 against 78 (T15) and comes after a slow Safiye Ayla cortina.
- **Problem:** The arc asks for the top of the night, and the floor gets a soft tanda from a second-tier orchestra.
- **Rules:**
  - (a) A slot with `targetEnergy ≥ 78` takes no colour-tier orchestra (Rodríguez, OTV, Malerba, Lomuto, Canaro instrumental), and its tanda energy is ≥ target − 8.
  - (b) If no family qualifies within the spacing rules, lower the slot target (R13 transitions: target ≤ summit − 10 after a summit) rather than fill it with colour.
- **Fixes:**
  - 148 T10 → Di Sarli/Rufino tango 1941: Charlemos, Cascabelito, Lo Mismo que Antes, Patotero Sentimental.
  - 36 T15–T16 → Di Sarli instrumental 1940 at T15 (item 3) and a rhythmic tier-1 family at T16, for example Biagi/Ortíz 1940–41 from 138 T16. Biagi is then at T8 and T16, and the última has to change. Alternatively, swap Malerba to T13 and Caló/Berón to T16.

### 7. A "peak" made of non-hits or a lyrical vocal — should-fix
- **Where:**
  - 148 T18, the second summit: Trago Amargo 3, Maipo 3, No Me lo Digas 2, Yunta Brava 3 (no stream). No side the floor knows from the first bar.
  - 138 T18: El Cencerro 4, Qué Noche! 3, El Porteñito 2, La Catrera 3.
  - 148 T9 and 138 T9: D'Arienzo/Mauré 1941 as the first summit. This is the dramatic D'Arienzo, e78 against 82. It is lovely, but it is not the moment the room jumps.
- **Rules:**
  - (a) A tanda marked PEAK has ≥ 2 sides with `fame ≥ 4`, one of them in the last position.
  - (b) A PEAK tanda has style `rhythmic` (Mauré, Iriarte and Berón count as lyrical, not rhythmic).
- **Fix (148):** T9 → D'Arienzo/Echagüe 1938–39: Pensalo Bien, Indiferencia, No Mientas, Nada Más. T18 → D'Arienzo 1935–37 hits: Hotel Victoria, La Payanca, El Choclo, El Flete. Move T3 to the lesser 1936–37 sides (Retintín, El Cencerro, El Apronte, El Caburé). This also gives the night the Echagüe tanda it is missing. Apply the same pattern to 138.

### 8. Weak hour 4: the people who stay to the end get leftovers — should-fix
- **Where:**
  - 148 T19–T21: mean fame 1.75, 0.67 and 1.5.
  - 138 T20–T21: mean fame 0.0 and 1.0.
  - 36 T20–T21: 1.67, then 1.75 with nothing streamable.
- **Problem:** By hour 3–4 the legs are tired. Only well-known music keeps people up.
- **Rule:** across the last 4 tandas before the última, mean fame is ≥ 3.5 and no tanda is below 2.5.
- **Fixes:** see items 2 and 3. 148 T19 → Pugliese instrumental 1944 (Recuerdo, El Remate, Tierra Querida, El Arranque) in place of the Pugliese/Morán listening sides.

### 9. A soft lyrical tanda right before the última — should-fix (R13 transitions §6, still present)
- **Where:** 36 T21, Demare/Berón 1943 at e53. It is the lowest-energy tanda of hour 4. None of its four sides can be streamed, and Como Se Hace un Tango has fame 0.
- **Rule:** the tanda before the última has energy ≥ última energy − 10, is not the lowest-energy tanda of the last hour, and has 0 unresolved sides.
- **Fix:** replace Demare with a tanda around e68–72 from a family outside the spacing window, for example Láurenz instrumental (Amurado 1940, Orgullo Criollo 1941, Poca Suerte 1941, plus one more) or Fresedo/Ray 1937–39 (Sollozos, Niebla del Riachuelo, No Quiero Verte Llorar, Penumbras) if their streams check out.

### 10. A soft valley of three or more tandas after hour 1 — should-fix
- **Where:**
  - 148 T12–T14: Donato instrumental e63, Demare e55, Caló/Iriarte vals e62. There is also a slow Zeki Müren cortina (e40) inside the valley.
  - 138 T12–T14: Di Sarli instrumental e62, Malerba e57, Caló/Iriarte vals e62.
  - 36 T12–T16: no rhythmic tango for 52 minutes.
- **Rules:**
  - (a) After the first hour, never three consecutive tandas with energy < 65.
  - (b) At least one tanda with style `rhythmic` in every window of 4 tandas.
- **Fixes:**
  - 148: replace Demare (four unresolved sides, two at fame 0; the index also lacks Malena and Solamente Ella, see the R13 gap list) with Fresedo/Ray 1937–39, or move the Biagi instrumental tanda (T16) to T13.
  - 138: swap T12 Di Sarli instrumental with T15 Troilo instrumental.

### 11. Unplayable sides at the key moments — should-fix (blocker if the DJ plays from streams only)
- **Where:**
  - 36 T0 and 138 T0, the opening D'Agostino/Vargas tanda: 3 of 4 sides unresolved.
  - 148 T5 and 36 T11, Donato milonga: 3 of 3 unresolved.
  - 148 T13 and 36 T21, Demare: 4 of 4 unresolved.
  - 148 T9 and 138 T9, the PEAK tanda: 2 of 4 unresolved.
- **Rule:** at most 1 unresolved side per tanda. No unresolved side in the opening tanda, any PEAK tanda, the última or the closing. The current `source` factor (0.48–0.51 × 5) is too weak to enforce this.
- **Fix:** for the opener, use D'Agostino/Vargas sides that resolve (Tres Esquinas and El Yacaré resolve), or open with Canaro/Maida, which is 4 of 4 resolved.

### 12. Polluted title — should-fix
- **Where:** "Milonguero Viejo (fresedo)" in 148 T1, 36 T15 and 138 T12. This is a Di Sarli instrumental; "(fresedo)" is a composer or dedication note that leaked from the source listing. Also "Tal Vez Será su Voz (mi Alcohol)" has the wrong casing.
- **Rule:** a title parenthetical that matches, case-insensitively, a surname in `orchestras.json` or `singers.json` is stripped at index build and kept in `notes`. A parenthetical that starts with a lowercase letter is re-cased (in Spanish, the first word is capitalised).
- **Fix:** display "Milonguero Viejo".

### 13. Credits to verify — should-fix (data)
- 148 and 138 T9, D'Arienzo "Tierrita" (1941-06-09), credited to Héctor Mauré. This is Bardi's tango and is normally an instrumental.
- 148 T18, D'Arienzo "Trago Amargo" (1939-12-22), listed as instrumental. It is a song tango, so check for an Echagüe refrain.
- 148 T2, Lomuto/Díaz "Isabelita" (1940-08-12), fame 0. The famous Isabelita is Rodríguez/Moreno 1940-08-13, one day later. A crossed row is possible.
- **Rule:** flag `suspectCredit` when the same title and year exists for another orchestra with `fame ≥ 4` and this row has `fame 0`. Also flag when a song tango is marked `vocal:false` (or the reverse) against the majority of that title's other recordings in the index. These flags exclude a side from peak and opener slots until a curator clears them.

### 14. Cortina artist repeated back to back, and overused artists — should-fix
- **Where:**
  - 36: Tarkan T16 → T17 (Kuzu Kuzu, then Dudu); MFÖ T18 → T19.
  - 138: Zeki Müren T11 → T12; MFÖ T18 → T19.
  - Every night plays Sezen Aksu three times. 36 also plays Tarkan three times.
- **Problem:** A Turkish floor knows these songs. The same voice twice in a row sounds like a mistake, and a third Sezen Aksu is noticed.
- **Rule:** no cortina artist within 3 cortinas of the same artist, and at most 2 cortinas per artist per night.
- **Fix:** 36 T17 → Mor ve Ötesi "Cambaz" (not used in 36). 138 T12 → Barış Manço or Nilüfer, rotated.

### 15. Slow cortina leading into a peak slot — should-fix
- **Where:** 36, the cortina after T15 (Safiye Ayla "Üsküdar'a Gider İken", slow, e40), which leads into the T16 peak slot (target 83).
- **Rule:** the cortina before a slot with `targetEnergy ≥ 78` has `tempo ≠ slow`.
- **Fix:** move Safiye Ayla to the cool-down (after T19) and put an up-tempo cortina before T16.

### 16. D'Arienzo summit straight into Pugliese — should-fix (R13 transitions §2, still present)
- **Where:** the T18 → T19 boundary in all three nights, graded jarring: 148 at 70.9, 36 at 66.2, 138 at 61.7.
- **Rule:** already written in R13 (never put the second D'Arienzo summit directly before Pugliese). The sweep shows it is not yet enforced, so add it as a hard benchmark check.
- **Fix:** place Pugliese at about 0.73 of the night, then a milonga, then D'Arienzo (the featured-night pattern).

### 17. Order inside a tanda: the best side is not last — should-fix
- **Where:**
  - 148 T3: Ataniche (fame 5) in slot 3, El Cachafaz (fame 2) last.
  - 138 T3: Re Fa Sí (fame 2) last.
  - 36 T22, the última: Griseta (3, e75) last, after A Mí No Me Interesa (4, e78).
  - The Tanturi milonga in every night: Mi Morocha (fame 2) last, after Así Es la Milonga (4).
- **Rule:** the last side has `fame ≥ max(fame in tanda) − 1` and energy ≥ the tanda median. A side with role `opener` is never in the last position.
- **Fix:** Tanturi milonga → Mozo Guapo, Mi Morocha, Así Es la Milonga. 148 T3 → Retintín, El Cachafaz, El Caburé, Ataniche. 36 T22 → Queja Indiana, La Chacarera, Griseta, A Mí No Me Interesa.

---

## 3. Taste (no rule needed; I note them because a strict floor will)

- **T1.** The three seeds share whole tandas side for side: Láurenz/Casas (Como Dos Extraños, De Puro Guapo, Desconsuelo, No Me Extraña), Caló/Berón, the Tanturi/Castillo milonga, the Láurenz/Podestá milonga and the Caló/Iriarte vals, plus the same Tanturi última in 148 and 138. One night is fine. A resident DJ would be caught out in a month. *(Optional rule: choose at random among the top-k sides by fit.)*
- **T2.** The Tarkan cortinas (Şımarık with its kiss sounds, Dudu, Kuzu Kuzu) and Mustafa Sandal "Araba" make an Istanbul floor sing along. That is fun once. Right before the second D'Arienzo summit it pulls attention away from the cabeceo. Duman and Mor ve Ötesi rock cortinas need their loudness matched to the 78 rpm transfers.
- **T3.** The cortinas are 32–49 s, which is good. "Ah Bu Şarkıların Gözü Kör Olsun" as the first cortina of the night (148) is a mournful art song. It is beautiful, but sad for minute 12.
- **T4.** Seed 36 has three D'Arienzo instrumental tandas and no Echagüe or Mauré. The Buenos Aires floor expects one vocal D'Arienzo.
- **T5.** Seed 36 T8 → T9 puts Biagi valses straight before D'Arienzo 1935–36, which is Biagi on piano. It is the same sound twice in a row. I would put Troilo instrumental between them.
- **T6.** Seed 148's opener is Canaro/Maida with Mi Noche Triste at e45. It is a little sleepy, but correct for a traditional room.
- **T7.** D'Arienzo comes at about 0:30 in all three nights (T3, e80+). That is early, but normal at El Beso.
- **T8.** Seed 148 plays Donato twice (milonga, instrumental) and then closes with a Donato Cumparsita. Seed 148 also has Berón twice (Caló, then Demare, six tandas apart). Both are acceptable.
- **T9.** Three milongas in 4 h is the spec. A Canning crowd would ask for a fourth.

---

## 4. Rule summary (for the engine and the benchmark)

| # | Rule | Severity |
|---|------|----------|
| R14-1 | The closing Cumparsita is resolvable, `fame ≥ 2` and in `yearRange` | blocker |
| R14-2 | ≤ 1 `fame 0` side per tanda; mean fame ≥ 2.5 (≥ 3 in hour 4 and peaks); heat label capped by mean fame | blocker |
| R14-3 | Every side's year is in `options.yearRange` (hard filter) | blocker |
| R14-4 | Every dance side is dated; `suspectCredit` flag for undated fame-0 rows that duplicate another orchestra's famous title | blocker |
| R14-5 | Tanda opener `fame ≥ 3` (≥ 4 at peaks) | should-fix |
| R14-6 | No colour tier in slots with `target ≥ 78`; tanda energy ≥ target − 8, else lower the target | should-fix |
| R14-7 | A PEAK tanda has ≥ 2 sides at `fame ≥ 4` (one of them last) and style rhythmic | should-fix |
| R14-8 | Last 4 tandas before the última: mean fame ≥ 3.5, none < 2.5 | should-fix |
| R14-9 | The tanda before the última has energy ≥ última − 10, is not the lowest in hour 4, and has 0 unresolved sides | should-fix |
| R14-10 | After hour 1: never 3 tandas in a row with energy < 65; one rhythmic tanda in every 4 | should-fix |
| R14-11 | ≤ 1 unresolved side per tanda; 0 in the opener, PEAK, última and closing | should-fix |
| R14-12 | Strip title parentheticals that match an orchestra or singer surname; re-case lowercase parentheticals | should-fix |
| R14-13 | `suspectCredit` for same title and year under another orchestra with fame ≥ 4, or a vocal flag that contradicts the title's other rows | should-fix |
| R14-14 | No cortina artist within 3 cortinas of itself; ≤ 2 per artist per night | should-fix |
| R14-15 | The cortina before a slot with `target ≥ 78` is not slow | should-fix |
| R14-16 | Hard check: the D'Arienzo summit is not followed directly by Pugliese | should-fix |
| R14-17 | Last side `fame ≥ max − 1` and energy ≥ the tanda median; an opener-role side is never last | should-fix |
