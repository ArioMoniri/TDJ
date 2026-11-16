"use client";
import { create } from "zustand";
import { t } from "@/lib/i18n";
import {
  type AudioEvent,
  bannerText,
  DEFAULT_OUTPUT_LOSS,
  type NightNow,
  type OutputLossPolicy,
  outputLost,
  react,
  whereText,
} from "./continuity";
import { type OutputDevice, setCueRoute } from "./cue";
import { type NativeRoute, nativeRoute, nightRunning, onNativeAudio } from "./nativeAudio";
import {
  DEFAULT_ROUTING,
  fromBrowser,
  fromNative,
  normalizeRouting,
  type OutputInfo,
  type Routing,
  roomLatencySec,
} from "./outputs";
import { alignDelays, type RCtx, RoomRouter, type RouteResult } from "./routing";

/**
 * 2026-11 (the owner: "notifications and plug-outs and opening other apps … should not disrupt playing"; "see those
 * settings, the connection and chain, and set them"). The Booth's guard: it listens to everything that can take the
 * sound away (lib/booth/continuity.ts decides), and owns the room's routing after the engine (lib/booth/routing.ts).
 * The booth store arms it with plain callbacks (no import cycle).
 */
export interface GuardDeps {
  ctx: () => AudioContext | null;
  /** the engine's output switch and latency allowance (null before the first start) */
  engine: () => {
    setOutput(n: unknown | null): void;
    outputLatencySec: number;
    pause(fadeSec?: number): void;
  } | null;
  night: () => {
    started: boolean;
    live: boolean;
    title: string | null;
    position: number;
    room: string;
    cue: string | null;
    devices: OutputDevice[];
  };
  resume: () => Promise<void>;
  banner: (b: { key: string; text: string; action?: { label: string; run: () => void } }) => void;
  dismiss: (key: string) => void;
  policy: () => OutputLossPolicy;
  refreshOutputs: () => Promise<void>;
  setCue: (id: string | null) => void;
}

export interface AudioView {
  /** the native app's outputs (CoreAudio / AVAudioSession), null in a browser */
  native: NativeRoute | null;
  /** the room context's own figures (web): channels it can open, its rate, its reported output latency */
  roomCtx: { id: string; maxChannels: number; sampleRate: number; latencySec: number } | null;
  routing: Routing;
  result: RouteResult | null;
  /** Chromium: a second AudioContext can be sent to another device (two speaker sets) */
  mirrorSupported: boolean;
  /** the Booth paused the night itself and why (an interruption, the output gone, Spotify stopped) */
  heldFor: NightNow["heldFor"];
  setRouting: (p: Partial<Routing>) => Promise<void>;
  /** the native outputs, else the room device's figures (`roomId`: the browser device the room plays on) */
  refresh: (roomId?: string) => Promise<void>;
}

const ROUTING_KEY = "tdj-booth-routing";
function loadRouting(): Partial<Routing> {
  try {
    return JSON.parse(localStorage.getItem(ROUTING_KEY) ?? "{}") as Partial<Routing>;
  } catch {
    return {};
  }
}
function saveRouting(r: Routing) {
  try {
    localStorage.setItem(ROUTING_KEY, JSON.stringify(r));
  } catch {}
}
const mirrorSupported = () => typeof AudioContext !== "undefined" && "setSinkId" in AudioContext.prototype;

let deps: GuardDeps | null = null;
let router: RoomRouter | null = null;
let routerCtx: AudioContext | null = null;
let unsubs: Array<() => void> = [];
let ctxHooked: AudioContext | null = null;
let lastDevices: OutputDevice[] = [];
let contextTimer: ReturnType<typeof setTimeout> | null = null;
let routingLoaded = false;

export const useAudio = create<AudioView>((set, get) => ({
  native: null,
  roomCtx: null,
  // (the saved routing is read after mount — `refresh` — so the server render and the first client render agree)
  routing: { ...DEFAULT_ROUTING },
  result: null,
  mirrorSupported: false,
  heldFor: null,
  setRouting: async (p) => {
    const n = deps?.night();
    const room = currentRoom();
    const channels =
      room?.channels ?? get().roomCtx?.maxChannels ?? get().native?.maxOutputChannels ?? undefined;
    const next = normalizeRouting({ ...get().routing, ...p }, { channels, roomId: n?.room ?? "default" });
    set({ routing: next });
    saveRouting(next);
    await applyRouting();
  },
  refresh: async (roomId) => {
    if (!routingLoaded) {
      routingLoaded = true;
      set({ routing: { ...DEFAULT_ROUTING, ...loadRoutingSafe() } });
    }
    const native = await nativeRoute();
    set({ native, mirrorSupported: mirrorSupported() });
    if (deps?.ctx()) readCtx();
    else if (!native) await probe(roomId ?? "default");
  },
}));

/**
 * Before the night (no booth context yet, Settings): open a silent context on the room device for a moment to read
 * the channels it offers (a controller's 4), its rate and its latency; closed at once. Nothing plays.
 */
async function probe(roomId: string) {
  if (typeof AudioContext === "undefined") return;
  let c: (AudioContext & { setSinkId?: (id: string) => Promise<void>; outputLatency?: number }) | null = null;
  try {
    c = new AudioContext({ latencyHint: "playback" });
    if (roomId !== "default" && c.setSinkId) await c.setSinkId(roomId).catch(() => {});
    useAudio.setState({
      roomCtx: {
        id: roomId,
        maxChannels: c.destination?.maxChannelCount ?? 2,
        sampleRate: c.sampleRate,
        latencySec: (c.baseLatency ?? 0) + (c.outputLatency ?? 0),
      },
    });
  } catch {
  } finally {
    void c?.close().catch(() => {});
  }
}

function loadRoutingSafe(): Partial<Routing> {
  return typeof localStorage === "undefined" ? {} : loadRouting();
}

/** The room's context figures (what the web knows of the output it plays on). */
function readCtx() {
  const c = deps?.ctx() as (AudioContext & { outputLatency?: number }) | null | undefined;
  if (!c) return;
  useAudio.setState({
    roomCtx: {
      id: deps?.night().room ?? "default",
      maxChannels: c.destination?.maxChannelCount ?? 2,
      sampleRate: c.sampleRate,
      latencySec: (c.baseLatency ?? 0) + (c.outputLatency ?? 0),
    },
  });
}

/** Every output as one model: the native list in the apps, else the browser's (its room device filled in). */
export function outputsModel(
  a: Pick<AudioView, "native" | "roomCtx">,
  b: { devices: OutputDevice[]; room: string },
): OutputInfo[] {
  if (a.native?.outputs.length) return fromNative(a.native.outputs, a.native.platform);
  // (the figures belong to the device they were read on: after a ROOM change they wait for the next read)
  return fromBrowser(
    b.devices,
    a.roomCtx && a.roomCtx.id === b.room
      ? {
          id: b.room,
          channels: a.roomCtx.maxChannels,
          sampleRate: a.roomCtx.sampleRate,
          latencySec: a.roomCtx.latencySec,
        }
      : undefined,
  );
}
export function roomOf(list: OutputInfo[], roomId: string): OutputInfo | null {
  return list.find((o) => o.id === roomId) ?? list.find((o) => o.isDefault) ?? list[0] ?? null;
}
function currentRoom(): OutputInfo | null {
  const n = deps?.night();
  if (!n) return null;
  const a = useAudio.getState();
  return roomOf(
    outputsModel(a, n),
    a.native ? (a.native.outputs.find((o) => o.isDefault)?.id ?? "") : n.room,
  );
}

const isDefaultRouting = (r: Routing) =>
  r.roomPair === 0 && r.cuePair === null && !r.mirror && !Object.values(r.trimMs).some((v) => v > 0);

/** Build (or drop) the router on the booth's context and point the engine at it; the cue route follows. */
export async function applyRouting(): Promise<void> {
  const c = deps?.ctx();
  const eng = deps?.engine();
  const r = useAudio.getState().routing;
  if (!c || !eng) return;
  const room = currentRoom();
  eng.outputLatencySec = roomLatencySec(
    room,
    (c as AudioContext & { outputLatency?: number }).outputLatency ?? 0,
  );
  if (isDefaultRouting(r)) {
    if (router) {
      eng.setOutput(null);
      router.dispose();
      router = null;
      routerCtx = null;
    }
    setCueRoute(null);
    useAudio.setState({ result: null });
    return;
  }
  if (!router || routerCtx !== c) {
    router?.dispose();
    router = new RoomRouter(c as unknown as RCtx, async (sinkId) => {
      const m = new AudioContext({ latencyHint: "playback" }) as AudioContext & {
        setSinkId?: (id: string) => Promise<void>;
      };
      if (!m.setSinkId) {
        void m.close();
        return null;
      }
      await m.setSinkId(sinkId === "default" ? "" : sinkId);
      return m as unknown as RCtx;
    });
    routerCtx = c;
    eng.setOutput(router.input);
  }
  const n = deps!.night();
  const list = outputsModel(useAudio.getState(), n);
  const mirrorOut = r.mirror ? list.find((o) => o.id === r.mirror) : null;
  const lat = (o: OutputInfo | null | undefined) => (o ? roomLatencySec(o, 0) * 1000 : 0);
  const delays =
    mirrorOut && room
      ? alignDelays([
          { id: "room", latencyMs: lat(room), trimMs: r.trimMs[room.id] },
          { id: "mirror", latencyMs: lat(mirrorOut), trimMs: r.trimMs[mirrorOut.id] },
        ])
      : { room: room ? (r.trimMs[room.id] ?? 0) : 0, mirror: 0 };
  const result = await router.apply({
    roomPair: r.roomPair,
    cuePair: r.cuePair,
    roomDelayMs: delays.room ?? 0,
    mirror: mirrorOut ? { sinkId: mirrorOut.id, delayMs: delays.mirror ?? 0 } : null,
  });
  const rt = router;
  setCueRoute(
    result.mapped
      ? (el) => {
          try {
            el.crossOrigin = "anonymous";
            (c as AudioContext).createMediaElementSource(el).connect(rt.cueInput as unknown as AudioNode);
            return true;
          } catch {
            return false;
          }
        }
      : null,
  );
  useAudio.setState({ result });
}

/* ---------- the guard: every event that can take the night's sound away ---------- */

function heldNight(): NightNow {
  const n = deps?.night();
  return { live: !!n?.started && !!n.live, heldFor: useAudio.getState().heldFor };
}
function where(): string {
  const n = deps!.night();
  return whereText(n.title, n.position);
}

export function handle(e: AudioEvent, extra: { name?: string; now?: string; device?: string } = {}): void {
  if (!deps) return;
  const d = deps;
  const r = react(e, heldNight(), d.policy());
  const resumeAction = (key: string) => ({
    label: t("booth.guard.resume"),
    run: () => {
      d.dismiss(key);
      useAudio.setState({ heldFor: null });
      void d.resume();
    },
  });
  switch (r.do) {
    case "nothing":
      return;
    case "hold": {
      const text = bannerText(r.banner, { where: where(), ...extra });
      d.engine()?.pause(0);
      useAudio.setState({ heldFor: r.why });
      d.banner({ key: "guard", text, action: resumeAction("guard") });
      return;
    }
    case "resume":
      d.dismiss("guard");
      useAudio.setState({ heldFor: null });
      void d.resume();
      return;
    case "offer": {
      const key = r.banner === "context" ? "audio" : "guard";
      d.banner({ key, text: bannerText(r.banner, { where: where(), ...extra }), action: resumeAction(key) });
      return;
    }
    case "note":
      d.banner({ key: "device", text: bannerText(r.banner, extra) });
      return;
    case "clear":
      d.dismiss("audio");
      return;
  }
}

/** a `devicechange` (web) or a CoreAudio device-list change (Mac app): refresh, then lost / changed / nothing */
async function onDevices() {
  if (!deps) return;
  const before = lastDevices;
  const n0 = deps.night();
  const nativeBefore = useAudio.getState().native;
  await deps.refreshOutputs();
  await useAudio.getState().refresh();
  const n = deps.night();
  lastDevices = n.devices;
  const nativeAfter = useAudio.getState().native;
  if (nativeBefore && nativeAfter) {
    // the Mac app: the system default is the room; it went away when its UID is no longer listed
    const was = nativeBefore.outputs.find((o) => o.isDefault);
    const now = nativeAfter.outputs.find((o) => o.isDefault);
    if (!was || was.id === now?.id) return;
    const gone = !nativeAfter.outputs.some((o) => o.id === was.id);
    handle(
      gone
        ? { type: "output-lost", name: was.name, now: now?.name }
        : { type: "output-changed", now: now?.name },
      {
        name: was.name,
        now: now?.name,
      },
    );
    return;
  }
  const r = outputLost({ before, after: n.devices, room: n0.room });
  if (r.lost) handle({ type: "output-lost", name: r.name, now: r.now }, { name: r.name, now: r.now });
  else if (r.changed) handle({ type: "output-changed", now: r.now }, { now: r.now });
  void applyRouting();
}

/** Once per night start: the context's state, devicechange, the native events, keep-awake. Idempotent. */
export function armGuard(
  d: GuardDeps,
  o: {
    onDeviceChange: (cb: () => void) => () => void;
    spotify: { onInterrupted: ((device: string | null) => void) | null };
  },
): void {
  deps = d;
  const c = d.ctx();
  if (c && ctxHooked !== c) {
    ctxHooked = c;
    c.addEventListener("statechange", () => {
      // a short suspension (a route change) resumes by itself: say it only when it lasts
      if (contextTimer) clearTimeout(contextTimer);
      const state = c.state as string;
      if (state === "running") return handle({ type: "context", state });
      contextTimer = setTimeout(() => {
        if ((c.state as string) !== "running") handle({ type: "context", state: c.state as string });
      }, 1200);
    });
  }
  o.spotify.onInterrupted = (device) =>
    handle({ type: "spotify-paused", device: device ?? undefined }, { device: device ?? undefined });
  if (!unsubs.length) {
    lastDevices = d.night().devices;
    unsubs.push(o.onDeviceChange(() => void onDevices()));
    unsubs.push(
      onNativeAudio((e) => {
        if (e === "devices") void onDevices();
        else if (e.type === "route") {
          const name = e.previous?.[0];
          handle(e, { name });
          void useAudio.getState().refresh();
        } else handle(e);
      }),
    );
  }
  void nightRunning(true);
  void useAudio
    .getState()
    .refresh()
    .then(() => applyRouting());
}

/** The engine's state: once the night plays again (the banner, the transport, a row) the hold is over. */
export function onNightLive(live: boolean): void {
  if (!live || !useAudio.getState().heldFor) return;
  useAudio.setState({ heldFor: null });
  deps?.dismiss("guard");
}

/** The night is over (or the Booth left): the device may sleep again; the listeners stay for the next start. */
export function nightEnded(): void {
  useAudio.setState({ heldFor: null });
  void nightRunning(false);
}

/** For tests: forget the module's state. */
export function _resetGuard() {
  for (const u of unsubs) u();
  unsubs = [];
  deps = null;
  router?.dispose();
  router = null;
  routerCtx = null;
  ctxHooked = null;
  routingLoaded = false;
  lastDevices = [];
  setCueRoute(null);
  useAudio.setState({
    heldFor: null,
    native: null,
    roomCtx: null,
    result: null,
    routing: { ...DEFAULT_ROUTING },
  });
}

export { DEFAULT_OUTPUT_LOSS };
