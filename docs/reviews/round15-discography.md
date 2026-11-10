# Round 15: discographic review of the round-14 best nights (seeds 255, 97, 156)

Read-only second pass. This review covers:

- every side and cortina in `scratchpad/best6/seed-{255,97,156}.{txt,json}`: 67 tandas, 126 distinct sides including the shared closer, and 28 distinct Turkish cortinas;
- a check that the round-14 corrections (`docs/reviews/round14-discography.md` §2) landed in `data/index/songs.json`, `data/cache/spotify/tracks.json` and `data/cache/resolve/tracks.json`;
- the re-recording audit (R4) of every Spotify and Deezer match in these nights. Round 14 did not do it (`docs/specs/round14-engine.md`, "Not done").

Method. Every side was checked against its tango.info work page (performance list: performers, genre, date, track lengths), with scripted pulls. Titles with more than 100 tango.info works ("Recuerdo", "Corazón", "Todo", "Nada") were checked by reading every work page. The R4 audit compares four things for each side:

- the Spotify length,
- the Deezer length,
- the tango.info length of the dated performance,
- the album title of each match (later-year ranges, "live", "(63-71)"-style ranges).

It also flags any stream id that the caches bind to more than one index row. Confidence: **H** = tango.info and the index (or the stream title) agree on the fault; **M** = one source or an inference; **L** = needs a listen.

## Verdict

**Discographically clean: no.** Night 255 is not clean; nights 97 and 156 are clean apart from L-level flags.

- **Night 255 has one blocker.** Its closing tanda #21 (Tanturi / Castillo) contains *Recuerdo* (`79264f596c`, "1942"). The index credits it as a Castillo vocal tango. tango.info lists the 1942-11-04 *Recuerdo* as an **instrumental**. The Deezer track bound to this row is a different recording: the Castillo **vals** *Recuerdo* of 1941-01-08 (its title reads "Buenos Aires 08/01/1941"). So a vals plays in the closing tango tanda.
- **Night 97 is clean** for credits, dates, rhythms and stream versions.
- **Night 156 is clean**, with one L-level flag. The *Tengo mil novias* stream (in tanda #02; night 255 also plays it, in #14) runs 37 s shorter than the 1939 side, and its Deezer credit names Armando Moreno. That needs a listen.

Every other side in the three nights matches a tango.info performance by the same orchestra on the same date, with the right singer or instrumental status and the right genre. All sides fall inside 1935–45. No title repeats within a night.

## 1. Problems found in the three nights

| Night | Tanda | Title (id) | Field | Current | Correct | Source / conf. |
|---|---|---|---|---|---|---|
| 255 | 21 Tanturi / Castillo (close) | Recuerdo (`79264f596c`) | singer, vocal | Alberto Castillo, vocal tango, 1942-11-04 | **Instrumental** (`singer: null`, `vocal: false`). It cannot sit in a Castillo tanda | tango.info T0370025834 #52: 1942-11-04, "– zxx", 13 tracks. **H** |
| 255 | 21 | Recuerdo (`79264f596c`) | stream (R4) | Deezer `1903385817` "Recuerdo (Buenos Aires 08/01/1941 Restauración 2022)", 2:27. Shared with `3a302c4ffd` | That track is the **1941-01-08 Castillo vals** (`3a302c4ffd`, tango.info T0370032566). Unbind it from `79264f596c`; the instrumental tango of 1942 (about 3:09) has no stream yet. Swap the side for a streamable 1941–42 Castillo tango from the index: *Recuerdo malevo* (`130fe70e7e`), *Cuatro compases* (`cea5ebafcd`, 1942-11-04, same session) or *Ese sos vos* (`049b418d3c`). (*El tango es el tango* `e2ffe2748b` shares its Deezer id with 1956–70 Roca rows, so it needs the R4a check first) | stream title + tango.info. **H** |
| 255, 156 | 14 / 02 Rodríguez / Flores vals | Tengo mil novias (`8af1ef5bd0`) | stream (R4) | Deezer `7479445`, 2:31, artist "Enrique Rodriguez cantan Armando Moreno y Chato Flores", album *26 grandes tangos* | The 1939-10-10 side is listed up to 3:08 (8 tracks). tango.info also lists an unattributed "Roberto Flores" track of exactly 2:31. The match is either the right side in a short transfer or a different recording. Check by ear before it opens a tanda | tango.info T0370028220. **L–M** |
| 255, 97 | 07 Di Sarli instr | Milonguero viejo 1940 (`df28764a9b`) | stream (R4) | Deezer `6824859` (*Serie 78 RPM 1940-1947*), 2:18, **also bound to the 1944 row `e2fd0a604b`** | 2:18 fits 1940-07-04 (about 2:24), not 1944-07-11 (about 2:43). The nights get the right audio, but the 1944 row has the wrong stream. Unbind `e2fd0a604b` | tango.info T0370019149. **M** |
| 255, 97, 156 | 09 D'Arienzo / Echagüe | Pensalo bien (`58db812968`) | length (R4) | Spotify 2:17 (album *Pensalo bien*); Deezer 2:30 (*El Rey del Compás (Remastered)*) | tango.info has one D'Arienzo performance only (1938-06-22, about 2:27), so there is no remake to confuse it with. The Spotify transfer is short or sped up. Prefer the Deezer duration | **L** |
| 255, 97, 156 | 18 D'Arienzo instr (peak) | El esquinazo (`29ff009db8`), El porteñito (`8ba26dd366`, 255 only) | rhythm | tango | tango.info: milonga / "milonga tangueada" (Villoldo). Kept as tango by DJ custom; still a flag, not an error (round 14 §1.1) | **L** |
| 255, 97, 156 | 11 / 05 Donato / Lagos milonga | La mimada (`f5e7badcf6`) | stream / length | no stream; ≈2:00 estimated | Real side about 2:27 (tango.info T0370019172). Still unstreamable after the round-14 re-resolve | **H** (data gap) |
| 255, 97, 156 | 19 / 08 Caló / Iriarte vals | El mismo dolor (`fd1fe69a63`) | stream / length | no stream; ≈2:25 estimated | 1945-11-15 vals, about 2:42 (tango.info T0370233025) | **H** (data gap) |
| 97 | 14 Biagi / Falgás vals | El Último Adios (`63f9f276ae`) | title | "El Último Adios" | **El Último Adiós** | tango.info T0370075265. **H** |
| 97 | 01 Rodríguez / Moreno | Como Has Cambiado, Pebeta! (`f1acd1338d`) | title | "Como Has Cambiado, Pebeta!" | **¡Cómo Has Cambiado, Pebeta!** (tango.info: "Cómo has cambiado pebeta") | **H** |
| 97 | 01 | Mírame de Frente (`4383a7d337`) | title | "Mírame" | **Mirame de Frente** (voseo; label and tango.info) | **M** |
| 255, 156 | 14 / 02 Rodríguez / Flores vals | Fru Fru (`67af743962`) | title | "Fru Fru" | Fine; add altTitle **"Frou Frou"** (tango.info "Frou frou \| Fru fru") so lookups match | **M** |
| 255, 97, 156 | 03 / 21 Troilo instr | Milongueando en el Cuarenta (`f96fa56eaa`) | title | unchanged | **Milongueando en el 40** (the label prints "'40"). Proposed in round 14, not applied | **M** |
| 156 | 14 Biagi / Ibáñez vals | Loca de Amor (`4aa613f1d2`) | title | unchanged | tango.info has "La loca de amor"; check the label | **L** |

The length band holds once lengths are measured. The long sides are genuine and need no change: Canaro / Maida milongas *Largá las penas* (3:12; tango.info 3:10) and *Milonga criolla* (3:07; 3:05); Pugliese *Tierra querida* and *Farol* (3:20; 3:25 on tango.info); *La abandoné y no sabía* (3:13). The short sides are genuine too: Biagi / Falgás valses *El último adiós* (2:06; 2:12) and *Dichas que viví* (2:08; 2:20).

### Cortinas

| Night(s) | Cortina (id) | Field | Current | Correct | Conf. |
|---|---|---|---|---|---|
| 255, 97 | İşte Öyle Bir Şey – Erol Evgin (`c-tr-evgin-iste-oyle`) | audio | Deezer match on *Altın Düetler* (a duets album) | Re-resolve to the 1976 single or 1977 LP solo recording (round 14, not done) | **M** |
| 156 | Göreceksin Kendini – Nilüfer (`c-tr-nilufer-goreceksin`) | audio | Deezer match on *Yeniden Yetmişe* (a later re-recording); year now 1973 ✓ | Re-resolve to the 1973 single or *Nilüfer '74* | **M** |
| all | Haram Geceler – Nilüfer (`c-tr-nilufer-haram`) | identity, audio, year | no year; Deezer match on *Yine Yeni Yeniden* | Nilüfer's best-documented recording is on the duets album *12 Düet* (song by Adnan Ergil). Check whether the Deezer track is a solo original or a duet or re-recording, and add the year | **L** |
| all | Ben Sana Vurgunum – Nükhet Duru (`c-tr-duru-ben-sana`) | audio | Deezer match on *Melankoli*; year now 1978 ✓ | *Melankoli* is probably a later re-recording; re-resolve to the 1978 original | **L** |
| all | Sil Baştan – Şebnem Ferah (`c-tr-ferah-sil-bastan`) | year | none | **2001** (*Perdeler*). The Deezer match on *Perdeler* is right | **M–H** |
| all / 97 | Yaz Gazeteci Yaz (Selda Bağcan), Bu Kalp Seni Unutur mu (Fikret Kızılok), İstanbul'da Sonbahar (Teoman) | year | none | Add release years. The credits are right | **L** |

The other 20 cortina credits and years are right, including the new ones: *Kış Güneşi* (Tarkan, 1994, *Aacayipsin*), *Sen Ağlama* (Sezen Aksu, 1984), *Tamirci Çırağı* (Cem Karaca, 1975), *Bir Derdim Var* (Mor ve Ötesi, 2004), *Senden Daha Güzel* (Duman, 2009). The round-14 year fixes have landed: Olmasa Mektubun 1986, Göreceksin Kendini 1973, Bambaşka Biri 1979, Peki Peki Anladık 1985, Ben Sana Vurgunum 1978. No cortina without audio appears in these nights; `c-tr-1` and `c-tr-4` stay out of the pools.

## 2. Did the round-14 fixes land?

| Fix | Status in `data/index/songs.json` / caches |
|---|---|
| Trago amargo `9df440312c` → Echagüe vocal | ✓ Landed. The side now plays correctly in the Echagüe tandas (255 #09, 156 #09) |
| Champagne tango `f0c378b199` → Quinteto Don Pancho, 1938-05-09 | ✓ (`orchestraId: quinteto-don-pancho`) |
| La zandunga `5ac52c1b19` → other, 1939-07-14 | ✓ `rhythm: "other"`, but **`rhythmCode` is still `"V"`**. The engine reads `rhythm`, so this is cosmetic. 16 more rows have a `rhythmCode` that contradicts `rhythm` (for example `c55a9f1e10` Arrabal tango/M, `3de554b36d` Pregonera vals/T), and 49 `other` rows carry T |
| El lengue `b41093302a` → milonga | ✓ `rhythm: "milonga"`; same stale `rhythmCode: "T"` |
| Marcheta `06146844d4` + Spotify "Domy Castellano" match deleted | ✓ Title "Marcheta", altTitle "Marquita". No "Domy" or "Marchantia" left in `spotify/tracks.json` |
| Tal vez será su voz split | ✓ `215948d8ab` 1943-09-13; new row `d9e8b99942` "Tal Vez Será mi Alcohol" 1943-05-06 |
| Qué buena es merge `bf32d35a4f` → `e5a625fa47` | ✓ (`altIds`) |
| Dates: Viejo portón, Unión Cívica (Biagi), El cencerro, A mí no me interesa | ✓ all four |
| Titles by work (Adiós, Arrabal · Dime, mi Amor · Lejos de Ti · Un Crimen · Ya Sé… · Qué Buena Es · Cómo Se Hace… · Este Es… · Pa' Qué Seguir · Qué Noche · ¿Por Qué…? · Re Fa Si · Don Álvaro · Milonguero Viejo [alt Fresedo] · Comme Il Faut · Shusheta) | ✓ all spot-checked. "Milongueando en el 40" and "La loca de amor" were not applied (the second was **L** anyway) |
| Cortina years | ✓ (see above). The *Altın Düetler* and *Yeniden Yetmişe* audio matches remain (listed as not done) |

## 3. Re-recording audit (R4) of these nights' stream matches

All 126 sides were audited. 124 have a Spotify or Deezer match; *La mimada* and *El mismo dolor* have none. Result:

- **No match is a later remake mislabelled as the golden-era side.** Every flagged album with a year range is a compilation that covers the right years: Tanturi *Noche de tango (1940–1950)* and *Igual que un bandoneón (1940–1950)*; Pugliese *Las primeras grabaciones 1943–1944*. Every match is within 6 s of the tango.info length of its dated performance, or longer only by restoration padding: the Deezer "Restauración 2022/2025" Tanturi tracks run 10–15 s long. For those, keep the Spotify duration.
- **The real fault is one stream id bound to several index rows.** In `data/cache/resolve/tracks.json`, 146 Deezer ids are bound to more than one row, and **118 of them join rows recorded 5 or more years apart.** In these nights the golden-era row holds the right audio in every case but one. The later rows hold the wrong audio:

| Side in the nights | Deezer id | Also bound to (wrong) |
|---|---|---|
| Recuerdo, Tanturi (`79264f596c`, 1942 instrumental) | `1903385817` | the **source** row `3a302c4ffd` (1941 vals). The night row is the wrong one here: **H**, see §1 |
| Corazón, Di Sarli / Rufino 1939 (`e5cccb8a87`) | `91936698` (album *(1939-1940), Vol. 4*) | `653396cb92` Corazón / Mario Pomar 1955 |
| El incendio, Di Sarli 1940 (`71c0f22c8e`) | `91936716` | `93f9aa226a` El incendio 1951 |
| Milonguero viejo, Di Sarli 1940 (`df28764a9b`) | `6824859` | `e2fd0a604b` Milonguero viejo 1944 |
| La catrera, D'Arienzo 1938 (`e8b4996607`) | (album *1935–1938, Volume 1*) | `1061490d35` 1949, `a4018188aa` 1955, `f2bdbd9bb4` 1963 |
| Humillación, Biagi / Ortiz 1941 (`01adff4c81`) | `87115561` | `5bcb61830c` Hugo Duval, undated radio side |
| La mulateada, Di Sarli / Rufino 1941 (`16baa4103e`) | `803071282` | `d668b07297` Jorge Durán, undated |

The same pattern exists outside these nights. Spot checks: Yo también soñé (Maida 1936 = Arenas-Lucero = Alonso 1951), El pollo Ricardo (1940 = 1946 = 1951), Nueve puntos (1943 = 1952 = 1956), Verdemar (Rufino 1943 = Serpa 1953/55), Joaquina (1935 = 1943 = 1953), Garúa (Troilo: Fiorentino 1943 = Goyeneche 1962/73), Muchacho (D'Agostino: Vargas 1940 = Cané 1953). Any 1950s night, or a later-era family, would play golden-era audio under a 1950s label. The reverse also happens wherever the 1950s row was resolved first.

## 4. Index corrections (by id)

```jsonc
// songs.json (scripts/build_index.py ID_PATCH)
{ "id": "79264f596c", "singer": null, "singerId": null, "vocal": false }        // Recuerdo, Tanturi 1942-11-04: instrumental (tango.info T0370025834)
{ "id": "63f9f276ae", "title": "El Último Adiós" }
{ "id": "f1acd1338d", "title": "¡Cómo Has Cambiado, Pebeta!" }
{ "id": "4383a7d337", "title": "Mirame de Frente" }
{ "id": "67af743962", "altTitles": ["Frou Frou"] }
{ "id": "f96fa56eaa", "title": "Milongueando en el 40", "altTitles": ["Milongueando en el Cuarenta"] }
// rhythmCode must be re-derived from rhythm after ID_PATCH (5ac52c1b19 → "ND", b41093302a → "M", and the 16 + 49 rows listed in §2)

// data/cache/resolve/tracks.json: unbind the wrong owners of a shared Deezer id
"79264f596c": null      // keeps 1903385817 for 3a302c4ffd (the 1941 vals) only
"e2fd0a604b": null      // 6824859 is the 1940 Milonguero viejo
"653396cb92": null      // 91936698 is the 1939 Corazón
"93f9aa226a": null      // 91936716 is the 1940 El incendio
"1061490d35": null, "a4018188aa": null, "f2bdbd9bb4": null   // La catrera 1949/55/63 hold the 1938 track
"5bcb61830c": null, "d668b07297": null                        // undated radio/compilation rows
// …and the remaining ≈110 cross-year shares: keep the row whose year fits the album title or length; null the rest

// data/cache/resolve/tracks.json: verify by ear
"8af1ef5bd0"            // Tengo mil novias: 2:31 Deezer track vs 1939 side up to 3:08; credit names Moreno

// cortinas (data/knowledge/cortinas.json)
c-tr-ferah-sil-bastan    year 2001
c-tr-evgin-iste-oyle     re-resolve (not "Altın Düetler")
c-tr-nilufer-goreceksin  re-resolve (not "Yeniden Yetmişe")
c-tr-duru-ben-sana       re-resolve (not "Melankoli")      [L]
c-tr-nilufer-haram       verify the credit and recording; add a year  [L]
c-tr-selda-yaz-gazeteci, c-tr-kizilok-bu-kalp, c-tr-teoman-sonbahar   add years
```

## 5. Rules (new or sharpened; each needs a vitest invariant first)

1. **R4a: one stream id, one recording.** A Spotify or Deezer id may be bound to at most one `songs.json` row, or to rows with the same orchestra, normTitle and date (takes and `altIds`). Fail the build when one id joins rows of different dates or singers. When it does, keep the row whose year fits the album title (a year range that contains it, a "78 RPM" or "1935–1938" style range) and whose length is within ±8 s of the known side; null the others. This one check would have caught *Recuerdo*, Milonguero viejo 1944 and the 118 cross-year shares.
2. **R4b: the stream title carries a date.** Restoration titles such as "(Buenos Aires 08/01/1941 Restauración 2022)" state the recording date. Parse it with `/\b(\d{1,2})\/(\d{1,2})\/(19\d\d)\b/` (day/month/year) and reject the match when it differs from the row's `date` by more than 2 days. This would also have caught *Recuerdo* (stream 1941-01-08, row 1942-11-04).
3. **R4c: duration agreement.** Accept a match only if its length is within −14/+8 s of the side's reference length (tango.info, listado, or the other provider). Allow +16 s for titles carrying "Restauración" or "Remaster", and take the duration from the other provider. Below −14 s (*Tengo mil novias*, Spotify *Pensalo bien*), mark the match `matchSuspect`.
4. **R4d: the credit names a singer the row does not have.** When the stream artist string names a singer who is not the row's singer, mark the match `matchSuspect`. Example: "cantan Armando Moreno y Chato Flores" on a Flores-only row.
5. **R6b: vocal flag versus tanda family.** A side whose index singer is X but whose tango.info language is `zxx` (instrumental) must not enter an X tanda. Run it as a build-time lint against an exported tango.info performance list, or at least on the golden families. Two cases so far: Trago amargo (round 14) and Recuerdo (round 15).
6. **R13: `rhythmCode` is derived, never patched.** Recompute `rhythmCode` from `rhythm` after every patch step: tango T, vals V, milonga M, other ND. Add an invariant that no row has a code that contradicts its rhythm.
7. **R12b: cortina metadata completeness.** Every cortina in an active pool needs a `year`, and its resolved album must not match `/D[üu]et|Yeniden|Yine Yeni|Live|Konser|Remix|Version/i` unless that version was chosen on purpose.
