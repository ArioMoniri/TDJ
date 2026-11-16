"use client";
import { Check, LoaderCircle, Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import type { ResolveCandidate, ResolveResponse, ResolveService } from "@/lib/api/net";
import type { Why } from "@/lib/findMatch";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { connectSpotify, tapPlay } from "@/lib/playback";
import { usePlayer } from "@/lib/player";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { ResolvedTrack, Song } from "@/lib/types";
import { loadMatches } from "@/lib/youtubeMatches";
import { ActionRow, Group } from "./Form";
import { Sheet } from "./Sheet";

const fmtDur = (ms?: number) => {
  if (!ms) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const PROVIDER: Record<string, () => string> = {
  spotify: () => t("resolveSheet.spotify"),
  deezer: () => t("resolveSheet.deezer"),
  musicbrainz: () => t("resolveSheet.musicbrainz"),
};
const BADGE: Record<string, () => string> = {
  spotify: () => t("resolveSheet.sp"),
  deezer: () => t("resolveSheet.dz"),
  musicbrainz: () => t("resolveSheet.mb"),
};
/** why a candidate matches, in words */
export function whyText(w: Why): string {
  switch (w.k) {
    case "title":
      return t("resolveSheet.why_title");
    case "alias":
      return t("resolveSheet.why_alias", { v: w.v });
    case "leader":
      return t("resolveSheet.why_leader", { v: w.v });
    case "singer":
      return t("resolveSheet.why_singer", { v: w.v });
    case "length":
      return t("resolveSheet.why_length", { v: w.v });
    case "year":
      return t("resolveSheet.why_year", { v: w.v });
    case "unsure":
      return t("resolveSheet.why_unsure", { v: w.v });
  }
}
const serviceState = (s: ResolveService) =>
  s.state === "ok"
    ? t("resolveSheet.service_ok", { name: PROVIDER[s.id]?.() ?? s.id })
    : s.state === "signed-out"
      ? t("resolveSheet.service_signed_out", { name: PROVIDER[s.id]?.() ?? s.id })
      : s.state === "busy"
        ? t("resolveSheet.service_busy", { name: PROVIDER[s.id]?.() ?? s.id })
        : s.state === "off"
          ? t("resolveSheet.service_off", { name: PROVIDER[s.id]?.() ?? s.id })
          : t("resolveSheet.service_error", { name: PROVIDER[s.id]?.() ?? s.id });

/**
 * "Find on services…" (2026-11: the owner — "can't find for most of them"): the candidates of every connected service
 * from /api/resolve — Spotify through the DJ's own session (the full track with Premium), Deezer (the 30 s preview and
 * the cover), MusicBrainz (the recording's year) — each with why it matches (the title, the leader or singer credited,
 * the length, the year), plus the YouTube video this device's YouTube export matched. "Use this" binds the pick
 * (`songs[id].spotify` or `songs[id].resolved`) and plays it; one-tap chips apply the MusicBrainz year / singer
 * suggestion to the catalogue entry when it is missing or approximate.
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
  const [youtube, setYoutube] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !song) return;
    setYoutube(loadMatches()[song.id] ?? null);
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
        ...(song.year ? { year: song.year } : {}),
        ...(typeof song.vocal === "boolean" ? { vocal: song.vocal } : {}),
        ...(song.durationSec && !song.durationEstimated ? { durationSec: song.durationSec } : {}),
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
  const chosenUri = patch.spotify?.uri ?? null;
  const yearNow = patch.year ?? song.year;
  const singerNow = patch.singer ?? song.singer;
  const sug = state.data?.suggestions ?? {};
  const yearChip = sug.year && (yearNow == null || song.yearApprox || yearNow !== sug.year);
  const singerChip = sug.singer && !singerNow;
  const services = state.data?.services ?? [];
  const searched = services.filter((s) => s.state === "ok").map((s) => PROVIDER[s.id]?.() ?? s.id);
  const spotifyOut = services.find((s) => s.id === "spotify" && s.state === "signed-out");
  const setPatch = (p: Record<string, unknown>) =>
    updateOverrides((o) => ({
      ...o,
      songs: { ...(o.songs ?? {}), [song.id]: { ...(o.songs?.[song.id] ?? {}), ...p } },
    }));
  const use = (c: ResolveCandidate) => {
    haptic(6);
    if (c.provider === "spotify" && c.uri)
      setPatch({
        spotify: {
          uri: c.uri,
          url: c.url,
          durationMs: c.durationMs,
          album: c.album,
          matched: `${c.artist} – ${c.title}`,
          checkedAt: new Date().toISOString(),
        },
      });
    else {
      const { why: _why, uri: _uri, ...resolved } = c;
      setPatch({ resolved: resolved as ResolvedTrack });
    }
    toast(
      t("resolveSheet.using", {
        artist: c.artist,
        title: c.title,
        p1: c.previewUrl ? t("resolveSheet.preview_available") : "",
      }),
    );
    // the pick plays at once (MusicBrainz gives a year, no audio)
    if (c.provider !== "musicbrainz")
      queueMicrotask(() => void tapPlay({ kind: "song", song }, null, { scope: "one" }));
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
      {services.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-4 pt-2" data-testid="resolve-services">
          {services.map((s) => (
            <span
              key={s.id}
              className="text-caption1 rounded-full bg-[var(--fill-3)] px-2 py-0.5 text-[var(--label-2)]"
              data-service={s.id}
              data-state={s.state}
            >
              {serviceState(s)}
            </span>
          ))}
          {spotifyOut && (
            <button
              type="button"
              className="btn-plain min-h-11"
              data-testid="resolve-connect-spotify"
              onClick={() => void connectSpotify()}
            >
              {t("play.connect_spotify")}
            </button>
          )}
        </div>
      )}
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
            : state.data?.refused
              ? `${t("resolveSheet.refused", { n: state.data.refused })} ${t("resolveSheet.deezer_gives_the_30_s_preview")}`
              : t("resolveSheet.deezer_gives_the_30_s_preview")
        }
      >
        {state.busy && (
          <div className="cell justify-center text-[var(--label-2)]">
            <LoaderCircle size={16} className="animate-spin" aria-label={t("resolveSheet.searching")} />
          </div>
        )}
        {!state.busy && state.data?.candidates.length === 0 && (
          <div className="cell text-[var(--label-2)]" data-testid="resolve-nothing">
            {searched.length
              ? t("resolveSheet.nothing_matched_on", { services: searched.join(", ") })
              : t("resolveSheet.nothing_matched_on_deezer_or_musicbrainz")}
          </div>
        )}
        {state.data?.candidates.map((c) => {
          const isChosen =
            c.provider === "spotify"
              ? !!c.uri && chosenUri === c.uri
              : chosen?.provider === c.provider && chosen.id === c.id;
          const playing = player.track?.id === previewId(c) && player.playing;
          return (
            <div
              key={`${c.provider}-${c.id}`}
              className="cell"
              data-leading="art"
              data-testid="resolve-candidate"
              data-provider={c.provider}
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
                  <span className="text-caption1 font-semibold">{BADGE[c.provider]?.() ?? ""}</span>
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{c.title}</span>
                <span className="text-footnote block truncate text-[var(--label-2)]">
                  {c.artist}
                  {c.album ? ` · ${c.album}` : ""}
                  {c.year ? ` · ${c.year}` : ""}
                  {c.durationMs ? ` · ${fmtDur(c.durationMs)}` : ""} ·{" "}
                  {PROVIDER[c.provider]?.() ?? c.provider} · {Math.round(c.confidence * 100)} %
                </span>
                {!!c.why?.length && (
                  <span
                    className="text-caption1 block truncate text-[var(--label-2)]"
                    data-testid="resolve-why"
                  >
                    {c.why.map(whyText).join(" · ")}
                  </span>
                )}
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
                className={`btn-plain -mr-2 min-h-11 ${isChosen ? "font-semibold" : ""}`}
                aria-pressed={isChosen}
                data-testid="resolve-use"
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
        {youtube && (
          <div className="cell" data-leading="art" data-testid="resolve-youtube">
            <span className="tile-art" aria-hidden>
              <span className="text-caption1 font-semibold">{t("resolveSheet.yt")}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{t("resolveSheet.youtube")}</span>
              <span className="text-footnote block truncate text-[var(--label-2)]">
                {t("resolveSheet.youtube_match")}
              </span>
            </span>
            <a
              className="btn-plain -mr-2 inline-flex min-h-11 items-center"
              href={`https://www.youtube.com/watch?v=${encodeURIComponent(youtube)}`}
              target="_blank"
              rel="noreferrer"
            >
              {t("resolveSheet.open")}
            </a>
          </div>
        )}
      </Group>
      {(patch.resolved || patch.spotify) && (
        <Group footer={t("resolveSheet.back_to_the_shared_index_entry")}>
          <ActionRow
            label={t("resolveSheet.forget_my_choice")}
            destructive
            onClick={() =>
              updateOverrides((o) => {
                // the keys go (an `undefined` spotify would hide the index's own recording)
                const { resolved: _r, spotify: _s, ...rest } = o.songs?.[song.id] ?? {};
                return { ...o, songs: { ...(o.songs ?? {}), [song.id]: rest } };
              })
            }
          />
        </Group>
      )}
    </Sheet>
  );
}
