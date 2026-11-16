/**
 * 2026-11 — the Booth's keyboard bindings that act on a song, in one place: the page's key handler, the shortcuts
 * sheet and (later) Settings → Keyboard's editable keymap read them from here. A keymap store can pass its overrides
 * as `map`; the defaults are the shipped keys.
 */
export interface Binding {
  /** a KeyboardEvent.key */
  key: string;
}
export const BOOTH_KEYMAP = {
  /** a focused or selected row, or the open song sheet: Play now in the room (mid-night: Enter again confirms) */
  playNow: { key: "Enter" },
} as const satisfies Record<string, Binding>;
export type BoothAction = keyof typeof BOOTH_KEYMAP;
export type BoothKeymap = Partial<Record<BoothAction, Binding>>;

const bindingOf = (a: BoothAction, map?: BoothKeymap): Binding => map?.[a] ?? BOOTH_KEYMAP[a];

/** The key pressed is `action`'s (no ⌘ / Ctrl / ⌥, no auto-repeat). */
export function boothKey(
  e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "repeat">,
  action: BoothAction,
  map?: BoothKeymap,
): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return false;
  return e.key === bindingOf(action, map).key;
}

/** How the shortcuts sheet prints the key ("enter", "space", a letter). */
export function keyLabel(action: BoothAction, map?: BoothKeymap): string {
  const k = bindingOf(action, map).key;
  if (k === " ") return "space";
  return k.length === 1 ? k : k.toLowerCase();
}
