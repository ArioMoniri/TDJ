import { t } from "@/lib/i18n";

/**
 * 2026-11 (the owner: "notifications and plug-outs and opening other apps and notification sounds should not disrupt
 * playing, also on Macs or iPad or phone"). What the Booth does when something outside it touches the sound — one
 * pure decision per event, whatever reported it:
 * - the iPhone / iPad app: `AVAudioSession` interruption began / ended (a call, Siri, an alarm) and route changes
 *   (`oldDeviceUnavailable`: the cable, the interface or the Bluetooth speaker went away);
 * - the Mac app: CoreAudio's device list / default output changed (src-tauri/src/audio.rs);
 * - every browser: the AudioContext's `statechange` (`suspended`, iOS Safari's `interrupted`), `devicechange`;
 * - Spotify: the device stopped mid-song while the night says it plays (the Spotify app was interrupted).
 *
 * The rule of the floor: never keep playing silently into the wrong speaker (a phone's own speaker in a milonga),
 * never drift (the gap and the next song keep their times), and always say where the night was with one tap to go on.
 */
export type OutputLossPolicy = "pause" | "continue";
export const DEFAULT_OUTPUT_LOSS: OutputLossPolicy = "pause";

/** AVAudioSession.RouteChangeReason (raw values) */
export const ROUTE_REASON = {
  unknown: 0,
  newDeviceAvailable: 1,
  oldDeviceUnavailable: 2,
  categoryChange: 3,
  override: 4,
  wakeFromSleep: 6,
  noSuitableRouteForCategory: 7,
  routeConfigurationChange: 8,
} as const;

export type AudioEvent =
  /** iOS / iPadOS app: AVAudioSession.interruptionNotification */
  | { type: "interruption"; phase: "began" }
  | { type: "interruption"; phase: "ended"; shouldResume: boolean }
  /** iOS app: a route change (raw reason), with the outputs that went away */
  | { type: "route"; reason: number; previous?: readonly string[] }
  /** the room's output went away (web `devicechange`, Mac CoreAudio), named */
  | { type: "output-lost"; name?: string; now?: string }
  /** an output appeared or the system switched outputs (nothing lost) */
  | { type: "output-changed"; now?: string }
  /** the AudioContext's state (web) */
  | { type: "context"; state: string }
  /** the media services restarted (iOS): the session is set up again */
  | { type: "reset" }
  /** Spotify stopped mid-song on the night's device */
  | { type: "spotify-paused"; device?: string };

export interface NightNow {
  /** the night runs and a song or cortina sounds (or is about to) */
  live: boolean;
  /** the Booth itself is holding for an interruption (it paused, and remembers why) */
  heldFor: "interruption" | "output" | "spotify" | null;
}

export type Reaction =
  | { do: "nothing" }
  /** pause now (0 s fade: the sound is already gone or going to the wrong place) and show the banner */
  | { do: "hold"; why: "interruption" | "output" | "spotify"; banner: BannerKind }
  /** play on from where the night was (the system said so) */
  | { do: "resume" }
  /** keep the state, show the one-tap banner */
  | { do: "offer"; banner: BannerKind }
  /** say what happened; nothing to do */
  | { do: "note"; banner: BannerKind }
  /** the reason for a banner is gone */
  | { do: "clear" };

export type BannerKind =
  | "interrupted"
  | "output-lost"
  | "output-moved"
  | "output-new"
  | "spotify"
  | "context";

export function react(
  e: AudioEvent,
  night: NightNow,
  policy: OutputLossPolicy = DEFAULT_OUTPUT_LOSS,
): Reaction {
  switch (e.type) {
    case "interruption":
      if (e.phase === "began")
        return night.live ? { do: "hold", why: "interruption", banner: "interrupted" } : { do: "nothing" };
      // (the DJ already played on, or the Booth never held: the system never starts the night by itself)
      if (night.heldFor !== "interruption" || night.live) return { do: "nothing" };
      return e.shouldResume ? { do: "resume" } : { do: "offer", banner: "interrupted" };
    case "route":
      if (e.reason === ROUTE_REASON.oldDeviceUnavailable)
        return react({ type: "output-lost", name: e.previous?.[0] }, night, policy);
      if (e.reason === ROUTE_REASON.newDeviceAvailable)
        return night.live ? { do: "note", banner: "output-new" } : { do: "nothing" };
      return { do: "nothing" };
    case "output-lost":
      if (!night.live) return { do: "nothing" };
      return policy === "pause"
        ? { do: "hold", why: "output", banner: "output-lost" }
        : { do: "note", banner: "output-moved" };
    case "output-changed":
      return night.live ? { do: "note", banner: "output-new" } : { do: "nothing" };
    case "context":
      if (e.state === "running") return { do: "clear" };
      if (e.state === "suspended" || e.state === "interrupted")
        return night.live ? { do: "offer", banner: "context" } : { do: "nothing" };
      return { do: "nothing" };
    case "reset":
      return night.live ? { do: "offer", banner: "interrupted" } : { do: "nothing" };
    case "spotify-paused":
      return night.live ? { do: "hold", why: "spotify", banner: "spotify" } : { do: "nothing" };
  }
}

/** "Milonga de mis amores · 2:14" — where the night was, for the banner's one-tap resume */
export function whereText(title: string | null | undefined, sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const at = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return title ? `${title} · ${at}` : at;
}

export function bannerText(
  kind: BannerKind,
  o: { where?: string; name?: string; now?: string; device?: string } = {},
): string {
  const where = o.where ?? "";
  switch (kind) {
    case "interrupted":
      return t("booth.guard.interrupted", { where });
    case "context":
      return t("booth.guard.context", { where });
    case "output-lost":
      return o.name
        ? t("booth.guard.output_lost_named", { name: o.name, where })
        : t("booth.guard.output_lost", { where });
    case "output-moved":
      return t("booth.guard.output_moved", { now: o.now ?? t("booth.guard.the_next_output") });
    case "output-new":
      return o.now ? t("booth.guard.output_new_named", { now: o.now }) : t("booth.guard.output_new");
    case "spotify":
      return t("booth.guard.spotify", { device: o.device ?? "Spotify", where });
  }
}

/**
 * Did the room's output go away? `before` / `after` are the output lists around a `devicechange` (or a CoreAudio
 * device-list change); `room` is the id the room plays on ("default" follows the system). With "default", the device
 * behind it (`defaultBefore`, its group or name) must still be there — else the system moved the night elsewhere.
 */
export function outputLost(o: {
  before: ReadonlyArray<{ id: string; label: string; groupId?: string }>;
  after: ReadonlyArray<{ id: string; label: string; groupId?: string }>;
  room: string;
}): { lost: boolean; name?: string; now?: string; changed: boolean } {
  const { before, after, room } = o;
  const strip = (l: string) =>
    l
      .replace(/^Default\s*-\s*/i, "")
      .replace(/^This device \((.*)\)$/, "$1")
      .trim();
  const def = (list: typeof before) => list.find((d) => d.id === "default");
  const nowName = def(after) ? strip(def(after)!.label) : undefined;
  if (room !== "default") {
    const was = before.find((d) => d.id === room);
    const lost = !!was && !after.some((d) => d.id === room);
    return { lost, name: was ? strip(was.label) : undefined, now: nowName, changed: lost };
  }
  const b = def(before);
  const a = def(after);
  if (!b || !a) return { lost: false, changed: false };
  const sameBehind =
    (b.groupId && a.groupId ? b.groupId === a.groupId : true) && strip(b.label) === strip(a.label);
  if (sameBehind) return { lost: false, changed: false };
  // the device that was the default: still listed (the DJ switched in System Settings) or gone (unplugged)
  const isOld = (d: { id: string; label: string; groupId?: string }) =>
    d.id !== "default" && (b.groupId ? d.groupId === b.groupId : strip(d.label) === strip(b.label));
  const stillThere = after.some(isOld);
  const named = strip(b.label);
  const name = named && named !== strip(a.label) ? named : undefined;
  return { lost: !stillThere, name, now: nowName, changed: true };
}
