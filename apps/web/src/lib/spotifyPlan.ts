import {
  type ExportOpts,
  type FlatTrack,
  orderSpotifyUris,
  type SpotifySlot,
  toSpotifyPlan,
} from "@tdj/core";
import type { MatchItem } from "./match";
import type { AppOverrides, Playlist } from "./types";

/** `toSpotifyPlan` with the DJ's own matches (overrides `songs[id].spotify`) applied before the cache is consulted. */
export function spotifyPlanFor(
  playlist: Playlist,
  overrides: AppOverrides | null | undefined,
  eo: ExportOpts = {},
): { uris: string[]; items: MatchItem[]; tracks: FlatTrack[]; slots: SpotifySlot[] } {
  const own = overrides?.songs ?? {};
  const patched: Playlist = {
    ...playlist,
    tandas: playlist.tandas.map((t) => ({
      ...t,
      songs: t.songs.map((s) => (own[s.id]?.spotify ? { ...s, spotify: own[s.id]!.spotify } : s)),
    })),
    opening:
      playlist.opening && own[playlist.opening.id]?.spotify
        ? { ...playlist.opening, spotify: own[playlist.opening.id]!.spotify }
        : playlist.opening,
    closing:
      playlist.closing && own[playlist.closing.id]?.spotify
        ? { ...playlist.closing, spotify: own[playlist.closing.id]!.spotify }
        : playlist.closing,
  };
  const plan = toSpotifyPlan(patched, eo);
  return {
    uris: plan.uris,
    slots: plan.slots,
    items: plan.unresolved.map((u) => matchItemFor(u.track)),
    tracks: plan.unresolved.map((u) => u.track),
  };
}

/** What the matcher needs to know about one flattened row. */
export function matchItemFor(t: FlatTrack): MatchItem {
  return {
    id: t.id ?? `${t.kind}:${t.n}`,
    title: t.title,
    orchestra: t.orchestra ?? t.artist,
    singer: t.kind === "cortina" ? null : (t.singer ?? null),
    year: t.year ?? null,
    durationSec: t.kind === "cortina" ? null : t.durationSec,
    isrc: (t as { isrc?: string | null }).isrc ?? null,
  };
}

/** Batches of ≤10 items, the most the match route takes per request. */
export const MATCH_BATCH = 10;
export function batches<T>(xs: T[], n = MATCH_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

/** The playlist in running order: matched rows go back into their own slot (cortinas stay between the tandas). */
export function orderedUris(plan: { slots: SpotifySlot[] }, found: Map<string, string>): string[] {
  return orderSpotifyUris(plan, found);
}

/** A Spotify playlist id from a link, a `spotify:playlist:` URI or a bare id; null when it is none of those. */
export function playlistIdFrom(v: string): string | null {
  const t = v.trim();
  const m = t.match(/playlist[/:]([A-Za-z0-9]+)/) ?? t.match(/^([A-Za-z0-9]{22})$/);
  return m ? m[1]! : null;
}
