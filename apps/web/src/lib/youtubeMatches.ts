/**
 * Which YouTube video plays each side in the Booth: the videos the YouTube export found and the read-back confirmed
 * (lib/youtubeVerify.ts replaces the ones that do not play in the DJ's country). Kept on this device only (like the
 * DJ's keys); a side without a match is played by another source, or not at all.
 */
export type YoutubeMatches = Record<string, string>;
const KEY = "tdj-youtube-matches";
const VIDEO = /^[A-Za-z0-9_-]{1,64}$/;

export const isVideoId = (v: unknown): v is string => typeof v === "string" && VIDEO.test(v);

/**
 * The export's rows (in the order of its queries) and the videos added at those rows → the matches by catalogue id.
 * A later export of the same side wins; rows without an id (breaks) are ignored.
 */
export function mergeMatches(
  prev: YoutubeMatches,
  rows: ReadonlyArray<{ id?: string } | undefined>,
  videos: ReadonlyArray<{ row: number; videoId: string }>,
): YoutubeMatches {
  const out = { ...prev };
  for (const v of videos) {
    const id = rows[v.row]?.id;
    if (id && isVideoId(v.videoId)) out[id] = v.videoId;
  }
  return out;
}

/** a YouTube link or id a DJ pasted → the video id (watch?v=, youtu.be/, music.youtube.com, /shorts/, /embed/) */
export function videoIdOf(text: string): string | null {
  const t = text.trim();
  if (isVideoId(t)) return t;
  try {
    const u = new URL(t);
    const host = u.host.replace(/^(www|m|music)\./, "");
    if (host === "youtu.be") return isVideoId(u.pathname.slice(1)) ? u.pathname.slice(1) : null;
    if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
    const v = u.searchParams.get("v");
    if (isVideoId(v)) return v;
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{1,64})/);
    return m ? m[1]! : null;
  } catch {
    return null;
  }
}

export function loadMatches(): YoutubeMatches {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const out: YoutubeMatches = {};
    for (const [k, v] of Object.entries(j ?? {})) if (isVideoId(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}
export function saveMatches(m: YoutubeMatches): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {}
}
/** the export's result, remembered for the Booth */
export function rememberMatches(
  rows: ReadonlyArray<{ id?: string } | undefined>,
  videos: ReadonlyArray<{ row: number; videoId: string }>,
): void {
  saveMatches(mergeMatches(loadMatches(), rows, videos));
}
