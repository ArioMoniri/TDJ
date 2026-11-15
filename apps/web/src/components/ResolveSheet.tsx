"use client";
import { Check, LoaderCircle, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { ResolveResponse } from "@/lib/api/net";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
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
            data: {
              candidates: [],
              suggestions: {},
              error: t("resolveSheet.could_not_reach_t_dj_check"),
            },
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
    toast(
      t("resolveSheet.using", {
        artist: c.artist,
        title: c.title,
        p1: c.previewUrl ? t("resolveSheet.preview_available") : "",
      }),
    );
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
    <Sheet
      open={open}
      onClose={onClose}
      title={t("resolveSheet.find_on_services")}
      trailing={t("resolveSheet.done")}
      testId="resolve-sheet"
    >
      <p className="section-foot mt-2">
        {song.title} · {song.orchestra}
        {song.singer ? ` · ${song.singer}` : ""}
        {yearNow ? ` · ${song.yearApprox ? "c. " : ""}${yearNow}` : t("resolveSheet.year_unknown")}
      </p>
      {(yearChip || singerChip) && (
        <div className="flex flex-wrap gap-2 px-4 pt-3" data-testid="resolve-suggestions">
          {yearChip && (
            <button
              type="button"
              className="chip"
              onClick={() => {
                setPatch({ year: sug.year });
                toast(t("resolveSheet.year_set_to", { year: sug.year }));
              }}
            >
              {t("resolveSheet.apply_year", { year: sug.year })}
            </button>
          )}
          {singerChip && (
            <button
              type="button"
              className="chip"
              onClick={() => {
                setPatch({ singer: sug.singer });
                toast(t("resolveSheet.singer_set_to", { singer: sug.singer }));
              }}
            >
              {t("resolveSheet.apply_singer", { singer: sug.singer })}
            </button>
          )}
        </div>
      )}
      <Group
        header={
          state.busy
            ? t("resolveSheet.searching_2")
            : t("resolveSheet.candidates", { p1: state.data?.candidates.length ?? 0 })
        }
        footer={
          state.data?.error
            ? t("resolveSheet.some_services_did_not_answer_deezer", { error: state.data.error })
            : t("resolveSheet.deezer_gives_the_30_s_preview")
        }
      >
        {state.busy && (
          <div className="cell justify-center text-[var(--label-2)]">
            <LoaderCircle size={16} className="animate-spin" aria-label={t("resolveSheet.searching")} />
          </div>
        )}
        {!state.busy && state.data?.candidates.length === 0 && (
          <div className="cell text-[var(--label-2)]">
            {t("resolveSheet.nothing_matched_on_deezer_or_musicbrainz")}
          </div>
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
                  <span className="text-caption1 font-semibold">
                    {c.provider === "deezer" ? t("resolveSheet.dz") : t("resolveSheet.mb")}
                  </span>
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.title}</span>
                <span className="text-footnote block truncate text-[var(--label-2)]">
                  {c.artist}
                  {c.album ? ` · ${c.album}` : ""}
                  {c.year ? ` · ${c.year}` : ""}
                  {c.durationMs ? ` · ${fmtDur(c.durationMs)}` : ""} ·{" "}
                  {c.provider === "deezer" ? t("resolveSheet.deezer") : t("resolveSheet.musicbrainz")} ·{" "}
                  {Math.round(c.confidence * 100)} %
                </span>
              </span>
              {c.previewUrl && (
                <button
                  type="button"
                  className="icon-btn icon-btn-bare -my-2"
                  aria-label={
                    playing
                      ? t("resolveSheet.pause_preview_of", { title: c.title })
                      : t("resolveSheet.play_preview_of", { title: c.title })
                  }
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
                    <Check size={16} strokeWidth={2.5} aria-hidden /> {t("resolveSheet.in_use")}
                  </>
                ) : (
                  t("resolveSheet.use_this")
                )}
              </button>
            </div>
          );
        })}
      </Group>
      {patch.resolved && (
        <Group footer={t("resolveSheet.back_to_the_shared_index_entry")}>
          <ActionRow
            label={t("resolveSheet.forget_my_choice")}
            destructive
            onClick={() => setPatch({ resolved: undefined })}
          />
        </Group>
      )}
    </Sheet>
  );
}
