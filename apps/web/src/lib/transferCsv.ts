import type { Playlist } from "@tdj/core";
import { t as tx } from "@/lib/i18n";

/**
 * "Spotify via a transfer service": the zero-setup route to Spotify for DJs the deployment's 5-seat Spotify app
 * cannot admit. The DJ downloads this CSV and drops it on TuneMyMusic or Soundiiz ("Import from file"), which
 * match every row in their own Spotify login; no Client ID, no seat, no owner involved.
 *
 * Column layout, checked 2026-10-19:
 * - Soundiiz, "Import CSV (EXCEL) to Soundiiz" (https://soundiiz.com/tutorial/import-excel-to-soundiiz): its
 *   sample file https://soundiiz.com/data/fileExamples/playlistExport.csv starts with the header
 *   `title,artist,album,isrc,platform,trackId,duration,addedDate,addedBy,url`; the first three columns are the
 *   ones a matcher needs and extra columns are optional, so this file carries exactly `title,artist,album`.
 * - TuneMyMusic, "Import playlist from CSV file to Spotify" (https://www.tunemymusic.com/transfer/csv-to-spotify):
 *   "reads your uploaded file, including track titles, artists, and albums" and matches on title, artist and
 *   album; the page names no header layout, so the same `title,artist,album` header (one row per track) is used.
 *   The older FAQ page "how-to-upload-a-file" answers 404 today.
 */
export const TRANSFER_HEADER = ["title", "artist", "album"] as const;

export interface TransferService {
  id: "tunemymusic" | "soundiiz";
  label: string;
  /** the "import from file" page, opened in a new tab next to the download */
  importUrl: string;
  steps: [string, string, string];
}
export const TRANSFER_SERVICES: TransferService[] = [
  {
    id: "tunemymusic",
    get label() {
      return tx("transferCsv.tunemymusic");
    },
    importUrl: "https://www.tunemymusic.com/transfer/csv-to-spotify",
    steps: [
      tx("transferCsv.download_the_csv_below_tunemymusic_opens"),
      tx("transferCsv.on_tunemymusic_choose_the_file_as"),
      tx("transferCsv.check_the_matches_and_start_the"),
    ],
  },
  {
    id: "soundiiz",
    get label() {
      return tx("transferCsv.soundiiz");
    },
    importUrl: "https://soundiiz.com/tutorial/import-excel-to-soundiiz",
    steps: [
      tx("transferCsv.download_the_csv_below_soundiiz_opens"),
      tx("transferCsv.in_soundiiz_choose_import_playlist_from"),
      tx("transferCsv.open_the_playlist_in_soundiiz_and"),
    ],
  },
];

const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

/** One row per track in set order (opening, tandas with their cortinas when asked, closing). */
export function transferRows(p: Playlist, includeCortinas: boolean): Array<[string, string, string]> {
  const rows: Array<[string, string, string]> = [];
  const song = (s: {
    title: string;
    orchestra: string;
    album?: string | null;
    spotify?: { album?: string } | null;
  }) => rows.push([s.title, s.orchestra, s.spotify?.album ?? s.album ?? ""]);
  if (p.opening) song(p.opening);
  for (const t of p.tandas) {
    for (const s of t.songs) song(s);
    if (includeCortinas && t.cortina) rows.push([t.cortina.title, t.cortina.artist, ""]);
  }
  if (p.closing) song(p.closing);
  return rows;
}

export function transferCsv(p: Playlist, includeCortinas: boolean): string {
  return [TRANSFER_HEADER.join(","), ...transferRows(p, includeCortinas).map((r) => r.map(q).join(","))].join(
    "\r\n",
  );
}
