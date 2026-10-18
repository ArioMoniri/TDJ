# TDJ — QA / platform review (2026-10-18)

Scope: monorepo at `/home/user/TDJ` (pnpm workspaces; Next.js 16.4.2 app `apps/web`, engine `packages/core`, index in `data/`).
Target: the production server already running on `http://localhost:3000` (`next start`, BUILD_ID `nAld0wrfLjUh3bmPzjWV2`, built 23:00 UTC, process started 23:02 UTC).

> **Important context.** The working tree was being edited by another session while this review ran. At 23:13 UTC `biome format --write` was applied to every source file (lint went 99 → 20 diagnostics) and from ~23:20 UTC `packages/core/src/{types,cortinas,tanda,compose}.ts` were refactored mid-flight (new `buildTanda` context object). All numbers below say **when** they were measured. The API/e2e/mobile findings are against the 23:00 build served on :3000, which is unaffected by those edits. No source under `packages/`, `apps/` or `data/` was modified by this review; only `packages/core/test/edge.test.ts`, `apps/web/e2e/qa.spec.ts` and this file were added.

## 1. Results table

| Check | Command | Result | Measured |
|---|---|---|---|
| Core unit tests (existing) | `pnpm --filter @tdj/core test` | **PASS** 21/21 (1.3 s) | 23:06 |
| Core unit tests + new edge suite | same | **PASS** 64/64 (21 + 43; 14.6 s) | 23:19 |
| Core unit tests on the in-flight refactor | same | **FAIL** — `TypeError: sc.notBefore is not a function` (compose.test 1 failed / 12 skipped; edge 21 failed / 3 skipped) | 23:22 — see §7 re-verification |
| Core typecheck | `pnpm --filter @tdj/core typecheck` | **PASS** at 23:06 → **FAIL** at 23:19 (`src/compose.ts(234,6)` & `(235,6)` TS7006 implicit `any` — in-flight `swapTanda` still passes positional callbacks) | 23:06 / 23:19 |
| Web typecheck | `pnpm --filter @tdj/web typecheck` | **PASS** at 23:06 → **FAIL** at 23:19 (same two errors via `@tdj/core`) | 23:06 / 23:19 |
| Lint | `pnpm lint` (biome check) | **FAIL** — 99 errors / 5 warnings / 5 infos at 23:06 (72 were `format` + 27 `organizeImports`); after the external format pass: 20 errors / 1 warning / 2 infos. Real rules: `a11y/noStaticElementInteractions` ×2, `a11y/useKeyWithClickEvents` ×2, `suspicious/useIterableCallbackReturn` ×3, `a11y/noLabelWithoutControl` ×1, `a11y/noSvgWithoutTitle` ×1, `correctness/noUnusedImports` ×1, `correctness/noUnusedFunctionParameters` ×1, `style/useTemplate` ×3, `useBiomeIgnoreFolder` ×3 (biome.json). Not fixed, as instructed. | 23:06 / 23:14 |
| Existing e2e | `cd apps/web && TDJ_URL=http://localhost:3000 pnpm e2e` | **FAIL at collection — 0 tests run.** `smoke.spec.ts:21` — "Cannot use({ defaultBrowserType }) in a describe group" (Playwright 1.64 rejects `test.use({ ...devices[...] })` inside `test.describe`). Any CI step running `pnpm e2e` is red regardless of app health. | 23:08, re-confirmed 23:20 |
| New e2e | `pnpm exec playwright test e2e/qa.spec.ts` | **PASS** 5 passed + 2 expected-fail (`test.fail` with reasons) — 28 s | 23:20 |
| API hammer (152 requests) | `scratchpad/hammer.mjs` | 0 timeouts, 0 responses > 2 s; invariants broken in 23 cases (§3) | 23:10 |
| Export validation (5 playlists × 8 formats, `xml.etree` + `csv`) | `scratchpad/validate_exports.py` | all XML **well-formed**; 11 structural deviations from `docs/research/engineering-2026.md` §3 (§4) | 23:11 |
| Mobile (iPhone 15 Pro, Pixel 7; light + dark; 4 pages) | Playwright probe + `qa.spec.ts` | no horizontal overflow; tab bar clear of content; title/lang/viewport OK; muted-text contrast 6.1:1 (light) / ≈6.2:1 (dark); **37 buttons < 44 px**, `/settings` React #418 hydration error + 2 unlabeled inputs (§5) | 23:17 |

## 2. Bugs ranked by severity

Severity: **H** = ships broken output or takes the service down; **M** = wrong result a DJ would notice / invariant violated; **L** = hygiene, validation, consistency.

### H-1 · `hours: "abc"` (or any non-numeric) composes a 401-tanda, 740 KB night — CPU DoS vector
- **Repro:** `curl -s -XPOST localhost:3000/api/compose -H 'content-type: application/json' -d '{"hours":"abc","seed":1}' | jq '.tandas|length'` → `401`, 1.8 s, `score.total: null`, 3 orchestra-gap violations. 10 concurrent such requests block the single event loop for ~18 s (compose is synchronous; the 10-request burst test shows requests are serialised).
- **Cause:** `apps/web/src/app/api/compose/route.ts` — `Math.min(10, Math.max(1, Number(body.hours ?? 4)))` passes `NaN` through both; `planSlots` (`packages/core/src/arc.ts`) compares `Math.abs(NaN)` and only stops at the `i > 400` safety cap.
- **Fix (route):**
  ```ts
  const h = Number(body.hours);
  const hours = Number.isFinite(h) ? Math.min(10, Math.max(1, h)) : 4;
  ```
  **Fix (engine, defence in depth, `arc.ts` `planSlots`):**
  ```ts
  if (!Number.isFinite(o.hours) || o.hours <= 0) throw new RangeError(`hours must be a positive number, got ${o.hours}`);
  ```
  Then the route's existing `catch` turns it into a 400. Covered by `edge.test.ts › planSlots never runs away` (`it.fails`) and `qa.spec.ts › non-numeric hours` (`test.fail`).

### H-2 · The e2e suite cannot run at all (`pnpm e2e` exits 1 before any test)
- **Repro:** `cd apps/web && TDJ_URL=http://localhost:3000 pnpm e2e` → `Cannot use({ defaultBrowserType }) in a describe group` at `e2e/smoke.spec.ts:21`.
- **Fix:** move the mobile test to its own file with top-level `test.use({ ...devices["iPhone 15 Pro"] })`, or add Playwright `projects` (`{ name: "iphone", use: devices["iPhone 15 Pro"] }`) in `playwright.config.ts` and tag the test. `qa.spec.ts` shows the third option (explicit `browser.newContext(devices[...])`).

### H-3 · Exported file paths contain `/`, so Traktor/M3U/Rekordbox imports point at non-existent nested paths; Traktor collection keys collide
- **Repro:** export any set with a vocal tanda: M3U8 line `Francisco Lomuto / Fernando Díaz - Mosterio.mp3`; NML `FILE="Francisco Lomuto / Fernando Díaz - Mosterio.mp3"`, `VOLUME=""`, `UUID="tdj-1"` (not 32-hex); Rekordbox `Location="file://localhost/Orquesta%20T%C3%ADpica%20V%C3%ADctor%20-%20El%20Vasquito.mp3"` (file at filesystem root). In a 3 h set, 3 tracks shared `artist - title` → 3 duplicate `PRIMARYKEY`s in the NML, i.e. Traktor shows the same file twice and loses two.
- **Cause:** `packages/core/src/export/index.ts` builds the filename from `t.artist` which is `"${orchestra} / ${singer}"`; no filename sanitising; UUID = playlist id; no `MUSICFOLDERS`/`INDEXING` elements; `VOLUME` empty although §3.2 says `PRIMARYKEY.KEY = VOLUME + DIR + FILE`.
- **Fix (`export/index.ts`):**
  ```ts
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  const fileName = (t: FlatTrack) => `${String(t.n).padStart(3, "0")} ${safe(t.artist)} - ${safe(t.title)}.mp3`; // n prefix: unique + keeps set order
  // Traktor
  const VOLUME = "TDJ";
  const uuid = createHash("md5").update(p.id).digest("hex"); // 32 hex, stable per seed
  `<LOCATION DIR="/:TDJ/:" FILE="${esc(fileName(t))}" VOLUME="${VOLUME}" VOLUMEID="${VOLUME}"></LOCATION>`
  `<PRIMARYKEY TYPE="TRACK" KEY="${VOLUME}/:TDJ/:${esc(fileName(t))}"></PRIMARYKEY>`
  // after <HEAD …/> add <MUSICFOLDERS></MUSICFOLDERS>, before </NML> add <INDEXING></INDEXING>
  // Rekordbox: Location="file://localhost/TDJ/${encodeURI(fileName(t))}" (encodeURI, per §3.1, so "/" survives)
  ```
  Covered by `edge.test.ts › exports` (two `it.fails`).

### M-1 · `swapTanda` only enforces the orchestra gap on the left side
- **Repro:** `compose({hours:4, seed:42})`, then `swapTanda(p, 5, deps, 1000+k)` 15× → a swap put Pedro Laurenz at #5 while Laurenz was already within 5 tandas on the right. Deterministic; see `edge.test.ts › a swapped tanda respects the orchestra gap on BOTH sides` (`it.fails`).
- **Cause:** `compose.ts` `swapTanda` builds `ctx.recentOrchestras` as a playlist-ordered slice; `buildTanda.gapOk` does `indexOf(id) < orchestraRepeatGap`, which assumes "most recent first". Right-hand neighbours land at positions ≥ 6 and pass.
- **Fix:**
  ```ts
  const recent: string[] = [];
  for (let d = 1; d < o.orchestraRepeatGap; d++) for (const j of [index - d, index + d]) { const x = p.tandas[j]; if (x && j !== index) recent.push(x.orchestraId); }
  const ctx: BuildContext = { recentOrchestras: recent, recentSingers: [], … };
  ```
  (Also pass `nb` = notBefore to `buildTanda` in `swapTanda`; currently omitted, so a swap can move Pugliese into the first half.)

### M-2 · Scoring is meaningless for degenerate sets: empty set scores 82/100, `tangoTandaSize: 0` gives `score.total: null`
- **Repro:** `{"hours":3,"includeOrchestras":["nobody"]}` → 0 tandas, closing Cumparsita only, `score.total 82`, verdict "Solid regular milonga DJ". `{"hours":3,"tangoTandaSize":0}` → 54 empty tandas, `score.total: null` (NaN → JSON null), `energy: NaN`.
- **Cause:** `score.ts` divides by `n = t.length || 1` and every "0 violations" factor scores 1; `buildTanda` happily picks `need = 0` songs; `tanda.ts` averages an empty curve.
- **Fix:** in `scorePlaylist`, `if (!t.length) return { total: 0, factors: [], verdict: "Empty set" }`; in `compose()` validate `tangoTandaSize ∈ {3,4,5}`, `valsTandaSize/milongaTandaSize ∈ {3,4}` (throw → 400); in the route, whitelist body keys with a schema (zod/valibot) so unknown/ill-typed fields are dropped. Covered by two `it.fails` in `edge.test.ts › scoring` / `night length`.

### M-3 · Composer and scorer disagree about "Pugliese after the midpoint"
- **Repro:** `compose({hours:2.5, seed:5})` places Pugliese at index 6 of 13 (`slot.position = 6/12 = 0.5` ≥ `notBefore 0.5`), but `score.ts` C10 counts `i / n = 6/13 < 0.5` as "early" and docks the arc factor 20 %. Same for 10 h / seed 3 (28 of 55).
- **Fix (`score.ts`):** `const pos = (i: number) => (n <= 1 ? 0 : i / (n - 1));` and use `pos(i) < 0.5`. Covered by `edge.test.ts › composer and scorer agree` (`it.fails`).

### M-4 · `golden-extended` is labelled 1932–1960 but returns 1926–1934 and 1956–1969 recordings
- **Repro:** `{"hours":3,"seed":11,"eras":["golden-extended"]}` → tanda 8 is Roberto Firpo 1928, tanda 7/11 contain 1961–62. In the index, 2 441 songs < 1932 and 2 461 songs > 1960 qualify for this preset.
- **Cause:** `profiles.ts` `ERA_PRESETS["golden-extended"].eras` includes the whole `guardia-nueva` and `post-golden` buckets; `Catalog.filter` ignores the preset's `years`.
- **Fix (`catalog.ts` `filter`):** when a single preset with `years` is given, also apply `yearRange: ERA_PRESETS[p].years` (keep songs with `year == null` only for `all`). Covered by `edge.test.ts › era bounds` (`it.fails` for golden-extended, passing `it.each` for the other presets).

### M-5 · Thin pools degrade silently: adjacent orchestra repeats, 1-tanda "3-hour" nights, dead `requireSpotify`
- **Repro:** `eras:["nuevo"], seed 11` → De Angelis at #2 and #3 (adjacent); `eras:["post-golden"]` → D'Arienzo #7/#9. `eras:["contemporary"], hours 3` → **1 tanda (14 min)**, HTTP 200, score 80, no warning (only 16 tier ≤ 2 contemporary tangos; 908 exist at tier 3 but `minTier: 2` hides them unless `eras` includes `"all"`). `requireSpotify: true` → 0 tandas because `data/cache/spotify/tracks.json` is `{}` (3 bytes) — the option is non-functional in this build.
- **Fix:** (a) in `buildTanda`, before falling back to `viable`, relax `singerRepeatGap`, then `maxYearSpread`, then allow gap = 2, and only then adjacent; (b) use `minTier: 3` whenever the preset is `nuevo`/`contemporary`; (c) add `warnings: string[]` to `Playlist` (e.g. "Pool exhausted after 1 tanda (14 min of 180)") and `stats.shortfallSec`; surface as a banner in `Composer.tsx`; (d) hide/disable "Require Spotify" when `meta.spotifyCached === 0`. Covered by `edge.test.ts › thin pools…` (`it.fails`).

### M-6 · Mobile HIG / a11y: 36 px chips, `/settings` hydration error, unlabeled inputs
- **Repro:** iPhone 15 Pro / Pixel 7 on `/`: 37 `<button>`s are 36 px tall (`.chip` min-height 36 px; era/arc/shape/cortina/culture selectors and every Lock/Swap button via `!min-h-9`), "TDJ home" link 30 px; `/settings`: 14 chips at 36 px. `/settings` logs `Minified React error #418` (hydration text mismatch) in every fresh context; 2 `<input>`s have no label/aria-label. Compose/Export buttons (44 px) and the tab bar links (≥ 44 px) are fine.
- **Fix:** `globals.css` `@utility chip { min-height: 44px; }` on `(pointer: coarse)` (or globally; the scroll-x rows have room), drop `!min-h-9` in `TandaCard.tsx`; wrap the header link in a 44 px hit area; gate settings values that come from the persisted zustand store behind a `hydrated` flag (as `Composer.tsx` already does) or `useSyncExternalStore`; add `aria-label`/`<label htmlFor>` to the Client ID and API-key inputs. Covered by `qa.spec.ts › every button on / is at least 44px` (`test.fail`).

### L-1 · Input validation and error handling at the API edge
- `{"eras":"golden"}` → 400 with internal text `(e.eras ?? ["all"]).flatMap is not a function`; `customPattern: 12345` → 400 `…toUpperCase is not a function` (internal strings leak).
- Malformed JSON body → 200 with a default 4 h set (silently ignored).
- `/api/swap` with `{}` or `playlist: null`, `/api/export` without `playlist` → **bare 500**, empty body.
- `/api/export` `format: "constructor"` → **200**, body `[object Object]`, `content-type: undefined; charset=utf-8` (`EXPORTERS[f]` walks the prototype); `"__proto__"` → 500.
- `cortinaLengthSec: 600` accepted (9 tandas in 3 h); `avgTrackSec: 1` → 144 tandas / 26 h "2-hour" set (planner honours it, tanda durations don't).
- **Fix:** one `parseComposeOptions(body)` (zod) shared by compose/swap; `Object.hasOwn(EXPORTERS, f)`; clamp `cortinaLengthSec` 20–90, `avgTrackSec` 120–240 or use it in `buildTanda` as the fallback duration; 400 JSON for all validation errors, 413 for bodies > 1 MB.

### L-2 · Export content deviations from `engineering-2026.md` §3
- Rekordbox: `Genre="Tango tango"` (rhythm appended to "Tango"); `Year=""` empty attribute when year is null (omit it); `Mix=` abused to carry the Spotify URI (use `Comments`); no `AverageBpm`/`TotalTime` is fine (seconds) but `Location` has no directory.
- XSPF: `<location>` omitted for every track without a Spotify URI (all of them today) — VLC lists nothing playable; emit a `file:///TDJ/<name>.mp3` placeholder like the other formats.
- CSV: header is `#,kind,tanda,title,orchestra/artist,…` vs documented `tanda,position,artist,title,year,orchestra,singer,bpm,duration_s,path,spotify_uri`, and no UTF-8 BOM (Excel shows "Díaz" as mojibake). Quoting itself is correct (verified with embedded `"`/`,`/newline).
- M3U8: `#EXTINF:<int>,<Artist - Title>` lines are correct; paths are the H-3 filenames.

### L-3 · `marathon-plateau` arc has a cliff: energy drops ~18 points per 5 % of the night after 90 % (other arcs stay < 14). Fix: cosine ease-out over the last 15 % instead of the linear `(1 - x) / 0.1`. (`edge.test.ts › arc` `it.fails`.)

### L-4 · Planner/stats drift
- `planSlots` budgets a cortina after *every* tanda and a 190 s Cumparsita; `computeStats` adds no cortina after the last tanda and 180 s → every set is ~55 s short before rounding.
- The planner stops at the nearest tanda count, so the error can be half a tanda (`tango-only` 8 h: 6.5 min; `tangoTandaSize 5`: 6.2 min) while the scorer's "duration fit" factor starts penalising at ±4 min. Either make the scorer tolerance `max(4, tandaDuration/2)` or trim with a 3-song last tanda.

### L-5 · Search ranking: `/api/search?q=Maure` returns the first 40 catalogue-order hits; title/orchestra matches are not ranked above singer/year matches. Fine for now (29 ms p50), but the Library page will feel random. Accents/apostrophes (`Mauré`/`Maure`, `D'Arienzo`/`D’Arienzo`/`darienzo`) are correctly equivalent.

## 3. API hammer summary (152 requests, 23:10 UTC, build 23:00)

| Area | Cases | Outcome |
|---|---|---|
| `POST /api/compose` hours 1 / 0.5 / 8 / 10 / 12 / −3 / 2.5 | clamped to 1–10 (0.5→1, 12→10, −3→1); durations 59 / 59 / 484 / 602 / 602 / 59 / 145 min — all within half a tanda | OK (UI slider max is 8; API allows 10) |
| `hours: "abc"` | 401 tandas, 740 KB, 1.8 s, null score | **H-1** |
| eras × 7 presets | golden/guardia-vieja/all: clean. golden-extended: 11 out-of-range years (**M-4**). post-golden: 2 gap repeats; nuevo: adjacent repeat (**M-5**). contemporary: 1 tanda for 3 h (**M-5**). bogus/empty: 0 tandas, score 82 (**M-2**). `"golden"` as string: 400 w/ internal message (**L-1**) | |
| pattern custom: `"TTVTTM"`, `"ttv x!!m"`, `"VVVV"`, `"MMMM"`, `""`, `"ТТВ🎵"`, 1000 chars, number | strings sanitised correctly (V/M-only patterns fall back to tango when pools run dry, first tanda then is not a tango — by design); number → 400 (**L-1**) | |
| cortinaStyle none / constant; cultures turkish+trend / bogus; length 0 / 600 | none → no cortinas, duration kept; constant → one cortina id all night, last tanda null; bogus culture falls back to pool; 600 s accepted (**L-1**) | |
| tandaShape × 5 + bogus; arc × 4; floorMood × 2 | all OK, scores 88–91 | |
| includeOrchestras (1 / 3 / bogus / Pugliese-only); exclude all tier-1 | 1 & 3 orchestras: gap repeats are unavoidable, scored 69/73 (correct); bogus → empty set score 82 (**M-2**); Pugliese-only → 6 tandas for 2 h (notBefore skips first half, no warning) | |
| requireSpotify / onlySelection | requireSpotify → 0 tandas (**M-5**, cache empty); onlySelection → 16 tandas, 2 gap repeats | |
| seeds 0 / −5 / 1.5 / 1e18 / "abc" | all deterministic (two identical runs compared) | OK |
| tandaSize 0 / 3 / 5 / 99; maxYearSpread 0; mixVocal; no Cumparsita; repeatGap 0; avgTrackSec 1 | 0 → NaN score (**M-2**); 99 → 0 tandas; avgTrackSec 1 → 144 tandas (**L-1**); the rest OK | |
| 10 concurrent 4 h composes | all 200; 1.42 s wall, serialised ≈140 ms each | OK (single-threaded) |
| `POST /api/swap` index 0 / 3 / last / −1 / 999 / "x" / 1.5 / null | valid indexes: orchestra changed, rhythm/size/cortina kept, other tandas untouched, no title repeats; invalid → unchanged playlist (200); `null` → swaps index 0; `{}`/`playlist:null` → 500 (**L-1**); 15-swap loop found no left-side repeats (right-side bug found by the deterministic unit test, **M-1**) | |
| `GET /api/search` 19 queries | accents/apostrophes equivalent; `<2` chars → `[]`; 5 000-char query 35 ms; `<script>` safe (JSON) | OK |
| `POST /api/export` 8 formats × 5 playlists + bogus / missing / `__proto__` / `constructor` | all 8 formats 200 with correct `content-type` and `attachment; filename="…"` (name sanitised to `[a-z0-9-]`); bogus → 400; missing → 500; `constructor` → 200 (**L-1**) | |
| `GET /api/meta` ×6 | 24 KB, 3 ms, 291 orchestras, 12 cultures | OK |
| Cumparsita | present in every set with `closeWithCumparsita`, always a different orchestra than the last tanda | OK |

## 4. Export validation (python `xml.etree`, `csv`)

All Rekordbox XML, Traktor NML and XSPF files parse. Rekordbox: root/`Version`, `PRODUCT`, `COLLECTION Entries` = `TRACK` count = flattened track count, `TrackID`/`Name`/`Artist`/`Location`/`TotalTime` present, ROOT `NODE Type="0"`, playlist nodes `Type="1" KeyType="0"` with `Entries` = `TRACK Key` count, every `Key` resolves, full-set order is 1..n, folder `Count` correct. Traktor: `NML VERSION="19"`, `HEAD`, `COLLECTION ENTRIES` consistent, `DIR` ends with `/:`, `PLAYTIME` integer, `$ROOT` folder / `SUBNODES COUNT` / `PLAYLIST ENTRIES TYPE="LIST"` consistent, every `PRIMARYKEY` matches a collection entry. M3U8: `#EXTM3U`, one `#EXTINF:<int>,<text>` per track, cortinas tagged. CSV/Serato CSV: RFC-4180 quoting correct, constant column count, row count = tracks. Deviations are listed in **H-3** and **L-2**.

## 5. Mobile audit (Playwright, iPhone 15 Pro 393×659 and Pixel 7 412×839, light + dark)

| Check | Result |
|---|---|
| Horizontal overflow (`scrollWidth − innerWidth`, plus per-element `right > innerWidth`, with every `<details>` expanded) | 0 on `/`, `/library`, `/guide`, `/settings`, before and after composing, both devices, both schemes |
| Tab bar vs. last content | after scrolling to the bottom with a 22-tanda set: last card bottom 433 / closing card bottom 547 < tab bar top 575 (iPhone); 637 / 727 < 755 (Pixel). `main` has `pb-28` (112 px) — OK |
| `<title>` / `lang` / viewport | "TDJ — Tango DJ playlist composer" (same on every page — consider per-page titles), `lang="en"`, `width=device-width, initial-scale=1, viewport-fit=cover` |
| One `<h1>` per page, buttons with names, images with alt | OK on all pages |
| Tap targets ≥ 44 px | Compose / Same seed / Export / Ask-the-AI buttons 44 px; tab bar links ≥ 44 px. **37 buttons at 36 px on `/`, 14 on `/settings`, header link 30 px** (M-6) |
| Contrast of `.text-muted` on glass (pixel-sampled behind the text) | light: `rgb(92,88,110)` on sampled `rgb(251,238,243)` → **6.06:1** (iPhone) / 6.19:1 (Pixel); dark: `rgb(170,165,190)` on sampled `rgb(42,36,59)` → **≈6.2:1**. Both pass WCAG AA (4.5:1). Flag: 10–11 px captions (`text-[10px]`, `text-[11px]`) in `TandaCard`/`Nav` are below the usual 12 px floor |
| Console / page errors | `/settings`: `Minified React error #418` (hydration text mismatch) in every fresh context (M-6); none elsewhere |
| Unlabeled form controls | `/settings`: 2 inputs (M-6) |
| Page load (emulated, `networkidle`) | `/` 1.1–1.2 s, other pages 0.6–0.65 s |

## 6. Performance (build 23:00, warm server, sequential unless stated)

| Request | p50 | p95 | max |
|---|---|---|---|
| `POST /api/compose` 2 h | 83 ms | 174 ms | 174 ms |
| `POST /api/compose` 4 h | 150 ms | 219 ms | 219 ms |
| `POST /api/compose` 8 h | 249 ms | 286 ms | 286 ms |
| `POST /api/compose` 10 h, `eras: ["all"]` | **1 184 ms** | 1 309 ms | 1 309 ms |
| `POST /api/compose` `hours:"abc"` | 1 811 ms (740 KB) | — | — |
| 10 × 4 h concurrent | 1.42 s wall (serialised, ≈140 ms each) | | |
| `POST /api/swap` | 3–15 ms | | |
| `POST /api/export` (any format, 3 h set) | 3–7 ms | | |
| `GET /api/search` | 29 ms | 43 ms | |
| `GET /api/meta` (24 KB) | 3 ms | | |
| `GET /` (SSR) | 10 ms | | |

Nothing exceeded the 2 s budget. The `all`-eras path is 8× slower than golden because `compose()` rebuilds `families()` over the whole 21 932-song catalogue for each of the three rhythms on every request; memoising `families(pool)` per `(eras, includeOrchestras, excludeOrchestras, onlySelection, requireSpotify, maxYearSpread, mixVocal)` key in `apps/web/src/lib/server/catalog.ts` would make it ~100 ms.

## 7. Re-verification at the end of the session (23:27–23:29 UTC, working tree still being edited: `arc.ts` 23:27, `compose.ts` 23:28, `tanda.ts` 23:29)

| Check | 23:06 (baseline, pre-format) | 23:19 (formatted, pre-refactor) | 23:27–23:29 (in-flight refactor) |
|---|---|---|---|
| `pnpm --filter @tdj/core test` | 21/21 | 64/64 (incl. new `edge.test.ts`) | `compose.test.ts` 21/21; `edge.test.ts` **40/43** — see below |
| core / web typecheck | pass / pass | fail / fail (`compose.ts:234-235` TS7006) | pass / pass |
| `pnpm lint` | 99 errors | 20 errors (after external `biome format --write`) | **51 errors / 10 warnings / 5 infos** — new UI code: `a11y/useSemanticElements` ×23, `a11y/useGenericFontNames` ×2, `suspicious/noDuplicateProperties` ×2, `noAssignInExpressions` ×2, `correctness/noInnerDeclarations` ×2, `organizeImports` ×5, `noFocusedTests` ×1 (a `.only` left in a test), `noImportantStyles` ×2 |
| `pnpm e2e` (smoke) | collection error | collection error | not re-run (server still serves the 23:00 build) |

The three `edge.test.ts` differences at 23:29 are **behaviour changes introduced by the refactor after 23:19**, not test defects; the parent session should classify each as regression or intent:

1. `night length › duration stays within half a tanda…` — a *classic*-pattern night is now **7.6 min** off target (was ≤ 6 min for every classic case at 23:19). `arc.ts` gained `trackSecByRhythm`; if `buildTanda` now sums real/estimated per-song durations the planner no longer budgets the same seconds it will get. Fix: feed the same `trackSecByRhythm`/`avgTrackSec` into the tanda-duration fallback, or re-plan the last slot against actual accumulated seconds.
2. `cortinas › 'none' yields no cortinas…` — with `cortinaStyle: "none"` at least one tanda now carries a cortina (`every(t => t.cortina === null)` is false). Regression unless the semantics of `"none"` changed.
3. `cortinas › 'constant' uses the same cortina…` — the set of cortina ids after a `"constant"` night is no longer a single id, or the last tanda now has a cortina. Same remark.

**Last run at 23:30:25 UTC (39/43)** — note that the other session also edited `edge.test.ts` between 23:20 and 23:29 (it flipped the two `it.fails` for M-1 "swap gap on both sides" and M-5 "thin pools adjacency" to plain `it`; the file was re-formatted afterwards, no other content changed). Status per marker on that tree:

| Test | Marker now | 23:30 result | Meaning |
|---|---|---|---|
| duration within half a tanda (classic ≤ 6 min) | `it` | **fail** (7.6 min) | regression or planner change — see 1. above |
| `'constant'` cortina single id / last tanda null | `it` | **fail** | see 3. above |
| `'none'` cortinas | `it` | pass again | transient during the refactor |
| thin pools: no adjacent orchestra (M-5a) | `it` (flipped by the other session) | **pass** | fixed by the refactor |
| swap gap on BOTH sides (M-1) | `it` (flipped by the other session) | **fail** | either not fixed yet or regressed by `tanda.ts` 23:29 — the flip was premature; restore `it.fails` or finish the fix |
| composer/scorer Pugliese agreement (M-3) | `it.fails` | **fails-but-passes** (vitest error) | **fixed by the refactor → remove the `.fails` marker** |
| H-1 NaN hours, M-2 ×2, M-4 golden-extended, L-1 ×2, L-3 marathon, H-3 ×2 exports | `it.fails` | all still fail as expected | not yet fixed |
| the other 30 invariant tests | `it` | pass | — |

## 8. Test assets added

- `packages/core/test/edge.test.ts` — 43 tests: duration/size invariants, tanda integrity across 12 seeds, orchestra spacing, era bounds per preset, scoring sanity, arc bounds/gradualness, custom-pattern sanitising, cortina modes, determinism (seed 0/negative/float/huge), swap invariants, export escaping/CSV quoting/M3U/Rekordbox consistency, search normalisation. 12 are `it.fails(...)` with the defect in the title (H-1, H-3 ×2, M-1, M-2 ×2, M-3, M-4, M-5, L-1 ×2, L-3): **remove the `.fails` when the fix lands — the test then enforces the invariant.** Passed 43/43 at 23:19 against the pre-refactor engine; biome-clean.
- `apps/web/e2e/qa.spec.ts` — 7 tests: mobile basics/overflow on 4 pages × 2 devices × 2 schemes, tab-bar/44 px/pixel-sampled contrast on iPhone 15 Pro, 44 px chips (`test.fail`, M-6), API invariants through HTTP for 9 option sets, non-numeric hours (`test.fail`, H-1), all 8 export formats (headers/counts/escaping), and the Swap/Lock UI flow. Run with `cd apps/web && TDJ_URL=http://localhost:3000 pnpm exec playwright test e2e/qa.spec.ts` until H-2 is fixed. 5 passed + 2 expected-fail at 23:20 (the tab-bar test failed once while my latency sampler was hammering the same server concurrently; 4/5 otherwise, 3/3 on isolated re-runs — treat it as load-sensitive, not flaky).
- Scratch tooling (not committed): `scratchpad/hammer.mjs`, `scratchpad/validate_exports.py`, `scratchpad/mobile.mjs`.

## 9. TDD / Definition-of-Done checklist (recommended)

**Red → green loop for the engine (`packages/core`)**
1. Every DJ rule gets a named invariant test *before* the implementation (`edge.test.ts` is the seed list): duration ±half-tanda, sizes, one orchestra/rhythm/singer, year spread, no title/song reuse, orchestra & singer gaps (both sides, also after swap), Pugliese ≥ 50 % (one position formula shared by composer and scorer), cortina presence/energy match, Cumparsita last + different orchestra, era preset `years` honoured, score finite and 0 for empty sets.
2. Property-style loops over ≥ 12 seeds × every `EraPreset` × every `pattern` — thin pools must either satisfy the invariants or return `warnings[]`, never silently degrade.
3. Input contract test: `compose()` and the API reject NaN/negative/out-of-range `hours`, sizes ∉ {3,4,5}, `cortinaLengthSec` ∉ 20–90, non-array `eras`, non-string `customPattern` with a typed error (→ HTTP 400 with a stable `code`).
4. Export golden files: one fixture playlist → snapshot of each format, plus a parser round-trip (`fast-xml-parser` in vitest; python `xml.etree` in CI) checking the §3 required attributes, unique keys, sanitised filenames, BOM for CSV.
5. Determinism test on every change to `rng.ts`/`tanda.ts` (same seed ⇒ same ids).

**Definition of Done for a PR**
- [ ] `pnpm --filter @tdj/core test` green with no `it.fails` added (removing one is the only allowed change to the markers).
- [ ] `pnpm typecheck` green for core and web (currently red — in-flight refactor).
- [ ] `pnpm lint` green (`biome check`), including a11y rules; `biome format` run.
- [ ] `pnpm e2e` runs ≥ 1 test (H-2) and `qa.spec.ts` + `smoke.spec.ts` are green against a production build (`next build && next start`), on desktop Chromium, iPhone 15 Pro and Pixel 7 projects.
- [ ] API budget: p95 < 500 ms for 4 h golden, < 1.5 s for 10 h all-eras, body < 300 KB; no request may exceed 2 s (assert in e2e).
- [ ] Mobile: zero horizontal overflow on every route, all interactive elements ≥ 44 × 44 px on coarse pointers, `.text-muted` ≥ 4.5:1 sampled on glass in light and dark, no console errors (hydration errors fail the test).
- [ ] Exports re-validated with the python validator; Rekordbox XML imported once into a real Rekordbox / Traktor before release (manual, once per format change).
- [ ] Any new `ComposeOptions` field has: default in `DEFAULT_OPTIONS`, validation bounds, a UI control or an explicit "API-only" note, and at least one edge test.
- [ ] Data changes (`data/index`, `data/knowledge`) re-run the catalogue tests (`>20k songs`, era/year sanity, `ERA_PRESETS.years` ⊇ era buckets) and refresh `meta.builtAt`.
