# Round 13 — Golden-age purist and transfer review

*Reviewer: an Época de Oro purist DJ and 78-rpm transfer specialist. Read-only review. Inputs: the featured night `docs/specs/round11-best-night.md` (shipped as `apps/web/public/featured/golden-double-peak.json`), engine seeds 3, 42, 108, 193 and 250 (`scratchpad/review13/seed-*.txt|json`, options: 4 h, `eras:["golden"]`, `yearRange:[1935,1945]`, double peak, Turkish cortinas), `data/index/songs.json`, `data/cache/{resolve,spotify}/tracks.json`, `packages/core/src/{profiles,catalog,tanda,compose,benchmark}.ts`, `data/knowledge/benchmark.json`. Every replacement in §4 is a row in `songs.json`. Stream lengths are the resolved stream (Deezer, else Spotify), not the index length.*

**Headline.** The year filter works: 80 of 81 featured sides and 100 % of the seed sides are inside 1935–45, and no night mixes a pre-1938 side with a post-1943 side in one tanda. What the engine does not have is a sense of *family period*. It has a single year window and no per-orchestra "core" band, so it counts a 1937 OTV instrumental and a 1941 Troilo–Fiorentino the same. It has no colour cap either, and colour orchestras (Firpo, Malerba, Rodríguez, Canaro) land on peak slots in three of five seeds. On transfers, the 200 s guard catches long, wrong streams, but at 0.95 confidence it lets through **1950s and 1970s re-recordings that are short enough**. The worst case is in a night: seed 250 plays Di Sarli–Rufino *Verdemar (1943)* from a "Carlos Di Sarli (1954–1956)" album. The closer in all six nights is D'Arienzo **1951**, which is outside the night's own 1935–45 range, because `cumparsitaWeight` reads the preset's 1935–1955 instead of `o.yearRange`. The 1937 and 1943 D'Arienzo *Cumparsita* rows both resolve to the same 3:43 stream of the 1951 recording.

---

## 1. Per-night era and transfer audit

Core = 1938–44. "Family-core tandas" uses the per-family bands in §2. Colour = Canaro, Lomuto, OTV, Malerba, Rodríguez, Firpo.

| Night | Sides | 1935–45 | 1938–44 (core) | Tandas all-core 1938–44 | Family-core tandas | Colour tandas (slots) | Colour on a peak slot | Sides with no stream |
|---|---|---|---|---|---|---|---|---|
| **Featured (181 + edits)** | 81 | 80 (99 %) | 72 (89 %) | 16/22 | 18/22 (82 %) | 4 (0, 6, 13, 14), 13–14 adjacent | none | 0 |
| Seed 3 | 82 | 82 (100 %) | 62 (76 %) | 15/22 | 15/22 (68 %) | 6 (0, 2, 4, 13, 14, 16) | **Firpo instr 1935–38 at 16 (t83, e49)** | 24 |
| Seed 42 | 82 | 82 (100 %) | 58 (71 %) | 14/22 | 17/22 (77 %) | 5 (0, 2, 4, 13, 14) | none, but OTV 1937 instr at 13 | 18 |
| Seed 108 | 85 | 85 (100 %) | 70 (82 %) | 16/23 | 17/23 (74 %) | 5 (0, 1, 2, 12, 14), 0-1-2 in a row | none | 13 |
| Seed 193 | 85 | 85 (100 %) | 69 (81 %) | 15/23 | 15/23 (65 %) | 5 (0, 1, 2, 10, 12), 0-1-2 in a row | **Rodríguez–Moreno at 10 (t82)** | 18 |
| Seed 250 | 81 | 81 (100 %) | 62 (77 %) | 14/22 | 15/22 (68 %) | **7** (0, 2, 10, 12, 13, 14, 17) | **Malerba at 10 (t82), Canaro–Maida milonga at 17 (t91)** | 10 |

### Outside the era / edge sides

- **Every night closes with La Cumparsita, D'Arienzo 1951.** That is outside a 1935–45 night. Cause: `cumparsitaWeight` sets `inEra` from `ERA_PRESETS.golden.years = [1935,1955]` and never reads `o.yearRange`. The in-range D'Arienzo rows (1937 `a9564d2366`, 1943 `09194f9f29`) both resolve to Deezer *"Orquesta Juan D'Arienzo – La cumparsita"* at 3:43, which is the 1951 take. That is the wrong recording for both rows, so picking them today would still play 1951.
- **Featured T16:** Pugliese *La Yumba* (1946) is the only side outside 1935–45.
- **Edge-only tandas (whole tanda in 1945 or 1935–37):** D'Agostino–Vargas 1945 (seeds 3, 42, 108, all four sides unresolved), De Angelis–Dante 1945 (3, 42), Di Sarli–Durán 1945 (3), Pugliese–Morán 1945 (42, 108), OTV instr 1937 (42, 250, four fame-0 sides, no stream), Firpo instr 1935–38 (3, no stream), Lomuto–Omar 1935–38 (193, 250), Canaro–Maida milonga 1935–36 (250). The D'Arienzo 1935–37 instrumentals are *not* a defect. That is D'Arienzo's own core (Biagi on piano).

### Late re-recordings and modern reissues

No side carries the `reissue` flag (COL.ALTAYA etc.) in any night. Compilation albums are common ("40 Grandes Éxitos", "20 Aniversario", "Tango Collection", "El Rey del Compás (Remastered)", "100 Tangos Inolvidables (Remasterizado)"). These are usually the original Victor/Odeon masters, and noise-reduced at worst, so they are acceptable. They are not the defect. The defect is *wrong takes* that pass the length guard. From the resolve cache, for rows dated 1935–45:

| Row | Stream album → what it is | Length | Caught today? |
|---|---|---|---|
| Di Sarli–Rufino *Verdemar* 1943 (`2f23b7b5d8`) | "Serie 78 RPM: Carlos Di Sarli (1954-1956)": a 1950s take | 3:00 | **No. Played in seed 250, T1** |
| Di Sarli *Tinta Verde* 1945 | "Bahía Blanca Tango Stories – Di Sarli Collection 1954-55" | 2:28 | No |
| Troilo *Tinta Roja* 1941 | "Tinta Roja 1971" | 2:59 | No |
| Troilo *En Esta Tarde Gris* 1941 | "Tinta Roja 1971" | 3:46 | yes (> 200 s) |
| Láurenz *Mascarita* 1940 | "Una y mil noches (1953-1958)" | 3:13 | **No (193 s < 200)** |
| Láurenz *Flores del Alma* 1942 | "Sentimiento Vallenato": not tango at all | 4:14 | yes |
| Caló *El Mismo Dolor* 1945 | "En Vivo Auditorio Benito Juárez": a live re-recording | 7:50 | yes |
| Troilo *Garúa* / *Uno* 1943, *Palomita blanca* 1944 | "Troilo y sus cantores – RCA Victor" | 3:21–3:29 | yes |
| D'Arienzo *La Cumparsita* 1937 / 1943 | the 1951 take | 3:43 | yes as sides; **not as the closer** (closing path) |

### Lengths that suggest a wrong or cut transfer

Golden sides run 2:20–3:10 (valses 2:05–3:00, milongas 1:55–2:50; Pugliese 1943–46 runs to 3:25, Biagi valses and milongas down to 2:05).

- **Featured:** Pugliese *Tierra querida* 1944 at 3:20 (on "La Yumba" compilation, at the guard boundary of 200 s; plausible for Pugliese, verify); Láurenz *Garúa* 1943 at 3:11 (plausible); *Maldonado* 1943 at 2:03 (a short side, verify); D'Arienzo–Echagüe *Mandria* 1939: index 2:48, stream 2:20 (one of them is wrong); Tanturi–Castillo *Mi morocha*: index 2:25, stream 2:41. Rodríguez *Con tu mirar* 2:13 and Biagi 1941 valses at 2:14–2:16 are genuine.
- **Seeds:** Caló instr *Inspiración* 1943 at **2:05** (seeds 3, 42, 108, 193, 250: in every seed, and short for a Caló tango; verify the take); Pugliese–Morán *El abrojito* 1945 and *Hoy al recordarla* at 3:17–3:20 on "His 20 Best Songs" (plausible, verify); Lomuto *Mano a mano* 1936 at 3:16 (long for Lomuto, suspect); Canaro–Maida *Largá las penas* 1935 at 3:12; Troilo–Fiorentino *Tabernero* 1941 at 3:13 (long for 1941 Troilo, suspect).

## 2. Which orchestras and periods

A purist 1935–45 night is built on the *great dancing years* of ten families. The engine needs one band per family, not one window for the night. **Core** = a full tanda may sit here at any slot. **Edge** = allowed in a 1935–45 night but at most one tanda per family, never at a peak. **Other era** = excluded from a golden night even if the year filter is wider (a "golden-extended" preset may relax this).

| Family | Core | Edge | Other era (not on a golden night) | Notes for the engine |
|---|---|---|---|---|
| D'Arienzo | 1935–1944 | 1945–1949 | ≥ 1950 (Laborde/Valdez/Bustos, the 1950s RCA sound) | Sub-periods: **A** 1935-01→1938-06 (Biagi piano), **B** 1938-07→1940 (Polito, Echagüe), **C** 1940–44 (Mauré, Salamanca). A tanda should not straddle A/B or B/C (soft). Only exception to ≥ 1950: none on a strict-range night (see §3, R6). |
| Di Sarli | 1939–1944 (Rufino, Podestá) | 1945–1948 (Durán) | ≤ 1932 (sexteto) and ≥ 1951 (RCA/Music Hall 1951–58, Pomar, Florio, Ledesma) | The 1950s instrumentals are the most-played Di Sarli in the world. That is why the cap is needed. |
| Troilo | 1938–1944 (instr, Fiorentino) | 1945–1948 (Marino, Ruiz, Rivero) | ≥ 1949 (concert Troilo, Goyeneche) | |
| Pugliese | 1943–1946 (instr, Chanel, Morán) | 1947–1952 | ≥ 1953 ("late Pugliese", Maciel/Guaraní, concert takes) | The only family allowed sides of 3:00–3:25 without suspicion. |
| Biagi | 1938–1943 (Ibáñez, Falgás, Ortiz) | 1944–1947 (Amor, Acuña) | ≥ 1948 | |
| Tanturi | 1940–1945 (Castillo, Campos) | 1937–1939, 1946–1948 | ≥ 1949 | |
| Caló | 1941–1945 (Podestá, Berón, Iriarte) | 1946–1948 | ≥ 1949 (slow 1950s Caló) | |
| D'Agostino–Vargas | 1940–1946 | 1947–1952 | ≥ 1953 (*Café Domínguez* 1955 re-records) | |
| Láurenz | 1937–1944 | 1945–1947 | ≥ 1950 (the 1953–58 Mascarita album) | |
| Donato | 1935–1942 (Lagos, Lita Morales) | 1932–1934 | ≥ 1943 | Playful, mid energy. A build tanda, not a peak. |
| Fresedo | 1933–1942 (Ray, Ruiz) | 1943–1948 (Serpa) | ≥ 1949 | Warm-up and cool-down only. |
| De Angelis | 1943–1948 | 1949–1955 | ≥ 1956 | On a 1935–45 night he is always edge (1943–45). |
| Demare | 1942–1944 (Miranda, Berón) | 1938–1941, 1945–1947 | ≥ 1948 | |
| **Colour only** | | | | |
| Canaro | 1935–1939 (Maida) | 1940–1945 (Famá, instr) | ≥ 1946 | Warm-up and early-milonga colour. Never at a peak. |
| Lomuto | 1936–1942 | 1935, 1943–1950 | — | |
| OTV | 1935–1944 | — | — | Many fame-0 sides; at most one tanda. |
| Malerba | 1941–1944 (Medina) | 1945–1947 | — | |
| Rodríguez | 1937–1946 (Flores, Moreno) | 1947–1950 | ≥ 1951 | Profile tier 1 → should be tier 2 for golden-purist rules. |
| Firpo | 1936–1940 | 1935, 1941–1945 | — | |

## 3. Rules, each with a vitest invariant first

Put these in `packages/core/test/round13.test.ts`. Data: `FAMILY_BANDS` in `data/knowledge/orchestra_profiles.json` (or as `core`/`edge`/`otherEra` fields on `OrchestraProfile`). All invariants run across ≥ 8 seeds of the default golden options (`eras:["golden"], yearRange:[1935,1945], hours:4`). Every rule must keep the default 4 h golden set ≥ 85 on the benchmark (CLAUDE.md).

- **R1. Core share.** On a golden night, ≥ 85 % of the tandas of a non-colour family lie inside that family's core band. Edge tandas ≤ 2 per 4 h and ≤ 1 per family.
  `it("golden night: ≥ 85 % of family tandas inside the family core band")`. For each seed, `coreTandas / familyTandas >= 0.85` and `edgeTandas <= 2`. Today featured is 18/18 core (pass, with the 1946 side counted as core because Pugliese's core is 1943–46; R6 removes it). Seeds 3/42/108/193/250 fail on Di Sarli–Durán 1945 (3) and the colour count.
- **R2. Colour cap.** Colour tandas ≤ 3 per 4 h (scale: `floor(0.75 × hours)`), ≤ 1 per colour orchestra (Canaro may have 2 if one is a milonga or vals), never two colour tandas back to back, and **never** on a peak slot, a `phase:"peak"` slot or a slot with `targetEnergy ≥ 78`.
  `it("colour orchestras ≤ 3 per 4 h, none adjacent, none at a peak or t ≥ 78")`. Fails today on seeds 3 (Firpo t83), 193 (Rodríguez t82), 250 (Malerba t82, Canaro t91, seven colour tandas) and on adjacency in featured, 108 and 193.
- **R3. No era straddle within a tanda.** A tanda never holds a side < 1938 together with a side > 1943, and the spread of a tanda is ≤ 4 years (≤ 3 for D'Arienzo, Di Sarli and Troilo, whose sound changes fastest).
  `it("no tanda mixes pre-1938 and post-1943 sides; spread ≤ 4 y (≤ 3 for D'Arienzo/Di Sarli/Troilo)")`. Passes today. Lock it before §3 R1 pushes the selector toward tighter windows.
- **R4. D'Arienzo sub-period (soft).** A D'Arienzo tanda does not straddle 1938-07 (Biagi leaves) or 1940-06 (Mauré era). Use `date` where present. As a weight (× 0.5), not a hard rule.
  `it("D'Arienzo tandas stay inside one sub-period in ≥ 80 % of seeds")`. Featured T3 (*Trago amargo* 1939-12 with 1936–37 sides) and T18 (1936 + 1939) would be flagged.
- **R5. Transfer guard: album years.** A stream whose album title names a year (or range start) more than 2 years after the row's year, or contains `en vivo|live|auditorio|concierto`, is `streamSuspect`, and its confidence is capped at 0.6 as the 200 s rule does now. Catches *Verdemar*, *Tinta Verde*, *Tinta Roja*, *Mascarita* (all < 200 s).
  `it("a 1935–45 row resolved to an album dated ≥ year+3 or a live album is streamSuspect")`, with fixture rows `2f23b7b5d8` (Verdemar → 1954-56) and Láurenz *Mascarita*.
- **R6. Shared-stream guard.** If two rows of the same orchestra and title with different years resolve to the same provider id, only the row whose year matches the stream's album or whose length is in family band keeps it. The others are `streamSuspect`. Catches D'Arienzo *Cumparsita* 1937 and 1943 → 1951.
  `it("rows with different years sharing one stream id: at most one keeps it")`.
- **R7. Closer obeys the night's range.** `cumparsitaWeight`/`cumparsitaCandidates` read `o.yearRange` when set. On a strict golden night (`yearRange[1] ≤ 1946`) the closer is a resolvable in-range instrumental. The D'Arienzo 1951 version stays the default only when `yearRange` is absent or reaches 1951, or behind an explicit "traditional closer" option.
  `it("yearRange [1935,1945]: the closing Cumparsita is from 1935–45 and not streamSuspect")`. Today: fails on all six nights.
- **R8. Per-family length band.** Extend `isSuspectSide` with family bands: generic tango 2:15–3:12, vals 2:00–3:05, milonga 1:55–2:55; Pugliese and Láurenz 1943+ tango up to 3:25. A stream outside its band and > 12 % off the family median is suspect (today the median rule needs n ≥ 4 and > 185 s).
  `it("a golden side outside its family length band and > 12 % off the family median is streamSuspect")`. Fixtures: Caló *Inspiración* 2:05, Troilo *Tabernero* 3:13, Lomuto *Mano a mano* 3:16.
- **R9. Transfer preference.** When a family has duplicate rows or alternative streams, prefer the original label master (Victor/Odeon "Serie 78 RPM", "Tango Classics", "Solo para bailar", "El Rey del Compás 1935-1938") over "Grandes Éxitos" / "Remastered" / "Golden Collection" (× 0.9), and over unresolvable rows. Never pick a row with no stream when a resolvable core side of the same family exists.
  `it("golden tandas: ≤ 1 unresolved side per tanda when the family has ≥ 4 resolvable core sides")`. Seeds 3/42 fail with fully unresolved D'Agostino 1945 / OTV 1937 / Firpo tandas.
- **R10. Profile tiers.** For golden-purist rules, `enrique-rodriguez` and `orquesta-tipica-victor` count as tier 2 (colour). `it("golden-purist rules treat Rodríguez and OTV as colour")`.

## 4. Featured night: what I would change

Every replacement is a row in `songs.json` with a stream in the resolve cache unless noted.

| # | Tanda | Change | Why |
|---|---|---|---|
| 3 | D'Arienzo instr 1936–39 | *Trago amargo* (1939) → **El Choclo (1937)** (2:28) | Keeps the tanda in the Biagi-piano years 1936–37: *La payanca, Ataniche, Jueves, El choclo*. |
| 10 | Donato instr 1936–40 | *La Tablada* (1936) → **El Distinguido Ciudadano (1940)** (2:29) | Narrows to 1938–40 and lifts the energy. The slot (t82) is still too hot for Donato: log it for the engine. If you do it by hand, swap T10 with T12 (Caló–Berón) so Donato sits at t74. |
| 13–14 | Malerba then Rodríguez vals | T14 Rodríguez–Moreno vals (two fame-0 sides) → **D'Arienzo instr valses 1937: Alma Dolorida, Mentías, Pasión** (2:14 / 2:17 / 2:43) | Removes the colour pair and brings colour to 3 (Canaro, Rodríguez, Malerba). Alternative if you want no fourth D'Arienzo: Tanturi–Castillo **Recuerdo (1941), Mi Romance (1941), La Serenata (1941)**, then change T5 milonga to Láurenz–Casas **Milonga Compadre (1938), Milonga de mi Flor (1940), Improvisando (1940)**. |
| 16 | Pugliese instr 1944–46 | *La Yumba* (1946) → **Recuerdo (1944)** after a re-match (the current stream is a 8:11 "El Motivo" take; R6/R8), else **Tiny (1945)** (2:42) | Keeps the night inside its own 1935–45 range. Order: *El Arranque, El Remate, Tierra querida, Recuerdo/Tiny*. Verify *Tierra querida* 3:20. |
| 18 | D'Arienzo instr 1936–39 (summit) | *Retintín* (1936) → **El Esquinazo (1938)** (2:31); *Derecho Viejo* (1939) → **Champagne Tango (1938)** (2:25) | Summit = *Unión Cívica, El Esquinazo, Champagne Tango, La Catrera*: the last Biagi-piano sessions, all 1938, all 2:25–2:31. |
| 19 | D'Agostino–Vargas 1941–44 | *Me Llaman Tango* (1943, fame 2) → **El Cornetín del Tranvía (1943)** (2:59) | A better known side, same years. |
| 9 | D'Arienzo–Echagüe | keep; check *Mandria* (index 2:48, stream 2:20) | One of the two lengths is wrong. |
| 17 | Láurenz–Podestá milonga | keep; check *Maldonado* 2:03 | Short side; verify the take. |
| Closing | La Cumparsita, D'Arienzo 1951 | → **La Cumparsita, Tanturi 1940** (`65778bef23`, 2:44) | Rhythmic closer after a Biagi última, inside the range. D'Arienzo 1937/1943 only once their stream is re-matched to the real take (now both play 1951). |

Kept as-is: T0 Canaro–Maida (proper colour warm-up), T1 Di Sarli–Rufino, T2 Caló–Iriarte (1945 is edge but Caló core), T4 Troilo instr, T5–T7, T8 Biagi instr valses 1941 (genuine 2:14–2:40), T11 Troilo–Fiorentino milonga, T12, T15, T20 Di Sarli–Rufino valses, T21 Biagi–Ortiz. After the changes: 81/81 sides in 1935–45, 1938–44 side share ≈ 88 % (the D'Arienzo 1936–37 sides are family-core), colour 3, no colour adjacency, closer in range.

## 5. Benchmark check to add: "golden core share"

Add to `data/knowledge/benchmark.json` next to `golden` (and a block in `benchmark.ts` after §7):

```json
"goldenCore": {
  "label": "Golden core share (family core bands)",
  "applies": "yearRange within 1932–1950 or eras == ['golden']",
  "minShare": 0.80, "nearShare": 0.70,
  "maxColour": 3, "colourPeakMax": 0,
  "sideCoreYears": [1938, 1944], "sideCoreInfoMin": 0.75,
  "weight": 1,
  "source": "Round 13 purist review: family bands §2; reference sets A–K centre on 1938–44"
}
```

- **value:** share of tandas whose every side is inside its family's core band (colour tandas count as non-core). **ok** ≥ 80 %, **near** 70–80 %, **off** < 70 %. Downgrade one level if colour tandas > `maxColour` or any colour tanda sits at a peak / t ≥ 78.
- **info:** side share in 1938–44 (target ≥ 75 %).
- **Today:** featured 82 % (ok, but downgrade to near: 4 colour tandas); seeds 3 68 % (off), 42 77 % (near), 108 74 % (near), 193 65 % (off), 250 68 % (off). The existing `golden` check (≥ 60 % of tandas in 1935–45) passes every night at 100 %, so it no longer separates good nights from poor ones on a golden preset.
