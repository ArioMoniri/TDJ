import { importNight, NightFormatError } from "@tdj/core";
import { getCatalog } from "@/lib/server/catalog";
import { json, preflight, readBody } from "@/lib/server/roomHttp";
export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** Body: `{ night }` → `{ playlist, missing, matched }`: the night rebuilt against this server's catalogue. */
export async function POST(req: Request) {
  const body = await readBody(req, 1_500_000);
  if (!body) return json({ error: "This is not a night." }, { status: 400 });
  try {
    const { catalog, cortinas } = getCatalog();
    return json(importNight(body.night, { catalog, cortinas }));
  } catch (e) {
    return json(
      { error: e instanceof NightFormatError ? e.message : "This night could not be opened." },
      { status: 400 },
    );
  }
}
