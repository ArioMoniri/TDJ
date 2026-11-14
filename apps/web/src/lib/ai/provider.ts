import type { AiProvider } from "./models";

/**
 * Round 22 — one interface for every model TDJ can call: Anthropic, OpenAI, Gemini, OpenRouter (an API key, BYOK) and
 * ACP agents (Agent Client Protocol, local or remote). Plain module: no Next, no server-only import, so the server
 * routes, the browser and the standalone apps call providers the same way.
 */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the arguments (the subset every provider accepts: type, properties, required, enum, items) */
  parameters: Record<string, unknown>;
}
export interface ModelRequest {
  system: string;
  user: string;
  /** tools the model may call; an agent without tool support is asked for the same JSON in text */
  tools?: ToolSpec[];
  /** answer with one JSON object */
  json?: boolean;
  maxTokens?: number;
  signal?: AbortSignal;
}
export interface ToolCall {
  name: string;
  input: unknown;
}
export interface ModelReply {
  text: string;
  toolCalls: ToolCall[];
}
export interface ModelProvider {
  readonly id: AiProvider;
  /** the model that will answer ("" when an agent chooses) */
  readonly model: string;
  complete(req: ModelRequest): Promise<ModelReply>;
}

export class LlmError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/** what a server route hands back when the model runs on the DJ's device (an ACP agent the server cannot reach) */
export interface Relay {
  /** promptKey(system, user): the answer is used only for this exact prompt */
  for: string;
  system: string;
  user: string;
  json?: boolean;
  tools?: ToolSpec[];
  maxTokens?: number;
}
/** the device's answer to a relay, sent back with the same request */
export interface RelayAnswer {
  for: string;
  text: string;
  toolCalls?: ToolCall[];
}
export class RelayNeeded extends LlmError {
  relay: Relay;
  constructor(relay: Relay) {
    super("The model runs on this device.", 202);
    this.relay = relay;
  }
}

/** FNV-1a over the prompt: a short, stable key that ties a relayed answer to its prompt */
export function promptKey(system: string, user: string): string {
  let h = 0x811c9dc5;
  const s = `${system}\u0000${user}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}${s.length.toString(16)}`;
}

/** A mock provider for tests: answers from a function, records every request (no network). */
export function mockProvider(
  answer: (req: ModelRequest) => ModelReply | Promise<ModelReply>,
  id: AiProvider = "anthropic",
): ModelProvider & { calls: ModelRequest[] } {
  const calls: ModelRequest[] = [];
  return {
    id,
    model: "mock",
    calls,
    async complete(req) {
      calls.push(req);
      return answer(req);
    },
  };
}
