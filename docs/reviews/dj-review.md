# TDJ from the booth: a milonguero DJ's review

*Reviewer brief: veteran milonga DJ, Buenos Aires + European marathon circuit, reading the product as a colleague would read a guest DJ's set. Reference rubric: `docs/research/dj-benchmark.md` §3. Nothing under `packages/`, `apps/` or `data/` was modified; this file is the only output.*

**What was reviewed**

- Engine: `packages/core/src/{arc,tanda,cortinas,compose,score,energy,profiles,catalog}.ts`, `packages/core/src/export/index.ts`
- UI: `apps/web/src/components/{Composer,EnergyCurve,ExportSheet,TandaCard,Nav}.tsx`, screenshots `media/screenshots/01–11`
- Four generated sets (CLI, committed `data/index`, no `data/knowledge/cortinas.json` present, so only the built-in cortina pool was active):

| Set | Command | Tandas | TDJ self-score | My rubric score |
|---|---|---|---|---|
| A | `--hours=4 --seed=42` | 22 | 89 "Headline marathon DJ" | **66** (enthusiastic amateur, upper band) |
| B | `--hours=5 --seed=21` | 27 | 91 | **67** |
| C | `--hours=2 --seed=8` | 11 | 89 | **65** |
| D | `--arc=marathon-plateau --hours=6 --seed=4` | 33 | 89 | **63** |

Exports inspected in `/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/exports/` (`tdj-16.*` = set A, `tdj-l.*` = B, `tdj-8.*` = C, `tdj-4.*` = D).

**One-paragraph verdict.** The skeleton is right and it is more right than 80% of the laptop DJs I share marathon weekends with: strict one-orchestra/one-singer tandas, tight year windows, TTVTTM kept to the letter, Pugliese never before the midpoint, a Cumparsita at the end, cortinas after every tanda. That is the 70% of the job that metadata can do, and TDJ does it. What it cannot yet do is the other 30%: it does not know which recordings are *the* recordings, it does not know what time it is (every track is 170 s), it opens the night with 1950s lyrical material and plays 1935 Canaro at the peak, it ends two of four nights on a vals, it repeats the same vals and milonga tandas from one seed to the next, and it hops cortina genres every tanda. A dancer would not walk out, but a milonguero would know after three tandas that nobody was in the booth. The self-score (89–91 on every run) is calibrated to the generator, not to the floor, and should not be shown as "Headline marathon DJ" until the scorer can tell the difference.

---

## 1. How each set plays on a real floor, hour by hour

Timing assumptions: TDJ assumes 170/160/150 s per tango/vals/milonga track, 45 s cortinas, so a TTVTTM cycle is ~65 min and a tango tanda ~12 min. I use a 21:00 start for A/B, 20:00 for C (práctica slot), 22:00 for D (festival-milonga slot). Energy numbers are TDJ's own (0–100) against its own target.

### Set A: 4 h, seed 42 (22 tandas, closes D'Arienzo Cumparsita 1937)

**21:00–22:00 (tandas 1–5).** Opens with Lomuto/Alberto Rivera 1949–50 ("Alma en pena", "Cachadora", "La calle maldita"). Nobody on a European or BA floor knows these; this is the *last* Lomuto, not the 1936–41 Lomuto/Omar everyone dances. Then Canaro/Arenas 1951–52, including "Reliquias brasileñas – 2a. parte" (the second half of a medley) and "Pagá vos, después arreglamos". Then a Francini-Pontier instrumental vals 1952–55 that contains "Selección de valses" (a medley) and sits at energy 62 against a 51 target: an early vals that is louder than the tangos around it. Then Troilo instrumental 1950–52 with "Selección de temas de Francisco Canaro" (medley again), "Responso" (concert piece) and "Chiqué". First hour is three 1950s lyrical/late tandas in a row at a time when the floor is thin and wants square, simple, 1938–41 rhythm. Tanda 5, Fresedo/Ray 1935–39 ("Sollozos", "Penumbras"), is the first tanda a milonguero would nod at; it arrives at 21:50 and it is a warm-up tanda, so the night effectively starts 50 minutes late. **Floor reading:** half the room sits through 1–4 and talks; the couples who came early to dance go in on Fresedo.

**22:00–23:05 (6–11).** Tanturi/Castillo milonga 1941–42 ("Mi morocha", "Mozo guapo", "Así es la milonga"): the floor fills, correct. Di Sarli/Serpa 1952 (fine, mid), De Angelis/Martel 1945–47 (fine), Biagi instrumental vals 1941 ("Lágrimas y sonrisas", "Pájaro herido"): good, a real jump. Then Laurenz instrumental 1937–41 at energy 61 against target 75: it is a beautiful tanda but it is not a "peak" tanda, and it lands right after the Biagi vals, so the room deflates. D'Arienzo/Lamas 1942–43 recovers it (data note: the profile says Lamas 1945–48, the catalog dates these 1942–43; either the singer or the year tag is wrong, worth checking). **Floor reading:** two sits (after Biagi vals into Laurenz, and the odd cortina choice "Die With a Smile" before Di Sarli), otherwise the best hour of the set.

**23:05–00:05 (12–17).** This is where the set sags. Francini-Pontier/Berón milonga 1946–49 (69 vs 80), then Donato instrumental 1950–54 (55 vs 71: late Donato, nobody's favourite), then OTV instrumental 1937 (53 vs 70), then Di Sarli/Podestá vals 1942 (good, 67). Three consecutive tandas 15–17 points under the target in the middle of the "second build" is the exact pattern the benchmark calls "fast after slow with no bridge"; here it is the opposite, a 25-minute plateau of mid-30s/early-50s instrumental material at 23:20 when the floor is at its fullest. Pugliese instrumental 1953–54 at tanda 16 (73% of the night) is well placed and well chosen ("La rayuela", "Nueve de julio", "Seguíme si podés"), and Biagi/Amor 1944–46 after it is a legitimate peak. **Floor reading:** sit-down at 13–14, big return at 16–17.

**00:05–01:03 (18–22 + Cumparsita).** Canaro instrumental milonga 1935–37 at 66 vs 83 (fine tanda, wrong slot: it is a warm-up milonga), Caló/Carlos Barbé 1951–53 (obscure singer, 58 vs 71), De Angelis/Dante 1949–52 (fine), Lomuto/Díaz vals 1939–42 (Lomuto returns as the 21st of 22 tandas: the opener orchestra bookending the night with its weakest era, and the vals includes "Bajo el cielo azul" which most dancers know in the Di Sarli version). **Última tanda: Troilo instrumental 1953–55** ("A fuego lento", "Ojos negros", "Intermezzo", "El irresistible") at energy 55. This is concert Troilo; "A fuego lento" and "Intermezzo" are listening music. Announcing "última tanda" over this would empty the floor instead of filling it. Then D'Arienzo Cumparsita 1937 (the obscure one; most DJs play 1951 or 1943) from an orchestra that played once at 22:50. **Cortina mismatches:** WYS "Snowman" (lo-fi, e28) after the opener at 21:12 kills what little room energy exists; "Superstition" (e84) into a 63 Di Sarli; "Sing, Sing, Sing" three times, "Take Five" three times, Nujabes three times, no theme, no family. Dancers cannot learn the signal.

### Set B: 5 h, seed 21 (27 tandas, closes D'Arienzo 1937)

**21:00–22:00 (1–5).** Maderna/Dátila 1947–49 opener (delicate, obscure, exactly what you do *not* open with), Fresedo/Pacheco 1952–55 (lush 1950s Fresedo; pretty, slow), Canaro/Amor vals 1939–40 (good), Federico instrumental 1950–52 ("El látigo", "El marajá"; decent), OTV 1937 ("El amanecer", "Quinta edición"; good, finally). Same disease as set A: the warm-up is filled with 1947–55 lyrical tandas because the energy model maps "low energy" to "late era + lyrical", while a real warm-up is early-era *rhythmic*. **Floor:** sparse through 1–2, builds on the vals, sits on Federico, fills on OTV.

**22:00–23:05 (6–11).** Demare/Berón milonga 1943 ("Ropa blanca", "Carnavalito": lovely), Troilo/Fiorentino 1941–42 ("Toda mi vida", "Te aconsejo que me olvides", "Mi castigo"): this is a real tanda and the room knows every bar. De Angelis/Dante 1945–47, Tanturi/Campos vals 1943–45 ("Añoranzas", "Me besó y se fue": excellent), Varela instrumental 1955 (60 vs 69, a small sag, acceptable), Di Sarli/Serpa 1952. Good hour.

**23:05–00:05 (12–16).** D'Arienzo/Echagüe milonga 1944–46 ("Chaparrón", "Yo me llamo Eloy Peralta") at 93: the floor goes wild, correct timing for a first climax at 38%. Then Biagi/Hugo Duval 1951–54 (late Biagi, lesser-known singer) and Caló/Arrieta 1945–48 at 60 vs 75: after the D'Arienzo milonga and Biagi, Caló/Arrieta is a drop into the lyrical basement without a bridge. Troilo/Ruiz vals 1945–47 ("Flor de lino", "Romance de barrio", "Llorarás, llorarás") is one of the best vals tandas any DJ can play. **Floor:** peak at 12, sit at 14, full again on 15.

**00:05–01:05 (17–22).** Rodríguez/Moreno 1945–46 (fine), Laurenz/Alfredo del Río 1952–53 (obscure late Laurenz), Canaro/Roldán milonga 1943–44 at 61 vs 76 (soft milonga at a "build" point), then the best stretch of all four sets: Pugliese instrumental 1948–52 ("Patético", "El embrollo", "Don Atilio", "N.N.") → D'Arienzo instrumental 1951–54 ("Yapeyú", "El Marne", "El puntazo", "El internado") → Biagi instrumental vals 1941. That is a marathon-quality 35 minutes and it is placed at 70–78% of the night, where it belongs. **Floor:** full, happy, sweaty.

**01:05–01:58 (23–27 + Cumparsita).** Di Sarli/Pomar 1952–55, De Angelis instrumental 1946–47 ("El taladro", "Pinche", "El entrerriano"; good cooldown), Francini-Pontier/Berón milonga (the same three-title tanda as set A), Troilo instrumental 1953–54 ("Contrabajeando", "Triunfal", "Responso", "El monito"): concert Troilo again, the room thins. D'Agostino/Tino García 1952–54 (not Vargas; nobody came for Tino García). **Última tanda: Lomuto/Díaz VALS 1939–42** (the same tanda as set A's 21st). Ending a 5-hour milonga on a vals, and a Lomuto vals, then a D'Arienzo Cumparsita: no milonguero would do this; the última is announced, it is the emotional close, it is tango, and it is Di Sarli/Rufino, Troilo/Fiorentino, Pugliese/Chanel or D'Arienzo/Echagüe. **Cortinas:** "Die With a Smile" three times in a row at 24–26, "Feeling Good" three times, "Blue Monday" three times.

### Set C: 2 h, seed 8 (11 tandas, closes D'Arienzo 1937)

A 2-hour set is a práctica or an encuentro slot: the benchmark says stay high throughout with one special last tanda. TDJ instead runs a miniature two-peak milonga arc with a warm-up and a cool-down, which wastes 40% of a 2-hour slot.

**20:00–21:00 (1–5).** D'Agostino/Rubén Cané 1953 opener (late D'Agostino without Vargas: no), Firpo instrumental 1936–39 (fine, sparse-floor material), Rodríguez/Flores vals 1937–39 (73 vs 57, good jolt), D'Arienzo instrumental 1945–49 at 80 vs 65 at 36% of a 2-hour set: the hardest tanda of the night at 20:36, then Troilo/Casal 1950–54 at 64: the room, having been thrown up to D'Arienzo 1949, sits down on "Buenos Aires" and "Ventanita de arrabal".

**21:00–22:05 (6–11 + Cumparsita).** Di Sarli/Rufino milonga 1940–42 ("Zorzal", "Milonga del sentimiento"), De Angelis/Floreal Ruiz 1943–44, Laurenz/del Río 1952–53 (identical to set B tanda 17), Tanturi/Castillo vals 1941–43 ("Recuerdo", "La serenata (mi amor)": excellent), Pugliese instrumental 1948–52 (identical to set B tanda 19) labelled "cooldown" at 90%, then **última: Canaro/Arenas 1950–52** ("Che bandoneón", "Pagá vos, después arreglamos", "Cuna de fango", "Reliquias brasileñas – 2a. parte", three of four shared with set A tanda 2) at energy 45 before the Cumparsita. After Pugliese the room wants the climax tanda; it gets late Canaro and a medley fragment. **Floor:** Tanturi vals and Pugliese full; last tanda half-empty; people put their shoes on during "Reliquias brasileñas".

### Set D: 6 h marathon plateau, seed 4 (33 tandas, closes D'Arienzo 1937)

The "marathon-plateau" arc asks for target 81 from 30% to 90% of the night. The engine cannot supply it: after the gap rules exclude the four or five orchestras that *can* deliver 80, it fills plateau slots with whatever is left, which is mostly 1935–40 Canaro/Donato/OTV and tier-2 lyrical orchestras, all 15–22 points under target. The result reads like a well-meaning 6-hour festival milonga, not a marathon slot (which would be 3–4 h per DJ anyway; see UX notes on multi-DJ handover).

**22:00–23:00 (1–5).** Fresedo/Pacheco 1952–55 opener ("Vida mía" in the 1952 Pacheco version, not the 1933 Ray one everybody knows), Francini-Pontier/Florio 1954–55 at #2 (59 vs 48; late 50s at 22:12), OTV/Carmen del Moral vals 1940 (fine), Canaro/Famá 1939–40 ("Charlemos", "Olimpia"; this should have been the opener), De Angelis/Martel 1946–47. **Floor:** sits through 1–2, dances from 3.

**23:00–00:05 (6–11).** Caló/Berón milonga 1942 ("Milonga que peina canas", "Azabache", "Milonga antigua": perfect), Laurenz/Carlos Bermúdez 1944 (obscure singer), D'Arienzo/Roberto Lemos 1950–51 (very obscure D'Arienzo singer; "Todo varón", "Quisieran verme llorar"; the floor knows D'Arienzo but not these), Di Sarli/Rufino vals 1940–41 ("Alma mía", "Cortando camino", "Rosamel": first-class), Rodríguez/Moreno 1940–41 ("A media luz", "Como se pierde la vida": good), Biagi/Acuña 1943–44 ("Uno", "Tu voz"; the profile says Acuña 1947–50, another singer/year tag to check). Good hour apart from the two obscure-singer tandas.

**00:05–01:05 (12–16).** Troilo/Marino milonga 1943–46 (76 vs 87; "El barrio del tambor", "Ropa blanca", good), then the plateau collapses: Donato/Lagos 1935–39 at 62 vs 81, Tanturi/Campos 1943–45 at 70 (fine tanda, mid energy), Gobbi vals with the duet C. Heredia-H. Soler 1947–48 at 63 vs 83 (a vals tanda nobody can hum, at the marathon plateau), Canaro/Maida 1935–38 at 59 vs 81 ("Nada más", "De puro guapo": a *warm-up* tanda played at 1 a.m. at the supposed peak). **Floor:** steady loss from 13 to 16; the marathon dancers who paced themselves for this hour are sitting.

**01:05–02:05 (17–22).** Di Sarli/Podestá 1942 (63; fine), D'Arienzo instrumental milonga 1946–50 at 95 ("El potro", "La espuela", "La parrillada"; floor explodes), Biagi/Falgás 1939–40 ("Dejá el mundo como está", "Cicatrices"; yes), Pugliese/Juan Carlos Cobos 1953–54 (obscure Pugliese singer; "Milonguera", "Picaneao"; the room expects Morán or Maciel or instrumentals), Tanturi/Castillo vals 1941–43 (great), Varela instrumental 1952–54 (64 vs 81; "Champagne tango", "La payanca": fine but not plateau). Best hour.

**02:05–03:05 (23–27).** Troilo instrumental 1943–44 ("Quejas de bandoneón", "Inspiración", "Pablo": very good), Demare/Berón milonga 1943, D'Arienzo/Mauré 1941–44 ("Lilian", "Y se van los años"; check: "El retobao" and "Nunca más" do not look like Mauré titles), Biagi/Ortiz 1940–42 ("Catorce primaveras", "Ahora no me conocés", "Guapo y varón", "La marcha nupcial": textbook), Federico/Armando Moreno vals 1952–55 (62; obscure late vals tanda in the cool-down slot). Solid.

**03:05–04:03 (28–33 + Cumparsita).** D'Agostino/Vargas 1940–43 ("Ninguna", "Me llaman tango", "Gorriones": the right cool-down tanda), Pugliese instrumental 1953–55 ("Chiqué", "Emancipación", "La rayuela", "Seguíme si podés") as the second Pugliese at 88%, then Canaro/Maida milonga 1935–36 right after Pugliese (after Pugliese you need a sophisticated vals or a Di Sarli, not a 1935 milonga), De Angelis/Dante-Larroca 1951–55, Gobbi/del Río 1954–55 ("Un tango para Chaplín" is not danced anywhere), and **última: Donato/Lagos VALS 1936–38** at 66 vs 46 target, then D'Arienzo Cumparsita 1937. Again a vals as última; again the lightest orchestra of the night as the goodbye. **Cortinas:** "Blue Monday" seven times in six hours, "Take Five" three, "Espresso" three; "Misirlou" (e90) before a 76 milonga works; "Die With a Smile" before a 69 Troilo does not.

### Cross-set observations a dancer who came to all four nights would make

- Identical tandas recur across seeds: Biagi instrumental vals 1941 (A9 = B21, same three titles), Lomuto/Díaz vals (A21 ≈ B27), Francini-Pontier/Berón milonga (A12 ≈ B24), Laurenz/del Río 1952–53 (B17 = C8, four identical titles), Pugliese 1948–52 (B19 = C10, four identical titles), Canaro/Arenas 1951–52 (A2 ≈ C11, three of four). This is benchmark tell #5 ("same vals bank every night") and it comes from `buildTanda` sorting candidates by distance to target energy with a deterministic title-hash jitter, so the "nearest four" are always the same four for a given orchestra/singer window.
- Every set ends with the same D'Arienzo 1937 Cumparsita regardless of how the night ended, and usually from an orchestra that played once, hours earlier.
- Every track is 170 s (vals 160, milonga 150 inside the engine, 170 in the exports). The "4.05 h" on screen is fiction; a real tanda of D'Arienzo 1951 instrumentals is 10 minutes, a tanda of Pugliese 1950s is 14.

---

## 2. Rubric scores (dj-benchmark.md §3) and the gap to a headline DJ

Scoring notes: C9 (BPM) and C12 (transfer tier) cannot be assessed from the catalog, which has no BPM, no duration, no label tier and no lossless flag. TDJ awards itself 70% and 50% "for free" on those; I award 3/5 and 2/8 (unknown is not "half good"; the exporters also write guessed `.mp3` filenames). H4 is scored 2/5 as "unknowable, source unknown".

| Criterion (pts) | A (4 h) | B (5 h) | C (2 h) | D (6 h) | Notes |
|---|---|---|---|---|---|
| C1 Tanda integrity (12) | 12 | 12 | 12 | 12 | Clean. Medleys/concert pieces are a separate problem (H1). |
| C2 Singer consistency (6) | 6 | 6 | 6 | 6 | Duets correctly treated as one. Raw strings like "C.dante-O.larroca" shown unformatted. |
| C3 Era tightness (8) | 8 | 8 | 8 | 8 | Numerically perfect; stylistic breaks not modelled (see tells). |
| C4 Sizes (5) | 5 | 5 | 5 | 5 | 4/3/3 throughout. |
| C5 Rhythm cycle (8) | 8 | 8 | 8 | 8 | TTVTTM to the letter. Never varied, never adjusted so the última is a tango. |
| C6 Orchestra spacing (8) | 6 | 6 | 8 | 4 | A: De Angelis tango at 8 and 20. B: Di Sarli tango 11 and 22. D: Canaro tango 4 and 16, Pugliese 20 and 29, Biagi ×3, D'Arienzo ×3, Canaro ×3. |
| C7 Variety (6) | 6 | 6 | 6 | 6 | 15/20/11/20 distinct orchestras. Meets the count, but by recycling tier-1 names; Lomuto 30s, Malerba, Racciatti, García, Lomuto/Omar, Donato 1939–41 colours are missing or misused. |
| C8 Title repeats (3) | 3 | 3 | 3 | 3 | Guard works within a set. |
| C9 Tempo (5) | 3 | 3 | 3 | 3 | No BPM data. |
| C10 Energy arc (10) | 5 | 5 | 4 | 3 | A: three consecutive −15 sags at 13–14 and 18–19, final three falling to an instrumental 55. B: sags at 14, 18, 22–23; final three falling into a vals. C: hardest tanda at 36%, última at 45. D: plateau under-shot by 15–22 points in seven tandas. |
| C11 Cortina discipline (5) | 2 | 2 | 2 | 2 | Lengths fine (45 s), but no theme/family; same clip 3–7 times; genre hops every tanda; lo-fi after the opener. |
| C12 Source/transfer (8) | 2 | 2 | 2 | 2 | No tier, no lossless, no duration check; albums are 2008 "Listado" compilations. |
| C13 Ending (4) | 2 | 2 | 3 | 2 | A: instrumental concert Troilo última. B, D: vals última. C: vocal but 45-energy late Canaro. Cumparsita present in all four. |
| C14 Duration fit (3) | 2 | 2 | 2 | 2 | Within target on paper, but with fake durations the fit is meaningless. |
| **Computable (91 → 70)** | 70 → **54** | 70 → **54** | 72 → **55** | 66 → **51** | |
| H1 Openers/closers (8) | 3 | 3 | 3 | 3 | Hits rarely first; obscure titles open tandas; medleys inside tandas. |
| H2 Flow inside tanda (6) | 3 | 3 | 3 | 3 | Energy differences inside a tanda are ±2 points of hash noise, so "rise-settle" is random. |
| H3 Transitions (6) | 2 | 3 | 2 | 2 | Biagi vals → Laurenz instr (A); D'Arienzo milonga + Biagi → Caló/Arrieta (B); Pugliese → Canaro/Arenas 1952 (C); Pugliese → Canaro 1935 milonga, Gobbi vals at the plateau (D). B's Pugliese → D'Arienzo instr → Biagi vals is the one genuinely great run. |
| H4 Transfer sound (5) | 2 | 2 | 2 | 2 | Unknown. |
| H5 Fit to room (5) | 2 | 2 | 2 | 2 | 1950s warm-ups, vals últimas, 2-h set with a full milonga arc, 6-h "marathon" that is really a festival milonga. |
| **Total /100** | **66** | **67** | **65** | **63** | TDJ self-reports 89 / 91 / 89 / 89. |

**Why the self-score is 25 points too high.** `score.ts` is calibrated to pass its own generator: C6 uses the same 6-tanda window as the generator's default gap (so it can never fail), C7's target is `hours × 3.5` (rubric: ≥5 per hour), C9 gives 0.7 with no data, C12 gives 0.5 baseline plus points for a Spotify URI (none exist in the catalog), C11 only penalises cortinas longer than 90 s (never the lack of a theme, repeats, or genre hopping), C13 does not fail a vals/milonga/instrumental última, C10 only checks Pugliese-before-midpoint, not sag runs or the shape of the last three tandas. The verdict label "Headline marathon DJ" on every output is the single most damaging thing in the product for credibility with pros; a pro will laugh and close the tab.

**Against the public benchmarks (§1.2 of the research).** Structurally TDJ already beats the Spotify editorial "Tangos y Milongas" anti-benchmark (no tandas) and is on a par with the Thoma Leipzig / tango.uk.com 4-hour lists in cycle discipline and orchestra purity. It is behind them in exactly the things a human list has for free: the openers are the hits (Thoma opens tandas with "Poema", "El flete", "Bahía blanca"), the cortina is one artist all night, the última is Di Sarli or Pugliese vocal, and the hour-one orchestras are Canaro/Maida, D'Agostino/Vargas, Rodríguez/Moreno, Donato/Lagos.

**What still separates TDJ from a headline DJ (Orlando, Gehberger, Lavocah, Chatzipetros, Brodesser).**

1. **The hit.** A headline DJ knows the 400 recordings that make a floor stand up and places one as the first track of every tanda. TDJ has 20 hard-coded `TRACK_ENERGY` entries and a weak `selection` flag; otherwise every Di Sarli/Rufino is interchangeable with every other. This is 50% of the gap.
2. **Real time.** The clock, the backward plan from the última, the 14-minute Pugliese tanda vs the 10-minute D'Arienzo: without per-recording durations nothing about the arc is real.
3. **Era colour, not era number.** Warm-up = 1935–41 rhythmic (Canaro/Maida, Lomuto/Omar, OTV, Donato, D'Agostino, Rodríguez), peak = 1940–46 D'Arienzo/Biagi/Tanturi/Troilo-Fiorentino, late = Pugliese/Di Sarli 50s/Troilo 40s vocals. TDJ's energy model inverts this (1950s lyrical = low energy = warm-up; 1935 Canaro = mid = plateau).
4. **The ending as a composed object.** Última tanda + Cumparsita version chosen to match (D'Arienzo 1951 after a rhythmic end, Di Sarli 1955 or Troilo 1943 after an intimate end, Pugliese after Pugliese).
5. **Cortina as a signal, not as a mood-match.** One family all night; the room learns it in two cycles.
6. **Transfer discipline.** TangoTunes/CTA vs 2008 compilation rips: the product cannot see this at all.
7. **Floor reading.** Nothing in the product changes after 21:00.

---

## 3. Machine-made tells and how to fix each

| # | Tell (what a reviewer spots in 30 s) | Where it comes from | Fix |
|---|---|---|---|
| 1 | Every track 170/160/150 s; exports write `170` for every tango *and* every vals. | `DEFAULT_TRACK_SEC`, no `durationSec` in `songs.json`, `flatten()` default 170 for all kinds. | Import reference durations from El Recodo / tango.info, or from the DJ's local files on first scan. Until then, show durations as "≈" and never show "4.05 h" to two decimals. Per-orchestra/era defaults at minimum (D'Arienzo 1951 ≈ 150 s, Pugliese 1950s ≈ 200 s). |
| 2 | Same Cumparsita (D'Arienzo 1937) on every night, by an orchestra that may not have played. | `compose.ts` `pref` list + `.find(s => s.orchestraId !== lastOrch)`. | Cumparsita bank of 6–8 (D'Arienzo 1951, 1943; Di Sarli 1955; Troilo 1943; Pugliese 1959; Canaro 1951; Rodríguez) chosen by *ending mood* (energy/vocal of última) and preferring an orchestra that played in the last 90 min. Expose the bank in the UI. |
| 3 | Identical vals/milonga/tango tandas across seeds (Biagi vals 1941, Laurenz/del Río, Pugliese 48–52, Francini-Pontier milonga). | `buildTanda` sorts by `|energy − target|` with deterministic `titleJitter`, then takes `need + 3` and shuffles: the same 4–7 titles every time for a given family. | Widen the candidate window (take top 2×need or all within ±8 energy), weight by a "played recently" memory across sessions (venue log), and add a per-title popularity/fame score so variety comes from choice, not from noise. |
| 4 | Medleys and concert pieces inside dance tandas: "Selección de valses", "Selección de temas de Francisco Canaro", "Reliquias brasileñas – 2a. parte", "Responso", "A fuego lento", "Intermezzo", "Contrabajeando", "Un tango para Chaplín", "Patético". | No "danceable" flag; catalog is a discography, not a DJ library. | Regex blacklist at load (`selecci[oó]n`, `parte`, `popurr[ií]`, `fantas[ií]a`, `(instrumental)` concert titles), plus a per-orchestra "post-1948 Troilo instrumentals are concert unless whitelisted" rule, plus a curated `danceable: false` list in `data/knowledge`. |
| 5 | 1950s lyrical warm-ups (Fresedo/Pacheco, Lomuto/Rivera 1950, Canaro/Arenas 1952, Francini-Pontier 1955, Maderna) and 1930s rhythm at the peak (Canaro/Maida 1935, Donato/Lagos 1935, OTV 1937 at 70–81 targets). | `songEnergy` = orchestra baseline + era shift + rhythm + jitter; `phase` weights are coarse; nothing says "warm-up prefers 1935–41 rhythmic". | Replace single "energy" with two axes: *drive* (rhythmic ↔ lyrical) and *weight* (simple ↔ dramatic). Warm-up = high drive, low weight; peak = high drive, mid weight; cool-down = low drive, high weight. Add `preferredPhaseByEra` to profiles (Canaro/Maida → warm-up only; Fresedo 1950s → cool-down only; Troilo 1950s instrumentals → never). |
| 6 | Obscure singers in prime slots: D'Arienzo/Lemos, D'Arienzo/Lamas, Pugliese/Cobos, Biagi/Duval, Caló/Barbé, D'Agostino/Cané and /Tino García, Laurenz/Bermúdez, Fresedo/Pacheco. | `families()` treats every orchestra+singer pair as equal; the profile's `singers` map only applies a −2 energy for out-of-range years. | Singer weight per orchestra (canonical 1.0: Echagüe, Mauré, Rufino, Podestá, Fiorentino, Castillo, Campos, Vargas, Moreno, Chanel, Morán, Ortiz, Amor; secondary 0.4; others 0.1) and a hard rule: tier-1 orchestra with non-canonical singer never in `peak` or `close`. |
| 7 | Vals as última tanda (B, D); instrumental concert Troilo as última (A); late Canaro at 45 as última (C). | `planSlots` stops wherever the cycle lands; `phase: "close"` has no selection rules. | Force the last slot to tango; select última from a shortlist (vocal, tier-1, energy ≥ 65 *or* a designated "intimate" set: Di Sarli/Rufino, Di Sarli/Durán, Troilo/Fiorentino, Pugliese/Chanel, D'Arienzo/Echagüe, Calo/Berón). Allow the DJ to pin it first and plan backward. |
| 8 | Cortina genre hopping; same clip 3–7 times; lo-fi after the opener; "Die With a Smile" ×3 consecutive. | `pickCortina` matches cortina energy to *next tanda energy* independently per tanda; pool of ~48; "used" reset allows reuse at ≥4 fresh. | Default mode "one family per night" (artist or genre chosen once, 8–12 clips, never repeat until exhausted), optional "one family per cycle". Drop energy-matching as the primary criterion; keep it as a tie-breaker within the family. Add `startSec`/fade metadata and enforce it in exports. |
| 9 | Perfect, unvarying TTVTTM for 33 tandas; V/M never shifted to keep the última a tango. | `patternString` cycles forever. | Allow the planner to insert one extra T in the last cycle (TTVTTTM) or drop the last M so the night ends on T; let regional presets choose TTVTM for short sets. |
| 10 | Uniform orchestra rotation: tier-1 orchestras ×3 while tier-2 colour (Lomuto/Omar 1936–41, Malerba/Medina, Racciatti, García, Demare/Miranda, De Angelis valses) is absent or misplaced. | `weight()` multiplies tier-1 by 1.5 and ×1.8 on first appearance; tier-2 at 1.0, tier-3 at 0.35; gap rule only 6. | Big-four spacing ≥ 9–10 tandas (90–120 min), tier-2 "colour" quota of 1 per cycle, and hard cap of 2 appearances per orchestra in ≤ 5 h. |
| 11 | Year spans ≤ 4 but crossing stylistic breaks: Troilo 1950–52 with "Chiqué" and "Responso"; D'Arienzo 1945–49 instrumental tanda (post-Mauré, pre-1950s, mixed); Biagi/Amor 1944–46 fine but Biagi/Duval 1951–54 is a different orchestra. | Only `maxYearSpread` is enforced. | Per-orchestra `periods` table in profiles (D'Arienzo: 1935–39 / 1940–44 / 1945–49 / 1950–57; Troilo: 1938–44 / 1945–48 / 1949–55; Di Sarli: 1939–43 / 1944–48 / 1951–55 / 1956–58) and never cross a period inside a tanda. |
| 12 | Energy inside a tanda is hash noise (±2), so track order is meaningless; the "hit" is never first. | `titleJitter`, no fame signal. | Fame/popularity per recording (El Recodo play counts, Spotify popularity where resolvable, community tanda data) and opener rule: slot 1 = highest fame, slot 4 = highest energy or second-highest fame. |
| 13 | Raw source strings: "C.dante-O.larroca", `Roberto"chato"flores`, "Chiqué(el Elegante)", "N.n.", "El Once(a Divertirse)". | Catalog ingestion without normalisation; `singerId` not canonical (215 compound singer strings). | Normalise singer names (canonical ids, duet detection "A-B" → two canonical singers), title display casing, strip parenthetical subtitle into a `subtitle` field. |
| 14 | Duplicate recordings as separate tracks (D'Arienzo 1937 Cumparsita appears from "VOL.IV" and "(1935-39)"; Troilo "Pájaro ciego" 1941 ×3). | Discography rows per compilation. | Dedupe on orchestra+title+date (±1 day) and keep an `alternates[]` list; prefer the best-tier source. |
| 15 | Self-score 89–91 "Headline marathon DJ" on every output. | `score.ts` calibration (see §2). | Re-calibrate to the rubric (C7 ≥ 5/h, C11 theme + repeats, C13 vals/instr última fails, C10 sag-run and last-three-shape penalties, C12/C9 = 0 when unknown), show "unscored" factors as unscored, and never show the grade label until H-criteria are entered by a human. |
| 16 | A 2-h set with a full warm-up/peak/cool-down arc; a 6-h "marathon plateau" with a 1950s Fresedo opener and no re-ramp logic. | One arc family for all event types. | Event-type presets: práctica/encuentro slot (high from tanda 1, one special última), milonga 4–5 h (two peaks), festival (show slot + re-ramp), marathon slot 3–4 h (plateau, hand-over from previous DJ's log). |
| 17 | Every cortina exactly 45 s, `startSec` empty, no fade. | `lengthSec: o.cortinaLengthSec` overwrites. | Keep per-cortina cue-in and natural length; export in/out points (Rekordbox hot cue / Traktor cue) or a trimmed file. |

---

## 4. UX from the DJ booth

What the screens do today (from the screenshots and components): a composer form (length, era, arc, tanda shape, cortina mode/culture/length, Cumparsita toggle), a result header with vanity score and energy curve, a 2-column grid of tanda cards with per-card **lock** and **swap**, an export sheet with eight download buttons and a Spotify push, a library search table, and a settings page (Spotify, Anthropic key, region chips, appearance). Mobile has a bottom tab bar.

**What a working DJ needs at 23:40 with a full floor and the next tanda in 90 seconds, and does not have:**

1. **Locking is cosmetic.** `lock()` in `Composer.tsx` only flips a client flag that disables the swap button; "Compose the night" posts `options` only (`/api/compose` takes no playlist), so locked tandas are discarded on every recompose. `swapTanda` keeps the others but ignores `locked` semantics entirely (position lock vs content lock vs orchestra lock). **Proposal:** the compose request carries `{options, locked: Tanda[]}`; the planner reserves locked slots, fills around them, and respects their orchestra/singer in the gap rules. Three lock modes on the card's lock menu: *lock tanda*, *lock position only* (keep rhythm/slot, allow re-roll), *lock orchestra* (re-roll songs). Locked cards get a solid border and a small padlock in the energy curve.

2. **No track-level swap.** The swap button re-rolls a whole tanda with a different orchestra (`.filter(c => c.orchestraId !== t.orchestraId)`). The benchmark's #2 MUST is "swap one track in 2 seconds with candidates filtered by same orchestra/singer/era". **Proposal:** click a track row → right-hand drawer "Replace track 3" listing 10 candidates (same orchestra, same singer or instrumental, same period, not yet played tonight), each with year, duration, fame dots, and a one-tap replace; keyboard ↑↓ Enter. Also "swap orchestra, keep slot" (current behaviour) and "re-roll songs, keep orchestra".

3. **No clock.** The product thinks in fractions (0..1). DJs think in wall-clock: start 21:00, show 23:30, última 02:50, Cumparsita 03:00. **Proposal:** a *Timeline* strip above the cards: horizontal, tandas as blocks sized by real duration, coloured by rhythm, cortinas as thin gaps, clock labels every 30 min, draggable anchors (Start, Show/Break, Birthday vals, Última, End). Plan backward from End: moving the End anchor compresses by dropping whole tandas, keeping the arc. Each tanda card shows "23:42–23:54" instead of "#12 · build".

4. **No booth mode / now-playing.** At 2 a.m. the glass-blur, 11-pt grey text and pink-on-purple energy bars are unreadable from a standing position. **Proposal:** a "Booth" view: black background, no transparency, 28-pt orchestra/singer/years of the current tanda, the four titles, the cortina that follows, "next: VALS Di Sarli/Rufino 1940–41", countdown to última, and three big buttons: *More energy*, *Calmer*, *Simpler rhythm* that re-plan only unplayed, unlocked tandas (benchmark SHOULD #20). Also a "Mark as played" that advances the pointer so the log is real.

5. **No request handling.** **Proposal:** a *Requests* drawer: type an orchestra/title; TDJ shows "next legal slot: tanda 17 (tango, 00:52), replaces De Angelis/Dante; gap rules OK; title not yet played". Named specials: *Vals de cumpleaños* (pick from a bank, pin at a clock time), *Chacarera/folklore break*, *Show slot* (silence block with re-ramp tanda after it), *Two-Cumparsita ending*.

6. **No print view.** Organisers and the next DJ want paper. **Proposal:** `/print` route: A4, black on white, one line per tanda: clock · rhythm · orchestra / singer · years · 4 titles · cortina; cortinas as grey rows; última and Cumparsita in bold; footer with total time and orchestra count; a second page "orchestra heat-map" (which orchestra at which hour). Also a "what I played" export for marathon hand-over (benchmark COULD #34).

7. **Violations instead of a score.** Replace the 90/100 headline with a *findings* list: "Tanda 13–14: 17 points under target (floor sag)", "Última is a vals", "Lomuto returns at 21 after opening", "Medley inside tanda 2", each with a one-tap fix. Keep the numeric score inside the "Benchmark breakdown" disclosure, and show H-criteria as empty fields the DJ can fill after the night.

8. **Energy curve.** Dots are unlabeled (hover tooltip only); there is no orchestra name on the x-axis, no clock, no sag highlighting. **Proposal:** label each dot with a 3-letter orchestra code (DAR, DIS, TRO, PUG…), shade the area between target and actual when the gap exceeds 10, and draw the big-four spacing as ticks under the axis.

9. **Library page** is read-only. **Proposal:** each row gets "Build tanda from here" (seeds a family: same orchestra, singer, ±2 years) and "Insert into set at next legal slot"; filters for rhythm, singer, year range, "danceable only", "played in last 30 days at this venue".

10. **Region chips do nothing.** `settings.region` is stored and never read by `compose()`. Either wire it to a real preset (cycle, sizes, cortina length and cultures, era centre, Cumparsita count, from §2.4 of the benchmark) and show a one-line summary of what it changed, or remove it.

11. **Export sheet** offers eight equal buttons with no explanation and makes Spotify the primary action. Pros play local lossless; Spotify is for sharing a preview. **Proposal:** step 1 "Where is your music?" (folder picker / drag a folder; TDJ fuzzy-matches titles to files and reports unmatched), step 2 formats grouped by app (Rekordbox, Traktor, Mixxx/VLC, spreadsheet/print), Spotify as a secondary "share a preview" link.

12. **Mobile.** The fixed bottom tab bar overlaps the last rows of every card (screens 09/10 show titles under the bar); cortina lines truncate the artist; cards are 100% width so the energy bars are meaningless. Add `padding-bottom: calc(safe-area + 72px)` to the list, move the lock/swap buttons into a long-press sheet, and give the cortina its own line.

13. **Light theme** (screenshot 07) is fine for the sofa, not for the booth; booth mode should force dark and reduce transparency (the setting exists; make it a one-tap toggle in the header).

---

## 5. Cortina verdicts per culture (built-in pool in `packages/core/src/cortinas.ts`)

General: energies are plausible, lengths all 45 s with no cue-in (`startSec` never set), and the "matched to next tanda" mode defeats the purpose of a cortina (a *constant signal*). Per culture:

**Global (swing/jazz/crooner/rock/synth/lo-fi).** "Sing, Sing, Sing" (intro only, fine), "In the Mood" (cliché but universally understood as "clear the floor"), "Take Five" (the encuentro standard, keep), "Superstition", "Misirlou", "Twist and Shout", "Blue Monday", "Take On Me" (all good, all non-danceable for tango people). **Problems:** "Fly Me to the Moon" is a ballad with a lyric people sing along to and, in the US, a slow-fox people *will* dance; "Walk on the Wild Side" is fine musically but the lyric is loud in a quiet room; "Feeling Good" is fine. The two lo-fi tracks (WYS "Snowman", Nujabes) are correct for 04:00–07:00 marathon slots and wrong at 21:12 after the first tanda; tag them `tags:["late-night"]` and let the picker respect time of night. "Die With a Smile" is a slow pop ballad duet, dead between tandas; drop. "Espresso" and "APT." are fine as 2024–26 winks.

**Latin.** "Mambo No. 5" (Pérez Prado): in BA, Spain, Italy and any Latin-heavy room people will mambo; also everybody hears Lou Bega. Drop or tag `danceable-risk`. "Quizás, quizás, quizás" and "Bésame mucho": boleros are danced at milongas in BA and the Mediterranean; both are *wrong* as cortinas. "La pollera colorá" and "Cumbia sobre el río": in BA cumbia is a *full-song dance break*, not a cortina; in Europe fine. Keep both but tag `culture:"latin", tags:["dance-break-in-ba"]`.

**French.** "La vie en rose" (slow, every dancer hums it, acceptable once a night), "Ne me quitte pas" (a 30-energy dirge; a cortina should never make the room sadder than the tanda). Replace with Trenet "Boum!", Gainsbourg "Le poinçonneur des Lilas", Bardot "Moi je joue", Piaf "Padam padam", Zaz "Je veux".

**Italian.** "Volare" and "Tu vuò fà l'americano": both correct, both loved in Europe. Thin: add Celentano, Mina, Buscaglione, Rita Pavone so "Italian 60s all night" is possible (the encuentro fashion).

**Brazilian.** "Mas que nada" (good), "Garota de Ipanema" (slow bossa; in Lisbon/São Paulo someone will dance it; acceptable elsewhere). Add Jorge Ben, Marcos Valle, Elis Regina for a theme night.

**Turkish.** Tarkan "Şımarık": the canonical Istanbul cortina, keep (expect clapping). Mor ve Ötesi "Cambaz": real, Istanbul 2004 anthem, good. Sezen Aksu "Ah bu şarkıların gözü kör olsun": real and loved, but a melancholic ballad; tag low energy and use late. Safiye Ayla "Üsküdar'a gider iken" (Kâtibim): a 1940s classical recording; Istanbul dancers will read it as tourist kitsch; replace with Zeki Müren or Ajda Pekkan. Mabel Matiz "Bir günah gibi": verify the title (the benchmark lists "Gel"; "Öyle kolaysa" and "Sarmaşık" are the floor-known ones). **"Mezdeke-style Oriental" by "Mezdeke" is not a recording; it is a placeholder, and oriental/belly-dance music at an Istanbul milonga is a joke only a foreigner would make. Delete.** Missing: Barış Manço, Ajda Pekkan, Sertab Erener, Edis, Cem Karaca, Erol Evgin, MFÖ, Athena, Duman, Teoman.

**Greek.** "Zorba" (Theodorakis): the tourist cliché; Athens dancers roll their eyes, and if you let it run into the accelerando people will sirtaki. Intro only, once, or drop. "Misirlou (rebetiko)" attributed to "Dalgas": the attribution is doubtful (the known early recordings are Patrinos 1930 / Demetriades 1927) and the pool already has Dick Dale's "Misirlou", so the same tune is in the pool twice. Replace. Vamvakaris "Frangosyriani": one of the most loved Greek songs, but it is a hasapiko and Greeks *will* dance it in a circle; fine in Berlin, dangerous in Thessaloniki. Add Alexiou "Dirlada", Dalaras "Ola kala", Marinella, Foureira "Fuego", Rouvas "Shake it".

**Persian.** Hayedeh "Gole sangam": beloved, slow, nostalgic; works late, not early. Mohammad Nouri "Dokhtar shirazi": doubtful attribution ("Dokhtar-e Shirazi" is a folk song; Nouri's hit is "Jan-e Maryam"). Googoosh "Jadeh": real, good. Caveat for all Persian pop: 6/8 Persian pop is *very* danceable for Iranian dancers (they will "baba karam" to it), so a Persian-themed night should prefer slower songs or diaspora pop that reads as Western (Arash). Add Googoosh "Man amadeam", Ebi "Kavir", Viguen "Mahtab", Sogand, Arash "Boro boro", Andy.

**Balkan.** Three of three are Bregović, two of them the big-fat-wedding clichés ("Mesečina", "Kalashnikov"); in Belgrade, Zagreb, Sofia or Skopje people will kolo to "Kalashnikov". "Ederlezi" is beautiful and slow and also a Roma hymn, play it with respect, not as a mood-match. Add Fanfare Ciocărlia "Asfalt tango", Boban Marković "Đelem đelem", Toše Proeski, Magnifico "Hir aj kam hir aj go", Bijelo Dugme, Zdravko Čolić, Dubioza Kolektiv.

**K-pop.** BTS "Dynamite", aespa "Supernova", ROSÉ & Bruno Mars "APT.": all correct, all non-danceable for tango people, Seoul-standard. Add NewJeans "Super Shy", IVE "I Am", (G)I-DLE "Queencard".

**Afrobeats.** "Essence", "Calm Down": correct, and the reason Afrobeats works as a cortina (it does not read as "dance this" to tango dancers) holds. Add Burna Boy "Last Last", Ayra Starr "Rush", Tems "Love Me JeJe".

**Arabic.** One song (Amr Diab) is not a culture. Add Nancy Ajram, Cheb Khaled "Aïcha", Fairuz (late-night), Elissa.

**Structural recommendations for the cortina engine.** (a) Default to *one family per night*, chosen from the selected cultures; (b) a family needs ≥ 8 clips so a 5-hour night never repeats; (c) per-clip `startSec` and a `fadeOutSec` field, enforced in exports; (d) `tags` for `late-night`, `danceable-risk`, `lyric-heavy`, `cliche`; (e) time-of-night awareness (no lo-fi before 70% of the night, no 90-energy brass before 30%); (f) the picker must never choose the same clip twice in a row.

### 30 additional cortinas (JSON, `Cortina` type from `packages/core/src/types.ts`)

```json
[
  { "id": "c-jz-basie-woodside", "title": "Jumpin' at the Woodside", "artist": "Count Basie", "genre": "swing", "culture": "global", "energy": 80, "year": 1938, "startSec": 0, "lengthSec": 40, "tags": ["instrumental", "theme:swing"] },
  { "id": "c-jz-prima-jump", "title": "Jump, Jive an' Wail", "artist": "Louis Prima", "genre": "swing", "culture": "global", "energy": 84, "year": 1956, "startSec": 0, "lengthSec": 40, "tags": ["theme:swing", "danceable-risk-us"] },
  { "id": "c-jz-simone-baby", "title": "My Baby Just Cares for Me", "artist": "Nina Simone", "genre": "jazz", "culture": "global", "energy": 58, "year": 1958, "startSec": 0, "lengthSec": 45, "tags": ["theme:nina-simone"] },
  { "id": "c-jz-baker-lost", "title": "Let's Get Lost", "artist": "Chet Baker", "genre": "jazz", "culture": "global", "energy": 40, "year": 1955, "startSec": 0, "lengthSec": 45, "tags": ["late-night", "theme:cool-jazz"] },
  { "id": "c-it-celentano-azzurro", "title": "Azzurro", "artist": "Adriano Celentano", "genre": "canzone", "culture": "italian", "language": "it", "energy": 60, "year": 1968, "startSec": 0, "lengthSec": 45, "tags": ["theme:italian-60s"] },
  { "id": "c-it-celentano-prisencolin", "title": "Prisencolinensinainciusol", "artist": "Adriano Celentano", "genre": "funk", "culture": "italian", "language": "it", "energy": 78, "year": 1972, "startSec": 12, "lengthSec": 40, "tags": ["theme:italian-60s"] },
  { "id": "c-it-mina-tintarella", "title": "Tintarella di luna", "artist": "Mina", "genre": "canzone", "culture": "italian", "language": "it", "energy": 64, "year": 1959, "startSec": 0, "lengthSec": 40, "tags": ["theme:italian-60s"] },
  { "id": "c-it-buscaglione-bambola", "title": "Che bambola", "artist": "Fred Buscaglione", "genre": "swing", "culture": "italian", "language": "it", "energy": 72, "year": 1956, "startSec": 0, "lengthSec": 40, "tags": ["theme:italian-60s"] },
  { "id": "c-fr-trenet-boum", "title": "Boum!", "artist": "Charles Trenet", "genre": "chanson", "culture": "french", "language": "fr", "energy": 66, "year": 1938, "startSec": 0, "lengthSec": 40, "tags": ["theme:chanson"] },
  { "id": "c-fr-gainsbourg-poinconneur", "title": "Le Poinçonneur des Lilas", "artist": "Serge Gainsbourg", "genre": "chanson", "culture": "french", "language": "fr", "energy": 62, "year": 1958, "startSec": 0, "lengthSec": 45, "tags": ["theme:chanson"] },
  { "id": "c-fr-bardot-moi-je-joue", "title": "Moi je joue", "artist": "Brigitte Bardot", "genre": "ye-ye", "culture": "french", "language": "fr", "energy": 68, "year": 1964, "startSec": 0, "lengthSec": 40, "tags": ["theme:chanson"] },
  { "id": "c-fr-piaf-padam", "title": "Padam, padam", "artist": "Édith Piaf", "genre": "chanson", "culture": "french", "language": "fr", "energy": 58, "year": 1951, "startSec": 0, "lengthSec": 45, "tags": ["theme:chanson"] },
  { "id": "c-tr-manco-daglar", "title": "Dağlar Dağlar", "artist": "Barış Manço", "genre": "anadolu-rock", "culture": "turkish", "language": "tr", "energy": 54, "year": 1970, "startSec": 0, "lengthSec": 45, "tags": ["theme:turkish-classics"] },
  { "id": "c-tr-pekkan-bambaska", "title": "Bambaşka Biri", "artist": "Ajda Pekkan", "genre": "turkish-pop", "culture": "turkish", "language": "tr", "energy": 70, "year": 1977, "startSec": 0, "lengthSec": 45, "tags": ["theme:turkish-classics"] },
  { "id": "c-tr-sertab-everyway", "title": "Everyway That I Can", "artist": "Sertab Erener", "genre": "turkish-pop", "culture": "turkish", "language": "en", "energy": 82, "year": 2003, "startSec": 0, "lengthSec": 40, "tags": ["theme:istanbul-pop", "danceable-risk"] },
  { "id": "c-tr-aksu-hadi-bakalim", "title": "Hadi Bakalım", "artist": "Sezen Aksu", "genre": "turkish-pop", "culture": "turkish", "language": "tr", "energy": 76, "year": 1991, "startSec": 0, "lengthSec": 45, "tags": ["theme:istanbul-pop"] },
  { "id": "c-tr-edis-roman", "title": "Roman", "artist": "Edis", "genre": "turkish-pop", "culture": "turkish", "language": "tr", "energy": 72, "year": 2017, "trend": true, "startSec": 0, "lengthSec": 40, "tags": ["theme:istanbul-pop"] },
  { "id": "c-gr-alexiou-dirlada", "title": "Dirlada", "artist": "Haris Alexiou", "genre": "laiko", "culture": "greek", "language": "el", "energy": 66, "year": 1990, "startSec": 0, "lengthSec": 45, "tags": ["theme:greek"] },
  { "id": "c-gr-dalaras-ola-kala", "title": "Ola Kala", "artist": "Giorgos Dalaras", "genre": "laiko", "culture": "greek", "language": "el", "energy": 60, "year": 1998, "startSec": 0, "lengthSec": 45, "tags": ["theme:greek"] },
  { "id": "c-gr-foureira-fuego", "title": "Fuego", "artist": "Eleni Foureira", "genre": "pop", "culture": "greek", "language": "en", "energy": 86, "year": 2018, "trend": true, "startSec": 0, "lengthSec": 40, "tags": ["theme:greek"] },
  { "id": "c-ir-googoosh-man-amadeam", "title": "Man Amadeam", "artist": "Googoosh", "genre": "persian-pop", "culture": "persian", "language": "fa", "energy": 62, "year": 1975, "startSec": 0, "lengthSec": 45, "tags": ["theme:persian"] },
  { "id": "c-ir-ebi-kavir", "title": "Kavir", "artist": "Ebi", "genre": "persian-pop", "culture": "persian", "language": "fa", "energy": 50, "year": 1996, "startSec": 0, "lengthSec": 45, "tags": ["theme:persian", "late-night"] },
  { "id": "c-ir-arash-boro-boro", "title": "Boro Boro", "artist": "Arash", "genre": "pop", "culture": "persian", "language": "fa", "energy": 84, "year": 2004, "startSec": 0, "lengthSec": 40, "tags": ["theme:persian", "danceable-risk"] },
  { "id": "c-bk-ciocarlia-asfalt", "title": "Asfalt Tango", "artist": "Fanfare Ciocărlia", "genre": "balkan-brass", "culture": "balkan", "energy": 90, "year": 1998, "startSec": 0, "lengthSec": 40, "tags": ["theme:balkan", "instrumental"] },
  { "id": "c-bk-markovic-djelem", "title": "Đelem Đelem", "artist": "Boban Marković Orkestar", "genre": "balkan-brass", "culture": "balkan", "energy": 56, "year": 2002, "startSec": 0, "lengthSec": 45, "tags": ["theme:balkan", "late-night"] },
  { "id": "c-bk-proeski-cija-si", "title": "Čija si", "artist": "Toše Proeski", "genre": "balkan-pop", "culture": "balkan", "language": "mk", "energy": 60, "year": 2002, "startSec": 0, "lengthSec": 45, "tags": ["theme:balkan"] },
  { "id": "c-kp-newjeans-super-shy", "title": "Super Shy", "artist": "NewJeans", "genre": "kpop", "culture": "kpop", "language": "ko", "energy": 78, "year": 2023, "trend": true, "startSec": 0, "lengthSec": 40, "tags": ["theme:kpop"] },
  { "id": "c-kp-ive-i-am", "title": "I Am", "artist": "IVE", "genre": "kpop", "culture": "kpop", "language": "ko", "energy": 80, "year": 2023, "trend": true, "startSec": 0, "lengthSec": 40, "tags": ["theme:kpop"] },
  { "id": "c-af-burna-last-last", "title": "Last Last", "artist": "Burna Boy", "genre": "afrobeats", "culture": "afrobeats", "energy": 66, "year": 2022, "trend": true, "startSec": 0, "lengthSec": 45, "tags": ["theme:afrobeats"] },
  { "id": "c-ba-soda-musica-ligera", "title": "De música ligera", "artist": "Soda Stereo", "genre": "rock-nacional", "culture": "latin", "language": "es", "energy": 80, "year": 1990, "startSec": 0, "lengthSec": 40, "tags": ["theme:rock-nacional", "ba-essential"] }
]
```

Two more that should replace existing entries rather than add: Khruangbin "Maria También" (`global`, `lo-fi`/`instrumental`, energy 48, late-night, as the modern encuentro "one-artist" choice) in place of WYS "Snowman"; and Gilda "No me arrepiento de este amor" (`latin`, `cumbia`, energy 70, `dance-break-in-ba`) in place of "La pollera colorá" for any BA preset.

---

## 6. Export verdict per DJ app

All files are well-formed (XML parsed cleanly) and the tanda structure survives into every format, which is more than most tools manage. The shared defect is that **no export knows where the music is**: every location is a guessed `"<Orchestra / Singer> - <Title>.mp3"`, and that string contains `/` whenever there is a singer, which is an illegal filename on every OS. So every DJ app imports 100 grey "missing" tracks. Durations are the 170-s placeholder everywhere.

| Format | Verdict | Specific problems | What would make it booth-ready |
|---|---|---|---|
| **M3U8** | Usable as a manifest, not as a playlist. | Relative paths with `/` in the filename; `#EXTINF:170` for every track including valses; no tanda grouping; cortinas marked `[CORTINA]` in the title (good). | Resolve to real local paths (folder scan + fuzzy match on orchestra/title/year); write `#EXTGRP:03 VALS Di Sarli/Rufino 1940–41` per tanda; real durations; UTF-8 BOM optional; a second "absolute paths" variant. |
| **Rekordbox XML** | Imports; structure is good; every track missing. | `Location="file://localhost/Francisco%20Lomuto%20%2F%20Alberto%20Rivera%20-%20Alma%20en%20Pena.mp3"` (encoded slash, file at drive root); `Genre="Tango tango"` (should be `Tango` / `Vals` / `Milonga` / `Cortina`); `TotalTime=170`; no `AverageBpm`, `DateAdded`, `SampleRate`, `BitRate`, `Size`, `Tonality`; a non-standard `Mix=` attribute; `Comments` carries "energy 41", which pollutes the DJ's library permanently. | Real `Location` from the local scan; one playlist folder per set with the per-tanda sub-playlists (already done, keep); `Comments` = "Tanda 03 · VALS · 1940–41" only; cortina cue-in as a `<POSITION_MARK Name="in" Type="0" Start="12.0"/>` and a memory cue at the 45-s out point. |
| **Traktor NML** | Close to correct; path model wrong; will show "!" on every entry. | `LOCATION DIR="/:TDJ/:"` with `VOLUME=""` (Traktor needs the volume name, e.g. `Macintosh HD` or `C:`); `FILE` contains `/`, which is Traktor's path separator (`/:`); `PRIMARYKEY KEY` must equal VOLUME+DIR+FILE; no `MODIFIED_DATE`/`MODIFIED_TIME`, which newer Traktor builds want; no `<CUE_V2>` for cortina in/out; `GENRE="Tango tango"`. | Real volume/dir/file triplets; `CUE_V2` for the cortina clip; a playlist folder per set with the per-tanda playlists as in Rekordbox. |
| **XSPF (VLC/Mixxx)** | Plays nothing (no `<location>` unless a Spotify URI exists, and none do). | Otherwise fine; `annotation` carries the tanda. | Add `<location>file:///…</location>` from the scan; Mixxx also reads `<extension>` for crates. |
| **CSV** | Good. Best current export. | `duration_sec` is placeholder; `album` exposes compilation names ("F.LOMUTO ÚLTIMAS 18"), which is honest but reveals the source quality; no clock column; cortinas have no in/out. | Add `clock_start`, `tanda_label`, `cortina_in_sec`, `cortina_out_sec`, `fame`, `source_tier`; one header row per tanda in a second "set-sheet" variant for printing. |
| **Serato CSV** | Not a Serato import format. Serato DJ Pro has no CSV *import*; the only ways in are crates (`.crate` binaries) or drag-and-drop. The label promises something the file cannot do. | — | Either write `.crate` files (binary, documented by the community, needs real paths) or relabel as "Serato-friendly track list (paste into a Smart Crate)". |
| **JSON** | Fine for round-tripping within TDJ. | Contains `energy`, `targetEnergy` etc. which is correct for TDJ's own use. | Version the schema. |
| **Set list (text)** | Good for a quick look. | No clock, energy numbers are noise for a reader, no cortina in/out. | Clock column, drop energy, mark última and Cumparsita, 80-column safe for a thermal printer. |

Missing formats a pro would ask for: **iTunes/Music XML** (many BA and US DJs still play from Music.app), **Mixxx crate**, **TangoTime Table / TandaBuilder** interchange (even a documented CSV), and a **PDF**.

---

## 7. Top 10 enhancements, ranked

**MUST (a pro will not use the product without these)**

1. **Real recordings, real times.** Local-library scan + fuzzy match to the catalog (orchestra/title/year), read actual durations and paths, write them into every export. Until matched, the clock, the arc and the exports are fiction. (Tells 1, exports table.)
2. **Fame/hit signal + opener/closer rules.** Per-recording popularity (El Recodo, community tandas, Spotify popularity where resolvable, curated "400 canon" list) and the rule "slot 1 = the one everyone knows". Also the `danceable:false` blacklist (medleys, concert pieces). (Tells 4, 12.)
3. **Phase-aware era/style model.** Replace the single energy scalar with drive/weight axes and per-orchestra period tables so warm-ups are 1935–41 rhythmic and peaks are 1940–46 D'Arienzo/Biagi/Tanturi/Troilo, never the reverse; canonical-singer weights. (Tells 5, 6, 11.)
4. **Última tanda + Cumparsita as composed objects.** Last slot always tango, chosen from a vocal/tier-1 shortlist (or a designated "intimate" set), Cumparsita bank matched to the ending; DJ can pin the última and plan backward. (Tell 2, 7.)
5. **Locking and track-level swap that actually work.** Locks survive recompose (server-side), three lock modes, click-a-track replacement drawer filtered by orchestra/singer/period. (UX 1, 2.)
6. **Clock timeline.** Wall-clock start/end, draggable anchors for show/birthday vals/última, backward planning, real durations on every card. (UX 3.)

**SHOULD**

7. **Cortina families.** One family per night (or per cycle) with ≥ 8 clips, cue-in/fade metadata exported as cues, time-of-night tags, delete placeholder/cliché entries (Mezdeke, Zorba, boleros, Mambo No. 5), fix doubtful attributions (Dalgas, Nouri, Mabel Matiz title). (Tell 8, §5.)
8. **Honest scorer + findings panel.** Re-calibrate `score.ts` to the rubric, show unknowns as unknown, replace the "Headline marathon DJ" headline with a per-tanda findings list and one-tap fixes; add orchestra heat-map and sag shading to the curve. (Tell 15, UX 7, 8.)
9. **Booth mode with floor-feedback and requests.** Dark high-contrast now-playing, "mark as played", More energy / Calmer / Simpler that re-plan only unplayed unlocked tandas, requests drawer proposing the next legal slot, named specials (vals de cumpleaños, folklore break, show re-ramp, two Cumparsitas). (UX 4, 5.)

**COULD**

10. **Print/PDF set sheet and multi-DJ hand-over.** A4 set list with clock and cortinas, "what I played" export the next marathon DJ can import so orchestras and titles are not repeated across slots; venue memory ("last played here on …") feeding the variety weights. (UX 6, tell 3.)

Smaller items that fall out of the above: fix mobile bottom-bar overlap; wire or remove the Region chips; relabel the Serato export; normalise singer strings and title casing; dedupe duplicate recordings; vary the cycle so the night ends on a tango; cap tier-1 orchestras at two appearances in ≤ 5 h and give tier-2 colour a quota.

*End of review.*
