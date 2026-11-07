import { normTitle } from "./energy";
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
    tags: ["theme:turkish-classics", "tempo:slow", "mood:lament"],
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
    tags: ["tempo:up", "mood:rock"],
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
    tags: ["theme:turkish-classics", "tempo:up", "mood:playful", "danceable-risk"],
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
    tags: ["theme:turkish-classics", "tempo:slow", "mood:classic"],
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
    tags: ["theme:turkish-classics", "tempo:medium", "mood:warm"],
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
  // the same song under two ids (built-in "Boum!" and the knowledge file's) is one cue: the later entry wins
  const byKey = new Map<string, Cortina>();
  for (const c of m.values()) byKey.set(`${normTitle(c.title)}|${normTitle(c.artist)}`, c);
  return [...byKey.values()];
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
  /** the candidate set when the request fell back to an era-matched pool (pickCortina draws from it) */
  pool?: Cortina[];
  /** why the requested cultures/genres/trend were not used (fewer than 8 distinct cues) */
  fallback?: string;
  /** how many gaps the night has (round 9: a pool of ≥ tandas/2 cues never repeats a cue) */
  tandas?: number;
  /** distinct cues the chosen families hold (round 9: compose serves the hottest gaps first when no cue may repeat) */
  distinct?: number;
}

/** a cue's tempo for the floor: its `tempo:` tag, else read from the energy (≥ 70 up, ≥ 55 medium, else slow) */
export function cortinaTempo(c: Pick<Cortina, "tags" | "energy">): "up" | "medium" | "slow" {
  const tag = c.tags?.find((t) => t.startsWith("tempo:"))?.slice(6);
  if (tag === "up" || tag === "medium" || tag === "slow") return tag;
  return c.energy >= 70 ? "up" : c.energy >= 55 ? "medium" : "slow";
}
/** the cue after a dramatic tanda (Pugliese) must lift the room: an up-tempo cue at e70 or more (round 10) */
export const upbeatCortina = (c: Pick<Cortina, "tags" | "energy">) =>
  c.energy >= 70 && cortinaTempo(c) === "up";
/** the cue before a dramatic tanda sets it up: medium or slow, no hotter than e70 (round 10) */
export const moodyCortina = (c: Pick<Cortina, "tags" | "energy">) =>
  c.energy <= 70 && cortinaTempo(c) !== "up";

/** how many distinct cortinas a night of `tandas` needs: 8 per 4 h (round 8), 4 for a short práctica */
export const distinctCortinasNeeded = (tandas: number) => Math.min(8, Math.max(4, Math.ceil(tandas / 3)));

/** cortinas that sit with the night's era when the requested pool is too small: the eras' own decades, global cultures */
export function eraMatchedCortinas(pool: Cortina[], o: ComposeOptions): Cortina[] {
  const eras = o.eras?.length ? o.eras : ["golden"];
  const span: [number, number] = eras.every((e) => e === "guardia-vieja")
    ? [1900, 1935]
    : eras.every((e) => e === "nuevo" || e === "contemporary")
      ? [1970, 2100]
      : eras.every((e) => e === "post-golden")
        ? [1945, 1975]
        : [1930, 1970];
  const inSpan = pool.filter(
    (c) => c.year !== undefined && c.year >= span[0] && c.year <= span[1] && !c.trend,
  );
  return inSpan.length >= 8 ? inSpan : pool.filter((c) => !c.trend);
}

const describeRequest = (o: ComposeOptions) =>
  [
    o.cortinaCultures?.length && !(o.cortinaCultures.length === 1 && o.cortinaCultures[0] === "global")
      ? o.cortinaCultures.join("+")
      : "",
    o.cortinaGenres?.length ? o.cortinaGenres.join("/") : "",
    o.cortinaTrend === "trend" ? "trend" : o.cortinaTrend === "classic" ? "classic" : "",
  ]
    .filter(Boolean)
    .join(" · ") || "the requested";

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
    // round 10: club cues (Eurovision pop, ska-punk) are not what a classic night plays
    const q = cands.filter((c) => !c.tags?.includes("mood:club"));
    if (q.length >= 3) cands = q;
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
  if (o.cortinaStyle === "none") return { family: null, families: [], constant: null, tandas };
  const cands = candidatesFor(pool, o);
  if (o.cortinaStyle === "constant")
    return {
      family: null,
      families: [],
      constant: rng.weighted(cands, (c) => Math.max(0.05, 1 - Math.abs(c.energy - firstEnergy) / 30)) ?? null,
    };
  const need = distinctCortinasNeeded(tandas);
  // a pool that cannot give the night `need` distinct cues loops two cortinas all night (round 8: Dünya Dönüyor /
  // Roman ×10 each): fall back to an era-matched pool and say so in the plan
  let drawFrom = cands;
  let fallback: string | undefined;
  if (new Set(cands.map((c) => c.id)).size < need) {
    const era = eraMatchedCortinas(pool, o);
    if (era.length >= need) {
      drawFrom = era;
      fallback = `${describeRequest(o)} cortinas: only ${new Set(cands.map((c) => c.id)).size} in the pool, fewer than the ${need} a night of ${tandas} tandas needs; era-matched cortinas used instead`;
    }
  }
  if (o.cortinaStyle === "matched")
    return {
      family: null,
      families: [],
      constant: null,
      pool: fallback ? drawFrom : undefined,
      fallback,
      tandas,
    };
  const fam = new Map<string, number>();
  for (const c of drawFrom) fam.set(familyOf(c), (fam.get(familyOf(c)) ?? 0) + 1);
  const singles = [...fam.entries()].filter(([, n]) => n >= need).map(([k]) => [k]);
  const pairs = COMPATIBLE_FAMILIES.filter(
    ([a, b]) => fam.has(a) && fam.has(b) && (fam.get(a) ?? 0) + (fam.get(b) ?? 0) >= need,
  ).map((p) => [...p]);
  // a single family or a compatible pair: both are nights DJs play, so both are drawn from — among the ones that can
  // give every gap its own cue when any can (round 9: never the same cortina twice), else the largest ones
  const all = [...singles, ...pairs];
  const sizeOf = (fs: string[]) => fs.reduce((a, f) => a + (fam.get(f) ?? 0), 0);
  const gaps = Math.max(1, tandas - 1);
  const full = all.filter((fs) => sizeOf(fs) >= gaps);
  const maxSize = Math.max(0, ...all.map(sizeOf));
  const options = full.length ? full : all.filter((fs) => sizeOf(fs) >= maxSize * 0.8);
  const pick = options.length ? rng.pick(options) : null;
  return {
    family: pick?.[0] ?? null,
    families: pick ?? [],
    constant: null,
    pool: fallback ? drawFrom : undefined,
    fallback,
    tandas,
    distinct: pick ? sizeOf(pick) : new Set(drawFrom.map((c) => c.id)).size,
  };
}

/**
 * Pick a cortina for the gap before a tanda of energy `nextEnergy`: inside the night's family, ~8 points under the
 * tanda, never the same cue within four tandas (never twice at all when the family holds ≥ tandas/2 cues, round 9),
 * least-recently-used first. `used` is insertion-ordered: the caller re-inserts a reused id so the order stays
 * "oldest first". `afterStyle` is the style of the tanda just played: after a dramatic one the cue must be upbeat;
 * `exclude` holds cues reserved for other gaps.
 */
export function pickCortina(
  pool: Cortina[],
  nextEnergy: number,
  o: ComposeOptions,
  rng: Rng,
  used: Set<string>,
  plan: CortinaPlan,
  afterStyle?: string,
  exclude?: Set<string>,
  next?: { rhythm?: string; style?: string },
): Cortina | null {
  if (o.cortinaStyle === "none") return null;
  if (plan.constant) return plan.constant;
  const all000 = plan.pool ?? candidatesFor(pool, o);
  // cues reserved for other gaps (the one after Pugliese) are not this gap's to take
  const all00 =
    exclude?.size && all000.some((c) => !exclude.has(c.id))
      ? all000.filter((c) => !exclude.has(c.id))
      : all000;
  // round 10 — placement: never a slow cue into a vals or milonga; before a dramatic tanda a medium or slow cue
  // no hotter than e70 (Düm Tek Tek before Pugliese is the wrong set-up)
  const tagged = all00.some((c) => c.tags?.some((t) => t.startsWith("tempo:")));
  const placed =
    next?.rhythm === "vals" || next?.rhythm === "milonga"
      ? tagged
        ? all00.filter((c) => cortinaTempo(c) !== "slow")
        : all00
      : next?.style === "dramatic"
        ? all00.filter(moodyCortina)
        : all00;
  const all0 = placed.length >= 2 ? placed : all00;
  const placedOnly = all0 !== all00;
  const inFamily = (xs: Cortina[]) => {
    if (!plan.families.length) return xs;
    const f = xs.filter((c) => plan.families.includes(familyOf(c)));
    return f.length >= 2 ? f : xs;
  };
  const order = [...used];
  // same id within 4 tandas: never; the same cue twice in the night: never while the family (≥ tandas/2 cues) still
  // has fresh ones — the family is never left for the sake of freshness, so a small family cycles least-recently-used
  const usedSet = new Set(order);
  // judged on the whole family, before this gap's placement filters narrow it (round 10)
  const famAll = inFamily(all00);
  // a night on one culture (Turkish, Greek …) is one theme: its whole pool counts as fresh cues
  const oneCulture = !!o.cortinaCultures?.length && !o.cortinaCultures.includes("global");
  const noRepeat =
    plan.tandas !== undefined &&
    famAll.length >= Math.ceil(plan.tandas / 2) &&
    (famAll.some((c) => !usedSet.has(c.id)) || (oneCulture && all00.some((c) => !usedSet.has(c.id))));
  const recent = noRepeat ? usedSet : new Set(order.slice(-3));
  const everyGapFresh = noRepeat && oneCulture && all0.length >= (plan.tandas ?? 0) - 1;
  const rank = (c: Cortina) => {
    const i = order.indexOf(c.id);
    return i === -1 ? -1 : i; // -1 = never used → first choice
  };
  const fitOf = (c: Cortina) => Math.abs(c.energy - (nextEnergy - 8));
  // energy comes before repetition: a cue more than 20 points off the floor is a mismatch whatever its freshness
  // energy fit comes before freshness: the fresh-only pass is tried first, the four-tanda window after it
  const recent4 = new Set(order.slice(-3));
  let fitOnly = false;
  // on one culture the whole pool is drawn before any repeat
  const chain = (all: Cortina[], cands: Cortina[]) => {
    // passes: fresh in the family, fresh anywhere in the culture (one-culture nights), then the four-tanda window
    const passes: Array<[Set<string>, Cortina[], Cortina[]]> = noRepeat
      ? oneCulture
        ? [
            [recent, all, cands],
            [recent, all0, all0],
            [recent4, all, cands],
          ]
        : [
            [recent, all, cands],
            [recent4, all, cands],
          ]
      : [[recent4, all, cands]];
    for (const [rec, a, cs] of passes) {
      let near = cs.filter((c) => fitOf(c) <= 20 && !rec.has(c.id));
      if (!near.length) near = cs.filter((c) => fitOf(c) <= 27 && !rec.has(c.id)); // stay in the family a little off the floor
      // on a global night a used family cue outside the four-tanda window beats a cue from another family; on a
      // one-culture night the next pass (a fresh cue of the culture) comes first (round 10)
      if (!near.length && rec !== recent4 && !oneCulture)
        near = cs.filter((c) => fitOf(c) <= 27 && !recent4.has(c.id));
      if (!near.length) near = a.filter((c) => fitOf(c) <= 20 && !rec.has(c.id)); // rather than mismatch it
      if (!near.length) near = a.filter((c) => fitOf(c) <= 27 && !rec.has(c.id));
      // a family that can give every gap its own cue: a fresh cue a little further off the floor beats a repeat
      if (!near.length && rec === recent && everyGapFresh)
        near = a.filter((c) => fitOf(c) <= 36 && !rec.has(c.id));
      if (near.length) return near;
    }
    // nothing fresh fits: a used cue within the fit (family first, then the pool), then whatever the window allows
    let near = cands.filter((c) => !recent4.has(c.id) && fitOf(c) <= 27);
    if (!near.length) near = all.filter((c) => !recent4.has(c.id) && fitOf(c) <= 27);
    if (!near.length) near = cands.filter((c) => !recent4.has(c.id));
    if (!near.length) near = all.filter((c) => !recent4.has(c.id));
    fitOnly = true;
    return near;
  };
  // pools in priority (round 10): after Pugliese the cue is upbeat whatever the next tanda (the lift beats the fit),
  // then the placement rule (no slow cue into a vals/milonga, a moody one into Pugliese), then the whole pool
  const scopeOf = (xs: Cortina[]) => (noRepeat ? inFamily(xs) : xs);
  // the set-up of a dramatic tanda outranks the lift after one (Gobbi straight into Pugliese)
  const lifted = afterStyle === "dramatic" && next?.style !== "dramatic" ? all00.filter(upbeatCortina) : [];
  const pools: Array<[Cortina[], Cortina[]]> = [];
  if (lifted.length >= 2) {
    const liftedPlaced = all0.filter(upbeatCortina);
    if (liftedPlaced.length >= 2 && placedOnly) pools.push([scopeOf(liftedPlaced), inFamily(liftedPlaced)]);
    pools.push([scopeOf(lifted), inFamily(lifted)]);
  } else {
    if (placedOnly) pools.push([scopeOf(all0), inFamily(all0)]);
    // the set-up of Pugliese is a rule, the slow-cue rule into a vals/milonga a preference the fit may override
    if (next?.style !== "dramatic" || !placedOnly) pools.push([scopeOf(all00), inFamily(all00)]);
  }
  let near: Cortina[] = [];
  let firstTry: Cortina[] = [];
  for (const [scope, cands] of pools) {
    fitOnly = false;
    near = chain(scope, cands);
    if (near.length && !firstTry.length) firstTry = near;
    if (near.length && !fitOnly) break;
  }
  if (!near.length || fitOnly) {
    // nothing fits anywhere: the first pool's own best fit (the lift, when there is one)
    near = firstTry;
    fitOnly = true;
  }
  const all = all0;
  // the same cue twice in a row: never, whatever the pool (a single-cue pool is the constant style, not a loop)
  const lastId = order[order.length - 1];
  if (!near.length) {
    const notLast = all.filter((c) => c.id !== lastId);
    return (
      rng.weighted(notLast.length ? notLast : all, (c) => Math.max(0.05, 1 - fitOf(c) / 28) ** 2) ?? null
    );
  }
  // fresh cues first, the best-fitting third of them (round 9: a fully fresh pool used to be windowed in file order,
  // which spent Dağlar Dağlar on the hottest gap); otherwise the least-recently-used third, weighted by energy fit
  const fresh = near.filter((c) => rank(c) === -1).sort((a, b) => fitOf(a) - fitOf(b));
  const sorted = near.slice().sort((a, b) => rank(a) - rank(b));
  const byFit = near.slice().sort((a, b) => fitOf(a) - fitOf(b));
  const pickFrom = fitOnly
    ? byFit.filter((c) => fitOf(c) <= 27).length
      ? byFit.filter((c) => fitOf(c) <= 27).slice(0, 3)
      : byFit.slice(0, 2)
    : fresh.length
      ? fresh.slice(0, Math.max(3, Math.ceil(fresh.length / 3)))
      : sorted.slice(0, Math.max(3, Math.ceil(sorted.length / 3)));
  return rng.weighted(pickFrom, (c) => Math.max(0.05, 1 - fitOf(c) / 28) ** 2) ?? null;
}
