/**
 * Apps: a media element cannot reach the on-device `/api/preview` (it is answered by the engine worker, not by a
 * URL), so it gets the provider's current signed link instead, through the adapter.
 */
export async function mediaUrl(src: string): Promise<string> {
  if (!src.startsWith("/api/preview")) return src;
  const r = await fetch(`${src}${src.includes("?") ? "&" : "?"}json=1`);
  const j = (r.ok ? await r.json() : null) as { url?: string } | null;
  if (!j?.url) throw new Error("No preview available right now");
  return j.url;
}
