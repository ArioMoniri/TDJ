/**
 * What a sync space holds, as records (merge.ts): one per night (`night:<id>`, with its name, versions, the night as
 * played and the import it came from), one for what T-DJ learned and the dancer favourites (`memory`), one for the
 * settings (`settings`) and one for the DJ's database edits (`overrides`). Each top-level key is a field, so two
 * devices that change different things (a rename here, a played night there; the theme here, the language there)
 * both keep their change.
 *
 * Never synced: model keys and agent connections (BYOK: they stay on each device), a DJ app's music folder (a path
 * on one computer), connector URLs and the Discogs token.
 *
 * The sync core (code, crypto, merge, engine, library, file, transports) imports nothing outside this folder, so the
 * apps' checks (apps/desktop/test/icloud.test.ts) run it as it is; the shapes below are the stores' (lib/types.ts:
 * HistorySnapshot, AgentMemory, UserSettings, AppOverrides), seen only as far as sync needs them.
 */
export interface Night {
  id: string;
  createdAt: string;
  updatedAt?: string;
  title?: string;
  source?: string;
  playlist: { tandas: unknown[] } & Record<string, unknown>;
  [k: string]: unknown;
}
export interface Library {
  history: Night[];
  memory: Record<string, unknown> & { updatedAt?: string };
  settings: Record<string, unknown> & { dataSources?: { discogsToken?: string } & Record<string, unknown> };
  overrides: Record<string, unknown> & { connectors?: unknown };
}

/** History keeps this many nights (HISTORY_MAX in lib/types.ts; library.test.ts checks they agree) */
export const HISTORY_LIMIT = 50;

export const NIGHT = "night:";
export const DEVICE = "device:";
export const SINGLE = ["memory", "settings", "overrides"] as const;
export type Single = (typeof SINGLE)[number];

/** settings that belong to one device (or are secrets) */
export const SETTINGS_LOCAL_ONLY = ["ai", "aiKeys", "acp", "djApps"] as const;

const omit = (o: object, keys: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (!keys.includes(k) && v !== undefined) out[k] = v;
  return out;
};

/** the settings fields a space holds (a Discogs token never leaves the device) */
export function syncedSettings(s: Library["settings"]): Record<string, unknown> {
  const out = omit(s, SETTINGS_LOCAL_ONLY);
  const ds = s.dataSources;
  if (ds && typeof ds === "object" && "discogsToken" in ds) {
    const { discogsToken: _t, ...rest } = ds;
    out.dataSources = rest;
  }
  return out;
}

/** settings from a space, laid over this device's (its local-only fields and Discogs token kept) */
export function settingsFromSpace(
  local: Library["settings"],
  values: Record<string, unknown>,
): Library["settings"] {
  const next: Record<string, unknown> = { ...values };
  for (const k of SETTINGS_LOCAL_ONLY) delete next[k];
  const ds = values.dataSources as Record<string, unknown> | undefined;
  const token = local.dataSources?.discogsToken;
  if (ds || token) next.dataSources = { ...(ds ?? {}), ...(token ? { discogsToken: token } : {}) };
  return next;
}

export const syncedMemory = (m: Library["memory"]) => omit(m, ["updatedAt"]);
export const syncedOverrides = (o: Library["overrides"]) => omit(o, ["updatedAt", "connectors"]);
export const nightFields = (h: Night) => omit(h, ["id"]);

/** a night from its record's values (null when the values do not make one) */
export function nightOf(name: string, values: Record<string, unknown>): Night | null {
  const h = { ...values, id: name.slice(NIGHT.length) } as Night;
  return typeof h.createdAt === "string" && h.playlist && Array.isArray(h.playlist.tandas) ? h : null;
}

/** The record names and fields of a library (the device records are the engine's). */
export function libraryFields(lib: Library): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const h of lib.history) if (h && typeof h.id === "string") out.set(`${NIGHT}${h.id}`, nightFields(h));
  out.set("memory", syncedMemory(lib.memory));
  out.set("settings", syncedSettings(lib.settings));
  out.set("overrides", syncedOverrides(lib.overrides));
  return out;
}
