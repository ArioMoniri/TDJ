import type { ModelReply, ModelRequest } from "@/lib/ai/provider";
import type { AiCreds } from "./server/llm";

/**
 * What the on-device routes need from the native side of the app (src-tauri), as plain JSON calls. The engine
 * worker reaches them through the page (lib/app/adapter.ts → `nativeHost`); the tests fake them.
 */
export interface WireRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}
export interface WireResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface SpotifyAccess {
  access: string;
  expires: number;
  scopes?: string[];
}

export interface HostCalls {
  /** outbound HTTP through the app's native client (`net_fetch`: Deezer, MusicBrainz only) */
  fetch(r: WireRequest): Promise<WireResponse>;
  /**
   * one model call on the provider layer (lib/app/ai.ts, on the page): a key provider through `model_fetch`, which
   * adds the DJ's key from the Keychain; an ACP agent through its WebSocket or the app's process spawner. Throws
   * `{ message, status }`.
   */
  ask(ai: AiCreds, req: Omit<ModelRequest, "signal">): Promise<ModelReply>;
  /** the on-device database (tauri-plugin-sql) */
  sql(op: "execute" | "select", sql: string, params: unknown[]): Promise<unknown>;
  spotify: {
    /** a Client ID exists (the app's own, or the DJ's under Settings → Spotify → Advanced) */
    enabled(): Promise<boolean>;
    /** a valid access token from the Keychain-held session (refreshed natively), or null */
    access(): Promise<SpotifyAccess | null>;
    logout(): Promise<void>;
  };
  /** the DJ linked a TDJ server under Settings → Connections (off by default) */
  linked(): Promise<boolean>;
  /** a request to the linked server (its own session cookies stay in the native jar) */
  remote(r: WireRequest): Promise<WireResponse>;
}

/** An error thrown across the worker boundary keeps its HTTP status. */
export interface HostError {
  message: string;
  status?: number;
}
