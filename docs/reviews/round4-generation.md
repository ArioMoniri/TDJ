# Round 4 — generation-quality audit (DJ panel)

*Panel: three working milonga DJs (Buenos Aires traditional, European marathon circuit, Istanbul). We read `docs/AGENT_GUIDE.md`, `docs/research/reference-corpus.md` §4, the earlier `dj-review.md` and `musician-review.md`, then `packages/core/src/{compose,tanda,arc,cortinas,score,rules,context,profiles}.ts`, and generated sets with the CLI and with `compose()` directly. Nothing under `packages/`, `apps/` or `data/` was edited; the only outputs are this file and `data/knowledge/review_patches_round4.json`.*

## 0. What we generated

| Set | Command / options | Tandas | Engine score |
|---|---|---|---|
| S1–S12 | `--hours=4 --seed=1..12` | 22 each | 73–82 "Solid regular milonga DJ" |
| H2 | `--hours=2 --seed=3` | 11 | 82 |
| H6 | `--hours=6 --seed=3` | 33 | 71 |
| PL | `--arc=marathon-plateau --hours=6 --seed=4` | 33 | 69 "Enthusiastic amateur" |
| PG | `--eras=post-golden --seed=5` | 21 | 66 |
| GV | `--eras=guardia-vieja --seed=5` | 29 | 49 "Spotify radio" |
| NU | `--eras=nuevo --seed=5` | 23 | 56 |
| ALL | `--eras=all --seed=9` | 21 | 75 |
| TR | `--cultures=turkish,greek --trend=trend --seed=7` | 22 | 79 |
| CTX | `compose()` seed 21 with contexts summer-heat, late-night marathon, beginner afternoon/práctica, Istanbul rain, Buenos Aires; rules `openWithCumparsita`, `cumparsitaCount:2`, `birthdayValsAt:0.6`, `showBreakAt:0.5`, `ultimaRule` ×4, `puglieseOnce:false`; eras golden-extended, contemporary; plus 6/8/10 h runs for caps | — | 59–78 |

Raw set lists: `/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/sets/*.txt`, `…/scratchpad/ctx-out.txt`; scripts `…/scratchpad/{ctx,div,pug}.ts`.

**Headline.** Compared with the sets reviewed in rounds 2–3, the engine has stopped making the gross errors (no medleys, no "Solo de Piano" tandas, no Lomuto-Rivera 1950 opener, no 33-slot night ending on a vals, Pugliese always after 60 %, Cumparsita versions now vary). The tanda hygiene is faultless. But a panel listening to twelve seeds hears **the same night twelve times**, with the same five structural weaknesses every time: (1) the first D'Arienzo comes at 43–76 % of the night and never as the 1935–39 instrumental tanda; (2) the última is a soft lyrical tanda at energy 56–63 because D'Arienzo, Pugliese, Biagi and Tanturi are phase-filtered out of the closing slot; (3) the third tanda of every night is the same obscure OTV / Carmen del Moral 1940 vals; (4) cortinas are a 21-track jukebox of swing, lo-fi, surf-rock, 2024 pop and New Order in every set; (5) track order inside a tanda ignores the opener/closer roles that the corpus already records. Our booth score for the 4-hour golden sets is **62–68/100** (engine: 73–82). The data files carry knowledge the engine never reads (`subPeriods`, `bestYears`, `singerShift`, `warmupOnly`, `singerDanceable`, `followWith`, `shareOfNightMax`, `difficulty`, `rhythmOverride`), and one field it reads wrongly (`maxPerNight` is an object, so the Pugliese cap is silently disabled).

---

## 1. Findings with evidence

### 1.1 Opener quality — acceptable, but four of twelve open on placeholder-dated or disguised-vocal tandas

- Openers over S1–S12: Fresedo/Ray 1935–39 ×4, Canaro/Maida 1935–38 ×3, Canaro "instrumental" 1935–38 ×2, Fresedo "instrumental" 1939–40 ×2, Fresedo/Serpa 1942–44 ×1. All corpus-approved orchestras (rule 13), vocal in 8/12. Good.
- **Canaro "instrumental" 1935–38 (S1 #1, S5 #1, and tanda 2 in S2, S3, S4, S7, S8, S12, H2, H6, PL):** *Hotel Victoria, La Maleva, No Cantes Ese Tango, Desencanto / Callecita de mi Novia / Olvídame*. The catalogue holds six 1935–38 Canaro rows flagged `vocal:false` that duplicate Maida vocals (`Hotel Victoria, Callecita de mi Novia, Suplicio, No Cantes Ese Tango, Desencanto, Olvídame`). On the floor this is a Maida tanda with the vocal flag off; it passes integrity by accident. (Catalogue hygiene, see patch notes.)
- **Fresedo "instrumental" 1939–40 (S2 #1, S3 #1, S5 #2, H2 #1, H6 #1):** *Por Calles Muertas, Volverás, Cafetín de Buenos Aires, Arrabalero* — all four rows are `yearApprox:true` decade placeholders ("1940"); *Cafetín de Buenos Aires* was written in 1948. The engine treats placeholder years as real and builds a "1939–1940" family out of them. Rule: never let `yearApprox` rows anchor a family's year window (and never let them count toward the "1935–43 warm-up" bonus).
- Fresedo/Pacheco 1952 as tanda 2 (S6, S10) and Fresedo/Serpa 1942–44 as tanda 1 (S4, PL): defensible, but a 1950s crooner Fresedo as the second tanda is not what rule 13 describes; the warm-up Fresedo is Ray 1933–39.
- Tanda 4 is Lomuto/Omar ×3, Donato/Lagos ×3, D'Agostino/Vargas ×3, OTV instr., Caló — all fine warm-up material. The warm-up itself (tandas 1–5) is the best part of these sets.

### 1.2 D'Arienzo placement — the corpus rule is not met in any seed

Corpus rule 9: first D'Arienzo tanda at median 19 % of the night, before 35 % in 22/30 sets, instrumental 1935–39 in 20/30. Rule 8: 2–3 D'Arienzo tango tandas per 4 h.

| Seed | First D'Arienzo tango tanda | D'Arienzo tandas (t = tango, v = vals, m = milonga) |
|---|---|---|
| S1 | #10 (0.43) Mauré 1941–43 | t10v, m18i |
| S2 | #11 (0.48) instr **1950–52** | t11i, m18i |
| S3 | #17 (0.76) instr 1950–54 | v9i, t17i |
| S4 | #17 (0.76) Echagüe 1938–39 | v9i, t17v |
| S5–S7, S10, S12 | #10 (0.43) | 1 tango tanda + 1 milonga |
| S8, S11 | #11 (0.48) instr 1945–48 / Echagüe | 1 tango + 1 milonga |
| S9 | #11 (0.48) Echagüe | **only one D'Arienzo tanda in the night** |
| H6 seeds 1 and 5 | — | **zero D'Arienzo tango tandas in a six-hour night** |

- Only 1 tango tanda in 10/12 four-hour sets (corpus 2–3); never a 1935–39 instrumental tanda although the catalogue has 72 such sides (*El flete, Hotel Victoria, Nueve de Julio, Don Juan, El choclo, Comme il faut, Ataniche, El cencerro…*). The first-D'Arienzo bonus in `tanda.ts` (`w *= early ? 3 : 1.2` when `position < 0.35`) is applied **after** the energy term `max(0.02, 1 − d/28)^3`; with 1935–39 instrumentals at e82–90 and warm-up/build targets at 44–63 the energy term is 0.02 and no bonus survives. The rule exists in the code but is arithmetically dead.
- When D'Arienzo does appear early it is as a vals (S3/S4 #9 instr 1935–37) or milonga, which is how the quota gets "spent".

### 1.3 Pugliese — correct position, but deterministic, and the cap is broken

- Pugliese is at **#16/22 (0.714) in all twelve seeds**, #23/33 (0.69) in all six 6-hour seeds. With `notBefore 0.6`, `phase:["peak"]` and the hard phase filter, slot 16 is the first eligible peak slot and the tier-1 × dramatic-in-peak weight makes it certain. Corpus median is 0.87 and Pugliese is the most common final tanda before La Cumparsita (7/30); here it never closes.
- The tandas themselves are good: Chanel 1944–46 (*Corrientes y Esmeralda, Rondando tu esquina, Fuimos, El sueño del pibe*), Morán 1951–54 (*La mentirosa, Desvelo, Pasional, De vuelta al bulín*), instr. 1948–49 (*Boedo, Patético, Malandraca, La yumba*), instr. 1953–55 (*La rayuela, La guitarrita, Chiqué, Emancipación*). *Mala junta* (1943) — the third most frequent tanda opener in the whole corpus — can never appear because `"mala junta"` is hard-coded in `BLACKLIST_TITLES` (`energy.ts`), as is `"cafe dominguez"` (D'Agostino 1955, corpus opener ×5). Both are title-level bans meant for 1960s concert versions.
- **Cap bug:** `data/knowledge/orchestra_profiles.json` has `maxPerNight: {"4":1,"6":2}`; `compose.ts:129` passes it through typed as `number`, and `tanda.ts:190` computes `base + (hours>8 ? 2 : …)` → the string `"[object Object]0"`; `count >= cap` is then always false, so Pugliese has **no cap at all**. Evidence: 8-hour runs put Pugliese at #31 and #37 of 44 with `puglieseOnce:true`; `ultimaRule:"pugliese"` produced Pugliese at #16 *and* #22 in a 4-hour night. It is only the `1/(1+1.8·times)` penalty that keeps 4-hour sets at one Pugliese.
- After Pugliese the engine puts Biagi or D'Arienzo (rhythmic, tier 1) in 12/12 seeds and then the milonga — a sound "release" and the one place where rule 15 is respected.

### 1.4 Última tanda and La Cumparsita

| Seed | Última | e | Cumparsita |
|---|---|---|---|
| S1, S3, S4, S6, S12, H6-4, PL | D'Agostino/Vargas 1941 or 1945 (*Caricias, A quién le puede importar, A pan y agua, No vendrá*) | 56–57 | De Angelis 1961, Troilo 1963, D'Arienzo 1951/1963 |
| S7, S8, S10, S11, S9 | De Angelis/Dante 1945–46 (*Para qué te quiero tanto, Con alma de tango, La brisa, Qué lindo es enamorarse*) / Larroca 1951–54 | 62–63 | Troilo 1943 ×2, Troilo **1952**, Troilo **1953**, Biagi 1942 |
| S2, S5, H6 | Troilo/Fiorentino 1941–43, Troilo/Marino 1944–46 | 63–64 | D'Arienzo 1943, Pugliese 1959, D'Arienzo 1963 |
| H2 | Di Sarli instr 1945–46 (*El caburé, El once, El ingeniero, Tinta verde*) | 62 | Canaro 1951 |

- The close slot target is 67 (+8 → 75 inside `compose.ts`), yet the delivered energy is 56–64 in 11/12 seeds. Cause: `phaseOk` in `tanda.ts` accepts an orchestra at `phase === "close"` only if its profile lists `cooldown` (or `any`). D'Arienzo (`build,peak,warmup`), Pugliese (`peak`), Biagi, Tanturi, Rodríguez, Laurenz are therefore excluded from the última whenever ≥3 lyrical orchestras are viable — which is always. `PHASE_STYLE.close` (rhythmic 1.4) is never reached by a rhythmic orchestra. Corpus rule 15: the final tanda is Pugliese (7), D'Arienzo (5), D'Agostino-Vargas (3), Di Sarli (3), De Angelis instr. (2). De Angelis **vocal** Dante 1945–46 as última (5/12) has no corpus support, and the D'Agostino tandas chosen skip *Tres esquinas / Café Domínguez / El yacaré / Ninguna* for *No vendrá* and *A quién le puede importar*.
- Cumparsita versions now vary by seed (good) but the weighting still lets non-existent versions through: Troilo "1952", "1953", "1951", "1938 Fiorentino" (CTX openWithCumparsita picked Troilo 1951 as the opening Cumparsita; beginner-afternoon closed on Troilo "1938"). Troilo recorded La Cumparsita in 1943 and 1963; the other rows are mis-dated transfers. D'Arienzo 1943 (S2) is likewise not a closing version anyone uses. The `yearHit ? 2.5 : 1` factor should be a hard filter when the corpus has `role:"cumparsita"` years for that orchestra.
- `cumparsitaCount: 2` appends `cat.songs.find(title && orchestra)` — the first row, whatever its year or singer: D'Agostino → **"La Cumparsita (1952) Tino García vocal"** appended to a Vargas 1945 tanda; Pugliese → **1970 Abel Córdoba vocal** appended to a Morán 1945–47 tanda (BA run). The corpus pairings are D'Agostino-Vargas 1945 and Pugliese 1959 instrumental.
- `ultimaRule: "d-arienzo-rhythmic"` produced D'Arienzo/**Mauré** 1941–44 *Lilian, Enamorado, El Olivo, Uno* — vocal, obscure titles. "Rhythmic D'Arienzo" at the end of a night is instrumental 1950s (*El puntazo, Yapeyú, Don Juan, Loca, La bruja*). Post-golden preset (PG #21) got D'Arienzo/Horacio Palma 1960–63 for the same rule.

### 1.5 Singer canon and obscure material in prime slots

Mostly canonical now: Rodríguez-Moreno, Donato-Lagos, Tanturi-Castillo/Campos, Caló-Berón/Iriarte, Troilo-Fiorentino, Biagi-Ortiz/Falgás/Amor/Ibáñez, D'Arienzo-Echagüe/Mauré, Di Sarli-Rufino/Podestá, Laurenz-Casas/Podestá, De Angelis Dante/Martel, Demare-Miranda/Berón. Remaining tells:

- **OTV / Carmen del Moral 1940 vals** (*El vals del ayer, Isabelita, Cuando no queda esperanza*): tanda 3 in **8 of 12 seeds** plus H6, TR, Istanbul, beginner. Fame 0 for all three titles; a female one-off vocalist nobody programmes. It wins because `VALS_BANK["orquesta-tipica-victor"]=8` is applied to an orchestra whose only golden-era vals families are 1940 female-vocal singles (the canonical OTV vals tanda, Vargas/Pomar/Morales 1937–40 *Sin rumbo fijo / Temo / Noches de invierno*, cannot be built: *Temo* is absent and the three sides are under three different singer ids). Also it takes *Isabelita* away from Rodríguez-Moreno for the rest of the night (title-repeat rule).
- Lomuto/Fernando Díaz valses (S8 #3, S10 #3, ALL #3, summer #3): obscure; Lomuto's vals bank is Omar.
- Tanturi / "O. Ribó – R. Videla" 1946–48 vals (S2 #15, Istanbul #15): a duet-credit pseudo-singer in a prime slot.
- Demare/Horacio Quintana 1944–45 (S3 #5, S6 #20, S9 #20, S10 #5, S12 #5, H6 #7): six placements of the least-known Demare singer, while Demare-Miranda appears twice. Caló/Carlos Dante **1935–36** (S3 #20) at 90 % of the night: pre-Berón Caló that no DJ plays. Caló/Arrieta 1945–48 (S11 #20).
- Laurenz/Alfredo del Río 1952–53 at the **peak** of PL (#17, target 81) and in the beginner set (#16); Gobbi/Maciel 1948–51 (H6 #32), Rotundo/Floreal Ruiz 1953 (beginner #26), Firpo/Alberto Diale 1939–43 (beginner #4) — all three were called out in round 3 and still appear because `bestYears`/`subPeriods` are not read.
- Troilo "instrumental 1943–46" *Inspiración, Chiqué, Pablo, Bienvenida* (S12 #14, S2 #13): the Troilo instrumentals DJs play are 1941 (*Cachirulo, Milongueando en el cuarenta, Guapeando, El tamango, C.T.V., Cordón de oro*), which the engine does find in S8 #19, S10 #19, PL #11 — those are excellent tandas.
- Biagi/Hugo Duval 1951–55 (S12 #19) at 86 %: real but late, soft Biagi in a peak slot.

### 1.6 Year coherence

- Every tanda respects the ≤4-year window; vocal tandas are ≤3 years in 85 % of cases. Good.
- But placeholder years (`yearApprox`, 1 837 rows) are treated as real: Fresedo "1939–40" (above), Troilo/Fiorentino "1940–43" with *Malena (1940)* (S9 #8, S10 #7, H6 #33; Malena is 1942), Troilo/Fiorentino vals "1940–44" with *Bajo un cielo de estrellas (1940)* (S3 #15, S11 #15, ALL #15), Biagi instr. "1946–50" with *Racing Club (1950)* and *A la gran muñeca (1950)* (S10 #17; Racing Club is 1940), D'Arienzo milonga "1941–43" with *La puñalada (1943)* and *Corrales viejos (1943)* (S6 #18). A "1940–1944" label on a Troilo tanda is fiction, and the *1935–43 warm-up bonus* is being awarded to 1950s sides dated "1940".

### 1.7 Intra-tanda ordering

- `shapeTanda` sorts by `song.energy`; for famous recordings `energy` comes from `famousRecordings[].energy`, a per-orchestra heuristic, so **all tracks of a family share one number** (1 538 famous rows → 497 distinct energy values; e.g. Rodríguez/Moreno all e66, Biagi/Amor all e74, De Angelis/Dante all e62, Lomuto/Omar all e50, Caló/Iriarte all e52). The "rise-settle" shape then degenerates into the stochastic pick order.
- The corpus `role` (opener/closer, rules 26–27) is loaded into `catalog.fame` but **never read** by `buildTanda`/`shapeTanda` (grep: `role` only appears in the Cumparsita picker). Results: Tanturi *Pocas palabras* (corpus closer ×4) opens S4 #11, S5 #8, S7 #19, S10 #11 while *Así se baila el tango* (the universal opener) sits third; Biagi *Lejos de ti* (corpus vals opener ×6) is placed last in S1 #9, S7 #9 and *Loca de amor* (closer ×4) first; Troilo *Te aconsejo que me olvides* (closer ×4) opens S2 #22 and S11 #8; Donato *El adiós* (opener ×5) correctly first, *Sacale punta* correctly last — by luck of the heuristic; De Angelis *Para qué te quiero tanto* (closer ×5) opens every De Angelis/Dante tanda; D'Agostino *Tres esquinas* (closer ×5) is last in S3 #22 but third in S6 #20.
- Flat energies also mean the "test track in slot 3" idea (Lavocah hammock) cannot be realised.

### 1.8 Vals and milonga choices

Vals (S1–S12, 48 tandas): Biagi/Ibáñez 1938 ×5, OTV/del Moral ×8, D'Arienzo instr 1935–37 ×2, De Angelis Dante–Martel ×3, Di Sarli/Rufino ×2, Troilo/Fiorentino ×3, Tanturi/Castillo ×3, Rodríguez/Moreno ×3, Caló/Iriarte ×5, Demare/Berón ×4, Canaro/Maida ×2, Lomuto/Díaz ×2, Donato/Lagos ×2, Tanturi/Ribó–Videla, De Angelis/Dante, Canaro/Roldán. Bank hits are right (rule 18) except OTV; the late vals (slot 21, cooldown) is Caló/Iriarte or Demare/Berón in 9/12 — fine but samey. Vals energy: Biagi e80 landing at tanda 9 after Tanturi/Campos e62 (+18) and Rodríguez vals e73 at tanda 3 after Canaro e51 (+22, S2) are the two recurring jolts.

Milonga (36 tandas): Di Sarli/Rufino 1941 *Zorzal, Pena mulata, La mulateada* ×6 (always at #6, always this order), Donato/Lagos *Porteña linda, La milonga que faltaba, Sacale punta* ×7, D'Arienzo instr. *De pura cepa, Milonga vieja milonga, La puñalada* ×6 (always #18, same order), Tanturi/Castillo *Así es la milonga, Mi morocha, Mozo guapo* ×5, Troilo/Fiorentino ×4, Caló/Berón ×3, Laurenz ×3, De Angelis/Martel, D'Arienzo/Mauré ×1, D'Arienzo instr. 1941–43. All corpus-grade tandas; the problem is zero variation in track choice or order across seeds, and two energy overflows: D'Arienzo/Mauré milongas rated **e92–94** (S5 #18) and D'Arienzo instr. 1941–43 **e94–99** (S6 #18, *Corrales viejos* e99) from stacking profile 82 + milonga +12 + era + vocal/instr shifts. Canaro milongas (bank #1 in BA) appear once in 12 sets (H6 #30).

### 1.9 Cortinas

- With `cortinaCultures:["global"]` the pool is 26 built-ins + 4 from `cortinas.json`; no genre family has ≥8 members, so `planCortinas` returns `family:null` and the night draws from everything: in **every** seed the cortina sequence is some permutation of *Sing Sing Sing, In the Mood, Take Five, Fly Me to the Moon, Feeling Good, Superstition, Misirlou (e90), Twist and Shout, Walk on the Wild Side, Blue Monday, Take On Me, Espresso (2024), Aruarian Dance (lo-fi), Let's Get Lost, My Baby Just Cares for Me, Jumpin' at the Woodside, Jump Jive an' Wail*. Jaccard of the cortina set between seeds = **1.00**. A room hearing New Order after Pugliese and Nujabes lo-fi after Fresedo knows a machine is in the booth; this was the #1 "machine tell" in the round-2 review and is unchanged.
- The scorer's own `cortina` factor is **0.00 in every default set** (families > 3), so the engine penalises its own default configuration and the number means nothing.
- Energy fit: *Misirlou* e90 before Biagi/Amor e74 (S1 #16→17), *Superstition* e84 before Troilo/Fiorentino e64 (S9 #11), *Sing Sing Sing* e82 before Lomuto e50 (S4 #3 → #4). The "8 points below the next tanda" rule is overridden by the no-repeat rule once the near-energy pool is exhausted.
- Context genres never reach the picker: Istanbul resolved `cortinaGenres:["turkish-pop","greek-laiko",…]` but `cortinaCultures` stayed `["global"]`, so `candidatesFor` filtered by culture first and produced the same global jukebox. Region has no audible effect on cortinas.
- Beginner/práctica (`genres: swing`) gave *In the Mood* **14 times in 27 tandas**: once every member of a small family is used, `pickCortina` re-picks by energy proximity instead of round-robin, so the same cue repeats back-to-back.
- `--cultures=turkish,greek --trend=trend`: three candidates (Edis ×10, Mabel Matiz ×9, Eleni Foureira ×2) — improved from the single-cortina night of round 3, still a three-song loop. Guardia-vieja preset: `cortinaStyle:"constant"` chose **Lou Reed "Walk on the Wild Side" ×28** for a 1920s night; the constant should be era-matched (a 1920s foxtrot or Carlos Gardel-free jazz side).

### 1.10 Energy arc and steps

- Arc fit RMSE 7–10 in 4 h sets; targets are reached in build/peak, missed in warm-up (vals at #3: target 51, delivered 60–73 in 11/12) and at the close (target 67, delivered 56–63). Steps >14 between consecutive tandas: 1–5 per set (S6: D'Arienzo milonga e94 → Tanturi e69 → Demare e51, two drops of −25/−18 in a row; S2 #2→#3→#4: 51→73→50).
- Marathon-plateau targets 81–87 for 16 consecutive slots (PL #11–26) cannot be met by the pool (delivered 57–83) and push 1950s Laurenz and Biagi/Duval into "peak" slots. Corpus marathon sets are not an all-D'Arienzo plateau; `0.92·(hi−lo)` is too high.
- Second half of H6 is flat (57–68 for tandas 24–33) with the Pugliese at #23 and nothing dramatic in the last third; six-hour nights need a second emotional peak (Pugliese vocal ~85 %) as round-3 said.

### 1.11 Context effects — mostly inaudible, two inverted

| Context | What changed | Verdict |
|---|---|---|
| Summer + heat + hot room + large | energy −9 ⇒ 27 tandas of **3-track tango tandas**; milongas 4 (vs 3); first tanda Fresedo/Ray, tanda 2 Canaro/Arenas 1947–48; D'Arienzo/Echagüe milonga e87 at #12 | 3-track tandas are a práctica convention, not a heat response (the research JSON gives heatwave/hot `tandaSizeShift:-1`). More milongas in the heat is the opposite of rule 17; cause: `resolveContext` takes the **first** absolute `milongaShare` it meets (season summer 0.18) and ignores heatwave 0.12 / hot 0.11. |
| Late-night marathon | energy +2, `vocalRatioShift +0.15` | **No effect**: `vocalRatioShift` and `tempoShift` are computed and never read anywhere in `compose.ts`/`tanda.ts`. Same tandas as the base seed. |
| Beginner afternoon práctica | energy −12, 3-track tandas, swing cortinas | `preferStyles/avoidStyles` are empty because the research model (`context_factors.json`) has no style fields; so Pugliese/Chanel at #19, Laurenz/del Río, Rotundo/Ruiz, Firpo/Diale for beginners. The builtin model's "rhythmic, no dramatic" rule is lost as soon as the JSON model is present. |
| Istanbul rain | genres resolved, cultures not | identical set list to base seed 21, identical cortinas. |
| Buenos Aires | energy +4, swing/jazz cortinas (In the Mood ×?) | plausible; cortinas finally one family because `genres` happened to match 4+ built-ins. |

### 1.12 Night rules

- `openWithCumparsita`: works; chose Troilo "1951" (mis-dated). `cumparsitaCount:2`: see §1.4 (wrong version appended). `birthdayValsAt:0.6`: note on Tanturi/Castillo vals #15 — fine. `showBreakAt:0.5`: break after #11, re-ramp −8/−4 applied, set shortened to 20 tandas, duration still 3.99 h — fine. `ultimaRule` variants: see §1.4. `puglieseOnce:false`: no change in 4 h (cap bug makes the flag moot). `openerRule:"canon"` is on by default and works.

### 1.13 Era presets

See §3 for the verdicts. Specific hits: PG #2 **Canaro / Tita Merello 1956** (*Niño bien, Pipistrela, Mañana, Cambalache*) — actress show-songs as the second tanda; PG #9 D'Arienzo/Bustos valses e85–93; PG Cumparsita Biagi 1942 after a 1956–66 night; NU is 1970s–80s re-recordings of golden-age names (Caló 1970, D'Agostino 1987, Salamanca 1987, Pugliese 1992, Troilo 1971) with a "4to. del Centenario 1978" última — not a nuevo night; GV: D'Arienzo/Carlos Dante 1928 ×3 and Di Sarli/Mercedes Carné 1931 ×3 in 29 tandas, every tanda 3 tracks, one Lou Reed cortina ×28; CONTEMP: eighteen unknown instrumental ensembles, Fernández Fierro twice, no Sexteto Milonguero / Romántica Milonguera / Solo Tango / Color Tango.

### 1.14 Diversity across seeds (S1–S12)

- Mean pairwise Jaccard: **orchestras 0.93**, families (orchestra|singer|rhythm) 0.23, tracks 0.12, cortinas 1.00. 411 distinct tracks over 960 slots; 24 tracks appear in ≥6 of 12 sets; the OTV vals trio in 10/12.
- Orchestra tandas over 12 sets: D'Arienzo 23, Tanturi 22, Troilo 22, Biagi 21, De Angelis 20, Rodríguez 19, Caló 17, Di Sarli 17, Canaro 15, Donato 14, Fresedo 12, Demare 12, Laurenz 12, Pugliese 12, OTV 11, D'Agostino 10, Lomuto 5 — and **nothing else**. Malerba, Federico, Varela, Gobbi, Racciatti, Pirincho, Carabelli never appear in a golden 4 h set; De Angelis (corpus 25 tandas) is played as often as Troilo (41) and more than Di Sarli (48); Tanturi (22 in corpus) is tied with Troilo. The per-slot table (`div.ts`) shows the night is a template: slot 3 = OTV vals, slot 6 = Di Sarli or Donato milonga, slot 9 = Biagi vals, slot 16 = Pugliese, slot 18 = D'Arienzo or Tanturi milonga, slot 22 = D'Agostino or De Angelis.

### 1.15 Duration accuracy

Excellent: 3.95–4.01 h for 4 h, 1.99 h, 5.99–6.00 h, 7.99–8.00 h, 10.00 h. Show-break run 3.99 h including the 20-minute break. `cumparsitaCount:2` overshoots to 4.05–4.09 h because the appended track is not fitted.

### 1.16 Honesty of the score

- Factors fixed at 1.00 by construction for every generated set: integrity, singer, era, sizes, cycle, titles (42 of 97 weight points). Fixed at 0.35: tempo, source (13 points). Fixed at 0.00 by the engine's own default: cortina (5 points). So 60/97 of the weight is constant; the 73–82 spread between seeds comes from `spacing` (0.00/0.50/1.00 depending on whether any orchestra repeats within 8 tandas — with 16 usable orchestras and 22 slots this is a coin flip), `arc` RMSE and `variety`.
- Nothing in the rubric sees: D'Arienzo absent or late, a soft última, placeholder years, track roles, obscure singers, cortina energy/era fit, context compliance, singer canon, energy jumps. H6 scores 71 and PL 69 mostly because 33 slots make 8-tanda spacing impossible, not because the sets are worse in the ways §1.10 describes. The "Solid regular milonga DJ" verdict at 73–82 is 10–15 points generous; our booth marks: S1 68, S2 62, S3 66, S4 64, S5 66, S6 63, S7 65, S8 67, S9 66, S10 67, S11 65, S12 63, H2 70, H6 60, PL 55, PG 52, GV 45, NU 35, ALL 64, TR 60.

---

## 2. Engine changes, severity-ranked (file · rule)

**Severity A — wrong music on the floor / rule silently disabled**

1. `tanda.ts` `phaseOk` (and `compose.ts` última branch): treat `slot.phase === "close"` as accepting `peak` **and** `cooldown`, and for `ultimaRule` candidates bypass the phase filter entirely (`sc.phase = () => ["any"]` the way `notBefore` is already bypassed). Then raise the "emotional-vocal" pool to ULTIMA_PREF **with** D'Arienzo/Pugliese/Di Sarli instrumentals, and require delivered energy ≥ target−4 before accepting a tanda at the close (fall back to the next candidate, not to the first).
2. `compose.ts:129` / `tanda.ts:190` — `maxPerNight` must be resolved to a number: `typeof m === "object" ? (o.hours >= 6 ? m["6"] : m["4"]) : m`; add a vitest invariant "Pugliese ≤ 1 per 4 h, ≤ 2 per 6 h, never twice when `puglieseOnce`". Also when `ultimaRule:"pugliese"`, reserve Pugliese for the última (skip it in the body).
3. `tanda.ts` D'Arienzo-early rule: apply the first-D'Arienzo bonus **before/independent of** the energy term (e.g. `if (early && position < 0.35) w = max(w, 0.6·bestWeightInSlot)`), or lower the effective target for that candidate (treat 1935–39 instrumentals as e70 for slot selection, keep e86 for the arc readout). Add a quota pass: if no D'Arienzo tango tanda exists by 40 % of the slots, force one at the next build/peak tango slot; target 2–3 per 4 h. Vitest: "first D'Arienzo tango tanda ≤ 0.35 and instrumental 1935–39 in ≥ 70 % of seeds; count ∈ {2,3} per 4 h".
4. `energy.ts` `BLACKLIST_TITLES`: remove `"mala junta"`, `"cafe dominguez"` (and `"quejas de bandoneon (concierto)"`, `"la yumba (concierto)"` which can never match after `normTitle` strips parentheses). Version-level bans belong in `nonDanceTitles` with a year, or in a `(title|orchestra|year)` list.
5. `compose.ts` Cumparsita picker: when `famousRecordings` lists `role:"cumparsita"` years for an orchestra, **filter** candidates to those years ±1 (keep weighting among them); exclude `yearApprox` rows and rows with a singer unless the corpus says vocal. Same filter for `openWithCumparsita` and for the `cumparsitaCount:2` "own" Cumparsita (prefer instrumental, corpus year, else skip the append).
6. `compose.ts` / `catalog.ts`: rows with `yearApprox:true` must not define a family's `yearRange` (use `year:null` for windowing; display "c. 1940"), must not earn the warm-up 1935–43 bonus, and should carry a 0.6 weight in track scoring. Vitest: "no tanda yearRange built from placeholder-only years".

**Severity B — the sets sound machine-made**

7. `tanda.ts` `shapeTanda`/`buildTanda`: read `catalog.fame.get(key).role`; put `role:"opener"` (or highest fame) first, `role:"closer"` last, lowest-fame track third; only then apply the energy shape. Vitest: "in a tanda containing a corpus opener and closer, they occupy positions 1 and n".
8. `catalog.ts` energy: `famousRecordings[].energy` must not override `songEnergy`; use it only as a prior blended with the per-track jitter, or (better) ship `track_energy.json` values for the top ~400 tracks (this round's patch adds ~140) so energy differs within a family.
9. `cortinas.ts` `planCortinas`: lower the family threshold to `≥ max(4, tandas/4)` and allow a *pair* of compatible families (swing+jazz, canzone+chanson); `pickCortina`: after `fresh` is exhausted, cycle in least-recently-used order, never pick the same id within 4 tandas; apply the `nextEnergy − 8` fit **before** the no-repeat rule when `|Δ| > 20`. Remove lo-fi/surf/2024-pop from the `global` default (patch `cortinaRemovals`) and give `guardia-vieja`'s constant cortina an `era ≤ 1935` filter.
10. `context.ts` `applyContextToOptions`: map `cortinaGenres` to cultures too (turkish-pop → turkish, greek-laiko → greek, rock-nacional → latin) and fix the `genres.length >= 4` guard in `candidatesFor` to `>= 3`; wire `vocalRatioShift` into `buildTanda` (multiply vocal candidates by `1 + 2·shift`), wire `tempoShift` into the energy target; take the **minimum** absolute `milongaShare` across applied factors (heat must win over season); restore `preferStyles/avoidStyles` for beginner/milonguero/encuentro in `context_factors.json` or fall back to the builtin option when the JSON option lacks them. Vitest: "heatwave → milonga count ≤ base; beginner → no dramatic orchestra; Istanbul → ≥ 80 % Turkish/Greek cortinas".
11. `rules.ts` `VALS_BANK`: drop OTV to 2 until the catalogue can build the Vargas/Pomar/Morales tanda; add `MILONGA_BANK` boosts for Canaro-Maida/Famá 1935–38 and D'Arienzo 1937–41 so Canaro milongas appear (BA bank #1).
12. `tanda.ts` diversity: add a per-seed "variety temperature" — sample from the top 10 (not 6) with a flatter distribution for slots 2–5 and the vals/milonga slots; penalise a family that was chosen in the same slot by the previous seed is impossible, but penalising `fame 0` families with `singerShare < 0.12` in slots ≤ 0.2 kills the OTV/del Moral and Lomuto/Díaz valses.

**Severity C — arc and long nights**

13. `arc.ts` `marathon-plateau`: cap the plateau at `lo + 0.78·(hi−lo)` and add a dip at 55 % and a second rise at 85 %; for `hours ≥ 6` schedule two Pugliese slots (instr. ~45 %, vocal ~85 %) via `maxPerNight["6"]`.
14. `arc.ts` `applyArc`: vals +2 is fine but the first vals slot (≈ 10 %) should get the **warm-up** vals bank (Canaro, Lomuto-Omar, Donato, OTV instr., Rodríguez) via a `slot.phase`-aware `VALS_BANK`; a Biagi vals at #9 is right, at #3 wrong.
15. `score.ts`: replace the constant factors with the things this audit measured — first-D'Arienzo position/instrumental, D'Arienzo count, última energy ≥ 64 and última orchestra ∈ corpus closers, Cumparsita year ∈ corpus years, share of `yearApprox` rows, role-ordered tandas, max energy step ≤ 14, cortina energy fit, cortina era fit, context compliance (milonga count under heat, styles under beginner), obscure-singer share (families with fame 0 in slots ≥ 0.2). Make `cortina` family-count relative to pool size so the default is not auto-zero. Keep `tempo/source` at 0.35 but **exclude** them from the denominator when unscored so the total is not inflated/deflated by missing data.

---

## 3. Per-era verdict

| Preset | Verdict | What a DJ hears |
|---|---|---|
| **golden** (4 h) | **Usable with edits** — 62–68/100 | Warm-up right, body right, three fixed defects: late/absent D'Arienzo, soft última, OTV vals at #3; cortinas unusable as delivered. |
| **golden** (2 h) | **Good** — 70 | Fresedo → Canaro → Caló vals → Rodríguez → D'Arienzo-Echagüe → Tanturi milonga → Laurenz → Troilo 1941 → Biagi vals → De Angelis → Di Sarli instr. → Canaro 1951 Cumparsita. Tight and honest; D'Arienzo at 40 % is late even here. |
| **golden** (6 h) | **Below par** — 60 | Second half flat, Pugliese at 69 % and nothing after, 1950s Laurenz/Gobbi/Varela in the last third, D'Arienzo tango tanda missing in 2/6 seeds. |
| **marathon-plateau** (6 h) | **Not a marathon set** — 55 | Targets 81–87 for 16 slots cannot be served; Laurenz/del Río 1952 at the "peak"; the plateau is a wall of e62–77 tandas with no release. |
| **golden-extended** | **Usable** — 66 | Same as golden plus a correct Di Sarli 1958 instrumental última; good use of the colour tanda rule. |
| **post-golden** | **Needs curation** — 52 | Tita Merello show songs at #2, Caló/Luque, D'Agostino/García, Troilo 1956 instrumentals (subPeriods ignored), vals energies 85–93, Biagi 1942 Cumparsita after a 1960s night. The D'Arienzo 1957–63 / Salamanca / Di Sarli 1956–58 / De Angelis tandas are right; the preset needs a whitelist of post-55 dance orchestras and the 1963 D'Arienzo Cumparsita. |
| **guardia-vieja** | **Honest but monotonous** — 45 | Correct material (OTV, Canaro, Firpo, Lomuto, Donato, D'Arienzo 1928, Di Sarli/Carné 1931), but three Di Sarli/Carné and three D'Arienzo/Dante tandas, 29 tandas of 3, and one Lou Reed cortina for four hours. Engine score 49 is about right. |
| **nuevo** | **Mislabelled** — 35 | 1970s–80s re-recordings of golden-age orchestras, no Piazzolla/Color Tango/Sexteto Mayor, a "4to. del Centenario" última. Not a nuevo night; it is a "late re-recordings" night. |
| **contemporary** | **Not fit** — 30 | Eighteen unknown instrumental ensembles. Needs an explicit list (Sexteto Milonguero, Romántica Milonguera, Solo Tango, Color Tango, Sexteto Cristal, Fernández Fierro, Tango Bardo, Misteriosa BA) and `includeOrchestras` as the default. |
| **all** | **Surprisingly good** — 64 | Round-3's Brunswick/Garello/Hidalgo noise is gone; the set is a golden set with De Angelis 1958–61 and Biagi/Duval 1956–59 colour. Milonga D'Arienzo/Echagüe e87 and the De Angelis/Dante última remain. |

---

## 4. The ten enhancements with the biggest quality lift

1. **Fix the close slot** (A1): let rhythmic/dramatic tier-1 orchestras close, enforce última energy ≥ target−4, make Pugliese/D'Arienzo/Di Sarli/D'Agostino-Vargas/Troilo-Fiorentino the closing pool. One change turns "fade-out" nights into nights that end.
2. **Make the first D'Arienzo early and instrumental 1935–39, and guarantee 2–3 D'Arienzo tango tandas per 4 h** (A3). This is the single most audible difference between these sets and a real one.
3. **Use corpus `role` for track order and un-flatten track energy** (B7, B8 + this patch's `trackEnergy`). Openers open, closers close; the tanda has a shape again.
4. **One cortina family per night, era/energy matched, cycling without repeats** (B9, B10 + `cortinaRemovals`). Removes the loudest machine tell and makes the `cortina` score meaningful.
5. **Repair `maxPerNight` and the Cumparsita version filter** (A2, A5): no double Pugliese, no Troilo "1952", no D'Agostino 1952 vocal appended to a 1945 tanda.
6. **Honour placeholder years** (A6): stop building "1939–1940" Fresedo and "1940–44" Troilo families from decade placeholders.
7. **Read the knowledge the JSON already carries**: `subPeriods` (phase/energy/notBefore by year window — this alone removes Troilo 1950s, Di Sarli 1950s in the warm-up, Laurenz/del Río at the peak), `bestYears` (0.5 weight outside), `singerShift`, `singerDanceable`/`nonDanceSingers` (Tita Merello, Nelly Omar, Solo de Piano), `followWith` (Pugliese → vals/milonga/rhythmic), `shareOfNightMax`. Today ten curated fields are dead weight.
8. **Un-blacklist *Mala junta* and *Café Domínguez*** and move version-level bans to `(title, orchestra, year)` (A4). Two of the corpus' most repeated tanda openers come back.
9. **Wire the context model end-to-end** (B10): vocal ratio, tempo, min-milonga under heat, styles for beginners, region → cortina cultures. Contexts are currently a UI promise the engine does not keep.
10. **Rebuild the scorer around what this audit measured** (C15) so the number tracks the booth: D'Arienzo timing, última strength, Cumparsita year, obscurity share, role order, energy steps, cortina fit, context compliance; and bench the 12-seed template-ness (per-slot family repetition, Jaccard) as a regression metric.

*Data corrections we are confident about are in `data/knowledge/review_patches_round4.json` (profiles, ~140 track energies with opener/closer gradients, non-dance titles, cortina removals, catalogue notes).*
