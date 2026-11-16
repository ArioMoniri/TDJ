/**
 * 2026-11: "open this song's details" from anywhere (the mini player's cover, the sidebar's now-playing card). The
 * song details (the song sheet / song page) listen for `tdj:open-song` and call preventDefault when they open it.
 * Until one does, the song's row on the page comes into view and takes the focus (it opens its own details), so the
 * tap is never dead.
 */
export const OPEN_SONG_EVENT = "tdj:open-song";
export interface OpenSongDetail {
  /** the song's id (a cortina's: its id) */
  id: string;
  title: string;
}

export function openSong(d: OpenSongDetail): "handled" | "row" | "none" {
  if (typeof window === "undefined") return "none";
  const ev = new CustomEvent<OpenSongDetail>(OPEN_SONG_EVENT, { detail: d, cancelable: true });
  if (!window.dispatchEvent(ev)) return "handled";
  const id = d.id.replace(/^(song|cortina):/, "");
  const q = CSS.escape(id);
  const row = document.querySelector<HTMLElement>(`[data-song-id="${q}"], [data-song="${q}"]`);
  if (!row) return "none";
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusable = row.matches("[tabindex], button, a")
    ? row
    : row.querySelector<HTMLElement>("[tabindex], button");
  focusable?.focus({ preventScroll: true });
  return "row";
}
