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

/** why nothing plays, as a key of the play.* strings */
export type NoAudioWhy = "no_audio_premium" | "no_audio_connect" | "no_audio";
export function noAudioWhy(i: {
  connected: boolean;
  premium: boolean | null;
  spotifyUri?: string | null;
}): NoAudioWhy {
  // a Spotify track exists but the account cannot stream it here
  if (i.spotifyUri && i.connected && i.premium === false) return "no_audio_premium";
  if (i.spotifyUri && !i.connected) return "no_audio_connect";
  return "no_audio";
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
