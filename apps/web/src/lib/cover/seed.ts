/**
 * Wave 4 — the cover's generation id, apart from the drawing (no glyphs here, so History and Share can stamp a
 * night's `coverSeed` without loading the outlines). One composed night, one cover: the seed hashes the night's
 * identity — every tanda's song ids and cortina, the opening, the closing and the engine seed — so a Playlist and
 * the `.tdjnight` made from it agree. A History entry keeps the seed of the night it began with; its later versions
 * (edits) keep that family and only their arc changes.
 */

/** FNV-1a, 8 hex characters */
export function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const isSeed = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{8}$/.test(x);

interface SideLike {
  id?: unknown;
}
interface TandaLike {
  rhythm?: unknown;
  energy?: unknown;
  targetEnergy?: unknown;
  songs?: SideLike[];
  sides?: SideLike[];
  cortina?: SideLike | null;
}
interface NightLike {
  name?: unknown;
  coverSeed?: unknown;
  options?: { seed?: unknown } | null;
  tandas?: unknown;
  opening?: SideLike | null;
  closing?: SideLike | null;
}
const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);

/** the generation id of a Playlist or a NightFile (a night without ids falls back to its rhythms and energies) */
export function nightIdentity(p: unknown): string {
  const n = (p && typeof p === "object" ? p : {}) as NightLike;
  const tandas = (Array.isArray(n.tandas) ? n.tandas : []).filter(
    (t): t is TandaLike => !!t && typeof t === "object",
  );
  const id = (s: SideLike | null | undefined) => (s && typeof s.id === "string" ? s.id : "");
  const parts = tandas.map(
    (t) =>
      `${(Array.isArray(t.songs) ? t.songs : Array.isArray(t.sides) ? t.sides : []).map(id).join(",")}|${id(t.cortina)}`,
  );
  const seed = n.options?.seed;
  const key = `${parts.join(";")}#${id(n.opening)}#${id(n.closing)}#${typeof seed === "number" || typeof seed === "string" ? seed : ""}`;
  if (/[^|;#,]/.test(key)) return fnv(key);
  return fnv(
    JSON.stringify([
      typeof n.name === "string" ? n.name : "",
      tandas.map((t) => `${t.rhythm}${Math.round(num(t.energy, num(t.targetEnergy, 50)))}`),
    ]),
  );
}

/** the cover family of a night: the seed it carries (a History entry, a shared file), else its identity */
export function coverSeedOf(p: unknown): string {
  const s = (p && typeof p === "object" ? (p as NightLike).coverSeed : undefined) as unknown;
  return isSeed(s) ? s : nightIdentity(p);
}
