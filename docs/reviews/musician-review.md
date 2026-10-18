# TDJ — Musician's review of the composed sets

Reviewer stance: orquesta típica musician / musicalizador, Buenos Aires codes. I read
`docs/research/musicology.md`, `packages/core/src/{profiles,energy,arc,tanda,cortinas,compose,score}.ts`
and `data/knowledge/orchestra_profiles.json`, then generated the six requested sets and listened
to them "on paper" the way a DJ booth neighbour would. Files reviewed are read-only; this document
is the only thing written.

Headline: **the engine's tanda hygiene is good (one orchestra, one singer, tight years, correct
cycle) and that is exactly what its scorer measures, so every set gets 88–91 "Headline marathon DJ".
A musician would score these sets 50–65.** The errors are of a different kind than the scorer can
see: concert pieces and medleys on the floor, famous orchestras represented by their most obscure
sides, late-night repertoire in the warm-up, Pugliese followed by Troilo-Rivero, nights that end on
a vals or on a Maderna tanda at energy 52, a Cumparsita that is the wrong version every time,
and energy numbers that contradict the records.

Catalog facts that drive most of this (verified against `data/index/songs.json`):

| Fact | Evidence |
|---|---|
| No tempo or duration data at all | `bpm` present on 0 / 21 932 songs, `durationSec` on 0; the "tempo coherence" factor always returns 0.7 "estimated" |
| Curator `selection` is wildly unbalanced | Pugliese 211/362 selected, Canaro 133/595, Rodríguez 94/190 — but D'Arienzo **3/1095**, Biagi 0/203, Tanturi 0/233, Laurenz 0/83, Demare 0/120, De Angelis 4/767. Any weight on `selection` is a weight *against* D'Arienzo and Biagi. |
| Years ending in 0 are decade placeholders in the source | 1940: 381 songs vs 127–279 in neighbouring years; 1950: 635 vs 275–443. Troilo has 33 tracks dated "1940" including Rivero (joined 1947), Casal (1949), Calderón (1955), Cárdenas (1957). Troilo's only pre-1941 session was March 1938 (*Comme il faut*, *Tinta verde*). |
| Rhythm tags are wrong on famous titles | *Pregonera* (De Angelis, Dante–Martel 1945) is a vals; it is tagged `tango` in all 5 copies, and the D'Arienzo–Laborde 1945 copy too. *Con toda la voz que tengo* (Troilo–Fiorentino 1941, a tango) exists twice: once as `tango`, once as `milonga`. |
| Medleys, potpourris, solo piano and "glosas" are indexed as dance tracks | 85 titles match `selecc|popurr|parte|solo de piano`; "Solo de Piano" and "Glosas Néstor Rodi" are parsed as *singers*. |
| La Cumparsita versions in the catalog | D'Arienzo 1928 (Dante), 1937 ×2, 1943, **1951 ×2**, 1963 ×3, plus two with no year; Di Sarli 1942, 1950, 1951, **1955 ×2 (one curator-selected)**; Troilo 1943 (instr.) and "1938 Fiorentino" ×3 (mis-dated); Pugliese 1959. The engine picks the 1937 D'Arienzo every time because the sort key is orchestra preference only. |
| `data/knowledge/cortinas.json` does not exist | only the 49 built-in cortinas are available; `--cultures=turkish,greek --trend=trend` leaves exactly one candidate |

---

## 1. Verdict per generated set

Score shown is the engine's; the "musician score" is mine (0–100, §6 rubric of musicology.md).

### Set A — `--hours=4 --seed=42` (engine 89 → musician ~55)

What a Buenos Aires DJ would say, tanda by tanda:

- **01 Lomuto / Alberto Rivera 1949–50 as the opener.** Nobody in the room knows a single one of
  these sides. The Lomuto that opens a night is Lomuto–Omar 1935–41 (*Nunca más*, *Muñeca brava*,
  *Madreselva*). Opening with a tier-2 orchestra's last period is pitfall #7 (obscure first track).
- **02 Canaro / Arenas 1951–52.** Contains *Reliquias brasileñas – 2ª parte*: a Brazilian medley,
  part two. Not a tango, not danceable as one. The warm-up Canaro is Canaro–Maida 1935–38
  (*Poema*, *Invierno*, *Nobleza de arrabal*).
- **03 Vals Francini-Pontier instrumental 1952–55** with *Selección de valses* — a medley. Also
  a 1950s string-heavy F-P vals as the first vals of the night is atypical; first vals is
  Canaro–Charlo/Famá, Lomuto, Donato or OTV.
- **04 Troilo instrumental 1950–52 in the warm-up: *Responso* (1951), *Para lucirse* (1950),
  *Chiqué* (1952), *Selección de temas de Francisco Canaro* (1952).** *Responso* is Troilo's
  elegy for Manzi — concert repertoire, explicitly listed as non-danceable in musicology.md §5
  #5. The engine rated it e55 "gentle" and therefore put it in the warm-up. This is the
  single clearest sign that one scalar cannot represent "soft but unsuitable": late Troilo is
  low *physical* and very high *difficulty*.
- 05 Fresedo–Ray 1935–39: good tanda, correctly placed; should have been tanda 1 or 2.
- 06 Tanturi–Castillo milongas 1941–42 (*Así es la milonga*, *Mi morocha*, *Mozo guapo*): real,
  excellent, but e79 at 27% of the night is the peak milonga spent early.
- 07 Di Sarli–Serpa 1952 ×4: all 1952, fine. Serpa is rated e62–64, higher than Di Sarli–Rufino;
  in reality Serpa sides are the softer Di Sarli (e≈56–58).
- 08 De Angelis–Martel 1945–47: fine.
- 09 Biagi vals 1941 (*Lágrimas y sonrisas*, *Marchetta*, *Pájaro herido*): fine tanda; e85–89
  overshoots (Biagi valses ≈ 80–84).
- **10 Laurenz instrumental 1937–41 rated e61 at the first peak** (*Arrabal*, *Amurado*,
  *Orgullo criollo*): these are driving, bandoneón-led sides, e≈70–74. Under-rated because
  Laurenz is tagged `lyrical` with `instrumentalShift 0`.
- **11 D'Arienzo / Juan Carlos Lamas 1942–43 as the night's first D'Arienzo.** Lamas is a
  footnote singer. In 1095 D'Arienzo tracks the engine chose *Pobre mascarita*, *Carancho*,
  *Pompas de jabón*, *Viejo tintero* because nothing in the catalogue tells it that
  *El flete*, *Hotel Victoria*, *Pensalo bien*, *El choclo* exist (only 3 D'Arienzo tracks are
  curator-selected, and TRACK_ENERGY is not used for selection, only for the number).
- 12 Francini-Pontier / Berón milongas 1946–49: obscure; after a D'Arienzo tango tanda the
  milonga that belongs is D'Arienzo 1937–41 or Canaro.
- **13 Donato instrumental 1950–54.** Donato's dance repertoire is 1932–42. Nobody plays 1950s
  Donato. Needs a per-orchestra `bestYears` window.
- 14 OTV 1937 instrumental at target 70: a 1937 OTV is a warm-up tanda (e≈50), not a 62%-of-night
  tanda. The engine ran out of energy-matching candidates and took it anyway.
- 15 Di Sarli–Podestá vals 1942: good.
- 16 Pugliese instrumental 1953–54 at 71%: correct placement, real tracks (*Seguime si podés*,
  *La rayuela*). Good.
- 17 Biagi–Amor 1944–46 after Pugliese: correct idea (light rhythmic after Pugliese). Fine.
- 18 Canaro instrumental milongas 1935–37 (*Milonga de mis amores*, *Largá las penas*, *Milonga
  criolla*) rated e66 against target 83 — Canaro milongas are peak milongas (e≈74–78); also
  the 1936 *Milonga criolla* in the catalogue is Maida vocal (the `vocal:false` copy is a
  duplicate entry).
- 19 Caló / Carlos Barbé 1951–53 at 86% ("peak"): an unknown singer in the peak slot. Caló's
  night-defining tandas are Berón/Podestá 1942–43.
- 20 De Angelis–Dante 1949–52: fine cool-down.
- 21 Lomuto–Díaz vals 1939–42 as the last vals: acceptable, slightly dull.
- **22 Final tanda: Troilo instrumental 1953–55 (*A fuego lento*, *Intermezzo*, *Ojos negros*,
  *El irresistible*) at e55, target 47.** The última tanda must be either big D'Arienzo or
  intensely lyrical vocal Di Sarli / Troilo–Fiorentino; a 1950s instrumental concert-Troilo
  is the worst possible choice. Root cause: `arcTarget` gives the last slot 44–49.
- **Cumparsita: D'Arienzo 1937.** The closing version the whole world uses is D'Arienzo **1951**
  (in the catalogue, twice). 1937 is a brisk early recording nobody closes with.
- Cortinas: *Snowman* (lo-fi hip-hop, e28) after tanda 1 and Nujabes ×3; *Take Five* ×3,
  *Sing Sing Sing* ×3 in 22 tandas. Lo-fi beats at a traditional milonga is a tell.
- Vocal ratio 0.59 (musicology wants 0.70–0.85).

### Set B — `--hours=3 --seed=7` (engine 91 → musician ~58)

- **01 Francisco Rotundo / Roldán 1949–50 as the opener** — a secondary 1950s orchestra opening
  the night. Then **02 Canaro / Nelly Omar 1946–47** (*Sus ojos se cerraron*, *Canción
  desesperada*): these are tango-canción recital sides, listening music.
- 03 OTV / Carmen del Moral vals 1940: *Isabelita* is the Rodríguez–Moreno hit; the OTV cover
  with a female vocalist is a curiosity.
- 05 Di Sarli–Podestá 1942–44 (*Nada*, *Volver a vernos*, *Tú, el cielo y tú*): good.
- **06 "Milonga" Troilo–Fiorentino containing *Con toda la voz que tengo* (1941), which is a
  tango.** Catalogue rhythm error; pitfall #21.
- 07 De Angelis / Dante–Larroca 1951–55: the duet is fine as a "singer" value; placement OK.
- 08 D'Arienzo instrumental 1942–43 (*Loca* 1942, *Independencia*, *El amasijo*, *Vea vea*):
  the *Loca* dancers know is 1955 (catalogue has 1955 ×2 and 1946); verify the 1942 date.
- 09 Tanturi–Castillo vals 1941 (*Mi romance*, *Recuerdo*, *La serenata*): textbook. Good.
- 10 Federico / **Armando Moreno** 1952–54: Armando Moreno is Rodríguez's singer; the Federico
  pairing exists in the catalogue (1952–56) but is unknown to dancers — and is absent from the
  profile's singer table. 11 Laurenz / Alfredo del Río 1952–53: 1950s Laurenz, not the 1937–44
  Laurenz anyone programmes.
- 12 Di Sarli–Rufino milongas 1941–42 (*Zorzal*, *Pena mulata*, *Cuando un viejo se enamora*):
  a real, classic tanda — but rated e75–77. Di Sarli milongas are elegant and slow (104–112
  BPM); e≈62–66. The flat `milonga +12` shift ignores the orchestra's style.
- 13 Pugliese instrumental 1951–52 (*Si sos brujo*, *Bien milonga*, *La cachila*, *Para dos*) at
  80%: exactly right.
- **14 Troilo–Rivero 1947–49 immediately after Pugliese** (*Tú*, *Yo te bendigo*, *Tu perro
  pekinés*, *Tu pálido final*): dramatic after dramatic — the explicit "never" of §3.2. Rivero's
  baritone over late Troilo is also marginal floor music.
- 15 Demare–Berón vals 1943: lovely. 
- **16 Final tanda Osmar Maderna / Verri 1946–47 at e52.** Maderna is a delicate listening
  orchestra; as the última tanda the floor empties quietly. Cumparsita again D'Arienzo 1937.
- Cortinas: Lady Gaga/Bruno Mars 2024 at a golden-age night, twice.

### Set C — `--hours=6 --seed=3` (engine 88 → musician ~52)

- 01 Fresedo–Ray 1935–39: a proper opener. 
- **02 Di Sarli instrumental 1953–54 (*El amanecer*, *A la gran muñeca*, *Una fija*, *Cuidado
  con los cincuenta*) as the second tanda of the night.** This is the late-night grand Di Sarli
  (musicology §3.2: "no 1950s Di Sarli in the warm-up"). It landed there because TRACK_ENERGY
  rates *El amanecer* 58 and *A la gran muñeca* 64 — lower than Di Sarli–Serpa — and Di Sarli's
  profile lists `warmup`.
- 03 Canaro / Guillermo Coral vals 1944–45: obscure singer; 04 D'Agostino–Vargas 1945–46: good;
  05 Rodríguez–Flores 1937–39: good; 06 Malerba–Medina milongas: fine.
- 07 Troilo instrumental "1943–46" (*Inspiración*, *Color de rosa*, *El africano*, *Bienvenida*):
  unknown sides when *Cachirulo*, *Milongueando en el 40*, *Guapeando*, *C.T.V.* exist.
- 08 Tanturi–Campos 1943–45 rated e62: Campos is the rounder, slower Tanturi (114–124 BPM),
  e≈54–58. Castillo and Campos need opposite singer shifts.
- **17 Pugliese–Morán 1950–54 at 52% of a six-hour night, and no dramatic tanda at the real
  peak (75–88%)**, where the engine put Federico–Vidal (e60), Varela–Laborde (e63) and Laurenz
  1943 (e63). The second half of the night is flat (energy 57–66 for 12 tandas); musicology
  §3.2 for 6 h: Pugliese instrumental ≈45% *and* Pugliese vocal ≈85%.
- 20 D'Arienzo–Echagüe 1949–51 at 61%: fine. 25 Troilo–Rivero again. 28 Héctor Varela /
  Armando Laborde 1951–52: pairing missing from the profile.
- Di Sarli appears three times, twice with Serpa (tandas 16 and 23) while Rufino/Podestá
  are never used in a 6-hour night. Same-singer repeats should be weighted much lower than
  same-orchestra repeats with a *different* singer.
- **33 The night ends on a VALS tanda (Donato–Lagos 1936–38) and then La Cumparsita.**
  `planSlots` simply cycles TTVTTM; with 33 slots the last one is V. Rule in §3.3: the last
  pre-Cumparsita tanda is tango; the last V/M at least one tango tanda earlier.
- Cortinas: Misirlou (Dick Dale, e90) before a Rodríguez vals; *Fly Me to the Moon* ×4.

### Set D — `--eras=post-golden --seed=5` (engine 88 → musician ~50)

- 01 Fresedo / Hugo Marcel 1959–62 at e42: a sleepy opener, but defensible for a post-55 night.
- 06 Troilo instrumental milongas 1966–69 (*La trampera*, *Payadora*, *Compadrita mía*): the
  Troilo milongas people dance are 1941–44; late Troilo milongas are concert tempo.
- **09 D'Arienzo / Jorge Valdez valses 1957–59 rated e87–93.** Valdez is the *romantic* D'Arienzo;
  these valses are e≈76–80. The number comes from baseline 80 + ERA_BASE −2 + builtin
  eraShift post-golden +6 + vals +6 + jitter. Set E has the same thing with Laborde 1954–56 at
  e89–93.
- 13 Pugliese instrumental 1956–60 at 57%, "build" phase; nothing dramatic at the 80% slot;
  and 17 D'Arienzo instrumental 1957–61 (*El puaso*, *Gran señor*, *Criollo de ley*) is a good
  peak tanda in the right place.
- 15 and 21 are both De Angelis valses (Godoy 1958–61, Lalo Martel 1959–62) plus a De Angelis
  milonga (12) and a De Angelis tango (04): four De Angelis tandas in 22. Orchestra share is
  only limited by the repeat gap, not by a night-share cap.
- 20 Caló / Marga Fontana 1965: a female singer nobody associates with Caló, at 90% of the night.
- **22 Final tanda: Lucio Demare, "Solo de Piano" 1957** — *Niebla del Riachuelo*, *Los mareados*,
  *Gricel* as **piano solos**. A recital, not a tanda. "Solo de Piano" was parsed as a singer
  and the tanda passed every integrity check.
- Cumparsita D'Arienzo 1937 after a post-1956 night: here the right version is D'Arienzo 1963
  (in the catalogue, ×3) or 1951.

### Set E — `--eras=all --seed=9` (engine 91 → musician ~40)

With `all`, `minTier` becomes 3 and 795 orchestras become eligible, including every singer's
backing group and every 1990s concert ensemble:

- 01 Orq. Típica Brunswick / Luis Díaz 1930–32 opener (obscure Guardia Vieja); **02 Raúl Garello
  / Goyeneche 1990** (Goyeneche's late, spoken-sung voice; not floor music); 04 Adolfo Pérez
  "Pocholo" 1934–36; **07 De Angelis / Gigí de Ángelis 1976–80**; 14 Tanturi / Horacio Roca
  1957–60; **21 Hugo Videla / Ginamaría Hidalgo 1976 "vals" tanda containing *La Bohème* and
  *Hamabe no uta* (a Japanese art song)**; **22 final tanda Emilio Brameri / Mercedes Simone
  1966** (a singer's LP).
- 09 D'Arienzo–Laborde valses 1954–56 at e89–93 (see Set D).
- 10 Troilo–Fiorentino "1940–41": the 1940 dates are placeholders (see table above); *Vieja
  amiga* and *Colorao colorao* carry the fake year, so the "1940–41" spread is fiction.
- 17 Pugliese / Abel Córdoba 1965–69 at the peak: real and intense (*Yo soy del treinta*), but
  difficulty ~95; and **19 Troilo–Marino 1943–45 right after it** — dramatic after dramatic again.
- Good tandas exist here (Demare–Miranda milongas, Rodríguez–Moreno 1945, Biagi–Ortiz 1941–43,
  Donato–Lagos milongas, Caló–Berón 1942–44, Rodríguez–Moreno valses, Di Sarli–Durán 1956–58).
  They are drowned by the tier-3 noise.
- **Cumparsita: "Juan D'Arienzo (?)"** — an entry with no year, chosen because unknown-year
  rows sort first within the orchestra-preference tie.

### Set F — `--cultures=turkish,greek --trend=trend` (4 h golden, engine 90 → musician ~55)

- **The same cortina (Mabel Matiz, *Bir Günah Gibi*) 21 times in a row.** With `turkish,greek`
  and `trend` only one built-in cortina qualifies; `pickCortina` allows reuse whenever fewer
  than 4 fresh candidates remain. The Greek rebetiko entries were discarded by the trend
  filter. An accidental "single cortina" night — acceptable in BsAs tradition, but the DJ did
  not ask for it, and a 2018 Turkish pop ballad is the wrong single cortina.
- 01 Firpo / Alberto Diale 1939–43 at e41 as the opener: unknown vocal Firpo; the danceable
  Firpo is the 1936–39 cuarteto (*El amanecer*, *El rápido*, *Fuegos artificiales*).
- **02 Troilo–Casal 1951–53 in the warm-up** (*Patio mío*, *Una canción*): heavy late Troilo
  as tanda 2. 04 Di Sarli–Serpa 1952 as tanda 4 "warm-up".
- 05 Caló–Podestá 1941–43 (*Percal*, *Dos fracasos*, *Si tú quisieras*): good; note the catalogue
  attributes *Yo soy el tango* 1941 to Podestá — most discographies give it as Raúl Berón's Caló
  debut (verify).
- **10 De Angelis / Dante–Martel "tango" tanda containing *Pregonera* (1945), a vals, and
  *Selecciones de E. S. Discépolo* (1948), a medley.** Pitfall #21 in reverse plus a medley.
- 16 Troilo instrumental "1940" (*Homenaje a Juan Carlos Cobián*, *El entrerriano*, *Racing Club*,
  *Recuerdo*): Troilo recorded nothing in 1940; these are mis-dated and some are doubtful
  attributions.
- 17 D'Arienzo instrumental 1950–54 (*El internado*, *Tucumán*, *Yapeyú*): good peak tanda.
- 19 Francini-Pontier / Julio Sosa 1950–52: real pairing — but the profile says Sosa 1953–55.
  Sosa sang with Francini-Pontier 1949–53 (catalogue years: 1949–1953).
- **20 Pugliese instrumental 1951–52 as the penultimate tanda, at 90% "cooldown" with target
  62**, followed by a vals and then 22 Federico / Armando Moreno 1952–55 as the final tanda
  (e55). The ending is inverted: Pugliese → vals → obscure 1950s Federico → Cumparsita 1937.

### Cross-set patterns (the things to fix once)

1. **No fame/canon signal.** TRACK_ENERGY (36 entries) is only consulted for the number; selection
   is by energy proximity among hundreds of sides, so famous orchestras appear with their least
   known recordings (D'Arienzo–Lamas, Troilo 1950s instrumentals, Donato 1950s, Laurenz 1952).
2. **One scalar for energy conflates physical drive, emotional weight and difficulty.** Late Troilo
   and solo-piano Demare read as "gentle" and are programmed as warm-up/closing.
3. **Arc endpoints are wrong**: last slot target 44–49 produces soft, obscure closers; 1950s Di
   Sarli/Troilo are allowed in the warm-up because their profile lists it and their energy fits.
4. **Dramatic adjacency is unchecked**: Pugliese → Troilo-Rivero/Marino in three of six sets.
5. **Cycle does not respect the ending**: a 33-slot night ends on V.
6. **Cumparsita selection ignores year** (always D'Arienzo 1937, or an undated row).
7. **Non-dance items pass integrity**: medleys, "Solo de Piano", concert pieces, placeholder years.
8. **Rhythm-level inflation**: vals +6 / milonga +12 on top of orchestra baseline and +6 / +2 on
   the target; lyrical-orchestra milongas and post-golden D'Arienzo valses land at 75–93.
9. **Cortina pool starvation** and lo-fi/2024 pop at a traditional night.
10. The scorer awards 1.00 on integrity/singer/era/cycle/spacing to every set because the
    generator cannot produce violations; it has no factor for any of items 1–9.

---

## 2. Corrections to `data/knowledge/orchestra_profiles.json`

Format: JSON-Patch-style operations; `id` selects the profile object in the array, `path` is
relative to that object. `add` on an existing key means replace. Items marked *(verify)* are
my professional recollection rather than a checked discography; everything else I would defend
in front of a Buenos Aires musicalizador.

```json
[
  {"id": "juan-d-arienzo", "op": "replace", "path": "/energy", "value": 82},
  {"id": "juan-d-arienzo", "op": "replace", "path": "/singers/Alberto Echagüe", "value": [1938, 1957], "note": "two stints: 1938-39 and 1944-57 (back again 1968-75); add stints field below"},
  {"id": "juan-d-arienzo", "op": "add", "path": "/singerStints/Alberto Echagüe", "value": [[1938, 1939], [1944, 1957], [1968, 1975]]},
  {"id": "juan-d-arienzo", "op": "add", "path": "/singers/Alberto Reynal", "value": [1939, 1941], "note": "lost because the JSON singers object replaces the builtin one"},
  {"id": "juan-d-arienzo", "op": "replace", "path": "/singers/Juan Carlos Lamas", "value": [1940, 1943], "note": "catalogue has 11 Lamas sides dated 1942-43"},
  {"id": "juan-d-arienzo", "op": "add", "path": "/singers/Osvaldo Ramos", "value": [1965, 1975]},
  {"id": "juan-d-arienzo", "op": "replace", "path": "/singers/Jorge Valdez", "value": [1957, 1964]},
  {"id": "juan-d-arienzo", "op": "add", "path": "/singerShift", "value": {"Héctor Mauré": -4, "Jorge Valdez": -6, "Juan Carlos Lamas": -4, "Alberto Echagüe": 0, "Armando Laborde": 0}},
  {"id": "juan-d-arienzo", "op": "add", "path": "/bestYears", "value": [1935, 1957]},
  {"id": "juan-d-arienzo", "op": "add", "path": "/warmupOnly", "value": {"vocal": false, "years": [1935, 1939]}, "note": "D'Arienzo may open a night only with 1935-39 instrumentals"},
  {"id": "juan-d-arienzo", "op": "add", "path": "/eraShift", "value": {"golden-early": 4, "golden-peak": 0, "golden-late": 2, "post-golden": 2}, "note": "builtin post-golden +6 is why Valdez valses reach 93"},

  {"id": "carlos-di-sarli", "op": "replace", "path": "/phase", "value": ["build", "peak", "cooldown"], "note": "warm-up only through subPeriods below"},
  {"id": "carlos-di-sarli", "op": "add", "path": "/subPeriods", "value": [
      {"years": [1939, 1945], "phase": ["warmup", "build", "cooldown"], "energyShift": -4},
      {"years": [1946, 1950], "phase": ["build", "cooldown"], "energyShift": 0},
      {"years": [1951, 1958], "phase": ["peak", "cooldown"], "energyShift": 6, "notBefore": 0.45}]},
  {"id": "carlos-di-sarli", "op": "add", "path": "/singerStints/Alberto Podestá", "value": [[1942, 1944], [1947, 1948]]},
  {"id": "carlos-di-sarli", "op": "add", "path": "/singerStints/Jorge Durán", "value": [[1945, 1947], [1956, 1958]]},
  {"id": "carlos-di-sarli", "op": "replace", "path": "/singers/Oscar Serpa", "value": [1948, 1953], "note": "catalogue: 1948, 1952 x16, 1953 x4 (Music Hall period)"},
  {"id": "carlos-di-sarli", "op": "add", "path": "/singers/Roberto Florio", "value": [1956, 1958]},
  {"id": "carlos-di-sarli", "op": "add", "path": "/singerShift", "value": {"Roberto Rufino": 0, "Alberto Podestá": 0, "Oscar Serpa": -4, "Mario Pomar": -2, "Jorge Durán": 2, "Roberto Florio": 0}},
  {"id": "carlos-di-sarli", "op": "add", "path": "/rhythmShift", "value": {"vals": 2, "milonga": 4}, "note": "Di Sarli milongas are slow and elegant (104-112 BPM); engine's flat +12 makes Zorzal 75"},

  {"id": "anibal-troilo", "op": "replace", "path": "/style", "value": "balanced"},
  {"id": "anibal-troilo", "op": "replace", "path": "/instrumentalShift", "value": 2, "note": "1941-44 instrumentals (Cachirulo, Milongueando en el 40, Guapeando, C.T.V.) are the most rhythmic Troilo"},
  {"id": "anibal-troilo", "op": "add", "path": "/eraShift", "value": {"golden-early": 4, "golden-peak": 2, "golden-late": -4, "post-golden": -10}},
  {"id": "anibal-troilo", "op": "add", "path": "/subPeriods", "value": [
      {"years": [1938, 1944], "phase": ["build", "peak", "cooldown"], "difficulty": 40},
      {"years": [1945, 1949], "phase": ["peak", "cooldown"], "difficulty": 60},
      {"years": [1950, 1975], "phase": [], "difficulty": 85, "danceable": "limited", "note": "instrumentals from 1950 on are concert repertoire unless whitelisted"}]},
  {"id": "anibal-troilo", "op": "add", "path": "/bestYears", "value": [1938, 1949]},
  {"id": "anibal-troilo", "op": "add", "path": "/singers/Aldo Calderón", "value": [1955, 1956]},
  {"id": "anibal-troilo", "op": "add", "path": "/singers/Ángel Cárdenas", "value": [1957, 1960]},
  {"id": "anibal-troilo", "op": "add", "path": "/singerShift", "value": {"Francisco Fiorentino": 2, "Alberto Marino": 0, "Floreal Ruiz": -2, "Edmundo Rivero": -4, "Jorge Casal": -4, "Raúl Berón": -4, "Roberto Goyeneche": -8}},
  {"id": "anibal-troilo", "op": "add", "path": "/nonDanceTitles", "value": ["Responso", "La última curda", "Intermezzo", "Danzarín", "Quejas de bandoneón (1963)", "Selección de temas de Francisco Canaro"]},

  {"id": "osvaldo-pugliese", "op": "replace", "path": "/notBefore", "value": 0.6},
  {"id": "osvaldo-pugliese", "op": "add", "path": "/notAfter", "value": 0.9},
  {"id": "osvaldo-pugliese", "op": "replace", "path": "/phase", "value": ["peak"], "note": "never the penultimate tanda; cool-down is Di Sarli/Fresedo/Canaro"},
  {"id": "osvaldo-pugliese", "op": "add", "path": "/maxPerNight", "value": {"4": 1, "6": 2}},
  {"id": "osvaldo-pugliese", "op": "add", "path": "/followWith", "value": ["vals", "milonga", "rhythmic"]},
  {"id": "osvaldo-pugliese", "op": "add", "path": "/singerShift", "value": {"Roberto Chanel": 0, "Alberto Morán": 4, "Jorge Maciel": 2, "Miguel Montero": 0, "Abel Córdoba": 2}},

  {"id": "miguel-calo", "op": "replace", "path": "/energy", "value": 58},
  {"id": "miguel-calo", "op": "replace", "path": "/instrumentalShift", "value": 0},
  {"id": "miguel-calo", "op": "remove", "path": "/singers/Jorge Ortiz", "note": "Ortiz was Biagi's singer 1940-43; no Caló-Ortiz sides I know of (verify)"},
  {"id": "miguel-calo", "op": "add", "path": "/singerStints/Alberto Podestá", "value": [[1941, 1943], [1954, 1954], [1963, 1963]], "note": "catalogue: 1941 x5, 1942, 1943 x3, 1954 x7, 1963 x8 (verify 1954)"},
  {"id": "miguel-calo", "op": "add", "path": "/singerStints/Raúl Berón", "value": [[1941, 1943], [1945, 1946]]},
  {"id": "miguel-calo", "op": "add", "path": "/bestYears", "value": [1941, 1950]},

  {"id": "ricardo-tanturi", "op": "replace", "path": "/energy", "value": 66},
  {"id": "ricardo-tanturi", "op": "add", "path": "/singerShift", "value": {"Alberto Castillo": 6, "Enrique Campos": -8, "Roberto Videla": -6, "Elsa Rivas": -6}, "note": "Castillo 122-130 BPM cheeky; Campos 114-124 romantic"},
  {"id": "ricardo-tanturi", "op": "add", "path": "/singers/Horacio Roca", "value": [1957, 1960]},
  {"id": "ricardo-tanturi", "op": "add", "path": "/singers/Osvaldo Ribó", "value": [1946, 1948]},
  {"id": "ricardo-tanturi", "op": "add", "path": "/bestYears", "value": [1940, 1948]},

  {"id": "rodolfo-biagi", "op": "add", "path": "/singerStints/Jorge Ortiz", "value": [[1940, 1943], [1946, 1948]]},
  {"id": "rodolfo-biagi", "op": "add", "path": "/singerShift", "value": {"Andrés Falgás": 2, "Jorge Ortiz": 0, "Alberto Amor": -4, "Carlos Acuña": -2, "Hugo Duval": -4}},
  {"id": "rodolfo-biagi", "op": "add", "path": "/bestYears", "value": [1938, 1950]},
  {"id": "rodolfo-biagi", "op": "replace", "path": "/bpm/vals", "value": [184, 200]},

  {"id": "enrique-rodriguez", "op": "replace", "path": "/energy", "value": 66},
  {"id": "enrique-rodriguez", "op": "replace", "path": "/phase", "value": ["warmup", "build", "peak"], "note": "Rodríguez valses and milongas are peak material"},
  {"id": "enrique-rodriguez", "op": "add", "path": "/rhythmShift", "value": {"vals": 6, "milonga": 6}},
  {"id": "enrique-rodriguez", "op": "add", "path": "/bestYears", "value": [1937, 1950]},

  {"id": "francisco-canaro", "op": "replace", "path": "/energy", "value": 50},
  {"id": "francisco-canaro", "op": "add", "path": "/eraShift", "value": {"guardia-nueva": -4, "golden-early": 2, "golden-peak": 0, "golden-late": -4, "post-golden": -8}},
  {"id": "francisco-canaro", "op": "add", "path": "/rhythmShift", "value": {"vals": 6, "milonga": 14}, "note": "Canaro milongas (Milonga brava, Reliquias porteñas, Milonga de mis amores) are peak milongas; his tangos are gentle"},
  {"id": "francisco-canaro", "op": "replace", "path": "/singers/Ernesto Famá", "value": [1930, 1941]},
  {"id": "francisco-canaro", "op": "add", "path": "/singers/Nelly Omar", "value": [1946, 1947], "danceable": false, "note": "tango-canción recital sides"},
  {"id": "francisco-canaro", "op": "add", "path": "/singerShift", "value": {"Roberto Maida": 0, "Ernesto Famá": 2, "Charlo": -2, "Carlos Roldán": 0, "Alberto Arenas": -2, "Nelly Omar": -10}},
  {"id": "francisco-canaro", "op": "add", "path": "/bestYears", "value": [1927, 1946]},
  {"id": "francisco-canaro", "op": "add", "path": "/nonDanceTitles", "value": ["Reliquias brasileñas", "Reliquias brasileñas - 2a.parte", "Selección"]},

  {"id": "osvaldo-fresedo", "op": "replace", "path": "/singers/Héctor Pacheco", "value": [1948, 1955], "note": "catalogue 1951-55; Pacheco joined c.1948 (verify)"},
  {"id": "osvaldo-fresedo", "op": "add", "path": "/singers/Hugo Marcel", "value": [1959, 1963]},
  {"id": "osvaldo-fresedo", "op": "add", "path": "/singerStints/Roberto Ray", "value": [[1933, 1939], [1948, 1950]]},
  {"id": "osvaldo-fresedo", "op": "add", "path": "/bestYears", "value": [1933, 1950]},

  {"id": "edgardo-donato", "op": "replace", "path": "/energy", "value": 60},
  {"id": "edgardo-donato", "op": "add", "path": "/rhythmShift", "value": {"vals": 4, "milonga": 10}},
  {"id": "edgardo-donato", "op": "add", "path": "/bestYears", "value": [1932, 1942], "note": "1950s Donato (set A tanda 13) is never programmed"},
  {"id": "edgardo-donato", "op": "add", "path": "/singers/Carlos Almada", "value": [1945, 1950]},
  {"id": "edgardo-donato", "op": "add", "path": "/singers/Roberto Morel", "value": [1942, 1945]},

  {"id": "angel-d-agostino", "op": "replace", "path": "/instrumentalShift", "value": -2},
  {"id": "angel-d-agostino", "op": "add", "path": "/bestYears", "value": [1940, 1955]},
  {"id": "angel-d-agostino", "op": "add", "path": "/singerShift", "value": {"Angel Vargas": 2, "Tino García": -4, "Rubén Cané": -4}},

  {"id": "alfredo-de-angelis", "op": "add", "path": "/rhythmShift", "value": {"vals": 8, "milonga": 2}, "note": "the valses are the legendary part; milongas are light"},
  {"id": "alfredo-de-angelis", "op": "add", "path": "/singers/Lalo Martel", "value": [1957, 1963]},
  {"id": "alfredo-de-angelis", "op": "replace", "path": "/singers/Juan Carlos Godoy", "value": [1958, 1963]},
  {"id": "alfredo-de-angelis", "op": "add", "path": "/bestYears", "value": [1943, 1960]},
  {"id": "alfredo-de-angelis", "op": "add", "path": "/nonDanceTitles", "value": ["Selecciones de E.S.Discépolo", "Selección"]},
  {"id": "alfredo-de-angelis", "op": "add", "path": "/rhythmOverride", "value": {"Pregonera": "vals", "Pastora": "vals", "Flores del alma": "vals", "Soñar y nada más": "vals", "A Magaldi": "vals"}},

  {"id": "pedro-laurenz", "op": "replace", "path": "/energy", "value": 64},
  {"id": "pedro-laurenz", "op": "replace", "path": "/style", "value": "balanced"},
  {"id": "pedro-laurenz", "op": "replace", "path": "/instrumentalShift", "value": 4},
  {"id": "pedro-laurenz", "op": "add", "path": "/singers/Alfredo del Río", "value": [1950, 1955]},
  {"id": "pedro-laurenz", "op": "add", "path": "/bestYears", "value": [1937, 1944]},
  {"id": "pedro-laurenz", "op": "replace", "path": "/phase", "value": ["build", "peak"]},

  {"id": "lucio-demare", "op": "add", "path": "/bestYears", "value": [1938, 1945]},
  {"id": "lucio-demare", "op": "add", "path": "/singers/Solo de Piano", "value": [1953, 1957], "danceable": false, "note": "pseudo-singer: 14 solo-piano recital tracks"},
  {"id": "lucio-demare", "op": "add", "path": "/singerShift", "value": {"Juan Carlos Miranda": 2, "Raúl Berón": 0, "Horacio Quintana": -2}},

  {"id": "francisco-lomuto", "op": "replace", "path": "/energy", "value": 50},
  {"id": "francisco-lomuto", "op": "add", "path": "/bestYears", "value": [1930, 1945]},
  {"id": "francisco-lomuto", "op": "add", "path": "/singers/Alberto Rivera", "value": [1945, 1950]},
  {"id": "francisco-lomuto", "op": "replace", "path": "/singers/Fernando Díaz", "value": [1928, 1945]},

  {"id": "roberto-firpo", "op": "replace", "path": "/phase", "value": ["warmup"]},
  {"id": "roberto-firpo", "op": "add", "path": "/bestYears", "value": [1936, 1939], "note": "the Cuarteto instrumentals; vocal Firpo 1939-43 (Diale) is not opener material"},
  {"id": "roberto-firpo", "op": "add", "path": "/singers/Alberto Diale", "value": [1939, 1943]},

  {"id": "orquesta-tipica-victor", "op": "replace", "path": "/energy", "value": 52},
  {"id": "orquesta-tipica-victor", "op": "replace", "path": "/singers/Ángel Vargas", "value": [1938, 1939]},
  {"id": "orquesta-tipica-victor", "op": "remove", "path": "/singers/Mario Pomar ~1 Ortiz"},
  {"id": "orquesta-tipica-victor", "op": "add", "path": "/singers/Mario Pomar", "value": [1939, 1944], "note": "credited as Mario Corrales on the labels"},
  {"id": "orquesta-tipica-victor", "op": "add", "path": "/singers/Carmen del Moral", "value": [1940, 1941]},
  {"id": "orquesta-tipica-victor", "op": "add", "path": "/bestYears", "value": [1926, 1944]},

  {"id": "carlos-salamanca", "op": "replace", "path": "/id", "value": "fulvio-salamanca", "note": "no such orchestra as Carlos Salamanca; the catalogue id is fulvio-salamanca (133 tracks) and the JSON entry is a phantom that never merges"},
  {"id": "carlos-salamanca", "op": "replace", "path": "/name", "value": "Fulvio Salamanca"},
  {"id": "carlos-salamanca", "op": "replace", "path": "/style", "value": "rhythmic"},
  {"id": "carlos-salamanca", "op": "replace", "path": "/energy", "value": 66},
  {"id": "carlos-salamanca", "op": "replace", "path": "/phase", "value": ["build", "peak"]},
  {"id": "carlos-salamanca", "op": "replace", "path": "/bpm", "value": {"tango": [124, 138], "vals": [180, 196], "milonga": [112, 126]}},
  {"id": "carlos-salamanca", "op": "replace", "path": "/singers", "value": {"Armando Guerrico": [1957, 1962], "Mario Luna": [1957, 1960], "Alberto Hidalgo": [1963, 1967], "Luis Roca": [1959, 1962]}, "note": "D'Arienzo's pianist 1940-57; own orchestra from 1957 (verify singer years)"},
  {"id": "carlos-salamanca", "op": "replace", "path": "/signatureTracks", "value": ["Milongueracha", "Morena (milonga)", "El puntazo", "Delantal"]},

  {"id": "francini-pontier", "op": "replace", "path": "/singers/Julio Sosa", "value": [1949, 1953], "note": "catalogue years 1949-1953; Sosa joined Pontier's own orchestra in 1955"},
  {"id": "francini-pontier", "op": "add", "path": "/singers/Roberto Florio", "value": [1954, 1955]},
  {"id": "francini-pontier", "op": "add", "path": "/nonDanceTitles", "value": ["Selección de valses"]},

  {"id": "domingo-federico", "op": "add", "path": "/singers/Armando Moreno", "value": [1952, 1956], "note": "catalogue has 17 sides; verify"},
  {"id": "domingo-federico", "op": "add", "path": "/bestYears", "value": [1943, 1948]},
  {"id": "domingo-federico", "op": "replace", "path": "/phase", "value": ["build"], "note": "never the final tanda"},

  {"id": "hector-varela", "op": "add", "path": "/singers/Armando Laborde", "value": [1951, 1953], "note": "verify"},

  {"id": "ricardo-malerba", "op": "add", "path": "/bestYears", "value": [1941, 1946]},

  {"id": "osmar-maderna", "op": "replace", "path": "/phase", "value": ["cooldown"]},
  {"id": "osmar-maderna", "op": "add", "path": "/neverClose", "value": true},

  {"id": "astor-piazzolla", "op": "remove", "path": "/singers/Jorge Sobral"},
  {"id": "astor-piazzolla", "op": "add", "path": "/singers/Francisco Fiorentino", "value": [1946, 1948]},
  {"id": "astor-piazzolla", "op": "add", "path": "/singers/Aldo Campoamor", "value": [1946, 1948]},

  {"id": "juan-cambareri", "op": "replace", "path": "/energy", "value": 74, "note": "132-148 BPM 'mago del bandoneón'; difficulty 60"},
  {"id": "juan-cambareri", "op": "replace", "path": "/difficulty", "value": 60},

  {"id": "donato-racciatti", "op": "replace", "path": "/singers", "value": {"Olga Delgrossi": [1952, 1962], "Nina Miranda": [1951, 1956], "Carlos Roldán": [1954, 1960]}, "note": "verify"},

  {"id": "sexteto-mayor", "op": "replace", "path": "/singers", "value": {}},
  {"id": "solo-tango-orquesta", "op": "replace", "path": "/singers", "value": {}},
  {"id": "orquesta-romantica-milonguera", "op": "replace", "path": "/singers", "value": {"Roberto Minondi": [2015, 2026], "Marisol Martínez": [2015, 2026]}},
  {"id": "sexteto-milonguero", "op": "replace", "path": "/singers", "value": {"Javier Di Ciriaco": [2006, 2020]}}
]
```

Schema additions implied above (all optional, backwards compatible): `singerStints`
(array of ranges per singer), `singerShift`, `rhythmShift`, `subPeriods`, `bestYears`,
`warmupOnly`, `notAfter`, `maxPerNight`, `followWith`, `nonDanceTitles`, `rhythmOverride`,
`neverClose`. Also: the JSON has **no `tier` keys**; the builtin tiers survive only because of the
merge, and the 11 JSON-only orchestras (Gotan, Solo Tango, ORM, Villasboas, Cambareri…) default to
tier 3. Add explicit `tier` to every entry.

---

## 3. Corrections to `TRACK_ENERGY` in `energy.ts`

First, three structural notes on the table:

- Keys are `normTitle|orchestraId`, so a title shared by several versions (D'Arienzo *La
  cumparsita* 1928/1937/1943/1951/1963) gets one number. Add an optional year to the key
  (`"la cumparsita|juan-d-arienzo|1951"`) and fall back to the year-less key.
- The table should also carry **danceability** and **fame** so it can drive *selection*, not
  just the number. Suggested shape: `{ e: 88, fame: 3, dance: true, rhythm?: "vals" }`
  (fame 3 = everybody knows it, 2 = DJs know it, 1 = fine track; rhythm overrides the catalogue).
- Existing values to change: *la cumparsita|carlos-di-sarli* 66 → 72 (the 1955 version is grand);
  *bahia blanca* 60 → 66; *a la gran muneca* 64 → 72; *el amanecer* 58 → 66; *milonguero viejo*
  62 → 66 (1955); *don juan|carlos-di-sarli* 66 → 70; *quejas de bandoneon|anibal-troilo* 72 → 70
  (1944); *cachirulo* 74 → 76; *toda mi vida* 56 ok; *recuerdo|osvaldo-pugliese* 72 ok;
  *la mariposa* 70 ok; *nueve de julio|juan-d-arienzo* 90 → 86; *hotel victoria* 88 → 86;
  *poema* 44 → 46; *milonga sentimental* 66 → 70.

Additions (energy 0–100 combined, relative intensities as dancers feel them; year given for the
version meant; `fame` 1–3; `dance:false` where it must never be programmed):

```ts
// Juan D'Arienzo
"el flete|juan-d-arienzo": 90,                 // 1936, fame 3
"hotel victoria|juan-d-arienzo": 86,           // 1935, fame 3
"nueve de julio|juan-d-arienzo": 86,           // 1935, fame 3
"don juan|juan-d-arienzo": 86,                 // 1936, fame 3
"el choclo|juan-d-arienzo": 88,                // 1937, fame 3
"la cumparsita|juan-d-arienzo|1951": 92,       // the closing version, fame 3
"la cumparsita|juan-d-arienzo|1937": 84,
"la cumparsita|juan-d-arienzo|1963": 90,
"loca|juan-d-arienzo|1955": 92,                // fame 3
"independencia|juan-d-arienzo": 86,            // 1938
"rodriguez pena|juan-d-arienzo": 86,           // 1938
"el cencerro|juan-d-arienzo": 84,              // 1937
"ataniche|juan-d-arienzo": 82,                 // 1936
"la payanca|juan-d-arienzo": 84,               // 1936
"comme il faut|juan-d-arienzo": 82,            // 1936
"el apronte|juan-d-arienzo": 80,               // 1936
"el internado|juan-d-arienzo": 88,             // 1954
"pensalo bien|juan-d-arienzo": 84,             // 1938 Echagüe, fame 3
"la bruja|juan-d-arienzo": 84,                 // 1938 Echagüe
"paciencia|juan-d-arienzo": 76,                // 1938 Echagüe (slower, sung)
"nada mas|juan-d-arienzo": 80,                 // 1938 Echagüe
"no mientas|juan-d-arienzo": 82,               // 1938 Echagüe
"indiferencia|juan-d-arienzo": 80,             // 1938 Echagüe
"mandria|juan-d-arienzo": 82,                  // 1939 Echagüe
"ya lo ves|juan-d-arienzo": 74,                // 1941 Mauré
"humillacion|juan-d-arienzo": 76,              // 1941 Mauré
"infamia|juan-d-arienzo": 74,                  // 1941 Mauré
"amarras|juan-d-arienzo": 70,                  // 1944 Mauré
"la punalada|juan-d-arienzo": 88,              // milonga 1937, fame 3
"milonga vieja milonga|juan-d-arienzo": 84,    // milonga 1937
"de pura cepa|juan-d-arienzo": 82,             // milonga 1935
"el esquinazo|juan-d-arienzo": 86,             // milonga 1938 Echagüe
"amor y celos|juan-d-arienzo": 84,             // vals 1936, fame 3 — closer vals
"lagrimas y sonrisas|juan-d-arienzo": 82,      // vals 1936
"desde el alma|juan-d-arienzo": 76,            // vals 1935
"valsecito de antes|juan-d-arienzo": 78,       // vals 1937
// Rodolfo Biagi
"racing club|rodolfo-biagi": 88,               // 1940, fame 3
"pura clase|rodolfo-biagi": 84,                // 1939
"el estribo|rodolfo-biagi": 86,                // 1941
"belgica|rodolfo-biagi": 84,                   // 1938
"quiero verte una vez mas|rodolfo-biagi": 80,  // 1940 Ortiz, fame 3
"humillacion|rodolfo-biagi": 78,               // 1941 Ortiz
"indiferencia|rodolfo-biagi": 74,              // 1942 Ortiz
"lagrimas y sonrisas|rodolfo-biagi": 82,       // vals 1941, fame 3 — closer vals
"dichas que vivi|rodolfo-biagi": 82,           // vals 1939
"flor de montserrat|rodolfo-biagi": 86,        // milonga 1945
"campo afuera|rodolfo-biagi": 84,              // milonga 1939
// Carlos Di Sarli
"bahia blanca|carlos-di-sarli": 66,            // 1957, fame 3
"a la gran muneca|carlos-di-sarli": 72,        // 1954, fame 3
"el amanecer|carlos-di-sarli": 66,             // 1954, fame 3
"don juan|carlos-di-sarli": 70,                // 1955
"comme il faut|carlos-di-sarli": 70,           // 1955
"el pollo ricardo|carlos-di-sarli": 72,        // 1951
"una fija|carlos-di-sarli": 70,                // 1953
"organito de la tarde|carlos-di-sarli": 64,    // 1954
"indio manso|carlos-di-sarli": 66,             // 1958
"milonguero viejo|carlos-di-sarli": 66,        // 1955
"el ingeniero|carlos-di-sarli": 66,            // 1945
"corazon|carlos-di-sarli": 60,                 // 1939 Rufino, fame 3
"nido gaucho|carlos-di-sarli": 60,             // 1942 Podestá, fame 3
"verdemar|carlos-di-sarli": 56,                // 1943 Rufino
"nada|carlos-di-sarli": 56,                    // 1944 Podestá
"tu el cielo y tu|carlos-di-sarli": 58,        // 1944 Podestá
"la capilla blanca|carlos-di-sarli": 58,       // 1944 Podestá
"cuando el amor muere|carlos-di-sarli": 54,    // 1941 Rufino
"zorzal|carlos-di-sarli": 64,                  // milonga 1941 Rufino
"pena mulata|carlos-di-sarli": 66,             // milonga 1941 Rufino
"la mulateada|carlos-di-sarli": 68,            // milonga 1941 Rufino
"rosas de otono|carlos-di-sarli": 66,          // vals 1942 Podestá
"la cumparsita|carlos-di-sarli|1955": 72,
// Aníbal Troilo
"cachirulo|anibal-troilo": 76,                 // 1941
"milongueando en el 40|anibal-troilo": 78,     // 1941, fame 3
"guapeando|anibal-troilo": 76,                 // 1941
"cordon de oro|anibal-troilo": 74,             // 1941
"c t v|anibal-troilo": 74,                     // 1941
"toda mi vida|anibal-troilo": 56,              // 1941 Fiorentino, fame 3
"tinta roja|anibal-troilo": 62,                // 1941 Fiorentino
"yo soy el tango|anibal-troilo": 68,           // 1941 Fiorentino
"te aconsejo que me olvides|anibal-troilo": 60,// 1941 Fiorentino
"el bulin de la calle ayacucho|anibal-troilo": 64, // 1941 Fiorentino
"con toda la voz que tengo|anibal-troilo": 70, // 1941 Fiorentino — TANGO (rhythm override)
"gricel|anibal-troilo": 58,                    // 1942 Fiorentino
"malena|anibal-troilo": 58,                    // 1942 Fiorentino
"pa que bailen los muchachos|anibal-troilo": 66, // 1942 Fiorentino
"quejas de bandoneon|anibal-troilo": 70,       // 1944
"tres amigos|anibal-troilo": 62,               // 1944 Marino
"mano brava|anibal-troilo": 76,                // milonga 1941 Fiorentino
"del tiempo guapo|anibal-troilo": 78,          // milonga 1941 Fiorentino
"palomita blanca|anibal-troilo": 66,           // vals 1944 Marino
"romance de barrio|anibal-troilo": 64,         // vals 1947 Ruiz
"responso|anibal-troilo": 20,                  // dance:false
"la ultima curda|anibal-troilo": 25,           // dance:false
// Osvaldo Pugliese
"la yumba|osvaldo-pugliese": 84,               // 1946, fame 3
"negracha|osvaldo-pugliese": 88,               // 1948
"malandraca|osvaldo-pugliese": 86,             // 1949
"gallo ciego|osvaldo-pugliese": 84,            // 1959, fame 3
"mala junta|osvaldo-pugliese": 78,             // 1943
"tierra querida|osvaldo-pugliese": 74,         // 1944
"recuerdo|osvaldo-pugliese": 72,               // 1944
"farol|osvaldo-pugliese": 60,                  // 1943 Chanel
"chique|osvaldo-pugliese": 80,                 // 1953
"la tupungatina|osvaldo-pugliese": 72,         // 1952
"la cachila|osvaldo-pugliese": 76,             // 1952
"pata ancha|osvaldo-pugliese": 80,             // 1957
"nochero soy|osvaldo-pugliese": 82,            // 1956
"pasional|osvaldo-pugliese": 78,               // 1951 Morán
"remembranza|osvaldo-pugliese": 70,            // 1956 Maciel
"a evaristo carriego|osvaldo-pugliese": 76,    // 1969 — difficulty 95, late only
"desde el alma|osvaldo-pugliese": 64,          // vals 1947
// Francisco Canaro
"poema|francisco-canaro": 46,                  // 1935 Maida, fame 3
"invierno|francisco-canaro": 46,               // 1937 Maida
"nobleza de arrabal|francisco-canaro": 58,     // 1935
"yo no se por que te quiero|francisco-canaro": 56, // 1934 Famá
"milonga sentimental|francisco-canaro": 70,    // 1933 Famá, fame 3
"milonga brava|francisco-canaro": 76,          // 1938
"milonga de mis amores|francisco-canaro": 74,  // 1937
"reliquias portenas|francisco-canaro": 76,     // milonga 1938
"silueta portena|francisco-canaro": 66,        // milonga 1936
"corazon de oro|francisco-canaro": 64,         // vals 1938
"la melodia del corazon|francisco-canaro": 62, // vals 1940
"adios pampa mia|francisco-canaro": 56,        // 1945 Arenas
// Osvaldo Fresedo
"vida mia|osvaldo-fresedo": 42,                // 1933 Ray, fame 3
"sollozos|osvaldo-fresedo": 44,                // 1937 Ray
"niebla del riachuelo|osvaldo-fresedo": 42,    // 1937 Ray
"tigre viejo|osvaldo-fresedo": 50,             // 1934
"el once|osvaldo-fresedo": 52,                 // 1937? verify year
"arrabalero|osvaldo-fresedo": 48,              // 1927
"buscandote|osvaldo-fresedo": 44,              // 1941 Ruiz
// Miguel Caló
"al compas del corazon|miguel-calo": 58,       // 1942 Berón, fame 3
"que te importa que te llore|miguel-calo": 56, // 1942 Berón
"percal|miguel-calo": 60,                      // 1943 Podestá, fame 3
"yo soy el tango|miguel-calo": 62,             // 1941 Berón (verify singer)
"dos fracasos|miguel-calo": 58,                // 1941 Podestá
"tristezas de la calle corrientes|miguel-calo": 56, // 1942 Berón
"jamas retornaras|miguel-calo": 56,            // 1942 Iriarte
"sans souci|miguel-calo": 64,                  // 1950
"pedacito de cielo|miguel-calo": 60,           // vals 1942 Podestá
"bajo un cielo de estrellas|miguel-calo": 62,  // vals 1941 Podestá
// Ricardo Tanturi
"pocas palabras|ricardo-tanturi": 70,          // 1941 Castillo
"asi se baila el tango|ricardo-tanturi": 74,   // 1942 Castillo, fame 3
"cuatro compases|ricardo-tanturi": 72,         // 1942 Castillo
"noches de colon|ricardo-tanturi": 70,         // 1942 Castillo
"la vida es corta|ricardo-tanturi": 72,        // 1941 Castillo
"madame ivonne|ricardo-tanturi": 64,           // 1942 Castillo
"una emocion|ricardo-tanturi": 56,             // 1943 Campos
"oigo tu voz|ricardo-tanturi": 54,             // 1943 Campos
"mi romance|ricardo-tanturi": 72,              // vals 1941 Castillo
"recuerdo|ricardo-tanturi": 72,                // vals 1941 Castillo
"mozo guapo|ricardo-tanturi": 78,              // milonga 1940 Castillo
"asi es la milonga|ricardo-tanturi": 76,       // milonga 1942 Castillo
// Enrique Rodríguez
"son cosas del bandoneon|enrique-rodriguez": 68, // 1939 Moreno
"llorar por una mujer|enrique-rodriguez": 70,  // 1941 Moreno
"en la buena y en la mala|enrique-rodriguez": 68, // 1940 Moreno
"el encopao|enrique-rodriguez": 68,            // 1942 Moreno
"como se pianta la vida|enrique-rodriguez": 66,// 1939 Moreno
"tengo mil novias|enrique-rodriguez": 74,      // vals 1939 Moreno, fame 3
"isabelita|enrique-rodriguez": 74,             // vals 1940 Moreno
"fru fru|enrique-rodriguez": 74,               // vals 1939 Flores
// Alfredo De Angelis
"pregonera|alfredo-de-angelis": 74,            // VALS 1945 Dante-Martel (rhythm override)
"pastora|alfredo-de-angelis": 74,              // vals 1944
"flores del alma|alfredo-de-angelis": 76,      // vals 1947
"sonar y nada mas|alfredo-de-angelis": 74,     // vals 1944
"a magaldi|alfredo-de-angelis": 72,            // vals 1947
"remolino|alfredo-de-angelis": 64,             // 1946 Dante
"pavadita|alfredo-de-angelis": 74,             // 1958
// Pedro Laurenz
"amurado|pedro-laurenz": 72,                   // 1940
"arrabal|pedro-laurenz": 72,                   // 1937
"mal de amores|pedro-laurenz": 74,             // 1941
"orgullo criollo|pedro-laurenz": 72,           // 1941
"milonga de mis amores|pedro-laurenz": 78,     // milonga 1937, fame 3
"como dos extranos|pedro-laurenz": 62,         // 1940 Casas
"alma de bohemio|pedro-laurenz": 64,           // 1943 Podestá
"mascarita|pedro-laurenz": 70,                 // vals 1940 Casas
// Lucio Demare
"malena|lucio-demare": 50,                     // 1942 Miranda, fame 3
"manana zarpa un barco|lucio-demare": 54,      // 1942 Miranda
"tal vez sera su voz|lucio-demare": 52,        // 1943 Berón
"solamente ella|lucio-demare": 52,             // 1944 Berón
"dandy|lucio-demare": 56,                      // 1942 Miranda
"negra maria|lucio-demare": 66,                // milonga 1941 Miranda
"no nos veremos mas|lucio-demare": 58,         // vals 1943 Berón
// Edgardo Donato
"el huracan|edgardo-donato": 66,               // 1932
"a media luz|edgardo-donato": 60,              // 1941 Lagos
"se va la vida|edgardo-donato": 62,            // 1936 Lagos
"el adios|edgardo-donato": 58,                 // 1938 Lagos
"ella es asi|edgardo-donato": 74,              // milonga 1938
"sacale punta|edgardo-donato": 76,             // milonga 1938
"la milonga que faltaba|edgardo-donato": 72,   // milonga 1938
"la tapera|edgardo-donato": 66,                // vals 1938
"carnaval de mi barrio|edgardo-donato": 64,    // vals 1939
// Ángel D'Agostino
"cafe dominguez|angel-d-agostino": 56,         // 1955, fame 3 — classic opener
"tres esquinas|angel-d-agostino": 58,          // 1941 Vargas, fame 3
"ninguna|angel-d-agostino": 54,                // 1942 Vargas
"hotel victoria|angel-d-agostino": 62,         // 1945 Vargas
"muchacho|angel-d-agostino": 60,               // 1940 Vargas
"el yacare|angel-d-agostino": 62,              // 1941 Vargas
"a pan y agua|angel-d-agostino": 62,           // 1945
"esta noche en buenos aires|angel-d-agostino": 60, // vals 1943
// Non-dance guards (any orchestra): set dance:false
"adios nonino|astor-piazzolla": 30, "libertango|astor-piazzolla": 40, "oblivion|astor-piazzolla": 20,
"balada para un loco|astor-piazzolla": 30, "a fuego lento|horacio-salgan": 35,
```

The relative ordering that matters most and that the current numbers get wrong:
D'Arienzo 1935–39 instr. (84–90) > Biagi (78–88) > D'Arienzo–Echagüe (76–84) ≈ D'Arienzo 1950s
instr. (80–88) > Pugliese instr. (72–88) > Troilo 1941 instr. (74–78) ≈ Laurenz instr. (72–78) >
Tanturi–Castillo (70–74) > Rodríguez–Moreno (66–70) ≈ Di Sarli 1950s instr. (64–72) >
De Angelis vocal (60–68) > Caló–Berón/Podestá (56–62) ≈ Tanturi–Campos (54–58) ≈ D'Agostino–Vargas
(54–62) > Di Sarli–Rufino/Podestá (54–60) > Demare–Miranda (50–56) > Canaro–Maida (44–50) >
Fresedo–Ray (40–50). Milongas: D'Arienzo/Biagi (84–88) > Canaro (70–76) ≈ Tanturi–Castillo
(74–78) > Troilo–Fiorentino (76–78) > Donato (72–76) > De Angelis (66–70) > Di Sarli (62–68).
Valses: D'Arienzo (76–84) ≈ Biagi (80–84) > De Angelis (72–78) ≈ Rodríguez (72–76) > Tanturi
(70–74) > Di Sarli (64–68) ≈ Troilo (62–66) > Canaro (60–66) > Demare/Lomuto (56–60).

---

## 4. Rule changes for `tanda.ts` / `compose.ts` (and the two files they depend on)

Each item is precise enough to implement without further questions.

### 4.1 Pool hygiene (compose.ts, before `families()`)

1. **Non-dance filter.** Drop any song where `normTitle(title)` matches
   `/^(seleccion|selecciones|potpourri|popurri|mosaico|fantasia|rapsodia|concierto|homenaje a)\b/`
   or `/\b(\d+a?\.? ?parte|parte \d)\b/`; where `singer` matches
   `/solo de|sólo de|glosas|recitad|relato|fondo musical/i`; where the profile's
   `nonDanceTitles` contains the title; or where TRACK_ENERGY marks `dance:false`.
2. **Rhythm override + dedupe.** Apply `TRACK_RHYTHM` (and profile `rhythmOverride`) before
   filtering by rhythm. Then dedupe rows with identical `(orchestraId, normTitle, singerId, year)`:
   keep the majority rhythm, prefer `selection:true`, prefer `vocal` consistent with
   `singer != null`.
3. **Placeholder years.** If `year % 10 === 0` and the song's singer has a span in the profile
   that does not contain `year`, set `yearApprox = true` and `year = midpoint(span)`;
   if no singer span, keep the year but set `yearApprox`. `families()` must treat an approx
   year as spread 8 (i.e. an approx track can only sit with tracks of the same approx decade),
   and buildTanda must never use an approx-year track as the opener.
4. **Best-years window.** Multiply a family's weight by 0.25 when the family's median year is
   outside the profile's `bestYears`; by 0 when the profile has `subPeriods` and the matching
   sub-period has `danceable: "limited"` and the track is not in TRACK_ENERGY.
5. **Era preset `all` must not become `minTier 3`.** Keep `minTier 2`; only orchestras with a
   profile may fill slots 1–2 and the last two; unknown orchestras (no profile) are allowed only
   in positions 0.2–0.8 and at most 2 per night.

### 4.2 Slot planning (arc.ts, called from compose)

6. **Ending shape.** After `planSlots`, if the last slot is V or M, drop it and (if the total is
   now > 6 min short) append a tango slot; ensure the final two slots are T T and the last V/M is
   ≥ 1 tango slot earlier. If the pattern ends `…T T M` for a 22-slot night this is already true;
   check it anyway (33 slots → ends on V today).
7. **Warm-up TTT.** For nights ≥ 4 h, make the first cycle `T T T V T T M` (drop the first V)
   so the floor fills on tango; flag it as the one allowed irregularity.
8. **Arc endpoints.** Replace `arcTarget` endpoints: warm-up 48–56 (not 44), close-out 62–68
   (not 44–49). Concretely in `classic-two-peaks`: `y = max(y, 62)` for `x ≥ 0.9`, and the
   last slot gets `targetEnergy = 66`, `phase = "close"`. The cool-down must be *emotional*, so
   also set `slot.prefer = "vocal"` for x ≥ 0.88.
9. **Phase labels.** For `classic-two-peaks`: warmup < 0.18, build 0.18–0.40, `peak1` 0.40–0.50
   (treated as "build" for `notBefore` purposes), breath 0.50–0.60 (target −6), build 0.60–0.75,
   `peak` 0.75–0.88, cooldown 0.88–1.0. Today "peak" at 0.38–0.52 lets Pugliese into the
   first half of a 6-hour night.
10. **Rhythm targets.** Remove the `+6 milonga / +2 vals` added to `targetEnergy` and instead
    compare the tanda's energy *after subtracting the profile's rhythmShift*, i.e. match tango-
    equivalent energy. This stops milonga tandas being "too hot" early and "too cold" late at
    the same time.

### 4.3 Candidate weighting (tanda.ts `buildTanda`)

11. **Fame weight.** `w *= 1 + 0.6 * famousCount(c)` where `famousCount` is the number of
    tracks in the family with `fame ≥ 2` in TRACK_ENERGY (cap at 4). Remove the
    `selection ? 1.25 : 1` factor (it is a Pugliese/Canaro bias given the catalogue).
12. **Opener and closer tandas.** For `slot.index === 0`: only families whose profile phase
    includes `warmup` *and* whose family median year is inside `warmupOnly.years` (if set);
    hard-exclude golden-late Di Sarli/Troilo, any Pugliese/Gobbi, and any family with
    `famousCount === 0`. For the last slot: require `tier === 1`, `famousCount ≥ 1`,
    `vocal === true` unless D'Arienzo, energy ≥ 62, and exclude profiles with `neverClose`.
13. **Dramatic adjacency.** If `ctx.lastStyle === "dramatic"` (Pugliese, Gobbi, Troilo ≥ 1945,
    Color Tango, Basso), the next tango family must have style `rhythmic`/`guardia` or be a
    V/M slot; multiply other families by 0.05. Also enforce `notAfter` and `maxPerNight`.
14. **Singer repeat.** Keep `orchestraRepeatGap 6`, but add `sameSingerRepeatGap = 12` and a
    rule: an orchestra may return only with a different singer/vocal mode unless the night is
    > 5 h. (Di Sarli–Serpa twice in set C while Rufino and Podestá are unused.)
15. **Orchestra night share.** Enforce `shareOfNightMax` from the JSON (D'Arienzo/Di Sarli 25%,
    De Angelis 12%…) over tango tandas, counting V/M at half weight. Set D has four De Angelis
    tandas in 22.
16. **Phase-profile mismatch is a hard filter, not a ×0.45 weight,** for `warmup` and `close`;
    for other phases keep the weight but apply the sub-period phase list when present.
17. **Singer-year check.** Pairings outside `singers`/`singerStints` currently cost −2 energy;
    instead multiply the family weight by 0.3 and never allow them as opener/closer.

### 4.4 Track choice inside the chosen family

18. Pick `need` tracks by: (a) all `fame ≥ 2` tracks first (up to `need`), (b) fill with tracks
    whose energy is within ±8 of the family mean and whose year is within 3 of the family median,
    (c) prefer `selection`. Today the picker sorts by |energy − target| which, given
    `titleJitter ±4.5`, is effectively random within the family.
19. **Shape.** Default `tandaShape` to `hammock` (musicology default). `shapeTanda` must sort by
    `(fame desc, energy desc)` for position 1 and by `(energy desc, fame desc)` for the last
    position; positions 2–3 by energy ascending. Never put an approx-year or fame-0 track in
    position 1 when a fame ≥ 2 track exists.
20. Because there is no BPM data, replace `titleJitter` with a deterministic but *meaningful*
    spread: `+2` if the title is in TRACK_ENERGY (fame 1), `−3` if `yearApprox`, `0` otherwise.
    Displaying per-track energies that differ only by hash noise misleads the DJ.

### 4.5 Cumparsita (compose.ts)

21. Candidate scoring: `score = versionPref + (year ? 0 : −100)` with
    `versionPref`: D'Arienzo 1951 = 100, D'Arienzo 1963 = 90, Di Sarli 1955 = 88, Pugliese 1959 =
    80, Troilo 1943 instr. = 78, D'Arienzo 1943 = 70, Canaro 1951 = 60, D'Arienzo 1937 = 50,
    anything else = 10. Prefer `selection`. For `eras=post-golden` prefer the 1963 D'Arienzo;
    for `all` the 1951. Keep "not the same orchestra as the last tanda" but only as a tie-break.
22. If the last tanda is Pugliese (should no longer happen) choose Di Sarli 1955.

### 4.6 Cortinas (cortinas.ts)

23. Fallback ladder: `cultures+genres+trend` → `cultures+trend` → `cultures` → `global`; never
    accept a candidate set smaller than 6 before relaxing. Never reuse a cortina within 5
    tandas unless `cortinaStyle === "constant"`.
24. `floorMood traditional` (and the default golden preset) excludes genres `lo-fi`, `kpop`,
    `afrobeats`, `pop` with `year ≥ 2015`, and `trend` cortinas. Lo-fi/hip-hop is never a
    cortina at a traditional milonga.
25. Cortina after a dramatic tanda: energy ≥ 65. Jitter `lengthSec` ±8 s.

### 4.7 Scorer (score.ts) — so that these sets stop scoring 90

26. New factors with hard caps: non-dance track present → cap 70; opener fame 0 → −6;
    closer not tier-1/vocal/≥62 → −6; Pugliese before 0.6 or after 0.9, or dramatic→dramatic →
    −8; last tanda V/M → cap 75; cortina reused within 5 → −3 each; same cortina > 50% of
    tandas when not `constant` → −10; approx-year tracks in a tanda → −2 each; profile
    best-years violation → −3 per tanda; vocal ratio outside 0.6–0.85 → −4.
27. Report "tempo" as unscored (weight 0) while `bpm` coverage is 0 instead of 0.7 free points.

---

## 5. Top 10 enhancements, ranked

1. **A canon/fame layer** (TRACK_ENERGY extended with `fame`, `dance`, `rhythm`, year-keyed) used
   for *selection* and for opener/closer choice. Nothing else moves the sets from "obscure" to
   "recognisable"; it also fixes Cumparsita, *Responso*, *Pregonera* and the medleys.
2. **Two-axis energy + difficulty** (§2.1 of musicology.md): `physical`, `emotional`,
   `difficulty` per track from profile + sub-period + rhythm + singer. Late Troilo, solo-piano
   Demare, Pugliese 1960s and Goyeneche stop reading as "gentle".
3. **Ending and warm-up rules** (4.2 #6–8, 4.3 #12): last tanda strong/lyrical tier-1, never
   V/M, Cumparsita 1951; first two tandas from the warm-up repertoire only.
4. **Sub-period profiles** (`subPeriods`, `bestYears`, `singerStints`, `singerShift`): the
   same orchestra is three orchestras across twenty years; Di Sarli 1939/1954, Troilo 1941/1955,
   Tanturi Castillo/Campos need different phases and energies.
5. **Dramatic-tanda placement** (`notBefore 0.6`, `notAfter 0.9`, `maxPerNight`, `followWith`)
   with a hard adjacency rule, and a 6-hour arc with two dramatic slots.
6. **Catalogue cleaning pass** as data, not runtime: placeholder-year detection, rhythm
   overrides, duplicate collapse, non-dance regexes, pseudo-singers, mis-dated Troilo 1938/1940
   rows. Ship the result as `data/knowledge/track_overrides.json`.
7. **Tempo data.** With 0 BPM rows the tempo factor is fiction. Even a per-orchestra-per-year
   prior from §2.6 (walking pulse ×2) would let the engine catch Tanturi–Castillo vs Campos and
   D'Arienzo 1936 vs 1951 inside the same family.
8. **Night-share and singer-variety constraints** (`shareOfNightMax`, same-singer gap,
   "return only with another singer").
9. **Cortina library as data** (`data/knowledge/cortinas.json` is missing): ≥ 15 per culture,
   the "code" cortina before V and M, per-preset genre exclusions, no reuse within 5.
10. **Re-calibrate the scorer** so a set with a solo-piano última tanda cannot be "Headline
    marathon DJ"; include the human-ear items as explicit penalties (4.7) and publish the
    musician score next to the engine score until they agree.

Reference tandas the engine should be able to produce verbatim once 1–4 are in place (all in
the catalogue): D'Arienzo 1936–37 *El flete / Hotel Victoria / Nueve de julio / El choclo*;
Di Sarli–Rufino 1941–43 *Corazón / Verdemar / Cornetín / Cuando el amor muere*; Troilo–Fiorentino
1941 *Toda mi vida / Tinta roja / Te aconsejo que me olvides / Yo soy el tango*; Tanturi–Castillo
1941–42 *Pocas palabras / La vida es corta / Cuatro compases / Así se baila el tango*; Caló–Berón
1942 *Al compás del corazón / Qué te importa que te llore / Tristezas de la calle Corrientes /
Jamás retornarás*; Pugliese 1946–49 *La yumba / Negracha / Malandraca / Recuerdo*; Di Sarli
1954–57 *El amanecer / A la gran muñeca / Don Juan / Bahía Blanca*; Biagi valses 1939–41 *Dichas que viví /
Amor y vals / Lágrimas y sonrisas* (closer); Canaro milongas *Milonga
sentimental / Milonga de mis amores / Milonga brava*; and La Cumparsita, D'Arienzo 1951.
