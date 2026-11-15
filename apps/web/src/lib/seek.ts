/** Seek-bar math (2026-11): shared by the Booth's Now card and the app's mini player. */

/** seconds a ← / → press moves */
export const SEEK_KEY_SEC = 5;

/** Where a pointer at `clientX` sits on a bar starting at `left`, `width` wide: 0…1, clamped. */
export function seekFraction(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return 0;
  return Math.min(1, Math.max(0, (clientX - left) / width));
}

/** The target of a key on a focused bar (null: the key does not seek). */
export function seekStep(key: string, value: number, max: number, step = SEEK_KEY_SEC): number | null {
  const len = Math.max(0, max);
  const clamp = (v: number) => Math.min(len, Math.max(0, v));
  if (key === "ArrowRight" || key === "ArrowUp") return clamp(value + step);
  if (key === "ArrowLeft" || key === "ArrowDown") return clamp(value - step);
  if (key === "PageUp") return clamp(value + step * 6);
  if (key === "PageDown") return clamp(value - step * 6);
  if (key === "Home") return 0;
  if (key === "End") return len;
  return null;
}
/** "m:ss", "m.ss" or plain seconds → seconds; null when it does not read as a time */
export function parseClock(v: string): number | null {
  const t0 = v.trim();
  if (!t0) return null;
  const m = /^(\d+)[:.](\d{1,2})$/.exec(t0);
  if (m) {
    const sec = Number(m[2]);
    return sec < 60 ? Number(m[1]) * 60 + sec : null;
  }
  return /^\d+$/.test(t0) ? Number(t0) : null;
}
