"use client";
import { Check, Laptop, Smartphone, Speaker } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import {
  onSpotifyRoom,
  type SpotifyDevice,
  type SpotifyRoomState,
  spotifyRoom,
} from "@/lib/booth/sources/spotify";
import { useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { ActionRow, Group } from "../Form";

const EMPTY: SpotifyRoomState = {
  devices: [],
  remote: null,
  remoteName: null,
  browserUnusable: false,
  waiting: false,
  loading: false,
  errors: [],
};

/** The Spotify adapter's ROOM state (null-safe before the booth made one). */
export function useSpotifyRoom(): SpotifyRoomState {
  return useSyncExternalStore(
    onSpotifyRoom,
    () => spotifyRoom()?.roomState() ?? EMPTY,
    () => EMPTY,
  );
}

/** the ROOM chip's name when the night plays on a Spotify Connect device (null: the browser's own output) */
export function useSpotifyRoomName(): string | null {
  const sp = useBooth((s) => s.availability.spotify.ok);
  const room = useSpotifyRoom();
  return sp && room.remote ? (room.remoteName ?? "Spotify") : null;
}

const icon = (d: SpotifyDevice) =>
  d.type === "Smartphone" ? Smartphone : d.type === "Computer" ? Laptop : Speaker;

/**
 * Round 23 — under ROOM, where Spotify plays the night: this browser (the Web Playback SDK) or one of the account's
 * Spotify Connect devices (the Spotify app on the phone, a computer, a speaker). An iPhone's Safari can't run the
 * SDK, so there the night plays through the Spotify app. The last Spotify errors are shown for diagnosis.
 */
export function SpotifyRoomGroup() {
  const sp = useBooth((s) => s.availability.spotify.ok);
  const room = useSpotifyRoom();
  const a = spotifyRoom();
  useEffect(() => {
    if (sp) void spotifyRoom()?.listDevices();
  }, [sp]);
  if (!sp || !a) return null;
  const others = room.devices.filter((d) => !d.isThis);
  const err = room.errors[0];
  return (
    <Group
      header={t("booth.spotifyRoom.header")}
      footer={
        <>
          {room.waiting && <span className="block">{t("booth.spotifyRoom.waiting")}</span>}
          <span className="block">{t("booth.spotifyRoom.footer")}</span>
          {err && (
            <span className="block break-words" data-testid="booth-spotify-error">
              {t("booth.spotifyRoom.last_error", {
                detail: [err.status || null, err.reason, err.message, err.note, err.title && `“${err.title}”`]
                  .filter(Boolean)
                  .join(" · "),
              })}
            </span>
          )}
        </>
      }
    >
      <button
        type="button"
        className="cell cell-tap w-full text-left"
        data-testid="booth-spotify-device"
        data-device="this"
        disabled={room.browserUnusable && !a.thisDeviceId()}
        onClick={() => void a.selectDevice(null)}
      >
        <Laptop size={16} strokeWidth={2} className="text-[var(--room)]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{t("booth.spotifyRoom.this_browser")}</span>
          {room.browserUnusable && (
            <span className="text-footnote block text-[var(--label-2)]">
              {t("booth.spotifyRoom.this_browser_unusable")}
            </span>
          )}
        </span>
        {room.remote === null && !room.browserUnusable && (
          <Check
            size={18}
            strokeWidth={2.5}
            className="text-[var(--tint)]"
            aria-label={t("booth.playerToolbar.chosen")}
          />
        )}
      </button>
      {others.map((d) => {
        const Icon = icon(d);
        return (
          <button
            key={d.id}
            type="button"
            className="cell cell-tap w-full text-left"
            data-testid="booth-spotify-device"
            data-device={d.id}
            disabled={d.restricted}
            onClick={() => void a.selectDevice(d.id)}
          >
            <Icon size={16} strokeWidth={2} className="text-[var(--room)]" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{d.name}</span>
              {d.isActive && (
                <span className="text-footnote block text-[var(--label-2)]">
                  {t("booth.spotifyRoom.active")}
                </span>
              )}
            </span>
            {room.remote === d.id && (
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
      {!others.length && (
        <div className="cell text-footnote text-[var(--label-2)]">{t("booth.spotifyRoom.none")}</div>
      )}
      <ActionRow
        label={t("booth.spotifyRoom.refresh")}
        busy={room.loading}
        onClick={() => void a.listDevices().then(() => a.retryWaiting())}
      />
    </Group>
  );
}
