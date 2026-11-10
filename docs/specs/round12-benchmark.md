# Round 12 — benchmark any night against published DJ sets, then improve it

Until now a person compared the featured night to 11 published sets by hand (docs/reviews/benchmark-reference-sets.md)
and applied the fixes. This round makes the platform do it for **any** composed night:

- `benchmarkNight(p)` in `packages/core/src/benchmark.ts` measures the night against reference ranges kept in
  `data/knowledge/benchmark.json`. Each range has a `source` line.
- `improveNight(p, deps)` runs fixers in a loop. A change is kept only when nothing gets worse.
- Web: `POST /api/benchmark`, `POST /api/improve`, a "Benchmark · published DJ sets" row on the result card, and a
  sheet with "Improve automatically", Keep and Undo.

## The checks

The night's length comes from its real durations: the opening, every side, every cortina and the closing. It does
not come from the tanda count or `stats.durationSec`. "Per 4 h" figures scale by that length. Statuses are `ok`
(inside the range), `near` (just outside) and `off`. `total` is the weighted share of checks in range (near counts
half), from 0 to 100. The row shows `inRange/scored`. Informational checks (`info: true`, weight 0) are never a
failure and are not counted.

| key | measures | reference range | near | weight | source |
|---|---|---|---|---|---|
| `darienzo` | D'Arienzo tandas (all rhythms) per 4 h | golden-only nights 3–4; other nights 0–3.8 | ±1 | 2 | Common patterns §1 |
| `orchestras` | distinct orchestras | 12–19 per 4 h, scaled by hours (median 14) | ±2 | 2 | §2 |
| `vals` | vals share of the tandas | 6–19 % | ±4 pts | 1 | §3 |
| `milonga` | milonga share of the tandas | 4–24 % | ±4 pts | 1 | §3 |
| `pugliese` | Pugliese count and earliest position (1-based i / n) | ≤ 1 per 4 h, at ≥ 0.48 (median 0.89); absent is fine (4 of 11) | 0.40–0.48 | 3 | §4 |
| `cumparsita` | La Cumparsita closes (closing track or last side) | 88 % of sets | not requested → near | 2 | §5 |
| `canon` | Di Sarli, Biagi, D'Arienzo, Donato each have a tanda | all four | three | 2 (golden eras; info otherwise) | §6 |
| `golden` | tandas whose years sit inside 1935–45 | ≥ 60 % | ≥ 45 % | 1 (golden eras) | §6 |
| `instrumental` | instrumental tandas in each clock hour | ≥ 1/3 every hour | every hour ≥ 15 % | 3 | Victor Tran; the near floor is what the published sets themselves run (A, B, C: about 10–35 %) |
| `spacing3` | an orchestra, or a singer, in two of any three consecutive tandas | none | one | 2 | Victor Tran |
| `cycle` | tandas off the TTVTTM cycle | 0 | ≤ 2 | 2 | §3, Victor Tran |
| `sizes` | vals and milonga tandas that are not 3 songs | 0 | ≤ 2 | 1 | §3 |
| `cortinaLength` | cortina lengths | 30–90 s | mean in range | 1 | Demirbaş 2018 |
| `cortinaCulture` | share of Turkish cues | international, with Turkish cues as accents | — | 0, info | §7: an all-Turkish night is a stylistic choice, not a failure |

How hours are counted for `instrumental`: a tanda belongs to the clock hour in which its midpoint falls. A last hour
with fewer than 3 tandas joins the hour before it (`hourlyInstrumental`).

## The fixers (`improveNight`)

Each fixer proposes atomic candidates against the current night. Each candidate changes one tanda or swaps one pair
of cues.

- **stream-suspect**: a side whose catalogue row is `streamSuspect` is replaced by the best clean side of the same
  family. Same family means same orchestra, rhythm, singer and vocal flag, years ±1, a title not already in the night,
  and the highest fame first, then the closest energy.
- **roles**: a corpus opener that closes its tanda swaps with a closer or a non-opener. A closer that opens its tanda
  swaps with an opener or a non-closer. A Cumparsita última keeps its last place.
- **instrumental**: runs only for hours below 1/3. A vocal tango tanda in that hour (not locked, not the última, not
  a birthday tanda) becomes an instrumental tanda by the same orchestra:
  - years within ±2 of the old tanda, inside one ≤ 4-year window;
  - sides not yet in the night, danceable, dated;
  - no `streamSuspect`, `reissue`, `yearApprox` or transcription side;
  - fame ≥ 2 on all sides but one (3 of 4);
  - running order: a corpus closer last when present, openers never last, the highest-fame side third.

  Two of the night's own rules always hold. First, the vocal floor of the tango tandas (`rules.vocalShare`, golden
  55 %) is never crossed. Second, `maxInstrumentalBeforeVocal` is respected.
- **cue-fit**: these rules come from rounds 10 and 11.
  - The cue into a tanda of energy ≥ 75 is `tempo:up` or `tempo:medium` and at least e60.
  - The cue before a vals or milonga is never `tempo:slow`.
  - The cue into Pugliese is moody (≤ e70, not up).
  - The cue after Pugliese is up-tempo (≥ e70).

  The fixer first swaps the cue with another gap's cue, and only when that does not make the other gap worse. Each gap
  keeps its own length. Only when no swap works does it take a new cue from a family the night already uses. It never
  adds a family.

After every candidate, the changed tanda's fields are recomputed from its sides: energy mean, energy curve, year range,
and duration (shifted by the change in side lengths, so a saved night keeps its own convention). The stats come from
`computeStats`, with any opening or show-break offset carried over, and the score from `scorePlaylist`. The booth plan
is re-timed once at the end (`attachBooth`).

## Acceptance rule

A candidate is kept only if all three hold:

1. The engine score (`scorePlaylist`) is not below the current score. The starting bar is the night's stored total.
2. The benchmark total is not below the current total.
3. It brings no hard failure (`hardFailures`) that the starting night did not have.

The loop runs the fixers in order: stream-suspect, roles, instrumental, cue-fit. Each fixer repeats until it has no
acceptable candidate left, and a full round repeats up to 8 times while anything changes. Rejected candidates are not
retried in the same pass. The result is `{ playlist, changes, before, after }`. `before` and `after` each hold
`{ score, bench, inRange, scored }`, and every change is one plain-language line, for example: "Tanda 16: Aníbal Troilo
/ Francisco Fiorentino → Aníbal Troilo instrumental 1941–44 so hour 3 is 50 % instrumental".

Fixers never move a tanda or change its orchestra or rhythm. So orchestra caps, spacing, the TTVTTM cycle and title
uniqueness hold by construction, and `packages/core/test/benchmark.test.ts` asserts all of them.

## Web

- `POST /api/benchmark` with `{ playlist }` (or the bare playlist) returns `{ total, checks, inRange, scored }`.
- `POST /api/improve` with `{ playlist, overrides? }` returns the `improveNight` result. It uses the same catalogue and
  user overrides as `/api/compose`.
- Both routes have the same-origin guard (`crossOriginResponse`).
- Result card: the row "Benchmark · published DJ sets" shows "12/13 in range" ("12/13" on phones; the full text is in
  its aria-label). The benchmark is computed in the browser from the shown set.
- The sheet (`components/BenchmarkSheet.tsx`) lists every check with its status dot, our value, the reference range
  and the source line. Its pinned primary button is "Improve automatically", and it shows progress while it runs.
- When improve finishes, the sheet shows the summary "Engine 93 → 93 · Benchmark 12/13 → 12/13" and the change list.
- **Keep** replaces the store's playlist, so Export and the booth use it. It also adds a history snapshot, marks the
  changed tandas, and shows a toast with Undo. **Undo** throws the proposal away.
- No new AI calls.

## Tests

- `packages/core/test/benchmark.test.ts`:
  - the featured night has no `off` check;
  - the benchmark is pure and every check has a source;
  - hours come from durations;
  - an early Pugliese and a missing Cumparsita are flagged;
  - over seeds 1–20 (golden 4 h), improve never lowers the score or the benchmark and adds no hard failure;
  - caps, spacing, cycle and titles are kept, golden and vocal-heavy;
  - vocal-heavy nights gain instrumental share per hour;
  - cue-fit adds no family and lengths stay with their gaps;
  - improve is deterministic and leaves its input untouched.
- `apps/web/e2e/benchmark.spec.ts`:
  - the featured night: the sheet's checks, no `off`, a 44 px primary button;
  - a vocal-heavy night: Improve, Keep, the kept set's checks update, and Undo on a second run.
