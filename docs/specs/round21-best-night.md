# Round 21 — the featured night: only the DJ's edits

`apps/web/public/featured/golden-double-peak.json` (copy: `docs/specs/round21-best-night.json`) is the night already in the DJ's Spotify. It was **not recomposed** and no fixer ran over it: `scripts/round21_featured.ts` starts from the shipped round-19 file and applies only the DJ's edits (slot by slot, in the DJ's order), the two tandas the DJ asked for between the new tango tandas, the stream ids the round-21 stream-date rule rejects, the cortinas around the changed gaps, and a re-time / re-score. The round-21 rules for future nights (tone per tanda, BPM / level bands, the big four) are reported here, not retrofitted.

- **25 tandas, 4.60 h** (was 23 tandas, 4.0 h): the DJ's four new tango tandas T16–T19, plus a vals after T17 and a milonga after T19 to keep the TTV / TTM cycle. The night's request now reads 4.5 h. No cortina was shortened to hide the length.
- Engine score 91 → **75** (what drops: the arc, the energy steps and transitions, the era spread of the DJ's 1932–63 tandas, fame-0 vocal tandas late in the night; the DJ's tandas' mixes are DJ exceptions, never scored as integrity faults)
- Strict panel: **0 blockers · 2 should-fix** (cuePopHour: a third up-tempo pop cue in hour 4; tandaTone: the shipped Biagi / Ibáñez valses span e77–89). **137 DJ exceptions**: rules a pinned tanda (or the DJ's closing) breaks, or makes a neighbour break — reported, never fixed.
- Spotify: 92/92 sides, the opening and the closing carry a Spotify id (3 of them are the DJ's choice, see below); 24/24 cortinas. Clip audit (`--fix`): 118 items, 7 Spotify previews, 73 Deezer clips of the same recording, 38 without a clip (mostly the sides found through the Spotify connector while the Web API was rate-limited: no preview URL yet).

## The DJ's order and what it costs

The DJ's slots are kept in the DJ's order (T1 … T23 by the shipped numbering). Two tandas are inserted:

- **after T17** (Caló / Iriarte): a **vals**, Biagi / Andrés Falgás (El Último Adiós, Déjame Amarte Aunque Sea un Día, Dichas que Viví; 1939–40). The vals catalogue with checked Spotify ids is thin: every non-big-four vals family not already in the night was either replaced by the DJ tonight (Rodríguez / Flores at T9, Tanturi / Castillo at T15) or had no three Spotify-ready sides (Lomuto / Díaz has three, all fame 0). Biagi / Falgás is the best-loved one left; it makes three Biagi tandas (T10 instr., T18 vals, T23 vals with Ibáñez) — swap it in the composer if you prefer another.
- **after T19** (Tango Bardo): a **milonga**, Donato / Lagos (Porteña Linda, La Milonga que Faltaba, Sacale Punta) — the shipped T18 milonga that the DJ's new T18 took the slot of, already in the Spotify playlist.

The cycle now reads T T V T T M T T V T T M T T V T T **V** T T **M** T V T T: one stretch (milonga T21 → Troilo T22 → vals T23) has a single tango between the milonga and the vals, because T20–T23 keep their order. Bypass the inserted vals or milonga in the booth to play the tango tandas straight.

Repeats the DJ chose (reported, not changed): **Tanturi / Castillo** plays T16 and the última (T25, shipped T23); **Caló** plays T3 (vals, Iriarte), T17 (Iriarte) and T24 (Berón, shipped T22).

The big four: Di Sarli T2, T12 · Troilo T6, T14, T22 · D'Arienzo T8, T15 · Pugliese T19 — every quartile holds one. Faults: **T14 Troilo → T15 D'Arienzo valses** back to back (both the DJ's), Di Sarli T12 → Troilo T14 two apart, Pugliese T19 → Troilo T22 three apart. All involve a pinned tanda: DJ exceptions, no swap made.

Spotify ids the DJ's sides play although the match rules cannot prove the take (kept on the night as the DJ's choice, never written to the judged cache):

- Danzarín (Aníbal Troilo 1963): spotify:track:1TcXgz8vA1gN25RgShGeQl — the index knows a 1973 take; the transfer on the album of the 1963 Rufino sides
- Chiqué (El Elegante) (Osvaldo Pugliese 1953): spotify:track:3npc4k1OPe3MU3F1hf8y3o — the index knows 1979–92 takes; no dated transfer
- Nochero Soy (Osvaldo Pugliese 1956): spotify:track:07H6MGl2J73fhNeMW9Imha — every Spotify transfer runs 212–214 s against the index's 231 s

Spotify ids replaced on shipped sides (the same sides, the correct transfers):

- Tres Esquinas (Ángel D'Agostino 1941): spotify:track:5iAzpDLPcnczkrY0F0md5z (Laura) → spotify:track:5HftCmLhynna9guHF1xz8b (Ángel D'agostino y Su Orquesta Típica - Ángel Vargas 1940 - 1942 (Restauración 2022)) — an album dated 1939-01-09 before the 1941 side (Laura)
- Garúa (Pedro Láurenz 1943): spotify:track:7gE7FGQPi6t11Aw6LgDBxz (¡Ay, Mis Amores!) → spotify:track:5aHq3pPjczus4Fb23nscYq (Que Nunca Me Falte) — re-judged: the shipped id's album is dated before the side or decades after it (round-21 audit)
- Guapeando (Aníbal Troilo 1941): spotify:track:4Gx6V2iAfhI0NutgHdgnBc (Guapeando) → spotify:track:2HnQzvySUeG1anORTnyTR5 (Yo Soy El Tango) — re-judged: the shipped id's album is dated before the side or decades after it (round-21 audit)
- Qué Te Importa que Te Llore (Miguel Caló 1942): spotify:track:4Kip4MXIcgDQymCQldHbSt (Geometría Del Arrabal) → spotify:track:5G3C9MEjMhWwRm2SqOqack (Tango Classics 225: Trasnochando) — re-judged: the shipped id's album is dated before the side or decades after it (round-21 audit)

Cortinas: after T3 (Miguel Caló): Hadi Bakalım — Sezen Aksu → Sen Ağlama — Sezen Aksu; after T7 (Edgardo Donato): Firuze — Sezen Aksu → Dudu — Tarkan; after T12 (Carlos Di Sarli): Araba — Mustafa Sandal → Firuze — Sezen Aksu; after T18 (Rodolfo Biagi): new gap → Araba — Mustafa Sandal; after T19 (Osvaldo Pugliese): Her Şeyi Yak — Duman → Benimle Oynar mısın — Bülent Ortaçgil; after T21 (Edgardo Donato): new gap → Hadi Bakalım — Sezen Aksu. Every other cue is the shipped one; each was re-judged by `cortinaMatchProblem` (0 rejected).

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
| T10 | tango · Juan D'Arienzo / Alberto Echagüe · La Bruja 1938, Indiferencia 1938, Pensalo Bien 1938, No Mientas 1938 | tango · Rodolfo Biagi instr. · Pura Clase 1939, El Yaguarón 1940, Bélgica 1942, El Trece 1938 | DJ edit: the DJ's Biagi instrumentals (Pura Clase, El Yaguarón, Bélgica, El Trece; 1938–42) — pinned |
| T11 | tango · Pedro Láurenz / Alberto Podestá · Garúa 1943, Recién 1943, Todo 1943, Que Nunca Me Falte 1943 | tango · Domingo Federico / Carlos Vidal · Enzo Valentino · Tu Melodía 1944, Para Qué Te Quiero Tanto 1945, Cualquier Cosa 1951, Leyenda Gaucha 1952 | DJ edit: the DJ's Federico tanda (Vidal 1944–45, Cualquier Cosa with Valentino 1951, Leyenda Gaucha instr. 1952) — pinned |
| T13 | tango · Rodolfo Biagi instr. · Unión Cívica 1938, La Maleva 1939, Pura Clase 1939, El Trece 1938 | tango · Lucio Demare / Raúl Berón · Cómo Se Hace un Tango 1943, Moneda de Cobre 1943, Oigo tu Voz 1943, Canta Pajarito 1943 | DJ edit: the DJ's Demare / Berón tanda (1943) — pinned |
| T14 | tango · Aníbal Troilo / Francisco Fiorentino · Sosiego en la Noche 1943, Cada Vez que Me Recuerdes 1943, No Le Digas que la Quiero 1941, Te Aconsejo que Me Olvides 1941 | tango · Aníbal Troilo / Roberto Rufino · Desencuentro 1963, Por Qué la Quise Tanto 1963, Quién lo Había de Pensar 1963, Danzarín 1963 | DJ edit: the DJ's Troilo / Rufino 1963 tanda (Danzarín instr. 1963, the session nearest the Rufino sides) — pinned |
| T15 | vals · Ricardo Tanturi / Alberto Castillo · Mi Romance 1941, Recuerdo 1941, La Serenata (Mi Amor) 1941 | vals · Juan D'Arienzo · Francisco Canaro instr. · Desde el Alma 1935, Francia 1935, Corazón de Oro 1938 | DJ edit: the DJ's valses (D'Arienzo 1935, Canaro 1938) — pinned |
| T16 | tango · Osvaldo Pugliese / Roberto Chanel · Corrientes y Esmeralda 1944, Rondando tu Esquina 1945, El Sueño del Pibe 1945, La Abandoné y No Sabía 1944 | tango · Ricardo Tanturi / Alberto Castillo · Noches de Colón 1942, Pocas Palabras 1941, La Vida Es Corta 1941, La Última Copa 1943 | DJ edit: the DJ's Tanturi / Castillo tanda (Noches de Colón, Pocas Palabras, La Vida Es Corta, La Última Copa) — pinned |
| T17 | tango · Ricardo Malerba / Orlando Medina · Remembranza 1943, La Piba de los Jazmines 1943, Embrujamiento 1943, Gitana Rusa 1942 | tango · Miguel Caló / Raúl Iriarte · Cada Día Te Extraño Más 1943, Lluvia de Abril 1945, Margo 1945, Mañana Iré Temprano 1943 | DJ edit: the DJ's Caló / Iriarte tanda (1943–45) — pinned |
| T18 | milonga · Edgardo Donato / Horacio Lagos · Porteña Linda 1940, La Milonga que Faltaba 1938, Sacale Punta 1938 | tango · Osvaldo Pugliese instr. · Don Agustín Bardi ?, Chiqué (El Elegante) 1953, Emancipación 1955, Nochero Soy 1956 | DJ edit: the DJ's Pugliese instrumentals (Don Agustín Bardi, Chiqué, Emancipación, Nochero Soy; 1950s) — pinned |
| T19 | tango · Juan D'Arienzo instr. · Hotel Victoria 1935, Champagne Tango 1938, La Catrera 1938, El Esquinazo 1938 | tango · Tango Bardo / Roberto Minondi · No Mientas ?, Humillación ?, Maipo ?, El Cencerro ? | DJ edit: the DJ's Tango Bardo tanda (a contemporary orchestra in D'Arienzo's repertoire: No Mientas, Humillación, Maipo, El Cencerro) — pinned |
| T23 | tango · Ricardo Tanturi / Alberto Castillo · Recuerdo Malevo 1941, Pocas Palabras 1941, La Vida Es Corta 1941, Así Se Baila el Tango 1942 | tango · Ricardo Tanturi / Alberto Castillo · Recuerdo Malevo 1941, Muñeca Brava 1942, Como Se Pianta la Vida 1942, Así Se Baila el Tango 1942 | DJ edit: the última, Tanturi / Castillo: Pocas Palabras and La Vida Es Corta now play in T16, so Muñeca Brava and Como Se Pianta la Vida (1942) take their chairs; it still ends on Así Se Baila el Tango — pinned |
| new after T17 | — | vals · Rodolfo Biagi / Andrés Falgás · El Último Adiós 1940, Déjame Amarte Aunque Sea un Día 1939, Dichas que Viví 1939 | the DJ: a vals between the new tango tandas (the TTV / TTM cycle) |
| new after T19 | — | milonga · Edgardo Donato / Horacio Lagos · Porteña Linda 1940, La Milonga que Faltaba 1938, Sacale Punta 1938 | the DJ: a milonga between the new tango tandas (the TTV / TTM cycle) |
| Closing | La Cumparsita · Ricardo Tanturi 1940 | La Cumparsita · Bandonegro | the DJ's closing version |

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
- 10. tango · Rodolfo Biagi instr. · 1938–1942 · pinned
- 11. tango · Domingo Federico / Carlos Vidal · Enzo Valentino · 1944–1952 · pinned
- 12. milonga · Carlos Di Sarli / Roberto Rufino · 1941–1941
- 13. tango · Lucio Demare / Raúl Berón · 1943–1943 · pinned
- 14. tango · Aníbal Troilo / Roberto Rufino · 1963–1963 · pinned
- 15. vals · Juan D'Arienzo · Francisco Canaro instr. · 1935–1938 · pinned
- 16. tango · Ricardo Tanturi / Alberto Castillo · 1941–1943 · pinned
- 17. tango · Miguel Caló / Raúl Iriarte · 1943–1945 · pinned
- 18. vals · Rodolfo Biagi / Andrés Falgás · 1939–1940 · pinned
- 19. tango · Osvaldo Pugliese instr. · 1953–1956 · pinned
- 20. tango · Tango Bardo / Roberto Minondi · undefined · pinned
- 21. milonga · Edgardo Donato / Horacio Lagos · 1938–1940 · pinned
- 22. tango · Aníbal Troilo instr. · 1941–1941
- 23. vals · Rodolfo Biagi / Teófilo Ibáñez · 1938–1938
- 24. tango · Miguel Caló / Raúl Berón · 1942–1942
- 25. tango · Ricardo Tanturi / Alberto Castillo · 1941–1942 · pinned

## Notes on the DJ's sides

- T5 "Alma de Bohemia" is the index's **Alma de Bohemio** (Láurenz / Alberto Podestá, 1943-07-15), not a new side. The DJ's T5 has three singers (Casas 1940, A. Podestá 1943, M. Podestá 1942): kept as asked, a DJ exception.
- T7 **Me Voy a Baraja** was not in the index: added to the repo database (`data/knowledge/added_songs.json`, Donato / Lagos, 1936–38 from the Spotify album "Embrujo gitano, Edgardo Donato (1936-1938)"; no dated transfer found). **Carnaval de mi Barrio** is a vals (Lita Morales & Horacio Lagos, 1939; the listado says vals and no source says otherwise): a vals inside the DJ's tango tanda.
- T8 **Farabute** with Echagüe: the index has D'Arienzo / Echagüe **1949-07-26** (no 1938–40 recording is known); the Spotify transfers are that side. Kept, a DJ exception (1938–49 in one tanda).
- T15 **Corazón de Oro**: no golden-era D'Arienzo recording exists; Canaro's instrumental, dated **1938-01-21** from its session-dated Spotify album (Colección Completa, Vol. 90), recorded in `data/knowledge/song_patches.json`.
- The opening: D'Agostino recorded no La Cumparsita with Vargas in the index; its only version is **1952 with Tino García** (fallback recorded: "opening: no Ángel D'Agostino La Cumparsita near 1941; its 1952 version (Tino García) opens"). Spotify also lists a D'Agostino / Vargas La Cumparsita (undated compilations) that the index does not hold; it was not added without a date.
- T10 Biagi instrumentals (moved from the shipped T13): Pura Clase, El Yaguarón, Bélgica, El Trece (1938–42).
- T11 Federico: Tu Melodía and Para Qué Te Quiero Tanto with Carlos Vidal; **Cualquier Cosa**: no Federico / Vidal recording exists in the index or on Spotify, so the **1951 side with Enzo Valentino** plays; **Leyenda Gaucha** is the 1952 instrumental.
- T14 Troilo / Rufino 1963 (Desencuentro, Por Qué la Quise Tanto, Quién lo Había de Pensar — added to the index, undated); **Danzarín**: the 1963 instrumental (the session nearest the Rufino sides), not the 1958 one; its Spotify transfer is the DJ's choice (the index also knows a 1973 take).
- T16 Tanturi / Castillo: **Noches de Colón** added to the index (undated). T18 Pugliese: **Don Agustín Bardi** added (undated); Chiqué (1953) and Nochero Soy (1956) play DJ-chosen transfers.
- T19 **Tango Bardo** (a contemporary orchestra, Roberto Minondi): No Mientas, Humillación, Maipo, **El Cencerro** — all four added to the index under Tango Bardo (undated), never D'Arienzo's sides.
- T23 (the última): Pocas Palabras and La Vida Es Corta now play in T16, so **Muñeca Brava** and **Como Se Pianta la Vida** (Tanturi / Castillo, 1942) take their chairs; it still ends on Así Se Baila el Tango.
- Closing: **Bandonegro's La Cumparsita** (added to the index, undated; `closingPinned`: the closer rule reports it as a DJ exception). The opening stays D'Agostino's.


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

### 10. tango · Rodolfo Biagi instr. · pinned (the DJ)

e79 for target 82 (peak)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Pura Clase | 1939-07-13 | 83 | 5 | 133 · -17.2 | `3ruQpBfAJyKN6izddEGUeY` |
| 2 | El Yaguarón | 1940-06-19 | 74 | 4 | 134 · -0.7 | `1RAkWMnlxl5n4XBvoD6mhF` |
| 3 | Bélgica | 1942-01-20 | 85 | 4 | 133 · -11.4 | `3nXlfk7M2cG9OX44cdt48B` |
| 4 | El Trece | 1938-11-15 | 75 | 5 | 129 · -14.3 | `7y6mdKGq1oUG1mrONsvDgI` |

Cortina: *Haram Geceler* — Nilüfer (1992, e58) · Spotify `4ZUJ2ohn1tWQZO4rVxIMg8`

### 11. tango · Domingo Federico / Carlos Vidal · Enzo Valentino · pinned (the DJ)

e57 for target 75 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Tu Melodía | 1944-12-27 | 60 | 0 | – | `23OVa1Fa5tQfgWgSctDjMr` |
| 2 | Para Qué Te Quiero Tanto | 1945-07-19 | 59 | 0 | – | `51G7CJkgttDpXZDBVTpDSV` |
| 3 | Cualquier Cosa | 1951-04-10 | 58 | 0 | – | `4ysjeCqwpdb0En078R5EMC` |
| 4 | Leyenda Gaucha | 1952-11-24 | 51 | 0 | – | `3Vxfrt4pBbdG3KrkQIn7If` |

Cortina: *Dönence* — Barış Manço (1981, e60) · Spotify `6tHwJ9YDzDsWfZAqfcBKWC`

### 12. milonga · Carlos Di Sarli / Roberto Rufino

e68 for target 76 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Zorzal | 1941-12-03 | 62 | 5 | – | `1YOnsQkf6NOpIsl6d05SZf` |
| 2 | La Mulateada | 1941-11-20 | 70 | 5 | – | `0lQvPYZWzSvZ1lX6yDEXuR` |
| 3 | Pena Mulata | 1941-02-18 | 72 | 5 | – | `7sSoTrFvKI6ZyBUllohgh8` |

Cortina: *Firuze* — Sezen Aksu (1982, e54) · Spotify `7nSTtrEEmGtZ8BtG8Zc0ze`

### 13. tango · Lucio Demare / Raúl Berón · pinned (the DJ)

e55 for target 74 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Cómo Se Hace un Tango | 1943-01-09 | 58 | 0 | – | `66IeRjBeOlVEhzZLmVEryH` |
| 2 | Moneda de Cobre | 1943-04-01 | 58 | 0 | – | `4E7PHA1cmPkJuSCRFUqktU` |
| 3 | Oigo tu Voz | 1943-11-25 | 45 | 2 | 121 · -14.5 | `7xoCUSmYshyAhtwZM9aIOE` |
| 4 | Canta Pajarito | 1943-06-10 | 57 | 0 | – | `3uxHBPalgTA6AJtGs5Dmgt` |

Cortina: *Resimdeki Gözyaşları* — Cem Karaca (1967, e48) · Spotify `1FWtprHStw6VvFqFXDmLT9`

### 14. tango · Aníbal Troilo / Roberto Rufino · pinned (the DJ)

e49 for target 71 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Desencuentro | 1963-06-05 | 50 | 0 | – | `0BbDKqpUGgcW5qiI9P8mkt` |
| 2 | Por Qué la Quise Tanto | 1963-06-05 | 58 | 0 | – | `3QpGSc9zOHJaOQjwl13S0X` |
| 3 | Quién lo Había de Pensar | 1963 | 57 | 0 | – | `2o0zZXJsny5qBpYPHeFi5M` |
| 4 | Danzarín | 1963-05-01 | 30 | 0 | – | `1TcXgz8vA1gN25RgShGeQl` |

Cortina: *Peki Peki Anladık* — MFÖ (1985, e70) · Spotify `4O0QzXVASBtxTEwMRcjq7O`

### 15. vals · Juan D'Arienzo · Francisco Canaro instr. · pinned (the DJ)

e73 for target 75 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Desde el Alma | 1935-07-02 | 76 | 4 | – | `1fSS7yGcnOHFdmTBU0wHiw` |
| 2 | Francia | 1935-10-03 | 80 | 3 | 106 · -20.4 | `20Mq6CZRj7WJwcALewdEyL` |
| 3 | Corazón de Oro | 1938-01-21 | 64 | 0 | – | `5g3zxHHVxvxwA6iFARCZ8H` |

Cortina: *Bir Derdim Var* — Mor ve Ötesi (2004, e66) · Spotify `5UV2oqgMXvlkOvvtK3aT7f`

### 16. tango · Ricardo Tanturi / Alberto Castillo · pinned (the DJ)

e71 for target 78 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Noches de Colón | 1942 | 70 | 5 | – | `0kGEkhN1rXXuvzwm4YAL58` |
| 2 | Pocas Palabras | 1941-06-16 | 75 | 5 | 132 · -14.5 | `5qcHjSH1hrpk9TcfVm8cfQ` |
| 3 | La Vida Es Corta | 1941-02-19 | 75 | 4 | 92 · -16.7 | `4rRk6jrEm3LKSJJIsrpjau` |
| 4 | La Última Copa | 1943-04-29 | 64 | 0 | – | `71fh3r6cbmXQNXFpHrBx47` |

Cortina: *İşte Öyle Bir Şey* — Erol Evgin (1977, e72) · Spotify `07ycJqYmXyIxPT0dIWlalt`

### 17. tango · Miguel Caló / Raúl Iriarte · pinned (the DJ)

e58 for target 73 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Cada Día Te Extraño Más | 1943-09-16 | 56 | 2 | – | `6AbpIe9XSvxbTjLvchViny` |
| 2 | Lluvia de Abril | 1945-02-20 | 61 | 0 | – | `7A5H7Y99VmicoqtOAteIXQ` |
| 3 | Margo | 1945-11-15 | 64 | 0 | – | `7JnyqqIWfS8lOWJ2yePcjy` |
| 4 | Mañana Iré Temprano | 1943-08-10 | 49 | 3 | 129 | `1RZZXXJqGtOtAS4o59jwRf` |

Cortina: *Sil Baştan* — Şebnem Ferah (2001, e64) · Spotify `4PzGwrM4NGUuCBR5WTFCth`

### 18. vals · Rodolfo Biagi / Andrés Falgás · inserted where the DJ asked (TDJ's pick)

e82 for target 69 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | El Último Adiós | 1940-03-27 | 81 | 3 | 215 · -18.5 | `3qunxU1gD68rGcWNwGB1Gm` |
| 2 | Déjame Amarte Aunque Sea un Día | 1939-09-22 | 78 | 4 | 108 · -19.4 | `7bbJ9btY1al5RMOuIswZha` |
| 3 | Dichas que Viví | 1939-07-13 | 87 | 3 | 152 · -14.6 | `0lzcF0FNhly8Ck3uZjL0KG` |

Cortina: *Araba* — Mustafa Sandal (1996, e82) · Spotify `3QW3PwG13D34yd1GfPJZHV`

### 19. tango · Osvaldo Pugliese instr. · pinned (the DJ)

e80 for target 77 (build)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Don Agustín Bardi | undated | 79 | 0 | – | `0cPzgU8vTr1fPVydwbLEmV` |
| 2 | Chiqué (El Elegante) | 1953-05-28 | 80 | 4 | – | `3npc4k1OPe3MU3F1hf8y3o` |
| 3 | Emancipación | 1955-09-02 | 80 | 5 | – | `2ckHZRUMHReeAC6wTXXtcG` |
| 4 | Nochero Soy | 1956-11-28 | 82 | 5 | – | `07H6MGl2J73fhNeMW9Imha` |

Cortina: *Benimle Oynar mısın* — Bülent Ortaçgil (1974, e48) · Spotify `69QnkvrvdrIf81NhNPF6Ca`

### 20. tango · Tango Bardo / Roberto Minondi · pinned (the DJ)

e49 for target 85 (peak)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | No Mientas | undated | 47 | 0 | – | `0qSr6Dcv587mZPjInATeiO` |
| 2 | Humillación | undated | 51 | 0 | – | `6gWhG85uEat6TxdxIrNdgI` |
| 3 | Maipo | undated | 48 | 0 | – | `3bcTb44JXAhVGhpFwdb5ap` |
| 4 | El Cencerro | undated | 51 | 0 | – | `2QPgGSRxM1jXVo7RnWYH7T` |

Cortina: *Göreceksin Kendini* — Nilüfer (1973, e62) · Spotify `1M6FaBbr3cAjJg10DzZuah`

### 21. milonga · Edgardo Donato / Horacio Lagos · inserted where the DJ asked (TDJ's pick)

e73 for target 63 (cooldown)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Porteña Linda | 1940-04-30 | 70 | 3 | -14.3 | `29ZRP5zThrC3MGWOKpTwot` |
| 2 | La Milonga que Faltaba | 1938-02-05 | 72 | 4 | -11.9 | `2IJ9uOnfDCDXycDhyJWjZ5` |
| 3 | Sacale Punta | 1938-03-09 | 78 | 5 | 185 · -14.2 | `7HhKNNKTGOl1PjqBdbC3S2` |

Cortina: *Hadi Bakalım* — Sezen Aksu (1991, e76) · Spotify `51xYVRNDNAINQNHnRXITTx`

### 22. tango · Aníbal Troilo instr.

e76 for target 76 (cooldown)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Cachirulo | 1941-03-04 | 76 | 5 | – | `04cr4KcN0CzTPqscStkKNa` |
| 2 | El Tamango | 1941-10-23 | 73 | 5 | – | `715ZMznk24LRrErHLwZ5hb` |
| 3 | Milongueando en el 40 | 1941-06-17 | 78 | 5 | – | `5HyQ0ZvSrhajVpUNgJUHIz` |
| 4 | Guapeando | 1941-07-11 | 78 | 5 | – | `2HnQzvySUeG1anORTnyTR5` |

Cortina: *Kuzu Kuzu* — Tarkan (2001, e76) · Spotify `3ajYmPDtB3P7JTPQ64Dr7P`

### 23. vals · Rodolfo Biagi / Teófilo Ibáñez

e82 for target 77 (cooldown)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Viejo Portón | 1938-10-17 | 81 | 4 | – | `06ahYYTLm3AfSRA0AJtZ10` |
| 2 | Loca de Amor | 1938-11-15 | 89 | 5 | – | `2m7TVoThr84pOyFaFtfmt4` |
| 3 | Lejos de Ti | 1938-12-02 | 77 | 5 | – | `2gGefdWyepqJa6wzOiDL0Y` |

Cortina: *Bu Kalp Seni Unutur mu* — Fikret Kızılok & Sibel Sezal (1993, e48) · Spotify `4Q2t1wFBSwgaPlgV5GpqZp`

### 24. tango · Miguel Caló / Raúl Berón

e58 for target 70 (cooldown)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Qué Te Importa que Te Llore | 1942-06-30 | 61 | 5 | – | `5G3C9MEjMhWwRm2SqOqack` |
| 2 | Jamás Retornarás | 1942-10-09 | 56 | 5 | – | `4JmBMcfwRgcKQVfAET9xqX` |
| 3 | Trasnochando | 1942-06-30 | 58 | 3 | – | `1nxqAiSYAQssISLWcFrDx2` |
| 4 | Tristezas de la Calle Corrientes | 1942-09-02 | 58 | 5 | – | `1oQar5cNMrsAmU6uST0sFq` |

Cortina: *Senden Daha Güzel* — Duman (2009, e62) · Spotify `2sLAykCWyB1VA5hXDjU59T`

### 25. tango · Ricardo Tanturi / Alberto Castillo · pinned (the DJ)

e79 for target 78 (close)

| # | Side | Date | Energy | Fame | BPM · dB | Spotify |
|---|---|---|---|---|---|---|
| 1 | Recuerdo Malevo | 1941-12-23 | 75 | 4 | 129 · -15.6 | `4aeLSOzo18dWJO5ReQ2MPK` |
| 2 | Muñeca Brava | 1942-09-22 | 79 | 3 | 126 · -13.0 | `0QcYKNHeyjbSiTPldAH1TP` |
| 3 | Como Se Pianta la Vida | 1942-09-15 | 75 | 3 | 124 · -13.4 | `2UKlIkacLfXB1YNsGVYPTE` |
| 4 | Así Se Baila el Tango | 1942-12-04 | 85 | 5 | 118 · -15.8 | `6vrz2bxBByWjoi7NAf5BIn` |

Closing: La Cumparsita · Bandonegro (the DJ's) · Spotify `71xZvSB3Nrb5HMclJKi9jU`
