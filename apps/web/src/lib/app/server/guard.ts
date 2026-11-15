/** `@/lib/server/guard` on the device: every request comes from the app's own pages, so nothing is cross-origin. */
export async function crossOriginResponse(_req: Request): Promise<Response | null> {
  return null;
}
export function noStore<T extends Response>(res: T): T {
  res.headers.set("cache-control", "no-store");
  return res;
}
