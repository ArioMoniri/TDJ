import { toSetList } from "@tdj/core";
import { NextResponse } from "next/server";
import { aiFromHeaders, complete, LlmError } from "@/lib/server/llm";
export const dynamic = "force-dynamic";

const SYSTEM =
  "You are a veteran tango DJ (milonguero tradition, Buenos Aires and the European marathon circuit). Review tanda playlists: energy arc, orchestra sequencing, singer and era coherence, cortina fit, última tanda and La Cumparsita. Be concrete and brief; use dancer language; suggest specific swaps by tanda number. No em-dashes.";

/** BYOK, provider-agnostic. Headers: x-ai-provider, x-ai-key, x-ai-model. Keys are used once and never stored or logged. */
export async function POST(req: Request) {
  const ai = aiFromHeaders(req);
  const body = await req.json().catch(() => ({}));
  if (!ai.key)
    return NextResponse.json({ error: "No API key. Add one in Settings → Written reviews." }, { status: 401 });
  try {
    if (body.test) {
      const text = await complete({
        ...ai,
        system: "You are a connection test. Reply with the single word OK.",
        user: "ping",
        maxTokens: 16,
      });
      return NextResponse.json({ ok: true, text: text.trim().slice(0, 40), model: ai.model || "default" });
    }
    if (!body.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
    const text = await complete({
      ...ai,
      system: SYSTEM,
      user: `${body.question || "Review this set and tell me the three most valuable improvements."}\n\nSET LIST:\n${toSetList(body.playlist)}`,
    });
    return NextResponse.json({ text, model: ai.model || "default", provider: ai.provider });
  } catch (e) {
    const status = e instanceof LlmError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Model request failed" }, { status });
  }
}
