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
}

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
  const id = ++seq;
  const entry: Edit = { ...e, id, scope: e.scope ?? here() };
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

/** undo the newest edit of this page (or the one named, the toast's): what was undone, or null */
export async function undoEdit(o: { scope?: string; id?: number } = {}): Promise<Edit | null> {
  const s = useEditHistory.getState();
  if (s.busy) return null;
  const scope = o.scope ?? here();
  const i = lastIndex(s.past, (e) => (o.id !== undefined ? e.id === o.id : e.scope === scope));
  if (i < 0) return null;
  const e = s.past[i]!;
  useEditHistory.setState({ busy: true, past: s.past.filter((_, k) => k !== i) });
  try {
    await e.undo();
    useEditHistory.setState((st) => ({ future: [...st.future, e] }));
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
    useEditHistory.setState((st) => ({ past: [...st.past, e].slice(-HISTORY_LIMIT) }));
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
