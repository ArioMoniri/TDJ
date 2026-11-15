import { t } from "@/lib/i18n";
import type { AcpConnection } from "./acp";
import type { AiProvider } from "./models";
import { LlmError, type ModelReply, type Relay } from "./provider";
import { providerFor } from "./providers";

/**
 * Round 22 — the browser's side of every AI request. `aiHeaders` sends the DJ's active model (an API key: BYOK,
 * this request only; or an ACP agent). With an ACP agent the server cannot reach the DJ's agent, so a route answers
 * 202 with the prompt (a relay); `aiFetch` asks the agent from this device and sends the answer back with the same
 * request. Key providers never relay: one request, as before.
 */
export interface AiSettingsLike {
  ai: { provider: AiProvider; key: string; model: string; workspace?: string; acpId?: string };
  acp?: AcpConnection[];
}

export function aiHeaders(s: AiSettingsLike): Record<string, string> {
  const acp = s.ai.provider === "acp";
  return {
    "content-type": "application/json",
    "x-ai-provider": s.ai.provider,
    "x-ai-key": acp ? "" : s.ai.key,
    "x-ai-model": acp ? "" : s.ai.model,
    "x-ai-workspace": acp ? "" : (s.ai.workspace ?? ""),
  };
}

export const activeAcp = (s: AiSettingsLike): AcpConnection | undefined =>
  s.ai.provider === "acp" ? (s.acp ?? []).find((c) => c.id === s.ai.acpId) : undefined;

/** whether a model of the DJ's own is set (a key, or a chosen agent) */
export const hasOwnModel = (s: AiSettingsLike) => (s.ai.provider === "acp" ? !!activeAcp(s) : !!s.ai.key);

/** run a relayed prompt on this device (the DJ's ACP agent) */
export async function completeOnDevice(s: AiSettingsLike, relay: Relay): Promise<ModelReply> {
  const conn = activeAcp(s);
  if (!conn) throw new LlmError(t("ai.choose_agent"), 401);
  return providerFor({ provider: "acp", acp: conn }).complete({
    system: relay.system,
    user: relay.user,
    tools: relay.tools,
    json: relay.json,
    maxTokens: relay.maxTokens,
  });
}

/** POST a JSON body to an AI route; a relay is answered on this device and the request sent once more */
export async function aiFetch(
  url: string,
  body: Record<string, unknown>,
  s: AiSettingsLike,
  o: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  const f = o.fetchImpl ?? fetch;
  const headers = aiHeaders(s);
  const r = await f(url, { method: "POST", headers, body: JSON.stringify(body), signal: o.signal });
  if (r.status !== 202) return r;
  const j = (await r
    .clone()
    .json()
    .catch(() => null)) as { relay?: Relay } | null;
  if (!j?.relay) return r;
  let reply: ModelReply;
  try {
    reply = await completeOnDevice(s, j.relay);
  } catch (e) {
    const status = e instanceof LlmError ? e.status : 502;
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : t("ai.client.the_agent_did_not_answer") }),
      {
        status: status >= 400 ? status : 502,
        headers: { "content-type": "application/json" },
      },
    );
  }
  return f(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...body,
      aiAnswer: { for: j.relay.for, text: reply.text, toolCalls: reply.toolCalls },
    }),
    signal: o.signal,
  });
}
