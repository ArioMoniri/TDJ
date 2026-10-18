# Reference corpus: real milonga sets, canonical tandas, most-played recordings

*Companion to `data/knowledge/reference_sets.json`. Built October 2026 from public web sources only; structured facts, no copyrighted prose. Orchestra ids are the slugs of `data/index/orchestras.json`.*

---

## 1. What is in the file

| Section | Count | What it is |
|---|---|---|
| `sets` | 31 (30 complete, 1 partial) | Real DJ sets, tanda by tanda, with rhythm, orchestra id, singer, year range and ordered titles; 619 tandas, 2,170 tracks |
| `canonicalTandas` | 218 | Tandas that recur across sources or are published as "model" tandas by DJs; each has `phase` (warmup/build/peak/cooldown/close), `popularity` 1–5 and source URLs |
| `famousRecordings` | 1,078 | Every distinct (orchestra, title) that appears in the sets or canonical tandas, plus ~180 curated additions; `fame` 1–5 from evidence counts, `energy` 0–100 (DJ estimate), `role` opener/closer/anytime/cumparsita, `evidence` = {sets, canonicalTandas, asOpener, asCloser} |
| `blacklist` | 134 | Concert pieces, medleys/selecciones, show tango, Gardel-with-guitars, electrotango, too-slow/too-long versions, with reason and sources |

`meta.unknownOrchestraIds` lists four slugs that do not exist in `orchestras.json` (`quinteto-don-pancho`, `alberto-castillo`, `los-muchachos-de-antes`, `sexteto-cristal`); everything else maps to existing ids. Mixed-orchestra tandas carry `orchestraId: null`.

## 2. Method

1. **Set collection.** Searched for public "setblogs", playlists and set-list posts. The yield was dominated by DJs who log every track with year and singer: Chris Jordan (UK/DE, 2009–2020 setblog), Dmitry Pruss "MOCKBA" (US/RU, 2017–2018), Pablo Stafforini's "What DJs play" logs of unnamed UK DJs (2013), Tomáš Kohl (Prague 2022), Michael Freedman and Iain Dickinson (Glasgow 2015–16), the "milongaparatres" debut logs (2010) and Bernhard Gehberger's published special tandas (Vienna 2011). Each set was fetched, the tanda list extracted and re-encoded with the project's orchestra ids. Years were kept as the tanda's [min,max]; per-track years were used to populate `famousRecordings`.
2. **Canonical tandas.** Taken from (a) tanda lists published as models: Stephen Brown's *Annotated List of Tandas* (Tejas), Tango Toolkit *Set Lists*, Stafforini's *My favorite tandas*, Antti Suniala's *Tanda of the Week* (free posts only), Tangology101's *Tanda of the Week*, the Tango Marathons "ChatGPT and creating tandas" corrections, Tango Voice's DJ fundamentals; and (b) tandas that recur (same orchestra/singer/era, ≥2 shared titles) across ≥2 independent sets.
3. **Famous recordings.** Aggregated every title in (1) and (2); year/singer/rhythm resolved against `data/index/songs.json` (873 direct matches), then a manual year table transcribed from the source pages, then fuzzy matching; 22 entries remain flagged `yearApprox`. `fame`: 5 = seen in ≥6 independent places, 4 = 4–5, 3 = 2–3, 2 = 1. `energy` is a heuristic from the orchestra profile (`data/knowledge/orchestra_profiles.json`) adjusted by rhythm, era and vocal/instrumental, then hand-tuned for ~180 key recordings. `role` from opener/closer position counts (≥2 and dominant), with hand overrides.
4. **Blacklist.** Piazzolla catalogue, Pugliese/Troilo/Salgán concert-era pieces, medleys/selecciones, Gardel tango-canción, electrotango, show orchestras, and specific versions flagged "too slow" by DJs (Di Sarli late valses), each with a source. Because the engine (`packages/core/src/catalog.ts`) blacklists by normalised title only (parentheses stripped), every entry whose bare title is also a danceable classic in another version was removed (e.g. *La bordona*, *Quejas de bandoneón*, *Taquito militar*, *Negracha*, *Desde el alma*, *Reliquias porteñas*, *Sus ojos se cerraron*); such version-level exclusions belong in year/era rules, not in this list. *Danzarín* is blacklisted as requested even though one corpus set closed with it.
5. **Statistics and rules.** Computed by script over the 30 complete sets (see §4). Survey numbers from Buenos Aires (Weigel 2008, 14 milongas del centro), Tango Tecnia 2014 and the SuperSabino DJ survey are quoted from Tango Voice as external evidence.

### Sources (primary)
- Chris Jordan setblog — http://www.chrisjj.com/tango/cjjsets/ (16 sets used, 2010–2019; UK and Germany)
- Dmitry Pruss, *tango links & lists* — https://humilitan.blogspot.com/2017/ and https://humilitan.blogspot.com/2018/ (8 sets; Utah, San Diego, Tyumen, Kyiv)
- Pablo Stafforini, *What DJs play* — https://stafforini.com/tango/what-djs-play-1/ , https://stafforini.com/tango/what-djs-play-2/ ; *My favorite tandas* — https://stafforini.com/tango/category/sections/tandas/ (+ /page/2/)
- Tomáš Kohl, Milonga RestArt Prague — https://tomaskohl.com/tango/2022-08-traditional-tango-playlist-from-milonga-restart/
- Michael Freedman, The Crypt Glasgow — https://tango-outpost.blogspot.com/2015/12/set-list-by-michael-freedman-glasgow.html ; Iain Dickinson, Midnight milonga — https://milonga-review.blogspot.com/2016/08/glasgow-round-up-3-midnight-milonga-july.html
- milongaparatres debut logs — http://milongaparatres.blogspot.com/2010/07/thoughts-on-my-debut-as-dj.html
- Bernhard Gehberger, Tango-DJ.at newsletter Oct 2011 (tanda discussion) — https://tango-dj.at/mailings/2011/October2011.htm
- Stephen Brown, *An Annotated List of Tandas* — https://book-tejas-music.readthedocs.io/en/latest/deejays/list-of-tandas.html ; *Playing Music for Milongas* — https://book-tejas-music.readthedocs.io/en/latest/deejays/play-for-milongas.html ; post-golden-age guide — https://www.tejastango.com/post-golden-age.html
- Tango Toolkit starter kit — https://tangotoolkit.com/dj/starter-kit/ and /set-lists/
- Antti Suniala, *Tanda of the Week* — https://www.tandaoftheweek.com/ (pages 1–5 and free posts cited per tanda)
- Tangology101, *Tanda of the Week* / *How to DJ a Milonga* — https://tangology101.com/main.cfm/tagname/Tanda of the Week/id/7 ; https://tangology101.com/main.cfm/title/How-to-DJ-a-Milonga/id/265
- Tango Voice, *Tango DJ Fundamentals Part 1* (BA play-count survey, DJ surveys, recommended periods) — https://tangovoice.wordpress.com/2016/12/06/tango-dj-fundamentals-part-1-selecting-music-for-dancing-and-tanda-construction/
- Michael Lavocah, *Tango DJing* parts 2–3 (TodoTango) — https://www.todotango.com/english/history/chronicle/483/Tango-Djing-Part-2:-Tanda-construction ; https://www.todotango.com/english/history/chronicle/510/Tango-DJing-Part-3:-Shaping-the-evening/
- Melina Sedó, *Heroes of the Silver Disc* — https://www.melinasedo.com/wp-content/uploads/2019/08/HeroesoftheSilverDisc.pdf
- Tango Marathons, *ChatGPT and creating tandas* — https://www.tangomarathons.com/2023/03/chatgpt-and-creating-tandas/
- Tango-L, *Tango Music for Dancing* (what BA DJs play) — https://mailman.mit.edu/pipermail/tango-l/2008-February/007035.html ; Piazzolla threads — https://mailman.mit.edu/pipermail/tango-l/2009-August/010518.html
- Tango Delight beginner guide — https://tangodelight.com.au/tango-music-a-beginners-guide/ ; Tango Amistoso tanda pages — https://www.tango-amistoso.co.uk/tango-songs-playlists-milonga-tandas/
- Unreachable at time of writing: tango.info / tanda.tango.info (DNS failure), tangoplaylist.com; Spotify playlist pages return no track lists to a fetcher; Reddit r/tango threads were not surfaced by search.

## 3. Coverage

- **Regions:** UK 17 sets, US 5, Germany 3, Russia 2, Czechia 1, Austria 1 (partial), unknown 2 (milongaparatres). No Buenos Aires set list was publicly available track-by-track; BA practice is represented by the Weigel 2008 play-count survey and the Tango-L "what BA DJs play" list, both consistent with the European sets. Treat BA-specific rules (two Cumparsitas, chacarera breaks, no mixed tandas) as priors from `dj-benchmark.md`, not from this corpus.
- **Years:** sets 2010–2022; model tandas 2012–2026.
- **Length:** 2–6 h; median 20 tandas (≈3.5–4 h).
- **Orchestras in sets (tandas):** D'Arienzo 80, Di Sarli 48, Donato 45, Biagi 43, Troilo 41, Canaro 37, Rodríguez 34, Caló 32, De Angelis 25, D'Agostino 24, Tanturi 22, Pugliese 22, Laurenz 22, Fresedo 21, OTV 16, Demare 14, Lomuto 14, Quinteto Pirincho 7, Carabelli 5, Quinteto Don Pancho 5, Malerba 5, Racciatti 4, Hugo Díaz 4, Alberto Castillo (vals) 4, Sassone 3, then Gobbi, Firpo, Varela, Salamanca, Federico, José García, De Caro, Los Provincianos, Villasboas, Filiberto, Balcarce, Sexteto Cristal, Los Muchachos de Antes.
- **Era of tandas:** 1935–1944: 73 %; 1945–1955: 14 %; post-1955: 9 %; pre-1935: 4 %.
- **famousRecordings by rhythm:** tango 843, vals 146, milonga 92; by orchestra the top are D'Arienzo 142, Di Sarli 98, Canaro 84, Biagi 76, Troilo 63, Pugliese 55, Caló 52, Rodríguez 50, De Angelis 47, Donato 46, Tanturi 46, D'Agostino 42, Lomuto 41, Laurenz 36, Fresedo 34, OTV 27, Demare 21.
- **Known bias:** 16 of 31 sets are one DJ (Chris Jordan). His signatures (mixed Lomuto/Demare/De Caro milonga tanda, Donato 1933–40 vocal tandas, Mascagni exit music) inflate Donato and Lomuto counts; rules below quote cross-DJ counts where it matters.

## 4. Distilled rules (with corpus evidence)

Counts are over the 30 complete sets unless stated; "full set" = ≥15 tandas (26 sets). Rel. position 0 = first tanda, 1 = last.

**Structure**
1. **Tango tandas are 4 tracks (77 %), vals and milonga tandas are 3 (93 % and 95 %).** Tango: 344×4, 85×3 (the 3-track ones are MOCKBA's práctica sets), 2×5. Vals: 85×3, 4×4. Milonga: 76×3, 1×4. *(619 tandas)*
2. **The cycle is TTVTTM: per full set ≈ 15 tango : 3 vals : 3 milonga.** Vals count ≥ milonga count in 24/26 full sets. Only 1 vals→milonga adjacency in 588 transitions; Melina Sedó and Tejas both forbid it. One DJ (Kohl) deliberately inverted to TTMTTV. *(26 sets)*
3. **One orchestra per tanda; mixed tandas are only for milonga and vals.** 17 of 80 milonga tandas and 5 of 91 vals tandas are mixed; 1 of 448 tango tandas (a deliberate old-guard tanda). *(619 tandas)*
4. **Year spread inside a tanda ≤3 years in 70 %, ≤6 in 89 %.** The >6 cases are almost all instrumental Di Sarli/D'Arienzo/De Angelis 1950s–60s, "greatest hits" vocal tandas (Canaro-Maida 1935–38), or a 1955 *Café Domínguez* placed with 1941 D'Agostino. *(523 tandas with years)*
5. **Vocal : instrumental for tango tandas ≈ 68 : 32.** The only orchestras played mostly instrumental are D'Arienzo (47 instr vs 32 vocal), Pugliese (14 vs 8), Biagi (11 vs ~25 vocal, so no), Quinteto Pirincho/Don Pancho/Hugo Díaz (always). *(448 tango tandas)*
6. **15 distinct orchestras per 4-hour set (range 10–21).** Median 15; the 6-hour sets reach 19–21. *(26 full sets)*
7. **The same orchestra returns after a median gap of 8 tandas; gaps ≤2 occur only for a standalone La cumparsita.** Of 123 orchestra repeats, 14 have gap ≤2, and 11 of those are "X tanda → single Cumparsita by X". *(30 sets)*

**Energy arc and orchestra placement**
8. **D'Arienzo is the most-played orchestra: 2–3 tango tandas per 4-hour set (20/26 full sets; 1 in 5 sets, 4 in 1), plus usually one vals and/or one milonga tanda.** Average 2.67 tandas/set when present; present in 30/30 sets. BA survey: 14.8 % of all tango plays. *(80 tandas)*
9. **The first D'Arienzo tanda arrives early (median 19 % of the set, 22/30 before 35 %) and is instrumental 1935–39 in 20/30 sets.** Echagüe 1938–39 vocal tandas are the second D'Arienzo appearance in most sets; Mauré 1941–44 is the late-night one (used in the last 25 % in 7 sets). *(30 sets)*
10. **Pugliese: once per night, never twice, and late.** Present in 21/31 sets; exactly 1 tanda in every set that has him; median rel. position 0.87, 18/22 at ≥0.60, earliest 0.31 (Kohl, as 5th of 14). 1940s "De Caro por Pugliese" instrumental tandas (Mala junta/Tiny/Boedo/Recuerdo/Tierra querida) are the ones placed earlier; 1955–59 (Emancipación/Gallo ciego/Pata ancha/La bordona/Nochero soy) are always in the last third. Pugliese is the most common final full tanda before La cumparsita (7/30). *(22 tandas)*
11. **Di Sarli 1–2 tango tandas per set (24/26 full sets), split between Rufino 1939–41 and instrumentals.** Instrumentals 1939–41 (Shusheta/El retirao/Catamarca/La trilla/El incendio) appear early-to-mid as a reset; 1951–58 instrumentals (El once/El amanecer/Organito de la tarde/Don Juan/Bahía Blanca) appear at median 0.76 as the elegant late tanda; Rufino 1939–40 *Corazón/Lo pasado pasó/Cosas olvidadas/En un beso la vida* is the single most repeated vocal tanda (4 sets, identical order) and twice the penultimate tanda. *(48 tandas)*
12. **Troilo 1–2 per set; instrumentals 1941 and Fiorentino 1941–43 are interchangeable mid-set builders (median 0.53); Marino only once in 41 tandas.** *Milongueando en el cuarenta / Cachirulo / Guapeando / El tamango* occurs in 7 sets. *(41 tandas)*
13. **Open with Canaro (8/31), Di Sarli instrumental (4), Rodríguez (3), Tanturi instrumental (3), Quinteto Don Pancho (3), Demare, Fresedo, D'Agostino. Never Pugliese, never vals, never milonga; D'Arienzo opened once.** First tanda is vocal in 19/31 (Canaro-Famá 1939, Canaro-Maida, Rodríguez-Moreno, Demare-Miranda). *(31 sets)*
14. **Canaro and Lomuto live in the first third (median 0.26 and 0.25); De Angelis and Fresedo in the second half (0.65, 0.59); Caló/Tanturi/Donato/Rodríguez/OTV are "anywhere" (0.38–0.47).** *(medians over ≥5 placements)*
15. **The final tanda before La cumparsita is a known, high-emotion tanda: Pugliese (7), D'Arienzo (5), D'Agostino-Vargas (3), Di Sarli (3), De Angelis instr. (2), then Troilo/Canaro/Biagi once each.** Of the 30, 25 end with La cumparsita; 5 end on a strong tanda without it (two of those were partial logs). *(30 sets)*
16. **La cumparsita versions actually used: D'Arienzo 1951 (5 sets), Troilo 1963 (5), D'Arienzo 1937/1963/1955, D'Agostino-Vargas 1945 (3), Troilo 1943, Biagi-Ortiz 1942, Canaro, De Angelis 1961, Di Sarli 1955.** Either as a single track after the last tanda (13 sets) or as the 4th/5th track of the closing tanda in the same orchestra (12 sets, e.g. D'Arienzo *El puntazo/Yapeyú/Tierrita/Dime mi amor/La cumparsita*). *(25 sets)*
17. **Alternative/non-tango tandas are absent from traditional sets; "colour" is instead a foxtrot tanda (Rodríguez-Moreno, 2 sets), Hugo Díaz harmonica tango-milongas (4 sets), Quinteto Pirincho or Los Muchachos de Antes milongas, or one modern orchestra tanda (Sexteto Cristal, 1 set).** Never more than one such tanda per set. *(31 sets)*

**Vals and milonga banks**
18. **Vals tandas: Biagi (13), D'Arienzo instr. (9), De Angelis Dante-Martel (8), Troilo-Ruiz (8), OTV (8), Caló (7), Rodríguez (5), Laurenz (5), mixed (5), Alberto Castillo (4), Donato (3), Tanturi-Castillo (3), Lomuto (3), Canaro (3), D'Agostino (3).** BA survey: D'Arienzo 32 %, mixed 30 %, Biagi 11 %, Troilo 8 %, De Angelis 5 %. *(91 vals tandas)*
19. **Milonga tandas: mixed (17), Donato (11), Canaro (11), D'Arienzo (10), Di Sarli-Rufino (9), Quinteto Pirincho (6), D'Agostino-Vargas (4), Hugo Díaz (3), Caló-Berón (2), Troilo, Biagi, Laurenz, Lomuto, Tanturi.** BA survey: Canaro 25 %, mixed 22 %, D'Arienzo 19 %, Di Sarli 17 %, Donato 11 %. *(80 milonga tandas)*
20. **Mixed milonga tandas are built from 1938–43 singles of Lomuto, Demare, De Caro, Malerba, Laurenz, OTV and Canaro (e.g. *Qué tiempo aquel / Carnavalito / Saca chispas*, 5 sets); candombe tandas close with Caló's *Azabache* or Canaro's *La rumbita candombe*.** *(17 tandas)*

**Singer canon (what is actually played, from the sets)**
21. **D'Arienzo: instrumental 1935–39 ≫ Mauré 1940–44 (18) > Echagüe 1938–39 (14) > Reynal/Laborde/Valdez (1 each, inside mixed-singer tandas).** 1950s–70s instrumentals (El puntazo, Yapeyú, Don Juan 1950, Este es el rey) are the late-night D'Arienzo. *(80)*
22. **Di Sarli: Rufino 1939–43 (20) > instrumental (16) > Podestá 1942–44 (7) > Durán 1945–46 (3) > Pomar/Florio/Ledesma 1954–58 (rare).** *(48)*
23. **Troilo: Fiorentino 1941–43 (18) ≈ instrumental 1938–44 (14) > Ruiz valses 1945–47 (8) > Marino (1). Pugliese: instrumental (14) > Chanel 1943–46 (4) > Morán 1945–52 (2) = Maciel 1955–59 (2).** *(63)*
24. **Caló: Berón 1942–44 (14) > Iriarte 1943–45 (9) > Podestá 1941–43 (3) = Ortiz 1943 (3) ≈ instrumental 1943–44 (3). Tanturi: Castillo 1941–42 (10) > instrumental 1940–41 (8) > Campos 1943–46 (4). Biagi: instrumental 1938–53 (11) ≈ Ortiz 1940–42 (10) > Amor 1943–46 (6) = Ibáñez valses 1938 (6) > Falgás 1939–40 (5) > Duval 1953–58 (4).** *(97)*
25. **Single-singer orchestras: Rodríguez-Moreno 28/34, Donato-Lagos (with Morales/Gavioli duets) 41/45, D'Agostino-Vargas 23/24, Fresedo-Ray 18/21 (Ruiz 3), Demare-Miranda 10/14, Lomuto-Omar 8/14, Malerba-Medina 5/5, Laurenz: Podestá 11 ≈ Casas 10, Canaro: Maida 17 > Famá 10 > instr. 5 > Roldán 3 (milongas), De Angelis: Dante-Martel 9 = instr. 9.** *(sets)*

**Openers and closers inside tandas**
26. **Most repeated tanda openers:** Donato *Qué hacés, qué hacés* (7), De Angelis *Mi dolor* (7), Pugliese *Mala junta* (6), Biagi *Lejos de ti* (6, vals), Laurenz *Vieja amiga* (5), Donato *Alas rotas* / *El adiós* (5), Troilo *Sosiego en la noche* (5), D'Arienzo *Amarras* (5), D'Agostino *Café Domínguez* (5), Demare *No te apures Carablanca* (4), Troilo *Milongueando en el cuarenta* (4), Biagi *Todo te nombra* (4), Di Sarli *Corazón* (4), D'Arienzo *Rawson* / *Pensalo bien* / *Milonga vieja milonga* (4), Pugliese *Emancipación* (4), Malerba *Remembranza* (4), Rodríguez *Este es tu tango* (4). *(ordered tandas, ≥3 tracks)*
27. **Most repeated tanda closers:** Donato *Carnaval de mi barrio* (6), Laurenz *No me extraña* (6), Troilo *Guapeando* (5), Pirincho *La cara de la luna* (5), Tanturi *Pocas palabras* / *Comparsa criolla* (4), Rodríguez *Cómo se pianta la vida* (4), D'Arienzo *Dime mi amor* (4), Donato *El huracán* / *Me voy a baraja* (4), Biagi *Loca de amor* (4, vals), De Angelis *Pavadita* (4), Troilo *Te aconsejo que me olvides* (4), Pugliese *Patético* (3), Di Sarli *En un beso la vida* (3), OTV *Adiós Buenos Aires* (3), Canaro *Nada más* (3), Caló *Tristezas de la calle Corrientes* / *Qué te importa que te llore* (either position). Lavocah's "hammock" (strong opener, test track 3rd, strongest closer) and Sedó's "first track gets them up, last leaves them happy" are visible in the data. *(same)*
28. **A tanda may mix two singers of the same period but never vocal with instrumental except in two sanctioned cases: D'Arienzo 1937–39 (instrumental ×3 + Echagüe/Carbel closer, e.g. *Paciencia*) and Tanturi 1940–41 (instrumental ×2 + Castillo ×2).** Mixed-singer tandas in corpus: D'Arienzo Mauré+Echagüe/Reynal (6), Donato Lagos/Morales/Gavioli (many), De Angelis Dante/Martel/Ruiz (5), Biagi Ortiz+Falgás or Amor+Saavedra (4), Laurenz valses with three singers (4), OTV valses Vargas/Pomar/Morales (5). *(sets)*

**What is not played**
29. **No Piazzolla, no 1960s Pugliese/Troilo concert pieces, no Gardel-with-guitars, no electrotango in any of the 31 sets.** The only post-1960 material: D'Arienzo 1963–73 instrumentals (El pollito, Este es el rey, Zorro gris, Hotel Victoria 1966), De Angelis 1961–74 instrumentals, Pugliese 1961 Cumparsita, Troilo 1963 (Danzarín once, La cumparsita 5×), Caló-Gatica 1965, Hugo Díaz 1972–73, Los Muchachos de Antes 1975, Sassone 1968, Villasboas, Sexteto Cristal 2018–19. Tango Voice: after 1960 "few recordings are danceable"; Tejas lists Danzarín/Responso-type pieces under "use sparingly". *(31 sets)*
30. **Guardia Vieja (pre-1935) is ≤1 tanda per set and placed in the first 40 %** (OTV 1930–33, Carabelli 1931–33, Lomuto-Charlo 1928–29, De Caro 1926–28, Canaro-Charlo 1929–30), per Sedó's "never more than one tanda of the very old orchestras". Exception: Carabelli as penultimate tanda in one Cambridge set. *(24 tandas)*

## 5. Agent guide — composing or reviewing a set with this corpus

**A. Load**
1. Read `reference_sets.json`. Index `famousRecordings` by `(orchestraId, normalisedTitle)`; index `canonicalTandas` by `(rhythm, orchestraId, singer)`; load `blacklist` as a set of `(orchestraId|null, normalisedTitle)` plus the title-only rules (Piazzolla, "Selección", "Responso", "Danzarín", "A fuego lento", "Adiós Nonino").
2. Use `data/knowledge/orchestra_profiles.json` for energy/BPM priors and `orchestras.json` for the id vocabulary; the four unknown ids above are legitimate orchestras missing from the index.

**B. Compose (target: N hours → 6 tandas/hour)**
3. Choose the cycle TTVTTM; tango tandas 4 tracks, vals/milonga 3 (rule 1–2). Plan backwards from the Cumparsita (rule 16).
4. Fill the skeleton with phase-matched canonical tandas: `warmup` for positions 1–3 (Canaro-Famá/Maida, Di Sarli instr. 1939–41, Rodríguez, Tanturi instr., Demare-Miranda, Don Pancho — rule 13); `build` for the first half; `peak` tandas (D'Arienzo-Echagüe/Mauré, Biagi, Tanturi-Castillo, Pugliese) between 35 % and 90 %; `cooldown` (Caló-Berón, Di Sarli vocal, Fresedo-Ray, Laurenz-Podestá, Tanturi-Campos) directly after peaks and in the last quarter; `close` for the final tanda (rule 15).
5. Quotas per 4 h: D'Arienzo 2–3 tango tandas (first one instrumental 1935–39 before 35 %), Di Sarli 1–2, Troilo 1–2, Pugliese exactly 1 at ≥60 %, Biagi 1–2, every other orchestra ≤1, ≥15 distinct orchestras, Guardia Vieja ≤1 and early, "colour" tanda (foxtrot/harmonica/modern) ≤1 (rules 6, 8–12, 17, 30).
6. Vals bank: draw from Biagi, D'Arienzo instr., De Angelis Dante-Martel, Troilo-Ruiz, OTV, Caló, Rodríguez, Laurenz, Castillo (rule 18). Milonga bank: Donato, Canaro, D'Arienzo, Di Sarli-Rufino, Pirincho, D'Agostino, mixed 1938–43 (rules 19–20). Never put vals and milonga tandas next to each other.
7. Inside a tanda: one orchestra; one singer or all instrumental (allowed exceptions in rule 28); year spread ≤3 (≤6 for 1950s instrumentals); first track from `role: opener` or high `fame`, last from `role: closer`; unfamiliar tracks only in position 3 (rule 26–27, Lavocah).
8. Never repeat a title in the night (any orchestra). Prefer tracks with `fame ≥3`; a tanda may carry at most one `fame 2` track.
9. Choose the Cumparsita by the closing orchestra's mood: D'Arienzo 1951 after a rhythmic ending, Troilo 1963/1943 or Di Sarli 1955 after a lyrical ending, D'Agostino-Vargas 1945 or Biagi-Ortiz 1942 when the closing tanda is that orchestra (rule 16).

**C. Review (score an existing set)**
10. Hard fails: any `blacklist` hit; vals adjacent to milonga; Pugliese before 50 % or more than once; opening with Pugliese/vals/milonga; a tanda mixing instrumental and vocal outside rule 28; title repeated; tango tanda of 5+ tracks; year spread >6 in a vocal tanda; more than one post-1960 tanda; ends without La cumparsita (flag, not fail, outside BA).
11. Soft scores (0–1 each, weight as in `dj-benchmark.md` §2.1): D'Arienzo count in {2,3}; first D'Arienzo instrumental and before 35 %; Di Sarli/Troilo counts in {1,2}; distinct orchestras ≥15 per 4 h; orchestra repeat gap ≥5 (except Cumparsita); vocal share of tango tandas 0.55–0.75; era histogram within ±10 points of 73/14/9/4; Canaro/Lomuto in first third and Pugliese/De Angelis-instr/late Di Sarli in last third; vals and milonga banks drawn from the orchestras in rules 18–19; opener/closer tracks matching `role`; match rate against `canonicalTandas` (≥2 shared titles with same orchestra/singer) — a good 4-hour set matches 8–14 of its ~20 tandas.
12. Report per-tanda: matched canonical id (if any), phase vs. position mismatch, singer/era canon violations (rules 21–25), and energy curve (mean `energy` per tanda) checked against the template rising → peak(s) → lyrical plateau → late peak → close.

**D. Caveats**
13. The corpus is UK/EU/US set-blogs; BA conventions (two Cumparsitas, 4-vals tandas, chacarera/cumbia breaks) are not evidenced here. `energy` values are estimates, not measurements. `fame` reflects presence in this corpus, not global play counts; Tango Voice's BA percentages are the only play-count data.
