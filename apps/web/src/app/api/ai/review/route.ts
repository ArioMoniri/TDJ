import { DJ_RULES, summarizeMemory, toSetList } from "@tdj/core";
import { NextResponse } from "next/server";
import { crossOriginResponse, noStore } from "@/lib/server/guard";
import { complete, houseRulesBlock, LlmError, resolveAi, sharedQuota } from "@/lib/server/llm";
export const dynamic = "force-dynamic";

const SYSTEM = `You are a veteran tango DJ (milonguero tradition, Buenos Aires and the European marathon circuit). Review tanda playlists: energy arc, orchestra sequencing, singer and era coherence, cortina fit, última tanda and La Cumparsita. Be concrete and brief; use dancer language; suggest specific swaps by tanda number. No em-dashes.\n\n${DJ_RULES}`;

/** Settings → Written reviews: whether the organiser's shared key exists and how much of today's allowance is used. */
export async function GET(req: Request) {
  const q = await sharedQuota(req);
  const { setCookie, ...body } = q;
  const res = NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  if (setCookie) res.headers.append("set-cookie", setCookie);
  return res;
}

/**
 * BYOK, provider-agnostic. Headers: x-ai-provider, x-ai-key, x-ai-model, x-ai-workspace. Keys are used once and
 * never stored or logged. Without a personal key the organiser's shared key runs the request, counted per DJ and
 * per day (lib/server/llm.ts → resolveAi); over the limit → 429 with a plain message. Only the app's own pages
 * may call it (same-origin check): a script elsewhere must not burn the organiser's credit.
 */
export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  const body = await req.json().catch(() => ({}));
  const r = await resolveAi(req);
  if (!r.ok) {
    const res = noStore(NextResponse.json({ error: r.error }, { status: r.status }));
    if (r.setCookie) res.headers.append("set-cookie", r.setCookie);
    return res;
  }
  const ai = r.ai;
  const withCookie = (res: NextResponse) => {
    noStore(res);
    if (r.setCookie) res.headers.append("set-cookie", r.setCookie);
    return res;
  };
  try {
    if (body.test) {
      const text = await complete({
        ...ai,
        system: "You are a connection test. Reply with the single word OK.",
        user: "ping",
        maxTokens: 16,
      });
      return withCookie(
        NextResponse.json({
          ok: true,
          text: text.trim().slice(0, 40),
          model: ai.model || "default",
          shared: r.shared,
        }),
      );
    }
    if (!body.playlist?.tandas) return NextResponse.json({ error: "playlist required" }, { status: 400 });
    const memory =
      body.memory && typeof body.memory === "object" ? summarizeMemory(body.memory) : "No memory yet.";
    const text = await complete({
      ...ai,
      system: `${SYSTEM}${houseRulesBlock(body.houseRules ?? body.overrides?.guide?.houseRules)}\n\nWHAT YOU REMEMBER ABOUT THIS DJ:\n${memory}`,
      user: `${body.question || "Review this set and tell me the three most valuable improvements."}\n\nSET LIST:\n${toSetList(body.playlist)}`,
    });
    return withCookie(
      NextResponse.json({ text, model: ai.model || "default", provider: ai.provider, shared: r.shared }),
    );
  } catch (e) {
    const status = e instanceof LlmError ? e.status : 502;
    return noStore(
      NextResponse.json({ error: e instanceof Error ? e.message : "Model request failed" }, { status }),
    );
  }
}
