/**
 * 2026-11 (the owner: "all songs anywhere should be playable on click of them in Compose and Play pages") — which
 * audio a tap on a song or cortina row plays, and where. Pure, so the vitest pins the order:
 *
 *   1. Spotify Premium connected and the side has a checked Spotify track → the full track (Web Playback SDK on a
 *      desktop, Spotify Connect on iOS / iPadOS, through the Booth's Spotify adapter);
 *   2. otherwise the 30 s preview (Deezer `resolved.previewUrl`, through /api/preview);
 *   3. then the DJ's own file, when the linked music folder matched one;
 *   4. nothing → the row says "No audio" and the tap says why (a toast), never silence.
 *
 * While the Booth runs a night a tap never sounds in the room: it goes to the headphones output, or says why it
 * cannot (no headphones picked).
 */

export type SourcePick =
  | { kind: "spotify-full"; uri: string }
  | { kind: "preview"; ref: string }
  | { kind: "file" }
  | null;

export interface SourceInputs {
  /** a Spotify Premium session with the streaming scopes (null: not known yet, treated as not Premium) */
  premium: boolean | null;
  spotifyUri?: string | null;
  /** our preview endpoint for the resolved track, or null */
  previewRef?: string | null;
  /** the linked folder matched a file for this side */
  file?: boolean;
}

export const isSpotifyTrackUri = (uri: unknown): uri is string =>
  typeof uri === "string" && /^spotify:track:[A-Za-z0-9]{10,}$/.test(uri);

/** the source order (see the module comment) */
export function pickSource(i: SourceInputs): SourcePick {
  if (i.premium === true && isSpotifyTrackUri(i.spotifyUri))
    return { kind: "spotify-full", uri: i.spotifyUri };
  if (i.previewRef) return { kind: "preview", ref: i.previewRef };
  if (i.file) return { kind: "file" };
  return null;
}

/**
 * What this device's Spotify can do for a tap (2026-11, the owner: "it says no Spotify Premium — I have Premium"):
 * - `signed-out`: no Spotify session on this device (the hosted login, or the app's own) — the DJ may well have
 *   Premium, it is just not connected here;
 * - `reconnect`: a session without the playback scopes (an older consent);
 * - `free`: Spotify says the account is not Premium (`product` from /v1/me);
 * - `premium`: Premium, or a session whose profile leaves `product` out (no `user-read-private`, some app modes):
 *   tried, like the Booth (round 21) — the player itself reports a non-Premium account;
 * - `unknown`: not asked yet.
 */
export type SpotifyPlay = "unknown" | "signed-out" | "reconnect" | "free" | "premium";
export const STREAMING_SCOPES = ["streaming", "user-modify-playback-state", "user-read-playback-state"];
/** the state from /api/spotify/me's answer (`user` with `product`, the granted `scopes`) */
export function spotifyPlayOf(
  me: { user?: { product?: string | null } | null; scopes?: string[] | null } | null,
): SpotifyPlay {
  if (!me?.user) return "signed-out";
  const scopes = Array.isArray(me.scopes) ? me.scopes : null;
  if (scopes && !STREAMING_SCOPES.every((x) => scopes.includes(x))) return "reconnect";
  const product = typeof me.user.product === "string" ? me.user.product : null;
  if (product !== null && product !== "premium") return "free";
  return "premium";
}

/** why nothing plays, as a key of the play.* strings */
export type NoAudioWhy =
  | "no_audio_premium"
  | "no_audio_connect"
  | "no_audio_reconnect"
  | "no_audio_unmatched"
  | "no_audio";
export function noAudioWhy(i: {
  connected: boolean;
  premium: boolean | null;
  spotify?: SpotifyPlay;
  spotifyUri?: string | null;
}): NoAudioWhy {
  const sp: SpotifyPlay =
    i.spotify ??
    (i.premium === true ? "premium" : i.premium === false ? "free" : i.connected ? "unknown" : "signed-out");
  // no Spotify recording and no preview: the side is not matched yet — whatever the account (never "no Premium")
  if (!isSpotifyTrackUri(i.spotifyUri)) return "no_audio_unmatched";
  if (sp === "signed-out" || sp === "unknown") return "no_audio_connect";
  if (sp === "reconnect") return "no_audio_reconnect";
  if (sp === "free") return "no_audio_premium";
  return "no_audio";
}
/** the action a "no audio" toast offers: connect Spotify here, reconnect it, or find the side on a service */
export function noAudioAction(why: NoAudioWhy): "connect" | "reconnect" | "find" {
  return why === "no_audio_connect" ? "connect" : why === "no_audio_reconnect" ? "reconnect" : "find";
}

/** where a tap sounds: the app's player, or (a night is running in the Booth) the headphones only */
export type PlayRoute = "player" | "headphones";
export function routeFor(booth: { started?: boolean } | null | undefined): PlayRoute {
  return booth?.started ? "headphones" : "player";
}

/**
 * The start a clip can honour: a full track (Spotify, a file) or a clip long enough plays from `startSec`; a 30 s
 * preview shorter than the start plays from its own beginning (it is an excerpt, not the song).
 */
export function playableStart(startSec: number, durationSec: number | null | undefined): number {
  if (!(startSec > 0)) return 0;
  if (!durationSec || !Number.isFinite(durationSec)) return startSec;
  return startSec + 5 <= durationSec ? startSec : 0;
}

/** one step in the list the tap came from; null past either end */
export function stepIndex(length: number, index: number, delta: number): number | null {
  const n = index + delta;
  return n >= 0 && n < length ? n : null;
}
