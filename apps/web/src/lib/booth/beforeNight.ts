import { t } from "@/lib/i18n";
import type { OutputKind } from "./outputs";

/**
 * 2026-11 (Settings → Booth): "Before the night" — what the app can check, and what only the DJ can set (no app may
 * turn on Focus / Do Not Disturb or lift a volume limit: the list says where).
 */
export type Platform = "mac" | "ios" | "android" | "windows" | "linux" | "other";
export type CheckStatus = "ok" | "warn" | "info";
export interface Check {
  id: "focus" | "power" | "screen" | "volume" | "bluetooth" | "alerts";
  status: CheckStatus;
  text: string;
  /** how to, where the app cannot do it */
  help?: { label: string; href: string };
}

export function platformOf(ua: string, touchPoints = 0, native?: string): Platform {
  if (native === "macos") return "mac";
  if (native === "ipados" || native === "ios") return "ios";
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  if (/Windows/.test(ua)) return "windows";
  if (/Linux/.test(ua)) return "linux";
  return "other";
}

const FOCUS_HELP: Partial<Record<Platform, string>> = {
  mac: "https://support.apple.com/guide/mac-help/turn-a-focus-on-or-off-mchl999b7c1a/mac",
  ios: "https://support.apple.com/guide/iphone/turn-a-focus-on-or-off-iph5c3f5b77b/ios",
  android: "https://support.google.com/android/answer/9069335",
  windows:
    "https://support.microsoft.com/windows/turn-do-not-disturb-on-or-off-in-windows-6e6d9b52-d5e1-4ba7-a4a7-6f2d2f4bb1a1",
};

export function beforeTheNight(o: {
  platform: Platform;
  /** navigator.getBattery() where it exists (Chromium); null = unknown */
  battery: { charging: boolean; level: number } | null;
  /** the Screen Wake Lock API, or the native app (it keeps the screen on itself) */
  wakeLock: boolean;
  roomKind: OutputKind | null;
  /** the native app (it holds App Nap / the idle timer off itself) */
  native: boolean;
}): Check[] {
  const p = o.platform;
  const focusHref = FOCUS_HELP[p];
  const list: Check[] = [
    {
      id: "focus",
      status: "info",
      text:
        p === "ios"
          ? t("booth.before.focus_ios")
          : p === "mac"
            ? t("booth.before.focus_mac")
            : t("booth.before.focus_other"),
      ...(focusHref ? { help: { label: t("booth.before.how"), href: focusHref } } : {}),
    },
  ];
  if (o.battery)
    list.push(
      o.battery.charging
        ? { id: "power", status: "ok", text: t("booth.before.power_ok") }
        : {
            id: "power",
            status: "warn",
            text: t("booth.before.power_battery", { pct: Math.round(o.battery.level * 100) }),
          },
    );
  else
    list.push({
      id: "power",
      status: "info",
      text: p === "ios" ? t("booth.before.power_ios") : t("booth.before.power_unknown"),
    });
  list.push(
    o.wakeLock || o.native
      ? {
          id: "screen",
          status: "ok",
          text: o.native && p === "mac" ? t("booth.before.screen_mac_app") : t("booth.before.screen_ok"),
        }
      : {
          id: "screen",
          status: "warn",
          text: p === "ios" ? t("booth.before.screen_ios") : t("booth.before.screen_no"),
        },
  );
  list.push({
    id: "volume",
    status: "info",
    text:
      p === "ios"
        ? t("booth.before.volume_ios")
        : p === "mac"
          ? t("booth.before.volume_mac")
          : t("booth.before.volume_other"),
  });
  if (o.roomKind === "bluetooth" || o.roomKind === "airplay")
    list.push({
      id: "bluetooth",
      status: "warn",
      text: o.roomKind === "airplay" ? t("booth.before.airplay") : t("booth.before.bluetooth"),
    });
  else if (o.roomKind) list.push({ id: "bluetooth", status: "ok", text: t("booth.before.wired") });
  list.push({
    id: "alerts",
    status: "info",
    text:
      p === "ios"
        ? t("booth.before.alerts_ios")
        : p === "mac"
          ? t("booth.before.alerts_mac")
          : t("booth.before.alerts_web"),
  });
  return list;
}
