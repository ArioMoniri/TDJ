import type { CatalogDeps } from "./catalog";

/**
 * What a shared route handler (lib/api/*) needs from the runtime it answers in. Two implementations:
 * - the server (lib/server/deps.ts): the index from `data/`, the same-origin guard, Node's fetch, the sealed Spotify
 *   session cookie;
 * - the apps (lib/app/deps.ts, inside a Web Worker): the index bundled in the app, the app's native HTTP client, the
 *   Spotify tokens in the Keychain.
 * The AI routes are not here: they run on the provider layer (lib/ai/*), on the server through lib/server/llm.ts and
 * in the apps through lib/app/ai.ts.
 */
export interface ApiDeps extends CatalogDeps {
  /** where the DJ's database lives, as /api/meta reports it */
  storage(): "server" | "browser" | "device";
  /** the same-origin check of state-changing routes: the 403 to send, or null */
  guard(req: Request): Promise<Response | null>;
  /** outbound HTTP to Deezer and MusicBrainz (the server's fetch; the app's native client, no CORS) */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  spotify: SpotifyDeps;
}

export interface SpotifySession {
  access: string;
  expires: number;
  authorizedAt?: number;
  scopes?: string[];
  /** server only: the re-sealed cookie after a refresh */
  setCookie?: string;
}
export interface SpotifyDeps {
  /** "Log in with Spotify" exists here */
  enabled(): Promise<boolean>;
  /** the DJ's Spotify session (refreshed when needed), or null when not logged in */
  session(req: Request): Promise<SpotifySession | null>;
}
