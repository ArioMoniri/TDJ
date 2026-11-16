import { normTitle } from "./energy";
import type { DeezerCache } from "./enrich";
import type { Cortina, OrchestraProfile, Song } from "./types";

/**
 * Owner contributions (2026-11). The deployment owner's catalogue edits reach the repo:
 *
 *   device (Database edit, fill, add a side, a match) ──POST /api/owner/contributions──▶ DynamoDB `owner#contrib#…`
 *     ──"Merge owner contributions" workflow (or `pnpm data:apply-contributions <file>`)──▶
 *   data/sources/owner-overrides.json (keyed map with provenance) ──`pnpm index:build`──▶ data/index/owner.json
 *     ──buildLoaded (src/data.ts)──▶ the catalogue every runtime composes from, under each DJ's own database.
 *
 * Everything here is pure: the server route, the importer script and the workflow validate with the same code. A
 * contribution never carries a secret: values are rebuilt from a field whitelist and any string that looks like a key
 * or token refuses the whole batch. Personal categories (learning, favourites, history, grades) are archived in the
 * sources file when the owner opts in, and never change the catalogue.
 */

export const CATALOGUE_KINDS = [
  "song",
  "addedSong",
  "cortina",
  "profile",
  "scraped",
  "spotify",
  "youtube",
  "artwork",
] as const;
export const PERSONAL_KINDS = ["learning", "favourites", "history", "grades"] as const;
export type CatalogueKind = (typeof CATALOGUE_KINDS)[number];
export type PersonalKind = (typeof PERSONAL_KINDS)[number];
export type ContributionKind = CatalogueKind | PersonalKind;

export interface ContributionItem {
  kind: ContributionKind;
  /** song, cortina or orchestra id; a personal kind's id is the kind itself (one document per category) */
  id: string;
  /** the owner's current value; null withdraws the owner's change for that key */
  value: unknown;
  /** when the owner made the change (ISO) */
  at: string;
}
export interface ContributionBatch {
  v: 1;
  source: "web" | "app" | "file";
  items: ContributionItem[];
}
/** one contribution as the server stores it and the workflow reads it */
export interface StoredContribution {
  id: string;
  at: string;
  source?: string;
  items: ContributionItem[];
}

export const CONTRIB_LIMITS = {
  /** the request body */
  bodyBytes: 256_000,
  items: 400,
  /** one catalogue item, as JSON */
  itemBytes: 16_000,
  /** one personal document, as JSON */
  personalBytes: 48_000,
  str: 300,
  url: 600,
  idLen: 80,
  /** pending contributions the server keeps before it refuses more (the workflow drains them) */
  pending: 1000,
} as const;

const isCatalogue = (k: string): k is CatalogueKind => (CATALOGUE_KINDS as readonly string[]).includes(k);
const isPersonal = (k: string): k is PersonalKind => (PERSONAL_KINDS as readonly string[]).includes(k);
const ID = /^[A-Za-z0-9][\w.:-]{0,79}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const VIDEO = /^[A-Za-z0-9_-]{6,64}$/;
const SPOTIFY_TRACK = /^spotify:track:[A-Za-z0-9]{22}$/;
const DIGITS = /^\d{1,15}$/;
const DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const KEY = /^[A-G][#♯b♭]?m?$/;
/** strings no contribution may hold: API keys, tokens, private keys, credentials */
const SECRET =
  /(sk-ant-|sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-|Bearer\s+\S|-----BEGIN|access_token|refresh_token|client_secret|passphrase|password)/i;

const RHYTHMS = new Set([
  "tango",
  "vals",
  "milonga",
  "cancion",
  "foxtrot",
  "pasodoble",
  "ranchera",
  "zamba",
  "polca",
  "estilo",
  "corrido",
  "tonada",
  "shimmy",
  "candombe",
  "marcha",
  "other",
  "unknown",
]);
const ERAS = new Set([
  "guardia-vieja",
  "guardia-nueva",
  "golden-early",
  "golden-peak",
  "golden-late",
  "post-golden",
  "nuevo",
  "contemporary",
  "unknown",
]);
const STYLES = new Set(["rhythmic", "lyrical", "dramatic", "guardia", "nuevo", "contemporary", "balanced"]);

/* ---------- field checks: each returns the clean value, or BAD ---------- */

const BAD = Symbol("bad");
type Check = (v: unknown) => unknown;
const str =
  (max: number = CONTRIB_LIMITS.str, re?: RegExp): Check =>
  (v) =>
    typeof v === "string" && v.length <= max && (!re || re.test(v)) ? v : BAD;
const nullable =
  (c: Check): Check =>
  (v) =>
    v === null ? null : c(v);
const num =
  (min: number, max: number, int = false): Check =>
  (v) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max && (!int || Number.isInteger(v))
      ? v
      : BAD;
const bool: Check = (v) => (typeof v === "boolean" ? v : BAD);
const oneOf =
  (set: Set<string>): Check =>
  (v) =>
    typeof v === "string" && set.has(v) ? v : BAD;
const httpsUrl: Check = (v) => {
  if (typeof v !== "string" || v.length > CONTRIB_LIMITS.url) return BAD;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password ? v : BAD;
  } catch {
    return BAD;
  }
};
const strList =
  (maxItems: number, c: Check): Check =>
  (v) => {
    if (!Array.isArray(v) || v.length > maxItems) return BAD;
    const out = v.map(c);
    return out.includes(BAD) ? BAD : out;
  };
type RecordCheck = Check & { shape: Record<string, Check> };
const record = (shape: Record<string, Check>, required: string[] = []): RecordCheck => {
  const check = (v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return BAD;
    const out: Record<string, unknown> = {};
    for (const [k, c] of Object.entries(shape)) {
      if (!Object.hasOwn(v, k)) continue;
      const x = (v as Record<string, unknown>)[k];
      if (x === undefined) continue;
      const cleaned = c(x);
      if (cleaned === BAD) return BAD;
      out[k] = cleaned;
    }
    for (const r of required) if (!(r in out)) return BAD;
    return out;
  };
  return Object.assign(check, { shape });
};

const SPOTIFY_REC = record(
  {
    uri: str(64, SPOTIFY_TRACK),
    url: httpsUrl,
    durationMs: num(10_000, 1_800_000, true),
    album: str(),
    matched: str(),
    release: str(10, DATE),
  },
  ["uri"],
);
const RESOLVED = record(
  {
    provider: oneOf(new Set(["deezer", "spotify", "itunes", "musicbrainz"])),
    id: str(64, /^[\w:.-]{1,64}$/),
    title: str(),
    artist: str(),
    album: str(),
    year: nullable(num(1890, 2035, true)),
    durationMs: num(10_000, 1_800_000, true),
    url: httpsUrl,
    artwork: httpsUrl,
    matchedAt: str(40),
    confidence: num(0, 1),
  },
  ["provider", "id", "title", "artist"],
);

/** the song fields an owner patch may carry (the Database's catalogue facts; never notes, audio or free text blobs) */
const SONG_FIELDS: Record<string, Check> = {
  title: str(200),
  rhythm: oneOf(RHYTHMS),
  rhythmCode: str(4),
  orchestra: str(120),
  orchestraId: str(80, SLUG),
  singer: nullable(str(160)),
  singerId: nullable(str(80, SLUG)),
  vocal: bool,
  year: nullable(num(1890, 2035, true)),
  date: nullable(str(10, DATE)),
  era: oneOf(ERAS),
  album: nullable(str(200)),
  bpm: num(30, 260),
  energy: num(0, 100),
  durationSec: num(30, 1200, true),
  yearApprox: bool,
  vocalStyle: oneOf(new Set(["estribillo", "cantor"])),
  spotify: nullable(SPOTIFY_REC),
  resolved: nullable(RESOLVED),
  hidden: bool,
  hiddenScope: oneOf(new Set(["title", "copy"])),
  // the DJ's own song data (lib/types.ts SongPatch)
  key: str(4, KEY),
  gainDb: num(-40, 20),
  artwork: httpsUrl,
  release: str(10, DATE),
  deezerId: str(15, DIGITS),
};
const SONG_PATCH = record(SONG_FIELDS);
const ADDED_SONG = record(
  { id: str(80, ID), source: str(40), dateRange: strList(2, num(1890, 2035, true)), ...SONG_FIELDS },
  ["id", "title", "rhythm", "orchestra", "orchestraId", "vocal", "era"],
);
const CORTINA = record(
  {
    id: str(80, ID),
    title: str(200),
    artist: str(200),
    genre: str(60),
    culture: str(40),
    language: str(40),
    energy: num(0, 100),
    year: num(1890, 2035, true),
    trend: bool,
    startSec: num(0, 1200),
    lengthSec: num(10, 300),
    tags: strList(20, str(60)),
    spotify: nullable(SPOTIFY_REC),
    resolved: nullable(RESOLVED),
  },
  ["id", "title", "artist", "genre", "culture", "energy"],
);
const PROFILE = record({
  name: str(120),
  style: oneOf(STYLES),
  energy: num(0, 100),
  tier: num(1, 3, true),
  phase: strList(5, oneOf(new Set(["warmup", "build", "peak", "cooldown", "any"]))),
  notBefore: num(0, 1),
  notAfter: num(0, 1),
  maxPerNight: num(0, 20, true),
  neverClose: bool,
  avoidMainPeak: bool,
  tangoOnly: bool,
  vocalShift: num(-50, 50),
  instrumentalShift: num(-50, 50),
  bestYears: strList(2, num(1890, 2035, true)),
  notes: str(600),
});
const SCRAPED = record({
  bpm: num(30, 260),
  key: str(4, KEY),
  gainDb: num(-40, 20),
  artwork: httpsUrl,
  release: str(10, DATE),
  deezerId: str(15, DIGITS),
  spotifyUri: str(64, SPOTIFY_TRACK),
  vocalStyle: oneOf(new Set(["estribillo", "cantor"])),
  fields: (v) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return BAD;
    const out: Record<string, string> = {};
    for (const [k, s] of Object.entries(v)) {
      if (!/^\w{1,20}$/.test(k) || typeof s !== "string" || s.length > 40) return BAD;
      out[k] = s;
    }
    return out;
  },
});
const SPOTIFY_MATCH = record(
  { uri: str(64, SPOTIFY_TRACK), matched: str(), durationMs: num(10_000, 1_800_000, true), url: httpsUrl },
  ["uri"],
);

const CATALOGUE_CHECK: Record<CatalogueKind, Check> = {
  song: SONG_PATCH,
  addedSong: ADDED_SONG,
  cortina: CORTINA,
  profile: PROFILE,
  scraped: SCRAPED,
  spotify: SPOTIFY_MATCH,
  youtube: str(64, VIDEO),
  artwork: httpsUrl,
};

/** a personal document: plain JSON (no functions, no prototype keys), bounded depth and size */
function plainJson(v: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (v === null || typeof v === "boolean" || typeof v === "string") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => plainJson(x, depth + 1));
  if (typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype" || k.length > 120) return false;
      if (!plainJson(x, depth + 1)) return false;
    }
    return true;
  }
  return false;
}
/** every string in a value, keys included */
function* strings(v: unknown, depth = 0): Generator<string> {
  if (depth > 14) return;
  if (typeof v === "string") yield v;
  else if (Array.isArray(v)) for (const x of v) yield* strings(x, depth + 1);
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      yield k;
      yield* strings(x, depth + 1);
    }
}
export const looksSecret = (v: unknown): boolean => {
  for (const s of strings(v)) if (SECRET.test(s)) return true;
  return false;
};
const isoAt = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 40 && Number.isFinite(Date.parse(v));

export type ItemResult = { ok: true; item: ContributionItem } | { ok: false; error: string };
/** one item, rebuilt from the whitelist */
export function validateItem(x: unknown): ItemResult {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, error: "not an object" };
  const { kind, id, value, at } = x as Record<string, unknown>;
  if (typeof kind !== "string" || (!isCatalogue(kind) && !isPersonal(kind)))
    return { ok: false, error: `unknown kind ${String(kind).slice(0, 20)}` };
  if (typeof id !== "string" || !ID.test(id)) return { ok: false, error: "bad id" };
  if (!isoAt(at)) return { ok: false, error: "bad time" };
  if (looksSecret(x)) return { ok: false, error: "looks like a secret" };
  if (isPersonal(kind)) {
    if (id !== kind) return { ok: false, error: "a personal document's id is its category" };
    if (value !== null && (!value || typeof value !== "object" || !plainJson(value)))
      return { ok: false, error: "personal value must be plain JSON" };
    if (JSON.stringify(value).length > CONTRIB_LIMITS.personalBytes)
      return { ok: false, error: "personal value too large" };
    return { ok: true, item: { kind, id, value, at } };
  }
  if (value === null) return { ok: true, item: { kind, id, value: null, at } };
  if (JSON.stringify(value ?? null).length > CONTRIB_LIMITS.itemBytes)
    return { ok: false, error: "item too large" };
  const clean = CATALOGUE_CHECK[kind](value);
  if (clean === BAD) return { ok: false, error: `invalid ${kind}` };
  if (clean && typeof clean === "object" && !Array.isArray(clean)) {
    if (!Object.keys(clean).length) return { ok: false, error: `empty ${kind}` };
    if ((kind === "addedSong" || kind === "cortina") && (clean as { id?: string }).id !== id)
      return { ok: false, error: "the record's id is not the item's id" };
  }
  return { ok: true, item: { kind, id, value: clean, at } };
}

/**
 * The device side: a value from the DJ's database → the item the server accepts, or null. Only whitelisted fields
 * are kept and each one that fails its check is dropped on its own (a DJ's free-text notes, analysed audio or an
 * out-of-range BPM never travel), then the item is validated exactly as the server will.
 */
export function prepareItem(
  kind: ContributionKind,
  id: string,
  value: unknown,
  at: string,
): ContributionItem | null {
  let v = value;
  if (isCatalogue(kind) && v && typeof v === "object" && !Array.isArray(v)) {
    const shape = (CATALOGUE_CHECK[kind] as Partial<RecordCheck>).shape;
    if (shape) {
      const picked: Record<string, unknown> = {};
      for (const [k, c] of Object.entries(shape)) {
        const x = (v as Record<string, unknown>)[k];
        if (x !== undefined && c(x) !== BAD && !looksSecret(x)) picked[k] = x;
      }
      v = picked;
    }
  }
  const r = validateItem({ kind, id, value: v, at });
  return r.ok ? r.item : null;
}

export type BatchResult = { ok: true; batch: ContributionBatch } | { ok: false; error: string };
/** a whole batch: every item must pass (a client that sends one bad item is a broken or hostile client) */
export function validateContributionBatch(x: unknown): BatchResult {
  if (!x || typeof x !== "object" || Array.isArray(x)) return { ok: false, error: "not an object" };
  const b = x as Record<string, unknown>;
  if (b.v !== 1) return { ok: false, error: "unknown version" };
  if (!Array.isArray(b.items)) return { ok: false, error: "items must be a list" };
  if (!b.items.length) return { ok: false, error: "nothing to contribute" };
  if (b.items.length > CONTRIB_LIMITS.items)
    return { ok: false, error: `at most ${CONTRIB_LIMITS.items} items per batch` };
  const source = b.source === "app" || b.source === "file" ? b.source : "web";
  const items: ContributionItem[] = [];
  for (let i = 0; i < b.items.length; i++) {
    const r = validateItem(b.items[i]);
    if (!r.ok) return { ok: false, error: `item ${i}: ${r.error}` };
    items.push(r.item);
  }
  return { ok: true, batch: { v: 1, source, items } };
}

/* ---------- the sources file: data/sources/owner-overrides.json ---------- */

export interface OwnerEntry {
  value: unknown;
  at: string;
  /** the contribution that set it */
  contribution: string;
}
export interface OwnerOverridesFile {
  about: string;
  version: 1;
  updatedAt?: string;
  entries: Partial<Record<CatalogueKind, Record<string, OwnerEntry>>>;
  personal: Partial<Record<PersonalKind, OwnerEntry>>;
  /** contribution ids already merged, newest last (bounded) */
  merged: string[];
}
const MERGED_KEEP = 5000;
export const OWNER_ABOUT =
  "The deployment owner's catalogue edits (Database corrections, filled values, added sides and cortinas, matches, artwork), merged from contributions with provenance. Edit only through `pnpm data:apply-contributions`; `pnpm index:build` projects it into data/index/owner.json. `personal` is the owner's opt-in archive and never changes the catalogue.";
export const emptyOwnerFile = (): OwnerOverridesFile => ({
  about: OWNER_ABOUT,
  version: 1,
  entries: {},
  personal: {},
  merged: [],
});

/** a parsed file of unknown shape → a well-formed one (unknown kinds and malformed entries dropped) */
export function normalizeOwnerFile(x: unknown): OwnerOverridesFile {
  const out = emptyOwnerFile();
  if (!x || typeof x !== "object") return out;
  const f = x as Partial<OwnerOverridesFile>;
  if (typeof f.updatedAt === "string") out.updatedAt = f.updatedAt;
  const entry = (e: unknown): e is OwnerEntry =>
    !!e && typeof e === "object" && isoAt((e as OwnerEntry).at) && "value" in (e as object);
  for (const k of CATALOGUE_KINDS) {
    const m = f.entries?.[k];
    if (!m || typeof m !== "object") continue;
    const kept: Record<string, OwnerEntry> = {};
    for (const [id, e] of Object.entries(m)) if (ID.test(id) && entry(e)) kept[id] = e;
    if (Object.keys(kept).length) out.entries[k] = kept;
  }
  for (const k of PERSONAL_KINDS) if (entry(f.personal?.[k])) out.personal[k] = f.personal![k]!;
  if (Array.isArray(f.merged)) out.merged = f.merged.filter((s) => typeof s === "string").slice(-MERGED_KEEP);
  return out;
}

const sortKeys = <T>(m: Record<string, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/**
 * Merge stored contributions into the sources file. Each item is re-validated (the table is not trusted more than
 * the request was); per key the newer `at` wins whatever order the contributions come in; a null value withdraws the
 * owner's entry; a contribution already merged is skipped, so a re-run after a failed push changes nothing.
 */
export function applyContributions(
  file: OwnerOverridesFile,
  contributions: StoredContribution[],
): { file: OwnerOverridesFile; applied: string[]; skipped: Array<{ id: string; why: string }> } {
  const next: OwnerOverridesFile = structuredClone(normalizeOwnerFile(file));
  const done = new Set(next.merged);
  const applied: string[] = [];
  const skipped: Array<{ id: string; why: string }> = [];
  const sorted = [...contributions].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const c of sorted) {
    if (!c || typeof c.id !== "string" || !ID.test(c.id)) {
      skipped.push({ id: String(c?.id ?? "?").slice(0, 80), why: "bad contribution id" });
      continue;
    }
    if (done.has(c.id)) {
      skipped.push({ id: c.id, why: "already merged" });
      continue;
    }
    const v = validateContributionBatch({ v: 1, source: c.source, items: c.items });
    if (!v.ok) {
      skipped.push({ id: c.id, why: v.error });
      continue;
    }
    for (const it of v.batch.items) {
      const entry: OwnerEntry = { value: it.value, at: it.at, contribution: c.id };
      if (isPersonal(it.kind)) {
        const cur = next.personal[it.kind];
        if (cur && cur.at > it.at) continue;
        if (it.value === null) delete next.personal[it.kind];
        else next.personal[it.kind] = entry;
        continue;
      }
      const kind = it.kind as CatalogueKind;
      const m = next.entries[kind] ?? {};
      const cur = m[it.id];
      if (cur && cur.at > it.at) continue;
      if (it.value === null) delete m[it.id];
      else m[it.id] = entry;
      if (Object.keys(m).length) next.entries[kind] = sortKeys(m);
      else delete next.entries[kind];
    }
    done.add(c.id);
    next.merged.push(c.id);
    applied.push(c.id);
    if (!next.updatedAt || c.at > next.updatedAt) next.updatedAt = c.at;
  }
  next.merged = next.merged.slice(-MERGED_KEEP);
  return { file: next, applied, skipped };
}

/* ---------- the projection: data/index/owner.json ---------- */

export type OwnerSongPatch = Partial<Song> & { hidden?: boolean; hiddenScope?: "title" | "copy" };
export interface OwnerLayer {
  version: 1;
  songs: Record<string, OwnerSongPatch>;
  addedSongs: Song[];
  cortinas: Record<string, Cortina>;
  profiles: Record<string, Partial<OrchestraProfile>>;
  deezer: DeezerCache;
  /** song or cortina id → cover url (served with the shipped covers, lib/api/artwork.ts) */
  artwork: Record<string, string>;
  /** song id → YouTube video id */
  youtube: Record<string, string>;
}
export const emptyOwnerLayer = (): OwnerLayer => ({
  version: 1,
  songs: {},
  addedSongs: [],
  cortinas: {},
  profiles: {},
  deezer: {},
  artwork: {},
  youtube: {},
});

/** the Song fields of a patch that the index row takes (the DJ-data fields go to the caches instead) */
const DJ_DATA = new Set(["key", "gainDb", "artwork", "release", "deezerId"]);

/** The sources file → the layer the runtimes apply. Personal documents are left out. */
export function projectOwnerLayer(file: OwnerOverridesFile): OwnerLayer {
  const f = normalizeOwnerFile(file);
  const out = emptyOwnerLayer();
  const e = f.entries;
  const patch = (id: string) => {
    out.songs[id] ??= {};
    return out.songs[id]!;
  };
  for (const [id, x] of Object.entries(e.song ?? {})) {
    const v = x.value as Record<string, unknown>;
    const p: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) if (!DJ_DATA.has(k)) p[k] = val;
    if (Object.keys(p).length) Object.assign(patch(id), p);
    if (typeof v.artwork === "string") out.artwork[id] = v.artwork;
  }
  for (const [id, x] of Object.entries(e.spotify ?? {})) {
    const p = patch(id);
    if (p.spotify === undefined) p.spotify = x.value as Song["spotify"];
  }
  for (const [id, x] of Object.entries(e.scraped ?? {})) {
    const v = x.value as Record<string, unknown>;
    const p = patch(id);
    if (typeof v.bpm === "number" && p.bpm === undefined) p.bpm = v.bpm;
    if (typeof v.vocalStyle === "string" && p.vocalStyle === undefined)
      p.vocalStyle = v.vocalStyle as Song["vocalStyle"];
    if (typeof v.spotifyUri === "string" && p.spotify === undefined) p.spotify = { uri: v.spotifyUri };
    if (typeof v.artwork === "string") out.artwork[id] ??= v.artwork;
    if (typeof v.deezerId === "string")
      out.deezer[id] = {
        id: v.deezerId,
        ...(typeof v.bpm === "number" ? { bpm: v.bpm } : {}),
        ...(typeof v.gainDb === "number" ? { gain: v.gainDb } : {}),
        ...(typeof v.release === "string" ? { release: v.release } : {}),
        source: "owner",
        fetchedAt: x.at,
      };
  }
  for (const [id, x] of Object.entries(e.artwork ?? {})) out.artwork[id] = x.value as string;
  for (const [id, x] of Object.entries(e.youtube ?? {})) out.youtube[id] = x.value as string;
  for (const x of Object.values(e.addedSong ?? {})) out.addedSongs.push(x.value as Song);
  for (const [id, x] of Object.entries(e.cortina ?? {})) out.cortinas[id] = x.value as Cortina;
  for (const [id, x] of Object.entries(e.profile ?? {}))
    out.profiles[id] = x.value as Partial<OrchestraProfile>;
  for (const [id, p] of Object.entries(out.songs)) if (!Object.keys(p).length) delete out.songs[id];
  out.songs = sortKeys(out.songs);
  out.artwork = sortKeys(out.artwork);
  out.youtube = sortKeys(out.youtube);
  out.deezer = sortKeys(out.deezer);
  out.addedSongs.sort((a, b) => (a.id < b.id ? -1 : 1));
  return out;
}

const layerEmpty = (l: OwnerLayer) =>
  !Object.keys(l.songs).length &&
  !l.addedSongs.length &&
  !Object.keys(l.cortinas).length &&
  !Object.keys(l.profiles).length &&
  !Object.keys(l.deezer).length;

const hideKeyOf = (s: Pick<Song, "orchestraId" | "title">) => `${s.orchestraId}|${normTitle(s.title)}`;

/**
 * The layer over the committed index (src/data.ts → buildLoaded), before the catalogue is built: so the server's
 * per-DJ catalogues (built from `raw`) carry it too, and each DJ's own database still wins over it.
 */
export function applyOwnerLayer<
  T extends { songs: Song[]; profiles: OrchestraProfile[]; cortinas: Cortina[]; deezer: DeezerCache },
>(base: T, layer: OwnerLayer | null | undefined): T {
  if (!layer || layerEmpty(layer)) return base;
  const patchOf = (s: Song) =>
    layer.songs[s.id] ?? s.altIds?.map((a) => layer.songs[a]).find((p) => p) ?? undefined;
  const hiddenTitles = new Set<string>();
  const hiddenCopies = new Set<string>();
  for (const s of base.songs) {
    const p = patchOf(s);
    if (!p?.hidden) continue;
    if (p.hiddenScope === "copy") hiddenCopies.add(s.id);
    else hiddenTitles.add(hideKeyOf({ ...s, ...p }));
  }
  const songs: Song[] = [];
  for (const s of base.songs) {
    if (hiddenCopies.has(s.id) || hiddenTitles.has(hideKeyOf(s))) continue;
    const p = patchOf(s);
    if (!p) {
      songs.push(s);
      continue;
    }
    const { hidden: _h, hiddenScope: _hs, ...fields } = p;
    songs.push({ ...s, ...fields });
  }
  const ids = new Set(base.songs.map((s) => s.id));
  for (const s of layer.addedSongs) if (!ids.has(s.id)) songs.push(s);
  const profiles = base.profiles.map((p) => (layer.profiles[p.id] ? { ...p, ...layer.profiles[p.id] } : p));
  const cids = new Set(base.cortinas.map((c) => c.id));
  const cortinas = [
    ...base.cortinas.map((c) => layer.cortinas[c.id] ?? c),
    ...Object.values(layer.cortinas).filter((c) => !cids.has(c.id)),
  ];
  const deezer = Object.keys(layer.deezer).length ? { ...base.deezer, ...layer.deezer } : base.deezer;
  return { ...base, songs, profiles, cortinas, deezer };
}

/** a parsed data/index/owner.json of unknown shape → a layer (absent or malformed parts are empty) */
export function normalizeOwnerLayer(x: unknown): OwnerLayer {
  const out = emptyOwnerLayer();
  if (!x || typeof x !== "object") return out;
  const l = x as Partial<OwnerLayer>;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
  out.songs = obj(l.songs) as OwnerLayer["songs"];
  out.addedSongs = Array.isArray(l.addedSongs) ? l.addedSongs : [];
  out.cortinas = obj(l.cortinas) as OwnerLayer["cortinas"];
  out.profiles = obj(l.profiles) as OwnerLayer["profiles"];
  out.deezer = obj(l.deezer) as DeezerCache;
  out.artwork = obj(l.artwork) as OwnerLayer["artwork"];
  out.youtube = obj(l.youtube) as OwnerLayer["youtube"];
  return out;
}
