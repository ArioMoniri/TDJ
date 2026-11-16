import { t } from "@/lib/i18n";

/**
 * 2026-11 — what can play the night on THIS device, said in one line each (the Booth's Source sheet and Settings →
 * Booth). Pure, so the vitest pins every platform's wording and the automatic pick.
 *
 * Spotify: the Web Playback SDK where the view has Widevine (Chrome, Edge, Firefox), else Spotify Connect to the
 * Spotify app (the Mac app: the Spotify app on that Mac; iPhone and iPad: the Spotify app on the same device).
 * YouTube: the official embedded player with the videos the YouTube export matched. Files: the linked music folder.
 * Clips: Deezer / Spotify 30 s previews, always.
 */
export type Platform = "mac-app" | "ios-app" | "desktop-web" | "ios-web" | "phone-web";
export type DeviceSourceKind = "file" | "spotify" | "youtube" | "preview";

export function platformOf(e: { app: boolean; appleMobile: boolean; phone: boolean }): Platform {
  if (e.app) return e.appleMobile || e.phone ? "ios-app" : "mac-app";
  if (e.appleMobile) return "ios-web";
  return e.phone ? "phone-web" : "desktop-web";
}

export interface DeviceSourceInputs {
  platform: Platform;
  spotify: { ok: boolean; reason?: string; checked: boolean };
  /** the Web Playback SDK can run here (Widevine); null: not probed yet */
  sdk: boolean | null;
  youtube: { ok: boolean; reason?: string };
  youtubeMatched: number;
  folderName: string | null;
  folderMatched: number;
}
export interface DeviceSource {
  kind: DeviceSourceKind;
  ok: boolean;
  line: string;
}

const iosLike = (p: Platform) => p === "ios-app" || p === "ios-web" || p === "phone-web";

export function deviceSources(i: DeviceSourceInputs): DeviceSource[] {
  const p = i.platform;
  const connect = iosLike(p) || i.sdk === false;
  const spotifyLine = !i.spotify.ok
    ? (i.spotify.reason ??
      (i.spotify.checked ? t("deviceSources.spotify_log_in") : t("deviceSources.checking")))
    : !connect
      ? t("deviceSources.spotify_sdk")
      : p === "mac-app"
        ? t("deviceSources.spotify_connect_mac")
        : iosLike(p)
          ? t("deviceSources.spotify_connect_ios")
          : t("deviceSources.spotify_connect_other");
  const youtubeLine = i.youtube.ok
    ? t(iosLike(p) ? "deviceSources.youtube_ok_ios" : "deviceSources.youtube_ok", { n: i.youtubeMatched })
    : (i.youtube.reason ?? t("deviceSources.youtube_none"));
  const fileOk = !!i.folderName && i.folderMatched > 0;
  const fileLine = fileOk
    ? t("deviceSources.file_ok", { n: i.folderMatched, name: i.folderName ?? "" })
    : i.folderName
      ? t("deviceSources.file_none_matched", { name: i.folderName })
      : t("deviceSources.file_link");
  return [
    { kind: "file", ok: fileOk, line: fileLine },
    { kind: "spotify", ok: i.spotify.ok, line: spotifyLine },
    { kind: "youtube", ok: i.youtube.ok, line: youtubeLine },
    { kind: "preview", ok: true, line: t("deviceSources.preview") },
  ];
}

/**
 * The source that plays most of the night on this device when the DJ leaves it on Automatic: files first (sample
 * accurate), then Spotify's full tracks, then YouTube's videos, then 30 s clips.
 */
export function bestSource(list: DeviceSource[]): DeviceSourceKind {
  const order: DeviceSourceKind[] = ["file", "spotify", "youtube", "preview"];
  return order.find((k) => list.find((s) => s.kind === k)?.ok) ?? "preview";
}
