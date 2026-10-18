# Goal

**TDJ turns "I have a 4-hour milonga on Saturday" into a set a headline DJ would sign**: coherent tandas, a night-long energy arc, cortinas that cue the floor, and one-click export to Spotify or any DJ app.

## North-star metrics
| Metric | Target | How measured |
|---|---|---|
| Benchmark score of a default 4 h golden set | ≥ 85 / 100 ("headline marathon DJ") | `docs/BENCHMARK.md` rubric, computed in `packages/core/src/score.ts` |
| Tanda integrity violations | 0 | vitest invariants (`packages/core/test`) |
| Time from open → exported set | < 60 s on a phone | Playwright e2e timing |
| Catalogue coverage resolvable on Spotify | ≥ 70 % of golden-age tandas | `data/cache/spotify/tracks.json` hit rate |
| Human review (musician + DJ agents) | no "machine-made tells" in top 5 | `docs/reviews/` |

## Non-goals (for now)
Audio playback inside TDJ, mixing/beat-matching, live floor sensing, selling music.
