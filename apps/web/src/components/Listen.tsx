"use client";
import { ExternalLink, Headphones, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { resolveTrack } from "@/lib/spotify";
import { useStore } from "@/lib/store";
import type { Cortina, ReferencePlaylist, Tanda } from "@/lib/types";

const trackId = (uri: string) => uri.replace(/^spotify:track:/, "");

/** One Spotify embed (anonymous; no login needed to preview 30 s, full tracks when the viewer is logged in). */
export function SpotifyEmbed({
  kind,
  id,
  title,
  height,
}: {
  kind: "track" | "playlist";
  id: string;
  title: string;
  height: number;
}) {
  return (
    <iframe
      title={title}
      src={`https://open.spotify.com/embed/${kind}/${id}?theme=0`}
      width="100%"
      height={height}
      loading="lazy"
      allow="encrypted-media; clipboard-write; fullscreen"
      style={{ borderRadius: 12, border: 0, display: "block", colorScheme: "normal" }}
    />
  );
}

/** Best reference playlist for an orchestra: matches the tanda's phase or vocal/instrumental tag when it can. */
export function referenceFor(playlists: ReferencePlaylist[], t: Tanda): ReferencePlaylist | null {
  const mine = playlists.filter((p) => p.orchestraId === t.orchestraId && p.kind !== "editorial");
  const want = [t.phase, t.vocal ? "vocal" : "instrumental", t.rhythm];
  const scored = mine
    .map((p) => ({ p, s: (p.tags ?? []).filter((x) => want.includes(x)).length }))
    .sort((a, b) => b.s - a.s);
  return scored[0]?.p ?? playlists.find((p) => p.orchestraId === t.orchestraId) ?? null;
}

/** Listen panel under a tanda: resolved tracks when Spotify is connected, else the orchestra's reference playlist. */
export function TandaListen({ t, playlists }: { t: Tanda; playlists: ReferencePlaylist[] }) {
  const token = useStore((s) => s.spotifyToken);
  const [ids, setIds] = useState<Array<string | null> | null>(null);
  const connected = !!token && token.expires > Date.now();
  useEffect(() => {
    if (!connected || !token) return;
    let alive = true;
    (async () => {
      const out: Array<string | null> = [];
      for (const s of t.songs) {
        if (s.spotify?.uri) {
          out.push(trackId(s.spotify.uri));
          continue;
        }
        const r = await resolveTrack(
          token.access,
          `${s.title} ${s.orchestra}${s.singer ? ` ${s.singer}` : ""}`,
          s.year,
        );
        out.push(r ? trackId(r.uri) : null);
      }
      if (alive) setIds(out);
    })();
    return () => {
      alive = false;
    };
  }, [connected, token, t.songs]);

  if (connected) {
    if (!ids)
      return (
        <p className="text-muted flex items-center gap-2 text-sm">
          <LoaderCircle size={14} className="animate-spin" /> Finding these recordings on Spotify…
        </p>
      );
    return (
      <div className="space-y-2">
        {t.songs.map((s, k) =>
          ids[k] ? (
            <SpotifyEmbed key={s.id} kind="track" id={ids[k]!} title={`${s.title} on Spotify`} height={80} />
          ) : (
            <p key={s.id} className="text-muted text-sm">
              {s.title}: not on Spotify under this title.
            </p>
          ),
        )}
      </div>
    );
  }
  const ref = referenceFor(playlists, t);
  if (!ref)
    return (
      <p className="text-muted text-sm">
        No reference playlist for {t.orchestra} yet. Connect Spotify in Settings to hear the exact recordings,
        or{" "}
        <a
          className="underline"
          href={`https://open.spotify.com/search/${encodeURIComponent(`${t.orchestra} ${t.singer ?? ""}`.trim())}`}
          target="_blank"
          rel="noreferrer"
        >
          search Spotify
        </a>
        .
      </p>
    );
  return (
    <div className="space-y-2">
      <p className="text-muted flex items-center gap-1.5 text-xs">
        <Headphones size={13} /> Reference playlist for {t.orchestra}: {ref.title}
        {ref.owner ? ` (${ref.owner})` : ""}. Connect Spotify in Settings to hear the exact recordings.
      </p>
      <SpotifyEmbed kind="playlist" id={ref.id} title={ref.title} height={152} />
    </div>
  );
}

/** "Preview cortina": a Spotify search through the connected account, then the track embed. */
export function CortinaPreview({ c }: { c: Cortina }) {
  const token = useStore((s) => s.spotifyToken);
  const [state, setState] = useState<"idle" | "busy" | "none">("idle");
  const [id, setId] = useState<string | null>(c.spotify?.uri ? trackId(c.spotify.uri) : null);
  const connected = !!token && token.expires > Date.now();
  const go = async () => {
    if (!token) return;
    setState("busy");
    const r = await resolveTrack(token.access, `${c.artist} ${c.title}`, c.year ?? null).catch(() => null);
    if (r) setId(trackId(r.uri));
    setState(r ? "idle" : "none");
  };
  if (id) return <SpotifyEmbed kind="track" id={id} title={`Cortina: ${c.title}`} height={80} />;
  if (!connected)
    return (
      <p className="text-muted text-xs">
        Connect Spotify in Settings to preview cortinas, or{" "}
        <a
          className="underline"
          href={`https://open.spotify.com/search/${encodeURIComponent(`${c.artist} ${c.title}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          open the search <ExternalLink size={11} className="inline" />
        </a>
        .
      </p>
    );
  return (
    <div className="flex items-center gap-2">
      <button type="button" className="btn btn-ghost text-sm" onClick={go} disabled={state === "busy"}>
        {state === "busy" ? <LoaderCircle size={14} className="animate-spin" /> : <Headphones size={14} />}{" "}
        Preview cortina
      </button>
      {state === "none" && <span className="text-muted text-xs">Not found on Spotify.</span>}
    </div>
  );
}

/** Mood check: the two Aren León tanda playlists as a yardstick for the set's feel. */
export function MoodCheck({ playlists }: { playlists: ReferencePlaylist[] }) {
  const refs = playlists.filter((p) => p.kind === "tandas").slice(0, 2);
  if (!refs.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {refs.map((p) => (
        <div key={p.id}>
          <p className="text-muted mb-1.5 truncate text-xs">{p.title}</p>
          <SpotifyEmbed kind="playlist" id={p.id} title={p.title} height={152} />
        </div>
      ))}
    </div>
  );
}
