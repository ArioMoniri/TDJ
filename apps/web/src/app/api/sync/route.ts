import { NextResponse } from "next/server";
import { clientKey } from "@/lib/server/guard";
import {
  isDeviceTag,
  isSpaceId,
  parseWrite,
  readSpace,
  SYNC_LIMITS,
  SyncError,
  spaceKey,
  syncRateLimited,
  syncStore,
  writeSpace,
} from "@/lib/server/sync";
export const dynamic = "force-dynamic";

/**
 * Sync spaces (docs/SYNC.md): encrypted records only, no accounts, no cookies. The space id travels in the
 * `x-tdj-sync-id` header (never in the URL, so it is not in access logs); the device's opaque tag in `x-tdj-device`.
 * Any origin may call it without credentials: the Mac, iPhone and iPad apps sync with the server their build names
 * (TDJ_SYNC_URL) or the one the DJ set in Settings.
 *
 * GET    ?since=<version>  → { version, more, records: [{ rid, blob }], devices }
 * PUT    { records: [{ rid, blob }] } → { version }
 * DELETE → the space and its records are gone (Reset sync code)
 */
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, PUT, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, x-tdj-sync-id, x-tdj-device",
  "access-control-max-age": "600",
};
function json(body: unknown, init: ResponseInit = {}): NextResponse {
  const res = NextResponse.json(body, init);
  res.headers.set("cache-control", "no-store");
  for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
  return res;
}
export const OPTIONS = () => new NextResponse(null, { status: 204, headers: CORS });

type Ctx = { space: string; device: string | null };
async function guard(req: Request, write: boolean): Promise<Ctx | NextResponse> {
  const id = req.headers.get("x-tdj-sync-id");
  if (!isSpaceId(id)) return json({ error: "Missing or malformed sync id." }, { status: 400 });
  if (syncRateLimited(`ip:${clientKey(req)}`, SYNC_LIMITS.perMinute))
    return json(
      { error: "Too many sync requests. Wait a minute." },
      { status: 429, headers: { "retry-after": "60" } },
    );
  const space = spaceKey(id);
  if (write && syncRateLimited(`space:${space}`, SYNC_LIMITS.writesPerMinute))
    return json(
      { error: "Too many writes to this sync space. Wait a minute." },
      { status: 429, headers: { "retry-after": "60" } },
    );
  const dev = req.headers.get("x-tdj-device");
  return { space, device: isDeviceTag(dev) ? dev : null };
}
const unavailable = () => json({ error: "Sync is not available on this T-DJ server." }, { status: 503 });
const failed = (e: unknown) =>
  e instanceof SyncError
    ? json({ error: e.message }, { status: e.status })
    : json({ error: "The sync server could not do that." }, { status: 500 });

export async function GET(req: Request) {
  const store = syncStore();
  if (!store) return unavailable();
  const ctx = await guard(req, false);
  if (ctx instanceof NextResponse) return ctx;
  const since = Math.max(0, Math.floor(Number(new URL(req.url).searchParams.get("since") ?? 0)) || 0);
  try {
    const r = await readSpace(store, ctx.space, since);
    // a reading device is "seen" (at most once a minute, so a poll does not write every time)
    if (ctx.device && r.version > 0 && Date.now() - (r.devices[ctx.device] ?? 0) > 60_000)
      await store.touchDevice(ctx.space, ctx.device, Date.now());
    return json({
      version: r.version,
      more: r.more,
      records: r.records.map(({ rid, blob }) => ({ rid, blob })),
      devices: r.devices,
    });
  } catch (e) {
    return failed(e);
  }
}

export async function PUT(req: Request) {
  const store = syncStore();
  if (!store) return unavailable();
  const ctx = await guard(req, true);
  if (ctx instanceof NextResponse) return ctx;
  const text = await req.text().catch(() => "");
  if (text.length > SYNC_LIMITS.bodyBytes) return json({ error: "Too much at once." }, { status: 413 });
  try {
    const items = parseWrite(JSON.parse(text || "null"));
    const version = await writeSpace(store, ctx.space, items, ctx.device);
    return json({ version });
  } catch (e) {
    if (e instanceof SyntaxError) return json({ error: "Invalid JSON." }, { status: 400 });
    return failed(e);
  }
}

export async function DELETE(req: Request) {
  const store = syncStore();
  if (!store) return unavailable();
  const ctx = await guard(req, true);
  if (ctx instanceof NextResponse) return ctx;
  try {
    const m = await store.manifest(ctx.space);
    if (m) await store.drop(ctx.space, Object.keys(m.recs));
    return json({ ok: true });
  } catch (e) {
    return failed(e);
  }
}
