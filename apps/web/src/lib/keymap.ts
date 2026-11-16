import { create } from "zustand";
import type { MsgKey } from "@/lib/i18n/en";

/**
 * 2026-11 (the owner: "a Cmd+Z / Ctrl+Z-like shortcut, settable"): every keyboard shortcut of the app in one list,
 * each rebindable on this device (Settings → Keyboard, kept in localStorage: never on a server). A binding is a
 * combo string: modifiers in a fixed order then the key, e.g. "mod+shift+z", "ctrl+y", "shift+p", "space",
 * "arrowright", "?". `mod` is ⌘ on a Mac and Ctrl elsewhere, and matches either (the Mac app's Edit menu sends its
 * own command, components/EditKeys.tsx). The Booth (app/booth/page.tsx), the edit keys (EditKeys.tsx) and the
 * row moves read their keys here; the shortcut sheet and Settings list them.
 */
export type ActionId =
  | "edit.undo"
  | "edit.redo"
  | "edit.swap"
  | "edit.moveUp"
  | "edit.moveDown"
  | "booth.pause"
  | "booth.prev"
  | "booth.next"
  | "booth.skipNext"
  | "booth.playNow"
  | "booth.playNext"
  | "booth.fade"
  | "booth.crossfade"
  | "booth.hold"
  | "booth.talk"
  | "booth.faderUp"
  | "booth.faderDown"
  | "booth.cueCortina"
  | "booth.prelisten"
  | "booth.stopPrelisten"
  | "booth.birthday"
  | "booth.mute"
  | "booth.keys";

export interface ActionDef {
  id: ActionId;
  group: "edit" | "booth";
  label: MsgKey;
  defaults: string[];
}

export const ACTIONS: ActionDef[] = [
  { id: "edit.undo", group: "edit", label: "booth.sheets.undo_key", defaults: ["mod+z"] },
  { id: "edit.redo", group: "edit", label: "booth.sheets.redo_key", defaults: ["mod+shift+z", "ctrl+y"] },
  { id: "edit.swap", group: "edit", label: "booth.sheets.swap_key", defaults: ["s"] },
  { id: "edit.moveUp", group: "edit", label: "keys.edit_move_up", defaults: ["alt+arrowup"] },
  { id: "edit.moveDown", group: "edit", label: "keys.edit_move_down", defaults: ["alt+arrowdown"] },
  { id: "booth.pause", group: "booth", label: "booth.sheets.pause_resume_a_short_fade", defaults: ["space"] },
  { id: "booth.prev", group: "booth", label: "booth.sheets.previous_key", defaults: ["arrowleft"] },
  { id: "booth.next", group: "booth", label: "booth.sheets.next_now_key", defaults: ["arrowright"] },
  { id: "booth.skipNext", group: "booth", label: "keys.booth_skip_next", defaults: ["n"] },
  // (the chosen row plays now in the room — Enter again confirms mid-night — or next; the Booth's row handler reads these)
  { id: "booth.playNow", group: "booth", label: "keys.booth_play_now", defaults: ["enter"] },
  { id: "booth.playNext", group: "booth", label: "keys.booth_play_next", defaults: ["shift+enter"] },
  { id: "booth.fade", group: "booth", label: "booth.sheets.fade_out_now_the_next_item", defaults: ["f"] },
  { id: "booth.crossfade", group: "booth", label: "booth.sheets.next_with_crossfade", defaults: ["x"] },
  {
    id: "booth.hold",
    group: "booth",
    label: "booth.sheets.hold_after_this_song_cancel_the",
    defaults: ["h"],
  },
  { id: "booth.talk", group: "booth", label: "booth.sheets.talk_over_the_music_dips_12", defaults: ["t"] },
  { id: "booth.faderUp", group: "booth", label: "keys.booth_fader_up", defaults: ["arrowup"] },
  { id: "booth.faderDown", group: "booth", label: "keys.booth_fader_down", defaults: ["arrowdown"] },
  {
    id: "booth.cueCortina",
    group: "booth",
    label: "booth.sheets.cue_the_cortina_end_the_tanda",
    defaults: ["c"],
  },
  {
    id: "booth.prelisten",
    group: "booth",
    label: "booth.sheets.pre_listen_the_next_item_in",
    defaults: ["p"],
  },
  {
    id: "booth.stopPrelisten",
    group: "booth",
    label: "booth.sheets.stop_the_pre_listen_the_room",
    defaults: ["shift+p"],
  },
  { id: "booth.birthday", group: "booth", label: "booth.sheets.birthday_vals", defaults: ["b"] },
  { id: "booth.mute", group: "booth", label: "booth.sheets.master_mute", defaults: ["m"] },
  { id: "booth.keys", group: "booth", label: "booth.sheets.this_sheet", defaults: ["?"] },
];

const MODS = ["mod", "ctrl", "alt", "shift"] as const;
const NAMED: Record<string, string> = {
  " ": "space",
  spacebar: "space",
  esc: "escape",
};

export interface KeyLike {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** the key part of a combo: a letter or digit by its key (its physical key when ⌥ changed it), else its name */
function keyName(e: KeyLike): string {
  const code = e.code ?? "";
  const k = e.key ?? "";
  if (/^Key[A-Z]$/.test(code) && (e.altKey || !/^[a-z]$/i.test(k))) return code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(code) && e.altKey) return code.slice(5);
  const low = k.toLowerCase();
  return NAMED[low] ?? low;
}

/** the combo a key press makes; null for a modifier alone. `mac` decides which modifier is `mod`. */
export function comboOf(e: KeyLike, mac = isMac()): string | null {
  const key = keyName(e);
  if (!key || ["meta", "control", "alt", "shift", "os", "dead", "unidentified"].includes(key)) return null;
  const parts: string[] = [];
  const modKey = mac ? e.metaKey : e.ctrlKey;
  if (modKey) parts.push("mod");
  if (mac ? e.ctrlKey : e.metaKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  // a symbol already carries its shift ("?" is ⇧/): only letters, digits and named keys keep it
  const symbol = key.length === 1 && !/[a-z0-9]/.test(key);
  if (e.shiftKey && !symbol) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

/** a combo in a fixed modifier order (what the store keeps) */
export function normalizeCombo(c: string): string {
  const bits = c.toLowerCase().split("+").filter(Boolean);
  const key = bits.pop() ?? "";
  const mods = MODS.filter((m) => bits.includes(m));
  return [...mods, NAMED[key] ?? key].join("+");
}

/** does the press match the combo? `mod` matches ⌘ or Ctrl (one of them), `ctrl` the other one */
export function matchesCombo(e: KeyLike, combo: string, mac = isMac()): boolean {
  const got = comboOf(e, mac);
  if (!got) return false;
  // off a Mac, Control is the command key: "ctrl+y" and "mod+y" are one combo there
  const want = normalizeCombo(mac ? combo : combo.replace(/\bctrl\b/, "mod"));
  if (got === want) return true;
  // "mod" also answers the platform's other key alone (⌃Z on a Mac, a Windows key elsewhere), as the old keys did
  const otherOnly = mac ? e.ctrlKey && !e.metaKey : e.metaKey && !e.ctrlKey;
  return want.split("+").includes("mod") && otherOnly
    ? comboOf({ ...e, metaKey: e.ctrlKey, ctrlKey: e.metaKey }, mac) === want
    : false;
}

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
}

/** how a combo reads: ⌘⇧Z on a Mac, Ctrl+Shift+Z elsewhere; arrows and space as glyphs */
export function formatCombo(c: string, mac = isMac()): string {
  const bits = normalizeCombo(c).split("+");
  const key = bits.pop() ?? "";
  const name: Record<string, string> = {
    space: mac ? "Space" : "Space",
    arrowleft: "←",
    arrowright: "→",
    arrowup: "↑",
    arrowdown: "↓",
    enter: "↵",
    escape: "Esc",
    tab: "⇥",
    backspace: "⌫",
  };
  const k = name[key] ?? (key.length === 1 ? key.toUpperCase() : key[0]!.toUpperCase() + key.slice(1));
  const glyph = (m: string) =>
    mac
      ? ({ mod: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" } as Record<string, string>)[m]!
      : ({ mod: "Ctrl", ctrl: "Win", alt: "Alt", shift: "Shift" } as Record<string, string>)[m]!;
  // a bare letter reads lowercase (the Booth's keys were always shown that way)
  if (!bits.length && key.length === 1) return key;
  // (a Mac reads its modifiers ⌃⌥⇧⌘, as its menus do)
  const order = mac ? ["ctrl", "alt", "shift", "mod"].filter((m) => bits.includes(m)) : bits;
  return mac ? `${order.map(glyph).join("")}${k}` : [...order.map(glyph), k].join("+");
}

/* ---------- the DJ's bindings on this device ---------- */

const KEY = "tdj-keymap";
type Custom = Partial<Record<ActionId, string[]>>;
function load(): Custom {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    const j = raw ? (JSON.parse(raw) as unknown) : null;
    if (!j || typeof j !== "object") return {};
    const out: Custom = {};
    for (const a of ACTIONS) {
      const v = (j as Record<string, unknown>)[a.id];
      if (Array.isArray(v))
        out[a.id] = v.filter((x): x is string => typeof x === "string").map(normalizeCombo);
    }
    return out;
  } catch {
    return {};
  }
}
function save(c: Custom) {
  try {
    if (Object.keys(c).length) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {}
}

/** (read once in the browser; a page that lists the keys renders them after mount, so the server's defaults match) */
export const useKeymap = create<{ custom: Custom }>(() => ({
  custom: typeof window !== "undefined" ? load() : {},
}));

/** the combos bound to an action now (the DJ's, else the defaults) */
export function bindingsOf(id: ActionId, custom: Custom = useKeymap.getState().custom): string[] {
  return custom[id] ?? ACTIONS.find((a) => a.id === id)?.defaults ?? [];
}

/** does this press run `id`? */
export function isAction(id: ActionId, e: KeyLike): boolean {
  return bindingsOf(id).some((c) => matchesCombo(e, c));
}

/** the action a press runs among `ids` (the Booth asks for its own), or null */
export function actionOf(e: KeyLike, ids: readonly ActionId[] = ACTIONS.map((a) => a.id)): ActionId | null {
  for (const id of ids) if (isAction(id, e)) return id;
  return null;
}

/** the other actions a combo is already bound to (Settings warns before taking it) */
export function conflictsOf(combo: string, except: ActionId, custom?: Custom): ActionId[] {
  const c = normalizeCombo(combo);
  return ACTIONS.filter(
    (a) => a.id !== except && bindingsOf(a.id, custom).some((b) => normalizeCombo(b) === c),
  ).map((a) => a.id);
}

/** binds `combos` to `id`; `takeFrom` removes the combo from the actions it conflicted with */
export function setBinding(id: ActionId, combos: string[], o: { takeFrom?: boolean } = {}) {
  const custom: Custom = { ...useKeymap.getState().custom };
  const list = [...new Set(combos.map(normalizeCombo))];
  if (o.takeFrom)
    for (const c of list)
      for (const other of conflictsOf(c, id, custom))
        custom[other] = bindingsOf(other, custom).filter((b) => normalizeCombo(b) !== c);
  const def = ACTIONS.find((a) => a.id === id)?.defaults ?? [];
  if (list.length === def.length && list.every((c, i) => c === normalizeCombo(def[i]!))) delete custom[id];
  else custom[id] = list;
  useKeymap.setState({ custom });
  save(custom);
}

export function resetBinding(id: ActionId) {
  const custom: Custom = { ...useKeymap.getState().custom };
  delete custom[id];
  useKeymap.setState({ custom });
  save(custom);
}

export function resetAllBindings() {
  useKeymap.setState({ custom: {} });
  save({});
}

/** called after every change of the DJ's bindings (another module that keeps its own key handling); the unsubscribe */
export function subscribeKeymap(fn: () => void): () => void {
  return useKeymap.subscribe(fn);
}

/** the React view of one action's bindings (re-renders on a change) */
export function useBindings(id: ActionId): string[] {
  const custom = useKeymap((s) => s.custom);
  return bindingsOf(id, custom);
}
