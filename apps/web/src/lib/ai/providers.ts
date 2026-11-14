import { type AcpConnection, acpComplete, transportFor } from "./acp";
import { type AiProvider, modelFor } from "./models";
import {
  LlmError,
  type ModelProvider,
  type ModelReply,
  type ToolCall,
  type ToolSpec,
} from "./provider";

/**
 * Round 22 — the providers behind one interface (provider.ts). Anthropic through its SDK, OpenAI / OpenRouter and
 * Gemini over their REST APIs, ACP agents over acp.ts. Keys are the DJ's own (BYOK) or the organiser's shared key on
 * the server; they are used for one request and never stored or logged here. Runs on the server and on the device.
 */
export interface ProviderCreds {
  provider: AiProvider;
  key?: string;
  model?: string;
  /** Anthropic only: an organisation-level key must name the workspace it bills */
  workspace?: string;
  /** provider "acp": the agent to ask */
  acp?: AcpConnection;
}
export interface ProviderEnv {
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** base URLs (tests, proxies); the server reads them from the environment */
  baseUrl?: Partial<Record<"anthropic" | "openai" | "openrouter" | "gemini", string>>;
}

export const MODEL_TIMEOUT_MS = 25_000;
const TIMEOUT_MESSAGE = "The model took too long; try again or ask a shorter question.";
/** reasoning models (OpenAI's o-series and gpt-5 family, Gemini's thinking models) spend tokens before any text */
const MIN_OUTPUT_TOKENS = 4000;
const env = (k: string) => (typeof process !== "undefined" ? process.env?.[k] : undefined);
const trimSlash = (s: string) => s.replace(/\/$/, "");

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

/** the SDK's APIError carries the provider's own message in `error.error.message`; show that, not the raw body */
function asLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  if (isTimeout(e)) return new LlmError(TIMEOUT_MESSAGE, 504);
  const body = (e as { error?: { error?: { message?: string; type?: string } } }).error?.error;
  const msg = body?.message
    ? `${body.type === "not_found_error" ? "Unknown model: " : ""}${body.message}`
    : e instanceof Error
      ? e.message
      : "The model request failed.";
  const status = (e as { status?: number }).status;
  return new LlmError(msg.slice(0, 300), typeof status === "number" && status >= 400 ? status : 502);
}

const jsonInstruction = "\nRespond with a single JSON object and nothing else.";
/** an agent or model without tool calls answers the tool's arguments as JSON text */
export function toolsAsText(tools: ToolSpec[]): string {
  return `\n\nAnswer by calling ${tools.map((t) => t.name).join(" or ")}: reply with ONLY a JSON object of its arguments, no prose, matching this schema:\n${tools
    .map((t) => `${t.name}: ${t.description}\n${JSON.stringify(t.parameters)}`)
    .join("\n")}`;
}

function anthropic(c: ProviderCreds, e: ProviderEnv): ModelProvider {
  const model = modelFor("anthropic", c.model);
  return {
    id: "anthropic",
    model,
    async complete(req) {
      if (!c.key) throw new LlmError("No API key for Anthropic. Add one in Settings → Models.", 401);
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({
          apiKey: c.key,
          timeout: e.timeoutMs ?? MODEL_TIMEOUT_MS,
          maxRetries: 0,
          ...(e.baseUrl?.anthropic ? { baseURL: e.baseUrl.anthropic } : {}),
          ...(e.fetch ? { fetch: e.fetch } : {}),
          // the standalone apps call Anthropic from the device with the DJ's own key
          ...(typeof window !== "undefined" ? { dangerouslyAllowBrowser: true } : {}),
          // an organisation-level key is accepted only with the workspace it bills
          ...(c.workspace ? { defaultHeaders: { "anthropic-workspace-id": c.workspace } } : {}),
        });
        // Claude 5-family models always think: thinking tokens count against max_tokens, so a small cap truncates
        // before any text appears. Low effort keeps the answer quick; the server-side fallback answers on another
        // model after a safety decline instead of returning nothing. Tools run with tool_choice auto (forced tool
        // choice is refused by the newest models); the prompt names the tool.
        const msg = await client.beta.messages.create(
          {
            model,
            max_tokens: Math.max(req.maxTokens ?? 1200, 16000),
            output_config: { effort: "low" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: req.system + (req.json && !req.tools?.length ? jsonInstruction : ""),
            messages: [{ role: "user", content: req.user }],
            ...(req.tools?.length
              ? {
                  tools: req.tools.map((t) => ({
                    name: t.name,
                    description: t.description,
                    input_schema: t.parameters as { type: "object" },
                  })),
                  tool_choice: { type: "auto" as const },
                }
              : {}),
          },
          req.signal ? { signal: req.signal } : undefined,
        );
        if (msg.stop_reason === "refusal")
          throw new LlmError(
            `The model declined this request${msg.stop_details?.explanation ? `: ${msg.stop_details.explanation}` : "."}`,
            422,
          );
        const text = msg.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { text: string }).text)
          .join("\n");
        const toolCalls: ToolCall[] = msg.content
          .filter((b) => b.type === "tool_use")
          .map((b) => ({ name: (b as { name: string }).name, input: (b as { input: unknown }).input }));
        if (!text && !toolCalls.length && msg.stop_reason === "max_tokens")
          throw new LlmError(
            "The model ran out of room before answering. Try again or pick a smaller model.",
            502,
          );
        return { text, toolCalls };
      } catch (err) {
        throw asLlmError(err);
      }
    },
  };
}

function openaiLike(c: ProviderCreds, e: ProviderEnv, which: "openai" | "openrouter"): ModelProvider {
  const model = modelFor(which, c.model);
  return {
    id: which,
    model,
    async complete(req) {
      if (!c.key) throw new LlmError(`No API key for ${which === "openai" ? "OpenAI" : "OpenRouter"}.`, 401);
      const url =
        which === "openrouter"
          ? trimSlash(e.baseUrl?.openrouter ?? env("OPENROUTER_BASE_URL") ?? "https://openrouter.ai/api/v1")
          : trimSlash(e.baseUrl?.openai ?? env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1");
      const max = req.maxTokens ?? 1200;
      // OpenAI's reasoning models refuse `max_tokens`; `max_completion_tokens` is accepted by every chat model and
      // must leave room for the reasoning tokens that count against it. OpenRouter keeps `max_tokens`.
      const limit =
        which === "openai"
          ? { max_completion_tokens: Math.max(max, MIN_OUTPUT_TOKENS) }
          : { max_tokens: Math.max(max, req.tools?.length ? 1500 : 0) };
      try {
        const r = await (e.fetch ?? fetch)(`${url}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${c.key}`,
            ...(which === "openrouter" ? { "x-title": "TDJ" } : {}),
          },
          body: JSON.stringify({
            model,
            ...limit,
            ...(req.json && !req.tools?.length ? { response_format: { type: "json_object" } } : {}),
            ...(req.tools?.length
              ? {
                  tools: req.tools.map((t) => ({
                    type: "function",
                    function: { name: t.name, description: t.description, parameters: t.parameters },
                  })),
                  tool_choice: "auto",
                }
              : {}),
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
          }),
          signal: req.signal ?? AbortSignal.timeout(e.timeoutMs ?? MODEL_TIMEOUT_MS),
        });
        const j = (await r.json().catch(() => ({}))) as {
          error?: { message?: string };
          choices?: Array<{
            message?: {
              content?: string | null;
              tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
            };
          }>;
        };
        if (!r.ok) throw new LlmError(j.error?.message || `${which} returned ${r.status}`, r.status);
        const m = j.choices?.[0]?.message;
        const toolCalls: ToolCall[] = (m?.tool_calls ?? []).map((t) => {
          let input: unknown = t.function?.arguments ?? "";
          try {
            input = JSON.parse(String(input));
          } catch {}
          return { name: t.function?.name ?? "", input };
        });
        return { text: m?.content ?? "", toolCalls };
      } catch (err) {
        throw asLlmError(err);
      }
    },
  };
}

function gemini(c: ProviderCreds, e: ProviderEnv): ModelProvider {
  const model = modelFor("gemini", c.model);
  return {
    id: "gemini",
    model,
    async complete(req) {
      if (!c.key) throw new LlmError("No API key for Gemini.", 401);
      const base = trimSlash(
        e.baseUrl?.gemini ?? env("GEMINI_BASE_URL") ?? "https://generativelanguage.googleapis.com/v1beta",
      );
      try {
        // the key travels in a header (query strings land in access logs)
        const r = await (e.fetch ?? fetch)(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": c.key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: "user", parts: [{ text: req.user }] }],
            ...(req.tools?.length
              ? {
                  tools: [
                    {
                      functionDeclarations: req.tools.map((t) => ({
                        name: t.name,
                        description: t.description,
                        parameters: t.parameters,
                      })),
                    },
                  ],
                }
              : {}),
            generationConfig: {
              maxOutputTokens: Math.max(req.maxTokens ?? 1200, MIN_OUTPUT_TOKENS),
              ...(req.json && !req.tools?.length ? { responseMimeType: "application/json" } : {}),
            },
          }),
          signal: req.signal ?? AbortSignal.timeout(e.timeoutMs ?? MODEL_TIMEOUT_MS),
        });
        const j = (await r.json().catch(() => ({}))) as {
          error?: { message?: string };
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: unknown } }> };
          }>;
        };
        if (!r.ok) throw new LlmError(j.error?.message || `Gemini returned ${r.status}`, r.status);
        const parts = j.candidates?.[0]?.content?.parts ?? [];
        return {
          text: parts.map((p) => p.text ?? "").join(""),
          toolCalls: parts
            .filter((p) => p.functionCall)
            .map((p) => ({ name: p.functionCall!.name ?? "", input: p.functionCall!.args ?? {} })),
        };
      } catch (err) {
        throw asLlmError(err);
      }
    },
  };
}

function acp(c: ProviderCreds, e: ProviderEnv): ModelProvider {
  return {
    id: "acp",
    model: "",
    async complete(req): Promise<ModelReply> {
      if (!c.acp) throw new LlmError("Choose an agent connection in Settings → Models.", 401);
      // agents take one text prompt; the tool's arguments come back as JSON text (parsed by the caller)
      const text = `${req.system}${req.tools?.length ? toolsAsText(req.tools) : req.json ? jsonInstruction : ""}\n\n---\n\n${req.user}`;
      try {
        const r = await acpComplete(transportFor(c.acp), text, { timeoutMs: e.timeoutMs ?? 90_000 });
        return { text: r.text, toolCalls: [] };
      } catch (err) {
        throw asLlmError(err);
      }
    },
  };
}

/** the provider for a set of credentials: every generation in TDJ goes through here */
export function providerFor(c: ProviderCreds, e: ProviderEnv = {}): ModelProvider {
  switch (c.provider) {
    case "anthropic":
      return anthropic(c, e);
    case "openai":
    case "openrouter":
      return openaiLike(c, e, c.provider);
    case "gemini":
      return gemini(c, e);
    case "acp":
      return acp(c, e);
    default:
      throw new LlmError("Unknown model provider.", 400);
  }
}
