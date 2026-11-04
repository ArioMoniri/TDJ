# Round 8 — engine changes (from the working-DJ review)

Source: `docs/reviews/round8-dj.md` (§2 regressions, §3 product gaps, §4.1 generation enhancements, §5 embarrassments).
Every rule below landed with its invariant first in `packages/core/test/round8.test.ts` (32 tests); the round-4
suite stays green (one expectation updated, see §6). Evidence: the review's nights re-composed through `compose()`
with the same options and seeds, before and after, in the session scratchpad (`r8e/before`, `r8e/after`).

## 1. What changed

| # | Review item | Engine change | Invariant |
|---|---|---|---|
| 1 | "Tell the DJ" turned 4 h into 53 min and said "Applied" (§3.1, §4.2.1) | `refineOptions()` / `refineWithGuard()` (`src/refine.ts`): "more X" → `preferOrchestras` (×3, pool untouched), "no X" → `excludeOrchestras` with locked tandas called out, "only X" → `includeOrchestras` under the guard. The guard composes the result (fixed seed) and refuses any night shorter than 90 % of the request: it relaxes *only* → *prefer*, then drops the new exclusions, then keeps the previous options with `notApplied: ["Could not fill 4 h with: …"]`. `apps/web/src/app/api/ai/refine/route.ts` calls it on both the keyword and the model path; the model's `includeOrchestras` is read as "more" unless the DJ said *only/just/nothing but*. | R1 ×3 |
| 2 | Troilo "inéditos" (undated, `1940/70`) as the BA última; Sánchez Gorio "1960~" ×4 in post-golden (§1.2, §2, §5.1) | `isTandaEligible()`: a tanda row is dated (no decade placeholder, no missing year, no `YYYY/YY` range > 2 years) and a studio side (`transcription` flag from the index: INÉDITO, TOMA RADIO/VIVO/TV/BAILE, EN VIVO, ACETATO, EN JAPÓN, ENTREVISTA). Applied in `compose`, `swapTanda`, `swapTrack`, the BA own-Cumparsita and the closer. `rules.allowUndated` opts in. | R2 ×7 (5 presets × 6 seeds × default/BA rules, swap) |
| 3 | *Milonga de la azotea* and *Milonga con variaciones* inside tango tandas; Pugliese *Farol* 1943 "instrumental"; 2 396 duplicate groups; Pugliese 1959 Cumparsita "Guido–Maciel" (§4.1.2, §5.2, §3.5) | `songRhythm()`: index rhythm first, title "Milonga …"/"Vals …" as a last resort, checked per song in `buildTanda` and in the scorer. `scripts/build_index.py`: duplicates merged by (orchestra, title, year, singer) keeping the best-sourced row (dated, selection, not a transcription; dropped ids kept as `altIds` so user edits still resolve); a singer row and an "instrumental" row of the same recording date fold into the vocal row; curated `SINGER_OVERRIDE` (Pugliese La Cumparsita 1959 → instrumental). 21 932 → 19 119 rows, 1 296 transcriptions flagged. | R3 ×3 |
| 4 | *Rawson, Ataniche, Joaquina, Jueves* in 7/8 seeds; slot-3 vals +15–22 over target (§2, §4.1.3–4) | First D'Arienzo: a seeded draw among the top window (fit, fame, canon, recent-memory penalties still rank; `w^0.75`, sides within ±14 of the target) instead of the greedy top four; D'Arienzo's tango waits for his drawn slot. Warm-up vals/milonga (≤ 20 %): families whose `need` coolest sides sit > 8 over target are out while three cooler ones remain. The planned D'Arienzo peak is followed by a glide (next two targets ≥ e−9 / e−15) instead of a −24/+25 sawtooth. | R4 ×3 |
| 5 | Two cortinas alternating 21 slots; *Last Last* ×12; *Boum!* ×7–9 (§2, §4.1.11, §5.4) | `distinctCortinasNeeded()` = 8 per 4 h (4 for a short práctica); a pool below it falls back to `eraMatchedCortinas()` and `stats.cortinaFallback` says so; `pickCortina` never returns the last cue twice in a row; the fitted extra tanda gets its own cue; built-in and knowledge duplicates (two "Boum!" ids) are one cue. Turkish family grown from 2 trend / 11 total to 10 trend / 36 total cues, resolved on Deezer (`scripts/resolve_cortinas.ts` → `data/cache/resolve/cortinas.json`, attached as `Cortina.resolved`). | R5 ×7 |
| 6 | 6 h marathon: last third e55–66 for t75–85, Pugliese spent at 61 %, vocal ratio 0.88 (§1.3, §4.1.6–7) | `marathon-plateau`: peak phase until 95 % and a real second rise at 85 %; Pugliese `notBefore` ≥ 0.6 in long nights (cap 2 kept); nights ≥ 5 h get `vocalBias −0.12` unless explicit; context model: marathon −0.08, advanced −0.03, after midnight +0.02. | R6 ×2 |
| 7 | 90/100 above a bootleg última; 72/100 for a 53-minute night (§3.8, §4.1.15) | `hardFailures()` → `ScoreCard.reasons[]`, total capped at 60: undated/transcription tanda (named when it is the última), wrong rhythm inside a tanda, duration > 10 % off, Pugliese/orchestra cap broken. | R7 |
| 8 | Hiding *Jueves* hid the wrong copy (§3.5, §4.2.5) | `Catalog`: `songs[id].hidden` hides every copy of that orchestra + title (`hideKey()`), `hiddenScope: "copy"` hides that row only, `overrides.hiddenTitles[]` keys work directly; patches keyed by merged `altIds` still apply. | R8 |
| 9 | Traktor `FILE="Francisco Canaro / Roberto Maida - Ciego.mp3"` (§4.2.10) | `toTraktorNML` sanitises artist and title like M3U8/Rekordbox. | R9 |
| 10 | Canaro/Alonso 1951 singing the closing Cumparsita; Di Sarli instr 1940 at 7 and 14; D'Arienzo–Echagüe twice (§1.3, §2) | Standalone closer: dated studio instrumental only. `ctx.usedFamilies`: the identical family (orchestra, singer, overlapping years, rhythm) a second time is ×0.08. D'Arienzo's vals/milonga are held after 60 % when the última rule is `d-arienzo-rhythmic`. | regressions ×2 |
| + | Explicit arc shape (coordinator) | `arcShape: "single" \| "double"` (and `yearRange`) on `ComposeOptions`; `arcTarget(x, arc, mood, shape)`: double = summits at 42 % and 80 % with a ≥ 8-point breather at 61 %, última highest, neighbours within ±6 outside climbs; `arcShapeFor()` falls back to single under 3 h. | R10 ×2 |

## 2. Before / after on the review's own nights (same options and seeds, `compose()` directly)

| Night | Before | After |
|---|---|---|
| First D'Arienzo tanda, S1–S8 | *Rawson/Ataniche/Joaquina/Jueves* ×7, *…Trago amargo* ×1 | 8 distinct title sets (e.g. *Derecho viejo/El irresistible/Hotel Victoria/Trago amargo*, *Ataniche/La payanca/Trago amargo/Unión cívica*); the review's four never appear together |
| Slot-3 vals, S1–S8 | Rodríguez–Moreno e72–73 / Di Sarli–Rufino e69 for t51 (5/8 at +18–22) | Canaro–Maida e57–59, Lomuto–Díaz e54–57 for t51 (8/8 within +8) |
| BA Saturday (seed 174088444) última | Troilo "inéditos" *Racing Club / El apache / Milonga de la azotea / Recuerdo*, "year ?", score 90 | Biagi–Duval 1951–54, dated, Pugliese 1959 instrumental Cumparsita; score 90 with no hard failure |
| Post-golden seed 12 | Sánchez Gorio "1960~" ×4 with *Milonga con variaciones*, 5 D'Arienzo, score 74 | no undated tanda, 4 D'Arienzo, score 80 |
| Turkish + Greek trend cortinas | *Dünya Dönüyor* ×10 / *Roman* ×10, back-to-back 11× | 9 distinct Turkish cues in 21 slots, 0 back-to-back, no fallback |
| Heat (afrobeats) | *Last Last* ×13, back-to-back 6× | 12 distinct, 0 back-to-back, `cortinaFallback` reported (4-cue pool → era-matched) |
| Práctica 2 h | *Boum!* ×3 in 10 (two ids) | 6 distinct in 10, 0 back-to-back |
| 6 h marathon (seed 11, late night, advanced) | vocal 0.85; Pugliese at 61 % and última; last third e55–66 for t75–85 | vocal 0.45; Pugliese at 66 % and 88 %; last third mean within 6 of target, second peak e≥72 at 75–92 % |
| Default S1–S8 scores | 87–92 | 89–92 (no hard failures) |
| Core tests | 170 | 202 (+32 round-8); benchmark golden S1–S12 ≥ 85 kept (C15) |

The score cap: the BA night *as the review saw it* (undated última) now scores ≤ 60 with the reason printed
(R7 builds that case synthetically; the engine no longer produces it).

## 3. The user's night: 4 h golden 1935–45, 4-tango tandas, Turkish cortinas, double peak, high energy

Options iterated over 60 seeds with `/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/r8e/best.ts`:
`{ hours: 4, eras: ["golden"], yearRange: [1935, 1945], tangoTandaSize: 4, cortinaCultures: ["turkish"],
arcShape: "double", floorMood: "balanced", context: { mood: "energetic", event: "milonga", timeOfDay: "night" } }`.
Scores 84–92 (median 90). **Best: seed 20, score 92 "Headline marathon DJ"**, 22 tandas, 3.99 h, mean e70,
20 distinct Turkish cortinas, no hard failures — written to `docs/specs/round8-best-night.json` (seed, options,
score with factors and reasons, full ordered track list with cortinas and the Deezer preview ids).
`floorMood: "energetic"` (targets up to 90) was tried too: best 89 at seed 15, mean e72; the 1935–45 pool cannot
hold e85+ at every peak slot, so the balanced floor with the energetic context scores higher at nearly the same energy.

## 4. New fields and calls the web should add

- `ComposeOptions.arcShape` ("single" | "double"), `ComposeOptions.yearRange` ([from, to]) and
  `ComposeOptions.preferOrchestras` must pass through the composer's option whitelist / `settleOptions`.
- `NightRules.allowUndated` (Database → Rules "Include undated recordings", off by default); a card whose songs carry
  `transcription` or `yearApprox` should say *undated transcription* (only reachable with the rule on).
- `ScoreCard.reasons?: string[]` — print under the number (the score is capped at 60 when present).
- `PlaylistStats.cortinaFallback?: string` — show as a note next to the cortina family.
- Hide: send `songs[id] = { hidden: true }` for "hide every copy", `{ hidden: true, hiddenScope: "copy" }` for
  "this copy only", or `hiddenTitles: [hideKey(song)]`; `overridesEmpty()` in `lib/server/catalog.ts` must count
  `hiddenTitles`.
- `Cortina.resolved` is now filled from `data/cache/resolve/cortinas.json`; the booth's `PreviewAdapter.resolvedOf`
  currently returns null for anything without a `rhythm`, so cortinas still need that guard lifted to rehearse.
- The refine route now returns `applied[]`, `notApplied[]` and a `seed` inside `options`; the note reads
  "Applied: … Not applied: …". The index merged 2 813 duplicate rows (ids kept as `altIds`): Database counts change.

## 5. Scripts

- `pnpm index:build` — now dedupes and flags transcriptions (`meta.json`: `rawRows`, `mergedDuplicates`, `transcriptions`).
- `pnpm --filter @tdj/core exec tsx ../../scripts/resolve_cortinas.ts [--force]` — Deezer previews for cortinas.

## 6. Test expectation updated

`round4.test.ts › B10`: "late-night + marathon → vocalBias > 0" encoded the round-4 reading; round 8 (§4.1.7) says a
marathon after midnight leans instrumental. The test now expects late night alone > 0 and marathon + late night < 0.
