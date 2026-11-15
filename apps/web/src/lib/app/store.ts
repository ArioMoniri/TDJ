/**
 * The apps' on-device database: SQLite through tauri-plugin-sql (`sqlite:tdj.db` in the app's data folder), with
 * versioned migrations recorded in `schema_migrations`. It holds what the web keeps on its server row or in the
 * browser: the DJ's database edits (overrides), what TDJ learned (memory), the nights composed on this device
 * (history), settings, cached stream ids / BPM / artwork, and the rooms log for when rooms arrive. Nothing here
 * leaves the device unless the DJ links a TDJ server (Settings → Connections).
 */

/** The two calls tauri-plugin-sql offers (`plugin:sql|execute`, `plugin:sql|select`), `?` placeholders. */
export interface SqlDriver {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Migration {
  /** 1, 2, 3… in order; a version once released never changes (add a new one instead) */
  version: number;
  name: string;
  /** statements run one by one; the version is recorded only after the last one succeeded */
  up: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "device database",
    up: [
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      // overrides (database edits) and memory (learned preferences, notes, feedback): one JSON document each
      `CREATE TABLE IF NOT EXISTS documents (
        name TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS history (
        id TEXT PRIMARY KEY,
        position INTEGER NOT NULL,
        created_at TEXT,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS media_cache (
        song_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        stream_id TEXT,
        bpm REAL,
        artwork TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (song_id, provider)
      )`,
    ],
  },
  {
    version: 2,
    name: "rooms log and history order",
    up: [
      `CREATE TABLE IF NOT EXISTS rooms_log (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        room TEXT NOT NULL,
        op TEXT NOT NULL,
        at TEXT NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS rooms_log_room ON rooms_log (room, seq)",
      "CREATE INDEX IF NOT EXISTS history_position ON history (position)",
    ],
  },
];

const LEDGER = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

/** The highest version applied (0 for a new database). */
export async function schemaVersion(db: SqlDriver): Promise<number> {
  await db.execute(LEDGER);
  const rows = await db.select<{ v: number | null }>("SELECT MAX(version) AS v FROM schema_migrations");
  return Number(rows[0]?.v ?? 0);
}

/** Applies every migration newer than the database, in order; returns the versions applied now. */
export async function migrate(db: SqlDriver, migrations: Migration[] = MIGRATIONS): Promise<number[]> {
  for (let i = 1; i < migrations.length; i++)
    if (migrations[i]!.version <= migrations[i - 1]!.version)
      throw new Error("migrations must be in increasing order");
  const current = await schemaVersion(db);
  const applied: number[] = [];
  for (const m of migrations) {
    if (m.version <= current) continue;
    for (const sql of m.up) await db.execute(sql);
    await db.execute("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [
      m.version,
      m.name,
      new Date().toISOString(),
    ]);
    applied.push(m.version);
  }
  return applied;
}

export interface MediaRow {
  songId: string;
  provider: string;
  streamId: string | null;
  bpm: number | null;
  artwork: string | null;
  updatedAt?: string;
}
type Snapshot = { id: string; createdAt?: string };

const parse = <T>(s: unknown): T | null => {
  if (typeof s !== "string") return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
};

/** Typed reads and writes over the migrated database. */
export class DeviceStore {
  constructor(private db: SqlDriver) {}

  async getDoc<T = unknown>(name: string): Promise<T | null> {
    const r = await this.db.select<{ value: string }>("SELECT value FROM documents WHERE name = ?", [name]);
    return r[0] ? parse<T>(r[0].value) : null;
  }
  async putDoc(name: string, value: unknown): Promise<void> {
    await this.db.execute(
      "INSERT INTO documents (name, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [name, JSON.stringify(value), new Date().toISOString()],
    );
  }

  /** "On this device": newest first, as the History page lists it. */
  async getHistory<T extends Snapshot = Snapshot>(): Promise<T[]> {
    const r = await this.db.select<{ value: string }>("SELECT value FROM history ORDER BY position");
    return r.map((x) => parse<T>(x.value)).filter((x): x is T => !!x);
  }
  /** Replaces the list (the client sends it whole and bounded, lib/history.ts). */
  async putHistory<T extends Snapshot>(list: T[]): Promise<void> {
    await this.db.execute("DELETE FROM history");
    let i = 0;
    for (const s of list) {
      if (!s || typeof s.id !== "string") continue;
      await this.db.execute(
        "INSERT OR REPLACE INTO history (id, position, created_at, value) VALUES (?, ?, ?, ?)",
        [s.id, i++, typeof s.createdAt === "string" ? s.createdAt : null, JSON.stringify(s)],
      );
    }
  }

  async getSetting<T = unknown>(key: string): Promise<T | null> {
    const r = await this.db.select<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
    return r[0] ? parse<T>(r[0].value) : null;
  }
  async putSetting(key: string, value: unknown): Promise<void> {
    await this.db.execute(
      "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      [key, JSON.stringify(value), new Date().toISOString()],
    );
  }

  /** Cached stream id, BPM and artwork of one recording per provider (Deezer previews, Spotify ids). */
  async putMedia(m: MediaRow): Promise<void> {
    await this.db.execute(
      "INSERT INTO media_cache (song_id, provider, stream_id, bpm, artwork, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(song_id, provider) DO UPDATE SET stream_id = excluded.stream_id, bpm = excluded.bpm, artwork = excluded.artwork, updated_at = excluded.updated_at",
      [m.songId, m.provider, m.streamId, m.bpm, m.artwork, new Date().toISOString()],
    );
  }
  async getMedia(songId: string): Promise<MediaRow[]> {
    const r = await this.db.select<{
      song_id: string;
      provider: string;
      stream_id: string | null;
      bpm: number | null;
      artwork: string | null;
      updated_at: string;
    }>("SELECT * FROM media_cache WHERE song_id = ? ORDER BY provider", [songId]);
    return r.map((x) => ({
      songId: x.song_id,
      provider: x.provider,
      streamId: x.stream_id,
      bpm: x.bpm,
      artwork: x.artwork,
      updatedAt: x.updated_at,
    }));
  }

  /** Rooms (docs/specs/r22-council.md): the ops this device sent or received, in order, for catch-up and undo. */
  async logRoomOp(room: string, op: unknown): Promise<void> {
    await this.db.execute("INSERT INTO rooms_log (room, op, at) VALUES (?, ?, ?)", [
      room,
      JSON.stringify(op),
      new Date().toISOString(),
    ]);
  }
  async roomLog(room: string): Promise<Array<{ seq: number; op: unknown; at: string }>> {
    const r = await this.db.select<{ seq: number; op: string; at: string }>(
      "SELECT seq, op, at FROM rooms_log WHERE room = ? ORDER BY seq",
      [room],
    );
    return r.map((x) => ({ seq: Number(x.seq), op: parse(x.op), at: x.at }));
  }
}
