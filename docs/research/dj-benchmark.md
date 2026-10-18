# Milonga DJ Benchmark — what "world-class" sounds like, and how a machine can measure it

*Written from the DJ booth, October 2026. Opinionated on purpose. Where a claim comes from a public source it is cited at the end; where it comes from twenty years of marathons, encuentros and Buenos Aires milongas, it is marked "(booth experience)". Treat the second kind as expert prior, not fact.*

---

## 0. Executive summary for the product team

1. A great milonga set is **not** a great list of tango tracks. It is a sequence of 4-song mood-blocks (tandas) with a predictable rhythm cycle (TTVTTM), a planned energy arc, strict orchestra/era coherence inside each tanda, strict *variety* between tandas, cortina discipline, and the best available transfers of each recording.
2. Roughly 70% of "is this a professional set?" is computable from clean metadata (orchestra, singer, recording date, rhythm, duration, label/transfer source, a rough energy tag). The remaining 30% is ears and floor-reading: key/tempo flow inside a tanda, opener/closer strength, whether that D'Arienzo transfer is the CTA one or a muddy bootleg.
3. The single biggest "machine-made" tell is **metadata-correct but musically dumb** tandas: four Di Sarli vocal tracks with three different singers spanning 1941–1956; a Pugliese tanda at 21:30; two valses 20 minutes apart; a 1928 Canaro next to a 1952 Pugliese; cortinas of random length.
4. Build the product around *constraints a DJ can lock and override*, not around a one-shot generator. Pros want a co-pilot that respects their tanda library and lets them swap one track in 2 seconds while the floor is dancing.

---

## 1. Who and what are the benchmark today

### 1.1 The DJs people fly to hear (booth experience + festival line-ups)

**Buenos Aires — the reference sound**
- **Mario Orlando** — Sunderland, Canning, Villa Malcolm etc. Festival announcements call him "the most famous tango DJ in the world" and note he rarely leaves Buenos Aires. Textbook traditional: D'Arienzo/Biagi/Troilo/Di Sarli/Pugliese backbone, strong vocal era 1940–47, nothing experimental. [S9]
- **Félix Picherna** (d. 2023) — DJ since 1958 (Club Viento Norte), "anchorman of the tango DJs"; the Buenos Aires canon of *which* 400 tracks get played is largely his. [S9]
- **Dany Borelli** (Cachirulo, Obelisco Tango) — the canonical "milonga tradicional" set; rhythmic early-40s heavy.
- **Damián Boggio**, **Marcelo Rojas** (world championship milongas, 30+ yrs), **Ariel Ramírez** (Milonga de los Campeones), **Vivi La Falce**, **Carlos Rey**, **Mario Orlando's student circle**. [S9]
- Buenos Aires DJs typically play a loosely chronological night: Guardia Vieja / early Canaro & OTV first, Golden Age core, Pugliese/late Di Sarli at the end. [S2]

**Europe — the marathon/encuentro circuit (where the "good set" conversation actually happens)**
- Names that headline marathons and encuentros repeatedly (booth experience, cross-checked with line-ups on tango-dj.at marathon pages and tangopolix): **Théo "El Greco" Chatzipetros**, **Alan Spotti**, **Bernhard Gehberger** (Vienna; Tango-DJ.at, Alpine Abrazo, Vienna Calling organizer, the European reference for rare CTA/original transfers) [S10, S11], **Jens-Ingo Brodesser** (Brussels; the leading European voice on transfer quality) [S12], **Céline Devèze** (Paris), **Damian Lobato**, **Bruno Pensa**, **Antti Suniala**, **Andres Molina**, **Lampis Zalavras**, **Anna Dunkel**, **Vincent Morelle**, **Luca Lamberti**, **Michael Lavocah** (Brighton; author of *Tango Stories: Musical Secrets* and the TodoTango "Tango DJing" series, the most-read English-language DJ manual) [S1–S3], **Mirko Lo Russo**, **Ricardo Schoua**, **Konrad Krynski**, **Roberto Zuccarino**, **Pedro Farías Gómez (Ensueño)**.
- Common denominator: 100% traditional repertoire 1935–1955 (plus a few late-50s Pugliese/Di Sarli/D'Arienzo), 4-3-4 tanda structure, 6-tanda TTVTTM cycle, cortinas strictly 30–45 s, best available transfers (TangoTunes / CTA / original 78 restorations), and visible energy design over 6–12 h blocks.

**Istanbul / Turkey** — enormous scene (Istanbul Tango Fiesta, TangoTo Istanbul, Tango 2 Istanbul). Same Golden Age canon [S14]; DJs skew brighter/faster (D'Arienzo, Biagi, Rodríguez, Tanturi–Castillo), shorter sets (3–4 h), long cortinas with Turkish pop and 80s hits; **Chacarera and a Turkish-pop "dance break" tanda** is common at festivals.

**Asia (Seoul, Tokyo, Taipei, Shanghai)** — Seoul is now one of the two biggest scenes on earth; very high transfer-quality standards (Japanese CTA culture), ultra-traditional selection, polished short sets, zero alternative; Seoul milongas run late and love Troilo/Fiorentino and late Di Sarli. Taipei/Shanghai marathons import European DJs. (booth experience)

**USA/Canada** — more heterogeneous: strict traditional (Tango Element-style weekends, All-Night Milonga), but also "alternative tango" nights where *entire* alternative tandas are played. Many local DJs still play from laptop iTunes with 3-song tandas and 5-min cortinas; the US scene is the one where "no, the cortina is not for dancing" still has to be said. [S4, S15]

### 1.2 Public playlists worth benchmarking against

Caveat: Spotify is **not** where professional sets live (pros play local lossless files; Spotify catalog has bad transfers, wrong speeds, incomplete orchestras, and ads). But as *structural* benchmarks the following are real, public and reasonably built:

| Playlist | URL | Why it's a useful benchmark |
|---|---|---|
| Thoma Tango Leipzig – Playlist for Milonga – Tandas & Cortinas | https://open.spotify.com/playlist/3vQJ0sp2lvTRtGyXiyqSr2 | Full milonga with tango/vals/milonga tandas and cortinas, European marathon style [S13] |
| Argentine tango 4hr playlist (1) in tandas with cortinas (tango.uk.com) | https://open.spotify.com/playlist/05npMIXusZ3r1LHUz3dk01 | Complete 4-h set with cortinas; good for "what a whole evening looks like" [S16] |
| Tango TANDAS (CON CORTINAS) – Mariano Levy | https://open.spotify.com/playlist/2n5wREivSoxEd9JRFuAxaW | 191 tracks, BA-style construction with cortinas [S16] |
| Tango Tandas mit Cortina – Jim Tröster | https://open.spotify.com/playlist/1xrrYjC155y9CSemkf7wwc | German-scene example [S16] |
| Milonga with Tandas and Cortinas – ilmug | https://open.spotify.com/playlist/6JWAB75AxoS7r8uMcwOjlY | 123 tracks [S13, S16] |
| Milonga Tandas – Tango Argentina – Aren León Tango Archive | https://open.spotify.com/playlist/2t0ZCRYyQmsHmNvYncrHD4 | Explicitly built from El Recodo / TodoTango data [S13] |
| Argentine Tango – Vals and Milonga Tandas – sagearpm | https://open.spotify.com/playlist/4ZI4FrwCzL21EjEkzaJRpv | Rhythm-specific tanda bank [S13] |
| Tandas Tango ✨ Contemporáneo – Christian Martínez | https://open.spotify.com/playlist/64lXslP4vSvltZKjX9SF0i | 371 tracks of *modern* orquestas típicas (Romántica Milonguera, Sans Souci, Misteriosa BA, Color Tango…) — benchmark for "nuevo-traditional" nights [S13] |
| TANGO NUEVO with cortinas – marishakun | https://open.spotify.com/playlist/6cOvYUgBtj8ERTUK2FPpNP | Alternative/nuevo milonga with cortinas [S16] |
| Tangos y Milongas (Spotify editorial) | https://open.spotify.com/playlist/37i9dQZF1DXcCT9tm6fRIV | 248K saves — **anti-benchmark**: no tandas, no cortinas, mixed eras; this is what a machine must NOT produce [S13] |

YouTube: "5 Hours Playlist 1 Milonga & Cortinas by TDj Serghei Ciobanu" (https://www.youtube.com/watch?v=qmgCinODHto) is a complete filmed set. [S16] Tango Amistoso's "Milonga Tandas" page lists numbered tandas with Spotify/YouTube links. [S13]

### 1.3 Databases, tools and communities (the "ecosystem" the product must interoperate with)

- **tango.info / tanda.tango.info** (Tobias Conradi) — the canonical open discography: per-recording "TINT" IDs, orchestra/singer/date/genre, and a tanda sub-site where DJs publish tandas. Unreachable at time of writing (DNS failure); historically intermittent. Treat as reference schema, not a live dependency.
- **El Recodo (el-recodo.com)** — the DJ's discography of record: ~15k+ recordings with orchestra, singer, date, genre, composer, lyricist, style tags; "Play! El Recodo Tango" iPad app with Tanda mode and audio recognition; **TangoLink** desktop app auto-tags local files from the DB (orchestra, singer, recording date). **Interop target #1.** [S17]
- **TodoTango** — biographies, lyrics, Lavocah's 3-part DJing series. [S1–S3]
- **Tango-DJ.at** (Gehberger) — shop for CTA originals, newsletters on CD quality, bootleg detection guide. [S10, S11]
- **TangoTunes** (Vienna) — lossless downloads of new transfers from original shellac; the D'Arienzo series moved most restoration into the analog domain (restoration preamp + EQ, minimal digital declick). Widely considered the current best commercial source. [S12]
- **TangoTime Table** (tangotimetable.com) — tango-specific DJ software with timeline, tanda/cortina lanes, dual player; also **TandaBuilder** (macOS, two players, drag-drop tandas, shows orchestra/singer/era/duration). [S18]
- **Tango DJ communities**: TangoDJ (Yahoo-era, now Groups.io), "Tango DJs" & "DJ de Tango" Facebook groups (~10k members), r/tango, Tango-L archive, Jens-Ingo's blog, Michael Lavocah's milonga.co.uk reviews of Euro Records etc. [S12, S19]
- **Festival DJ programmes** (tango-dj.at/marathon/djs.htm, tangopolix.com) are the best public record of who is actually booked.

---

## 2. What makes those sets great — concrete, checkable factors

### 2.1 Structural (fully computable)

| Factor | Pro norm | Check |
|---|---|---|
| Tanda length | Tango 4, vals 3 (or 4), milonga 3. Never 5. Never 2 except a deliberate "short-tanda opener" or a time-crunch closer. [S1, S4] | count per tanda |
| Rhythm cycle | TTVTTM (or TTVTM in short nights). Vals and milonga never adjacent; never two milongas within 5 tandas. [S3, S4, S5] | regex over rhythm sequence |
| Same orchestra inside a tanda | 100% in traditional sets. Mixed-orchestra tandas (e.g. "Rodríguez + Tanturi rhythmic") only in Guardia Vieja or milonga/vals banks where one orchestra has too few titles. [S1] | orchestra uniform |
| Era inside a tanda | ≤ 3–4 years spread for the "big four"; ≤ 6 for smaller catalogues. A 1941 and a 1951 Di Sarli are different orchestras. (booth) | max(year)−min(year) |
| Singer inside a tanda | All-instrumental or one singer. Two singers only when they are the same "period" (e.g. Castillo/Campos with Tanturi 1941–43 is tolerated; Vargas + Vargas-Rufino duets fine). Never instrumental + vocal mixed. [S1, S4] | singer uniform / null |
| Orchestra spacing | Same orchestra not repeated within 6 tandas (one full cycle); the "big four" (D'Arienzo, Di Sarli, Troilo, Pugliese) usually return every 1.5–2 h; never the same orchestra+rhythm twice in a night in ≤5 h sets. (booth; [S4] "each tanda different orchestra from its neighbours") | gap histogram |
| Title repeats | No song title twice in a night (different orchestras of "Poema" count as a repeat for the dancers). | title normalised |
| Rhythm/tempo coherence inside a tanda | BPM drift ≤ ~6% between slowest and fastest track; same "sub-genre" (rhythmic vs lyrical, canyengue vs milonga lisa). (booth) | BPM range |
| Tanda duration | 10–13 min tango, 8–10 vals, 7–9 milonga. (derived from 2:30–3:15 tracks) | sum |
| Cortina | 30–45 s (Europe/BA), identical fade-in/out, one theme per night or per cycle; floor-empty rule. Never danceable in the host culture (no swing at a US milonga; no cumbia in BA). [S4, S5, S6] | duration & consistency |
| Per-hour variety | ≥ 5 distinct orchestras per hour; ≥ 10 per 3 h; ≥ 20 per 8 h marathon set. | distinct count |
| Vocal/instrumental balance | 55–70% vocal tandas in BA/European sets; 100% instrumental sets read as "beginner-safe but boring". (booth) | ratio |
| Era balance | Golden Age (1935–1955) ≥ 80% of tandas in a traditional set; Guardia Vieja ≤ 10%, post-1955 ≤ 10%, each placed deliberately (early = Guardia Vieja; late = Pugliese 50s). [S2] | histogram |
| Energy arc | Start medium-rhythmic (Canaro/D'Agostino/Rodríguez), peak(s) with D'Arienzo/Biagi/Tanturi, lyrical plateaus (Troilo/Di Sarli/Caló/Laurenz), Pugliese only after 60% of the night, final 2–3 tandas = planned climax or intimate ending, then La Cumparsita. [S3, S4] | energy curve vs template |
| Opening | Never Pugliese, never a vals, never a milonga, never late De Angelis strings. Open with accessible rhythmic tango (Canaro 1938–40, D'Agostino–Vargas, Rodríguez–Moreno, Donato). [S19] | first tanda rules |
| Last tanda | Known, loved, high-emotion (Di Sarli–Rufino/Durán, Troilo–Fiorentino, Pugliese–Chanel, D'Arienzo–Echagüe) → La Cumparsita (one, in BA sometimes two versions). [S4] | ends with "La cumparsita" |

### 2.2 Audio & source quality (semi-computable: needs a label/transfer tag per file)

Ranked by what pros actually play (booth; [S12], [S10], [S20]):

1. **TangoTunes** flat/analog-domain transfers from original shellac — current gold standard for D'Arienzo, Di Sarli, Troilo, Biagi, Rodríguez, Canaro.
2. **CTA (Club Tango Argentino, Japan)** originals — benchmark for decades; beware fake/"look-alike" bootlegs (D'Arienzo "Vol. 26–48" are not CTA). [S10]
3. **Original 78 private restorations** (Jens-Ingo Brodesser, Tango Tiempo, Ignacio Varchausky's collection, "Archivo del Bandoneón")
4. **El Bandoneón / Blue Moon / Harlequin (Spain)** — good notes, but often LP sources with added reverb, some run fast. [S12]
5. **Euro Records "Colección 78 rpm"** (from 78s, bassy but honest) > **"Archivo TK"** (LP transfers). [S20]
6. **RCA/BMG "Reliquias" / EMI "De colección" / "Solo Tango"** — official remasters, often heavy NR and pitched; acceptable, not preferred.
7. **Spotify/YouTube/"Remastered 2020" AI-upscaled versions** — pros avoid; stereo widening, wrong speed, lossy.

Checkable: lossless format (FLAC/ALAC/WAV ≥16/44.1), label tag, loudness normalisation (ReplayGain/EBU R128 to ≈ −14 to −16 LUFS; shellac-era peaks vary by 6–8 dB), **pitch/speed correctness** (compare duration to El Recodo/tango.info reference duration ± 1.5%), no clipping, mono where source is mono.

### 2.3 Floor-reading and context (human)

- Tension/release cycles 2–3 times per evening; "if many sit down, the music isn't inspiring; if they fight the rhythm, go simpler (Di Sarli, early Canaro, D'Arienzo)". [S4]
- 3-h milonga stays high-energy throughout with one special final tanda; 6-h milonga has three phases (sparse → crowded transition → late) with a main climax and possibly an earlier subsidiary one. [S3]
- Plan backward from a fixed end time. [S3]

### 2.4 Regional profiles (defaults the product should ship)

| Region | Cycle | Tango/vals/milonga sizes | Era centre | Cortina | Alt/Nuevo | Notes |
|---|---|---|---|---|---|---|
| Buenos Aires traditional | TTVTTM | 4/3/3 (some 4/4/4 in old-school venues) | 1938–50 | 20–40 s, same clip all night; sometimes full salsa/rock/chacarera/cumbia breaks 2–3×/night [S5] | none | Two Cumparsitas common; chamamé/chacarera "folklore tanda" late |
| Europe marathon/encuentro | TTVTTM | 4/3/3 | 1935–55 | 30–45 s, themed, never danceable | none | ≥20 orchestras per 8 h; strong Guardia Vieja/Laurenz/Lomuto/Malerba colour |
| Europe festival milonga | TTVTTM / TTVTM | 4/3/3 | 1935–55 (+ some modern típicas) | 30–60 s | rare, one late tanda max | Show breaks mess the arc; DJ must re-ramp after shows |
| Istanbul | TTVTTM | 4/3/3 | 1935–50, bright | 45–90 s, Turkish pop / 80s / dance | festival "pop break" | Faster average BPM; D'Arienzo/Biagi/Rodríguez heavy |
| Seoul/Tokyo/Taipei | TTVTTM | 4/3/3 | 1935–55 | 30–45 s, jazz/K-indie | none | Highest audio-quality expectations; late Troilo/Di Sarli loved |
| US/Canada | TTVTTM / TTVTM | 3–4/3/3 | 1935–55 ± | 30–60 s, often jazz/swing | 0–2 alt tandas late; separate "alternative milongas" | Audience less era-literate; more vocal-era mixing tolerated |
| Alternative/Nuevo milonga | free (often TTV or theme blocks) | 3–4 | Gotan, Bajofondo, Otros Aires, Narcotango, Piazzolla, non-tango (Chopin, Tom Waits…) | optional | all | Still benefit from tandas by "mood" and cortinas |
| Práctica | loose TTVTTM | 3–4, cortinas optional | any | short or none | some | Longer runs of one style for practice is OK |

---

## 3. Playlist evaluation rubric (0–100)

### 3.1 Computable from metadata (max 70 points)

| # | Criterion | Pts | Scoring rule |
|---|---|---|---|
| C1 | **Tanda integrity** — orchestra uniform, rhythm uniform, vocal/instr not mixed | 12 | −3 per violating tanda, floor 0 |
| C2 | **Singer consistency** — ≤1 singer per tanda (duets = 1) | 6 | −2 per tanda with >1 singer, −1 if the 2 singers are same-period partners |
| C3 | **Era tightness inside tanda** — year span ≤4 (big orchestras) / ≤6 (small) | 8 | −2 per tanda over limit; −4 if span >10 |
| C4 | **Tanda sizes** — tango 4, vals 3–4, milonga 3 | 5 | −2 per odd size (2 or 5+), opener/closer exemption flag |
| C5 | **Rhythm cycle** — matches TTVTTM/TTVTM; V and M never adjacent; no two M within 4 tandas | 8 | −2 per deviation |
| C6 | **Orchestra spacing** — no orchestra repeated within 6 tandas; no orchestra+rhythm pair repeated within 12 | 8 | −2 per violation |
| C7 | **Orchestra variety** — distinct orchestras ≥ 5/h, ≥ 10/3 h, ≥ 18/6 h | 6 | linear |
| C8 | **No title repeats** (normalised, ignoring orchestra) | 3 | −1 each |
| C9 | **Tempo coherence in tanda** — BPM range ≤6% | 5 | −1 per tanda over, −2 if >10% |
| C10 | **Energy arc fit** — tanda energy (1–5) vs template for set length (no Pugliese/late Di Sarli before 50%; no vals/milonga first; peaks spaced; final 3 tandas rising or deliberately intimate) | 10 | RMSE vs template, scaled |
| C11 | **Cortina discipline** — all cortinas 25–60 s (region-configurable), same family/theme, present after every tanda, none after last Cumparsita | 5 | −1 each |
| C12 | **Transfer/source quality** — label tier (1–7 above), lossless, speed-check vs reference duration ±1.5%, loudness within ±2 LU | 8 | weighted avg over tracks |
| C13 | **Ending** — last tanda qualifies (vocal, well-known orchestra, energy ≥4 or ≤2 "intimate" by design) + La Cumparsita last | 4 | binary parts |
| C14 | **Duration fit** — total within ±4 min of target; tanda durations in norm | 3 | linear |
| **Sum** | | **91** → rescale to **70** | |

### 3.2 Needs human ears / context (max 30 points)

| # | Criterion | Pts | How a reviewer scores it |
|---|---|---|---|
| H1 | Opener and closer of each tanda are actual openers/closers (intro vs. "finished" feeling; known hit first) [S1, S4, S19] | 8 | sample 5 tandas |
| H2 | Key/mood flow inside tanda (not just BPM): no jarring key jumps, no dirge in slot 2 | 6 | listen |
| H3 | Transitions between tandas feel logical (rhythmic→rhythmic-harder→milonga; lyrical→vals; after Pugliese → sophisticated vals not Lomuto) [S4] | 6 | listen |
| H4 | Transfer *actually* sounds good (not just label tag): no pitch error, no fake stereo, no clipping, consistent EQ across the tanda | 5 | A/B |
| H5 | Fit to the room: crowd level, time of night, regional culture, event type | 5 | DJ judgement |

Grade bands (booth-calibrated): **≥85** = headline marathon DJ; **70–84** = solid regular milonga DJ; **55–69** = enthusiastic amateur; **<55** = Spotify radio.

---

## 4. Numbers: hours, tandas, structures, requests, endings

- **Tandas per hour**: a TTVTTM cycle ≈ 65–72 min including cortinas (4×~12 min tango + ~9 vals + ~8 milonga + 6×40 s). So ≈ 5–5.5 tandas/h; a 4-h milonga ≈ 20–22 tandas; a 6-h ≈ 31–33; an 8-h marathon slot (two DJs × 4 h is the common split) ≈ 42–44; a 3-day marathon ≈ 30+ h / 160+ tandas across 8–10 DJs. [S3, S5]
- **Set lengths by event type**: BA milonga 5–7 h (one DJ); European milonga 4–5 h; festival milonga 5–6 h with show; marathon 3 days, DJ slots 3–4 h in blocks (Friday evening–night, Saturday afternoon+night, Sunday); encuentro similar but 2–2.5 h slots with tighter rotation; práctica 2–3 h. (booth)
- **Tanda structure actually used by top DJs**: 4-3-3 (tango-vals-milonga) is dominant in Europe/BA/Asia; 4-4-4 survives in some old BA venues and with some veteran DJs (Picherna generation); 3-3-3 is a US/beginner-scene habit. 5-track tandas = "usually a DJ mistake". [S1, S4, S5, S19]
- **Opening**: if the floor is sparse, several single tangos or 2-track mini-tandas before the first full cycle is accepted. [S3]
- **Requests**: pros in marathons take none; milonga DJs accept a request only if it fits the arc (swap into the next matching slot, never interrupt a tanda); birthday vals ("vals de cumpleaños") is a Buenos Aires ritual the product should support as a named special tanda (usually one well-known vals, e.g. Di Sarli "Bajo el cielo azul" / Canaro "Desde el alma", played at a set clock time). Chacarera/zamba/folklore breaks on request in BA & diaspora. (booth)
- **Last tanda & La Cumparsita**: last tanda is announced ("última tanda") in BA; La Cumparsita closes virtually every traditional milonga worldwide; BA commonly plays two or more versions (e.g. D'Arienzo 1951 or Troilo 1943 or Di Sarli 1955 / Pugliese), Europe one. DJ chooses the version to match the ending mood. [S4] The product should keep a "Cumparsita bank" of 6–8 versions.
- **Show/live-orchestra breaks**: after a live orchestra set or show, re-ramp with one strong rhythmic tanda (D'Arienzo / Biagi) not a vals. (booth)

---

## 5. Feature wish list (ranked)

### MUST (a pro won't use it without these)
1. **Tanda as the first-class object** — lock/unlock a tanda; lock a position; drag whole tandas, not tracks.
2. **Swap one track** inside a tanda with candidates filtered by same orchestra/singer/era/rhythm, sorted by fit.
3. **Hard constraints editor**: tanda sizes, cycle pattern (TTVTTM/TTVTM/custom), orchestra repeat gap, singer rule, era span, no title repeat, vocal/instrumental purity, opener ≠ Pugliese/vals/milonga.
4. **Energy curve editor** (draw the arc; generator fills it; show deviation).
5. **Timeline with real clock** (start 21:00, show at 23:30, última tanda at 02:50, Cumparsita 03:00; plan backward from end). [S3]
6. **Cortina library** per culture/theme with auto-trim (30/45/60 s), fade curves, "same cortina all night" or "cortina per cycle" modes.
7. **El Recodo / tango.info metadata import** (TangoLink tags, TINT IDs) and fuzzy matching of local files; show *recording date* not release date.
8. **Transfer/source tier tag** per file (TangoTunes/CTA/EB/Euro/other) with "prefer best transfer of this recording" dedupe.
9. **Duplicate-recording detection** (same orchestra+title+date from different labels) and **title-repeat guard** across the night.
10. **Sort/filter by recording date**, singer, rhythm, style tag (rhythmic/lyrical/dramatic), duration.
11. **Export**: M3U8 (relative & absolute paths, UTF-8), Rekordbox XML, Traktor NML, Serato crates, VirtualDJ, iTunes/Music XML, CSV/PDF set list with cortinas marked.
12. **Offline-first**; no cloud dependency during the set; library on local disk.
13. **Pre-listen/cue in headphones** or hand-off to the DJ's player (at least: send next tanda to a dual-deck player).
14. **Loudness normalisation** (EBU R128) and clipping warnings per tanda.
15. **Speed/pitch sanity check** against reference durations (±1.5%) — flags bad transfers.

### SHOULD
16. **BPM & key drift display inside a tanda** (and flag >6% BPM range).
17. **"Make it look like": regional presets** (BA / Europe marathon / Istanbul / Seoul / US / Alternative / Práctica).
18. **Orchestra heat-map** across the night (gap visualiser; big-four spacing).
19. **Era histogram and vocal/instrumental ratio** panels with targets.
20. **Floor-feedback knob** (live: "more energy / calmer / simpler rhythm") that re-plans *only unplayed, unlocked* tandas.
21. **Special tandas**: vals de cumpleaños, chacarera/folklore break, show slot, "post-show re-ramp", two-Cumparsita ending.
22. **Tanda bank**: save curated tandas with tags; generator prefers banked tandas; shows "last played at venue X on date Y" to avoid predictability. [S1]
23. **Print/PDF set list** with timings and a "played at" log for the organiser.
24. **Audio fingerprinting** (Play! El Recodo-style) to identify untagged files.
25. **Rubric score** (section 3) live, with a per-violation explanation and one-click fix.
26. **Cortina trim editor** (in/out points, fade length, volume offset) with per-cortina preview.
27. **Request queue** that proposes the next legal slot for a requested track/orchestra.
28. **Compare two sets** (yours vs. a benchmark playlist) on the rubric.

### COULD
29. "Famous tanda" suggestions from community data (tanda.tango.info / published sets).
30. Energy/style auto-tagging via audio analysis (rhythmic vs lyrical classifier) for untagged files.
31. Voice/large-screen "now playing" display for the venue (orchestra, singer, year).
32. Venue profiles (sound system EQ notes, crowd level, usual end time).
33. Set-length morphing: compress 5 h plan into 4 h by dropping whole tandas, keeping the arc.
34. Collaborative hand-over: export "what I played" to the next marathon DJ so they avoid repeats across slots.
35. Spotify/YouTube link-out for sharing a *preview* of the set (never the master).

---

## 6. Common amateur mistakes and "this looks machine-made" tells

**Amateur mistakes** (Tango-L, r/tango, TodoTango, booth):
- Opening with Pugliese, a vals, a milonga, or late-50s strings. [S19]
- Fast tanda right after slow with no bridge; two Pugliese tandas in 90 min. [S19]
- 3-track tango tandas by default; 5-track tandas; inconsistent sizes so dancers can't count. [S1, S4]
- Mixed vocal/instrumental or two singers in one tanda; Di Sarli 1941 Rufino next to Di Sarli 1956 Florio. [S1]
- Cortinas that are danceable in that culture, full-length songs, or wildly varying lengths; no cortina after some tandas. [S4, S5]
- Playing from Spotify/YouTube with ads, wrong speed, fake stereo, and 8 dB loudness jumps between tracks.
- Ignoring the clock: no última tanda, no Cumparsita, or Cumparsita 20 min early.
- Too much Guardia Vieja or too much nuevo for the room; "DJ's taste over crowd needs". [S4]
- Same 40 hits in the same order every week ("the public start to know the next song"). [S1]

**Machine-made tells** (what a reviewer spots in a generated set in 30 seconds):
1. Metadata-perfect, musically wrong tandas: four obscure Di Sarli instrumentals that no one knows, with the hit nowhere or in slot 3.
2. Uniform tanda durations to the second; every cortina exactly the same length to the millisecond with no fades.
3. Era spans that are *technically* ≤4 years but cross a stylistic break (Troilo 1941 Fiorentino vs 1944 Marino; D'Arienzo 1935 Biagi-era vs 1939 Echagüe-era).
4. Round-robin orchestra rotation (D'Arienzo, Di Sarli, Troilo, Pugliese, repeat) — real DJs vary gap lengths and bring in Laurenz, Demare, Malerba, Lomuto, Federico, García as colour.
5. Vals/milonga tandas using the only three valses the DB knows per orchestra → same vals bank every night.
6. Energy curve that is a straight line or a perfect sine; no subsidiary climax, no deliberate dip before the finale.
7. Pugliese spaced evenly from hour one.
8. Singers mixed because the generator treated "Castillo" and "Alberto Castillo" or "Vargas" and "Ángel Vargas" as different people (or the same singer across different orchestras).
9. Title duplicates across orchestras ("Poema" by Canaro then "Poema" by somebody else).
10. Two versions of the same recording (CTA and Euro Records) both present as different tracks.
11. Ending on whatever the last computed tanda was; no Cumparsita; or Cumparsita by an orchestra not played all night.
12. Cortina genre ignoring region (swing at a US milonga, cumbia in BA).

---

## 7. Cortina preferences and 2025–26 ideas

**Principles**: 30–45 s clip, hard in / 2–3 s fade out, 1–3 dB below programme loudness, one theme per night (or one per cycle) so the room learns the signal, never danceable *for that room*, no lyrics that shout. [S4, S5, S6] Istanbul and BA tolerate longer (45–90 s) and louder cortinas; encuentros want short and discreet.

**Regional defaults**
- Buenos Aires: jazz/swing standards, rock nacional (Charly García, Soda Stereo), cumbia & salsa as occasional full-song dance breaks, Sinatra. [S5]
- Europe marathon: instrumental jazz, soul, Italian 60s, French chanson, surf, film themes; one artist/theme per night.
- Istanbul: Turkish pop (Tarkan, Sezen Aksu, Ajda Pekkan), 80s synth, Greek laika.
- Seoul/Tokyo: jazz, city pop, bossa, K-indie.
- US: 50s/60s rock'n'roll, Motown, Americana (and the eternal "don't play swing" caveat). [S4]

**Concrete 2025–26 cortina picks (one theme per night; 30–45 s clips)**

| Theme | Songs (artist – title) |
|---|---|
| Swing / jazz | Count Basie – "Jumpin' at the Woodside"; Benny Goodman – "Sing, Sing, Sing" (intro only); Louis Prima – "Jump, Jive an' Wail"; Nina Simone – "My Baby Just Cares for Me"; Chet Baker – "Let's Get Lost"; Dave Brubeck – "Take Five" (head) |
| Turkish pop | Tarkan – "Şımarık"; Sezen Aksu – "Hadi Bakalım"; Ajda Pekkan – "Bambaşka Biri"; Barış Manço – "Dağlar Dağlar"; Mabel Matiz – "Gel"; Edis – "Roman"; Sertab Erener – "Everyway That I Can" |
| Greek | Haris Alexiou – "Dirlada"; Dalaras – "Ola Kala"; Mikis Theodorakis – "Zorba" (intro, never the full accelerando); Marinella – "Ola kala ki ola orea"; Eleni Foureira – "Fuego" |
| Persian | Googoosh – "Man Amadeam"; Ebi – "Kavir"; Viguen – "Mahtab"; Sogand – "Daram Miram"; Arash – "Boro Boro" |
| Balkan | Goran Bregović – "Kalashnikov" / "Mesečina"; Boban Marković – "Đelem Đelem"; Fanfare Ciocărlia – "Asfalt Tango" (yes, the irony plays); Toše Proeski – "Čija si" |
| Brazilian | Jorge Ben – "Mas Que Nada"; Elis Regina – "Águas de Março"; Gilberto Gil – "Toda Menina Baiana"; Marcos Valle – "Estrelar"; Anitta – "Envolver" (short) |
| Cumbia | Los Ángeles Azules – "Cómo Te Voy a Olvidar"; Celso Piña – "Cumbia Sobre el Río"; Gilda – "No me arrepiento de este amor" (BA favourite); Rodrigo – "Soy cordobés" (cuarteto, BA); Bomba Estéreo – "Fuego" |
| Italian | Adriano Celentano – "Azzurro" / "Prisencolinensinainciusol"; Mina – "Tintarella di luna"; Rita Pavone – "Il ballo del mattone"; Fred Buscaglione – "Che bambola"; Måneskin – "Zitti e buoni" |
| French chanson | Édith Piaf – "Padam padam"; Brigitte Bardot – "Moi je joue"; Serge Gainsbourg – "Le Poinçonneur des Lilas"; Charles Trenet – "Boum!"; Zaz – "Je veux" |
| Soul / funk | James Brown – "I Got You (I Feel Good)"; Stevie Wonder – "Sir Duke"; Aretha Franklin – "Think"; Marvin Gaye – "Got to Give It Up"; Curtis Mayfield – "Move On Up"; Jamiroquai – "Virtual Insanity" |
| Rock | Soda Stereo – "De música ligera" (BA essential); Los Fabulosos Cadillacs – "Matador"; The Clash – "Should I Stay or Should I Go"; Queen – "Don't Stop Me Now"; Franz Ferdinand – "Take Me Out" |
| K-pop | NewJeans – "Super Shy"; BTS – "Dynamite"; IVE – "I Am"; aespa – "Supernova"; (G)I-DLE – "Queencard" |
| Afrobeats | Burna Boy – "Last Last"; Rema – "Calm Down"; Wizkid – "Essence"; Tems – "Love Me JeJe"; Ayra Starr – "Rush" |
| Lo-fi / chill | Nujabes – "Feather"; J Dilla – "Don't Cry"; Tom Misch – "It Runs Through Me"; Khruangbin – "Maria También"; L'Indécis – "Soulful" |
| 80s synth | a-ha – "Take On Me"; Tears for Fears – "Everybody Wants to Rule the World"; Depeche Mode – "Just Can't Get Enough"; Soft Cell – "Tainted Love"; Alphaville – "Big in Japan" |
| Recent chart (2024–26) | Sabrina Carpenter – "Espresso"; Chappell Roan – "Good Luck, Babe!"; Rosé & Bruno Mars – "APT."; Benson Boone – "Beautiful Things"; Lady Gaga – "Abracadabra"; Billie Eilish – "Birds of a Feather" |

**Trend notes for 2025–26** (booth): (a) "one artist all night" cortinas (all Nina Simone, all Celentano, all Khruangbin) are the encuentro fashion; (b) Afrobeats and reggaeton-lite are creeping into young-scene milongas (Berlin, Lisbon, Istanbul, Mexico City) because they *don't* read as "dance this" for tango dancers; (c) K-pop cortinas are standard in Seoul and showing up in Europe as a wink; (d) lo-fi/ambient cortinas are the choice for late-night marathon slots (04:00–07:00) where DJs want the floor to clear slowly; (e) BA still runs full cumbia/cuarteto/rock breaks 2–3 times a night and nobody in Europe copies it.

---

## Sources

- [S1] Michael Lavocah, "Tango DJing Part 2: Tanda construction", TodoTango — https://www.todotango.com/english/history/chronicle/483/Tango-Djing-Part-2:-Tanda-construction
- [S2] Michael Lavocah, "Tango DJing Part 1: Music for dancing", TodoTango — https://www.todotango.com/english/history/chronicle/481/Tango-DJing-Part-1:-Music-for-dancing/
- [S3] Michael Lavocah, "Tango DJing Part 3: Shaping the evening", TodoTango — https://www.todotango.com/english/history/chronicle/510/Tango-DJing-Part-3:-Shaping-the-evening/
- [S4] Stephen Brown, "Playing Music for Milongas: The DJ's Role" (Tejas Tango) — https://book-tejas-music.readthedocs.io/en/latest/deejays/play-for-milongas.html
- [S5] Tangology101, "How to DJ a Milonga" — https://tangology101.com/main.cfm/title/How-to-DJ-a-Milonga/id/265
- [S6] Tango-L archive, "Cortinas" threads (2006) — https://mailman.mit.edu/pipermail/tango-l/2006-October/002108.html ; https://mailman.mit.edu/pipermail/tango-l/2006-October/002119.html
- [S7] Tango-L, "proportions" (2011, TTVTTM/6 tandas per hour) — https://mailman.mit.edu/pipermail/tango-l/2011-February/012356.html
- [S8] Tango-L, "Use and Abuse of Tandas" (2008) — https://mailman.mit.edu/pipermail/tango-l/2008-March/007460.html
- [S9] DJ fame/bios: Stockholm festival announcement on Mario Orlando — https://mailman.mit.edu/pipermail/tango-a/2006-April/000023.html ; Tango-L on Félix Picherna — https://mailman.mit.edu/pipermail/tango-l/2010-October/011852.html ; Geneva listing for Marcelo Rojas — https://www.geneve.com/en/events/milonga-brava-con-adrian-y-elia-dj-marcelo-rojas ; Chemnitz 2025 on Ariel Ramírez — https://chemnitz2025.de/en/events/detail-page/event/milonga-in-the-villa-esche-exclusively/ ; Alpine Abrazo DJ page (Spotti/Boggio) — https://tango-dj.at/events/alpineabrazo/2013/djs.htm
- [S10] Tango-DJ.at (Bernhard Gehberger), "CTA bootlegs" — https://tango-dj.at/DJ-ing/resources/CTA-bootlegs.htm
- [S11] Tango-DJ.at newsletters and marathon DJ lists — https://tango-dj.at/mailings/2017/2017-04-1.htm ; https://tango-dj.at/mailings/2015/2015-09-1.htm ; https://tango-dj.at/marathon/djs.htm
- [S12] Jens-Ingo Brodesser, "D'Arienzomania – Review of the new TangoTunes transfers" — https://jens-ingo.all2all.org/archives/1794
- [S13] Spotify playlists (listed in §1.2) and Tango Amistoso "Milonga Tandas" — https://www.tango-amistoso.co.uk/tango-songs-playlists-milonga-tandas/
- [S14] Istanbul Tango Fiesta programme (Golden Age focus) — https://www.tangopolix.com/istanbul-tango-fiesta-jun-2019 ; "The Tango in Istanbul" — https://istanbultarihi.ist/770-the-tango-in-istanbul
- [S15] University of Michigan "Milonga Etiquette" PDF — https://public.websites.umich.edu/~mtango/MilongaEtiquette.pdf
- [S16] Cortina/tanda playlists on Spotify and YouTube listed in §1.2 and §7; Wikipedia "Cortina (tango)" — https://en.wikipedia.org/wiki/Cortina_(tango)
- [S17] El Recodo apps: "Play! El Recodo Tango" — https://apps.apple.com/app/id6744903250 ; TangoLink — https://www.microsoft.com/ar-sa/p/tangolink/9pc36pd1t6rw
- [S18] TandaBuilder — https://alternativeto.net/software/tandabuilder/about/
- [S19] r/tango "Seeking tango DJ help" (Oct 2024) — https://www.reddit.com/r/tango/comments/1ftj42d/seeking_tango_dj_help/ ; Tango-L "Melina's DJing Primer" — https://mailman.mit.edu/pipermail/tango-l/2008-August/008918.html
- [S20] Michael Lavocah / milonga.co.uk Euro Records reviews — https://www.milonga.co.uk/tango/eurorecords/euro4.shtml ; https://milonga.co.uk/tango/eurorecords/euro2.shtml
- Not verifiable at time of writing: tanda.tango.info (DNS failure), tangotunes.com (403 to automated fetch); "TangoDJ Pro" and "Tango Time Table" did not surface in search as products under those exact names — treat product references to them as unconfirmed, and prefer TangoTime Table (tangotimetable.com) / TandaBuilder / El Recodo TangoLink as the confirmed tango-specific tools.
