import {
  type Cortina,
  cortinaMatchProblem,
  deezerCandidate,
  matchProblem,
  type Playlist,
  type ResolvedTrack,
  type Song,
} from "@tdj/core";

/**
 * Round 18 (docs/specs/round18-booth.md): the booth plays, times and rehearses the side's checked Spotify recording.
 *
 * - Length: a side with a checked Spotify match is planned at that recording's length (what the DJ plays from
 *   Spotify), not the catalogue's side length (which keeps Deezer's length when the two transfers disagree).
 * - Rehearsal clip: a Spotify 30 s preview of the checked recording first; else the Deezer clip only when it is the
 *   same recording — its length within `SAME_RECORDING_TOL_SEC` of the Spotify one and accepted by the shared
 *   match rules (`matchProblem` / `cortinaMatchProblem`) with the Spotify length as the reference; else no clip, with
 *   the reason, rather than a rehearsal of another transfer or take.
 */

/**
 * The match rules' own positive-evidence band for "this is the side" (`matchProblem`, `lengthOk`: −6…+6 s). On the
 * featured night the Deezer/Spotify pairs inside it differ by 0–5.9 s (transfer speed and trimmed silence); the
 * pairs outside differ by 6.9–15 s (Recuerdo Malevo 168/153, Pensalo Bien 150/137, La Vida Es Corta 157/144).
 */
export const SAME_RECORDING_TOL_SEC = 6;
/** Spotify's own 30 s preview CDN (what the Web API and the Spotify connector hand out as `preview_url`) */
export const SPOTIFY_PREVIEW = /^https:\/\/p\.scdn\.co\/mp3-preview\/[0-9a-f]{20,}(\.mp3)?(\?\S*)?$/;

export type SpotifyRef = NonNullable<Song["spotify"]> & { previewUrl?: string | null };
type Entity = Song | Cortina | null | undefined;

const isSong = (e: NonNullable<Entity>): e is Song => "rhythm" in e;

/** The checked Spotify recording of a side or cortina (a `spotify:track:` URI), else null. */
export function spotifyOf(e: Entity): SpotifyRef | null {
  const sp = e?.spotify as SpotifyRef | null | undefined;
  return sp?.uri && /^spotify:track:[A-Za-z0-9]+$/.test(sp.uri) ? sp : null;
}

/** The length the booth plans for a side: its Spotify recording's, in seconds (null without a checked match). */
export function spotifyLengthSec(e: Entity): number | null {
  const ms = spotifyOf(e)?.durationMs;
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? Math.round(ms) / 1000 : null;
}

/** A planning copy of the set: every song with a checked Spotify match takes that recording's length. */
export function withSpotifyLengths(p: Playlist): Playlist {
  const fix = (s: Song): Song => {
    const sec = spotifyLengthSec(s);
    return sec === null || s.durationSec === sec ? s : { ...s, durationSec: sec };
  };
  return {
    ...p,
    opening: p.opening ? fix(p.opening) : p.opening,
    closing: p.closing ? fix(p.closing) : p.closing,
    tandas: p.tandas.map((t) => ({ ...t, songs: t.songs.map(fix) })),
  };
}

export type Clip = { from: "spotify"; url: string } | { from: "deezer"; resolved: ResolvedTrack };
export type ClipVerdict = { clip: Clip; why?: undefined } | { clip: null; why: string };

const secs = (ms: number) => Math.round(ms / 1000);

/**
 * The 30 s clip that rehearses this side, or why there is none. `resolved` overrides the entity's own Deezer match
 * (the DJ's pick in "Find on services").
 */
export function rehearsalClip(e: Entity, resolved?: ResolvedTrack | null): ClipVerdict {
  if (!e) return { clip: null, why: "nothing to play" };
  const sp = spotifyOf(e);
  if (sp?.previewUrl && SPOTIFY_PREVIEW.test(sp.previewUrl))
    return { clip: { from: "spotify", url: sp.previewUrl } };
  const r = resolved === undefined ? (e.resolved ?? null) : resolved;
  if (!r?.previewUrl && !r?.id)
    return { clip: null, why: sp ? "no clip of the Spotify recording" : "no clip and no Spotify match" };
  // no Spotify match: the Deezer record is the item's only recording
  if (!sp) return { clip: { from: "deezer", resolved: r } };
  const spMs = sp.durationMs;
  if (!spMs || !r.durationMs)
    return { clip: null, why: "no length to prove the clip is the Spotify recording" };
  if (Math.abs(r.durationMs - spMs) / 1000 > SAME_RECORDING_TOL_SEC)
    return {
      clip: null,
      why: `the clip is another transfer or take (${secs(r.durationMs)} s, Spotify ${secs(spMs)} s)`,
    };
  const cand = deezerCandidate(r, e.title);
  const why = isSong(e) ? matchProblem(e, cand, spMs / 1000) : cortinaMatchProblem(e, cand);
  if (why) return { clip: null, why: `the clip is not the Spotify recording: ${why}` };
  return { clip: { from: "deezer", resolved: r } };
}

/** How the night rehearses: clips of the Spotify recording by origin, and the items without one with the reason. */
export function clipSummary(entities: ReadonlyArray<Entity>): {
  spotify: number;
  deezer: number;
  none: Array<{ i: number; title: string; why: string }>;
} {
  const out = { spotify: 0, deezer: 0, none: [] as Array<{ i: number; title: string; why: string }> };
  entities.forEach((e, i) => {
    if (!e) return;
    const v = rehearsalClip(e);
    if (v.clip) out[v.clip.from]++;
    else out.none.push({ i, title: e.title, why: v.why });
  });
  return out;
}
