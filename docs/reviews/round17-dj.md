# Round 17: final DJ review of the featured night (seed 199)

**What this is:** the same reviewer and the same strictness as `round14-dj.md` to `round16-dj.md`, applied to the night about to ship.

**The night:**

| | |
|---|---|
| Seed | 199 |
| Engine | 90 |
| Benchmark | 91 (17 of 18 checks) |
| Strict panel | 0 blockers, 5 should-fix |
| Length | 23 tandas, 4.02 h |
| Cortinas | 41–49 s |
| Arc | double peak |
| Opener / última / closer | D'Agostino/Vargas · Tanturi/Castillo · Tanturi 1940 *La Cumparsita* |

**Sources:**
- `scratchpad/best8/shipped.txt` (the listing)
- `apps/web/public/featured/golden-double-peak.json` (the shipped data)
- `docs/specs/round16-best-night.md`

**Streaming:** I checked every replacement side below against `data/cache/resolve/tracks.json` and `data/cache/spotify/tracks.json`. Every side named in a fix streams, at least on Deezer.

---

## 1. Verdict

**Ship as is: yes. Mark: 89/100.** With the two order edits in §3 it is about 90.

This is the best night the engine has produced. Strengths:
- the TTVTTM cycle is intact
- 9/9 canon families and 12 orchestras
- no jarring transition (minimum 76.4)
- every side streams (85 of 85)
- the right opener and the right última
- Pugliese/Chanel three slots before the last summit, and the last summit is the hottest tanda of the night (e86)
- a proper cool-down: Troilo instrumental, the Biagi/Ibáñez vals, Caló/Berón, then Tanturi/Castillo ending on *Así Se Baila el Tango*

None of the five residual items stops the ship:
- two need side-order edits
- three are rules that are over-strict for this night (§2)

**One condition for a Spotify export:** see §4.

---

## 2. The residual should-fix items

| Item | Real or acceptable | Why | Exact fix, or the retuned rule |
|---|---|---|---|
| **energyStep 20→21:** Biagi/Ibáñez vals e82 → Caló/Berón e58 | **Real, at the side level** | The vals ends on *Loca de Amor* (e89). The next tanda opens on *Tristezas de la Calle Corrientes* (e58). That is a 31-point cliff, even behind the slow cue *Bu Kalp Seni Unutur mu* | Reorder both tandas, with the same sides, all of which stream:<br>• **#20 Biagi/Ibáñez:** *Viejo Portón* (e81, fame 4), *Loca de Amor* (e89, 5), *Lejos de Ti* (e77, 5)<br>• **#21 Caló/Berón:** *Qué Te Importa que Te Llore* (e61, 5), *Jamás Retornarás* (e56, 5), *Trasnochando* (e58, 3), *Tristezas de la Calle Corrientes* (e58, 5)<br>The boundary drops to 77 → 61 (16), behind a slow cue; that is a release, not a cliff. Both tandas still open on fame ≥ 4 and end on fame 5. The tanda-level −24 then stands as the planned release before the última |
| **wedge:** Caló/Berón (e58) before the Tanturi/Castillo última (e78) | **Acceptable: the rule is over-strict here** | My round-14 S7 targeted a little-known soft tango (Demare at e53, fame 3) wedged before the última. Caló/Berón 1942 (mean fame 4.5) is the classic "last romantic tanda": the floor embraces once more, then the última lifts. The cue into the última, *Senden Daha Güzel*, is medium tempo, so the lift is intact | **Retuned wedge:** the tango before the última may be lyrical and more than 12 below the última when its mean fame is ≥ 4.5, its sides all stream, and the cue into the última is not `tempo:slow` |
| **darienzoPeak:** last summit = D'Arienzo instrumental 1935–38 | **Acceptable: the rule is over-strict** | My round-14 S2 window (1937–40) was meant to keep soft Mauré sets off the summit, not to exclude *Hotel Victoria* (1935, fame 5), one of the hottest D'Arienzo instrumentals there is. The tanda is e86 on a target of 85, opens on fame 5, and is the night's maximum | **Retuned darienzoPeak:** a D'Arienzo summit is Echagüe 1938–39, or instrumental **1935–40**, with a fame-5 side and mean fame ≥ 3.75 |
| **rotation:** #18 shares sub-period and mode (pre-1938-07 instrumental) with #3 | **Acceptable** | #3 (El Cencerro, El Cachafaz, Ataniche, Jueves; 1936–37) and #18 (Hotel Victoria, Champagne Tango, La Catrera, El Esquinazo) are 15 tandas and 2.6 h apart, share no title, and sit at opposite ends of the night: the warm-up hook and the summit. The Biagi-era sound twice in one night is what Istanbul floors love. The only full fix, moving #3 to the 1939 instrumentals (El Pollito, Yunta Brava, Maipo, Charamusca, which all stream), heats the warm-up to about e86 with fame-3 sides. That costs more than it gains | **Retuned rotation:** two tango tandas of the same orchestra, sub-period and mode are allowed once per night when they are ≥ 12 tandas apart, share no title, and one of them is a planned summit |
| **rhythmicRun at #9:** Biagi/Falgás (R+), Donato instrumental (R), D'Arienzo/Echagüe (R+), with the Rodríguez vals between | **Real but mild. Accept for this ship** | The build into peak 1 runs on rhythm for about 50 minutes: #6–#9. The Donato instrumental is the soft middle. The floor will not mind, but a top DJ would put a lyrical or balanced tango at #7. Every legal swap is blocked by gaps. The cleanest fix costs another rule by 1 point | **Optional fix** (all sides stream):<br>• **#7** ← **Di Sarli instrumental 1940** (*Shusheta*, *La Trilla*, *El Incendio*, *Milonguero Viejo*)<br>• swap the milongas: **#11** ← Donato/Lagos, **#17** ← Di Sarli/Rufino<br>• cue 7 → an up-tempo cue (*Bambaşka Biri*), for the lift into the Rodríguez vals<br>The cost: the pre-summit milonga becomes Di Sarli's lyrical one at e68 for a target of 77, so `preSummit` misses by 1. I would ship without this. **Rule stays** as retuned in round 16 |

**The summit order.** Echagüe takes the first summit and the instrumental takes the last. **Accepted.**
- The last summit is the night's hottest tanda (e86 against e81 for Echagüe), and it opens on a fame-5 side.
- Swapping the two would put the Biagi vals at #20 (e82) above an Echagüe summit at e81, which breaks `coolVals`.
- This order is right for this night.

---

## 3. Song order inside every tanda

I read all 23. Twenty-one are right as they are.

**Right, and my round-16 fixes have landed:**
- **#4 Láurenz/Casas:** opens on *De Puro Guapo* after *Jueves* (a step of 13).
- **#13 Troilo/Fiorentino:** opens on *Sosiego en la Noche* after *El Trece* (a step of 15).
- **The última** ends on *Así Se Baila el Tango*.
- **Hits first:** *Hotel Victoria* opens the last summit, *Corrientes y Esmeralda* opens Pugliese, and *Pura Clase* sits third in the Biagi instrumentals.

**Real order faults:** the two in §2, #20 and #21.

**Taste notes:**
- **#17 Donato/Lagos milonga** opens on *Porteña Linda* (fame 3). *La Milonga que Faltaba* (fame 4) first would invite better, with *Sacale Punta* last as now.
- **#15 Pugliese/Chanel** ends on *La Abandoné y No Sabía* (3:13, fame 3). *Rondando tu Esquina* (fame 4) last would close the tanda on a stronger side. Both stream.

---

## 4. Night shape, cortinas, export

**Opener:** D'Agostino/Vargas 1941 (Agua Florida … Tres Esquinas). The canon opener, at e57 on a target of 54. Right.

**Última:** Tanturi/Castillo 1941–42, fame 4.5. Right.

**Closer:** Tanturi 1940 *La Cumparsita* (fame 2) straight after the Tanturi última. **Acceptable.** Under the stricter export matching, no other in-range version streams: the Di Sarli 1942 row has audio features but no stream. `closerVary` correctly passes. This is a data to-do, not a rule fault: resolve the Di Sarli 1942, Troilo 1943 and De Angelis 1944 versions.

**Cortinas.** I see no cue fault.
- Dance-pop appears once per hour at most, and never before a target ≥ 80: *Hadi Bakalım* (cue 2), *Araba* (cue 11), *Kuzu Kuzu* (cue 19).
- The cue before Pugliese is *Bir Derdim Var*, now tagged melancholic.
- The cue after the summit is medium tempo.
- The cue into the última is medium tempo.
- No artist plays more than twice.

**Spotify export (condition, not a ship blocker).**
- Only 52 of 85 sides, 13 of 22 cortinas and not the closer carry a Spotify id.
- Five whole tandas have none:
  - #8 Rodríguez vals
  - #11 Di Sarli milonga
  - #13 Troilo/Fiorentino
  - #14 Tanturi vals
  - #15 Pugliese/Chanel
  - #17 Donato milonga also has none.
- The night plays fully from Deezer, 85 of 85.
- For the featured "Export to Spotify" button: run `pnpm index:enrich` under the round-15 matching rules before the release, or label the night "plays on Deezer; Spotify export partial (52/85)".

---

## 5. Taste (not for this ship)

- **Both summits are D'Arienzo,** as in every night since round 14.
- **The Donato instrumental 1936–39 filler (#7)** is still here.
- **#16 Malerba/Medina** (colour, e57 on a target of 73) right after Pugliese is a gentle exhale before the climb (+16, then +13) to the summit. Fine on the floor, a little deep on paper.
- **Vocal tango share is 0.69,** the top of the band. A sixth instrumental would balance hour 3.
- **Biagi, Troilo and D'Arienzo each play three tandas.** That is legal under the caps, and it is how this canon-heavy night reaches 9/9.

---

## 6. Summary

| | |
|---|---|
| **Ship as is** | **Yes, seed 199** |
| **Mark** | **89/100** (~90 with the #20/#21 side reorders) |
| **Real items** | `energyStep` (side-order fix above); `rhythmicRun` (mild, optional fix) |
| **Acceptable** | `wedge`, `darienzoPeak`, `rotation` (retuned rules above); the Echagüe-first summit order; the Tanturi closer (data to-do) |
| **Condition** | Spotify export: enrich first, or label it partial |
