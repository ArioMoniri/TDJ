import { deriveKeys, open, seal } from "./crypto";
import {
  HISTORY_LIMIT as HISTORY_MAX,
  type Night as HistorySnapshot,
  type Library,
  settingsFromSpace,
  syncedMemory,
  syncedOverrides,
  syncedSettings,
} from "./library";

/**
 * The fallback for anyone without a sync server or iCloud (docs/SYNC.md): the whole library in one file.
 * - plain JSON (`.tdjlibrary`): readable, for a backup or another tool;
 * - encrypted with a sync code: the same AES-GCM as sync, so the file is safe to leave in a cloud folder or mail,
 *   and opens on a device that knows the code.
 * Model keys, a DJ app's folder and other per-device settings are never in either (library.ts).
 */
export const LIBRARY_FORMAT = "tdj-library";
export const LIBRARY_ENCRYPTED = "tdj-library-encrypted";
export const LIBRARY_EXT = "tdjlibrary";

export interface LibraryFile {
  format: typeof LIBRARY_FORMAT;
  version: 1;
  exportedAt: string;
  nights: HistorySnapshot[];
  memory: Record<string, unknown>;
  settings: Record<string, unknown>;
  overrides: Record<string, unknown>;
}
interface EncryptedFile {
  format: typeof LIBRARY_ENCRYPTED;
  version: 1;
  blob: string;
}

export function libraryFile(lib: Library, now = new Date()): LibraryFile {
  return {
    format: LIBRARY_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    nights: lib.history,
    memory: syncedMemory(lib.memory),
    settings: syncedSettings(lib.settings),
    overrides: syncedOverrides(lib.overrides),
  };
}

export const exportPlain = (lib: Library) => `${JSON.stringify(libraryFile(lib), null, 2)}\n`;

export async function exportEncrypted(lib: Library, code: string): Promise<string> {
  const keys = await deriveKeys(code);
  const file: EncryptedFile = {
    format: LIBRARY_ENCRYPTED,
    version: 1,
    blob: await seal(keys, libraryFile(lib), LIBRARY_ENCRYPTED),
  };
  return `${JSON.stringify(file)}\n`;
}

export type ReadResult =
  | { ok: true; file: LibraryFile }
  | { ok: false; reason: "not-a-library" | "needs-code" | "wrong-code" };

/** Reads either kind; an encrypted file needs the code it was made with. */
export async function readLibraryFile(text: string, code?: string | null): Promise<ReadResult> {
  let x: unknown;
  try {
    x = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not-a-library" };
  }
  const o = x as { format?: string; blob?: string };
  if (o?.format === LIBRARY_ENCRYPTED && typeof o.blob === "string") {
    if (!code) return { ok: false, reason: "needs-code" };
    try {
      const keys = await deriveKeys(code);
      const inner = await open<LibraryFile>(keys, o.blob, LIBRARY_ENCRYPTED);
      return isLibrary(inner) ? { ok: true, file: inner } : { ok: false, reason: "not-a-library" };
    } catch {
      return { ok: false, reason: "wrong-code" };
    }
  }
  return isLibrary(x) ? { ok: true, file: x } : { ok: false, reason: "not-a-library" };
}

function isLibrary(x: unknown): x is LibraryFile {
  const f = x as LibraryFile;
  return !!f && f.format === LIBRARY_FORMAT && Array.isArray(f.nights);
}

/**
 * The library after an import: every night of the file joins History (a night already here keeps the newer of the
 * two by its last edit), and favourites, what T-DJ learned, the database edits and the settings come from the file.
 */
export function mergeImport(lib: Library, f: LibraryFile): { next: Partial<Library>; added: number } {
  const byId = new Map(lib.history.map((h) => [h.id, h]));
  let added = 0;
  for (const n of f.nights) {
    if (!n || typeof n.id !== "string" || typeof n.createdAt !== "string" || !n.playlist) continue;
    const cur = byId.get(n.id);
    const stamp = (h: HistorySnapshot) => h.updatedAt ?? h.createdAt;
    if (!cur) added++;
    if (!cur || stamp(n) > stamp(cur)) byId.set(n.id, n);
  }
  const history = [...byId.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, HISTORY_MAX);
  return {
    next: {
      history,
      memory: { ...lib.memory, ...(f.memory as Partial<Library["memory"]>) } as Library["memory"],
      overrides: {
        ...(f.overrides as Library["overrides"]),
        ...(lib.overrides.connectors ? { connectors: lib.overrides.connectors } : {}),
      },
      settings: settingsFromSpace(lib.settings, f.settings),
    },
    added,
  };
}
