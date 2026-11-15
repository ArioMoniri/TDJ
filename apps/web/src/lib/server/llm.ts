import "server-only";
import { DEFAULT_MODEL, isAiProvider, isKeyProvider, type KeyProvider, modelFor } from "@/lib/ai/models";
import {
  LlmError,
  type ModelReply,
  type ModelRequest,
  promptKey,
  type RelayAnswer,
  RelayNeeded,
} from "@/lib/ai/provider";
import { providerFor } from "@/lib/ai/providers";
import type { AiProvider } from "@/lib/types";
import { getConfig } from "./config";
import { userFromRequest } from "./db";
import { clientKey } from "./guard";

export { LlmError, RelayNeeded };

export interface CompleteArgs {
  provider: AiProvider;
  key: string;
  model: string;
  /** Anthropic only: an organisation-level key must name the workspace it bills (`anthropic-workspace-id`) */
  workspace?: string;
  /** provider "acp": the device's answer for this prompt (lib/ai/client.ts → aiFetch) */
  answer?: RelayAnswer;
  system: string;
  user: string;
  json?: boolean;
  maxTokens?: number;
}

/** a provider the organiser's shared key may use (an API key provider; an ACP agent is the DJ's own) */
export function isProvider(x: unknown): x is KeyProvider {
  return isKeyProvider(x);
}

export interface AiCreds {
  provider: AiProvider;
  key: string;
  model: string;
  workspace?: string;
  answer?: RelayAnswer;
}

const answerOf = (body: unknown): RelayAnswer | undefined => {
  const a = (body as { aiAnswer?: Partial<RelayAnswer> } | null)?.aiAnswer;
  if (!a || typeof a.for !== "string" || typeof a.text !== "string") return undefined;
  return {
    for: a.for,
    text: a.text.slice(0, 40_000),
    toolCalls: Array.isArray(a.toolCalls) ? a.toolCalls.slice(0, 8) : [],
  };
};

/**
 * Read the BYOK headers; the key is used for this request only and never logged or stored. There is no
 * environment fallback here: a deployment key (`ANTHROPIC_API_KEY`) is a shared key and is counted as one
 * (`sharedAi`), never an uncounted path. With an ACP agent there is no key: the body may carry the device's answer.
 */
export function aiFromHeaders(req: Request, body?: unknown): AiCreds {
  const provider = req.headers.get("x-ai-provider");
  const p: AiProvider = isAiProvider(provider) ? provider : "anthropic";
  if (p === "acp") return { provider: "acp", key: "", model: "", answer: answerOf(body) };
  return {
    provider: p,
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
export async function resolveAi(
  req: Request,
  o: { count?: boolean; body?: unknown } = {},
): Promise<ResolvedAi> {
  const own = aiFromHeaders(req, o.body);
  // an ACP agent is the DJ's own model: never the shared key, never counted
  if (own.provider === "acp") return { ok: true, ai: own, shared: false };
  if (own.key) return { ok: true, ai: own, shared: false };
  const shared = await sharedAi();
  if (!shared) return { ok: false, status: 401, error: "No API key. Add one in Settings → Models." };
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
      error: `You have used today's ${limit} reviews on the organiser's key. Try again tomorrow, or add your own key in Settings → Models.`,
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
 * Defaults when the DJ leaves the model blank: lib/ai/models.ts (Anthropic's is the newest Claude model). Every call
 * goes through the provider interface (lib/ai/providers.ts), the same one the browser and the apps use.
 */
export { DEFAULT_MODEL, modelFor };
/** A model call that has not answered by then is given up (the function itself has 60 s). */
export const MODEL_TIMEOUT_MS = Number(process.env.TDJ_MODEL_TIMEOUT_MS) || 25_000;

/**
 * One model call for a route: the reply's text and tool calls. An ACP agent runs on the DJ's device (the server
 * cannot reach a local agent): without the device's answer for this exact prompt, a RelayNeeded is thrown and the
 * route answers 202 with the prompt (`relayResponse`); the browser asks the agent and repeats the request with
 * `aiAnswer` (lib/ai/client.ts).
 */
export async function ask(a: AiCreds, req: ModelRequest): Promise<ModelReply> {
  if (a.provider === "acp") {
    const k = promptKey(req.system, req.user);
    if (a.answer && a.answer.for === k) return { text: a.answer.text, toolCalls: a.answer.toolCalls ?? [] };
    throw new RelayNeeded({
      for: k,
      system: req.system,
      user: req.user,
      json: req.json,
      tools: req.tools,
      maxTokens: req.maxTokens,
    });
  }
  if (!a.key) throw new LlmError("No API key for this provider. Add one in Settings → Models.", 401);
  return providerFor(
    { provider: a.provider, key: a.key, model: a.model, workspace: a.workspace },
    { timeoutMs: MODEL_TIMEOUT_MS },
  ).complete(req);
}

/** One text completion across providers. Returns the assistant text (JSON text when `json` is set). */
export async function complete(a: CompleteArgs): Promise<string> {
  const r = await ask(a, { system: a.system, user: a.user, json: a.json, maxTokens: a.maxTokens });
  return r.text;
}

/** the 202 a route answers when the DJ's agent must answer on the device */
export function relayResponse(e: RelayNeeded): Response {
  return new Response(JSON.stringify({ relay: e.relay }), {
    status: 202,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
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
