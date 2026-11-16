/**
 * 2026-11 (the owner: "a button on the tanda image to play that tanda only, or play from there till the end, and the
 * same for songs; a setting so a click continues to the last, or stops after the clicked one") — which rows of a list
 * a play covers. Pure: the mini player's Next / Previous and the hand-over at the end of a track follow it, vitest pins
 * it (playScope.test.ts).
 *
 * - `one`: the row only (a plain tap with "Play only it", or "Play this song");
 * - `tanda`: the tanda's songs (not the cortina after it: "Play this tanda" stops when the tanda ends);
 * - `from`: from the row to the end of the list (a plain tap with "Continue to the end", "Play from here", "Play from
 *   here to the end"): the cortinas between tandas play too.
 */
export type TapMode = "only" | "continue";
export type ScopeKind = "one" | "tanda" | "from";
export interface PlayScope {
  kind: ScopeKind;
  /** first and last list index the play covers (inclusive) */
  from: number;
  to: number;
  /** the tanda (0-based) a `tanda` scope, or the tanda the row sits in */
  tanda?: number;
}
/** what the scope reads of a row: a song or a cortina, and the tanda it belongs to (opening / closing: none) */
export interface ScopeRow {
  kind: "song" | "cortina";
  tanda?: number;
}
export const DEFAULT_TAP_MODE: TapMode = "continue";

/** a plain tap on row `index` */
export function tapScope(rows: readonly ScopeRow[], index: number, mode: TapMode): PlayScope {
  const tanda = rows[index]?.tanda;
  return mode === "only"
    ? { kind: "one", from: index, to: index, tanda }
    : { kind: "from", from: index, to: Math.max(index, rows.length - 1), tanda };
}
/** "Play this song" / "Play from here" on row `index` */
export function songScope(rows: readonly ScopeRow[], index: number, kind: "one" | "from"): PlayScope {
  return tapScope(rows, index, kind === "one" ? "only" : "continue");
}
/** "Play this tanda" / "Play from here to the end" on tanda `tanda` (0-based); null: the list holds no song of it */
export function tandaScope(
  rows: readonly ScopeRow[],
  tanda: number,
  kind: "tanda" | "from",
): PlayScope | null {
  const first = rows.findIndex((r) => r.kind === "song" && r.tanda === tanda);
  if (first < 0) return null;
  if (kind === "from") return { kind: "from", from: first, to: rows.length - 1, tanda };
  let last = first;
  for (let i = first; i < rows.length; i++)
    if (rows[i]!.kind === "song" && rows[i]!.tanda === tanda) last = i;
  return { kind: "tanda", from: first, to: last, tanda };
}
/** the next row inside the scope (delta ±1), null past either end */
export function scopeStep(scope: PlayScope | null | undefined, length: number, index: number, delta: number) {
  const lo = scope ? Math.max(0, scope.from) : 0;
  const hi = scope ? Math.min(length - 1, scope.to) : length - 1;
  const n = index + delta;
  return n >= lo && n <= hi ? n : null;
}
/** the rows the scope covers, in play order (the mini player's queue) */
export function scopeIndexes(scope: PlayScope, length: number): number[] {
  const out: number[] = [];
  for (let i = Math.max(0, scope.from); i <= Math.min(length - 1, scope.to); i++) out.push(i);
  return out;
}
/** whether a track that ends on its own hands over to the next row (a `one` scope stops) */
export const continues = (scope: PlayScope | null | undefined) => !!scope && scope.kind !== "one";
