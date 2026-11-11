# Round 16: export-match review (seeds 12, 180, 194), Spotify cache sample and match-rule gaps

Read-only third pass. The user's demand: *"make sure export matches always correct songs"*.

## Scope

1. Every side and cortina in `scratchpad/best7/seed-{12,180,194}.json`: 68 tandas, 126 distinct sides including the shared closer, and 25 distinct cortinas. That covers every stream id a night would export: the Spotify `uri` in the night JSON (identical to `data/cache/spotify/tracks.json` for every side), and the Deezer `resolved.id`.
2. 30 random kept entries of `data/cache/spotify/tracks.json` (seeded sample; 277 kept, 102 null).
3. The rules in `packages/core/src/matchRules.ts`, `packages/core/src/streams.ts`, `apps/web/src/lib/match.ts`, `scripts/audit_streams.ts` and `scripts/audit_spotify.ts`. I ran 15 trap cases through `matchProblem()` with tsx.

## Method

Each side was checked against its tango.info work page: every performance by the orchestra, with date, singer or instrumental status, genre and track lengths. Every Spotify and Deezer match was then compared on three things:

- the length of the dated performance,
- the length of the orchestra's other recordings of the title,
- the album title.

Where the stream is closer to a remake than to the original, or the album names a later series, it is flagged. One Spotify search was used to see the D'Arienzo *La cumparsita* alternatives.

Confidence: **H** = the album and length both point at another recording; **M** = one strong pointer; **L** = needs a listen.

## Verdict

**Clean: no.**

- **Export problems.** Three sides would export a **Deezer id for a 1960s or 1970s remake** in place of the golden-era side:
  - *El bulín de la calle Ayacucho* (Troilo 1941; the Deezer track is the 1971 Goyeneche recording);
  - *El irresistible* and *La morocha* (D'Arienzo 1936–37; the Deezer tracks are from the 1960s RCA *For Export* series).

  A fourth, *La bruja* (D'Arienzo / Echagüe 1938), carries a correct Spotify id but a Deezer id that is probably the 1959 Mario Bustos remake. The night also shows that Deezer track's length.
- **Credits and dates.** All 126 sides are right: singer, instrumental status, date, genre, and the 1935–45 window. No title repeats within a night. The round-15 fixes hold: *Recuerdo* now plays as the 1941 Castillo vals in vals tandas.
- **The Spotify sample.** No wrong recording among the 30. Two entries cannot be verified by any rule the code has, because the orchestra's versions have the same length and the album has no year.
- **The match rules.** They are a real improvement, but at least 12 traps still pass. The largest:
  - Deezer matches are **never judged** by `matchProblem` at all;
  - remakes credited to the same orchestra pass whenever the album names no year;
  - a credit that only *contains* the leader's surname passes (Donato Racciatti for Edgardo Donato, Rafael Canaro, Los Solistas de D'Arienzo);
  - a title contained in a longer title passes ("Recuerdo" ⊂ "Recuerdo malevo", "Nada" ⊂ "Nada más").

## 1. Problems in the three nights (exported stream ids)

| Night / tanda | Side (id) | Exported id | Problem | Correct | Conf. |
|---|---|---|---|---|---|
| 12 #04, 180 #13, 194 #06 | El bulín de la calle Ayacucho, Troilo / Fiorentino 1941-06-17 (`cbe0e47b1e`) | Deezer `15406593` (no Spotify id, so this is what the night exports) | Album *¿Te Acordás... Polaco?* ("el Polaco" = Roberto Goyeneche). Length 2:43 = the **1971-04-24 Troilo / Goyeneche** side (2:44); the 1941 side runs up to 2:53. The credit names only "Aníbal Troilo", so every rule passes | null the resolve entry; re-resolve to a Fiorentino-credited RCA transfer (for example *Yo soy el tango* or *Solo Tango* series) | **H** |
| 180 #03 | El irresistible, D'Arienzo 1936-08-05 (`7a0f253220`) | Deezer `114393194` | Album ***For Export***: RCA Victor's 1960s stereo AVS series (Vol. 2 = AVS-3705, 1966). tango.info has a **1963-11-13** remake (2:39) beside 1951 and 1954 ones. Lengths cannot separate them (1936 2:32 vs 2:35) | null; re-resolve to an *El Rey del Compás* / *(1936) Vol.* transfer | **M–H** |
| 180 #03 | La morocha, D'Arienzo 1937-12-21 (`112e631ee3`) | Deezer `114393200` | Same *For Export* album. Remakes on 1949-04-06 and **1963-11-13** (the same session as *El irresistible*) | null; re-resolve | **M–H** |
| 12 #18, 194 #18 | La bruja, D'Arienzo / Echagüe 1938-08-26 (`c1b0ecf332`) | Spotify `5PIBWcpY6rgEeDDBVZVLDZ` ✓; Deezer `5502056` ✗ | The Spotify id (*Lelia (1938-1939)*, Echagüe credit, 2:18) is the 1938 side. The Deezer track (*Barrio Belgrano – Más grande que nunca*, no singer in the credit, 2:30) is nearer the **1959 Mario Bustos** remake (2:34) than the 1938 side (2:22). It was shared with the Bustos row before round 15. The night shows its 2:30 as the side's length, and the audio features come from it | null the Deezer entry; the length and audio should then come from Spotify | **M** |
| 180 #03 | La viruta, D'Arienzo 1936-12-30 (`ad859d38b0`) | Deezer `13288366` | *Antologia Juan D'Arienzo*, 2:29: between the 1936 side (2:23) and the 1966-07-25 remake (2:33) | listen; else re-resolve | **L–M** |
| 12 #21, 180 #10, 194 #21 | Don Juan, Di Sarli 1941-10-03 (`5ad742a508`) | Deezer `6827784` | 2:46 (*Solo Tango – Instrumental Vol. 1*): nearer the 1951-12-06 side (2:48) than 1941 (2:37). A 1955 side (3:03) also exists | listen | **L** |
| 12 #21, 180 #10, 194 #21 | Organito de la tarde, Di Sarli 1942-11-30 (`defa619562`) | Deezer `1544611092` | 2:49 on album *Organito De La Tarde*: 1942 runs 2:44, 1951 2:51, 1954 2:50. The same album's *El amanecer* (`27569c03ef`, 2:21) fits 1942 (2:27) better than 1951 or 1954 (2:30/2:32), which argues for 1942 | listen | **L** |
| 12 #13 | Al compás del corazón, Caló / Berón 1942-04-29 (`5048ff9748`) | Spotify `1kWYDo9jPmJHNm9AuWrYPV` | The credit names only "Miguel Caló", 2:46. tango.info has 1942 Berón (2:51), 1965 Lucho Gatica (2:51), 1965 Raúl Del Mar (3:11) and an undated Caló track (2:47) | listen (Berón's voice is unmistakable) | **L** |
| 12, 180, 194 (Cambaz cue) | Cambaz – Mor ve Ötesi (`c-tr-2`) | none in the night JSON | `data/cache/resolve/cortinas.json` has Deezer `77595995`, but the night's cortina object carries no `resolved` (the code-defined `c-tr-*` cortinas are not joined to the cache). The export then searches, and cortinas skip every match rule | join the cortina cache for `cortinas.ts` entries | **M** |
| 12 #06 | Me quedé mirándola, Demare / Quintana 1945-03-21 (`4ef77a1149`) | none | No stream: it is exported as "not found", which is correct. The estimate ≈2:50 compares with a real side of about 2:43 | resolve | **H** (data gap) |
| all | Ben Sana Vurgunum – Nükhet Duru | Deezer `1245448462` (*Melankoli*) | Probably a later re-recording (carried over from round 15) | re-resolve to the 1978 original | **L** |

### Checked clean

Every other side checked clean on credit, date and genre against tango.info. That includes:

- the new sides: Rodríguez / Moreno *Un tropezón* and *Yo no sé por qué razón*; Demare / Quintana 1944–45; Troilo milongas and *Malena*; the D'Arienzo / Echagüe milongas, including *El temblor*; *Mandria*; D'Arienzo's *La payanca*, *Jueves* and valses; Biagi instrumentals and Ortiz; Caló / Iriarte; Di Sarli / Rufino *Volver a soñar*; Di Sarli / Durán 1945; Donato / Lagos *Porteña linda*.
- their stream ids, which sit within a few seconds of the dated side and clear of the remakes. Examples: *La payanca* 2:31 against 1936 2:36, 1949 and 1954 3:03, 1966 2:21; *Jueves* 2:25 against 1937 2:33 and 1955 3:09; *Mandria* 2:20 against 1939 2:26 and 1957 2:51.

The cortinas *İşte Öyle Bir Şey* and *Göreceksin Kendini* are now resolved to their original albums ✓.

## 2. Spotify cache sample (30 random kept entries)

**28 right, 0 proven wrong, 2 unverifiable.**

| Row (id) | Cached Spotify id | Verdict |
|---|---|---|
| La cumparsita, D'Arienzo 1951-09-12 (`8201725ca5`) | `2joB3G4b527szRVC6L5VYL`, 3:42, album *Orquesta Juan D' Arienzo – La cumparsita* (no year) | **Unverifiable.** D'Arienzo's 1937, 1943, 1951, 1963 and 1971 versions all run 3:35–4:01, and the album names no year. Spotify has an explicitly dated "La Cumparsita (12-09-1951) – Remastered" (`7ubLgclqVjS0xAjz0iMTCK`, 3:48) that would be the provable choice. **M** |
| La yumba, Pugliese 1946-08-21 (`9108b2e1bb`) | `0tGPciWRMCp1o5P2YlSU79`, 2:47, *The Vast Ocean of Tango* | **Unverifiable.** The 1946 and 1952-11-13 sides both run 2:48. **L** |
| the other 28 | — | Credit, title and length fit the single golden-era performance: Cachirulo, Patria mía, Bélgica, La bruja (Spotify), Abandono, Embrujamiento, Retintín (2:30 = 1936), Viejo portón, Mano blanca, Remembranza, Ataniche, Griseta, Lejos de ti, Más solo que nunca, Pájaro herido, Mala suerte (Rotundo / Sosa 1954), Lonjazos, El último adiós, Alma de bohemio, Un copetín, Marejada, El abrojito, Campo afuera, Milonga compadre, Florida, Barrio reo, Por un beso de amor, Lo pasado pasó |

### Index notes from the sample (dates, not stream ids)

- *Abandono* (Láurenz / Farrel, `6799152723`): the index has 1937-10-18; tango.info has 1937-09-24. **L–M**
- *Milonga compadre* (`8f5b9de6b5`): the index has 1938-05-12 (2 tracks); the main take on tango.info is 1938-05-15 (13 tracks). **L**
- *Un copetín* (Polito, `0ab97d87bf`): undated in the index; tango.info has 1953-03-06. **M**

## 3. Fixes by id

```jsonc
// data/cache/resolve/tracks.json (Deezer)
"cbe0e47b1e": null   // El bulín 1941 → was the 1971 Goyeneche side (¿Te Acordás... Polaco?)
"7a0f253220": null   // El irresistible 1936 → was "For Export" (1963)
"112e631ee3": null   // La morocha 1937 → was "For Export" (1963)
"c1b0ecf332": null   // La bruja 1938 → was "Más grande que nunca" (≈1959 Bustos); keep the Spotify id
// listen, then keep or null: ad859d38b0 La viruta, 5ad742a508 Don Juan, defa619562 Organito de la tarde

// data/cache/spotify/tracks.json
"8201725ca5": "spotify:track:7ubLgclqVjS0xAjz0iMTCK"   // the dated 1951-09-12 Cumparsita (verify length 3:48 in the cache entry)
// listen: 5048ff9748 Al compás del corazón (Caló-only credit)

// songs.json: dates
"6799152723": { "date": "1937-09-24" }   // Abandono (L–M)
"0ab97d87bf": { "date": "1953-03-06" }   // Un copetín

// cortinas: night JSON must carry the cached resolve for code-defined cortinas (c-tr-2 Cambaz has Deezer 77595995)
```

## 4. Rule gaps: traps the current rules still let through

I ran each trap through `matchProblem()` with tsx. In the table, **ACCEPTED** means the wrong recording passes the rules.

| # | Trap | Example (run) | Result | Where it bites |
|---|---|---|---|---|
| G1 | **Deezer matches are never judged.** `matchProblem` runs only on Spotify (the `audit_spotify` cache audit, the web matcher, `spotifyPlan`). `audit_streams` checks Deezer only for shared ids and title dates. The Deezer duration is then used as the **reference** for judging Spotify | El bulín / *¿Te Acordás... Polaco?*, El irresistible / *For Export* | not checked | §1: all three Deezer remakes. A wrong Deezer reference also corrupts the Spotify length test |
| G2 | **The album has no year, so a remake passes.** `albumSpan` only works when the album names a year, and length bands overlap across D'Arienzo and Di Sarli remakes | "El Irresistible" / "Juan D'arienzo Y Su Orquesta Tipica" / *For Export* / 2:35 | ACCEPTED | D'Arienzo, Di Sarli, Pugliese, Canaro, Troilo remakes |
| G3 | **An album span is tested by its first year only** (`span[0] > year + 2`) | album "Juan D'Arienzo 1935-1972" for a 1935 row | ACCEPTED | wide compilations that include remakes |
| G4 | **A credit only has to contain the leader's surname** (`credit.includes(own)`) | Donato Racciatti → Edgardo Donato; Rafael Canaro / Luis Scalón → Francisco Canaro; Los Solistas de D'Arienzo → D'Arienzo; Quinteto Pirincho (Canaro) → Canaro Orquesta Típica | all ACCEPTED | Donato, Canaro, D'Arienzo rows |
| G5 | **Any "Orquesta"/"Orchestra"/"Típica" word satisfies the credit test**, and leaders outside `LEADERS` (Típica Víctor as "victor", modern orchestras) do not count as "another orchestra" | "El incendio" by "Orquesta Típica Víctor" for a Di Sarli row; "La Cumparsita" by "Orquesta Típica Misteriosa Buenos Aires" for Tanturi | both ACCEPTED (the web scorer's −40 usually sinks them, but cached and remembered ids are judged by `matchProblem` alone) | covers, other orchestras |
| G6 | **A title contained in a longer title** (`sameWork` containment, `short.length ≥ 4`) | "Recuerdo malevo" for Tanturi "Recuerdo"; "Nada más" for Caló "Nada" | both ACCEPTED (same orchestra and singer, so the scorer adds +30/+8) | short titles: Recuerdo, Nada, Todo, Corazón, Gitana, Farol… |
| G7 | **An instrumental row accepts a vocal recording whose credit names no singer.** Spotify and Deezer often credit only the orchestra | "Recuerdo" (1941 Castillo vals), credit "Ricardo Tanturi", for the 1942 instrumental row | ACCEPTED | D'Arienzo 1938–40 Echagüe estribillos, Tanturi, Biagi |
| G8 | **Rhythm is never compared.** A vals and a tango of the same title by the same orchestra cannot be told apart (no metre or genre field from the provider, and no length band per rhythm) | the Tanturi *Recuerdo* pair | ACCEPTED | same-title vals/tango pairs |
| G9 | **Voices outside `CANON_SINGERS` do not count as another singer** (Mario Bustos, Armando Laborde, Horacio Palma, Lucho Gatica, Raúl Del Mar, Héctor Mauré's successors…) | "La bruja" credited "Juan D'Arienzo, Mario Bustos" for the Echagüe row | ACCEPTED | every 1950s–60s remake with a later singer. Use `knownSingers(songs)` (all index singers), as `streams.ts` already does, not a hand list |
| G10 | **The singer alone satisfies the credit test.** A soloist's own later recording of an orchestra hit passes when its album carries no year | "Así se baila el tango" by "Alberto Castillo" for Tanturi / Castillo | ACCEPTED (rejected in my run only because I put "1950" in the album) | Castillo, Vargas, Rufino, Fiorentino, Berón solo careers |
| G11 | **Cortinas skip every rule** (`rejectReason` returns null when `vocal` is undefined), and code-defined cortinas reach the export with no cached stream | Cambaz has no `resolved` in the night JSON | not checked | any cue: duets, live versions, karaoke, covers |
| G12 | **The scorer's year bonus uses the album release date** (`albumYear`, ±3 years), which for golden sides is a CD or streaming reissue year, never the recording year. Among a 1938 side and its 1959 remake, the pick is decided by title noise and duration only | — | design | all re-recorded titles |
| G13 | **No reference length for unresolved rows.** `durationEstimated` disables the length test, and a Deezer restoration is excluded as reference. With no tango.info or listado length in the index, most rows have no reference at all | Cumparsita 1951 (3:42) against 3:35–4:01 for five D'Arienzo versions | ACCEPTED | every row without a trusted length |

### Rules to add (each with a vitest invariant first)

- **M1. Judge Deezer exactly as Spotify** (fixes G1). Run `matchProblem` over `resolve/tracks.json` in `audit_streams`. Never use an unjudged Deezer length as the Spotify reference.
- **M2. Known-remake album list** (G2). Reject albums matching `/for export|m[aá]s grande que nunca|est[eé]reo|stereo|te acord[aá]s.*polaco|\b19[5-9]\d\b(?!.*19[34]\d)/i`, plus a curated list of LP titles per orchestra. When the orchestra has a remake of the title in the index (`songs.json` same orchestraId + normTitle, year ≥ row + 5), require **positive** evidence for the original. Accepted evidence: an album span inside the golden years, the recording date in the title, the golden singer named in the credit, or a length closer to this side than to every remake. Otherwise export "not found".
- **M3. Whole-word leader match** (G4, G5). The credit's orchestra token must equal the row's leader as a full name ("donato racciatti" ≠ "edgardo donato"; "rafael canaro" ≠ "francisco canaro"). Reject "solistas de", "quinteto", "trío", "sexteto" and "orquesta típica victor" unless the row is that ensemble. Drop the bare "orquesta|tipica" pass: require the leader's surname or the row's singer.
- **M4. Title equality, not containment** (G6). Accept equal bare titles, an `altTitles` entry, or a containment only when the extra words are a known decoration (remaster, instrumental, a date). Never accept containment when the index holds another work by the same orchestra whose title equals the candidate ("Recuerdo malevo" exists, so "Recuerdo" may not take it).
- **M5. Instrumental rows need a positive instrumental signal** (G7, G8) when the same orchestra has a vocal recording of the same title. Accept an "instrumental" tag, a length distinct from the vocal side, or an album of instrumentals; otherwise "not found". Add a rhythm length band (vals ≤ 2:50 for 1935–45 Tanturi / Biagi / Rodríguez) as a weak check.
- **M6. All index singers count** (G9, G10). Build the singer list from every `singer` in `songs.json`. A credit naming only a singer, with no orchestra, is a solo recording unless the row has no orchestra.
- **M7. Cortinas get the same title, artist and length rules** (G11), against their `year` and a list of duet, live and re-recording albums. Code-defined cortinas must carry their cached resolve into the night JSON.
- **M8. Store a reference length per golden row** (G13), from tango.info or the listado, so the length test always has a trusted reference. Prefer a dated stream title ("(12-09-1951)") when one exists.
