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
| Turkish-cortina nights: cortinas without a Spotify id | 145 / 649 (22.3 %), 30 / 30 nights with a gap | 0 / 649, 0 nights |
| Default (global) nights: cortinas without a Spotify id | 646 / 646 (100 %), 30 / 30 nights with a gap | 0 / 647, 0 nights |

Per culture (cues · with a Spotify record · drawable): before global 42 · 0 · 35, Turkish 52 · 28 · 48, Italian 6 · 0
· 5, French 6 · 0 · 6, Greek 5 · 0 · 4, Persian 6 · 0 · 3, Balkan 4 · 0 · 3, K-pop 6 · 0 · 6, Afrobeats 4 · 0 · 4,
Latin 1 · 0 · 1, Brazilian 2 · 0 · 1, Arabic 2 · 0 · 2. After: global 42 · 41 · 40, Turkish 52 · 51 · 49, Italian
6 · 6 · 6, French 6 · 6 · 6, Greek 5 · 4 · 4, Persian 6 · 3 · 3, Balkan 4 · 3 · 3, K-pop 6 · 6 · 6, Afrobeats
4 · 4 · 4, Latin 1 · 1 · 1, Brazilian 2 · 1 · 1, Arabic 2 · 2 · 2. (A cue with no Deezer preview but a checked Spotify
record is audible since round 16's loader, so a few formerly silent cues joined the pools.)

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
flags a cue without a Spotify record on such a night, and `improveNight` re-picks it. Settings lists no export targets
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

How often the findings' patterns occurred in S1–S12 and featured seeds 199 / 255 / 97 (339 tandas, compose +
improveNight), before → after:

| Pattern | Before | After |
|---|---|---|
| F1 corpus roles backwards (a closer first or an opener last while another side could go there) | 5 | 0 |
| F3 a hole in a rhythmic tanda (a side ≥ 8 under both neighbours) | 20 | 0 |
| F4 the second side falls > 8 under the opener (> 12 for a lyrical fame-5 side) | 21 | 0 |
| O4 the hotter of two corpus openers opens | 7 | 4 |
| F2 the last side > 4 under the hottest other side (raw count, fixable or not) | 35 | 32 |

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
- **O3** (F2, ✗): the last side is not more than 4 under the hottest of the others when that side could close itself
  (fame within 1 of the top, no corpus opener) — D'Agostino / Vargas ending on El Yacaré e62, not Adiós, Arrabal e56
  after it. Where only a corpus opener or a less-loved side is hotter (Biagi's Pura Clase, Pugliese's Negracha) the
  older rules keep their closer: the panel's "last side within 1 of the top fame" and "an opener never closes" stand.
- **O4** (F1): of two corpus openers the cooler one opens (Zorzal e62 before La Mulateada e70).
- The four weigh 3 each in the order cost (over the round-16 fade 2, under the side-level cliff 12 and the corpus roles
  20) and count also among orders that already break an older rule (a summit of four fame-5 sides with two corpus
  openers), and they are `sideOrder` items for the strict panel.
- Retuned (review R2): "the last side is a corpus closer or one of the two hottest" reads "within 2 of the second
  hottest", so No Mientas e82 closes a summit of e84s and the corpus opener Pensalo Bien need not.

### 2.3 Findings not turned into rules this round

- F5–F7, F10 (tanda content and the arc: an outlier side in a summit, fame-2 summit sides, targets, the same orchestra
  and era twice): selection and arc changes, out of an order round. The order rules move part of it anyway — the
  candidate night's summit (tanda 10) no longer holds Ansiedad.
- F8 (boundary cliffs ≤ 15): the round-17 `energyStep` rule and fixer cover it at 16; the reviewer's remedy for the
  featured T21 → T22 cliff is a softer cooldown vals, a selection change. With O3 the Biagi / Ibáñez vals now ends on
  Loca de Amor (the reviewer's order) and `energyStep` reports the e82 → e58 step instead of hiding it inside the tanda:
  the round-17 "release cut" that ended the vals on its weakest side is, per the review, the wrong cure.
- F9 (the cue between the two edge sides): measured, not adopted — it contradicts the round-10 rule (a cue about 8 under
  the next tanda) on 149 of 339 gaps and the panel never asked for it.
- F11–F14 (style classes, labels, years zig-zag): reported for the next round.

## 3. The candidate featured night

`docs/specs/round19-best-night.json` and `.md`: the featured options (seed 199) through `compose` + `improveNight` +
`attachBooth`, every Spotify id of the shipped night carried over for the sides and cues that stay. Not written to
`apps/web/public/featured/golden-double-peak.json` (another agent is editing it; the lead merges). See the `.md` for the
song-by-song listing and what changed in the order and why.

## 4. Songs: Spotify coverage of the golden set

`pnpm index:enrich -- --ids=<the golden set's sides without an id> --refresh` under the shared match rules (the round-17
singer-credit rule included; every accepted id is judged by `matchProblem` and the cache audit passes): golden set
S1–S12 sides with a Spotify id 702 / 1008 (69.6 %) → 1007 / 1012 (99.5 %). Still none: Jueves (Enrique Rodríguez
1941), De Barro (Caló / Ortiz 1943), Yo No Sé por Qué Razón (Rodríguez / Moreno 1942), Expresión Campera (Rodríguez
1942).

## 5. Checks

See the commit messages and the report for the exact numbers of `pnpm quality`, the core suite and the export e2e.
