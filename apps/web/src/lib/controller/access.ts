"use client";
import { hasNative, invoke } from "@/lib/app/native";
import { manufacturerOf } from "./mappings";

/**
 * 2026-11 (docs/design/controller.md): where MIDI comes from.
 * - **Web MIDI** (Chrome, Edge, Opera; Firefox behind its add-on prompt): `navigator.requestMIDIAccess()` without
 *   SysEx (Chrome ≥ 124 asks the DJ every time a site requests it; the answer is remembered per site).
 * - **T-DJ for Mac / iPad / iPhone**: WebKit has no Web MIDI, so the app's CoreMIDI (src-tauri/src/midi.rs, the
 *   `midir` crate) lists the ports, opens them and hands each message batch to the page as a `tdj:midi` event.
 * Both give one `MidiHub`: ports (name, manufacturer, in / out), messages, sending (LEDs) and hot-plug.
 */
export interface PortInfo {
  id: string;
  name: string;
  manufacturer: string | null;
  dir: "in" | "out";
  via: "web" | "native";
}

export interface MidiHub {
  via: "web" | "native";
  ports(): PortInfo[];
  onPorts(cb: () => void): () => void;
  onMessage(cb: (port: PortInfo, data: number[]) => void): () => void;
  send(portId: string, data: number[]): void;
  close(): void;
}

export type Support = "web" | "native" | "none";
/** What this page can use, and why not (Safari and every iOS browser: WebKit has no Web MIDI) */
export function midiSupport(): Support {
  if (typeof window === "undefined") return "none";
  if (hasNative()) return "native";
  return typeof (navigator as Navigator & { requestMIDIAccess?: unknown }).requestMIDIAccess === "function"
    ? "web"
    : "none";
}

export type OpenResult = { hub: MidiHub } | { why: "unsupported" | "denied" | "error" };

export async function openHub(): Promise<OpenResult> {
  const s = midiSupport();
  if (s === "native") return openNative();
  if (s === "web") return openWeb();
  return { why: "unsupported" };
}

/* ---- Web MIDI ---- */

interface WebPort {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  state?: string;
  type?: string;
  onmidimessage?: ((e: { data: Uint8Array }) => void) | null;
  send?: (data: number[]) => void;
}
interface WebAccess {
  inputs: Map<string, WebPort> | { forEach(cb: (p: WebPort) => void): void };
  outputs: Map<string, WebPort> | { forEach(cb: (p: WebPort) => void): void };
  onstatechange?: (() => void) | null;
  addEventListener?: (t: string, cb: () => void) => void;
}

async function openWeb(): Promise<OpenResult> {
  let access: WebAccess;
  try {
    access = (await (
      navigator as unknown as { requestMIDIAccess(o?: { sysex?: boolean }): Promise<WebAccess> }
    ).requestMIDIAccess({ sysex: false })) as WebAccess;
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    return { why: name === "SecurityError" || name === "NotAllowedError" ? "denied" : "error" };
  }
  const portCbs = new Set<() => void>();
  const msgCbs = new Set<(p: PortInfo, d: number[]) => void>();
  const info = (p: WebPort, dir: "in" | "out"): PortInfo => ({
    id: p.id,
    name: p.name?.trim() || p.id,
    manufacturer: manufacturerOf(p.name ?? "", p.manufacturer),
    dir,
    via: "web",
  });
  const wire = () => {
    access.inputs.forEach((p) => {
      if (p.state === "disconnected") return;
      const pi = info(p, "in");
      p.onmidimessage = (e) => {
        const d = Array.from(e.data);
        for (const cb of msgCbs) cb(pi, d);
      };
    });
  };
  wire();
  const changed = () => {
    wire();
    for (const cb of portCbs) cb();
  };
  if (access.addEventListener) access.addEventListener("statechange", changed);
  else access.onstatechange = changed;
  return {
    hub: {
      via: "web",
      ports: () => {
        const out: PortInfo[] = [];
        access.inputs.forEach((p) => p.state !== "disconnected" && out.push(info(p, "in")));
        access.outputs.forEach((p) => p.state !== "disconnected" && out.push(info(p, "out")));
        return out;
      },
      onPorts: (cb) => {
        portCbs.add(cb);
        return () => portCbs.delete(cb);
      },
      onMessage: (cb) => {
        msgCbs.add(cb);
        return () => msgCbs.delete(cb);
      },
      send: (id, data) => {
        access.outputs.forEach((p) => {
          if (p.id === id)
            try {
              p.send?.(data);
            } catch {}
        });
      },
      close: () => {
        access.inputs.forEach((p) => {
          p.onmidimessage = null;
        });
        access.onstatechange = null;
        portCbs.clear();
        msgCbs.clear();
      },
    },
  };
}

/* ---- the native app (CoreMIDI through src-tauri/src/midi.rs) ---- */

/** src-tauri/src/midi.rs `MidiPort` */
interface NativePort {
  id: string;
  name: string;
  dir: "in" | "out";
}
/** the page event: `{ type: "ports" }` or `{ type: "messages", items: [{ port, data }] }` */
export const NATIVE_MIDI_EVENT = "tdj:midi";
type NativeDetail = { type: "ports" } | { type: "messages"; items: Array<{ port: string; data: number[] }> };

async function openNative(): Promise<OpenResult> {
  let ports: NativePort[] = [];
  const refresh = async () => {
    try {
      ports = await invoke<NativePort[]>("midi_ports");
    } catch {
      ports = [];
    }
    for (const p of ports) if (p.dir === "in") void invoke("midi_open", { id: p.id }).catch(() => {});
  };
  try {
    await refresh();
  } catch {
    return { why: "error" };
  }
  const portCbs = new Set<() => void>();
  const msgCbs = new Set<(p: PortInfo, d: number[]) => void>();
  const info = (p: NativePort): PortInfo => ({
    id: p.id,
    name: p.name,
    manufacturer: manufacturerOf(p.name),
    dir: p.dir,
    via: "native",
  });
  const on = (e: Event) => {
    const d = (e as CustomEvent<NativeDetail>).detail;
    if (!d) return;
    if (d.type === "ports")
      void refresh().then(() => {
        for (const cb of portCbs) cb();
      });
    else if (d.type === "messages")
      for (const m of d.items ?? []) {
        const p = ports.find((x) => x.id === m.port && x.dir === "in");
        if (!p || !Array.isArray(m.data)) continue;
        const pi = info(p);
        for (const cb of msgCbs) cb(pi, m.data);
      }
  };
  window.addEventListener(NATIVE_MIDI_EVENT, on);
  return {
    hub: {
      via: "native",
      ports: () => ports.map(info),
      onPorts: (cb) => {
        portCbs.add(cb);
        return () => portCbs.delete(cb);
      },
      onMessage: (cb) => {
        msgCbs.add(cb);
        return () => msgCbs.delete(cb);
      },
      send: (id, data) => void invoke("midi_send", { id, data }).catch(() => {}),
      close: () => {
        window.removeEventListener(NATIVE_MIDI_EVENT, on);
        for (const p of ports) if (p.dir === "in") void invoke("midi_close", { id: p.id }).catch(() => {});
        portCbs.clear();
        msgCbs.clear();
      },
    },
  };
}

/** The output port of the same device as an input (LEDs): the same name, else the same name without "in/out" */
export function outputFor(input: PortInfo, ports: PortInfo[]): PortInfo | null {
  const outs = ports.filter((p) => p.dir === "out");
  const bare = (s: string) =>
    s
      .replace(/\b(in|out|input|output)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  return (
    outs.find((o) => o.name === input.name) ?? outs.find((o) => bare(o.name) === bare(input.name)) ?? null
  );
}
