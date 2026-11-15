import { lazy, t } from "@/lib/i18n";
/**
 * Wave 2 — what a compose is doing while the DJ waits (it can take 5–15 s on the server). /api/compose answers once,
 * so the steps are estimated from how long this browser's last composes took (kept in localStorage), in the order the
 * engine runs them: choose the tandas, order them, plan the cortinas, then check the night (the strict panel and the
 * improve pass, the longest part). The last step holds until the answer arrives; the DJ can cancel at any time.
 */
export const COMPOSE_STEPS = lazy(
  () =>
    [
      t("composeProgress.choosing_tandas"),
      t("composeProgress.ordering"),
      t("composeProgress.cortinas"),
      t("composeProgress.checking_the_night"),
    ] as const,
);
/** where each step starts, as a share of the expected time (measured on the 4 h golden set) */
const STARTS = [0, 0.3, 0.45, 0.55];
const KEY = "tdj-compose-ms";
export const DEFAULT_COMPOSE_MS = 9000;

/** the step at `elapsed` ms of an expected `expected` ms, and the bar's share (never full before the answer) */
export function composeStep(elapsed: number, expected: number): { step: number; share: number } {
  const t = Math.max(0, elapsed) / Math.max(1000, expected);
  let step = 0;
  for (let k = 0; k < STARTS.length; k++) if (t >= STARTS[k]!) step = k;
  // past the expected time the bar creeps on towards 95 %, never to the end
  const share = t <= 0.9 ? t : Math.min(0.95, 0.9 + (1 - Math.exp(-(t - 0.9) * 2)) * 0.05);
  return { step, share };
}

/** how long a compose took here lately (a running mean of the last ones), else the default */
export function expectedComposeMs(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v >= 1000 && v <= 120_000 ? v : DEFAULT_COMPOSE_MS;
  } catch {
    return DEFAULT_COMPOSE_MS;
  }
}
export function rememberComposeMs(ms: number): void {
  if (!(ms >= 300 && ms <= 120_000)) return;
  try {
    const prev = expectedComposeMs();
    localStorage.setItem(KEY, String(Math.round(prev * 0.5 + ms * 0.5)));
  } catch {}
}
