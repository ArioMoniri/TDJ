"use client";
import { Check, ChevronDown, Eye, Headphones, Speaker } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CUE_ON_ROOM, PICK_HEADPHONES_EVENT, SINK_UNSUPPORTED } from "@/lib/booth/cue";
import { isAppleMobile, OPEN_ROOM_EVENT } from "@/lib/booth/sources/spotify";
import { useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { ActionRow, Group } from "../Form";
import { PowerLeaf } from "../PowerSaver";
import { Sheet } from "../Sheet";
import { FitText } from "../ui/FitText";
import { IndicatorSwitches } from "./IndicatorSwitches";
import { cuePairLabel, OutputChainGroup } from "./OutputsView";
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
    id === CUE_ON_ROOM
      ? cuePairLabel()
      : (outputs.devices.find((d) => d.id === id)?.label ?? t("booth.playerToolbar.this_device"));
  // round 23: the night can play on a Spotify Connect device (the Spotify app): ROOM names it
  const spotifyRoom = useSpotifyRoomName();
  const roomLabel = spotifyRoom ?? label(outputs.room);
  useEffect(() => {
    const open = () => setPick("room");
    window.addEventListener(OPEN_ROOM_EVENT, open);
    return () => window.removeEventListener(OPEN_ROOM_EVENT, open);
  }, []);
  // 2026-11 (Cue with no headphones chosen): the picker opens; once a device is picked, the asked row plays there
  const cueAfterPick = useRef<number | null>(null);
  useEffect(() => {
    const open = (e: Event) => {
      cueAfterPick.current = (e as CustomEvent<{ then: number | null }>).detail?.then ?? null;
      setPick("headphones");
    };
    window.addEventListener(PICK_HEADPHONES_EVENT, open);
    return () => window.removeEventListener(PICK_HEADPHONES_EVENT, open);
  }, []);
  const cueId = outputs.cue;
  useEffect(() => {
    const then = cueAfterPick.current;
    if (then === null || !cueId) return;
    const b = useBooth.getState();
    if (b.cueBlocked()) return;
    cueAfterPick.current = null;
    setPick(null);
    void b.prelisten({ i: then }).then((why) => {
      if (why) toast(t("booth.songSheet.can_t_pre_listen", { why }));
    });
  }, [cueId]);
  const hearing = audition?.where === "headphones";
  // 2026-11: Spotify Premium on a browser that plays through the Spotify app (iPhone, iPad) with no device yet: ROOM
  // asks to be picked (the status says "Spotify · pick a device"); never a silent fall to 30 s clips
  const pickDevice = useSpotifyNeedsDevice();
  // 2026-11: iPad / iPhone Safari has one audio output for a web page: a headphone pre-listen needs a second device
  const apple = useApple();
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
        <span className="booth-out-name">
          <FitText text={roomLabel} />
        </span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>
      {(outputs.cueSupported || outputs.cue === CUE_ON_ROOM) && !apple ? (
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
            <FitText text={outputs.cue ? label(outputs.cue) : t("booth.playerToolbar.choose")} />
          </span>
          <ChevronDown size={14} strokeWidth={2} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          className="booth-out"
          data-off
          data-testid="booth-out-cue-unsupported"
          data-hint={apple ? t("booth.connect.headphones_ipad") : SINK_UNSUPPORTED()}
          aria-label={t("booth.playerToolbar.headphones_pre_listen_unavailable", {
            SINK_UNSUPPORTED: apple ? t("booth.connect.headphones_ipad") : SINK_UNSUPPORTED(),
          })}
          onClick={() => toast(apple ? t("booth.connect.headphones_ipad") : SINK_UNSUPPORTED())}
        >
          <Headphones size={16} strokeWidth={2} aria-hidden />
          <span className="booth-out-word">{t("booth.playerToolbar.headphones")}</span>
          <span className="booth-out-name">
            <FitText
              text={
                apple
                  ? t("booth.connect.headphones_second_device")
                  : t("booth.playerToolbar.not_in_this_browser")
              }
            />
          </span>
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
      <OutputSheet
        which={pick}
        onClose={() => {
          cueAfterPick.current = null;
          setPick(null);
        }}
      />
      <ShowSheet open={show} onClose={() => setShow(false)} />
    </div>
  );
}

/** iOS / iPadOS (after mount: the server render knows no user agent) */
function useApple(): boolean {
  const [apple, setApple] = useState(false);
  useEffect(() => setApple(isAppleMobile()), []);
  return apple;
}

function OutputSheet({ which, onClose }: { which: "room" | "headphones" | null; onClose: () => void }) {
  const outputs = useBooth((s) => s.outputs);
  const b = useBooth.getState();
  const cur = which === "room" ? outputs.room : outputs.cue;
  const blocked = which === "headphones" ? b.cueBlocked() : null;
  const apple = useApple();
  // 2026-11 (the iPad review: ROOM ticked "This device" and "iPad"): when Spotify plays the whole night on a
  // Connect device, that device is the room — this browser's outputs are not offered, nothing else is ticked
  const connectName = useSpotifyRoomName();
  const onlySpotify = useBooth(
    (s) =>
      s.sources.includes("spotify") &&
      !s.sources.some((x, i) => (x === "file" || x === "preview") && s.plan?.items[i]?.kind !== "break"),
  );
  const browserRoom = which !== "room" || !(connectName && onlySpotify);
  // iPad / iPhone: one output for a web page, no device names (the microphone permission would change nothing)
  const askNames = !outputs.named && !apple && browserRoom;
  if (which === "headphones" && apple)
    return (
      <Sheet
        open
        onClose={onClose}
        title={t("booth.playerToolbar.headphones_output")}
        trailing={t("booth.playerToolbar.done")}
        testId="booth-output-sheet"
      >
        <Group footer={t("booth.connect.headphones_ipad")}>
          <div className="cell text-[var(--label-2)]" data-testid="booth-cue-second-device">
            <Headphones size={16} strokeWidth={2} className="text-[var(--label-2)]" aria-hidden />
            <span className="min-w-0 flex-1">{t("booth.connect.headphones_second_device")}</span>
          </div>
        </Group>
        <OutputChainGroup />
      </Sheet>
    );
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
      {browserRoom && (
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
                  <Headphones size={16} strokeWidth={2} className="text-[var(--label-2)]" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{d.label}</span>
                  {isRoomDevice && (
                    <span className="text-footnote block text-[var(--label-2)]">
                      {t("booth.playerToolbar.the_room_plays_here")}
                    </span>
                  )}
                </span>
                {cur === d.id && !(which === "room" && connectName && onlySpotify) && (
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
      )}
      {which === "room" && <SpotifyRoomGroup />}
      {/* 2026-11: the connection and chain, a controller's pairs (components/booth/OutputsView.tsx) */}
      {which !== null && <OutputChainGroup />}
      {askNames && (
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
 * "Playing · Rehearsal · 30 s clips": the source's own detail (" · 30 s clips", " · full tracks") in a span the chip
 * row lets step aside when it is narrow (booth.css, iPad portrait), so the device names beside it stay whole. It stays
 * in the text and is still read out.
 */
function withDetail(text: string, source: string | null) {
  if (!source?.includes(" · ")) return text;
  const i = text.lastIndexOf(" · ");
  // (one flex item: the chip's gap never opens inside its words)
  return (
    <span>
      {text.slice(0, i)}
      <span className="booth-chip-detail">{text.slice(i)}</span>
    </span>
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
  // 2026-11 (Connect): "Starting…" until Spotify confirms the new track, never "Playing" over silence
  const starting = useBooth((s) => s.starting);
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
            : playing && starting
              ? "starting"
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
        {playing && starting
          ? t("booth.connect.starting")
          : playing
            ? withDetail(t("booth.playerToolbar.status_playing", { source: source ?? "" }), source)
            : paused
              ? withDetail(t("booth.playerToolbar.status_paused", { source: source ?? "" }), source)
              : source}
        <PowerLeaf />
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
