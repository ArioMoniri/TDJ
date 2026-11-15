/**
 * Round 22 — the model configuration, in one place (no model id is written in the UI). The default for each provider
 * is used when the DJ leaves the model blank; Anthropic's is the newest Claude model. `MODEL_SUGGESTIONS` fills the
 * model field's list in Settings → Models. An ACP agent chooses its own model.
 *
 * Gemini: the current flagship on ai.google.dev/gemini-api/docs/models (checked 2026-10-20).
 */
export type KeyProvider = "anthropic" | "openai" | "gemini" | "openrouter";
/** every way TDJ reaches a model: an API key (BYOK) or an ACP agent connection */
export type AiProvider = KeyProvider | "acp";

export const KEY_PROVIDERS: Array<[KeyProvider, string]> = [
  ["anthropic", "Anthropic"],
  ["openai", "OpenAI"],
  ["gemini", "Gemini"],
  ["openrouter", "OpenRouter"],
];
export const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
  openrouter: "OpenRouter",
  acp: "AI agent app",
};

/** the newest Claude model: the default whenever Anthropic runs with a blank model */
export const NEWEST_CLAUDE = "claude-opus-5-5";

export const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: NEWEST_CLAUDE,
  openai: "gpt-5.2",
  gemini: "gemini-4-argon",
  openrouter: "openrouter/auto",
  acp: "",
};
export const MODEL_SUGGESTIONS: Record<KeyProvider, string[]> = {
  anthropic: [NEWEST_CLAUDE, "claude-sonnet-5-5", "claude-haiku-5-5"],
  openai: ["gpt-5.2", "gpt-5.2-mini", "o4-mini"],
  gemini: ["gemini-4-argon", "gemini-3.8-flash", "gemini-3.5-flash-lite"],
  openrouter: ["openrouter/auto", `anthropic/${NEWEST_CLAUDE}`, "openai/gpt-5.2"],
};
export const KEY_PLACEHOLDER: Record<KeyProvider, string> = {
  anthropic: "sk-ant-…",
  openai: "sk-…",
  gemini: "AIza…",
  openrouter: "sk-or-…",
};
/** defaults that earlier versions stored as the DJ's own choice; a stored one of these means "the default" */
export const RETIRED_DEFAULTS = ["claude-sonnet-5-5"];

export const modelFor = (provider: AiProvider, model?: string | null) =>
  (model ?? "").trim() || DEFAULT_MODEL[provider];
export const isKeyProvider = (x: unknown): x is KeyProvider =>
  typeof x === "string" && KEY_PROVIDERS.some(([k]) => k === x);
export const isAiProvider = (x: unknown): x is AiProvider => x === "acp" || isKeyProvider(x);
