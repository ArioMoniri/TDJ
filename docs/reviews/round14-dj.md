# Round 14 — DJ review: three 4 h golden nights for a Turkish milonga (seeds 148, 36, 138)

**Reviewer:** a purist encuentro DJ (European encuentros and Istanbul marathons). I judge the DJ craft only.

**Nights:** the top three of the 300-seed sweep (`docs/specs/round13-engine.md` §8). I read the `.txt` listings and the `.json` plans in `scratchpad/best5/`.

**Shared options:** preset "Golden 1935–45 · 4 h · Turkish cortinas · double peak", profile Headline marathon DJ, `yearRange [1935, 1945]`, 4/3/3 tandas, TTVTTM, `orchestraRepeatGap 6`, `singerRepeatGap 4`, `rules.colourTanda: false`.

**Out of scope:** points that round 13 resolved are not repeated: closer in range, year spread inside a tanda, heatmap years, H1/H4/H6. When a round-13 point is still open, I say so in one line.

Tanda numbers are 0-based, as in the listings. Cue *n* is the cortina after tanda *n*.

---

## 0. One root cause first

The improveNight instrumental-share fixer (`packages/core/src/benchmark.ts`, the candidate whose reason is *"instrumental (benchmark: ≥ 1/3 of each hour instrumental)"*) converts a vocal tango tanda into the same orchestra's instrumentals. It searches a window of `y0 − 2 … y1 + 2` and checks none of these:
- the night's `yearRange`
- the colour/peak rule
- D'Arienzo's sub-periods
- the H2 style runs
- whether the vocal tanda was the night's only tanda of a must-have family

It produced 5 of the slots I reject below:

| Night | Tanda | What the fixer did |
|---|---|---|
| 148 | #10 | Rodríguez instrumentals: a colour orchestra at a peak |
| 148 | #21 | De Angelis instrumentals 1945–46: three 1946 sides |
| 36 | #9 | D'Arienzo instrumentals 1935–36: the third all-instrumental D'Arienzo, and the H2 "jarring" |
| 36 | #15 | Di Sarli instrumentals 1943–46: two 1946 sides |
| 138 | #15 | Troilo instrumentals, which removed the night's only Troilo/Fiorentino tango |

The benchmark review (§2 item 1, *"Rodríguez/Moreno → Rodríguez instrumental: wrong. Revert it."*) asked for this kind of conversion to stop. It still happens. Rule B4 below is the fix. Several of the other flaws disappear with it.

---

## 1. Verdicts

| Night | Engine / benchmark | My mark as is | Blockers | Mark after the listed fixes | Verdict |
|---|---|---|---|---|---|
| **148** | 91 / 94 | **84** | 3 (#21 out of range, #10 colour at a peak, 18→19) | **~91** | **Ship this one, with the 7 edits in §1.4** |
| 138 | 90 / 94 | 81 | 2 (#10 colour at a peak, 18→19) | ~89 | Fallback: the only night with no side outside 1935–45 |
| 36 | 91 / 94 | 72 | 4 (#15 out of range, #16 colour at a peak, 18→19, fixer-made #9) | ~84 | Do not ship |

### 1.1 Seed 148: the best-built night

**Strengths**
- The best D'Arienzo rotation of the three: instrumental 1936–37, Mauré 1941, instrumental 1939. These are three different sounds.
- It is the only night with a Troilo/Fiorentino **tango** tanda.
- Biagi appears twice in two modes (Ibáñez vals, instrumental 1938–39).
- The opening is lovely: Canaro/Maida, then Di Sarli instrumental 1940, then Lomuto vals.
- The última is Tanturi/Castillo ending on *Así se baila el tango*. That is exactly right for an Istanbul floor.

**Weaknesses**
- **#21**: three 1946 De Angelis sides on a 1935–45 night.
- **#10**: Rodríguez instrumentals at the first peak.
- **18→19**: the D'Arienzo 1939 summit hands straight to Pugliese 1945.
- **#4–#9**: six vocal tandas in a row. Láurenz, Donato milonga, D'Agostino, Caló, Biagi vals and D'Arienzo/Mauré are all sung.
- Berón sings in two tango tandas (#7 Caló, #13 Demare).
- There is no D'Arienzo/Echagüe and no Di Sarli/Rufino tango.

**Last four tandas:** Pugliese/Morán, Di Sarli/Rufino vals, De Angelis, Tanturi/Castillo. The shape is right, but the third slot is out of range.

### 1.2 Seed 138: clean data, weaker shape

**Strengths**
- Every side is inside 1935–45.
- It has the fewest singer repeats: only Castillo, in a milonga and a tango.
- The ending is the best of the three: De Angelis/Martel, Tanturi/Castillo última, Donato Cumparsita.

**Weaknesses**
- **#10**: Rodríguez/Moreno sits at the first peak.
- **18→19** is the worst transition in the set (61.7).
- There is no Troilo/Fiorentino tango: the fixer turned it into instrumentals at #15. Troilo/Fiorentino appears only as a vals at #2, at 0:25, when the floor is still half empty.
- There are two rhythmic runs:
  - #0–#3 (D'Agostino, Canaro instrumental, then D'Arienzo after a vals)
  - #7–#11 (Donato, Biagi vals, D'Arienzo/Mauré, Rodríguez, Tanturi milonga): five rhythmic tandas in a row
- D'Arienzo #3 (1935–36) and #18 (1937–38) are the same Biagi-era sound. That cost was accepted in the benchmark review, but here it is avoidable.

### 1.3 Seed 36: do not ship

**Problems**
- **Year range:** #15 Di Sarli instrumentals 1943–46 include two 1946 sides and cross his 1944–45 change of sound.
- **Colour:** three colour tandas sit inside five slots (#12 OTV, #14 Rodríguez vals, #16 Malerba), and **Malerba is at the second peak** (target 83, energy 58).
- **D'Arienzo:** all three D'Arienzo tandas are instrumentals from 1935–38, and #3 and #9 come from the same 1935–37 sub-period.
- **Rhythmic block:** #8–#12 (Biagi instrumental vals, D'Arienzo, Tanturi, Donato milonga, OTV) is five rhythmic tandas at the first peak.
- **Singers:** Berón, Lagos and Castillo each sing twice.
- **No Troilo/Fiorentino tango**, and no Di Sarli/Rufino tango.
- **Ending:** a Demare/Berón tango at energy 53 is wedged before the Biagi/Falgás última. That is round-13 transitions issue #6, still open.

### 1.4 Seed 148 as I would ship it

| # | Today | Shipped | Why |
|---|---|---|---|
| 9 | D'Arienzo / Mauré 1941 (peak) | **Troilo instrumental 1941**: Cachirulo, Milongueando en el Cuarenta, El Tamango, Guapeando (e76) | Breaks the vocal run and the rhythmic block, and gives the first peak a balanced lead-in |
| 10 | Rodríguez instrumental (colour at a peak) | **D'Arienzo / Echagüe 1938**: Pensalo Bien, No Mientas, Indiferencia, La Bruja | Peak-1 summit. Adds the missing D'Arienzo/Echagüe, which is the peak chair `compose.ts` itself names |
| 13 | Demare / Berón 1943 | **Di Sarli / Rufino 1941 tango**: Charlemos, Lo Mismo que Antes, Cascabelito, Bien Frappé | Removes the Berón repeat, adds the missing Di Sarli/Rufino tango, and fills a slot that sat 16 under its target |
| 15 | Troilo / Fiorentino | **Pugliese / Morán 1945** (moved from #19) | Pugliese at 0.65 of the night, after a lyrical vals, two slots before the second summit |
| 16 | Biagi instrumental 1938–39 | **Biagi / Ortiz 1940**: Quiero Verte una Vez Más, Todo Te Nombra, Pinta Orillera, Guapo y Varón | Avoids two hard-drive 1938–39 instrumental tandas around the Láurenz milonga (Biagi #16, D'Arienzo #18) |
| 19 | Pugliese / Morán | **Troilo / Fiorentino 1941–42** (moved from #15); take the 1942 rhythmic sides if the energy allows | The D'Arienzo summit hands to Troilo (R+ → B, a 2.5-year gap), not to Pugliese |
| 21 | De Angelis instrumental 1945–46 | **De Angelis / Martel 1943–44**: Que Buena Es, Ya Sé que Siguen Hablando, Parece un Cuento, Campanita | In range. The pairing scores 96 into the Tanturi última in seed 138 |

**Cortinas:** re-pick the cues around tandas 9, 10, 13, 15, 16, 19 and 21, and drop *Şımarık* and *Dudu* (S9).

**Checks on the result**
- **Spacing:** every orchestra is ≥ 6 tandas from its next appearance. Di Sarli plays at 1, 13 and 20 (two tangos and a vals), D'Arienzo at 3, 10 and 18, and Troilo at 9 and 19.
- **Orchestras:** 13 distinct.
- **Colour:** 2 colour tandas (Canaro #0, Lomuto #2), none at a peak.
- **Runs:** no rhythmic triple in the tango-only sequence, and no more than 3 vocal tango tandas in a row.
- **Vocal share:** 11 of 16 tango tandas are vocal (0.69, inside the preset's [0.55, 0.75]).
- **Instrumental per hour:** by hour, the shares are 33 %, 17 %, 17 % and 20 %, so the benchmark's "≥ 1/3 each hour" goes off. I accept that trade. See S6: one instrumental tango tanda per hour is the DJ rule, and this order meets it.
- **Transitions:** I estimate no jarring boundary. 18→19 becomes about 85 (fine) instead of 70.9.

---

## 2. Checks by topic

### 2.1 Orchestra rotation

In the tango-only sequence, R and R+ are both rhythmic:
- R+ = hard drive: D'Arienzo, Biagi, Tanturi.
- R = Canaro, Donato, D'Agostino, Rodríguez, OTV, Malerba.

| Night | Rhythmic runs ≥ 3 (all rhythms) | Two hard-drive instrumental tandas around a single milonga or vals | Lyrical tango → lyrical tango |
|---|---|---|---|
| 148 | #8–#12 (Biagi vals, D'Arienzo/Mauré, Rodríguez, Tanturi milonga, Donato instrumental) | #16 Biagi 1938–39 → milonga → #18 D'Arienzo 1939 | #13 → #14 vals (acceptable) |
| 36 | #0–#1 then #3; #8–#12 (five); #16–#18 | #8 Biagi instrumental vals → #9 D'Arienzo instrumental | #13 → (vals) → #15 at a peak slot |
| 138 | #0–#1 then #3; #7–#11 (five) | — (#16 Biagi/Ortiz is vocal) | — |

**Verdict:** all three nights build peak 1 out of 4–5 consecutive rhythmic tandas. The engine's H2 does not see this because it splits R and R+. A Rodríguez or Donato instrumental between D'Arienzo and Tanturi is not a contrast. → S1.

### 2.2 Orchestra repeats and spacing

The 6-tanda gap is respected everywhere.

**D'Arienzo**

| Night | D'Arienzo tandas | Verdict |
|---|---|---|
| 148 | instrumental 1936–37, Mauré 1941, instrumental 1939 | Good |
| 138 | instrumental 1935–36, Mauré 1941–42, instrumental 1937–38 | #3 and #18 share a sub-period |
| 36 | instrumental 1936–37, instrumental 1935–36, instrumental 1938 | Bad |

**Other repeated orchestras**
- **Two modes, fine:**
  - Donato appears twice in every night.
  - Caló appears twice in every night (Berón tango + Iriarte vals).
  - Biagi appears twice in every night.
  - Tanturi/Castillo plays a milonga and a tango in every night.
- **Di Sarli without a Rufino tango:**
  - In 36 and 138, the only Di Sarli/Rufino tanda is a **milonga** (Zorzal, La Mulateada, Pena Mulata).
  - In 148 it is a vals.
  - So the floor never gets the Di Sarli/Rufino tango tanda it came for (S5).

### 2.3 Singer repeats

| Night | Repeats | Verdict |
|---|---|---|
| 148 | Berón (Caló #7, Demare #13: two lyrical tango tandas 6 apart); Castillo (milonga + última) | Berón: should-fix. Castillo: fine |
| 36 | Berón (#13, #21); Lagos (tango #1 + milonga #11); Castillo (tango #10 + milonga #17) | Berón: should-fix. The rest is too much repetition for one night |
| 138 | Castillo (milonga + última) | Clean |

`singerRepeatGap 4` lets the same voice sing two tango tandas. → S4.

### 2.4 Instrumental and vocal balance per hour

The benchmark reads 148 as 33/17/33/40 %, 36 as 17/50/40/33 % and 138 as 33/33/33/40 %.

The real problem is **vocal runs**, not the hourly percentage:
- **148:** #4 to #9 are all vocal, which is about 70 minutes of singers.
- **36:** the first hour has one instrumental tanda out of six.

Chasing "≥ 1/3 each hour" through the fixer is what put Rodríguez, De Angelis 1946 and Di Sarli 1946 into the nights. → S6 (replace the driver) and B4.

### 2.5 TTVTTM cycle and sizes

All three are correct: three full cycles plus T T V T T, with 4/3/3 sizes. Nothing to fix.

### 2.6 Peaks: placement and content

**Placement is good:** #9 (about 1 h 35) and #18 (about 3 h 10).

**Content:**

| | Peak 1 window (#9–#11) | Peak 2 window (#15–#19) |
|---|---|---|
| 148 | D'Arienzo/Mauré (e78) · **Rodríguez instrumental** (e66, t82) · Tanturi milonga | Troilo/Fiorentino · Biagi instrumental · Láurenz milonga (e79 for t91) · D'Arienzo instrumental 1939 · **Pugliese** |
| 36 | **D'Arienzo instrumental 1935–36 (fixer)** · Tanturi · Donato milonga | **Di Sarli 1943–46 (e63, t78)** · **Malerba (e58, t83)** · Tanturi milonga · D'Arienzo instrumental 1938 · **Pugliese** |
| 138 | D'Arienzo/Mauré · **Rodríguez/Moreno (e67, t82)** · Tanturi milonga | Troilo instrumental · Biagi/Ortiz · Láurenz milonga · D'Arienzo instrumental · **Pugliese** |

**Findings**
- **The second peak window is five slots long in every night.** Round-13 transitions §4.1 ("never plan three peak-level slots in a row") is still open, and the pool cannot fill five summit chairs, so colour and soft families end up at the top (S12).
- **Peak 1 is D'Arienzo/Mauré in 148 and 138.** `compose.ts` (round 9) says the peak chair is *"Echagüe or the hot instrumentals, never a soft Mauré set"*. Nothing enforces it (S2).
- **Both summits are D'Arienzo in all three nights.** That is acceptable, but it is taste (T1).

### 2.7 How the nights end

| Night | 19 | 20 (last vals) | 21 | 22 (última) | Closer | Verdict |
|---|---|---|---|---|---|---|
| 148 | Pugliese/Morán | Di Sarli/Rufino | **De Angelis instrumental 1945–46** | Tanturi/Castillo | Donato 1935 | Right shape. #21 is out of range |
| 36 | Pugliese instrumental | Troilo/Fiorentino | **Demare/Berón e53** | Biagi/Falgás | Tanturi 1940 | The wedge before the última is still there (round 13 #6). Biagi/Falgás (*La Chacarera*, *Queja Indiana*) is not an "emotional-vocal" última |
| 138 | Pugliese instrumental | Donato/Lagos | De Angelis/Martel | Tanturi/Castillo | Donato 1935 | Best ending. The last vals is light after Pugliese |

### 2.8 Colour orchestras

| Night | Colour tandas | Where | Verdict |
|---|---|---|---|
| 148 | Canaro/Maida #0, Lomuto vals #2, **Rodríguez instrumental #10 (peak)** | Two in the warm-up, one at a peak | The peak one is a blocker |
| 36 | **OTV #12 (four fame-0 sides)**, Rodríguez vals #14, **Malerba #16 (peak)** | Three in five slots in mid-night | Blocker plus clustering |
| 138 | Canaro instrumental #1 (3 of 4 sides fame 0), **Rodríguez/Moreno #10 (peak)**, Malerba #13 | | The peak one is a blocker |

**Two related problems**
- **The profile says no colour tanda, but every night fills the cap.** The profile sets `rules.colourTanda: false`, and each night still reaches the cap of 3 colour tandas. An encuentro-level golden night uses at most two, away from the peaks (S11).
- **The listing labels colour tandas "golden core".** Every tanda shows "golden core", colour orchestras included, while the benchmark separately counts "3 colour (1 at a peak)". The per-tanda label is misleading (part of B1/B2).

### 2.9 The cortina set (Turkish)

**Length:** 32–49 s against a 45 s setting. Fine.

**Mood against the next tanda**

| Night | Cue | Next tanda | Problem |
|---|---|---|---|
| 148 | 13: *Hadi Bakalım* (up, e76) | Caló/Iriarte vals (e62) | Hotter than the vals it leads into |
| 36 | 15: *Üsküdar'a Gider İken* (slow, e40) | Malerba at a peak slot | Wrong mood for a peak |
| 36, 138 | 18: *Ele Güne Karşı* (bright) | Pugliese | Should be moody; *Firuze* or *Resimdeki Gözyaşları* fit |

**Club hits:** *Şımarık* (tagged `danceable-risk`) appears in all three nights, always at peak time. *Araba*, *Dudu* and *Kuzu Kuzu* are dance-pop the floor will keep dancing to. The benchmark review §3 said never to use these. It is still open (S9).

**Artist repeats**

| Night | Artists used more than twice | Same artist on cues too close together |
|---|---|---|
| 148 | Sezen Aksu ×3 | Tarkan on cues 15 and 17 |
| 36 | Sezen Aksu ×3, Tarkan ×3 | Tarkan on cues 16 and 17, back to back |
| 138 | Sezen Aksu ×3 | Sezen Aksu on cues 7 and 9 |

**Repeats across nights:** all three nights use the same 22-cue pool, and often the same cue in the same slot:
- *İşte Öyle Bir Şey* is cue 2 in all three nights.
- *Peki Peki Anladık* follows Pugliese in all three nights.

This is not a per-night flaw. Regulars will hear it within a month (T6).

### 2.10 Engine "fine" and "jarring" transitions: would I accept them?

| Night | Boundary | Engine | Me |
|---|---|---|---|
| 148 | 2→3 Lomuto vals → D'Arienzo 1936 | 87 fine | **Accept** |
| 148 | 3→4 D'Arienzo → Láurenz/Casas | 87 fine | **Accept** |
| 148 | 5→6 Donato milonga → D'Agostino | 87 fine | **Accept** |
| 148 | 7→8 Caló/Berón e58 → Biagi/Ibáñez vals e82 | 78 fine | **Accept.** A planned lift into peak 1 with an up cue; Caló already ends on its hottest side |
| 148 | 8→9 Biagi vals → D'Arienzo/Mauré | 87 fine | **Accept** |
| 148 | 9→10 D'Arienzo/Mauré → Rodríguez instrumental | 90 *smooth* | **Reject.** Colour at a peak, an energy drop of 12 on a flat plan, rhythmic into rhythmic. The engine is too kind here |
| 148 | 18→19 D'Arienzo 1939 → Pugliese/Morán 1945 | 71 jarring | **Reject** (B3) |
| 36 | 9→10 D'Arienzo instrumental → Tanturi (H2) | 69 jarring | **Reject.** Caused by the fixer |
| 36 | 16→17 Malerba e58 → Tanturi milonga e81 | 83 fine | **Reject.** The flaw is Malerba in a peak slot |
| 36 | 18→19 D'Arienzo 1938 → Pugliese 1944 | 66 jarring | **Reject** |
| 36 | 21→22 Demare e53 → Biagi última | 81 fine | **Reject** (S7) |
| 138 | 1→2 Canaro instrumental → Troilo/Fiorentino vals | 87 fine | Accept the step. Reject the slot (T2) |
| 138 | 3→4 | 82 fine | **Accept** |
| 138 | 7→8 Donato instrumental e61 → Biagi instrumental vals e85 | 78 fine | **Accept** (planned lift, up cue) |
| 138 | 9→10 D'Arienzo/Mauré → Rodríguez/Moreno | 88 fine | **Reject** (slot) |
| 138 | 17→18 Láurenz milonga → D'Arienzo | 86 fine | **Accept** |
| 138 | 18→19 D'Arienzo 1937–38 → Pugliese 1944–45 | 62 jarring | **Reject** |

### 2.11 Must-haves against a top Istanbul golden night

| Family (tango unless noted) | 148 | 36 | 138 |
|---|---|---|---|
| D'Arienzo / Echagüe 1938–39 | ✗ | ✗ | ✗ |
| Di Sarli / Rufino (tango) | ✗ (vals only) | ✗ (milonga only) | ✗ (milonga only) |
| Troilo / Fiorentino (tango) | ✓ | ✗ (vals only) | ✗ (vals only; the fixer took the tango) |
| Pugliese | ✓ Morán | ✓ instrumental | ✓ instrumental |
| Biagi | ✓ | ✓ | ✓ |
| Tanturi / Castillo or Campos | ✓ | ✓ | ✓ |
| Caló / Berón or Iriarte | ✓ | ✓ | ✓ |
| D'Agostino / Vargas | ✓ | ✓ | ✓ |
| Láurenz (Casas or Podestá) | ✓ | ✓ | ✓ |
| **Score** | **7 / 9** | **6 / 9** | **6 / 9** |

**Missing everywhere:** Pugliese/Chanel, Tanturi/Campos, a Caló/Iriarte tango, Fresedo/Ray, the Canaro/Maida milonga and Demare/Miranda. These are taste (T4).

---

## 3. Flaws, with general rules

Severity: **blocker** means I would not play the night as is. **Should-fix** means a top DJ would notice it.

Each rule is deterministic and checkable on any plan. "Tango-only sequence" means the tandas with `rhythm === "tango"`, in order; a vals or milonga between them does not break it.

### Blockers

**B1. A side outside the night's year range**
- **Where:** 148 #21 (De Angelis instrumental: El Entrerriano, El Chañar and El Taladro are all 1946). 36 #15 (Di Sarli instrumental: El Caburé and El Once are 1946; the spread is 3 years across Di Sarli's change of sound).
- **Problem:** on a 1935–45 night, these sides play outside the range. The listing still labels them "golden core", because De Angelis's core band is 1943–48. Both came from the instrumental fixer.
- **Rule:** for every tanda after every compose and fixer step, every side satisfies `yearRange[0] ≤ year ≤ yearRange[1]` (for `dateRange` rows, the whole range lies inside). `Tanda.golden` is computed on `core ∩ yearRange`, and a colour family is labelled `colour`, never `core`.
- **Fix:**
  - 148 #21 → De Angelis/Martel 1943–44.
  - 36 #15 → Pugliese instrumental 1944–45, moved from #19 (this also fixes B3 for 36).

**B2. A colour orchestra at a planned peak**
- **Where:**
  - 148 #10 Rodríguez instrumental (e66, target 82, phase peak)
  - 36 #16 Malerba/Medina (e58, target 83)
  - 138 #10 Rodríguez/Moreno (e67, target 82)
- **Problem:** round-13 golden-age R2 says "never at a peak". The benchmark only lowers `goldenCore` to "near", so all three nights still pass at 94. The floor's top moment is given to the softest family of the night.
- **Rule:** hard rule, in the composer and in every improveNight fixer. The tanda is rejected when `family ∈ goldenBands.colour` (or tier 2) and (`slot.phase === "peak"` or `slot.targetEnergy ≥ 78`). If no core family is free for the slot, re-plan the slot's target (see S12) instead of filling it with colour. The benchmark `goldenCore` check is **off**, not near, when this happens.
- **Fix:**
  - 148 #10 → D'Arienzo/Echagüe 1938, with Troilo instrumental 1941 at #9 (§1.4).
  - 138 #10 → Troilo instrumental 1941 (moved from #15). #15 → Pugliese instrumental (moved from #19). #19 → Troilo/Fiorentino 1942 tango.
    - Troilo plays at 2, 10 and 19, gaps 8 and 9: a vals plus two tangos.
    - Colour drops to 2 (Canaro #1, Malerba #13).
  - 36 #16 → Láurenz/Podestá **tango** 1943–44 (Garúa and others). Láurenz is then at #4 and #16, 12 apart.

**B3. The last summit hands straight to Pugliese**
- **Where:** 18→19 in all three nights (71 / 66 / 62, the minimum of each night).
- **Problem:** a 1937–39 D'Arienzo instrumental at energy 85 goes straight into 1944–45 Pugliese. That is 6–8 years of recording sound, a drop of about 20 bpm, and hard drive into dramatic. The D'Arienzo crowd wants more drive. Pugliese needs a floor that has been prepared. Round-13 transitions §4 rule 2 is still unimplemented.
- **Rule:** a dramatic (D) tanda never immediately follows an R+ tanda that is a planned peak or has a mean year ≤ 1940. On a double-peak night, the D tanda sits 2–4 slots **before** the last summit, with a vals, milonga or balanced tango between: `D, (M | V | B), …, R+ summit`.
- **Fix:**
  - 148: swap #15 and #19 (§1.4).
  - 138: as in B2.
  - 36: Pugliese to #15 (B1). #19 → Troilo/Fiorentino 1941 tango. #20 vals → Di Sarli/Rufino 1940–41, because Troilo/Fiorentino would otherwise sit next to the Troilo vals.

**B4. improveNight fixers bypass the composer's rules**
- **Where:** 148 #10 and #21, 36 #9 and #15, 138 #15. Every tanda whose reason reads "instrumental (benchmark: …)".
- **Problem:** the vocal-to-instrumental conversion searches `y0 − 2 … y1 + 2` and ranks only by fame and energy. It ignores:
  - `yearRange`
  - the colour/peak rule
  - lineup breaks and the D'Arienzo sub-periods
  - H2 style runs
  - the night's canon families

  In 138 it deleted the only Troilo/Fiorentino tango. In 36 it made a third all-instrumental 1935–38 D'Arienzo.
- **Rule:** every fixer candidate must pass the same predicate set as the composer's family filter before it is scored. That set is B1, B2, S1, S3, S4 and S5, plus H1–H6. A fixer may never remove the night's only tanda of a must-have family (S5). Add a vitest invariant: for the golden set, `improveNight(p)` introduces no tanda that `composerAccepts(slot, tanda)` would reject.
- **Fix:** revert the five conversions. The replacements are listed under B1, B2, S2 and S3.

### Should-fix

**S1. Rhythmic blocks at the first peak**
- **Where:**
  - 148 #8–#12 (in the tango-only sequence, #9 R+, #10 R, #12 R)
  - 36 #8–#12
  - 138 #7–#11
  - Also two hard-drive instrumental tandas around one milonga: 148 #16 → #18 (Biagi 1938–39, D'Arienzo 1939).
- **Problem:** the user's rule is no same character back to back. H2 splits R and R+, so a soft-rhythmic Rodríguez or Donato tanda counts as a contrast between D'Arienzo and Tanturi. On the floor it is not one.
- **Rule:** collapse R and R+ into "rhythmic". In the tango-only sequence:
  - no three consecutive rhythmic tandas
  - two R+ **instrumental** tandas have ≥ 2 tango tandas between them

  Over all rhythms, any window of 5 tandas holds at least one L, B or D tanda.
- **Fix:**
  - 148: Troilo instrumental at #9, Biagi/Ortiz at #16 (§1.4).
  - 138: Troilo instrumental at #10 (B2).
  - 36: #12 OTV → Di Sarli instrumental 1940 (Shusheta, El Pollo Ricardo, Nobleza de Arrabal, Catamarca). Di Sarli is then at #5 and #12, 7 apart.

**S2. A soft D'Arienzo set at the first summit**
- **Where:** 148 #9 and 138 #9, both D'Arienzo/Mauré 1941 (e78 for target 82).
- **Problem:** Mauré is the reflective D'Arienzo. The engine's own comment (round 9, `compose.ts`) reserves the peak chair for Echagüe or the hot instrumentals, but nothing enforces it once the fixers run.
- **Rule:** a D'Arienzo tanda on a planned peak (`peaks[]`) is either Echagüe 1938–39 or instrumental 1937–40. Mauré is only allowed off-peak.
- **Fix:**
  - 148 #10 (after the #9 Troilo move) → D'Arienzo/Echagüe 1938: Pensalo Bien, No Mientas, Indiferencia, La Bruja.
  - 138 #9 → D'Arienzo/Echagüe 1939: Mandria, Qué Importa, Que Dios Te Ayude, Dos Guitas. Then 138 #18 → instrumental 1939 (Trago Amargo, Maipo, No Me lo Digas, Yunta Brava), so that #3 and #18 no longer share the 1935–38 sound.

**S3. D'Arienzo rotation**
- **Where:** 36 #3 (1936–37), #9 (1935–36) and #18 (1938): all instrumental, two from the same pre-1938-07 sub-period. 138 #3 and #18 also share it.
- **Problem:** the same tanda twice in one night.
- **Rule:** when an orchestra has ≥ 2 tango tandas, no two may share the same (sub-period from `lineupBreaks`, vocal flag) pair. With ≥ 3 D'Arienzo tandas, at least one is vocal.
- **Fix:** 36 #9 → D'Arienzo/Echagüe 1938–39. For 138, see S2.

**S4. One voice in two tango tandas**
- **Where:**
  - 148: Berón in #7 (Caló) and #13 (Demare)
  - 36: Berón in #13 and #21, Lagos in #1 and #11, Castillo in #10 and #17
- **Problem:** the same voice comes back in the same lyrical mood. `singerRepeatGap 4` allows it.
- **Rule:** a singer appears in at most one **tango** tanda per night. A second appearance must be a vals or milonga (for example Castillo milonga plus Castillo última, or Rufino tango plus Rufino vals). Never three appearances.
- **Fix:**
  - 148 #13 → Di Sarli/Rufino 1941 tango (§1.4).
  - 36 #21 → De Angelis/Dante 1944–45 (Melenita de Oro, Cruz de Palo, Vieja Luna, No Me Importa su Amor; e≈67). This also fixes S7.
  - 36 #1 → Fresedo/Ray 1937–39 (Niebla del Riachuelo, Sollozos, No Quiero Verte Llorar, Penumbras) to remove the Lagos repeat.

**S5. Missing must-have families**
- **Where:** §2.11. D'Arienzo/Echagüe is missing in all three nights, the Di Sarli/Rufino tango is missing in all three, and the Troilo/Fiorentino tango is missing in 36 and 138.
- **Problem:** an Istanbul golden night without these three reads as an engine's night, not a DJ's.
- **Rule:** a golden 4 h night must include at least 8 of these 9 families:
  1. D'Arienzo/Echagüe
  2. Di Sarli/Rufino (tango)
  3. Troilo/Fiorentino (tango)
  4. Pugliese (any tango)
  5. Biagi (any)
  6. Tanturi with Castillo or Campos (tango)
  7. Caló with Berón or Iriarte
  8. D'Agostino/Vargas
  9. Láurenz with Casas or Podestá

  A family that is missing although its pool is not exhausted is a rule miss in `score.ts`. A vals or milonga does not satisfy a "(tango)" entry.

  Separately, the orchestra cap should count **tango** tandas (≤ 2, D'Arienzo 3) and allow one extra vals or milonga. That lets Di Sarli play instrumental, Rufino tango and Rufino vals.
- **Fix:**
  - 148 by §1.4 (9/9).
  - 138 by B2 + S2 (8/9; the Di Sarli/Rufino milonga stays).
  - 36 by B3 + S3 (8/9).

**S6. The instrumental driver**
- **Where:** 148 #4–#9 (six vocal tandas in a row). 36 hour 1 (one instrumental tanda in six).
- **Problem:** the "≥ 1/3 instrumental each hour" check is what the fixer chases. Meeting it with any instrumental of the same orchestra produced B1, B2 and B4.
- **Rule:**
  - each hour holds ≥ 1 instrumental **tango** tanda
  - never more than 3 vocal tango tandas in a row in the tango-only sequence
  - the night's vocal tango share stays inside `rules.vocalShare`

  The per-hour 1/3 becomes information only, never a fixer target.
- **Fix:**
  - 148 by §1.4: the longest vocal run is 3, and every hour has an instrumental tango tanda.
  - 36: #3 D'Arienzo instrumental stays, and #1 goes to Fresedo/Ray, so the first hour depends on #3. If the check wants a second instrumental, take #4 → Láurenz instrumental. The corpus lacks one, so accept it.

**S7. A soft tango wedged before the última**
- **Where:** 36 #21 Demare/Berón (e53) → Biagi última (e74). Rated 80.9 fine.
- **Problem:** round-13 transitions issue #6, still open.
- **Rule:** the tango tanda before the última has energy ≥ última energy − 12, and is not lyrical when the última is R+.
- **Fix:** 36 #21 → De Angelis/Dante 1944–45 (S4).

**S8. Unknown sides in prime time**
- **Where:** 36 #12 OTV instrumental 1937 (four fame-0 sides, at about 2 h 05). 138 #1 Canaro instrumental 1937–38 (three fame-0 sides). The golden-age review flagged the same OTV tanda in seeds 42 and 250.
- **Rule:**
  - after the first 45 minutes, no tanda has ≥ 3 fame-0 sides while a canon family is free
  - a colour tanda needs ≥ 2 sides with fame ≥ 3
- **Fix:**
  - 36 #12 → Di Sarli instrumental 1940 (S1).
  - 138 #1 → Fresedo/Ray 1937–39. This also breaks the opening rhythmic run and drops one colour tanda.

**S9. Club hits and artist repeats among the cortinas**
- **Where:** *Şımarık* (`danceable-risk`) is in all three nights. 36 has *Kuzu Kuzu* and *Dudu* on consecutive cues. Sezen Aksu appears ×3 in every night, and Tarkan ×3 in 36.
- **Problem:** the cortina invites the floor to stay. The benchmark review §3 asked for this; it is still open.
- **Rule:**
  - no cue tagged `danceable-risk`
  - at most one `mood:pop` or `mood:rock` cue per hour
  - one artist ≤ 2 times per night, ≥ 4 cues apart, never on consecutive cues
- **Fix:**
  - 148: drop *Şımarık* (cue 15) and *Dudu* (cue 17). Use *Bambaşka Biri* and *Ben Sana Vurgunum* style medium cues, and move one Sezen Aksu cue to a different artist.
  - 36: drop *Şımarık* (cue 8) and *Kuzu Kuzu* (cue 16).
  - 138: drop *Şımarık* (cue 16) and *Kuzu Kuzu* (cue 21).

**S10. Cue mood against the next tanda**
- **Where:**
  - 148 cue 13 *Hadi Bakalım* (up, e76) → Caló/Iriarte vals (e62)
  - 36 cue 15 *Üsküdar'a* (slow, e40) → a peak slot
  - 36 and 138 cue 18 *Ele Güne Karşı* (bright) → Pugliese
- **Rule:**
  - the cue before a D tanda is `tempo:slow` or has a mood in {melancholic, nostalgic, ballad, lament}
  - the cue before a vals is ≤ the vals energy + 4
  - never a `tempo:slow` cue with energy < 50 before a slot with target ≥ 78
- **Fix:**
  - 148 cue 13 → *Dağlar Dağlar*.
  - 36 and 138 cue 18 → *Resimdeki Gözyaşları* or *Firuze*.
  - 36 cue 15 → *Ben Sana Vurgunum*.

**S11. The colour budget on an encuentro profile**
- **Where:** all three nights have 3 colour tandas although the profile sets `rules.colourTanda: false`. In 36 they sit at #12, #14 and #16.
- **Rule:** when `rules.colourTanda === false`, ≤ 2 colour tandas per 4 h, at least 4 slots apart, and only in the warm-up or the breather between the peaks.
- **Fix:** follows from B2 and S8. 148, 138 and 36 end with 2, 2 and 1 colour tandas.

**S12. The peak window is longer than the pool can fill**
- **Where:** every night plans phase "peak" on #9–#11 and #15–#19: 8 of 23 slots. The second window is five slots long. 36 fills two of those slots with e63 and e58.
- **Problem:** round-13 transitions §4.1 is still open.
- **Rule:**
  - ≤ 3 consecutive slots with phase "peak" (or target ≥ 80)
  - the slot after a summit is planned at `target ≤ summit − 10`
  - the peak phase covers ≤ 25 % of the slots
- **Fix:** re-plan #15–#19 as build, peak, peak, summit, cooldown (targets roughly 74, 80, 84, 85, 75). That is what §1.4 effectively plays.

---

## 4. Taste (not rules I'd enforce)

- **T1. Both summits are D'Arienzo in all three nights.**
  - I would put Biagi or Tanturi/Castillo on peak 1 and keep D'Arienzo for the late summit.
  - A soft check could be `peaks[0].orchestra ≠ peaks[1].orchestra`.
- **T2. 138 #2: Troilo/Fiorentino vals at 0:25.**
  - The night's crown vals is spent before the floor is full.
  - I keep signature valses (Troilo/Fiorentino, Biagi, Di Sarli/Rufino) after the first hour.
- **T3. Opening monotony in 36 and 138.**
  - D'Agostino, then Donato or Canaro, then D'Arienzo after a vals: rhythmic three times.
  - This is round-13 issue #5, graded fine. Fresedo/Ray at #1 (S4/S8) cures it.
- **T4. Families missing everywhere.**
  - Missing: Pugliese/Chanel (Farol, Corrientes y Esmeralda, Nada Más que un Corazón), Tanturi/Campos (Encuentro, Oigo tu Voz), a Caló/Iriarte tango (Mañana Iré Temprano, Cada Día Te Extraño Más), Fresedo/Ray, the Canaro/Maida milonga (Largá las Penas, Milonga Criolla, Silueta Porteña), and Demare/Miranda (Malena, Mañana Zarpa un Barco).
  - In Istanbul, a Pugliese/Chanel tanda is close to a must-have. I'd rotate it in for Pugliese/Morán on alternate nights.
- **T5. Closer.**
  - Donato 1935 *La Cumparsita* is in range and fine.
  - After a Tanturi última, I'd rather close with Di Sarli 1942 or Troilo 1943, which are in range and have the bigger sound.
- **T6. Cortina pool.**
  - Every night uses the same 22 Turkish cues, often in the same slot.
  - A resident needs ≥ 40 cues and rotation across a user's recent nights.
- **T7. Seeds converge.**
  - These are identical in all three nights: Láurenz/Casas (same four sides), Caló/Berón, the Caló/Iriarte vals, the Tanturi/Castillo milonga and última, the Láurenz/Podestá milonga, and the D'Arienzo 1936 Retintín/Ataniche set.
  - Fine for one night. For a weekly milonga, penalise > 50 % tanda overlap with the user's last 3 saved nights.
- **T8. 36 última: Biagi/Falgás.**
  - The tanda opens with *La Chacarera*.
  - The preset asks for an "emotional-vocal" última. Tanturi/Castillo, Di Sarli/Rufino or D'Agostino/Vargas fit that brief better.
- **T9. The breather between the peaks is deeper than planned.**
  - 148 #12–#14 play at e63/55/62 against targets 74/71/75.
  - §1.4 lifts #13 to about 65.
- **T10. 138 last vals: Donato/Lagos after Pugliese.**
  - Pleasant but slight.
  - Di Sarli/Rufino, Biagi or Troilo/Fiorentino would close the cycle better. Biagi and Troilo are spacing-blocked here.
