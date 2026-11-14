# Round 21 — the featured night: only the DJ's edits

`apps/web/public/featured/golden-double-peak.json` (copy: `docs/specs/round21-best-night.json`) is the night already in the DJ's Spotify. It was **not recomposed** and no fixer ran over it: `scripts/round21_featured.ts` starts from the shipped round-19 file and applies only the DJ's edits, the follow-ups they force, the stream ids the round-21 stream-date rule rejects, the cortinas around the changed tandas, and a re-time / re-score. The round-21 rules for future nights (tone per tanda, BPM / level bands, the big four) are reported here, not retrofitted.

- Engine score 91 → 73 (the DJ's tandas are exceptions to the era, singer and year rules the score reads: 1932–38 Típica Víctor, Farabute 1949, De Angelis 1946–47, mixed singers and orchestras); 4.18 h (+11 min: the opening Cumparsita and the longer DJ tandas — no cortina was shortened to hide it)
- Strict panel: **0 blockers · 8 should-fix** (opener, peakHits, hotSlot, rhythmicRun, sideOrder, tandaTone, bigFour); 47 items are DJ exceptions (rules a pinned tanda breaks, or makes a neighbour break), reported, never fixed
- Spotify: 85/85 sides, the opening and the closer carry a judged Spotify id; 22/22 cortinas

## What changed (old → new, per slot)

| Slot | Shipped | Now | Why |
|---|---|---|---|
| Opening | none | La Cumparsita · Ángel D'Agostino / Tino García 1952 | the DJ: open with La Cumparsita matching the first tanda (opening: no Ángel D'Agostino La Cumparsita near 1941; its 1952 version (Tino García) opens) |
| T2 | tango · Carlos Di Sarli / Roberto Rufino · Corazón 1939, Cosas Olvidadas 1940, Lo Pasado, Pasó 1940, En un Beso la Vida 1940 | tango · Carlos Di Sarli / Roberto Rufino · Shusheta 1940, Catamarca 1940, Lo Pasado, Pasó 1940, Corazón 1939 | DJ edit: the DJ's Di Sarli tanda (Shusheta, Catamarca instr. 1940; Lo Pasado Pasó, Corazón with Rufino) — pinned |
| T4 | tango · Juan D'Arienzo instr. · Ataniche 1936, El Cachafaz 1937, El Cencerro 1937, Jueves 1937 | tango · Orquesta Típica Víctor / Angel Vargas · Charlo · Alberto Gómez · Adios Buenos Aires 1938, Llámale "h" 1932, El Mortero del Globito 1933, Ventarrón 1933 | DJ edit: the DJ's Típica Víctor tanda (Vargas, Charlo, Gómez 1932–38) — pinned |
| T5 | tango · Pedro Láurenz / Juan Carlos Casas · De Puro Guapo 1940, Desconsuelo 1940, Como Dos Extraños 1940, No Me Extraña 1940 | tango · Pedro Láurenz / Juan Carlos Casas · Alberto Podestá · Martín Podestá · No Me Extraña 1940, Alma de Bohemio 1943, Garúa 1943, Al Verla Pasar 1942 | DJ edit: the DJ's Láurenz tanda (Casas 1940, A. Podestá 1943, M. Podestá 1942) — pinned |
| T7 | tango · Rodolfo Biagi / Andrés Falgás · La Chacarera 1940, Queja Indiana 1939, Griseta 1939, A Mí No Me Interesa 1940 | tango · Edgardo Donato / Horacio Lagos · Lita Morales - H. Lagos · Me Voy a Baraja 1938, Gato 1937, Mis Pesares 1940, Carnaval de mi Barrio 1939 | DJ edit: the DJ's Donato / Lagos tanda (Carnaval de mi Barrio is a vals with Lita Morales) — pinned |
| T8 | tango · Edgardo Donato instr. · El Chamuyo 1938, El Estagiario 1938, Pasión Criolla 1939, La Tablada 1936 | tango · Juan D'Arienzo / Alberto Echagüe · Ansiedad 1938, Farabute 1949, No Mientas 1938, La Bruja 1938 | DJ edit: the DJ's D'Arienzo / Echagüe tanda (Farabute is the 1949 side) — pinned |
| T9 | vals · Enrique Rodríguez / Roberto "Chato" Flores · Salud, Dinero y Amor 1939, Las Espigadoras 1938, Fru Fru 1939 | vals · Alfredo De Angelis / C. Dante - J. Martel · Soñar y Nada Más 1944, Pobre Flor (Primera Ilusión) 1946, Flores del Alma 1947 | DJ edit: the DJ's De Angelis / Dante–Martel valses (1944–47) — pinned |
| T15 | vals · Ricardo Tanturi / Alberto Castillo · Mi Romance 1941, Recuerdo 1941, La Serenata (Mi Amor) 1941 | vals · Juan D'Arienzo · Francisco Canaro instr. · Desde el Alma 1935, Francia 1935, Corazón de Oro 1938 | DJ edit: the DJ's valses (D'Arienzo 1935, Canaro 1938) — pinned |
| T10 | tango · Juan D'Arienzo / Alberto Echagüe · La Bruja 1938, Indiferencia 1938, Pensalo Bien 1938, No Mientas 1938 | tango · Ricardo Tanturi / Enrique Campos · Recién 1944, Malvón 1943, Que Vas Buscando Muñeca 1943, Una Emoción 1943 | forced: La Bruja and No Mientas now play in T8, and D'Arienzo / Echagüe would return 2 tandas after T8 |
| T11 | tango · Pedro Láurenz / Alberto Podestá · Garúa 1943, Recién 1943, Todo 1943, Que Nunca Me Falte 1943 | tango · Enrique Rodríguez / Armando Moreno · El Encopao 1942, Suerte Loca 1941, Llorar por una Mujer 1941, Que Lento Corre el Tren 1943 | forced: Garúa now plays in T5, and Láurenz would return 6 tandas after T5 with the same singer |

Spotify ids replaced (the same sides, the correct transfers; Garúa now plays in the DJ's T5):

- Tres Esquinas (Ángel D'Agostino 1941): spotify:track:5iAzpDLPcnczkrY0F0md5z (Laura) → spotify:track:5HftCmLhynna9guHF1xz8b (Ángel D'agostino y Su Orquesta Típica - Ángel Vargas 1940 - 1942 (Restauración 2022)) — an album dated 1939-01-09 before the 1941 side (Laura)
- Garúa (Pedro Láurenz 1943): spotify:track:7gE7FGQPi6t11Aw6LgDBxz (¡Ay, Mis Amores!) → spotify:track:5aHq3pPjczus4Fb23nscYq (Que Nunca Me Falte) — re-judged: the shipped id's album is dated before the side or decades after it (round-21 audit)
- El Sueño del Pibe (Osvaldo Pugliese 1945): spotify:track:09Pk2OFYpv2cimLJRdJw3K (Presentando a Osvaldo Pugliese) → spotify:track:1JMN9dOe86FDhFZK9Zaqwg (El Sueño Del Pibe) — re-judged: the shipped id's album is dated before the side or decades after it (round-21 audit)
- Guapeando (Aníbal Troilo 1941): spotify:track:4Gx6V2iAfhI0NutgHdgnBc (Guapeando) → spotify:track:2HnQzvySUeG1anORTnyTR5 (Yo Soy El Tango) — re-judged: the shipped id's album is dated before the side or decades after it (round-21 audit)
- Qué Te Importa que Te Llore (Miguel Caló 1942): spotify:track:4Kip4MXIcgDQymCQldHbSt (Geometría Del Arrabal) → spotify:track:5G3C9MEjMhWwRm2SqOqack (Tango Classics 225: Trasnochando) — re-judged: the shipped id's album is dated before the side or decades after it (round-21 audit)

Cortinas re-picked (the cue rules at those gaps, Spotify-ready): after T3: Hadi Bakalım — Sezen Aksu → Sen Ağlama — Sezen Aksu; after T7: Firuze — Sezen Aksu → Dudu — Tarkan. Every other cue is the shipped one; each of the 22 was re-judged by `cortinaMatchProblem` (0 rejected).

## The big four on this night

Before the follow-ups: Juan D'Arienzo then Aníbal Troilo. After: Juan D'Arienzo then Aníbal Troilo. Swaps made: none. The other big-four faults involve a pinned tanda (T14 Troilo → T15 the DJ's D'Arienzo valses → T16 Pugliese; D'Arienzo at 15 and again at 19) and are DJ exceptions. Every quartile holds a big-four tanda (T2, T6/T8, T12/T14/T15/T16, T19/T20). The one real pair, T19 D'Arienzo (summit) → T20 Troilo instr., could be split only by swapping T20 with T22 (Caló / Berón), which adds an after-summit drop (e86 → e58), two energy steps and a side-order item: more than the rule is worth on this night, so it is reported for the DJ to decide (the strict search found no swap that leaves the rest of the panel as it was).

## The night now

- 1. tango · Ángel D'Agostino / Angel Vargas · 1941–1941
- 2. tango · Carlos Di Sarli / Roberto Rufino · 1939–1940 · pinned
- 3. vals · Miguel Caló / Raúl Iriarte · 1943–1945
- 4. tango · Orquesta Típica Víctor / Angel Vargas · Charlo · Alberto Gómez · 1932–1938 · pinned
- 5. tango · Pedro Láurenz / Juan Carlos Casas · Alberto Podestá · Martín Podestá · 1940–1943 · pinned
- 6. milonga · Aníbal Troilo / Francisco Fiorentino · 1941–1942
- 7. tango · Edgardo Donato / Horacio Lagos · Lita Morales - H. Lagos · 1937–1940 · pinned
- 8. tango · Juan D'Arienzo / Alberto Echagüe · 1938–1949 · pinned
- 9. vals · Alfredo De Angelis / C. Dante - J. Martel · 1944–1947 · pinned
- 10. tango · Ricardo Tanturi / Enrique Campos · 1943–1944
- 11. tango · Enrique Rodríguez / Armando Moreno · 1941–1943
- 12. milonga · Carlos Di Sarli / Roberto Rufino · 1941–1941
- 13. tango · Rodolfo Biagi instr. · 1938–1939
- 14. tango · Aníbal Troilo / Francisco Fiorentino · 1941–1943
- 15. vals · Juan D'Arienzo · Francisco Canaro instr. · 1935–1938 · pinned
- 16. tango · Osvaldo Pugliese / Roberto Chanel · 1944–1945
- 17. tango · Ricardo Malerba / Orlando Medina · 1942–1943
- 18. milonga · Edgardo Donato / Horacio Lagos · 1938–1940
- 19. tango · Juan D'Arienzo instr. · 1935–1938
- 20. tango · Aníbal Troilo instr. · 1941–1941
- 21. vals · Rodolfo Biagi / Teófilo Ibáñez · 1938–1938
- 22. tango · Miguel Caló / Raúl Berón · 1942–1942
- 23. tango · Ricardo Tanturi / Alberto Castillo · 1941–1942

## Notes on the DJ's sides

- T5 "Alma de Bohemia" is the index's **Alma de Bohemio** (Láurenz / Alberto Podestá, 1943-07-15), not a new side. The DJ's T5 has three singers (Casas 1940, A. Podestá 1943, M. Podestá 1942): kept as asked, a DJ exception.
- T7 **Me Voy a Baraja** was not in the index: added to the repo database (`data/knowledge/added_songs.json`, Donato / Lagos, 1936–38 from the Spotify album "Embrujo gitano, Edgardo Donato (1936-1938)"; no dated transfer found). **Carnaval de mi Barrio** is a vals (Lita Morales & Horacio Lagos, 1939; the listado says vals and no source says otherwise): a vals inside the DJ's tango tanda.
- T8 **Farabute** with Echagüe: the index has D'Arienzo / Echagüe **1949-07-26** (no 1938–40 recording is known); the Spotify transfers are that side. Kept, a DJ exception (1938–49 in one tanda).
- T15 **Corazón de Oro**: no golden-era D'Arienzo recording exists; Canaro's instrumental, dated **1938-01-21** from its session-dated Spotify album (Colección Completa, Vol. 90), recorded in `data/knowledge/song_patches.json`.
- The opening: D'Agostino recorded no La Cumparsita with Vargas in the index; its only version is **1952 with Tino García** (fallback recorded: "opening: no Ángel D'Agostino La Cumparsita near 1941; its 1952 version (Tino García) opens"). Spotify also lists a D'Agostino / Vargas La Cumparsita (undated compilations) that the index does not hold; it was not added without a date.

## The tandas

Opening: La Cumparsita · Ángel D'Agostino / Tino García 1952 · Spotify `2uXfjU1NNEew4FP8z631pm`

### 1. tango · Ángel D'Agostino / Angel Vargas

e57 for target 54 (warmup)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Agua Florida | 1941-11-13 | 56 | 5 | – | `4u5p9iR9Ll8QjLkmogApFA` |
| 2 | Ahora No Me Conocés | 1941-09-09 | 55 | 4 | – | `5TCUJLhPkko2uFS6NQ4asD` |
| 3 | Adiós, Arrabal | 1941-09-09 | 56 | 5 | – | `1FJeCic5LuxtGiow8p0UtE` |
| 4 | Tres Esquinas | 1941-07-24 | 62 | 5 | – | `5HftCmLhynna9guHF1xz8b` |

Cortina: *Olmasa Mektubun* — Yeni Türkü (1986, e56) · Spotify `0ByK7TuuNIrsXQQ28tLwWs`

### 2. tango · Carlos Di Sarli / Roberto Rufino · pinned (the DJ)

e57 for target 56 (warmup)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Shusheta | 1940-10-08 | 62 | 5 | 136 · -6.0 | `6P1IFU7r7SE82aBTRXC1Kp` |
| 2 | Catamarca | 1940-02-09 | 57 | 3 | 135 · -15.1 | `1yLXL88GAhtGbuDVKNZ76M` |
| 3 | Lo Pasado, Pasó | 1940-11-23 | 55 | 5 | 132 · -12.7 | `4o8t6w0ePLYmvDc1Y49gvK` |
| 4 | Corazón | 1939-12-11 | 52 | 5 | 136 · -13.3 | `4eNq48vfT3aOhqr15n9czp` |

Cortina: *Tamirci Çırağı* — Cem Karaca (1975, e58) · Spotify `0xWB2vkNuXO9f31e9FsuJw`

### 3. vals · Miguel Caló / Raúl Iriarte

e62 for target 59 (warmup)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | No Te Olvides de mi Corazón | 1945-07-05 | 62 | 4 | – | `5NMdRdZrtouDfo9jyOSxpE` |
| 2 | Luna de Plata | 1943-10-19 | 63 | 2 | – | `6sBuozesIBXZLHk6uXPQ9W` |
| 3 | Me Duele el Corazón | 1944-11-07 | 62 | 4 | – | `1nAxF4Q5DKlAbSdNYyRkrj` |

Cortina: *Sen Ağlama* — Sezen Aksu (1984, e50) · Spotify `5n4E0A8AX068w0JHMF7lnb`

### 4. tango · Orquesta Típica Víctor / Angel Vargas · Charlo · Alberto Gómez · pinned (the DJ)

e51 for target 72 (warmup)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Adios Buenos Aires | 1938-02-02 | 53 | 3 | 125 · -12.4 | `00bY480GTU3COXq74PiRMW` |
| 2 | Llámale "h" | 1932-03-15 | 48 | 0 | – | `2smlQBDnIyNAaERfUDx6XI` |
| 3 | El Mortero del Globito | 1933 | 50 | 3 | – | `641VKdnSbtXIYgT3VmjOcM` |
| 4 | Ventarrón | 1933-03-13 | 54 | 4 | – | `0EObZMooSWdnIMnxejKSkd` |

Cortina: *Yaz Gazeteci Yaz* — Selda Bağcan (1976, e60) · Spotify `487bR1LRKlAeOMPlN25aGn`

### 5. tango · Pedro Láurenz / Juan Carlos Casas · Alberto Podestá · Martín Podestá · pinned (the DJ)

e67 for target 72 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | No Me Extraña | 1940-01-25 | 73 | 5 | 131 · -10.3 | `57hywJ8ggcaOkiY1VxLQW9` |
| 2 | Alma de Bohemio | 1943-07-15 | 61 | 3 | 122 · -13.1 | `5amlJJbeQv76r9LJUvPXhv` |
| 3 | Garúa | 1943-08-06 | 67 | 4 | 121 · -12.7 | `5aHq3pPjczus4Fb23nscYq` |
| 4 | Al Verla Pasar | 1942-01-07 | 66 | 3 | 122 · -11.3 | `3GJMZRSa1ZPV345OAB4OkG` |

Cortina: *Ele Güne Karşı* — MFÖ (1984, e68) · Spotify `3Sy3MuMeVhCd2QwDwy0W6Q`

### 6. milonga · Aníbal Troilo / Francisco Fiorentino

e77 for target 68 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Ficha de Oro | 1942-10-09 | 78 | 3 | – | `7yfb12dnHI0ZBNWdZqFfVN` |
| 2 | Papá Baltasar | 1942-04-16 | 74 | 3 | – | `2AcoGIZmRg9xBaAiJ0BZYG` |
| 3 | Del Tiempo Guapo | 1941-11-21 | 80 | 3 | – | `4dXWbmXQpz729CFbOGeXRP` |

Cortina: *Ben Sana Vurgunum* — Nükhet Duru (1978, e66) · Spotify `14GcLsc9WELDLqxXQSiGkE`

### 7. tango · Edgardo Donato / Horacio Lagos · Lita Morales - H. Lagos · pinned (the DJ)

e63 for target 68 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Me Voy a Baraja | 1938 | 60 | 5 | – | `2QZpPxn9EFwP99kmsazNT7` |
| 2 | Gato | 1937-02-12 | 63 | 3 | -13.5 | `76wJPINLHDWK1Ikp1VBwL3` |
| 3 | Mis Pesares | 1940-02-18 | 64 | 3 | 134 · -15.8 | `1Hh8pfgNv9D1lTRNylcxgM` |
| 4 | Carnaval de mi Barrio | 1939-03-23 | 66 | 5 | 137 · -12.9 | `551uLjhI3qGCLgfwmO0pkb` |

Cortina: *Dudu* — Tarkan (2003, e80) · Spotify `15xj7p5uDk9sDnNbQtgZ8Y`

### 8. tango · Juan D'Arienzo / Alberto Echagüe · pinned (the DJ)

e80 for target 74 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Ansiedad | 1938-11-09 | 72 | 5 | 136 · -13.5 | `2EEwwiovGsqrVNnEnuz3vV` |
| 2 | Farabute | 1949-07-26 | 81 | 0 | – | `6vaalViDC5omj1WXdxACkh` |
| 3 | No Mientas | 1938-12-28 | 82 | 5 | 139 · -9.2 | `0TzsOz61O3KdFaAoOHAjNm` |
| 4 | La Bruja | 1938-08-26 | 84 | 5 | – | `5PIBWcpY6rgEeDDBVZVLDZ` |

Cortina: *Cemalim* — Erkin Koray (1974, e64) · Spotify `3lknNPO6RMGM9FMdkEHtBC`

### 9. vals · Alfredo De Angelis / C. Dante - J. Martel · pinned (the DJ)

e74 for target 76 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Soñar y Nada Más | 1944-08-29 | 77 | 5 | 137 · -10.6 | `0qkpq05eeIl0TQ4qQbO5qm` |
| 2 | Pobre Flor (Primera Ilusión) | 1946-01-07 | 72 | 5 | – | `7ME6z4GdFxnZWkX0sQGYt3` |
| 3 | Flores del Alma | 1947-07-03 | 72 | 4 | 215 · -17.4 | `6MCzBXIzLMSletQRpSVXka` |

Cortina: *Cambaz* — Mor ve Ötesi (2004, e72) · Spotify `3ZkA3JnqluUWzwr64BBkl4`

### 10. tango · Ricardo Tanturi / Enrique Campos

e66 for target 82 (peak)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Recién | 1944-03-24 | 63 | 3 | 129 · -14.1 | `4pUJAR4yzzPNkrwsfl0QnX` |
| 2 | Malvón | 1943-11-17 | 72 | 3 | 120 · -14.4 | `2DjpJFTtHlTrlZdPJlipVY` |
| 3 | Que Vas Buscando Muñeca | 1943-12-16 | 72 | 3 | 127 · -16.4 | `0enDz46V0tQnMagoKC9Qgg` |
| 4 | Una Emoción | 1943-11-17 | 56 | 5 | 124 · -15.3 | `6o0k6lVZEEoX0r6NO9tWT5` |

Cortina: *Haram Geceler* — Nilüfer (1992, e58) · Spotify `4ZUJ2ohn1tWQZO4rVxIMg8`

### 11. tango · Enrique Rodríguez / Armando Moreno

e69 for target 75 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | El Encopao | 1942-10-22 | 68 | 5 | 130 · -14.8 | `3bXoN44cQj4SqCzSGvxG4P` |
| 2 | Suerte Loca | 1941-10-24 | 68 | 4 | 131 | `0iMLjp81n9TBHbaR28aom3` |
| 3 | Llorar por una Mujer | 1941-07-23 | 70 | 3 | 133 · -15.1 | `2UAx6LP0DqmAj5vVy2iLMb` |
| 4 | Que Lento Corre el Tren | 1943-06-10 | 68 | 4 | -16.7 | `3SB31K7tO6dfUR3Y6EYjvp` |

Cortina: *Dönence* — Barış Manço (1981, e60) · Spotify `6tHwJ9YDzDsWfZAqfcBKWC`

### 12. milonga · Carlos Di Sarli / Roberto Rufino

e68 for target 76 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Zorzal | 1941-12-03 | 62 | 5 | – | `1YOnsQkf6NOpIsl6d05SZf` |
| 2 | La Mulateada | 1941-11-20 | 70 | 5 | – | `0lQvPYZWzSvZ1lX6yDEXuR` |
| 3 | Pena Mulata | 1941-02-18 | 72 | 5 | – | `7sSoTrFvKI6ZyBUllohgh8` |

Cortina: *Araba* — Mustafa Sandal (1996, e82) · Spotify `3QW3PwG13D34yd1GfPJZHV`

### 13. tango · Rodolfo Biagi (instr.)

e77 for target 74 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Unión Cívica | 1938-10-17 | 74 | 4 | – | `1YKfxJdaZfJFkjDuEU4Eki` |
| 2 | La Maleva | 1939-03-24 | 77 | 4 | – | `0kFn7DAmz9AO6OYdpgrjNN` |
| 3 | Pura Clase | 1939-07-13 | 83 | 5 | – | `3ruQpBfAJyKN6izddEGUeY` |
| 4 | El Trece | 1938-11-15 | 75 | 5 | – | `7y6mdKGq1oUG1mrONsvDgI` |

Cortina: *Resimdeki Gözyaşları* — Cem Karaca (1967, e48) · Spotify `1FWtprHStw6VvFqFXDmLT9`

### 14. tango · Aníbal Troilo / Francisco Fiorentino

e64 for target 71 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Sosiego en la Noche | 1943-11-05 | 60 | 5 | – | `0oZEsjDSNFcN0zpfY8SG9E` |
| 2 | Cada Vez que Me Recuerdes | 1943-04-05 | 64 | 5 | – | `0qU0NbDYp1QKMt964kzoq0` |
| 3 | No Le Digas que la Quiero | 1941-10-23 | 65 | 5 | – | `51ISc0nozXhtdHppx0Ysn1` |
| 4 | Te Aconsejo que Me Olvides | 1941-04-16 | 66 | 5 | – | `6uihEC4lEbwymop1XHV1p4` |

Cortina: *Peki Peki Anladık* — MFÖ (1985, e70) · Spotify `4O0QzXVASBtxTEwMRcjq7O`

### 15. vals · Juan D'Arienzo · Francisco Canaro (instr.) · pinned (the DJ)

e73 for target 75 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Desde el Alma | 1935-07-02 | 76 | 4 | – | `1fSS7yGcnOHFdmTBU0wHiw` |
| 2 | Francia | 1935-10-03 | 80 | 3 | 106 · -20.4 | `20Mq6CZRj7WJwcALewdEyL` |
| 3 | Corazón de Oro | 1938-01-21 | 64 | 0 | – | `5g3zxHHVxvxwA6iFARCZ8H` |

Cortina: *Bir Derdim Var* — Mor ve Ötesi (2004, e66) · Spotify `5UV2oqgMXvlkOvvtK3aT7f`

### 16. tango · Osvaldo Pugliese / Roberto Chanel

e70 for target 78 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Corrientes y Esmeralda | 1944-10-17 | 70 | 4 | – | `2SF5osUU3fGNm1I4BViUaY` |
| 2 | Rondando tu Esquina | 1945-07-18 | 66 | 4 | – | `02pO9QTZ6RjUsx5MI5nVpV` |
| 3 | El Sueño del Pibe | 1945-03-22 | 72 | 2 | – | `1JMN9dOe86FDhFZK9Zaqwg` |
| 4 | La Abandoné y No Sabía | 1944-07-20 | 71 | 3 | – | `3lRuOhJj4L0erlCbhkFWEh` |

Cortina: *İşte Öyle Bir Şey* — Erol Evgin (1977, e72) · Spotify `07ycJqYmXyIxPT0dIWlalt`

### 17. tango · Ricardo Malerba / Orlando Medina

e57 for target 73 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Remembranza | 1943-02-12 | 60 | 5 | – | `0hI1yHPdxrwfzd1CkQ1Xh4` |
| 2 | La Piba de los Jazmines | 1943-01-18 | 53 | 4 | – | `04xRZieGMULclSLR0ISm6X` |
| 3 | Embrujamiento | 1943-02-12 | 58 | 4 | – | `0E4F2APtC9XhiRp9fYveG9` |
| 4 | Gitana Rusa | 1942-10-05 | 58 | 4 | – | `5LcweyEw6PgeAYTBkA0AJh` |

Cortina: *Sil Baştan* — Şebnem Ferah (2001, e64) · Spotify `4PzGwrM4NGUuCBR5WTFCth`

### 18. milonga · Edgardo Donato / Horacio Lagos

e73 for target 77 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Porteña Linda | 1940-04-30 | 70 | 3 | – | `29ZRP5zThrC3MGWOKpTwot` |
| 2 | La Milonga que Faltaba | 1938-02-05 | 72 | 4 | – | `2IJ9uOnfDCDXycDhyJWjZ5` |
| 3 | Sacale Punta | 1938-03-09 | 78 | 5 | – | `7HhKNNKTGOl1PjqBdbC3S2` |

Cortina: *Her Şeyi Yak* — Duman (2002, e72) · Spotify `4uqlFpMPTKO6uAsX6qvK0l`

### 19. tango · Juan D'Arienzo (instr.)

e86 for target 85 (peak)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Hotel Victoria | 1935-07-02 | 86 | 5 | – | `4mVI8bdnJ161XimaiqDnae` |
| 2 | Champagne Tango | 1938-06-22 | 86 | 3 | – | `2HPsVBUNWt6Q5MK5TGrhcL` |
| 3 | La Catrera | 1938-06-08 | 86 | 3 | – | `6WKMEp3wLmRg48LFd8QcxG` |
| 4 | El Esquinazo | 1938-01-04 | 86 | 4 | – | `6ge5kiw5xT8zOYb3yGy9XA` |

Cortina: *Göreceksin Kendini* — Nilüfer (1973, e62) · Spotify `1M6FaBbr3cAjJg10DzZuah`

### 20. tango · Aníbal Troilo (instr.)

e76 for target 76 (cooldown)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Cachirulo | 1941-03-04 | 76 | 5 | – | `04cr4KcN0CzTPqscStkKNa` |
| 2 | El Tamango | 1941-10-23 | 73 | 5 | – | `715ZMznk24LRrErHLwZ5hb` |
| 3 | Milongueando en el 40 | 1941-06-17 | 78 | 5 | – | `5HyQ0ZvSrhajVpUNgJUHIz` |
| 4 | Guapeando | 1941-07-11 | 78 | 5 | – | `2HnQzvySUeG1anORTnyTR5` |

Cortina: *Kuzu Kuzu* — Tarkan (2001, e76) · Spotify `3ajYmPDtB3P7JTPQ64Dr7P`

### 21. vals · Rodolfo Biagi / Teófilo Ibáñez

e82 for target 77 (cooldown)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Viejo Portón | 1938-10-17 | 81 | 4 | – | `06ahYYTLm3AfSRA0AJtZ10` |
| 2 | Loca de Amor | 1938-11-15 | 89 | 5 | – | `2m7TVoThr84pOyFaFtfmt4` |
| 3 | Lejos de Ti | 1938-12-02 | 77 | 5 | – | `2gGefdWyepqJa6wzOiDL0Y` |

Cortina: *Bu Kalp Seni Unutur mu* — Fikret Kızılok & Sibel Sezal (1993, e48) · Spotify `4Q2t1wFBSwgaPlgV5GpqZp`

### 22. tango · Miguel Caló / Raúl Berón

e58 for target 70 (cooldown)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Qué Te Importa que Te Llore | 1942-06-30 | 61 | 5 | – | `5G3C9MEjMhWwRm2SqOqack` |
| 2 | Jamás Retornarás | 1942-10-09 | 56 | 5 | – | `4JmBMcfwRgcKQVfAET9xqX` |
| 3 | Trasnochando | 1942-06-30 | 58 | 3 | – | `1nxqAiSYAQssISLWcFrDx2` |
| 4 | Tristezas de la Calle Corrientes | 1942-09-02 | 58 | 5 | – | `1oQar5cNMrsAmU6uST0sFq` |

Cortina: *Senden Daha Güzel* — Duman (2009, e62) · Spotify `2sLAykCWyB1VA5hXDjU59T`

### 23. tango · Ricardo Tanturi / Alberto Castillo

e78 for target 78 (close)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Recuerdo Malevo | 1941-12-23 | 75 | 4 | – | `4aeLSOzo18dWJO5ReQ2MPK` |
| 2 | Pocas Palabras | 1941-06-16 | 75 | 5 | – | `5qcHjSH1hrpk9TcfVm8cfQ` |
| 3 | La Vida Es Corta | 1941-02-19 | 75 | 4 | – | `4rRk6jrEm3LKSJJIsrpjau` |
| 4 | Así Se Baila el Tango | 1942-12-04 | 85 | 5 | – | `6vrz2bxBByWjoi7NAf5BIn` |

Closing: La Cumparsita · Ricardo Tanturi 1940 · Spotify `6dXLn9JJVly4xDmaQiKdXy`
