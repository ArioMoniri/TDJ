"use client";
import { Check, ChevronDown, Eye, Headphones, Speaker } from "lucide-react";
import { useEffect, useState } from "react";
import { SINK_UNSUPPORTED } from "@/lib/booth/cue";
import { OPEN_ROOM_EVENT } from "@/lib/booth/sources/spotify";
import { useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { ActionRow, Group } from "../Form";
import { Sheet } from "../Sheet";
import { IndicatorSwitches } from "./IndicatorSwitches";
import { SpotifyRoomGroup, useSpotifyNeedsDevice, useSpotifyRoomName } from "./SpotifyRoom";

/**
 * Round 22 — the player's toolbar under the title: where the sound comes from (Spotify full tracks, files or the
 * 30 s rehearsal), where it goes (ROOM, rose, a speaker) and where the pre-listen goes (HEADPHONES, blue,
 * headphones), and Show (the indicator switches). The two outputs always carry a glyph and a word, never colour
 * alone. Without `setSinkId` (Safari) the headphones picker is hidden and its chip says why on hover / long-press.
 */
export function PlayerToolbar({ rehearsal }: { rehearsal: boolean }) {
  const outputs = useBooth((s) => s.outputs);
  const audition = useBooth((s) => s.audition);
  const [pick, setPick] = useState<"room" | "headphones" | null>(null);
  const [show, setShow] = useState(false);
  const label = (id: string | null) =>
    outputs.devices.find((d) => d.id === id)?.label ?? t("booth.playerToolbar.this_device");
  // round 23: the night can play on a Spotify Connect device (the Spotify app): ROOM names it
  const spotifyRoom = useSpotifyRoomName();
  const roomLabel = spotifyRoom ?? label(outputs.room);
  useEffect(() => {
    const open = () => setPick("room");
    window.addEventListener(OPEN_ROOM_EVENT, open);
    return () => window.removeEventListener(OPEN_ROOM_EVENT, open);
  }, []);
  const hearing = audition?.where === "headphones";
  // 2026-11: Spotify Premium on a browser that plays through the Spotify app (iPhone, iPad) with no device yet: ROOM
  // asks to be picked (the status says "Spotify · pick a device"); never a silent fall to 30 s clips
  const pickDevice = useSpotifyNeedsDevice();
  return (
    <div className="booth-toolbar" data-testid="booth-toolbar">
      <SourceLine rehearsal={rehearsal} />
      <button
        type="button"
        className="booth-out"
        data-out="room"
        data-attention={pickDevice || undefined}
        data-testid="booth-out-room"
        data-hint={t("booth.playerToolbar.room_where_the_night_plays_for")}
        aria-label={t("booth.playerToolbar.room_output_2", { p1: roomLabel })}
        onClick={() => setPick("room")}
      >
        <Speaker size={16} strokeWidth={2} aria-hidden />
        <span className="booth-out-word">{t("booth.playerToolbar.room")}</span>
        <span className="booth-out-name">{roomLabel}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>
      {outputs.cueSupported ? (
        <button
          type="button"
          className="booth-out"
          data-out="headphones"
          data-live={hearing || undefined}
          data-off={outputs.cue ? undefined : true}
          data-testid="booth-out-cue"
          data-hint={t("booth.playerToolbar.headphones_pre_listen_here_the_room")}
          aria-label={t("booth.playerToolbar.headphones_output_2", {
            p1: outputs.cue ? label(outputs.cue) : t("booth.playerToolbar.not_set"),
          })}
          onClick={() => setPick("headphones")}
        >
          <Headphones size={16} strokeWidth={2} aria-hidden />
          <span className="booth-out-word">{t("booth.playerToolbar.headphones")}</span>
          <span className="booth-out-name">
            {outputs.cue ? label(outputs.cue) : t("booth.playerToolbar.choose")}
          </span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          className="booth-out"
          data-off
          data-testid="booth-out-cue-unsupported"
          data-hint={SINK_UNSUPPORTED()}
          aria-label={t("booth.playerToolbar.headphones_pre_listen_unavailable", {
            SINK_UNSUPPORTED: SINK_UNSUPPORTED(),
          })}
          onClick={() => toast(SINK_UNSUPPORTED())}
        >
          <Headphones size={16} strokeWidth={2} aria-hidden />
          <span className="booth-out-word">{t("booth.playerToolbar.headphones")}</span>
          <span className="booth-out-name">{t("booth.playerToolbar.not_in_this_browser")}</span>
        </button>
      )}
      <button
        type="button"
        className="booth-out"
        data-testid="booth-show"
        data-hint={t("booth.playerToolbar.show_or_hide_energy_bpm_key")}
        onClick={() => setShow(true)}
      >
        <Eye size={16} strokeWidth={2} aria-hidden />
        <span>{t("booth.playerToolbar.show")}</span>
      </button>
      <OutputSheet which={pick} onClose={() => setPick(null)} />
      <ShowSheet open={show} onClose={() => setShow(false)} />
    </div>
  );
}

function OutputSheet({ which, onClose }: { which: "room" | "headphones" | null; onClose: () => void }) {
  const outputs = useBooth((s) => s.outputs);
  const b = useBooth.getState();
  const cur = which === "room" ? outputs.room : outputs.cue;
  const blocked = which === "headphones" ? b.cueBlocked() : null;
  return (
    <Sheet
      open={which !== null}
      onClose={onClose}
      title={
        which === "room" ? t("booth.playerToolbar.room_output") : t("booth.playerToolbar.headphones_output")
      }
      trailing={t("booth.playerToolbar.done")}
      testId="booth-output-sheet"
    >
      <Group
        header={
          which === "room"
            ? t("booth.playerToolbar.where_the_dancers_hear_the_night")
            : t("booth.playerToolbar.where_you_pre_listen")
        }
        footer={
          which === "room"
            ? outputs.roomSupported
              ? t("booth.playerToolbar.the_night_plays_here_changing_it")
              : t("booth.playerToolbar.this_browser_plays_the_night_on")
            : t("booth.playerToolbar.pick_the_headphones_or_the_interface", {
                p1: blocked && outputs.cue ? ` ${blocked}` : "",
              })
        }
      >
        {outputs.devices.map((d) => {
          const isRoomDevice = which === "headphones" && d.id === outputs.room;
          return (
            <button
              key={d.id}
              type="button"
              className="cell cell-tap w-full text-left"
              disabled={(which === "room" && !outputs.roomSupported && d.id !== "default") || isRoomDevice}
              data-testid="booth-output"
              data-device={d.id}
              onClick={() => {
                if (which === "room") void b.setRoomOutput(d.id);
                else b.setCueOutput(d.id);
              }}
            >
              {which === "room" ? (
                <Speaker size={16} strokeWidth={2} className="text-[var(--room)]" aria-hidden />
              ) : (
                <Headphones size={16} strokeWidth={2} className="text-[var(--cue)]" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate">{d.label}</span>
                {isRoomDevice && (
                  <span className="text-footnote block text-[var(--label-2)]">
                    {t("booth.playerToolbar.the_room_plays_here")}
                  </span>
                )}
              </span>
              {cur === d.id && (
                <Check
                  size={18}
                  strokeWidth={2.5}
                  className="text-[var(--tint)]"
                  aria-label={t("booth.playerToolbar.chosen")}
                />
              )}
            </button>
          );
        })}
        {which === "headphones" && outputs.cue && (
          <ActionRow
            label={t("booth.playerToolbar.turn_pre_listen_off")}
            onClick={() => b.setCueOutput(null)}
          />
        )}
      </Group>
      {which === "room" && <SpotifyRoomGroup />}
      {!outputs.named && (
        <Group footer={t("booth.playerToolbar.your_browser_names_the_outputs_once")}>
          <ActionRow
            label={t("booth.playerToolbar.show_device_names")}
            onClick={() => void b.refreshOutputs(true)}
          />
        </Group>
      )}
    </Sheet>
  );
}

/** Show: the indicator switches (the same ones as Settings → Indicators) and the era legend. */
export function ShowSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("booth.playerToolbar.show")}
      trailing={t("booth.playerToolbar.done")}
      testId="booth-show-sheet"
    >
      <IndicatorSwitches />
    </Sheet>
  );
}

/**
 * Where the night's sound comes from, said plainly: "Spotify · full tracks" when the Premium session plays,
 * "Rehearsal · 30 s clips" otherwise with what would play the full songs.
 */
function SourceLine({ rehearsal }: { rehearsal: boolean }) {
  const sp = useBooth((s) => s.availability.spotify);
  const sources = useBooth((s) => s.sources);
  const mode = useBooth((s) => s.sourceMode);
  const started = useBooth((s) => s.started);
  const state = useBooth((s) => s.state);
  const onSpotify = !rehearsal && sources.includes("spotify");
  const pick = useSpotifyNeedsDevice();
  // 2026-11: the state in words beside its colour — Playing / Paused, the source, or "Spotify · pick a device"
  const playing = started && (state === "playing" || state === "cortina");
  const paused = started && state === "paused";
  const source = onSpotify
    ? pick
      ? t("booth.playerToolbar.spotify_pick_device")
      : t("booth.playerToolbar.spotify_full_tracks")
    : rehearsal
      ? t("booth.playerToolbar.rehearsal_30_s_clips")
      : sources.includes("file")
        ? t("booth.playerToolbar.your_files")
        : null;
  if (!source && !sp.reconnect) return null;
  return (
    <>
      <span
        className="booth-chip"
        data-testid="booth-mode"
        role="status"
        data-source={onSpotify ? "spotify" : rehearsal ? "clips" : "files"}
        data-state={
          pick && onSpotify
            ? "pick-device"
            : playing
              ? "playing"
              : paused
                ? "paused"
                : onSpotify
                  ? "spotify"
                  : rehearsal
                    ? "rehearsal"
                    : "files"
        }
        data-hint={
          onSpotify
            ? pick
              ? t("booth.playerToolbar.spotify_pick_device_hint")
              : t("booth.playerToolbar.spotify_premium_plays_every_song_in")
            : t("booth.playerToolbar.a_rehearsal_plays_30_s_of")
        }
      >
        {playing
          ? t("booth.playerToolbar.status_playing", { source: source ?? "" })
          : paused
            ? t("booth.playerToolbar.status_paused", { source: source ?? "" })
            : source}
      </span>
      {rehearsal && sp.ok && mode === "preview" && !started && (
        <button
          type="button"
          className="btn-plain min-h-11"
          onClick={() => void useBooth.getState().setSourceMode("file")}
          data-testid="booth-full-tracks"
        >
          {t("booth.playerToolbar.play_full_tracks_on_spotify")}
        </button>
      )}
      {sp.reconnect && (
        <a
          className="btn-plain min-h-11 inline-flex items-center"
          href="/api/spotify/login?next=/booth"
          data-testid="booth-reconnect"
        >
          {t("booth.playerToolbar.reconnect_spotify_to_play_full_songs")}
        </a>
      )}
      {rehearsal && sp.checked && sp.premium === false && (
        <span className="text-footnote text-[var(--label-2)]">
          {t("booth.playerToolbar.spotify_free_the_browser_can_only")}
        </span>
      )}
    </>
  );
}
