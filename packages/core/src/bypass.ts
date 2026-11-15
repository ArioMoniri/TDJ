import type { Playlist, Tanda } from "./types";

/**
 * Round 21 — bypass (docs/specs/round21-engine.md §6): a tanda the DJ marks "skip tonight" (`Tanda.bypass`) stays in
 * the night and its exports but the player passes over it (its tracks and the cortina after it); the setting "Last 4
 * tandas tango only" (`rules.lastFourTango`) bypasses every vals or milonga among the last four tandas, again until the
 * night closes on four tango tandas. Exports keep the bypassed tandas unless the DJ drops them; with the setting on,
 * the export's last four are tango too.
 */

/**
 * the vals / milonga tandas the last-four-tango setting passes over (0-based indices); `keep`: the tandas the DJ
 * approved to play anyway tonight ("Do it as I said", a one-night exception) are never passed over
 */
export function lastFourTangoBypass(
  tandas: Pick<Tanda, "rhythm">[],
  skip: Set<number> = new Set(),
  keep: ReadonlySet<number> = new Set(),
): Set<number> {
  const out = new Set<number>();
  for (;;) {
    const left = tandas.map((_t, i) => i).filter((i) => !skip.has(i) && !out.has(i));
    if (left.length < 4) return out;
    const bad = left.slice(-4).filter((i) => tandas[i]!.rhythm !== "tango" && !keep.has(i));
    if (!bad.length) return out;
    for (const i of bad) out.add(i);
  }
}

/** the tandas the DJ approved, for this night only, to play although the last-four-tango setting would skip them */
export function lastFourKept(p: Pick<Playlist, "tandas"> & Partial<Pick<Playlist, "id">>): Set<number> {
  return new Set(
    p.tandas
      .map((t, i) =>
        p.id && t.pinned?.exception?.nightId === p.id && t.pinned.exception.rules.includes("lastFourTango")
          ? i
          : -1,
      )
      .filter((i) => i >= 0),
  );
}

/** every tanda the player passes over tonight (0-based): the DJ's "skip tonight" and the last-four-tango setting */
export function bypassedTandas(
  p: Pick<Playlist, "tandas" | "options"> & Partial<Pick<Playlist, "id">>,
): Set<number> {
  const mine = new Set(p.tandas.map((t, i) => (t.bypass ? i : -1)).filter((i) => i >= 0));
  if (!p.options.rules?.lastFourTango) return mine;
  return new Set([...mine, ...lastFourTangoBypass(p.tandas, mine, lastFourKept(p))]);
}

/** the booth plan items the player passes over: the tracks of a bypassed tanda and the cortina after it (the cortina
 * before it when it is the última, so the closing follows the tanda before) */
export function bypassPlanItems(
  p: Pick<Playlist, "tandas" | "options"> & Partial<Pick<Playlist, "id">>,
  items: ReadonlyArray<{ kind: string; tanda: number }>,
): number[] {
  const by = bypassedTandas(p);
  if (!by.size) return [];
  const n = p.tandas.length;
  // (the última bypassed: no cortina between the last tanda that plays and the closing)
  const lastPlayed = by.has(n - 1) ? Math.max(-1, ...p.tandas.map((_t, i) => (by.has(i) ? -1 : i))) : -1;
  const out: number[] = [];
  items.forEach((it, k) => {
    const ti = it.tanda - 1;
    if ((it.kind === "track" || it.kind === "cortina") && by.has(ti)) out.push(k);
    else if (it.kind === "cortina" && ti === lastPlayed) out.push(k);
  });
  return out;
}

/** the tandas an export writes: all of them by default; without the DJ's bypassed ones on request; with the
 * last-four-tango setting the vals / milonga it passes over are left out so the export ends on four tangos */
export function exportTandas(
  p: Pick<Playlist, "tandas" | "options"> & Partial<Pick<Playlist, "id">>,
  opts: { dropBypassed?: boolean } = {},
): Tanda[] {
  const mine = new Set(
    p.tandas.map((t, i) => (opts.dropBypassed && t.bypass ? i : -1)).filter((i) => i >= 0),
  );
  const tail = p.options.rules?.lastFourTango
    ? lastFourTangoBypass(p.tandas, mine, lastFourKept(p))
    : new Set<number>();
  return p.tandas.filter((_t, i) => !mine.has(i) && !tail.has(i));
}
