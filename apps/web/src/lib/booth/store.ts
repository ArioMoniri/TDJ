"use client";
import { attachBooth, type BoothInputs, boothInputs, type CortinaEdit, type Playlist } from "@tdj/core";
import { create } from "zustand";
import { makeNightLog, makeSnapshot } from "@/lib/history";
import { useStore } from "@/lib/store";
import { cortinaStopSec } from "@/lib/types";
import { clipSummary, withSpotifyLengths } from "./clips";
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
import { isSilentState, unlockAudio } from "./unlock";

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
  /** round 20: an immediate Pause is waiting (Resume plays the same item from where it stopped) */
  paused: boolean;
  /** round 20: talk-over (the master dipped 12 dB) */
  ducked: boolean;
  holdBefore: number | null;
  breakUntil: number | null;
  /** plan indexes the rest of the night leaves out (missing, skipped, cued past) */
  skipped: number[];
  banners: Banner[];
  settings: BoothSettings;
  sourceMode: SourceMode;
  /** the whole night plays on 30 s clips: rehearsal mode, or every playable item falls back to a preview */
  rehearsal: boolean;
  /** round 18: the items no clip of their Spotify recording can rehearse, with the reason (plan indexes) */
  notRehearsable: Array<{ i: number; title: string; why: string }>;
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
  /** sources are being matched (folder, Spotify, previews): the cards say so instead of showing 0 */
  resolving: boolean;
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
  /** round 20: hold after this song, or lift a pending hold */
  toggleHold: () => void;
  /** round 20: immediate pause with a short fade / resume */
  pause: () => void;
  togglePause: () => void;
  fadeOutNow: () => void;
  crossfadeNext: () => Promise<void>;
  setDucked: (on: boolean) => void;
  /** round 20: the DJ's fade in / fade out / stop second for one cortina, saved with the set (null resets it) */
  setCortinaEdit: (id: string, edit: CortinaEdit | null) => void;
  next: () => void;
  skipNow: () => Promise<void>;
  /** `fadeSec`: 1 s by default; the confirm offers "Fade out and stop" and "Stop now" */
  stop: (fadeSec?: number) => void;
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
function rePlan(
  p: Playlist,
  settings: BoothSettings,
  extra: Partial<BoothInputs> = {},
): { playlist: Playlist; plan: BoothRows } {
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
    ...extra,
  };
  // round 18: a side with a checked Spotify match is timed at that recording's length (what the DJ plays)
  const timed = attachBooth(withSpotifyLengths(p), inputs);
  const playlist: Playlist = { ...p, booth: timed.booth, stats: timed.stats };
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
  paused: false,
  ducked: false,
  holdBefore: null,
  breakUntil: null,
  skipped: [],
  banners: [],
  settings: DEFAULT_BOOTH_SETTINGS,
  sourceMode: "file",
  rehearsal: false,
  notRehearsable: [],
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
  resolving: false,

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
    set({ resolving: true });
    try {
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
      const clips = clipSummary(entities.map((e) => e ?? null));
      const notRehearsable = rehearsal
        ? clips.none.filter((x) => sources[x.i] === "missing" && rows[x.i]?.kind !== "break")
        : [];
      set({
        availability,
        sources,
        rehearsal,
        notRehearsable,
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
    } finally {
      set({ resolving: false });
    }
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
    // round 20: everything that opens the output happens here, in the tap, before the first await (iOS: the
    // playback session, which the silent switch does not mute; the keep-alive element; the primed context)
    unlockAudio(ctx);
    media ??= new BoothMedia();
    media.setPlaying(true);
    watchVisibility();
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
        if (sourceMode === "spotify") {
          media.setPlaying(false);
          return;
        }
      }
    }
    const held = await media.acquire();
    if (!held && !media.supports.wakeLock)
      pushBanner({ key: "wake", text: "Keep the laptop awake (System Settings → Energy)." });
    media.setPlaying(true);
    applyMediaHandlers();
    unsubDevice?.();
    unsubDevice = media.onDeviceChange(() => pushBanner({ key: "device", text: "Audio output changed." }));
    media.outputLabel().then((l) => set({ outputLabel: l }));
    set({ started: true, resumeOffer: null, wakeLock: held });
    // `sources` can still be the previous night's (longer) list for a moment after the plan changes
    const missing = sources.filter(
      (s, i) => s === "missing" && !!plan.items[i] && plan.items[i].kind !== "break",
    ).length;
    // in a rehearsal the Now chip says what is skipped (round 20: also when the night falls back to clips without
    // the rehearsal switch, e.g. the featured night); from files it is a thing the DJ can fix: say how
    if (missing && sourceMode !== "preview" && !get().rehearsal)
      pushBanner({
        key: "missing",
        text: `${missing} of ${plan.items.length} items have no file yet: they are skipped. Link your music folder to play them.`,
        action: {
          label: "Link folder…",
          run: () => {
            const b = get();
            if (b.folder.canKeep) void b.linkFolder();
            else document.getElementById("booth-folder-input")?.click();
          },
        },
      });
    await engine.start();
    await engine.play();
    startTicking();
    if (!persistTimer) persistTimer = setInterval(persistNight, 5000);
    checkAudible();
  },
  play: async () => {
    if (!engine) return get().start();
    if (ctx) unlockAudio(ctx);
    media?.setPlaying(true);
    await ctx?.resume().catch(() => {});
    await engine.play();
    startTicking();
    checkAudible();
  },
  hold: () => {
    engine?.hold();
    logToHistory(false);
  },
  toggleHold: () => {
    const s = get();
    if (s.holding && (s.state === "playing" || s.state === "cortina")) void s.play();
    else s.hold();
  },
  pause: () => {
    engine?.pause();
  },
  togglePause: () => {
    const s = get();
    if (!s.started) return void s.start();
    if (s.breakUntil !== null) return void s.endBreak();
    if (s.state === "playing" || s.state === "cortina") s.pause();
    else void s.play();
  },
  fadeOutNow: () => engine?.fadeOutNow(),
  crossfadeNext: async () => engine?.crossfadeNext(),
  setDucked: (on) => {
    set({ ducked: on });
    engine?.setDucked(on);
  },
  setCortinaEdit: (id, edit) => {
    const p = get().playlist;
    if (!p) return;
    const edits: Record<string, CortinaEdit> = { ...(p.booth?.cortinaEdits ?? {}) };
    if (edit === null) delete edits[id];
    else edits[id] = { ...edits[id], ...edit };
    applyPlan(rePlan(p, get().settings, { cortinaEdits: edits }));
  },
  next: () => engine?.next(),
  skipNow: async () => engine?.skipNow(),
  stop: (fadeSec) => {
    engine?.stop("stop", fadeSec);
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
    // the plan's settings (gap, cortina fades and level, loudness, trim) re-time the night, also while it plays
    // (round 20: the playhead stays, what is ahead follows)
    const planKeys = [
      "gapSec",
      "cortinaFadeInSec",
      "cortinaFadeOutSec",
      "cortinaLevelDb",
      "loudnessTargetLUFS",
      "trimLeadingSilence",
    ];
    if (p && (!get().started || Object.keys(s).some((k) => planKeys.includes(k))))
      applyPlan(rePlan(p, settings));
    applyMediaHandlers();
  },
  testTone: () => {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!ctx) ctx = new Ctor({ latencyHint: "playback" });
    unlockAudio(ctx);
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
      paused: eng.paused,
      holdBefore: eng.holdBefore,
      breakUntil: eng.breakUntil,
      skipped: [...eng.skipped],
      // a paused item keeps its card (length, gain) while it waits for Resume
      current: eng.current ? { ...eng.current } : eng.pausedAt ? { ...eng.pausedAt.runtime } : null,
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
    // round 20: a headset / lock-screen pause is a real pause (0.8 s fade); "Media keys" off keeps them out
    pause: () => s.pause(),
    next: () => s.next(),
    stop: () => s.stop(),
    previous: () => {
      engine?.stop("restart");
      void s.play();
    },
  });
}

/** A new plan for the set (settings, a cortina edit): into the store, and into the engine without moving the playhead. */
function applyPlan(r: { playlist: Playlist; plan: BoothRows }) {
  const s = useBooth.getState();
  const entities = planEntities(r.playlist, r.plan);
  useBooth.setState({
    playlist: r.playlist,
    plan: r.plan,
    entities,
    ...(s.started ? {} : derive(r.plan, s.planIndex, 0, capFor(s.sources, s.rehearsal))),
  });
  if (!engine) return;
  if (s.started) engine.replacePlan(r.plan, entities, s.sources);
  else engine.load(r.plan, entities, s.sources);
}

/** The context must be running and the night moving: otherwise the DJ hears nothing, so say it and offer the fix. */
function checkAudible() {
  setTimeout(() => {
    const s = useBooth.getState();
    if (!ctx || !s.started) return;
    if (isSilentState(ctx.state))
      pushBanner({
        key: "audio",
        text: "The browser is holding the sound back. Tap to turn the sound on.",
        action: {
          label: "Turn sound on",
          run: () => {
            if (ctx) unlockAudio(ctx);
            media?.setPlaying(true);
            void ctx?.resume().then(() => useBooth.getState().dismissBanner("audio"));
          },
        },
      });
    else s.dismissBanner("audio");
  }, 1500);
}

let visibilityHooked = false;
/** Back to the tab (a phone woke, a call ended): take the context back if the OS suspended it. */
function watchVisibility() {
  if (visibilityHooked || typeof document === "undefined") return;
  visibilityHooked = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    engine?.ensureRunning();
    if (useBooth.getState().started) checkAudible();
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
/** For the e2e audibility check: the context's state. */
export const boothContextState = () => ctx?.state ?? null;
