"use client";
import { create } from "zustand";
import { bootBooth, useBoothLoad } from "./booth/loadState";
import { recordEdit, undoEdit } from "./editHistory";
import { t } from "./i18n";
import { isFeaturedEntry } from "./nightDelete";
import { useStore } from "./store";
import { toast } from "./toast";
import type { HistorySnapshot, Playlist } from "./types";

/**
 * 2026-11 (the owner: "you can't select which night to play in the Booth, or from History"; "rename and delete
 * everywhere"). The actions on a night that every place shares — History's rows and menus, the sidebar's Recent
 * nights, Compose and the Booth's Night menu:
 *
 * - Play in the Booth: the night becomes the app's current night and the Booth boots on it. When ANOTHER night is
 *   playing in the Booth it never happens silently: the one sheet (components/NightActions.tsx) asks first (replace /
 *   cancel); the replaced night's log goes to History and Undo brings it back where it was.
 * - Clear / close the night and Reset (the Booth): lib/booth/loadNight.ts, through `takeBooth` / `restoreBooth` here.
 * - Rename: the History entry, and the night's own name wherever it is open (Compose, the Booth); Undo puts it back.
 *
 * The Booth's engine is never imported here: a page that only sends a night reads the Booth through the store the
 * Booth page puts on `window` (`__tdjBooth`), or the one lib/booth/loadNight.ts registers.
 */

type BoothState = {
  playlist: Playlist | null;
  started?: boolean;
  state?: string;
  planIndex?: number;
  endNight?: () => Promise<void>;
};
export interface BoothHandle {
  getState: () => BoothState;
  setState?: (p: Partial<BoothState>) => void;
}
let handle: BoothHandle | null = null;
/** the Booth's store, once a module that has it registers (lib/booth/loadNight.ts; tests) */
export function setBoothHandle(h: BoothHandle | null): void {
  handle = h;
}
function booth(): BoothHandle | null {
  if (handle) return handle;
  if (typeof window === "undefined") return null;
  return (window as unknown as { __tdjBooth?: BoothHandle }).__tdjBooth ?? null;
}

/** the night the Booth holds now (none while it is cleared), and whether it is playing (started, not stopped) */
export function boothNow(): { playlist: Playlist; live: boolean; planIndex: number } | null {
  const b = booth()?.getState();
  if (!b?.playlist) return null;
  const live = !!b.started && b.state !== "stopped" && b.state !== "idle";
  if (useBoothLoad.getState().cleared && !live) return null;
  return { playlist: b.playlist, live, planIndex: b.planIndex ?? 0 };
}

/** a night as the Booth takes it: every tanda unlocked (the Booth locks what has played) */
export const freshNight = (p: Playlist): Playlist => ({
  ...p,
  tandas: p.tandas.map((x) => ({ ...x, locked: false })),
});

/** what the Booth had, for an Undo: the app's night, its History entry, cleared or not, where the playhead was */
export interface BoothTake {
  playlist: Playlist | null;
  currentEntry: string | null;
  cleared: boolean;
  planIndex: number;
  live: boolean;
}
export function takeBooth(): BoothTake {
  const st = useStore.getState();
  const b = booth()?.getState();
  const live = !!b?.started && b.state !== "stopped" && b.state !== "idle";
  return {
    // (a night that plays is the Booth's own, even when Compose has opened another since)
    playlist: live && b?.playlist ? b.playlist : st.playlist,
    currentEntry: st.currentEntry,
    cleared: useBoothLoad.getState().cleared,
    planIndex: b?.planIndex ?? 0,
    live,
  };
}
/** the Booth back as it was (stopped: an Undo never restarts the music; the playhead where it was) */
export function restoreBooth(x: BoothTake): void {
  const st = useStore.getState();
  if (x.playlist && st.playlist !== x.playlist) st.setPlaylist(x.playlist);
  st.setCurrentEntry(x.currentEntry);
  if (x.cleared) useBoothLoad.setState({ cleared: true, pending: null });
  else bootBooth({ resumeAt: x.planIndex > 0 ? x.planIndex : null });
}

/** ends the night that plays (its log goes to History), if one does */
export async function endLiveNight(): Promise<void> {
  const s = booth()?.getState();
  if (s?.started && s.state !== "stopped" && s.state !== "idle") await s.endNight?.();
}

/**
 * Loads `p` into the Booth now: a night that plays ends first (the caller asked). Undo brings the Booth back as it
 * was when the load replaced another night. `keep`: Compose's own night (its locks stay as they are).
 */
export async function loadIntoBooth(
  p: Playlist,
  o: { historyId?: string | null; keep?: boolean } = {},
): Promise<void> {
  const before = takeBooth();
  const replaced = before.live && before.playlist?.id !== p.id;
  await endLiveNight();
  const st = useStore.getState();
  if (o.historyId !== undefined) st.setCurrentEntry(o.historyId);
  if (!(o.keep && st.playlist?.id === p.id)) st.setPlaylist(freshNight(p));
  bootBooth();
  const name = p.name || t("booth.load.untitled");
  if (!replaced) {
    // (Compose's own night going to the Booth needs no word: the Booth opens on it)
    if (!o.keep) toast(t("booth.load.loaded", { name }));
    return;
  }
  const after = takeBooth();
  const label = t("nights.replaced", { name });
  const id = recordEdit({
    label,
    scope: "/booth",
    undo: () => restoreBooth(before),
    redo: () => restoreBooth({ ...after, planIndex: 0 }),
  });
  toast(label, () => void undoEdit({ id }));
}

/* ---------- Play in the Booth (History, the sidebar, Compose, an import) ---------- */

export interface PlayAsk {
  playlist: Playlist;
  historyId?: string | null;
  keep?: boolean;
  /** the night that plays now (the sheet names it) */
  playing: string;
  go: () => void;
}
export const usePlayAsk = create<{ ask: PlayAsk | null }>(() => ({ ask: null }));

/**
 * Plays `p` in the Booth: loads it and opens the Booth (`go`). Another night playing there → the sheet asks first
 * ("asked"); the same night playing → the Booth just opens ("same").
 */
export async function playInBooth(
  p: Playlist,
  o: { historyId?: string | null; keep?: boolean; go: () => void },
): Promise<"loaded" | "asked" | "same"> {
  const now = boothNow();
  if (now?.live && now.playlist.id === p.id) {
    o.go();
    return "same";
  }
  if (now?.live) {
    usePlayAsk.setState({
      ask: {
        playlist: p,
        historyId: o.historyId,
        keep: o.keep,
        playing: now.playlist.name || t("booth.load.untitled"),
        go: o.go,
      },
    });
    return "asked";
  }
  await loadIntoBooth(p, o);
  o.go();
  return "loaded";
}
/** the sheet's Replace: the playing night ends, `p` loads, the Booth opens */
export async function confirmPlayAsk(): Promise<void> {
  const a = usePlayAsk.getState().ask;
  usePlayAsk.setState({ ask: null });
  if (!a) return;
  await loadIntoBooth(a.playlist, { historyId: a.historyId, keep: a.keep });
  a.go();
}
export const cancelPlayAsk = () => usePlayAsk.setState({ ask: null });

/* ---------- Rename (History, the sidebar) ---------- */

/** the name as a night carries it: one line, no " · " (the night's title stops there, lib/nightName.ts), ≤ 80 */
export const cleanName = (s: string) => s.replace(/\s+/g, " ").replace(/ · /g, " – ").trim().slice(0, 80);

/** the featured night is the app's own: it is never renamed (it only leaves the recents) */
export function canRename(id: string): boolean {
  const e = useStore.getState().history.find((h) => h.id === id);
  return !!e && !isFeaturedEntry(e);
}

function applyName(entryId: string, title: string, name: string) {
  const st = useStore.getState();
  const e = st.history.find((h) => h.id === entryId);
  if (!e) return;
  const nightId = e.playlist.id;
  st.updateSnapshot(entryId, { title, playlist: { ...e.playlist, name } });
  // the night open in Compose and in the Booth carries the new name too
  const open = useStore.getState().playlist;
  if (open?.id === nightId && open.name !== name) useStore.getState().setPlaylist({ ...open, name });
  const b = booth();
  const bp = b?.getState().playlist;
  if (bp?.id === nightId && bp.name !== name) b?.setState?.({ playlist: { ...bp, name } });
}

/** renames a History entry and the night it holds; Undo puts the old name back. False when nothing changed. */
export function renameNight(entryId: string, title: string): boolean {
  const next = cleanName(title);
  const st = useStore.getState();
  const e = st.history.find((h) => h.id === entryId);
  if (!next || !e || isFeaturedEntry(e) || next === e.title) return false;
  const before = { title: e.title, name: e.playlist.name };
  applyName(entryId, next, next);
  const label = t("nights.renamed", { title: next });
  const id = recordEdit({
    label,
    undo: () => applyName(entryId, before.title, before.name),
    redo: () => applyName(entryId, next, next),
  });
  toast(label, () => void undoEdit({ id }));
  return true;
}

export const useRenameAsk = create<{ id: string | null }>(() => ({ id: null }));
/** opens the one rename sheet (components/NightActions.tsx) for this entry */
export function askRename(entryId: string): void {
  if (canRename(entryId)) useRenameAsk.setState({ id: entryId });
}

/* ---------- Reopen in Compose (History, the sidebar) ---------- */

/** the entry becomes the current night in Compose (locks cleared), with its settings */
export function reopenNight(s: HistorySnapshot): void {
  const st = useStore.getState();
  st.setCurrentEntry(s.id);
  st.setPlaylist(freshNight(s.playlist));
  st.replaceOptions({ ...s.options, seed: s.playlist.options.seed });
  toast(t("history.reopened_in_compose", { title: s.title }));
}
