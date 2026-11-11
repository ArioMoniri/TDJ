# Round 18 — Play the night matches Spotify

Complaint: "list in play night dont match spotify and there are ui issues in play night page even after playlist
update". Scope: the booth (`apps/web/src/app/booth`, `components/booth/*`, `lib/booth/**`) and the featured night
`apps/web/public/featured/golden-double-peak.json` (108 items: 23 tandas, 23 cortinas, the closing).

## 1. What was wrong

| | before | after |
|---|---|---|
| Item lengths, clock, "ends", time to La Cumparsita | the catalogue's side length (`durationSec`), which keeps Deezer's length when the two transfers disagree by > 8 s: El Cencerro 160 s (Spotify 151.5), Griseta 139 (130.3), Pensalo Bien 150 (136.9) | the checked Spotify recording's length for every side with one (107 of 108; the full night is 4:05:40 from the first item) |
| Closing La Cumparsita | `planEntities` never added `p.closing`: the row printed "?" with "no source", and it counted as one of the "9 without a clip" | the closing is the night's La Cumparsita (Spotify 166.2 s, a Deezer clip 2 s off) |
| 30 s rehearsal | every Deezer `resolved` with a preview played, whatever recording it was: 9 were another transfer or take, 6.9–15 s off the Spotify recording (Recuerdo Malevo 168/153 s, Pensalo Bien 150/137, La Vida Es Corta 157/144, Así Se Baila el Tango 162/154, El Cencerro 160/151, Griseta 139/130, Pocas Palabras 149/141, Marisabel 142/150, cortina Ben Sana Vurgunum 264/271); 8 sides had no clip; "9 without a clip, skipped" | 107 of 108 rehearse a clip of the Spotify recording: 16 Spotify previews of the checked track ids, 91 Deezer clips proven the same recording; 1 is "not rehearsable" (Milongueando en el 40), named with its reason |
| Spotify Premium | (already) the adapter plays `song.spotify.uri` | proven by a unit test and an e2e test: one `PUT /me/player/play` with `uris: [stored uri]`, no search |

## 2. The rules (`apps/web/src/lib/booth/clips.ts`)

1. **Length.** A side with a checked Spotify match (`spotify.uri` is a `spotify:track:` id with a `durationMs`) is
   planned at that recording's length: `withSpotifyLengths(p)` is the copy `attachBooth` times; the set itself is not
   changed (`durationSec` stays the catalogue's side length for the musical rules and the benchmark). Cortinas keep
   their planned stop. The plan written back into the set is the one Export's cue points read.
2. **Rehearsal clip**, in order:
   - Spotify's own 30 s preview of the checked track (`spotify.previewUrl`, only `https://p.scdn.co/mp3-preview/…`);
   - else the Deezer `resolved` clip, only when it is the same recording: its length within **6 s** of the Spotify
     recording (the match rules' own "this is the side" band, `matchProblem`'s `lengthOk`: −6…+6 s) **and** accepted
     by `matchProblem` (sides) or `cortinaMatchProblem` (cortinas) with the Spotify length as the reference;
   - an item with no Spotify match keeps its Deezer clip (it is the item's only recording);
   - else no clip, with the reason ("no clip of the Spotify recording", "the clip is another transfer or take (168 s,
     Spotify 153 s)", "the clip is not the Spotify recording: …").
   Evidence for 6 s: on the featured night the Deezer/Spotify pairs inside the band differ by 0–5.9 s (transfer speed,
   trimmed silence); the pairs outside differ by 6.9–15 s, and on five of them one side is a dated restoration or a
   remaster (Recuerdo Malevo, La Vida Es Corta, Así Se Baila el Tango and Marisabel "Buenos Aires d/m/y" restorations,
   Pensalo Bien "(Remastered)"), i.e. another transfer, which the round-15 discography review already treated as such.
3. The booth says what it cannot rehearse: the Now card's "N not rehearsable: no clip of the Spotify recording"
   opens the list with each reason; the set row says "no clip"; the Time card shows the full night on Spotify
   beside the 30 s rehearsal clock.

## 3. Data

`scripts/audit_featured_clips.ts` (`pnpm --filter @tdj/web exec tsx ../../scripts/audit_featured_clips.ts [--fix]`)
prints every item's Spotify and Deezer length and verdict. `--fix` cleared the 9 Deezer entries that are another
recording and wrote `spotify.previewUrl` for 16 checked ids from `data/cache/spotify/previews.json` (Spotify's
previews of those exact track ids, read from the Spotify connector's search results where the result's uri equals the
stored uri; all 16 URLs answer 200 with a 30 s MP3). No tanda, order, song or Spotify id changed. The Web API was
rate-limited (Retry-After ≈ 9 h), so ISRCs could not be compared; Milongueando en el 40's stored id
(`5HyQ0ZvSrhajVpUNgJUHIz`) did not appear in the connector's results (a relinked id is likely; it plays, but has no
preview here). Not a proven wrong id, so it stays. `pnpm quality` passes; the stream audit is unchanged (0 rejected).

## 4. UI

| issue | fix |
|---|---|
| Phone: the glass header covered the Now card | the set column scrolled the **window** to the playhead row on load (`scrollIntoView`); it now scrolls only its own scroller (≥ 1024), so the page opens at the top |
| Phone: the Start pill ran off the left edge | label "Start · 30 s clips" / "Start · Spotify" / "Start · your files" (the count joins it ≥ 1200 px); the pill can shrink; before the night starts the disabled Next and Stop leave the phone strip |
| Phone: a stray vertical handle over the set | the tab bar minimised on scroll to one tab; it no longer minimises on /booth |
| Strip over the content's end | `.booth` bottom padding = the space the strip takes from the viewport's foot (measured into `--booth-strip-space`) + 16 px |
| Desktop: "Tres Esquinas" row misaligned | every row has fixed trailing columns (length 36 px · one 44 px action · swap 44 px); the action is "Find a file" where one is needed, else the Spotify mark linking the recording the booth plays |
| Desktop: gap between Now and Time | grid rows `auto 1fr`: the spanning set column's height goes to the second row |
| Desktop: fader knobs above the strip | the strip's faders are horizontal inside its 64 px row |
| 1440: 88 px horizontal overflow | the page toolbar's bleed assumed the 980 px column; the booth's is 1400 |
| Light theme lost on the way in | the persisting effect wrote "dark" over a stored "light" when the booth was ready at mount |

## 5. Tests

- vitest `apps/web/src/lib/booth/clips.test.ts` (lengths, closing, clip rules on synthetic and featured data) and
  `sources/spotify.test.ts` (prepare returns the stored uri for all 107; one play call, no search).
- Playwright `apps/web/e2e/round18-booth.spec.ts`: lengths equal the featured JSON's Spotify durations, the Spotify
  links, the one not-rehearsable item; Premium plays the stored uri; phone 390: no overflow, the pill fits, page at
  the top, the last row clears the strip, the tab bar whole; 1440: Time under Now, faders inside, one length column.

Screenshots (deviceScaleFactor 1, 390/430/820/1024/1440, dark and light) were captured into the session scratchpad
(`r18/before`, `r18/after`); README media were not regenerated.
