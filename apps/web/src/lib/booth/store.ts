"use client";
import { attachBooth, type BoothInputs, boothInputs, type Playlist } from "@tdj/core";
import { create } from "zustand";
import { makeNightLog, makeSnapshot } from "@/lib/history";
import { useStore } from "@/lib/store";
import { cortinaStopSec } from "@/lib/types";
import {
  BoothEngine,
  type BoothItemRuntime,
  type BoothSettings,
  type BoothState,
  DEFAULT_BOOTH_SETTINGS,
  type EngineEvent,
} from "./engine";
import { BoothMedia } from "./media";
import {
  loadBoothSettings,
  loadNight,
  NIGHT_MAX_AGE_MS,
  type NightRecord,
  saveBoothSettings,
  saveNight,
} from "./persist";
import { type BoothRows, decorate, planEntities, remainingFrom } from "./plan";
import { LocalAdapter } from "./sources/local";
import { PreviewAdapter, REHEARSAL_SEC } from "./sources/preview";
import { SpotifyAdapter } from "./sources/spotify";
import type { ItemSource, PlanEntity, SourceAdapter, SourceKind } from "./sources/types";

export interface Banner {
  key: string;
  text: string;
  action?: { label: string; run: () => void };
}
export type SourceMode = "file" | "spotify" | "preview";
export interface FolderStatus {
  name: string | null;
  files: number;
  matched: number;
  total: number;
  permission: "granted" | "prompt" | "none";
  session: boolean;
  canKeep: boolean;
}

interface BoothStore {
  playlist: Playlist | null;
  plan: BoothRows | null;
  entities: PlanEntity[];
  sources: ItemSource[];
  state: BoothState;
  planIndex: number;
  current: BoothItemRuntime | null;
  position: number;
  remaining: number;
  timeToCumparsita: number;
  drift: number;
  meter: { rms: number; peak: number };
  cortinaFader: number;
  master: number;
  muted: boolean;
  holding: boolean;
  holdBefore: number | null;
  breakUntil: number | null;
  /** plan indexes the rest of the night leaves out (missing, skipped, cued past) */
  skipped: number[];
  banners: Banner[];
  settings: BoothSettings;
  sourceMode: SourceMode;
  /** the whole night plays on 30 s clips: rehearsal mode, or every playable item falls back to a preview */
  rehearsal: boolean;
  availability: Record<SourceKind, { ok: boolean; reason?: string; checked: boolean }>;
  folder: FolderStatus;
  suggestions: Record<string, Array<{ path: string; name: string }>>;
  decoding: number | null;
  started: boolean;
  startedWall: number;
  resumeOffer: NightRecord | null;
  outputLabel: string | null;
  wakeLock: boolean;
  spotifyNoFades: boolean;
  ready: boolean;
  /* actions */
  boot: (p: Playlist, o?: { rehearsal?: boolean }) => Promise<void>;
  setSourceMode: (m: SourceMode) => Promise<void>;
  refreshSources: () => Promise<void>;
  linkFolder: () => Promise<void>;
  loadFileList: (files: ArrayLike<File>) => Promise<void>;
  requestFolderPermission: () => Promise<void>;
  pickFile: (itemId: string, pick: { path: string } | File) => Promise<void>;
  forgetFolder: () => Promise<void>;
  start: () => Promise<void>;
  play: () => Promise<void>;
  hold: () => void;
  next: () => void;
  skipNow: () => Promise<void>;
  stop: () => void;
  cueCortina: () => void;
  birthdayVals: () => void;
  startBreak: (minutes: number) => void;
  endBreak: () => Promise<void>;
  setCortinaFader: (v: number) => void;
  setMaster: (db: number) => void;
  toggleMute: () => void;
  setTrim: (id: string, db: number) => void;
  setSettings: (s: Partial<BoothSettings>) => void;
  testTone: () => void;
  resume: (accept: boolean) => Promise<void>;
  endNight: () => Promise<void>;
  dismissBanner: (key: string) => void;
  applySwappedPlaylist: (p: Playlist) => Promise<void>;
  leave: () => void;
}

/* module singletons: one context, one engine, one media helper for the life of the tab */
let ctx: AudioContext | null = null;
let engine: BoothEngine | null = null;
let media: BoothMedia | null = null;
let local: LocalAdapter | null = null;
let spotify: SpotifyAdapter | null = null;
let preview: PreviewAdapter | null = null;
let raf = 0;
let lastTick = 0;
let persistTimer: ReturnType<typeof setInterval> | null = null;
let unsubDevice: (() => void) | null = null;
let restoredLocal = false;

const getCtx = () => ctx;
function adapters(): { local: LocalAdapter; spotify: SpotifyAdapter; preview: PreviewAdapter } {
  if (!local) {
    local = new LocalAdapter(getCtx);
    local.onChange = () => useBooth.getState().refreshSources();
  }
  if (!spotify)
    spotify = new SpotifyAdapter({
      onBanner: (text, action) => pushBanner({ key: "spotify", text, action }),
    });
  if (!preview) preview = new PreviewAdapter(getCtx, () => useStore.getState().overrides);
  return { local, spotify, preview };
}
function pushBanner(b: Banner) {
  useBooth.setState((s) => ({ banners: [...s.banners.filter((x) => x.key !== b.key), b] }));
}
const EMPTY_AVAIL = { ok: false, checked: false } as const;

/**
 * The plan the booth plays is the plan the exports write: `attachBooth` on the set with the booth settings, the
 * cortina play length and the file measurements, written back into the app store so Export reads the same seconds.
 */
function rePlan(p: Playlist, settings: BoothSettings): { playlist: Playlist; plan: BoothRows } {
  const user = useStore.getState().settings;
  const inputs: BoothInputs = {
    ...boothInputs(p.booth),
    gapSec: settings.gapSec,
    cortinaFadeInSec: settings.cortinaFadeInSec,
    cortinaFadeOutSec: settings.cortinaFadeOutSec,
    cortinaLevelDb: settings.cortinaLevelDb,
    loudnessTargetLUFS: settings.loudnessTargetLUFS,
    trimLeadingSilence: settings.trimLeadingSilence,
    cortinaStopSec: cortinaStopSec(user, p.options.cortinaLengthSec),
    measurements: local?.measurementsById() ?? {},
  };
  const playlist = attachBooth(p, inputs);
  // write back only when the plan changed: the page re-boots on the store's playlist, so an identical plan must
  // not produce a new object (that was an update loop)
  const app = useStore.getState();
  if (app.playlist?.id === p.id && JSON.stringify(app.playlist.booth) !== JSON.stringify(playlist.booth))
    app.setPlaylist(playlist);
  return { playlist, plan: decorate(playlist, playlist.booth!) };
}

/**
 * Which adapters an item may use, in priority order, for the chosen mode: file → Spotify (Premium) → the 30 s
 * preview. A set can mix sources; without a folder or Premium every item with a Deezer preview plays its clip.
 */
function chain(mode: SourceMode, avail: BoothStore["availability"]): SourceAdapter[] {
  const a = adapters();
  if (mode === "preview") return [a.preview];
  if (mode === "spotify") return [a.spotify, a.preview];
  const out: SourceAdapter[] = [a.local];
  if (avail.spotify.ok) out.push(a.spotify);
  out.push(a.preview);
  return out;
}
const capFor = (sources: ItemSource[], rehearsal: boolean) => (i: number) =>
  rehearsal || sources[i] === "preview" ? REHEARSAL_SEC : null;

export const useBooth = create<BoothStore>()((set, get) => ({
  playlist: null,
  plan: null,
  entities: [],
  sources: [],
  state: "idle",
  planIndex: 0,
  current: null,
  position: 0,
  remaining: 0,
  timeToCumparsita: 0,
  drift: 0,
  meter: { rms: -100, peak: -100 },
  cortinaFader: 1,
  master: 0,
  muted: false,
  holding: false,
  holdBefore: null,
  breakUntil: null,
  skipped: [],
  banners: [],
  settings: DEFAULT_BOOTH_SETTINGS,
  sourceMode: "file",
  rehearsal: false,
  availability: { file: EMPTY_AVAIL, spotify: EMPTY_AVAIL, preview: EMPTY_AVAIL },
  folder: { name: null, files: 0, matched: 0, total: 0, permission: "none", session: false, canKeep: false },
  suggestions: {},
  decoding: null,
  started: false,
  startedWall: 0,
  resumeOffer: null,
  outputLabel: null,
  wakeLock: false,
  spotifyNoFades: false,
  ready: false,

  boot: async (p, o = {}) => {
    const a = adapters();
    const saved = (await loadBoothSettings()) ?? {};
    const settings: BoothSettings = { ...DEFAULT_BOOTH_SETTINGS, ...(saved as Partial<BoothSettings>) };
    const sameSet = get().playlist?.id === p.id && engine;
    const mode: SourceMode = o.rehearsal
      ? "preview"
      : ((saved.sourceMode as SourceMode | undefined) ?? get().sourceMode);
    const { playlist, plan } = rePlan(p, settings);
    const entities = planEntities(playlist, plan);
    set({
      playlist,
      plan,
      entities,
      settings,
      sourceMode: mode,
      spotifyNoFades: !a.spotify.capabilities.fade,
    });
    if (!media) media = new BoothMedia();
    if (!sameSet) {
      if (engine) {
        engine.dispose();
        engine = null;
      }
      set({ state: "idle", planIndex: 0, current: null, started: false, startedWall: 0, banners: [] });
    }
    if (!restoredLocal) {
      restoredLocal = true;
      await a.local.restore();
    }
    await get().refreshSources();
    // a night younger than 12 h for this set: offer to resume at its playhead
    const night = await loadNight();
    if (
      !sameSet &&
      night &&
      night.playlistId === p.id &&
      Date.now() - night.updatedAt < NIGHT_MAX_AGE_MS &&
      night.planIndex > 0
    )
      set({ resumeOffer: night });
    else if (night && night.playlistId !== p.id) await saveNight(null);
    set({ ready: true, ...derive(get().plan!, get().planIndex, 0, capFor(get().sources, get().rehearsal)) });
  },

  setSourceMode: async (m) => {
    set({ sourceMode: m });
    void saveBoothSettings({ ...get().settings, sourceMode: m });
    await get().refreshSources();
  },

  refreshSources: async () => {
    let { plan, entities } = get();
    const { sourceMode } = get();
    if (!plan) return;
    const a = adapters();
    const [file, sp, pv] = await Promise.all([
      a.local.available(),
      a.spotify.available(),
      a.preview.available(),
    ]);
    const availability = {
      file: { ...file, checked: true },
      spotify: { ...sp, checked: true },
      preview: { ...pv, checked: true },
    };
    if (file.ok) await a.local.match(plan.items, useStore.getState().settings.fileNaming);
    // measurements made since the last plan (decodes) feed the priors of the exports
    const p0 = get().playlist;
    if (p0 && !get().started) {
      const r = rePlan(p0, get().settings);
      plan = r.plan;
      entities = planEntities(r.playlist, r.plan);
      set({ playlist: r.playlist, plan, entities });
    }
    const order = chain(sourceMode, availability);
    const sources: ItemSource[] = [];
    for (let i = 0; i < plan.items.length; i++) {
      const it = plan.items[i]!;
      let src: ItemSource = "missing";
      if (it.kind === "break") src = "file";
      else
        for (const ad of order) {
          if ((await ad.resolve(it, entities[i] ?? null)) === "ready") {
            src = ad.kind;
            break;
          }
        }
      sources.push(src);
    }
    const counts = a.local.matchedCount(plan.items);
    const rows = plan.items;
    const playable = sources.filter((s, i) => s !== "missing" && rows[i]!.kind !== "break");
    const rehearsal =
      sourceMode === "preview" || (playable.length > 0 && playable.every((s) => s === "preview"));
    // before the night starts the playhead sits on the first item that can play
    const first = sources.findIndex((s, i) => s !== "missing" && rows[i]!.kind !== "break");
    const planIndex = get().started ? get().planIndex : Math.max(0, first);
    set({
      availability,
      sources,
      rehearsal,
      planIndex,
      ...(get().started ? {} : derive(plan, planIndex, 0, capFor(sources, rehearsal))),
      folder: {
        name: a.local.info?.name ?? null,
        files: a.local.info?.files ?? 0,
        matched: counts.matched,
        total: counts.total,
        permission: a.local.permission,
        session: !!a.local.info?.session,
        canKeep: typeof window !== "undefined" && "showDirectoryPicker" in window,
      },
      suggestions: Object.fromEntries(
        Object.entries(a.local.suggestions).map(([k, v]) => [
          k,
          v.map((e) => ({ path: e.path, name: e.name })),
        ]),
      ),
    });
    engine?.replacePlan(plan, entities, sources);
    if (a.local.permission === "prompt")
      pushBanner({
        key: "folder",
        text: a.local.info?.session
          ? "Your browser cannot remember the folder: pick it again for tonight."
          : "Folder permission needed to play your files.",
        action: {
          label: a.local.info?.session ? "Pick folder" : "Allow",
          run: () => void get().requestFolderPermission(),
        },
      });
    else get().dismissBanner("folder");
  },

  linkFolder: async () => {
    const a = adapters();
    if (await a.local.linkFolder()) await get().refreshSources();
  },
  loadFileList: async (files) => {
    await adapters().local.useFileList(files);
    await get().refreshSources();
  },
  requestFolderPermission: async () => {
    const a = adapters();
    if (a.local.info?.session || !(await a.local.requestPermission())) {
      document.getElementById("booth-folder-input")?.click();
      return;
    }
    await get().refreshSources();
  },
  pickFile: async (itemId, pick) => {
    const a = adapters();
    if (pick instanceof File) await a.local.pick(itemId, pick);
    else {
      const e = a.local.entries.find((x) => x.path === pick.path);
      if (e) await a.local.pick(itemId, e);
    }
    await get().refreshSources();
  },
  forgetFolder: async () => {
    await adapters().local.forgetFolder();
    await get().refreshSources();
  },

  start: async () => {
    const { plan, entities, sources, settings, sourceMode, resumeOffer } = get();
    if (!plan) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      pushBanner({ key: "audio", text: "This browser cannot play audio." });
      return;
    }
    if (!ctx) ctx = new Ctor({ latencyHint: "playback" });
    await ctx.resume().catch(() => {});
    if (!engine) {
      const a = adapters();
      engine = new BoothEngine(ctx, {
        adapters: [a.local, a.spotify, a.preview],
        settings,
        rehearsalSec: sourceMode === "preview" ? REHEARSAL_SEC : null,
        onEvent: onEngineEvent,
      });
      engine.load(plan, entities, sources);
      engine.planIndex = get().planIndex;
      engine.setMaster(get().master);
      engine.setCortinaFader(get().cortinaFader);
      if (resumeOffer) engine.restore(resumeOffer);
    }
    if (sourceMode === "spotify" || sources.includes("spotify")) {
      try {
        await adapters().spotify.connect();
      } catch (e) {
        pushBanner({ key: "spotify", text: e instanceof Error ? e.message : "Spotify could not connect" });
        if (sourceMode === "spotify") return;
      }
    }
    media ??= new BoothMedia();
    const held = await media.acquire();
    if (!held && !media.supports.wakeLock)
      pushBanner({ key: "wake", text: "Keep the laptop awake (System Settings → Energy)." });
    media.setPlaying(true);
    applyMediaHandlers();
    unsubDevice?.();
    unsubDevice = media.onDeviceChange(() => pushBanner({ key: "device", text: "Audio output changed." }));
    media.outputLabel().then((l) => set({ outputLabel: l }));
    set({ started: true, resumeOffer: null, wakeLock: held });
    const missing = sources.filter((s, i) => s === "missing" && plan.items[i]!.kind !== "break").length;
    if (missing)
      pushBanner({
        key: "missing",
        text: `${missing} item${missing === 1 ? " has" : "s have"} no source and will be skipped.`,
      });
    await engine.start();
    await engine.play();
    startTicking();
    if (!persistTimer) persistTimer = setInterval(persistNight, 5000);
  },
  play: async () => {
    if (!engine) return get().start();
    await ctx?.resume().catch(() => {});
    media?.setPlaying(true);
    await engine.play();
    startTicking();
  },
  hold: () => {
    engine?.hold();
    logToHistory(false);
  },
  next: () => engine?.next(),
  skipNow: async () => engine?.skipNow(),
  stop: () => {
    engine?.stop();
    media?.setPlaying(false);
  },
  cueCortina: () => engine?.cueCortina(),
  birthdayVals: () => engine?.birthdayVals(),
  startBreak: (m) => engine?.startBreak(m),
  endBreak: async () => engine?.endBreak(),
  setCortinaFader: (v) => {
    set({ cortinaFader: v });
    engine?.setCortinaFader(v);
  },
  setMaster: (db) => {
    set({ master: db });
    engine?.setMaster(db);
  },
  toggleMute: () => {
    const m = !get().muted;
    set({ muted: m });
    engine?.setMuted(m);
  },
  setTrim: (id, db) => engine?.setTrim(id, db),
  setSettings: (s) => {
    const settings = { ...get().settings, ...s };
    set({ settings });
    engine?.setSettings(s);
    void saveBoothSettings({ ...settings, sourceMode: get().sourceMode });
    const p = get().playlist;
    if (p && !get().started) {
      const r = rePlan(p, settings);
      set({
        playlist: r.playlist,
        plan: r.plan,
        entities: planEntities(r.playlist, r.plan),
        ...derive(r.plan, get().planIndex, 0, capFor(get().sources, get().rehearsal)),
      });
      engine?.load(r.plan, get().entities, get().sources);
    }
    applyMediaHandlers();
  },
  testTone: () => {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!ctx) ctx = new Ctor({ latencyHint: "playback" });
    void ctx.resume().catch(() => {});
    if (!engine) {
      const a = adapters();
      const { plan, entities, sources, settings, sourceMode } = get();
      engine = new BoothEngine(ctx, {
        adapters: [a.local, a.spotify, a.preview],
        settings,
        rehearsalSec: sourceMode === "preview" ? REHEARSAL_SEC : null,
        onEvent: onEngineEvent,
      });
      if (plan) engine.load(plan, entities, sources);
      engine.setMaster(get().master);
    }
    engine.testTone();
  },
  resume: async (accept) => {
    const offer = get().resumeOffer;
    if (!accept || !offer) {
      set({ resumeOffer: null });
      await saveNight(null);
      return;
    }
    set({ planIndex: offer.planIndex, startedWall: offer.startedAt, state: "stopped" });
    await get().start();
  },
  endNight: async () => {
    engine?.stop("end the night");
    logToHistory(true);
    await saveNight(null);
    media?.setPlaying(false);
    await media?.release();
    set({ started: false, state: "stopped" });
  },
  dismissBanner: (key) => set((s) => ({ banners: s.banners.filter((b) => b.key !== key) })),
  applySwappedPlaylist: async (p) => {
    useStore.getState().setPlaylist(p);
    const r = rePlan(p, get().settings);
    set({ playlist: r.playlist, plan: r.plan, entities: planEntities(r.playlist, r.plan) });
    await get().refreshSources();
  },
  leave: () => {
    stopTicking();
  },
}));

/* ---------- engine → store ---------- */

function onEngineEvent(e: EngineEvent) {
  const s = useBooth.getState();
  if (e.type === "state") {
    const eng = engine!;
    useBooth.setState({
      state: e.to,
      planIndex: e.planIndex,
      holding: eng.holding,
      holdBefore: eng.holdBefore,
      breakUntil: eng.breakUntil,
      skipped: [...eng.skipped],
      current: eng.current ? { ...eng.current } : null,
      startedWall: eng.startedWall,
    });
    if (e.to === "stopped" || e.to === "paused") media?.setPlaying(false);
    else if (e.to === "playing" || e.to === "cortina") media?.setPlaying(true);
    void persistNight();
  } else if (e.type === "item") {
    const it = s.plan?.items[e.planIndex];
    if (it && media) {
      media.setMetadata({
        title: it.title,
        artist: it.artist,
        album: it.kind === "cortina" ? `Cortina · tanda ${it.tanda}` : `Tanda ${it.tanda} · ${it.rhythm}`,
      });
      media.setPosition(engine?.currentLength() ?? it.lengthSec, 0);
    }
    useBooth.setState({ current: engine?.current ? { ...engine.current } : null, planIndex: e.planIndex });
  } else if (e.type === "banner") {
    pushBanner({ key: e.key ?? `b-${Date.now()}`, text: e.text, action: e.action });
  } else if (e.type === "ended") {
    logToHistory(true);
    void saveNight(null);
    media?.setPlaying(false);
    void media?.release();
    useBooth.setState({ started: false });
  } else if (e.type === "birthday") {
    pushBanner({
      key: "birthday",
      text:
        e.result === "marked"
          ? "Birthday vals: the next vals tanda is marked; the booth holds before it."
          : "The next tanda is not a vals: swap it ahead of the playhead to a vals tanda.",
    });
  } else if (e.type === "decoding") {
    useBooth.setState({ decoding: e.busy ? e.planIndex : null });
  }
}

function applyMediaHandlers() {
  const s = useBooth.getState();
  if (!media) return;
  if (!s.settings.mediaKeys) return media.setHandlers(null);
  media.setHandlers({
    play: () => void s.play(),
    pause: () => s.hold(),
    next: () => s.next(),
    stop: () => s.stop(),
    previous: () => {
      engine?.stop("restart");
      void s.play();
    },
  });
}

function derive(plan: BoothRows, planIndex: number, position: number, cap: (i: number) => number | null) {
  // before the engine exists the items without a source are the ones the night will leave out
  const sources = useBooth.getState().sources;
  const skipped = new Set(
    sources
      .map((s, i) => (s === "missing" && plan.items[i]?.kind !== "break" ? i : -1))
      .filter((i) => i >= 0),
  );
  const r = remainingFrom(plan, planIndex, position, { capFor: cap, skipped });
  return { remaining: r.remainingSec, timeToCumparsita: r.timeToCumparsita };
}

/** 30 fps while the night runs (10 fps with reduced motion): position, remaining, drift, the meter. */
function tick(now: number) {
  raf = requestAnimationFrame(tick);
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (now - lastTick < (reduced ? 100 : 33)) return;
  lastTick = now;
  const eng = engine;
  if (!eng) return;
  const r = eng.remaining();
  const s = useBooth.getState();
  const breakOver =
    s.breakUntil !== null && Date.now() >= s.breakUntil && eng.state === "paused" && !eng.holding;
  useBooth.setState({
    position: eng.position(),
    remaining: r.remainingSec,
    timeToCumparsita: r.timeToCumparsita,
    drift: eng.drift(),
    meter: eng.state === "playing" || eng.state === "cortina" ? eng.meter() : { rms: -100, peak: -100 },
  });
  if (breakOver) void s.endBreak();
  if (eng.current && media && Math.floor(now / 5000) !== Math.floor((now - 34) / 5000))
    media.setPosition(eng.currentLength(), eng.position());
}
function startTicking() {
  if (!raf && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(tick);
}
function stopTicking() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

async function persistNight() {
  const s = useBooth.getState();
  if (!engine || !s.playlist || !s.started) return;
  const snap = engine.snapshot();
  await saveNight({
    playlistId: s.playlist.id,
    ...snap,
    updatedAt: Date.now(),
    rehearsal: s.rehearsal,
  });
}

/** The night's log into the History snapshot of this set (created when the set was never saved). */
function logToHistory(ended: boolean) {
  const s = useBooth.getState();
  if (!engine || !s.playlist) return;
  const snap = engine.snapshot();
  const nightLog = makeNightLog({ ...snap, rehearsal: s.rehearsal, ended });
  const app = useStore.getState();
  const existing = app.history.find((h) => h.playlist.id === s.playlist!.id);
  if (existing) app.updateSnapshot(existing.id, { nightLog });
  else app.addSnapshot({ ...makeSnapshot(s.playlist, s.playlist.options, "compose"), nightLog });
}

/** For tests and the Find sheet: the engine behind the store (null before the first start). */
export const boothEngine = () => engine;
