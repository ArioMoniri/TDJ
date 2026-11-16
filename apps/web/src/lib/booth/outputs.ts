import { fmtNumber, t } from "@/lib/i18n";

/**
 * 2026-11 (the owner: "can be connected with jack or USB-C or Bluetooth, over a DJ controller / mixer or to a couple
 * of speakers… should be able to see those settings, the connection and chain, and set them"). The Booth's outputs as
 * one model, whatever told us about them:
 * - the browser: `enumerateDevices` gives a label (and nothing else): the kind is read from the name;
 * - the Mac app: CoreAudio's transport type (`kAudioDevicePropertyTransportType`), the built-in device's data source
 *   (internal speakers or the headphone jack), channels, sample rate and latency;
 * - the iPhone / iPad app: `AVAudioSession.currentRoute` (its `portType` and channels).
 * The chain line ("T-DJ → Pioneer DDJ-400 (USB, 4 ch) → ch 1–2 ROOM · ch 3–4 HEADPHONES") and its warnings are pure.
 */
export type OutputKind =
  | "built-in"
  | "headphones"
  | "line"
  | "usb"
  | "interface"
  | "bluetooth"
  | "airplay"
  | "hdmi"
  | "displayport"
  | "thunderbolt"
  | "multi"
  | "aggregate"
  | "virtual"
  | "unknown";

export interface OutputInfo {
  id: string;
  label: string;
  kind: OutputKind;
  /** output channels (the device's, or the browser context's for the room device) */
  channels?: number;
  sampleRate?: number;
  /** what the system reported (`reported`) or the kind's typical figure (`estimate`) */
  latencyMs?: number;
  latencyFrom?: "reported" | "estimate";
  isDefault?: boolean;
  groupId?: string;
  via: "browser" | "coreaudio" | "avaudiosession";
}

/** The kind from a device name (the browser knows nothing else). Order matters: AirPods are Bluetooth, not headphones. */
export function kindFromLabel(raw: string): OutputKind {
  const s = raw.replace(/^Default\s*-\s*/i, "").trim();
  if (/multi-?output/i.test(s)) return "multi";
  if (/aggregate/i.test(s)) return "aggregate";
  if (/blackhole|soundflower|loopback|virtual|zoomaudio|teams audio/i.test(s)) return "virtual";
  if (/airplay|apple tv|homepod/i.test(s)) return "airplay";
  if (
    /bluetooth|airpods|beats|\bbose\b|\bjbl\b|soundlink|marshall|buds|hands-?free|\bwh-|\bwf-|ue boom|\bbt\b/i.test(
      s,
    )
  )
    return "bluetooth";
  if (/hdmi/i.test(s)) return "hdmi";
  if (/displayport|display port|\(dp\)/i.test(s)) return "displayport";
  if (/thunderbolt/i.test(s)) return "thunderbolt";
  if (
    /usb|\bddj|pioneer|denon|\brane\b|traktor|kontrol|numark|reloop|hercules|focusrite|scarlett|motu|audient|behringer|uphoria|steinberg|presonus|roland|komplete|apogee|universal audio|\bid4\b|\bid14\b|\bssl\b|allen|xone|mixars|rodecaster/i.test(
      s,
    )
  )
    return "usb";
  if (/headphone|kopfh|kulakl|3\.5|jack|headset/i.test(s)) return "headphones";
  if (/line out|line-out|lineout/i.test(s)) return "line";
  if (/built-?in|internal|macbook|imac|speakers?\b|realtek|hoparl/i.test(s)) return "built-in";
  return "unknown";
}

/** macOS CoreAudio: `kAudioDevicePropertyTransportType` (a four-char code) and the built-in device's data source. */
export function kindFromTransport(
  fourcc: string | null | undefined,
  dataSource?: string | null,
  stacked?: boolean | null,
): OutputKind {
  switch (fourcc) {
    case "bltn":
      return dataSource === "hdpn" ? "headphones" : dataSource === "lout" ? "line" : "built-in";
    case "usb ":
      return "usb";
    case "blue":
    case "bleo":
      return "bluetooth";
    case "airp":
      return "airplay";
    case "hdmi":
      return "hdmi";
    case "dprt":
      return "displayport";
    case "thun":
      return "thunderbolt";
    case "grup":
      return stacked ? "multi" : "aggregate";
    case "virt":
      return "virtual";
    case "fwre":
    case "pci ":
    case "avb ":
      return "interface";
    default:
      return "unknown";
  }
}

/** iOS / iPadOS: `AVAudioSessionPortDescription.portType`. */
export function kindFromPortType(portType: string | null | undefined): OutputKind {
  switch (portType) {
    case "Speaker":
    case "Receiver":
      return "built-in";
    case "Headphones":
      return "headphones";
    case "LineOut":
      return "line";
    case "BluetoothA2DPOutput":
    case "BluetoothLE":
    case "BluetoothHFP":
      return "bluetooth";
    case "AirPlay":
      return "airplay";
    case "HDMI":
      return "hdmi";
    case "DisplayPort":
      return "displayport";
    case "USBAudio":
      return "usb";
    case "Thunderbolt":
      return "thunderbolt";
    case "AVB":
    case "PCI":
    case "Firewire":
      return "interface";
    default:
      return "unknown";
  }
}

/** Typical output latency (ms) of a kind when the system says nothing: Bluetooth's A2DP buffer, AirPlay's 2 s. */
export function estimatedLatencyMs(kind: OutputKind): number | undefined {
  switch (kind) {
    case "built-in":
    case "headphones":
    case "line":
    case "virtual":
      return 10;
    case "usb":
    case "interface":
    case "thunderbolt":
      return 12;
    case "aggregate":
    case "multi":
      return 25;
    case "hdmi":
    case "displayport":
      return 40;
    case "bluetooth":
      return 200;
    case "airplay":
      return 2000;
    default:
      return undefined;
  }
}

/** The latency to show and to compensate: the reported one, else the kind's estimate. */
export function latencyOf(
  o: Pick<OutputInfo, "kind" | "latencyMs">,
): { ms: number; from: "reported" | "estimate" } | null {
  if (o.latencyMs !== undefined && Number.isFinite(o.latencyMs) && o.latencyMs > 0)
    return { ms: Math.round(o.latencyMs), from: "reported" };
  const e = estimatedLatencyMs(o.kind);
  return e === undefined ? null : { ms: e, from: "estimate" };
}

/** A wireless output: its delay moves around and it can drop. */
export const isWireless = (k: OutputKind) => k === "bluetooth" || k === "airplay";

export function kindLabel(k: OutputKind): string {
  switch (k) {
    case "built-in":
      return t("booth.outputs.kind.built_in");
    case "headphones":
      return t("booth.outputs.kind.headphones");
    case "line":
      return t("booth.outputs.kind.line");
    case "usb":
      return t("booth.outputs.kind.usb");
    case "interface":
      return t("booth.outputs.kind.interface");
    case "bluetooth":
      return t("booth.outputs.kind.bluetooth");
    case "airplay":
      return t("booth.outputs.kind.airplay");
    case "hdmi":
      return t("booth.outputs.kind.hdmi");
    case "displayport":
      return t("booth.outputs.kind.displayport");
    case "thunderbolt":
      return t("booth.outputs.kind.thunderbolt");
    case "multi":
      return t("booth.outputs.kind.multi");
    case "aggregate":
      return t("booth.outputs.kind.aggregate");
    case "virtual":
      return t("booth.outputs.kind.virtual");
    default:
      return t("booth.outputs.kind.unknown");
  }
}

/** "USB / USB-C · 4 ch · 48 kHz · ~12 ms" — what is known, nothing invented. */
export function describeOutput(o: OutputInfo): string {
  const parts = [kindLabel(o.kind)];
  if (o.channels) parts.push(t("booth.outputs.channels", { n: o.channels }));
  if (o.sampleRate) parts.push(`${fmtNumber(o.sampleRate / 1000, { maximumFractionDigits: 1 })} kHz`);
  const l = latencyOf(o);
  if (l) parts.push(l.from === "estimate" ? `~${l.ms} ms` : `${l.ms} ms`);
  return parts.join(" · ");
}

/** Stereo pairs an output carries (1 for a plain stereo output). */
export const pairsOf = (channels: number | undefined) => Math.max(1, Math.floor((channels ?? 2) / 2));
/** "ch 1–2" for pair 0 */
export const pairLabel = (pair: number) => t("booth.outputs.pair", { a: pair * 2 + 1, b: pair * 2 + 2 });

/**
 * The DJ's routing on one device: the room on a channel pair, the headphones on another pair of the same device
 * (a DJ controller or a 4-channel interface), and a second room output (two speaker sets) with a delay trim each.
 */
export interface Routing {
  /** the room's channel pair on the room output (0 = ch 1–2) */
  roomPair: number;
  /** the headphones' pair on the room output (null: the headphones are a separate output, or none) */
  cuePair: number | null;
  /** a second output that also plays the room (null: none) */
  mirror: string | null;
  /** per output id: ms the output is held back so two outputs line up */
  trimMs: Record<string, number>;
}
export const DEFAULT_ROUTING: Routing = { roomPair: 0, cuePair: null, mirror: null, trimMs: {} };
export const TRIM_RANGE = { min: 0, max: 500, step: 5 } as const;

/** Keep a saved routing valid for the device in use (fewer channels than before, the mirror is the room…). */
export function normalizeRouting(
  r: Partial<Routing> | null | undefined,
  o: { channels?: number; roomId: string },
): Routing {
  const pairs = pairsOf(o.channels);
  const roomPair =
    Number.isInteger(r?.roomPair) && r!.roomPair! >= 0 && r!.roomPair! < pairs ? r!.roomPair! : 0;
  const cue = r?.cuePair;
  const cuePair =
    typeof cue === "number" && Number.isInteger(cue) && cue >= 0 && cue < pairs && cue !== roomPair
      ? cue
      : null;
  const mirror = r?.mirror && r.mirror !== o.roomId ? r.mirror : null;
  const trimMs: Record<string, number> = {};
  for (const [k, v] of Object.entries(r?.trimMs ?? {}))
    if (Number.isFinite(v)) trimMs[k] = Math.max(TRIM_RANGE.min, Math.min(TRIM_RANGE.max, Math.round(v)));
  return { roomPair, cuePair, mirror, trimMs };
}

export type ChainWarning =
  | "bt-room"
  | "airplay-room"
  | "bt-cue"
  | "same-device"
  | "one-pair"
  | "phone-speaker"
  | "multi-drift"
  | "mirror-wireless";

export interface Chain {
  /** e.g. "T-DJ → Pioneer DDJ-400 (USB / USB-C, 4 ch) → ch 1–2 ROOM · ch 3–4 HEADPHONES" */
  line: string;
  warnings: Array<{ id: ChainWarning; text: string }>;
}

const sameDevice = (a: OutputInfo | null, b: OutputInfo | null) =>
  !!a && !!b && (a.id === b.id || (!!a.groupId && a.groupId === b.groupId));

/**
 * The signal path in one line and what is wrong with it. `room` = the output the room plays on; `cue` = the
 * headphones output when it is a separate device; `routing` maps pairs on the room device; `mobile`: an iPhone / iPad
 * (its own speaker is no milonga's room); `connect`: a Spotify Connect device plays the room instead.
 */
export function chainOf(o: {
  room: OutputInfo | null;
  cue: OutputInfo | null;
  mirror?: OutputInfo | null;
  routing?: Routing;
  mobile?: boolean;
  connect?: string | null;
}): Chain {
  const r = o.routing ?? DEFAULT_ROUTING;
  const ROOM = t("booth.outputs.room");
  const HP = t("booth.outputs.headphones");
  const warnings: Chain["warnings"] = [];
  const w = (id: ChainWarning, text: string) => warnings.push({ id, text });
  const name = (x: OutputInfo) => {
    const bits = [kindLabel(x.kind)];
    if (x.channels && x.channels !== 2) bits.push(t("booth.outputs.channels", { n: x.channels }));
    const l = latencyOf(x);
    if (l && (isWireless(x.kind) || l.ms >= 40)) bits.push(`~${l.ms} ms`);
    return `${x.label} (${bits.join(", ")})`;
  };
  if (o.connect) return { line: `T-DJ → Spotify → ${o.connect} → ${ROOM}`, warnings };
  if (!o.room) return { line: `T-DJ → ${ROOM}`, warnings };
  const room = o.room;
  const mapped = r.cuePair !== null && pairsOf(room.channels) >= 2;
  let line = `T-DJ → ${name(room)}`;
  if (mapped) line += ` → ${pairLabel(r.roomPair)} ${ROOM} · ${pairLabel(r.cuePair!)} ${HP}`;
  else if (r.roomPair > 0) line += ` → ${pairLabel(r.roomPair)} ${ROOM}`;
  else line += ` → ${ROOM}`;
  if (o.cue && !mapped) line += sameDevice(room, o.cue) ? ` · ${HP} ✕` : ` · ${name(o.cue)} → ${HP}`;
  if (o.mirror) line += ` · ${name(o.mirror)} → ${ROOM} 2`;

  const rl = latencyOf(room)?.ms;
  if (room.kind === "bluetooth") w("bt-room", t("booth.outputs.warn.bt_room", { ms: rl ?? 200 }));
  if (room.kind === "airplay") w("airplay-room", t("booth.outputs.warn.airplay_room"));
  if (o.mobile && room.kind === "built-in") w("phone-speaker", t("booth.outputs.warn.phone_speaker"));
  if (room.kind === "multi") w("multi-drift", t("booth.outputs.warn.multi_drift"));
  if (o.cue && !mapped) {
    if (sameDevice(room, o.cue))
      w(
        pairsOf(room.channels) >= 2 ? "same-device" : "one-pair",
        pairsOf(room.channels) >= 2
          ? t("booth.outputs.warn.same_device_map")
          : t("booth.outputs.warn.one_pair"),
      );
    else if (isWireless(o.cue.kind))
      w("bt-cue", t("booth.outputs.warn.bt_cue", { ms: latencyOf(o.cue)?.ms ?? 200 }));
  }
  if (o.mirror && (isWireless(o.mirror.kind) || isWireless(room.kind)))
    w("mirror-wireless", t("booth.outputs.warn.mirror_wireless"));
  return { line, warnings };
}

/**
 * The room's output latency (s) the playhead allows for: the context's own figure when it reports one (Chromium,
 * Firefox), else the device's reported latency, else the kind's estimate (Safari reports none; Bluetooth ~200 ms).
 */
export function roomLatencySec(room: OutputInfo | null, reportedSec = 0): number {
  const l = room ? latencyOf(room) : null;
  if (!l) return reportedSec;
  if (l.from === "reported") return Math.max(reportedSec, l.ms / 1000);
  // (a wireless output reported far under its own buffer: the context did not count it)
  const counted = reportedSec >= 0.02 && !(room && isWireless(room.kind) && reportedSec < l.ms / 2000);
  return counted ? reportedSec : Math.max(reportedSec, l.ms / 1000);
}

/** One output as the native app reports it (src-tauri/src/audio.rs `AudioOutput`, camelCase). */
export interface NativeOutput {
  id: string;
  name: string;
  /** macOS: CoreAudio transport type four-char code ("usb ", "blue", "bltn"…) */
  transport?: string | null;
  /** macOS built-in device: its data source ("ispk" internal speakers, "hdpn" headphones) */
  dataSource?: string | null;
  /** macOS aggregate: a Multi-Output Device (`kAudioAggregateDevicePropertyIsStacked`) */
  stacked?: boolean | null;
  /** iOS: AVAudioSession port type ("Speaker", "Headphones", "BluetoothA2DPOutput", "USBAudio"…) */
  portType?: string | null;
  channels?: number | null;
  sampleRate?: number | null;
  latencyMs?: number | null;
  isDefault: boolean;
}

export function fromNative(list: ReadonlyArray<NativeOutput>, platform: string): OutputInfo[] {
  const ios = platform === "ipados" || platform === "ios";
  return list.map((d) => {
    const k = ios ? kindFromPortType(d.portType) : kindFromTransport(d.transport, d.dataSource, d.stacked);
    const kind = k === "unknown" ? kindFromLabel(d.name) : k;
    const latencyMs = d.latencyMs && d.latencyMs > 0 ? d.latencyMs : undefined;
    return {
      id: d.id,
      label: d.name || kindLabel(kind),
      kind,
      channels: d.channels ?? undefined,
      sampleRate: d.sampleRate ?? undefined,
      latencyMs,
      latencyFrom: latencyMs ? "reported" : "estimate",
      isDefault: d.isDefault,
      via: ios ? "avaudiosession" : "coreaudio",
    } satisfies OutputInfo;
  });
}

/** The browser's outputs (lib/booth/cue.ts `OutputDevice`), each kind read from its name. */
export function fromBrowser(
  list: ReadonlyArray<{ id: string; label: string; groupId?: string }>,
  room?: { id: string; channels?: number; sampleRate?: number; latencySec?: number },
): OutputInfo[] {
  return list.map((d) => {
    const kind = kindFromLabel(d.label);
    const here = !!room && room.id === d.id;
    const ctxMs = here && room.latencySec && room.latencySec > 0 ? room.latencySec * 1000 : undefined;
    // a context that reports far less than a wireless output's own buffer did not count it: the estimate stands
    const est = estimatedLatencyMs(kind);
    const latencyMs = ctxMs && (!isWireless(kind) || !est || ctxMs >= est / 2) ? ctxMs : undefined;
    return {
      id: d.id,
      label: d.label,
      kind,
      groupId: d.groupId,
      isDefault: d.id === "default",
      channels: here ? room.channels : undefined,
      sampleRate: here ? room.sampleRate : undefined,
      latencyMs,
      latencyFrom: latencyMs ? "reported" : "estimate",
      via: "browser",
    } satisfies OutputInfo;
  });
}
