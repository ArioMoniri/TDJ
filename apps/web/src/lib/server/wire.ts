import type { Playlist, Song } from "@tdj/core";

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
