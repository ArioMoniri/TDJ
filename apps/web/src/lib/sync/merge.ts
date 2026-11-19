/**
 * The merge of a sync space (docs/SYNC.md): every record (`night:<id>`, `memory`, `settings`, `overrides`,
 * `device:<id>`) is a last-writer-wins map of fields, each field stamped with a hybrid logical clock. Merging two
 * copies keeps, field by field, the write with the greater stamp, so the result is the same in any order, any
 * number of times (commutative, associative, idempotent): devices converge whatever they exchange and in which order.
 *
 * Deletes are tombstones: `d` is the stamp of the delete, and the record's fields stay with it. A record is shown
 * while some field was written after its delete, so a delete and a concurrent rename resolve by their stamps the same
 * way on every device: the later one wins, and a night deleted before its rename comes back renamed. A night is
 * never dropped from the log: a tombstone still holds the whole night.
 */

/** `<wall ms, 12 hex>.<counter, 4 hex>.<node>`: fixed-width, so stamps compare as strings */
export type Hlc = string;

export interface Field {
  /** the value; absent: the field was removed */
  v?: unknown;
  c: Hlc;
}
export interface Rec {
  /** the record's name: `night:<id>`, `memory`, `settings`, `overrides`, `device:<id>` */
  k: string;
  f: Record<string, Field>;
  /** stamp of the latest delete */
  d?: Hlc;
}

const hex = (n: number, w: number) => n.toString(16).padStart(w, "0").slice(-w);
const MAX_COUNTER = 0xffff;

export function hlcParts(h: Hlc): { ms: number; n: number; node: string } {
  const [ms = "0", n = "0", node = ""] = h.split(".");
  return { ms: Number.parseInt(ms, 16) || 0, n: Number.parseInt(n, 16) || 0, node };
}

/**
 * A hybrid logical clock (Kulkarni et al.): wall time when the clock is ahead, a counter otherwise, and every stamp
 * seen from another device moves it forward, so a write made after reading another device's write always sorts
 * after it, even with a phone whose clock is a few minutes slow. The node id breaks the last ties.
 */
export class Clock {
  private ms = 0;
  private n = 0;
  constructor(
    readonly node: string,
    private now: () => number = Date.now,
  ) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(node)) throw new Error("bad node id");
  }
  tick(): Hlc {
    const wall = this.now();
    if (wall > this.ms) {
      this.ms = wall;
      this.n = 0;
    } else if (this.n >= MAX_COUNTER) {
      this.ms += 1;
      this.n = 0;
    } else this.n += 1;
    return `${hex(this.ms, 12)}.${hex(this.n, 4)}.${this.node}`;
  }
  /** a stamp read from another device (a stamp from far in the future is not followed past a day ahead) */
  observe(h: Hlc | undefined) {
    if (!h) return;
    const p = hlcParts(h);
    const cap = this.now() + 86_400_000;
    const ms = Math.min(p.ms, cap);
    if (ms > this.ms) {
      this.ms = ms;
      this.n = p.n;
    } else if (ms === this.ms && p.n > this.n) this.n = p.n;
  }
}

/** JSON with sorted keys: equal values give equal strings on every device */
export function stable(v: unknown): string {
  if (v === undefined) return "u";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stable(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
    .join(",")}}`;
}

const later = (a: Hlc | undefined, b: Hlc | undefined) => (!a ? b : !b ? a : a >= b ? a : b);

function pickField(a: Field | undefined, b: Field | undefined): Field | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.c !== b.c) return a.c > b.c ? a : b;
  // the same stamp twice is the same write; a corrupted copy still resolves the same everywhere
  return stable(a.v) >= stable(b.v) ? a : b;
}

/** The merge of two copies of one record (either may be missing). */
export function mergeRec(a: Rec | undefined, b: Rec | undefined): Rec | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a.k !== b.k) throw new Error("records with different names");
  const f: Record<string, Field> = {};
  for (const name of new Set([...Object.keys(a.f), ...Object.keys(b.f)])) {
    const x = pickField(a.f[name], b.f[name]);
    if (x) f[name] = x;
  }
  const d = later(a.d, b.d);
  return d ? { k: a.k, f, d } : { k: a.k, f };
}

/** Merges a list of records into a map by name (the map is changed; returns the names that changed). */
export function mergeInto(doc: Map<string, Rec>, incoming: Rec[]): string[] {
  const changed: string[] = [];
  for (const r of incoming) {
    const cur = doc.get(r.k);
    const next = mergeRec(cur, r)!;
    if (!cur || stable(cur) !== stable(next)) {
      doc.set(r.k, next);
      changed.push(r.k);
    }
  }
  return changed;
}

/** the newest field stamp */
export const lastWrite = (r: Rec): Hlc | undefined =>
  Object.values(r.f).reduce<Hlc | undefined>((m, x) => later(m, x.c), undefined);

/** Whether the record is shown: never deleted, or written after its latest delete. */
export function isLive(r: Rec | undefined): boolean {
  if (!r) return false;
  if (!r.d) return true;
  const w = lastWrite(r);
  return !!w && w > r.d;
}

/** The record's values (removed fields left out). */
export function valuesOf(r: Rec): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(r.f)) if (x.v !== undefined) out[k] = x.v;
  return out;
}

/**
 * A local edit: the fields of `values` that differ from the record (and the fields it no longer has) are written
 * with a new stamp. Returns the same record when nothing changed. A deleted record written again is live again.
 */
export function writeFields(
  r: Rec | undefined,
  k: string,
  values: Record<string, unknown>,
  clock: Clock,
  o: { removeMissing?: boolean } = {},
): Rec {
  const cur: Rec = r ?? { k, f: {} };
  const live = isLive(r);
  let f: Record<string, Field> | null = null;
  const put = (name: string, v: unknown) => {
    f ??= { ...cur.f };
    f[name] = v === undefined ? { c: clock.tick() } : { v, c: clock.tick() };
  };
  for (const [name, v] of Object.entries(values)) {
    if (v === undefined) continue;
    const old = cur.f[name];
    // a field equal to a deleted record's is written again all the same: that is what brings it back
    if (!old || old.v === undefined || stable(old.v) !== stable(v) || !live) put(name, v);
  }
  if (o.removeMissing)
    for (const [name, x] of Object.entries(cur.f))
      if (x.v !== undefined && values[name] === undefined) put(name, undefined);
  if (!f) return cur;
  return cur.d ? { k, f, d: cur.d } : { k, f };
}

/** A local delete: a tombstone stamped now (the fields stay). */
export function deleteRec(r: Rec, clock: Clock): Rec {
  return { ...r, d: clock.tick() };
}

/** every stamp in a record (to move a clock past what it read) */
export function stampsOf(r: Rec): Hlc[] {
  const out = Object.values(r.f).map((x) => x.c);
  if (r.d) out.push(r.d);
  return out;
}

/** A record read from elsewhere, checked field by field (a damaged one is refused, never half-merged). */
export function isRec(x: unknown): x is Rec {
  const r = x as Rec;
  if (!r || typeof r !== "object" || typeof r.k !== "string" || !r.f || typeof r.f !== "object") return false;
  if (r.d !== undefined && typeof r.d !== "string") return false;
  return Object.values(r.f).every((v) => !!v && typeof v === "object" && typeof (v as Field).c === "string");
}

/** A short fingerprint of a record (FNV-1a over its stable JSON): which copies a transport already holds. */
export function fingerprint(r: Rec): string {
  const s = stable(r);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return `${(h1 >>> 0).toString(36)}${(h2 >>> 0).toString(36)}${s.length.toString(36)}`;
}
