# Milonga Playlist Musicology — Reference for the TDJ Engine

Author's stance: written from the perspective of a working orquesta típica bandoneonist and
musicalizador in Buenos Aires. Where the community disagrees, I say so and give the engine a
default. Numbers are given wherever a rule can be made numeric; they are calibrated against
the sources listed at the end and against practice at Cachirulo, Sunderland, La Baldosa,
Canning, El Beso, Salón Canning and the European marathon/festival circuit.

Companion file: `orchestra_profiles.json` (machine-readable per-orchestra profiles; the
"energy baseline", BPM ranges and position recommendations in that file are the
canonical values for the engine — this document explains them).

---

## 0. Conventions used in this document

- **Tanda** = block of 3–4 danceable tracks of ONE rhythm (tango / vals / milonga), ONE
  orchestra, ONE period, ONE vocal mode (instrumental or vocal), normally ONE singer.
- **Cortina** = non-danceable interlude of ~30–90 s between tandas; floor clears, partners change.
- **Rhythm letters**: T = tango tanda, V = vals tanda, M = milonga tanda.
- **BPM convention** (important for any tempo feature the engine extracts):
  - Tango is written 2/4 or 4/8. The *walking pulse* dancers step to is ~56–70 per minute.
    Beat-trackers (librosa, Essentia, aubio) usually return the **doubled** value,
    i.e. 112–140 "quarter-note BPM". All tango BPM ranges below are given in **quarter-note BPM**
    (walking pulse × 2). If a detector returns ~60–70, double it; if it returns ~240+, halve it.
  - Vals is 3/4. We give **quarter-note BPM** (typically 160–200) and also **bars per minute**
    (= quarter BPM / 3, typically 55–67). Beat-trackers often lock to the bar for vals.
  - Milonga is 2/4 with the habanera/3-3-2 figure; dancers step to the quarter note. We give
    **quarter-note BPM** (typically 100–130). Detectors often return the doubled value (200–260) —
    halve it.
  - Rule of thumb for the engine: after detection, fold BPM into the plausible window for the
    rhythm (tango 100–150, vals 150–210, milonga 90–140) by ×2 or ÷2 before comparing.
- **Energy** = a 0–100 scalar meaning "how much physical and emotional intensity the track asks
  of the room". It is NOT tempo alone. See §2.
- **Era labels** (used in JSON `era`): `guardia_vieja` (<1935), `golden_early` (1935–1940),
  `golden_mid` (1941–1945), `golden_late` (1946–1955), `post_golden` (1956–1975),
  `nuevo` (Piazzolla-lineage concert tango), `contemporary` (modern orquestas típicas
  recorded ≥1995), `electro` (tango electrónico / fusion), `alternative` (non-tango used for
  tango dancing).

---

## 1. Tanda rules

### 1.1 Standard cycle structures

| Pattern | Description | Where used | Engine default? |
|---|---|---|---|
| **TTVTTM** | 2 tango, vals, 2 tango, milonga; repeat | The world standard. Nearly every Buenos Aires milonga, festival and marathon. | **Yes** |
| TTTVTTTM | 3 tango between each V/M | Some BsAs traditional milongas (less vals/milonga), long marathons, DJs who want more tango | Allowed as option (`cycle: "TTTVTTTM"`) |
| TTVTTM with V/M swapped (TTMTTV) | Same density, milonga first | Common; DJ preference. Lavocah notes the T-T-V-T-T-M order is a convention, not a law. | Allowed; either is fine. The engine should keep ONE order per night. |
| TTV TTM TTV TTM … with occasional **TTT** | Dropping one V or M early (first 30–40 min) while people arrive | Explicitly acceptable (Lavocah Part 3: "if arrivals are slow, three tangos in a row is acceptable") | Allowed in the warm-up window only |
| 3-track tango tandas throughout | T3 T3 V3 T3 T3 M3 | Afternoon milongas, prácticas, small/unbalanced rooms (Clint Rauscher, Atlanta), some US cities | Allowed as a global switch; **never mix 3- and 4-track tango tandas within a night** |

Counts:
- **Tango tanda: 4 tracks** (formal evening milonga, large floor, experienced crowd, events > 4 h).
  3 tracks for afternoon/informal/práctica or where partner-finding is quick.
- **Vals tanda: 3 tracks** (4 is accepted in some rooms; 3 is the norm).
- **Milonga tanda: 3 tracks** (4 is tiring; 3 is the norm. Some BsAs DJs do 4 milongas late at night
  for a strong crowd — treat as exception).
- **5-track tandas = DJ error** in the eyes of dancers (r/tango, Tango-L consensus).
- **Tanda duration**: 4 tangos × ~2:45 ≈ 11 min; 3 vals × ~2:45 ≈ 8:15; 3 milongas × ~2:20 ≈ 7 min.
  Add cortina. A 6-tanda TTVTTM cycle ≈ 65–72 min (Lavocah: "about 70 minutes"). The engine
  can budget **~11–12 min per tanda-slot including cortina**, i.e. **~5 tandas per hour**.

### 1.2 Coherence inside a tanda (the "same, same, same" rule)

Mandatory for a playlist to look professional:

1. **Same rhythm.** Never mix tango/vals/milonga in one tanda. (Exception: none for a milonga.
   The "tango-milonga" hybrids like *Milonga del 900* with Canaro-Maida are milonga-tanda tracks.)
2. **Same orchestra.** >99% of tandas at serious milongas. Mixed-orchestra tandas are a known
   "amateur" tell, except two accepted special cases:
   - *Guardia Vieja mixes* (Canaro / Lomuto / OTV / Firpo 1927–1935 instrumentals) — same sound world.
   - *Same leader, different band name* (Troilo = Troilo-Fiorentino; Canaro = Quinteto Pirincho
     is NOT the same thing — Pirincho is its own tanda).
3. **Same period.** Window: ideally ≤ 3 years, acceptable ≤ 5 years, hard fail > 8 years for golden age
   orchestras (sound, singer and arrangement style change). For orchestras whose style was stable
   (Rodríguez, D'Agostino-Vargas 1940–45, De Angelis 1944–1950) the window can be widened to 6–7.
   Post-55 and contemporary recordings: ≤ 10 years, same album lineup preferred.
4. **Same vocal mode.** All instrumental OR all vocal. Mixed = tell. Lavocah: once the rules are
   mastered you *can* mix (the orchestras themselves did on the night), but the engine must treat
   it as a penalty, not a feature. Allowed exception: an instrumental *closer* with a 3-vocal
   D'Arienzo 1938–39 tanda is seen occasionally; still penalise lightly.
5. **Same singer.** A vocal tanda should have one singer (Troilo-Fiorentino, Di Sarli-Rufino,
   Tanturi-Castillo…). Two singers in a tanda = mild penalty if same orchestra and overlapping years
   (e.g., Di Sarli-Rufino 1941 + Di Sarli-Podestá 1942 is tolerated by many DJs but is a tell to
   milongueros). Duets (Dante y Martel with De Angelis; Echagüe-Laborde D'Arienzo 1950s) count as
   their own "singer" value.
6. **Same mood/tempo band.** Tempo variance within tanda: ≤ ±6% of mean BPM is ideal, ≤ ±10%
   acceptable, > ±12% is a clash. (D'Arienzo 1936 *Hotel Victoria* at 136 next to D'Arienzo 1951
   at 124 is already both a period and a tempo violation.)
7. **No duplicates**: same *title* never twice in a night (different versions of the same tango in
   one night is a tell — except La Cumparsita as closer, which may also have been played as
   a cortina joke, which it shouldn't).
8. **No repeat of orchestra+rhythm combination within ~2 hours**; same orchestra in *different*
   rhythms (D'Arienzo tango, later D'Arienzo milonga) is fine and common.
   Full-night rule: a given orchestra should not take more than ~20% of tango tandas (D'Arienzo and
   Di Sarli can go to 25% in a traditional BsAs-style night).

### 1.3 Ordering inside the tanda

The community agrees on the *function* of positions and disagrees on the *shape*. Positions:

- **Track 1 — "announces".** Must represent the tanda honestly (Lavocah: "a sign and a promise of
  what is to come"). Dancers choose partners on the strength of the first 20 seconds. Choose a
  well-known, immediately recognisable track (La Yumba, Bahía Blanca, Hotel Victoria, Poema,
  Café Domínguez). A track with an instrumental intro suits position 1. **Never** open with the
  weakest or most obscure track.
- **Track 2 — continues** the mood of track 1; never a dip; can be slightly stronger.
- **Track 3 — the "experiment" slot.** The one place to put a less famous or slightly odd track,
  because track 4 can rescue the tanda.
- **Track 4 — closer.** A track that "feels complete" (big coda, famous ending, or the strongest,
  most-requested track). The dancers should sit down satisfied.

Shapes (name → energy curve across 4 tracks, 0–100 relative units):

| Shape | Curve | Verdict |
|---|---|---|
| **Hammock / "U with lift"** | strong(70) → medium(55) → medium(60) → strongest(80) | Lavocah's favourite; used by the best DJs. **Engine default.** |
| **Rising** | 55 → 60 → 68 → 78 | Classic "slow start then rising", ubiquitous in BsAs for vals and milonga tandas; works for tango too. Risk: a weak opener does not "announce". **Allowed default alternative**; keep track 1 above 50. |
| **Flat** | 65 → 65 → 65 → 65 | Safe, coherent, slightly boring. Acceptable; the engine should not do it every tanda. |
| **Falling** | 80 → 70 → 60 → 50 | Generally does not work; energy collapses. Penalise. |
| **Big bang then calm** | 85 → 60 → 60 → 75 | Possible for experienced DJs, needs an energetic closer anyway — converges to hammock. |
| **Soft intro** | 45 → 65 → 65 → 75 | A gentle first track different from the rest. Use sparingly and only once dancers trust the DJ (Lavocah). Mild penalty unless flagged. |

Debate notes:
- "Strongest last" vs "strongest first": festival DJs in Europe lean hammock (strong first AND
  last); BsAs traditional DJs often open with the hit and let the tanda settle (track 4 still
  strong). Both are OK; a monotonic descent is not.
- "Order slowest → fastest" (Rauscher) is the rising shape; good for V and M.
- For a vals tanda the near-universal practice is slow/medium → faster → fastest, with the
  last vals the most whirling (e.g., Biagi *Lágrimas y sonrisas* closer; D'Arienzo *Amor y celos* closer).
- For a milonga tanda: medium → faster → fastest *or* medium → fastest → medium-fast
  (never finish with a slow candombe-type milonga unless the room is exhausted at 4 a.m.).

### 1.4 When to break the rules

Permitted deviations (each should be an explicit flag the engine can set, and each costs score
if used more than once a night):

1. First 30–40 minutes: TTT instead of TTV while the room fills.
2. A Guardia Vieja mixed-orchestra tanda (Canaro/Lomuto/OTV 1927–1934) once per night.
3. A "Canaro singers" tanda mixing Maida and Famá of the same years — tolerated.
4. Mixed Rufino/Podestá Di Sarli 1941–43 — tolerated.
5. A 3-track tango tanda at the very end if time is short (better: cut the last tanda entirely
   than play a 2-track tanda).
6. One *alternative* / neo tanda per night maximum in a traditional milonga, zero in BsAs-codes
   milongas, up to 3 at an explicitly "neo/alternative" event. Never adjacent to Pugliese.
7. Instrumental closer on a vocal tanda — rarely needed; prefer not.
8. The final tanda stays coherent; La Cumparsita stands alone after it (see §3.5). Do not build a
   mixed-orchestra "homage" final tanda.

---

## 2. Energy / intensity model (0–100)

### 2.1 What "energy" means on a tango floor

Two orthogonal components (r/tango DJ consensus): **physical** (tempo, rhythmic drive,
staccato, volume of the beat) and **emotional** (drama, singer intensity, rubato, dynamics).
Dancers get tired by too much of either. The engine should keep both and expose a combined
scalar:

```
energy = 0.55 * physical + 0.45 * emotional         (0–100 each)
```

Separately track **difficulty** (0–100): how demanding the music is to dance (rubato, tempo
changes, dense arrangement, long singer phrases). Difficulty != energy. Pugliese 1950s is
energy ~75 emotional, physical ~45, difficulty ~85. D'Arienzo 1937 is physical ~85, emotional
~55, difficulty ~30.

### 2.2 Feature-based scoring formula (heuristic, calibrated to §2.7 baselines)

Compute `physical` and `emotional` from available metadata/audio features, then clamp.

**physical** (start at orchestra `physical_baseline`, then adjust):
- Tempo (quarter-note BPM, after folding):
  tango: +0.9 per BPM above 124, −0.9 per BPM below 124 (so 136 → +11; 112 → −11).
  vals: +0.6 per BPM above 180 (bars/min 60).
  milonga: +0.8 per BPM above 112.
- Rhythm: milonga +10 relative to the same orchestra's tango; vals +0 (vals is "lift", not
  "drive" — see §2.6).
- Staccato / marcato strength (audio onset strength or orchestra tag): rhythmic-style
  orchestras +8, lyrical −8, dramatic ±0 (they alternate).
- Instrumental vs vocal: instrumental **+4** physical (pure beat), vocal −4 physical but +8
  emotional (see below).
- Recording era: 1935–40 +4 (crisper two-beat), 1946–55 −4 (slower, heavier), post-55 −6 (very
  slow or very fast but less drive), contemporary ±0, electro +6 (programmed beat).

**emotional** (start at orchestra `emotional_baseline`):
- Vocal track +8; famous dramatic singer (Chanel, Morán, Maciel, Marino, Campos, Berón, Rufino)
  +6 more; light "estribillista" (Famá, Maida, Lamas, Charlo) −6.
- Minor mode +5 (most tangos are minor; major-mode tangos like *Poema* feel sweeter — treat
  major as −3 physical, +0 emotional; vals in major +0).
- Rubato / tempo flexibility (std-dev of local tempo > 4%) +8; > 8% +14 (Pugliese, late Troilo).
- Arrangement density (number of simultaneous layers / spectral flux / late-era string
  countermelodies): dense +6; sparse (sexteto/guardia vieja) −6.
- Dynamic range (loudness variance LRA): high +6 (Pugliese, Di Sarli 1950s), compressed/electro −4.
- Era: 1941–45 +3 (peak lyricism); 1950s +6 (grand); pre-1935 −10 (charming, not dramatic).

**combined** = 0.55 physical + 0.45 emotional. Bands:

| Energy | Label | Typical content |
|---|---|---|
| 0–30 | ambient / not for dancing | Piazzolla slow pieces, Guardia Vieja curiosities, Fresedo at his dreamiest |
| 31–45 | gentle | Canaro-Maida, Fresedo-Ray, Lomuto, OTV, Donato instrumentals, Di Sarli instrumentals 1940s |
| 46–60 | warm | Di Sarli-Rufino, Caló-Berón, D'Agostino-Vargas, Demare-Miranda, Laurenz |
| 61–75 | strong | Troilo-Fiorentino, Tanturi-Castillo, De Angelis vals, Rodríguez-Moreno, Di Sarli 1950s |
| 76–90 | peak | D'Arienzo 1935–41, Biagi, D'Arienzo-Echagüe, Pugliese *La yumba/Gallo ciego*, milongas of D'Arienzo/Canaro |
| 91–100 | extreme | D'Arienzo 1950s *Loca*, Biagi fastest milongas, Pugliese *Negracha*, Sexteto Mayor show arrangements, Piazzolla *Libertango* (not for the social floor) |

### 2.3 Orchestra style tags (JSON `style_tag`)

- **rhythmic** — marcato, staccato, two- or four-beat drive, short phrases: D'Arienzo, Biagi,
  Rodríguez, Tanturi (1940–43), Donato, early Canaro, Lomuto, D'Agostino (soft rhythmic),
  Federico, Malerba, Varela (post-55 rhythmic), Racciatti, Sexteto Milonguero, Solo Tango.
- **lyrical / melodic** — legato strings, singing lines, smooth walking: Di Sarli, Fresedo,
  Caló, Demare, Laurenz (lyrical-rhythmic), De Angelis, Tanturi-Campos, Maderna, Sassone,
  Francini-Pontier, Orquesta Romántica Milonguera, Gente de Tango.
- **dramatic** — rubato, dynamic extremes, "yumba" / arrastre, late-era weight: Pugliese,
  Troilo from 1944 onward (Troilo 1941–43 is lyrical-rhythmic), Gobbi, Salamanca (late),
  Basso (late), Color Tango, Fernández Fierro, Sexteto Mayor.
- **nuevo / concert** — not for the social floor except specific tracks: Piazzolla, Salgán
  (Quinteto Real), Sexteto Mayor (show), Troilo instrumental late.
- **electro / fusion** — Gotan Project, Bajofondo, Tanghetto, Otros Aires, Narcotango,
  Electrocutango.

### 2.4 Era model and what it does to energy and placement

| Era | Years | Sound | Energy tilt | Placement |
|---|---|---|---|---|
| Guardia Vieja / "old guard" | ≤1934 | 2-beat, sextets, estribillistas (refrain singers), bright and simple | low (35–50) | first hour; afternoon milongas; "breathing" tandas mid-night; Canaro-Charlo vals anywhere early |
| Golden early | 1935–1940 | D'Arienzo's rhythmic revolution; fast, crisp; singers short | high physical (65–85), low emotional | warm-up/early build (D'Arienzo 1936–38 is the classic opener) and peak (D'Arienzo-Echagüe 1938–39, Biagi) |
| Golden mid ("the golden decade peak", 1941 = peak year) | 1941–1945 | Singers become stars (Fiorentino, Castillo, Rufino, Podestá, Berón, Vargas); balance of rhythm and melody | medium-high, emotional rises (55–75) | the core of the night, 2nd and 3rd hours |
| Golden late | 1946–1955 | Slower, heavier, richer arrangements; singers dominate (Marino, Chanel, Morán, Campos, Dante/Martel); Di Sarli's grand style; Pugliese's yumba | high emotional (65–85), physical lower | middle-late / peak / closing; Di Sarli 1951–58 and Pugliese 1948–59 are the classic late-night tandas |
| Post-golden | 1956–1975 | Stereo, large orchestras, slower or show-fast, some "disco" concessions; D'Arienzo 1960s very fast | mixed; many recordings "overblown" | sparingly; D'Arienzo 1960s milongas late at night; Di Sarli 1956–58 instrumentals late |
| Nuevo | 1955–1990 | Piazzolla and lineage, concert music | varies; difficulty very high | not in traditional milongas; one track (*Oblivion*, *Adiós Nonino*) very late at an alternative event |
| Contemporary orquestas típicas | ≥1995 | Hi-fi recreations of golden-age styles (Color Tango=Pugliese, Sexteto Milonguero=D'Arienzo/Biagi-ish vocal, Romántica Milonguera = crooning lyrical, Solo Tango = D'Arienzo/Di Sarli recreations, Fervor de Buenos Aires / Gente de Tango = Di Sarli, Típica Imperial = Pugliese) | per style | ≤ 1–2 tandas in a 4 h traditional night; more at festivals aimed at younger crowds |
| Electro / fusion | 1999– | Gotan, Bajofondo, Otros Aires, Tanghetto | physical 60–80 (programmed), emotional low, difficulty low-medium | only in "alternative" slots; never at a BsAs-codes milonga |

### 2.5 Singer vs instrumental

- Instrumental tandas are rhythmically clearer and favoured for the first two tandas and for
  milonga tandas (D'Arienzo instrumental milongas, Canaro instrumental milongas).
- A night is ~70–80% vocal tandas (Rauscher: aim 80/20 vocal/instrumental). A night that is
  > 50% instrumental looks like a beginner's "safe" playlist; < 10% instrumental looks like a
  streaming-service playlist.
- Orchestras with very few danceable instrumentals (build vocal tandas): Fresedo (actually has
  many instrumentals — include them), Caló, Laurenz, Demare, D'Agostino, Tanturi.
- Orchestras where instrumentals are the core: D'Arienzo 1935–39, Di Sarli (both), Biagi
  1938–42, Pugliese, Donato, Canaro Guardia Vieja, Troilo 1941 instrumentals (*Cachirulo*,
  *Milongueando en el 40*, *Toda mi vida* is vocal).

### 2.6 Tempo reference (quarter-note BPM, see §0)

| Rhythm / orchestra | Typical | Notes |
|---|---|---|
| Tango, Guardia Vieja (Canaro, Lomuto, OTV 1927–34) | 118–130 | bright 2-beat |
| Tango, D'Arienzo 1935–39 | 128–140 (walking pulse 64–70) | *Hotel Victoria* ~136; *El flete* ~134 |
| Tango, D'Arienzo 1940–44 (Mauré) | 124–134 | slightly broader |
| Tango, D'Arienzo 1950s–60s | 128–144 | fastest; some tracks exceed 140 — uncomfortable |
| Tango, Biagi | 126–136 | plus syncopated anticipations; feels faster than measured |
| Tango, Rodríguez | 124–132 | steady, square, never rushed |
| Tango, Tanturi-Castillo | 122–130 | — |
| Tango, Tanturi-Campos | 114–124 | notably slower, romantic |
| Tango, Troilo 1941–43 | 118–128 | elastic |
| Tango, Troilo 1944–55 | 108–122 | heavier, rubato |
| Tango, Di Sarli 1939–45 | 116–126 | *Bahía Blanca* 1957 ≈ 112 (56 walking) |
| Tango, Di Sarli 1951–58 | 108–120 | grand, slow, with arrastres |
| Tango, Caló | 116–126 | — |
| Tango, Fresedo | 112–126 | smooth |
| Tango, Pugliese 1943–49 | 116–128 nominal; local tempo swings ±10% | *La yumba* ~124 nominal |
| Tango, Pugliese 1950s | 100–124 with big rubato | — |
| Tango, De Angelis | 120–130 | — |
| Tango, Laurenz | 120–130 | — |
| Tango, Demare | 112–124 | — |
| Tango, D'Agostino | 120–130 | — |
| Tango, Donato | 122–132 | — |
| Tango, Contemporary orquestas típicas | 112–134 | depends on model orchestra |
| Tango, Electro | 100–130 (programmed) | — |
| Vals, all golden age | 160–200 quarter (53–67 bars/min) | Biagi/D'Arienzo valses ~190–200; Canaro-Charlo ~165–175; Di Sarli ~175–185; De Angelis ~180–190; Troilo ~175–185; strong beats 55–65/min ("70–80 strong beats" counts in some teaching sources include anacruses) |
| Milonga, Canaro 1933–40 | 100–112 | *Milonga sentimental* ≈ 104 (some sources count 76 = different unit) |
| Milonga, D'Arienzo 1937–44 | 108–122 | *Milonga vieja milonga*, *De pura cepa* |
| Milonga, D'Arienzo 1950s–60s | 116–130 | very fast |
| Milonga, Biagi | 112–126 | — |
| Milonga, Di Sarli (few) | 104–112 | *Zorzal*, *La mulateada*: elegant, slower |
| Milonga, Troilo-Fiorentino 1941–43 | 108–116 | — |
| Milonga, Tanturi-Castillo | 108–118 | — |
| Milonga, Rodríguez | 108–118 | — |
| Milonga, Donato | 106–118 | — |
| Milonga, Pugliese (rare) | 104–114 | — |
| Milonga candombe (Canaro, D'Arienzo) | 100–112 | heavier, syncopated |

### 2.7 Per-orchestra profiles

See `orchestra_profiles.json` (same directory). Fields:

```
name, aliases[], era (primary label + active_years), style_tag,
energy_baseline (combined), physical_baseline, emotional_baseline, difficulty,
bpm { tango:[lo,hi], vals:[lo,hi], milonga:[lo,hi] }   (quarter-note BPM; null = little/no repertoire),
singers[] { name, years, notes },
recommended_positions[] (warmup | early | middle | peak | late | closing),
share_of_night_max (fraction of tango tandas), vocal_strength (0–1), instrumental_strength (0–1),
danceability_notes, best_sub_periods[], signature_tracks[] (useful as tanda openers/closers)
```

Baselines are combined-energy for the orchestra's *typical* danceable tanda; a track-level
score is baseline ± the §2.2 adjustments (bounded to ±20).

---

## 3. Night arc

### 3.1 Tandas per hour

- Tango tanda: 4 × ~2:45 = 11:00; vals: 3 × ~2:50 = 8:30; milonga: 3 × ~2:20 = 7:00.
- Cortina: 45–60 s (30 s minimum; BsAs often 60–90 s).
- One TTVTTM cycle ≈ 4×12:00 + 9:30 + 8:00 ≈ **65–70 min**.
- So: **~5.2 tandas/hour**, i.e. 3 h ≈ 15–16 tandas, 4 h ≈ 20–21, 5 h ≈ 26, 6 h ≈ 31.
- With 3-track tango tandas: ≈ 6 tandas/hour.

### 3.2 Phase model

Phases scale with total length. Percentages of total duration:

| Phase | % of night | Energy target (tanda mean) | Content |
|---|---|---|---|
| **Warm-up** | 0–15% | 45–60 | easy, rhythmic but not aggressive: D'Arienzo instrumentals 1936–38 at *moderate* intensity, Canaro-Maida, Rodríguez, Donato, D'Agostino-Vargas, Fresedo-Ray, Lomuto; no Pugliese, no Troilo-Marino, no 1950s Di Sarli; valses light (Canaro-Charlo/Famá, Donato). Lavocah: do not play your best tracks yet; do not treat it as a práctica. |
| **Build** | 15–40% | 55–70 | Tanturi-Castillo, Di Sarli-Rufino/Podestá, Troilo-Fiorentino, Caló-Berón/Podestá, Biagi vocal, Laurenz, D'Arienzo-Echagüe; valses De Angelis, D'Arienzo, Biagi; milongas Canaro, D'Arienzo. First small peak around 35–40%. |
| **Plateau / breath** | 40–50% | 50–60 | one or two "easier" tandas (Canaro-Maida, Fresedo, D'Agostino, Demare) so the floor rests and mixes partners — Lavocah: "include easier tandas even with advanced dancers". |
| **Main build** | 50–75% | 65–80 | D'Arienzo (peak years), Biagi, Troilo 1941–44, Di Sarli 1950s instrumentals, Tanturi, Rodríguez; vals/milonga at their strongest (D'Arienzo 1950s milongas, Biagi valses). |
| **Peak** | 75–88% | 75–88 | **Pugliese** (one tanda, at the high point — "one tanda of Pugliese at the high point can be no mistake"), Troilo-Marino or Troilo instrumental late, Di Sarli 1954–58, D'Arienzo 1950s, De Angelis strongest. The Pugliese tanda is never immediately followed by another dramatic tanda: follow it with a vals or a light rhythmic tango (D'Arienzo/Rodríguez) or a milonga to "pick the energy back up". |
| **Cool-down / sweet ending** | 88–100% | 60–75 but *emotional*, not physical | "evergreens": Di Sarli-Rufino, Fresedo-Ray, Canaro-Maida *Poema*, D'Agostino-Vargas, Troilo-Fiorentino, Calo; BsAs custom (Picherna, Cachirulo) is to keep the "sweet" repertoire for the end; a last vals tanda about 2 tandas from the close; the final tango tanda is either (a) very energetic D'Arienzo, (b) intensely lyrical Di Sarli, or (c) rarely reflective/intimate. Then **La Cumparsita**. |

Short nights:
- **3 h**: little internal dynamic (Lavocah). Warm-up ≤ 2 tandas, then medium-high energy
  throughout with ONE peak at ~70–80%, Pugliese optional, close with La Cumparsita. ~15 tandas:
  e.g. T T V T T M | T T V T T M | T T V(or M) T + Cumparsita.
- **4 h** (the standard BsAs/European evening): ~20 tandas; one small peak (~35%), one main peak
  (~80%). Pugliese once. Two or three "breathing" tandas.
- **5 h**: ~26 tandas; two clear peaks (≈40% and ≈80%), Pugliese once at the main peak, optional
  second dramatic tanda (Troilo late / Di Sarli 50s) at the first peak. Three breathing tandas.
- **6 h** (marathon-style): Lavocah's three social phases — early sparse, crowded transition,
  late-arrivals — map to warm-up (0–20%), build + plateau + main build (20–75%), peak + cool-down
  (75–100%). ~31 tandas; two peaks (≈45% and ≈85%); Pugliese may appear twice (once instrumental
  at 45%, once vocal at 85%) if the crowd is strong; otherwise once. Four breathing tandas.
  Avoid high energy throughout: "even over six hours, don't play high energy the whole time".

The "**two peaks**" shape: energy(t) ≈ baseline rising from ~50 to ~65 with a bump to ~72 at
35–45% and the main climax ~85 at 78–85%, then a glide to ~65 (sweet) and the Cumparsita.

### 3.3 Where vals and milonga tandas go in the arc

- They are the "lifts". A vals after a dramatic tango tanda restores lightness; a milonga after
  a lyrical slow set wakes the floor. Rauscher: "after a dramatic slow tanda, follow with a vals
  or milonga"; "before a dramatic set, a spirited vals or milonga helps the floor settle".
- Vals energy should track the phase: early valses gentle (Canaro-Charlo, Donato, Lomuto),
  middle (Di Sarli, Troilo, De Angelis, Tanturi), peak (D'Arienzo, Biagi).
- Milonga energy: early (Canaro, Donato, D'Agostino light milongas), middle (Troilo, Tanturi,
  Rodríguez, Di Sarli), peak (D'Arienzo 1937–41, Biagi, D'Arienzo 1950s).
- Avoid two milonga tandas within 50 min; avoid three vals tandas within 70 min.
- Never finish the night on a milonga tanda (dancers are tired) — the last pre-Cumparsita tanda
  is tango; the last V/M should be at least one tango tanda before.
- A milonga tanda can be placed right after an alternative tanda to "clear" it.

### 3.4 Cortinas as part of the arc

Covered in §4. The cortina preceding a tanda should foreshadow it (slightly lower energy than
the tanda it introduces); the cortina after the Pugliese tanda should be unmistakably upbeat.

### 3.5 La Cumparsita (closing)

- Universal closing signal: when it sounds late in the night, the milonga is over. Played once,
  as the **final track** (BsAs also uses it as a tanda *within* the closer only rarely).
- Standard versions: D'Arienzo 1951 (instrumental) is the most-used "party is over" version;
  Di Sarli 1955 (slow, elegant); Pugliese 1959 (dramatic); Canaro; Troilo 1943 (with the
  "Si supieras" lyric, Fiorentino) for a sentimental ending; Rodríguez 1958.
- Some DJs play **two** versions (one fast, one slow) as a "last tanda"; engine: default **one**
  (the D'Arienzo or Di Sarli version), optionally **two** when flagged.
- Never play La Cumparsita mid-night as a regular track; it is a cue. Never use it as a cortina.
- Fade-out rule: La Cumparsita should not be followed by a cortina.
- Some rooms (Salón Canning, Sunderland) play the national anthem *before* the Cumparsita or a
  "despedida" vals; outside BsAs the convention is Cumparsita alone.

### 3.6 Patterns of well-known DJs (for style presets)

(Impressionistic, from attending and from public interviews / DJ profiles; use as presets, not
as citations of fact.)

- **"Picherna / classic BsAs (Cachirulo, Sunderland) preset"**: TTVTTM strict, 4-3-3; heavy
  D'Arienzo (25% of tango tandas), Di Sarli, Troilo, Tanturi, Biagi, Rodríguez, D'Agostino;
  Pugliese once, late; almost no post-1958 recordings; cortinas long (60–90 s), same style all
  night (often jazz standards/Benny Goodman or Latin pop); closing "sweet"; La Cumparsita D'Arienzo.
- **"European marathon preset" (e.g., DJs on the Tango-DJ.at / Berlin Milonguero / Paradiso
  circuit)**: TTVTTM 4-3-3, 1935–1945 core, careful hammock tandas, more Guardia Vieja and
  Fresedo early, Pugliese once, Troilo late; cortinas 35–50 s, themed (one artist/decade per
  night), seamless manual fades; no alternative music.
- **"Festival main milonga preset"**: like marathon but higher mean energy (room is large and
  young), more D'Arienzo and Biagi milonga/vals, Di Sarli 1950s at peak, one contemporary
  orchestra tanda (Sexteto Milonguero or Romántica Milonguera) in the first third; cortinas
  pop/rock 40–60 s, varied.
- **"Afternoon / práctica preset"**: 3-3-3, lighter, 30 s cortinas, more instrumentals,
  no Pugliese, no 1950s.
- **"Neo/alternative preset"**: TTVTTM still, but up to 3 alternative tandas, Gotan/Bajofondo,
  Otros Aires, Narcotango, Piazzolla *Oblivion* late; cortinas optional/short.

---

## 4. Cortinas

### 4.1 Purpose and rules

- Signals the tanda's end so partners separate and the floor clears; allows cabeceo for the
  next tanda; the name comes from the curtain lowered between orchestras in the 1940s clubs.
- **Must be instantly recognisable as not-tango.** Never a danceable tango/vals/milonga; never
  a tango-ish instrumental (a Piazzolla cortina is a tell: people start dancing or get confused).
- **Non-danceable** for *everyone* in the room ("undanceable even to the most alternative
  person in the room") — swing/salsa/bachata are risky in rooms where people don't know the
  codes, acceptable in BsAs-codes rooms where nobody dances the cortina. Full-length salsa or
  rock-and-roll "cortinas" that people dance to are a specific BsAs tradition (Sunderland),
  used only a couple of times a night — treat as a separate "break tanda" object, not a cortina.
- **Length**: 30–60 s default; play until the floor is clear. 10–20 s early when few people,
  60–90 s on a crowded floor or in BsAs (long cortinas are a local custom). Fade-in optional,
  **fade-out always** (1.5–3 s); many DJs fade manually. The engine: default **45 s** with
  `[30, 90]` bounds; longer in peak phase, shorter in warm-up.
- Volume: never louder than the tandas it frames; rock cortinas are fine with loud DJs, subtle
  ones with quiet DJs.
- Gap: 0.5–1.5 s silence after the cortina before the next tanda's first track (so the opener
  "announces" cleanly).

### 4.2 Same cortina all night vs varied

- **One cortina all night**: classic BsAs practice (Picherna-era); dancers recognise it
  instantly; zero confusion. Downside: monotony over 5–6 hours. Fine for ≤ 4 h.
- **One theme, varied tracks**: the modern best-practice (Lavocah): one artist, decade or genre
  (e.g., 1960s French chanson; Ella Fitzgerald; Motown; Italian 1960s; Balkan brass; rebetiko),
  different track every tanda; some DJs cycle the cortina pattern with the tanda cycle
  (a specific cortina always precedes the vals tanda — the floor learns the code).
- **Random pop hits** every tanda: tolerated at festivals, but "a bad cortina can ruin a good
  tanda" — energy-matching matters more when varying.
- Engine default: **themed, varied**, with a *fixed* cortina before V and before M (the "code"),
  option `single_cortina: true` for traditional preset.

### 4.3 Matching energy to the NEXT tanda

- cortina_energy ≈ next_tanda_energy − 10 ± 10 (lead into it; never jarring). After Pugliese
  → a bright cortina (energy 65–75) → vals/milonga. Before Pugliese → calmer, moodier cortina.
- Tempo: keep cortina tempo in a different range from tango (avoid 110–140 quarter BPM feel;
  pick either < 100 or > 150) so the ear registers "something else".
- Key/mode: irrelevant to dancers; ignore.
- Avoid lyrics in Spanish that sound like tango lyrics (cumbia/bolero are OK but borderline
  in rooms where people dance them).

### 4.4 Genre choices by culture (all acceptable; a few famous picks)

- **Swing / jazz standards** (the most common worldwide): Benny Goodman *Sing Sing Sing*,
  Glenn Miller *In the Mood*, Count Basie, Ella Fitzgerald, Louis Armstrong, Django Reinhardt —
  caution where dancers also swing-dance.
- **Rock / pop 1950s–80s**: Elvis, Chuck Berry, Beatles, Rolling Stones, Queen, ABBA, Blondie,
  Michael Jackson (*Billie Jean* is a cliché festival cortina), Bee Gees; Italian 1960s (Celentano,
  Mina, Modugno *Volare*); French chanson (Édith Piaf, Aznavour, Gainsbourg, Brel); Latin pop /
  cumbia / bolero (Los Panchos — borderline; some BsAs rooms use rock nacional: Soda Stereo,
  Charly García, Los Fabulosos Cadillacs; Sunderland uses "rock & roll" and salsa breaks).
- **Bossa nova / MPB**: Jobim, João Gilberto — gentle, excellent before lyrical tandas.
- **Turkish / Greek / Balkan** (Istanbul, Athens, Belgrade scenes): rebetiko (Vamvakaris),
  laïko, Turkish pop (Sezen Aksu, Tarkan), Balkan brass (Goran Bregović, Boban Marković) —
  high energy, good after dramatic tandas.
- **Persian** (Tehran diaspora scenes): Googoosh, Ebi, Hayedeh; Shajarian for calm cortinas.
- **Korean / Japanese scenes**: K-pop (BTS, BLACKPINK) and J-pop are common and recognisable;
  City Pop (Mariya Takeuchi) for lounge-y cortinas.
- **Klezmer, Irish, Fado, Flamenco**: used for themed nights.
- **Trend/viral songs** (2023–2026): short clips of chart hits (Dua Lipa, Rosalía, Bad Bunny,
  Taylor Swift) are used at festivals by younger DJs; serious marathon DJs avoid them.
- **Famous DJ choices**: Picherna — long jazz/big-band and Latin cortinas with spoken
  announcements of the next orchestra; many European DJs — a single artist per night (e.g.,
  an all-Ella night, an all-Beatles night); some BsAs rooms — the same 1960s Italian/Spanish pop
  clip for years, so regulars "own" it.

### 4.5 Cortina anti-patterns the scorer should flag

- Danceable tango/vals/milonga/Piazzolla as cortina.
- Cortina > 120 s or < 10 s.
- Identical cortina duration every time (machine look) — jitter ±5–10 s.
- Cortina energy wildly off from the next tanda (|Δ| > 30).
- Lyrics with offensive content; club bangers at a traditional milonga; the same pop song as
  cortina AND as alternative tanda.
- No fade (hard cut).
- Cortina after La Cumparsita.

---

## 5. Pitfalls that make a playlist "AI-looking" or amateurish — and detection

| # | Pitfall | Why dancers notice | Detector |
|---|---|---|---|
| 1 | Mixed orchestras inside a tanda | the sound changes mid-tanda; partners feel cheated | orchestra ids per tanda > 1 (except Guardia Vieja mix flag) |
| 2 | Mixed singer / vocal+instrumental | tanda "wobbles" | singer ids > 1; vocal flags not uniform |
| 3 | Years spread > 5–8 within tanda (e.g., D'Arienzo 1936 + 1954) | tempo, fidelity and arrangement jump | max(year)−min(year) |
| 4 | Pugliese in the first hour, or two Pugliese tandas in 4 h, or Pugliese adjacent to alternative | energy curve inverted; "punishing good dancers with too much Pugliese" | position of dramatic tandas vs phase; count |
| 5 | Famous "concert" tracks on the social floor (*Libertango*, *Adiós Nonino*, Piazzolla *Oblivion* except late alternative), Salgán Quinteto Real, Troilo late instrumentals (*Responso*), Sexteto Mayor show pieces | not danceable; a tell that the compiler went by fame | blacklist/tags `danceable=false` |
| 6 | "Greatest hits" ordering: every tanda made only of the 3 most-streamed tracks | the same 40 tracks everyone knows; no depth | popularity rank of all tracks too uniform; repeated across nights |
| 7 | The opposite: obscure first tracks | nobody gets up | track 1 popularity below threshold |
| 8 | Wrong tanda counts (5 tangos, 2 valses, 4 milongas) | breaks rhythm of the night | counts |
| 9 | Broken cycle (TTTTTV, VV, MM, M then V back to back) | breaks the body's expectation | pattern check |
| 10 | Flat energy all night or a monotone descent | boredom / fatigue | variance of tanda energy; slope |
| 11 | All rhythmic 1930s all night (Rauscher) or all lyrical 1950s | fatigue / sleep | share of style tags |
| 12 | Hard style jumps between adjacent tangos tandas (Donato 1930s → Di Sarli 1950s, or strongly rhythmic → smooth lyrical) | whiplash | adjacent-tanda style distance |
| 13 | > 1–2 contemporary/modern orchestra tandas in 4 h; electro at a traditional milonga | identity of the milonga | era share |
| 14 | Late-1940s recordings where the singer overpowers (some Marino, Morán, Laborde) in a crowd of beginners | hard to dance | difficulty vs audience level |
| 15 | Same title twice; two versions of one tango the same night | obvious | title set |
| 16 | Same orchestra in consecutive tango tandas (D'Arienzo-Echagüe then D'Arienzo-Mauré) | lazy | adjacency |
| 17 | Cortinas identical in length or danceable or missing | machine-like | §4.5 |
| 18 | Non-dance recordings (live concert versions with applause, radio transcriptions with speech, film-soundtrack edits) | ugly on the floor | metadata tags `live`, `applause`, duration > 4:00 for golden age |
| 19 | Tracks > 3:30 from the golden age (rare; usually a concert or medley) and tracks < 1:50 | odd | duration windows per era: golden age 2:10–3:30; contemporary 2:30–4:30 |
| 20 | Poor-quality transfers mixed with hi-fi (Shellac noise next to a 1958 stereo recording) inside a tanda | audible seam | loudness/LRA/noise metadata; year spread |
| 21 | Vals tanda that is 2 valses + 1 "tango vals"/3/4 song from a different orchestra | tell | rhythm tag |
| 22 | La Cumparsita mid-night, or no Cumparsita at the end, or a cortina after it | code broken | position |
| 23 | Ending on a milonga or on Pugliese *Negracha* | people leave dazed | final tanda rhythm/energy |
| 24 | Volume/loudness jumps > 4 LU between tracks of a tanda | ear fatigue | loudness normalisation per tanda |
| 25 | Over-regularity: identical energy curve in every tanda, identical cortina length, same cycle without any warm-up TTT or breathing tanda | "generated" feel | variance metrics; presence of at least one human-ish irregularity |

---

## 6. Scoring rubric: "alignment with the best milonga playlists in the world" (0–100)

Score = Σ (weight × factor_score), factor_score ∈ [0,1]. Hard-fail caps apply (max score) when
listed.

| # | Factor | Weight | How to compute (0–1) | Hard-fail cap |
|---|---|---|---|---|
| 1 | **Tanda integrity** (same orchestra, singer, vocal mode, period ≤ 5 yrs, tempo spread ≤ 10%) | 20 | fraction of tandas fully compliant; partial credit 0.5 for only a "tolerated" deviation (Rufino/Podestá, GV mix) | if any tanda mixes rhythms or > 25% of tandas violate → cap 55 |
| 2 | **Cycle & counts** (TTVTTM or declared variant; 4-3-3 or 3-3-3; no V/M adjacency; ≤ 1 TTT in warm-up) | 10 | 1 − violations/number_of_tandas | if more than 2 cycle breaks → cap 70 |
| 3 | **Night arc** (phase energy targets §3.2; one or two peaks; Pugliese position; sweet ending; last tanda not V/M) | 15 | 1 − mean |energy_tanda − target_phase| / 30, clipped; −0.2 if no identifiable main peak in 70–90%; −0.2 if Pugliese/dramatic in first 25% | — |
| 4 | **Intra-tanda ordering** (opener recognisability ≥ 0.5 popularity; hammock or rising; closer "complete") | 10 | fraction of tandas with acceptable shape and strong opener | — |
| 5 | **Era & style balance** (golden age 1935–1955 ≥ 70% of tandas at a traditional milonga; both rhythmic and lyrical present; ≤ 2 contemporary tandas / 4 h; electro only if preset allows) | 10 | sub-scores averaged | electro/alt at a traditional preset → cap 60 |
| 6 | **Orchestra diversity & spacing** (≥ 8 distinct orchestras / 4 h; no orchestra > 20–25% of tango tandas; no same-orchestra adjacent tango tandas; no repeat orchestra+rhythm within 2 h) | 8 | 1 − violations/opportunities | — |
| 7 | **Vocal/instrumental balance** (60–85% vocal tandas) | 4 | 1 if in range, linear to 0 at 30% or 100% | — |
| 8 | **Danceability of every track** (no concert/show/live/non-danceable; duration windows; difficulty matched to audience preset) | 8 | fraction of tracks passing | any non-danceable track → cap 75 |
| 9 | **Cortinas** (present; 30–90 s; non-tango; faded; energy-matched to next tanda; themed or single by preset; jittered lengths) | 6 | sub-scores averaged | danceable-tango cortina → cap 80 |
| 10 | **Closing** (La Cumparsita last; preceded by tango tanda; no cortina after) | 3 | 1/0.5/0 | — |
| 11 | **V/M placement** (lift after dramatic tandas; spacing; energy tracks phase) | 3 | fraction of V/M tandas placed well | — |
| 12 | **Anti-AI naturalness** (variance in cortina length, tanda shapes, popularity mix; at least one "human" irregularity; not a greatest-hits list; no duplicate titles) | 3 | heuristic 0–1 | duplicate title → −0.5 |

Total weights = 100. Interpretation: ≥ 90 "would pass at Cachirulo / a top European marathon";
80–89 "good festival DJ"; 65–79 "competent local DJ"; 50–64 "amateur but dancable";
< 50 "streaming-playlist / AI-looking".

Recommended audience presets that change thresholds: `traditional_bsas`, `marathon_eu`,
`festival`, `afternoon`, `neo_alternative` (see §3.6).

---

## 7. Compact rule list for the engine (checklist)

1. Cycle TTVTTM (or declared variant), 4-3-3 (or 3-3-3), never mixed within a night.
2. Each tanda: one rhythm, one orchestra, one singer/vocal mode, ≤ 5-year spread, ≤ 10% tempo spread.
3. Opener = recognisable; closer = complete/strongest; shape hammock or rising; never falling.
4. Night: warm-up (easy, 45–60) → build → breathe → main build → peak (Pugliese once, 75–88%)
   → sweet ending → La Cumparsita (D'Arienzo 1951 / Di Sarli 1955 default).
5. Follow dramatic tandas with vals/milonga or light rhythmic tango.
6. ~5 tandas/hour; cortinas 45 s default (30–90), non-tango, faded, energy ≈ next tanda − 10.
7. Golden age ≥ 70%; ≤ 2 contemporary tandas / 4 h; no electro at traditional presets.
8. ≥ 8 orchestras / 4 h; no orchestra > 25%; no adjacent same-orchestra tango tandas.
9. 60–85% vocal tandas.
10. No concert/show/live/non-danceable tracks; durations 2:10–3:30 for golden age.
11. Never end on V/M; never two Pugliese tandas in ≤ 4 h; never Pugliese next to alternative.
12. Add human irregularity: jittered cortina lengths, one TTT early, one breathing tanda,
    varying tanda shapes.

---

## Sources

Primary DJ-practice sources consulted (fetched October 2026):

- Michael Lavocah, "Tango DJing Part 1: Music for dancing", Todotango —
  https://www.todotango.com/english/history/chronicle/481/Tango-DJing-Part-1:-Music-for-dancing/
- Michael Lavocah, "Tango DJing Part 2: Tanda construction", Todotango —
  https://www.todotango.com/english/history/chronicle/483/Tango-Djing-Part-2:-Tanda-construction
  (hammock shape; first track "a sign and a promise"; third slot for experiments; cortina length
  "until the floor empties", 10 s to > 1 min; themed cortinas; long cortinas as Argentine custom).
- Michael Lavocah, "Tango DJing Part 3: Shaping the evening", Todotango —
  https://www.todotango.com/english/history/chronicle/510/Tango-DJing-Part-3:-Shaping-the-evening/
  (3 h vs 6 h milongas; three phases; six-tanda cycle ≈ 70 min; golden decade 1935–44, 1941 peak;
  don't play best tracks first; TTT acceptable while people arrive; final tanda energetic or lyrical).
- Clint Rauscher, "How to DJ a Milonga", Tangology 101 —
  https://tangology101.com/main.cfm/title/How-to-DJ-a-Milonga/id/265
  (3- vs 4-track tandas; TTVTTM; 30–60 s cortinas; orchestra order by time of night; 80/20
  vocal/instrumental; mistakes list; ≤ 3 alternative tandas, never next to Pugliese).
- Paul Lohman, "The Big Four" and tempo notes — https://paullohman.com/the-big-four/ ,
  https://paullohman.com/?p=9798 (walking pulse ≈ 60/min; D'Arienzo 63–68; *Pensalo bien* 68,
  *Tango brujo* 64; Di Sarli *Bahía Blanca* ≈ 56; Canaro *Milonga sentimental* figure).
- Paul Lohman, "Tango, Tango, Vals, Tango, Tango, Milonga" —
  https://paullohman.com/tango-tango-vals-tango-tango-milonga/
- Tango and Chaos, "Nailing the quicks" (vals cadence 70–80 strong beats; *Desde el alma* ≈ 72,
  Biagi *Dichas que viví* ≈ 80) — https://www.tangoandchaos.org/chapt_6school/17valscadence
- Tango and Chaos, "Beginnings and endings" (La Cumparsita as closing) —
  https://draft.tangoandchaos.org/pages/03/03_20_cumparsita
- Tejas Tango / Stephen Brown, "Playing music for milongas", "A DJ's guide to post-golden-age
  recordings", "A DJ's guide to neo-tango recordings" —
  https://book-tejas-music.readthedocs.io/en/latest/deejays/play-for-milongas.html ,
  https://book-tejas-music.readthedocs.io/en/latest/deejays/post-golden-age.html ,
  https://book-tejas-music.readthedocs.io/en/latest/deejays/neotangos.html
  (Color Tango, Sassone, Varela, Francini-Pontier, Sexteto Mayor, Piazzolla, Gotan, Bajofondo,
  Otros Aires, Tanghetto, Narcotango danceability verdicts).
- Tango-L archive threads on cortinas (Oct 2006), "Melina's DJing primer" (Aug 2008), Felix
  Picherna (2010, 2016) — https://mailman.mit.edu/pipermail/tango-l/2006-October/002108.html ,
  https://mailman.mit.edu/pipermail/tango-l/2008-August/008918.html ,
  https://mailman.mit.edu/pipermail/tango-l/2010-October/011852.html ,
  https://mailman.mit.edu/pipermail/tango-l/2016-January/013451.html
- Robert Hauk on Picherna — https://roberthauktango.com/?p=592
- r/tango, "Seeking tango DJ help" (Oct 2024) — https://redlib.ssps.io/r/tango/comments/1ftj42d/seeking_tango_dj_help
- Todotango biographies / chronicles: Tanturi (Castillo 1939–43, Campos 1943–46), Di Sarli
  orchestra (Rufino from Dec 1939; Podestá 1942), D'Arienzo-Mauré (1940–44), Biagi, Caló, Berón —
  https://www.todotango.com/english/history/chronicle/489/Orquesta-Tipica-Ricardo-Tanturi ,
  https://www.todotango.com/english/history/chronicle/437/Orquesta-Tipica-Carlos-Di-Sarli/ ,
  https://www.todotango.com/english/artists/biography/98/Rodolfo-Biagi/ ,
  https://todotango.com/english/artists/biography/13/Raul-Beron
- Tangology 101, "The Golden Age of Argentine Tango 1935–1955" —
  https://www.tangology101.com/main.cfm/title/The-Golden-Age-of-Argentine-Tango:-1935-to-1955/id/59
- Wikipedia, Gotan Project — https://en.wikipedia.org/wiki/Gotan_Project

Where the sources are silent (exact BPM ranges per orchestra, singer year tables for the
less-documented orchestras, contemporary ensembles, cortina trends 2024–26), the figures are the
author's professional estimates, marked as such in the JSON (`confidence`). They should be
treated as priors to be refined by measurement on the actual library.
