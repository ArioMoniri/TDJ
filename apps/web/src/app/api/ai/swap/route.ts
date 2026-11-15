import { swapOptions } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalogFor } from "@/lib/server/catalog";
import { complete, extractJson, RelayNeeded, relayResponse, resolveAi } from "@/lib/server/llm";
export const dynamic = "force-dynamic";

/**
 * Round 21 — "AI pick" in the Swap sheet: the model chooses among the sides that keep the tanda valid (never outside
 * them), with the DJ's own key (BYOK headers) or the organiser's shared one; without a key, or when the model's answer
 * does not name one of them, the engine's best fit — labelled as such.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const { playlist, tandaIndex, trackIndex } = body;
  const ti = Number(tandaIndex),
    si = Number(trackIndex);
  const deps = getCatalogFor(playlist.options?.overrides);
  const { suggestions } = swapOptions(playlist, ti, si, deps, { limit: 12 });
  if (!suggestions.length)
    return NextResponse.json({ error: "no side keeps this tanda valid" }, { status: 404 });
  const engine = (why: string) =>
    NextResponse.json({
      songId: suggestions[0]!.song.id,
      source: "engine",
      why: `The engine's best fit (${why}).`,
    });
  const resolved = await resolveAi(req, { body });
  if (!resolved.ok)
    return engine(resolved.status === 429 ? "today's shared AI allowance is used up" : "no AI key set");
  const t = playlist.tandas[ti];
  const cur = t?.songs?.[si];
  const list = suggestions
    .map(
      (x, k) =>
        `${k + 1}. id=${x.song.id} · ${x.song.title} (${x.song.year ?? "?"}) · energy ${x.song.energy ?? "?"} · fame ${x.song.fame ?? 0}${x.song.tempo ? ` · ${Math.round(x.song.tempo.bpm)} BPM` : ""}`,
    )
    .join("\n");
  const system =
    'You are a tango DJ choosing one replacement side for a tanda. Choose ONLY from the numbered list (every entry already keeps the tanda valid). Reply with ONLY JSON: {"id": "<the id>", "why": "one short sentence"}. No em-dashes.';
  const user = `Tanda ${ti + 1}: ${t?.rhythm} · ${t?.orchestra}${t?.singer ? ` / ${t.singer}` : ""}, sides: ${(
    t?.songs ?? []
  )
    .map((s: { title: string; year?: number | null }) => `${s.title} (${s.year ?? "?"})`)
    .join(", ")}.\nReplace side ${si + 1}: ${cur?.title ?? "?"}.\nCandidates:\n${list}`;
  try {
    const j = extractJson(await complete({ ...resolved.ai, system, user, json: true, maxTokens: 200 }));
    const pick = suggestions.find((x) => x.song.id === j?.id);
    if (!pick) return engine("the model's answer named no valid side");
    return NextResponse.json({ songId: pick.song.id, source: "ai", why: String(j?.why ?? "").slice(0, 240) });
  } catch (e) {
    if (e instanceof RelayNeeded) return relayResponse(e);
    return engine(e instanceof Error ? e.message : "the model request failed");
  }
}
