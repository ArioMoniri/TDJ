import {
  type Cortina,
  cortinaMatchProblem,
  cortinaStandIn,
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
      // (round 16, M7: a cortina's carried match passes the cortina rules, or the cue is searched again)
      cortina:
        t.cortina?.spotify && !storedCortinaOk(t.cortina, t.cortina.spotify)
          ? { ...t.cortina, spotify: undefined }
          : t.cortina,
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
      ? { cortina: true }
      : {
          vocal: t.vocal ?? !!t.singer,
          date: t.date ?? null,
          durationEstimated: t.durationEstimated,
          altTitles: t.altTitles,
          // round 16: what the stricter rules read (the rhythm, the later and sung takes the index knows)
          rhythm: t.rhythm,
          laterTakes: t.laterTakes,
          vocalTwins: t.vocalTwins,
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
    | "rhythm"
    | "laterTakes"
    | "vocalTwins"
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

/** Round 16 (M7): a cortina's stored match names the cue's title and artist and is no duet, live or remix record. */
export function storedCortinaOk(
  c: { title: string; artist: string; year?: number | null },
  m: { uri?: string; album?: string; durationMs?: number; matched?: string } | null | undefined,
): boolean {
  if (!m?.uri) return false;
  // (an older carried id without its credit is kept: the cache audit judged it)
  if (!m.matched) return true;
  const [artist, ...rest] = m.matched.split(" – ");
  return !cortinaMatchProblem(c, {
    name: rest.join(" – ") || c.title,
    artists: (artist ?? "").split(/,\s*/).filter(Boolean),
    album: m.album,
    durationMs: m.durationMs,
  });
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

/** a cue as the stand-in reads it (a night's own cortina, or a row of /api/meta's `cortinaList`) */
export type StandInCue = Pick<
  Cortina,
  "id" | "title" | "artist" | "genre" | "culture" | "energy" | "tags"
> & {
  spotify?: { uri?: string } | null;
};
/**
 * Round 19: every cortina Spotify could not match (`missing`, row ids) gets a stand-in — the nearest Spotify-ready cue of
 * the same family (see `cortinaStandIn`), never one of the cues either side of it — written into `found` under the
 * missing cue's id, so `orderedUris` puts it in the cortina's own row and the playlist has no gap between two tandas.
 * Returns what stood in for what (the Export sheet's result line says so) and the ids still missing.
 */
export function standInCortinas(
  playlist: Pick<Playlist, "tandas">,
  missing: string[],
  found: Map<string, string>,
  pool: StandInCue[] = [],
): { standIns: Array<{ id: string; cue: string; standIn: string; uri: string }>; missing: string[] } {
  const cues = playlist.tandas.map((t) => t.cortina ?? null);
  const all = new Map<string, StandInCue>();
  for (const c of pool) all.set(c.id, c);
  // (the night's own cues carry their checked ids even when the pool is not at hand)
  for (const c of cues) if (c?.spotify?.uri && !all.has(c.id)) all.set(c.id, c);
  const standIns: Array<{ id: string; cue: string; standIn: string; uri: string }> = [];
  const still: string[] = [];
  for (const id of missing) {
    const k = cues.findIndex((c) => c?.id === id);
    const cue = k >= 0 ? cues[k] : null;
    if (!cue) {
      still.push(id);
      continue;
    }
    const avoid = new Set(
      [cues[k - 1], cues[k + 1], cue].filter((c): c is NonNullable<typeof c> => !!c).map((c) => c.id),
    );
    const sub = cortinaStandIn(cue, [...all.values()], avoid);
    if (!sub?.spotify?.uri) {
      still.push(id);
      continue;
    }
    found.set(id, sub.spotify.uri);
    standIns.push({
      id,
      cue: `${cue.title} (${cue.artist})`,
      standIn: `${sub.title} (${sub.artist})`,
      uri: sub.spotify.uri,
    });
  }
  return { standIns, missing: still };
}
