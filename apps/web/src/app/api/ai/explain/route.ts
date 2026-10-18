import Anthropic from "@anthropic-ai/sdk";
import { toSetList } from "@tdj/core";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

/** BYOK: the user's Anthropic key arrives in a header per request and is never stored or logged server-side. */
export async function POST(req: Request) {
  const key = req.headers.get("x-anthropic-key") || process.env.ANTHROPIC_API_KEY;
  const model = req.headers.get("x-anthropic-model") || process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  if (!key) return NextResponse.json({ error: "No Anthropic API key. Add yours in Settings → AI." }, { status: 401 });
  const { playlist, question } = await req.json();
  const client = new Anthropic({ apiKey: key });
  const setlist = toSetList(playlist);
  try {
    const msg = await client.messages.create({
      model, max_tokens: 1200,
      system: "You are a veteran tango DJ (milonguero tradition, Buenos Aires + European marathon circuit). Review tanda playlists: energy arc, orchestra sequencing, singer/era coherence, cortina fit, última tanda and La Cumparsita. Be concrete and brief; use dancer language; suggest specific swaps by tanda number. No em-dashes.",
      messages: [{ role: "user", content: `${question || "Review this set and tell me the three most valuable improvements."}\n\nSET LIST:\n${setlist}` }],
    });
    const text = msg.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n");
    return NextResponse.json({ text, model });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
