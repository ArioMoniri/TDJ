/**
 * Round 22 (ROADMAP §1): headphone pre-listen. The room plays through the booth's AudioContext (optionally routed
 * to a chosen device with `AudioContext.setSinkId`); a pre-listen plays through its own <audio> element sent to the
 * headphones with `HTMLMediaElement.setSinkId`, so the room never hears it. Browsers without `setSinkId` (Safari)
 * cannot pick a second output: pre-listen is then hidden during the night and the tooltip says why.
 */
export interface OutputDevice {
  id: string;
  label: string;
  groupId?: string;
}

/** Audio outputs from `enumerateDevices`, named; the system default first, its duplicate entry dropped. */
export function outputsFrom(devices: ReadonlyArray<MediaDeviceInfo>, keepDuplicates = false): OutputDevice[] {
  const outs = devices.filter((d) => d.kind === "audiooutput" && d.deviceId !== "communications");
  const def = outs.find((d) => d.deviceId === "default");
  const list: OutputDevice[] = [];
  outs.forEach((d, i) => {
    if (!keepDuplicates && def && d !== def && d.groupId && d.groupId === def.groupId) return;
    const name = d.label.replace(/^Default\s*-\s*/i, "").trim();
    list.push({
      id: d.deviceId || `output-${i}`,
      label:
        d.deviceId === "default"
          ? name
            ? `This device (${name})`
            : "This device"
          : name || `Output ${i + 1}`,
      groupId: d.groupId || undefined,
    });
  });
  if (!list.some((d) => d.id === "default")) list.unshift({ id: "default", label: "This device" });
  return list;
}

export const SINK_UNSUPPORTED =
  "This browser cannot send sound to a second output (Safari cannot). Use Chrome or Edge, or the T-DJ app, to pre-listen in headphones.";

/** Whether a pre-listen can go to the headphones without the room hearing it, and if not, why (in words). */
export function canPrelisten(o: {
  supported: boolean;
  roomId: string | null;
  cueId: string | null;
  devices?: ReadonlyArray<OutputDevice>;
}): { ok: true } | { ok: false; why: string } {
  if (!o.supported) return { ok: false, why: SINK_UNSUPPORTED };
  if (!o.cueId) return { ok: false, why: "Pick your headphones first (Headphones ▾ at the top)." };
  const room = o.roomId ?? "default";
  if (o.cueId === room)
    return { ok: false, why: "Headphones and room are the same output: pick another one." };
  const g = (id: string) => o.devices?.find((d) => d.id === id)?.groupId;
  if (g(room) && g(room) === g(o.cueId))
    return { ok: false, why: "Headphones and room are the same output: pick another one." };
  return { ok: true };
}

/** `HTMLMediaElement.setSinkId` (Chromium, Firefox 116+); Safari has none. */
export function sinkSupported(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}
/** `AudioContext.setSinkId` (Chromium 110+): the room can be sent to a chosen device. */
export function roomSinkSupported(): boolean {
  return typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;
}

/** The outputs this browser can see. Names need the microphone permission once in Chromium (`askNames`). */
export async function listOutputs(askNames = false): Promise<OutputDevice[]> {
  const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!md?.enumerateDevices) return [{ id: "default", label: "This device" }];
  if (askNames && md.getUserMedia) {
    try {
      const s = await md.getUserMedia({ audio: true });
      for (const t of s.getTracks()) t.stop();
    } catch {}
  }
  try {
    return outputsFrom(await md.enumerateDevices());
  } catch {
    return [{ id: "default", label: "This device" }];
  }
}

/** Send the room (the booth's AudioContext) to a device; false when the browser cannot. */
export async function routeRoom(ctx: AudioContext | null, id: string | null): Promise<boolean> {
  const c = ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
  if (!c?.setSinkId) return false;
  try {
    await c.setSinkId(id && id !== "default" ? id : "");
    return true;
  } catch {
    return false;
  }
}

/** The pre-listen player: one <audio> element on the headphones output (or this device before the night). */
export class CuePlayer {
  el: HTMLAudioElement | null = null;
  private url: string | null = null;
  onEnded: (() => void) | null = null;

  async play(src: string | Blob, o: { sinkId?: string | null; startSec?: number; volume?: number } = {}) {
    this.stop();
    const el = new Audio();
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    if (typeof src !== "string") this.url = url;
    el.src = url;
    el.volume = o.volume ?? 0.9;
    const sink = o.sinkId;
    const withSink = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (sink && sink !== "default") {
      if (!withSink.setSinkId) throw new Error(SINK_UNSUPPORTED);
      await withSink.setSinkId(sink);
    }
    if (o.startSec) el.currentTime = o.startSec;
    el.onended = () => {
      if (this.el === el) {
        this.stop();
        this.onEnded?.();
      }
    };
    this.el = el;
    await el.play();
  }
  stop() {
    if (this.el) {
      this.el.pause();
      this.el.src = "";
      this.el = null;
    }
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
  position(): number {
    return this.el?.currentTime ?? 0;
  }
  duration(): number {
    const d = this.el?.duration;
    return d && Number.isFinite(d) ? d : 0;
  }
  seek(sec: number) {
    if (this.el) this.el.currentTime = Math.max(0, sec);
  }
}
