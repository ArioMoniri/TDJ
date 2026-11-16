import {
  CURVE_SHAPES,
  type CurveShape,
  SILENCE_MODES,
  type SilenceMode,
  TRANSITION_EQS,
  TRANSITION_PRESETS,
  type TransitionEdit,
  type TransitionEq,
  transitionKey,
} from "@tdj/core";
import { create } from "zustand";

/**
 * 2026-11 — the DJ's own transition templates (the owner: "there should be an option to add custom templates for
 * transitions"). A template is a named transition edit — the preset with its overlap, gap, fades, curves, EQ and its
 * own silence setting — saved from the editor ("Save as template…"), shown next to the presets, and kept in
 * Settings → Booth → Transitions, where it is renamed, edited, reordered or deleted and set as the default for a kind
 * of join (song → song inside a tanda, the last song → the cortina, the cortina → the next tanda, into La
 * Cumparsita) and, inside a tanda, per rhythm (tango, vals, milonga). Defaults reach the night as the plan's
 * `defaultTransitions` (an edit of the DJ's own always wins; a default is never stored as an edit).
 *
 * Kept per device (localStorage `tdj-transition-templates`), and part of the owner's personal export (Settings →
 * Owner → Transition templates). Everything but the store at the end is pure (lib/booth/transitionTemplates.test.ts).
 */

export interface TransitionTemplate {
  id: string;
  name: string;
  edit: TransitionEdit;
}
export type Boundary = "inTanda" | "toCortina" | "fromCortina" | "cumparsita";
export const BOUNDARIES: ReadonlyArray<Boundary> = ["inTanda", "toCortina", "fromCortina", "cumparsita"];
export type TemplateRhythm = "tango" | "vals" | "milonga";
export const TEMPLATE_RHYTHMS: ReadonlyArray<TemplateRhythm> = ["tango", "vals", "milonga"];
export interface TemplateDefaults {
  boundary: Partial<Record<Boundary, string>>;
  rhythm: Partial<Record<TemplateRhythm, string>>;
}
export interface TemplateState {
  v: 1;
  templates: TransitionTemplate[];
  defaults: TemplateDefaults;
}
export const EMPTY_TEMPLATES: TemplateState = { v: 1, templates: [], defaults: { boundary: {}, rhythm: {} } };
export const NAME_MAX = 40;

const num = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10
    : undefined;

/** An edit with only the fields a transition has, each valid (what a template keeps and the export carries). */
export function cleanEdit(e: Partial<TransitionEdit> | null | undefined): TransitionEdit {
  const preset = e && TRANSITION_PRESETS.includes(e.preset as never) ? e.preset! : "gap";
  const out: TransitionEdit = { preset };
  const set = <K extends keyof TransitionEdit>(k: K, v: TransitionEdit[K] | undefined) => {
    if (v !== undefined) out[k] = v;
  };
  set("gapSec", num(e?.gapSec, 0, 5));
  set("overlapSec", num(e?.overlapSec, 0, 12));
  set("fadeOutSec", num(e?.fadeOutSec, 0, 10));
  set("fadeInSec", num(e?.fadeInSec, 0, 10));
  const curve = (c: unknown) => (CURVE_SHAPES.includes(c as CurveShape) ? (c as CurveShape) : undefined);
  set("curveOut", curve(e?.curveOut));
  set("curveIn", curve(e?.curveIn));
  if (e?.eq && TRANSITION_EQS.includes(e.eq as TransitionEq)) out.eq = e.eq;
  if (typeof e?.bassSwap === "boolean") out.bassSwap = e.bassSwap;
  if (e?.silence && SILENCE_MODES.includes(e.silence as SilenceMode)) out.silence = e.silence;
  return out;
}

/** Two edits that play the same (field order and absent fields aside). */
export function sameEdit(
  a: TransitionEdit | null | undefined,
  b: TransitionEdit | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  const k = (e: TransitionEdit) => {
    const c = cleanEdit(e) as unknown as Record<string, unknown>;
    return JSON.stringify(
      Object.keys(c)
        .sort()
        .map((x) => [x, c[x]]),
    );
  };
  return k(a) === k(b);
}

const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, NAME_MAX);
let seq = 0;
const newId = () => `tpl-${Date.now().toString(36)}${(seq++).toString(36)}`;

/** A template the editor saved (a blank name becomes "Template n"); the id is new. */
export function addTemplate(
  st: TemplateState,
  name: string,
  edit: TransitionEdit,
  id = newId(),
): { state: TemplateState; id: string } {
  const n = cleanName(name) || `Template ${st.templates.length + 1}`;
  return { state: { ...st, templates: [...st.templates, { id, name: n, edit: cleanEdit(edit) }] }, id };
}
export function renameTemplate(st: TemplateState, id: string, name: string): TemplateState {
  const n = cleanName(name);
  if (!n) return st;
  return { ...st, templates: st.templates.map((t) => (t.id === id ? { ...t, name: n } : t)) };
}
export function updateTemplate(st: TemplateState, id: string, edit: TransitionEdit): TemplateState {
  return { ...st, templates: st.templates.map((t) => (t.id === id ? { ...t, edit: cleanEdit(edit) } : t)) };
}
/** Delete a template; the defaults that named it fall back to Auto. */
export function removeTemplate(st: TemplateState, id: string): TemplateState {
  const drop = <K extends string>(m: Partial<Record<K, string>>) =>
    Object.fromEntries(Object.entries(m).filter(([, v]) => v !== id)) as Partial<Record<K, string>>;
  return {
    ...st,
    templates: st.templates.filter((t) => t.id !== id),
    defaults: { boundary: drop(st.defaults.boundary), rhythm: drop(st.defaults.rhythm) },
  };
}
/** Move a template one place up (−1) or down (+1). */
export function moveTemplate(st: TemplateState, id: string, dir: -1 | 1): TemplateState {
  const i = st.templates.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= st.templates.length) return st;
  const list = [...st.templates];
  [list[i], list[j]] = [list[j]!, list[i]!];
  return { ...st, templates: list };
}
/** Set (or clear with null) the default template of a kind of join or of a rhythm inside a tanda. */
export function setDefault(
  st: TemplateState,
  which: { boundary: Boundary } | { rhythm: TemplateRhythm },
  id: string | null,
): TemplateState {
  if (id !== null && !st.templates.some((t) => t.id === id)) return st;
  const d = { boundary: { ...st.defaults.boundary }, rhythm: { ...st.defaults.rhythm } };
  if ("boundary" in which) {
    if (id === null) delete d.boundary[which.boundary];
    else d.boundary[which.boundary] = id;
  } else if (id === null) delete d.rhythm[which.rhythm];
  else d.rhythm[which.rhythm] = id;
  return { ...st, defaults: d };
}

/** A stored state read back (an export, localStorage): unknown fields dropped, ids unique, defaults that resolve. */
export function parseTemplates(raw: unknown): TemplateState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TemplateState>;
  const seen = new Set<string>();
  const templates: TransitionTemplate[] = [];
  for (const t of Array.isArray(r.templates) ? r.templates : []) {
    if (!t || typeof t !== "object" || typeof t.id !== "string" || seen.has(t.id)) continue;
    const name = cleanName(typeof t.name === "string" ? t.name : "");
    if (!name) continue;
    seen.add(t.id);
    templates.push({ id: t.id.slice(0, 64), name, edit: cleanEdit(t.edit) });
  }
  const pick = <K extends string>(m: unknown, keys: ReadonlyArray<K>) => {
    const o: Partial<Record<K, string>> = {};
    const src = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
    for (const k of keys)
      if (typeof src[k] === "string" && seen.has(src[k] as string)) o[k] = src[k] as string;
    return o;
  };
  return {
    v: 1,
    templates,
    defaults: {
      boundary: pick(r.defaults?.boundary, BOUNDARIES),
      rhythm: pick(r.defaults?.rhythm, TEMPLATE_RHYTHMS),
    },
  };
}

export interface JoinRow {
  id?: string;
  kind: "track" | "cortina" | "closing" | "break";
  tanda: number;
}
/**
 * The kind of join from `a` into `b`: inside a tanda (song → song), the last song → its cortina, the cortina → the
 * next tanda's first song, into La Cumparsita (the closing); null for anything else (a break, the opening).
 */
export function boundaryOf(a: JoinRow | undefined, b: JoinRow | undefined): Boundary | null {
  if (!a || !b || a.kind === "break" || b.kind === "break") return null;
  if (b.kind === "closing" && b.tanda > 0) return "cumparsita";
  if (a.kind === "track" && b.kind === "track") return a.tanda === b.tanda ? "inTanda" : null;
  if (a.kind === "track" && b.kind === "cortina") return "toCortina";
  if (a.kind === "cortina" && b.kind === "track") return "fromCortina";
  return null;
}
const asRhythm = (r: string | null | undefined): TemplateRhythm | null =>
  r === "tango" || r === "vals" || r === "milonga" ? r : null;
/** The template a join gets by default: inside a tanda its rhythm's, else the join kind's; null = Auto. */
export function defaultFor(
  st: TemplateState,
  boundary: Boundary | null,
  rhythm?: string | null,
): TransitionTemplate | null {
  if (!boundary) return null;
  const r = boundary === "inTanda" ? asRhythm(rhythm) : null;
  const id = (r && st.defaults.rhythm[r]) || st.defaults.boundary[boundary];
  return st.templates.find((t) => t.id === id) ?? null;
}
/** Every join's default edit, by transition key (the plan's `defaultTransitions`). */
export function defaultTransitionMap(
  rows: ReadonlyArray<JoinRow>,
  rhythmOf: (tanda: number) => string | null | undefined,
  st: TemplateState,
): Record<string, TransitionEdit> {
  const out: Record<string, TransitionEdit> = {};
  if (!st.templates.length) return out;
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i]!;
    const b = rows[i + 1]!;
    if (!a.id || !b.id) continue;
    const t = defaultFor(st, boundaryOf(a, b), rhythmOf(a.tanda));
    if (t) out[transitionKey(a.id, b.id)] = { ...t.edit };
  }
  return out;
}
/** The template an edit is (same settings), if any. */
export function templateOf(
  st: TemplateState,
  edit: TransitionEdit | null | undefined,
): TransitionTemplate | null {
  if (!edit) return null;
  return st.templates.find((t) => sameEdit(t.edit, edit)) ?? null;
}

/**
 * "Apply to the whole tanda / whole night": the joins of the same kind as the one at `i` (inside this tanda, or the
 * whole night), `i` included. A join without two sides (a break) is never one.
 */
export function applyTargets(rows: ReadonlyArray<JoinRow>, i: number, scope: "tanda" | "night"): number[] {
  const kind = boundaryOf(rows[i], rows[i + 1]);
  if (!kind) return [];
  const out: number[] = [];
  for (let k = 0; k + 1 < rows.length; k++) {
    const a = rows[k]!;
    const b = rows[k + 1]!;
    if (!a.id || !b.id || boundaryOf(a, b) !== kind) continue;
    if (scope === "tanda" && a.tanda !== rows[i]!.tanda) continue;
    out.push(k);
  }
  return out;
}
/** The night's stored edits with `edit` put on every target join. */
export function withEditAt(
  transitions: Readonly<Record<string, TransitionEdit>>,
  rows: ReadonlyArray<JoinRow>,
  targets: ReadonlyArray<number>,
  edit: TransitionEdit | null,
): Record<string, TransitionEdit> {
  const out: Record<string, TransitionEdit> = { ...transitions };
  for (const k of targets) {
    const a = rows[k];
    const b = rows[k + 1];
    if (!a?.id || !b?.id) continue;
    const key = transitionKey(a.id, b.id);
    if (edit) out[key] = { ...edit };
    else delete out[key];
  }
  return out;
}

/* ---------- the device's store ---------- */

const KEY = "tdj-transition-templates";
function load(): TemplateState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseTemplates(JSON.parse(raw)) : EMPTY_TEMPLATES;
  } catch {
    return EMPTY_TEMPLATES;
  }
}
function save(st: TemplateState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(st));
  } catch {}
}

interface TemplateStore extends TemplateState {
  loaded: boolean;
  /** read this device's templates (once, on the client) */
  hydrate: () => void;
  /** put a whole state (an undo, an import); returns it */
  replace: (st: TemplateState) => void;
  add: (name: string, edit: TransitionEdit) => string;
  rename: (id: string, name: string) => void;
  update: (id: string, edit: TransitionEdit) => void;
  remove: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  setDefault: (which: { boundary: Boundary } | { rhythm: TemplateRhythm }, id: string | null) => void;
}
const stateOf = (s: TemplateState): TemplateState => ({ v: 1, templates: s.templates, defaults: s.defaults });
export const useTemplates = create<TemplateStore>((set, get) => {
  const put = (st: TemplateState) => {
    save(st);
    set({ ...stateOf(st), loaded: true });
  };
  const cur = () => {
    if (!get().loaded) get().hydrate();
    return stateOf(get());
  };
  return {
    ...EMPTY_TEMPLATES,
    loaded: false,
    hydrate: () => {
      if (get().loaded || typeof window === "undefined") return;
      set({ ...load(), loaded: true });
    },
    replace: (st) => put(parseTemplates(st)),
    add: (name, edit) => {
      const r = addTemplate(cur(), name, edit);
      put(r.state);
      return r.id;
    },
    rename: (id, name) => put(renameTemplate(cur(), id, name)),
    update: (id, edit) => put(updateTemplate(cur(), id, edit)),
    remove: (id) => put(removeTemplate(cur(), id)),
    move: (id, dir) => put(moveTemplate(cur(), id, dir)),
    setDefault: (which, id) => put(setDefault(cur(), which, id)),
  };
});
/** The device's templates now (hydrated on first read; the empty state on the server). */
export function templatesNow(): TemplateState {
  const s = useTemplates.getState();
  if (!s.loaded) s.hydrate();
  return stateOf(useTemplates.getState());
}
