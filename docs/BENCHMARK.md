# Benchmark: how close is a TDJ set to the best milonga playlists in the world?

Reference research: `docs/research/dj-benchmark.md` (benchmark DJs, public tanda playlists, regional norms) and `docs/research/musicology.md`.

## Computable rubric (implemented in `packages/core/src/score.ts`)
| Key | Criterion | Weight |
|---|---|---|
| integrity | one orchestra, one rhythm, vocal/instrumental not mixed per tanda | 12 |
| singer | ≤ 1 singer per tanda | 6 |
| era | year span ≤ 4 (large catalogues) / ≤ 6 | 8 |
| sizes | tango 4 · vals 3–4 · milonga 3 | 5 |
| cycle | TTVTTM; vals/milonga never adjacent; milongas spaced | 8 |
| spacing | no orchestra repeated within 6 tandas | 8 |
| variety | distinct orchestras ≥ 3.5 per hour | 6 |
| titles | no repeated title | 3 |
| tempo | BPM drift ≤ 6 % inside a tanda (when BPM known) | 5 |
| arc | RMSE of tanda energy vs target curve; Pugliese after 50 % | 10 |
| cortina | present after every tanda but the last; 25–60 s | 5 |
| source | curator "SELECCIÓN" share + Spotify resolvability (proxy for transfer quality) | 8 |
| ending | strong última tanda + La Cumparsita | 4 |
| duration | within ± 4 min of the requested hours | 3 |

Grades: **≥ 85 headline marathon DJ · 70–84 solid regular DJ · 55–69 enthusiastic amateur · < 55 Spotify radio**.

## What still needs human ears (30 % of the real rubric)
Opener/closer feel of each tanda, key/mood flow, transition logic between tandas, transfer quality, fit to the room. The "Ask the AI DJ" button (BYO Anthropic key) gives a first-pass review; the agent reviews in `docs/reviews/` are the baseline.

## Factors to add next (from the DJ and musician reviews)
BPM/key per recording (in-browser beat detection on previews), transfer tier tags per label (TangoTunes > CTA > El Bandoneón > …), regional presets, request queue, floor-feedback knob.
