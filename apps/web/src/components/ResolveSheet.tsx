"use client";
import { Check, LoaderCircle, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { ResolveResponse } from "@/app/api/resolve/route";
import { haptic } from "@/lib/haptics";
import { usePlayer } from "@/lib/player";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { ResolvedTrack, Song } from "@/lib/types";
import { ActionRow, Group } from "./Form";
import { Sheet } from "./Sheet";

const fmtDur = (ms?: number) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * "Find on services…": candidates from /api/resolve (Deezer previews, MusicBrainz recordings) with artwork, title,
 * artist, duration and a preview play; "Use this" stores `songs[id].resolved`; one-tap chips apply the MusicBrainz
 * year / singer suggestion to the catalogue entry when it is missing or approximate.
 */
export function ResolveSheet({
  song,
  open,
  onClose,
}: {
  song: Song | null;
  open: boolean;
  onClose: () => void;
}) {
  const { overrides, updateOverrides } = useStore();
  const player = usePlayer();
  const [state, setState] = useState<{ busy: boolean; data: ResolveResponse | null }>({
    busy: false,
    data: null,
  });
  useEffect(() => {
    if (!open || !song) return;
    let alive = true;
    setState({ busy: true, data: null });
    fetch("/api/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: song.id,
        title: song.title,
        orchestra: song.orchestra,
        singer: song.singer,
      }),
    })
      .then((r) => r.json())
      .then((j: ResolveResponse) => alive && setState({ busy: false, data: j }))
      .catch(
        () =>
          alive &&
          setState({
            busy: false,
            data: { candidates: [], suggestions: {}, error: "Could not reach the server" },
          }),
      );
    return () => {
      alive = false;
    };
  }, [open, song]);
  if (!song) return null;
  const patch = overrides.songs?.[song.id] ?? {};
  const chosen = patch.resolved ?? song.resolved ?? null;
  const yearNow = patch.year ?? song.year;
  const singerNow = patch.singer ?? song.singer;
  const sug = state.data?.suggestions ?? {};
  const yearChip = sug.year && (yearNow == null || song.yearApprox || yearNow !== sug.year);
  const singerChip = sug.singer && !singerNow;
  const setPatch = (p: Record<string, unknown>) =>
    updateOverrides((o) => ({
      ...o,
      songs: { ...(o.songs ?? {}), [song.id]: { ...(o.songs?.[song.id] ?? {}), ...p } },
    }));
  const use = (c: ResolvedTrack) => {
    haptic(6);
    setPatch({ resolved: c });
    toast(`Using ${c.artist} – ${c.title}${c.previewUrl ? " (preview available)" : ""}`);
  };
  const previewId = (c: ResolvedTrack) => `cand-${c.provider}-${c.id}`;
  const togglePreview = (c: ResolvedTrack) => {
    if (!c.previewUrl) return;
    player.toggle({
      id: previewId(c),
      title: c.title,
      orchestra: c.artist,
      year: c.year ?? null,
      source: { kind: "preview", ref: c.previewUrl },
    });
  };
  return (
    <Sheet open={open} onClose={onClose} title="Find on services" trailing="Done" testId="resolve-sheet">
      <p className="section-foot mt-2">
        {song.title} · {song.orchestra}
        {song.singer ? ` · ${song.singer}` : ""}
        {yearNow ? ` · ${song.yearApprox ? "c. " : ""}${yearNow}` : " · year unknown"}
      </p>
      {(yearChip || singerChip) && (
        <div className="flex flex-wrap gap-2 px-4 pt-3" data-testid="resolve-suggestions">
          {yearChip && (
            <button
              type="button"
              className="chip"
              onClick={() => {
                setPatch({ year: sug.year });
                toast(`Year set to ${sug.year}`);
              }}
            >
              Apply year {sug.year}
            </button>
          )}
          {singerChip && (
            <button
              type="button"
              className="chip"
              onClick={() => {
                setPatch({ singer: sug.singer });
                toast(`Singer set to ${sug.singer}`);
              }}
            >
              Apply singer {sug.singer}
            </button>
          )}
        </div>
      )}
      <Group
        header={state.busy ? "Searching…" : `${state.data?.candidates.length ?? 0} candidates`}
        footer={
          state.data?.error
            ? `Some services did not answer: ${state.data.error}. Deezer previews are 30 s; recording years come from MusicBrainz first-release dates, never from streaming reissue dates.`
            : "Deezer gives the 30 s preview and artwork; MusicBrainz gives the recording's first-release year. Streaming album dates are reissues and are never used as the year."
        }
      >
        {state.busy && (
          <div className="cell justify-center text-[var(--label-2)]">
            <LoaderCircle size={16} className="animate-spin" aria-label="Searching" />
          </div>
        )}
        {!state.busy && state.data?.candidates.length === 0 && (
          <div className="cell text-[var(--label-2)]">Nothing matched on Deezer or MusicBrainz.</div>
        )}
        {state.data?.candidates.map((c) => {
          const isChosen = chosen?.provider === c.provider && chosen.id === c.id;
          const playing = player.track?.id === previewId(c) && player.playing;
          return (
            <div
              key={`${c.provider}-${c.id}`}
              className="cell"
              data-leading="art"
              data-testid="resolve-candidate"
            >
              {c.artwork ? (
                // biome-ignore lint/performance/noImgElement: remote artwork from the provider, unoptimised by design
                <img
                  src={c.artwork}
                  alt=""
                  width={44}
                  height={44}
                  className="tile-art object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="tile-art" aria-hidden>
                  <span className="text-caption1 font-semibold">{c.provider === "deezer" ? "DZ" : "MB"}</span>
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.title}</span>
                <span className="text-footnote block truncate text-[var(--label-2)]">
                  {c.artist}
                  {c.album ? ` · ${c.album}` : ""}
                  {c.year ? ` · ${c.year}` : ""}
                  {c.durationMs ? ` · ${fmtDur(c.durationMs)}` : ""} ·{" "}
                  {c.provider === "deezer" ? "Deezer" : "MusicBrainz"} · {Math.round(c.confidence * 100)} %
                </span>
              </span>
              {c.previewUrl && (
                <button
                  type="button"
                  className="icon-btn icon-btn-bare -my-2"
                  aria-label={playing ? `Pause preview of ${c.title}` : `Play preview of ${c.title}`}
                  onClick={() => togglePreview(c)}
                >
                  {playing ? (
                    <Pause size={18} fill="currentColor" strokeWidth={0} />
                  ) : (
                    <Play size={18} fill="currentColor" strokeWidth={0} />
                  )}
                </button>
              )}
              <button
                type="button"
                className={`btn-plain -mr-2 ${isChosen ? "font-semibold" : ""}`}
                aria-pressed={isChosen}
                onClick={() => use(c)}
              >
                {isChosen ? (
                  <>
                    <Check size={16} strokeWidth={2.5} aria-hidden /> In use
                  </>
                ) : (
                  "Use this"
                )}
              </button>
            </div>
          );
        })}
      </Group>
      {patch.resolved && (
        <Group footer="Back to the shared index entry for this recording.">
          <ActionRow label="Forget my choice" destructive onClick={() => setPatch({ resolved: undefined })} />
        </Group>
      )}
    </Sheet>
  );
}
