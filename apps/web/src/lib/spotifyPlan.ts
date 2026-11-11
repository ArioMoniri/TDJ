import {
  type ExportOpts,
  type FlatTrack,
  matchProblem,
  orderSpotifyUris,
  type Song,
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
      // (round 15: a remembered or carried match the rules reject is dropped: the side is searched again)
      songs: t.songs.map((s) => {
        const mine = own[s.id]?.spotify;
        if (mine && storedMatchOk(s, mine)) return { ...s, spotify: mine };
        if (s.spotify && !storedMatchOk(s, s.spotify)) return { ...s, spotify: null };
        return mine ? s : s;
      }),
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
    // round 15: a tango side carries what the match rules read (a cortina does not)
    ...(t.kind === "cortina"
      ? {}
      : {
          vocal: t.vocal ?? !!t.singer,
          date: t.date ?? null,
          durationEstimated: t.durationEstimated,
          altTitles: t.altTitles,
        }),
  };
}

/**
 * Round 15: a stored match (the DJ's database, a night's JSON, the browser cache) is used only when the match rules
 * accept it for the side; otherwise it is dropped and the side is searched again.
 */
export function storedMatchOk(
  s: Pick<
    Song,
    | "title"
    | "orchestra"
    | "singer"
    | "vocal"
    | "year"
    | "date"
    | "durationSec"
    | "durationEstimated"
    | "altTitles"
  >,
  m:
    | { uri?: string; name?: string; artist?: string; album?: string; durationMs?: number; matched?: string }
    | null
    | undefined,
): boolean {
  if (!m?.uri) return false;
  const [artist, ...rest] = (m.matched ?? "").split(" – ");
  const name = m.name ?? (rest.join(" – ") || s.title);
  const artists = (m.artist ?? artist ?? "").split(/,\s*/).filter(Boolean);
  return !matchProblem(
    { ...s, vocal: !!s.vocal },
    { name, artists: artists.length ? artists : [s.orchestra], album: m.album, durationMs: m.durationMs },
  );
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
