import type { Era, OrchestraProfile, Song } from "./types";

/** Known-track energy overrides (0..100 absolute) — famous recordings whose intensity dancers know by heart. */
export const TRACK_ENERGY: Record<string, number> = {
  "la cumparsita|juan-d-arienzo": 92,
  "la cumparsita|osvaldo-pugliese": 80,
  "la cumparsita|carlos-di-sarli": 66,
  "el flete|juan-d-arienzo": 90,
  "hotel victoria|juan-d-arienzo": 88,
  "nueve de julio|juan-d-arienzo": 90,
  "don juan|juan-d-arienzo": 85,
  "pensalo bien|juan-d-arienzo": 84,
  "la bruja|juan-d-arienzo": 86,
  "paciencia|juan-d-arienzo": 78,
  "el choclo|juan-d-arienzo": 88,
  "gallo ciego|osvaldo-pugliese": 84,
  "la yumba|osvaldo-pugliese": 84,
  "negracha|osvaldo-pugliese": 86,
  "malandraca|osvaldo-pugliese": 86,
  "recuerdo|osvaldo-pugliese": 72,
  "la mariposa|osvaldo-pugliese": 70,
  "bahia blanca|carlos-di-sarli": 60,
  "a la gran muneca|carlos-di-sarli": 64,
  "el amanecer|carlos-di-sarli": 58,
  "milonguero viejo|carlos-di-sarli": 62,
  "don juan|carlos-di-sarli": 66,
  "quejas de bandoneon|anibal-troilo": 72,
  "toda mi vida|anibal-troilo": 56,
  "cachirulo|anibal-troilo": 74,
  "sans souci|miguel-calo": 60,
  "que te importa que te llore|miguel-calo": 58,
  "racing club|rodolfo-biagi": 88,
  "lagrimas y sonrisas|rodolfo-biagi": 80,
  "quiero verte una vez mas|rodolfo-biagi": 80,
  "poema|francisco-canaro": 44,
  "invierno|francisco-canaro": 46,
  "milonga sentimental|francisco-canaro": 66,
  "vida mia|osvaldo-fresedo": 42,
  "sollozos|osvaldo-fresedo": 44,
};

const ERA_BASE: Record<Era, number> = {
  "guardia-vieja": -6,
  "guardia-nueva": -2,
  "golden-early": 2,
  "golden-peak": 0,
  "golden-late": -1,
  "post-golden": -2,
  nuevo: -4,
  contemporary: 0,
  unknown: -3,
};
const RHYTHM_SHIFT: Record<string, number> = {
  tango: 0,
  vals: 6,
  milonga: 12,
  cancion: -15,
  foxtrot: 8,
  pasodoble: 10,
};

export function normTitle(t: string): string {
  return t
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Deterministic pseudo-variation so tracks from the same orchestra are not all identical (±4). */
function titleJitter(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 900) / 100 - 4.5;
}

export function songEnergy(
  song: Song,
  profile?: OrchestraProfile,
  extra: Record<string, number> = {},
): number {
  const key = `${normTitle(song.title)}|${song.orchestraId}`;
  if (extra[key] !== undefined) return extra[key]!;
  if (TRACK_ENERGY[key] !== undefined) return TRACK_ENERGY[key]!;
  let e = profile?.energy ?? 50;
  e += ERA_BASE[song.era] ?? 0;
  e += profile?.eraShift?.[song.era] ?? 0;
  e += RHYTHM_SHIFT[song.rhythm] ?? 0;
  if (song.vocal) e += profile?.vocalShift ?? -2;
  else e += profile?.instrumentalShift ?? 2;
  if (song.year && profile?.singers && song.singer) {
    const span = profile.singers[song.singer];
    if (span && (song.year < span[0] - 1 || song.year > span[1] + 1)) e -= 2; // atypical pairing, slightly less "classic"
  }
  if (song.bpm && song.rhythm === "tango") e += Math.max(-8, Math.min(8, (song.bpm - 124) * 0.6));
  e += titleJitter(song.id);
  return Math.max(0, Math.min(100, Math.round(e)));
}

/** Titles that are concert pieces, medleys, show tangos or otherwise not for the floor (extended by data/knowledge/reference_sets.json blacklist). */
export const BLACKLIST_PATTERNS: RegExp[] = [
  /\bseleccion\b/,
  /\bpopurri\b/,
  /\bpot ?pourri\b/,
  /\bparte\b/,
  /\bmedley\b/,
  /\bfantasia\b/,
  /\bsuite\b/,
  /\bconcierto\b/,
  /\bhomenaje a\b/,
  /\bsinfonia\b/,
  /\bpreludio\b/,
  /\bvivo en\b/,
  /\ben vivo\b/,
  /\bbis\b$/,
  /\bhimno\b/,
  /\bmarcha\b/,
];
export const BLACKLIST_TITLES = new Set([
  "responso",
  "a fuego lento",
  "danzarin",
  "adios nonino",
  "verano porteno",
  "libertango",
  "buenos aires hora cero",
  "la muerte del angel",
  "milonga del angel",
  "tres minutos con la realidad",
  "michelangelo 70",
  "lo que vendra",
  "fuga y misterio",
  "oblivion",
  "tanguedia",
  "escualo",
  "decarisimo",
  "la bicicleta blanca",
  "balada para un loco",
  "chiquilin de bachin",
  "un tango para chaplin",
  "reliquias brasilenas",
  "reliquias brasilenas 2a parte",
  "a don agustin bardi",
  "tangata",
  "nocturna",
  "a los amigos",
  "zum",
  "a evaristo carriego",
  "contratiempo",
  "bien pulenta",
  "a mis companeros",
]);
/** Version-level bans: (title, orchestra, from-year) — concert re-recordings of floor classics. */
export const BLACKLIST_VERSIONS: Array<{
  title: string;
  orchestraId: string;
  fromYear?: number;
  toYear?: number;
}> = [
  { title: "mala junta", orchestraId: "osvaldo-pugliese", fromYear: 1960 },
  { title: "la yumba", orchestraId: "osvaldo-pugliese", fromYear: 1965 },
  { title: "quejas de bandoneon", orchestraId: "anibal-troilo", fromYear: 1960 },
  { title: "cafe dominguez", orchestraId: "angel-d-agostino", fromYear: 1970 },
];
export function isDanceable(title: string, rhythm: string, extraBlacklist?: Set<string>): boolean {
  const t = normTitle(title);
  if (BLACKLIST_TITLES.has(t) || extraBlacklist?.has(t)) return false;
  for (const re of BLACKLIST_PATTERNS) if (re.test(t)) return false;
  if (rhythm === "cancion" || rhythm === "other" || rhythm === "unknown") return false;
  return true;
}
/** isDanceable plus the version-level bans (needs orchestra and year). */
export function isDanceableSong(
  s: Pick<Song, "title" | "rhythm" | "orchestraId" | "year">,
  extraBlacklist?: Set<string>,
): boolean {
  if (!isDanceable(s.title, s.rhythm, extraBlacklist)) return false;
  const t = normTitle(s.title);
  for (const b of BLACKLIST_VERSIONS)
    if (
      b.title === t &&
      b.orchestraId === s.orchestraId &&
      (b.fromYear === undefined || (s.year ?? 0) >= b.fromYear) &&
      (b.toYear === undefined || (s.year ?? 9999) <= b.toYear)
    )
      return false;
  return true;
}
/** "Quejas de bandoneón (1963)" → { title: "quejas de bandoneon", year: 1963 }: a year in parentheses bans one version only. */
export function parseNonDanceTitle(entry: string): { title: string; year: number | null } {
  const m = entry.match(/\((19\d\d|20\d\d)\)/);
  return { title: normTitle(entry), year: m ? Number(m[1]) : null };
}

/** Estimated duration when no streaming metadata is cached: by rhythm and era, with a stable per-recording jitter. */
export function estimateDuration(song: Pick<Song, "id" | "rhythm" | "era">): number {
  const base: Record<string, number> = { tango: 168, vals: 150, milonga: 138 };
  const eraShift: Partial<Record<Era, number>> = {
    "guardia-vieja": -12,
    "guardia-nueva": -8,
    "golden-early": -4,
    "golden-peak": 0,
    "golden-late": 4,
    "post-golden": 8,
    nuevo: 30,
    contemporary: 20,
  };
  let h = 0;
  for (let i = 0; i < song.id.length; i++) h = (h * 33 + song.id.charCodeAt(i)) | 0;
  const jitter = (Math.abs(h) % 31) - 15;
  return Math.max(95, (base[song.rhythm] ?? 170) + (eraShift[song.era] ?? 0) + jitter);
}
