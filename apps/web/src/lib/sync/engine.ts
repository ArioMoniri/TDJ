import { open, recordId, type SyncKeys, seal } from "./crypto";
import {
  DEVICE,
  HISTORY_LIMIT as HISTORY_MAX,
  type Night as HistorySnapshot,
  type Library,
  libraryFields,
  NIGHT,
  nightOf,
  type Single,
  settingsFromSpace,
} from "./library";
import {
  Clock,
  deleteRec,
  fingerprint,
  isLive,
  isRec,
  mergeInto,
  type Rec,
  stable,
  stampsOf,
  valuesOf,
  writeFields,
} from "./merge";

/**
 * One device's side of a sync space (docs/SYNC.md). The engine keeps the space's change log (`doc`: every record
 * with its stamped fields and tombstones) and runs one round at a time:
 *
 * 1. capture: what changed on this device since the last round becomes field writes (compared by reference, then by
 *    content, so an untouched night costs nothing) and a night gone from History becomes a tombstone;
 * 2. for each transport (the sync server, the iCloud folder): pull what changed there, decrypt and merge it, then
 *    push every record whose merged copy differs from what that transport holds. A push that lost a race is
 *    harmless: the next round sees the other copy, merges, and pushes the union again;
 * 3. apply: the merged library goes back into the stores.
 *
 * Nothing here knows the network or the stores: transports and the local side are passed in, so vitest runs whole
 * devices against each other.
 */
export interface Item {
  rid: string;
  blob: string;
}
export interface PullResult {
  items: Item[];
  /** where the next pull starts; equal to the cursor passed in (or no items) when the pull is complete */
  cursor: string | null;
  /** false: nothing more to read now (true or absent: ask again from the new cursor) */
  more?: boolean;
  /** the server's last-seen times of the space's devices (ms) */
  devices?: Record<string, number>;
}
export interface Transport {
  /** stable name: its state (cursor, what it holds) is kept under it */
  readonly name: string;
  pull(cursor: string | null): Promise<PullResult>;
  push(items: Item[]): Promise<void>;
}
export interface LocalSide {
  read(): Library;
  /** the parts that changed (only those keys are present) */
  write(parts: Partial<Library>): void;
}
export interface Persist {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}
export interface DeviceInfo {
  id: string;
  name: string;
  platform: string;
}
export interface TransportReport {
  name: string;
  ok: boolean;
  pulled: number;
  pushed: number;
  error?: string;
  devices?: Record<string, number>;
}
export interface Report {
  at: string;
  applied: boolean;
  transports: TransportReport[];
}
export interface SpaceDevice {
  id: string;
  name: string;
  platform: string;
  seen: string;
  self: boolean;
}
interface TransportState {
  cursor: string | null;
  /** record id → fingerprint of the copy the transport holds */
  held: Record<string, string>;
}
interface Seen {
  ref: unknown;
  h: string;
}

/** a device record is refreshed this often (its "last seen" for iCloud-only devices) */
const DEVICE_EVERY_MS = 60 * 60_000;
/** what one push carries at most (the server takes 25 records, 2 MB) */
const PUSH_BATCH = 20;
const PUSH_BYTES = 1_500_000;
/** a reference no value is: a seen entry restored from storage compares by content */
const NOTHING = Symbol("seen");
const hashOf = (v: unknown) => fingerprint({ k: "", f: { v: { v, c: "" } } });
const singles = ["memory", "settings", "overrides"] as const;

export class SyncEngine {
  doc = new Map<string, Rec>();
  readonly clock: Clock;
  private rids = new Map<string, string>();
  /** each record's fields as this device last saw them: the value (by reference) and its content fingerprint */
  private seen = new Map<string, Map<string, Seen>>();
  private seenNights = new Set<string>();
  private states = new Map<string, TransportState>();
  private loaded = false;
  private running: Promise<Report> | null = null;
  private now: () => number;

  constructor(
    private keys: SyncKeys,
    private device: DeviceInfo,
    private local: LocalSide,
    private transports: Transport[],
    private persist: Persist,
    now: () => number = Date.now,
  ) {
    this.now = now;
    this.clock = new Clock(device.id, now);
  }

  private tag = () => this.keys.id.slice(0, 16);
  private docKey = () => `doc:${this.tag()}`;
  private seenKey = () => `seen:${this.tag()}`;
  private stateKey = (t: string) => `transport:${this.tag()}:${t}`;

  setTransports(t: Transport[]) {
    this.transports = t;
  }
  setDevice(d: DeviceInfo) {
    this.device = { ...d, id: this.device.id };
  }

  async load() {
    if (this.loaded) return;
    const saved = await this.persist.get<Rec[]>(this.docKey()).catch(() => undefined);
    if (Array.isArray(saved)) for (const r of saved) if (isRec(r)) this.doc.set(r.k, r);
    for (const r of this.doc.values()) for (const s of stampsOf(r)) this.clock.observe(s);
    // what this device had seen when it last ran: a value that differs from it now is an edit made here
    const seen = await this.persist
      .get<{ fields?: Record<string, Record<string, string>>; nights?: string[] }>(this.seenKey())
      .catch(() => undefined);
    if (seen?.fields)
      for (const [name, o] of Object.entries(seen.fields))
        this.seen.set(name, new Map(Object.entries(o).map(([f, h]) => [f, { ref: NOTHING, h }])));
    if (Array.isArray(seen?.nights)) this.seenNights = new Set(seen.nights);
    this.loaded = true;
  }

  private async state(name: string): Promise<TransportState> {
    let s = this.states.get(name);
    if (!s) {
      const saved = await this.persist.get<TransportState>(this.stateKey(name)).catch(() => undefined);
      s =
        saved && typeof saved === "object"
          ? { cursor: saved.cursor ?? null, held: saved.held ?? {} }
          : { cursor: null, held: {} };
      this.states.set(name, s);
    }
    return s;
  }

  private async rid(name: string): Promise<string> {
    let r = this.rids.get(name);
    if (!r) {
      r = await recordId(this.keys, name);
      this.rids.set(name, r);
    }
    return r;
  }

  /** whether a field's value differs from what this device last saw (by reference first, then by content) */
  private differs(name: string, field: string, v: unknown): boolean {
    const s = this.seen.get(name)?.get(field);
    if (s && s.ref === v) return false;
    if (s && s.h === hashOf(v)) {
      s.ref = v;
      return false;
    }
    return true;
  }

  /** 1. this device's changes since it last looked → field writes and tombstones. True when something changed. */
  capture(o: { joining?: boolean } = {}): boolean {
    const lib = this.local.read();
    const fields = libraryFields(lib);
    let changed = false;
    for (const [name, values] of fields) {
      const cur = this.doc.get(name);
      const edits: Record<string, unknown> = {};
      for (const [f, v] of Object.entries(values)) {
        // joining a space: its settings, memory and database edits win over this device's untouched defaults;
        // only what the space does not have yet comes from here (nights are all kept: they are their own records)
        if (o.joining && cur && !name.startsWith(NIGHT) && cur.f[f]) continue;
        if (this.differs(name, f, v)) edits[f] = v;
      }
      const seen = this.seen.get(name);
      const removed = seen ? [...seen.keys()].filter((f) => !(f in values)) : [];
      if (cur && !Object.keys(edits).length && !removed.length) continue;
      let next = writeFields(cur, name, edits, this.clock);
      for (const f of removed)
        if (next.f[f]?.v !== undefined) next = { ...next, f: { ...next.f, [f]: { c: this.clock.tick() } } };
      if (next !== cur) {
        this.doc.set(name, next);
        changed = true;
      }
    }
    // nights gone from History: deleted here, unless they only fell off the end of the list (HISTORY_MAX)
    const present = new Set(lib.history.map((h) => `${NIGHT}${h.id}`));
    let oldest: string | null = null;
    for (const h of lib.history) if (oldest === null || h.createdAt < oldest) oldest = h.createdAt;
    for (const name of this.seenNights) {
      if (present.has(name)) continue;
      const r = this.doc.get(name);
      if (!r || !isLive(r)) continue;
      const created = String(valuesOf(r).createdAt ?? "");
      if (lib.history.length >= HISTORY_MAX && oldest !== null && created <= oldest) continue;
      this.doc.set(name, deleteRec(r, this.clock));
      changed = true;
    }
    // this device's own record: its name and when it was last here
    const dname = `${DEVICE}${this.device.id}`;
    const dr = this.doc.get(dname);
    const dv = dr ? valuesOf(dr) : {};
    const seenAt = Date.parse(String(dv.seen ?? "")) || 0;
    if (
      !dr ||
      dv.name !== this.device.name ||
      dv.platform !== this.device.platform ||
      this.now() - seenAt > DEVICE_EVERY_MS
    ) {
      const values = {
        name: this.device.name,
        platform: this.device.platform,
        seen: new Date(this.now()).toISOString(),
      };
      this.doc.set(dname, writeFields(dr, dname, values, this.clock));
      changed = true;
    }
    this.remember(fields, lib);
    return changed;
  }

  /** what this device now shows, so the next capture sees only new edits */
  private remember(fields: Map<string, Record<string, unknown>>, lib: Library) {
    const next = new Map<string, Map<string, Seen>>();
    for (const [name, values] of fields) {
      const old = this.seen.get(name);
      const m = new Map<string, Seen>();
      for (const [f, v] of Object.entries(values)) {
        const s = old?.get(f);
        m.set(f, s && s.ref === v ? s : { ref: v, h: hashOf(v) });
      }
      next.set(name, m);
    }
    this.seen = next;
    this.seenNights = new Set(lib.history.map((h) => `${NIGHT}${h.id}`));
  }

  /** The library the change log holds: live nights newest first (at most HISTORY_MAX), the single records. */
  library(): { history: HistorySnapshot[]; singles: Partial<Record<Single, Record<string, unknown>>> } {
    const nights: HistorySnapshot[] = [];
    const out: Partial<Record<Single, Record<string, unknown>>> = {};
    for (const [name, r] of this.doc) {
      if (!isLive(r)) continue;
      if (name.startsWith(NIGHT)) {
        const h = nightOf(name, valuesOf(r));
        if (h) nights.push(h);
      } else if ((singles as readonly string[]).includes(name)) out[name as Single] = valuesOf(r);
    }
    nights.sort((a, b) =>
      a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? 1 : -1) : a.id < b.id ? 1 : -1,
    );
    return { history: nights.slice(0, HISTORY_MAX), singles: out };
  }

  /** the devices of the space: name, platform, last seen (from their own records) */
  devices(): SpaceDevice[] {
    const out: SpaceDevice[] = [];
    for (const [name, r] of this.doc) {
      if (!name.startsWith(DEVICE) || !isLive(r)) continue;
      const v = valuesOf(r);
      const id = name.slice(DEVICE.length);
      out.push({
        id,
        name: String(v.name ?? ""),
        platform: String(v.platform ?? ""),
        seen: String(v.seen ?? ""),
        self: id === this.device.id,
      });
    }
    return out.sort((a, b) => (a.seen < b.seen ? 1 : a.seen > b.seen ? -1 : 0));
  }

  /** 3. the merged library → the stores: only the parts that differ from what they hold */
  apply(): boolean {
    const lib = this.local.read();
    const { history, singles: s } = this.library();
    const fields = libraryFields(lib);
    const parts: Partial<Library> = {};
    // a night the stores hold keeps its object when the log holds the same night (no needless re-render)
    const byId = new Map(lib.history.map((h) => [h.id, h]));
    const nextHistory = history.map((h) => {
      const cur = byId.get(h.id);
      return cur && stable(cur) === stable(h) ? cur : h;
    });
    if (nextHistory.length !== lib.history.length || nextHistory.some((h, i) => h !== lib.history[i]))
      parts.history = nextHistory;
    const differ = (name: Single) => !!s[name] && stable(s[name]) !== stable(fields.get(name));
    if (differ("memory"))
      parts.memory = { ...(s.memory as Library["memory"]), updatedAt: new Date(this.now()).toISOString() };
    if (differ("settings")) parts.settings = settingsFromSpace(lib.settings, s.settings!);
    if (differ("overrides"))
      parts.overrides = {
        ...(s.overrides as Library["overrides"]),
        ...(lib.overrides.connectors ? { connectors: lib.overrides.connectors } : {}),
      };
    if (!Object.keys(parts).length) return false;
    this.local.write(parts);
    const after = this.local.read();
    this.remember(libraryFields(after), after);
    return true;
  }

  private async decode(item: Item): Promise<Rec | null> {
    try {
      const r = await open<Rec>(this.keys, item.blob, item.rid);
      if (!isRec(r) || (await this.rid(r.k)) !== item.rid) return null;
      return r;
    } catch {
      return null;
    }
  }

  private async exchange(t: Transport): Promise<TransportReport> {
    const st = await this.state(t.name);
    const rep: TransportReport = { name: t.name, ok: true, pulled: 0, pushed: 0 };
    let cursor = st.cursor;
    for (let page = 0; page < 100; page++) {
      const res = await t.pull(cursor);
      if (res.devices) rep.devices = res.devices;
      const recs: Rec[] = [];
      for (const it of res.items) {
        const r = await this.decode(it);
        if (!r) continue;
        recs.push(r);
        st.held[it.rid] = fingerprint(r);
        for (const x of stampsOf(r)) this.clock.observe(x);
      }
      rep.pulled += mergeInto(this.doc, recs).length;
      const done = res.more === false || res.cursor === cursor || res.items.length === 0;
      cursor = res.cursor;
      if (done) break;
    }
    st.cursor = cursor;
    // push every record the transport does not hold as it is here
    const out: Array<{ item: Item; fp: string }> = [];
    for (const [name, r] of this.doc) {
      const rid = await this.rid(name);
      const fp = fingerprint(r);
      if (st.held[rid] === fp) continue;
      out.push({ item: { rid, blob: await seal(this.keys, r, rid) }, fp });
    }
    let batch: typeof out = [];
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      await t.push(batch.map((b) => b.item));
      for (const b of batch) st.held[b.item.rid] = b.fp;
      rep.pushed += batch.length;
      batch = [];
      bytes = 0;
    };
    try {
      for (const o of out) {
        if (batch.length >= PUSH_BATCH || bytes + o.item.blob.length > PUSH_BYTES) await flush();
        batch.push(o);
        bytes += o.item.blob.length;
      }
      await flush();
    } finally {
      await this.persist.set(this.stateKey(t.name), st).catch(() => {});
    }
    return rep;
  }

  /** One round (capture, exchange with every transport, apply). Rounds never overlap. */
  sync(): Promise<Report> {
    if (!this.running)
      this.running = this.round().finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async round(): Promise<Report> {
    await this.load();
    const transports: TransportReport[] = [];
    // a device that has never synced this space reads it first, then adds what it has (the space's settings win)
    if (!this.seen.size) {
      for (const t of this.transports) await this.exchange(t).catch(() => null);
      this.capture({ joining: true });
    } else this.capture();
    for (const t of this.transports) {
      try {
        transports.push(await this.exchange(t));
      } catch (e) {
        transports.push({
          name: t.name,
          ok: false,
          pulled: 0,
          pushed: 0,
          error: (e as Error)?.message || String(e),
        });
      }
      // an edit made while the network answered goes into the log before anything is applied over it
      this.capture();
    }
    const applied = this.apply();
    await this.save();
    return { at: new Date(this.now()).toISOString(), applied, transports };
  }

  async save() {
    await this.persist.set(this.docKey(), [...this.doc.values()]).catch(() => {});
    const fields: Record<string, Record<string, string>> = {};
    for (const [name, m] of this.seen) fields[name] = Object.fromEntries([...m].map(([f, x]) => [f, x.h]));
    await this.persist.set(this.seenKey(), { fields, nights: [...this.seenNights] }).catch(() => {});
  }

  /** every record as it is here (the encrypted export) */
  records(): Rec[] {
    return [...this.doc.values()];
  }
  /** records from elsewhere (an encrypted export) merged into the log; applied on the next round */
  absorb(recs: Rec[]): number {
    const ok = recs.filter(isRec);
    for (const r of ok) for (const x of stampsOf(r)) this.clock.observe(x);
    return mergeInto(this.doc, ok).length;
  }

  /** Forget this space on this device (Leave sync): the log and every transport's state. */
  async forget() {
    await this.persist.del(this.docKey()).catch(() => {});
    await this.persist.del(this.seenKey()).catch(() => {});
    for (const t of this.transports) await this.persist.del(this.stateKey(t.name)).catch(() => {});
    this.doc.clear();
    this.states.clear();
    this.seen.clear();
    this.seenNights.clear();
  }
}
