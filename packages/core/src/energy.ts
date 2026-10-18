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

export function songEnergy(song: Song, profile?: OrchestraProfile): number {
  const key = `${normTitle(song.title)}|${song.orchestraId}`;
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
