import { type ExportOpts, type FlatTrack, toSpotifyPlan } from "@tdj/core";
import type { MatchItem } from "./match";
import type { AppOverrides, Playlist } from "./types";

/** `toSpotifyPlan` with the DJ's own matches (overrides `songs[id].spotify`) applied before the cache is consulted. */
export function spotifyPlanFor(
  playlist: Playlist,
  overrides: AppOverrides | null | undefined,
  eo: ExportOpts = {},
): { uris: string[]; items: MatchItem[]; tracks: FlatTrack[] } {
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
