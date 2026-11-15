import { NightFormatError, parseNightFile } from "@tdj/core";
import { clientKey } from "@/lib/server/guard";
import { json, preflight, readBody } from "@/lib/server/roomHttp";
import { getShortNight, isShortId, putShortNight, rateLimited } from "@/lib/server/rooms";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** `?id=<short id>` → `{ night }`: a short share link made on this server. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!isShortId(id)) return json({ error: "This link is not valid." }, { status: 404 });
  const night = await getShortNight(id).catch(() => null);
  if (!night) {
    if (rateLimited(`short-miss:${clientKey(req)}`, 30))
      return json({ error: "Too many tries. Wait a minute." }, { status: 429 });
    return json({ error: "This link has expired or never existed." }, { status: 404 });
  }
  return json({ night });
}

/** Body: `{ night }` → `{ id }`, kept for 30 days. */
export async function POST(req: Request) {
  if (rateLimited(`short:${clientKey(req)}`, 20))
    return json({ error: "Too many links at once. Wait a minute." }, { status: 429 });
  const body = await readBody(req, 1_000_000);
  let night: ReturnType<typeof parseNightFile>;
  try {
    night = parseNightFile(body?.night);
  } catch (e) {
    return json(
      { error: e instanceof NightFormatError ? e.message : "This is not a night." },
      { status: 400 },
    );
  }
  try {
    const id = await putShortNight(night);
    if (!id) return json({ error: "This server keeps no short links." }, { status: 503 });
    return json({ id });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 500 });
  }
}
