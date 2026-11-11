# Round 19 — cortinas always land in Spotify; which songs come after what

The owner's two complaints: "sometimes cortinas are just not added in Spotify", and "should be more attentive to the
song changes — I mean which songs come after what" (the side-to-side order inside each tanda and across tanda
boundaries). Invariants: `packages/core/test/round19.test.ts` (written before each engine change; the ones that failed
on the round-18 engine are marked ✗ below), the web helper's unit test `apps/web/src/lib/spotifyPlan.test.ts`, and the
export e2e `apps/web/e2e/connectors.spec.ts` ("Spotify keeps the running order").

## 1. Cortinas in Spotify

### 1.1 Why cortinas went missing

The cortina pool (`loadCatalog().cortinas`) has 136 cues; only 28 carried a checked Spotify record
(`data/cache/spotify/cortinas.json`, judged at load by `cortinaMatchProblem`). A cue without one is searched at export
time, and the strict cortina rules (title, artist by whole name, no live / remix / duet / re-recording album) often
reject every candidate: "not found", and a gap between two tandas in the DJ's playlist.

| Measured (`compose`, 4 h, seeds 1–30) | Before | After |
|---|---|---|
| Cues with a checked Spotify record | 28 / 136 | 128 / 136 (8 recorded as having none, all never drawn) |
| Turkish-cortina nights: cortinas without a Spotify id | 145 / 649 (22.3 %), 30 / 30 nights with a gap | 0 / 650, 0 nights |
| Default (global) nights: cortinas without a Spotify id | 646 / 646 (100 %), 30 / 30 nights with a gap | 0 / 648, 0 nights |

Per culture (cues · with a Spotify record · drawable): before global 42 · 0 · 35, Turkish 52 · 28 · 48, Italian 6 · 0
· 5, French 6 · 0 · 6, Greek 5 · 0 · 4, Persian 6 · 0 · 3, Balkan 4 · 0 · 3, K-pop 6 · 0 · 6, Afrobeats 4 · 0 · 4,
Latin 1 · 0 · 1, Brazilian 2 · 0 · 1, Arabic 2 · 0 · 2. After: global 42 · 41 · 35, Turkish 52 · 51 · 48, Italian
6 · 6 · 5, French 6 · 6 · 6, Greek 5 · 4 · 4, Persian 6 · 3 · 3, Balkan 4 · 3 · 3, K-pop 6 · 6 · 6, Afrobeats
4 · 4 · 4, Latin 1 · 1 · 1, Brazilian 2 · 1 · 1, Arabic 2 · 2 · 2 — every drawable cue carries a Spotify record.

The drawable pools are kept exactly as they were (`load.ts`): a cue the Deezer resolver found nothing for stays
"no-audio" even when Spotify has its record (Take Five, Feeling Good, Take On Me, Sway, Jump, Jive an' Wail, Tu vuò
fà l'americano, Cevapsız Çınlama). The app previews and rehearses cues through their Deezer audio, and a first draft
that let these seven join the pools re-drew the golden set through the composer's best-of-redraws (S6 benchmark
87 → 82, the round-14 `colourBudget` ratchet 5 → 7 on the round-18 engine itself).

### 1.2 The cache, filled (A1)

`pnpm index:enrich -- --cortinas` (scripts/enrich_spotify.ts) now looks up every cue of the pool (a cue with no Deezer
preview too) and keeps, among the candidates `cortinaMatchProblem` accepts, the one with the most evidence of being the
original record: the release in the cue's own year (+5); a studio album or single of the same artist years later is
most likely a re-recording (−3), a later compilation most likely the original reissued (−1); the cue's artist credited
first and alone (+2); a later band under the leader's name (the 1980s Glenn Miller Orchestra) −3; a spoken
introduction, a medley or a session −4; a length outside 1:30–10:00 −2. Requests are paced 300 ms apart and a 429 waits
its Retry-After. A cue with no accepted candidate is cached as `null` — known, never searched again unless `--refresh`.

Two rule fixes came with it (✗ = failed on the round-18 rules):

- ✗ A duet is any credited performer the cue does not name, first-credited or not: "Duke Ellington, Count Basie" (*The
  Count Meets The Duke*) is not Count Basie's Jumpin' at the Woodside. The cue's own band under a longer credit
  ("Woody Herman & His Orchestra") stays the cue's artist.
- Two cue credits corrected in `data/knowledge/cortinas.json`: A-Tisket, A-Tasket is Ella Fitzgerald **& Chick Webb**
  (the Chick Webb record of 1938; "Ella Fitzgerald" alone found only her 1959 re-recording), Cevapsız Çınlama is Aleyna
  Tilki **& Emrah Karaduman** (the single's credit).

No acceptable Spotify record (cached `null`, all eight tagged no-audio and never drawn): Garota de Ipanema — Stan Getz &
João Gilberto (Spotify has the record only as "The Girl From Ipanema", another title for the cortina rules); Dünya
Dönüyor — Mabel Matiz (the cover does not exist on Spotify; the song is Nilüfer's); Gole Sangam — Hayedeh (only a 2025
remix single with other performers); Dream a Little Dream of Me — Ozzie Nelson (only later versions by other artists);
Dirlada — Haris Alexiou; Man Amadeam — Googoosh (the same song as cue c-ir-3 "Man Amadeh-am", which has its record);
Boro Boro — Arash (only "BoroBoro - Radio Edit" and remixes); Đelem Đelem — Boban Marković Orkestar.

### 1.3 The engine: a night meant for Spotify (A2)

`ComposeOptions.spotifyCortinas` (default on; `false` lifts it for a night played from files): the cortina planner
(`candidatesFor`, used by `planCortinas`, `pickCortina` and the strict repair's `recue`) draws only cues with a checked
Spotify record while eight remain. A requested family with no Spotify-ready cue left falls back to its compatible
families (`COMPATIBLE_FAMILIES`, e.g. swing → jazz / crooner) and `stats.settingFallbacks` says so
("cortinas: swing has no Spotify-ready cue; jazz / crooner instead"). The strict panel's new should-fix `cueSpotify`
flags a cue without a Spotify record on such a night, and `improveNight` re-picks it (`recue` brings a cue's own record
back first, and the strict fixer offers that re-pick on its own beside the panel's best edit). Settings lists no export targets
(only DJ-app folders), so the option has no Settings row; it is on for every composed night, the featured and the
golden flows included.

### 1.4 Export: a stand-in, never a gap (A3)

If a cortina still has no match at export time (a cue edited by the DJ, an older night's JSON, a cue Spotify withdrew),
`standInCortinas` (`apps/web/src/lib/spotifyPlan.ts`, on `cortinaStandIn` in core) writes the nearest Spotify-ready cue
of the same family (else a compatible family, else the culture) into the cortina's own row, never the cue either side
of it. The Export sheet's result line says so ("A cortina was not on Spotify: Kuzu Kuzu (Tarkan) stands in for …");
the hosted route (`POST /api/spotify/playlist` with a `playlist`) does the same with the server's pool and returns
`standIns`. The browser path fetches the pool once from `/api/meta` (the night's own cues when that fails).

## 2. Which songs come after what

### 2.1 The review

The shipped featured night (seed 199) and the golden-set nights S3 and S7 were written out side by side (energy,
fame, corpus role, year, analysed bpm / key as hints, the cortina and the boundary score) and judged pair by pair by one
reviewer acting as a strict milonga DJ and a dancer: `docs/reviews/round19-order.md` (14 findings, 18 proposed orders).

How often the findings' patterns occurred in S1–S12 and featured seeds 199 / 255 / 97 (compose + improveNight; 339
tandas before, 340 after — the nights are composed again), before → after:

| Pattern | Before | After |
|---|---|---|
| F3 a hole in a rhythmic tanda (a side ≥ 8 under both neighbours) | 20 | 0 |
| F4 the second side falls > 8 under the opener (> 12 for a lyrical fame-5 side) | 21 | 0 |
| F1 corpus roles backwards (a closer first or an opener last while another side could go there) | 5 | 5 (4 are the round-17 release cuts of F199 / F97 T21–T22, kept — §2.3) |
| O4 the hotter of two corpus openers opens | 7 | 7 (each time the cooler opener would open on a cliff, the round-16 rule that outranks it) |
| F2 the last side > 4 under the hottest other side (raw count, fixable or not) | 35 | 35 (O3 fires only where a side of the same standing could close; the rest keep the older closer rules) |

### 2.2 The rules (packages/core/src/order.ts; on every generation: the tanda builder's `strictOrder`, the strict
panel's `sideOrder` through `orderVerdictOf`, and improveNight's strict fixer)

- **O1** (F3, ✗): in a rhythmic orchestra's tanda a side 8 or more under both neighbours is a hole whatever its fame.
  The one slow hit of a rhythmic tanda opens and the tanda rises from it (D'Arienzo 1936–37: Ataniche, El Cachafaz, El
  Cencerro, Jueves). The round-9 rule "the one hit is not spent first" is wrong in exactly this case and yields to it;
  the first D'Arienzo of the night keeps its seeded order (round 8) unless that order has such a hole.
- **O2** (F4, ✗): the second side never falls more than 8 under the opener — 12 when it is a fame-5 side of a lyrical
  or balanced tanda. When the rising middle order would break it, the other middle order is weighed too, so the loved
  slow side can sit third, "the classic emotional peak" (Láurenz / Casas: De Puro Guapo, Desconsuelo, Como Dos
  Extraños, No Me Extraña).
- **O3** (F2, ✗; not inside a round-17 release cut): the last side is not more than 4 under the hottest of the others when that side could close itself
  (fame within 1 of the top, no corpus opener) — D'Agostino / Vargas ending on El Yacaré e62, not Adiós, Arrabal e56
  after it. Where only a corpus opener or a less-loved side is hotter (Biagi's Pura Clase, Pugliese's Negracha) the
  older rules keep their closer: the panel's "last side within 1 of the top fame" and "an opener never closes" stand.
- **O4** (F1): of two corpus openers the cooler one opens (Zorzal e62 before La Mulateada e70) — unless it would open
  more than 15 under the previous tanda's last side (the round-16 cliff rule outranks it), and not inside a release cut.
  The strict panel reads the previous side for it through `OrderCtx.prevSide` (its own `openCliff` reports the cliff).
- The four weigh 3 each in the order cost (over the round-16 fade 2, under the side-level cliff 12 and the corpus roles
  20) and count also among orders that already break an older rule (a summit of four fame-5 sides with two corpus
  openers), and they are `sideOrder` items for the strict panel.
- Retuned (review R2): "the last side is a corpus closer or one of the two hottest" reads "within 2 of the second
  hottest", so No Mientas e82 closes a summit of e84s and the corpus opener Pensalo Bien need not.

### 2.3 Findings not turned into rules this round

- F5–F7, F10 (tanda content and the arc: an outlier side in a summit, fame-2 summit sides, targets, the same orchestra
  and era twice): selection and arc changes, out of an order round. The order rules move part of it anyway — the
  candidate night's summit (tanda 10) no longer holds Ansiedad.
- F1 / F2 / F8 at the featured T21 → T22 (Biagi / Ibáñez vals → Caló / Berón): the reviewer calls the round-17 release
  cut (the vals ending on Lejos de Ti e77, Caló / Berón opening on its corpus closer) a blocker and its cure a softer
  cooldown vals — a selection change. Kept as round 17 ordered it: O3 and O4 yield inside a release cut (`isReleaseCut`
  in the panel, `releaseCut` in the boundary fixer); a first draft that let O3 undo it brought the e82 → e58 step back as
  `energyStep` and broke the round-17 panel's invariants. Left for a selection round: replace the cooldown vals.
- F9 (the cue between the two edge sides): measured, not adopted — it contradicts the round-10 rule (a cue about 8 under
  the next tanda) on 149 of 339 gaps and the panel never asked for it.
- F11–F14 (style classes, labels, years zig-zag): reported for the next round.

## 3. The candidate featured night

`docs/specs/round19-best-night.json` and `.md`: the featured options (seed 199) through `compose` + `improveNight` +
`attachBooth`, every Spotify id of the shipped night carried over for the sides and cues that stay. Not written to
`apps/web/public/featured/golden-double-peak.json` (another agent is editing it; the lead merges). See the `.md` for the
song-by-song listing and what changed in the order and why. In short: engine 91 (shipped 90 re-scored), benchmark 96
(shipped 91), 0 blockers · 1 should-fix (`rhythmicRun`, as shipped; the shipped JSON under the round-19 rules: 0
blockers · 6 should-fix with `cueSpotify` and `sideOrder`); 85 / 85 sides and 22 / 22 cortinas with a Spotify id (every
id of the shipped night carried over; the two new sides, Indiferencia and Mi Romance, take judged ids of the cache).
The cortinas are the shipped night's, slot by slot (Erol Evgin's İşte Öyle Bir Şey now with its Spotify record).

- T4 D'Arienzo 1936–37: Ataniche opens (O1; the reviewer's order).
- T5 Láurenz / Casas: De Puro Guapo, Desconsuelo, Como Dos Extraños, No Me Extraña (O2; the reviewer's order).
- T10 D'Arienzo / Echagüe summit: Ansiedad is out (F5), La Bruja, Indiferencia, Pensalo Bien, No Mientas.
- T15 Tanturi / Castillo vals: Mi Romance, Recuerdo, La Serenata — rising, no hole (Marisabel out).
- T21 / T22 unchanged (the round-17 release cut, §2.3).

The round-16 E and round-17 D invariants read the shipped JSON: they fail on it now (it lacks İşte Öyle Bir Şey's new
Spotify record and has the four orders above) and pass on this candidate (checked: 0 blockers · 1 should-fix, every
side and cue carries the cache's id, the export plan has 0 unresolved rows, every order verdict empty with release cuts
judged as such, T21 / T22 in the DJ's round-17 order, the same sides as `compose` + `improveNight` of seed 199).

## 4. Songs: Spotify coverage of the golden set

`pnpm index:enrich -- --ids=<the golden set's sides without an id> --refresh` under the shared match rules (the round-17
singer-credit rule included; every accepted id judged by `matchProblem`, the cache audit clean: 453 checked, 0
rejected) took the golden set S1–S12 from 702 / 1008 sides with a Spotify id (69.6 %) to 1007 / 1012 (99.5 %; still
none: Jueves and Expresión Campera — Enrique Rodríguez 1941–42, De Barro — Caló / Ortiz 1943, Yo No Sé por Qué Razón
— Rodríguez / Moreno 1942). **Held back** (committed, then reverted): the new ids change which sides are streamable, so
the golden set and the featured options compose differently, and 15 invariants of rounds 9 and 14–17 fail on the
round-18 engine as well (peakHits, bestWindow, instrCharacter, cuePopPeak / cuePopHour, rhythmicRun, cueArtist,
cueVals, fixer parity, R16-4, R16-11, R9.2, round-17 seed 199). Not cheap: it needs its own round with the ratchets
re-measured. Kept: the one id the candidate night needs (Mi Romance, Tanturi / Castillo 1941), which leaves every
golden and featured composition unchanged (checked side by side).

## 5. Checks

- `pnpm quality`: pass. Golden set S1–S12 engine 87–91 after improveNight (round 18: 87–91), benchmark mean 86.8
  (round 18: 87.6); S3's benchmark 87 → 82 (its `instrumental` check reads near: the new tanda orders shift the energies
  the next slots are chosen against, and tandas 17–20 come out four vocal tangos in a row), every other golden night
  equal or better; 0 blockers on every composed night; the featured options (seed 199) engine 91, benchmark 96,
  0 blockers · 1 should-fix. Stream audit: 364 Spotify ids checked, 0 rejected; cortina records 0 rejected.
- `pnpm --filter @tdj/core test`: 453 / 456 pass. The 3 failures read the shipped
  `apps/web/public/featured/golden-double-peak.json` (round-16 E: it lacks İşte Öyle Bir Şey's new Spotify record;
  round-17 D ×2: the round-19 rules flag four of its orders and that cue). With the candidate night in its place (in a
  scratch worktree) round16.test.ts and round17.test.ts pass 54 / 54: they pass once the lead merges the candidate.
- Updated older invariants (each a rule the review showed wrong): round 9 R9.7 (the one slow hit of a rhythmic tanda
  may open), round 11 R4 (the closer within 2 of the second hottest), round 17 D (a release cut judged as one).
- `apps/web`: `src/lib/spotifyPlan.test.ts` 4 / 4; e2e `connectors.spec.ts` + `round15-export.spec.ts` 32 / 32 (the
  running-order test now strips one cue's record and checks its stand-in sits in its own row).
- `pnpm lint` 0 errors, `pnpm typecheck` clean.
