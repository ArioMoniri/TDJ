# Round 17: export check of the shipped featured night (`apps/web/public/featured/golden-double-peak.json`)

Read-only final pass. I checked all 85 sides, the closer and the 21 cortina ids. For each I took the Spotify id (and the Deezer id beside it) that the featured JSON would export and compared it with the side's tango.info performance list: performers, date, every other recording of the title by the same orchestra (remakes), and track lengths.

That covers the 35 ids that are new in this round (`git show HEAD~5` against the current cache: 34 sides plus the closer) and the 8 new cortina ids. For *Así se baila el tango* I also searched the Spotify connector to list the alternatives.

## Verdict

**Export clean: yes.** No id exports the wrong recording.

- **Sides and closer.** Every one of the 85 sides and the closer points to the golden-era recording of the right orchestra and singer, never a remake.
- **One side is unproven.** For *Así se baila el tango*, the cached Spotify credit does not name Castillo. That breaks the round-16 rule "a vocal side whose credit does not name the singer is not taken". Swap it (§1).
- **One cortina is a duet.** The *Bu Kalp Seni Unutur mu* id is the duet with Sibel Sezal. That is the only version on *Yana Yana*, but the cue credit should say so.
- **The cortina album filter has gaps** (`CORTINA_BAD_ALBUM`, §3). None of the shipped cortina ids is affected.

## 1. Problems (ids)

| Slot | Side / cue (id) | Exported Spotify id | Problem | Replacement | Conf. |
|---|---|---|---|---|---|
| última #22 | Así se baila el tango, Tanturi / Castillo 1942-12-04 (`5486994f6f`) | `0g3maqBZebtqT4N7f1YSbh`, "Ricardo Tanturi – Asi se baila el tango", *Tangos Para Bailar – Documentos Tango*, 2:37 | The credit does not name Castillo, and the id is one of the 35 added this round, against the stated rule. The length fits the 1942 side (tango.info: up to 2:42, 28 tracks). But tango.info also lists a range-dated "1942–1946" Castillo performance (2:32), so the track's identity is not proven | **`6vrz2bxBByWjoi7NAf5BIn`**: "Ricardo Tanturi, Alberto Castillo – Así Se Baila El Tango", *Serie De Oro Vol 2: Ricardo Tanturi*, 2:33.7. It is the same Serie de Oro album as the night's *Recuerdo malevo* id. A dated "Buenos Aires 4/11/1942 – Restauración 2025" track on album `72k3zMrHRweVqdbRy59Suu` would be better still (the connector did not return its track id). Deezer `3481224201` is that restoration | **M** |
| cue after #20 | Bu Kalp Seni Unutur mu (`c-tr-kizilok-bu-kalp`) | `4Q2t1wFBSwgaPlgV5GpqZp`, "Fikret Kızılok, Sibel Sezal", *Yana Yana*, 4:34.7 | A **duet**. The song began on Sibel Sezal's cassette, and Kızılok re-recorded it as a duet with her for *Yana Yana*. That duet is his only recording, so the id is correct for the cue, but the cue reads as a Kızılok solo. `cortinaMatchProblem` checks only the album name for "düet", never a second credited artist | keep the id; set the cue artist to "Fikret Kızılok & Sibel Sezal", or tag it `audio:original` with a note | **M** |

## 2. What was checked, and why it holds

### Sides and closer

- **Restoration albums (dated titles).** Every date in the stream title equals the index date:
  - D'Agostino / Vargas *Restauración 2022*: Agua florida 13/11/1941, Ahora no me conocés 09/09/1941, Adiós arrabal 09/09/1941.
  - Tanturi / Castillo *Restauración 2022*: Recuerdo 08/01/1941 (the vals ✓), La serenata 06/05/1941.
  - Tanturi *Restauración 2025*: Marisabel 15/9/1942.
  - Troilo *Restauración 2023*: No le digas que la quiero 23/10/1941, El tamango 23/10/1941.
  - Caló *Restauración 2024*: Trasnochando 30/6/1942.

  Their lengths sit within +3 to +8 s of tango.info, which is restoration padding.
- **"Cantor Popular" (Rodríguez / Flores).** The credit is "Roberto "Chato" Flores, Orquesta Enrique Rodriguez", and tango.info has a single performance of each title: *Las espigadoras* (`6DiMgN7RDDpMvxhKro91gm`, 2:48.7; tango.info 1938-12-27, 2:42) and *Fru fru* (`7gxo0xyvxCgt0G4fY4DAbz`, 2:58.0; tango.info "Frou frou" 1939-06-05, 2:55). With no remake to confuse them with, both are the right sides. *Las espigadoras* runs 6.7 s over the tango.info maximum, which is transfer padding; Deezer gives 2:45 (**L**). *Salud, dinero y amor* (*Tango: Rodríguez y Sus Cantores*, 2:38.6; 1939-07-25, 2:41) is also right.
- **"Para Bailar (1932-1940)" (Donato).** *Porteña linda* (`29ZRP5zThrC3MGWOKpTwot`, 2:21) has a single performance, 1940-04-30, 2:22, and the album span holds it. Right. *La milonga que faltaba* (*1933-1941*) and *Sacale punta* (*Embrujo gitano 1936-1938*, credit "Randona", as on tango.info) are right too.
- **Hotel Victoria** (`4mVI8bdnJ161XimaiqDnae`): album *El Rey del Compás / 1935 – 1938, Volume 1*, 2:38.5. The 1935 takes are 07-01 (2:39) and 07-02 (2:43, the issued take). The remakes are 1948 (2:35) and 1966 "Gran Hotel Victoria" (2:54). The album span excludes the remakes and the length fits 1935, so this is the 1935 side. Which take it is cannot be told, and it does not matter for dancing.
- **Closer** (`6dXLn9JJVly4xDmaQiKdXy`): "Orquesta Ricardo Tanturi – La Cumparsita", *El Choclo (El Barrio De Tango Vol. 7 – Original Tango Argentino 1940-1941)*, 2:46. tango.info lists **one** Tanturi *La cumparsita* only: 1940-11-18, instrumental, up to 2:50 over 14 tracks. There is no remake to mistake it for, and the album span (1940–41) holds the date. Right.
- **Other new ids, all right against a single golden performance or clear of the remakes by album and length:**
  - Di Sarli / Rufino: Cosas olvidadas, Zorzal, La mulateada (*(1941-1942), Vol. 6*), Pena mulata.
  - D'Arienzo: El cencerro and El cachafaz (*(1937), Vol. 3*; single 1937 performances), Champagne tango (*1937–1938*), El esquinazo (*Recordings 1938 – 1939*), Ansiedad, No mientas (*1938 – 1942, Vol. 2*).
  - Troilo / Fiorentino: Sosiego en la noche (*Tabaco (1943-1944)*), Cada vez que me recuerdes (*Tango y copas (1942-1943)*), Te aconsejo que me olvides.
  - Pugliese / Chanel: Corrientes y Esmeralda and La abandoné y no sabía (*Las Primeras Grabaciones 1943-1944*), El sueño del pibe, Rondando tu esquina (*El paladín (1945-1946)*; the "Charlo" credit is the composer).
- **Pre-existing ids.** These were unchanged and re-checked: Láurenz, Biagi, Malerba, Caló / Berón and Iriarte, Tanturi / Castillo tangos, Troilo instrumentals and milongas, Donato instrumentals.

  Two credit notes, no change needed:
  - *Me duele el corazón* credits "Los Trovadores del Peru" (a vals peruano). tango.info lists only Caló / Iriarte, 1944-11-07, so it is the same side (**L**).
  - *Ficha de oro* and *Papá Baltasar* credit "Alberto Mar[ino]" from the album's artist list. tango.info lists them as Fiorentino sides of 1942, and the lengths match.

### Cortinas

The other 20 cortina ids are each artist's own track on the original or standard album:

- *Olmasa Mektubun*: on the compilation *Her Dem Yeni*, the same 3:34 track.
- *Tamirci Çırağı*: on *Ölümsüzler*, the same 4:56 as Deezer.
- *Hadi Bakalım*, *Gülümse* and *Firuze*: on their own albums.
- *Her Şeyi Yak*: now on the original *Belki Alışman Lazım*.
- *Göreceksin Kendini*: on *Nilüfer LP*, 2:23. That is a 1970s LP length, not the 2:52 later version.
- *Cambaz*, *Bir Derdim Var*, *Kuzu Kuzu*, *Araba*, *Sil Baştan*, *Senden Daha Güzel*, *Ele Güne Karşı*, *Peki Peki Anladık* and *Resimdeki Gözyaşları*: on their original albums.

Residual **L** flags, each needing a listen or a Turkish discography:

- *Ben Sana Vurgunum*: *Nükhet Duru Klasikleri*, 4:30.
- *Yaz Gazeteci Yaz*: *Güzellerin duası*.
- *Dönence*: *Hal Hal*, 6:44, which may be a compilation of the 1981 recording.
- *Haram Geceler*: *Yine Yeni Yeniden*; the cue year was set to 1992 to match.

*İşte Öyle Bir Şey* has no Spotify id and exports nothing for that cue. That is correct: "Altın Düetler" was rightly rejected.

## 3. `CORTINA_BAD_ALBUM` gaps

I tested the regex in `packages/core/src/matchRules.ts:466` with tsx:

| Album / title text | Result |
|---|---|
| "Harbiye Açıkhava **Konseri**", "**Konserler**" | MISSED: `\bkonser\b` needs a word end, and Turkish adds suffixes (-i, -ler, -leri) |
| "**Canlı**", "Canlı Kayıt", "Sevenlerine Canlı" | MISSED: JS `\b` is ASCII-only without the `u` flag, so no boundary exists after "ı" ("Canli" with a dotless i is caught) |
| "**Akustikler**" | MISSED (suffix) |
| "Sahne **Performansı**", "2006 **Versiyon**", "Yeni Versiyon", "Orkestra **Versiyonu**" | MISSED: not in the list |
| "Live at …", "Düet", "Düetler", "Yeniden Yetmişe", "Akustik", "Unplugged", "Enstrümantal" | caught |

Fix: drop the trailing `\b` for Turkish stems and use explicit delimiters with the `u` flag:

```ts
export const CORTINA_BAD_ALBUM =
  /(?:^|[^\p{L}])(live|canl[ıi]\p{L}*|konser\p{L}*|concert|d[uü]et\p{L}*|remix|karaoke|cover|akusti[kc]\p{L}*|acoustic|unplugged|yeniden (?:yetmi|kayıt)\p{L}*|tribute|enstr[uü]mantal|instrumental version|versiyon\p{L}*|sahne performans\p{L}*|re-?recorded|sped up|slowed)(?![\p{L}])/iu;
```

Also judge the **credit**, not only the album. A second performer in the artist list ("Fikret Kızılok, Sibel Sezal") marks a duet unless the cue's `artist` names both. And reuse the side rule for cortinas: a cue whose original artist is not the first credited artist is a cover.

## 4. Fix list

```jsonc
// data/cache/spotify/tracks.json
"5486994f6f": { "uri": "spotify:track:6vrz2bxBByWjoi7NAf5BIn", "album": "Serie De Oro Vol 2: Ricardo Tanturi", "durationMs": 153720,
                "matched": "Ricardo Tanturi, Alberto Castillo – Así Se Baila El Tango" }   // or the dated 2025 restoration on album 72k3zMrHRweVqdbRy59Suu
// data/knowledge/cortinas.json
"c-tr-kizilok-bu-kalp": artist "Fikret Kızılok & Sibel Sezal" (the Yana Yana duet), or tag audio:original
// packages/core/src/matchRules.ts
CORTINA_BAD_ALBUM: Unicode-aware, suffix-tolerant (§3); add a duet check on the credit
// enrich / judgeStreams: enforce "vocal side → credit names the singer" in the cache audit too (it let 5486994f6f in)
```
