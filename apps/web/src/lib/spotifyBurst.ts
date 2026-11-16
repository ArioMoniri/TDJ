/**
 * 2026-11: Spotify Connect takes play requests in bursts (a transfer, a play, the volume steps of a fade, a seek).
 * The exported playlists' sync (lib/playlistSync.ts) never writes to Spotify inside one: a play request marks the
 * next few seconds, and the sync waits them out.
 */
let until = 0;
export function markSpotifyBurst(ms = 4000) {
  until = Math.max(until, Date.now() + ms);
}
export const spotifyBurstActive = () => Date.now() < until;
