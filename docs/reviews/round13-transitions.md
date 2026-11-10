# Round 13: transitions between tandas

Reviewer: a tango DJ who listens for the handover from one tanda to the next. This is a read-only review: nothing in the engine or data was changed.

Nights judged:
- the featured night (`docs/specs/round11-best-night.md` = `apps/web/public/featured/golden-double-peak.json`);
- engine seeds 3, 42, 108, 193 and 250 (golden 1935–45, 4 h, Turkish cortinas, double peak; the review13 scratchpad dumps).

Every boundary was scored with the pairwise model in §2. The model was written first, then checked against my own ear on all 128 boundaries, then tuned until its grades matched what I would say in the booth. The structural part (style, era, vocal and tempo terms) was also run on the 30 reference sets in `data/knowledge/reference_sets.json` to get a range (§4).

## Summary

| Night | Smooth | Fine | Jarring | Mean S | Hard-rule hits |
|---|---|---|---|---|---|
| featured | 16 | 3 | 2 | 90.9 | 2 × H3 |
| seed 3 | 9 | 9 | 3 | 83.9 | 3 × H3 |
| seed 42 | 12 | 5 | 4 | 87.1 | 2 × H3, 1 × H2, 1 × H4 |
| seed 108 | 8 | 7 | 7 | 83.7 | 4 × H3, 1 × H2 |
| seed 193 | 13 | 8 | 1 | 89.5 | 1 × H2 |
| seed 250 | 12 | 4 | 5 | 85.8 | 3 × H3, 1 × H5 |
| **all 128** | **70** | **36** | **22** | 86.8 | |

Two D'Arienzo → Pugliese boundaries (seeds 42 and 108) are jarring on score alone, with no hard-rule hit.

What the floor would feel, in order of harm:

1. **The sag after a summit.** This is the most common jarring transition. A D'Arienzo or Tanturi summit (e79–85) hands over to a soft tanda (Donato instrumentals e62, Malerba e58, D'Agostino e60, Troilo/vocal e64) while the arc still asks for 80+. It happens at featured 9→10 and 18→19, seed 3 9→10, seed 250 9→10, and seed 108 3→4 and 15→16. The dancers are at the top of the night and the next cortina drops them 17–25 points. The cause is that the peak slots come three in a row (targets 82/82/84 and 85/81/77), and orchestra spacing leaves only e60 families free for the middle one. The engine fills the gap by energy fit to the slot, never by fit to the previous tanda.
2. **1936–39 D'Arienzo instrumental straight into 1943–45 Pugliese at 18→19, in all five seeds.** Rhythmic leads into dramatic, the mean year jumps by 7–8 years, the beat drops from about 133 to about 114 bpm, and three times two instrumentals sit back to back. Seeds 42, 108 and 250 are jarring; seeds 3 and 193 are fine at best. The featured night avoids it: Tanturi/Castillo comes before Pugliese and a Láurenz milonga after.
3. **The climb into an under-delivered vals or milonga.** Malerba e57 → Rodríguez vals e74–79 (featured 13→14, seed 3 13→14), OTV instrumental e55 → Rodríguez vals e79 (seed 42), and Malerba e58 → Tanturi milonga e81 (seed 250). A +17 to +24 step with a +4 plan.
4. **Two lyrical tangos in a row at the peak.** De Angelis/Dante → Caló instrumental (seed 3 11→12) and Di Sarli/Rufino → Caló instrumental (seed 42 15→16) leave the summit with no pulse.
5. **Three light rhythmic tandas to open the night.** Canaro → Lomuto → OTV vals (seed 193), Rodríguez → Canaro → Lomuto vals (seed 108), and Canaro → D'Agostino → OTV (seed 42). This is monotony more than a jolt, so it is graded fine unless it touches a peak.
6. **A soft lyrical tango wedged before the última.** Seeds 108 and 193 put a Demare tango (e49–55) between the cool-down vals and the Biagi última, so the closer arrives with a +23 to +26 step (seed 108 jarring, seed 193 fine 77).

What already works: Pugliese is never next to another dramatic tanda. It is always followed by a vals or milonga (Di Sarli, Caló or Demare valses, or the Láurenz milonga), which is the profile's `followWith`. The cue before him is moody and the cue after him is up-tempo. Vocal and instrumental alternate well in the first hour. Where the rhythmic vocal última follows the lyrical vals directly (featured, seeds 3, 42 and 250), the handover is smooth.

## 1. Every boundary, graded

Grades: **smooth** when S ≥ 88; **fine** when 72 ≤ S < 88; **jarring** when S < 72 or a hard rule (H1–H6, §2.3) is broken. S is the pairwise score of §2. Tanda labels show rhythm, orchestra/singer, years and delivered energy. Style codes: R+ = hard-driving rhythmic (D'Arienzo, Biagi, Tanturi), R = light rhythmic, L = lyrical, B = balanced, D = dramatic, each followed by the rhythm (T, V or M). A "3 vocal tangos" penalty means the third vocal tango tanda in a row (V/M skipped). "3x R" means three consecutive tandas of the same style class.

### featured — smooth 16 · fine 3 · jarring 2 · mean 90.9

| | From → to | Grade | S | Why |
|---|---|---|---|---|
| 0→1 | T Canaro/Maida '36–38 e51 → T Sarli/Rufino '39–42 e59 | smooth | 95 | era 1937>1940 −1; voc same V −4 |
| 1→2 | T Sarli/Rufino '39–42 e59 → V Caló/Iriarte '43–45 e62 | smooth | 99 | era 1940>1944 −1 |
| 2→3 | V Caló/Iriarte '43–45 e62 → T D'Arienzo/instr '36–39 e80 | smooth | 93 | style RV>R+T −1; era 1944>1937 −6 |
| 3→4 | T D'Arienzo/instr '36–39 e80 → T Troilo/instr '38–41 e76 | smooth | 93 | era 1937>1940 −1; tempo 133>119 −2; voc same I −4 |
| 4→5 | T Troilo/instr '38–41 e76 → M Tanturi/Castillo '41–42 e81 | smooth | 100 | — |
| 5→6 | M Tanturi/Castillo '41–42 e81 → T Rodríguez/Moreno '40–43 e67 | smooth | 91 | style R+M>RT −1; energy -14 (plan -2) −8 |
| 6→7 | T Rodríguez/Moreno '40–43 e67 → T Láurenz/Podestá '43 e67 | smooth | 96 | voc same V −4 |
| 7→8 | T Láurenz/Podestá '43 e67 → V Biagi/instr '41 e85 | smooth | 94 | energy +18 (plan +7) −6 |
| 8→9 | V Biagi/instr '41 e85 → T D'Arienzo/Echagüe '38–39 e82 | fine | 87 | style R+V>R+T −5; 3 vocal tangos −8 |
| 9→10 | T D'Arienzo/Echagüe '38–39 e82 → T Donato/instr '36–40 e62 | **jarring** | 73 | **H3** · style R+T>RT −2; energy -20 (plan +0) −25 |
| 10→11 | T Donato/instr '36–40 e62 → M Troilo/Fiorentino '41–42 e77 | smooth | 89 | energy +15 (plan +2) −10; era 1938>1942 −1 |
| 11→12 | M Troilo/Fiorentino '41–42 e77 → T Caló/Berón '42 e59 | smooth | 99 | style BM>LT −1 |
| 12→13 | T Caló/Berón '42 e59 → T Malerba/Medina '42–43 e57 | smooth | 96 | voc same V −4 |
| 13→14 | T Malerba/Medina '42–43 e57 → V Rodríguez/Moreno '41–44 e74 | fine | 85 | style RT>RV −3; energy +17 (plan +4) −10; cue e84 up −2 |
| 14→15 | V Rodríguez/Moreno '41–44 e74 → T Tanturi/Castillo '41–42 e76 | smooth | 90 | style RV>R+T −1; 3 vocal tangos −8; cue e82 up −1 |
| 15→16 | T Tanturi/Castillo '41–42 e76 → T Pugliese/instr '44–46 e77 | fine | 86 | style R+T>DT −12; era 1941>1944 −1; cue e54 slow −1 |
| 16→17 | T Pugliese/instr '44–46 e77 → M Láurenz/Podestá '43–44 e79 | smooth | 100 | — |
| 17→18 | M Láurenz/Podestá '43–44 e79 → T D'Arienzo/instr '36–39 e85 | smooth | 89 | energy +6 (plan -6) −8; era 1943>1938 −3 |
| 18→19 | T D'Arienzo/instr '36–39 e85 → T D'Agostino/Vargas '41–44 e60 | **jarring** | 65 | **H3** · style R+T>RT −2; energy -25 (plan -4) −30; era 1938>1942 −4 |
| 19→20 | T D'Agostino/Vargas '41–44 e60 → V Sarli/Rufino '40–43 e70 | smooth | 88 | energy +10 (plan -4) −12 |
| 20→21 | V Sarli/Rufino '40–43 e70 → T Biagi/Ortíz '40–43 e76 | smooth | 100 | — |

### seed-3 — smooth 9 · fine 9 · jarring 3 · mean 83.9

| | From → to | Grade | S | Why |
|---|---|---|---|---|
| 0→1 | T Canaro/instr '38–40 e53 → T Sarli/Durán '45 e59 | smooth | 94 | era 1940>1945 −6 |
| 1→2 | T Sarli/Durán '45 e59 → V OTV/Moral '40 e60 | smooth | 98 | era 1945>1940 −2 |
| 2→3 | V OTV/Moral '40 e60 → T D'Arienzo/instr '36–37 e83 | smooth | 92 | style RV>R+T −1; energy +23 (plan +13) −6; era 1940>1936 −1 |
| 3→4 | T D'Arienzo/instr '36–37 e83 → T Rodríguez/Flores '38–39 e69 | fine | 82 | style R+T>RT −2; energy -14 (plan +2) −16 |
| 4→5 | T Rodríguez/Flores '38–39 e69 → M Tanturi/Castillo '41–42 e81 | fine | 83 | style RT>R+M −1; energy +12 (plan -4) −16 |
| 5→6 | M Tanturi/Castillo '41–42 e81 → T Láurenz/Podestá '43 e67 | smooth | 92 | energy -14 (plan -2) −8 |
| 6→7 | T Láurenz/Podestá '43 e67 → T D'Agostino/Vargas '45 e57 | fine | 72 | energy -10 (plan +6) −16; voc same V −4; 3 vocal tangos −8 |
| 7→8 | T D'Agostino/Vargas '45 e57 → V Biagi/Ibáñez '38 e82 | fine | 72 | style RT>R+V −1; energy +25 (plan +7) −24; era 1945>1938 bridged −3 |
| 8→9 | V Biagi/Ibáñez '38 e82 → T D'Arienzo/Echagüe '38–39 e83 | fine | 87 | style R+V>R+T −5; 3 vocal tangos −8 |
| 9→10 | T D'Arienzo/Echagüe '38–39 e83 → T Donato/instr '36–40 e61 | **jarring** | 68 | **H3** · style R+T>RT −2; energy -22 (plan +0) −30 |
| 10→11 | T Donato/instr '36–40 e61 → T Angelis/Dante '44–45 e66 | smooth | 96 | era 1938>1945 bridged −4 |
| 11→12 | T Angelis/Dante '44–45 e66 → T Caló/instr '43–44 e65 | fine | 78 | style LT>LT −20; energy -1 (plan -10) −2 |
| 12→13 | T Caló/instr '43–44 e65 → T Malerba/Medina '42–43 e57 | smooth | 100 | — |
| 13→14 | T Malerba/Medina '42–43 e57 → V Rodríguez/Flores '39 e79 | fine | 74 | style RT>RV −3; energy +22 (plan +4) −22; era 1943>1939 −1 |
| 14→15 | V Rodríguez/Flores '39 e79 → T Troilo/Fiorentino '41 e66 | fine | 82 | energy -13 (plan +3) −16; cue e40 slow −2 |
| 15→16 | T Troilo/Fiorentino '41 e66 → T Firpo/instr '35–38 e49 | **jarring** | 68 | **H3** · energy -17 (plan +5) −28; era 1941>1936 −4 |
| 16→17 | T Firpo/instr '35–38 e49 → M Láurenz/Podestá '43–44 e79 | **jarring** | 60 | **H3** · energy +30 (plan +8) −34; era 1936>1943 −6 |
| 17→18 | M Láurenz/Podestá '43–44 e79 → T D'Arienzo/instr '40–44 e85 | smooth | 92 | energy +6 (plan -6) −8 |
| 18→19 | T D'Arienzo/instr '40–44 e85 → T Pugliese/Chanel '43–45 e68 | fine | 73 | style R+T>DT −12; energy -17 (plan -4) −10; tempo 133>114 −5 |
| 19→20 | T Pugliese/Chanel '43–45 e68 → V Sarli/Rufino '40–41 e70 | smooth | 99 | era 1944>1940 −1 |
| 20→21 | V Sarli/Rufino '40–41 e70 → T Tanturi/Castillo '41–42 e76 | smooth | 100 | — |

### seed-42 — smooth 12 · fine 5 · jarring 4 · mean 87.1

| | From → to | Grade | S | Why |
|---|---|---|---|---|
| 0→1 | T Canaro/Maida '35–38 e48 → T D'Agostino/Vargas '45 e54 | fine | 79 | style RT>RT −6; era 1936>1945 bridged −11; voc same V −4 |
| 1→2 | T D'Agostino/Vargas '45 e54 → V OTV/Moral '40 e60 | fine | 82 | style RT>RV −3; era 1945>1940 −2; 3x R −12 |
| 2→3 | V OTV/Moral '40 e60 → T D'Arienzo/instr '36–39 e78 | smooth | 99 | style RV>R+T −1 |
| 3→4 | T D'Arienzo/instr '36–39 e78 → T Rodríguez/Flores '38–39 e66 | smooth | 96 | style R+T>RT −2; energy -12 (plan -3) −2 |
| 4→5 | T Rodríguez/Flores '38–39 e66 → M Caló/Berón '42 e69 | smooth | 100 | — |
| 5→6 | M Caló/Berón '42 e69 → T Láurenz/Casas '38–40 e69 | smooth | 99 | style LM>BT −1 |
| 6→7 | T Láurenz/Casas '38–40 e69 → T Tanturi/Castillo '41–42 e78 | smooth | 88 | voc same V −4; 3 vocal tangos −8 |
| 7→8 | T Tanturi/Castillo '41–42 e78 → V Biagi/Ibáñez '38 e82 | smooth | 94 | style R+T>R+V −5; era 1942>1938 −1 |
| 8→9 | V Biagi/Ibáñez '38 e82 → T Troilo/instr '41 e77 | smooth | 100 | — |
| 9→10 | T Troilo/instr '41 e77 → T D'Arienzo/Echagüe '38–39 e81 | smooth | 98 | tempo 119>133 −2 |
| 10→11 | T D'Arienzo/Echagüe '38–39 e81 → T Angelis/Dante '45 e66 | fine | 73 | energy -15 (plan +2) −18; era 1938>1945 bridged −5; voc same V −4 |
| 11→12 | T Angelis/Dante '45 e66 → T Donato/instr '36–40 e61 | **jarring** | 90 | **H4** · era 1945>1938 −10 |
| 12→13 | T Donato/instr '36–40 e61 → T OTV/instr '37 e55 | smooth | 90 | style RT>RT −6; voc same I −4 |
| 13→14 | T OTV/instr '37 e55 → V Rodríguez/Flores '39 e79 | **jarring** | 58 | **H3+H2** · style RT>RV −3; energy +24 (plan +4) −27; 3x R −12 |
| 14→15 | V Rodríguez/Flores '39 e79 → T Sarli/Rufino '40–41 e63 | **jarring** | 78 | **H3** · energy -16 (plan +3) −22 |
| 15→16 | T Sarli/Rufino '40–41 e63 → T Caló/instr '43–44 e64 | fine | 78 | style LT>LT −20; cue e40 slow −2 |
| 16→17 | T Caló/instr '43–44 e64 → M Láurenz/Casas '38–40 e77 | smooth | 97 | style LT>BM −1; era 1943>1939 −1; cue e84 up −1 |
| 17→18 | M Láurenz/Casas '38–40 e77 → T D'Arienzo/instr '36–39 e88 | fine | 82 | energy +11 (plan -6) −18 |
| 18→19 | T D'Arienzo/instr '36–39 e88 → T Pugliese/Morán '45 e73 | **jarring** | 60 | style R+T>DT −12; energy -15 (plan -4) −6; era 1937>1945 bridged −16; tempo 133>114 −5 |
| 19→20 | T Pugliese/Morán '45 e73 → V Demare/Berón '43 e61 | smooth | 98 | cue e70 up −2 |
| 20→21 | V Demare/Berón '43 e61 → T Biagi/Falgás '39–40 e74 | smooth | 91 | energy +13 (plan +1) −8; era 1943>1940 −1 |

### seed-108 — smooth 8 · fine 7 · jarring 7 · mean 83.7

| | From → to | Grade | S | Why |
|---|---|---|---|---|
| 0→1 | T Rodríguez/Moreno '40–43 e68 → T Canaro/Maida '36–38 e53 | **jarring** | 68 | style RT>RT −6; energy -15 (plan +2) −18; era 1942>1937 −4; voc same V −4 |
| 1→2 | T Canaro/Maida '36–38 e53 → V Lomuto/Díaz '39–42 e57 | fine | 85 | style RT>RV −3; 3x R −12 |
| 2→3 | V Lomuto/Díaz '39–42 e57 → T D'Arienzo/instr '36–39 e84 | **jarring** | 82 | **H3** · style RV>R+T −1; energy +27 (plan +13) −16 |
| 3→4 | T D'Arienzo/instr '36–39 e84 → T Troilo/Fiorentino '41–43 e64 | **jarring** | 63 | **H3** · energy -20 (plan +3) −31; era 1937>1942 −4; tempo 133>119 −2 |
| 4→5 | T Troilo/Fiorentino '41–43 e64 → M Donato/Lagos '38–40 e73 | fine | 88 | energy +9 (plan -5) −12 |
| 5→6 | M Donato/Lagos '38–40 e73 → T Caló/instr '43–44 e64 | smooth | 98 | era 1939>1943 −2 |
| 6→7 | T Caló/instr '43–44 e64 → T Sarli/Rufino '40–41 e63 | smooth | 90 | style LT>LT −10 |
| 7→8 | T Sarli/Rufino '40–41 e63 → V Biagi/Ibáñez '38 e82 | smooth | 92 | energy +19 (plan +7) −8 |
| 8→9 | V Biagi/Ibáñez '38 e82 → T D'Arienzo/Mauré '41–42 e77 | smooth | 95 | style R+V>R+T −5 |
| 9→10 | T D'Arienzo/Mauré '41–42 e77 → T Láurenz/Podestá '43 e67 | fine | 84 | energy -10 (plan +0) −4; voc same V −4; 3 vocal tangos −8 |
| 10→11 | T Láurenz/Podestá '43 e67 → M Troilo/Fiorentino '41–42 e77 | smooth | 97 | style BT>BM −3 |
| 11→12 | M Troilo/Fiorentino '41–42 e77 → T Malerba/Medina '42–43 e57 | fine | 87 | energy -20 (plan -10) −5; 3 vocal tangos −8 |
| 12→13 | T Malerba/Medina '42–43 e57 → T D'Agostino/Vargas '45 e57 | fine | 82 | style RT>RT −6; voc same V −4; 3 vocal tangos −8 |
| 13→14 | T D'Agostino/Vargas '45 e57 → V Rodríguez/Moreno '41–44 e75 | **jarring** | 71 | **H2** · style RT>RV −3; energy +18 (plan +4) −12; 3x R −12; cue e84 up −2 |
| 14→15 | V Rodríguez/Moreno '41–44 e75 → T Tanturi/Castillo '41–42 e79 | smooth | 91 | style RV>R+T −1; 3 vocal tangos −8 |
| 15→16 | T Tanturi/Castillo '41–42 e79 → T Donato/instr '36–40 e62 | **jarring** | 69 | **H3** · style R+T>RT −2; energy -17 (plan +5) −28; era 1942>1938 −1 |
| 16→17 | T Donato/instr '36–40 e62 → M Láurenz/Casas '38–40 e77 | smooth | 100 | — |
| 17→18 | M Láurenz/Casas '38–40 e77 → T D'Arienzo/instr '37–39 e86 | fine | 86 | energy +9 (plan -6) −14 |
| 18→19 | T D'Arienzo/instr '37–39 e86 → T Pugliese/Morán '45 e73 | **jarring** | 66 | style R+T>DT −12; energy -13 (plan -4) −2; era 1938>1945 bridged −14; tempo 133>114 −5 |
| 19→20 | T Pugliese/Morán '45 e73 → V Caló/Iriarte '43–45 e62 | smooth | 98 | cue e70 up −2 |
| 20→21 | V Caló/Iriarte '43–45 e62 → T Demare/Miranda '38–42 e49 | fine | 87 | style LV>LT −5; cue e72 up −8 |
| 21→22 | T Demare/Miranda '38–42 e49 → T Biagi/Falgás '39–40 e75 | **jarring** | 62 | **H3** · energy +26 (plan +8) −24; tempo 117>131 −2; voc same V −4; 3 vocal tangos −8 |

### seed-193 — smooth 13 · fine 8 · jarring 1 · mean 89.5

| | From → to | Grade | S | Why |
|---|---|---|---|---|
| 0→1 | T Canaro/Maida '36–38 e51 → T Lomuto/Omar '35–38 e54 | smooth | 90 | style RT>RT −6; voc same V −4 |
| 1→2 | T Lomuto/Omar '35–38 e54 → V OTV/Moral '40 e60 | fine | 84 | style RT>RV −3; era 1936>1940 −1; 3x R −12 |
| 2→3 | V OTV/Moral '40 e60 → T D'Arienzo/instr '36–37 e80 | smooth | 97 | style RV>R+T −1; energy +20 (plan +13) −1; era 1940>1936 −1 |
| 3→4 | T D'Arienzo/instr '36–37 e80 → T Láurenz/Podestá '43 e67 | fine | 86 | energy -13 (plan -1) −8; era 1936>1943 bridged −6 |
| 4→5 | T Láurenz/Podestá '43 e67 → M Donato/Lagos '38–40 e73 | smooth | 98 | era 1943>1939 −2 |
| 5→6 | M Donato/Lagos '38–40 e73 → T Caló/instr '43–44 e64 | smooth | 98 | era 1939>1943 −2 |
| 6→7 | T Caló/instr '43–44 e64 → T Tanturi/Castillo '41–42 e73 | smooth | 100 | — |
| 7→8 | T Tanturi/Castillo '41–42 e73 → V Biagi/Ibáñez '38 e82 | smooth | 94 | style R+T>R+V −5; era 1942>1938 −1 |
| 8→9 | V Biagi/Ibáñez '38 e82 → T D'Arienzo/Echagüe '38–39 e83 | **jarring** | 83 | **H2** · style R+V>R+T −5; 3x R+ −12 |
| 9→10 | T D'Arienzo/Echagüe '38–39 e83 → T Rodríguez/Moreno '40–43 e69 | fine | 73 | style R+T>RT −2; energy -14 (plan +0) −12; era 1938>1942 −1; voc same V −4; 3 vocal tangos −8 |
| 10→11 | T Rodríguez/Moreno '40–43 e69 → M Láurenz/Casas '38–40 e77 | smooth | 100 | — |
| 11→12 | M Láurenz/Casas '38–40 e77 → T Malerba/Medina '42–43 e57 | fine | 86 | energy -20 (plan -10) −5; era 1939>1943 −1; 3 vocal tangos −8 |
| 12→13 | T Malerba/Medina '42–43 e57 → T Sarli/instr '40–43 e68 | smooth | 88 | energy +11 (plan -3) −12 |
| 13→14 | T Sarli/instr '40–43 e68 → V Caló/Iriarte '43–45 e62 | smooth | 91 | style LT>LV −5; energy -6 (plan +4) −4 |
| 14→15 | V Caló/Iriarte '43–45 e62 → T Troilo/Marino '43–45 e72 | smooth | 99 | style LV>BT −1 |
| 15→16 | T Troilo/Marino '43–45 e72 → T D'Agostino/Vargas '41–44 e60 | fine | 78 | energy -12 (plan +5) −18; voc same V −4 |
| 16→17 | T D'Agostino/Vargas '41–44 e60 → M Tanturi/Castillo '41–42 e81 | fine | 88 | style RT>R+M −1; energy +21 (plan +8) −12 |
| 17→18 | M Tanturi/Castillo '41–42 e81 → T D'Arienzo/instr '40–42 e85 | smooth | 91 | style R+M>R+T −5; energy +4 (plan -6) −4 |
| 18→19 | T D'Arienzo/instr '40–42 e85 → T Pugliese/instr '44–45 e73 | fine | 77 | style R+T>DT −12; era 1941>1944 −2; tempo 133>114 −5; voc same I −4 |
| 19→20 | T Pugliese/instr '44–45 e73 → V Sarli/Rufino '40–43 e69 | smooth | 100 | — |
| 20→21 | V Sarli/Rufino '40–43 e69 → T Demare/Quintana '44–45 e55 | smooth | 90 | style LV>LT −5; cue e72 up −5 |
| 21→22 | T Demare/Quintana '44–45 e55 → T Biagi/Amor '43–45 e78 | fine | 77 | energy +23 (plan +8) −16; tempo 117>131 −2; voc same V −4 |

### seed-250 — smooth 12 · fine 4 · jarring 5 · mean 85.8

| | From → to | Grade | S | Why |
|---|---|---|---|---|
| 0→1 | T Rodríguez/Moreno '41–43 e67 → T Sarli/Rufino '39–43 e52 | fine | 78 | energy -15 (plan +2) −18; voc same V −4 |
| 1→2 | T Sarli/Rufino '39–43 e52 → V Canaro/Maida '37–38 e58 | smooth | 100 | — |
| 2→3 | V Canaro/Maida '37–38 e58 → T D'Arienzo/instr '36–39 e83 | fine | 88 | style RV>R+T −1; energy +25 (plan +13) −12 |
| 3→4 | T D'Arienzo/instr '36–39 e83 → T Biagi/Falgás '39–40 e74 | fine | 84 | style R+T>R+T −10; energy -9 (plan +2) −6 |
| 4→5 | T Biagi/Falgás '39–40 e74 → M Caló/Berón '42 e69 | smooth | 100 | — |
| 5→6 | M Caló/Berón '42 e69 → T Donato/instr '36–40 e62 | smooth | 99 | era 1942>1938 −1 |
| 6→7 | T Donato/instr '36–40 e62 → T Láurenz/Casas '38–40 e69 | smooth | 100 | — |
| 7→8 | T Láurenz/Casas '38–40 e69 → V Troilo/Fiorentino '42–44 e71 | smooth | 96 | style BT>BV −3; era 1940>1943 −1 |
| 8→9 | V Troilo/Fiorentino '42–44 e71 → T D'Arienzo/Echagüe '38–39 e83 | smooth | 92 | energy +12 (plan +1) −6; era 1943>1938 −2 |
| 9→10 | T D'Arienzo/Echagüe '38–39 e83 → T Malerba/Medina '42–43 e58 | **jarring** | 45 | **H3** · style R+T>RT −2; energy -25 (plan +0) −38; era 1938>1943 −4; voc same V −4; 3 vocal tangos −8 |
| 10→11 | T Malerba/Medina '42–43 e58 → M Tanturi/Castillo '41–42 e81 | **jarring** | 70 | **H3** · style RT>R+M −1; energy +23 (plan +2) −28 |
| 11→12 | M Tanturi/Castillo '41–42 e81 → T OTV/instr '37 e55 | **jarring** | 77 | **H3** · style R+M>RT −1; energy -26 (plan -10) −20; era 1941>1937 −2 |
| 12→13 | T OTV/instr '37 e55 → T Lomuto/Omar '36–38 e56 | smooth | 94 | style RT>RT −6 |
| 13→14 | T Lomuto/Omar '36–38 e56 → V Rodríguez/Moreno '40–42 e74 | **jarring** | 70 | style RT>RV −3; energy +18 (plan +4) −12; era 1937>1941 −2; 3x R −12; cue e82 up −2 |
| 14→15 | V Rodríguez/Moreno '40–42 e74 → T Troilo/Fiorentino '41–43 e64 | smooth | 90 | energy -10 (plan +3) −10 |
| 15→16 | T Troilo/Fiorentino '41–43 e64 → T Caló/instr '43–44 e64 | smooth | 98 | style BT>LT −2 |
| 16→17 | T Caló/instr '43–44 e64 → M Canaro/Maida '35–36 e71 | smooth | 92 | era 1943>1936 −8 |
| 17→18 | M Canaro/Maida '35–36 e71 → T D'Arienzo/instr '36–38 e84 | fine | 77 | style RM>R+T −1; energy +13 (plan -6) −22 |
| 18→19 | T D'Arienzo/instr '36–38 e84 → T Pugliese/instr '44–45 e73 | **jarring** | 55 | **H5** · style R+T>DT −12; era 1937>1944 bridged −16; tempo 133>114 −5; voc same I −4; 3 instr tangos −8 |
| 19→20 | T Pugliese/instr '44–45 e73 → V Sarli/Rufino '40–43 e69 | smooth | 100 | — |
| 20→21 | V Sarli/Rufino '40–43 e69 → T Tanturi/Castillo '41–42 e80 | smooth | 96 | energy +11 (plan +1) −4 |

## 2. The transition model

A pairwise score `S(a, b)` for consecutive dance tandas `a → b` (the closing Cumparsita is not scored). It starts at 100 and subtracts penalties. Every input is already on a `Tanda` (`style`, `energy`, `targetEnergy`, `phase`, `rhythm`, `vocal`, `songs[].year`, `cortina.energy`, `cortina.tags`) or on the orchestra profile (`bpm`, `style`). One small data addition is needed: the `drive` flag in §2.1.

### 2.1 Style classes

The four profile styles are too coarse: 13 of the 18 orchestras in these nights are `rhythmic`. Canaro, Lomuto, OTV, Donato, Malerba, D'Agostino, Firpo and Rodríguez are not the same pulse as D'Arienzo or Biagi. Split `rhythmic` with a new profile field `drive: "hard"` on `juan-d-arienzo`, `rodolfo-biagi` and `ricardo-tanturi`:

`cls(t) = R+ if style = rhythmic and drive = hard; R if rhythmic; L lyrical; B balanced; D dramatic`. Use `t.style` (the tanda's own style), not the profile's: the engine already re-styles some valses (the Caló/Iriarte vals is `rhythmic`).

### 2.2 Terms

| Term | Formula | Notes |
|---|---|---|
| **Style pair** `P_s` | `MATRIX[cls(a)][cls(b)]`, below | ×0.5 when either tanda is a vals or milonga, unless D is involved. D → vals/milonga = 0. +10 for L(T) → L(T) when either tanda is in the `peak` phase |
| **Energy** `P_e` | `j = |Δe − Δt|` with `Δe = b.energy − a.energy` and `Δt = b.targetEnergy − a.targetEnergy`; `P_e = min(36, 2·max(0, j − 8)) + 0.5·max(0, |Δe| − 18)` | The first part is the unplanned step (the same `j` as `score.ts` "steps"). The second part is felt even when it was planned |
| **Era** `P_y` | `d = |meanYear(a) − meanYear(b)|`; `0` if d ≤ 3; `2.5·(d−3)` if d ≤ 6; `7.5 + 5·(d−6)` if d > 6. Halved when the cortina is a *bridge*; halved again when either tanda is a V/M. `+8` when `b` is D and `a` is R/R+ with mean year ≤ 1939 | Bridge cue: `tempo:medium` or `tempo:slow`, and `min(ea, eb) − 10 ≤ cue.energy ≤ max(ea, eb)`. The +8 is the sound of the recording: a 1936 D'Arienzo straight into a 1945 Pugliese |
| **Tempo** `P_b` | T → T only: `0.6·max(0, |bpmMid(a) − bpmMid(b)| − 10)` | `bpmMid` = midpoint of the profile's `bpm[rhythm]` |
| **Vocal** `P_v` | T → T with the same mode: 4. On entering the third vocal tango tanda in a row (tango-only sequence): 8 | Instrumental runs are a hard rule (H5) |
| **Style run** `P_r` | 12 when `cls(a−1) = cls(a) = cls(b)`, any rhythm | Hard only as in H2 |
| **Cortina** `P_c` | `0.4·max(0, |cue.e − (b.e − 8)| − 12)`; `+6` for a `tempo:slow` cue into b.e ≥ 75 unless b is D; `+4` for a `tempo:up` cue into a D tanda | Matches the `pickCortina` aim: 8 below the next tanda, moody before Pugliese |
| **Brightness / tonality** | weight 0 | No data: profiles and songs carry no key, mode or brightness. Add `audio.valence` or `brightness` per song from the audio cache when it exists. Suggested term: `6·max(0, |Δbright| − 0.25)` |

`S = 100 − (P_s + P_e + P_y + P_b + P_v + P_r + P_c)`; smooth ≥ 88; fine 72–87; jarring < 72 or any hard rule.

Style matrix (tango → tango, from row to column):

| from \ to | R+ | R | L | B | D |
|---|---|---|---|---|---|
| **R+** | 10 | 2 | 0 | 0 | 12 |
| **R** | 2 | 6 | 0 | 0 | 10 |
| **L** | 0 | 0 | 10 | 2 | 4 |
| **B** | 0 | 0 | 2 | 6 | 4 |
| **D** | 0 | 6 | 15 | 6 | 40 |

Use in compose: when the engine samples the family for slot *i*, multiply the candidate weight by `exp((S(prev, cand) − 100)/15)`. Better still, since the slot's own energy fit is already in the weight, reject candidates that break H1–H6 before sampling. That alone would have removed every jarring boundary of the featured night (§3).

### 2.3 Hard rules (each a vitest invariant)

Run over the default 4 h golden set with seeds `[3, 42, 108, 181, 193, 250]`, plus `classic-two-peaks` and `single` arcs. `seq = plan.tandas`, `tangos = seq.filter(t => t.rhythm === "tango")`.

| # | Rule | Invariant |
|---|---|---|
| **H1** | Never two dramatic tandas adjacent, any rhythm | `seq.every((t, i) => i === 0 \|\| !(t.style === "dramatic" && seq[i-1].style === "dramatic"))` |
| **H2** | At most one same-class triple per night, and none touching a `peak` slot | `triples = i where cls(seq[i-1]) === cls(seq[i]) === cls(seq[i+1])`; `expect(triples.length).toBeLessThanOrEqual(1)`; `expect(triples.every(i => [i-1, i, i+1].every(k => seq[k].phase !== "peak"))).toBe(true)` |
| **H3** | No unplanned energy jump: never `|Δe| > 25`, and never `|Δe| ≥ 15` with `|Δe − Δt| > 18` | loop over `i`: `expect(Math.abs(de)).toBeLessThanOrEqual(25)`; `if (Math.abs(de) >= 15) expect(Math.abs(de - dt)).toBeLessThanOrEqual(18)` |
| **H4** | Era: a T → T mean-year gap > 6 only through a bridge cortina (definition in §2.2); never > 9 on any boundary | `d > 9 → fail`; `a, b tango && d > 6 → expect(isBridge(a.cortina, a, b)).toBe(true)` |
| **H5** | Never three instrumental tango tandas in a row (the tango-only sequence; V/M do not break it) | `tangos.every((t, k) => k < 2 \|\| tangos[k].vocal \|\| tangos[k-1].vocal \|\| tangos[k-2].vocal)` |
| **H6** | After a dramatic tanda, never a lyrical tango: next is a vals or milonga, or a rhythmic or balanced tango (`followWith`) | `seq.every((t, i) => t.style !== "dramatic" \|\| !seq[i+1] \|\| seq[i+1].rhythm !== "tango" \|\| seq[i+1].style !== "lyrical")` |

Why these and not stricter ones. In the reference sets, three or more vocal tango tandas in a row happen 75 times across 30 nights, so vocal runs are a soft penalty, not a rule. Three instrumental tango tandas in a row happen only 7 times, and the engine already has `maxInstrumentalBeforeVocal: 2`. A same-style triple occurs in 11 of 30 reference sets, so "never" would be stricter than practice; H2 allows one triple, away from the peak. No reference set ever puts two dramatic tandas next to each other.

Hits on these six nights: H3 × 14, H2 × 3 (seeds 42, 108, 193), H4 × 1 (seed 42 11→12, De Angelis 1945 → Donato 1938 with a slow e50 cue), H5 × 1 (seed 250: D'Arienzo instrumental → Pugliese instrumental after Caló instrumental). H1 and H6: none.

## 3. Featured night: the worst transitions and the smallest fixes

Constraints respected in every fix: TTVTTM untouched, the same orchestra never closer than 6 tandas, at most 2 tandas per orchestra (D'Arienzo 3), maxYearSpread 4, Rodríguez keeps Moreno, no title repeats, the core canon (Di Sarli, Biagi, D'Arienzo, Donato) kept. Song energies are the catalog's.

| Rank | Boundary | S now | Problem | Smallest fix | S after |
|---|---|---|---|---|---|
| 1 | **18 → 19** D'Arienzo instrumental '36–39 e85 → D'Agostino/Vargas '41–44 e60 | 65 jarring (H3) | The second summit falls 25 points into a soft tanda that sits 21 under its own target (81). No hotter family is free at 19: Tanturi, Pugliese, Láurenz, Rodríguez and Malerba are inside the 6-tanda window, and Troilo and Caló are at their cap | **Swap one family:** slot 19 → **De Angelis / Carlos Dante 1945** (No Me Importa su Amor, Vieja Luna, Cuando Tú Me Quieras, Soy un Arlequín; e67). Change the cue at gap 18 from Resimdeki Gözyaşları (slow e48) to **Haydi Söyle (Tatlıses, medium e66, unused tonight)**, a bridge cue for the 7-year era step. *Musically stronger, two families:* slot 19 → Troilo/Fiorentino 1941–42 tangos (Tabernero, Cautivo, Soy un Muchacho de la Guardia, Con Toda la Voz que Tengo; e71) and slot 11 milonga → Canaro/Maida (Largá las Penas, Milonga Criolla, Silueta Porteña; e71). This leaves 12 distinct orchestras, the benchmark floor | 81 fine (one swap); 91 smooth (two families) |
| 2 | **9 → 10** D'Arienzo/Echagüe '38–39 e82 → Donato instrumental '36–40 e62 | 73 jarring (H3) | The first summit drops 20 points with a flat plan (82 → 82). Donato's instrumentals top out at e64, and every legal one-family swap at 10 (De Angelis e68, Donato/Lagos e64, Demare e58) stays below 70 | **Move two families:** slot 10 → **Di Sarli instrumental 1940–42** (Don Juan, El Pollo Ricardo, El Amanecer, Milonguero Viejo; e71). Slot 1 → **Donato / Horacio Lagos 1937–40** (Mis Pesares, Lágrimas, El Adiós, Gato; e62), which keeps Donato in the night. Di Sarli is then at 10 and 20, and Rufino is still heard in the vals at 20 | 90 smooth (0 → 1 is 88 smooth; 1 → 2 becomes 82 fine: Canaro → Donato → the rhythmic-styled Caló vals is a warm-up triple, which H2 allows) |
| 3 | **13 → 14** Malerba/Medina '42–43 e57 → Rodríguez/Moreno vals e74 | 85 fine | A +17 climb with a +4 plan; Malerba sits 14 under its target | **Same family, hotter sides:** Violín (1944) e62, Oiga Mozo (1942) e61, Remembranza (1943) e60, Gitana Rusa (1942) e58 → e60 (spread 1942–44) | 91 smooth |
| 4 | **15 → 16** Tanturi/Castillo → Pugliese instrumental '44–46 | 86 fine | R+ → D style cost only. The moody set-up cue is correct, and so is the 1941 → 1945 step | **No change.** This is the textbook way into Pugliese |
| 5 | **8 → 9** Biagi vals → D'Arienzo/Echagüe | 87 fine | Three vocal tango tandas in a row (Rodríguez 6, Láurenz 7, D'Arienzo 9) and R+ into R+ | **No change.** The only lever is Láurenz instrumental at 7, but the corpus has only 3 Láurenz instrumentals from 1940–41 plus a Cumparsita, so it is not a 4-song tanda |

With fixes 1 (one swap), 2 and 3 together: **smooth 17 · fine 4 · jarring 0, mean S 92.3, no hard-rule hits.** 13 distinct orchestras, D'Arienzo × 3, no spacing violation; D'Agostino leaves the night. With the two-family version of fix 1: smooth 18 · fine 3 · jarring 0, mean 92.8, 12 orchestras.

The trade-off on the arc: fix 2 raises slot 10 from 62 to 71 (target 82), so arc RMSE improves. Fix 1 raises slot 19 from 60 to 67 or 71 (target 81). De Angelis/Dante sides are fame 0 in the index, so the "fame" and "obscure" factors lose a little. The two-family version uses known Troilo and Canaro sides and avoids that.

## 4. Benchmark check: "transition smoothness"

Add to `data/knowledge/benchmark.json` (and `benchmark.ts`):

```json
"transitions": {
  "label": "Transition smoothness (pairwise S between consecutive tandas)",
  "meanRange": [88, 97],
  "structuralRange": [87, 98],
  "maxJarringPer4h": 2,
  "minPair": 60,
  "hardRules": ["H1", "H2", "H3", "H4", "H5", "H6"],
  "near": 3,
  "weight": 3,
  "source": "round13-transitions §2; structural sub-score (style + era + tempo + vocal + run, no energy/cortina) over the 30 reference sets with ≥ 10 tandas: mean 89.5, p25 87.2, p75 91.3, min 80.4, max 97.7; no reference set has two dramatic tandas adjacent"
}
```

Scoring: 1.0 when mean S is in `meanRange`, jarring ≤ 2 per 4 h, min S ≥ 60 and H1/H6 = 0. Otherwise `clamp((meanS − 80) / 8, 0, 1) × (1 − 0.2·max(0, jarring − 2))`, and ×0.5 for any H1 or H6 hit. `structuralRange` is a sanity band. Engine nights already score 92–97 on it, higher than the reference DJs, because a golden-only night has small era gaps. The engine loses its points on energy handovers, not on style.

Where the nights land today:

| Night | Mean S | Jarring | Min S | Passes? |
|---|---|---|---|---|
| featured | 90.9 | 2 | 65 | yes |
| featured + fixes 1–3 | 92.3 | 0 | 81 | yes |
| featured + fixes 1 (two-family) + 2 + 3 | 92.8 | 0 | 82 | yes |
| seed 3 | 83.9 | 3 | 60 | no (mean, jarring) |
| seed 42 | 87.1 | 4 | 58 | no (mean, jarring, min) |
| seed 108 | 83.7 | 7 | 62 | no |
| seed 193 | 89.5 | 1 | 73 | yes |
| seed 250 | 85.8 | 5 | 45 | no |

So 2 of 5 seeds pass. Introduce the check at weight 3 together with the compose change in §2.2 (the pairwise weight plus H1–H6 filtering). Re-run the default golden set against its ≥ 85 benchmark bar before raising the weight. The three engine changes that would move most seeds into range:
1. Never plan three peak-level slots in a row: the slot after a D'Arienzo summit gets `target ≤ summit − 10`.
2. Never put the second D'Arienzo summit directly before Pugliese. Follow the featured pattern: Pugliese at about 0.73, a milonga, then D'Arienzo.
3. Add the pairwise weight to family sampling.
