import { insertSongOptions, insertTandaOptions, nightSummary } from "@tdj/core";
import { NextResponse } from "next/server";
import { getCatalogFor } from "@/lib/server/catalog";
import { complete, extractJson, RelayNeeded, relayResponse, resolveAi } from "@/lib/server/llm";
export const dynamic = "force-dynamic";

/**
 * 2026-11 — "Ask my AI" in the Insert sheet (components/InsertSheet.tsx): the DJ's model (BYOK headers, or the
 * organiser's shared key) chooses for a spot — a side for place `at` of tanda `tandaIndex`, or a whole tanda for a new
 * chair at `at` — among the engine's candidates for it (never outside them), with the night and the spot as context
 * and one line why. Without a key, or when the answer names no candidate, the engine's first — labelled as such.
 * Body: { playlist, kind: "song" | "tanda", tandaIndex?, at, seed? } → { pick, source, why }: `pick` is a side id
 * (song) or the option's index in the `tandaOptions` list made with the same seed (tanda).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
  const { playlist } = body;
  const kind = body.kind === "tanda" ? "tanda" : "song";
  const at = Number(body.at);
  const ti = Number(body.tandaIndex);
  const deps = getCatalogFor(playlist.options?.overrides);
  type Cand = { id: string; line: string };
  let cands: Cand[] = [];
  let spot = "";
  if (kind === "song") {
    const t = playlist.tandas[ti];
    cands = insertSongOptions(playlist, ti, at, deps, { limit: 10 }).suggestions.map((x) => ({
      id: x.song.id,
      line: `${x.song.title} · ${x.why}`,
    }));
    spot = `Add one side at place ${at + 1} of tanda ${ti + 1} (${t?.rhythm} · ${t?.orchestra}${t?.singer ? ` / ${t.singer}` : ""}; sides: ${(t?.songs ?? []).map((s: { title: string }) => s.title).join(", ")}).`;
  } else {
    const seed = Number(body.seed) || 1;
    cands = insertTandaOptions(playlist, at, deps, { n: 4, seed }).map((o, k) => ({
      id: String(k),
      line: `${o.tanda.rhythm} · ${o.why} · ${o.tanda.songs.map((s) => s.title).join(", ")}`,
    }));
    spot =
      at <= 0
        ? "Add a whole tanda before the first tanda."
        : at >= playlist.tandas.length
          ? `Add a whole tanda after the última (tanda ${playlist.tandas.length}).`
          : `Add a whole tanda between tanda ${at} and tanda ${at + 1}.`;
  }
  if (!cands.length) return NextResponse.json({ error: "nothing fits this spot" }, { status: 404 });
  const engine = (why: string) =>
    NextResponse.json({ pick: cands[0]!.id, source: "engine", why: `The engine's best fit (${why}).` });
  const resolved = await resolveAi(req, { body });
  if (!resolved.ok)
    return engine(resolved.status === 429 ? "today's shared AI allowance is used up" : "no AI key set");
  const system =
    'You are a tango DJ helping another DJ add to a milonga night. Choose ONLY from the numbered list (each entry already keeps the night\'s rules). Think of the energy arc, the rhythm cycle, the big four and what follows. Reply with ONLY JSON: {"id": "<the id>", "why": "one short sentence"}. No em-dashes.';
  const user = `${nightSummary(playlist)}\n\n${spot}\nCandidates:\n${cands.map((c, k) => `${k + 1}. id=${c.id} · ${c.line}`).join("\n")}`;
  try {
    const j = extractJson(await complete({ ...resolved.ai, system, user, json: true, maxTokens: 220 }));
    const pick = cands.find((c) => c.id === String(j?.id ?? ""));
    if (!pick) return engine("the model's answer named no candidate");
    return NextResponse.json({ pick: pick.id, source: "ai", why: String(j?.why ?? "").slice(0, 240) });
  } catch (e) {
    if (e instanceof RelayNeeded) return relayResponse(e);
    return engine(e instanceof Error ? e.message : "the model request failed");
  }
}
