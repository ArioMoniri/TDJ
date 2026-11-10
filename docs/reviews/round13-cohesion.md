# Round 13: tanda cohesion review (year spread, sessions, tempo)

Reviewer: a tango DJ who builds tandas from one orchestra, one singer, one recording period and one sound, ideally sides cut within a year or two of each other. Read-only review. Nothing in the engine or the data was changed.

**Nights judged:** the featured night (`docs/specs/round11-best-night.md`, shipped as `apps/web/public/featured/golden-double-peak.json`) and engine seeds 3, 42, 108, 193 and 250 (golden 1935–45, 4 h, Turkish cortinas, double peak; run with the current `maxYearSpread: 4`). Recording dates come from the night JSONs and `data/index/songs.json`. Every side in the six nights has a full date. Tempo comes from `audio.bpm`, which exists for about half the sides.

**Engine rules reviewed:** `families()` in `packages/core/src/tanda.ts` puts an orchestra and singer's sides into windows that start at the **earliest** dated side and run `maxYearSpread` = 4 years (`compose.ts` DEFAULT_OPTIONS). The `era` factor in `score.ts` only counts a tanda as loose above `max(maxYearSpread, 4)` years, or above **6** years for a 3-side tanda. Every one of the six nights therefore scores `era 1.00`, including the featured night with 10 loose tandas. The factor is blind to the problem the user is describing.

## Headline

| Night | Tight | Acceptable | Loose | Median spread | Spread ≤ 2 y | Single-year tandas |
|---|---|---|---|---|---|---|
| **Featured (round 11 spec)** | 7 | 5 | **10** | 2 y | 12/22 (55 %) | 3 |
| Seed 3 | 15 | 5 | 2 | 1 y | 19/22 (86 %) | 7 |
| Seed 42 | 13 | 3 | 6 | 1 y | 18/22 (82 %) | 10 |
| Seed 108 | 8 | 7 | 8 | 2 y | 17/23 (74 %) | 4 |
| Seed 193 | 8 | 10 | 5 | 2 y | 18/23 (78 %) | 3 |
| Seed 250 | 9 | 8 | 5 | 1.5 y | 18/22 (82 %) | 2 |
| **All six** | **60** | **38** | **36** | | | |
| Published classic sets A–D (single-family tandas, n = 57) | | | | **1 y** | **81 %** | 30 % |
| Reference corpus, 31 sets (`reference_sets.json`, golden single-family, n = 391) | | | | 2 y | 67 % | 16 % |

The hand-edited featured night is the **loosest** of the six. The round-11 edits traded recording-period coherence for famous sides: for example, Comme il faut (1938) went into a 1941 Troilo instrumental tanda, Trago Amargo (1939) into a 1936 D'Arienzo tanda, and Señor, Señor (1943) into Biagi/Ortiz 1940–41. The engine seeds are tighter, but every seed repeats the same four structural mistakes:

1. **D'Arienzo instrumentals that straddle Biagi's departure** (8 tandas in 5 nights). 1936 Biagi-era sides get mixed with 1939 Polito-era sides, for example Retintín (1936) with Derecho Viejo (1939). These are two different orchestras to a dancer.
2. **Donato instrumentals 1936–40, a 4-year spread** (5 of 6 nights). The index has only 9 dated Donato instrumentals, so the greedy window grabs the whole pool.
3. **Láurenz / Casas 1938 + 1940** (4 seeds). This crosses a 20-month gap in the recordings (the 1937–38 sides, then the 1940 sides). The 18-month gap test in R3 catches it. The test does not know the cause, but the gap is the evidence.
4. **Vocal families spanning 1940–43** (Di Sarli / Rufino, Rodríguez / Moreno, D'Agostino / Vargas, Biagi / Ortiz). Each tanda picks the famous side of every year instead of four sides from one year. The pools are big enough for a single-year tanda in every case.

**How the verdicts were assigned** (the same thresholds as the rules in section 2):
- **tight**: year spread ≤ 1 and date span ≤ 18 months.
- **acceptable**: within the hard limit (vocal tango ≤ 2 y, instrumental tango ≤ 3 y, vals or milonga ≤ 2 y) and no break crossed.
- **loose**: over the limit, or crossing a break: a singer stint in `orchestra_profiles.json`, a recording gap of 18 months or more in that orchestra-and-singer's dated sides, or a known personnel change (D'Arienzo: Biagi leaves about July 1938; new line-up in 1940).

**About the tempo column:** the BPM data comes from 30-second previews. It sits on a coarse grid (83, 92, 108, 118, 123, 129, 136, 144, 162, 215, 235) and has octave and 5:4 errors. For example, Tanturi / Castillo reads 129 / 92 / 129 / 129, and Láurenz / Podestá alternates 162 / 129. I folded each reading into the orchestra profile's `bpm` range before taking max − min. Measured this way, no tanda with at least two readings exceeds `BPM_DELTA_MAX`. Treat this as "no audible tempo problem detected", not as proof. The energy range (the `energy` model) is shown as a second proxy for "same sound".

## 1. Every tanda, every night

### Featured night (round 11 spec, `golden-double-peak.json`)

Tight **7** · acceptable **5** · loose **10** of 22 · median spread 2.0 y · mean 1.95 y · spread ≤ 2 in 12/22 · single-year tandas 3

| # | R | Family | Years | Spread | Date span | Sessions | Tempo (folded BPM range, sides measured) | Energy range | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 0 | T | Francisco Canaro / Roberto Maida | 1936–1938 | 2 | 29.4 mo | all different dates | 6 BPM (3/4) | 10 | acceptable |
| 1 | T | Carlos Di Sarli / Roberto Rufino | 1939–1942 | 3 | 31.6 mo | all different dates | 4 BPM (4/4) | 17 | loose — spread 3 > 2 |
| 2 | V | Miguel Caló / Raúl Iriarte | 1943–1945 | 2 | 20.6 mo | all different dates | n/a (1/3) | 1 | acceptable |
| 3 | T | Juan D'Arienzo (instr) | 1936–1939 | 3 | 42.5 mo | all different dates | n/a (1/4) | 11 | loose — crosses Biagi's exit from D'Arienzo (~Jul 1938) |
| 4 | T | Aníbal Troilo (instr) | 1938–1941 | 3 | 36.3 mo | all different dates | n/a (0/4) | 8 | loose — recording gap 1938-07-03→1941-03-04 |
| 5 | M | Ricardo Tanturi / Alberto Castillo | 1941–1942 | 1 | 15.2 mo | all different dates | 4 BPM (3/3) | 6 | tight |
| 6 | T | Enrique Rodríguez / Armando Moreno | 1940–1943 | 3 | 34.3 mo | all different dates | n/a (0/4) | 4 | loose — spread 3 > 2 |
| 7 | T | Pedro Láurenz / Alberto Podestá | 1943–1943 | 0 | 4.8 mo | all different dates | 5 BPM (4/4) | 8 | tight |
| 8 | V | Rodolfo Biagi (instr) | 1941–1941 | 0 | 8.3 mo | all different dates | 0 BPM (2/3) | 0 | tight |
| 9 | T | Juan D'Arienzo / Alberto Echagüe | 1938–1939 | 1 | 19.1 mo | all different dates | n/a (1/4) | 4 | acceptable |
| 10 | T | Edgardo Donato (instr) | 1936–1940 | 4 | 52.3 mo | all different dates | n/a (0/4) | 3 | loose — spread 4 > 3 |
| 11 | M | Aníbal Troilo / Francisco Fiorentino | 1941–1942 | 1 | 10.6 mo | all different dates | n/a (1/3) | 6 | tight |
| 12 | T | Miguel Caló / Raúl Berón | 1942–1942 | 0 | 5.4 mo | all different dates | n/a (1/4) | 5 | tight |
| 13 | T | Ricardo Malerba / Orlando Medina | 1942–1943 | 1 | 4.3 mo | 2 sides share a date | 5 BPM (4/4) | 7 | tight |
| 14 | V | Enrique Rodríguez / Armando Moreno | 1941–1944 | 3 | 33.9 mo | all different dates | n/a (0/3) | 7 | loose — spread 3 > 2 |
| 15 | T | Ricardo Tanturi / Alberto Castillo | 1941–1942 | 1 | 19.1 mo | all different dates | 8 BPM (4/4) | 4 | acceptable |
| 16 | T | Osvaldo Pugliese (instr) | 1944–1946 | 2 | 26.7 mo | all different dates | 3 BPM (2/4) | 10 | acceptable |
| 17 | M | Pedro Láurenz / Alberto Podestá | 1943–1944 | 1 | 3.5 mo | all different dates | 0 BPM (2/3) | 1 | tight |
| 18 | T | Juan D'Arienzo (instr) | 1936–1939 | 3 | 41.5 mo | all different dates | n/a (1/4) | 4 | loose — crosses Biagi's exit from D'Arienzo (~Jul 1938) |
| 19 | T | Ángel D'Agostino / Angel Vargas | 1941–1944 | 3 | 31.5 mo | all different dates | n/a (1/4) | 4 | loose — spread 3 > 2 |
| 20 | V | Carlos Di Sarli / Roberto Rufino | 1940–1943 | 3 | 36.6 mo | all different dates | n/a (1/3) | 10 | loose — spread 3 > 2 |
| 21 | T | Rodolfo Biagi / Jorge Ortíz | 1940–1943 | 3 | 25.0 mo | all different dates | 4 BPM (4/4) | 6 | loose — spread 3 > 2 |

### Engine seed 3

Tight **15** · acceptable **5** · loose **2** of 22 · median spread 1.0 y · mean 1.14 y · spread ≤ 2 in 19/22 · single-year tandas 7

| # | R | Family | Years | Spread | Date span | Sessions | Tempo (folded BPM range, sides measured) | Energy range | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 0 | T | Francisco Canaro (instr) | 1938–1940 | 2 | 21.2 mo | 2 sides share a date | n/a (0/4) | 4 | acceptable |
| 1 | T | Carlos Di Sarli / Jorge Durán | 1945–1945 | 0 | 4.8 mo | all different dates | 7 BPM (4/4) | 18 | tight |
| 2 | V | Orquesta Típica Víctor / Carmen del Moral | 1940–1940 | 0 | 3.2 mo | all different dates | n/a (0/3) | 7 | tight |
| 3 | T | Juan D'Arienzo (instr) | 1936–1937 | 1 | 21.0 mo | all different dates | n/a (1/4) | 2 | acceptable |
| 4 | T | Enrique Rodríguez / Roberto "Chato" Flores | 1938–1939 | 1 | 11.1 mo | all different dates | 0 BPM (3/4) | 16 | tight |
| 5 | M | Ricardo Tanturi / Alberto Castillo | 1941–1942 | 1 | 15.2 mo | all different dates | 4 BPM (3/3) | 6 | tight |
| 6 | T | Pedro Láurenz / Alberto Podestá | 1943–1943 | 0 | 4.1 mo | 2 sides share a date | 5 BPM (4/4) | 5 | tight |
| 7 | T | Ángel D'Agostino / Angel Vargas | 1945–1945 | 0 | 3.6 mo | 2 sides share a date | n/a (0/4) | 8 | tight |
| 8 | V | Rodolfo Biagi / Teófilo Ibáñez | 1938–1938 | 0 | 1.5 mo | all different dates | 0 BPM (3/3) | 12 | tight |
| 9 | T | Juan D'Arienzo / Alberto Echagüe | 1938–1939 | 1 | 13.6 mo | all different dates | n/a (1/4) | 3 | tight |
| 10 | T | Edgardo Donato (instr) | 1936–1940 | 4 | 52.3 mo | all different dates | n/a (0/4) | 3 | loose — spread 4 > 3 |
| 11 | T | Alfredo De Angelis / Carlos Dante | 1944–1945 | 1 | 14.5 mo | all different dates | n/a (0/4) | 4 | tight |
| 12 | T | Miguel Caló (instr) | 1943–1944 | 1 | 19.1 mo | all different dates | 5 BPM (2/4) | 11 | acceptable |
| 13 | T | Ricardo Malerba / Orlando Medina | 1942–1943 | 1 | 4.3 mo | 2 sides share a date | 5 BPM (4/4) | 7 | tight |
| 14 | V | Enrique Rodríguez / Roberto "Chato" Flores | 1939–1939 | 0 | 4.2 mo | all different dates | 7 BPM (3/3) | 7 | tight |
| 15 | T | Aníbal Troilo / Francisco Fiorentino | 1941–1941 | 0 | 6.2 mo | all different dates | 0 BPM (2/4) | 9 | tight |
| 16 | T | Roberto Firpo (instr) | 1935–1938 | 3 | 41.2 mo | all different dates | n/a (0/4) | 6 | acceptable |
| 17 | M | Pedro Láurenz / Alberto Podestá | 1943–1944 | 1 | 3.5 mo | all different dates | 0 BPM (2/3) | 1 | tight |
| 18 | T | Juan D'Arienzo (instr) | 1940–1944 | 4 | 43.6 mo | all different dates | 5 BPM (3/4) | 2 | loose — spread 4 > 3 |
| 19 | T | Osvaldo Pugliese / Roberto Chanel | 1943–1945 | 2 | 20.3 mo | all different dates | n/a (1/4) | 12 | acceptable |
| 20 | V | Carlos Di Sarli / Roberto Rufino | 1940–1941 | 1 | 12.7 mo | all different dates | n/a (1/3) | 10 | tight |
| 21 | T | Ricardo Tanturi / Alberto Castillo | 1941–1942 | 1 | 15.2 mo | all different dates | 6 BPM (4/4) | 4 | tight |

### Engine seed 42

Tight **13** · acceptable **3** · loose **6** of 22 · median spread 1.0 y · mean 1.05 y · spread ≤ 2 in 18/22 · single-year tandas 10

| # | R | Family | Years | Spread | Date span | Sessions | Tempo (folded BPM range, sides measured) | Energy range | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 0 | T | Francisco Canaro / Roberto Maida | 1935–1938 | 3 | 41.0 mo | all different dates | 0 BPM (3/4) | 9 | loose — spread 3 > 2 |
| 1 | T | Ángel D'Agostino / Angel Vargas | 1945–1945 | 0 | 3.6 mo | 2 sides share a date | n/a (1/4) | 8 | tight |
| 2 | V | Orquesta Típica Víctor / Carmen del Moral | 1940–1940 | 0 | 3.2 mo | all different dates | n/a (0/3) | 7 | tight |
| 3 | T | Juan D'Arienzo (instr) | 1936–1939 | 3 | 36.8 mo | all different dates | 5 BPM (2/4) | 7 | loose — crosses Biagi's exit from D'Arienzo (~Jul 1938) |
| 4 | T | Enrique Rodríguez / Roberto "Chato" Flores | 1938–1939 | 1 | 20.9 mo | all different dates | 0 BPM (2/4) | 11 | acceptable |
| 5 | M | Miguel Caló / Raúl Berón | 1942–1942 | 0 | – mo | all different dates | n/a (1/3) | 10 | tight |
| 6 | T | Pedro Láurenz / Juan Carlos Casas | 1938–1940 | 2 | 21.4 mo | 2 sides share a date | 0 BPM (3/4) | 9 | loose — recording gap 1938-05-12→1940-01-25 |
| 7 | T | Ricardo Tanturi / Alberto Castillo | 1941–1942 | 1 | 21.5 mo | all different dates | 8 BPM (4/4) | 10 | acceptable |
| 8 | V | Rodolfo Biagi / Teófilo Ibáñez | 1938–1938 | 0 | 1.5 mo | all different dates | 0 BPM (3/3) | 12 | tight |
| 9 | T | Aníbal Troilo (instr) | 1941–1941 | 0 | 4.5 mo | all different dates | n/a (0/4) | 4 | tight |
| 10 | T | Juan D'Arienzo / Alberto Echagüe | 1938–1939 | 1 | 11.4 mo | all different dates | n/a (1/4) | 6 | tight |
| 11 | T | Alfredo De Angelis / Carlos Dante | 1945–1945 | 0 | 11.1 mo | all different dates | n/a (0/4) | 4 | tight |
| 12 | T | Edgardo Donato (instr) | 1936–1940 | 4 | 52.3 mo | all different dates | n/a (0/4) | 3 | loose — spread 4 > 3 |
| 13 | T | Orquesta Típica Víctor (instr) | 1937–1937 | 0 | 8.3 mo | all different dates | n/a (0/4) | 5 | tight |
| 14 | V | Enrique Rodríguez / Roberto "Chato" Flores | 1939–1939 | 0 | 4.2 mo | all different dates | 7 BPM (3/3) | 7 | tight |
| 15 | T | Carlos Di Sarli / Roberto Rufino | 1940–1941 | 1 | 8.4 mo | all different dates | 4 BPM (4/4) | 14 | tight |
| 16 | T | Miguel Caló (instr) | 1943–1944 | 1 | 19.1 mo | all different dates | 5 BPM (2/4) | 12 | acceptable |
| 17 | M | Pedro Láurenz / Juan Carlos Casas | 1938–1940 | 2 | 26.6 mo | all different dates | n/a (1/3) | 13 | loose — recording gap 1938-05-12→1940-01-25 |
| 18 | T | Juan D'Arienzo (instr) | 1936–1939 | 3 | 39.5 mo | all different dates | 0 BPM (2/4) | 4 | loose — crosses Biagi's exit from D'Arienzo (~Jul 1938) |
| 19 | T | Osvaldo Pugliese / Alberto Morán | 1945–1945 | 0 | 10.8 mo | all different dates | n/a (1/4) | 20 | tight |
| 20 | V | Lucio Demare / Raúl Berón | 1943–1943 | 0 | 6.7 mo | all different dates | n/a (1/3) | 2 | tight |
| 21 | T | Rodolfo Biagi / Andrés Falgás | 1939–1940 | 1 | 5.8 mo | 2 sides share a date | 7 BPM (4/4) | 8 | tight |

### Engine seed 108

Tight **8** · acceptable **7** · loose **8** of 23 · median spread 2 y · mean 1.7 y · spread ≤ 2 in 17/23 · single-year tandas 4

| # | R | Family | Years | Spread | Date span | Sessions | Tempo (folded BPM range, sides measured) | Energy range | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 0 | T | Enrique Rodríguez / Armando Moreno | 1940–1943 | 3 | 36.2 mo | all different dates | n/a (1/4) | 4 | loose — spread 3 > 2 |
| 1 | T | Francisco Canaro / Roberto Maida | 1936–1938 | 2 | 29.4 mo | all different dates | 6 BPM (3/4) | 4 | acceptable |
| 2 | V | Francisco Lomuto / Fernando Díaz | 1939–1942 | 3 | 35.8 mo | all different dates | n/a (0/3) | 5 | loose — spread 3 > 2 |
| 3 | T | Juan D'Arienzo (instr) | 1936–1939 | 3 | 46.7 mo | all different dates | 5 BPM (2/4) | 6 | loose — crosses Biagi's exit from D'Arienzo (~Jul 1938) |
| 4 | T | Aníbal Troilo / Francisco Fiorentino | 1941–1943 | 2 | 30.7 mo | all different dates | 6 BPM (2/4) | 6 | acceptable |
| 5 | M | Edgardo Donato / Horacio Lagos | 1938–1940 | 2 | 26.8 mo | all different dates | n/a (0/3) | 8 | acceptable |
| 6 | T | Miguel Caló (instr) | 1943–1944 | 1 | 19.1 mo | all different dates | 5 BPM (2/4) | 12 | acceptable |
| 7 | T | Carlos Di Sarli / Roberto Rufino | 1940–1941 | 1 | 8.9 mo | all different dates | 0 BPM (4/4) | 12 | tight |
| 8 | V | Rodolfo Biagi / Teófilo Ibáñez | 1938–1938 | 0 | 1.5 mo | all different dates | 0 BPM (3/3) | 12 | tight |
| 9 | T | Juan D'Arienzo / Héctor Mauré | 1941–1942 | 1 | 19.8 mo | all different dates | 7 BPM (2/4) | 9 | acceptable |
| 10 | T | Pedro Láurenz / Alberto Podestá | 1943–1943 | 0 | 4.1 mo | 2 sides share a date | 5 BPM (4/4) | 5 | tight |
| 11 | M | Aníbal Troilo / Francisco Fiorentino | 1941–1942 | 1 | 10.6 mo | all different dates | n/a (1/3) | 6 | tight |
| 12 | T | Ricardo Malerba / Orlando Medina | 1942–1943 | 1 | 4.3 mo | 2 sides share a date | 5 BPM (4/4) | 7 | tight |
| 13 | T | Ángel D'Agostino / Angel Vargas | 1945–1945 | 0 | 3.6 mo | 2 sides share a date | n/a (0/4) | 8 | tight |
| 14 | V | Enrique Rodríguez / Armando Moreno | 1941–1944 | 3 | 33.9 mo | all different dates | n/a (0/3) | 6 | loose — spread 3 > 2 |
| 15 | T | Ricardo Tanturi / Alberto Castillo | 1941–1942 | 1 | 21.5 mo | all different dates | 8 BPM (4/4) | 10 | acceptable |
| 16 | T | Edgardo Donato (instr) | 1936–1940 | 4 | 47.4 mo | all different dates | n/a (0/4) | 3 | loose — spread 4 > 3 |
| 17 | M | Pedro Láurenz / Juan Carlos Casas | 1938–1940 | 2 | 26.6 mo | all different dates | n/a (1/3) | 13 | loose — recording gap 1938-05-12→1940-01-25 |
| 18 | T | Juan D'Arienzo (instr) | 1937–1939 | 2 | 20.6 mo | all different dates | n/a (0/4) | 4 | loose — crosses Biagi's exit from D'Arienzo (~Jul 1938) |
| 19 | T | Osvaldo Pugliese / Alberto Morán | 1945–1945 | 0 | 10.8 mo | all different dates | n/a (1/4) | 20 | tight |
| 20 | V | Miguel Caló / Raúl Iriarte | 1943–1945 | 2 | 20.6 mo | all different dates | n/a (1/3) | 1 | acceptable |
| 21 | T | Lucio Demare / Juan Carlos Miranda | 1938–1942 | 4 | 53.0 mo | all different dates | 6 BPM (2/4) | 6 | loose — spread 4 > 2; recording gap 1938-07-12→1941-10-08 |
| 22 | T | Rodolfo Biagi / Andrés Falgás | 1939–1940 | 1 | 7.0 mo | all different dates | 4 BPM (4/4) | 9 | tight |

### Engine seed 193

Tight **8** · acceptable **10** · loose **5** of 23 · median spread 2 y · mean 1.61 y · spread ≤ 2 in 18/23 · single-year tandas 3

| # | R | Family | Years | Spread | Date span | Sessions | Tempo (folded BPM range, sides measured) | Energy range | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 0 | T | Francisco Canaro / Roberto Maida | 1936–1938 | 2 | 25.3 mo | all different dates | 6 BPM (4/4) | 10 | acceptable |
| 1 | T | Francisco Lomuto / Jorge Omar | 1935–1938 | 3 | 39.6 mo | all different dates | 1 BPM (3/4) | 7 | loose — spread 3 > 2 |
| 2 | V | Orquesta Típica Víctor / Carmen del Moral | 1940–1940 | 0 | 3.2 mo | all different dates | n/a (0/3) | 7 | tight |
| 3 | T | Juan D'Arienzo (instr) | 1936–1937 | 1 | 21.0 mo | all different dates | 5 BPM (2/4) | 11 | acceptable |
| 4 | T | Pedro Láurenz / Alberto Podestá | 1943–1943 | 0 | 4.1 mo | 2 sides share a date | 5 BPM (4/4) | 5 | tight |
| 5 | M | Edgardo Donato / Horacio Lagos | 1938–1940 | 2 | 26.8 mo | all different dates | n/a (0/3) | 8 | acceptable |
| 6 | T | Miguel Caló (instr) | 1943–1944 | 1 | 19.1 mo | all different dates | 5 BPM (2/4) | 12 | acceptable |
| 7 | T | Ricardo Tanturi / Alberto Castillo | 1941–1942 | 1 | 15.0 mo | all different dates | 8 BPM (4/4) | 7 | tight |
| 8 | V | Rodolfo Biagi / Teófilo Ibáñez | 1938–1938 | 0 | 1.5 mo | all different dates | 0 BPM (3/3) | 12 | tight |
| 9 | T | Juan D'Arienzo / Alberto Echagüe | 1938–1939 | 1 | 13.6 mo | all different dates | n/a (1/4) | 3 | tight |
| 10 | T | Enrique Rodríguez / Armando Moreno | 1940–1943 | 3 | 38.9 mo | all different dates | n/a (1/4) | 8 | loose — spread 3 > 2 |
| 11 | M | Pedro Láurenz / Juan Carlos Casas | 1938–1940 | 2 | 26.6 mo | all different dates | n/a (1/3) | 13 | loose — recording gap 1938-05-12→1940-01-25 |
| 12 | T | Ricardo Malerba / Orlando Medina | 1942–1943 | 1 | 4.3 mo | 2 sides share a date | 5 BPM (4/4) | 7 | tight |
| 13 | T | Carlos Di Sarli (instr) | 1940–1943 | 3 | 40.1 mo | all different dates | 0 BPM (3/4) | 10 | acceptable |
| 14 | V | Miguel Caló / Raúl Iriarte | 1943–1945 | 2 | 20.6 mo | all different dates | n/a (1/3) | 1 | acceptable |
| 15 | T | Aníbal Troilo / Alberto Marino | 1943–1945 | 2 | 26.2 mo | all different dates | n/a (1/4) | 1 | acceptable |
| 16 | T | Ángel D'Agostino / Angel Vargas | 1941–1944 | 3 | 31.5 mo | all different dates | n/a (0/4) | 6 | loose — spread 3 > 2 |
| 17 | M | Ricardo Tanturi / Alberto Castillo | 1941–1942 | 1 | 15.2 mo | all different dates | 4 BPM (3/3) | 6 | tight |
| 18 | T | Juan D'Arienzo (instr) | 1940–1942 | 2 | 26.4 mo | all different dates | 5 BPM (2/4) | 2 | acceptable |
| 19 | T | Osvaldo Pugliese (instr) | 1944–1945 | 1 | 18.6 mo | all different dates | n/a (1/4) | 2 | acceptable |
| 20 | V | Carlos Di Sarli / Roberto Rufino | 1940–1943 | 3 | 36.6 mo | all different dates | n/a (1/3) | 7 | loose — spread 3 > 2 |
| 21 | T | Lucio Demare / Horacio Quintana | 1944–1945 | 1 | 7.9 mo | all different dates | n/a (1/4) | 6 | tight |
| 22 | T | Rodolfo Biagi / Alberto Amor | 1943–1945 | 2 | 27.5 mo | all different dates | 4 BPM (2/4) | 6 | acceptable |

### Engine seed 250

Tight **9** · acceptable **8** · loose **5** of 22 · median spread 1.5 y · mean 1.68 y · spread ≤ 2 in 18/22 · single-year tandas 2

| # | R | Family | Years | Spread | Date span | Sessions | Tempo (folded BPM range, sides measured) | Energy range | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| 0 | T | Enrique Rodríguez / Armando Moreno | 1941–1943 | 2 | 19.5 mo | all different dates | n/a (0/4) | 2 | acceptable |
| 1 | T | Carlos Di Sarli / Roberto Rufino | 1939–1943 | 4 | 45.9 mo | all different dates | 4 BPM (4/4) | 7 | loose — spread 4 > 2 |
| 2 | V | Francisco Canaro / Roberto Maida | 1937–1938 | 1 | 19.6 mo | all different dates | 7 BPM (2/3) | 5 | acceptable |
| 3 | T | Juan D'Arienzo (instr) | 1936–1939 | 3 | 40.6 mo | all different dates | n/a (0/4) | 6 | loose — crosses Biagi's exit from D'Arienzo (~Jul 1938) |
| 4 | T | Rodolfo Biagi / Andrés Falgás | 1939–1940 | 1 | 5.8 mo | 2 sides share a date | 7 BPM (4/4) | 8 | tight |
| 5 | M | Miguel Caló / Raúl Berón | 1942–1942 | 0 | – mo | all different dates | n/a (1/3) | 10 | tight |
| 6 | T | Edgardo Donato (instr) | 1936–1940 | 4 | 47.4 mo | all different dates | n/a (0/4) | 3 | loose — spread 4 > 3 |
| 7 | T | Pedro Láurenz / Juan Carlos Casas | 1938–1940 | 2 | 21.4 mo | 2 sides share a date | 0 BPM (3/4) | 9 | loose — recording gap 1938-05-12→1940-01-25 |
| 8 | V | Aníbal Troilo / Francisco Fiorentino | 1942–1944 | 2 | 20.3 mo | all different dates | n/a (0/3) | 12 | acceptable |
| 9 | T | Juan D'Arienzo / Alberto Echagüe | 1938–1939 | 1 | 13.6 mo | all different dates | n/a (1/4) | 3 | tight |
| 10 | T | Ricardo Malerba / Orlando Medina | 1942–1943 | 1 | 13.1 mo | 2 sides share a date | 5 BPM (4/4) | 4 | tight |
| 11 | M | Ricardo Tanturi / Alberto Castillo | 1941–1942 | 1 | 15.2 mo | all different dates | 4 BPM (3/3) | 6 | tight |
| 12 | T | Orquesta Típica Víctor (instr) | 1937–1937 | 0 | 8.3 mo | all different dates | n/a (0/4) | 5 | tight |
| 13 | T | Francisco Lomuto / Jorge Omar | 1936–1938 | 2 | 22.7 mo | all different dates | 3 BPM (3/4) | 6 | acceptable |
| 14 | V | Enrique Rodríguez / Armando Moreno | 1940–1942 | 2 | 18.9 mo | all different dates | n/a (0/3) | 3 | acceptable |
| 15 | T | Aníbal Troilo / Francisco Fiorentino | 1941–1943 | 2 | 23.7 mo | all different dates | n/a (1/4) | 4 | acceptable |
| 16 | T | Miguel Caló (instr) | 1943–1944 | 1 | 19.1 mo | all different dates | 5 BPM (2/4) | 12 | acceptable |
| 17 | M | Francisco Canaro / Roberto Maida | 1935–1936 | 1 | 15.9 mo | all different dates | 0 BPM (3/3) | 12 | tight |
| 18 | T | Juan D'Arienzo (instr) | 1936–1938 | 2 | 27.2 mo | all different dates | 0 BPM (2/4) | 17 | acceptable |
| 19 | T | Osvaldo Pugliese (instr) | 1944–1945 | 1 | 17.4 mo | all different dates | n/a (1/4) | 2 | tight |
| 20 | V | Carlos Di Sarli / Roberto Rufino | 1940–1943 | 3 | 36.6 mo | all different dates | n/a (1/3) | 7 | loose — spread 3 > 2 |
| 21 | T | Ricardo Tanturi / Alberto Castillo | 1941–1942 | 1 | 17.6 mo | all different dates | 6 BPM (4/4) | 10 | tight |
## 2. Rules to code, each with a vitest invariant

Per `docs/TDD.md`, write the invariant first. Then confirm that the default 4 h golden set still scores ≥ 85 on the benchmark: seeds 3, 42 and 250 already meet the new limits in 19 of 22 tandas, so this is a selection change, not a pool change. Thresholds are calendar years (`year_max − year_min`) unless stated. "Date span" means months between the earliest and latest full `date`.

| # | Rule | Threshold | Why | Invariant (vitest) |
|---|---|---|---|---|
| R1 | **Hard spread cap by tanda type.** Replace the single `maxYearSpread: 4` with `{ vocalTango: 2, instrumentalTango: 3, milonga: 2, vals: 2 }`. | vocal tango ≤ 2, instrumental tango ≤ 3, milonga ≤ 2, vals ≤ 2 (3 only under R7) | Published A–D single-family tandas: vocal 80 % ≤ 2 and 100 % ≤ 4; instrumental 82 % ≤ 2. Every spread-3 vocal tango in the six nights is one a DJ would rebuild. Instrumentals get one more year because instrumental pools are thinner and the orchestra's sound, not a voice, carries the tanda. | `every tanda over seeds 1..50 (golden 4 h) has spread ≤ cap(rhythm, vocal)`; the R7 exception is allowed only when the tanda carries `note: "pool-small"`. |
| R2 | **Soft target: one year.** Score a spread of 0–1 (or a date span ≤ 18 months) as perfect. Spread 2 costs a little. Spread 3 and above costs a lot (curve in section 4). This is the user's "same year". | target ≤ 1 y / ≤ 18 months | Published median is 1 y (A–D). 60 % of single-family published tandas are ≤ 1 y and 30 % are a single year. "Same calendar year" alone is too strict: Dec 1938 + Jan 1939 is one session period. | `median tanda spread ≤ 1 over seeds 1..50` and `share of tandas with spread ≤ 1 ≥ 0.6`. |
| R3 | **Never cross a break.** A tanda never contains sides on both sides of: (a) a `singerStints` boundary in `orchestra_profiles.json` (Echagüe 1938–39 vs 1944–57; Podestá with Di Sarli 1942–44 vs 1947–48; Berón with Caló 1941–43 vs 1945–46; Ortiz with Biagi 1940–43 vs 1946–48; Ray with Fresedo 1933–39 vs 1948–50); (b) a recording gap ≥ 18 months in that orchestra-and-singer's dated sides, computed from `songs.json` (this catches Troilo instrumentals 1938 vs 1941, Láurenz / Casas 1938 vs 1940, Demare / Miranda 1938 vs 1941); (c) a curated line-up break. Add a `lineupBreaks` field to the profiles, starting with D'Arienzo instrumentals at `1938-07` (Biagi leaves; to be checked against a discography before encoding) and `1940-01`. | gap ≥ 18 months; listed breaks | This is what "never mix a singer's early and late stints" means in practice, extended to the band. A dancer hears Biagi-era and Polito-era D'Arienzo as two orchestras even when the years are only 3 apart. | `families()` never returns a candidate whose date range contains a break; a fixture with Troilo 1938-07 plus 1941-03 sides yields two candidates, never one. |
| R4 | **Anchor the window on the densest year, not the earliest side.** In `families()`, replace the greedy earliest-first bucketing with sliding windows: for each dated side as anchor, take the sides in `[anchor, anchor + cap]`. Keep windows that can fill the tanda and rank them by Σ(fame + 1) over resolvable sides, then by count. Within a window, choose the k sides with the smallest date span among equal-quality sets. | — | The current bucketing produces "Di Sarli / Rufino 1939–43" (30 sides, spread 4) and lets the picker take one hit per year. Di Sarli / Rufino has 13 dated tangos in 1943 and 7 in 1941; Rodríguez / Moreno has 13 in 1942. | Fixture family with 1 side in 1939, 4 in 1940, 7 in 1941 and 13 in 1943: the best candidate's years are within [1943, 1943 + cap] and the tanda drawn from it has spread ≤ 1. |
| R5 | **Session tie-break.** Between two sets of equal score, prefer the one with the smaller date span, and prefer sides that share a recording date. | — | Same-day sides share balance, microphone and band. Malerba / Medina (2 sides on 1943-02-12) is the tightest-sounding tanda in the featured night. | Fixture with two equal-fame 4-sets, one spanning 4 months and one 20 months: the 4-month set is chosen. |
| R6 | **Tempo drift cap, only on trustworthy data.** When ≥ 3 sides have `audio.bpm` with `pulseClarity ≥ 0.7`, fold each reading (×½, ⅔, ¾, ⅘, 5⁄4, 4⁄3, 3⁄2, 2 and `bpmCandidates`) into the profile's `bpm[rhythm]` range, then require max − min ≤ `BPM_DELTA_MAX` (tango 8, vals 12, milonga 7). Otherwise apply no constraint, and never reject a tanda on unfolded raw BPM. | 8 / 12 / 7 BPM | Inside one session the band's tempo hardly moves; a large folded drift means a wrong match or a reissue. Raw values are mostly octave errors (92 vs 129). | Fixture tanda with folded readings 126, 128, 140 (tango) is rejected; one with raw 92, 129, 129 (an octave error) is accepted. |
| R7 | **Small pools.** If no window within the cap can fill the tanda from the family's eligible, unrepeated sides, then in order: (1) for vals only, allow cap + 1 inside one stint and mark `note: "pool-small"`; (2) otherwise pick another family of the same style and role (for a rhythmic warmup slot, Donato → Biagi or D'Arienzo instrumentals); (3) never pad with undated, `yearApprox` or transcription rows, and never cross a break (R3). A family qualifies for a tanda only if it has ≥ k sides in some capped window, and is preferred with ≥ k + 2 (room to vary across seeds). | k sides in one window; prefer k + 2 | Donato instrumentals (9 dated sides in the index) and Di Sarli / Rufino valses (4 sides) are the two pools that fail in these nights. The published corpus widens valses for the same reason: corpus vals median is 2 y and only 52 % of vocal valses are ≤ 2 y. | Fixture with a 4-side Di Sarli / Rufino vals pool (1940, 1940, 1941, 1943): the drawn vals is 1940–41. Fixture with a 3-side pool over 5 years: the family is not chosen and another vals family is. |
| R8 | **Milonga and vals: one year when possible.** Milonga uses cap 2 with target 1. Vals uses cap 2 with target 1, but goes through R7 before relaxing. | milonga ≤ 1 preferred (31-set corpus, vocal milonga: 65 % ≤ 1, 88 % ≤ 2) | Milongas are cut in bursts (Tanturi / Castillo 1941–42, Láurenz / Podestá 1943–44), so one year is usually available. Valses are scarce, so do not force one year at the price of a fame-0 side. | `median milonga spread ≤ 1` over seeds 1..50. |
| R9 | **Repeat families take different windows.** When an orchestra and singer appear twice in a night (D'Arienzo instrumentals twice in every night here), the second tanda's window must not overlap the first: for example 1936 Biagi-era and then 1937 or 1939. | no year shared between the two tandas | A DJ plays a second D'Arienzo instrumental tanda to bring a different colour, not more of the same years. The featured night's tandas 3 and 18 both run 1936–39. | `for any two tandas of the same orchestraId + singerId, their year sets are disjoint`. |
| R10 | **Fix the score loophole.** `score.ts` currently allows 6 years for 3-side tandas. Valses and milongas must be at least as tight as tangos. | — | Right now a 1938–44 vals scores `era 1.00`. | Unit test on `score()`: a 3-side vals spanning 4 years gets `era < 1`. |

## 3. Tighter sides for every loose tanda in the featured night

Every side below is a dated studio row in `data/index/songs.json` for that exact orchestra, singer and rhythm. None repeats a title used elsewhere in the night. Fame is from `reference_sets.json` (famousRecordings) where listed. "Stream" shows the cached match: **D** = Deezer match in `data/cache/resolve/tracks.json`, **S** = Spotify cache only, **–** = none cached yet (resolve before shipping; a fallback is given).

| # | Family (now) | Tighter set (title, recording date) | Spread / span | Notes |
|---|---|---|---|---|
| 1 | Di Sarli / Rufino T, 1939–42 | Cosas Olvidadas (1940-06-19) · Volver a Soñar (1940-10-08) · Lo Pasado, Pasó (1940-11-23) · En un Beso la Vida (1940-09-23) | **0 y / 5 mo** | Keeps two of the current hits and swaps Corazón (1939) and Necesito Olvidar (1942) for Cosas Olvidadas (fame 5) and Volver a Soñar. All D. Raw BPM readings 129–144 (4/4 measured), the same as today. Alternative 1941 set: Charlemos · Cascabelito · Patotero Sentimental · Griseta (Feb–Jun 1941, three sides from the same June sessions). |
| 3 | D'Arienzo instr, 1936–39 | El Flete (1936-04-03) · La Payanca (1936-06-09) · Rawson (1936-09-03) · Ataniche (1936-11-27) | **0 y / 8 mo** | All Biagi-era, three fame-5 sides, all D. Trago Amargo (1939) leaves this tanda. Jueves moves to tanda 18. |
| 4 | Troilo instr, 1938–41 | Cachirulo (1941-03-04) · Milongueando en el Cuarenta (1941-06-17) · Guapeando (1941-07-11) · Cordón de Oro (1941-07-18) | **0 y / 4.5 mo** | Drops Comme il faut (Odeon 1938, before a 32-month gap). El Tamango (1941-10-23, fame 5, D) can replace any of them. |
| 6 | Rodríguez / Moreno T, 1940–43 | Un Tropezón (1942-03-31) · El Encopao (1942-10-22) · Como Has Cambiado, Pebeta! (1942-11-19) · Mírame de Frente (1942-12-03) | **0 y / 8 mo** | 1942 is Moreno's densest year (13 sides). Two fame-5 sides, all D. El Huérfano (1942-01-20, fame 4) is a spare. |
| 10 | Donato instr, 1936–40 | El Chamuyo (1938-10-10) · Pasión Criolla (1939-08-02) · El Distinguido Ciudadano (1940-07-18) · El Lengue (1940-12-13) | 2 y / 26 mo (acceptable) | **Small pool (R7):** only 9 dated Donato instrumentals are indexed. The tightest 4-set is El Estagiario (1938-02-05, S) · Tiempos Bravos (1938-07-06, –) · El Chamuyo · Pasión Criolla (1938–39), but Tiempos Bravos has no stream. Better, under R7: put a different rhythmic instrumental family in this slot. Enriching the Donato pool in `data/sources` is the real fix. |
| 14 | Rodríguez / Moreno V, 1941–44 | Por Aquí... por Allá... (1940-06-04) · Isabelita (1940-08-13) · Con tu Mirar (1941-09-24) | **1 y / 15 mo** | Replaces two fame-0 1944 valses with fame-2 and fame-4 sides. All D. |
| 18 | D'Arienzo instr, 1936–39 | El Choclo (1937-07-28) · Jueves (1937-10-29) · El Cencerro (1937-12-08) · Gallo Ciego (1937-12-08) | **0 y / 4.5 mo**, two sides from one session | Gives the main peak a different window from tanda 3 (R9). All D. Post-Biagi alternative: Maipo · No Me lo Digas · Charamusca · Derecho Viejo (Apr–Jul 1939, all D). |
| 19 | D'Agostino / Vargas T, 1941–44 | Tres Esquinas (1941-07-24) · Adiós Arrabal (1941-09-09) · Agua Florida (1941-11-13) · El Yacaré (1941-12-12) | **0 y / 5 mo** | Three fame-5 sides, the canonical 1941 tanda. Stream coverage for this family is thin: only Tres Esquinas and El Yacaré (S) of the 1941 sides are cached. Run the resolver on the 1941 sides first. If Adiós Arrabal and Agua Florida do not resolve, keep Tres Esquinas · El Yacaré and add Pero Yo Sé (1942-09-02) · Ninguna (1942-12-30), which are not cached either: spread 1, 17 months. If nothing resolves, R7 says change family. |
| 20 | Di Sarli / Rufino V, 1940–43 | Alma Mía (1940-02-15) · Rosamel (1940-12-11) · Cortando Camino (1941-03-06) | **1 y / 13 mo** | **Small pool:** the family has only 4 valses. Cortando Camino has no cached stream. If it fails, R7 says change family (for example Caló / Iriarte below), not widen to 1943. |
| 21 | Biagi / Ortiz T, 1940–43 | Pájaro Ciego (1941-01-14) · Humillación (1941-03-15) · Zaraza (1941-03-26) · Ahora No Me Conocés (1941-09-26) | **0 y / 8 mo** | Drops Señor, Señor (1943, fame 0), the last side of the night before the Cumparsita. All D. Raw BPM readings 129–136 (4/4 measured). |

Optional tightening of the acceptable tandas:
- **Tanda 2, Caló / Iriarte vals** → Me Duele el Corazón (1944-11-07) · No Te Olvides de mi Corazón (1945-07-05) · El Mismo Dolor (1945-11-15, fame 5, S). Spread 1.
- **Tanda 16, Pugliese** → Recuerdo (1944-03-31, fame 5) · El Remate · Tierra Querida · El Arranque (all 1944). Spread 0, but La Yumba (1946) is lost. It is also outside the night's 1935–45 range, so this is the purist's choice.
- **Tanda 0, Canaro / Maida** → Ciego · Ojos Negros que Fascinan · Poema · La Copla Porteña (all 1935, D). This costs Nada Más, so keep the current tanda unless the user insists on one year.

With these sides the featured night would have 0 loose tandas, median spread 0–1, and 21/22 tandas ≤ 2 y (Donato excepted). The proposed era factor (section 4) would go from 0.71 to about 0.97.

## 4. How `era` should grade spread, and a "tanda year spread" benchmark check

### 4.1 The `era` factor curve (`score.ts`)

Grade each tanda, then average the grades; the weight stays 6. Use the **effective spread** = `spread − max(0, minAchievable − 1)`, where `minAchievable` is the smallest spread any k eligible sides of that family reach inside the night's year range. This keeps a small pool (Donato instrumentals, Di Sarli / Rufino valses) from being punished for what the index cannot supply. A date span ≤ 12 months always grades 1.0.

| Effective spread (years) | 0–1 | 2 | 3 | 4 | ≥ 5 |
|---|---|---|---|---|---|
| Vocal tango | 1.00 | 0.85 | 0.50 | 0.20 | 0 |
| Instrumental tango | 1.00 | 0.90 | 0.70 | 0.35 | 0 |
| Vals / milonga | 1.00 | 0.80 | 0.45 | 0.10 | 0 |
| Any tanda crossing a break (R3) | capped at 0.30 | | | | |

The curve is flat to 1 year (the user's "same year", plus the Dec→Jan case), gentle at 2 (still inside 80 % of published vocal tandas), steep at 3 (the point where a DJ hears two periods), and near zero at 4. Detail string: `"<n> over target, <m> crossing a break"`.

Applied to the six nights (pool-aware): **featured 0.71**, seed 3 0.92, seed 42 0.82, seed 108 0.75, seed 193 0.83, seed 250 0.81. Today all six read 1.00. The cost to the total is at most about 6 × 0.29 / 114 ≈ 1.5 points, so the ≥ 85 golden-set gate is not at risk. The featured night with the section 3 sides would read about 0.97.

### 4.2 Benchmark check "tanda year spread" (`benchmark.ts` + `data/knowledge/benchmark.json`)

What published DJs do (`docs/reviews/benchmark-reference-sets.md`, tables A–G, single orchestra and single singer or instrumental; mixed tandas excluded; G lists one year per tanda and is left out):

| Sample | n | Median | ≤ 1 y | ≤ 2 y | ≤ 4 y | Max |
|---|---|---|---|---|---|---|
| Classic golden nights A–D (Rauscher ×2, two UK milongas) | 57 | **1** | 60 % | **81 %** | 96 % | 6 (Di Sarli instr 1940–46) |
| — vocal | 46 | 1 | 61 % | 80 % | 100 % | 4 |
| — instrumental | 11 | 1 | 55 % | 82 % | 82 % | 6 |
| — vals + milonga | 12 | 1.5 | 50 % | 92 % | 100 % | 3 |
| A–F incl. the themed Pruss nights E, F | 87 | 1 | 54 % | 75 % | 86 % | 23 |
| 31-set corpus `reference_sets.json` (golden, single-family) | 391 | 2 | 41 % | 67 % | 86 % | — |

Examples of what tight looks like in those sets: Caló / Berón 1942, Láurenz / Podestá 1943, D'Arienzo / Echagüe 1938, Troilo instr 1941, D'Agostino / Vargas 1941, Canaro / Maida 1935, Tanturi / Castillo 1941. Those are the same families as tandas 12, 7, 9, 4, 19, 0 and 15 of the featured night. The featured night spreads Troilo and D'Agostino over 3 years and Canaro / Maida over 2. Demirbaş (2018) records the Turkish DJs' rule as "same orchestra; close recording dates".

Proposed check:

```json
"yearSpread": {
  "label": "Tanda year spread",
  "okMedian": 1.5, "okShareLe2": 0.75, "max": 4,
  "nearMedian": 2, "nearShareLe2": 0.6,
  "weight": 2,
  "source": "benchmark-reference-sets.md A–D single-family tandas: median 1 y, 81 % ≤ 2 y, 96 % ≤ 4 y (n = 57); 31-set corpus median 2 y, 67 % ≤ 2 y"
}
```

- **value:** `median <m> y · <p> % ≤ 2 y · max <x> y`, over dance tandas with ≥ 2 dated sides (the Cumparsita closing is excluded).
- **ok:** median ≤ 1.5 and ≤ 2 y share ≥ 75 % and no tanda > 4 y.
- **near:** median ≤ 2 and share ≥ 60 %.
- **off:** anything else.
- The range sits between the strict classic sets (median 1, 81 %) and the wider corpus (median 2, 67 %). The engine should beat the corpus and match the classic nights.

Results today: **featured off** (median 2, 55 %); seeds 3, 42 and 250 **ok**; seeds 108 and 193 **near** (median 2, 74 % and 78 %). Invariant: `benchmarkNight(compose(golden 4 h, seed)).checks.yearSpread.status !== "off"` for seeds 1..20, and the featured JSON reaches `ok` once the section 3 sides are in.

Weight 2 matches `darienzo` and `spacing3`. The featured night currently loses about 2/Σ weights of its benchmark score on this check. The section 3 edits recover it, so the featured spec should be regenerated together with the rule change, not after it.
