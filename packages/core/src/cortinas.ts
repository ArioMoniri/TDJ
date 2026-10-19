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
  // swing and crooner standards every milonga has heard as cortinas
  {
    id: "c-sw-chattanooga",
    title: "Chattanooga Choo Choo",
    artist: "Glenn Miller",
    genre: "swing",
    culture: "global",
    energy: 72,
    year: 1941,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-sw-beguine",
    title: "Begin the Beguine",
    artist: "Artie Shaw",
    genre: "swing",
    culture: "global",
    energy: 60,
    year: 1938,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-sw-tuxedo",
    title: "Tuxedo Junction",
    artist: "Glenn Miller",
    genre: "swing",
    culture: "global",
    energy: 58,
    year: 1940,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-sw-savoy",
    title: "Stompin' at the Savoy",
    artist: "Benny Goodman",
    genre: "swing",
    culture: "global",
    energy: 68,
    year: 1936,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-sw-cheek",
    title: "Cheek to Cheek",
    artist: "Fred Astaire",
    genre: "swing",
    culture: "global",
    energy: 54,
    year: 1935,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-cr-mack",
    title: "Mack the Knife",
    artist: "Bobby Darin",
    genre: "crooner",
    culture: "global",
    energy: 70,
    year: 1959,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-cr-sway",
    title: "Sway",
    artist: "Dean Martin",
    genre: "crooner",
    culture: "global",
    energy: 62,
    year: 1954,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-cr-beyond",
    title: "Beyond the Sea",
    artist: "Bobby Darin",
    genre: "crooner",
    culture: "global",
    energy: 64,
    year: 1959,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-cr-love",
    title: "L-O-V-E",
    artist: "Nat King Cole",
    genre: "crooner",
    culture: "global",
    energy: 56,
    year: 1965,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-cr-moon",
    title: "Moon River",
    artist: "Andy Williams",
    genre: "crooner",
    culture: "global",
    energy: 40,
    year: 1962,
    startSec: 0,
    lengthSec: 45,
  },
  // pre-1936 jazz sides: the only cortinas that sit with a Guardia Vieja night
  {
    id: "c-30s-mood-indigo",
    title: "Mood Indigo",
    artist: "Duke Ellington",
    genre: "jazz",
    culture: "global",
    energy: 40,
    year: 1930,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-30s-minnie",
    title: "Minnie the Moocher",
    artist: "Cab Calloway",
    genre: "jazz",
    culture: "global",
    energy: 62,
    year: 1931,
    startSec: 0,
    lengthSec: 45,
  },
  {
    id: "c-30s-dont-mean",
    title: "It Don't Mean a Thing",
    artist: "Duke Ellington",
    genre: "jazz",
    culture: "global",
    energy: 70,
    year: 1932,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-30s-puttin",
    title: "Puttin' On the Ritz",
    artist: "Harry Richman",
    genre: "jazz",
    culture: "global",
    energy: 66,
    year: 1930,
    startSec: 0,
    lengthSec: 40,
  },
  {
    id: "c-30s-dream",
    title: "Dream a Little Dream of Me",
    artist: "Ozzie Nelson",
    genre: "jazz",
    culture: "global",
    energy: 36,
    year: 1931,
    startSec: 0,
    lengthSec: 45,
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

/** families a DJ pairs inside one night (swing + jazz standards, canzone + chanson …) */
export const COMPATIBLE_FAMILIES: Array<[string, string]> = [
  ["swing", "jazz"],
  ["swing", "crooner"],
  ["jazz", "crooner"],
  ["canzone", "chanson"],
  ["canzone", "ye-ye"],
  ["chanson", "ye-ye"],
  ["soul", "funk"],
  ["soul", "crooner"],
  ["turkish-pop", "turkish-rock"],
  ["turkish-pop", "anadolu-rock"],
  ["turkish-rock", "anadolu-rock"],
  ["laiko", "rebetiko"],
  ["laiko", "greek-song"],
  ["kpop", "pop"],
  ["afrobeats", "pop"],
  ["balkan-brass", "balkan-pop"],
  ["persian-pop", "persian-classic"],
  ["rock", "rock-nacional"],
  ["synth", "80s"],
];

export interface CortinaPlan {
  /** one or two families the night draws from (null = the whole selection) */
  family: string | null;
  families: string[];
  constant: Cortina | null;
}

/** a Guardia Vieja night gets pre-1936 cortinas only (when the pool has them) */
const eraFiltered = (cands: Cortina[], o: ComposeOptions) => {
  if (!o.eras?.length || !o.eras.every((e) => e === "guardia-vieja")) return cands;
  const old = cands.filter((c) => (c.year ?? 9999) <= 1935);
  return old.length >= 2 ? old : cands;
};

export function candidatesFor(pool: Cortina[], o: ComposeOptions): Cortina[] {
  const cultures = new Set(o.cortinaCultures?.length ? o.cortinaCultures : ["global"]);
  const genres = o.cortinaGenres?.length ? new Set(o.cortinaGenres) : null;
  // cultures the DJ chose are a hard filter whenever the pool can serve them
  const byCulture = pool.filter((c) => cultures.has(c.culture) || cultures.has("any"));
  let cands = byCulture.length >= 3 ? byCulture : pool;
  if (genres) {
    const g = cands.filter((c) => genres.has(c.genre));
    if (g.length >= 3) cands = g;
  }
  if (o.cortinaTrend === "trend") {
    const t = cands.filter((c) => c.trend);
    if (t.length >= 3) cands = t;
  }
  if (o.cortinaTrend === "classic") {
    const t = cands.filter((c) => !c.trend);
    if (t.length >= 3) cands = t;
  }
  return eraFiltered(cands.length ? cands : pool, o);
}

/**
 * Choose the night's cortina family: the largest family (or a compatible pair) that can carry `tandas` gaps
 * without a cue returning inside four tandas; randomised among the ones that qualify.
 */
export function planCortinas(
  pool: Cortina[],
  o: ComposeOptions,
  rng: Rng,
  firstEnergy: number,
  tandas = 22,
): CortinaPlan {
  if (o.cortinaStyle === "none") return { family: null, families: [], constant: null };
  const cands = candidatesFor(pool, o);
  if (o.cortinaStyle === "constant")
    return {
      family: null,
      families: [],
      constant: rng.weighted(cands, (c) => Math.max(0.05, 1 - Math.abs(c.energy - firstEnergy) / 30)) ?? null,
    };
  if (o.cortinaStyle === "matched") return { family: null, families: [], constant: null };
  const fam = new Map<string, number>();
  for (const c of cands) fam.set(familyOf(c), (fam.get(familyOf(c)) ?? 0) + 1);
  const need = Math.max(4, Math.ceil(tandas / 4));
  const singles = [...fam.entries()].filter(([, n]) => n >= need).map(([k]) => [k]);
  const pairs = COMPATIBLE_FAMILIES.filter(
    ([a, b]) => fam.has(a) && fam.has(b) && (fam.get(a) ?? 0) + (fam.get(b) ?? 0) >= need,
  ).map((p) => [...p]);
  // a single family or a compatible pair: both are nights DJs play, so both are drawn from
  const options = [...singles, ...pairs];
  const pick = options.length ? rng.pick(options) : null;
  return { family: pick?.[0] ?? null, families: pick ?? [], constant: null };
}

/**
 * Pick a cortina for the gap before a tanda of energy `nextEnergy`: inside the night's family, ~8 points under the
 * tanda, never the same cue within four tandas, least-recently-used first. `used` is insertion-ordered: the caller
 * re-inserts a reused id so the order stays "oldest first".
 */
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
  const all = candidatesFor(pool, o);
  let cands = all;
  if (plan.families.length) {
    const f = all.filter((c) => plan.families.includes(familyOf(c)));
    if (f.length >= 3) cands = f;
  }
  const order = [...used];
  const recent = new Set(order.slice(-3)); // same id within 4 tandas: never
  const rank = (c: Cortina) => {
    const i = order.indexOf(c.id);
    return i === -1 ? -1 : i; // -1 = never used → first choice
  };
  const fitOf = (c: Cortina) => Math.abs(c.energy - (nextEnergy - 8));
  // energy comes before repetition: a cue more than 20 points off the floor is a mismatch whatever its freshness
  let near = cands.filter((c) => fitOf(c) <= 20 && !recent.has(c.id));
  if (!near.length) near = cands.filter((c) => fitOf(c) <= 28 && !recent.has(c.id)); // stay in the family a little off the floor
  if (!near.length) near = all.filter((c) => fitOf(c) <= 20 && !recent.has(c.id)); // rather than mismatch it
  if (!near.length) near = all.filter((c) => fitOf(c) <= 28 && !recent.has(c.id));
  if (!near.length) near = cands.filter((c) => !recent.has(c.id));
  if (!near.length) near = all.filter((c) => !recent.has(c.id));
  if (!near.length) return rng.weighted(all, (c) => Math.max(0.05, 1 - fitOf(c) / 28) ** 2) ?? null;
  // least-recently-used window: the oldest third of the viable cues (fresh ones first), weighted by energy fit
  const sorted = near.slice().sort((a, b) => rank(a) - rank(b));
  const window = sorted.slice(0, Math.max(3, Math.ceil(sorted.length / 3)));
  const fresh = window.filter((c) => rank(c) === -1);
  const pickFrom = fresh.length ? fresh : window;
  return rng.weighted(pickFrom, (c) => Math.max(0.05, 1 - fitOf(c) / 28) ** 2) ?? null;
}
