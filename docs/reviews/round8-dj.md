# Round 8 — a working DJ uses TDJ for tonight

*Reviewer: 15 years in the booth (marathons, encuentros, a weekly milonga I also organise). I used the live build at https://d3k5k2c1l0s5ri.cloudfront.net on a 1440 px laptop and a 430 px phone (Chromium), composed four nights through the UI, re-ran the defaults on eight seeds plus nine context/rule variants through the same compose endpoint the UI calls, read every tanda, swapped, locked, gave feedback, used "Tell the DJ", edited the Database, read the Guide, opened every export and judged the files, ran the Booth in rehearsal mode on desktop and phone, and went through Settings the way a DJ without a terminal would. Nothing under `apps/`, `packages/` or `data/` was changed. Set lists, exports and screenshots are in the session scratchpad (`nights/*.txt`, `seeds/S*.txt`, `ctx/*.txt`, `dl/`, `shots/`).*

**Headline.** The engine has fixed the five things round 4 said were wrong: the first D'Arienzo now lands at 18–32 % as a 1935–37 instrumental in every seed, Pugliese is late (0.77–0.91) and the última is a real closing tanda (Di Sarli instrumental, Troilo, Tanturi–Castillo) at the target energy, every tanda is role-ordered (0 violations in 176 tandas), placeholder years are gone from the golden default, and the cortinas come in one family. If you hand me seed S1 I can play it tonight with four swaps. But the product around the engine still lets a DJ walk into three things that would embarrass them in front of a room: the Buenos Aires preset closed my Saturday night on a Troilo *inéditos* bootleg tanda with a milonga inside it, "Tell the DJ: more D'Arienzo" silently turned a 4-hour night into 53 minutes while reporting "Applied", and the same D'Arienzo tanda (*Rawson, Ataniche, Joaquina, Jueves*) opens the D'Arienzo slot in 7 of 8 seeds, so two DJs using TDJ in the same city play the same tanda.

Booth marks (what I would give these sets after dancing to them, engine score in brackets): práctica 2 h **74** (86), Saturday Buenos Aires 4 h **58** (90), marathon 6 h **66** (86), post-golden 4 h **55** (74), default seeds S1–S8 **70–78** (87–92).

---

## 1. The nights I composed

### 1.1 Práctica, 2 h, afternoon, beginners (`A-practica-2h`, 11 tandas, 2.01 h, engine 86)

| # | Tanda | Energy | What I'd do |
|---|---|---|---|
| 1 | Canaro instr 1937–38 · *Olvídame, Desencanto, Champagne tango, La maleva* | 52 / target 35 | Fine opener for a práctica; a beginner floor needs the clearest 2/4 in the room and this is it. |
| 2 | **D'Arienzo instr 1935–39** · *Rawson, Ataniche, Trago amargo, Joaquina* | 76 | Right idea (afternoon rule: open with D'Arienzo 36–38), but tanda 2 of 11 at e76 is the peak of the afternoon already. |
| 3 | Caló/Iriarte vals 1944–45 · *No te olvides de mi corazón, El mismo dolor, Me duele el corazón* | 62 | Good beginner vals; I'd play it. |
| 4 | De Angelis instr 1948–52 · *Nueve de julio, Cuando llora la milonga, El huracán, Gloria* | 61 | Good; square phrases, easy. |
| 5 | Rodríguez/Moreno 1941–42 · *El encopao, Suerte loca, Mírame de frente, El huérfano* | 66 | Good. |
| 6 | Troilo/Fiorentino milonga 1941–42 · *Mano brava, Del tiempo guapo, Papá Baltasar* | 74 | Wrong milonga for beginners: these are the fastest, most syncopated Troilo milongas. Canaro 1935–38 or Donato–Lagos here. The context text itself says "milongas slow (Canaro ≤ 110)". |
| 7 | Di Sarli instr 1939–40 · *Shusheta, El retirao, El incendio, Nobleza de arrabal* | 59 | Perfect práctica tanda. |
| 8 | Biagi instr 1938–40 · *Pura clase, Unión cívica, El yaguarón, El trece* | 77 | Biagi at 73 % of a beginners' práctica is a choice, not a mistake; I'd take Biagi/Ortiz 1940 (slower). |
| 9 | Tanturi/Castillo vals 1941–42 · *Mi romance, Recuerdo, Marisabel* | 71 | Good. |
| 10 | **D'Arienzo/Mauré 1941–44** · *Ya lo ves, Amarras, Lilian, Humillación* | 74 / target 54 | The "cool-down" slot delivers a hot vocal D'Arienzo at +20 above target. Swap for D'Agostino–Vargas or Canaro–Maida. |
| 11 | **De Angelis instr 1953–55** · *El Vazquito, La loba, Caminito, Guardia vieja* | 59 | A 1950s De Angelis instrumental as última of a práctica is fine, but *El Vazquito* and *La loba* are filler; *Pavadita, El tango club, Pregonera* exist. |
| — | Cumparsita Di Sarli 1955 | | Correct. |

Cortinas: Volare, Boum!, Gainsbourg, Carosone, Piaf, then **Boum! three times in eleven tandas**; the research row for práctica says "short-or-none" and the engine kept 40–45 s. No 3-track tandas although the model asks for them for beginners (`contextApplied.skipped: tangoTandaSize`, because the UI sends tanda sizes as explicit on every compose). Verdict: playable after swapping 6 and 10; the context changed cortinas and vocal bias but not the one thing beginners need (slower milonga, 3-track tandas).

### 1.2 Saturday milonga, 4 h, Buenos Aires rules (`B-ba-4h`: region Buenos Aires, Saturday, prime night, hammock shape, two Cumparsitas; 22 tandas, 4.00 h, engine 90)

| # | Tanda | e / target | Verdict |
|---|---|---|---|
| 1 | Canaro/Maida 1935–38 · *Ciego, Paciencia, Yo también soñé, Nada más* | 50/50 | Canon opener; *Paciencia* second rather than closing, but the hammock asks for that. Good. |
| 2 | D'Agostino/Vargas 1941–42 · *Agua florida, Ninguna, Pero yo sé, Tres esquinas* | 58/52 | Textbook; *Tres esquinas* closing is right. |
| 3 | Rodríguez/Moreno vals 1940–44 · *Isabelita, Con tu mirar, Uno que ha sido marino* | **72/57** | The slot-3 vals is +15 over target in every seed (same as round 4's OTV problem, different orchestra). Canaro–Maida or Di Sarli–Rufino vals here. |
| 4 | D'Arienzo instr 1935–37 · *Rawson, Ataniche, Joaquina, Jueves* | 74/72 | Right place, right years. Same four titles as 7 of 8 seeds (see §2). |
| 5 | Tanturi instr 1940–41 · *El buey solo, Una noche de garufa, Argañaraz, Comparsa criolla* | 66/60 | Good. |
| 6 | Caló/Berón milonga 1942 · *Milonga que peina canas, Milonga antigua, Azabache* | 69/70 | Good; a lyrical milonga at 27 % is exactly where I'd put it. |
| 7 | Di Sarli instr 1941–43 · *El amanecer, Organito de la tarde, El jagüel, Don Juan* | 69/69 | Good. |
| 8 | Troilo instr 1941 · *Cachirulo, El tamango, Cordón de oro, Guapeando* | 75/74 | Excellent. |
| 9 | Biagi instr 1941 vals · *Marchetta, Pájaro herido, Lágrimas y sonrisas* | 85/81 | Good; hot but at 41 % that is the first peak. |
| 10 | **De Angelis/Larroca 1953–55** · *A mi padre, En tus brazos, Volvamos a empezar, Como no…* | 66/**81** | Larroca 1953–55 at the first peak, −15 under target. De Angelis–Dante 1944–46 or Rodríguez–Moreno belong here. |
| 11 | D'Arienzo instr 1950–53 · *Seguime si podés, Yapeyú, Canaro en París, Independencia* | 84/82 | Good (though two instrumental D'Arienzo tandas before the first vocal one is unusual in BA; Echagüe 1938–39 would fit here). |
| 12 | Laurenz/Casas milonga 1938–40 · *Milonga de mis amores, Milonga de mi flor?, Improvisando* | 77/86 | *Milonga de mis amores* is right. |
| 13 | Rodríguez instr 1940–44 · *Florida, La torcacita, Argentino soy, El morochito* | 65/77 | Fine. |
| 14 | Di Sarli instr 1940 · *Shusheta, Milonguero viejo, El incendio, Nobleza de arrabal* | 62/76 | Second Di Sarli instrumental of the night, same 1940 family twice (7 and 14) — the repeat gap counts orchestras, not families; a BA DJ would make one of them Di Sarli–Rufino. |
| 15 | Troilo/Fiorentino vals 1942–44 · *Temblando, Valsecito amigo, Acordándome de vos* | 71/79 | Good. |
| 16 | Biagi instr 1938–42 · *Pura clase, Bélgica, La maleva, El trece* | 80/80 | Good. |
| 17 | Tanturi/Castillo 1941–42 · *Como se pianta la vida, Así se baila el tango, Muñeca brava, Pocas palabras* | 79/84 | The canonical tanda, in the canonical order. |
| 18 | D'Arienzo instr milonga 1946–50 · *El potro, La espuela, La parrillita* | 94/89 | At 82 % this is where the room wants it. Good. |
| 19 | **Pugliese instr 1948** · *La yumba, Boedo, Negracha, Patético* | 82/77 | *Negracha* and *Patético* back to back at 86 % of a Saturday milonga clears the floor of everyone but the show couples. *La yumba, Boedo, Malandraca, El arranque* is the floor's version. |
| 20 | D'Agostino/Vargas 1941–44 · *Me llamo…, Adiós arrabal, El yacaré, Mano blanca* | 59/68 | Second D'Agostino–Vargas tanda; *El yacaré* and *Mano blanca* are the right late-night Vargas. OK. |
| 21 | De Angelis/Dante vals 1944–48 · *A su memoria, El vals de la noche buena?, Para ti madre* | 68/65 | Fine. |
| 22 | **Troilo "instrumental c. 1940"** · *Racing Club, El apache argentino, Milonga de la azotea, Recuerdo* + *La Cumparsita 1943* | 74/73 | **Unplayable.** These are the "ANÍBAL TROILO – INÉDITOS" rows: undated radio/live transcriptions ("1940/70" in the source), *Milonga de la azotea* is a milonga tagged tango, *Racing Club* here is not the 1941 Troilo but a bootleg. The engine printed "year ?" on the card and still chose it as the última of a Buenos Aires night. |
| — | Cumparsita D'Arienzo 1937 after a Troilo 1943 Cumparsita appended to the última | | Two Cumparsitas is the BA convention, but D'Arienzo 1937 is a shellac-era version few DJs close with; 1951 is the one. |

Cortinas: Glenn Miller / Artie Shaw / Basie / Goodman / Astaire swing — the Buenos Aires context resolved `cortinaCultures: ["latin"]` and genres `jazz, swing, rock-nacional`, and got swing only. One family, no back-to-back repeat, energy roughly matched. Acceptable, though "Buenos Aires rules" would mean rock nacional, cumbia or Sinatra and no Count Basie at e80 before Caló.

Verdict: 58. Tandas 1–9, 11–13, 15–18 are a night I would play. Tanda 22 ends it in disgrace and tanda 19 empties the floor just before. The "hammock" shape is audible (a hit first) and good.

Interactions on this night: **Swap tanda 3** returned Fresedo/Serpa vals 1942–45 (*No te olvides de mi corazón, Muchacha, No me falles corazón*) at e50 for target 57 — a sensible replacement in 1.1 s, and the card morphs. **Lock 1 and 2 + Regenerate** kept both and produced a different, equally plausible night (Tanturi–Castillo milonga at 6, Troilo 1938–41 at 7, Pugliese instr 1943–45 at 19, Tanturi–Castillo última). **Dislike** showed the chips. **Tell the DJ** is in §3.1.

### 1.3 Marathon block, 6 h, late night, advanced (`C-ui-marathon`: arc Marathon, 33 tandas, 6.00 h, engine 86; API twin `C-api` seed 11, engine 83)

Full list (UI set): Canaro/Maida 35–38 · Fresedo/Serpa 42–46 · **Di Sarli/Rufino vals 40–41 (e70 at slot 3)** · Lomuto/Omar 36–39 · Rodríguez instr 45–48 · Donato/Lagos milonga 38–40 · D'Arienzo instr 36–39 · Laurenz/Casas 38–40 · Troilo/Fiorentino vals 42–44 · Tanturi/Castillo 41–42 · De Angelis/Larroca 53–54 · Di Sarli/Rufino milonga 1941 · Rodríguez/Moreno 41–43 · Biagi/Falgás 39–40 · **OTV/Carmen del Moral vals 1940** · Laurenz/Casas 40–42 · Troilo instr 1941 · Tanturi/Castillo milonga · D'Arienzo/Echagüe 38–39 · **Pugliese/Morán 45–47 at 61 %** · Biagi/Amor vals 43–46 · Rodríguez/Moreno 45–46 · Laurenz/Podestá 1943 · Troilo/Fiorentino milonga · De Angelis/Dante 49–52 · D'Arienzo/Echagüe 38–39 (same singer/years as 19) · Caló/Iriarte vals · Di Sarli/Durán 45–46 · **Varela/Ledesma 52–55** · Canaro/Maida milonga 35–36 · **Gobbi instr 47–51** · **Demare/Quintana 44–45** · **Pugliese/Morán 51–54 as última** · Cumparsita **Canaro/Mario Alonso 1951 (vocal)**.

What I would change and why:
- The last third (27–33) is the slide round 4 described for 6-hour nights: cool-down from 82 % with Caló, Di Sarli–Durán, Varela, Gobbi, Demare — six tandas between e55 and e66 while the plateau targets say 75–85. At 03:00 on a marathon floor, Gobbi then Demare/Quintana then Pugliese is a floor that sits down. The second emotional peak (Pugliese vocal at ~85 %, Troilo–Marino, Di Sarli 50s) is missing; Pugliese was spent at 61 %.
- The Marathon arc shape barely registers: `arc: marathon-plateau` was applied but the delivered curve is the same two-peak shape with a longer tail.
- Vocal ratio 0.88 for an advanced late-night marathon; the model's "late night: vocalRatioShift +0.15" is now wired (good) but 29 vocal of 33 is too much; marathons live on instrumentals after 02:00.
- OTV/Carmen del Moral vals at 15 is the round-4 obscure vals again (it was said to be gone).
- D'Arienzo/Echagüe 1938–39 twice (19 and 26). Singer repeat gap did not prevent the same family twice in a night.
- The cortina family is right for a marathon (one culture), but *Boum!* seven times in 32 cortinas and back-to-back at 10→11 and 18→19 is the "same cue again" that dancers notice.
- La Cumparsita Canaro/Alonso 1951 is a **vocal** Cumparsita; nobody closes a marathon on it. The index has Di Sarli 1951/55, D'Arienzo 1951, Pugliese 1959.

Verdict: 66. Tandas 1–26 are a good marathon block; 27–33 need a rebuild (Troilo–Marino 44–46 → Di Sarli instr 50s → D'Arienzo instr 50s milonga → Pugliese/Morán → Di Sarli–Rufino vals → D'Arienzo instr última).

### 1.4 Post-golden night, 4 h (`D-api`, seed 12, 21 tandas, engine 74; twin `D2-api` seed 13, engine 78)

List (seed 12): Fresedo instr 57–59 · D'Agostino/Tino García 59–62 · De Angelis/Lalo Martel vals 59–62 · **Canaro/Marcelo Paz 58–59 (e41, "No te doy bolilla")** · D'Arienzo/Echagüe 56–57 · Salamanca instr milonga 64–66 · Varela instr 57–58 · Biagi/Duval 1962 · De Angelis/Godoy vals 58–61 · Di Sarli instr 1958 · D'Arienzo instr 57–61 · Caló instr 63–64 · Fresedo instr 63–65 (e43 at 62 %) · **Juan Sánchez Gorio "c. 1960" with *Milonga con variaciones* inside a tango tanda** · D'Arienzo/Bustos vals 57–58 · Pugliese instr 63–66 · Biagi instr 56–61 · D'Arienzo instr milonga 57–59 · Di Sarli/Florio 56–58 · Varela instr 62–67 · **D'Arienzo instr 63–65 última** · Cumparsita Pugliese 1959.

- D'Arienzo five tandas of 21 and within six of each other three times (11, 15, 18, 21): the repeat gap is not enforced in this preset. Four of those are good tandas; together they make the night a D'Arienzo night.
- Placeholder years are back as soon as you leave the golden preset: Sánchez Gorio "1960~" ×4 (and the Troilo inéditos above in golden with BA rules). Round 4 A6 is fixed for the default path only.
- Energy sawtooth: +40 (Canaro/Paz e41 → D'Arienzo/Echagüe e81), −29, +26. The warm-up has a Fresedo 1957 at e44 and a Canaro/Paz at e41 before a D'Arienzo at e81: this is three tandas of empty floor and then a stampede.
- Cumparsita Pugliese 1959 after a D'Arienzo 1963–65 última: correct and the best closing in all my runs.
- Seed 13: Fresedo/Hugo Marcel at e46 as the **penultimate** tanda before a D'Arienzo e84 última (+38).

Verdict: 55. A post-golden night needs the engine to read `subPeriods`/`bestYears` (Varela–Ledesma/Lesica, Di Sarli–Florio/Pomar 56–58, D'Arienzo 56–63 instrumentals, Troilo–Goyeneche 60s, Pugliese–Maciel) and to keep the 4-tanda-per-orchestra cap it already applies to Pugliese.

### 1.5 Default 4 h, eight seeds (S1–S8, 22 tandas each, 3.96–4.03 h, engine 87–92 "Headline marathon DJ")

These are the best sets TDJ has produced. S1 in full: Di Sarli/Rufino 39–42 · Fresedo instr 45–47 · Canaro/Maida vals 37–38 · D'Arienzo instr 35–37 · Demare/Berón 1943 · Laurenz/Casas milonga · Donato instr 36–40 · Tanturi/Castillo · Biagi/Ibáñez vals 1938 · Rodríguez/Moreno 40–42 · D'Arienzo/Echagüe 38–39 (*La bruja, Pensalo bien, Mandria, No mientas*) · Troilo/Marino milonga · Caló/Iriarte · De Angelis instr 48–52 · Tanturi/Castillo vals · Biagi instr 38–40 · **Gobbi instr 47–51** · D'Arienzo milonga 35–37 (*Milonga vieja milonga, La puñalada, De pura cepa*) · Troilo/Fiorentino 41–43 · **Pugliese instr 43–44 (*Mala junta, El remate, El arranque, "Farol"*)** · De Angelis vals 52–55 · **Di Sarli instr 51–55 última (*Organito de la tarde, El amanecer, El caburé, Comme il faut*)** · Cumparsita D'Arienzo 1937. I would play this with two swaps (Gobbi at the peak of a Saturday; *Farol*, see §5).

Across S1–S8: openers Di Sarli–Rufino, Fresedo, Canaro–Maida/Charlo (all canon); first D'Arienzo #4–7 instrumental 1935–37 in 8/8; Pugliese #19–20 (0.86–0.91) in 8/8; última Di Sarli instr ×3, Troilo ×2, Tanturi–Castillo ×2, **Rodríguez/Moreno 1945 ×1** (*Giuseppe el zapatero, Tu íntimo secreto, Traje de novia, Anselmo Laguna* — the one última I would not play); Cumparsita D'Arienzo 1951 ×4, D'Arienzo 1937 ×2, Di Sarli 1951 ×2, De Angelis 1961 ×1 — all real recordings.

---

## 2. Regressions and residues versus the round-4 checklist

| Round-4 item | Status today (8 default seeds + variants) |
|---|---|
| First D'Arienzo early, instrumental 1935–39, 2–3 tango tandas per 4 h | **Fixed.** #4 (0.18) ×5, #5 (0.23) ×2, #7 (0.32) ×1; always instrumental 1935–37/39; 2–3 D'Arienzo tango tandas in 8/8. **New residue:** the tanda is *Rawson, Ataniche, Joaquina, Jueves* in 7/8 seeds and in the BA, phone and post-golden-UI nights (*Trago amargo* replaces *Joaquina* once). 72 D'Arienzo 1935–39 instrumental sides exist; the night-to-night fingerprint is one tanda. |
| Pugliese late, once, cap working | **Fixed for 4 h** (#19–20, 0.86–0.91, once; `puglieseOnce` and the 6 h cap give two in 6 h as intended). **Residue:** deterministic again (always the tanda before the cooldown vals); in the 6 h marathon the first Pugliese comes at 48–61 %, too early for a marathon. *Mala junta* and *Café Domínguez* are un-blacklisted (A4 done). |
| Última energy ≥ target, closing pool | **Fixed.** Delivered 64–75 for target 67; pool Di Sarli instr, Troilo instr/Fiorentino, Tanturi–Castillo, Pugliese–Morán when asked. **Residues:** Rodríguez–Moreno 1945 obscure última (S8); Troilo inéditos "c. 1940" última under BA rules (B); `ultimaRule: d-arienzo-rhythmic` now gives *Canaro en París, El huracán, El rey del compás, Independencia* (excellent, was Mauré vocal in round 4). |
| Cumparsita year a real recording | **Fixed.** D'Arienzo 1937/1951, Di Sarli 1951/1955, De Angelis 1961, Troilo 1943/1963, Pugliese 1959 only. **Residues:** Canaro/Alonso 1951 vocal chosen for the marathon; Pugliese 1959 is indexed as a vocal (C. Guido – J. Maciel) so BA `cumparsitaCount: 2` appends nothing after a Pugliese última but appends Troilo 1943 to a Troilo one; D'Arienzo 1937 ×2 of 8 where 1951 is what the room expects. |
| Cortina repeats / one family | **Fixed** for the default: one family per night (swing, crooner, jazz, chanson+canzone), 6–15 distinct per 21, no back-to-back repeat in 8/8, energy within ±12 of the next tanda in most slots. **Regressions in the small pools:** `turkish,greek + trend` = **two cortinas alternating for 21 slots** (*Dünya Dönüyor* ×10, *Roman* ×10, back-to-back 11 times); heat context = afrobeats *Last Last* ×12 with back-to-back at 4, 8, 12, 16, 20, 24; Guardia Vieja = *Cheek to Cheek* ×27; práctica/marathon chanson = *Boum!* ×7–9. Istanbul rain gives 20 distinct cortinas across nine genres (turkish-pop, rebetiko, balkan-brass, chanson, anadolu-rock…): the jukebox is back, just a Turkish one. |
| Variety across seeds | **Improved:** Jaccard orchestras 0.93 → 0.81, families 0.23 → 0.25, tracks 0.12 → 0.13, cortinas 1.00 → 0.38. Orchestra totals over 8 sets: D'Arienzo 21, Tanturi 17, Biagi 15, Rodríguez 15, Troilo 15, Di Sarli 13, De Angelis 12, Canaro 11, Laurenz 11, Donato 10, Pugliese 8, Caló 7, Demare 6, Fresedo 5, D'Agostino 5, Gobbi 3, Lomuto 1, OTV 1. Tanturi still equals Troilo and beats Di Sarli; Malerba, Federico, Varela, Racciatti never appear in golden. Slot templates: slot 3 = Rodríguez–Moreno vals in 4/8 (+15–22 over target, the round-4 OTV slot with a new tenant), slot 4 = D'Arienzo instr 1935–37 in 4/8, slot 17/19 = Gobbi instr 1947–51 (*Independiente Club, La viruta, El andariego, Racing Club*) in 3/8 and in the marathon. |
| Intra-tanda order (roles) | **Fixed.** 0 closer-first / opener-last cases in 176 tandas; *Pocas palabras* closes, *Lejos de ti* opens, *Tres esquinas* closes. |
| Placeholder years | **Fixed in golden default** (0 in 8 seeds). **Not fixed** when the pool thins: BA rules + hammock (Troilo inéditos "1940~" ×4 as última), post-golden (Sánchez Gorio "1960~" ×4). |
| Energy steps > 14 between tandas | **Not fixed:** 2–7 per set (S1: seven; S8: 12→13 −31). The recurring jolt is tanda 4 D'Arienzo e74–76 → tanda 5 Demare/Caló e50–58 → tanda 6 milonga e73–75: a −24/+25 sawtooth at 20–27 % of every night. |
| Context effects | **Wired now** (`contextApplied` lists cortinaGenres/Cultures, vocalBias, tempoShift, pattern, tangoTandaSize, maxDifficulty). Heat: 2 milongas instead of 3, 3-track tango tandas, 26 tandas — but afrobeats cortinas on repeat. Beginners: no Pugliese, 27 tandas, but Rotundo instr and Francini–Pontier in a beginners' práctica and Troilo–Fiorentino milongas. Marathon: vocal ratio up to 0.85–0.88 (should go down). `tangoTandaSize` is skipped whenever the UI composes, because the composer sends sizes as explicit every time. |
| Score honesty | Still generous. 24 factors now, with D'Arienzo, última, Cumparsita, placeholders, roles, steps, cortina, obscure, ending — the right list. But the BA night with the inéditos última scored **90 "Headline marathon DJ"** (`placeholders 0.95`, `obscure 1.0`, `ultima 1.0`), and the 4-tanda/53-minute "Tell the DJ" result scored 72–74 "Solid regular milonga DJ" with `duration 1.0`. A set that is 53 minutes long for a 4-hour request cannot be a solid milonga DJ. Score spread 87–92 across seeds says nothing about the differences I hear (Gobbi at the peak, Rodríguez–Moreno última, slot-3 vals heat). |

---

## 3. Product gaps a DJ hits in the first ten minutes (ranked)

1. **"Tell the DJ" destroys the night and says "Applied".** Compose → type *open with D'Arienzo instrumental 1936, no Canaro, Pugliese as última, more vals* → Apply. Result: "Applied: more instrumentals, more Juan D'Arienzo, no Francisco Canaro, more vals" and the set is now **4 tandas, 0 h 53 min** (Canaro locked tanda kept despite "no Canaro", then D'Arienzo tango, D'Arienzo vals, end). Cause: "more D'Arienzo" becomes `includeOrchestras: ["juan-d-arienzo"]`, which the engine treats as the only pool, and the repeat gap stops it after two tandas; "no Canaro" sets `excludeOrchestras` but the locked Canaro stays. Instead: "more X" must be `preferOrchestras` (weight ×3), never `includeOrchestras`; a refine that shortens the night by more than 10 % must refuse with "could not fill 4 h with these constraints" and leave the set; a lock that contradicts a new exclusion must be called out ("tanda 1 is Canaro and locked; unlock it or keep it?").
2. **A card can say "year ?" and still be the última.** Compose screen, tanda 22 of the BA night: "Instrumental · year ? · close · ends with its own La Cumparsita". Instead: a tanda built from undated or "1940/70" rows is not eligible for any slot by default (Database → Rules: "Allow undated recordings" off), and if a DJ allows them the card must say *undated transcription* in red, not "year ?".
3. **No way to see the night as a list before you commit to it.** Desktop shows a two-column grid of cards with titles truncated at ~18 characters ("Pacien…", "Argañaraz…", "Como no…", "Acordándome de vos" fits by luck); I have to open the set list export to read my own night. Instead: a one-line-per-tanda view (#, rhythm tile, orchestra · singer · years, four titles, cortina, energy, clock time) as the default on desktop, cards on the phone.
4. **Export → Spotify says "Needs a Client ID. Add one in Settings", and Settings → Spotify does nothing when tapped.** The text says "open Spotify → Advanced"; there is no Advanced row on the live build. A DJ with a Premium account and no developer app is stuck at the first export they try. Instead: when the deployment has no Spotify app, hide the Spotify row and lead with "Spotify via a transfer service" and the M3U8; show the Client-ID path only under an explicit "I have a developer app".
5. **Hide a song in the Database hides the wrong copy.** Database → search *Jueves D'Arienzo* shows two "Jueves" rows for D'Arienzo (one with Year "–", one 1937, plus 1954/1955); toggling "Shown in sets" on the first one sends `songs: {"90b315de82": {hidden: true}}` and *Jueves 1937* is still in the next set. The index has 2 396 (orchestra, title, year) duplicate groups and the same recording appears under two albums (Pugliese *Farol* 1943 once "Chanel", once "Instrumental"). Instead: hide by (orchestra, title) with a "this copy only" option; merge duplicates at index build.
6. **Era change via the picker is a native `<select>` hidden under the row** (opacity 0). Keyboard users and anyone with a screen reader get a bare "Choose" select; on the desktop the row reads as text with a chevron, so a mouse click opens the OS dropdown with 7 options, fine, but there is no indication which controls the era preset will overwrite until after the change ("Era defaults applied: …" toast). Instead: a segmented or sheet picker, and a diff ("will change cycle, tanda sizes, cortina style") before applying.
7. **Cortina length shows 45 s in the composer and 60 s / 50 s on the cards.** Cards say "Cortina · Take Five · 60 s" (track length) while the composer and the export say 45 s stop. Instead: show the play length on the card ("45 s of 2:54").
8. **The score headline is the biggest number on the page and it lies.** "90 / 100 · Headline marathon DJ" sits above a night that ends on a bootleg; "72 / 100 · Solid regular milonga DJ" above a 53-minute night. Instead: hard failures (undated tanda, duration off by > 10 %, milonga inside a tango tanda, orchestra cap broken) cap the score at 50 and print the reason under the number.
9. **Phone: the rhythm of a tanda is only a tile colour.** Phone tanda card header: "Edgardo Donato · Horacio Lagos · 1938–40 · build" with a purple "6" tile; the word *milonga* is not there. Instead: "milonga" in the header line, as the desktop does.
10. **Booth: the rehearsal skips 42 % of the night without saying which.** Booth banner: "69 items have no source and will be skipped" for a 33-tanda set (no Deezer preview). The list shows "Find…" per row but there is no "find all" and no count per tanda. Instead: "3 of 4 songs in tanda 7 have no preview" on the tanda header and a one-tap "Find previews for the whole set".

Also seen: after Compose on the phone the page lands mid-list (tanda 5) rather than at the score; pin buttons are 36 × 44 px (below the project's 44 px touch-target rule); the "30 s rehearsal" chip is shown twice on the Now card; the Booth's "Next at gap" skips the queued item, which is right, but there is no way to end the current cortina now except the fader (a "cut cortina" button at the strip would be the first thing I reach for); "Closing" row in the Booth list once showed "?" as the title of La Cumparsita.

---

## 4. Enhancements

### 4.1 Fifteen that would most raise generation quality (each with an acceptance test)

1. **Never build a tanda from undated/transcription rows.** Test: 50 seeds × {golden, golden-extended, post-golden} × {BA rules, hammock, cumparsitaCount 2}: zero tandas with `yearRange === null` or any `yearApprox` song.
2. **Rhythm must match inside the tanda at the song level, not the row's rhythm code.** Test: no song whose title starts with "Milonga" or whose source rhythm is M/V appears in a tango tanda (Troilo *Milonga de la azotea*, Gorio *Milonga con variaciones* today).
3. **Vary the first D'Arienzo tanda.** Test: over 12 seeds the (sorted) title set of the first D'Arienzo tango tanda is distinct in ≥ 8 seeds; *Rawson/Ataniche/Joaquina/Jueves* appears ≤ 2 times.
4. **Slot-3 vals energy ≤ target + 8.** Test: 12 seeds, the first vals tanda delivers ≤ 60 when the target is ≤ 52 (Canaro–Maida, Di Sarli–Rufino, Caló–Iriarte, Fresedo–Ray pools before Rodríguez–Moreno and Biagi).
5. **Smooth the 4→5→6 sawtooth.** Test: no two consecutive steps of opposite sign both > 18 in tandas 1–8; mean |step| in the first third ≤ 10.
6. **Second peak for nights ≥ 5 h and a real plateau for `marathon-plateau`.** Test: 6 h marathon, slots 75–92 % contain one Pugliese vocal or Troilo–Marino at e ≥ 72 and the mean energy of the last third is ≥ target − 6 (today 55–66 against 75–85).
7. **Marathon / late-night vocal ratio goes down, not up.** Test: context `event: marathon, timeOfDay: late-night, crowdLevel: advanced` → vocal ratio ≤ 0.65 (today 0.85–0.88).
8. **Orchestra repeat gap enforced in every preset and counted by family too.** Test: post-golden 4 h: no orchestra within 6 tandas of itself (today D'Arienzo at 11, 15, 18, 21); golden: no identical (orchestra, singer, years) family twice in 4 h (Di Sarli instr 1940 at 7 and 14, D'Arienzo–Echagüe 38–39 at 19 and 26).
9. **Última pool is explicit per era.** Test: 24 seeds, the última is one of Di Sarli instr, D'Arienzo instr, Pugliese, D'Agostino–Vargas, Troilo instr/Fiorentino, De Angelis instr, Tanturi–Castillo (golden) / D'Arienzo 56–65, Pugliese 56–66, Di Sarli 56–58, Varela (post-golden); never Rodríguez–Moreno 1945 obscure titles.
10. **Cumparsita: instrumental versions only, and BA second Cumparsita paired by orchestra and year.** Test: `cumparsitaCount: 2` with Pugliese última appends Pugliese 1959 instr (fix the Guido–Maciel row); Troilo última appends 1943 or 1963; standalone closer never a vocal (Canaro–Alonso 1951 excluded).
11. **Small cortina pools: no back-to-back repeat ever, and a floor of 8 distinct per 4 h.** Test: `turkish,greek + trend`, `heat`, `guardia-vieja`, `practica`: zero consecutive identical cortinas and ≥ 8 distinct titles per 21 slots, or the night falls back to `constant` with one era-matched cortina and says so.
12. **Beginners / práctica get slow milongas and 3-track tandas even when the UI sends sizes.** Test: `crowdLevel: beginner` → milonga tandas from Canaro 1935–38, Donato–Lagos, Di Sarli–Rufino only (no Troilo–Fiorentino, no D'Arienzo 1946–50), and tango tandas of 3 unless the size control was pinned by the DJ.
13. **Gobbi, Laurenz–del Río, Varela–Ledesma, Rotundo, Francini–Pontier are colour, not peak.** Test: in golden default these orchestras appear ≤ 1 per night, never in a slot with target ≥ 75, never in a beginners' set.
14. **Pugliese track choice by room.** Test: `crowdLevel` not advanced → Pugliese instrumental tandas draw from *La yumba, Boedo, Malandraca, El arranque, Mala junta, Recuerdo, Raza criolla, Chiqué*; *Negracha* and *Patético* only with `advanced`/`milonguero` or after 90 %.
15. **Score caps on hard failures and an "obscurity" factor that reads fame per title.** Test: the BA night with the inéditos última scores ≤ 50 with the reason printed; the 53-minute refine result scores ≤ 40; S1–S8 spread widens so that Gobbi-at-peak and Rodríguez-última seeds score ≥ 5 points below the rest.

### 4.2 Ten that would most raise usability (each with an acceptance test)

1. **Refine never shrinks the night silently.** Test: any chip/Tell-the-DJ result whose duration differs from the request by > 10 % is rejected with the sentence "Could not fill 4 h with: no Canaro, only D'Arienzo" and the previous set stays.
2. **A list view of the night on desktop.** Test: at 1440 px every title of a 22-tanda set is readable without hover or truncation, one tanda per line, with clock time.
3. **Spotify path for a DJ without a developer app.** Test: on a deployment with no Spotify Client ID, Export shows "Spotify via a transfer service" first and the row "Spotify" is absent; Settings → Spotify tap opens a sheet with the two options.
4. **Undated and transcription recordings are visible and off by default.** Test: Database → Rules has "Include undated recordings" (off); a card that includes one (when on) shows "undated transcription".
5. **Hide by title+orchestra.** Test: Database → hide *Jueves* (D'Arienzo) → no D'Arienzo *Jueves* of any year in the next 10 composes; "this copy only" keeps the others.
6. **Cortina play length on the card.** Test: card shows "Cortina · Take Five · 45 s of 2:54" matching the export's stop-time.
7. **Booth: "cut cortina" and "find all previews".** Test: strip has a Cut button that fades the running cortina out in 1 s and starts the gap; "Find previews for the set" resolves every unresolved row and the banner reports "0 items skipped".
8. **Phone rhythm word in the header; pins at 44 px.** Test: phone tanda card header contains "tango / vals / milonga"; no interactive control under 44 × 44 in the composer.
9. **Era change preview.** Test: picking an era shows "Will change: cycle, tanda sizes, cortina style, opener rule" with Apply/Keep mine before anything changes.
10. **Traktor and Rekordbox paths that resolve.** Test: Traktor NML `FILE` has no "/" inside the name (today `Francisco Canaro / Roberto Maida - Ciego.mp3` while M3U8/Rekordbox use "Francisco Canaro - Roberto Maida - Ciego.mp3"); Rekordbox `TotalTime` of a cortina equals the track length, not the 45 s stop; Serato is offered as a Lexicon-ready CSV (it is), labelled "Serato (via Lexicon)" everywhere.

Export verdict as a DJ: M3U8 (`#EXTVLCOPT:stop-time=45`, `#TDJ:gap=2.5 gain=+2.7`) is the one I would actually load into VLC tonight; the set list `.txt` with clock times (T+0:12, T+0:24…) is the thing I would print and tape to the mixer; Rekordbox XML with "Cortina out (45 s)" and "Cortina fade (4 s)" hot cues is correct and importable; the CSV columns (start_sec, stop_sec, gap_sec, fade_out_sec, gain_db, file) are complete. Traktor NML is broken by the slash in file names. Gains of +7.2 dB (D'Arienzo *Rawson*) and −1.6 dB are priors with no measurement behind them and should be labelled as such in the comment.

---

## 5. What would embarrass me in front of dancers

1. **Tanda 22 of the Buenos Aires night**: Troilo "inéditos" *Racing Club / El apache argentino / Milonga de la azotea / Recuerdo*, undated radio transcriptions with a milonga in the middle of a tango tanda, as the última, followed by two Cumparsitas. The card says "year ?" and the page says 90/100.
2. **"Farol" instrumental** in the S1 Pugliese tanda (*Mala junta, El remate, El arranque, Farol*): the index has the 1943-07-15 Chanel vocal twice, once as "Instrumental". The floor hears Chanel singing in an "instrumental" tanda after three instrumentals. Same class of error: D'Arienzo *Jueves* with no year, Pugliese 1959 Cumparsita as "Guido–Maciel vocal".
3. **The same D'Arienzo tanda every night.** *Rawson, Ataniche, Joaquina, Jueves* in 7 of 8 seeds and in every UI night I composed. Regulars will name it by week three.
4. **Two cortinas alternating all night** with Turkish trend cortinas (*Dünya Dönüyor / Roman* ×10 each, back to back eleven times), afrobeats *Last Last* twelve times in the heat, *Cheek to Cheek* 27 times in Guardia Vieja, *Boum!* seven to nine times in chanson nights.
5. **Pugliese *Negracha / Patético* back to back at 86 %** of a Saturday milonga, and Gobbi *Independiente Club* at the peak slot of three of eight default nights.
6. **A marathon that ends on Gobbi → Demare/Quintana → Pugliese** with Canaro/Alonso singing La Cumparsita.
7. **"Tell the DJ" turning 4 hours into 53 minutes** and the app calling it a solid milonga DJ: if I had trusted the "Applied" line and walked to the booth, the night would have ended at 23:50.
8. **Rodríguez/Moreno *Giuseppe el zapatero* as the última** (S8).
9. **Post-golden: Canaro/Marcelo Paz *No te doy bolilla* at e41 followed by D'Arienzo/Echagüe at e81** in the warm-up, and D'Arienzo five times in 21 tandas.
10. **Booth rehearsal skipping 69 items** of the night without a per-tanda warning; a real night with the DJ's own files would show the same banner for every unmatched file.

---

*Method notes.* UI nights: A (`#hours` 2, Tonight: práctica/afternoon/beginners), B (`#hours` 4, Tonight: milonga/Saturday/Buenos Aires/prime night, Tanda shape Hammock, Closing Cumparsitas Two), C (`#hours` 6, Arc Marathon, Tonight: marathon/late-night/advanced), D (Era Post-golden; the UI run is `D-ui-postgolden`, the two post-golden lists analysed in §1.4 were composed through `/api/compose` with the preset, which is the same code path). Eight default seeds and nine variants (heat, Istanbul rain, beginners, BA rules bundle, D'Arienzo última, Turkish+Greek trend, Guardia Vieja, All eras) through `/api/compose`. Exports through the Export sheet (M3U8) and `/api/export` (CSV, Rekordbox, Traktor, Serato, XSPF, JSON, set list). Booth in rehearsal mode on both viewports with Start, Next at gap ×5, Hold, Stop (press and hold), End the night → History entry "33 tandas · played · 1 stop · rehearsal". Database: edited year/singer of Pugliese *Farol*, hid D'Arienzo *Jueves*, set Pugliese "Not before" 0.85 (took effect: Pugliese at 19/22), composer showed "Using your database edits". Guide: read all sections and the empty House rules sheet. Settings: Spotify "Needs a Client ID" row, DJ app folders "Not set", Written reviews "No key", Memory in this browser.*
