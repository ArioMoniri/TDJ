import { isAiProvider } from "@/lib/ai/models";
import { LlmError, type ModelReply, type ModelRequest, RelayNeeded } from "@/lib/ai/provider";
import type { AiProvider } from "@/lib/types";
import { runtime } from "./runtime";

/**
 * `@/lib/server/llm` on the device: the same names the AI routes import, over the provider layer (lib/ai/*).
 * There is no organiser's shared key in an app. A key provider's key stays in the Keychain (the request carries
 * only the mark that one is saved; the native side adds the key on its way to the provider), and an ACP agent is
 * asked from the device directly, so no relay is ever needed here. The pure helpers are the server's own, kept
 * equal by lib/app/deviceRoutes.test.ts.
 */
export { LlmError, RelayNeeded };

export interface AiCreds {
  provider: AiProvider;
  key: string;
  model: string;
  workspace?: string;
}
export interface CompleteArgs extends AiCreds {
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
}
export type ResolvedAi =
  | { ok: true; ai: AiCreds; shared: boolean; setCookie?: string }
  | { ok: false; status: 401 | 429; error: string; setCookie?: string };

const NO_KEY = "No API key. Add one in Settings → Models.";

/** the DJ's model as the page's headers name it (lib/ai/client.ts → aiHeaders) */
export async function resolveAi(
  req: Request,
  _o: { count?: boolean; body?: unknown } = {},
): Promise<ResolvedAi> {
  const p = req.headers.get("x-ai-provider");
  const provider: AiProvider = isAiProvider(p) ? p : "anthropic";
  if (provider === "acp") return { ok: true, ai: { provider, key: "", model: "" }, shared: false };
  const key = req.headers.get("x-ai-key") || req.headers.get("x-anthropic-key") || "";
  if (!key) return { ok: false, status: 401, error: NO_KEY };
  return {
    ok: true,
    ai: {
      provider,
      key,
      model: req.headers.get("x-ai-model") || req.headers.get("x-anthropic-model") || "",
      workspace: (req.headers.get("x-ai-workspace") || "").trim() || undefined,
    },
    shared: false,
  };
}

export async function sharedQuota(_req: Request): Promise<{
  shared: boolean;
  limit: number;
  used: number;
  provider?: AiProvider;
  setCookie?: string;
}> {
  return { shared: false, limit: 0, used: 0 };
}

export async function ask(a: AiCreds, req: ModelRequest): Promise<ModelReply> {
  const { signal: _signal, ...plain } = req;
  return runtime().ask(a, plain);
}

export async function complete(a: CompleteArgs): Promise<string> {
  const r = await ask(a, { system: a.system, user: a.user, json: a.json, maxTokens: a.maxTokens });
  return r.text;
}

export function relayResponse(e: RelayNeeded): Response {
  return new Response(JSON.stringify({ relay: e.relay }), {
    status: 202,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function houseRulesBlock(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim().slice(0, 2000) : "";
  return text ? `\n\nHOUSE RULES (this DJ's own, they override the general rules above):\n${text}` : "";
}

export function extractJson(text: string): Record<string, unknown> | null {
  const t = text.trim();
  const tries = [t, t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")];
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  for (const s of tries) {
    try {
      const v = JSON.parse(s);
      if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {}
  }
  return null;
}
