"use client";
import { create } from "zustand";
import { recordEdit, undoEdit } from "./editHistory";
import { FEATURED } from "./featured";
import { saveHistory } from "./history";
import { t } from "./i18n";
import { useStore } from "./store";
import { toast } from "./toast";
import type { HistorySnapshot } from "./types";

/**
 * 2026-11 (the owner: "delete nights from the sidebar's Recent nights and from History"). One way for every place:
 * `askDeleteNights(ids)` opens the one confirm sheet (components/DeleteNights.tsx, mounted in the layout); Delete
 * there removes the entries from History in one step — their IndexedDB records (tdj-history-v2) and their drawn covers
 * go, the user's server row follows when History syncs to an account — and a toast (and ⌘Z on that page) brings them
 * back where they were for the rest of the session.
 *
 * Never deleted: the night the Booth has open or is playing (its entry stays, the action disabled with the reason).
 * The featured night is the app's own: it only leaves the recents ("Remove from recents"); its card still opens it.
 */

/** the night the Booth holds (once the Booth page mounted it exposes its store on `window`, lib/playback.ts) */
type BoothLike = { getState: () => { playlist: { id: string } | null; started?: boolean; state?: string } };
export function boothNight(): { id: string; playing: boolean } | null {
  if (typeof window === "undefined") return null;
  const b = (window as unknown as { __tdjBooth?: BoothLike }).__tdjBooth?.getState?.();
  const id = b?.playlist?.id;
  if (!id) return null;
  return { id, playing: !!b?.started && (b.state === "playing" || b.state === "cortina") };
}

/** the shipped featured night's own id (public/featured/*.json); an entry of it only leaves the recents */
const FEATURED_IDS = new Set(["tdj-5j"]);
export function isFeaturedEntry(s: Pick<HistorySnapshot, "playlist" | "title">): boolean {
  if (FEATURED_IDS.has(s.playlist?.id ?? "")) return true;
  return FEATURED.some((f) => s.playlist?.name === f.title || s.title === f.title);
}

/** why this entry cannot be deleted now (the Booth has it open or is playing it), or null */
export function protectedReason(s: Pick<HistorySnapshot, "playlist">, booth = boothNight()): string | null {
  if (!booth || booth.id !== s.playlist?.id) return null;
  return booth.playing ? t("nightDelete.playing_in_booth") : t("nightDelete.open_in_booth");
}

/** the words of the delete action for an entry: "Delete…" or, for the featured night, "Remove from recents" */
export const deleteLabel = (s: Pick<HistorySnapshot, "playlist" | "title">) =>
  isFeaturedEntry(s) ? t("nightDelete.remove_from_recents") : t("nightDelete.delete");

/** the confirm sheet's ask: the entries chosen (protected ones are listed with their reason, never removed) */
export interface DeleteAsk {
  ids: string[];
  /** "Clear all…": the whole History */
  all?: boolean;
}
export const useNightDelete = create<{ ask: DeleteAsk | null }>(() => ({ ask: null }));
export function askDeleteNights(ids: string[], o: { all?: boolean } = {}) {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (!uniq.length) return;
  useNightDelete.setState({ ask: { ids: uniq, ...(o.all ? { all: true } : {}) } });
}
export const closeDeleteNights = () => useNightDelete.setState({ ask: null });

/** what the sheet asks about: the entries that go, and the ones that stay with why */
export function deletePlan(
  history: HistorySnapshot[],
  ids: string[],
  booth = boothNight(),
): { go: HistorySnapshot[]; kept: Array<{ entry: HistorySnapshot; why: string }> } {
  const want = new Set(ids);
  const go: HistorySnapshot[] = [];
  const kept: Array<{ entry: HistorySnapshot; why: string }> = [];
  for (const h of history) {
    if (!want.has(h.id)) continue;
    const why = protectedReason(h, booth);
    if (why) kept.push({ entry: h, why });
    else go.push(h);
  }
  return { go, kept };
}

/**
 * History without `gone`, and the same History with them back where they were (`restore`): entries made since keep
 * their place at the top, the restored ones return to their positions in the order they were in.
 */
export function withoutEntries(list: HistorySnapshot[], gone: Set<string>): HistorySnapshot[] {
  return list.filter((h) => !gone.has(h.id));
}
export function restoreEntries(
  now: HistorySnapshot[],
  before: HistorySnapshot[],
  back: HistorySnapshot[],
): HistorySnapshot[] {
  const backIds = new Set(back.map((h) => h.id));
  const nowIds = new Set(now.map((h) => h.id));
  const ordered = before.filter((h) => backIds.has(h.id) || nowIds.has(h.id));
  const known = new Set(ordered.map((h) => h.id));
  // (an entry made after the delete comes first, as a new night does)
  const fresh = now.filter((h) => !known.has(h.id));
  const latest = new Map(now.map((h) => [h.id, h]));
  return [...fresh, ...ordered.map((h) => latest.get(h.id) ?? h)];
}

/** the drawn covers of these nights leave the page's cache (components/NightCover.tsx registers the hook) */
type CoverOf = { night: unknown; coverSeed?: string };
let dropCovers: ((nights: CoverOf[]) => void) | null = null;
export const onDropCovers = (fn: (nights: CoverOf[]) => void) => {
  dropCovers = fn;
};

/** removes the entries (never a protected one): IndexedDB now, the server row when synced; Undo restores them */
export function deleteNights(ids: string[]): number {
  const st = useStore.getState();
  const before = st.history;
  const { go } = deletePlan(before, ids);
  if (!go.length) return 0;
  const gone = new Set(go.map((h) => h.id));
  const cur = st.currentEntry;
  const apply = (list: HistorySnapshot[], current: string | null) => {
    useStore.setState({ history: list, currentEntry: current });
    saveHistory(list, useStore.getState().storageMode, true);
  };
  apply(withoutEntries(before, gone), cur && gone.has(cur) ? null : cur);
  try {
    dropCovers?.(go.map((h) => ({ night: h.playlist, coverSeed: h.coverSeed })));
  } catch {}
  const back = () => {
    const now = useStore.getState();
    apply(restoreEntries(now.history, before, go), now.currentEntry ?? (cur && gone.has(cur) ? cur : null));
  };
  const redo = () => {
    const now = useStore.getState();
    apply(
      withoutEntries(now.history, gone),
      now.currentEntry && gone.has(now.currentEntry) ? null : now.currentEntry,
    );
  };
  const label =
    go.length === 1
      ? isFeaturedEntry(go[0]!)
        ? t("nightDelete.removed_one", { title: go[0]!.title })
        : t("nightDelete.deleted_one", { title: go[0]!.title })
      : t("nightDelete.deleted_n", { n: go.length });
  const id = recordEdit({ label, undo: back, redo });
  // the toast's Undo walks the one history, so ⌘Z after it never undoes it twice
  toast(label, () => void undoEdit({ id }));
  return go.length;
}
