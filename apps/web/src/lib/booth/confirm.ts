import { create } from "zustand";

/**
 * 2026-11 (the owner: "a mistaken tap must never cut the song"): once the night runs and a song sounds, an action that
 * changes what the room hears asks for a light confirmation. One pattern per kind of control:
 * - transport buttons: press and hold 0.6 s (a ring fills); a plain tap only says "Hold to confirm";
 * - sheet, menu, row and card actions (and the keyboard): the first tap arms the control ("Tap again to confirm",
 *   a 3 s countdown ring), a second tap or Enter confirms, Esc or the countdown cancels.
 * Never before the night, never for what leaves the room alone (volume, the headphones, floor reactions, sheets),
 * and Settings → Booth turns it off.
 */
export const ARM_MS = 3000;
export const HOLD_MS = 600;

export interface Armed {
  key: string;
  run: () => void;
  until: number;
}

interface ArmStore {
  armed: Armed | null;
}
export const useArm = create<ArmStore>(() => ({ armed: null }));

let timer: ReturnType<typeof setTimeout> | null = null;
/** where the booth answers "does this need a confirmation now?" (set by the booth store) */
let neededFn: () => boolean = () => false;
export function setConfirmNeeded(f: () => boolean) {
  neededFn = f;
}
export const confirmNeeded = () => neededFn();

export function disarm() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (useArm.getState().armed) useArm.setState({ armed: null });
}

export function arm(key: string, run: () => void, now = Date.now()) {
  if (timer) clearTimeout(timer);
  useArm.setState({ armed: { key, run, until: now + ARM_MS } });
  timer = setTimeout(() => {
    timer = null;
    if (useArm.getState().armed?.key === key) useArm.setState({ armed: null });
  }, ARM_MS);
}

/**
 * Tap-to-arm: runs at once when no confirmation is needed (or `key` is already armed: the second tap), else arms it.
 */
export function guard(key: string, run: () => void, now = Date.now()): "ran" | "armed" {
  const a = useArm.getState().armed;
  if (!confirmNeeded() || (a && a.key === key && a.until > now)) {
    disarm();
    run();
    return "ran";
  }
  arm(key, run, now);
  return "armed";
}

/** Enter: confirm whatever is armed (true when something ran) */
export function confirmArmed(now = Date.now()): boolean {
  const a = useArm.getState().armed;
  if (!a || a.until <= now) return false;
  disarm();
  a.run();
  return true;
}

export const useArmed = (key: string) => useArm((s) => s.armed?.key === key);
