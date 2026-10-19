# Benchmark: how close is a TDJ set to the best milonga playlists in the world?

Reference research: `docs/research/dj-benchmark.md` (benchmark DJs, public tanda playlists, regional norms) and `docs/research/musicology.md`.

## Computable rubric (implemented in `packages/core/src/score.ts`)

Round 4 rebuilt the rubric around what the DJ panel measured by ear (`docs/reviews/round4-generation.md` §1.16). Factors that cannot be measured for a set carry weight 0 and leave the denominator, so missing BPM/source data neither inflates nor deflates the total.

| Key | Criterion | Weight |
|---|---|---|
| integrity | one orchestra, one rhythm, vocal/instrumental not mixed per tanda | 10 |
| singer | ≤ 1 singer per tanda | 5 |
| era | year span ≤ max(option, 4) for 4-track tandas / ≤ 6 | 6 |
| sizes | the *requested* sizes (a práctica's 3-track tangos are standard; the two-Cumparsita última is exempt) | 4 |
| cycle | V/M never adjacent; milongas spaced | 6 |
| spacing | no orchestra repeated within the option's `orchestraRepeatGap` | 6 |
| variety | distinct orchestras ≥ 3.75 per hour (corpus: ~15 per 4 h) | 5 |
| titles | no repeated title | 2 |
| tempo | BPM drift inside a tanda, graded 6 % → 16 %; audio BPM folded into the rhythm's octave, implausible values ignored | 4 or 0 |
| cohesion | analysed-audio cohesion (unchanged) | 4 |
| arc | RMSE of tanda energy vs target; Pugliese after 50 % | 8 |
| fame | share of tracks in the reference corpus | 5 |
| darienzo | first D'Arienzo tango tanda ≤ 35 % (0.4) and instrumental 1935–39 (0.3), 2–3 per 4 h (0.3) | 6 (golden presets) |
| ultima | energy ≥ target−4 (0.6) and orchestra in the corpus closer pool (0.4) | 5 |
| cumparsita | closing version: corpus year for the orchestra, no placeholder | 3 |
| placeholders | undated (`yearApprox`) tandas and tracks kept out | 3 |
| roles | corpus openers open, closers close (tandas with known roles) | 4 or 0 |
| steps | steps between tandas ≤ 14 beyond what the arc planned | 4 |
| cortina | present, length as set ±8 s, one family (two above 12 tandas), energy ≤ 20 off the next tanda, era fit (pre-1936 for Guardia Vieja, no 2015+ cue unless trend) | 6 |
| source | curator selection + resolvable streams | 5 or 0 |
| context | milongas under heat, avoided/preferred styles, vocal lean after midnight | 3 or 0 |
| obscure | fame-0 vocal families after 20 % of the night | 4 |
| ending | tango última ≥ 60 + La Cumparsita | 3 |
| duration | within ± 4 min of the requested hours | 3 |

Grades: **≥ 85 headline marathon DJ · 70–84 solid regular DJ · 55–69 enthusiastic amateur · < 55 Spotify radio**. The default 4 h golden sets (seeds 1–12) score 86–91 after round 4; the invariant `test/round4.test.ts › C15` keeps them ≥ 85, and the 12-seed template check (first D'Arienzo, última energy, Pugliese position, cortina repeats, orchestra Jaccard) is the regression metric for "the same night twelve times".

## What still needs human ears (30 % of the real rubric)
Opener/closer feel of each tanda, key/mood flow, transition logic between tandas, transfer quality, fit to the room. The "Ask the AI DJ" button (BYO Anthropic key) gives a first-pass review; the agent reviews in `docs/reviews/` are the baseline.

## Factors to add next (from the DJ and musician reviews)
BPM/key per recording (in-browser beat detection on previews), transfer tier tags per label (TangoTunes > CTA > El Bandoneón > …), regional presets, request queue, floor-feedback knob.
