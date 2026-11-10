# Round 14: discographic review of three golden-era 4-hour nights

Read-only review by a discographer. I checked seeds 148, 36 and 138 (`scratchpad/best5/seed-{148,36,138}.{txt,json}`): 69 tandas, 171 distinct tango sides plus 2 closers, and 23 distinct Turkish cortinas. Every side was checked against tango.info's work and performance pages (title, genre, performers, recording date, track lengths). I pulled those pages with a script, one search per title, and read the performance list for the orchestra. Where tango.info has nothing, I say so. I also used my own catalogue knowledge, the index (`data/index/songs.json`), the stream caches (`data/cache/spotify/tracks.json`, `data/cache/resolve/tracks.json`) and the cortina lists (`packages/core/src/cortinas.ts`, `data/knowledge/cortinas.json`). el-recodo.com refused automated requests (HTTP 403), so it was not used.

Confidence: **H** = tango.info states it and it agrees with standard discography. **M** = one good source, or an inference from several sources. **L** = needs a listen or a second source.

## Overall verdict

The index is in good shape for these nights. It comes from the TangoDJ listado and has exact recording dates. Of 171 sides, 164 match a tango.info performance of the same orchestra on the same day or within one day, with the right singer or the right instrumental. No side is a 1950s or 1960s remake carrying a golden-era date. The real problems are:

1. **One wrong singer credit.** D'Arienzo, *Trago amargo* (1939-12-22) is a vocal side with Alberto Echagüe, but it is indexed as an instrumental and played in an instrumental tanda.
2. **One wrong orchestra credit.** Canaro, *Champagne tango* (1938) is a Quinteto Don Pancho side (1938-05-09), not the Orquesta Típica. It is undated in the index and sits in an Orquesta Típica tanda.
3. **One non-tango in a vals tanda.** Lomuto, *La zandunga* is a Mexican popular song (canción popular mexicana).
4. **One wrong stream match.** Biagi, *Marchetta* points at a track by another artist ("Domy Castellano – Marchantia"). The real title is *Marcheta*.
5. **Lengths are mostly estimates.** 59 of the 171 sides have no stream match. Their "length" is `estimateDuration()` (base length + era shift + hash jitter, ±15 s), not a measured length. Several of those estimates are 15–30 s off the real side.
6. **Title junk and orthography.** About 25 titles: lower-cased alternative titles in brackets ("(fresedo)", "(mi Alcohol)"), wrong accents, missing commas and question marks.
7. **Rhythm conflicts with tango.info**, on three sides played in tango tandas: *El lengue* (Donato), *El esquinazo* and *El porteñito* (D'Arienzo).
8. **Cortinas.** All 23 artist credits are correct. Five years are wrong, two cortinas have no audio, and two audio matches are probably later re-recordings or duet versions.

## 1. Problems found

Night = seed. Tanda = the two-digit index in the `.txt` listing. Ids are `songs.json` ids. The *real length* column gives the longest track length tango.info lists for that exact performance. That is an upper bound: transfers with silence run long.

### 1.1 Credits, dates, rhythm and identity

| Night | Tanda | Title (id) | Field | Current | Correct | Source / conf. |
|---|---|---|---|---|---|---|
| 148 | 18 D'Arienzo instr 1939 | Trago amargo (`9df440312c`) | singer / vocal | instrumental (`singer: null`, `vocal: false`) | **Alberto Echagüe** (estribillo), `vocal: true`. This puts a vocal side in an instrumental tanda. Swap it for a 1939 instrumental from the index: *Derecho viejo* (`5469ace121`, 1939-07-17), *El Marne* (`e996c17471`, 1939-05-04) or *Pico blanco* (`14ac882e7c`, 1939-01-04). *Por qué razón* (`9f37fdd42f`) comes from the same 1939-12-22 session and may also have an Echagüe estribillo (not checked, **L**) | tango.info T0370028708: 1939-12-22, D'Arienzo / Echagüe, 7 tracks. **H** |
| 138 | 01 Canaro instr 1937–38 | Champagne tango (`f0c378b199`) | orchestra, date | Francisco Canaro (Orquesta Típica), year 1938, `date: null`, album "TRA LA LA" (a mixed compilation) | **Quinteto Don Pancho, dir. F. Canaro**, 1938-05-09. tango.info lists no Orquesta Típica Canaro recording. A quinteto side does not belong in an Orquesta Típica tanda. Replace it with *Se lo llevaron* (`8ae77961c7`, 1937-06-18) | tango.info Z0000000776 (performances 18–19). **H** for the discography; **M** that the file is the quinteto side (no stream match to listen to) |
| 148 | 02 Lomuto / Díaz vals | La zandunga (`5ac52c1b19`) | rhythm, date | vals, 1939-08-01 | **Canción popular mexicana** (a son istmeño in 3/4, not a vals criollo), 1939-07-14. Danceable at a push, but not a vals for a golden-era vals tanda. Replace it with **Bajo el cielo azul** (`529f9bc335`, 1942-01-08, Díaz), a standard Lomuto vals | tango.info Z0999900529. **M–H** |
| 36, 138 | 08 Biagi vals 1941 | Marchetta (`06146844d4`) | title, Spotify match, length | "Marchetta". Spotify `4DdsJxqSxjtOJfHwMH6h6A` = "Domy Castellano – Marchantia" (album *Maritima*). Length 2:15 taken from that wrong track | **Marcheta** (Schertzinger's *Marcheta*, label "Marchéta (Marquitta)"), instrumental vals, 1941-12-03, about 2:45. Delete the Spotify match | tango.info Z0000515266. **H** |
| 148 | 13 Demare / Berón | Tal vez será su voz (mi alcohol) (`215948d8ab`) | title / date | "Tal Vez Será su Voz (mi Alcohol)", 1943-05-13 | Demare and Berón recorded it twice in 1943: **"Tal vez será mi alcohol" on 1943-05-06** (the original Manzi lyric) and **"Tal vez será su voz" on 1943-09-13** (the censored lyric, the one usually played). The row mixes the title of one with a date near the other. Check the album track: if it is the "su voz" lyric, date it 1943-09-13; if it is the "mi alcohol" lyric, title it so and date it 1943-05-06 | tango.info T0370199282 (performances 5, 6). **M** |
| 138 | 07 Donato instr | El lengue (`b41093302a`) | rhythm | tango | tango.info files the 1940-12-13 side as **milonga** (8 tracks; one entry says "tango milonga"). It is fast and in 2/4, and many DJs play it in a Donato milonga set. Mark it `milonga`, or at least keep it out of a tango tanda that has slower sides like *El estagiario* | tango.info T0370167079. **M** |
| 36 | 18 D'Arienzo instr 1938 | El esquinazo (`29ff009db8`) | rhythm | tango | tango.info: **milonga** (Villoldo's tango-milonga). The 1938 side is commonly played in D'Arienzo tango tandas, so this is a style call, not an error. Flag it rather than change it | tango.info T0370238586. **L–M** |
| 138 | 18 D'Arienzo instr 1937–38 | El porteñito (`8ba26dd366`) | rhythm | tango | tango.info: "milonga tangueada" (Villoldo). As for *El esquinazo*: keep it as tango but flag it | tango.info T0370238633. **L** |
| 148 | 08 Biagi / Ibáñez vals | Viejo portón (`bf6e0c24a9`) | date | 1938-10-16 | 1938-10-17 | tango.info T0370029836. **M** |
| 148 | 16 Biagi instr | Unión Cívica (`f94dd3fd89`) | date | 1938-10-16 | 1938-10-17 (Biagi's first session) | tango.info T0370029381. **M** |
| 36, 138 | 03 / 18 D'Arienzo instr | El cencerro (`2a56a78278`) | date | 1937-12-08 | 1937-12-09 | tango.info T0370006260. **M** |
| 36 | 22 Biagi / Falgás | A mí no me interesa (`4d0e9d5353`) | date | 1940-04-18 | 1940-04-12 | tango.info T0370108750. **M** |
| 148, 36, 138 | 11 / 17 Tanturi / Castillo milonga | Mi morocha (`cf831a1d1f`) | take | 1941-09-18 | Right. tango.info also lists a 1941-08-18 performance (2 tracks): an unissued or alternate take. Keep 09-18 | tango.info T0370125975. **M** |
| 148, 138 | 09 D'Arienzo / Mauré | Tierrita (`28fed4bc62`) | take | 1941-06-09 | Right. A 1941-06-06 take also exists (2 tracks). Keep 06-09 | tango.info T0370028424. **M** |
| 148 | 19 Pugliese / Morán | El abrojito (`1cd41e9d06`) | take | 1945-07-24 | Right (18 tracks). A 1945-07-16 take exists (1 track) | tango.info T0370085805. **M** |
| 148 | 05 Donato / Lagos milonga | Sacale punta (`d4cea2d7f9`) | singer | Horacio Lagos | tango.info lists "Randona, Horacio Lagos". Lagos is the lead; the second name is probably a dúo partner. No change, informational | tango.info T0370026542. **L** |
| 36 | 01 Donato / Lagos | Hacete cartel (`7a568f8282`) | take | 1937-07-16 | Right. tango.info also lists a 1937-10-16 recording and a version with chorus. Make sure the audio is the July side | tango.info Z0999900706. **L** |
| 36 | 06 / 21 De Angelis / Martel | Qué buena es (`e5a625fa47`) | duplicate | Two index rows for the same 1943-07-23 side: `e5a625fa47` and `bf32d35a4f` ("J. Martel - Glosa Néstor Rodi"). The heat shows as "h?" | Same recording; the second row is the label credit with the glosa. Merge it into `e5a625fa47` (as an `altIds` entry) so it cannot be played twice and the heat resolves | index + tango.info T0370187431 (only one 1943 performance). **H** |
| 148 | 00 Canaro / Maida | Yo también soñé (`7d4ea0ee12`) | two versions in the period | Maida 1936-03-12 | Canaro also recorded it with **Charlo on 1935-12-31** (index `fdc1057716`), and again in 1951 with Mario Alonso. For dancing, the Maida side is the one to play: shorter, with a straight dance refrain. The Charlo side is a canción, about 3:16. Keep the Maida side, and never let the Charlo side into the same night | tango.info T0370030684. **H** |

### 1.2 Same title recorded twice in the period (which is the dance version)

| Night | Tanda | Title | Versions in the index | Verdict | Conf. |
|---|---|---|---|---|---|
| 148, 138 / 36 | 01, 12 / 15 Di Sarli instr | Milonguero viejo | `df28764a9b` 1940-07-04 (2:24) · `e2fd0a604b` 1944-07-11 (2:43) · `1aad0d6337` 1951-11-01 · `b14ee0c329` 1955-06-20 | **1940** is the golden-era dance version and fits a 1940 tanda (148 #01, 138 #12). The 1944 side used in 36 #15 is genuine, but there it sits in a 1943–46 tanda of 4 sides spread over 3 years. Neither Milonguero viejo row has a stream match, so a 1951 or 1955 file could easily stand in for either at playback (see §3, R4) | **H** for the dates |
| 36 | 15 Di Sarli instr | El caburé / El once | `ee890c343e` 1946-08-01 (remade 1951-12-06) · `33ba7122e3` 1946-12-05 (remade 1951 and 1954) | The dates are right, but both sides are **1946**, outside the night's 1935–45 window (`yearRange: [1935,1945]`). The tanda also runs 1943 to 1946. This is an era-filter problem, not a discography one: the window let in 1946 | **H** |
| 148 | 21 De Angelis instr | El entrerriano, El chañar, El taladro | 1946-01-07, 1946-06-28, 1946-09-25 | Dates right, but 3 of the 4 sides fall outside the 1935–45 window. Keep only *El pial* (1945-01-09) and add 1944–45 instrumentals, or move the tanda | **H** |
| 148, 36 | 09 / 18 D'Arienzo | Ya lo ves, Unión Cívica, La catrera, Hotel Victoria, La guitarrita, Qué noche, Trago amargo, Retintín | 1941 / 1938 / 1938 / 1935 / 1936 / 1937 / 1939 / 1936 sides, all with 1947–1969 remakes in the index (Ya lo ves 1955 with Laborde; Unión Cívica 1949; La catrera 1949, 1955, 1963; Hotel Victoria 1948, 1966; La guitarrita 1947, 1967; Qué noche 1967; Trago amargo 1955; Retintín 1969 on tango.info) | The chosen rows are all the original golden-era sides. The risk is in the audio. *Ya lo ves* has no stream match at all. *Retintín*'s Deezer match (album "Juan D'Arienzo – La morocha", 2:24) is shorter than the 1936 side (2:30, which the Spotify match agrees with) and could be the 1969 remake. Its energy and bpm come from that Deezer preview | **M** |
| — | — | Jueves (Rodríguez instr, `0ffcb91278`) | 1941-09-24 (about 2:58) · 1951-04-20 / 1951-04-26 (about 2:35) | The 1941 side is right. It has no stream match, and its 2:39 estimate is closer to the 1951 remake than to the 1941 side | **M** |

### 1.3 Lengths (78 rpm band 2:20–3:15)

Fifty-nine sides in these nights have no Spotify or Deezer match. `catalog.ts` then falls back to `estimateDuration()`. The listing prints that estimate with the same weight as a measured length, and the booth clock and the night's 4.01 h total are built on it. Estimates that miss the real side by 15 s or more:

| Night | Title (id) | Shown | Real (tango.info max) | Note |
|---|---|---|---|---|
| 148, 36 | La mimada, Donato / Lagos (`f5e7badcf6`) | 2:00 (estimate) | ≈2:27 | Below the band only because of the estimate |
| 36 | El amanecer, OTV (`f777443677`) | 2:57 (estimate) | ≈2:27 | |
| 148 | Tiempos bravos, Donato (`0c5b09ffdf`) | 2:49 (estimate) | ≈2:31 | Salvador Grupillo's tango, not Pugliese's piece of the same name. Credit is fine |
| 148, 138 | Ya lo ves, D'Arienzo / Mauré (`98dc3d45d3`) | 2:58 (estimate) | ≈2:41 | The 1955 Laborde remake runs 2:57, so the shown length suggests the wrong version |
| 36, 138 | Ya sé que siguen hablando, De Angelis (`b811133cd4`) | 3:01 (estimate) | ≈2:43 | |
| 36 | Milonguero viejo 1944 (`e2fd0a604b`) | 3:03 (estimate) | ≈2:43 | |
| 36 | Comme il faut, D'Arienzo (`5f9075c14f`) | 2:32 (estimate) | ≈2:16 | |
| 148, 138 | La cumparsita, Donato 1935 (closer, `046d674040`) | 2:46 (estimate) | ≈2:24 | |
| 148 | Canta pajarito, Demare (`89bc9d7eef`) | 3:00 (estimate) | ≈3:27 | Real side is above 3:15 |
| 148, 36 | Cómo se hace un tango, Demare (`16814cca76`) | 2:51 (estimate) | ≈3:16 | |
| 148, 36, 138 | Adiós, arrabal, D'Agostino (`fb2bb9cefa`) | 2:40 (estimate) | ≤3:13 | |
| 148 | Jueves, Rodríguez (`0ffcb91278`) | 2:39 (estimate) | ≈2:58 | |
| 36 | Los gitanitos, Rodríguez (`480dca8f75`) | 2:29 (estimate) | ≈2:56 | |
| 138 | Campanita, De Angelis (`4dea655f20`) | 2:46 (estimate) | ≈3:05 | tango.info files it as a **tango**, so the rhythm is right |
| 148 | El entrerriano, De Angelis (`4ef2a6d931`) | 2:59 (estimate) | ≈2:43 | |
| 138 | Pura parada, Canaro (`d6542333fa`) | 2:33 (estimate) | ≈2:46 | |

Measured lengths outside the band are genuine and need no change: Pugliese *Tierra querida* (3:20; 3:30 on tango.info), *El abrojito* (3:20) and *Hoy al recordarla* (3:17) run long; Biagi *Griseta* (2:10) and Láurenz *Maldonado* (2:04) are short milonga-tempo sides; Tanturi's milongas run 2:09–2:25. The Deezer "Restauración 2022" tracks for Tanturi run 13–16 s longer than the sides (silence padding). Their measured duration should not replace the Spotify one.

### 1.4 Titles (spelling, accents, junk suffixes)

Every row below appears in at least one of the three nights. "Display" is what `cleanTitle()` shows today.

| Id | Display today | Correct title | Problem |
|---|---|---|---|
| `df28764a9b`, `e2fd0a604b` (+ `1aad0d6337`, `b14ee0c329`) | Milonguero Viejo (fresedo) | **Milonguero viejo** | "Fresedo" is the piece's original dedication title (Di Sarli wrote it for Osvaldo Fresedo). It belongs in an `altTitle` field, not the display title, and the lower-case "f" makes it look like an orchestra tag |
| `215948d8ab` | Tal Vez Será su Voz (mi Alcohol) | Tal vez será su voz (or "Tal vez será mi alcohol" for the May side) | Two lyrics merged into one title; see §1.1 |
| `5f9075c14f` | Comme Il Faut (como Debe Ser) | Comme il faut | Spanish gloss in brackets |
| `54e1304409` | Shusheta (el Aristócrata) | Shusheta | Subtitle in brackets. Keep "El aristócrata" as `altTitle` |
| `33ba7122e3` | El Once (a Divertirse) | El once (A divertirse) | Fine as a subtitle; only the case is wrong |
| `06146844d4` | Marchetta | Marcheta | Misspelt |
| `fb2bb9cefa` | Adios Arrabal | Adiós, arrabal | Missing accent and comma |
| `63c9513e32` | Díme mi Amor | Dime, mi amor | "Díme" is not correct orthography; comma missing |
| `7d4ea0ee12` | Yo Tambien Soñé | Yo también soñé | Missing accent |
| `8aba7c3bad` | Lejos de Tí | Lejos de ti | "ti" never takes an accent |
| `e0d66cdc3b` | Vivo sin Sombra, Lejos de Tí | Vivo sin sombra, lejos de ti | Same |
| `019f09ba6c` | Un Crímen | Un crimen | Wrong accent |
| `b811133cd4` | Ya Se que Siguen Hablando | Ya sé que siguen hablando | Missing accent (here *sé* = "I know") |
| `e5a625fa47` | Que Buena Es | Qué buena es | Missing exclamatory accent |
| `16814cca76` | Como Se Hace un Tango | Cómo se hace un tango | Missing accent |
| `17cc54c795` | Éste Es tu Tango | Este es tu tango | Label and tango.info spelling, no accent |
| `dee41e76cb` | Pa'qué Seguir | Pa' qué seguir | Missing space after the apostrophe |
| `5a61dd03e8` | Qué Noche! | Qué noche | A stray "!" without "¡" |
| `bf45936f5c` | Por Qué No Has Venido? | ¿Por qué no has venido? | Missing "¿" |
| `f96fa56eaa` | Milongueando en el Cuarenta | Milongueando en el 40 | The label prints "en el '40" |
| `f6857903bc` | Re Fa Sí | Re fa si | Note names, no accent |
| `4aa613f1d2` | Loca de Amor | La loca de amor (tango.info) | **L**: check the label |
| `2b3c135d99` | Don Alvaro | Don Álvaro | Missing accent (tango.info also writes "Alvaro"; **L**) |
| `cebfbd8996` | El Trece | El trece / "El 13" | Fine; add "El 13" as `altTitle` so lookups match |

Index-wide, two more things show: proper-name case inside brackets is lost (the source's title-casing lower-cases the first letter after "("), and many titles use Title Case ("Que Te Importa que Te Llore"). tango.info and the labels use sentence case. That is a display style choice, not an error.

### 1.5 Cortinas (Turkish)

All 23 artist credits are right: each song is the named artist's recording, or for *Üsküdar'a gider iken* a classic recording by the named singer. The problems are years, audio and genre labels:

| Night(s) | Cortina (id) | Field | Current | Correct | Source / conf. |
|---|---|---|---|---|---|
| all | Olmasa Mektubun – Yeni Türkü (`c-tr-yeni-turku-olmasa`) | year | 1983 | **1986** (Murathan Mungan's lyric) | Apple Music / press. **M–H** |
| all | Göreceksin Kendini – Nilüfer (`c-tr-nilufer-goreceksin`) | year, audio | 1983. Deezer match is from album *Yeniden Yetmişe* | **1973** single (*Göreceksin Kendini / Aldanırım Sanma*), also on *Nilüfer '74*. *Yeniden Yetmişe* is a later re-recording; re-resolve to the 1973/74 original | discography lists. **M** |
| all | Bambaşka Biri – Ajda Pekkan (`c-tr-pekkan-bambaska`) | year | 1977 | **1979** (*Süperstar II*; Turkish lyric to *I Will Survive*) | **M–H** |
| all | Peki Peki Anladık – MFÖ (`c-tr-mfo-peki-peki`) | year | 1984 | **1985** (the album of the same name) | **M–H** |
| all | Ben Sana Vurgunum – Nükhet Duru (`c-tr-duru-ben-sana`) | year, audio | 1979. Deezer match is from album *Melankoli* | ≈1978. The *Melankoli* match may be a later re-recording | **L** |
| all | İşte Öyle Bir Şey – Erol Evgin (`c-tr-evgin-iste-oyle`) | audio | Deezer match is from *Altın Düetler* (a duets album) | 1976 single / 1977 LP (Melih Kibar, Çiğdem Talu). The year is right, but the match is probably a duet version. Re-resolve to the solo original | **M** |
| all | Ah Bu Şarkıların Gözü Kör Olsun – Zeki Müren (`c-tr-1`) | audio, genre | `resolve` = null. `genre: "turkish-pop"` | No audio, so it cannot play. Genre is Turkish classical (sanat müziği), as for `c-tr-4` | cache. **H** |
| all | Üsküdar'a Gider İken – Safiye Ayla (`c-tr-4`) | audio | `resolve` = null | No audio. It is used in all three nights | cache. **H** |
| (not played) | Dünya Dönüyor – Mabel Matiz 2021 (`c-tr-5`) | identity | — | The song is Nilüfer's 1973 hit. If the Mabel Matiz track exists, it is a cover; check it, or credit Nilüfer 1973 | **L** |

The other credits and years are right: *Dönence* (1981), *Dağlar Dağlar* (1970), *Cemalim* (1974), *Resimdeki Gözyaşları* (Cem Karaca), *Firuze* (1982), *Gülümse* and *Hadi Bakalım* (1991), *Ele Güne Karşı* (1984), *Araba* (1996, *Gölgede Aynı*), *Şımarık* (1997), *Kuzu Kuzu* (2001), *Dudu* (2003), *Her Şeyi Yak* (2002), *Cambaz* (2004), *Şimdi Uzaklardasın* (Zeki Müren).

## 2. Index corrections

Exact fixes. Where a fix touches the source-derived `songs.json`, it belongs in a patch file (for example `data/knowledge/review_patches_round4.json`, or a new round-14 patch file) so that `pnpm index:build` does not overwrite it.

**songs.json: credits, rhythm and dates**

```jsonc
{ "id": "9df440312c", "singer": "Alberto Echagüe", "singerId": "alberto-echague", "vocal": true }   // Trago amargo 1939-12-22
{ "id": "f0c378b199", "orchestra": "Quinteto Don Pancho (Canaro)", "date": "1938-05-09" }           // Champagne tango, or hide the row from Orquesta Típica families
{ "id": "5ac52c1b19", "rhythm": "other", "rhythmCode": "ND", "date": "1939-07-14" }                // La zandunga (canción mexicana)
{ "id": "06146844d4", "title": "Marcheta", "altTitles": ["Marquita"] }                              // Biagi vals 1941-12-03
{ "id": "215948d8ab", "date": "1943-09-13", "title": "Tal vez será su voz", "altTitles": ["Tal vez será mi alcohol"] }  // after a listen; else the "mi alcohol" title + 1943-05-06
{ "id": "b41093302a", "rhythm": "milonga", "rhythmCode": "M" }                                     // El lengue, Donato 1940 (M)
{ "id": "bf6e0c24a9", "date": "1938-10-17" }   // Viejo portón
{ "id": "f94dd3fd89", "date": "1938-10-17" }   // Unión Cívica (Biagi)
{ "id": "2a56a78278", "date": "1937-12-09" }   // El cencerro
{ "id": "4d0e9d5353", "date": "1940-04-12" }   // A mí no me interesa
// merge the duplicate: bf32d35a4f → altIds of e5a625fa47 (Qué buena es, 1943-07-23)
// flag only, no change: 29ff009db8 El esquinazo, 8ba26dd366 El porteñito ("tango-milonga")
```

**songs.json: titles** (move the bracketed alternative title into `altTitles`)

```
df28764a9b, e2fd0a604b, 1aad0d6337, b14ee0c329  "Milonguero Viejo(fresedo)"  → "Milonguero viejo"   altTitles ["Fresedo"]
5f9075c14f  "Comme Il Faut(como Debe Ser)"  → "Comme il faut"
54e1304409  "Shusheta(el Aristócrata)"      → "Shusheta"           altTitles ["El aristócrata"]
33ba7122e3  "El Once(a Divertirse)"         → "El once (A divertirse)"
fb2bb9cefa  → "Adiós, arrabal"           63c9513e32 → "Dime, mi amor"
7d4ea0ee12  → "Yo también soñé"          8aba7c3bad → "Lejos de ti"
e0d66cdc3b  → "Vivo sin sombra, lejos de ti"
019f09ba6c  → "Un crimen"                b811133cd4 → "Ya sé que siguen hablando"
e5a625fa47  → "Qué buena es"             16814cca76 → "Cómo se hace un tango"
17cc54c795  → "Este es tu tango"         dee41e76cb → "Pa' qué seguir"
5a61dd03e8  → "Qué noche"                bf45936f5c → "¿Por qué no has venido?"
f96fa56eaa  → "Milongueando en el 40"    f6857903bc → "Re fa si"
2b3c135d99  → "Don Álvaro"               cebfbd8996 altTitles ["El 13"]
```

Apply the same title fixes to every other row of the same work (all orchestras), so that title-repeat detection and fame joins (`normTitle|orchestraId`) do not split. Before applying the "Este es tu tango" and "Qué noche" fixes, check that `normTitle` collapses the accent and "!" differences; it should.

**Stream caches**

- `data/cache/spotify/tracks.json`: delete `06146844d4` (wrong track, "Domy Castellano – Marchantia").
- `data/cache/resolve/tracks.json`: re-check `01cecdfb26` *Retintín*. The Deezer match "Juan D'Arienzo – La morocha" (2:24) may be the 1969 remake; the Spotify match "(1935-1936), Vol. 1" (2:30) is right. The audio features (energy, bpm) for this side come from the Deezer preview.
- `data/cache/resolve/tracks.json`: `471d6d7df2` *No me lo digas* is credited to the composer, "Luis Visca", on album *Lelia (1938-1939)*. That is probably the right D'Arienzo side under a composer credit, but confirm it. **L**
- Resolve the high-traffic unmatched sides first, because their lengths and energies are estimates: *Ya lo ves*, *Tierrita*, *Ahora no me conocés*, *Adiós, arrabal*, *Agua florida*, *Tres esquinas* (Spotify only), *La mimada*, *La milonga que faltaba*, *Sacale punta*, and Demare / Berón 1943.

**Cortinas** (`data/knowledge/cortinas.json`, `packages/core/src/cortinas.ts`)

```
c-tr-yeni-turku-olmasa   year 1983 → 1986
c-tr-nilufer-goreceksin  year 1983 → 1973; re-resolve to the 1973/74 original (not "Yeniden Yetmişe")
c-tr-pekkan-bambaska     year 1977 → 1979
c-tr-mfo-peki-peki       year 1984 → 1985
c-tr-evgin-iste-oyle     re-resolve to the solo 1976/77 recording (not "Altın Düetler")
c-tr-1, c-tr-4           resolve audio (both null), or exclude them from pools until resolved; c-tr-1 genre → "turkish-classic"
c-tr-5                   verify the credit (song = Nilüfer 1973)
```

## 3. General rules the engine could run (deterministic checks)

Each rule needs a vitest invariant first (docs/TDD.md). Most are catalogue lint, run in `build_index.py` or as a `catalog.ts` test over `songs.json`, not composition rules, so they do not move the benchmark.

1. **R1, title junk.** Flag or strip any title matching `/\((?:[a-záéíóúñ][^()]*)\)\s*$/` whose bracketed text is lower-case (`(fresedo)`, `(mi Alcohol)`, `(como Debe Ser)`), and move it to `altTitles`. Also flag a bracketed orchestra or composer surname (`/\((fresedo|canaro|d'arienzo|di sarli|troilo|pugliese|biagi|…)\)/i`, built from `orchestras.json`), a trailing `- Remasterizado`, `- Remastered`, `- Instrumental` or `(Restauración \d{4})` copied from a stream title, and a missing space before "(" (the index has `Viejo(fresedo)`; `cleanTitle` fixes the spacing but not the case).
2. **R2, orthography lint.** Rules that need no dictionary: `/\bT[ií]\b/` after "de/a/para/sin" → "ti"; `/^D[ií]me\b/` → "Dime"; `/\bCr[ií]men\b/` → "crimen"; a `?` with no `¿`, or a `!` with no `¡`; `Pa'` followed directly by a letter → `Pa' `; `/^Adios\b/` → "Adiós". Report them; do not auto-fix.
3. **R3, length bands by rhythm and decade, measured lengths only.** 1935–45 78 rpm sides: tango 2:15–3:30 (Pugliese and Troilo vocals reach 3:30), vals 2:05–3:15, milonga 1:55–2:45. A measured length outside the band means a wrong match (for example *Marchetta*). An estimated length must never be judged against the band, and must be shown differently. Today `estimateDuration` output looks just like a measured length in the listing and the booth: mark it `durationEstimated: true` and render it as "≈2:40".
4. **R4, re-recording guard for stream matches.** For a dated row whose orchestra and title have another index row 5 or more years later (D'Arienzo, Di Sarli, Canaro, Rodríguez, Donato all qualify here), accept a Spotify or Deezer match only if (a) its length is within ±8 s of the row's tango.info or listado length when known, (b) its album title carries no later year range (for example "(63-71)", "1950-1960", "Vol. XL"), and (c) it does not differ by more than 8 s from the other provider's match. Otherwise mark it `matchSuspect`. Run the same check on the Deezer preview that feeds `audio` features: energy and bpm taken from a 1969 remake are wrong for the 1936 side.
5. **R5, artist sanity for stream matches.** The matched artist string must contain the orchestra surname, the singer surname, or "Orquesta Típica". If it holds only a composer name (for example "Luis Visca"), mark it for review. If it holds none of these (for example "Domy Castellano"), reject the match. That would have caught *Marchetta* deterministically.
6. **R6, vocal consistency.** An instrumental row must not share a date with a vocal row of the same title and orchestra. Cross-check `vocal` against tango.info language (`zxx` = instrumental) where an export is available. More generally, D'Arienzo 1938–40 "instrumental" rows on canción titles (*Trago amargo*) deserve a review flag, because Echagüe often sang the estribillo.
7. **R7, one recording per orchestra and title per night, by work, not by row.** Collapse same-date duplicates (`e5a625fa47` and `bf32d35a4f`) at build time: same orchestraId, normTitle and date → one row plus `altIds`. Takes days apart (*Tierrita* 06-06 and 06-09; *Hacete cartel* 07-16 and 10-16; *Mi morocha* 08-18 and 09-18) are the same work and must count as a title repeat.
8. **R8, a dance-version preference when one orchestra recorded a title twice inside the window.** Prefer, in order: (1) the row whose singer matches the tanda family (Maida over Charlo for *Yo también soñé*); (2) the row inside the family's `best` years (*Milonguero viejo* 1940 for a 1940 tanda, not 1944); (3) the row with `selection: true`; (4) the earlier row. Never mix two versions of one title in one night.
9. **R9, orchestra-entity check.** Rows from mixed compilation albums (`album` = a song title, such as "TRA LA LA", with `date: null`) are a known way for quintetos (Don Pancho, Pirincho) and solo-singer sides to slip into Orquesta Típica families. With `date: null`, exclude the row from golden-era families, as `yearApprox` rows already are (`tanda.ts dated()`). The engine currently treats `year`-only rows as dated.
10. **R10, rhythm whitelist inside vals and milonga tandas.** Titles whose source genre is "canción", "ranchera", "corrido", "canción popular mexicana", "pasodoble", "foxtrot" or "vals peruano" must not fill a vals tanda. Ternary-metre non-tangos such as *La zandunga* are the usual way in. A tango-milonga flag on Villoldo and Donato titles (*El esquinazo*, *El porteñito*, *El lengue*) should lower their fit for a slow tango tanda rather than ban them.
11. **R11, window filter on sides, not tandas.** With `yearRange: [1935,1945]`, a tanda may not contain sides outside the window. 36 #15 (Di Sarli 1946 ×2) and 148 #21 (De Angelis 1946 ×3) slip through, likely because the window is checked on the tanda's start year or median.
12. **R12, cortina audio and metadata lint.** Every cortina in an active pool must have a resolved audio entry; `c-tr-1` and `c-tr-4` have none. Cortina `year` must match the earliest release year. A resolved album whose title contains "Düet", "Duet", "Yeniden", "Live", "Remix", "Mix" or "Version" gets a `matchSuspect` flag, like R4.

## Appendix: what checked clean

These were checked against tango.info and found right in year, date, singer or instrumental status, and genre. The listing above covers the rest.

- **Canaro / Maida 1935–36**: Ciego, Ojos negros que fascinan, Mi noche triste.
- **Di Sarli**: La trilla, El incendio, Catamarca, Shusheta, La torcacita and Ensueños (instrumental); the Rufino valses and milongas.
- **D'Arienzo**: the 1935–39 instrumentals (Retintín, El caburé, Ataniche, El cachafaz, El apronte, Lorenzo, Hotel Victoria, El flete, La guitarrita, Re fa si, Qué noche, Champagne tango, La catrera, Unión Cívica, Maipo, No me lo digas, Yunta brava) and the 1941–42 Mauré sides.
- **Láurenz**: Casas 1940 and Podestá 1943–44.
- **Donato**: the Lagos tangos, milongas and valses; El chamuyo, El estagiario, Pasión criolla, El distinguido ciudadano.
- **D'Agostino / Vargas 1941**, including El yacaré, which tango.info files as a tango.
- **Caló**: Berón 1942 and the Iriarte valses.
- **Biagi**: the 1938–39 instrumentals, Ibáñez, Falgás and Ortiz.
- **Rodríguez**: the instrumentals, and the Moreno tangos and valses.
- **Tanturi / Castillo**: Así se baila el tango is dated 1942-12-04 on tango.info, as in the index; the Deezer "4/11/1942" is wrong.
- **Troilo**: the instrumentals, and the Fiorentino tangos and valses.
- **OTV 1937** instrumentals.
- **Malerba / Medina**.
- **De Angelis / Martel**: Campanita is a tango.
- **Pugliese 1944–45**.
- **Closers**: the Tanturi 1940 and Donato 1935 La cumparsita.
