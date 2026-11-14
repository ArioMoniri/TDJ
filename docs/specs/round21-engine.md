# Round 21 — tanda coherence, La Cumparsita, stream dates, the big four, Swap, the booth, learning

The DJ's requests (three messages and the follow-ups), what was wrong, what changed, the data it rests on and the
audits before and after. The featured night's own changes are in `docs/specs/round21-best-night.md`.

## 1. What was wrong (evidence)

| Request | Finding |
|---|---|
| "the cumparsita make it in first … should match the first tanda" | Generated nights had no opening Cumparsita (`rules.openWithCumparsita` off by default); when on, the version was any closing-version orchestra, explicitly **not** the first tanda's (`s.orchestraId !== tandas[0].orchestraId`). |
| "3 of first are 1941 the last is 1979" | Not the index (T1 is D'Agostino / Vargas, four 1941 sides). The fourth side, Tres Esquinas, carried `spotify:track:5iAzpDLPcnczkrY0F0md5z` on the album **"Laura"**, which Spotify dates **1939-01-09** (an "Old Harbor Music" 2026 compilation with a "1939 RCA Victor" line) while the other three play the dated 2022 restorations. It passed because the cache stored no release date and the album names no years. The audit of all 364 cached side ids with their release dates found **47** more such ids (Spotify dates "¡Ay, Mis Amores!" 1924, "Presentando a Pedro Laurenz" 1925, "Aquel Muchacho" 1947 for 1951–55 sides, LPs of 1959–1995 for 1936–45 sides) and **7** cortina records dated before their song. Generated nights themselves never mixed eras: 1008 tandas (seeds 1–15 × 3 era sets) had no year span > 4. `swapTrack` did allow ±1 year around the tanda's range, so a swap could stretch it. |
| "all instrumental or all singer … starts with rhythm or with instrument" | Compose never mixed voice (0 of 954 tandas over 42 seeds) but it was not a named rule, and the swap paths did not check it. No notion of a vocal style existed. |
| "bpm and sound level should match in the tandas" | Only the analysed 30 s previews (66 % of sides) gave a BPM; no loudness per side was used. Round-20 tandas spread p50 5.4 % / p90 12.4 % in BPM and p50 3.8 / p90 10.1 dB in level. |
| "the player … play any song you want by clicking it won't work" | Booth rows had no play action at all: only Find, the Spotify link and Swap. |
| "i have premium so should not be rehearsal" | The booth required `product === "premium"` from `/v1/me`; a profile that comes back without `product` (Spotify returns it only with `user-read-private`, and drops it in some app modes) was treated as **not Premium**, every side fell back to its 30 s clip and the chip said "Rehearsal · 30 s clips". The login's scopes were never checked, so a session without `streaming` could not be told to reconnect. A saved "preview" source mode also kept a night in rehearsal with no way back from the booth's header. |
| "what is cortina and master sliders" | The faders were labelled "Cortina" and "Master" with no explanation. |
| "di sarli darienzo troilo pugliese … 4 quartiles … not one after another" | 42 of 42 generated nights had a fault: **132** back-to-back big-four pairs (3.1 a night), 1 empty quartile, 2 short gaps, 5 nights without one of the four. |
| "keep tones in each tanda the same" | Round-20 tandas spread p50 7, p75 10, p90 12, max 21 energy points inside (the "rise-settle" shape builds inside the tanda). |

## 2. The tanda rules (settings, all on by default)

`ComposeOptions.tandaRules` (`packages/core/src/coherence.ts`), shown in the Composer and in Settings → Tanda rules,
carried with every compose and saved night:

- **Voice** — a tanda is all instrumental or all vocal (`mixVocalInstrumental: true` turns it off, as before).
- **Vocal style** — `either` (default: rhythm-led or singer-led, never mixed), `singer-led` (cantor sides only),
  `rhythm-led` (estribillista sides only), `off`. The style per side comes from `data/knowledge/vocal_styles.json`
  (orchestra + singer surname + years: D'Arienzo 1935–40 vocals, Troilo / Fiorentino 1937–40, Canaro's 1930s,
  Donato's singers, Biagi to 1945, Fresedo / Ray, Lomuto, Rodríguez / Flores, Di Sarli / Murillo, Caló / Ortega del
  Cerro, Firpo, the Típica Víctor are rhythm-led; D'Arienzo from Mauré (1940), Troilo from 1941, Canaro from 1940,
  Di Sarli / Rufino, Podestá, Durán, Tanturi, D'Agostino / Vargas, Caló from Berón, Láurenz, Pugliese, Malerba,
  De Angelis, Demare, Gobbi, Federico are singer-led), else the refrain-era rule (a vocal side up to 1936 is
  rhythm-led), else unknown and unconstrained. Where this differs from the lead's list: Mauré and Casas are cantores
  (they sing the whole lyric). Coverage: 96 % of the vocal sides the composer draws (2,627 of a 42-night run);
  ≥ 80 % of the golden vocal sides of the canon (the invariant). A singer-led night that leaves fewer than 3 vocal
  families per rhythm falls back (recorded in `settingFallbacks`: "vocalStyle: …").
- **Years** — the spread caps (vocal tango 2, instrumental 3, vals / milonga 2) for every path, Swap included.
- **Tempo band** — the measured BPM of the sides (the DJ's, else the index's, Deezer's, the analysed preview's, folded
  into the rhythm's range) within 10 % of the slowest (vals, milonga 12 %); **Level band** — Deezer's replay gain
  within 6 dB. The bands were chosen from the round-20 distribution (BPM p75 9.5 %, level p75 6.0 dB): a tanda past
  them is an outlier, not a normal tanda.
- **Where the night rises and falls** — `between` (default: each tanda keeps one tone, its sides' energy within
  `TONE_ENERGY_BAND` = 10; the model's own per-title jitter is ±4.5, so 10 is the noise floor of "one tone") or
  `inside` (the round-20 behaviour).
- **Big four** — Di Sarli, D'Arienzo, Troilo, Pugliese (any rhythm counts): each quartile of the night (by tanda
  index) holds one; two big-four tandas are never back to back; the same one returns no sooner than
  `bigFourGap` (default 5, never fewer than the orchestra gap of 6); all four play in a night of ≥ 3 h.

Every path that edits a tanda honours them: compose (families split by vocal style, the greedy side pick skips a side
that breaks voice / style / years / tone / bands while others remain, the big-four weights in the family choice and a
post-repair swap pass), `swapTanda`, `swapTrack` and the Swap sheet (`swapOptions` / `replaceSide`), the AI pick
(only among valid sides), improveNight and the strict repair (their acceptance is the strict panel, which now carries
`tandaVoice`, `tandaVocalStyle` (blockers), `tandaBpm`, `tandaLevel`, `tandaTone`, `bigFour`, `cumparsitaOpener`
(should-fix); the score weighs the band items a quarter, the tempo and cohesion factors score them too).

**Rule conflicts** (the big four): the canon (`MUST_HAVE` families), the planned summit (D'Arienzo at the last peak)
and the Pugliese chair win; a pair the swap pass cannot split without making the panel worse stays and is recorded
("bigFour: … (no swap keeps the other rules)"). The golden night's 3 D'Arienzo tandas (a benchmark band) outrank the
pair weight. 

**Pinned tandas** (`Tanda.pinned`, "Keep my tanda as is"): locked for every fixer and repair; the panel moves what
they break — and the stretch rules they make a neighbour break (hour, run, pair, gap, the vocal share over the
tandas the DJ did not pin) — into `exceptions` ("DJ exceptions"), never a blocker; the score's hard-failure cap
ignores them.

## 3. La Cumparsita

`rules.cumparsita`: `both` (the new default), `open`, `close`, `none` (unset: the legacy keys). The opening version
(`cumparsita.ts`): the first tanda's orchestra, the year nearest its sides (within 4 = the same era), instrumental
unless that orchestra only recorded it sung (then its singer's); else the same orchestra in any golden year; else an
orchestra of the same style from the nearest year inside the night's range — each step recorded ("opening: …"). The
opening plays inside the requested hours (the slot plan and the length fit reserve it). The panel's
`cumparsitaOpener` checks it; `nightShape` checks the placement.

## 4. Stream dates, BPM, loudness and the database

- **The stream-date rule** (`matchRules.releaseProblem`, every provider match): an album dated in a year before the
  side, or a release dated more than two years after it before 2000, is another record unless the title or the album
  names the side's date or years (a "Buenos Aires 24/07/1941 (Restauración 2022)" title, a "1940 - 1942" album). A
  digital-era release of a historical side is a reissue, judged by the other rules. Also: a tribute orchestra ("La
  Juan D'Arienzo") is not the leader; "De Agostino" spells "D'Agostino"; a session-dated release in the side's own
  year is positive evidence beside a later take; a cortina record dated before its song, or an artist's
  "(… 's Version)", is not the original.
- **Audit before → after** (`pnpm quality`'s cache audit): Spotify 364 checked / 47 rejected by the new rule → 446
  checked / 0 rejected (the 47 re-searched and judged: 45 found, 2 stale alias keys removed; Tres Esquinas set to the
  restoration); cortinas 7 rejected → 0 (6 re-found, Mabel Matiz "Gel" none); Deezer 691 / 0 → 690 / 0 (a "La Juan
  D'Arienzo" match cleared, Desde el Alma moved to its 1935 transfer).
- **Release dates**: `enrich_spotify --dates` re-read every cached id (492: sides and cortinas) — `release` and
  `checkedAt` on each entry; 0 changed, 0 gone.
- **BPM and loudness**: `scripts/enrich_deezer.ts` (Deezer's `GET /track/{id}`: `bpm`, `gain`, the release) for every
  side with a judged Deezer id: 691 fetched, `bpm` 398 (58 %; Deezer has none for the rest), `gain` 618 (89 %), median
  123.8 BPM and −13.7 dB. The catalogue reads the tempo as the DJ's value, else the index's, else Deezer's (for the
  judged Deezer match only), else the analysed preview's with a clear pulse; the level as the DJ's, else Deezer's.
  Coverage of the sides the composer draws: tempo 61 %, level 78 % (unknowns never constrain a tanda).
- **Stored and updated**: every enrichment record carries `source` and `fetchedAt`; a re-run refetches records older
  than 30 days (or `--refresh`), a changed value replaces the stored one with `changedAt` and `previous`
  (`enrich.ts mergeEnrichment`, tested). A DJ correction lives in the DJ's database (`UserOverrides.songs`: `bpm`,
  `gainDb`, `vocalStyle`), is never written by a script and always wins at load (tested). The Database page shows per
  song the BPM, level and vocal style with their source (editable), the checked Spotify album, its release year and
  check date, the Deezer id and fetch date. The repo-level database (`data/knowledge/song_patches.json`,
  `added_songs.json`) holds corrections and the DJ's added sides with their sources and survives `pnpm index:build`.
  (The per-request catalogue now keeps the committed caches under a DJ's edits — before, a DJ with any database edit
  lost the previews and analysed audio in the composer.)

## 5. One tone per tanda: measured

| 42 nights (golden 4 h, seeds 1–42) | round 20 | round 21 |
|---|---|---|
| in-tanda energy spread p50 / p75 / p90 / max | 7 / 10 / 12 / 21 | 8 / 10 / 12 / 21 |
| in-tanda BPM spread % p50 / p75 / p90 | 5.4 / 9.5 / 12.4 | 5.0 / 6.6 / 11.1 |
| in-tanda level spread dB p50 / p75 / p90 | 3.8 / 6.0 / 10.1 | 3.5 / 4.8 / 6.0 |
| boundary energy step p50 / p75 / p90 | 8 / 14 / 17 | 8 / 13 / 16 |
| big-four faults (adjacent / quartile / gap / missing) | 132 / 1 / 2 / 5 | 71 / 2 / 1 / 1 |
| voice or vocal style mixed | 0 / 0 | 0 / 0 |
| engine score min / mean · benchmark min / mean | 83 / 89.2 · 75 / 87.1 | 84 / 88.3 · 75 / 82.5 |

What this says, plainly: the tempo and level bands work (the in-tanda BPM p75 9.5 → 6.6 %, level p90 10.1 → 6.0 dB);
the big-four pairs halve (3.1 → 1.7 a night, each remaining pair recorded); **one tone per tanda only partly holds**:
the side pick keeps the tone, but the later steps that lift fame, fix the order or repair a rule may bring a side
back outside the band, so 19 % of tandas still spread more than 10 (174 `tandaTone` should-fix items in 924 tandas;
p75 stays 10). Tightening it further costs the golden canon's fame and the round-19 order rules on this catalogue; it
is reported, not forced. The benchmark mean falls 87.1 → 82.5 because its strict-panel check counts the new should-fix
items and the D'Arienzo / instrumental-hour checks lose a few chairs to the big-four rule; the engine score holds
(min 84, mean 88.3) and the golden set S1–S12 stays ≥ 85 (`docs/quality/latest.md`, `pnpm quality` passes).

## 6. Swap, the booth, Premium

- **Swap sheet** (one per song, result page and booth): "Fits this tanda" (valid sides by fit: energy, tempo, level,
  fame), a search over the catalogue (title, orchestra, singer) with the reason each excluded side cannot take the
  chair, "AI pick" (`/api/ai/swap`: the model chooses among the valid sides with the DJ's key; without one, "the
  engine's best fit", labelled), "Keep my tanda as is". The night is re-stated, re-timed and re-scored; the side's
  judged Spotify id travels with it.
- **Booth**: a tapped row auditions the side before the night (the Spotify recording on this device with Premium,
  else its clip); during the night a sheet offers **Play now (fade the current)** (`engine.playNow`: the running item
  fades over the fade-now length, the tapped one starts, the night continues from it), **Play next**
  (`engine.playNext`), **Preview only (headphones)**. Stop shows its word from 640 px. "Cortina volume" (how loud the
  cortinas play against the tangos, %) and "Master volume" (the whole output, dB), each with a one-line hint in the
  Mix sheet.
- **Premium**: an unknown `product` is tried (the Web Playback SDK reports a free account itself), a login without
  `streaming` / `user-modify-playback-state` / `user-read-playback-state` shows "Reconnect Spotify to play full songs"
  (`/api/spotify/login?next=/booth`), a free account says so, and the source line reads "Spotify · full tracks" or
  "Rehearsal · 30 s clips" with "Play full tracks on Spotify" when the rehearsal switch is the only reason.

## 7. Learning from the DJ's edits

`learn.ts`: an edit (a swap, a search-and-swap, an AI pick, a pinned tanda, a hand-made tanda) becomes bounded
weights — a chosen side +1 (×1.5 per point in its family, up to ×2.5), a chosen family +1 (×1.4 per point in its slot,
up to ×2.2), a replaced side −0.5 and a replaced family −1 (×0.6) — and a pinned tanda a template. Stored in the DJ's
memory (`AgentMemory.learned`, IndexedDB / the server row), applied to every later compose (`applyMemory`), shown and
resettable in Settings ("What TDJ learned from your edits"); the repo-level store `data/knowledge/dj_preferences.json`
holds what the featured-night edits taught (47 sides, 20 families, 7 templates). Rules still apply; tonight's settings
win. Effect on fresh nights (the same seeds composed without and with the learned store): featured options seed 199
score 85 → 87, default seed 1 89 → 91, seed 2 90 → 88; the DJ-chosen sides each night carries 5 → 5, 8 → 6, 6 → 7.
The weights move families (D'Arienzo / Echagüe 1938 and Láurenz / Podestá stay, Di Sarli / Rufino 1939–40 opens the
featured-options night) but a replaced family at ×0.6 can still return under the night's own random bias (Rodríguez /
Flores valses did in seed 1): the learning is a preference, not an exclusion — a "never" is the database's hide.

## 8. Tests

- `packages/core/test/round21.test.ts` (25 invariants: placement and the opening version, the vocal-style table and
  coverage, sideProblem, composed nights keep voice / style / years, the singer-led setting, the stream-date rule and
  the clean cache, Deezer data and the DJ's correction, enrichment updates, one tone, the big four, Swap, pinned
  exceptions, learning, the featured night's edits). Run on the round-20 engine (the HEAD before this round) the new
  invariants fail where the features did not exist (no `rules.cumparsita`, no opening by T1's orchestra, no release
  rule, no Deezer data, no tanda rules, no pinned exceptions, the featured night unedited).
- `apps/web/src/lib/booth/engine.test.ts` (Play now / Play next / before the night), `sources/spotify.test.ts`
  (Premium, unknown product, missing scope, free), `clips.test.ts` follows the night.
- `apps/web/e2e/round21.spec.ts`: the opening Cumparsita by T1's orchestra; the Swap sheet (valid suggestions, search
  reasons, AI pick without a key = the engine's best fit, the tanda stays the family); a tapped booth row auditions;
  the fader labels and hints; during the night Play now moves the playhead.
