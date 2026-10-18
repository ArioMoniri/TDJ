/**
 * Corpus-distilled programming rules (docs/research/reference-corpus.md, 31 reference sets / 619 tandas).
 * Numbers are used by the composer; DJ_RULES is the condensed text handed to AI reviewers/refiners.
 */
export const CORPUS_CAPS: Record<string, number> = {
  "osvaldo-pugliese": 1,
  "juan-d-arienzo": 3,
  "carlos-di-sarli": 2,
  "anibal-troilo": 2,
  "alfredo-gobbi": 1,
  "astor-piazzolla": 0,
};
export const DEFAULT_CAP = 2;
/** orchestras that open reference sets (never Pugliese, never vals/milonga) */
export const OPENERS: Record<string, number> = {
  "francisco-canaro": 2.2,
  "carlos-di-sarli": 1.8,
  "enrique-rodriguez": 1.6,
  "ricardo-tanturi": 1.6,
  "lucio-demare": 1.4,
  "osvaldo-fresedo": 1.5,
  "angel-d-agostino": 1.3,
  "miguel-calo": 1.3,
  "francisco-lomuto": 1.2,
  "orquesta-tipica-victor": 1.1,
};
export const NEVER_OPEN = new Set([
  "osvaldo-pugliese",
  "rodolfo-biagi",
  "alfredo-gobbi",
  "astor-piazzolla",
  "color-tango",
]);
/** median relative position of each orchestra in reference sets (0 = first tanda, 1 = last) */
export const PLACEMENT_MEDIAN: Record<string, number> = {
  "francisco-canaro": 0.26,
  "francisco-lomuto": 0.25,
  "osvaldo-fresedo": 0.59,
  "alfredo-de-angelis": 0.65,
  "osvaldo-pugliese": 0.87,
  "carlos-di-sarli": 0.5,
  "juan-d-arienzo": 0.45,
  "anibal-troilo": 0.53,
  "miguel-calo": 0.42,
  "ricardo-tanturi": 0.4,
  "edgardo-donato": 0.45,
  "enrique-rodriguez": 0.38,
  "orquesta-tipica-victor": 0.4,
  "rodolfo-biagi": 0.6,
  "pedro-laurenz": 0.5,
  "angel-d-agostino": 0.55,
  "lucio-demare": 0.3,
};
/** vals and milonga banks: how often each orchestra carries those tandas in the corpus (relative weights) */
export const VALS_BANK: Record<string, number> = {
  "rodolfo-biagi": 13,
  "juan-d-arienzo": 9,
  "alfredo-de-angelis": 8,
  "anibal-troilo": 8,
  "orquesta-tipica-victor": 8,
  "miguel-calo": 7,
  "enrique-rodriguez": 5,
  "pedro-laurenz": 5,
  "edgardo-donato": 3,
  "ricardo-tanturi": 3,
  "francisco-lomuto": 3,
  "francisco-canaro": 3,
  "angel-d-agostino": 3,
  "carlos-di-sarli": 2,
};
export const MILONGA_BANK: Record<string, number> = {
  "edgardo-donato": 11,
  "francisco-canaro": 11,
  "juan-d-arienzo": 10,
  "carlos-di-sarli": 9,
  "angel-d-agostino": 4,
  "miguel-calo": 2,
  "anibal-troilo": 1.5,
  "rodolfo-biagi": 1.5,
  "pedro-laurenz": 1.5,
  "francisco-lomuto": 1,
  "ricardo-tanturi": 1.5,
  "enrique-rodriguez": 1.5,
};

export const DJ_RULES = `Programming rules distilled from 31 reference milonga sets (619 tandas) and expert reviews:
1. Tango tandas are 4 tracks; vals and milonga tandas are 3. Cycle TTVTTM (≈15 tango : 3 vals : 3 milonga per 4 h). Vals and milonga tandas are never adjacent. First tanda is always tango.
2. One orchestra per tanda; one singer (or all instrumental); year spread ≤3 ideally, ≤6 max. Mixed tandas only for milonga/vals from 1938–43 singles.
3. Vocal:instrumental ≈ 68:32 for tango tandas. Orchestras played mostly instrumental: D'Arienzo 1935–39, Pugliese, Di Sarli 1950s.
4. ~15 distinct orchestras per 4 h (10–21). Same orchestra returns after a median gap of 8 tandas; a gap ≤2 is only acceptable for a standalone La Cumparsita by the same orchestra.
5. D'Arienzo: 2–3 tango tandas per 4 h plus a vals or milonga; the first D'Arienzo arrives early (median 19 %, before 35 %) and is instrumental 1935–39; Echagüe 1938–39 mid-night; Mauré 1940–44 late.
6. Pugliese: exactly once, late (median position 0.87, never before 50 %); 1940s instrumentals can go earlier than 1955–59. Often the final tanda before La Cumparsita.
7. Di Sarli: 1–2 tandas; Rufino 1939–41 early/mid, instrumentals 1951–58 late as the elegant reset. Troilo: Fiorentino 1941–43 or instrumentals 1941 mid-set; Marino rarely.
8. Openers: Canaro (Famá/Maida 1935–39), Di Sarli instrumental, Rodríguez–Moreno, Tanturi instrumental, Demare–Miranda, Fresedo–Ray, D'Agostino. Never Pugliese, never Biagi, never vals/milonga.
9. Canaro and Lomuto live in the first third; De Angelis and Fresedo in the second half; Caló, Tanturi, Donato, Rodríguez, OTV anywhere.
10. Última tanda: known high-emotion material (Pugliese, D'Arienzo, D'Agostino–Vargas, Di Sarli, De Angelis), then La Cumparsita (D'Arienzo 1951, Troilo 1963, D'Arienzo 1937/1955, D'Agostino–Vargas 1945, Biagi–Ortiz 1942, Di Sarli 1955). No cortina after the Cumparsita.
11. Vals bank: Biagi, D'Arienzo, De Angelis (Dante–Martel), Troilo–Ruiz, OTV, Caló, Rodríguez, Laurenz. Milonga bank: Donato, Canaro, D'Arienzo, Di Sarli–Rufino, D'Agostino–Vargas, Caló–Berón.
12. Singer canon: D'Arienzo instr > Mauré > Echagüe; Di Sarli Rufino > instr > Podestá > Durán; Troilo Fiorentino ≈ instr > Ruiz (vals); Caló Berón > Iriarte > Podestá/Ortiz; Tanturi Castillo > instr > Campos; Biagi instr ≈ Ortiz > Amor > Ibáñez (vals) > Falgás; single-singer orchestras: Rodríguez–Moreno, Donato–Lagos, D'Agostino–Vargas, Fresedo–Ray, Demare–Miranda, Lomuto–Omar, Malerba–Medina, Laurenz Podestá/Casas, Canaro Maida > Famá, De Angelis Dante–Martel.
13. Inside a tanda: open with a known, inviting track, build, strongest third, settle or finish strong (hammock in Buenos Aires). Never a dirge in slot 2.
14. Cortinas: 30–60 s of clearly non-tango music, one family per night (swing, Italian 60s, chanson, Turkish pop…), each tuned slightly below the energy of the next tanda; never a song the room will dance to.
15. Energy arc: warm-up → build → first peak ≈45 % → breather → higher peak ≈80 % → cool-down → emotional última → Cumparsita. Gradual steps only; no two dramatic tandas back to back; after Pugliese a sophisticated vals or Di Sarli, not Lomuto.
16. Never: Piazzolla, concert pieces (Responso, Danzarín, A fuego lento, Zum…), medleys/selecciones, Gardel with guitars, electrotango in a traditional set; at most one Guardia Vieja tanda, in the first 40 %; at most one "colour" tanda (foxtrot, Hugo Díaz, Pirincho).
17. Context: heat and humidity lower stamina (cap peaks, fewer milongas, longer cortinas); late night deepens (more vocal, more Pugliese/Troilo tolerated); beginners need clear beat (D'Arienzo, Rodríguez, Tanturi, Canaro) and no rubato; prácticas use 3-track tandas.`;
