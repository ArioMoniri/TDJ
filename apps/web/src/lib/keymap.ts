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
  // 2026-11 (the owner: "Ctrl or Cmd+Y to redo"): ⌘Y on a Mac, Ctrl+Y elsewhere, beside ⇧⌘Z and the old Ctrl+Y (⌃Y on
  // a Mac); a device that kept the old defaults gets it too (LEGACY_DEFAULTS)
  {
    id: "edit.redo",
    group: "edit",
    label: "booth.sheets.redo_key",
    defaults: ["mod+shift+z", "mod+y", "ctrl+y"],
  },
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

/**
 * the physical key a combo is on this platform: off a Mac Control is the command key, so "ctrl+y" and "mod+y" are one
 * key there (a conflict, one binding to take), two on a Mac (⌃Y and ⌘Y)
 */
export function keyOf(c: string, mac = isMac()): string {
  return normalizeCombo(mac ? c : c.replace(/\bctrl\b/g, "mod"));
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

/**
 * the combos as they work on this platform, once each: off a Mac "mod+y" and "ctrl+y" are both Ctrl+Y (one key, shown
 * once as Ctrl+Y, as matchesCombo answers it); the bindings themselves stay as they are
 */
export function shownBindings(combos: string[], mac = isMac()): string[] {
  return [...new Set(combos.map((c) => keyOf(c, mac)))];
}

/* ---------- the DJ's bindings on this device ---------- */

const KEY = "tdj-keymap";
type Custom = Partial<Record<ActionId, string[]>>;

/**
 * Defaults an action had before: a device that saved exactly one of them never chose those keys itself (an older
 * build's copy), so it follows today's defaults (⌘Y for redo, 2026-11).
 */
export const LEGACY_DEFAULTS: Partial<Record<ActionId, string[][]>> = {
  "edit.redo": [["mod+shift+z", "ctrl+y"]],
};
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((c, i) => c === b[i]);

/** the saved bindings read back: unknown actions dropped, combos normalized, an old default list following the new */
export function migrateKeymap(j: unknown): Custom {
  if (!j || typeof j !== "object") return {};
  const out: Custom = {};
  for (const a of ACTIONS) {
    const v = (j as Record<string, unknown>)[a.id];
    if (!Array.isArray(v)) continue;
    const list = v.filter((x): x is string => typeof x === "string").map(normalizeCombo);
    if (LEGACY_DEFAULTS[a.id]?.some((old) => sameList(list, old.map(normalizeCombo)))) continue;
    out[a.id] = list;
  }
  return out;
}

function load(): Custom {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    const j = raw ? (JSON.parse(raw) as unknown) : null;
    const out = migrateKeymap(j);
    if (j && typeof j === "object" && Object.keys(out).length !== Object.keys(j).length) save(out);
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

/**
 * (read once in the browser; a page that lists the keys renders them after mount, so the server's defaults match).
 * `recording`: a key chip is recording a new key (components/KeyChips.tsx) — no shortcut runs meanwhile.
 */
export const useKeymap = create<{ custom: Custom; recording: boolean }>(() => ({
  custom: typeof window !== "undefined" ? load() : {},
  recording: false,
}));
// (another tab of this browser changed the keys — Settings open beside the Booth: this one follows at once)
if (typeof window !== "undefined" && typeof window.addEventListener === "function")
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) useKeymap.setState({ custom: load() });
  });

/** a chip is (or no longer is) recording: every shortcut of the app holds still meanwhile */
export function setRecording(on: boolean) {
  if (useKeymap.getState().recording !== on) useKeymap.setState({ recording: on });
}
export const isRecording = () => useKeymap.getState().recording;

/**
 * the combos bound to an action now (the DJ's, else the defaults). A default the DJ gave another action stays that
 * action's: a default added later (⌘Y) never takes back a key the DJ already chose for something else.
 */
export function bindingsOf(id: ActionId, custom: Custom = useKeymap.getState().custom): string[] {
  const own = custom[id];
  if (own) return own;
  const def = ACTIONS.find((a) => a.id === id)?.defaults ?? [];
  const taken = new Set(
    Object.entries(custom)
      .filter(([other]) => other !== id)
      .flatMap(([, v]) => (v ?? []).map((c) => keyOf(c))),
  );
  return taken.size ? def.filter((c) => !taken.has(keyOf(c))) : def;
}

/** does this press run `id`? */
export function isAction(id: ActionId, e: KeyLike): boolean {
  // (the key being recorded is the recorder's, never a shortcut's)
  if (isRecording()) return false;
  return bindingsOf(id).some((c) => matchesCombo(e, c));
}

/** the action a press runs among `ids` (the Booth asks for its own), or null */
export function actionOf(e: KeyLike, ids: readonly ActionId[] = ACTIONS.map((a) => a.id)): ActionId | null {
  for (const id of ids) if (isAction(id, e)) return id;
  return null;
}

/** the other actions a combo is already bound to (Settings warns before taking it) */
export function conflictsOf(combo: string, except: ActionId, custom?: Custom): ActionId[] {
  const c = keyOf(combo);
  return ACTIONS.filter((a) => a.id !== except && bindingsOf(a.id, custom).some((b) => keyOf(b) === c)).map(
    (a) => a.id,
  );
}

/** binds `combos` to `id`; `takeFrom` removes the combo from the actions it conflicted with */
export function setBinding(id: ActionId, combos: string[], o: { takeFrom?: boolean } = {}) {
  const custom: Custom = { ...useKeymap.getState().custom };
  const list = [...new Set(combos.map(normalizeCombo))];
  if (o.takeFrom)
    for (const c of list)
      for (const other of conflictsOf(c, id, custom))
        custom[other] = bindingsOf(other, custom).filter((b) => keyOf(b) !== keyOf(c));
  const def = ACTIONS.find((a) => a.id === id)?.defaults ?? [];
  if (list.length === def.length && list.every((c, i) => c === normalizeCombo(def[i]!))) delete custom[id];
  else custom[id] = list;
  useKeymap.setState({ custom });
  save(custom);
}

/**
 * the action's default keys back; a default another action was given since goes back to this one (a Reset that
 * left "None" would read as broken)
 */
export function resetBinding(id: ActionId) {
  const custom: Custom = { ...useKeymap.getState().custom };
  delete custom[id];
  const def = new Set((ACTIONS.find((a) => a.id === id)?.defaults ?? []).map((c) => keyOf(c)));
  for (const [other, list] of Object.entries(custom) as Array<[ActionId, string[]]>)
    if (list.some((c) => def.has(keyOf(c)))) custom[other] = list.filter((c) => !def.has(keyOf(c)));
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

/* ---------- recording a new key on a chip (components/KeyChips.tsx) ---------- */

/** what one press does to a recorder */
export type RecordStep =
  /** Esc: nothing changes */
  | { kind: "cancel" }
  /** Tab / ⇧Tab: the focus moves on, nothing changes */
  | { kind: "leave" }
  /** ⌫ or Delete alone: the chip's key is removed (on "+", nothing is added) */
  | { kind: "clear" }
  /** a modifier alone: still waiting for the key */
  | { kind: "wait" }
  | { kind: "combo"; combo: string };

export function recordStep(e: KeyLike, mac = isMac()): RecordStep {
  const anyMod = e.metaKey || e.ctrlKey || e.altKey || e.shiftKey;
  if (e.key === "Escape" || e.key === "Esc") return { kind: "cancel" };
  if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey) return { kind: "leave" };
  if ((e.key === "Backspace" || e.key === "Delete") && !anyMod) return { kind: "clear" };
  const c = comboOf(e, mac);
  return c ? { kind: "combo", combo: normalizeCombo(c) } : { kind: "wait" };
}

/**
 * Keys the browser or the system keeps for itself (quit, close the tab, a new tab, reload…): a page that took them
 * would either never see them or take them from the DJ's browser. Keyed as keyOf reads them (Ctrl is `mod` off a Mac).
 */
const RESERVED_ALL: Record<string, MsgKey> = {
  "mod+q": "keys.reserved_quit",
  "mod+shift+q": "keys.reserved_quit",
  "mod+w": "keys.reserved_close",
  "mod+shift+w": "keys.reserved_close",
  "mod+f4": "keys.reserved_close",
  "alt+f4": "keys.reserved_close",
  "mod+t": "keys.reserved_new_tab",
  "mod+shift+t": "keys.reserved_reopen",
  "mod+n": "keys.reserved_new_window",
  "mod+shift+n": "keys.reserved_new_window",
  "mod+r": "keys.reserved_reload",
  "mod+shift+r": "keys.reserved_reload",
  f5: "keys.reserved_reload",
  "mod+f5": "keys.reserved_reload",
  "mod+l": "keys.reserved_address",
  "alt+d": "keys.reserved_address",
  "mod+tab": "keys.reserved_switch",
  "mod+shift+tab": "keys.reserved_switch",
  "alt+tab": "keys.reserved_switch",
  "mod+pageup": "keys.reserved_switch",
  "mod+pagedown": "keys.reserved_switch",
  f11: "keys.reserved_fullscreen",
  f12: "keys.reserved_devtools",
  "mod+shift+i": "keys.reserved_devtools",
  "mod+shift+j": "keys.reserved_devtools",
  "mod+alt+i": "keys.reserved_devtools",
  "mod+alt+j": "keys.reserved_devtools",
};
const RESERVED_MAC: Record<string, MsgKey> = {
  "mod+h": "keys.reserved_hide",
  "mod+alt+h": "keys.reserved_hide",
  "mod+m": "keys.reserved_minimize",
  "mod+space": "keys.reserved_spotlight",
  "mod+`": "keys.reserved_switch",
  "ctrl+tab": "keys.reserved_switch",
  "ctrl+shift+tab": "keys.reserved_switch",
  "mod+ctrl+f": "keys.reserved_fullscreen",
  "mod+ctrl+q": "keys.reserved_lock",
};

/** why a combo cannot be a shortcut here (the browser's or the system's), or null */
export function reservedReason(combo: string, mac = isMac()): MsgKey | null {
  const k = keyOf(combo, mac);
  return (mac ? RESERVED_MAC[k] : undefined) ?? RESERVED_ALL[k] ?? null;
}

export type Proposal =
  | { status: "reserved"; reason: MsgKey }
  /** the action already has this key: nothing to change */
  | { status: "same" }
  | { status: "conflict"; with: ActionId[] }
  | { status: "ok" };

/** what binding `combo` to `id` would do: refused (reserved), nothing (its own already), a conflict, or fine */
export function proposeBinding(id: ActionId, combo: string, custom?: Custom, mac = isMac()): Proposal {
  const reason = reservedReason(combo, mac);
  if (reason) return { status: "reserved", reason };
  const k = keyOf(combo, mac);
  if (bindingsOf(id, custom).some((b) => keyOf(b, mac) === k)) return { status: "same" };
  const others = conflictsOf(combo, id, custom);
  return others.length ? { status: "conflict", with: others } : { status: "ok" };
}

/**
 * `combo` on `id`: in the place of `replacing` (a chip's key: every binding that is that key on this platform), or
 * after the others (`replacing` null: the "+"). `takeFrom` takes it from the actions it conflicted with.
 */
export function applyBinding(
  id: ActionId,
  combo: string,
  replacing: string | null,
  o: { takeFrom?: boolean } = {},
) {
  const c = normalizeCombo(combo);
  const k = keyOf(c);
  const cur = bindingsOf(id).filter((b) => keyOf(b) !== k);
  if (replacing === null) return setBinding(id, [...cur, c], o);
  const rk = keyOf(replacing);
  const at = cur.findIndex((b) => keyOf(b) === rk);
  const next = cur.filter((b) => keyOf(b) !== rk);
  next.splice(at < 0 ? next.length : at, 0, c);
  setBinding(id, next, o);
}

/** the chip's key off `id` (every binding that is that key on this platform) */
export function removeBinding(id: ActionId, combo: string) {
  const k = keyOf(combo);
  setBinding(
    id,
    bindingsOf(id).filter((b) => keyOf(b) !== k),
  );
}

/** are the action's keys its defaults (as they work on this platform)? */
export function isDefaultBinding(id: ActionId, custom: Custom = useKeymap.getState().custom, mac = isMac()) {
  const def = ACTIONS.find((a) => a.id === id)?.defaults ?? [];
  return sameList(shownBindings(bindingsOf(id, custom), mac), shownBindings(def, mac));
}
