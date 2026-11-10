# Round 13: best years per orchestra and per orchestra + singer family

Read-only review by a discographer. Sources: `data/knowledge/orchestra_profiles.json` (profile), `data/knowledge/reference_sets.json` (31 DJ sets, 218 canonical tandas, 1,078 famous recordings: "corpus"), `data/index/songs.json` (the index: 19,118 rows), the featured night `docs/specs/round11-best-night.md` and the five seed nights `review13/seed-{3,42,108,193,250}.txt`.

Method: for every orchestra I read its dated rows in the index (title, singer, exact recording date), joined them with how often the corpus plays each family and side, and checked both against my own catalogue knowledge. Every side named below exists in `songs.json` with the year given, and is a dated row (`yearApprox` not set) unless marked. Confidence: **H** = standard discography, the index and the corpus agree. **M** = I am confident but the index or corpus is thin. **L** = my judgement, or sources disagree. Please check L items before turning them into engine rules.

Two engine facts shape the recommendations:

- `singerStints` is not read anywhere in `packages/core/src`. Only `singers` (in `energy.ts`, a −2 energy tweak) and `bestYears` (in `tanda.ts`, ×0.5 outside the range) are used. `bestYears` applies to the whole orchestra, so it cannot express "Di Sarli–Rufino 1939–43 but Di Sarli–Durán 1945–46". Today the ranges are so wide (D'Arienzo 1935–57, Canaro 1927–46, OTV 1926–44, D'Agostino 1940–55) that they almost never apply. The block in §2 is per family so that the engine can weight best > ok > outside.
- The engine already drops `yearApprox` rows (`tanda.ts` `dated()`). So the index's range-date rows (§4.1) do not reach nights, but they do corrupt any per-family year statistics that are computed from `year`.

---

## 1. Best dancing years per orchestra

"Best" = the years DJs actually play for that family at a milonga. "OK" = acceptable when the best years run out or as a second tanda. Sides: 3–6 per period, title (year) as in the index.

| Orchestra | Heatmap (coverage.json): grade 4 / grade 3 years, I = instrumental, V = vocal | Family: best (ok) | Signature sides DJs play (all in songs.json) | Conf. |
|---|---|---|---|---|
| **Juan D'Arienzo** | I: 4 1935–1944, 1950–1953; 3 1945–1949, 1963–1965, 1970–1975<br>V: 4 1935–1944; 3 1950–1956 | Instr 1935–39 (1940–55) | El flete (1936), Rawson (1936), Ataniche (1936), La viruta (1936), Jueves (1937), El cencerro (1937), El internado (1938), Unión Cívica (1938); valses Desde el alma (1935), Pabellón de las rosas (1935), Visión celeste (1936); milongas De pura cepa (1935), La puñalada (1937), Milonga vieja milonga (1937) | H |
| | | Walter Cabral 1935–36 | Silueta porteña (1936 mil), Un placer (1936 v), Tu olvido (1936 v) | M |
| | | Enrique Carbel 1937 | Paciencia (1937): a single side, not a family | H |
| | | Alberto Echagüe 1938–39 (1944–57) | Pensalo bien, La bruja, No mientas, Ansiedad, Nada más (1938), Mandria (1939); milongas Milonga del corazón, Milonga querida, Estampa de varón (1938); vals En tu corazón (1938) | H |
| | | Alberto Reynal 1940–41 (–42) | El corazón me engañó (1940), Chirusa (1940), Esclavas blancas (1940), Vidas marcadas (1942); A una mujer (1940 v) | M |
| | | Héctor Mauré 1941–43 (1940–44) | Dime mi amor, Ya lo ves, Humillación, Tierrita (1941), Cicatrices, Compadrón (1942), Si la llegaran a ver, Uno (1943), Amarras (1944); valses Cuatro palabras (1941), Flor del mal (1940) | H |
| | | Juan Carlos Lamas 1942–43 | Embrujamiento, Pompas de jabón, Seguíme corazón (1942) | M |
| | | Armando Laborde 1944–47 (–57); duo Echagüe–Laborde 1945–49 | Magdala (1944), Desde aquella noche (1946); valses La pena del payador, Me duele el corazón (1945) | L |
| **Carlos Di Sarli** | I: 4 1939–1947, 1951–1958; 3 —<br>V: 4 1939–1947; 3 — | Instr 1939–43 (1944–58)¹ | El retirao (1939), Shusheta (1940), La trilla (1940), Nobleza de arrabal (1940), El incendio (1940), Don Juan (1941), El amanecer (1942), Organito de la tarde (1942) | H |
| | | Roberto Rufino 1939–43 | Corazón (1939), Lo pasado pasó, En un beso la vida, Cosas olvidadas (1940), Cascabelito, Charlemos (1941), Tristeza marina, Verdemar (1943); milongas Pena mulata, La mulateada, Zorzal (1941); valses Alma mía, Rosamel (1940), Cortando camino (1941) | H |
| | | Carlos Acuña 1941 | Cuando el amor muere (1941): one side | H |
| | | Alberto Podestá 1942–44 (–47) | Nido gaucho, Junto a tu corazón, No está (1942), Nada, Lloran las campanas, La capilla blanca, Tú el cielo y tú (1944); milonga Entre pitada y pitada (1942) | H |
| | | Jorge Durán 1945–46 (1945–47, 1956–58) | Vieja luna, Tus labios me dirán, Un tango y nada más, Hoy al recordarla (1945), La vida me engañó (1946) | H |
| | | Serpa / Pomar / Florio 1951–58 | Outside the 1935–49 scope. Ranges given in §2 only | M |
| **Aníbal Troilo** | I: 4 1941–1944; 3 —<br>V: 4 1941–1944; 3 — | Instr 1941–44 (1938–49) | Cachirulo, Milongueando en el cuarenta, Guapeando, Cordón de oro, El tamango (1941), C.T.V. (1942), Pablo (1943), Quejas de bandoneón (1944); Comme il faut, Tinta verde (1938) as OK | H |
| | | Francisco Fiorentino 1941–44 | Te aconsejo que me olvides, No le digas que la quiero, En esta tarde gris, Toda mi vida, El bulín de la calle Ayacucho (1941), Gricel, Malena, Pa' que seguir (1942), Sosiego en la noche, Cada vez que me recuerdes (1943); milongas Mano brava, Del tiempo guapo (1941), Ficha de oro, Papá Baltasar (1942); valses Tu diagnóstico (1941), Acordándome de vos (1942), Valsecito amigo (1943), Temblando (1944) | H |
| | | Alberto Marino 1943–46 | Uno, La luz de un fósforo (1943), Cristal, Torrente, Sombras nada más (1944), Sin palabras (1946) | H |
| | | Floreal Ruíz 1944–47 (–48); duo Marino–Ruíz 1944–46 | valses Llorarás llorarás (1945), Romance de barrio, Flor de lino (1947), Palomita blanca (duo, 1944); tangos Marioneta (1944), Yuyo verde (1945) | H |
| | | Edmundo Rivero 1947–49 (–50); Aldo Calderón 1949–50 | Rivero: listening repertoire, little floor use. Calderón: Cuando volverás, Y volvemos a querernos (1949) | M |
| **Osvaldo Pugliese** | I: 4 1944–1958; 3 —<br>V: 4 1944–1946; 3 — | Instr 1943–49 (1950–59) | Mala junta (1943), Recuerdo, El arranque, Tierra querida, El remate (1944), El taita (1945), La yumba (1946), Negracha, Patético, Boedo (1948), Malandraca (1949) | H |
| | | Roberto Chanel 1943–46 (–47) | Farol (1943), Corrientes y Esmeralda, La abandoné y no sabía (1944), Rondando tu esquina, El sueño del pibe (1945), Fuimos (1946); milonga Tortazos (1944) | H |
| | | Alberto Morán 1945–48 (–54) | Yuyo verde, El abrojito, Hoy al recordarla (1945), Demasiado tarde, Una vez (1946), Sin palabras (1947); Pasional (1951) as OK | H |
| | | Jorge Vidal 1949–50 | Puente Alsina, La cieguita (1949): rarely danced | M |
| **Miguel Caló** | I: 4 1941–1946; 3 —<br>V: 4 1941–1946; 3 — | Instr 1943–45 (–50) | Inspiración, La maleva, Elegante papirusa (1943), Sans Souci, Saludos (1944), Tierra querida (1945) | M |
| | | Alberto Podestá 1941–43 | Dos fracasos, Yo soy el tango (1941), Si tú quisieras, Percal (1943); valses Bajo un cielo de estrellas (1941), Pedacito de cielo (1942) | H |
| | | Raúl Berón 1942–43 (–44) | Jamás retornarás, Qué te importa que te llore, Al compás del corazón, Tristezas de la calle Corrientes, Corazón no le hagas caso, Un crimen (1942); milongas Azabache, Milonga que peina canas (1942); vals El vals soñador (1942). OK: En tus ojos de cielo, Entre sueños (1944) | H |
| | | Jorge Ortíz 1943 | A las siete en el café, Barrio de tango, Pa' que seguir, Ya sale el tren (1943) | H |
| | | Raúl Iriarte 1943–45 (–47) | Marión, Cuando tallan los recuerdos (1943), Nada, Tabaco (1944), Trenzas (1945); valses Me duele el corazón (1944), El mismo dolor, No te olvides de mi corazón (1945) | H |
| | | Roberto Arrieta 1945–48 | (index has 22 sides, the corpus barely plays them) | L |
| **Ricardo Tanturi** | I: 4 1940–1943; 3 1944–1945<br>V: 4 1940–1943; 3 1944–1945 | Instr 1940–41 | Argañaraz (1940), El buey solo, Una noche de garufa, Comparsa criolla, Lágrimas, Didí (1941) | H |
| | | Alberto Castillo 1941–43 | Pocas palabras, La vida es corta, Recuerdo malevo, Ese sos vos (1941), Así se baila el tango, Cuatro compases, Madame Ivonne (1942); milongas Mozo guapo, Mi morocha (1941), Así es la milonga (1942); valses Recuerdo (1941), Mi romance (1941), Marisabel (1942) | H |
| | | Enrique Campos 1943–45 (–46) | Una emoción, Oigo tu voz, Muchachos comienza la ronda, Qué vas buscando muñeca, Por eso canto yo (1943), Encuentro, Calla bandoneón (1944) | H |
| | | Roberto Videla 1945–47 (–48); Ribó 1946–48 | Tu llamado (1945), Así era ella muchachos (1946): second rank | M |
| **Rodolfo Biagi** | I: 4 1938–1950; 3 1951–1962<br>V: 4 1938–1949; 3 — | Instr 1938–42 (1943–56) | El trece, Unión Cívica (1938), Pura clase, La maleva (1939), El yaguarón, La marca de fuego (1940), Bélgica (1942); valses Lágrimas y sonrisas, Pájaro herido, Marchetta (1941) | H |
| | | Teófilo Ibáñez 1938–39 | valses Lejos de ti, Loca de amor, Viejo portón (1938); milonga Campo afuera (1939) | H |
| | | Andrés Falgás 1939–40 | Queja indiana, Griseta, Cielo (1939), La chacarera, A mí no me interesa (1940); valses Déjame amarte aunque sea un día, Dichas que viví (1939), El último adiós (1940) | H |
| | | Jorge Ortíz 1940–42 (–45) | Todo te nombra, Quiero verte una vez más, No le digas que la quiero (1940), Ahora no me conocés, Humillación, Zaraza, Pájaro ciego (1941); valses Por un beso de amor (1940), Cuatro palabras (1941) | H |
| | | Carlos Acuña 1943–44 | Yo tengo un puñal, Barrio reo (1943), Uno, Sosiego en la noche (1944) | M |
| | | Alberto Amor 1943–46 (–47) | Seamos amigos, Como el hornero (1944), Hoy te quiero mucho más, Tus labios me dirán, Café de los Angelitos (1945); milonga Flor de Montserrat (1945); vals Aroma de amor (1946) | H |
| **Enrique Rodríguez** | I: 4 1940–1947; 3 1937–1939<br>V: 4 1940–1947; 3 1937–1939 | Instr 1940–46 | La torcacita (1940), Florida, El morochito (1941), Zorro gris (1946) | M |
| | | Roberto "Chato" Flores 1937–39 | Son cosas del bandoneón (1939), Déjame ser así, Vendrás alguna vez (1938); valses Fru fru, Tengo mil novias, Salud dinero y amor (1939) | H |
| | | Armando Moreno 1940–45 (–46) | En la buena y en la mala, Danza maligna, No te quiero más (1940), Suerte loca, Llorar por una mujer (1941), El encopao, Cómo has cambiado pebeta, Yo no sé por qué razón, Un tropezón (1942), Qué lento corre el tren (1943), Este es tu tango (1945); valses Isabelita (1940), Con tu mirar (1941) | H |
| **Francisco Canaro** | I: 4 1934–1941; 3 1925–1933<br>V: 4 1934–1941; 3 1925–1933 | Instr 1932–38 (1927–41) | Charamusca, S.O.S. (1934), Se lo llevaron (1937), Pura parada, La maleva (1938); milongas Pura milonga (1932/37), La milonga de mis tiempos (1938) | L |
| | | Roberto Maida 1935–38 | Ciego, Poema (1935), Invierno, Condena (1937), Nada más, Paciencia (1938); milongas Largá las penas (1935), Silueta porteña, Milonga criolla (1936); valses En voz baja, Mi corazón (1937), El triunfo de tus ojos (1938) | H |
| | | Ernesto Famá 1939–40 (1932–40); Irusta–Famá 1933 | Mala suerte, Olimpia (1939), A quién le puede importar, Esta noche me emborracho (1940); Milonga sentimental (1933). The canonical 1939 Famá sides (Tormenta, Abandonada, Algún día te diré) are missing from the index (§4.3) | M |
| | | Francisco Amor 1939–41 | Mi serenata (1940); valses Muchachita porteña, Tengo mil novias (1940) | M |
| | | Carlos Roldán 1942–45 | milongas Se dice de mí (1943), Oiga rubia, La naranja nació verde (1944) | M |
| **Osvaldo Fresedo** | I: 4 —; 3 1925–1930, 1932–1948<br>V: 4 1932–1941; 3 1925–1930 | Instr 1931–39 | El espiante (1933), El once (1931), Arrabalero (1939, undated row) | L |
| | | Roberto Ray 1933–39 (1948–50) | Vida mía (1934), El once (1935), Sollozos, No quiero verte llorar (1937), Penumbras (1939). Niebla del Riachuelo exists only as a range-date row (§4.1) | H |
| | | Ricardo Ruíz 1939–42 | only Rosarina linda (1940) is dated: the family cannot be built (§4.1) | H for the years, data unusable |
| | | Oscar Serpa 1942–45 (–49) | Mi noche triste, Sin rabia y sin pena, Barrio porteño, Tango gris (1942) | M |
| **Edgardo Donato** | I: 4 1935–1942; 3 —<br>V: 4 1935–1942; 3 — | Instr 1932–40 | El acomodo (1933), Tierrita (1934), La tablada (1936), El estagiario, El chamuyo (1938), Pasión criolla (1939), El distinguido ciudadano, El lengue (1940); milonga El torito (1939) | H |
| | | Horacio Lagos 1936–41 (1935–42) | Se va la vida (1936), El adiós, Cantando bajito (1938), Lágrimas, Soy mendigo (1939), A media luz (1941); milongas La milonga que faltaba, Sacale punta (1938), La mimada (1939), Campo afuera (1940); valses Sólo un recuerdo (1936), Con tus besos, Vivo sin sombra lejos de ti (1938). Most canonical Lagos sides are missing (§4.3) | H for years, M for the index |
| | | Lagos / Morales / Gavioli trios and duos 1938–41 | Carnaval de mi barrio (1939, a vals mislabelled as tango, §4.2), Mi serenata (1940) | M |
| | | Félix Gutierrez 1932–34 | El huracán (1932) | H |
| **Ángel D'Agostino** | I: 4 —; 3 —<br>V: 4 1940–1945; 3 — | Instr: Café Domínguez (1955) only | a single side, so no instrumental tandas | H |
| | | Angel Vargas 1940–45 (–46) | Muchacho, No aflojes (1940), Tres esquinas, Adiós arrabal, Agua florida, Ahora no me conocés, El yacaré, Una pena (1941), Ninguna (1942), El cornetín del tranvía, Me llaman tango (1943), Mano blanca (1944), Caricias, Hotel Victoria (1945); milongas Compadreando (1941), El porteñito (1943). No valses in the index (§4.3) | H |
| **Alfredo De Angelis** | I: 4 —; 3 1943–1949<br>V: 4 1944–1945; 3 1946–1949 | Instr 1950–59 (1943–49) | Gloria (1950), Cuando llora la milonga, El choclo (1952), Mi dolor (1957), Pavadita (1958); 1940s: Pura maña (1943), El pial (1945), El taladro (1946) | H |
| | | Carlos Dante 1944–50 (–57) | Melenita de oro (1944), Soy un arlequín, Para qué te quiero tanto (1945), Con alma de tango, La brisa (1946), Compadrón (1949) | H |
| | | Dante–Martel duo 1944–50 | valses Soñar y nada más (1944), Pregonera (1945), Pobre flor (1946), A Magaldi, Flores del alma (1947); tangos Remolino (1946), La pastora (1948) | H |
| | | Julio Martel 1943–47 | Qué buena es (1943), De igual a igual (1944), Rosicler, La vida me engañó (1946) | M |
| | | Floreal Ruíz 1943–44 | Cómo se muere de amor (1943), Bajo el cono azul (1944); vals Mi novia de ayer (1944) | H |
| **Pedro Láurenz** | I: 4 1937–1947; 3 1952–1953<br>V: 4 1937–1947; 3 — | Instr 1937–44 | Arrabal (1937, a tango mislabelled as milonga, §4.2), Amurado (1940), Orgullo criollo, Poca suerte (1941); milonga Milonga de mis amores (1944 instr) | H |
| | | Juan Carlos Casas 1938–40 (–42) | Vieja amiga (1938), No me extraña, Como dos extraños, De puro guapo, Desconsuelo (1940); milongas Milonga compadre (1938), Milonga de mi flor, Improvisando (1940); vals Mascarita (1940) | H |
| | | Alberto Podestá 1943–44 | Garúa, Recién, Que nunca me falte, Todo, Nunca tuvo novio, Alma de bohemio (1943); milongas Yo soy de San Telmo, Maldonado (1943), El criollito oriental (1944); vals Paisaje (1943) | H |
| | | Bermudez / Linares 1944 | vals Mendocina (duo, 1944) | M |
| **Lucio Demare** | I: 4 —; 3 1938–1943<br>V: 4 1938–1943; 3 — | Juan Carlos Miranda 1938–42 | Din don, Telón (1938), No te apures Carablanca, Pa' mí es igual, Mañana zarpa un barco, Malena, Sorbos amargos (1942) | H |
| | | Raúl Berón 1943 (–44) | Tal vez será su voz, Una emoción, Qué solo estoy, Oigo tu voz (1943); valses No nos veremos más, Se fue, Al pasar (1943) | H |
| | | Horacio Quintana 1944–45 | Torrente, Solamente ella (1944), Igual que un bandoneón, Me quedé mirándola (1945) | H |
| **Francisco Lomuto** | I: 4 1941–1946; 3 —<br>V: 4 1932–1942; 3 — | Jorge Omar 1936–39 (1935–42) | A la gran muñeca, Nostalgias, Mano a mano (1936), Madreselva, Gólgota (1938), Por la vuelta (1939); valses Rival (1936), Dime que sí (1938) | M |
| | | Fernando Díaz 1931–35 (–42) | valses Mal de ausencia (1932), Plegaria (1933), Esquinas porteñas, Lirio blanco, Tu sombra (1934). The corpus plays Omar, not Díaz | L |
| | | Instr 1937–42 | most instrumental rows are range-dated "1941/42" and invisible to the engine | L |
| **Roberto Firpo** | I: 4 1935–1936; 3 1927–1934<br>V: 4 1935–1936, 1939; 3 1932–1934 | Instr 1936–40 | El entrerriano (1937), Indio sácale el pelo (1938), Curda completa (1939), El choclo, De vuelta al pago (1940). The well-known Firpo sides (El amanecer, Fuegos artificiales, Alma de bohemio) are not in the index | L |
| **Orquesta Típica Victor** | I: 4 —; 3 1925–1944<br>V: 4 —; 3 1925–1944 | Instr 1927–34 (–38) | Che papusa oí (1927), Niño bien (1928), Tierrita, C.T.V. (1932), El Marne (1933), Jueves (1934) | M |
| | | Alberto Gómez 1930–35; Carlos Lafuente 1930–34 | Quiero papita, Desconfianza (1932), Ventarrón, El mortero del globito (1933); valses Sueño de juventud, La serenata de ayer (1931) | M |
| | | Lita Morales 1937; Angel Vargas 1938–39 | valses Noches de invierno (1937), Sin rumbo fijo (1938); Adiós Buenos Aires (1938) | H |
| **Ricardo Malerba** | I: 4 —; 3 —<br>V: 4 1942–1943; 3 — | Orlando Medina 1942–43 (1941–44) | Gitana rusa (1942), La piba de los jazmines, Remembranza, Embrujamiento, Mi taza de café, Magdalena (1943); vals Cuando florezcan las rosas (1943) | H |
| **Domingo Federico** | not in heatmap | Carlos Vidal 1944–47 | Yuyo verde (1944), Senda florida, Yo (1945), Al compás del corazón (1947) | M |
| **Alfredo Gobbi** | I: 4 —; 3 1947–1958<br>V: 4 —; 3 — | Instr 1947–52 | La viruta (1947), Independiente Club (1948), Racing Club, Orlando Goñi, Chuzas (1949), El andariego (1951) | M |
| **Francini–Pontier** | not in heatmap | Instr 1946–50; Podestá 1946–47, Berón 1946–48, Rufino 1947–49 | Pichuco (1946), Tigre viejo, La beba (1947), A Zárate (1948) | L |
| **Osmar Maderna** | not in heatmap | Instr 1946–50; Verri 1946–47 | Chiqué (1946), Ojos negros, Felicia (1947), Lluvia de estrellas (1948) | L |
| **Florindo Sassone** | not in heatmap | Jorge Casal 1947–49 | (the famous Sassone instrumentals are 1959 onwards) | L |
| **José Basso / Piazzolla / Cambareri / Rotundo / Sánchez Gorio** | not in heatmap | Basso–Fiorentino 1949; Piazzolla–Fiorentino 1945–46; Cambareri instr 1948–50; Rotundo–Roldán 1948–50 | Cambareri: El choclo, Ataniche, Don Juan (1948). The others are fringe for a golden-era floor | L |

¹ Di Sarli has two equally canonical instrumental families: 1939–43 and 1951–58 (Bahía Blanca 1957, A la gran muñeca 1954, Don Juan 1955, El amanecer 1954). For a 1935–45 night, 1939–43 is "best". If the engine can hold two instrumental families, add `"instrumental_late": {"best": [1951, 1958]}`. D'Arienzo 1950–55 (La cumparsita 1951, Yapeyú 1951, El puntazo 1952) and Pugliese 1955–59 have the same two-family shape.

Orchestras left out of the table, because they have no dance-relevant 1935–49 recordings: Héctor Varela, Fulvio Salamanca, Donato Racciatti, Horacio Salgán (index rows from 1950), Sexteto Mayor, Color Tango, Sexteto Milonguero, Orquesta Romántica Milonguera, Solo Tango, Gotan Project, Bajofondo, Tanghetto, Otros Aires, Narcotango and Miguel Villasboas (no index rows at all).

### 1.0 Heatmap (primary source) compared with the discography view

The heatmap column above comes from `data/index/coverage.json`, the user's curated grid parsed from `data/sources/All_orchestras.xls`. It grades each orchestra and year, separately for instrumental (I) and vocal (V): 4 fantastic, 3 good, 2 uneven, 1 single tracks only, 0 avoid. It covers 21 orchestras. The JSON in §2 follows it: no `best` year is graded below 3 for that mode, and no `ok` year below 2. Where I think a family deserves more, I put it in a separate, justified `proposedOverrides` block instead of the main block.

Where my view differs, and why:

1. **The heatmap is per orchestra and mode, not per singer or rhythm.** A good vocal year mixes strong and weak singers. Examples:
   - OTV vocal is graded 3 for all of 1925–44, but Carmen del Moral, Amanda Ledesma and Sabina Olmos (1940) are cancionista records nobody dances.
   - Lomuto vocal is graded 4 for 1932–42, but the corpus plays Jorge Omar 1936–39, not Fernando Díaz's 1939–42 valses.
   - Caló vocal is graded 4 for 1941–46, but Arrieta 1945–46 is far weaker than Berón 1942.
   - D'Arienzo vocal is graded 4 for 1935–44, which also covers Reynal and Lamas.

   The per-singer bands narrow the heatmap; they never widen it.
2. **Years where the heatmap is stricter than me, and I accept it in the main block:**
   - Troilo after 1944 is graded 1 (I and V). The JSON drops Marino 1945–46, Floreal Ruíz 1945–47, Rivero and Calderón.
   - Pugliese vocal after 1946 is graded 1, which drops Morán 1947–54 and Maciel.
   - De Angelis is graded 1 from 1950 (I and V), which drops the 1950s instrumentals and Larroca.
   - Fresedo vocal is graded 0 from 1942, which drops Serpa and Pacheco.
   - Canaro after 1941 is graded 2: Roldán, Adrián, Coral and Arenas are ok at most.
   - Demare 1944–45 is graded 2: Quintana is ok only.
   - Di Sarli vocal 1951–58 is graded 2: Serpa, Pomar and Florio are ok.
   - D'Agostino instrumental is graded 1: no instrumental family (Café Domínguez is a single).
   - Tanturi vocal after 1945 is graded 1: Videla 1946–47 and Ribó drop.
   - Malerba 1944–45 is graded 2: Antonio Maida is ok.

   Several of these clash with corpus practice (Troilo–Ruíz valses, Demare–Quintana "Torrente", De Angelis "Mi dolor"/"Pavadita", Pugliese–Maciel "Remembranza"). Hence the overrides block.
3. **Years where the heatmap is more generous than me:**
   - D'Arienzo instrumental is graded 4 for 1935–44 and 1950–53. I keep `best` at 1935–39 (the user's brief and the corpus: 43 D'Arienzo instrumental set tandas, nearly all 1935–39) and treat 1940–55 as ok. That is a preference, not an error.
   - Biagi instrumental is graded 4 for 1938–50. I keep `best` at 1938–42.
   - Pugliese instrumental is graded 4 for 1944–58. I keep 1943–49 best and 1950–59 ok.
   - Canaro is graded 4 for 1934–41. I had 1932–38 and now follow the heatmap (1934–41 best).
   - Rodríguez is graded 4 for 1940–47. The heatmap is right that the Moreno years are the core.
4. **Years where the heatmap moved my bands, and I agree on reflection:**
   - Firpo instrumental is graded 4 only for 1935–36 and 2 for 1937 onwards. My 1936–40 becomes 1935–36 best (ok 1927–34).
   - Lomuto instrumental is graded 4 for 1941–46 and 2 for 1930–40. I had 1937–42. Note that the 1941/42 rows are range-dated and invisible to the engine (§4.1), so in practice Lomuto has no usable best-years instrumentals.
   - Fresedo instrumental is graded 3, never 4, for 1932–48. Best becomes 1932–39; Ruíz is trimmed to 1939–41, because 1942 is graded 0.
   - Donato instrumental is graded 4 for 1935–42. Best becomes 1935–42, ok 1932–34.
5. **Years the heatmap leaves ungraded but I mark as `best`** (allowed, because they are not graded below 3; listed so they can be checked):
   - Pugliese 1943 (I and V: Mala junta, Farol). His first records are from July 1943.
   - Donato–Félix Gutierrez 1932–34 (El huracán).
   - De Angelis 1943 (Floreal Ruíz, Martel). The orchestra's first year on record.
   - Biagi–Hugo Duval 1953–58: the heatmap has no Biagi vocal grades after 1949.
   - Troilo instrumental 1938 is ungraded, and only `ok`.
6. **Orchestras the heatmap does not cover**: Federico, Gobbi vocal, Maderna, Francini–Pontier, Sassone, Basso, Piazzolla, Cambareri, Rotundo and Sánchez Gorio. Their bands are my view only (M/L).

### 1.1 Profile corrections (compared with `orchestra_profiles.json`)

Spelling first. The profile `singers` maps carry duplicate spellings. Only the songs.json spelling ever matches a row: `Jorge Ortíz`, `Floreal Ruíz`, `Angel Vargas`, `Ricardo Ruíz`, `Roberto "Chato" Flores`, `Carlos Bermudez`, `Félix Gutierrez`, `Jorge Valdéz`, `Omar Quiróz`, `Angel Cárdenas`. The corpus (`reference_sets.json`) uses the other spellings (`Ángel Vargas`, `Jorge Ortiz`, `Floreal Ruiz`, `Roberto Flores`), so joins between corpus and index silently miss.

**D'Arienzo.** `bestYears` [1935,1957] → split: instrumental best 1935–39 (ok 1940–55), Echagüe 1938–39 (ok 1944–57), Mauré 1941–43. `Alberto Reynal` [1939,1941] → **1940–42** (all 16 rows are 1940-04 to 1942-04). `Juan Carlos Lamas` [1940,1943] → **1942–43**. Missing: `Carlos Casares` (3 rows 1940, L: I cannot confirm this credit). Signature "Amor y celos (vals)" is "Amor y celo" (1936) in the index.

**Di Sarli.** `bestYears` null → instrumental 1939–43 / Rufino 1939–43 / Podestá 1942–44 / Durán 1945–46. `Carlos Acuña` [1943,1943] → **1941** (Cuando el amor muere, 1941-08). `Oscar Serpa` [1948,1953] → 1948, 1952–55. `Rodolfo Galé` [1957,1958] → 1956. `Roberto Florio` [1956,1958] → 1954–58. The `subPeriods` 1939–45 entry gives energyShift −4 and warm-up/cooldown phases. That fits Rufino, but it also catches the 1940–41 instrumentals (El retirao, Shusheta, La trilla), which the corpus plays as build/peak material (L).

**Troilo.** `Aldo Calderón` [1955,1956] → **1949–50** (Cuando volverás 1949-03, Y volvemos a querernos 1949-10). `Jorge Casal` [1949,1955] → 1950–54. `Angel Cárdenas` [1957,1960] → 1956–59. The subPeriod "1938–42 preferred" is right for Fiorentino and the 1941 instrumentals. The two 1938 instrumentals (Comme il faut, Tinta verde) are OK, not best. Signature "Palomita blanca (vals 1944)" is the Marino–Ruíz duet.

**Pugliese.** `bestYears` null → instrumental **1943–49** best, 1950–59 ok. Chanel 1943–46, Morán 1945–48. Signature "Desde el alma (vals 1947)": the index only has 1979/1989/1992 versions (L that a 1947 one exists). "Pata ancha (1957)" is not in the index.

**Caló.** `Raúl Berón` stints [[1941,1943],[1945,1946]] → the index shows **1942 (15 sides) and 1944 (6)**, plus 1949–50. Best is 1942–43, OK to 1944. Signature "Sans Souci (1950)" → **1944** (1944-07, instrumental). The 1936 Berón and Podestá rows are radio transcriptions with range dates (§4.1).

**Tanturi.** `Alberto Castillo` [1940,1943] → **1941–43** (first row 1941-01). Signature "Mozo guapo (milonga Castillo 1940)" → **1941** (1941-02). `Roberto Videla` [1946,1948] → 1945–48. `Elsa Rivas` [1950,1951] → 1950, 1956–57. `Juan Carlos Godoy` [1952,1953] → 1950, 1956–57.

**Biagi.** `Carlos Acuña` [1947,1950] → **1943–44** (13 dated rows, 1943-03 to 1944-08). `Jorge Ortíz` second stint [1946,1948] → **1945** (8 rows, 1945-01 to 1945-09). The duplicate key `Jorge Ortíz` [1940,1948] should go. Missing: `Alberto Lago` 1941–42 (vals Amor y vals 1942). `Carlos Saavedra` [1950,1950] → **1946–48**. Signature "Racing Club (1940)" → **1950** (1950-06).

**Rodríguez.** `Armando Moreno` [1940,1950] → main stint **1940–46** (121 rows; isolated rows in 1951 and 1958–67). Signature "Son cosas del bandoneón (Moreno 1939)" → **Chato Flores** (1939-02). "Cómo se pianta la vida (1939)" and "Maldonado (milonga 1940)" are not in the index under Rodríguez. Missing: `Fernando Reyes` 1946–49.

**Canaro.** `bestYears` [1927,1946] → Maida 1935–38 best. Instrumental 1932–38 (L). `Charlo` [1928,1931] → rows to 1937. Missing: `Eduardo Adrián` 1942–43, `Guillermo Coral` 1944–46. Signature "Milonga brava (1938)" is not in the index.

**Fresedo.** Ray stints ✓. `Ricardo Ruíz` [1939,1942] is right: the index rows dated 1933 are wrong (§4.1). Signature "Vida mía (Ray 1933)" → index has **1934**. "Niebla del Riachuelo (Ray 1937)" is right: the index says 1933 (§4.1). "Tigre viejo (1934)" is not in the index. "Arrabalero (1927)" → index 1939 (undated row).

**Donato.** `Carlos Almada` [1945,1950] → **1950–52**. `Roberto Morel` [1942,1945] → **1953–55** (all 11 rows). Missing: `Hugo del Carril` 1935. Signature "Carnaval de mi barrio (vals 1939)" is right: the index labels it tango (§4.2). "Ella es así (milonga 1938)" and "La tapera (vals 1938)" are not in the index.

**D'Agostino.** `bestYears` [1940,1955] → Vargas **1940–45** (ok 1946). Instrumental: Café Domínguez 1955 only. `Rubén Cané` [1947,1951] → 1953. `Tino García` [1952,1963] → 1947–59. Signatures: "Agua florida (1945)" → **1941** (1941-11). "Esta noche en Buenos Aires (vals 1943)" → index **tango, 1944-01** (M). "Hotel Victoria (1945)" ✓ (Vargas, 1945-05).

**De Angelis.** `Floreal Ruíz` [1941,1943] → **1943–44** (the orchestra's first records are 1943). `Lalo Martel` [1957,1963] → 1959. Signature "Mi dolor (1954)" → **1957** (1957-05). "Pastora (vals 1944)" → the index has "La pastora", Dante–Martel, **1948, tango**. "Remolino (Dante 1946)" → the **Dante–Martel duo**.

**Láurenz.** `Juan Carlos Casas` [1937,1940] → **1938–42** (Taconeando, A mí dejame en mi barrio 1942). `Martín Podestá` [1940,1943] → **1941–42**. Duplicate `Carlos Bermúdez`/`Carlos Bermudez` → keep `Carlos Bermudez`, 1944. Missing: `Héctor Farrel` 1937, `Alberto del Campo` 1942. Signature "Milonga de mis amores (1937)": the index credits the 1937-07 side to Héctor Farrel and has an instrumental of 1944-01 (L: which one is the floor version needs a listen).

**Demare.** `Raúl Berón` [1943,1945] → **1943** (25 sides; 1 in 1944). `Horacio Quintana` [1945,1948] → **1944–45**. `Roberto Arrieta` [1949,1951] → index **1942** (3 sides). Signature "Solamente ella (Berón 1944)" → **Horacio Quintana**, 1944-07. "Dandy (Miranda 1942)" is not in the index (only an undated instrumental of 1957).

**Lomuto.** `bestYears` [1930,1945] → Jorge Omar 1936–39 best. Fernando Díaz [1928,1945] → 1931–42 in the index. Signatures "Muñeca brava (Díaz 1933)" and "Puente Alsina (Díaz 1930)" are not in the index. "Nunca más" exists only as a range-dated instrumental "1941/42".

**Firpo.** `bestYears` [1936,1939] → 1936–40. All five signature tracks except "El rápido" (1931) are missing from the index.

**OTV.** `bestYears` [1926,1944] → instrumental **1927–34**, Gómez 1930–35, Vargas 1938–39. Carmen del Moral, Amanda Ledesma and Sabina Olmos (1940) are singers' records, not dance repertoire. Signatures "Temo (vals 1940)" and "Coquetona (1933)" are not in the index.

**Malerba.** `Antonio Maida` [1941,1944] → **1944–45**. Signature "Remembranza (Medina 1944)" → **1943** (1943-02). "Cuando florezcan las rosas (1942)" → **vals, 1943-06**.

**Federico.** `Carlos Vidal` [1943,1945] → **1944–48** (first row 1944-09). Signatures "Percal (Vidal 1943)" and "Tristezas de la calle Corrientes (Vidal 1943)" are not in the index (only 1952 versions with other singers). "Al compás de un tango (Vidal 1944)" is not in the index.

**Others.** Piazzolla `Francisco Fiorentino` [1946,1948] → **1945–46** (16 rows 1945, 8 rows 1946). Cambareri `Alberto Casares` [1952,1957] → **1948–49**. Rotundo `Carlos Roldán` [1949,1950] → 1948–50. Francini–Pontier signature "A los amigos (1946)" → index 1950 (L). Basso `Floreal Ruíz` [1950,1950] → 1956–59.

---

## 2. Machine-readable block (drop-in for `orchestra_profiles.json`)

Shape: `{"<orchestraId>": {"instrumental": {"best":[from,to],"ok":[from,to]} | null, "singers": {"<singer exactly as in songs.json>": {"best":[...],"ok":[...]}}}}`.

Every singer key was checked against `songs.json` (dated rows only). Duos keep the index's own duo strings (for example `C. Dante - J. Martel`), because the index treats them as separate singers.

The block was checked by script against `coverage.json`:
- No `best` year has a heatmap grade below 3 in its mode (singers are checked against `vocal`).
- No `ok` year has a grade below 2.
- The only `best` years the heatmap leaves ungraded are those listed in §1.0 item 5.

Two shape extensions follow from the heatmap:
- `"best": null` means the family has no year graded ≥ 3; it may still have an `ok` band.
- `"best": null, "ok": null` means "outside": the heatmap grades every year of the stint ≤ 1, or 0. Such singers are kept so they get the outside-weight instead of falling back to neutral.

Suggested semantics:
- `best` → ×1.0, or the "preferred" bonus.
- `ok` → ×0.6.
- Outside both, or null → ×0.2.
- A singer not listed → fall back to the instrumental rule, then to the orchestra's heatmap grade.

`ok` is an alternative range: it may lie on either side of `best` and may contain it.

```json
{
  "juan-d-arienzo": {"instrumental": {"best": [1935, 1939], "ok": [1940, 1955]}, "singers": {
    "Walter Cabral": {"best": [1935, 1936], "ok": [1935, 1936]},
    "Enrique Carbel": {"best": [1937, 1937], "ok": [1937, 1937]},
    "Alberto Echagüe": {"best": [1938, 1939], "ok": [1944, 1957]},
    "Alberto Reynal": {"best": [1940, 1941], "ok": [1940, 1942]},
    "Héctor Mauré": {"best": [1941, 1943], "ok": [1940, 1944]},
    "Juan Carlos Lamas": {"best": [1942, 1943], "ok": [1942, 1943]},
    "Armando Laborde": {"best": null, "ok": [1944, 1957]},
    "A. Echagüe - A. Laborde": {"best": null, "ok": [1945, 1949]}}},
  "carlos-di-sarli": {"instrumental": {"best": [1939, 1943], "ok": [1944, 1958]}, "singers": {
    "Roberto Rufino": {"best": [1939, 1943], "ok": [1939, 1943]},
    "Carlos Acuña": {"best": [1941, 1941], "ok": [1941, 1941]},
    "Alberto Podestá": {"best": [1942, 1944], "ok": [1942, 1947]},
    "Jorge Durán": {"best": [1945, 1946], "ok": [1945, 1958]},
    "Oscar Serpa": {"best": null, "ok": [1948, 1955]},
    "Mario Pomar": {"best": null, "ok": [1951, 1955]},
    "Roberto Florio": {"best": null, "ok": [1954, 1958]}}},
  "anibal-troilo": {"instrumental": {"best": [1941, 1944], "ok": [1938, 1940]}, "singers": {
    "Francisco Fiorentino": {"best": [1941, 1944], "ok": [1938, 1944]},
    "F. Fiorentino - A. Marino": {"best": [1943, 1944], "ok": [1943, 1944]},
    "Alberto Marino": {"best": [1943, 1944], "ok": [1943, 1944]},
    "Floreal Ruíz": {"best": [1944, 1944], "ok": [1944, 1944]},
    "A. Marino - F. Ruíz": {"best": [1944, 1944], "ok": [1944, 1944]},
    "Edmundo Rivero": {"best": null, "ok": null},
    "Aldo Calderón": {"best": null, "ok": null},
    "Jorge Casal": {"best": null, "ok": null},
    "Raúl Berón": {"best": null, "ok": null}}},
  "osvaldo-pugliese": {"instrumental": {"best": [1943, 1949], "ok": [1950, 1959]}, "singers": {
    "Roberto Chanel": {"best": [1943, 1946], "ok": [1943, 1946]},
    "Alberto Morán": {"best": [1945, 1946], "ok": [1945, 1946]},
    "Jorge Vidal": {"best": null, "ok": null},
    "Jorge Maciel": {"best": null, "ok": null},
    "Miguel Montero": {"best": null, "ok": null}}},
  "miguel-calo": {"instrumental": {"best": [1943, 1945], "ok": [1941, 1946]}, "singers": {
    "Carlos Dante": {"best": null, "ok": null},
    "Alberto Podestá": {"best": [1941, 1943], "ok": [1941, 1943]},
    "Raúl Berón": {"best": [1942, 1943], "ok": [1942, 1944]},
    "Jorge Ortíz": {"best": [1943, 1943], "ok": [1943, 1943]},
    "Raúl Iriarte": {"best": [1943, 1945], "ok": [1943, 1946]},
    "Roberto Arrieta": {"best": [1945, 1946], "ok": [1945, 1946]}}},
  "ricardo-tanturi": {"instrumental": {"best": [1940, 1941], "ok": [1937, 1944]}, "singers": {
    "Alberto Castillo": {"best": [1941, 1943], "ok": [1941, 1943]},
    "Enrique Campos": {"best": [1943, 1945], "ok": [1943, 1945]},
    "E. Campos - R. Videla": {"best": [1945, 1945], "ok": [1945, 1945]},
    "Roberto Videla": {"best": [1945, 1945], "ok": [1945, 1945]},
    "Osvaldo Ribó": {"best": null, "ok": null},
    "O. Ribó - R. Videla": {"best": null, "ok": null}}},
  "rodolfo-biagi": {"instrumental": {"best": [1938, 1942], "ok": [1943, 1956]}, "singers": {
    "Teófilo Ibáñez": {"best": [1938, 1939], "ok": [1938, 1939]},
    "Andrés Falgás": {"best": [1939, 1940], "ok": [1939, 1940]},
    "Jorge Ortíz": {"best": [1940, 1942], "ok": [1940, 1945]},
    "Alberto Lago": {"best": [1941, 1942], "ok": [1941, 1942]},
    "Carlos Acuña": {"best": [1943, 1944], "ok": [1943, 1944]},
    "Alberto Amor": {"best": [1943, 1946], "ok": [1943, 1947]},
    "Carlos Saavedra": {"best": [1946, 1946], "ok": [1946, 1948]},
    "Hugo Duval": {"best": [1953, 1958], "ok": [1950, 1959]}}},
  "enrique-rodriguez": {"instrumental": {"best": [1940, 1946], "ok": [1938, 1950]}, "singers": {
    "Roberto \"Chato\" Flores": {"best": [1937, 1939], "ok": [1937, 1939]},
    "Armando Moreno": {"best": [1940, 1945], "ok": [1940, 1946]},
    "Ricardo Herrera": {"best": [1946, 1947], "ok": [1946, 1952]},
    "Fernando Reyes": {"best": [1946, 1947], "ok": [1946, 1949]}}},
  "francisco-canaro": {"instrumental": {"best": [1934, 1941], "ok": [1925, 1933]}, "singers": {
    "Charlo": {"best": [1930, 1932], "ok": [1928, 1937]},
    "A. Irusta - E. Famá": {"best": [1933, 1933], "ok": [1933, 1933]},
    "Ernesto Famá": {"best": [1939, 1940], "ok": [1932, 1940]},
    "Roberto Maida": {"best": [1935, 1938], "ok": [1935, 1938]},
    "Francisco Amor": {"best": [1939, 1941], "ok": [1937, 1941]},
    "Eduardo Adrián": {"best": null, "ok": [1942, 1943]},
    "Carlos Roldán": {"best": null, "ok": [1942, 1945]},
    "Guillermo Coral": {"best": null, "ok": [1944, 1946]},
    "Nelly Omar": {"best": null, "ok": [1946, 1947]},
    "Alberto Arenas": {"best": null, "ok": [1945, 1947]}}},
  "osvaldo-fresedo": {"instrumental": {"best": [1932, 1939], "ok": [1940, 1948]}, "singers": {
    "Roberto Ray": {"best": [1933, 1939], "ok": [1932, 1941]},
    "Ricardo Ruíz": {"best": [1939, 1941], "ok": [1939, 1941]},
    "Oscar Serpa": {"best": null, "ok": null},
    "Héctor Pacheco": {"best": null, "ok": null}}},
  "edgardo-donato": {"instrumental": {"best": [1935, 1942], "ok": [1932, 1934]}, "singers": {
    "Félix Gutierrez": {"best": [1932, 1934], "ok": [1932, 1934]},
    "Hugo del Carril": {"best": [1935, 1935], "ok": [1935, 1935]},
    "Horacio Lagos": {"best": [1936, 1941], "ok": [1935, 1942]},
    "Lita Morales": {"best": [1938, 1941], "ok": [1938, 1941]},
    "Lita Morales - H. Lagos": {"best": [1938, 1941], "ok": [1938, 1941]},
    "H. Lagos - L. Morales": {"best": [1938, 1941], "ok": [1938, 1941]},
    "H. Lagos - L. Morales - R. Gavioli": {"best": [1939, 1941], "ok": [1939, 1941]},
    "R. Gavioli - L. Morales": {"best": [1939, 1941], "ok": [1939, 1941]},
    "Romeo Gavioli": {"best": [1939, 1942], "ok": [1939, 1942]},
    "Carlos Almada": {"best": null, "ok": null}}},
  "angel-d-agostino": {"instrumental": null, "singers": {
    "Angel Vargas": {"best": [1940, 1945], "ok": [1940, 1946]},
    "Tino García": {"best": null, "ok": null}}},
  "alfredo-de-angelis": {"instrumental": {"best": [1943, 1949], "ok": null}, "singers": {
    "Floreal Ruíz": {"best": [1943, 1944], "ok": [1943, 1944]},
    "Julio Martel": {"best": [1943, 1947], "ok": [1943, 1949]},
    "Carlos Dante": {"best": [1944, 1949], "ok": [1944, 1949]},
    "C. Dante - J. Martel": {"best": [1944, 1949], "ok": [1944, 1949]},
    "Oscar Larroca": {"best": null, "ok": null},
    "C. Dante - O. Larroca": {"best": null, "ok": null}}},
  "pedro-laurenz": {"instrumental": {"best": [1937, 1944], "ok": [1937, 1947]}, "singers": {
    "Héctor Farrel": {"best": [1937, 1937], "ok": [1937, 1937]},
    "Juan Carlos Casas": {"best": [1938, 1940], "ok": [1938, 1942]},
    "Martín Podestá": {"best": [1941, 1942], "ok": [1941, 1942]},
    "Alberto del Campo": {"best": [1942, 1942], "ok": [1942, 1942]},
    "Alberto Podestá": {"best": [1943, 1944], "ok": [1943, 1944]},
    "Carlos Bermudez": {"best": [1944, 1944], "ok": [1944, 1944]},
    "Jorge Linares": {"best": [1944, 1944], "ok": [1944, 1944]},
    "C. Bermudez - J. Linares": {"best": [1944, 1944], "ok": [1944, 1944]}}},
  "lucio-demare": {"instrumental": null, "singers": {
    "Juan Carlos Miranda": {"best": [1938, 1942], "ok": [1938, 1942]},
    "Roberto Arrieta": {"best": [1942, 1942], "ok": [1942, 1942]},
    "Raúl Berón": {"best": [1943, 1943], "ok": [1943, 1944]},
    "Horacio Quintana": {"best": null, "ok": [1944, 1945]}}},
  "francisco-lomuto": {"instrumental": {"best": [1941, 1946], "ok": [1930, 1940]}, "singers": {
    "Fernando Díaz": {"best": [1932, 1935], "ok": [1931, 1942]},
    "Jorge Omar": {"best": [1936, 1939], "ok": [1935, 1942]},
    "Alberto Rivera": {"best": null, "ok": null}}},
  "roberto-firpo": {"instrumental": {"best": [1935, 1936], "ok": [1927, 1934]}, "singers": {}},
  "orquesta-tipica-victor": {"instrumental": {"best": [1927, 1934], "ok": [1926, 1938]}, "singers": {
    "Carlos Lafuente": {"best": [1930, 1934], "ok": [1930, 1934]},
    "Alberto Gómez": {"best": [1930, 1935], "ok": [1930, 1937]},
    "Lita Morales": {"best": [1937, 1937], "ok": [1937, 1937]},
    "Angel Vargas": {"best": [1938, 1939], "ok": [1938, 1939]}}},
  "alfredo-gobbi": {"instrumental": {"best": [1947, 1952], "ok": [1953, 1958]}, "singers": {
    "Jorge Maciel": {"best": null, "ok": null}}},
  "ricardo-malerba": {"instrumental": null, "singers": {
    "Orlando Medina": {"best": [1942, 1943], "ok": [1941, 1944]},
    "Antonio Maida": {"best": null, "ok": [1944, 1945]}}},
  "domingo-federico": {"instrumental": {"best": [1944, 1949], "ok": [1944, 1954]}, "singers": {
    "Carlos Vidal": {"best": [1944, 1947], "ok": [1944, 1948]},
    "Oscar Larroca": {"best": [1945, 1947], "ok": [1945, 1948]},
    "C. Vidal - O. Larroca": {"best": [1945, 1947], "ok": [1945, 1948]}}},
  "osmar-maderna": {"instrumental": {"best": [1946, 1950], "ok": [1946, 1950]}, "singers": {
    "Orlando Verri": {"best": [1946, 1947], "ok": [1946, 1947]},
    "Pedro Dátila": {"best": [1946, 1950], "ok": [1946, 1950]}}},
  "francini-pontier": {"instrumental": {"best": [1946, 1950], "ok": [1946, 1955]}, "singers": {
    "Alberto Podestá": {"best": [1946, 1947], "ok": [1946, 1950]},
    "Raúl Berón": {"best": [1946, 1948], "ok": [1946, 1949]},
    "Roberto Rufino": {"best": [1947, 1949], "ok": [1947, 1949]},
    "Julio Sosa": {"best": [1949, 1953], "ok": [1949, 1953]}}},
  "florindo-sassone": {"instrumental": {"best": [1951, 1959], "ok": [1948, 1959]}, "singers": {
    "Jorge Casal": {"best": [1947, 1949], "ok": [1947, 1950]},
    "Roberto Chanel": {"best": [1949, 1950], "ok": [1949, 1952]}}},
  "jose-basso": {"instrumental": {"best": [1950, 1956], "ok": [1949, 1959]}, "singers": {
    "Francisco Fiorentino": {"best": [1949, 1949], "ok": [1949, 1949]},
    "Jorge Durán": {"best": [1950, 1953], "ok": [1950, 1953]}}},
  "astor-piazzolla": {"instrumental": {"best": [1946, 1948], "ok": [1946, 1948]}, "singers": {
    "Francisco Fiorentino": {"best": [1945, 1946], "ok": [1945, 1946]},
    "Aldo Campoamor": {"best": [1947, 1947], "ok": [1947, 1947]}}},
  "juan-cambareri": {"instrumental": {"best": [1948, 1950], "ok": [1948, 1950]}, "singers": {
    "Alberto Casares": {"best": [1948, 1949], "ok": [1948, 1949]}}},
  "francisco-rotundo": {"instrumental": null, "singers": {
    "Carlos Roldán": {"best": [1948, 1950], "ok": [1948, 1950]},
    "Floreal Ruíz": {"best": [1949, 1955], "ok": [1948, 1955]},
    "Enrique Campos": {"best": [1951, 1957], "ok": [1951, 1957]},
    "Julio Sosa": {"best": [1953, 1955], "ok": [1953, 1955]}}},
  "juan-sanchez-gorio": {"instrumental": null, "singers": {
    "Luis Mendoza": {"best": [1950, 1956], "ok": [1944, 1957]},
    "L. Mendoza - O. Bazán": {"best": [1950, 1954], "ok": [1950, 1954]}}}
}
```

Proposed overrides. They are not in the block above, because each one breaks the heatmap rule; every one is justified by the corpus (`reference_sets.json`) and by standard milonga practice. Apply them only if the user agrees:

```json
{
  "anibal-troilo": {"singers": {
    "Floreal Ruíz": {"best": [1944, 1947], "rhythm": "vals", "why": "Llorarás llorarás (1945), Romance de barrio and Flor de lino (1947) are fame-5 corpus valses; the corpus has 10 Troilo–Ruiz vals tandas in 1944–47. The heatmap grades Troilo vocal 1945–49 as 1"},
    "Alberto Marino": {"ok": [1943, 1946], "why": "Canción desesperada (1945) and Sin palabras (1946) are danced; the corpus has a canonical Marino tanda for 1944–46"}}},
  "lucio-demare": {"singers": {
    "Horacio Quintana": {"best": [1944, 1945], "why": "Torrente (1944) is fame 5; there are canonical Quintana tandas for 1944–45. The heatmap gives Demare 1944–45 a 2"}}},
  "francisco-canaro": {"singers": {
    "Carlos Roldán": {"best": [1942, 1943], "rhythm": "milonga", "why": "La milonga de mis perros, La rumbita candombe and Se dice de mí: 4 corpus milonga tandas for 1942–43"}}},
  "osvaldo-pugliese": {"singers": {
    "Alberto Morán": {"ok": [1947, 1951], "why": "Sin palabras (1947) and Pasional (1951) are played at peak/late slots"},
    "Jorge Maciel": {"ok": [1955, 1959], "why": "Remembranza (1956, fame 4); there is a canonical tanda for 1955–59"}}},
  "alfredo-de-angelis": {"instrumental": {"ok": [1957, 1958], "singlesOnly": true, "why": "Mi dolor (1957) and Pavadita (1958) are fame 5, but as singles and tanda openers, which matches grade 1 'single tracks only'"}}
}
```

Notes for the implementer:
- `instrumental: null` means "this orchestra has no instrumental family worth a tanda". This applies to Demare, Malerba, D'Agostino, Rotundo and Sánchez Gorio. Café Domínguez (1955) is a single, so it is allowed only as a one-off.
- Singers missing from a map (for example OTV's Carmen del Moral, Biagi's Carlos Heredia, Donato's Roberto Morel) should get the outside-weight, not neutral.
- The rule needs a vitest invariant first (docs/TDD.md). A good invariant: "for each listed family, every tanda the engine forms from it has a mean year inside `best` when ≥ 3 dated best-range sides exist in that rhythm".

---

## 3. The six nights: is each tanda from the family's best years?

Each tanda was checked two ways: against the heatmap grade for its orchestra, year and mode (every side, by script), and against the per-family bands in §2. Every night side was matched against the index, and none is a `yearApprox` row.

**Heatmap check.** All sides are graded ≥ 3 except these:
- seed 3 #16: Firpo, Rodríguez Peña (1937) and Indio sácale el pelo (1938), grade 2.
- seed 193 #15: Troilo–Marino, Canción desesperada (1945), grade 1.
- seed 193 #21: the whole Demare–Quintana tanda (1944–45), grade 2.
- Ungraded: Troilo, Comme il faut (1938, featured #4), and Pugliese–Chanel, Farol (1943, seed 3 #19).

Tandas that are not from the family's best years:

| Night | # | Tanda as built | Heatmap | Verdict | Better choice (all in songs.json, dated) |
|---|---|---|---|---|---|
| seed 3 | 16 | Firpo instr 1935–38 at a **peak** slot (energy 49 vs target 83): Barreras de amor (1936), Rodríguez Peña (1937), La bordadora (1935), Indio sácale el pelo (1938) | 4, 2, 4, 2 | **Not best.** Half the tanda is graded "uneven", all sides are fame 0, and Firpo is warm-up material | Use a peak orchestra: Biagi instr El trece (1938), Unión Cívica (1938), Pura clase (1939), La maleva (1939), all graded 4. If Firpo stays, use 1935–36 only and move it to the warm-up: La bordadora (1935), Barreras de amor (1936). The index has only these two dated 1935–36 Firpo instrumentals, so a full best-years Firpo tanda cannot be built (§4.3) |
| seed 193 | 15 | Troilo / Marino 1943–45: Tal vez será su voz, La luz de un fósforo (1943), Sombras nada más (1944), Canción desesperada (1945) | 4, 4, 4, 1 | **One side outside** | Replace Canción desesperada with Uno (1943), Cristal (1944) or Torrente (1944), all Marino, graded 4 |
| seed 193 | 21 | Demare / Quintana 1944–45: Me quedé mirándola, Solamente ella, Torrente, Igual que un bandoneón | 2 (all) | **Not best per the heatmap.** I disagree: this is Quintana's whole stint, and Torrente is fame 5 (override proposed in §2) | Strict heatmap: Demare / Miranda 1938–42 (Din don 1938, Pa' mí es igual, Mañana zarpa un barco, No te apures Carablanca 1942). Seed 193 does not use Demare–Miranda elsewhere |
| seed 3 | 18 | D'Arienzo instr 1940–44: Canaro en París (1940), El huracán (1944), Independencia (1942), El rey del compás (1941) | 4 | **Not best per the user's brief and the corpus** (1935–39). The heatmap grades 1940–44 as 4 too, so this is a preference, not an error | El flete (1936), Rawson (1936), El internado (1938), El cencerro (1937). Tanda #3 already uses Retintín, La payanca, Comme il faut and Jueves |
| seed 193 | 18 | D'Arienzo instr 1940–42: Canaro en París, La clavada (1940), Independencia (1942), El rey del compás (1941) | 4 | as above | El flete (1936), El internado (1938), El cencerro (1937), La catrera (1938) |
| seed 3, 42, 193 | 2 | OTV / Carmen del Moral valses 1940: El vals del ayer, Isabelita, Cuando no queda esperanza | 3 (the orchestra-level vocal grade) | **Not best at singer level.** A cancionista's record from OTV's last years, all fame 0. The heatmap cannot see the singer | Donato / Horacio Lagos valses Sólo un recuerdo (1936), Con tus besos (1938), Vivo sin sombra, lejos de ti (1938), all graded 4. If it must be OTV: Noches de invierno (Lita Morales 1937), Sin rumbo fijo (Vargas 1938), Sueño de juventud (Gómez 1931), a mixed-singer OTV tanda (M) |
| seed 42 | 13, seed 250 #12 | OTV instr 1937: Clavel del aire, Quinta edición, Libertad, Tu vida es mi vida (all fame 0) | 3 | **Heatmap OK; weak in my view.** The heatmap rates all OTV years 3 and does not prefer 1927–34. Keep only if nothing better fits | OTV / Alberto Gómez: Ventarrón (1933), Quiero papita (1932), El mortero del globito (1933), Desconfianza (1932). Or instrumentals Tierrita (1932), El Marne (1933), Jueves (1934), C.T.V. (1932) (all graded 3) |
| seed 108 | 2 | Lomuto / Fernando Díaz valses 1939–42: La zandunga, Ahora que estamos solos, Isabelita (fame 0) | 4 | **Heatmap OK; outside Díaz's core (1932–35) at singer level** | Mal de ausencia (1932), Plegaria (1933), Esquinas porteñas (1934), Lirio blanco (1934), all graded 4. Or Lomuto / Jorge Omar: Rival (1936), Dime que sí (1938) |
| seed 3 | 0 | Canaro instr 1938–40: Sentimiento gaucho, Tango milonguero, Pimienta (1940), La maleva (1938) | 4 | **In best years** (heatmap 1934–41, which I adopted). Only the side choice is weak: three of the four are from one 1940 session, fame 0–2 | Optional: Charamusca (1934), S.O.S. (1934), Se lo llevaron (1937), La maleva (1938) / Pura parada (1938). For a warm-up opener, Canaro / Maida (Poema 1935, Ciego 1935, Invierno 1937, Condena 1937) is the corpus choice |

Tandas in the family's best years but with weak side choices (optional improvements):

| Night | # | Tanda | Note / better sides |
|---|---|---|---|
| seed 3 | 11 | De Angelis / Dante 1944–45: El tropero del amor, Cuando tú me quieras, No me importa su amor (fame 0) + Para qué te quiero tanto | Melenita de oro (1944), Soy un arlequín (1945), Para qué te quiero tanto (1945), Con alma de tango (1946) |
| seed 42 | 11 | De Angelis / Dante 1945: Sirva otra copa, Cuando tú me quieras, No me importa su amor + Para qué te quiero tanto | same as above |
| seed 3 | 1 | Di Sarli / Durán 1945 | In Durán's best years (1945–46). Note that a 1935–45 night then has Di Sarli without Rufino in the warm-up. Acceptable |
| seed 193 | 22 | Biagi / Alberto Amor 1943–45 (closing) | In Amor's best years. It is outside the Biagi 1938–43 core the user named; Biagi / Ortíz 1940–41 (Todo te nombra, Quiero verte una vez más, Ahora no me conocés, Humillación) is the stronger closer |
| featured, seed 3, 193, 250 | vals 20 | Di Sarli / Rufino valses Alma mía, Rosamel (1940), Cortando camino (1941), Un día llegará (1943) | In the best years. These are the only four Rufino valses in the index, so there is nothing better available (fame 0 reflects corpus rarity, not a wrong era) |
| featured, 3 | 14 | Rodríguez / Moreno valses Uno que ha sido marino, Mantelito blanco (1944) | In the best years; the better-known Isabelita (1940) and Con tu mirar (1941) are in the index |

Every other tanda is from the family's best years and is graded ≥ 3 on the heatmap:
- the 22 tandas of the featured night (#4 Comme il faut 1938 is ungraded on the heatmap), and the rest of seeds 3, 42, 108, 193 and 250;
- among them Canaro–Maida 1935–38, Di Sarli–Rufino 1939–43, D'Arienzo instr 1936–39 and Echagüe 1938–39, Mauré 1941–42, Troilo instr 1941 and Fiorentino 1941–44, Tanturi–Castillo 1941–42, Caló–Berón 1942, Iriarte 1943–45, Caló instr 1943–44, Biagi instr valses 1941, Ibáñez 1938, Falgás 1939–40, Ortíz 1940–43, D'Agostino–Vargas 1941–45, Láurenz–Casas 1938–40 and Podestá 1943–44, Pugliese instr 1944–46, Chanel 1943–45 and Morán 1945, Donato instr 1936–40 and Lagos 1938–40, Rodríguez–Moreno 1940–43 and Chato Flores 1938–39, Malerba–Medina 1942–43, Demare–Miranda 1938–42 and Berón 1943, Lomuto–Omar 1935–38 (except the Troilo–Marino and Demare–Quintana cases above).


---

## 4. Data errors in songs.json for these families

### 4.1 Range dates stored as the lower year (systemic)

Rows with `date` like `"1933/48"`, `"1940/70"` or `"1936/42"` get `year` = the first year and `yearApprox: true`. They are compilations and radio transcriptions. Using the low bound creates impossible pairings. The engine excludes them, but any year statistic, the coverage report or a future rule built on `year` will be wrong. Suggest `year: null` (keep `date`) when the range spans more than 2 years.

- **Troilo, 33 rows `1940/70`** (albums "ANÍBAL TROILO-INÉDITOS SEL.1/2"): Jorge Casal, Edmundo Rivero, Raúl Berón, Angel Cárdenas, Aldo Calderón and Roberto Rufino "in 1940". For example Garúa (Roberto Rufino), Ninguna (Alberto Castillo), Pompas de jabón (Jorge Casal), Malherido (Angel Cárdenas), Me voy cantando bajito (Raúl Berón). None of these singers was with Troilo in 1940.
- **Fresedo, `1933/48` rows**: Ricardo Ruíz in 1933 (Plegaria, Más allá, Después del carnaval, Alas, Tango mío, Viejo farolito, Vida querida, Y no puede ser, Inquietud) and Oscar Serpa in 1933 (Cristal, Fantasma, Adiós pampa mía). Ruiz joined in 1939 and Serpa in 1942. **Niebla del Riachuelo / Roberto Ray** is stored as 1933 but is a 1937 song and recording (written for the 1937 film *La fuga*, H). Because the row is approx, the engine cannot use Fresedo's most famous Ray side.
- **Caló, `1936/42` ("TOMAS RADIALES")**: Al compás del corazón (Raúl Berón, 1936) and Me casé con un sargento (Alberto Podestá, 1936). Berón joined Caló in 1942, and Podestá was 12 years old in 1936.
- **Fresedo**: Después del carnaval (Hugo Marcel) dated `1940/70`.
- **Lomuto**: about 20 instrumentals dated `1941/42` (Nunca más, Amurado, Pura lata, Tocá un tango…). Narrow, but still approx, so Lomuto's instrumental family is invisible to the engine.

### 4.2 Wrong rhythm or credit

| Orchestra | Row | Problem | Conf. |
|---|---|---|---|
| Pedro Láurenz | Arrabal, 1937-09-24, rhythm `milonga` | A tango (José Pascual), recorded instrumental | H |
| Edgardo Donato | Carnaval de mi barrio, 1939-03-23, `tango`, "Lita Morales - H. Lagos" | A vals (the profile's own signature says vals) | M–H |
| Pedro Láurenz | Milonga de mis amores, 1937-07-14, singer Héctor Farrel | The famous 1937 side is usually listed as instrumental with at most a short refrain; needs a listen. The 1944-01 row is instrumental | L |
| Aníbal Troilo | La cumparsita, year 1938, no date, singer Francisco Fiorentino (album "LA CUMPARSITA VOL. 21") | No 1938 Troilo–Fiorentino Cumparsita is known. Troilo's 1938 Odeon sessions are the instrumentals Comme il faut / Tinta verde | M |
| Edgardo Donato | Hola qué tal / El día que me quieras, 1935, singer `Juan Alessio(jorge Ortíz0` | Broken singer string (typo "0" for ")") | H |
| Osvaldo Pugliese | La tupungatina, 1952-06-27, rhythm `other` | The corpus treats it as a tango (fame 4). It is a cueca-derived piece, so check whether it should be danceable | L |
| Osvaldo Pugliese | La yumba, year 1948, no date, plus an undated row | Duplicates of the 1946-08-21 Odeon recording (radio/compilation). Risk of a double play | M |
| Juan D'Arienzo | Barracas al Sud (mil), Ríe payaso, Yo también, 1940, singer Carlos Casares | I cannot confirm a Casares stint with D'Arienzo in 1940 | L |
| Osvaldo Pugliese | El encopao, A barquinazos, 1948, singer Mario Alonso (album "SERIE STENTOR") | Unusual credit; verify | L |
| Lucio Demare | Un tango guapo, Soy muchacho de la guardia, Canción de rango, 1942, Roberto Arrieta | Plausible, but the profile puts Arrieta in 1949–51. One of the two is wrong; the index has exact dates, so it is probably the profile | M |

### 4.3 Missing canonical sides (index gaps that weaken a family)

They matter because the engine then fills the family with fame-0 sides. Compared with the corpus `famousRecordings` (fame ≥ 4):

- **Donato / Lagos**: Alas rotas, De punta a punta, Sinsabor, Sombra gaucha, Te busco, A oscuras, Me voy a baraja, Sinfonía de arrabal, Ella es así; and Félix Gutiérrez's Qué hacés qué hacés.
- **Canaro / Famá 1939**: Tormenta, Abandonada, Algún día te diré, Todo te nombra, La milonga de Buenos Aires. **Canaro / Maida**: El adiós, Desprecio, Reliquias porteñas, Milonga brava, No hay tierra como la mía.
- **D'Agostino / Vargas**: milongas Entre copa y copa, En lo de Laura, Así me gusta a mí; tangos Sólo compasión, El aristócrata, Traiga otra caña; every vals (Qué me pasará, Tristeza criolla, El espejo de tus ojos, Yo tengo una novia). The night engine can never build a D'Agostino–Vargas vals tanda.
- **Fresedo / Ray**: Adiós para siempre, Angustia, Cordobesita, Canto de amor, Dulce amargura, Vuelves; and Ricardo Ruiz's Buscándote. Only 10 dated Ray rows and 1 dated Ruiz row.
- **Tanturi / Castillo**: Noches de Colón. **Rodríguez / Moreno**: Cómo se pianta la vida. **OTV**: Temo (Vargas vals). **Lomuto / Omar**: Damisela encantadora, La melodía de nuestro adiós. **Firpo**: El amanecer, Fuegos artificiales, Alma de bohemio. **Pugliese**: Raza criolla is present only as "El taita (raza criolla)" (1945-01); the corpus title does not match.

### 4.4 Corpus (`reference_sets.json`) issues that leak into the profile

- `famousRecordings` gives "Café Domínguez" (1955) the singer `Ángel Vargas`. It is an instrumental with a recitation, as the index says.
- "Niebla del Riachuelo" is listed as 1933 there too. "Hotel Victoria" (D'Arienzo) appears as 1966 while the profile signature says 1935.
- Singer spellings differ from the index (`Ángel Vargas`, `Jorge Ortiz`, `Floreal Ruiz`, `Roberto Flores`, `Ricardo Ruiz`), so corpus-to-index joins on singer fail for Vargas, Biagi–Ortiz, Troilo–Ruíz and Rodríguez–Flores families.
