# Round 4: wiring audit (controls → request → engine → output)

*Scope: every user-facing control in `apps/web/src` and every option/override field, traced to the code that consumes it. Read-only audit; no files under `packages/`, `apps/` or `data/` were changed. Line numbers are from the working tree on the audit date, which carries an **uncommitted** diff in `packages/core/src/{compose,catalog,memory,tanda,types}.ts` (the "explicit sizes beat context" block at `compose.ts:89-97`, `recent` plumbing in `memory.ts`/`tanda.ts`). That region of `compose.ts` changed twice while this audit ran; where HEAD and the working tree behave differently both are described.*

**Status key.** WIRED = reaches the engine and changes output as labelled. PARTIAL = reaches the engine but is weak, conditional, or only partly honoured. DEAD = never read by anything that affects output. OVERRIDDEN = another layer silently replaces the value after the user set it.

**Request path, once.** `useStore.options` (`apps/web/src/lib/store.ts:10-27` DEFAULT_OPTS, `:137` `optionsForRequest`) → `Composer.run` (`apps/web/src/components/Composer.tsx:281-297`: `requestOptions()` merges memory, then POST `{...o, seed, locked, overrides}`) → `apps/web/src/app/api/compose/route.ts:17-43` (validates hours/sizes, splits `overrides`, calls `compose`) → `packages/core/src/compose.ts:81-97`:

```
o = sanitizeOptions({ ...DEFAULT_OPTIONS, ...withEraSettings(partial), ...(partial.overrides?.rules ?? {}) })   // :81-85
o = applyContextToOptions(o, resolveContext(o.context, deps.contextModel))                                    // :87-88
// working tree only: explicit = sanitizeOptions({...o, ...partial}); sizes/pattern re-asserted from partial  // :89-97
```

Precedence as it stands (low → high): core defaults → era preset (`profiles.ts:644-651`, only for keys absent from the request) → request options → **database Rules** (`:84`) → **context factors** (`:88`) → (working tree only) request sizes/pattern again (`:91-97`). The web client always sends every DEFAULT_OPTS key, so the "era preset fills gaps" layer never fires for web requests; era defaults are applied client-side instead (`Composer.tsx:252-264 applyEra`).

---

## 1. Control-by-control table

### 1a. Composer: Night / Structure / Cortinas

| Control | Where in UI | Store field | Request field | Engine consumer | Status | Evidence | Fix |
|---|---|---|---|---|---|---|---|
| Length (1–8 h) | Composer.tsx:572 SliderRow | `options.hours` | `hours` (route clamps 0.5–12, route.ts:17-19) | `planSlots` arc.ts:59-62; `fit()` compose.ts:298-317 | WIRED | Slot count follows hours; duration factor scored score.ts:191-198 | Slider max 8 while route/engine allow 12 (MAX_HOURS arc.ts:32); either raise the slider or document. |
| Era | Composer.tsx:583 PickerRow → `applyEra` | `options.eras` + era-key patch | `eras` | `Catalog.filter` catalog.ts:133-145; `minTier` compose.ts:159-160; `guardiaOnly` compose.ts:137; Cumparsita era filter compose.ts:329 | WIRED | `applyEra` writes era defaults into unpinned ERA_KEYS (Composer.tsx:129-141, 252-264) so the stepper/picker values visibly change | Only `eras[0]` is honoured by `withEraSettings` (profiles.ts:645); the UI only ever sends one era, fine. |
| Arc | Composer.tsx:589 | `options.arc` | `arc` | `arcTarget`/`phaseOf` arc.ts:92-134 | WIRED | | |
| Tanda shape (+pin) | Composer.tsx:595-603 | `options.tandaShape`, `pinned` | `tandaShape` | `shapeTanda` tanda.ts:63-96 | WIRED | | Shape "hammock"/"rise-settle" on a 3-track tanda collapse to plain sort (tanda.ts:78, 92): expected. |
| Close with La Cumparsita | Composer.tsx:604 | `closeWithCumparsita` | same | compose.ts:161 (pool excludes Cumparsita), :321-342 (closing pick), :299 (fit target) | WIRED | | |
| Cycle (pattern) (+pin) | Composer.tsx:616-623 | `options.pattern`, `customPattern` | same | `patternString` arc.ts:5-22 | PARTIAL | "TTVTTM-strict" (Composer.tsx:95) has no branch in `patternString` (falls to default "TTVTTM", arc.ts:19-20). Its only effect is that `applyContextToOptions` does not rewrite it (context.ts:422 only touches `classic`/`TTVTTM`), so "strict" silently means "immune to context share shifts". | Either implement strict (never let context rewrite, never fall back V/M→T) and document, or remove the option. |
| Custom cycle text | Composer.tsx:626-640 | `customPattern` | same | arc.ts:6-11 | WIRED | | |
| **Tango tanda 3/4/5 (+pin)** | Composer.tsx:641-654 StepperRow | `options.tangoTandaSize` | `tangoTandaSize` (validated route.ts:21-29) | `planSlots` slot.size arc.ts:74; `buildTanda need` tanda.ts:188; última/fallback size compose.ts:203, 231, 249 | **OVERRIDDEN** (HEAD) / PARTIAL (working tree) | See §2. HEAD: Database Rules (`compose.ts:84`) and any context option with `tandaSizeShift:-1` (`context.ts:419`) replace 4 with 3 after the request value is read. Working tree: `:91` re-asserts the request value, which now makes the Database Rules value for sizes dead (§2.2). | Single precedence rule in `compose()`; see Fix 1. |
| Vals tanda / Milonga tanda (+pin) | Composer.tsx:656-684 | `valsTandaSize`, `milongaTandaSize` | same | arc.ts:74; tanda.ts:188 | PARTIAL | Not touched by context (`context.ts:419` only tango) but still overridden by Database Rules at HEAD (compose.ts:84); working tree re-asserts them (:92-93). | Fix 1. |
| Orchestra repeat gap (+pin) | Composer.tsx:685-698 | `orchestraRepeatGap` | same | `gapOk` tanda.ts:233-241; swapTanda compose.ts:457, 486 | PARTIAL | Honoured, but `buildTanda` relaxes to "not the immediately previous orchestra" when nothing passes (tanda.ts:243-247) with no trace in `reason`. Database Rules value overrides this control (compose.ts:84). | Add the relaxation to `tanda.reason`; Fix 1 for precedence. |
| Year spread (+pin) | Composer.tsx:700-714 | `maxYearSpread` | same | `families` tanda.ts:24-60 | PARTIAL | Wired; overridden by Database Rules at compose.ts:84. UI max 15, route accepts up to 30 (arc.ts:53). | Fix 1. |
| Reset to era defaults | Composer.tsx:716 | `applyEra(era, true)` | – | – | WIRED | Ignores pins by design (`force`) | |
| Cortina style (+pin) | Composer.tsx:727-737 | `cortinaStyle` | same | `planCortinas` cortinas.ts:548-561; `pickCortina` :564-593; `tandaDuration` arc.ts:27 | PARTIAL | "family" needs a family with ≥8 cortinas inside the chosen cultures (cortinas.ts:559); otherwise `family:null` and it silently behaves as "matched". With `cultures=["turkish"]` (5 cortinas in data/knowledge/cortinas.json) this always degrades. | Lower the threshold to the number of tandas needing a cortina, or surface "no family large enough, using matched" in the result footer. |
| Flavour (trend/classic/mix) | Composer.tsx:741-746 | `cortinaTrend` | same | `candidatesFor` cortinas.ts:536-543 | PARTIAL | Only applied when ≥3 candidates carry/lack the `trend` flag; otherwise silently ignored. | Report in footer; or apply as a weight instead of a filter. |
| Cultures | Composer.tsx:747-754 | `cortinaCultures` | same | cortinas.ts:529-531 | WIRED | Falls back to the whole pool when no match (cortinas.ts:544), as tested in edge.test.ts:274 | |
| Cortina length (+pin) | Composer.tsx:755-768 (20–90 s) | `cortinaLengthSec` | same | arc.ts:27; compose.ts:294 (`lengthSec: o.cortinaLengthSec`) | **OVERRIDDEN** | `fit()` compose.ts:303-310 rewrites every cortina to `clamp(25, 60, len + per)` whenever the night is >60 s off target, which is the usual case. A DJ asking for 90 s gets 60 s; 20 s gets 25 s. The scorer then penalises <25/>60 anyway (score.ts:155). Also overridden by Database Rules (compose.ts:84) and by learned preference `cortinaLengthSec` (memory.ts:238 via Composer.tsx:277-278) when the control sits at its default. | Clamp to `[min(25, user), max(60, user)]` or to `user ± 15`; show the applied mean length in the result footer. |

### 1b. Composer: Night rules (`options.rules`, merged over era rules in `withEraSettings` profiles.ts:649)

| Control | UI | Field | Engine consumer | Status | Evidence | Fix |
|---|---|---|---|---|---|---|
| Open with La Cumparsita | Composer.tsx:779 | `rules.openWithCumparsita` | compose.ts:363-377 | WIRED | `playlist.opening` rendered Composer.tsx:~1000; exported by `flatten` export/index.ts:39-52 | |
| Closing Cumparsitas 1/2 | :785 | `rules.cumparsitaCount` | compose.ts:345-361 | PARTIAL | Works, but appends a 5th song to the última, so the `sizes` score factor marks it "non-standard" (score.ts:60-65) and the Guide still says tango tandas have 4. | Exempt the última-with-own-Cumparsita from the size check. |
| Birthday vals (+position) | :791-806 | `rules.birthdayValsAt` | compose.ts:270-283 | PARTIAL (cosmetic) | Only sets `note`/`reason` on the nearest existing vals tanda; it does not reserve, move or re-pick anything. If the pattern has no vals (tango-only) nothing happens, silently. | Build that slot with a vals-bank orchestra and a vocal, mid-energy family; or label the switch "mark the birthday vals". |
| Show or break (+position, length) | :808-837 | `rules.showBreakAt/Minutes` | compose.ts:111-124, 378-381 | PARTIAL | Slots are planned for `hours - break` (:112) but `fit()` targets the full `o.hours` (:299), so `diff ≈ +break·60` and every cortina is stretched by up to +15 s (:304-310). A 20-min break lengthens all cortinas to 60 s. | Pass the reduced hours into `fit()` (`target = (o.hours - breakMin/60)*3600 - …`). |
| Última tanda rule | :838 | `rules.ultimaRule` | compose.ts:197-226 | WIRED | | |
| Opener rule | :845 | `rules.openerRule` | compose.ts:186-195 | WIRED | Falls back to any tango if no preferred family builds (:195 → :228) | |
| Pugliese once | :852 | `rules.puglieseOnce` | compose.ts:139-141 (`maxPerNight` 2 only when `false`) | WIRED | Default cap is CORPUS_CAPS 1 (rules.ts:5) | |
| **Colour tanda** | :858-863 | `rules.colourTanda` | none | **DEAD** | `grep colourTanda packages/core/src` → only `profiles.ts` ERA_SETTINGS and the type. No foxtrot/Pirincho/Hugo Díaz path exists (pools are tango/vals/milonga only, compose.ts:149-167). | Either implement (one slot drawn from `rhythm in {foxtrot}` or a `colour` tag) or remove the switch. |
| Mixed milonga and vals tandas | :864-869 | `rules.mixedMilongaVals` | compose.ts:166 (vals/milonga families keyed by orchestra only) | PARTIAL | Works in `compose`; `swapTanda` ignores it (compose.ts:483 uses `o.mixVocalInstrumental` only) so swapping a mixed vals tanda yields a strict one. Note the label says "more than one orchestra" but `families()` still groups by orchestra (tanda.ts:28); it only mixes singers. | Thread the same `mixVocal` expression into `swapTanda`; fix the label ("mix singers"). |
| Cortina before La Cumparsita | :870 | `rules.cortinaBeforeCumparsita` | compose.ts:287-291 | WIRED | | |

### 1c. "Tonight" context strip (`options.context`)

| Control | UI | Engine consumer | Status | Evidence | Fix |
|---|---|---|---|---|---|
| All 11 pickers (season … day) | ContextStrip.tsx:44-65 (fields lib/context.ts:37-159) | `resolveContext` context.ts:357-414 → `energyShift` (compose.ts:118-121), `arcShift` (:120), `tandaSizeShift` (context.ts:419), `valsShare/milongaShare` (:422-433), `cortinaGenres` (:420), `preferStyles/avoidStyles` (compose.ts:133-134 → tanda.ts:259-260) | PARTIAL | `energyShift` is WIRED. The rest: see rows below. The strip footer (ContextStrip.tsx:29-36) advertises `tempo`, `vocal %` and "tangos in threes" as applied shifts. | Show only shifts the engine consumes; see Fix 4. |
| tempoShift | summarised ContextStrip.tsx:30; editable ContextTab.tsx:17 | none | **DEAD** | `grep tempoShift packages/core/src` → only accumulated in context.ts:391, never read. | Use it: shift `target` in `buildTanda` by bpm, or drop from UI. |
| vocalRatioShift | ContextStrip.tsx:34; ContextTab.tsx:20 | none | **DEAD** | Accumulated context.ts:392, never read; no vocal/instrumental weighting exists in `buildTanda`. | Add a vocal weight in `weight()` (tanda.ts:249-302): `w *= c.vocal ? 1+shift : 1-shift`. |
| valsShare / milongaShare | ContextStrip.tsx:31-32; ContextTab.tsx:18-19 | context.ts:422-433 | PARTIAL | Research model is `absolute` (baseline 0.167): only the **first** context key carrying a share counts (`shareV === null`, context.ts:394-395), order = insertion order of the context object. Thresholds (+0.03 / −0.04) are reached only by values 0.20/0.22 (vals) and ≤0.12 (milonga); the common 0.17/0.18 values do nothing. Only rewrites `classic`/`TTVTTM` patterns. | Average shares across chosen factors instead of first-wins; scale thresholds to the baseline. |
| tandaSizeShift | ContextStrip.tsx:33 "tangos in threes" | context.ts:419 | OVERRIDDEN at HEAD, DEAD for web in working tree | HEAD: `heatwave, humid, hot room, afternoon, práctica, wedding, show (→ weddingShow), small crowd, beginners` (data/knowledge/context_factors.json) each force `tangoTandaSize 4→3`, overriding the stepper. Working tree: `compose.ts:91` restores the request value, and since the web always sends `tangoTandaSize`, the shift can never apply from the app; the footer still says "tangos in threes". | Fix 1 + Fix 4. |
| cortinaGenres | footer ContextStrip.tsx:35-36 | context.ts:420 → cortinas.ts:531-536 | PARTIAL | Applied only when ≥4 cortinas in the chosen cultures match. Of 44 research genres only 7 exist in the pool (`afrobeats, chanson, funk, pop, rock-nacional, swing, turkish-pop`); e.g. "romantic → chanson, bossa, soul-ballads" never passes (3 chanson). Also `applyContextToOptions` only sets `cortinaGenres` when the request has none (:420); the UI never sets it, fine. | Map research genre ids to pool genres (or tag cortinas with the research vocabulary) and lower the threshold. |
| preferStyles / avoidStyles / arcShift | – | compose.ts:120, 133-134 | **DEAD in the app** | `grep -c "preferStyles\|avoidStyles\|arcShift" data/knowledge/context_factors.json` → 0. They exist only in `BUILTIN_CONTEXT` (context.ts:7-323), which is replaced by the research model whenever `data/knowledge/context_factors.json` loads (load.ts:245-246, always in the web). The "beginners → rhythmic/guardia, avoid dramatic" behaviour therefore never fires. | Add `preferStyles/avoidStyles/arcShift` to the research model (or merge BUILTIN as fallback per option). |
| Region default from Settings | Composer.tsx:225-230 | context.region | WIRED | Only fills when unset; "Clear tonight" (ContextStrip.tsx:92) clears it and the effect does not re-apply (dep list `[hydrated, region]`). | Re-apply after clear or leave as explicit choice. |

### 1d. Feedback chips and "Tell the DJ"

| Chip (lib/feedback.ts:217-228) | `applyFeedback` compose.ts:574-644 | Status | Evidence / fix |
|---|---|---|---|
| More energetic | `floorMood=energetic`, `context.mood=energetic` | WIRED | arc.ts:97-98; mood energetic in research model (+8 energy, milonga 0.20) |
| Calmer | floorMood balanced/romantic, mood cleared | WIRED | |
| Warmer start | `arc=gentle` | PARTIAL | Lowers the whole night (arc.ts:108-109), not only the start. Better: `arcShift.warmup −6`. |
| Stronger finish | `floorMood=energetic` (:617-619) | PARTIAL | Identical to "More energetic" without the mood; nothing targets the end. Better: `arcShift.close +8` / force `ultimaRule=d-arienzo-rhythmic`. |
| More vals / More milongas | `pattern=custom` + fixed string | WIRED | Replaces a user custom pattern silently (visible in the Cycle field afterwards). |
| Fewer repeats | `orchestraRepeatGap +3` | WIRED | |
| More romantic / playful | `context.mood` | WIRED | |
| Shorter cortinas | `cortinaLengthSec −15` | PARTIAL | Then clamped by `fit()` (§1a). |
| more-instrumental (keyword/model only) | `out.excludeOrchestras = o.excludeOrchestras` (:611-613) | **DEAD** | A no-op assignment. Fix: add a vocal weight (see vocalRatioShift) and set `vocalShift=-0.2`. |
| more-vocal | `mixVocalInstrumental=false`, mood nostalgic | PARTIAL | Does not raise the vocal share; only a side effect through mood. |
| later-peak | `arc=classic-two-peaks` (:604-606) | PARTIAL | No-op when already on the default arc. |
| **Feedback result vs memory** | Composer.tsx:391-392 `replaceOptions(j.options); run(undefined, j.options)` → `requestOptions` (:277-278) `{...o, ...applyMemory(explicitOptions, memory)}` | **OVERRIDDEN** | `explicitOptions` (:267-273) is a `useMemo` over the **pre-feedback** `options` (the store update has not re-rendered inside the same async call). Any key the chip changed that was at its default before is not "explicit", so a learned preference for that key (memory.ts:231-239: `floorMood`, `pattern/customPattern`, `cortinaLengthSec`) wins over the chip. Concretely: with learned `customPattern=TTVTTMTTV` (twice "more vals"), the chip "More milongas" produces TTVTTMTTV again. Same for `refine()` (:425-426). | Fix 2. |
| Tell the DJ (refine) | api/ai/refine/route.ts:121-199 | WIRED (model) / PARTIAL (keywords) | Model patch sanitised to OPTION_KEYS (:15-39): `rules` are not allowed, so "two Cumparsitas" or "break at midnight" cannot be expressed. Keyword fallback only excludes orchestras by last name (:138-140). Result then subject to the memory override above. | Allow `rules` in `sanitizeOptions`; Fix 2. |

### 1e. Memory (`lib/memory.ts`, `packages/core/src/memory.ts`) and Settings → "Let the assistant learn"

| Item | Path | Status | Evidence | Fix |
|---|---|---|---|---|
| Learned preferences applied | Composer.tsx:277-278 → `applyMemory` memory.ts:7-20 (core) | PARTIAL / OVERRIDDEN | By design prefs sit under *explicit* options, but "explicit" = differs from `{...DEFAULT_OPTS, ...eraDefaults}` (Composer.tsx:268). A DJ who deliberately keeps 45 s cortinas still gets the learned 30 s; the UI stepper keeps showing 45. The footer "Using what you taught me" (Composer.tsx:886-889) is the only hint. | Fix 2: apply prefs into the store (visible) once, or treat pinned keys as explicit. |
| `fewer-repeats` ×2 → `excludeOrchestras: []` | memory.ts:239 | DEAD | Empty array; `describePreferences` hides it (lib/memory.ts:343), MemoryTab shows "Orchestras left out: none". | Remove or learn `orchestraRepeatGap` instead. |
| **`recent` (variety across nights)** | working tree memory.ts:9-20 → `o.recent` tanda.ts:300, 320-329 | **DEAD in the app** | `applyMemory` returns `recent` only on the `!memory?.preferences` branch (memory.ts:11-12). `emptyMemory()` and `normalizeMemory` always give `preferences: {}` (truthy), so the second branch (:13-19) never includes `recent`. Also skipped entirely when `settings.learn` is off (Composer.tsx:277-278). | Return `{ recent, ...prefs, ...partial, … }` from both branches; send `recent` regardless of `learn`. Add a test with `preferences: {}`. |
| rememberSet / liked / notes | Composer.tsx:312, 457-461; MemoryTab | WIRED (storage) | Notes/likes only reach the AI prompts (`summarizeMemory`, refine route :173-174, review :228-232); the engine ignores `liked`. | Weight `recent` by `liked`. |

### 1f. Database tabs (`AppOverrides`, sent as `overrides` when non-empty, store.ts:143-149)

| Tab / field | Consumer | Status | Evidence | Fix |
|---|---|---|---|---|
| Songs: year, singer, rhythm, energy, hidden | `Catalog` ctor catalog.ts:76-103 (`{...raw, ...patch}`, `hidden` drops) | PARTIAL | `singer` edit changes the display name only: `families()` groups by `singerId` (tanda.ts:28) and `swapTrack` matches `singerId` (compose.ts:523); `vocal` is not recomputed, so "Instrumental → Rufino" still builds as instrumental. `year` edit does not recompute `era`, so a 1962 → 1941 fix still fails `eras.has(s.era)` (catalog.ts:144). `energy` WIRED (catalog.ts:102, respected by the audio refinement :117). | In `Catalog`, derive `singerId = slug(singer)`, `vocal = !!singer`, `era = eraOf(year)` when the patch changes them (SongsTab already has `slug`/`eraOf` for added songs, SongsTab.tsx:106-109). |
| Songs: added songs | catalog.ts:76 | WIRED | Needs an existing `orchestraId` to get a profile/tier; otherwise tier 3 and filtered by `minTier 2` (compose.ts:159-160) for golden eras. | Show that in the add form. |
| Orchestras: energy, style, tier, notBefore, phases, singers | catalog.ts:63-67 → `mergeProfiles` profiles.ts:472-477; read via `cat.profile()` compose.ts:127-131 | WIRED | `swapTanda` reads `cat.profile` too (compose.ts:475-481) | |
| Cortinas: add/replace/delete | `cortinaPool(deps.cortinas, o.overrides?.cortinas)` compose.ts:267 | WIRED | `/api/meta` cortinaList excludes overrides (meta/route.ts:7) but CortinasTab overlays them itself. | |
| Rules: repeat gaps, year spread, sizes, cortina length, mixVocal | compose.ts:84 | OVERRIDDEN-the-other-way | These silently beat tonight's Composer values at HEAD (table 1a). In the working tree, sizes from Rules are themselves dead because `:91-93` re-asserts the request (the web always sends sizes). The Rules footer promises "override the composer's defaults" (RulesTab.tsx:102), i.e. defaults, not tonight's explicit choices. | Fix 1: Rules become the *default* layer under the request, not above it. |
| Rules: trackEnergy | catalog.ts:75, 102 | WIRED | | |
| Rules: notBefore | compose.ts:131 | PARTIAL | `swapTanda` ignores it (compose.ts:479 reads only the profile). | Pass the same `notBefore` resolver to `swapTanda`. |
| Context tab (energy, tempo, vals %, milonga %, vocal %) | `mergeContextModel` server/catalog.ts:76-89 → `deps.contextModel` | PARTIAL | energy/vals/milonga reach `resolveContext`; tempo and vocal are dead (1c). `tandaSizeShift`, `cortinaGenres` are not editable. | Remove dead fields or wire them. |
| Overrides in swap/swap-track | `getCatalogFor(playlist.options?.overrides)` swap/route.ts:9, swap-track/route.ts:9 | WIRED | `playlist.options.overrides` is the core subset without `contextFactors`, so a swap uses the base context model; harmless because `swapTanda` has no `preferStyles` anyway. | |

### 1g. Result actions

| Action | Path | Status | Evidence | Fix |
|---|---|---|---|---|
| Lock tanda → survives regenerate | TandaCard lock → Composer.tsx:371-377 → `locked` in body :296 → compose.ts:175-185 | WIRED | Matched by `t.index` (slot index); songs/titles pre-reserved (:176-179) | Backward gap not enforced: the tanda *before* a locked one may be the same orchestra (`recentOrchestras` only grows forward, :258). The locked tanda's cortina is re-picked (:293-295) rather than kept. Also feedback/refine keep locks (run passes `locked`). |
| Swap tanda | compose.ts:440-505 | PARTIAL | Scoring object (:475-481) lacks `preferStyles/avoidStyles`, `canonical`, `maxPerNight/notAfter/neverClose/nonDance`, DB `notBefore`; pool lacks the `guitarras-solo-singer` exclusion (:449-454 vs :156) and uses `minTier 2` even for nuevo/contemporary. A swap can therefore bring back a capped Pugliese, a concert title, or a solo-guitar "orchestra". Size preserved via `t.songs.length` (:470). | Build one `makeScoring(cat, o, rc, rules)` used by both `compose` and `swapTanda`. |
| Swap track | compose.ts:507-551 | WIRED | Same family only; tests only `normTitle` repeats. | |
| Recompose with same seed | Composer.tsx:551 `run(playlist.options.seed)` | WIRED | | |
| Thumbs up/down | Composer.tsx:457-461 | storage only | Not consumed by the engine. | |

### 1h. Export sheet and Settings

| Control | Path | Status | Evidence |
|---|---|---|---|
| Include cortinas | ExportSheet.tsx:48, 84 → export/route.ts:50-60 `withoutCortinas` + `flatten(inc)` export/index.ts:34-36, 69 | WIRED | Also honoured by Spotify (ExportSheet.tsx:112). |
| DJ-app folder | ExportSheet.tsx:69-70, 86 → `applyPaths` exportPaths.ts:53-93 | PARTIAL | rekordbox/traktor/m3u8 only; `serato` (CSV), `xspf`, `csv` ignore the folder (exportPaths.ts:79-91) although the Settings row exists for Serato (types.ts:50-56). |
| File naming | Settings page :258-266 → `applyPaths` exportPaths.ts:59-76 | PARTIAL | Same three formats only; `{tanda}`/`{n}` tokens are advertised in Settings footer (:247) and work. |
| Spotify Client ID / connected | Settings :119-135; ExportSheet :100-143; Listen.tsx:70, 148 | WIRED (export/listen only) | Nothing sets `requireSpotify`/`onlySelection` (grep: only CLI/types), so Spotify state never changes composition. Fine, but the score's "resolvable on Spotify" factor (score.ts:168-177) is independent of the connection. |
| AI provider/key/model | Settings :179-222 → headers Composer.tsx:232-237 | WIRED | BYOK, never persisted server-side (llm.ts:28-39). |
| Learn from feedback | Settings :238-242 → Composer.tsx:277-278, 389, 416 | WIRED | See 1e for `recent` gap. |
| Region | Settings :282-291 | WIRED | Default only (1c). |
| Theme / Reduce transparency | ThemeSync.tsx:537-558 | WIRED | UI only. |
| Haptics | no setting exists; `haptic()` lib/haptics.ts always vibrates unless reduced motion | n/a | If a "haptics" toggle is expected, there is none in `UserSettings` (types.ts:70-81). |

### 1i. Option keys with no UI at all (reachable only via refine/model, CLI or DB)

`singerRepeatGap` (engine WIRED tanda.ts:236-239; DB Rules + "more-variety"), `avoidTitleRepeats`, `includeOrchestras/excludeOrchestras` (refine only), `onlySelection`, `requireSpotify`, `name`, `locale` (DEAD, nothing reads it), `mixVocalInstrumental` (in ERA_KEYS Composer.tsx:139 for pinning, but there is no control; DB Rules only).

---

## 2. Why "4-track tango" can produce 3-track tangos

`buildTanda` never returns a short tanda: it needs `slot.size` distinct danceable titles (tanda.ts:204-219) and returns `null` below `need` (tanda.ts:362). `swapTanda` keeps `t.songs.length` (compose.ts:470), `swapTrack` keeps the count, `fit()` removes whole tandas (compose.ts:312-316), and `cumparsitaCount:2` adds a song (never removes). So every 3-track tango comes from **the option value itself being 3 when `planSlots` runs** (arc.ts:74), through one of these paths:

1. **Context `tandaSizeShift` (HEAD).** `applyContextToOptions` compose.ts:88 → context.ts:419: `if (rc.tandaSizeShift < 0 && out.tangoTandaSize === 4) out.tangoTandaSize = 3`. Research options carrying `-1`: weather `heatwave`, `humid`; roomTemperature `hot`; timeOfDay `afternoonPractica` (UI "Afternoon"); eventType `practica`, `weddingShow` (UI "Wedding" **and** "Show", lib/context.ts:29); crowdSize `small`; crowdLevel `beginner`; roleRatio (no UI). Picking "Small crowd" alone turns every tango tanda into 3 tracks while the stepper says 4; the only hint is "tangos in threes" in the strip footer. **Working tree:** `compose.ts:89-93` re-asserts `partial.tangoTandaSize` after the context step; since the web always sends it, this path is closed for the app (and the footer text is now wrong in the other direction).
2. **Database → Rules → Tango tanda size** (`overrides.rules.tangoTandaSize`) is spread **after** the request at compose.ts:84, so a DB value of 3 beats the Composer's 4 at HEAD. In the working tree the opposite happens: `:91` restores the request value, so the DB size setting is dead for web requests (it still applies for CLI/API callers that omit sizes). The same spread order affects `orchestraRepeatGap`, `maxYearSpread`, `cortinaLengthSec`, `singerRepeatGap`, `mixVocalInstrumental` in both trees.
3. **Era preset on the client.** `applyEra` (Composer.tsx:252-264) writes `tangoTandaSize: 3` for `guardia-vieja`, `nuevo`, `contemporary` (profiles.ts:530, 574, 598) unless the pin is on. This is visible (the stepper changes), so not silent, but a DJ who set 4 then switched era loses it unless they pinned. Server-side `withEraSettings` (profiles.ts:644-651) is `{...defaults, ...partial}` and would respect the request; it only matters for callers that omit the key.
4. **Refine (model).** `sanitizeOptions` in refine/route.ts:108-109 accepts `tangoTandaSize: 3` from the model; `replaceOptions` makes it visible in the stepper, so not silent, but the model is free to change it for "calmer".
5. **Locked tandas** keep their old length by design (compose.ts:175-185); a tanda locked under a 3-track era stays 3 after switching to 4.
6. **`sanitizeOptions` order.** `planSlots` re-sanitises (arc.ts:60) with the same clamps, so no further change there. The ultima slot (:203) and the vals/milonga→tango fallbacks (:231, :249) all use `o.tangoTandaSize`, so they follow whatever precedence produced `o`.

The uncommitted test `compose.test.ts:228-238` covers path 1 (it passes `context: { eventType: "practica" }`, which is the research id, not the app key `event`; `resolveContext` accepts both because `byId.has("eventType")`, context.ts:383). There is no test for path 2 in either direction.

---

## 3. Prioritised fixes

**Fix 1 (P0): one precedence rule in `compose()`.** Replace compose.ts:81-97 with an explicit layering, lowest first: `DEFAULT_OPTIONS` → `ERA_SETTINGS[eras[0]]` → `overrides.rules` (user's standing defaults) → `partial` (tonight, explicit) → context (`applyContextToOptions`) **only for keys not present in `partial`**. Implement by computing `const explicitKeys = new Set(Object.keys(partial))` and having `applyContextToOptions(o, rc, explicitKeys)` skip `tangoTandaSize`/`pattern` when they are explicit. On the web, send only keys the DJ actually touched or pinned (`optionsForRequest` could drop values equal to `{...DEFAULT_OPTS, ...eraDefaults}` unless pinned), so era, DB rules and context can still fill the gaps server-side and the client/server agree on what "explicit" means. Invariants to add first (docs/TDD.md): (a) `compose({tangoTandaSize:4, overrides:{rules:{tangoTandaSize:3}}})` → 4-track tangos; (b) `compose({overrides:{rules:{tangoTandaSize:3}}})` → 3-track; (c) `compose({tangoTandaSize:4, context:{event:"practica"}})` → 4-track with `playlist.options.contextApplied` listing what was skipped; (d) `compose({context:{crowdSize:"small"}})` → 3-track. Then make the strip footer read from the engine's applied list, not from `resolveContext` alone.

**Fix 2 (P0): memory never beats a change made in the same gesture.** In `Composer.tsx`, compute `explicit` from the options being sent, not from the stale `useMemo`: `run(seed, opts)` should call `requestOptions(opts)` with `explicitOf(opts)` (diff of `opts` against `{...DEFAULT_OPTS, ...eraDefaults}`), and `feedback()`/`refine()` should additionally mark every key present in `j.options` that differs from the previous options as explicit. Simpler alternative: apply learned preferences by writing them into the store once (so the controls show them, and they become ordinary explicit values) instead of merging at request time; `describePreferences` then becomes a toast ("applied: shorter cortinas"). Also return `recent` from both branches of `applyMemory` (memory.ts:9-20) and send it regardless of `settings.learn`.

**Fix 3 (P1): `fit()` must not rewrite a user's cortina length or stretch cortinas to pay for a show break.** compose.ts:298-317: use `target = (o.hours - breakMin/60) * 3600 - …` and clamp adjusted cortinas to `[min(25, user), max(60, user)]` (or `user ± 15`). Add the applied mean cortina length to `PlaylistStats`.

**Fix 4 (P1): stop advertising dead context shifts.** Either consume `tempoShift` (shift `target` energy by bpm, or filter families by profile `bpm`), `vocalRatioShift` (weight `c.vocal` in `buildTanda.weight`), and add `preferStyles/avoidStyles/arcShift` to `data/knowledge/context_factors.json`, or remove those lines from `ContextStrip` (:30, :33-34) and the Context tab FIELDS (ContextTab.tsx:17, 20). Map research `cortinaGenres` to the pool's genre vocabulary (only 7/44 overlap) and relax the ≥4 threshold.

**Fix 5 (P1): `rules.colourTanda` and `more-instrumental` are no-ops.** Remove the switch (Composer.tsx:858-863) or implement a colour slot; replace `applyFeedback` "more-instrumental" (compose.ts:611-613) with a real vocal weight shared with Fix 4.

**Fix 6 (P2): swapTanda parity.** Extract the `Scoring` construction (compose.ts:126-147) into `makeScoring(cat, o, rc, rules)` and reuse it in `swapTanda`; apply the same `excludeOrchestras` additions, `minTier` rule and `mixedMilongaVals` family mode.

**Fix 7 (P2): Songs tab patches recompute derived fields.** In `Catalog` (catalog.ts:80), when `patch.singer`/`patch.year`/`patch.rhythm` are present derive `singerId`, `vocal`, `era` so edits change tanda building, not only labels.

**Fix 8 (P2): small honesty items.** `TTVTTM-strict` → implement or remove; `Birthday vals` → build the slot or relabel as "mark"; Cycle picker replaced silently by chips → fine but show a toast; exempt the two-Cumparsita última from the size penalty (score.ts:60-65); slider/route range mismatches (hours 8 vs 12, year spread 15 vs 30); Serato/XSPF ignore folder and naming.

---

## 4. What is wired fine (no action)

Hours, era filtering, arc, tanda shape, Cumparsita closing/opening/count, cycle (classic/TVTM/TMTV/tango-only/custom), cultures, última and opener rules, Pugliese once, cortina-before-Cumparsita, show break position (apart from the fit side-effect), `energyShift` from every context factor, region default, Orchestras tab profiles, Cortinas tab pool, track-energy and added songs, lock/regenerate, swap-track, seed replay, Include-cortinas export switch, rekordbox/traktor/m3u8 folder and naming, BYOK AI headers, theme/transparency, feedback chips `more-energetic`, `calmer`, `more-vals`, `more-milongas`, `fewer-repeats`, `more-romantic`, `more-playful`, `more-dramatic`.
