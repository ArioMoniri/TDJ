/**
 * Spotify tracks as links a DJ can open (wave 2: the Database showed raw `spotify:track:…` URIs). The index keeps
 * the URI form; what the DJ pastes (a share link or a URI) is stored as the URI.
 */
const ID = "[A-Za-z0-9]{10,40}";

export function spotifyUrl(uri: string | undefined | null): string | null {
  const t = (uri ?? "").trim();
  const m = t.match(new RegExp(`^spotify:track:(${ID})$`));
  if (m) return `https://open.spotify.com/track/${m[1]}`;
  const l = t.match(new RegExp(`^https://open\\.spotify\\.com/(?:intl-[a-z-]+/)?track/(${ID})`));
  return l ? `https://open.spotify.com/track/${l[1]}` : null;
}

export function spotifyUri(text: string): string {
  const t = text.trim();
  const m = t.match(new RegExp(`open\\.spotify\\.com/(?:intl-[a-z-]+/)?track/(${ID})`));
  return m ? `spotify:track:${m[1]}` : t;
}
