# Round 19 — strict order review (milonga DJ + dancer)

The owner's complaint: "should be more attentive to the song changes — which songs come after what". One reviewer,
acting as a strict milonga DJ and an experienced social dancer, judged every adjacent pair of three nights written out
side by side (energy, fame, corpus role, year, analysed bpm/key as hints, the cortina and the engine's boundary score):
the shipped featured night (`apps/web/public/featured/golden-double-peak.json`, seed 199, Turkish cortinas) and the
default golden-set nights S3 and S7 (compose + improveNight). The listing given to the reviewer is reproduced by
`docs/specs/round19-engine.md` §2. The review, as delivered (lightly condensed):

## 1. Findings

**F1. Corpus roles placed backwards inside the tanda** (blocker). Featured T21 (Biagi / Ibáñez vals): Lejos de Ti is
an opener but plays last, Loca de Amor (closer, e89, fame 5) plays second; the tanda ends on its weakest side (e77, 12
under the peak). Featured T22 (Caló / Berón): Qué Te Importa que Te Llore (closer) opens, Tristezas de la Calle
Corrientes (opener) closes, the real opener Jamás Retornarás plays second. Featured T16 (Pugliese / Chanel): Rondando tu
Esquina (opener) plays second. S3 T7 (Di Sarli instr.): La Trilla (opener) plays second.
*Rule R1:* no closer in slot 1 and no opener last when another side could go there; a tagged opener opens; of two
tagged openers the cooler one opens.

**F2. The tanda fades at the end** (should-fix; blocker for Featured T21). Featured T13 El Trece e75 after Pura Clase
e83; Featured T21 e77 after e89; S3/S7 T2 Adiós, Arrabal e56 after El Yacaré e62; S3 T10 Si Tú Quisieras e55 after
Percal e60; S3 T16 Te Aconsejo que Me Olvides e66 after Tabernero e71; S3 T22 / S7 T17 Patético e78 after Malandraca
and Negracha (e86, e88); S7 T3 ends on Marisabel (e68, fame 3) after Recuerdo (e76).
*Rule R2:* the last side ≥ the hottest of the others − 4, and a closer, fame ≥ 4 or the tanda's hottest.

**F3. The lowest side sits just before the closer in a rhythmic tanda** (should-fix). Featured / S3 / S7 T4
(D'Arienzo 1936–37): Ataniche e73 in slot 3 among e80–84 — the drive collapses one song before the end.
*Rule R3:* in a rhythmic tanda with a spread ≥ 8 the lowest side may only open.

**F4. The opener is the peak and the tanda slumps after it, or the opener is weak** (should-fix). S3 T16 opens on
Tabernero (fame 3, e71, the maximum), then 64–66; Featured T5 De Puro Guapo e71 → Como Dos Extraños e56 (a fall of 15);
S7 T20 opens on Que Lindo Es Enamorarse (fame 2).
*Rule R4:* slot 1 an opener or fame ≥ 4, no hotter than the median + 3; slot 1 → slot 2 falls at most 8 (12 when slot 2
is a lyrical fame-5 side of a lyrical or balanced tanda).

**F5. One side far under the rest of a peak or summit tanda** (should-fix). Featured T10, S3 T19, S7 T19 Ansiedad e72
among D'Arienzo / Echagüe e82–84; S3 T14 Chuzas (e55, fame 2) among Gobbi e64–70.
*Rule R5:* no side more than 8 under the target in a peak slot, nor 10 under the median of the others in a rhythmic
tanda; swap it for a sibling, not just reorder.

**F6. Summits filled with less-loved sides while loved siblings sit unused** (should-fix). Featured T19 (two fame-3
sides), S3 T11 (Guapo y Varón fame 2), S7 T19 (Olvídame fame 3 while La Bruja fame 5 is unused), S7 T10 (Misa de Once
fame 2), S7 T20 (two fame-2 sides). *Rule R6:* a summit's mean fame ≥ 4.3; at most one fame ≤ 2 side per tanda.

**F7. A tanda's mean far from the arc target, or in the wrong phase** (blocker for lyrical tandas at a peak). S3 T10
Caló / Podestá 58 vs 75, S3 T17 Caló / Berón 58 vs 75, S3 T18 Di Sarli milonga 68 vs 76; Featured T17 Malerba 57 vs 73,
T8 Donato 63 vs 74, T22 58 vs 70; too high: Featured T4 81 vs 72, S3 T1 57 vs 44, S7 T3 71 vs 50, S3 T21 79 vs 64;
cooldown not cooling: Featured T21 82 after 76, S3 T22 Pugliese 82. *Rule R7:* |mean − target| ≤ 8, no lyrical tanda
in a peak phase, a cooldown tanda no hotter than the one before + 3; targets from corpus percentiles.

**F8. Energy cliffs at boundaries, last side → first side** (should-fix). Featured T21 → T22 −28 (−33 after the F1
fix); S3 T10 → T11 +22; S3 T12 → T13 −16; S7 T12 → T13 −17; S3 T19 → T20 −19. *Rule R8:* |Δ| ≤ 15 (18 into a vals or
milonga, 20 out of a summit or into the última). Featured T21 → T22 is fixed by a softer cooldown vals (De Angelis,
Troilo / Floreal Ruiz), not by reordering: Biagi's vals belongs in the build.

**F9. The cortina's energy does not sit between the two tandas.** Below both: Featured T7 → T8 e54 (78 / 63), T13 → T14
e48 (75 / 60), T21 → T22 e48 (89 / 61); S3 T6 → T7, T9 → T10, T12 → T13, T19 → T20; S7 T12 → T13, T13 → T14. Above both:
Featured T12 → T13 e82 (72 / 74), T16 → T17 e72 (71 / 60); S7 T20 → T21 e80 (64 / 77). *Rule R9:* the cue within
[min − 4, max + 2] of the two edge sides; a slow cue (≤ e50) only when both edges are ≤ 60.

**F10. The same orchestra back too soon / the same orchestra and era twice.** Featured D'Arienzo instr. 1935–38 at T4
and T19, Biagi ×3, Láurenz T5 and T11; S3 Caló ×3; S7 Troilo ×3 (T11 → T15 only 4 apart), Láurenz, Biagi.
*Rule R10:* a gap ≥ 6 (≥ 8 for the same rhythm), tier-1 at most 3 a night with at most 2 tango tandas.

**F11. A bright rhythmic vals or tango straight into dramatic Pugliese.** S3 T21 → T22 Rodríguez vals 1939 → Pugliese
1948 (blocker); S7 T16 → T17 Biagi / Amor → Pugliese; Featured T15 → T16 (nit). *Rule R11:* a dramatic tanda follows a
balanced, lyrical or dramatic tango tanda; R/R+ → D forbidden with an era gap > 5.

**F12. Style labels against the energy** (Malerba / Medina "rhythmic" at mean 57; D'Agostino / Vargas "rhythmic" at 57).

**F13. Scores and labels disagree** (S3 T22 → T23 87.5 labelled jarring H4; the era penalty over-weighted into the
última; "smooth" boundaries hiding broken tandas).

**F14. Years zig-zag inside a tanda** (nit: Featured T3 1945 → 1943 → 1944).

## 2. Proposed orders

| Night / tanda | Proposed order | Why |
|---|---|---|
| Featured T4 | Ataniche, El Cencerro, El Cachafaz, Jueves | rises 73 → 84, no slot-3 hole |
| Featured T5, S3 T5, S7 T7 | De Puro Guapo, Desconsuelo, Como Dos Extraños, No Me Extraña | no 71 → 56 crash at slot 2 |
| Featured T10, S3 T19 | keep; replace Ansiedad with a 1938 Echagüe side ≥ e80 | summit outlier |
| Featured T13 | Unión Cívica, La Maleva, El Trece, Pura Clase | ends on the fame-5 peak |
| Featured T16 | Rondando tu Esquina, Corrientes y Esmeralda, El Sueño del Pibe, La Abandoné y No Sabía | the opener first, rises |
| Featured T21 | Lejos de Ti, Viejo Portón, Loca de Amor (better: another, softer vals) | roles straight, rises |
| Featured T22 | Jamás Retornarás, Trasnochando, Tristezas de la Calle Corrientes, Qué Te Importa que Te Llore | roles straight, rises |
| S3 T2, S7 T2 | Agua Florida, Ahora No Me Conocés, Adiós, Arrabal, El Yacaré | ends on the hottest, no fade |
| S3 T4 / S7 T4 | Ataniche, El Cencerro, Retintín / El Apronte, Jueves | rises 73 → 84 |
| S3 T7 | La Trilla, El Incendio, Catamarca, Nobleza de Arrabal | the opener first |
| S3 T10 | Yo Soy el Tango, Dos Fracasos, Si Tú Quisieras, Percal (and out of the peak) | ends on 60, not 55 |
| S3 T16 | Pa' Qué Seguir, Maragata, Te Aconsejo que Me Olvides, Tabernero | rises 64 → 71 |
| S3 T18, S7 T18 | Zorzal, La Mulateada, Pena Mulata | the cooler opener opens; rises 62 → 72 |
| S3 T22, S7 T17 | Boedo, Patético, Negracha, Malandraca | ends at e86 (a closer) |
| S7 T3 | Mi Romance, Marisabel, Recuerdo | not on the weakest side |
| S7 T19 | Pensalo Bien, La Bruja (for Ansiedad), Olvídame, No Mientas | the fame-5 side into the summit |
| S7 T20 | Con Alma de Tango, Que Lindo Es Enamorarse, La Brisa, Para Qué Te Quiero Tanto | a tagged side opens, the fame-5 side closes |

## 3. Engine habits

Drop: scoring only the boundaries; opening on the tanda's energy maximum and settling; slow cues after hot tandas and
hot cues into moderate ones; the era penalty dominating into a vals, a milonga or the última; lyrical tandas in peak
slots and uncalibrated targets (44); style by reputation over measured energy; summits of fame-2/3 sides; the same
orchestra and era twice a night; a bright vals in the cooldown.

Keep: the TTV TTM rotation with tandas of four and three; one orchestra, one singer, a tight span of years per tanda;
opening warm with Di Sarli / Rufino or D'Agostino / Vargas; D'Arienzo summits, Pugliese late, Tanturi / Castillo as the
última ending on Así Se Baila el Tango, then La Cumparsita; rising milonga tandas; the orders that are already right
(Featured T7, T14, T20, S3 T17, S7 T10, T16); vocal / instrumental alternation; one cortina genre for the night.
