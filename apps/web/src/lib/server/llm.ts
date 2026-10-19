import "server-only";
import type { AiProvider } from "@/lib/types";
import { getConfig } from "./config";
import { userFromRequest } from "./db";

export interface CompleteArgs {
  provider: AiProvider;
  key: string;
  model: string;
  /** Anthropic only: an organisation-level key must name the workspace it bills (`anthropic-workspace-id`) */
  workspace?: string;
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
}

export class LlmError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

const PROVIDERS: AiProvider[] = ["anthropic", "openai", "gemini", "openrouter"];
export function isProvider(x: unknown): x is AiProvider {
  return typeof x === "string" && (PROVIDERS as string[]).includes(x);
}

export interface AiCreds {
  provider: AiProvider;
  key: string;
  model: string;
  workspace?: string;
}

/** Read the BYOK headers; the key is used for this request only and never logged or stored. */
export function aiFromHeaders(req: Request): AiCreds {
  const provider = req.headers.get("x-ai-provider");
  return {
    provider: isProvider(provider) ? provider : ("anthropic" as AiProvider),
    key:
      req.headers.get("x-ai-key") ||
      req.headers.get("x-anthropic-key") ||
      process.env.ANTHROPIC_API_KEY ||
      "",
    model: req.headers.get("x-ai-model") || req.headers.get("x-anthropic-model") || "",
    workspace: (req.headers.get("x-ai-workspace") || "").trim() || undefined,
  };
}

/* ---------- the organiser's shared key ("AI reviews for everyone", /admin) ---------- */

export const AI_DAILY_DEFAULT = 20;

/** The shared key as the owner saved it (lib/server/config.ts), or null when there is none. */
export async function sharedAi(): Promise<(AiCreds & { dailyLimit: number }) | null> {
  const c = await getConfig();
  if (!c.AI_KEY) return null;
  const n = Number(c.AI_DAILY_LIMIT);
  return {
    provider: isProvider(c.AI_PROVIDER) ? c.AI_PROVIDER : "anthropic",
    key: c.AI_KEY,
    model: c.AI_MODEL || "",
    workspace: c.AI_WORKSPACE_ID || undefined,
    dailyLimit: Number.isFinite(n) && n > 0 ? Math.floor(n) : AI_DAILY_DEFAULT,
  };
}

/**
 * Per-DJ daily counter for the shared key, keyed by the signed `tdj_uid` cookie (lib/server/db.ts). It lives in
 * the memory of one server process: on Lambda every warm instance counts on its own and a cold start begins at
 * zero, so the limit is a courtesy cap against runaway use, not an exact quota. A table-backed counter would be
 * the next step if the owner needs it exact.
 */
const usage = new Map<string, { day: string; n: number }>();
const today = () => new Date().toISOString().slice(0, 10);
export function sharedUsed(uid: string): number {
  const u = usage.get(uid);
  return u && u.day === today() ? u.n : 0;
}
function countShared(uid: string) {
  const day = today();
  const u = usage.get(uid);
  if (!u || u.day !== day) usage.set(uid, { day, n: 1 });
  else u.n++;
  if (usage.size > 20_000) usage.clear();
}

export type ResolvedAi =
  | { ok: true; ai: AiCreds; shared: boolean; setCookie?: string }
  | { ok: false; status: 401 | 429; error: string; setCookie?: string };

/**
 * The key a request runs on: the DJ's own (headers) when present, else the organiser's shared key, counted per DJ
 * and per day. `count=false` only asks (Settings shows "N of 20 today"). The shared key never reaches a response.
 */
export async function resolveAi(req: Request, o: { count?: boolean } = {}): Promise<ResolvedAi> {
  const own = aiFromHeaders(req);
  if (own.key) return { ok: true, ai: own, shared: false };
  const shared = await sharedAi();
  if (!shared) return { ok: false, status: 401, error: "No API key. Add one in Settings → Written reviews." };
  const { id, setCookie } = userFromRequest(req);
  const used = sharedUsed(id);
  if (used >= shared.dailyLimit)
    return {
      ok: false,
      status: 429,
      error: `You have used today's ${shared.dailyLimit} reviews on the organiser's key. Try again tomorrow, or add your own key in Settings → Written reviews.`,
      setCookie,
    };
  if (o.count !== false) countShared(id);
  const { dailyLimit: _limit, ...ai } = shared;
  return { ok: true, ai, shared: true, setCookie };
}

/** What Settings shows about the shared key: whether one exists and how much of today's allowance this DJ used. */
export async function sharedQuota(req: Request): Promise<{
  shared: boolean;
  limit: number;
  used: number;
  provider?: AiProvider;
  setCookie?: string;
}> {
  const shared = await sharedAi();
  if (!shared) return { shared: false, limit: 0, used: 0 };
  const { id, setCookie } = userFromRequest(req);
  return {
    shared: true,
    limit: shared.dailyLimit,
    used: sharedUsed(id),
    provider: shared.provider,
    setCookie,
  };
}

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5.2",
  gemini: "gemini-3-pro",
  openrouter: "openrouter/auto",
};

/** One text completion across providers. Returns the assistant text (JSON text when `json` is set). */
export async function complete(a: CompleteArgs): Promise<string> {
  const model = a.model || DEFAULT_MODEL[a.provider];
  const maxTokens = a.maxTokens ?? 1200;
  if (!a.key) throw new LlmError("No API key for this provider. Add one in Settings → Written reviews.", 401);
  try {
    if (a.provider === "anthropic") {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      // an organisation-level key is accepted only with the workspace it bills (400 "not scoped to a workspace")
      const client = new Anthropic({
        apiKey: a.key,
        ...(a.workspace ? { defaultHeaders: { "anthropic-workspace-id": a.workspace } } : {}),
      });
      // Claude 5-family models always think: thinking tokens count against max_tokens, so a small cap
      // (1,200) truncates before any text appears. Give room, keep effort low for a quick review, and let
      // the API fall back to another model on a safety decline instead of returning nothing.
      const msg = await client.beta.messages.create({
        model,
        max_tokens: Math.max(maxTokens, 16000),
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: a.system + (a.json ? "\nRespond with a single JSON object and nothing else." : ""),
        messages: [{ role: "user", content: a.user }],
      });
      if (msg.stop_reason === "refusal")
        throw new LlmError(
          `The model declined this request${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : "."}`,
          422,
        );
      const text = msg.content
        .filter((c) => c.type === "text")
        .map((c) => (c as { text: string }).text)
        .join("\n");
      if (!text && msg.stop_reason === "max_tokens")
        throw new LlmError(
          "The model ran out of room before answering. Try again or pick a smaller model.",
          502,
        );
      return text;
    }
    if (a.provider === "openai" || a.provider === "openrouter") {
      const base = a.provider === "openrouter" ? "https://openrouter.ai/api/v1" : "https://api.openai.com/v1";
      const r = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${a.key}`,
          ...(a.provider === "openrouter" ? { "x-title": "TDJ" } : {}),
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          ...(a.json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: a.system },
            { role: "user", content: a.user },
          ],
        }),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };
      if (!r.ok) throw new LlmError(j.error?.message || `${a.provider} returned ${r.status}`, r.status);
      return j.choices?.[0]?.message?.content ?? "";
    }
    // gemini
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(a.key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: a.system }] },
          contents: [{ role: "user", parts: [{ text: a.user }] }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            ...(a.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      },
    );
    const j = (await r.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    if (!r.ok) throw new LlmError(j.error?.message || `Gemini returned ${r.status}`, r.status);
    return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  } catch (e) {
    if (e instanceof LlmError) throw e;
    // the SDK's APIError carries the provider's own message in `error.error.message`; show that, not the raw body
    const body = (e as { error?: { error?: { message?: string; type?: string } } }).error?.error;
    const msg = body?.message
      ? `${body.type === "not_found_error" ? "Unknown model: " : ""}${body.message}`
      : e instanceof Error
        ? e.message
        : "The model request failed.";
    const status = (e as { status?: number }).status;
    throw new LlmError(msg.slice(0, 300), typeof status === "number" && status >= 400 ? status : 502);
  }
}

/** The DJ's own house rules (Guide → Edit → House rules, ≤ 2000 chars) appended after DJ_RULES in every prompt. */
export function houseRulesBlock(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim().slice(0, 2000) : "";
  return text ? `\n\nHOUSE RULES (this DJ's own, they override the general rules above):\n${text}` : "";
}

/** Pull a JSON object out of model text (code fences, prose around it). Returns null when nothing parses. */
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
