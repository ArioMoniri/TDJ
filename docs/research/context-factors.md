# Context Factors for the TDJ Engine — an evidence-graded factor model

Companion to `musicology.md` (night arc, tanda rules, energy formula, orchestra profiles) and
`dj-benchmark.md` (regional defaults, rubric). This document does **not** repeat those; it adds
the *context layer*: how season, weather, room, time, crowd, region, holidays and mood requests
should move the engine's targets, and what to compute per rhythm so those targets can be hit.
Machine-readable twin: `data/knowledge/context_factors.json`.

Written by a working group of three: a tango musicologist (orquesta típica / archival), two
milonga DJs (Buenos Aires + European marathon circuit) and a music psychologist. Each factor
is tagged with an evidence grade:

| Grade | Meaning |
|---|---|
| **strong** | ≥1 large-N peer-reviewed study or meta-analysis, direction replicated, applies to our population with little inference |
| **moderate** | peer-reviewed evidence exists but is small-N, correlational, or needs inference from a neighbouring domain (sport physiology, streaming data, chart data) to the milonga floor |
| **weak** | a single study, a conference abstract, or an indirect proxy; direction plausible, size uncertain |
| **lore** | practitioner consensus (DJ guides, booth experience, forum consensus); no formal study; still the right default because DJs calibrate it nightly |
| **speculative** | our own extrapolation; shipped only because the engine needs *some* number; flagged for A/B testing |

Numbers are shifts to the engine's **targets** (see §0.2), not to individual track scores.

---

## 0. How the context layer plugs into the engine

### 0.1 What a "shift" is

The night-arc model (`musicology.md` §3.2) produces per-phase targets: `energy` (0–100),
`tempo` (quarter-note BPM, folded per §0 of `musicology.md`), `vocalRatio` (fraction of tango
tandas that are vocal, default 0.75), `valsShare` / `milongaShare` (fraction of all tandas,
default 1/6 ≈ 0.167 each from TTVTTM), `cortinaGenres` (candidate pool), `tandaSize` (tango
tanda length, default 4; vals/milonga 3). Each active context option contributes:

```
energyShift        −12 … +12   (energy points; the whole arc moves, phases keep their shape)
tempoShift          −6 … +6    (quarter-note BPM, applied to the tanda-mean tempo target)
vocalRatioShift   −0.15 … +0.15
valsShare          absolute target share (null = keep default)
milongaShare       absolute target share (null = keep default)
cortinaGenres      pool to prefer (ids in context_factors.json → cortina bank)
tandaSizeShift     −1 / 0 / +1 on the tango tanda
```

### 0.2 Combination rule (engine contract)

1. Sum `energyShift` over all active options, then clamp to **±18**. Beyond that the arc would
   leave the band a real DJ would ever play (warm-up 45–60 … peak 75–88). The clamp exists
   because factors correlate (summer + heat wave + humid + festival all push the same way) and
   the underlying studies report small effects that are *not* additive at the extremes.
2. Sum `tempoShift`, clamp to **±8 BPM**. Then re-check tanda-internal coherence (≤6% spread).
3. Sum `vocalRatioShift`, clamp result to **[0.55, 0.90]**.
4. `valsShare`/`milongaShare`: take the **non-null value from the highest-priority factor**
   (priority order in `context_factors.json` → `combination.priorityOrder`: eventType > region >
   timeOfDay > mood > holiday > crowdLevel > crowdSize > ageMix > roomTemperature > floorType >
   season > weather > acoustics > dayOfWeek > roomSize > daylight > roleRatio > origin); i.e. event
   type wins. Never let V+M exceed 0.40 of tandas or drop below 0.22 (the TTVTTM skeleton must
   survive). Hard constraints attached to lower-priority options (e.g. "no milonga tanda in the
   hottest hour") still apply as constraints even when their share value is overridden.
5. `tandaSizeShift`: majority vote; ties → 0. Result bounded to 3–4 for tango, 3 for V/M.
6. `cortinaGenres`: union of pools weighted by evidence grade (strong 3, moderate 2, weak/lore 1,
   speculative 0.5); region pool always included; a mood request pool overrides if present.
7. Phase shape is preserved: shifts move the whole curve; the "two peaks" and the sweet ending
   are never flattened by context. A **hard ceiling of 88** and **floor of 40** on tanda-mean
   energy apply after shifting.
8. Energy ↔ tempo are not independent (musicology §2.2: +0.9 energy per BPM for tango). The
   engine applies `energyShift` first, then uses `tempoShift` only as a *tie-breaker* when
   choosing among candidate tandas of equal energy — do not double-count.

### 0.3 What the evidence can and cannot support

Nothing in the peer-reviewed literature measures milonga floors directly. We rely on four
bridges: (a) **streaming-scale affective preference** (what people choose to hear by hour,
season, latitude, weather) — large N, small effect sizes, strong on *direction*; (b) **sport
and thermal physiology** — what heat/humidity do to a moving body; tango is light-to-moderate
exercise (≈3–5 MET for social tango; higher for milonga rhythm) so decrements scale down but the
direction holds; (c) **music-emotion feature studies** — which audio features drive perceived
arousal/valence; (d) **DJ practice literature** — Lavocah, Brown, Rauscher and booth experience.
Where (a)–(c) agree with (d) we grade *strong* or *moderate*; where only (d) exists, *lore*.

---

## 1. Factors

Each factor: evidence → effect direction & size → confidence → engine rule.

### 1.1 Season

**Evidence.** Streaming data (765 M plays, 51 countries) show seasonal cycles in the intensity
of music people choose that track **absolute day length**, peak at the summer solstice of each
hemisphere, and widen with distance from the equator [P1]. A survey of 402 listeners found
preference for *Arousing* playlists in warm months, *Serene* in spring and *Melancholy* in cooler
months [P2]; a 47-country replication (N=2 140) found the summer/arousal effect but it was
marginal (b = −0.05, p = .036) and the factor model fitted poorly [P3]. Monthly Spotify valence
across 26 countries rises in July–August (+0.008 to +0.010 on the 0–1 valence scale) and in
December (+0.014 to +0.016), the "gloomy February" effect was *not* found [P4]. UK chart
features of high intensity / positive emotion rise with temperature and fall with rainfall, but
only in months where weather changes are notable [P5]. Self-reported mood seasonality in the
general population is small and concentrated in high-neuroticism people; spring is the mildly
best season [P6]; winter-pattern depression prevalence rises with latitude (β≈0.2 per degree
band) [P7].

**Interpretation for a milonga.** The population *prefers* slightly more arousing music in
summer and slightly more reflective music in winter, but the sizes are tiny (≈1–2 % of scale)
and are *listening* preferences. On the floor, summer collides with heat (§1.2–1.3), which
pushes the *opposite* way physiologically. Net: season on its own should be a small nudge, and
the heat/humidity factors should carry the physiological load.

**Confidence.** Direction *moderate*; size *weak*.

**Engine rule.**

| Season (hemisphere-corrected) | energy | tempo | vocal | V/M share | cortina pool | notes |
|---|---|---|---|---|---|---|
| Winter | −3 | −1 | +0.05 | vals 0.17 / milonga 0.15 | chanson, jazz-ballads, soul, Italian 60s | more lyrical/vocal Di Sarli, Caló, Troilo-Fiorentino; valses keep lift; fewer late-night milongas (cold room → people sit) |
| Spring | +1 | 0 | 0 | default | bossa, Italian 60s, swing | "serene" preference → Fresedo, Di Sarli instrumentals, De Angelis valses in the build |
| Summer | +2 | 0 | −0.05 | vals 0.17 / milonga 0.18 | Latin pop, cumbia, surf, afrobeats | arousal preference ↑ but see heat; prefer *rhythmic* over *dramatic* for the energy (D'Arienzo/Biagi rather than Pugliese) because rhythmic is less physically draining than slow-dramatic with long holds |
| Autumn | −1 | 0 | +0.03 | default | jazz standards, chanson, soul | nostalgia window; Troilo-Marino, Di Sarli 50s accepted a little earlier in the arc |

Seasons are flipped for the Southern Hemisphere (Buenos Aires July = winter). Equatorial
locations (|lat| < 15°) get season shifts × 0.3 (the seasonal amplitude in [P1] shrinks towards
the equator).

### 1.2 Weather (today's conditions)

**Evidence.** Daily temperature correlates positively, and rainfall negatively, with the
intensity/positivity of popular music, after controlling for season and year; associations are
weak and only meaningful when weather deviates from the norm [P5]. In a 26-country panel,
temperature and sky cover were significant in some model specifications and not others [P4].
Rain reduces attendance (lore: every DJ has played a rainy-night milonga to 30 people; the
engine should expect a late, thin floor — §1.7). Storms raise ambient noise and cut power;
no music-specific evidence.

**Heat wave / humidity.** Sport physiology is unambiguous: at 36 °C time-trial performance falls
3.6–6 % vs 18–27 °C; raising absolute humidity alone costs another ~3.4 % and raises core
temperature and discomfort while HR and skin temperature barely change — i.e. *dancers will
feel worse before they look worse* [P8]. In 33 °C, very high humidity (4.5 kPa) cut
self-paced power by ~15 % and raised peak core temperature by 0.5 °C [P9]. Elite athletes lose
≈26 % time-to-exhaustion at 31.6 °C / 74 % RH; thermal discomfort predicts the size of the
loss [P10]. Heart rate rises ≈1 bpm per °C of air temperature during fixed-intensity work [P8].
Tango embraces create a micro-climate (two bodies, close hold) which practitioners agree makes
heat worse than the thermometer says (lore).

**Cold.** No performance decrement in the 18–27 °C band [P8]. Liked music raises the thermal
neutral temperature by ≈0.4 °C (people tolerate a colder room when they like the music) [P11].
Cold rooms empty the floor between tandas (people keep coats on and sit) — lore.

**Confidence.** Heat/humidity: *strong* (direction) / *moderate* (size, inferred from
cycling to dancing). Rain/storm: *weak* + lore. Cold: *weak*.

**Engine rule.**

| Weather | energy | tempo | vocal | V/M share | cortina pool | tanda size | notes |
|---|---|---|---|---|---|---|---|
| Rain (steady) | −2 | 0 | +0.05 | default | jazz ballads, chanson, bossa | 0 | floor fills late: stretch warm-up to 20 % of night; lyrical early; longer cortinas tolerated because people chat |
| Heat wave (outside ≥ 30 °C and room not air-conditioned) | −6 | −3 | +0.05 | vals 0.17 / milonga 0.12 | bossa, lo-fi, city pop, cool jazz | −1 (3-track tangos in peak phase) | peak capped at 80; no milonga tanda in the hottest hour; milonga tandas 3 tracks, never 4; cortinas 60–90 s (hydration breaks); prefer *lyrical* peaks (Di Sarli 50s) over *rhythmic* peaks; spaced D'Arienzo 1950s only after 01:00 when room cools |
| High humidity (RH ≥ 70 % at ≥ 24 °C) | −4 | −2 | +0.03 | milonga 0.13 | same as heat | −1 in peak phase | humidity matters more than the thermometer [P8][P9]; floors get sticky (§1.9) → avoid the fastest valses (Biagi 200 BPM) |
| Cold (outside ≤ 5 °C; room struggling < 18 °C) | +3 | +1 | 0 | milonga 0.18 | swing, rock & roll, Balkan, Turkish pop | 0 | start more rhythmic to warm bodies (D'Arienzo 1936–38, Rodríguez, Donato); shorter cortinas (30–40 s) so people don't cool down |
| Storm (thunder, wind) | −1 | 0 | +0.03 | default | region default | 0 | attendance risk; fallback "small crowd" profile; keep loudness headroom for ambient noise |
| Mild / clear | 0 | 0 | 0 | default | region default | 0 | — |

### 1.3 Temperature in the room

**Evidence.** As §1.2 heat: the 18–27 °C band is performance-neutral; decrements begin ≈28 °C
and compound with humidity [P8][P9][P10]. Thermal comfort and preferred music interact [P11].
Room temperature is the single most actionable physical variable because a DJ can *see* it
(fans, sweat, people leaving the floor after two tracks).

**Confidence.** *moderate*.

**Engine rule (overrides outside weather when both known; room wins).**

| Room | energy | tempo | vocal | V/M share | cortina len | notes |
|---|---|---|---|---|---|---|
| < 18 °C (cold) | +3 | +1 | 0 | milonga 0.18 | 30–40 s | rhythmic warm-up; two milonga tandas in first 90 min acceptable |
| 18–24 °C (comfortable) | 0 | 0 | 0 | default | 45 s | baseline |
| 24–28 °C (warm) | −3 | −1 | +0.03 | milonga 0.14 | 50–60 s | 3-track milonga tandas; one fewer milonga over the night |
| > 28 °C (hot) | −7 | −3 | +0.05 | vals 0.17 / milonga 0.11 | 60–90 s | peak cap 80; lyrical peaks; D'Arienzo 1950s milongas only once; announce water; 3-track tango tandas in the hottest hour |

### 1.4 Time of day / night

**Evidence.** The clearest finding in the field: across 51 countries and all demographics,
people choose **more relaxing music late at night** and **more energetic music during business
hours**, with a mid-afternoon arousal preference *high* exactly when self-reported mood is lowest
(music as compensation) [P1]. A two-billion-stream analysis finds five diurnal blocks (morning,
afternoon, evening, night, late-night/early-morning) with late-night/early-morning the lowest in
energy and the highest in acousticness [P12]. Circadian alertness has a post-lunch dip
(≈13:40–14:30) and a deep trough ≈03:00–05:00; homeostatic sleep pressure accumulates through
the day [P13][P14][P15]. "Night owls" choose less intense music than other chronotypes [P1] —
and the after-midnight milonga crowd is self-selected night owls. Loud music speeds drinking
[P16]; music in general keeps arousal from dropping while drinking [P17] — relevant to bar-run
milongas after 01:00.

**Practitioner layer.** Lavocah's three social phases (sparse → crowded → late arrivals) and
the DJ convention that the deep night is for Di Sarli 50s, Pugliese and Troilo late are in
`musicology.md` §3. The marathon sunrise slot (04:00–08:00) is a genre of its own: DJs play
"hammock" sets — fewer peaks, more instrumentals and valses, longer lyrical runs — and lo-fi
cortinas (dj-benchmark §7). This matches [P1][P12] exactly: circadian low → lower-arousal
preference.

**Confidence.** *strong* for direction (late night = lower arousal preference); *moderate* for
the magnitudes below.

**Engine rule** (slots are local clock; the night-arc phases still run *inside* the slot):

| Slot | energy | tempo | vocal | V/M share | cortina pool | tanda size | notes |
|---|---|---|---|---|---|---|---|
| Afternoon práctica / "milonga de la tarde" (14:00–19:00) | −2 (practica) / 0 (BsAs tarde) | 0 | −0.10 | vals 0.18 / milonga 0.18 | swing, Italian 60s, short (30 s) | −1 | post-lunch dip at the start [P14]: open with clear rhythmic instrumentals (D'Arienzo 1936–38, Rodríguez) to compensate (the [P1] "mid-afternoon compensation" pattern); more instrumentals for practice; no Pugliese |
| Early evening (19:00–22:00) | +1 | +1 | −0.05 | default | region default | 0 | arrival phase; business-hours arousal preference still active [P1] |
| Prime night (22:00–00:30) | +2 | 0 | 0 | default | region default | 0 | main build and peak live here |
| After midnight (00:30–02:30) | 0 | −1 | +0.05 | vals 0.17 / milonga 0.15 | soul, chanson, jazz | 0 | the "night" block of [P12]; emotional energy replaces physical; Pugliese/Troilo-Marino/Di Sarli 50s window; alcohol: keep cortinas ≤ 45 s and ≤ −3 dB so the bar doesn't become the party [P16] |
| Deep night (02:30–04:30) | −4 | −2 | +0.08 | vals 0.18 / milonga 0.12 | lo-fi, bossa, Chet Baker | 0 | circadian trough [P13]; lyrical long runs; milonga tandas sparse and 3 tracks; D'Arienzo 1950s milonga *once* as a wake-up if the floor sags |
| Sunrise marathon slot (04:30–09:00) | −6 | −2 | +0.05 | vals 0.20 / milonga 0.10 | lo-fi, ambient jazz, city pop | 0 | "hammock set": one gentle peak at ~60 % of slot, valses as lifts, Fresedo/Di Sarli/Canaro-Maida/Demare core; no Pugliese vocal; re-ramp +4 in last 45 min if the next DJ is a daytime slot |

### 1.5 Day of week

**Evidence.** In N=340 000 US adults, mood is better on Fridays and weekends; there is no
"Blue Monday"; Saturday = Sunday; effects shrink for older/retired people [P18]. In N=859 749
Korean observations, TGIF and weekend effects replicate, with a Thursday nadir, and younger
people show the largest day-of-week swings [P19]. Months with five Saturdays have higher
average music valence (the "dancing_days" variable) [P4]. Adolescents: positive affect rises
over the weekend [P20].

**Practitioner layer.** Weekday milongas are shorter, local, regulars-heavy, and end earlier
(people work tomorrow); Sunday milongas skew older and more traditional in most cities (lore).

**Confidence.** *strong* for the mood pattern; *moderate* for the mapping to the floor.

**Engine rule.**

| Day | energy | tempo | vocal | V/M | cortina | tanda size | notes |
|---|---|---|---|---|---|---|---|
| Mon–Wed | −1 | 0 | +0.03 | default | region default, short | 0 | earlier end: compress arc; peak at 70 % not 80 % |
| Thursday | −2 | 0 | +0.03 | default | region default | 0 | weekly affect nadir [P19]; gentler warm-up, don't force a peak |
| Friday | +2 | +1 | 0 | default | region default | 0 | TGIF [P18][P19]; arrivals come wound-up; warm-up can be 10 % shorter |
| Saturday | +2 | 0 | 0 | milonga 0.18 | region default, varied | 0 | the "dancing day" [P4]; fullest floor; full arc |
| Sunday | 0 | −1 | +0.05 | vals 0.18 | jazz, bossa, Italian 60s | 0 | older, traditional crowd (lore); sweet ending longer (last 15 %); Guardia Vieja and Canaro-Maida welcome |

### 1.6 Event type

**Evidence.** Entirely practitioner lore plus the structural facts in `dj-benchmark.md` §2.4/§4
(set lengths, tanda sizes, cortina customs). The psychology bridge: multi-day events accumulate
sleep debt, which lowers vigilance and raises preference for lower-arousal music ([P13][P15] and
the chronotype result in [P1]).

**Confidence.** *lore* (but very strong lore — every source agrees).

**Engine rule.**

| Event | energy | tempo | vocal | V/M | cortina | tanda size | notes |
|---|---|---|---|---|---|---|---|
| Regular milonga | 0 | 0 | 0 | default | region | 0 | baseline |
| Marathon (slot inside 30+ h) | −2 on day 2, −4 on day 3 (cumulative fatigue) | −1 | +0.05 | vals 0.18 / milonga 0.14 | themed single-artist, 30–45 s | 0 | 1935–45 core; ≥ 20 orchestras per 8 h; hammock tandas; Pugliese once per slot; no requests |
| Encuentro | −1 | 0 | +0.05 | vals 0.18 / milonga 0.14 | discreet, 30–40 s | 0 | milonguero codes: shorter steps, crowded floor → lower tempo ceiling (vals ≤ 190, milonga ≤ 122 quarter BPM); strict cabeceo → clean cortina gaps mandatory; no alternative, no contemporary orchestras |
| Festival main milonga | +4 | +1 | −0.03 | milonga 0.18 | pop/rock, varied, 40–60 s | 0 | large, young room; one contemporary-orchestra tanda in first third; re-ramp after shows with D'Arienzo/Biagi (never a vals) |
| Práctica | −3 | 0 | −0.10 | vals 0.18 / milonga 0.18 | short or none | −1 | more instrumentals; longer runs of one style allowed; no Pugliese 50s |
| Wedding / show / mixed audience | −2 | −1 | +0.05 | vals 0.22 / milonga 0.10 | mainstream pop/swing 30 s | −1 | non-dancers present: famous titles only (La Cumparsita, Por una cabeza, El día que me quieras, Poema, Desde el alma, Bahía Blanca); 3-track tandas; valses high (non-dancers "get" a vals); Piazzolla *Libertango*/*Oblivion* allowed for a show spot; closing Cumparsita D'Arienzo 1951 |

### 1.7 Crowd

**Evidence.** Younger listeners choose more intense music; Latin American listening is more
arousing, Asian more relaxing [P1]. All age groups prefer faster tempi *for listening* across
3rd-grade to college [P21], but spontaneous motor tempo slows with age (adults ≈ 500–600 ms
period ≈ 100–120 BPM; older adults ≈ 700 ms ≈ 86 BPM) [P22][P23]; a museum study of 335 people
aged 5–68 found timing variability rises in older adults and that people drift towards their
preferred tempo when asked to move at non-preferred rates [P24]. The "2 Hz resonance" (preferred
movement ≈ 120 BPM) [P22] is exactly the tango *doubled* pulse (walking 60–70/min = quarter-note
120–140) — tango's tempo band sits on the human motor sweet spot, which is why it is walkable
by all ages; the age effect says *older rooms want the lower half of the band*.

Groove: higher tempo increases the urge to move; only *high* rhythmic complexity reduces
groove; medium syncopation with several rhythmic layers maximises it [P25][P26][P27]. Beginners
are the listeners for whom complexity (rubato, dense arrangement) most reduces the urge to move
— this is practitioner lore consistent with [P25].

Crowd density: swarmalator modelling of silent-disco motion capture shows dancers entrain to
each other spatially and visually, not only to the music [P28]; on a crowded tango floor the
*ronda* speed is set by the slowest couple — practitioner consensus that crowded floors need
clearer, steadier pulses and slightly lower tempi. Leader/follower imbalance and tourist share
have no literature; lore only.

**Confidence.** Age/tempo: *moderate*. Level: *lore* + [P25]. Size/density: *weak* + lore.
Roles and tourists: *lore*.

**Engine rule.**

| Crowd dimension | option | energy | tempo | vocal | V/M | cortina | tanda size | notes |
|---|---|---|---|---|---|---|---|---|
| Size | small (< 40) | −3 | 0 | +0.03 | vals 0.18 / milonga 0.14 | 20–30 s | −1 | floor empties fast; short cortinas; 3-track tandas keep partner turnover; no Pugliese until ≥ 60 % of expected crowd present |
| | medium (40–150) | 0 | 0 | 0 | default | 45 s | 0 | baseline |
| | large / packed (> 150 or > 1 couple per 3 m²) | +2 | −2 | 0 | milonga 0.14 | 60–90 s | 0 | long cortinas to clear; steadier pulses (Di Sarli, Rodríguez, D'Arienzo instrumental) over rubato (Pugliese 50s) because the ronda jams; valses ≤ 190 BPM |
| Level | beginners / class-night | −4 | −2 | −0.05 | vals 0.17 / milonga 0.14 | 30 s | −1 | low complexity: marcato-in-4, square phrases, no rubato (Di Sarli 1940s, D'Agostino, Rodríguez, Canaro); milongas slow (Canaro ≤ 110) and 3 tracks; no Pugliese 50s, no Biagi fast valses |
| | mixed | 0 | 0 | 0 | default | 45 s | 0 | baseline |
| | advanced / milongueros | +2 | 0 | +0.05 | default | 45–60 s | 0 | tolerance for rubato, Troilo late, Pugliese twice in 6 h, Laurenz/Malerba colour; Guardia Vieja appreciated |
| Age mix | young (< 35 median) | +4 | +2 | −0.05 | milonga 0.18 | pop, afrobeats, K-pop | 0 | [P1][P21]; D'Arienzo/Biagi heavy; festival style |
| | mixed | 0 | 0 | 0 | default | region | 0 | baseline |
| | senior (55+ median) | −3 | −3 | +0.05 | vals 0.18 / milonga 0.13 | swing, Sinatra, Italian 60s | 0 | [P22][P23]: lower half of each tempo band; Canaro, Di Sarli, Fresedo, D'Agostino, Tanturi-Campos; milongas slow (Canaro, Di Sarli); *no* D'Arienzo 1960s |
| Role ratio | balanced | 0 | 0 | 0 | default | — | 0 | — |
| | leader surplus | 0 | 0 | 0 | vals 0.18 | — | −1 | 3-track tandas → faster partner rotation (lore) |
| | follower surplus | 0 | 0 | +0.03 | vals 0.18 | — | −1 | same; more vals (followers dance vals with each other more readily, lore) |
| Origin | locals / regulars | 0 | 0 | 0 | default | region | 0 | regional profile applies fully |
| | mixed | 0 | 0 | 0 | default | region ∪ jazz | 0 | — |
| | tourists / international (> 50 %) | +1 | 0 | 0 | default | jazz, pop (universally decodable) | 0 | play the "canon" (top-200 titles), avoid local-only codes (BsAs full-song cumbia breaks, chacarera) unless region = BsAs; cortinas must be unmistakably non-tango for everyone |

### 1.8 Room: floor, size, acoustics

**Evidence.** Dance-floor surfaces caused 12.8 % of all acute injuries in Berlin professional
dance over 17 years; "too slippery" was the top cause (53 % of professionals), "getting stuck"
second [P29]; force-reduction *variability* across a floor predicted injuries more than its mean
stiffness [P30]. Room reverberation changes how musicians play: tempo is reduced in highly
reverberant (and in anechoic) rooms, and performers slow with the square of reverberation time
[P31][P32]; drummers' tempo accuracy degrades with longer RT, interacting with BPM [P33]. For
*listeners* dancing, long RT smears the marcato and makes fast staccato tangos (D'Arienzo 1950s,
Biagi) muddy — practitioner lore that is consistent with [P31]–[P33].

**Confidence.** Floor: *moderate* (injury mechanism) → *lore* (music mapping). Acoustics:
*moderate* (performer) → *weak* (dancer).

**Engine rule.**

| Dimension | option | energy | tempo | vocal | V/M | cortina | notes |
|---|---|---|---|---|---|---|---|
| Floor | sprung wood / good parquet | 0 | 0 | 0 | default | — | baseline; fast valses and milongas fine |
| | laminate / varnished (fast) | 0 | −1 | 0 | milonga 0.15 | — | slippery: fewer fast milongas (D'Arienzo 50s ≤ 1), valses ≤ 190 |
| | tile / stone / marble | −2 | −2 | +0.03 | vals 0.17 / milonga 0.12 | — | hard and often slippery; knees tire; avoid fast milongas and Biagi valses; favour lyrical walking tandas |
| | concrete / carpet / sticky | −3 | −3 | +0.03 | vals 0.16 / milonga 0.10 | — | "getting stuck" [P29]: pivots hurt; minimise milonga; slower Di Sarli / Fresedo; this is the one case where *fewer* vals too |
| | outdoor (deck, plaza) | +1 | 0 | −0.05 | milonga 0.18 | louder, 45–60 s | ambient noise: rhythmic, loud-transfer tracks (D'Arienzo, Biagi, Rodríguez); Guardia Vieja 78 transfers get lost; weather rules apply |
| Size | small (< 80 m²) | −1 | −1 | +0.03 | milonga 0.14 | 30–45 s | jams quickly; steadier tempos |
| | medium | 0 | 0 | 0 | default | 45 s | — |
| | large hall (> 250 m²) | +2 | 0 | 0 | milonga 0.18 | 45–60 s | room to run: D'Arienzo milongas, Biagi valses OK; long tandas feel short |
| Acoustics | dry (RT < 0.8 s) | +1 | +1 | 0 | default | — | staccato reads; rhythmic orchestras shine |
| | moderate (0.8–1.5 s) | 0 | 0 | 0 | default | — | — |
| | reverberant (> 1.5 s, gym/church/stone) | −2 | −2 | +0.05 | vals 0.18 / milonga 0.12 | — | [P31]–[P33]: prefer legato (Di Sarli, Fresedo, Caló, De Angelis valses), avoid fastest staccato; raise cortina contrast (use clearly non-tango timbres); loudness −2 dB |

### 1.9 Region

**Evidence.** Baseline arousal of music chosen differs by region: Latin America highest, Asia
lowest, with Europe/North America between [P1]. Spotify valence is highest in Southern Europe
and Latin America [P4]. Everything finer-grained is the regional-profile lore in
`dj-benchmark.md` §2.4 and §7 (cycle, cortina customs, era centre), which we do not repeat.

**Confidence.** *moderate* for the arousal ordering; *lore* for the rest.

**Engine rule** (these are *baseline* profiles; other factors shift from here).

| Region | energy | tempo | vocal | V/M | cortina pool | tanda size | notes |
|---|---|---|---|---|---|---|---|
| Buenos Aires traditional | +2 | +1 | +0.05 | milonga 0.17 | jazz/swing standards, rock nacional, cumbia breaks | 0 | era 1938–50; two Cumparsitas; long cortinas; chacarera/chamamé set late; D'Arienzo share up to 25 % |
| Europe (marathon/encuentro/milonga) | 0 | 0 | 0 | default | themed single-artist jazz/soul/Italian/chanson | 0 | 1935–55; more Guardia Vieja colour; seamless fades |
| Istanbul / Eastern Med | +3 | +2 | 0 | milonga 0.18 | Turkish pop, Greek laïko, 80s synth, Balkan | 0 | bright, fast; D'Arienzo/Biagi/Rodríguez heavy; cortinas 45–90 s and loud |
| Asia (Seoul/Tokyo/Taipei/Shanghai) | −2 | −1 | +0.05 | vals 0.18 | jazz, city pop, bossa, K-indie | 0 | [P1] lower arousal baseline; audio-quality expectations highest; late Troilo / Di Sarli loved; dramatic valued over rhythmic |
| US / Canada | 0 | 0 | −0.03 | vals 0.17 / milonga 0.16 | 50s rock & roll, Motown, Americana (not swing where swing dancers present) | −1 in beginner-heavy scenes | less era-literate: tolerate vocal-era mixing; 0–2 alternative tandas late |

### 1.10 Holidays

**Evidence.** December shows the largest calendar effect on average music valence (+0.014 to
+0.016, about twice the summer effect) [P4]; Christmas music is overwhelmingly major-key and
nostalgia-laden (popular-science consensus; no rigorous listener study found). Nothing
peer-reviewed on Valentine's, New Year's Eve or Carnival music specifically; mood-regulation
theory ([P1][P5]) predicts people seek positive, familiar music on celebration days.

**Practitioner layer.** NYE milongas are show-and-party nights (toast at midnight, cumbia/champagne
break, La Cumparsita at 00:05 and then continue). Valentine's milongas are "romantic" theme
nights (see §1.12). Carnival (BsAs February, Rio/Venice/Cologne) overlaps with candombe and
murga; milonga candombe tandas (Canaro, D'Arienzo *Candombe oriental*) fit. Christmas Eve/Day
milongas are rare; the week between Christmas and New Year is marathon season in Europe.

**Confidence.** *weak* (December valence) → *lore*.

**Engine rule.**

| Holiday | energy | tempo | vocal | V/M | cortina pool | notes |
|---|---|---|---|---|---|---|
| None | 0 | 0 | 0 | default | region | — |
| Christmas week | +1 | 0 | +0.03 | vals 0.20 | swing Christmas standards (Ella, Sinatra, Nat King Cole), Italian 60s | sweet, major-mode valses (Canaro *Desde el alma*, Di Sarli *Bajo el cielo azul*); family/all-ages mix → treat as senior-leaning; *no* Christmas-song tandas, cortinas only |
| New Year's Eve | +4 | +1 | 0 | milonga 0.18 | disco/funk, Latin pop, pop anthems | hard peak scheduled at 23:30–23:55 (D'Arienzo/Biagi/Pugliese), Cumparsita at midnight, 5-min break, then restart from "build" at energy 65 with a vals; alcohol high → cortinas short and quieter after 01:00 |
| Valentine's Day | −2 | −1 | +0.10 | vals 0.20 / milonga 0.12 | chanson, bossa, soul ballads | §1.12 "romantic" preset: Di Sarli-Rufino, Fresedo-Ray, Canaro-Maida, Troilo-Fiorentino, Caló-Berón, D'Agostino-Vargas, Tanturi-Campos; famous love lyrics (*Poema*, *Nada*, *Fumando espero*, *Toda mi vida*); peak is *emotional* not physical |
| Carnival | +3 | +1 | −0.03 | milonga 0.20 | murga, cumbia, samba, Balkan brass | 2 milonga-candombe tandas; festive rhythmic orchestras; allow 1 "break tanda" (cumbia/murga) BsAs-style |
| Birthday vals (in-night ritual) | n/a | n/a | n/a | — | — | one scheduled well-known vals (Di Sarli *Bajo el cielo azul* / Canaro *Desde el alma* / D'Arienzo *Pabellón de las rosas*) at a set clock time; counts as a V slot |

### 1.11 Daylight / latitude

**Evidence.** Seasonal swings in preferred music intensity scale with distance from the
equator and track absolute day length better than its change [P1]; SAD prevalence rises with
latitude [P7]; high-latitude countries preferred higher-arousal summer music [P3]; daylight at
start time affects arrival timing (lore: Nordic summer milongas start late and run light; winter
ones are full by 20:00).

**Confidence.** *moderate* (direction), *weak* (size).

**Engine rule** — a multiplier on the season shift and a small direct term:

| Condition | energy | tempo | vocal | notes |
|---|---|---|---|---|
| Short days (day length < 9 h; typically |lat| > 50° in winter) | −2 | 0 | +0.05 | season shift × 1.3; warm, lyrical; longer sweet ending |
| Long days (> 16 h; |lat| > 50° in summer) | +1 | 0 | −0.03 | season shift × 1.3; arrivals late — stretch warm-up |
| Equatorial (|lat| < 15°) | 0 | 0 | 0 | season shift × 0.3 |
| Temperate default | 0 | 0 | 0 | season shift × 1.0 |
| Starts in daylight (sunset after start) | −1 | 0 | −0.03 | people arrive later; keep warm-up instrumental |

### 1.12 Mood requests (organiser/DJ picks a word)

**Evidence.** Feature→emotion mappings are the best-studied area here. Loudness is the
dominant driver of perceived arousal, tempo second; melodic contour/mode relate to valence
[P34]. On 1 802 DEAM excerpts, *rhythmic regularity and spectral flux* predict arousal, while
*harmonic complexity and mode* predict valence [P35]. Major vs minor reliably separates
perceived valence in Western-enculturated listeners but the mapping is learned, not universal
[P36][P37][P38] — fine for a milonga, whose dancers are all enculturated. Pulse strength,
brightness and low-mid fluctuation predict both emotion and autobiographical memory
(nostalgia) in older adults [P39]. Groove (urge to move) rises with tempo and medium
syncopation [P25][P26][P27]. Tango-specific: dancing tango *with* music and partner lowers
cortisol and raises testosterone/positive affect; music drove the cortisol drop, the partner
the testosterone rise [P40].

The mood words map onto Russell's circumplex (valence × arousal) and onto the tango feature
space in §2:

| Request | valence | arousal | energy | tempo | vocal | V/M | cortina pool | tanda size | tango content |
|---|---|---|---|---|---|---|---|---|---|
| Romantic | + | low–mid | −3 | −2 | +0.12 | vals 0.20 / milonga 0.12 | chanson, bossa, soul ballads | 0 | lyrical orchestras with lyrical singers (Di Sarli-Rufino/Podestá, Fresedo-Ray, Canaro-Maida, Caló-Berón, Demare-Miranda, Troilo-Fiorentino, D'Agostino-Vargas, Tanturi-Campos); major-mode titles welcome; valses sweet; peak = emotional |
| Energetic | + | high | +8 | +4 | −0.08 | milonga 0.20 | funk, rock, Balkan, Turkish pop | 0 | D'Arienzo (all periods), Biagi, Rodríguez, Tanturi-Castillo, Donato, D'Arienzo/Biagi valses and milongas; marcato in 4, strong syncopation, high pulse strength [P25][P35]; fewer breathing tandas (but ≥ 1 per 90 min — "never high energy the whole time") |
| Nostalgic | ±/− | low | −4 | −2 | +0.10 | vals 0.20 / milonga 0.12 | chanson, Italian 60s, old jazz ballads | 0 | Guardia Vieja and early-40s vocal tandas, famous lyrics, Gardel-era titles in 40s versions, Canaro-Charlo/Famá valses, Troilo-Fiorentino, Di Sarli-Rufino; the [P39] memory features: strong pulse, moderate brightness; extend sweet ending to 20 % |
| Playful | + | mid–high | +4 | +2 | −0.03 | milonga 0.22 / vals 0.18 | Italian 60s, surf, cumbia, swing | 0 | milongas (Canaro, D'Arienzo 1937–41, Tanturi-Castillo), Biagi (anticipations), Donato (humour), Rodríguez-Moreno, De Angelis valses; syncopation medium, square phrases |
| Elegant | + | mid | −1 | −1 | +0.03 | vals 0.18 / milonga 0.14 | cool jazz, bossa, Chet Baker | 0 | Di Sarli (both periods), Fresedo, De Angelis, Laurenz, Troilo 41–43; legato, arrastre, clean marcato-in-2 (Di Sarli walking) |
| Dramatic | − | high | +3 | −2 | +0.05 | vals 0.17 / milonga 0.13 | film themes, Balkan, Piaf | 0 | Pugliese (two tandas allowed in 5 h+), Troilo 44–55, Di Sarli 50s, Gobbi, Color Tango once; high LRA, rubato, dense arrangement; every dramatic tanda followed by a vals or rhythmic breather |

---

## 2. What to calculate per rhythm (tango / vals / milonga / canción)

Features the analyser should extract or infer per track, and how each maps to the four engine
axes: **energy** (0–100, = 0.55 physical + 0.45 emotional per `musicology.md` §2.2),
**danceability** (0–100: how readily a social dancer walks to it), **difficulty** (0–100), and
the two **mood axes** (valence −1…+1, arousal 0…1). Arousal ≈ energy/100 is *not* enforced:
arousal is the perceived psychological axis [P34][P35], energy the floor axis; they diverge
for slow-dramatic Pugliese (high arousal, medium physical energy).

### 2.1 Feature catalogue (all rhythms)

| Feature | How to compute / source | Tango mapping | Vals mapping | Milonga mapping | Canción |
|---|---|---|---|---|---|
| **Tempo** (quarter-note BPM after folding; vals also bars/min) | beat tracker (librosa/Essentia/madmom), fold per `musicology.md` §0; cross-check with reference durations | physical: +0.9/BPM above 124; danceability peak 118–134; difficulty rises below 112 (slow = hard for beginners) and above 138 | physical: +0.6/BPM above 180; danceability peak 170–190 (57–63 bars/min); > 195 difficulty +10 | physical: +0.8/BPM above 112; danceability peak 104–120; > 124 difficulty +15 | tempo irrelevant to danceability (danceability ≤ 25 by definition); arousal only |
| **Marcato in 2 vs in 4** (Link & Wendland: *marcato in dos* = accent on 1 and 3 of 4/8; *marcato in cuatro* = all four eighths articulated; *pesante*) | onset-strength autocorrelation at the eighth vs quarter level; ratio of energy at 2× pulse to 1× pulse; or orchestra/era prior | in 4 → physical +6, danceability +8 for beginners (D'Arienzo, Biagi, Rodríguez); in 2 → smoother, danceability +4 for advanced, physical −2 (Di Sarli, Fresedo, Canaro late 30s) | vals is in 3: measure accent weight on beat 1 vs 2–3; strong 1 → "lift" (De Angelis, D'Arienzo); even 3 → "floating" (Di Sarli, Troilo) | milonga is always accented; measure *3-3-2 (habanera) vs straight 4* ratio: more 3-3-2 → "traspié-friendly" difficulty +5, playfulness + | n/a |
| **Syncopation / anticipation** (síncopa, Biagi-style off-beat piano, D'Arienzo "pa-pa-pá") | syncopation index (Longuet-Higgins & Lee) on onset grid; or style prior | medium → groove/arousal + [P25][P27]; high → difficulty +8, danceability −4 for beginners; valence slightly + (playful) | medium → playful; high in vals is rare | inherent; measure *density*: Canaro low (danceability high), D'Arienzo high (energy high, difficulty +) | n/a |
| **Phrasing regularity** (4/8/16-bar squareness; cadence predictability) | self-similarity matrix; phrase-length histogram | square → danceability +6, difficulty −8 (Rodríguez, D'Arienzo); irregular/elided → difficulty +10 (Pugliese, late Troilo) | square in nearly all valses; irregular (Pugliese *Desde el alma* 1950s) difficulty + | square | — |
| **Arrastre** (dragged anacrusis into the downbeat; bandoneón/bass "yumba") | low-band (60–250 Hz) energy rise over ~150 ms before beat 1; rate of occurrence | strong arrastre → emotional +6, physical +2, difficulty +6, valence −0.1 (Pugliese, Di Sarli 50s, Troilo late) | mild arrastre on beat 1 of waltz = "lift" (+ energy 2) | occasional in candombe | — |
| **Variación** (fast bandoneón 16th-note coda) | onset density spike in final 15 % of track (> 2× median), high-register | presence → energy +4 (closing tanda slot), arousal +0.1, difficulty +4; D'Arienzo, Biagi, Troilo 41, Pugliese *Gallo ciego* | rare | rare | — |
| **Lyrical vs rhythmic balance** | ratio of sustained-tone energy (strings legato, spectral flux low) to percussive onsets (spectral flux high) [P35] | rhythmic → physical +8, valence +0.05; lyrical → emotional +6, physical −6, arousal −0.1; dramatic = alternating (high variance) → difficulty +10 | lyrical vals = "sweet" (Di Sarli, Canaro-Charlo); rhythmic vals = "lift" (Biagi, D'Arienzo) | always rhythmic; lyrical milongas (Di Sarli *Zorzal*) are the "elegant" exception | always lyrical |
| **Singer role** (estribillista = refrain only; *cantor de orquesta* = one verse, orchestra-led; *cantor* dominant = full lyric; duet) | vocal-activity ratio (VAR = seconds of voice / duration) via source separation; VAR < 0.25 estribillista; 0.25–0.55 cantor de orquesta; > 0.55 cantor dominant / canción | estribillista: emotional +2, danceability +2 (the dance goes on under the refrain); cantor de orquesta: emotional +8, danceability 0; dominant: emotional +10, danceability −8, difficulty +6 (phrasing follows the singer, rubato) | same thresholds; vals vocals mostly estribillista/cantor de orquesta | same; milonga vocals are rhythmic by nature (Castillo, Echagüe) | VAR > 0.6 and rubato ⇒ canción; danceability ≤ 25; never in tandas except as "homenaje" |
| **Dynamics: LRA (loudness range, EBU R128) and crest** | ebur128 LRA in LU; short-term loudness std-dev | LRA < 5 LU → compressed/flat (many 78 transfers, electro): emotional −4; 5–9 → normal; > 9 → dramatic, emotional +6, difficulty +4 (Pugliese, Di Sarli 50s hi-fi) | LRA > 8 in vals is rare and marks concert style | LRA low by nature | high LRA |
| **Key / mode** | key-detection (Krumhansl/Temperley profiles); verify against sheet-music key when known | minor (≈ 75 % of tangos) → valence −0.15, emotional +5; major → valence +0.2, physical −3 (sweeter: *Poema*, *Bahía Blanca*, *El flete* is minor); modulation to relative major in the B part is the norm — track-level mode = mode of the A part | major dominates valses (valence +); minor valses (*Desde el alma*, *Lágrimas y sonrisas*) are the nostalgic ones | mostly major/mixolydian flavour; valence + | both |
| **Year / era style** | metadata; `eraTable` | see §2.3 | | | |
| **Arrangement density** (layers, counter-melodies) | spectral flatness + number of simultaneous pitched streams (multi-pitch estimation) or orchestra prior | sparse (sextet, Guardia Vieja) → emotional −6, danceability +2; dense (Pugliese 50s, De Angelis, Fresedo full strings) → emotional +6, difficulty +4 | dense valses with string countermelodies (De Angelis, Fresedo) = "elegant" | sparse by nature | — |
| **Duration** | metadata | 2:20–3:10 normal; > 3:30 difficulty +3 (stamina), energy budget per tanda: sum ≤ 12:30; < 2:10 = "snack" (Guardia Vieja), good opener | 2:20–3:00 | 2:00–2:40; > 2:50 fatigue → place as track 2, never closer | 3:00–4:00 |
| **Recording / transfer quality** | label tier (dj-benchmark §2.2), SNR, speed check vs reference | affects *loudness normalisation* and arousal (noisy transfers read as lower arousal in loud rooms); does not change energy class | | | |
| **Pulse strength** (beat salience) | beat-strength / "pulse clarity" (MIRtoolbox) | strongest single predictor of danceability for beginners and of memory salience [P39]; danceability +0.3 per point of pulse-clarity percentile above 50 | same | same | low |

### 2.2 Per-rhythm formulas

Baselines come from the orchestra profile (`orchestra_profiles.json`); each feature applies a
bounded adjustment (±20 total, as in `musicology.md` §2.7). Axes:

```
tango:
  physical  = base_phys + 0.9*(bpm-124) + marcato4*6 - lyrical*6 + instrumental*4 + era_phys
  emotional = base_emo + vocal*8 + singerDrama*6 + minor*5 + rubato(8|14) + dense*6 + LRA_hi*6 + arrastre*6 + era_emo
  energy    = 0.55*physical + 0.45*emotional
  danceable = 70 + pulseClarity*0.3 + square*6 + marcato4*8*beginnerWeight - rubato*12 - dominantSinger*8 - |bpm-126|*0.5
  difficulty= base_diff + rubato*14 + irregularPhrase*10 + dominantSinger*6 + dense*4 + arrastre*6 + sync_hi*8 + (bpm<112)*8 + (bpm>138)*6
  valence   = -0.15*minor + 0.2*major + 0.05*rhythmic - 0.1*arrastre - 0.1*(dramaticSinger) + 0.1*playfulSync
  arousal   = clamp( 0.45 + 0.004*(bpm-124) + 0.25*loudnessNorm + 0.15*spectralFlux + 0.1*rhythmicRegularity , 0, 1 )   # [P34][P35]

vals:
  physical  = base_phys + 0.6*(bpm-180) + strongBeat1*4 + instrumental*3
  emotional = base_emo + vocal*6 + minor*6 + dense*5 + rubato*8
  energy    = 0.55*physical + 0.45*emotional          # "lift", not drive — energy label capped at 85 for social vals
  danceable = 75 + pulseClarity*0.3 - (bpm>195)*10 - rubato*10
  difficulty= base_diff + (bpm>195)*10 + rubato*10 + irregular*8
  valence   = +0.25*major - 0.1*minor + 0.1*lyrical
  arousal   = clamp( 0.5 + 0.005*(bpm-180) + 0.2*loudnessNorm , 0, 1 )

milonga:
  physical  = base_phys + 10 + 0.8*(bpm-112) + sync_density*6
  emotional = base_emo - 4 + vocal*4 + candombe*4
  energy    = 0.55*physical + 0.45*emotional          # milongas occupy 60–95
  danceable = 70 + pulseClarity*0.3 - (bpm>124)*15 - sync_hi*8 + habanera*4
  difficulty= base_diff + 10 + (bpm>124)*15 + sync_hi*8 + traspie_density*6
  valence   = +0.2 + 0.1*major - 0.1*candombe
  arousal   = clamp( 0.6 + 0.005*(bpm-112) + 0.2*loudnessNorm , 0, 1 )

canción (tango canción / listening tango / Gardel / Goyeneche / Piazzolla-vocal):
  danceable ≤ 25 (forced); energy per tango formula but flagged non-danceable;
  valence from mode and lyric sentiment; arousal from loudness/LRA.
  Engine: never in a tanda; allowed as "homenaje" single or show spot (wedding) only.
```

Where `beginnerWeight` ∈ [0,1] is set by the crowd-level factor (1 for beginner rooms, 0.5
mixed, 0.2 advanced), so marcato-in-4 counts more toward danceability for beginner rooms.

### 2.3 Per-era table

Quarter-note BPM, per `musicology.md` §0. "Marcato" column gives the dominant accompaniment
pattern. LRA is the typical loudness range after modern transfer. Values are typical tanda
means; orchestra profiles override.

| Era | Years | Tango BPM (T) | Vals BPM | Milonga BPM | Marcato | Syncopation | Arrastre | Variación | Lyrical:rhythmic | Singer role | LRA (LU) | Mode | Density | Duration | Energy | Danceability | Difficulty | Valence | Arousal |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Guardia Vieja / Guardia Nueva sextets | ≤1934 | 118–130 | 160–175 | 100–112 | in 2 (bright), some in 4 (Firpo, OTV) | low–medium | rare | some (Firpo, De Caro) | 40:60 | estribillista (refrain only) | 3–6 (78s) | mixed; many major | sparse (sexteto) | 2:30–3:00 | 35–50 | 70–80 | 20–35 | +0.1 | 0.4 |
| Golden early (D'Arienzo revolution) | 1935–1940 | 126–140 | 180–200 | 106–120 | in 4, staccato | medium–high (Biagi) | light | frequent | 25:75 | estribillista → short cantor (Echagüe 1938) | 4–7 | minor | medium | 2:20–2:50 | 65–85 | 85–95 | 25–40 | +0.05 | 0.75 |
| Golden mid (singers become stars; 1941 peak) | 1941–1945 | 118–130 | 172–190 | 106–118 | in 4 (Tanturi, D'Arienzo-Mauré) and in 2 (Di Sarli, Troilo) | medium | medium (Troilo) | occasional | 50:50 | cantor de orquesta (Fiorentino, Castillo, Rufino, Podestá, Berón, Vargas) | 5–8 | minor | medium–dense | 2:30–3:10 | 55–75 | 80–92 | 30–50 | −0.05 | 0.6 |
| Golden late (grand style) | 1946–1955 | 108–124 | 168–186 | 108–124 | in 2 with pesante; yumba (Pugliese) | medium (Pugliese high) | strong | occasional, dramatic | 65:35 | cantor dominant (Marino, Chanel, Morán, Campos, Dante/Martel) | 7–11 | minor | dense | 2:50–3:30 | 60–85 (emotional-weighted) | 65–85 | 50–85 | −0.15 | 0.65 |
| Post-golden | 1956–1975 | 104–144 (bimodal: slow grand or fast show) | 168–190 | 116–132 | in 4 very fast (D'Arienzo 60s) or in 2 slow (Di Sarli 56–58) | medium | strong | frequent (show) | 50:50 | cantor dominant; stereo crooning | 8–12 | minor | very dense | 2:40–3:40 | 55–90 | 50–75 | 45–75 | −0.1 | 0.6 |
| Nuevo (Piazzolla lineage) | 1955–1990 | free (80–160 with rubato) | rare | rare | 3-3-2 ostinato, no walking marcato | high | strong | virtuosic | 70:30 | none / art-song | 10–16 | minor/modal | dense, contrapuntal | 3:30–6:00 | 40–80 | 10–35 | 85–100 | −0.2 | 0.55 |
| Contemporary orquestas típicas | ≥1995 | 112–134 (per model orchestra) | 172–192 | 108–124 | per model (Color Tango = yumba; Sexteto Milonguero = in 4; Romántica Milonguera = in 2 legato) | medium | per model | occasional | 50:50 | crooner-style cantor (hi-fi) | 8–12 | minor | dense, hi-fi | 2:40–3:30 | 55–80 | 70–85 | 35–55 | 0.0 | 0.6 |
| Electro / fusion (for completeness) | 1999– | 100–130 programmed | — | — | programmed 4-on-floor + marcato sample | low | sampled | — | 50:50 | spoken/sung hooks | 3–6 | minor | layered | 3:30–5:00 | 60–80 (physical) | 50–70 | 20–40 | +0.05 | 0.65 |

Era-wise rules the context layer uses:

- **Heat / humidity / late / senior** → prefer eras with lower physical demand but intact
  danceability: Golden mid (in 2 variants) and Golden late lyrical (Di Sarli, Fresedo), not
  Post-golden fast.
- **Cold / young / festival / energetic** → Golden early and Golden mid in-4 variants; Post-golden
  fast milongas as spice.
- **Beginners / crowded / reverberant** → Golden early instrumental (clean in-4) and Golden mid
  square phrasing; avoid Golden late Pugliese and Post-golden slow grand.
- **Nostalgic / romantic / Valentine's / Sunday / Asia** → Golden mid vocal and Golden late
  lyrical; Guardia Vieja valses.
- **Harmony note**: the harmonic vocabulary of recorded tango enriches decade over decade
  1910→1960 (network analysis of ≈510 recordings) [P41]; harmonic complexity is a valence
  driver [P35] — so later eras read as darker/richer, earlier as brighter/simpler, which is why
  Guardia Vieja sits at +0.1 valence and Golden late at −0.15.

---

## 3. Worked examples (sanity checks)

1. **Berlin, Saturday, January, −3 °C outside, room 20 °C, sprung wood, 120 advanced dancers,
   regular milonga 21:00–03:00.** Season winter −3, cold +3, room comfortable 0, Saturday +2,
   advanced +2, Europe 0, short days −2 ×(season ×1.3 → −3.9 → use −4 for season). Sum ≈ −1 →
   essentially baseline; vocal +0.05+0.05 = 0.85; cortinas: chanson/soul themed; valses 0.18.
   Outcome: a standard European night with slightly more lyrical weight and a long sweet ending.
2. **Istanbul festival main milonga, July, 33 °C, no A/C, 400 people, young, 23:00–05:00.**
   Summer +2, heat wave −6, humidity −4, room hot −7 (room wins over outside weather → use −7
   instead of −6/−4; keep humidity −4), festival +4, large +2, young +4, Istanbul +3 = −2 after
   dropping the overridden term; tempo −3−2−2+1+2+2 = −2 (clamp fine). Milonga share: event
   (festival 0.18) wins by priority, but the heat rule's "no milonga in the hottest hour" and
   3-track milongas still apply as *constraints*. Result: a bright, Istanbul-flavoured night
   whose peaks are D'Arienzo-Echagüe and Di Sarli 50s rather than Pugliese 50s + Biagi valses
   back-to-back; cortinas Turkish pop at 60–90 s with water breaks.
3. **Marathon sunrise slot, day 3, 05:00–09:00, Netherlands, April.** Sunrise −6, marathon day 3
   −4, spring +1 → −9; vocal 0.75+0.05+0.05 = 0.85; vals 0.20, milonga 0.10; lo-fi cortinas.
   Arc: warm-up at 42, one peak at 62 (Troilo-Fiorentino or Di Sarli instrumental 50s), glide to
   58, last 45 min re-ramp +4 for the morning DJ hand-over.

---

## 4. Open questions / what to measure on the real product

- Log room temperature + humidity (cheap sensor or venue input) and floor-exit rate per track;
  this is the first place real effect sizes for the heat factor can be fitted.
- A/B the *speculative* numbers: role-ratio tanda-size rule, tourist +1, storm −1.
- Validate the VAR thresholds for singer role on a labelled set of 300 tracks.
- Verify the era BPM columns against beat-tracked library data (`musicology.md` already asks
  for this); the post-golden bimodality should split into two sub-eras once data exist.

---

## Sources

Peer-reviewed / academic (P):

- [P1] Park M., Thom J., Mennicken S., Cramer H., Macy M. (2019). *Global music streaming data reveal diurnal and seasonal patterns of affective preference.* Nature Human Behaviour 3, 230–236. https://consensus.app/papers/details/0705435d3eb0538f922370fdb0c995d9/
- [P2] Krause A. E., North A. C. (2017). *'Tis the season: Music-playlist preferences for the seasons.* Psychology of Aesthetics, Creativity, and the Arts. https://consensus.app/papers/details/80d009df87d75f25a5d95aa90d1e72e4/
- [P3] Krause A. E. et al. (2021). *A global investigation of music listening practices: the influence of country latitude and seasons on music preferences.* ICMPC-ESCOM 2021 abstract. https://researchonline.jcu.edu.au/68858/
- [P4] Kijewski M., Lis S. M. et al. (2021). *Spotify valence: socio-economic, calendar and weather determinants — a panel of 26 countries 2018–2019.* University of Warsaw, Faculty of Economic Sciences, Working Paper 12/2021 (360). https://www.wne.uw.edu.pl/files/9216/2436/2470/WNE_WP360.pdf (summer coefficient +0.0079…+0.0104; December +0.0139…+0.0159; Saturdays positive; temperature inconsistent)
- [P5] Anglada-Tort M., Lee H., Krause A. E., North A. C. (2023). *Here comes the sun: music features of popular songs reflect prevailing weather conditions.* Royal Society Open Science 10:221443. https://consensus.app/papers/details/4a67bf94c718546fa7bf45297a3efd6d/
- [P6] Winthorst W. H. et al. (2020). *Seasonality of mood and affect in a large general population sample.* PLoS ONE. https://consensus.app/papers/details/f6bb71ec072c5c3aaa9d2087aa9b832e/
- [P7] Kim K. et al. (2025). *Global prevalence of seasonal affective disorder by latitude: a systematic review and meta-analysis.* Journal of Affective Disorders. https://consensus.app/papers/details/823734c9765657ee99a3db5a191dd3b0/
- [P8] Jenkins E. J. et al. (2022). *Delineating the impacts of air temperature and humidity for endurance exercise.* Experimental Physiology. https://consensus.app/papers/details/c8c6b32e0abf57d08acc4e816aa46a1c/
- [P9] Bright F. M. et al. (2025). *Elevated humidity impairs evaporative heat loss and self-paced exercise performance in the heat.* Scand J Med Sci Sports. https://consensus.app/papers/details/bc5cd9d3dcd85babba3f72e749a2145b/
- [P10] Peggen M. A. G. et al. (2026). *Factors associated with performance decrements in elite athletes during exercise under hot and humid ambient conditions.* Int J Sports Physiol Perform. https://consensus.app/papers/details/090c5fdd1ad552aea799fe92cf4dbb03/
- [P11] Zhang X.-X. et al. (2025). *Environment temperature and music preference interact with human thermal demand.* Case Studies in Thermal Engineering. https://consensus.app/papers/details/6cbbb16577c6559bafbe1f82e8c455ee/
- [P12] Heggli O. A., Stupacher J., Vuust P. (2021). *Diurnal fluctuations in musical preference.* Royal Society Open Science. https://consensus.app/papers/details/f77e4f3ae4f1552495a5adb419e3f108/
- [P13] Carrier J., Monk T. H. (2000). *Circadian rhythms of performance: new trends.* Chronobiology International. https://consensus.app/papers/details/aac48631855b5a83a20d04f44523ad87/
- [P14] Deng Z.-K. et al. (2026). *Diurnal variation in subjective states and cognitive performance: laboratory and real-world work settings.* Chronobiology International. https://consensus.app/papers/details/488a85fb89d254d5a8e375b97edaf566/
- [P15] Hao C. et al. (2023). *Effect of homeostatic pressure on daytime vigilance performance.* Journal of Sleep Research. https://consensus.app/papers/details/9f0c4b6c8e0e506895a4c9dd08a52ec9/
- [P16] Guéguen N. et al. (2008). *Sound level of environmental music and drinking behavior: a field experiment with beer drinkers.* Alcoholism: Clinical and Experimental Research. https://consensus.app/papers/details/f7449118adb651a7acca63f020600926/
- [P17] Stafford L. D. et al. (2013). *Music increases alcohol consumption rate in young females.* Experimental and Clinical Psychopharmacology. https://consensus.app/papers/details/2643fac695b0544cbe9ecd062a71942c/
- [P18] Stone A. A., Schneider S., Harter J. K. (2012). *Day-of-week mood patterns in the United States.* Journal of Positive Psychology. https://consensus.app/papers/details/24ee645c2f33521d9875d5c9fbf6ff3a/
- [P19] Suk H. W. et al. (2020). *Within-person day-of-week effects on affective and evaluative/cognitive well-being among Koreans.* Emotion. https://consensus.app/papers/details/f5da80b0b2bc501e8a81b93a8c6686d5/
- [P20] Díaz-Morales J. F. et al. (2021). *Day-of-week mood patterns in adolescents.* Personality and Individual Differences. https://consensus.app/papers/details/34ab046232b659449b3c800c658ab6e6/
- [P21] LeBlanc A. et al. (1988). *Tempo preferences of different age music listeners.* Journal of Research in Music Education. https://consensus.app/papers/details/599f48a4635453458047637bc4b23569/
- [P22] van Noorden L., Moelants D. (1999). *Resonance in the perception of musical pulse.* J. New Music Research 28(1) — the "2 Hz resonance"; summarised with age data in Moumdjian et al. / Rose et al. reviews: https://pmc.ncbi.nlm.nih.gov/articles/PMC6987525 ; https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8345504/
- [P23] Rioux P.-A. et al. (2025). *A cross-sectional investigation of the development of rhythmic preferences with motor and perceptual tests.* Scientific Reports. https://consensus.app/papers/details/50af3fd3f4f8573fb90982a992fa7042/
- [P24] Serré H. et al. (2026). *Testing sensorimotor timing across age and music experience in a real-world environment.* Scientific Reports. https://consensus.app/papers/details/a35899f485fd5c05944a5afd3533cfd7/
- [P25] Wöllner C. et al. (2026). *Groove and time perception are influenced by rhythmic complexity and tempo.* Musicae Scientiae. https://consensus.app/papers/details/5cb9de540dac5a6db8eeceea54784ef2/
- [P26] Senn O. et al. (2024). *Null effect of perceived drum pattern complexity on the experience of groove.* PLOS ONE. https://consensus.app/papers/details/deaa703714a2546dab2b095de47e1f16/
- [P27] Seeberg A. B. et al. (2025). *Beyond syncopation: the number of rhythmic layers shapes the pleasurable urge to move to music.* Cognition. https://consensus.app/papers/details/4a654b21d2c45a9b904efb913a5332b3/
- [P28] Toiviainen P., Bamford J. S., Thompson M. (2025). *Modeling dynamics on the dance floor with directional swarmalators.* Frontiers in Behavioral Neuroscience. https://consensus.app/papers/details/c91fbe13f0ce5947a7b0884242ad48e5/
- [P29] Wanke E. M. et al. (2012). *Dance floors as injury risk.* Medical Problems of Performing Artists. https://consensus.app/papers/details/75008aad0cf153548f2cae3d68624380/
- [P30] Hopper L. S. et al. (2013). *Dance floor mechanical properties and dancer injuries in a touring professional ballet company.* J Sci Med Sport. https://consensus.app/papers/details/531108b04fee5f6e8c38deb4f60d3af1/
- [P31] Schärer Kalkandjiev Z., Weinzierl S. (2015). *The influence of room acoustics on solo music performance: an experimental study.* Psychomusicology. https://consensus.app/papers/details/f4fe6e18948450d1aaea0f7812ead835/ (reviews Kato et al. 2007 and Winckel 1962 tempo findings)
- [P32] Dedousis G. et al. (2023). *Room acoustics mismatches of rehearsal spaces and concert halls and their impact on music performance.* Auditorium Acoustics 2023. https://consensus.app/papers/details/570e27a31ba05e5f98effb19f338adb6/
- [P33] Ueda K. et al. (2025). *Effect of reverberation time on the accuracy of keeping tempo in drum performance.* JASA. https://consensus.app/papers/details/cc3086f271ac588fbb7efbcf37d20f50/
- [P34] Schubert E. (2004). *Modeling perceived emotion with continuous musical features.* Music Perception 21(4). https://consensus.app/papers/details/81d0c0a6141a5332871e487599fa78f1/
- [P35] Gu Y. et al. (2026). *Interpretable deep learning reveals distinct spectral and temporal drivers of perceived musical emotion.* Scientific Reports. https://consensus.app/papers/details/47a8f05f61c855949a1b0f1c9a1d89ec/
- [P36] Carraturo G. et al. (2024). *The major-minor mode dichotomy in music perception.* Physics of Life Reviews (systematic review + meta-analysis). https://consensus.app/papers/details/ce80a6abd60f5f9c9818e3dd6d836fff/
- [P37] Athanasopoulos G. et al. (2021). *Harmonic organisation conveys both universal and culture-specific cues for emotional expression in music.* PLoS ONE. https://consensus.app/papers/details/1ea3931608f75c23a7719614fce7c1d0/
- [P38] Smit E. A. et al. (2022). *Emotional responses in Papua New Guinea show negligible evidence for a universal effect of major versus minor music.* PLoS ONE. https://consensus.app/papers/details/764ca92b70f150a6aebaf1ba6c4ef5ed/
- [P39] Salakka I. et al. (2021). *What makes music memorable? Acoustic features, emotions and memories in older adults.* PLoS ONE. https://consensus.app/papers/details/1860b9c0eb295fefbfa1c9a24592e4be/
- [P40] Quiroga Murcia C., Bongard S., Kreutz G. (2009). *Emotional and neurohumoral responses to dancing tango argentino: the effects of music and partner.* Music and Medicine 1(1). https://consensus.app/papers/details/df43a2ea2fb7570a82690b9b90d3e47f/
- [P41] Mesz B., Paladino E., Pérgola J., Amster P. (2017). *The evolution of tango harmony, 1910–1960.* Mathematics and Computation in Music (Springer LNCS). https://link.springer.com/chapter/10.1007/978-3-319-71827-9_22 ; preprint https://museos.untref.edu.ar/wp-content/uploads/2023/05/4-The-Evolution-of-Tango-Harmony.pdf
- [P42] Fong Yan A. et al. (2024). *The effectiveness of dance interventions on psychological and cognitive health outcomes.* Sports Medicine (meta-analysis; background on dance as exercise). https://consensus.app/papers/details/56d61d4da7f05315a975e3a172846ec9/
- [P43] Alimenti Bel D., Rocamora M., Martínez I. C. (2021). *Analysis of tango performances using computational tools: the performing style of Aníbal Troilo interpreting "Mi refugio".* Per Musi. https://zenodo.org/records/4648528 (tempo curves; supports the rubato feature)

Musicology / practitioner (M):

- [M1] Link K., Wendland K. (2016). *Tracing Tangueros: Argentine Tango Instrumental Music.* Oxford University Press — ch. 1 vocabulary for marcato (in 2 / in 4 / pesante), síncopa, arrastre; ch. on arranging/performance techniques. https://academic.oup.com/book/2271 ; review-essay: Turci-Escobar J., Music Theory Online 25.3 (2019) https://mtosmt.org/issues/mto.19.25.3/mto.19.25.3.turciescobar.php
- [M2] Lavocah M., *Tango DJing* Parts 1–3 (Todotango) and Brown S., *Playing Music for Milongas* (Tejas Tango); Rauscher C., *How to DJ a Milonga* (Tangology 101) — full URLs in `musicology.md` and `dj-benchmark.md` Sources; used here for event-type, time-of-night and crowd lore.
- [M3] dj-benchmark §2.4 regional profiles, §4 numbers, §7 cortina preferences (this repo).
- [M4] Tango Topics, "Tango Marathon" (definition and hours) — https://tangotopics.com/topics-dictionary/tango-marathon/
- [M5] Booth experience of the authors (Buenos Aires: Cachirulo, Sunderland, Canning, La Baldosa; Europe: Berlin, Istanbul, Lisbon, Dutch/Nordic marathons) — labelled *lore* wherever used.

Evidence-grade summary: **strong** — time of night, day of week, heat/humidity direction,
feature→arousal mapping; **moderate** — season direction, room temperature, age/tempo, region
arousal baselines, daylight/latitude, floor/acoustics mechanisms; **weak** — rain/storm, holiday
valence, crowd density; **lore** — event type, level, roles, tourists, cortina pools, era
placement; **speculative** — role-ratio tanda size, tourist +1, storm −1, the exact multipliers
in §1.11.
