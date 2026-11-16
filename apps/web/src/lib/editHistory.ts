import { create } from "zustand";

/**
 * 2026-11 (the owner: "swap should have Cmd+Z"): one undo / redo history for every edit of a night — swaps, reorders,
 * adds, removes, pins — on Compose, Build by hand and the Booth. An entry is what the edit did (`undo`) and how to do
 * it again (`redo`); the toast's Undo and ⌘Z / Ctrl+Z (⇧⌘Z, Ctrl+Y redo; components/EditKeys.tsx; the Mac app's
 * Edit menu) all walk this one stack. Each entry remembers the page it was made on (`scope`): ⌘Z on the Booth never
 * reaches back into Compose's night, and a new edit drops what could be redone.
 */
export interface Edit {
  id: number;
  label: string;
  /** the page the edit was made on (a pathname: "/", "/booth"); undo only reaches entries of the page on screen */
  scope: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
  /**
   * 2026-11 (the Booth): edits of one control in a row (a slider dragged, a stepper tapped) merge into one entry when
   * they share a `key` and come within COALESCE_MS: the first one's undo, the last one's redo
   */
  key?: string;
  /** when it was made (ms), for the merge */
  at?: number;
  /**
   * 2026-11: what already happened in the room cannot be un-heard. Says why this entry cannot be undone now (a jump
   * that already played audio), or null; a blocked entry leaves the history and the toast says why.
   */
  blocked?: () => string | null;
}
/** what an undo did: the entry, and `why` when it could not be undone (Edit.blocked) */
export type UndoResult = Edit & { why?: string };

export const COALESCE_MS = 1500;

export const HISTORY_LIMIT = 100;
let seq = 0;

interface HistoryState {
  past: Edit[];
  future: Edit[];
  /** an undo or redo is running (a second press waits for it) */
  busy: boolean;
}
export const useEditHistory = create<HistoryState>(() => ({ past: [], future: [], busy: false }));

const here = () => (typeof location === "undefined" ? "/" : location.pathname || "/");

/** remember an edit that was just applied; returns its id (the toast's Undo names it) */
export function recordEdit(e: Omit<Edit, "id" | "scope"> & { scope?: string }): number {
  const scope = e.scope ?? here();
  const at = Date.now();
  const last = useEditHistory.getState().past.at(-1);
  if (e.key && last && last.key === e.key && last.scope === scope && at - (last.at ?? 0) < COALESCE_MS) {
    const merged: Edit = { ...last, label: e.label, redo: e.redo, at };
    useEditHistory.setState((s) => ({
      past: [...s.past.slice(0, -1), merged],
      future: s.future.filter((f) => f.scope !== scope),
    }));
    notify(merged, "record");
    return merged.id;
  }
  const id = ++seq;
  const entry: Edit = { ...e, id, scope, at };
  notify(entry, "record");
  useEditHistory.setState((s) => ({
    past: [...s.past, entry].slice(-HISTORY_LIMIT),
    // a new edit on this page drops this page's redo; another page's stays as it was
    future: s.future.filter((f) => f.scope !== entry.scope),
  }));
  return id;
}

/**
 * Snapshot edits (a night before and after): `apply(before)` undoes, `apply(after)` redoes. The common case for the
 * playlist edits (gateEdit, the Booth's swaps, the builder's draft).
 */
export function recordSnapshot<T>(
  label: string,
  before: T,
  after: T,
  apply: (x: T) => void | Promise<void>,
  scope?: string,
) {
  return recordEdit({
    label,
    undo: () => apply(before),
    redo: () => apply(after),
    ...(scope ? { scope } : {}),
  });
}

const lastIndex = <T>(xs: T[], ok: (x: T) => boolean) => {
  for (let i = xs.length - 1; i >= 0; i--) if (ok(xs[i]!)) return i;
  return -1;
};

/**
 * 2026-11: every recorded, undone or redone edit, for what follows the night (the exported playlists' sync,
 * lib/playlistSync.ts). Returns the unsubscribe.
 */
type Listener = (e: Edit, kind: "record" | "undo" | "redo") => void;
const listeners = new Set<Listener>();
export function onEdit(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
function notify(e: Edit, kind: "record" | "undo" | "redo") {
  for (const l of listeners)
    try {
      l(e, kind);
    } catch {}
}

/** undo the newest edit of this page (or the one named, the toast's): what was undone, or null */
export async function undoEdit(o: { scope?: string; id?: number } = {}): Promise<UndoResult | null> {
  const s = useEditHistory.getState();
  if (s.busy) return null;
  const scope = o.scope ?? here();
  const i = lastIndex(s.past, (e) => (o.id !== undefined ? e.id === o.id : e.scope === scope));
  if (i < 0) return null;
  const e = s.past[i]!;
  const why = e.blocked?.() ?? null;
  if (why) {
    // (it leaves the history: the next press reaches the edit before it)
    useEditHistory.setState({ past: s.past.filter((_, k) => k !== i) });
    return { ...e, why };
  }
  useEditHistory.setState({ busy: true, past: s.past.filter((_, k) => k !== i) });
  try {
    await e.undo();
    useEditHistory.setState((st) => ({ future: [...st.future, e] }));
    notify(e, "undo");
    return e;
  } finally {
    useEditHistory.setState({ busy: false });
  }
}

/** redo the newest undone edit of this page */
export async function redoEdit(o: { scope?: string } = {}): Promise<Edit | null> {
  const s = useEditHistory.getState();
  if (s.busy) return null;
  const scope = o.scope ?? here();
  const i = lastIndex(s.future, (e) => e.scope === scope);
  if (i < 0) return null;
  const e = s.future[i]!;
  useEditHistory.setState({ busy: true, future: s.future.filter((_, k) => k !== i) });
  try {
    await e.redo();
    // (a redone entry never merges with the next edit)
    useEditHistory.setState((st) => ({ past: [...st.past, { ...e, at: 0 }].slice(-HISTORY_LIMIT) }));
    notify(e, "redo");
    return e;
  } finally {
    useEditHistory.setState({ busy: false });
  }
}

export const canUndo = (scope = here()) => useEditHistory.getState().past.some((e) => e.scope === scope);
export const canRedo = (scope = here()) => useEditHistory.getState().future.some((e) => e.scope === scope);

/** forget every edit of a page (a new night replaces the one the edits were made on) */
export function clearEdits(scope?: string) {
  useEditHistory.setState((s) =>
    scope
      ? { past: s.past.filter((e) => e.scope !== scope), future: s.future.filter((e) => e.scope !== scope) }
      : { past: [], future: [] },
  );
}

/**
 * The key is undo / redo, outside a text field: ⌘Z / Ctrl+Z undoes, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y redoes. A text field
 * keeps its own undo (the words typed).
 */
export function historyKey(e: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): "undo" | "redo" | null {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && e.ctrlKey && !e.metaKey && !e.shiftKey) return "redo";
  return null;
}

/** a field that keeps its own undo: an input that takes text, a textarea, a select, anything contenteditable */
export function isTextTarget(el: Element | null | undefined): boolean {
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (tag !== "input") return false;
  const type = ((el as HTMLInputElement).type || "text").toLowerCase();
  return !["button", "checkbox", "radio", "range", "submit", "reset", "color", "file", "image"].includes(
    type,
  );
}
