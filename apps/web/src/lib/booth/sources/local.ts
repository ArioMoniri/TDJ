"use client";
import { measureBuffer } from "../measure";
import {
  type FolderInfo,
  loadFolderHandle,
  loadFolderInfo,
  loadMatches,
  loadMeasurements,
  type MatchMap,
  type MeasurementMap,
  measurementKey,
  saveFolderHandle,
  saveFolderInfo,
  saveMatches,
  saveMeasurements,
} from "../persist";
import type { BoothRow } from "../plan";
import { type FolderEntry, isAudioName, matchAll, matchOne } from "./localMatch";
import { readTags, TAG_HEAD_BYTES } from "./tags";
import type { PlanEntity, PreparedItem, SourceAdapter } from "./types";

interface DecodeCtx {
  decodeAudioData(b: ArrayBuffer): Promise<AudioBuffer>;
  createBuffer?(channels: number, length: number, sampleRate: number): AudioBuffer;
}
/** An indexed file with the way to open it: a handle (Chromium) or the File from `<input webkitdirectory>`. */
interface Indexed extends FolderEntry {
  handle?: FileSystemFileHandle;
  file?: File;
}

export const canKeepFolder = () => typeof window !== "undefined" && "showDirectoryPicker" in window;

type Picker = (o: { id: string; mode: "read"; startIn: string }) => Promise<FileSystemDirectoryHandle>;
/** The permission methods the DOM lib does not declare yet (Chromium). */
type PermHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: "read" }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: "read" }) => Promise<PermissionState>;
};

/** Up to this many files are tag-read during a match; beyond it the file name decides. */
const TAG_READ_MAX = 4000;
/** Decoded buffers held at once (the current, the next and the one being prefetched). */
const BUFFERS_MAX = 3;

/**
 * The DJ's own files (round7-booth.md §8.1): a folder linked once (File System Access on Chromium, a persisted
 * handle) or picked per session elsewhere; an index of audio files with lazily read tags; a match map song → file
 * that survives reloads; decode + BS.1770 measurement at prepare time.
 */
export class LocalAdapter implements SourceAdapter {
  readonly kind = "file" as const;
  entries: Indexed[] = [];
  info: FolderInfo | null = null;
  matches: MatchMap = {};
  suggestions: Record<string, FolderEntry[]> = {};
  private measurements: MeasurementMap = {};
  private handle: FileSystemDirectoryHandle | null = null;
  private buffers = new Map<string, Promise<PreparedItem>>();
  private order: string[] = [];
  /** "granted" | "prompt" | "none" */
  permission: "granted" | "prompt" | "none" = "none";
  onChange: (() => void) | null = null;

  constructor(private ctx: () => DecodeCtx | null) {}

  private changed() {
    this.onChange?.();
  }

  /** Restore the persisted handle and match map (no permission prompt here: that needs a gesture). */
  async restore(): Promise<void> {
    const [h, info, matches, measurements] = await Promise.all([
      loadFolderHandle(),
      loadFolderInfo(),
      loadMatches(),
      loadMeasurements(),
    ]);
    this.matches = matches;
    this.measurements = measurements;
    this.info = info ?? null;
    const ph = h as PermHandle | undefined;
    if (ph && typeof ph.queryPermission === "function") {
      this.handle = ph;
      const p = await ph.queryPermission({ mode: "read" }).catch(() => "prompt" as PermissionState);
      this.permission = p === "granted" ? "granted" : "prompt";
      if (p === "granted") await this.indexHandle(ph);
    } else if (info?.session) {
      // a webkitdirectory pick does not survive the session: tell the DJ to pick again
      this.permission = "prompt";
    }
    this.changed();
  }

  /** Ask for the folder again (user gesture). */
  async requestPermission(): Promise<boolean> {
    if (!this.handle) return false;
    const p = await (this.handle as PermHandle)
      .requestPermission?.({ mode: "read" })
      .catch(() => "denied" as PermissionState);
    if (p !== "granted") return false;
    this.permission = "granted";
    await this.indexHandle(this.handle);
    this.changed();
    return true;
  }

  /** Chromium: pick a folder and keep its handle. */
  async linkFolder(): Promise<boolean> {
    const picker = (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;
    if (!picker) return false;
    let h: FileSystemDirectoryHandle;
    try {
      h = await picker.call(window, { id: "tdj-music", mode: "read", startIn: "music" });
    } catch {
      return false; // cancelled
    }
    this.handle = h;
    this.permission = "granted";
    await saveFolderHandle(h);
    await this.indexHandle(h);
    this.changed();
    return true;
  }

  /** Any browser: the `FileList` of an `<input type="file" webkitdirectory>`; kept for the session. */
  async useFileList(files: ArrayLike<File>, name = "folder"): Promise<void> {
    const list: Indexed[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      if (!isAudioName(f.name)) continue;
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      list.push({ path: rel, name: f.name, size: f.size, lastModified: f.lastModified, file: f });
    }
    this.entries = list;
    this.handle = null;
    this.permission = "granted";
    const top = list[0]?.path.split("/")[0];
    this.info = {
      name: top && list[0]!.path.includes("/") ? top : name,
      files: list.length,
      session: !canKeepFolder(),
    };
    await saveFolderInfo(this.info);
    this.changed();
  }

  private async indexHandle(h: FileSystemDirectoryHandle): Promise<void> {
    const list: Indexed[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string, depth: number) => {
      if (depth > 12) return;
      const it = (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries();
      for await (const [name, entry] of it) {
        if (entry.kind === "directory")
          await walk(entry as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1);
        else if (isAudioName(name)) {
          const fh = entry as FileSystemFileHandle;
          const f = await fh.getFile().catch(() => null);
          if (f)
            list.push({
              path: `${prefix}${name}`,
              name,
              size: f.size,
              lastModified: f.lastModified,
              handle: fh,
            });
        }
        if (list.length >= 50_000) return;
      }
    };
    await walk(h, "", 0);
    this.entries = list;
    this.info = { name: h.name, files: list.length };
    await saveFolderInfo(this.info);
  }

  async forgetFolder(): Promise<void> {
    this.handle = null;
    this.entries = [];
    this.info = null;
    this.permission = "none";
    await saveFolderHandle(null);
    await saveFolderInfo(null);
    this.changed();
  }

  private async fileOf(e: Indexed): Promise<File | null> {
    if (e.file) return e.file;
    if (e.handle) return e.handle.getFile().catch(() => null);
    return null;
  }

  /** Read tags for entries that have none yet (head 256 KB + tail 128 bytes), capped so a huge library stays quick. */
  private async readTagsFor(entries: Indexed[]): Promise<void> {
    let n = 0;
    for (const e of entries) {
      if (e.tags || n >= TAG_READ_MAX) continue;
      n++;
      const f = await this.fileOf(e);
      if (!f) {
        e.tags = {};
        continue;
      }
      try {
        const head = new Uint8Array(await f.slice(0, Math.min(f.size, TAG_HEAD_BYTES)).arrayBuffer());
        const tail = f.size > 128 ? new Uint8Array(await f.slice(f.size - 128).arrayBuffer()) : undefined;
        e.tags = readTags(head, tail);
      } catch {
        e.tags = {};
      }
    }
  }

  /** Match the plan against the index; manual picks are never overwritten. */
  async match(items: BoothRow[], naming = ""): Promise<MatchMap> {
    if (!this.entries.length) return this.matches;
    await this.readTagsFor(this.entries);
    const { matches, suggestions } = matchAll(items, this.entries, this.matches, naming);
    this.matches = { ...matches };
    this.suggestions = suggestions;
    await saveMatches(this.matches);
    this.changed();
    return this.matches;
  }

  /** The DJ picked a file by hand (from the suggestions or the file picker): remembered as manual. */
  async pick(itemId: string, entry: FolderEntry | File): Promise<void> {
    let e: Indexed | undefined;
    if (entry instanceof File) {
      e = {
        path: `picked/${entry.name}`,
        name: entry.name,
        size: entry.size,
        lastModified: entry.lastModified,
        file: entry,
      };
      this.entries.push(e);
    } else e = this.entries.find((x) => x.path === entry.path);
    if (!e) return;
    this.matches = {
      ...this.matches,
      [itemId]: { path: e.path, size: e.size, lastModified: e.lastModified, score: 1, manual: true },
    };
    delete this.suggestions[itemId];
    this.buffers.delete(itemId);
    await saveMatches(this.matches);
    this.changed();
  }

  async available() {
    if (this.permission === "granted" && this.entries.length) return { ok: true };
    if (this.permission === "prompt") return { ok: false, reason: "Folder permission needed" };
    return { ok: false, reason: "No folder linked" };
  }

  async resolve(item: BoothRow, _entity: PlanEntity) {
    const id = item.id ?? String(item.n);
    const m = this.matches[id];
    if (!m) return "missing" as const;
    const e = this.entries.find((x) => x.path === m.path);
    if (!e && !m.manual) return "missing" as const;
    if (!e) {
      const r = matchOne(item, this.entries, { prev: m });
      return r.record ? ("ready" as const) : ("missing" as const);
    }
    return "ready" as const;
  }

  prepare(item: BoothRow, _entity: PlanEntity): Promise<PreparedItem> {
    const id = item.id ?? String(item.n);
    const hit = this.buffers.get(id);
    if (hit) return hit;
    const p = this.decode(id).catch((e) => {
      this.buffers.delete(id);
      throw e;
    });
    this.buffers.set(id, p);
    this.order.push(id);
    while (this.order.length > BUFFERS_MAX) {
      const old = this.order.shift()!;
      if (old !== id) this.buffers.delete(old);
    }
    return p;
  }

  private async decode(id: string): Promise<PreparedItem> {
    const m = this.matches[id];
    const e = m ? this.entries.find((x) => x.path === m.path) : undefined;
    const ctx = this.ctx();
    if (!m || !e || !ctx) throw new Error("No file for this item");
    const f = await this.fileOf(e);
    if (!f) throw new Error(`Cannot open ${e.name}`);
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(await f.arrayBuffer());
    } catch {
      throw new Error(`Cannot decode ${e.name} (unsupported or protected file)`);
    }
    const key = measurementKey(e.path, e.size, e.lastModified);
    let measured = this.measurements[key];
    if (!measured) {
      measured = await measureBuffer(buffer);
      this.measurements = { ...this.measurements, [key]: measured };
      void saveMeasurements(this.measurements);
    }
    if (measured.correlation > 0.98 && buffer.numberOfChannels === 2 && ctx.createBuffer)
      buffer = downmix(ctx, buffer);
    return { kind: "file", buffer, measured, durationSec: buffer.duration };
  }

  release(itemId: string) {
    this.buffers.delete(itemId);
    this.order = this.order.filter((x) => x !== itemId);
  }

  /** Measurements by song / cortina id (for `planBooth`'s `measurements`): only matched files that were measured. */
  measurementsById(): Record<string, { lufs?: number; peakDbFS?: number; introSec?: number }> {
    const out: Record<string, { lufs?: number; peakDbFS?: number; introSec?: number }> = {};
    for (const [id, m] of Object.entries(this.matches)) {
      const x = this.measurements[measurementKey(m.path, m.size, m.lastModified)];
      if (x && Number.isFinite(x.lufs))
        out[id] = { lufs: x.lufs, peakDbFS: x.peakDbFS, introSec: x.introSec };
    }
    return out;
  }

  /** "118 of 121 matched" for the onboarding row. */
  matchedCount(items: BoothRow[]): { matched: number; total: number } {
    const ids = items.filter((i) => i.kind !== "break").map((i) => i.id ?? String(i.n));
    return { matched: ids.filter((id) => !!this.matches[id]).length, total: ids.length };
  }
}

/** Identical channels: one channel halves the memory of a 4 h night. */
function downmix(ctx: DecodeCtx, b: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer!(1, b.length, b.sampleRate);
  const l = b.getChannelData(0);
  const r = b.getChannelData(1);
  const m = out.getChannelData(0);
  for (let i = 0; i < b.length; i++) m[i] = (l[i]! + r[i]!) / 2;
  return out;
}
