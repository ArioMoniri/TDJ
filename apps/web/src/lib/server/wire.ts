import type { Playlist, Song, SwapOption } from "@tdj/core";

/**
 * A playlist as the browser needs it. The chroma vector (12 floats per analysed recording) feeds the engine's key
 * detection only; no view reads it, and History drops it on save (`compactPlaylist`). Everything else travels:
 * the export, swap and webhook paths send the playlist back as is.
 */
export function forWire(p: Playlist): Playlist {
  const strip = <S extends Song | null | undefined>(s: S): S =>
    s?.audio?.chroma?.length ? ({ ...s, audio: { ...s.audio, chroma: [] } } as S) : s;
  return {
    ...p,
    tandas: p.tandas.map((t) => ({ ...t, songs: t.songs.map((s) => strip(s)) })),
    opening: strip(p.opening),
    closing: strip(p.closing),
  };
}

/** the side as the Swap sheet shows it (no audio vectors, no previews) */
export const swapWire = (x: SwapOption) => ({
  ok: x.ok,
  reason: x.reason,
  fit: x.fit,
  // 2026-11: a dancer favourite in this tanda's role (♥)
  ...(x.favourite ? { favourite: true } : {}),
  song: {
    id: x.song.id,
    title: x.song.title,
    orchestra: x.song.orchestra,
    // round 22: what the polished sheet shows per side (artwork, era badge, key, preview)
    orchestraId: x.song.orchestraId,
    vocal: x.song.vocal,
    yearApprox: x.song.yearApprox,
    resolved: x.song.resolved
      ? {
          provider: x.song.resolved.provider,
          id: x.song.resolved.id,
          title: x.song.resolved.title,
          artist: x.song.resolved.artist,
          previewUrl: x.song.resolved.previewUrl,
          artwork: x.song.resolved.artwork,
        }
      : null,
    audio: x.song.audio
      ? {
          key: x.song.audio.key,
          mode: x.song.audio.mode,
          camelot: x.song.audio.camelot,
          bpm: x.song.audio.bpm,
        }
      : null,
    singer: x.song.singer,
    year: x.song.year,
    rhythm: x.song.rhythm,
    energy: x.song.energy,
    fame: x.song.fame,
    vocalStyle: x.song.vocalStyle,
    tempo: x.song.tempo,
    level: x.song.level,
    durationSec: x.song.durationSec,
    spotify: x.song.spotify
      ? { uri: x.song.spotify.uri, url: x.song.spotify.url, album: x.song.spotify.album }
      : null,
  },
});
