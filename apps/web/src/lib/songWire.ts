import type { Song } from "@tdj/core";

/**
 * A side as the search panel and the Database lists need it: no chroma vectors, no discography notes. A standalone
 * app reads the same shape from its local catalogue.
 */
export function songWire(s: Song): Song {
  const { laterTakes: _l, vocalTwins: _v, altTitles: _t, ...rest } = s;
  return {
    ...rest,
    ...(s.audio ? { audio: { ...s.audio, chroma: [] } } : {}),
  } as Song;
}
