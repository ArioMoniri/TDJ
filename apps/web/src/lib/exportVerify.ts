/**
 * One check for every export target (Spotify, YouTube, the files, the uploads): what the target holds after the
 * write, read back, against what the export meant to put there — count, order, missing, extra and unavailable rows.
 * A target never reports success from what it sent; it reports what this comparison found.
 */

/** One row the export meant to write: its key (a Spotify URI, a video id, a file row) and what the DJ calls it. */
export interface ExpectedItem {
  key: string;
  label?: string;
  /** the tanda the row belongs to (a cortina: the tanda it follows) */
  tanda?: number;
  kind?: string;
}
/** One row the target holds, read back. */
export interface ActualItem {
  /** null: the target holds a row it cannot name (a local file, a deleted video) */
  key: string | null;
  /** false: the row is there but the listener cannot play it (another country, private, deleted) */
  available?: boolean;
  /** the key the row was written under when the target swapped it (Spotify's track relinking) */
  linkedFrom?: string;
}
export interface Placed {
  /** 0-based position in the intended list */
  at: number;
  key: string;
  label?: string;
  tanda?: number;
  kind?: string;
}
export interface VerifyResult {
  expected: number;
  actual: number;
  /** rows in their own position */
  inPlace: number;
  /** count and order exactly as intended (unavailable rows still count as present) */
  ok: boolean;
  /** intended rows the target does not hold at all */
  missing: Placed[];
  /** rows the target holds that the export never meant to write (or holds once too often) */
  extra: Array<{ at: number; key: string | null }>;
  /** positions (in the target) of rows that are there but in the wrong place */
  outOfOrder: number[];
  /** intended rows that are in place but cannot be played where the DJ is */
  unavailable: Placed[];
}

const asExpected = (e: string | ExpectedItem): ExpectedItem => (typeof e === "string" ? { key: e } : e);
const asActual = (a: string | null | ActualItem): ActualItem =>
  a === null || typeof a === "string" ? { key: a } : a;
const same = (e: ExpectedItem, a: ActualItem) =>
  a.key === e.key || (!!a.linkedFrom && a.linkedFrom === e.key);
const place = (e: ExpectedItem, at: number): Placed => ({ ...e, at });

/**
 * Position by position first; the rows left over are matched as a multiset, so a row that is present but moved
 * is "out of order", never "missing" and "extra" at once. Duplicates count: the same cortina twice is two rows.
 */
export function verify(
  expectedIn: Array<string | ExpectedItem>,
  actualIn: Array<string | null | ActualItem>,
): VerifyResult {
  const expected = expectedIn.map(asExpected);
  const actual = actualIn.map(asActual);
  const inPlace = new Set<number>();
  const unavailable: Placed[] = [];
  for (let i = 0; i < Math.min(expected.length, actual.length); i++)
    if (same(expected[i]!, actual[i]!)) {
      inPlace.add(i);
      if (actual[i]!.available === false) unavailable.push(place(expected[i]!, i));
    }
  // what is left of the intended list, by key
  const left = new Map<string, number[]>();
  expected.forEach((e, i) => {
    if (inPlace.has(i)) return;
    left.set(e.key, [...(left.get(e.key) ?? []), i]);
  });
  const outOfOrder: number[] = [];
  const extra: Array<{ at: number; key: string | null }> = [];
  actual.forEach((a, j) => {
    if (inPlace.has(j)) return;
    const k = a.key !== null && left.get(a.key)?.length ? a.key : a.linkedFrom;
    const slots = k ? left.get(k) : undefined;
    if (k && slots?.length) {
      const i = slots.shift()!;
      outOfOrder.push(j);
      if (a.available === false) unavailable.push(place(expected[i]!, i));
    } else extra.push({ at: j, key: a.key });
  });
  const missing: Placed[] = [];
  for (const slots of left.values()) for (const i of slots) missing.push(place(expected[i]!, i));
  missing.sort((a, b) => a.at - b.at);
  unavailable.sort((a, b) => a.at - b.at);
  return {
    expected: expected.length,
    actual: actual.length,
    inPlace: inPlace.size,
    ok: !missing.length && !extra.length && !outOfOrder.length && expected.length === actual.length,
    missing,
    extra,
    outOfOrder,
    unavailable,
  };
}

/** Wait helper the writers share; tests pass their own so nothing really sleeps. */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Seconds a rate-limit error asks for (Spotify's RateLimitError, the browser's SpotifyRateLimit), else null. */
export const retryAfterOf = (e: unknown): number | null => {
  const v = (e as { retryAfter?: unknown } | null)?.retryAfter;
  return typeof v === "number" && Number.isFinite(v) ? Math.max(1, v) : null;
};
export const statusOf = (e: unknown): number | null => {
  const v = (e as { status?: unknown } | null)?.status;
  return typeof v === "number" ? v : null;
};
