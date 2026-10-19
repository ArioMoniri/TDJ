# Round 4 — three dancers use the live product

Target: https://d3k5k2c1l0s5ri.cloudfront.net, tested 19 Oct 2026 with Playwright (Chromium; desktop 1280×900 and iPhone 15 Pro emulation). Every screenshot named below lives in `/tmp/claude-0/-home-user-TDJ/73d2c9cf-6bc0-5f5f-b08c-fd038ddd8f72/scratchpad/userreview/`; every set below was captured from the real `/api/compose` response the page received. No repo code was changed.

Personas:

- **Marta** — Buenos Aires milonguera, 30 years on the floor, dances Saturday nights at a traditional salon. Judges by whether the floor fills on the first bar.
- **Jonas** — European marathon dancer who also organises a 3-day marathon and books DJs. Thinks in 6-hour blocks and orchestras per hour.
- **Lea** — a beginner (14 months of tango) who has just started DJing the Tuesday práctica with a laptop and a Spotify account.

The three test blocks everyone was asked to do: a 2 h práctica, a 4 h Saturday milonga in summer heat, a 6 h marathon night block, a 3 h beginner-friendly afternoon, plus eras, night rules, Tonight, feedback chips, lock/swap, Listen, export, Database, Memory and Settings.

---

## 0. Things that happened before anybody composed

| # | What | Where | Severity |
|---|------|-------|----------|
| 0.1 | Every page load fires `GET /api/db` → **404** and a `console.error`. Memory/overrides fall back to localStorage silently, so users do not notice, but the live deployment has no DB route. | all pages (`00-recon-settings.png` console) | medium (deploy) |
| 0.2 | Every navigation prefetch (`/library?_rsc=…`, `/?_rsc=…`) → **404**. Client navigation still works (falls back to full fetch), but the console is a wall of red and the tab bar feels a beat slower than it should. | all pages | medium (deploy/CloudFront routing) |
| 0.3 | `Written review` with no key → `POST /api/ai/review` **401**. Expected, but the page surfaces it as a modal that says "No API key. Add one in Settings → Written reviews." with both Cancel and Done — two buttons for an alert with one answer. | `26-mil-desk-review-nokey.png` | low |
| 0.4 | First impression (desktop, `00-home-desktop.png`): a long two-column form of 40+ controls before any result. All three personas said the same thing in different words: "Where do I start?" Lea scrolled past the fold three times looking for a "start" button before noticing the pink one top-right. The empty state ("Compose a milonga, tanda by tanda.") is at the *bottom* of the page, after Night Rules and Tonight, where nobody looks. | home | high (UX) |
| 0.5 | The "Also tonight" footer reads **"1 shift · cortinas: themed-single-artist, jazz-standards, soul, italian-60s"** on a fresh page where the user has set nothing. The "shift" is Region = Europe (defaulted from Settings). A dancer reads "1 shift" as "you changed something". | home footer | low (copy) |
| 0.6 | Cortina style shows **Matched** selected but the code default is `family`, and the footer talks about "8 energy points under the tanda that follows" regardless of style. Nobody knew what Matched vs Family means without opening the Guide. | Cortinas group | low |

---

## 1. Lea — beginner DJ, iPhone, 2 h Tuesday práctica

Screenshots `10-…` → `17-…`, `45-…` → `47-…`.

### Task walkthrough

1. **Set the length.** Dragged the slider to 2 h: "2 h · ≈10 tandas". Picked **Arc = Gentle** because that word sounded right for a práctica. Delight: the live "≈10 tandas" estimate.
2. **Tonight.** Set Time = Afternoon, Event = Práctica, Dancers = Beginners. Footer: *"7 shifts · energy −9 · tempo −2 · vals 18% · milonga 18% · tangos in threes · vocal −25% · cortinas: themed-single-artist…"*. Confusion: she set **3** things and the app says **7 shifts**. "Tangos in threes" she did not understand until she saw the result. "vocal −25%" she read as "25 % fewer singers", which is roughly right but unexplained.
3. **Compose.** 1.1 s. Score **79 "Solid regular milonga DJ"**. Set name **"2h golden milonga"** — she was composing a práctica; the name ignores the Event she just set.
4. **Phone layout bug.** After compose the page became **476 px wide on a 393 px viewport** (`document.scrollWidth` 476). Every tanda card's swipe actions (Lock / Swap, 148 px) sit off-canvas but inside the document flow, so the page scrolls sideways; the header icons and the "target 31" column are cut off (`16-beg-phone-listen.png`, `45-phone-tanda-card.png`), and after a swipe or any sideways drift the whole page sits shifted left (`47-phone-cortina-sheet.png` shows the header "Compose" and chips offset). **Repro:** iPhone 15 Pro emulation → Compose → `document.documentElement.scrollWidth` > `clientWidth`; overflowing elements are `ARTICLE.group-inset` (w 460) and `DIV.swipe-actions` (right 476).
5. **Score sheet** (`14-beg-phone-score-sheet.png`): "Tanda sizes (tango 4, vals 3–4, milonga 3) **0 % · 9 non-standard**". The app itself forced three-track tangos because of "Práctica/Beginners" context, then docked her 5 weight points for it. She concluded she had done something wrong.
6. **Chip "Calmer".** Recomposed (score stayed 79). She could not tell what changed because the cards re-rendered in place; no diff, no "energy −6" note. The Adjust footer kept saying "Locked tandas stay where they are." although she had locked nothing.
7. **Listen** on tanda 1: a Spotify embed of a *reference playlist for Osvaldo Fresedo* ("Osvaldo Fresedo tangos (juanchirosario)"), with "Connect Spotify in Settings to hear the exact recordings." She expected to hear *Por Calles Muertas*; she got a stranger's playlist. The cortina row said "Connect Spotify in Settings to preview cortinas, or open the search." — two different calls to action in one card.
8. **Cortina length mismatch.** Setting says 45 s; the card shows "Cortina · Nina Simone – Feeling Good · **60 s**" (and 57 s on another run) while the exported M3U8 writes `#EXTINF:60`. Nobody could explain where 60 came from (the context model's heat rule says 60–90 s for hydration; she had set no weather).
9. **Export** (`17-beg-phone-export.png`): sheet lists Rekordbox XML, Traktor NML, DJ CSV, then (after scrolling) M3U8, XSPF, CSV, JSON, Set list. She picked M3U8 for VirtualDJ; the file is correct (`#EXTM3U`, `#PLAYLIST`, one `#EXTINF` per track, cortinas tagged `[CORTINA]`). Friction: the sheet's "52 tracks will be exported" counts cortinas; she thought the set had 52 songs.
10. **Swipe** on phone does reveal Lock (amber) and Swap (pink) (`46-phone-swipe.png`) — nice once found, but there is no hint that cards swipe. Lea only found it because I told her.

### The set she got (2 h, Gentle, Práctica/Beginners/Afternoon, seed 346844756, score 79)

```
 1 T Canaro/Maida 35–38  Poema · Nada Más · Ciego                               e49  cortina Nina Simone – Feeling Good
 2 T Fresedo/Ray 35–37   No Quiero Verte Llorar · Sollozos · El Once             e45  Glenn Miller – In the Mood
 3 V OTV/C. del Moral 40 El Vals del Ayer · Isabelita · Cuando No Queda Esperanza e60  Nina Simone
 4 T Demare/Quintana 44–45 Torrente · Igual que un Bandoneón · Solamente Ella    e48  Count Basie
 5 T Caló/Berón 42       Jamás Retornarás · Tristezas de la Calle Corrientes · Al Compás del Corazón e57  Louis Prima
 6 M Di Sarli/Rufino 41  Zorzal · Pena Mulata · La Mulateada                     e66  Benny Goodman
 7 T Rodríguez instr 46–48 El Arroyito · A las Tres de la Mañana · Zorro Gris    e64  Nina Simone
 8 T Tanturi/Castillo 41–42 Pocas Palabras · La Vida Es Corta · Así Se Baila el Tango e72  Glenn Miller
 9 V Biagi/Ibáñez 38     Loca de Amor · Viejo Portón · Lejos de Tí               e80  Glenn Miller
10 T Láurenz/Casas 38–40 Como Dos Extraños · No Me Extraña · Vieja Amiga         e64  Nina Simone
11 T De Angelis/Dante 49–53 Quien Más Quien Menos · Un Cacho de Tango · Compadrón e60  Nina Simone
12 M Fresedo/Serpa 42–43 La Rumbita Candombe · Tortazos · Ayer                   e59  Nina Simone
13 T D'Agostino/Vargas 41–43 Adios Arrabal · El Cornetín del Tranvía · Tres Esquinas e55
   Closing: La Cumparsita — Troilo 1938
```

**As dancers:** Marta would dance 1, 2, 5, 6, 8, 13 happily; she'd call 4 (Demare/Quintana) "sad for a Tuesday" and sit out 9 (Biagi vals at e80 is a *peak* vals in a 2 h práctica that is supposed to be gentle — the floor of beginners will spin out). Jonas liked that every tanda is one orchestra / one singer / tight years (that is the engine's strongest card) but noted **Nina Simone "Feeling Good" six times in thirteen cortinas** and **Fresedo twice in 13 tandas** (2 and 12) while D'Arienzo, Troilo and Di Sarli tangos do not appear at all. Lea's verdict: "It's playable. I would swap 9 and 4. I wish it told me *why* 9 is there."

---

## 2. Marta — Buenos Aires milonguera, desktop, 4 h Saturday milonga in summer heat

Screenshots `20-…` → `28-…`.

### Task walkthrough

1. **Settings she chose:** Tanda shape **Hammock (Buenos Aires)**, Closing Cumparsitas **Two (Buenos Aires)**, **Cortina before La Cumparsita** on, **Birthday vals** on (60 %), Tonight: Summer, Heatwave, Hot room, Prime night, Milonga, Milongueros, Buenos Aires, Saturday, Large crowd. Delight: the Tonight pickers show the energy shift per option ("Heatwave (−6)", "Hot room (−7)") and coloured evidence dots.
2. Footer after that: *"7 shifts · energy −3 · tempo −5 · vals 17% · milonga 17% · tangos in threes · vocal +15% · cortinas: jazz-standards, swing, rock-nacional, cumbia"*. She set 9 things, it says 7. Fine. But **"tangos in threes"** for a Saturday *salón* night in Buenos Aires is a non-starter for her: "In the heat we put the fans on; we do not cut the tanda." The rule comes from the heat/hot-room research entries, and there is no switch to refuse it except unsetting the weather.
3. **Compose** (seed 620021849): score **70**, 27 tandas, every tango tanda 3 tracks. Score sheet: Tanda sizes 0 %, **Orchestra spacing 0 %** (D'Agostino 4 & 27, Di Sarli 6 & 16, Caló 7 & 25, Rodríguez 8 & 15, Tanturi 10 & 17, D'Arienzo 11 & 18, Biagi 13 & 20, Láurenz 14 & 22, Troilo 12 & 21), Singer consistency 67 %. The "repeat gap" control says 6 tandas; the score factor says "no repeat within 8 tandas". The engine obeys the control and then grades itself with a different number.
4. **Lock / Swap on desktop are hidden** behind a "…" menu per card ("Tanda N actions"; `22b-mil-desk-menu-open.png`). Marta did not find them until shown. Once found: lock is instant and the gold ring is clear; swap tanda 4 (D'Agostino/Vargas → Donato instr.) took ~1 s and kept the score; swap track 2 of tanda 5 worked ("Nostalgias · Mano a Mano · A la Gran Muñeca" Lomuto/Omar 1936).
5. **Chip "Stronger finish"** with tandas 1–2 locked: locks held (same song ids, `locked: true` round-tripped). Score 71. The finish *did not* get stronger: última stayed D'Agostino/Vargas at **e57** (ending factor "vocal tango última ≥60" still 76 %). The chip changed the arc parameter but the engine could not deliver because "Última tanda = Emotional vocal" + "Pugliese once" + "tangos in threes" leave it almost nothing at ≥60 that is lyrical.
6. **Tell the DJ: "no Canaro, more Pugliese and a D'Arienzo vals tanda"** without a model key → note: *"Matched by keywords (add a model key in Settings for the full version). Applied: more-dramatic, no Francisco Canaro."* Result: Canaro still at tanda 2 (locked — fair, but the note should say "kept because locked"), **Pugliese count 1 → 1, D'Arienzo vals 0**. "Pugliese" silently became "more-dramatic". For a milonguera this is the single most wanted sentence in the product and it does nothing.
7. **Two Cumparsitas** (`21-mil-desk-result.png`): última tanda D'Agostino/Vargas ends with **"La Cumparsita (Tino García) 1952"** — a different singer glued into a Vargas tanda (that is what dented Singer consistency), then a standalone Troilo 1963/1951 Cumparsita. In Buenos Aires the two Cumparsitas are two *different orchestras' versions*, back to back, after the última; this implementation mixes singers inside the última instead.
8. **Cortinas in a Buenos Aires salón:** Glenn Miller "In the Mood" **11 times in 27**, Nujabes "Aruarian Dance" (lo-fi hip-hop) 7 times. The research footer promised "rock-nacional, cumbia" for Buenos Aires + summer; the set contains neither.
9. **Export DJ CSV** worked (111 rows, download `4h_golden_milonga.csv`). Genre column reads **"Tango tango" / "Tango vals"** — a double word that Lexicon users will see in their genre facet. The export sheet did not close or confirm after the download; she clicked twice and got two files.
10. **Written review** → "No API key" (expected).

### The set she got (4 h, hammock, 2 Cumparsitas, birthday vals, BsAs summer heat; seed 620021849, score 70)

```
 1 T Canaro instr 35–38   La Maleva · Hotel Victoria · Olvídame                     e50  Nujabes – Aruarian Dance
 2 T Fresedo instr 45–47  Julián · El Choclo · El Once                              e46  Glenn Miller
 3 V OTV/C. del Moral 40  Isabelita · El Vals del Ayer · Cuando No Queda Esperanza  e60  Benny Goodman
 4 T D'Agostino/Vargas 41–43 Ahora No Me Conocés · Adios Arrabal · Me Llaman Tango  e54  Louis Prima
 5 T Donato/Lagos 36–39   Lágrimas · El Adios · Se Va la Vida                       e60  Count Basie
 6 M Di Sarli/Rufino 41   Pena Mulata · Zorzal · La Mulateada                       e66  Nujabes
 7 T Caló/Podestá 41–43   Dos Fracasos · Si Tú Quisieras · Percal                   e57  Nujabes
 8 T Rodríguez instr 46–48 El Arroyito · Canaro en París · Zorro Gris               e61  Count Basie
 9 V De Angelis/Dante-Martel 44–47 Pobre Flor · A Magaldi · Soñar y Nada Más       e73  Glenn Miller
10 T Tanturi/Castillo 41–42 Pocas Palabras · Como Se Pianta la Vida · La Vida Es Corta e69  Glenn Miller
11 T D'Arienzo/Echagüe 38–39 No Mientas · Mandria · La Bruja                        e83  Glenn Miller
12 M Troilo/Fiorentino 41–42 Mano Brava · Ficha de Oro · Del Tiempo Guapo           e75  Glenn Miller
13 T Biagi/Falgás 39–40   La Chacarera · Queja Indiana · Griseta                    e74  Benny Goodman
14 T Láurenz instr 52–53  A Belisario Roldán · Quejas de Bandoneón · Amurado        e68  Glenn Miller
15 V Rodríguez/Moreno 40–43 Por Aquí… · Con tu Mirar · Brindis   [Vals de cumpleaños] e73  Glenn Miller
16 T Di Sarli instr 54–55 El Ingeniero · El Amanecer · Comme Il Faut                e67  Glenn Miller
17 T Tanturi/Campos 44    La Abandoné y No Sabía · Recién · Prisionero              e66  Louis Prima
18 M D'Arienzo/Echagüe 38 Milonga Querida · Milonga del Corazón · Estampa de Varón  e87  Glenn Miller
19 T Pugliese instr 48    Boedo · Patético · La Yumba                               e79  Louis Prima
20 T Biagi instr 38–42    Pura Clase · El Trece · Bélgica                           e82  Glenn Miller
21 V Troilo/F. Ruíz 45–47 Llorarás Llorarás · Romance de Barrio · Flor de Lino      e64  Glenn Miller
22 T Láurenz/Casas 38–40  Vieja Amiga · Como Dos Extraños · De Puro Guapo           e67  Count Basie
23 T De Angelis/Dante 45–46 Con Alma de Tango · Para Qué Te Quiero Tanto · Que Lindo Es Enamorarse e62  Count Basie
24 M Demare/Miranda 42    El Naranjerito · Tortazos · Milonga en Rojo               e65  Nujabes
25 T Caló/Berón 42        Tristezas de la Calle Corrientes · Qué Te Importa… · Al Compás del Corazón e57  Nujabes
26 T Rotundo/F. Ruíz 48–52 Bandoneón Arrabalero · Sur · Alma de Loca               e57  Nujabes
27 T D'Agostino/Vargas 45 Rondando tu Esquina · Caricias · A Pan y Agua · La Cumparsita (Tino García 1952)  e57
   Closing: La Cumparsita — Troilo 1963
```

**As dancers:** Marta: "1 to 13 I'd dance all of it except that Canaro in the first slot is *instrumental 1935* — nobody has arrived yet, fine. Tanda 11 D'Arienzo/Echagüe at 23:30 on a Saturday is *perfect*; 18 D'Arienzo milonga, 19 Pugliese, 20 Biagi — that's the peak, the salón is full. Then 21 to 27 is where I go and sit: Rotundo at 2 am? Caló/Berón *twice* in the night? Láurenz twice? Where is Troilo/Fiorentino *tango*? Where is a second D'Arienzo *tango* tanda? Four hours in Buenos Aires without D'Arienzo twice is not Saturday." She also flagged: every tanda is 3 tangos ("in my salón people would ask if the DJ is in a hurry"), the Troilo/Ruíz "vals" *Llorarás Llorarás* ("that's a tango — check the tag"), and Hugo-Díaz-style cortinas (Nujabes) "belong in Berlin, not Sunderland". Jonas: "Structurally honest — the hammock shape (hit, dip, close) is real in the numbers for 1 and 4 — but the second half is lyrical soup: 21–27 average e61 with four 'cool-down' tandas, so the last hour empties before the Cumparsita." Lea: "I can see the arc and I like that the app explains that 85 is 'headline marathon DJ'. I still can't tell *which* tanda cost the points."

---

## 3. Jonas — European marathon dancer / organiser, desktop, 6 h night block

Screenshots `30-…` → `37-…`.

### Task walkthrough

1. **Length to 6 h** ("≈31 tandas"), **Arc = Marathon**, **Era = Golden extended 32–60**. The era note appeared: *"Era defaults applied: Golden rules with one 'colour' tanda allowed (late 1950s instrumentals, a foxtrot tanda)."* Year spread went 4 → 5 y. Delight: pins. He pinned nothing but understood instantly that he could.
2. **Close with La Cumparsita → off** (this is a block inside a marathon, the next DJ takes over), **Última = D'Arienzo rhythmic**, **Colour tanda on**, **Show or break on** (he meant it as a changeover gap). Cortinas: Family, Classics, Cultures Italian + French (the cultures picker is a full-screen sheet, `30-mar-cultures-picker.png`; "At least one culture stays chosen" — clear).
3. **Tonight**: Marathon, Advanced, After midnight, Autumn, Europe, Medium crowd. Footer: "6 shifts · energy −1 · tempo −2 · vals 18% · milonga 14% · vocal +18% · cortinas: themed-single-artist, jazz-standards, soul, italian-60s". He picked Italian + French cultures; the cortina footer still says themed/jazz/soul.
4. **Compose**: 4.3 s (the first compose of a session on CloudFront is consistently 4–5 s; later ones ~1–2 s — cold start), score **75**, 31 tandas, 5 h 56. Score sheet: Orchestra spacing **0 %**, Orchestra variety **59 %** ("16 orchestras for 6 h"), Energy arc 60 %.
5. **Colour tanda never appeared.** No foxtrot, no Pirincho milonga, no Hugo Díaz, no note on any card. Only "late-50s instrumental" tandas (Di Sarli '58, Biagi/Duval '57–60 ×2, Pugliese '55–59), none labelled as the colour tanda.
6. **Mid-set Cumparsita.** Tanda 8 Troilo instrumental contains **"La Cumparsita 1943"** as track 2 of a normal peak tanda. Every dancer in the room reads La Cumparsita as "the night is over". This is the one thing a DJ must never do by accident; the engine only reserves Cumparsita for the ending when `closeWithCumparsita` is on, and he had turned it off.
7. **Energy curve** (`32-mar-result-top.png`): the "Marathon" arc is supposed to be a plateau; the drawn line has a D'Arienzo milonga at **e85 in tanda 6 (labelled "warm-up")** and a Biagi vals at e84 at tanda 9 — the two highest points of the night are in the first hour. The dashed target is nearly flat at ~70; the actual zig-zags ±15 around it. The curve is beautiful, clickable (clicking a dot scrolls to the card with a ring pulse — real delight) and honest about the problem.
8. **"Recompose with same seed"** (… menu, `34-mar-more-menu.png`) → byte-identical set. Good: he could share the seed with the other DJ. "Copy seed" copies a 9-digit number with no way to *paste* a seed anywhere in the UI.
9. **Chips**: "Fewer repeats" → repeat gap 6 → 9, score 81. "More vals" → **Cycle silently switched to "Custom"** with an empty Custom-cycle field in the Structure group (`35-mar-after-chips.png`), vals 5 → 7, milonga 5 → 3. Nothing in the result tells him the TTVTTM promise is gone; he only noticed because the Cycle picker now says "Custom".
10. **Mood check** (`36-mar-moodcheck.png`): two Spotify embeds of Aren León playlists with no comparison, no numbers, no "your set vs reference". The row label *"Compare the set's feel with Aren León's reference tandas"* promises a comparison and delivers two iframes.
11. **Export**: M3U8, Rekordbox XML (432 `<TRACK>`… 144 entries with `Location="file://localhost/TDJ/Artist%20-%20Title.mp3"`) and Set list text all downloaded cleanly. The set list `.txt` is excellent for a marathon booth (orchestra, singer, years, energy, target, phase, cortina with genre). Friction: `TDJ/` placeholder paths unless a music folder is set in Settings; the sheet says so, fine. "Connect Spotify and create playlist — Needs a Spotify Client ID" sits at the bottom as a disabled-looking row; he wanted that first.

### The set he got (6 h, golden-extended, marathon arc, no Cumparsita, colour tanda, break, After midnight/Advanced; seed 200128560, score 75)

```
 1 T Canaro/Famá 32–34    Bernabé la Fiera · Orquídeas a la Luz de la Luna · El Pescante · Diez Años   e43  Piaf – La Vie en rose
 2 T Fresedo/Ray 33–37    Siempre Es Carnaval · Vida Mía · Sollozos · Niebla del Riachuelo            e42  Trenet – Boum!
 3 V Lomuto/F. Díaz 39–42 La Zandunga · Ahora que Estamos Solos · Isabelita                           e57  Gainsbourg
 4 T Rodríguez instr 40–41 Jueves · El Morochito · La Torcacita · Florida                             e65  Piaf – Padam
 5 T Donato/Lagos 37–40   El Adios · Lágrimas · Mis Pesares · Gato                                    e60  Trenet
 6 M D'Arienzo instr 35–37 De Pura Cepa · Milonga, Vieja Milonga · La Puñalada                        e85  Nina Simone
 7 T Tanturi/Campos 43–44 Una Emoción · Prisionero · Que Vas Buscando Muñeca · Recién                 e64  Trenet
 8 T Troilo instr 41–43   El Tamango · **La Cumparsita 1943** · Milongueando en el Cuarenta · Cachirulo e75  Trenet
 9 V Biagi instr 41       Lágrimas y Sonrisas · Pájaro Herido · Marchetta                             e84  Gainsbourg
10 T Di Sarli instr 45–47 El Caburé · El Ingeniero · A la Gran Muñeca · Comme Il Faut(como Debe Ser)(como Debe Ser) e67  Piaf
11 T Láurenz instr 37–41  Poca Suerte · Amurado · Arrabal · Orgullo Criollo                           e71  Trenet
12 M Canaro/Maida 35–36   Silueta Porteña · Milonga Criolla · Largá las Penas                         e71  Nina Simone
13 T D'Arienzo/Mauré 41–43 Díme mi Amor · Ya lo Ves · Tierrita · Si la Llegaran a Ver                 e76  Nina Simone
14 T De Angelis/Dante 45–49 Para Qué Te Quiero Tanto · Compadrón · La Brisa · Con Alma de Tango       e62  Nina Simone
15 V Rodríguez/Moreno 40–45 Con tu Mirar · Por Aquí… por Allá… · Caballero de la Luna                 e72  Trenet
16 T Biagi/Duval 57–60    Espérame en el Cielo · Solamente Dios y Yo · Ayudame · Te Burlas Tristeza   e72  Trenet
   —— Show / break · 20 min ——
17 T Tanturi/Campos 43–44 Oigo tu Voz · Que Nunca Me Falte · Así Se Canta · La Abandoné y No Sabía    e61  Nina Simone
18 M Troilo/Marino 43–44  El Barrio del Tambor · Ropa Blanca · Con Permiso                            e79  Trenet
19 T Pugliese instr 55–59 Emancipación · La Bordona · Gallo Ciego · Nochero Soy                       e82  Piaf
20 T D'Arienzo/Mauré 41–44 Amarras · Enamorado · Cicatrices · Humillación                             e75  Trenet
21 V De Angelis/Dante-Martel 44–47 Pobre Flor · Soñar y Nada Más · Flores del Alma                    e74  Nina Simone
22 T Di Sarli instr 58    Bahía Blanca · Indio Manso · Una Fija · Champagne Tango                     e68  Gainsbourg
23 T Biagi/Duval 57–59    Aquí en la Tierra · Mi Alondra · Mi Vida en Tus Manos · Oh! Mama Mía        e77  Trenet
24 M Tanturi/Castillo 41–42 Así Es la Milonga · Mi Morocha · Mozo Guapo                               e77  Nina Simone
25 T Troilo instr 38–42   Tinta Verde · La Maleva · Guapeando · Cordón de Oro                         e73  Gainsbourg
26 T Caló/Dante 34–36     No Vale la Pena · Si Volviera Jesús · Malvaloca · Allá en el Cielo          e64  Nina Simone
27 V Demare/Berón 43      No Nos Veremos Más · Se Fue · Al Pasar                                      e60  Gainsbourg
28 T Varela/Ledesma 55–56 Fueron Tres Años · Fumando Espero · Si Me Hablaras Corazón · Portero Suba y Diga e60  Gainsbourg
29 T Di Sarli instr 39–43 El Retirao · Shusheta · Organito de la Tarde · Ensueños                     e62  Trenet
30 M Canaro instr 38–40   La Milonga de Mis Tiempos · Milonga Clásica · La Milonga Retobada           e66  Trenet
31 T D'Arienzo/Echagüe 38–39 Olvídame · Nada Más · La Bruja · Mandria                                 e81
```

**As dancers:** Jonas would *book* a DJ who played tandas 4, 5, 7, 11, 13, 20, 25, 29 and 31 — those are the right recordings, correctly grouped. He would walk out of the room during: **8** (a Cumparsita mid-set — "the whole room would stand up and clap"), **16 and 23** (Biagi/Duval late-50s *twice* in one block: "one is a colour, two is a punishment"), **26** (early Caló/Dante 1934–36 is pre-Caló-sound; marathon dancers expect Caló/Berón), **28** (Varela/Ledesma at 4 am), and he'd grumble at 6 and 9 (the two hardest tandas of the night inside the first hour, which the engine itself labels warm-up). Marta: "Milongas 12 and 30 — Canaro *twice* for milongas in a night with no Donato/Lagos milonga and no Rodríguez milonga? And **three Nina Simone and eight Charles Trenet** cortinas." Lea: "Six hours, sixteen orchestras; I counted D'Arienzo four times, Canaro three, Biagi three, Di Sarli three, Troilo three."

Jonas's post-chip set ("Fewer repeats" + "More vals", score 81) fixed repeats (repeat gap 9) but turned the cycle Custom and produced 7 vals / 3 milongas in 31 tandas, with vals at 12 and 30 (both Canaro/Maida again) — more variety of rhythm, less variety of orchestra.

---

## 4. Lea again — 3 h beginner-friendly Sunday afternoon (desktop)

Screenshots `40-…` → `43-…`.

### Task walkthrough

1. Length 3 h, **Arc = Single peak**, **Opener = Lyrical**, Tonight: Sunday, Afternoon, Beginners, Milonga, Mixed level (she set Dancers twice — the second pick overwrote the first; fine), Room Comfortable. Footer again shows "tangos in threes".
2. Compose: score 79, 20 tandas. She asked the obvious question: "Does *Beginners* change *which* music, or only the energy?" The answer, visible in the set: only the energy and the tanda size. **D'Arienzo 1935–37 instrumental milongas (e85) at tanda 6**, **Láurenz/Casas milongas (e78)**, **Biagi/Falgás**, **Pugliese instr 44–45** — all present. Beginners (−4) is an energy bias, not a difficulty filter.
3. Chip **"Warmer start"** → score 75 and the first three tandas went Fresedo e43 → Canaro e52 → **Rodríguez instr e73** — the start got *steeper*, not warmer. Chip **"More playful"** → **arc silently changed to "gentle"** and Mood = Playful (+4). She did not ask for a gentle arc; the Tonight strip changed under her.
4. Thumbs-up, reload: set, like, length and context all persisted. Good.
5. **Guide** (`43-guide-rules.png`): "Rules the DJ follows" opens a long research dump (Season, Weather, Room, Time…). Clear and honest, but it is the *model's* notes, not a DJ's rules. There is no page that explains what a chip does.

### The set she got (3 h, single peak, lyrical opener, Sunday afternoon, beginners/mixed; seed 456991132, score 79)

```
 1 T Fresedo instr 45–47  El Entrerriano · Julián · El Once                          e45  Nina Simone
 2 T Canaro/Maida 35–38   Poema · Nada Más · Ciego                                   e49  Glenn Miller
 3 V OTV/C. del Moral 40  El Vals del Ayer · Isabelita · Cuando No Queda Esperanza   e60  Benny Goodman
 4 T Donato instr 36–40   El Distinguido Ciudadano · La Tablada · El Chamuyo         e60  Count Basie
 5 T Tanturi instr 40–41  Comparsa Criolla · Argañaraz · El Buey Solo                e66  Louis Prima
 6 M D'Arienzo instr 35–37 De Pura Cepa · Milonga, Vieja Milonga · La Puñalada       e85  Glenn Miller
 7 T Rodríguez/Moreno 40–43 Como Has Cambiado, Pebeta! · Que Lento Corre el Tren · En la Buena y en la Mala e67
 8 T Biagi/Falgás 39–40   A Mí No Me Interesa · La Chacarera · Queja Indiana         e74  Nina Simone
 9 V Troilo/Fiorentino 40–44 Valsecito Amigo · Temblando · Bajo un Cielo de Estrellas e71  Nina Simone
10 T Di Sarli instr 44–47 Milonguero Viejo · Comme Il Faut · A la Gran Muñeca        e69  Nina Simone
11 T De Angelis/Dante 45–46 Para Qué Te Quiero Tanto · Con Alma de Tango · La Brisa  e62  Benny Goodman
12 M Láurenz/Casas 38–40  Milonga Compadre · Milonga de mi Flor · Improvisando       e78  Nina Simone
13 T Pugliese instr 44–45 Recuerdo · Tierra Querida · Tiny                           e74  Nina Simone
14 T D'Arienzo/Mauré 41–44 Amarras · Díme mi Amor · Ya lo Ves                        e73  Count Basie
15 V Rodríguez/Moreno 40–44 Con tu Mirar · Por Aquí… · Mantelito Blanco              e74  Glenn Miller
16 T Troilo/Fiorentino 41–42 No Le Digas que la Quiero · Maragata · Pa'qué Seguir    e64  Nina Simone
17 T Caló/Podestá 41–43   Dos Fracasos · Percal · Yo Soy el Tango                    e60  Nina Simone
18 M Demare/Miranda 42    Tortazos · El Naranjerito · Milonga en Rojo                e65  Nina Simone
19 T Di Sarli/Rufino 40–43 Lo Pasado, Pasó · Necesito Olvidar · Tristeza Marina      e54  Nina Simone
20 T D'Agostino/Vargas 41 Agua Florida · Tres Esquinas · El Yacaré                   e58
   Closing: La Cumparsita — D'Arienzo 1963
```

**As dancers:** This is the best-balanced of the four sets — Marta: "Sunday tarde in Buenos Aires looks like this: Fresedo, Canaro, Donato, Tanturi, Rodríguez, Biagi, Di Sarli, De Angelis, D'Arienzo/Mauré, D'Agostino to close. I'd dance 17 of 20." Her sit-outs: 6 (D'Arienzo '35 milongas at e85 in slot 6 with *beginners* — "the floor becomes a pinball machine"), 12 (Láurenz milongas, fast and syncopated — for advanced dancers), 13 (Pugliese for beginners; *Recuerdo* is fine, *Tiny* is not). Jonas: "'Single peak' and the peak is a milonga at tanda 6 followed by the real peak at 13–15." Lea: "Nina Simone — Feeling Good is my cortina **ten times out of twenty**. I'd be embarrassed." The closing D'Arienzo 1963 Cumparsita is odd for a Golden-Age afternoon (there are a dozen 1930s–50s D'Arienzo versions).

---

## 5. Database, Memory, Library, Settings (Marta and Lea, desktop)

Screenshots `50-…` → `77-…`.

- **Database → Songs** (`70-db-edit-mode.png`): search "Poema Canaro" shows the same recording **twice** (two cards, identical year/singer/album). Index duplicates exist for many titles (Canaro en París ×2, D'Agostino La Cumparsita ×3). In Edit mode the two cards render in a two-column grid that **overflows the content column**: the second card is cut off at the right edge of a 1280 px desktop window. Editing Energy 46 → 20 and Rhythm tango → vals registered "2 changes"; the composer footer then said "using your database edits" (and Poema was no longer picked — plausible). Rhythm picker options are inconsistently cased: **"tango"** lowercase, then "Vals", "Milonga", "Cancion" (no accent), "Foxtrot", "Other".
- **Add a recording** (`72-db-own-recording.png`): Title / Orchestra / Singer / Rhythm / Year / Energy / Spotify URI; saved and listed under *Your recordings* as "Pedro Laurenz · tango · 1937". Works. No way to attach a file path, so an own recording can never export with a real path.
- **Orchestras tab** (`55-db-orchestras.png`): every orchestra expanded inline with Energy, Style, Tier, Not-before, Phases, Singer years — 291 orchestras, one giant scroll, no collapse. Marta wanted to say "D'Arienzo: twice a night minimum" — there is no min, only a "Tier" and "Not before".
- **Rules tab** is the first place the "Singer repeat gap 4" rule appears; it is not on the composer. "TRACK ENERGY — key is 'title|orchestra-id' in lower case" is developer syntax exposed to DJs.
- **Memory tab** (`76-db-memory-full.png`): "Add a note…" sheet is clean; note saved as "You · 19 Oct 05:21" (UTC — it was 07:21 for Jonas). After three "Shorter cortinas" chips the **Learned preference** reads "Cortina length 30" while the set's actual cortinaLengthSec was already 20; and the footer "Applied under tonight's explicit choices" never showed on the composer ("Using what you taught me" did not appear in `using-memory`), because the explicit value already differed. Sets list: four rows all called "4h golden milonga" with no distinguishing detail but the score.
- **Settings** (`60-settings-ai-test.png`): "Test connection" with a bad key prints the **raw provider JSON** in red (`401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"},"request_id":…}`). Model field pre-filled "claude-sonnet-5-5" with no explanation. Dark theme (`61-…`, `63-compose-dark.png`) is complete and legible. Region → Buenos Aires correctly becomes the Tonight default. DJ-app folders: a "File naming" row with placeholders `{artist} {title} …` — good, but there is no example of the output next to it.
- **Library** (`77-library-search.png`): "Biagi vals" → 22 results, each with energy. Every Biagi vals shows **energy 80–85** (orchestra default), i.e. the track-level energies are mostly the orchestra constant; the composer's per-track numbers (e.g. Lomuto 50/50/50, D'Agostino 54/54/54) confirm it. The energy curve's precision is therefore mostly cosmetic inside a tanda.
- **Spotify**: "Connect Spotify" requires the user to create a developer app and paste a Client ID, with the redirect URI shown. Lea (the only Spotify-only DJ) gave up here: "I don't have a developer account; I have Spotify."

---

## 6. Bugs with repro steps (ranked)

1. **Phone: page becomes 476 px wide after compose.** iPhone 15 Pro → Compose → page scrolls horizontally; header icons and tanda energy column clipped; after a swipe the page stays shifted. Overflow comes from `.swipe-actions` (148 px) inside `article.group-inset` (460 px). `45-phone-tanda-card.png`, `47-phone-cortina-sheet.png`.
2. **La Cumparsita played mid-set.** Era golden-extended, 6 h, *Close with La Cumparsita = off* → tanda 8 Troilo instrumental contains "La Cumparsita 1943". Any Cumparsita outside the opening/closing slots must be excluded regardless of the close switch.
3. **Second Cumparsita glued into the última with a different singer.** Closing Cumparsitas = Two → última D'Agostino/Vargas + "La Cumparsita (Tino García)". Singer consistency 67 %. Should be two standalone closings (or same singer).
4. **Context forces "tangos in threes", then the score punishes it** (Tanda sizes 0 %, "9 non-standard") — Práctica, Beginners, Hot room and Milongueros all trigger it. Either exempt the forced size from the factor or make the shift optional.
5. **Orchestra spacing factor uses 8 while the control default is 6**: a default set scores 0 % on an 8-weight factor it was told to violate. Score sheet text "no repeat within 8 tandas" vs control "Orchestra repeat gap 6".
6. **Chips rewrite structure silently**: "More vals" → Cycle = Custom (empty field); "More playful" → Arc = Gentle + Mood = Playful. No note tells the user what changed.
7. **"Tell the DJ" keyword fallback maps "Pugliese" → more-dramatic and drops "D'Arienzo vals"** with a note that reads like success ("Applied: more-dramatic, no Francisco Canaro"). It should list what it could *not* understand.
8. **Cortina length in cards/exports (57–60 s) disagrees with the 45 s control** on sets with no weather set.
9. **Colour tanda switch does nothing visible** (no foxtrot / Pirincho / Hugo Díaz, no card note) in golden-extended.
10. **Index duplicates**: Poema (Canaro/Maida 1935) ×2, Canaro en París ×2, D'Agostino La Cumparsita ×3; title "Comme Il Faut(como Debe Ser)(como Debe Ser)".
11. **Database edit grid overflows** the content column on desktop in Edit mode (`70-db-edit-mode.png`).
12. **Export CSV genre "Tango tango" / "Tango vals"**.
13. **Live deployment**: `/api/db` 404 and `?_rsc` prefetch 404 on every navigation.
14. **Settings → Test connection shows raw provider JSON**.
15. **Set name ignores event**: "2h golden milonga" for a práctica; "6h golden-extended milonga" for a marathon block.

---

## 7. The 15 most valuable enhancements, ranked

Each with a one-line acceptance test (vitest invariant or e2e).

**Rules / musicality**

1. **Cumparsita exclusion everywhere but the ends.** *Test:* for 200 seeds × all eras with `closeWithCumparsita` on and off, no tanda song title matches /cumparsita/i except `opening`, `closing`, and the última's last track when `cumparsitaCount = 2`.
2. **Two closing Cumparsitas = two standalone versions by different orchestras, same singer rule untouched.** *Test:* `cumparsitaCount: 2` yields `closing: [v1, v2]` with distinct orchestras and the última keeps one singer (Singer consistency = 100 % on the golden set).
3. **Make the heat/práctica "tangos in threes" shift a suggestion, not a mandate, and never score what the context forced.** *Test:* with `context.roomTemp = "hot"` and `tangoTandaSize` unpinned, Tanda-size factor = 100 %; with `tangoTandaSize` pinned to 4, every tango tanda has 4 tracks.
4. **Beginner/mixed crowd filters difficulty, not just energy**: exclude Láurenz milongas, D'Arienzo '35–37 milongas, Pugliese post-'50, Biagi/Duval, Varela for `crowdLevel: beginners`; allow with `mixed`. *Test:* `crowdLevel: "beginners"` → zero tandas from an `advancedOnly` list over 100 seeds; `mixed` → at most one per 3 h.
5. **Orchestra quotas per night (min/max)**, with era-aware "big four" minimums: a 4 h golden milonga must contain ≥2 D'Arienzo tango tandas, ≥1 Troilo, ≥1 Di Sarli, ≥1 Pugliese (late) and ≤2 of any orchestra per 4 h, honouring Tier in the Orchestras tab. *Test:* golden 4 h, 50 seeds → D'Arienzo tango tandas ≥ 2, max per-orchestra count ≤ ceil(hours/2), Orchestra-spacing factor ≥ 90 %.
6. **Align the repeat-gap control and the spacing factor** (one number, read from the request). *Test:* a set composed with `orchestraRepeatGap: g` scores 100 % on spacing when no repeat is within g.
7. **Cortina rotation**: no cortina track more than twice per 2 h, and honour chosen cultures and the context genres in the footer. *Test:* 27-tanda set with `cortinaStyle: "matched"` → max count of any (artist,title) ≤ 3; with cultures [italian, french] → ≥ 80 % of cortinas from those cultures.
8. **Arc enforcement for milongas/valses**: no milonga or vals above `target + 10` in the warm-up third; the Marathon arc caps the first-hour peak. *Test:* marathon 6 h, 50 seeds → max energy in the first 20 % of tandas ≤ target + 8; "warm-up" phase never contains the night's max.

**Generation quality / data**

9. **Per-track energy and BPM from the curated corpus** instead of orchestra constants (Lomuto 50/50/50, Biagi vals all 80–85). *Test:* ≥ 70 % of tracks in a golden 4 h set have `energy` from a track-level source; the Tempo-coherence factor is no longer "unscored → 35 %" on the golden set.
10. **Deduplicate the index on (title, orchestra, singer, year ± 0)** and normalise titles ("(como Debe Ser)(como Debe Ser)"). *Test:* `index:build` emits zero duplicate keys; no title contains a repeated parenthetical.
11. **Colour tanda actually materialises and is labelled.** *Test:* `rules.colourTanda: true` in golden-extended → exactly one tanda with `note: "Colour tanda"` from the foxtrot/Pirincho/Hugo Díaz pool, placed after 50 % of the night.
12. **"Tell the DJ" without a key: a real grammar for orchestra/singer/rhythm/count/position** ("no Canaro", "more Pugliese", "a D'Arienzo vals at 1 am", "no milongas after 3 am"). *Test:* "more Pugliese and a D'Arienzo vals tanda" → ≥ 2 Pugliese tandas (if `puglieseOnce` off) and ≥ 1 D'Arienzo vals; unparsed fragments are returned in `note` as "Could not apply: …".

**UI / UX**

13. **"What changed" diff after every chip/refine/swap**: a one-line summary ("Arc → gentle · 3 tandas replaced (7, 9, 14) · score 79 → 75") and changed cards highlighted. *Test (e2e):* after a chip, `[data-testid=change-summary]` lists the changed tanda indices and the old/new score; cards with changed `songs[0].id` carry `data-changed`.
14. **Fix the phone overflow and make Lock/Swap discoverable on desktop** (icon buttons on the card header, not only a "…" menu; a one-time "swipe for lock & swap" hint on phone). *Test (e2e):* iPhone viewport after compose → `scrollWidth === clientWidth`; desktop → `getByRole("button", {name: "Lock tanda 1"})` visible without opening a menu.
15. **Start from an event, not from 40 controls**: a first-run chooser (Práctica 2 h / Milonga 4 h / Marathon block 6 h / Afternoon 3 h) that sets length, arc, context and names the set after the event; the full form stays below. *Test (e2e):* fresh profile → choosing "Práctica" composes within one click, the result name contains "práctica", and `#result` is visible without scrolling past Night Rules.

Runner-up worth a line: Spotify "Listen" should search the actual recording (`orchestra title year`) instead of a stranger's reference playlist when no account is connected.

---

## 8. Copy and wording fixes

| Where | Now | Suggested |
|-------|-----|-----------|
| Tonight footer | "7 shifts · energy −9 · tempo −2 · … · tangos in threes · vocal −25%" | "From tonight's choices: energy −9, slower tempo, tango tandas of 3, fewer vocals. Cortinas: jazz standards, soul, Italian 60s." Count *choices*, not internal shifts. |
| Tonight footer, nothing chosen | "1 shift · cortinas: themed-single-artist, …" | "Region Europe (from Settings). Set season, room or crowd to shape the night." |
| Cortina genres | "themed-single-artist", "italian-60s", "rock-nacional" | Human labels: "one-artist theme", "Italian 60s", "rock nacional". |
| Set name | "2h golden milonga" | "Tuesday práctica · 2 h · Golden Age" (use event + length + era). |
| Score factor | "Tanda sizes (tango 4, vals 3–4, milonga 3) — 9 non-standard" | When the context forced 3: "Tango tandas of 3 (tonight's heat/práctica rule)" and no penalty. |
| Score factor | "Source/transfer quality (curator selection, resolvable streams) · 6/39 curator-selected, 0 resolvable on Spotify" | A dancer cannot act on this; either hide it until Spotify is connected or say "Connect Spotify to score stream quality". |
| Score factor | "Tempo coherence … no BPM data (unscored → 35%)" | Do not show a percentage for an unscored factor; show "no BPM data" and exclude from the total. |
| Score verdicts | "Enthusiastic amateur" (69), "Solid regular milonga DJ" (70–84) | Drop "amateur"; use "Needs work" / "Floor-ready" / "Headline". |
| Adjust footer | "Locked tandas stay where they are." (always) | Show only when ≥ 1 tanda is locked; otherwise "Tap a chip to recompose, or lock tandas you want to keep." |
| Tell the DJ note | "Matched by keywords (add a model key in Settings for the full version). Applied: more-dramatic, no Francisco Canaro." | "Applied: no Canaro, more drama. Could not apply: 'more Pugliese', 'a D'Arienzo vals tanda' — add a model key in Settings for sentences like these." |
| Written review, no key | modal with Cancel + Done | single "OK"; or route straight to Settings → Written reviews. |
| Mood check row | "Compare the set's feel with Aren León's reference tandas." | "Listen to Aren León's reference tandas on Spotify." (until it compares anything) |
| Listen (no Spotify) | "Reference playlist for Osvaldo Fresedo: … Connect Spotify in Settings to hear the exact recordings." | "Preview: a public Fresedo playlist. Connect Spotify to play *Por Calles Muertas* and the other tracks." |
| Cortina row | "Connect Spotify in Settings to preview cortinas, or open the search." | One action: "Open on Spotify". |
| Export sheet | "52 tracks will be exported." | "39 songs + 13 cortinas (52 files)." |
| Export CSV genre | "Tango tango" / "Tango vals" | "Tango" / "Vals" / "Milonga" / "Cortina". |
| Database rhythm picker | "tango / Vals / Milonga / Cancion / Foxtrot / Other" | "Tango / Vals / Milonga / Canción / Foxtrot / Other". |
| Database rules | "Key is 'title\|orchestra-id' in lower case, e.g. 'el flete\|juan-d-arienzo'" | Replace with a title+orchestra search field that writes the key for the user. |
| Settings test connection | raw `401 {"type":"error",…}` | "The key was rejected by Anthropic (401). Check it and try again." |
| Settings model | "claude-sonnet-5-5" with no hint | "Model (leave blank for the default)". |
| Memory sets | "4h golden milonga · 19 Oct 05:22 · 4 h · golden" ×4 | Include seed and local time: "4 h golden · Sat 19 Oct 07:22 · seed 390148769 · 76". |
| Night rules | "Última tanda: Emotional vocal / D'Arienzo rhythmic / Pugliese / Any" | Add a one-line sub ("The last tanda before La Cumparsita") like the other rows have. |
| Night group footer | "1 h is a práctica, 4 h a milonga, 8 h a marathon." | "Guide: 2 h práctica · 4 h milonga · 6 h marathon block." (an 8 h single set is rare; 6 h blocks are what marathon DJs play) |
| Era picker | "Golden extended 32–60" | "Golden Age, extended (1932–60)". |
| Tanda card sub | "Instrumental · 1939–1940 · warm-up" | "Instrumental · 1939–40 · warm-up" and, on phone, drop "target NN" into the long-press/menu. |

---

## 9. What delighted all three

- Tanda integrity: one orchestra, one singer, 2–4 year windows, every time. Marta: "I've heard worse from paid DJs."
- The energy curve: clickable dots that scroll to the card with a ring pulse; the dashed target makes the engine's intention visible.
- Pins on era-controlled fields, and the era note that says what it changed.
- Locks survive chips and refines; "Recompose with same seed" is reproducible; the Set list `.txt` export is booth-ready.
- Tonight pickers that show the shift per option and the evidence colour dot.
- Everything persisted across reload; dark mode is complete.
