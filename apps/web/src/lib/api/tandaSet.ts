import { type Playlist, type Song, setTandaSides } from "@tdj/core";
import { forWire } from "@/lib/server/wire";
import type { AppOverrides } from "@/lib/types";
import type { ApiDeps } from "./deps";
import { bad, bodyJson, json } from "./http";

/**
 * POST /api/tanda-set { playlist, tandaIndex, sides } — 2026-11, the Swap sheets' "Apply": the DJ's own tanda in a
 * place (core `setTandaSides`). Each side is a catalogue id, or a recording a connected service found, sent whole
 * (only the fields a side shows and plays are kept). The night comes back re-timed and re-scored with `changed`, or
 * `reason` (409) when it cannot be a tanda; the browser's rule check (gateEdit) asks before a broken rule applies.
 */
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** a connected service's recording as a side: the known fields only, its id kept under `ext:` */
export function externalSide(v: unknown): Song | null {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const id = str(o.id, 160);
  const title = str(o.title);
  if (!id?.startsWith("ext:") || !title) return null;
  const sp = (o.spotify && typeof o.spotify === "object" ? o.spotify : null) as Record<
    string,
    unknown
  > | null;
  const uri = str(sp?.uri, 80);
  const singer = str(o.singer, 120) ?? null;
  const rhythm = str(o.rhythm, 20);
  return {
    id,
    title,
    rhythm: (["tango", "vals", "milonga"].includes(rhythm ?? "") ? rhythm : "tango") as Song["rhythm"],
    orchestra: str(o.orchestra) ?? "",
    orchestraId: str(o.orchestraId, 120) ?? "",
    singer,
    singerId: singer ? (str(o.singerId, 120) ?? null) : null,
    vocal: !!singer,
    year: num(o.year) ?? null,
    yearApprox: true,
    era: "unknown" as Song["era"],
    album: str(o.album) ?? null,
    source: str(o.source, 20) ?? "service",
    durationSec: num(o.durationSec),
    spotify: uri && /^spotify:track:[A-Za-z0-9]+$/.test(uri) ? { uri, url: str(sp?.url, 200) } : null,
  } as Song;
}

export async function tandaSet(req: Request, d: ApiDeps): Promise<Response> {
  const body = await bodyJson<{ playlist?: Playlist; tandaIndex?: unknown; sides?: unknown }>(req);
  if (!body?.playlist?.tandas) return bad("playlist required");
  if (!Array.isArray(body.sides)) return bad("sides required");
  const sides: Array<string | Song> = [];
  for (const x of body.sides.slice(0, 8)) {
    if (typeof x === "string") sides.push(x.slice(0, 160));
    else {
      const s = externalSide(x);
      if (!s) return bad("each side is a catalogue id or a service recording (id ext:…, title)");
      sides.push(s);
    }
  }
  const deps = d.catalogFor(body.playlist.options?.overrides as AppOverrides);
  const r = setTandaSides(body.playlist, Number(body.tandaIndex), sides, deps);
  const changed = r.playlist !== body.playlist;
  return json(
    { ...forWire(r.playlist), changed, ...(r.reason ? { reason: r.reason } : {}) },
    { status: changed || !r.reason ? 200 : 409 },
  );
}
