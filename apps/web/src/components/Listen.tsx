"use client";
import { LoaderCircle, Play } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { keyLabel } from "@/lib/analyze";
import { effectiveSong } from "@/lib/audio";
import { fade, t as tw } from "@/lib/motion";
import { resolveTrack } from "@/lib/spotify";
import { useStore } from "@/lib/store";
import type { Cortina, Playlist, ReferencePlaylist, Tanda } from "@/lib/types";

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
  // a breathing skeleton of the iframe's exact height; the iframe fades in on load (opacity only: no transform on iframes)
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative" style={{ height }}>
      <AnimatePresence>
        {!loaded && (
          <motion.div
            key="sk"
            className="skeleton absolute inset-0 rounded-[12px]"
            exit={{ opacity: 0, transition: tw.fade }}
            aria-hidden
          />
        )}
      </AnimatePresence>
      <motion.iframe
        title={title}
        src={`https://open.spotify.com/embed/${kind}/${id}?theme=0`}
        width="100%"
        height={height}
        loading="lazy"
        allow="encrypted-media; clipboard-write; fullscreen"
        onLoad={() => setLoaded(true)}
        initial={{ opacity: 0 }}
        animate={{ opacity: loaded ? 1 : 0 }}
        transition={tw.fade}
        style={{ borderRadius: 12, border: 0, display: "block", colorScheme: "normal" }}
      />
    </div>
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

const foot = "text-footnote text-[var(--label-2)]";
const link = "text-[var(--tint)]";

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
        <p className={`${foot} flex items-center gap-2`}>
          <LoaderCircle size={14} className="animate-spin" /> Finding these recordings on Spotify…
        </p>
      );
    return (
      <div className="space-y-2">
        {t.songs.map((s, k) =>
          ids[k] ? (
            <SpotifyEmbed key={s.id} kind="track" id={ids[k]!} title={`${s.title} on Spotify`} height={80} />
          ) : (
            <motion.p key={s.id} variants={fade} initial="hidden" animate="show" className={foot}>
              {s.title}: not on Spotify under this title.
            </motion.p>
          ),
        )}
      </div>
    );
  }
  const ref = referenceFor(playlists, t);
  const first = t.songs[0]?.title ?? "the tracks";
  if (!ref)
    return (
      <p className={foot}>
        No public {t.orchestra} playlist to preview. Use the play buttons on the rows for 30 s previews, or{" "}
        <a
          className={link}
          href={`https://open.spotify.com/search/${encodeURIComponent(`${t.orchestra} ${first}`.trim())}`}
          target="_blank"
          rel="noreferrer"
        >
          open on Spotify
        </a>
        .
      </p>
    );
  return (
    <div className="space-y-2">
      <SpotifyEmbed kind="playlist" id={ref.id} title={ref.title} height={152} />
      <p className={foot}>
        Preview: a public {t.orchestra} playlist{ref.owner ? ` by ${ref.owner}` : ""}. Connect Spotify to play{" "}
        <em>{first}</em> and the other tracks; the row play buttons give 30 s previews.
      </p>
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
  const meta = `${c.genre} · ${c.culture} · energy ${c.energy}${c.year ? ` · ${c.year}` : ""}`;
  if (id)
    return (
      <div className="space-y-2">
        <SpotifyEmbed kind="track" id={id} title={`Cortina: ${c.title}`} height={80} />
        <p className={foot}>{meta}</p>
      </div>
    );
  if (!connected)
    return (
      <p className={foot}>
        {meta} ·{" "}
        <a
          className={link}
          href={`https://open.spotify.com/search/${encodeURIComponent(`${c.artist} ${c.title}`)}`}
          target="_blank"
          rel="noreferrer"
        >
          Open on Spotify
        </a>
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" className="btn-plain -ml-2" onClick={go} disabled={state === "busy"}>
        {state === "busy" ? (
          <LoaderCircle size={16} className="animate-spin" />
        ) : (
          <Play size={16} fill="currentColor" strokeWidth={0} />
        )}{" "}
        Preview cortina
      </button>
      <span className={foot}>{meta}</span>
      <AnimatePresence>
        {state === "none" && (
          <motion.span
            key="none"
            variants={fade}
            initial="hidden"
            animate="show"
            exit="exit"
            className={foot}
          >
            Not found on Spotify.
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Mood check: the set's own numbers (mean energy, BPM and keys where analysed, vals/milonga share) beside Aren León's
 * reference tanda playlists, with a one-line verdict; the two embeds stay for listening.
 */
export function MoodCheck({
  playlists,
  playlist,
}: {
  playlists: ReferencePlaylist[];
  playlist?: Playlist | null;
}) {
  const overrides = useStore((s) => s.overrides);
  const refs = playlists.filter((p) => p.kind === "tandas").slice(0, 2);
  if (!refs.length) return null;
  const songs = playlist
    ? playlist.tandas.flatMap((t) => t.songs.map((s) => effectiveSong(s, overrides)))
    : [];
  const energy = songs.length
    ? Math.round(songs.reduce((a, s) => a + (s.energy ?? 50), 0) / songs.length)
    : null;
  const withAudio = songs.filter((s) => s.audio);
  const bpm = withAudio.length
    ? Math.round(withAudio.reduce((a, s) => a + s.audio!.bpm, 0) / withAudio.length)
    : null;
  const minor = withAudio.length
    ? Math.round((withAudio.filter((s) => s.audio!.mode === "minor").length / withAudio.length) * 100)
    : null;
  const keys = [...new Set(withAudio.map((s) => keyLabel(s.audio!).split(" · ")[0]))].slice(0, 4);
  const tandas = playlist?.tandas.length ?? 0;
  const vals = playlist ? playlist.tandas.filter((t) => t.rhythm === "vals").length : 0;
  const milongas = playlist ? playlist.tandas.filter((t) => t.rhythm === "milonga").length : 0;
  const peak = playlist ? Math.max(...playlist.tandas.map((t) => t.energy)) : 0;
  const peakAt = playlist ? playlist.tandas.findIndex((t) => t.energy === peak) + 1 : 0;
  // the reference tandas sit around a 60–65 mean with the peak past the middle of the night
  const verdict = !playlist
    ? "Compose a set to compare it."
    : energy != null && energy > 70
      ? "Hotter than the reference tandas: a marathon peak, not a salón night."
      : energy != null && energy < 52
        ? "Softer than the reference tandas: a práctica or an early-evening feel."
        : peakAt && tandas && peakAt / tandas < 0.4
          ? "Same warmth as the reference, but the peak comes early."
          : "In the same mood as the reference tandas: warm, with the peak past the middle.";
  const cell = (label: string, v: string) => (
    <div className="cell py-2">
      <span className="min-w-0 flex-1">{label}</span>
      <span className="cell-value tabular-nums">{v}</span>
    </div>
  );
  return (
    <div className="space-y-4">
      {playlist && (
        <div className="group-inset" data-testid="mood-compare">
          <div className="cell flex-col items-stretch gap-0.5 py-3">
            <span className="text-headline">{verdict}</span>
            <span className={foot}>
              Your set vs the reference tandas · {withAudio.length} of {songs.length} tracks analysed
            </span>
          </div>
          {cell("Mean energy", `${energy ?? "–"} · ref ≈ 62`)}
          {cell("Peak", `${peak} at tanda ${peakAt} of ${tandas}`)}
          {cell("Vals · milonga", `${vals} · ${milongas} of ${tandas}`)}
          {cell("Tempo (analysed)", bpm ? `${bpm} BPM mean` : "no analysed audio yet")}
          {cell(
            "Keys (analysed)",
            keys.length ? `${keys.join(", ")}${minor != null ? ` · ${minor}% minor` : ""}` : "–",
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {refs.map((p) => (
          <div key={p.id}>
            <p className={`${foot} mb-1.5 truncate`}>{p.title}</p>
            <SpotifyEmbed kind="playlist" id={p.id} title={p.title} height={152} />
          </div>
        ))}
      </div>
      <p className={foot}>Listen to Aren León's reference tandas on Spotify to hear the yardstick.</p>
    </div>
  );
}
