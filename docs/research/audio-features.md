# Audio features from 30-second previews: what TDJ can hear, and how it should use it

Status: research note, October 2026. Machine-readable twin: `data/knowledge/audio_model.json`
(validated with the inline Python check in §9; a fuller check that exercises the pair formula was run on 2026-10-19).
Companion docs: `docs/MUSICALITY.md` (target feature formulas), `docs/research/musicology.md` §0/§2
(BPM convention, energy model), `packages/core/src/{energy,score,tanda}.ts` (what the engine does today).

Scope: every song in `data/index/songs.json` can be resolved to a 30 s preview from the iTunes Search
API (no key, AAC ~264 kb/s, 44.1 kHz stereo, 29.98 s measured) or the Deezer public API (no key,
MP3 128 kb/s, 44.1 kHz, 29.99 s measured); Spotify previews only when the user connects a client
(BYOK) and the app predates the November 2024 policy change (see §4.4). The question is which
features survive a 30 s lossy excerpt of a 1930s–50s shellac transfer, how accurately, and what the
engine, scorer and UI should do with them.

Reading guide for accuracy labels: **high** = usable as a hard rule (≥ 90 % agreement with a careful
human on golden-age material); **medium** = usable as a weighted score factor, never as a hard fail;
**low** = display with a caveat, or do not compute from previews at all.

---

## 1. Features computable from a 30 s preview of a 78-rpm transfer

### 1.1 Preliminaries that change everything

- **Preview offset is unknown.** Apple's "plus" previews and Deezer previews are cut from a point the
  provider chose (usually the chorus/middle, not 0:00). Our El Flete probes start with music at full
  level from frame 0 on both services. Therefore *intro length, leading silence, ending type (fade,
  cut, ritardando), singer entrance time and the final variación* are **not** computable from previews.
  They need full files (local library or a connected stream). Mark them `fromPreview: false`.
- **Lossy codecs are not the bottleneck.** Golden-age shellac transfers roll off above ~8–10 kHz
  (Hashimoto 2025); the 128 kb/s MP3 low-pass (~16 kHz) and AAC 264 kb/s sit above that. Measured
  95 % spectral roll-off of the two El Flete previews: 4.2 kHz (Apple) and 3.9 kHz (Deezer).
  Timing features (onsets, beat) and loudness are unaffected at these bitrates; fine spectral
  features (noise-floor estimates, hiss profile) are mildly biased and must be compared only
  *within* the same provider.
- **Editions differ more than codecs do.** The same recording on two reissues measured −8.7 LUFS
  (Apple, "El Rey del Compás 1935–37" edition) vs −12.2 LUFS (Deezer, "De pura cepa" edition): a 3.5 LU
  spread, with identical LRA (5.1 vs 5.2 LU). Any loudness rule must be applied to the *edition the DJ
  will play*, not to "the recording".
- **Two independent samples are better than one long one.** Running the same analysis on the iTunes
  and Deezer previews of the same recording gives a cheap repeatability check: agreeing BPM/key/mode on
  both raises confidence to "high"; disagreement flags the recording for manual review or an
  edition-level speed problem (§2.4).

### 1.2 Tempo (BPM) and the tango double-time folding problem

- **What the detector returns.** Beat trackers and tempo CNNs report the metrical level with the
  strongest periodicity, which for marcato-in-4 tango is the quarter note (112–140) *or* the walking
  pulse (56–70), and for milonga often the doubled value (200–260). On the Deezer El Flete preview a
  plain spectral-flux autocorrelation ranks 66.3 BPM (0.518) marginally above 129.2 BPM (0.507); on the
  Apple preview the order flips (129.2 at 0.322 vs 66.3 at 0.272). Same recording, two transfers, two
  "winners": octave ambiguity is the dominant error, not tempo precision.
- **Evidence.** Octave errors (factors of 2 or 3) are the main failure mode of tempo estimators
  (Schreiber & Müller 2017 post-processing study [C2]; McKinney et al. 2007 MIREX analysis [C1]).
  TempoCNN (Schreiber & Müller, ISMIR 2018) reaches Accuracy1 92.0 % / Accuracy2 98.4 % on the Ballroom
  set (tango, waltz, samba… excerpts of 30 s), versus Böck's RNN 84.0 / 98.7 % — i.e. within-octave
  agreement is ~98 % on dance music and the remaining gap is metrical-level choice. It needs only
  11.9 s of audio, so a 30 s preview yields three half-overlapping windows for a majority vote.
  On historical polyphonic recordings with rubato, automated beat tracking is documented to fail
  systematically (Solé 2026 [C8]); for Pugliese 1950s and late Troilo expect local-tempo spread of
  ±10 % inside the preview, which is itself a useful feature (`tempoStd`).
- **Rule (fold, then trust).** After estimation, fold by ×2 / ÷2 (×3 / ÷3 for vals bar-locks) into the
  plausible window of the rhythm declared in metadata: tango 100–150, vals 150–210 quarter BPM
  (bar-locked detectors give 50–70 → ×3), milonga 90–140. If two folded candidates remain inside the
  window (e.g. 120 and 240 are both outside, but 66 → 132 and 89 → 178 for a tango), pick the one
  nearest the orchestra prior in `orchestra_profiles.json.bpm[rhythm]`; if still ambiguous, keep the
  detector's top candidate and set `bpmConfidence = low`.
- **Expected accuracy on golden-age material after folding:** ≥ 90 % within ±2 % of a human tap
  (high) for rhythmic orchestras; 75–85 % for Pugliese/late Troilo/Di Sarli 1950s (medium) because the
  30 s window may land in a rubato section. Report `bpm` (quarter-note), `walkingBpm = bpm/2`, and for
  vals `barsPerMin = bpm/3`, as `docs/research/musicology.md` §0 prescribes.
- **Resolution.** Autocorrelation at 43 frames/s gives ±3 BPM around 130; use the TempoCNN class
  argmax interpolated or a comb-filter with 0.5 BPM steps for the ±1 BPM the tanda rule (≤ 6 % spread)
  needs. Speed errors of the transfer shift BPM proportionally (§1.11).

### 1.3 Beat strength / pulse clarity

- **Definition.** Lartillot et al. 2008 [C7]: a composite of onset-curve periodicity descriptors
  (autocorrelation max, entropy, kurtosis, "attack") explains ~50 % of the variance in listeners'
  pulse-clarity ratings. For groove (the urge to move), Stupacher et al. 2014 [C9] found the strongest
  audio correlates to be RMS variability (r = .57), pulse-clarity "attack" (r = .38), RMS energy
  (r = .37) and spectral flux (r = .34), with mean loudness irrelevant.
- **Implementation on previews.** `pulseClarity = normalised autocorrelation peak of the onset
  envelope at the folded tempo lag`, 0–1, plus `attackStrength` (mean onset-envelope peak height
  divided by median). Both are stable on 30 s and robust to shellac noise because surface noise is
  broadband and non-periodic. The two El Flete previews gave 0.32 and 0.51 raw; after per-provider
  normalisation they agree on "very clear".
- **Engine use.** `docs/MUSICALITY.md` already defines `danceability += pulseClarity*0.3` per
  percentile point; this is the single strongest audio predictor of beginner danceability, and the
  marcato-in-4 vs in-2 decision (energy at 2× pulse vs 1× pulse) falls out of the same autocorrelation.
  Accuracy: **high** as a measurement, **medium** as a danceability predictor (half the variance).

### 1.4 Key and mode

- **Method.** Chroma/HPCP (12 or 36 bins, 100–2000 Hz as in Peeters' MIREX system, which used only
  the first 20 s of each track) correlated with key profiles. Krumhansl–Kessler profiles on a
  100 ms chromagram gave 75.1 % exact key on 237 classical piano recordings and 94.1 % when relative,
  dominant, sub-dominant and parallel keys count as near-misses (Pauws 2004 [C4]). Kania et al. 2022
  [C3] found Krumhansl–Kessler, Temperley and Albrecht–Shanahan profiles within a few points of each
  other and showed stable decisions from short fragments; EDMA profiles (Faraldo et al.) are tuned on
  electronic dance music corpora and over-report minor; for an orchestral 1940s corpus use Temperley
  or Krumhansl, with **a bandoneón/strings harmonic model** (triad templates with decaying harmonics
  0.6^(h−1), Peeters 2011) rather than raw pitch-class templates. Commercial DJ tools, judged by the
  DJ community on pop/EDM, score 72–90 % with relative keys counted correct — our material is harder.
- **Pitch drift and uncertain speed.** Tango orchestras tuned to A = 435 Hz until 1939 (D'Arienzo's
  last 435 session 3 March 1939, first 440 session 18 April 1939; Odeon stayed at 435 until end-1943;
  Pugliese/D'Arienzo 441–442 Hz in the 1950s), and 1960s LP reissues were commonly sped up by about
  two-thirds of a semitone (Tango Music Secrets; TangoTunes/Frank Jin analysis via Jens-Ingo Müller).
  Within-side pitch drop of about half a semitone occurs on some Odeon cuts. Consequences: (a) always
  run tuning estimation (HPCP with pcpSize ≥ 36 and `TuningFrequency`) before key assignment, so that
  ±50 cents of global offset does not flip the key by a semitone; (b) a drift > 50 cents inside the
  excerpt smears the chroma and lowers the correlation margin — report `keyConfidence` = margin
  between the best and second-best key; (c) the *mode* (major/minor) survives all of this and is the
  musically relevant part (§2.2).
- **Expected accuracy on 78s (30 s, after tuning correction):** exact key 60–70 % (medium), key
  within {relative, fifth, parallel} 85 % (medium-high), mode 85–90 % (high enough to display, not
  enough for a hard rule). Mid-track previews help: the 30 s usually sits in the B part or the
  vocal, which modulates to the relative major in many tangos — report the *dominant* key of the
  excerpt and keep the second candidate.

### 1.5 Camelot / harmonic compatibility — does it matter for tango dancers?

- **What harmonic mixing claims.** Mixed In Key / Camelot: tracks in the same or adjacent wheel
  positions (same number ± 1, or same number with letter change = relative major/minor) can be
  *beat-matched and overlaid* without dissonance. Gebhardt et al. 2016 [C5] showed that for overlaid
  music, psychoacoustic consonance (roughness between partials) predicts listener pleasantness better
  than circle-of-fifths relations.
- **Why it mostly does not transfer to tango.** Tango DJs never overlay or crossfade tracks: a tanda
  is four discrete songs with silence between them, and a cortina is a hard break. Key clash across a
  silence is not perceived as dissonance. The only tango DJ writing on the subject (Tomáš Kohl,
  "How to create contrast with harmonic mixing") argues the *opposite* of EDM practice: avoid two
  adjacent songs in the **same** key because they feel like the same song; prefer a fifth below
  (D major → G minor), the relative key, or a mode change for contrast; trust the ear over theory.
  He gives concrete pairings (Caló "Domingo a la noche" → "La abandoné y no sabía"; Di Sarli-Rufino
  "Patotero sentimental" and "Cascabelito" both C minor, so separated by "Bien frappé" in F major).
- **What does matter.** Mode. Major and minor modes elicit reliably distinct emotional responses
  (Carraturo et al. 2024 meta-analysis of 37 studies [C10]); `docs/MUSICALITY.md` already maps minor
  → valence −0.15, major → +0.2. So the engine uses key for (i) *mode continuity* inside a tanda
  (a sweet major vals between three minor ones is a tell), (ii) *same-key avoidance* between
  neighbours, (iii) nothing at the cortina boundary.
- **Verdict:** keep a Camelot distance table (it is cheap and DJs ask for it), weight it at ≤ 10 % of
  the pair score, score "same key" *below* "fifth/relative", and never let it override tempo,
  loudness or vocal continuity.

### 1.6 Loudness: EBU R128 integrated (LUFS) and loudness range (LRA)

- **Standard.** ITU-R BS.1770 K-weighted integrated loudness with −70 LUFS absolute and −10 LU
  relative gates; LRA per EBU Tech 3342: short-term (3 s) loudness, −70 LUFS absolute gate, relative
  gate at −20 LU, LRA = P95 − P10 of the gated distribution. Tech 3342 explicitly notes reduced
  precision for short programmes and for excerpts that include leading/trailing silence.
- **On previews.** Integrated loudness of a 30 s mid-track excerpt is within ~±1–1.5 LU of the
  whole-track value for golden-age tangos (they have little dynamic arc), so `loudnessLUFS` is
  **high** for the *edition* analysed. LRA from 30 s is a lower bound (ten 3 s windows): **medium**;
  use it for the `lraLow/Normal/High` emotional-intensity bands in MUSICALITY only with the
  edition-level caveat. Also record `truePeakDbTP` and `crestFactorDb` (peak − RMS) — brickwalled
  compilations (crest < 10 dB) are the "Tango Entropy"-type bootlegs DJs reject.
- **Deezer `gain`** (the API's replay-gain value, −12.4 dB on the sample track) is a free, whole-track
  loudness estimate for the Deezer edition; use it to cross-check the preview number.
- **Engine use.** Loudness match within ±2 LU between neighbours in a tanda and between cortina and
  next tanda (a cortina louder than the tanda is a common amateur tell); the player normalises to
  −16 LUFS (speech-like target for venues; the R128 −23 LUFS broadcast target is too quiet for DJ
  mixers) when the export format supports gain tags. Loudness never enters `energy` directly; it
  enters `arousal` via `loudnessNorm` as MUSICALITY specifies.

### 1.7 Spectral centroid / brightness (transfer-quality proxy)

- Spectral centroid (Hz, on the K-weighted or plain magnitude spectrum, median over frames) and 95 %
  roll-off. Measured: centroid 1505 Hz / roll-off 4156 Hz (Apple edition) vs 1294 / 3930 Hz (Deezer
  edition). Differences of this size between editions of the same recording are typical of reissue
  EQ (generic vs label-specific de-emphasis curves; RCA used an 800 Hz turnover with +8 dB at 10 kHz,
  Decca 250 Hz and +6 dB, mid-1930s discs 500 Hz with no boost — pspatialaudio.com).
- **Use.** (i) `brightness` label for display (dark < 1.1 kHz, warm 1.1–1.6, bright > 1.6 kHz centroid,
  calibrated on the corpus percentiles rather than fixed numbers); (ii) brightness *match* between
  neighbours in a tanda (a 2 kHz-centroid TangoTunes transfer next to a 1.1 kHz muffled bootleg
  is audible on a good system); (iii) duplicate-take ranking (§2.5). Accuracy: **high** as a
  measurement, **medium** as a quality proxy (treble boost can be fake, with hiss).

### 1.8 Dynamics envelope

- Short-term loudness series (3 s) and momentary (400 ms) series inside the preview; derived:
  `loudnessStd`, `lraPreview`, and the slope (dB/10 s) which says whether the excerpt is building,
  flat or settling. Combined with onset-envelope RMS variability it is the groove correlate with
  the highest r (.57) in [C9]. Accuracy **medium** (excerpt is not the track).

### 1.9 Onset density (rhythmic vs lyrical proxy)

- `onsetsPerSec` from a spectral-flux onset detector with adaptive threshold, and `onsetRegularity`
  (coefficient of variation of inter-onset intervals quantised to the beat grid). Rhythmic orchestras
  (D'Arienzo, Biagi, Rodríguez) give high density and high regularity; lyrical (Di Sarli, Fresedo,
  Caló) low density and legato; dramatic (Pugliese) high density *and* low regularity. Validate against
  `orchestra_profiles.json.style` (expected agreement ≥ 80 % → **medium**). Also compute
  `sustainedRatio` = harmonic energy / percussive energy after HPSS (median filtering, Fitzgerald
  2010) which is the `lyricalVsRhythmic` feature of MUSICALITY.

### 1.10 Vocal presence

- Frame-level singing-voice detection with a small CNN on mel-spectrograms reaches ~92 % accuracy on
  Jamendo and RWC (Schlüter & Lehner 2015; survey Monir et al. 2022 [C6]; LRCN with vocal separation
  and temporal smoothing, Zhang et al. 2020). Without a trained model, an HPSS + spectral-flux
  heuristic (vocal = harmonic component with strong 200–3000 Hz formant energy, pitch continuity and
  vibrato 4–7 Hz) gives ~80–85 % frame accuracy on 1940s mono orchestra recordings where the singer
  is mixed centre and narrow-band.
- **Preview caveat.** The estribillo often starts after 1:00; a mid-track preview usually contains it,
  but not always, and in a cantor-dominant 1950s track the preview may be *all* vocal. So from a
  preview: `vocalPresent` (any singing in the 30 s) **high** when positive, **low** when negative;
  `vocalActivityRatio` (needed for estribillista / cantor de orquesta / cantor dominant thresholds in
  MUSICALITY) **low** — keep the catalogue `vocal`/`singer` fields as the source of truth and use the
  audio only to *contradict* them (instrumental in the index but singing detected → flag for review).

### 1.11 Speed / pitch error estimation

- **Tuning estimate.** Essentia `TuningFrequency` or a 36-bin HPCP peak-fit gives the A reference of
  the excerpt. Precision on clean material ±5 cents; on shellac with wow/flutter ±10–15 cents
  (TangoTunes measured CTA transfers at +2.6 Hz ≈ +10–15 cents on average; most listeners can detect
  10 cents with practice).
- **Why "A = 440" is the wrong reference.** 435 vs 440 Hz is only 20 cents; 440 vs 442 is 8 cents.
  Per-session historic pitch (435 before 1939 at Victor/D'Arienzo and until end-1943 at Odeon; 440
  afterwards; 441–442 from the mid-1950s) must come from an era/label prior, and a deviation smaller
  than 25 cents from the *nearest* plausible reference is unclassifiable from audio alone.
- **Rule for the speed check (also `audio_model.json.speedCheck`).** Combine three independent
  signals: (1) `centsFromReference` of the tuning estimate against the era prior; (2) duration ratio
  `durationSec / referenceDurationSec` where the reference is a trusted discography duration
  (tango-dj.at, tango.info track duration, or the median of other editions in our caches) — a 3 min
  tango sped from 435 to 440 is ~2 s shorter, so the ratio detects semitone-class errors (3–6 %)
  but not 20-cent ones; (3) BPM relative to the orchestra prior. Flag `speedSuspect` when
  |cents| > 35 **and** the duration ratio agrees in sign (|ratio − 1| > 1.5 %); flag
  `speedConfirmed` when additionally the BPM deviates > 3 % from the median BPM of other editions of
  the same recording. Half-semitone drifts *inside* a side (Odeon 1937) show as tuning drift between
  the first and last 10 s of the preview: report `tuningDriftCents`. Accuracy: **medium** for
  semitone-class errors, **low** for sub-20-cent classification.

### 1.12 Transfer quality: noise floor and bandwidth

- `noiseFloorDb` = 5th percentile of frame RMS (dBFS) relative to the 50th percentile (measured
  −14.9 dB and −14.3 dB on the two probes: nearly identical dynamics despite the 3.5 LU gain
  difference); surface SNR of shellac is typically ~30 dB (acoustics.org). `bandwidthHz` = 95 %
  roll-off; `hissLevelDb` = energy 6–10 kHz relative to 0.5–2 kHz; `clickDensity` = impulsive onsets
  < 3 ms not aligned to the beat grid. Together they give a 0–100 `transferScore` used for duplicate
  ranking and for the scorer's "source/transfer quality" factor (currently proxied by curator
  selection and Spotify resolvability). Accuracy **medium** (edition-specific, codec-biased; compare
  within provider).

---

## 2. How the features feed the engine

### 2.1 Pair compatibility inside a tanda (consecutive tracks)

The tanda already satisfies the hard constraints (one orchestra, one rhythm, one vocal mode, ≤ 4–6
years). Audio adds a soft **pair score** `S(a,b)` in 0–100 for each consecutive pair, and a **tanda
badge** = mean of the pair scores minus a penalty for the worst pair:

```
S(a,b) = 100 · Σ_i w_i · s_i(a,b)          Σ w_i = 1
badge(tanda) = round( mean(S_pairs) − 0.5 · (mean(S_pairs) − min(S_pairs)) )
```

Factor sub-scores `s_i ∈ [0,1]` (all linear ramps, clamped):

| factor | weight | sub-score |
|---|---|---|
| tempo | 0.30 | Δ = \|bpm_a − bpm_b\| (quarter-note, folded). s = 1 while Δ ≤ 0.5·D; falls to 0 at 2·D, where D = `bpmDeltaMax[rhythm]` (tango 8, vals 12, milonga 7 ≈ 6 % of the pivot tempo, matching the ≤ 6 % ideal / > 12 % clash rule in musicology §1.2). Unknown BPM on either side → s = 0.5 (the scorer already punishes unknowns). |
| loudness | 0.20 | ΔL = \|LUFS_a − LUFS_b\| in LU. s = 1 while ΔL ≤ 2 (`loudnessWindowLU`), 0 at 6 LU. |
| mode/key | 0.10 | `keyRelations[camelotSteps]` table (§2.2). Unknown key → 0.7. |
| brightness | 0.15 | Δ = \|12·log2(centroid_a / centroid_b)\| semitones. s = 1 while Δ ≤ 2, 0 at 8. |
| vocal continuity | 0.15 | same `vocalPresent` → 1; differ → 0 (the hard rule lives in the scorer; here it catches catalogue errors). |
| energy step | 0.10 | ΔE = \|energy_a − energy_b\| (0–100). s = 1 while ΔE ≤ 8, 0 at 25. |

The *shape* of the tanda (hammock, rise) is still decided by `shapeTanda()` on energy; the pair
score only penalises *jumps* the shape did not ask for. Per-rhythm numeric rules beyond tempo:
milonga pairs tolerate ΔE up to 12 (milonga tandas are built slow → fast); vals pairs tolerate a
mode change (major/minor alternation is idiomatic); tango pairs tolerate neither.

### 2.2 Key relation table (Camelot steps → score)

Camelot: number 1–12 around the circle of fifths, letter A = minor, B = major. Steps = minimal
circular distance between numbers; `rel` = same number, different letter (relative keys);
`par` = same tonic, other mode (parallel).

| relation | steps | score | reason |
|---|---|---|---|
| relative major/minor | rel | 1.00 | shares key signature; smooth and still contrasted (Kohl) |
| fifth / fourth | 1 | 1.00 | Kohl's preferred move; classical modulation |
| same key | 0 | 0.70 | harmonic, but "sounds like the same song again" (Kohl); DJs avoid it |
| parallel | par | 0.80 | mode contrast on the same tonic |
| two steps | 2 | 0.85 | whole-tone related; unobtrusive across silence |
| three steps | 3 | 0.75 | |
| four or five | 4–5 | 0.65 | no shared chords; still fine across a cortina-length gap |
| tritone | 6 | 0.55 | the only relation that feels like a different world |

Cortina → next tanda: key weight 0 (nobody hears a key relation across 45 s of pop and shuffling).

### 2.3 Cortina → next tanda compatibility

Separate weights (`compatibility.cortinaToTanda`): energy relation 0.45 (cortina energy should sit
~8 points *below* the next tanda's first track: s = 1 when −14 ≤ E_cortina − E_tanda ≤ −2, 0 beyond
±12 of that band), loudness 0.35 (cortina not louder than the tanda: s = 1 for −3 ≤ ΔL ≤ +1 LU, 0 at
+4 LU louder or −7 LU quieter), brightness 0.20 (same semitone ramp as §2.1, because a
hyper-bright modern pop cortina followed by a 1.1 kHz 1938 transfer is the moment dancers hear the
"old record" instead of the orchestra). Tempo and key: weight 0.

### 2.4 Detecting wrong-speed transfers

As in §1.11; the engine rule: a `speedConfirmed` recording is excluded from tandas unless the
user's library overrides it; `speedSuspect` lowers its selection weight by 30 % and displays a
badge. When several editions exist, prefer the one whose tuning sits closest to the era prior
(435 pre-1939 Victor / pre-1944 Odeon; 440 otherwise; 442 for 1950s D'Arienzo and Pugliese) and
whose duration matches the discography.

### 2.5 Ranking duplicate takes / editions of the same title

Same `normTitle + orchestraId + year±1` → rank editions by
```
editionScore = 0.30·transferScore + 0.25·speedScore + 0.15·dynamicsScore
             + 0.15·labelTier + 0.10·durationScore + 0.05·popularity
```
with `speedScore = 1 − min(1, |cents|/50)`, `dynamicsScore` = 1 for crest ≥ 12 dB and LRA ≥ 4,
0 for crest < 8 (brickwalled), `labelTier` from a small table (TangoTunes, Tango Time Travel,
CTA, Club Tango Argentino, Audio Park, Euro Records "Colección 78 RPM" = 1.0; EMI/Reliquias, RCA/BMG
"Tango Argentino" = 0.7; unknown "Greatest tangos vol. 7" compilations = 0.3), `durationScore` = 1
when within 1.5 % of the discography duration (truncated or faded editions lose). Different *takes*
(two 1941 recordings of the same title) are not duplicates: keep both, flag `altTake`.

---

## 3. "Major notes": what to display per song

Per recording card, in this order (most useful to the DJ first), with units and caveat markers:

1. **Rhythm · BPM** — quarter-note BPM and walking pulse in brackets, e.g. "Tango · 129 (65)";
   vals adds bars/min. Grey if `bpmConfidence = low`.
2. **Energy** 0–100 (engine value, now informed by audio: pulse, tempo, loudness-norm).
3. **Key · mode** — "Dm" / "F"; show the second candidate on hover; mode drives the colour.
4. **Loudness** — "−12.2 LUFS · LRA 5" of the analysed edition; a small Δ when another edition
   differs by > 2 LU.
5. **Brightness** — "warm · 1.3 kHz" (label from corpus percentiles).
6. **Pulse** — 0–100 pulse clarity ("very clear" ≥ 75, "clear" 50–75, "soft" < 50).
7. **Vocal** — instrumental / vocal (from catalogue) with an audio tick when the preview confirms
   it; vocal share only when a full file was analysed.
8. **Intro** — seconds until the first vocal entry; shown only with full-file analysis, otherwise
   "—" (never a preview guess).
9. **Transfer** — 0–100 transfer score with the edition name; speed badge if suspect/confirmed.

**Compatibility badge (0–100)** on each tanda and on each cortina → tanda boundary, computed by the
formula in §2.1/§2.3 and labelled: ≥ 85 "seamless", 70–84 "fine", 55–69 "audible step", < 55
"re-order or swap". On hover: the per-factor sub-scores so the DJ sees *why* (e.g. "loudness −4 LU").

---

## 4. Metadata sources that improve generation, and a merge policy

### 4.1 Sources and what they are good for

| source | strengths | known quirks |
|---|---|---|
| **tango-dj.at** (membership) | ~105,000 recordings; recording dates to the day; singer; sound-quality notes; *edition comparison tool* (unique) | paywalled; its own newsletter admits date confusion for early Donato and questions CTA-derived dates |
| **tango.info** (free) | 100,039 tracks, 40,697 performances, 24,488 works, 11,039 products; TINP/TINS/TINT identifiers (product / side / track; "TIN" renamed 2012); durations per track; links work ↔ performance ↔ product | some "critical mistakes" per DJ community; MusicBrainz Picard plugin exists |
| **Todotango** | biographies, lyrics, sheet music (key signatures!), composer/lyricist, singer tenure years | not a recording database; no durations |
| **El Recodo** (el-recodo.com) | per-recording date, singer, composer, style; fast search; widely used by DJs for dates | JS-gated site (no scraping); community-maintained, occasional decade placeholders |
| **Discographies** (Jens-Ingo Müller's tangoteca D'Arienzo lists, label-by-label) | session date + matrix + catalogue number + singer per side | per-orchestra coverage only |
| **MusicBrainz** | recording-level entity with ISRC links; "first release date" is a *release-group* field, not a session date; 78 rpm singles largely missing; classical style guide for recording dates | coverage of golden-age tango is weak; not viable for mass tagging |
| **Discogs** | release-level year of the *disc* (reissue year, not session); catalogue numbers, label | 78 shellac entries sparse; year is the pressing/reissue |
| **Apple / iTunes Search** | previews, `trackTimeMillis`, `collectionName`; no key needed | `releaseDate` = digital/reissue date (1997-06-26 for a 1936 El Flete); artist strings vary ("Juan D'Arienzo") |
| **Deezer** | previews, `duration`, `isrc`, `release_date` (album), `gain` (replay gain), `bpm` (0 for most old recordings) | artist strings include "Y Su Orquesta Tipica"; singer rarely in title; `release_date` is the reissue |
| **Spotify** | popularity, duration, ISRC, album; previews only on grandfathered apps | `audio-features` and `audio-analysis` deprecated for new apps since 27 Nov 2024 (TechCrunch; developer forum); reissue dates; compilation albums ("Grandes del tango vol. 12") with mislabelled singers and even wrong orchestras; "digitally remastered" dates |

### 4.2 Merge policy (which source wins)

- **Year / date:** session date from (1) tango-dj.at or an orchestra discography with matrix number,
  (2) tango.info performance date, (3) El Recodo, (4) our catalogue index (`yearApprox` flagged
  decade placeholders lose to any dated source), (5) MusicBrainz recording date. **Never** a
  streaming `releaseDate`/`release_date`, Discogs release year or `collectionName` year — those only
  provide a *sanity bound* (`year ≤ releaseYear`) and a reissue-edition label. Conflicts > 1 year
  between (1)–(3) → keep the earliest with `dateConfidence = conflict`.
- **Singer:** tango.info / tango-dj.at performance credit > catalogue index > discography > parsed
  streaming artist/title strings ("con Alberto Echagüe", "canta: …") > Spotify compilation credits
  (never). Audio vocal detection can only *contradict* "instrumental".
- **Title:** catalogue `normTitle` is canonical; streaming titles become aliases for resolving;
  parenthetical qualifiers ("(Remastered)", "(1938)") are stripped before matching; a streaming
  title whose orchestra or year contradicts the catalogue is a *different recording*, not a rename.
- **Duration:** median of trusted editions (tango.info, tango-dj.at) as `referenceDurationSec`;
  each streaming duration stays per edition for the speed check.
- **Orchestra:** catalogue; streaming artist strings mapped through `orchestra_profiles.json.aliases`.

---

## 5. Expected accuracy and how to validate (50-recording sample)

Build `data/validation/audio_sample.json` with 50 recordings that DJs know by heart and that cover
the failure modes: 10 D'Arienzo 1935–39 (435 Hz, in-4, fast), 6 D'Arienzo 1950s (442 Hz, fastest),
8 Di Sarli (1940s and 1950s, slow in-2, legato), 6 Pugliese (rubato, yumba), 5 Troilo 1941–44,
5 Canaro 1930s (incl. 2 vals, 2 milongas), 4 Biagi (vals + milonga), 3 Fresedo, 3 Caló. For each:
BPM tapped by three DJs (median), key from the published sheet music (Todotango partituras) checked
by ear against the recording's actual pitch, mode, vocal/instrumental, session date and duration
from tango-dj.at / tango.info, and a reference-pitch edition note where known (TangoTunes/CTA/TTT).

Targets (both previews, iTunes and Deezer, per recording):

| feature | pass criterion | expected |
|---|---|---|
| BPM after folding | within ±2 % of tapped median | ≥ 90 % (≥ 75 % on Pugliese/late Troilo) |
| metrical level | correct octave | ≥ 97 % |
| mode | matches | ≥ 85 % |
| key | exact / near (relative, fifth, parallel) | ≥ 65 % / ≥ 85 % |
| vocal present | matches catalogue when preview contains singing | ≥ 95 % positive agreement |
| loudness | iTunes vs Deezer preview of the *same edition* within 1 LU; across editions report spread | repeatability ≥ 90 % |
| speed check | known-fast editions flagged, known-good not flagged | recall ≥ 80 %, false-positive ≤ 10 % |
| pulse clarity | rank order D'Arienzo > Di Sarli > Pugliese | Spearman ≥ 0.6 vs DJ ratings |
| style proxy | onset density/regularity vs profile style | ≥ 80 % |

Procedure: `pnpm audio:validate` (to be written) downloads both previews, runs the analyser, writes
per-feature confusion tables and the preview-vs-preview agreement; the benchmark golden set must
stay ≥ 85 after audio factors are switched on (CLAUDE.md invariant), with a vitest invariant per
new rule first (docs/TDD.md).

---

## 6. Beyond audio previews: what else would improve generation (prioritised)

| # | item | why it helps | needs | effort |
|---|---|---|---|---|
| 1 | **Session-date and singer table** merged from tango.info + discographies (§4) | kills the 1,837 decade placeholders and the Spotify reissue years that break the ≤ 4-year tanda rule | scraping with permission / data entry | M (2–3 weeks) |
| 2 | **Edition registry + transfer tier** per streaming track (label tier, loudness, speed badge) | the DJ plays an edition, not a recording; scorer's "source" factor becomes real | §1.12 features on previews | M |
| 3 | **Singer entrance time** (seconds to first vocal) | the DJ cue for position 1 ("instrumental intro suits track 1"); estribillo vs cantor | full files + vocal detector | S–M |
| 4 | **Ending type** (fade / cut / ritardando / big coda) | closer selection in `shapeTanda` (track 4 should "feel complete"); fades are a tell | last 15 s of full files; loudness slope + tempo slope | S |
| 5 | **Phrase structure** (8-bar square vs irregular; A/B/A form; variación detection) | `square`/`irregular` difficulty terms in MUSICALITY; variación → tanda closer | full files; self-similarity matrix + onset-density spike in final 15 % | M–L |
| 6 | **Lyrics theme** (todotango lyrics → theme classes: nostalgia, abandono, arrabal, humor, patriotic; and *inappropriate* titles for Valentine's/memorial nights) | context factors (holiday, mood) and estribillo meaning for the room | lyrics corpus + LLM classification, cached | M |
| 7 | **Local tempo curve** (rubato %) from full files | difficulty term; separates Pugliese 1940s from 1950s | full files | S once 3–5 exist |
| 8 | **Dance-floor telemetry** (how many couples stand up per tanda; via the DJ's tap, a camera count, or wearable) | the only ground truth for energy and danceability; closes the loop on the benchmark | app UI + consent; optional CV | L |
| 9 | **Crowd-sourced DJ corrections** (BPM, key, speed verdicts) in the user layer, aggregated | cheaper than any detector on the hard cases | sync + moderation | M |

---

## 7. Implementation notes

- Analyser: run in the browser (Web Audio + a WASM build of Essentia.js or a small TS pipeline:
  STFT → onset envelope → autocorrelation/comb tempo with folding; HPCP → tuning → Temperley key;
  BS.1770 loudness; centroid/roll-off/noise floor) so the BYOK rule holds (no audio ever leaves the
  user's machine, no server-side keys). Cache results in `data/cache/audio/{provider}/{trackId}.json`
  and the user layer, keyed by *edition* (provider track id), never by song id alone.
- Both previews when available; majority/agreement logic in §1.1.
- Keep the existing orchestra priors as fallback; audio overrides only where `confidence ≥ medium`.
- Vitest invariants before any rule change: folding keeps BPM inside the rhythm window; pair score is
  symmetric; badge ≤ 100 and monotone in each factor; `speedConfirmed` requires two agreeing signals.

---

## 8. Sources

Peer-reviewed / MIR (via Consensus and ISMIR proceedings):

- [C1] McKinney, Moelants, Davies, Klapuri, "Evaluation of Audio Beat Tracking and Music Tempo Extraction Algorithms", J. New Music Research 2007 — https://consensus.app/papers/details/d310a0236ddf511db4f6ce5a7d962b8c/
- [C2] Schreiber, Müller, "A Post-Processing Procedure for Improving Music Tempo Estimates Using Supervised Learning", ISMIR 2017 — https://consensus.app/papers/details/112618681235508cad27e008685eff68/
- Schreiber, Müller, "A Single-Step Approach to Musical Tempo Estimation Using a Convolutional Neural Network", ISMIR 2018 (Table 1: Ballroom Acc1 92.0 / Acc2 98.4 for the CNN; 84.0 / 98.7 for Böck; input 11.9 s) — https://ismir2018.ismir.net/doc/pdfs/141_Paper.pdf
- [C3] Kania, Kania, Łukaszewicz, "A Comparison of the Music Key Detection Approaches Utilizing Key-Profiles with a New Method Based on the Signature of Fifths", Applied Sciences 2022 — https://consensus.app/papers/details/a7459a27b8e95ef4a6c3ec9e3a31ce64/
- [C4] Pauws, "Musical key extraction from audio", ISMIR 2004 (75.1 % exact, 94.1 % near keys) — https://consensus.app/papers/details/60e30549aa3b5e88964c2cfaf4e32164/
- Peeters, "MIREX-2011 Audio Key Detection: ircamkeymode" (36-bin chroma 100–2000 Hz, harmonic triad templates, first 20 s) — https://consensus.app/papers/details/fe1827781ef4527f8565356c1ab33168/
- Faraldo, Gómez, Jordà, Herrera, "Key estimation in electronic dance music", ECIR 2016; Essentia `Key` docs on `edma`/`edmm` profiles and tuning correction — https://essentia.upf.edu/reference/std_Key.html
- [C5] Gebhardt, Davies, Seeber, "Psychoacoustic Approaches for Harmonic Music Mixing", Applied Sciences 2016 — https://consensus.app/papers/details/eeeecd24805c5f2dac3b07bc8eb6d1f6/
- Sahir, "AudioMix: feature-based playlist sequencing" (tempo, loudness, spectral energy, tonal distance, timbre as transition cost; N = 45 listener test) — https://consensus.app/papers/details/3671278d3d55576ca90dbb8c749b8b3c/
- [C6] Monir, Kostrzewa, Mrozek, "Singing Voice Detection: A Survey", Entropy 2022 — https://consensus.app/papers/details/ed3f4e65b9d35852a4d0a405930acedf/ ; Zhang et al., "Singing Voice Detection Based on LRCN with Vocal Separation and Temporal Smoothing", Electronics 2020 — https://consensus.app/papers/details/9a4f27987e555e72bfdaf639b2ba3be6/ ; Schlüter & Lehner CNN figures (Jamendo 0.923, RWC 0.927) as tabulated in https://arxiv.org/pdf/2004.04040
- [C7] Lartillot, Eerola, Toiviainen, Fornari, "Multi-Feature Modeling of Pulse Clarity", ISMIR 2008 — https://consensus.app/papers/details/82d677925d795a5a930a73c8c5ed99f1/
- [C8] Solé, "A Manual Bar-by-Bar Tempo Measurement Protocol for Polyphonic Chamber Music Recordings", 2026 (automated beat tracking fails on historical polyphonic recordings) — https://consensus.app/papers/details/d70c9798b8bc5711b90c1f542d5b0465/
- [C9] Stupacher, Hove, Janata, "Decrypt the groove: audio features of groove", 2014 — https://consensus.app/papers/details/242e41fcebd75991800ab082600c92fd/
- [C10] Carraturo et al., "The major-minor mode dichotomy in music perception", Physics of Life Reviews 2024 — https://consensus.app/papers/details/ce80a6abd60f5f9c9818e3dd6d836fff/
- Irigaray et al., "MagTapeDB" (ENF-based playback-speed correction of historical recordings), 2025 — https://consensus.app/papers/details/8211746fde2c5e8083eb9a4f54c9e34b/
- EBU Tech 3342 v4 (LRA: 3 s short-term, −70 LUFS absolute gate, −20 LU relative gate, P95 − P10; reduced precision on short programmes) — https://tech.ebu.ch/docs/tech/tech3342.pdf ; EBU R 128 — https://en.wikipedia.org/wiki/EBU_R_128
- Fitzgerald, "Harmonic/percussive separation using median filtering", DAFx 2010 (HPSS used for the sustained/percussive ratio).

Tango practice and transfer sources:

- Tango Music Secrets, "What's all the fuss about pitch?" (435 Hz bandoneóns; D'Arienzo 3 Mar → 18 Apr 1939 switch; Odeon 435 until end-1943; 1950s 441–442 Hz; 1960s LPs ~2/3 semitone fast; 77.92 rpm) — https://www.tangomusicsecrets.co.uk/transfers/whats-all-the-fuss-about-pitch/
- Jens-Ingo Müller, "D'Arienzomania" (Akkerman thesis; TangoTunes/Frank Jin: CTA transfers +2.6 Hz ≈ 10–15 cents; pitch jump 435 → 440 in 1939; Golden Ear Edition retuned in the analog stage) — http://jens-ingo.all2all.org/archives/1794
- Tango Time Travel, "Method of restoration" (77.92 rpm reference; per-record speed correction; label-specific de-emphasis) — https://tangotimetravel.be/method-of-restoration/
- Barry Hashimoto, "From Bootlegs to Brilliance" (8–10 kHz roll-off of shellac transfers; wow/flutter; compressed bootleg collections) — https://www.barryhashimototangoarts.com/p/from-bootlegs-to-brilliance
- Tomáš Kohl, "How to create contrast with harmonic mixing" and "How I mix vals tandas" — https://tomaskohl.com/tango/harmonic-mixing-in-tango-djing/ , https://tomaskohl.com/tango/how-i-mix-vals-tandas/
- tango-dj.at, "Which is the best Argentine tango database?" (105,000 recordings; comparison) — https://tango-dj.at/Which%20is%20the%20best%20argentine%20tango%20database.pdf ; tango-dj.at newsletter on Donato date confusion — https://tango-dj.at/mailings/2011/December2011.htm
- tango.info identifiers (TIN → TINP/TINS/TINT, 2012) — https://tango.info/wiki/TIN ; site counts — https://tango.info/
- pspatialaudio, "Historical recording characteristics" (label EQ turnovers) — https://www.pspatialaudio.com/record_characters.htm ; acoustics.org on 78 surface noise (~30 dB SNR) — https://acoustics.org/pressroom/httpdocs/147th/brock.html
- Apple iTunes Search API result keys (`previewUrl`, `trackTimeMillis`, `collectionName`) — https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/UnderstandingSearchResults.html ; Deezer track object probed live (`preview`, `duration`, `isrc`, `release_date`, `gain`, `bpm`) — https://api.deezer.com/track/3135556
- Spotify Web API changes of 27 Nov 2024 (audio-features / audio-analysis unavailable to new apps) — https://techcrunch.com/2024/11/27/spotify-cuts-developer-access-to-several-of-its-recommendation-features/ ; Spotify community on reissue release years — https://community.spotify.com/t5/Content-Questions/Bug-report-wrong-dates-for-countless-albums/m-p/7164056
- DJ-community key-detection comparisons (Mixed In Key ~76–90 %, Traktor/KeyFinder ~72 % with relative keys counted) — https://djtechtools.com/2015/11/16/key-detection-software-comparison-2015-edition
- Live measurements in this note: iTunes and Deezer previews of D'Arienzo "El flete" fetched 2026-10-19, analysed with ffmpeg `ebur128` and a numpy spectral-flux autocorrelation (script kept in the session scratchpad, not committed).

## 9. Validating `audio_model.json`

```
python3 -I - <<'EOF'
import json,math
m=json.load(open('data/knowledge/audio_model.json'))
w=m['compatibility']['weights']; assert abs(sum(w.values())-1)<1e-9
c=m['compatibility']['cortinaToTanda']['weights']; assert abs(sum(c.values())-1)<1e-9
ids=[f['id'] for f in m['features']]; assert len(ids)==len(set(ids))
for f in m['features']: assert f['accuracy'] in ('high','medium','low') and isinstance(f['fromPreview'],bool)
assert set(m['compatibility']['bpmDeltaMax'])=={'tango','vals','milonga'}
assert all(0<=v<=1 for v in m['compatibility']['keyRelations'].values())
print('ok', len(ids), 'features')
EOF
```
