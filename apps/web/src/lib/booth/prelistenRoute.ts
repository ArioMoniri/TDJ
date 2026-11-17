import { CUE_ON_ROOM, canPrelisten, type OutputDevice } from "./cue";
import { kindFromLabel } from "./outputs";

/**
 * 2026-11 (the owner: "can't play these songs even when there is another device connected") — where a tap on any
 * song row goes while the Booth plays a night to the room. Pure, so the mini players, the rows, the song menu and
 * these rules' tests read the same answer:
 *
 * - no night running → the app's own player (`player`);
 * - a separate headphones output (or the controller's headphones pair) → there at once (`headphones`);
 * - the DJ already chose "this device's speaker anyway" this session, and that speaker is not the room → there
 *   (`speaker`);
 * - otherwise → ask (`ask`): why not, whether an output can be picked here, and the device speaker that is safe to
 *   use (null when this device's speaker is the room's own output, or the browser cannot pick an output at all).
 *
 * Never the room: no answer ever names the room's output, and nothing here pauses, ducks or fades the night.
 */
export type PrelistenWhy = "none" | "same" | "unsupported" | "pair-closed";
export type PrelistenRoute =
  | { kind: "player" }
  | { kind: "headphones"; sink: string }
  | { kind: "speaker"; sink: string; label: string }
  | { kind: "ask"; why: PrelistenWhy; canPick: boolean; speaker: OutputDevice | null };

export interface PrelistenOutputs {
  devices: ReadonlyArray<OutputDevice>;
  room: string | null;
  cue: string | null;
  /** `HTMLMediaElement.setSinkId` (no Safari) */
  cueSupported: boolean;
}

const groupOf = (devices: ReadonlyArray<OutputDevice>, id: string) =>
  devices.find((d) => d.id === id)?.groupId;

/**
 * This device's own speaker, when it is safely not the room: a built-in output, a different device from the room's
 * (its own id, and a known, different hardware group), on a browser that can send a pre-listen to a chosen output.
 * The system default counts only when both groups are known and differ (the default may *be* the room's interface).
 */
export function speakerFor(o: PrelistenOutputs): OutputDevice | null {
  if (!o.cueSupported) return null;
  const room = o.room ?? "default";
  const roomGroup = groupOf(o.devices, room);
  const safe = (d: OutputDevice) => {
    if (d.id === room || d.id === CUE_ON_ROOM) return false;
    if (room === "default" || d.id === "default") {
      // one side is "whatever the system plays to": only distinct, known hardware groups are proof
      if (!roomGroup || !d.groupId) return false;
    }
    return !(roomGroup && d.groupId && d.groupId === roomGroup);
  };
  return o.devices.find((d) => kindFromLabel(d.label) === "built-in" && safe(d)) ?? null;
}

/**
 * the outputs a DJ may pick for the headphones: every one but the room's (and its other names), and never this
 * device's built-in speakers (nor the system default when it is them): those are offered once, as "Play on this
 * device's speaker anyway" (`speakerFor`), not as headphones
 */
export function headphoneChoices(o: PrelistenOutputs): OutputDevice[] {
  const room = o.room ?? "default";
  const roomGroup = groupOf(o.devices, room);
  const builtInGroups = new Set(
    o.devices
      .filter((d) => kindFromLabel(d.label) === "built-in")
      .map((d) => d.groupId)
      .filter((g): g is string => !!g),
  );
  return o.devices.filter(
    (d) =>
      d.id !== room &&
      !(roomGroup && d.groupId && d.groupId === roomGroup) &&
      kindFromLabel(d.label) !== "built-in" &&
      !(d.groupId && builtInGroups.has(d.groupId)),
  );
}

export function prelistenRoute(b: {
  started: boolean;
  outputs: PrelistenOutputs;
  /** the room device's headphones pair is open (lib/booth/cue.ts cueRouted) */
  pairOpen?: boolean;
  /** iPhone / iPad: one output for a web page whatever the browser says */
  apple?: boolean;
  /** the DJ chose "Play on this device's speaker anyway" this session */
  speakerOk?: boolean;
}): PrelistenRoute {
  if (!b.started) return { kind: "player" };
  const o = b.outputs;
  if (o.cue === CUE_ON_ROOM)
    return b.pairOpen
      ? { kind: "headphones", sink: CUE_ON_ROOM }
      : { kind: "ask", why: "pair-closed", canPick: !b.apple && o.cueSupported, speaker: speakerFor(o) };
  if (b.apple || !o.cueSupported) return { kind: "ask", why: "unsupported", canPick: false, speaker: null };
  const v = canPrelisten({ supported: o.cueSupported, roomId: o.room, cueId: o.cue, devices: o.devices });
  if (v.ok && o.cue) return { kind: "headphones", sink: o.cue };
  const speaker = speakerFor(o);
  if (b.speakerOk && speaker) return { kind: "speaker", sink: speaker.id, label: speaker.label };
  return { kind: "ask", why: o.cue ? "same" : "none", canPick: true, speaker };
}
