import "server-only";
import {
  clearSessionCookie as clearFor,
  enabled,
  type Session,
  SPOTIFY,
  withSession as withSessionFor,
} from "./oauth";

/**
 * Hosted "Log in with Spotify": the app's own Client ID/Secret from the server environment, authorization-code
 * flow, tokens sealed in an httpOnly cookie, refreshed transparently (the generic machinery is lib/server/oauth.ts).
 * Spotify Development Mode serves 5 users per Client ID (docs/DEPLOY.md → Connectors). The Web API calls themselves
 * are lib/spotifyWeb.ts, shared with the apps.
 */
export const SCOPES = SPOTIFY.scopes;
export const SESSION_COOKIE = SPOTIFY.cookie;
export type { Session };

export const hostedEnabled = async () => enabled(SPOTIFY);
export const withSession = (req: Request, origin: string) => withSessionFor(SPOTIFY, req, origin);
export const clearSessionCookie = () => clearFor(SPOTIFY);
export { ApiError as SpotifyError, isRateLimited } from "@/lib/providerApi";
export {
  createPlaylist,
  findPlayable,
  MATCH_BUDGET_MS,
  type MatchResult,
  marketOf,
  matchItems,
  matchOne,
  type Profile,
  profile,
  updatePlaylistDetails,
  writePlaylist,
} from "@/lib/spotifyWeb";
