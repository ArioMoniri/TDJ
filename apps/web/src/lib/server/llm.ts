import "server-only";
import type { AiProvider } from "@/lib/types";
import { getConfig } from "./config";
import { userFromRequest } from "./db";
import { clientKey } from "./guard";

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

/**
 * Read the BYOK headers; the key is used for this request only and never logged or stored. There is no
 * environment fallback here: a deployment key (`ANTHROPIC_API_KEY`) is a shared key and is counted as one
 * (`sharedAi`), never an uncounted path.
 */
export function aiFromHeaders(req: Request): AiCreds {
  const provider = req.headers.get("x-ai-provider");
  return {
    provider: isProvider(provider) ? provider : ("anthropic" as AiProvider),
    key: req.headers.get("x-ai-key") || req.headers.get("x-anthropic-key") || "",
    model: req.headers.get("x-ai-model") || req.headers.get("x-anthropic-model") || "",
    workspace: (req.headers.get("x-ai-workspace") || "").trim() || undefined,
  };
}

/* ---------- the organiser's shared key ("AI reviews for everyone", /admin) ---------- */

export const AI_DAILY_DEFAULT = 20;
/** one client address may use this many times the per-DJ allowance (a milonga shares one NAT, a script does not) */
export const AI_ADDRESS_FACTOR = 5;
/** the whole deployment may use this many times the per-DJ allowance per day unless AI_DAILY_TOTAL says otherwise */
export const AI_TOTAL_FACTOR = 10;

export interface SharedAi extends AiCreds {
  dailyLimit: number;
  source: "store" | "env";
}
/**
 * The shared key as the owner saved it (lib/server/config.ts), else the deployment's `ANTHROPIC_API_KEY` (with
 * `ANTHROPIC_MODEL`), or null when there is neither. Both count the same way.
 */
export async function sharedAi(): Promise<SharedAi | null> {
  const c = await getConfig();
  const n = Number(c.AI_DAILY_LIMIT);
  const dailyLimit = Number.isFinite(n) && n > 0 ? Math.floor(n) : AI_DAILY_DEFAULT;
  if (c.AI_KEY)
    return {
      provider: isProvider(c.AI_PROVIDER) ? c.AI_PROVIDER : "anthropic",
      key: c.AI_KEY,
      model: c.AI_MODEL || "",
      workspace: c.AI_WORKSPACE_ID || undefined,
      dailyLimit,
      source: "store",
    };
  const env = process.env.ANTHROPIC_API_KEY;
  if (env)
    return {
      provider: "anthropic",
      key: env,
      model: process.env.ANTHROPIC_MODEL || "",
      dailyLimit,
      source: "env",
    };
  return null;
}

/**
 * Daily counters for the shared key: per DJ (the signed `tdj_uid` cookie, lib/server/db.ts), per client address
 * (lib/server/guard.ts: a caller who drops the cookie gets a fresh id and a fresh per-DJ allowance, but not a
 * fresh address) and for the whole deployment. They live in the memory of one server process: on Lambda every
 * warm instance counts on its own and a cold start begins at zero, so the limits are a courtesy cap against
 * runaway use, not an exact quota. A table-backed counter would be the next step if the owner needs it exact.
 */
const usage = new Map<string, { day: string; n: number }>();
const today = () => new Date().toISOString().slice(0, 10);
function used(key: string): number {
  const u = usage.get(key);
  return u && u.day === today() ? u.n : 0;
}
function count(key: string) {
  const day = today();
  const u = usage.get(key);
  if (!u || u.day !== day) usage.set(key, { day, n: 1 });
  else u.n++;
  if (usage.size > 20_000) usage.clear();
}
export const sharedUsed = (uid: string) => used(`uid:${uid}`);
const totalLimit = (dailyLimit: number) => {
  const n = Number(process.env.AI_DAILY_TOTAL);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : dailyLimit * AI_TOTAL_FACTOR;
};

export type ResolvedAi =
  | { ok: true; ai: AiCreds; shared: boolean; setCookie?: string }
  | { ok: false; status: 401 | 429; error: string; setCookie?: string };

/**
 * The key a request runs on: the DJ's own (headers) when present, else the organiser's shared key, counted per
 * DJ, per client address and per deployment, per day. `count=false` only asks (Settings shows "N of 20 today").
 * The shared key never reaches a response. The same-origin check is the route's (lib/server/guard.ts).
 */
export async function resolveAi(req: Request, o: { count?: boolean } = {}): Promise<ResolvedAi> {
  const own = aiFromHeaders(req);
  if (own.key) return { ok: true, ai: own, shared: false };
  const shared = await sharedAi();
  if (!shared) return { ok: false, status: 401, error: "No API key. Add one in Settings → Written reviews." };
  const { id, setCookie } = await userFromRequest(req);
  const uidKey = `uid:${id}`;
  const addrKey = `addr:${clientKey(req)}`;
  const limit = shared.dailyLimit;
  const over =
    used(uidKey) >= limit || used(addrKey) >= limit * AI_ADDRESS_FACTOR || used("all") >= totalLimit(limit);
  if (over)
    return {
      ok: false,
      status: 429,
      error: `You have used today's ${limit} reviews on the organiser's key. Try again tomorrow, or add your own key in Settings → Written reviews.`,
      setCookie,
    };
  if (o.count !== false) {
    count(uidKey);
    count(addrKey);
    count("all");
  }
  const { dailyLimit: _limit, source: _source, ...ai } = shared;
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
  const { id, setCookie } = await userFromRequest(req);
  return {
    shared: true,
    limit: shared.dailyLimit,
    used: sharedUsed(id),
    provider: shared.provider,
    setCookie,
  };
}

/* ---------- providers ---------- */

/**
 * Defaults when the DJ leaves the model blank. Gemini: the current flagship on ai.google.dev/gemini-api/docs/models
 * (checked 2026-10-20; `gemini-3-pro` never existed and `gemini-3-pro-preview` is shut down).
 */
export const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5.2",
  gemini: "gemini-4-argon",
  openrouter: "openrouter/auto",
};
export const modelFor = (provider: AiProvider, model: string) => model || DEFAULT_MODEL[provider];
/** A model call that has not answered by then is given up (the function itself has 60 s). */
export const MODEL_TIMEOUT_MS = Number(process.env.TDJ_MODEL_TIMEOUT_MS) || 25_000;
const TIMEOUT_MESSAGE = "The model took too long; try again or ask a shorter question.";
/** reasoning models (OpenAI's o-series and gpt-5 family, Gemini's thinking models) spend tokens before any text */
const MIN_OUTPUT_TOKENS = 4000;

/** `AbortSignal.timeout` throws a TimeoutError; the Anthropic SDK an APIConnectionTimeoutError ("Request timed out.") */
const isTimeout = (e: unknown) => {
  const name = (e as { name?: string })?.name ?? "";
  const ctor = (e as { constructor?: { name?: string } })?.constructor?.name ?? "";
  const msg = e instanceof Error ? e.message : "";
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    ctor === "APIConnectionTimeoutError" ||
    /^request timed out/i.test(msg)
  );
};
const base = (env: string | undefined, fallback: string) => (env ?? fallback).replace(/\/$/, "");

/** One text completion across providers. Returns the assistant text (JSON text when `json` is set). */
export async function complete(a: CompleteArgs): Promise<string> {
  const model = modelFor(a.provider, a.model);
  const maxTokens = a.maxTokens ?? 1200;
  if (!a.key) throw new LlmError("No API key for this provider. Add one in Settings → Written reviews.", 401);
  try {
    if (a.provider === "anthropic") {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      // an organisation-level key is accepted only with the workspace it bills (400 "not scoped to a workspace")
      const client = new Anthropic({
        apiKey: a.key,
        timeout: MODEL_TIMEOUT_MS,
        maxRetries: 0,
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
      const url =
        a.provider === "openrouter"
          ? base(process.env.OPENROUTER_BASE_URL, "https://openrouter.ai/api/v1")
          : base(process.env.OPENAI_BASE_URL, "https://api.openai.com/v1");
      // OpenAI's reasoning models refuse `max_tokens`; `max_completion_tokens` is accepted by every chat model
      // and must leave room for the reasoning tokens that count against it. OpenRouter keeps `max_tokens`.
      const limit =
        a.provider === "openai"
          ? { max_completion_tokens: Math.max(maxTokens, MIN_OUTPUT_TOKENS) }
          : { max_tokens: maxTokens };
      const r = await fetch(`${url}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${a.key}`,
          ...(a.provider === "openrouter" ? { "x-title": "TDJ" } : {}),
        },
        body: JSON.stringify({
          model,
          ...limit,
          ...(a.json ? { response_format: { type: "json_object" } } : {}),
          messages: [
            { role: "system", content: a.system },
            { role: "user", content: a.user },
          ],
        }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      });
      const j = (await r.json().catch(() => ({}))) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };
      if (!r.ok) throw new LlmError(j.error?.message || `${a.provider} returned ${r.status}`, r.status);
      return j.choices?.[0]?.message?.content ?? "";
    }
    // gemini: the key travels in a header (query strings land in access logs); thinking models spend
    // output tokens before writing, so the cap is never below MIN_OUTPUT_TOKENS
    const gemini = base(process.env.GEMINI_BASE_URL, "https://generativelanguage.googleapis.com/v1beta");
    const r = await fetch(`${gemini}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": a.key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: a.system }] },
        contents: [{ role: "user", parts: [{ text: a.user }] }],
        generationConfig: {
          maxOutputTokens: Math.max(maxTokens, MIN_OUTPUT_TOKENS),
          ...(a.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    const j = (await r.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    if (!r.ok) throw new LlmError(j.error?.message || `Gemini returned ${r.status}`, r.status);
    return (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if (isTimeout(e)) throw new LlmError(TIMEOUT_MESSAGE, 504);
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
