import { describeLearned, type Playlist } from "@tdj/core";
import { NextResponse } from "next/server";
import { type EditResult, editByWords, editNight } from "@/lib/ai/edit";
import { getCatalogFor } from "@/lib/server/catalog";
import { crossOriginResponse, noStore } from "@/lib/server/guard";
import { ask, RelayNeeded, relayResponse, resolveAi } from "@/lib/server/llm";
export const dynamic = "force-dynamic";

/**
 * Round 22 — "Edit with AI" in Compose. Body: { playlist, instruction, memory?, houseRules?, aiAnswer? }. One model
 * call (the DJ's key, the organiser's shared key, or the DJ's ACP agent through a relay) turns the request into
 * edits; the engine applies them (lib/ai/edit.ts → packages/core/src/nightEdit.ts) and every refused edit comes back
 * with its reason. Without a model the plain-words reader runs the same engine. The night itself never leaves the
 * engine unchecked: the response is the edited night, the changes (before / after), and what was refused.
 */
export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  const body = await req.json().catch(() => null);
  const playlist = body?.playlist as Playlist | undefined;
  if (!playlist?.tandas?.length) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const instruction = String(body.instruction ?? "")
    .trim()
    .slice(0, 400);
  if (!instruction) return NextResponse.json({ error: "Say what to change." }, { status: 400 });
  const live = getCatalogFor(playlist.options?.overrides);
  const deps = { catalog: live.catalog, cortinas: live.cortinas, contextModel: live.contextModel };
  const respond = (r: EditResult, why?: string) =>
    noStore(
      NextResponse.json({
        playlist: r.playlist,
        applied: r.applied,
        rejected: r.rejected.map((x) => ({ op: x.op, reason: x.reason })),
        notUnderstood: r.notUnderstood,
        note: r.note ?? null,
        source: r.source,
        ...(why ? { why } : {}),
      }),
    );

  const resolved = await resolveAi(req, { body });
  if (!resolved.ok)
    return respond(
      editByWords(playlist, deps, instruction),
      resolved.status === 429 ? "today's allowance on the organiser's key is used up" : "no model connected",
    );
  try {
    const nameOf = (id: string) => deps.catalog.byOrchestra.get(id)?.[0]?.orchestra ?? id;
    const r = await editNight({
      playlist,
      instruction,
      deps,
      ask: (q) => ask(resolved.ai, q),
      extras: {
        learned: body.memory?.learned ? describeLearned(body.memory.learned, nameOf) : undefined,
        houseRules: typeof body.houseRules === "string" ? body.houseRules : undefined,
      },
    });
    const res = respond(r);
    if (resolved.setCookie) res.headers.append("set-cookie", resolved.setCookie);
    return res;
  } catch (e) {
    if (e instanceof RelayNeeded) return relayResponse(e);
    return respond(
      editByWords(playlist, deps, instruction),
      e instanceof Error ? e.message : "the model request failed",
    );
  }
}
