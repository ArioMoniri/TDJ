/** Longest a signed preview link is reused, whatever its own expiry says. */
export const MAX_TTL = 10 * 60_000;

/**
 * When a signed preview link should stop being handed out (ms epoch): a minute before its own `exp=<unix s>` token
 * (Deezer signs previews for ~15 min), never later than now + MAX_TTL; no token → now + MAX_TTL.
 */
export function linkExpiry(url: string, now = Date.now()): number {
  const m = /(?:^|[?&~=])exp=(\d{9,11})(?!\d)/.exec(url);
  if (!m) return now + MAX_TTL;
  return Math.min(Number(m[1]) * 1000 - 60_000, now + MAX_TTL);
}
