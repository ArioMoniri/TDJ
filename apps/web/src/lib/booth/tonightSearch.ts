import type { BoothRow, PlanEntity } from "./plan";

/**
 * 2026-11 ("the song finder in the play page should find songs from the created playlist, not all songs"): the
 * Booth's search looks in tonight's night first — every song and cortina of the plan, matched by title, orchestra,
 * singer and year, in night order. "T12" or a bare tanda number is that tanda.
 */
export interface TonightHit {
  /** plan index */
  i: number;
  tanda: number;
  /** the track's place in its tanda (1-based); 0 for a cortina */
  k: number;
  kind: BoothRow["kind"];
}

/** lower case, accents off ("Garúa" → "garua", "Láurenz" → "laurenz") */
export const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** "T12", "t 12" or "12" (1–2 digits) → tanda 12; a year (4 digits) or text → null */
export function tandaQuery(q: string, tandas: number): number | null {
  const m = /^\s*t?\s*(\d{1,2})\s*$/i.exec(q);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= tandas ? n : null;
}

function haystack(it: BoothRow, e: PlanEntity | null | undefined): string {
  const parts: Array<string | number | null | undefined> = [it.title, it.artist, it.singer, it.year];
  if (e && typeof e === "object") {
    const x = e as { orchestra?: string; singer?: string | null; year?: number | null; artist?: string };
    parts.push(x.orchestra, x.singer, x.year, x.artist);
  }
  return fold(parts.filter((p) => p !== null && p !== undefined && p !== "").join(" "));
}

/** Tonight's rows matching `q` (every word somewhere in title / orchestra / singer / year), in night order. */
export function searchTonight(
  items: readonly BoothRow[],
  entities: ReadonlyArray<PlanEntity | null | undefined>,
  q: string,
): TonightHit[] {
  const tandas = items.reduce((m, it) => (it.kind === "track" ? Math.max(m, it.tanda) : m), 0);
  const words = fold(q).split(/\s+/).filter(Boolean);
  const t = tandaQuery(q, tandas);
  const out: TonightHit[] = [];
  const kOf = new Map<number, number>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (it.kind === "break") continue;
    const k = it.kind === "track" ? (kOf.get(it.tanda) ?? 0) + 1 : 0;
    if (it.kind === "track") kOf.set(it.tanda, k);
    const hit =
      t !== null
        ? it.tanda === t && it.kind !== "closing"
        : words.length > 0 && words.every((w) => haystack(it, entities[i]).includes(w));
    if (hit) out.push({ i, tanda: it.tanda, k, kind: it.kind });
  }
  return out;
}
