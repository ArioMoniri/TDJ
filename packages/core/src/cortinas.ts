import type { ComposeOptions, Cortina, Rng } from "./index";

/**
 * Built-in cortina library (curated after the DJ review: no boleros, no "Zorba", no mambo that a Latin room will dance to).
 * Energy 0..100 = how it lands on a milonga floor between tandas. `data/knowledge/cortinas.json` adds cultures/trends.
 */
export const BUILTIN_CORTINAS: Cortina[] = [
  {
    id: "c-sing-sing",
    title: "Sing, Sing, Sing",
    artist: "Benny Goodman",
    genre: "swing",
    culture: "global",
    energy: 82,
    year: 1937,
    startSec: 0,
    lengthSec: 40,
    tags: ["intro-only"],
  },
  {
    id: "c-in-the-mood",
    title: "In the Mood",
    artist: "Glenn Miller",
    genre: "swing",
    culture: "global",
    energy: 74,
    year: 1939,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-take-five",
    title: "Take Five",
    artist: "Dave Brubeck Quartet",
    genre: "jazz",
    culture: "global",
    energy: 52,
    year: 1959,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-fly-me",
    title: "Fly Me to the Moon",
    artist: "Frank Sinatra",
    genre: "crooner",
    culture: "global",
    energy: 48,
    year: 1964,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-feeling-good",
    title: "Feeling Good",
    artist: "Nina Simone",
    genre: "soul",
    culture: "global",
    energy: 58,
    year: 1965,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-superstition",
    title: "Superstition",
    artist: "Stevie Wonder",
    genre: "funk",
    culture: "global",
    energy: 84,
    year: 1972,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-la-vie",
    title: "La Vie en rose",
    artist: "Édith Piaf",
    genre: "chanson",
    culture: "french",
    language: "fr",
    energy: 38,
    year: 1947,
    startSec: 0,
    lengthSec: 45,
    tags: ["once-a-night"],
  },
  {
    id: "c-boum",
    title: "Boum!",
    artist: "Charles Trenet",
    genre: "chanson",
    culture: "french",
    language: "fr",
    energy: 66,
    year: 1938,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-volare",
    title: "Nel blu dipinto di blu (Volare)",
    artist: "Domenico Modugno",
    genre: "canzone",
    culture: "italian",
    language: "it",
    energy: 62,
    year: 1958,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-tu-vuo",
    title: "Tu vuò fà l'americano",
    artist: "Renato Carosone",
    genre: "canzone",
    culture: "italian",
    language: "it",
    energy: 76,
    year: 1956,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-mas-que",
    title: "Mas que Nada",
    artist: "Sérgio Mendes & Brasil '66",
    genre: "bossa",
    culture: "brazilian",
    language: "pt",
    energy: 70,
    year: 1966,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-garota",
    title: "Garota de Ipanema",
    artist: "Stan Getz & João Gilberto",
    genre: "bossa",
    culture: "brazilian",
    language: "pt",
    energy: 42,
    year: 1964,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-misirlou",
    title: "Misirlou",
    artist: "Dick Dale",
    genre: "surf-rock",
    culture: "global",
    energy: 90,
    year: 1962,
    startSec: 0,
    lengthSec: 35,
  },
  {
    id: "c-twist",
    title: "Twist and Shout",
    artist: "The Beatles",
    genre: "rock",
    culture: "global",
    energy: 86,
    year: 1963,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-walk-on",
    title: "Walk on the Wild Side",
    artist: "Lou Reed",
    genre: "rock",
    culture: "global",
    energy: 46,
    year: 1972,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-blue-monday",
    title: "Blue Monday",
    artist: "New Order",
    genre: "synth",
    culture: "global",
    energy: 72,
    year: 1983,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-take-on-me",
    title: "Take On Me",
    artist: "a-ha",
    genre: "80s",
    culture: "global",
    energy: 80,
    year: 1985,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-tamally",
    title: "Tamally Maak",
    artist: "Amr Diab",
    genre: "arabic-pop",
    culture: "arabic",
    language: "ar",
    energy: 56,
    year: 2000,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-aicha",
    title: "Aïcha",
    artist: "Khaled",
    genre: "rai",
    culture: "arabic",
    language: "ar",
    energy: 60,
    year: 1996,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-cumbia-2",
    title: "Cumbia Sobre el Río",
    artist: "Celso Piña",
    genre: "cumbia",
    culture: "latin",
    language: "es",
    energy: 70,
    year: 2001,
    startSec: 0,
    lengthSec: 45,
    tags: ["danceable-risk"],
  },
  // Turkish
  {
    id: "c-tr-1",
    title: "Ah Bu Şarkıların Gözü Kör Olsun",
    artist: "Sezen Aksu",
    genre: "turkish-pop",
    culture: "turkish",
    language: "tr",
    energy: 50,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-tr-2",
    title: "Cambaz",
    artist: "Mor ve Ötesi",
    genre: "turkish-rock",
    culture: "turkish",
    language: "tr",
    energy: 72,
    year: 2004,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-tr-3",
    title: "Şımarık",
    artist: "Tarkan",
    genre: "turkish-pop",
    culture: "turkish",
    language: "tr",
    energy: 84,
    year: 1997,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-tr-4",
    title: "Üsküdar'a Gider İken",
    artist: "Safiye Ayla",
    genre: "turkish-classic",
    culture: "turkish",
    language: "tr",
    energy: 40,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-tr-5",
    title: "Dünya Dönüyor",
    artist: "Mabel Matiz",
    genre: "turkish-pop",
    culture: "turkish",
    language: "tr",
    energy: 62,
    year: 2021,
    trend: true,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-tr-6",
    title: "Gülpembe",
    artist: "Barış Manço",
    genre: "anatolian-rock",
    culture: "turkish",
    language: "tr",
    energy: 58,
    year: 1985,
    startSec: 0,
    lengthSec: 45,
  },
  // Greek
  {
    id: "c-gr-3",
    title: "Frangosyriani",
    artist: "Markos Vamvakaris",
    genre: "rebetiko",
    culture: "greek",
    language: "el",
    energy: 52,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-gr-4",
    title: "Sto Perigiali to Kryfo",
    artist: "Mikis Theodorakis",
    genre: "greek-song",
    culture: "greek",
    language: "el",
    energy: 46,
    startSec: 0,
    lengthSec: 45,
  },
  // Persian
  {
    id: "c-ir-1",
    title: "Gole Sangam",
    artist: "Hayedeh",
    genre: "persian-classic",
    culture: "persian",
    language: "fa",
    energy: 38,
    startSec: 0,
    lengthSec: 45,
    tags: ["late-night"],
  },
  {
    id: "c-ir-2",
    title: "Jan-e Maryam",
    artist: "Mohammad Nouri",
    genre: "persian-pop",
    culture: "persian",
    language: "fa",
    energy: 60,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-ir-3",
    title: "Man Amadeh-am",
    artist: "Googoosh",
    genre: "persian-pop",
    culture: "persian",
    language: "fa",
    energy: 64,
    startSec: 0,
    lengthSec: 45,
  },
  // Balkan
  {
    id: "c-bk-1",
    title: "Mesečina",
    artist: "Goran Bregović",
    genre: "balkan-brass",
    culture: "balkan",
    energy: 88,
    year: 1995,
    startSec: 0,
    lengthSec: 40,
    tags: ["danceable-risk"],
  },
  {
    id: "c-bk-2",
    title: "Ederlezi",
    artist: "Goran Bregović",
    genre: "balkan",
    culture: "balkan",
    energy: 34,
    year: 1988,
    startSec: 0,
    lengthSec: 45,
    tags: ["late-night"],
  },
  // K-pop / Afrobeats / recent trends
  {
    id: "c-kp-1",
    title: "Dynamite",
    artist: "BTS",
    genre: "kpop",
    culture: "kpop",
    language: "ko",
    energy: 82,
    year: 2020,
    trend: true,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-kp-2",
    title: "Supernova",
    artist: "aespa",
    genre: "kpop",
    culture: "kpop",
    language: "ko",
    energy: 86,
    year: 2024,
    trend: true,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-kp-3",
    title: "Super Shy",
    artist: "NewJeans",
    genre: "kpop",
    culture: "kpop",
    language: "ko",
    energy: 70,
    year: 2023,
    trend: true,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-af-1",
    title: "Essence",
    artist: "WizKid ft. Tems",
    genre: "afrobeats",
    culture: "afrobeats",
    energy: 60,
    year: 2020,
    trend: true,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-af-2",
    title: "Calm Down",
    artist: "Rema",
    genre: "afrobeats",
    culture: "afrobeats",
    energy: 64,
    year: 2022,
    trend: true,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-af-3",
    title: "Last Last",
    artist: "Burna Boy",
    genre: "afrobeats",
    culture: "afrobeats",
    energy: 66,
    year: 2022,
    trend: true,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-tr-2024",
    title: "Espresso",
    artist: "Sabrina Carpenter",
    genre: "pop",
    culture: "global",
    energy: 70,
    year: 2024,
    trend: true,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-tr-2025b",
    title: "APT.",
    artist: "ROSÉ & Bruno Mars",
    genre: "pop",
    culture: "kpop",
    energy: 84,
    year: 2024,
    trend: true,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-lofi-2",
    title: "Aruarian Dance",
    artist: "Nujabes",
    genre: "lo-fi",
    culture: "global",
    energy: 36,
    year: 2005,
    startSec: 0,
    lengthSec: 45,
    tags: ["late-night"],
  },
];

export function cortinaPool(extra: Cortina[] = [], overrides?: Record<string, Cortina | null>): Cortina[] {
  const m = new Map<string, Cortina>();
  for (const c of BUILTIN_CORTINAS) m.set(c.id, c);
  for (const c of extra) m.set(c.id, c);
  for (const [id, c] of Object.entries(overrides ?? {})) {
    if (c) m.set(id, c);
    else m.delete(id);
  }
  return [...m.values()];
}

/** The family key a cortina belongs to for "one family per night" programming. */
export const familyOf = (c: Cortina) => c.tags?.find((t) => t.startsWith("theme:"))?.slice(6) ?? c.genre;

export interface CortinaPlan {
  family: string | null;
  constant: Cortina | null;
}

function candidatesFor(pool: Cortina[], o: ComposeOptions): Cortina[] {
  const cultures = new Set(o.cortinaCultures?.length ? o.cortinaCultures : ["global"]);
  const genres = o.cortinaGenres?.length ? new Set(o.cortinaGenres) : null;
  let cands = pool.filter((c) => cultures.has(c.culture) || cultures.has("any"));
  if (genres) {
    const g = cands.filter((c) => genres.has(c.genre));
    if (g.length >= 4) cands = g;
  }
  if (o.cortinaTrend === "trend") {
    const t = cands.filter((c) => c.trend);
    if (t.length >= 3) cands = t;
  }
  if (o.cortinaTrend === "classic") {
    const t = cands.filter((c) => !c.trend);
    if (t.length >= 3) cands = t;
  }
  return cands.length ? cands : pool;
}

/** Choose the night's cortina family (largest family within the chosen cultures, randomised among the big ones). */
export function planCortinas(pool: Cortina[], o: ComposeOptions, rng: Rng, firstEnergy: number): CortinaPlan {
  if (o.cortinaStyle === "none") return { family: null, constant: null };
  const cands = candidatesFor(pool, o);
  if (o.cortinaStyle === "constant")
    return {
      family: null,
      constant: rng.weighted(cands, (c) => Math.max(0.05, 1 - Math.abs(c.energy - firstEnergy) / 30)) ?? null,
    };
  if (o.cortinaStyle === "matched") return { family: null, constant: null };
  const fam = new Map<string, number>();
  for (const c of cands) fam.set(familyOf(c), (fam.get(familyOf(c)) ?? 0) + 1);
  const big = [...fam.entries()].filter(([, n]) => n >= 8).map(([k]) => k); // a family must carry a whole night without repeats
  return { family: big.length ? (rng.pick(big) ?? null) : null, constant: null };
}

/** Pick a cortina for the gap before a tanda of energy `nextEnergy` (cortina sits ~8 points below it, inside the night's family when possible). */
export function pickCortina(
  pool: Cortina[],
  nextEnergy: number,
  o: ComposeOptions,
  rng: Rng,
  used: Set<string>,
  plan: CortinaPlan,
): Cortina | null {
  if (o.cortinaStyle === "none") return null;
  if (plan.constant) return plan.constant;
  let cands = candidatesFor(pool, o);
  const all = cands;
  if (plan.family) {
    const f = cands.filter((c) => familyOf(c) === plan.family);
    if (f.length >= 3) cands = f;
  }
  // never repeat a cortina while any unused one exists: family first, then the whole selection
  let fresh = cands.filter((c) => !used.has(c.id));
  if (!fresh.length) fresh = all.filter((c) => !used.has(c.id));
  if (fresh.length) cands = fresh;
  const near = cands.filter((c) => Math.abs(c.energy - nextEnergy) <= 25);
  if (near.length) cands = near;
  return (
    rng.weighted(cands, (c) => {
      const d = Math.abs(c.energy - (nextEnergy - 8));
      return Math.max(0.05, 1 - d / 28) ** 2;
    }) ?? null
  );
}
