"use client";
import {
  attachBooth,
  type BoothInputs,
  boothInputs,
  bypassPlanItems,
  type CortinaEdit,
  type Playlist,
  resolveTransition,
  type Song,
  type SongCue,
  type TransitionEdit,
  transitionKey,
} from "@tdj/core";
import { create } from "zustand";
import { makeNightLog, makeSnapshot } from "@/lib/history";
import { t as tx } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { cortinaStopSec } from "@/lib/types";
import { encodeWav, renderTransition } from "./audition";
import { clipSummary, rehearsalClip, spotifyOf, withSpotifyLengths } from "./clips";
import { cortinaHookOf } from "./cortinaStart";
import {
  CuePlayer,
  canPrelisten,
  listOutputs,
  type OutputDevice,
  roomSinkSupported,
  routeRoom,
  sinkSupported,
} from "./cue";
import {
  BoothEngine,
  type BoothItemRuntime,
  type BoothSettings,
  type BoothState,
  DEFAULT_BOOTH_SETTINGS,
  type EngineEvent,
} from "./engine";
import { dbToGain } from "./envelope";
import { BoothMedia } from "./media";
import {
  loadBoothSettings,
  loadNight,
  NIGHT_MAX_AGE_MS,
  type NightRecord,
  saveBoothSettings,
  saveNight,
} from "./persist";
import { type BoothRow, type BoothRows, decorate, planEntities, remainingFrom } from "./plan";
import { resolveSourceMode } from "./sourceMode";
import { LocalAdapter } from "./sources/local";
import { PreviewAdapter, REHEARSAL_SEC } from "./sources/preview";
import { SpotifyAdapter } from "./sources/spotify";
import type { ItemSource, PlanEntity, SourceAdapter, SourceKind } from "./sources/types";
import { type Bands, renderBands } from "./spectral";
import { transitionWindow } from "./transition";
import { isSilentState, unlockAudio } from "./unlock";
import { bufferPeaks } from "./waveform";

export interface Banner {
  key: string;
  text: string;
  action?: { label: string; run: () => void };
}
export type SourceMode = "file" | "spotify" | "preview";
/** Round 22: where a pre-listen sounds — the headphones output, or this device's own (only before the night). */
export type CueWhere = "headphones" | "device";
/** A song being pre-listened: a plan row (`i`) or any catalogue side (a version). */
export interface Audition {
  i: number | null;
  songId: string;
  /** wave 4: "transition" — a rendered transition between `i` and the item after it */
  via: "clip" | "spotify" | "file" | "transition";
  title: string;
  where: CueWhere;
  /** wave 4: what the audition could not play (a side with no audio here is silence) */
  note?: string;
}
/** Round 22: the room and headphones outputs. */
export interface Outputs {
  devices: OutputDevice[];
  room: string;
  cue: string | null;
  /** `HTMLMediaElement.setSinkId`: a pre-listen can go to a second output */
  cueSupported: boolean;
  /** `AudioContext.setSinkId`: the room can be sent to a chosen device */
  roomSupported: boolean;
  /** the browser named the devices (Chromium asks for the microphone permission once) */
  named: boolean;
}
export interface Waveform {
  peaks: number[];
  durationSec: number;
  from: "file" | "clip";
  /** wave 4: the low / mid / high envelopes the transition editor draws (absent where the split failed) */
  bands?: Bands;
}
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
  /** round 21: the plan items the player passes over tonight (bypassed tandas) */
  bypassed: number[];
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
  availability: Record<
    SourceKind,
    { ok: boolean; reason?: string; checked: boolean; reconnect?: boolean; premium?: boolean | null }
  >;
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
  /** round 21: a row being auditioned; round 22: where it sounds (headphones or this device) */
  audition: Audition | null;
  /** round 22: the room / headphones outputs */
  outputs: Outputs;
  /** round 22: the cue player's position (s) and length while a pre-listen plays */
  cuePos: { at: number; of: number };
  /* actions */
  /** round 21: tap a row — play it now (the running item fades), next, or audition it */
  playNow: (i: number) => Promise<void>;
  playNext: (i: number) => void;
  auditionItem: (i: number) => Promise<string | null>;
  /** round 22: pre-listen a plan row or any catalogue side; null when it plays, else why not */
  prelisten: (t: { i?: number; song?: Song }, o?: { startSec?: number }) => Promise<string | null>;
  /** round 22: why a pre-listen cannot go to the headphones now (null = it can) */
  cueBlocked: () => string | null;
  stopAudition: () => void;
  refreshOutputs: (askNames?: boolean) => Promise<void>;
  setRoomOutput: (id: string) => Promise<void>;
  setCueOutput: (id: string | null) => void;
  /** round 22: the DJ's cue in / stop at for one side (null resets it) */
  setSongCue: (id: string, cue: SongCue | null) => void;
  /** round 22: the cortina play length (null follows the composer) */
  setCortinaLength: (sec: number | null) => void;
  /** wave 4: the DJ's edit of the transition after plan item `i` (null = Auto, the night's Mix settings) */
  setTransition: (i: number, edit: TransitionEdit | null) => void;
  /**
   * wave 4: hear the transition after plan item `i` as `edit` would play it (the last ~8 s into the first ~8 s), in
   * the headphones during the night (never the room); null when it plays, else why not
   */
  auditionTransition: (i: number, edit: TransitionEdit | null) => Promise<string | null>;
  /** round 22: play another take of a side tonight (same title, same orchestra) */
  playVersion: (songId: string, version: Song) => Promise<boolean>;
  /** the night with `version` in place of `songId`, or null when that tanda is playing or played (read-only) */
  versionNight: (songId: string, version: Song) => Playlist | null;
  /** round 22: the waveform of a plan row (its file, else its 30 s clip) */
  waveformOf: (i: number) => Promise<Waveform | null>;
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
  /** round 21: "Skip tonight" on tanda `tanda` (1-based) — the player passes over it; exports keep it */
  toggleBypass: (tanda: number) => Promise<void>;
  /** round 21: "Last 4 tandas tango only" — the player bypasses the vals / milonga among the last four */
  setLastFourTango: (on: boolean) => Promise<void>;
  /** round 21: "Jump to La Cumparsita now" (`now`) or "Play the rest, then La Cumparsita" */
  jumpToClosing: (now: boolean) => Promise<void>;
  leave: () => void;
  /* 2026-11 fix ("can't start on the song I want, can't go one ahead or back, can't slide the song") */
  /** before the night (or stopped / paused): the playhead moves to row `i`, Start begins there; false if it cannot play */
  select: (i: number) => boolean;
  /** one back: restart past 3 s, else the previous playable item (now during the night, selected before) */
  previous: () => Promise<void>;
  /** one ahead now (the night's short fade), or the next playable row before the night */
  nextNow: () => Promise<void>;
  /** seek inside the current item to `sec` (files, clips and Spotify) */
  seek: (sec: number) => Promise<void>;
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
/** round 22: the pre-listen player (headphones output, or this device before the night) */
let cuePlayer: CuePlayer | null = null;
let cueTimer: ReturnType<typeof setInterval> | null = null;
const waveforms = new Map<string, Promise<Waveform | null>>();
const OUTPUTS_KEY = "tdj-booth-outputs";
function loadOutputPrefs(): { room?: string; cue?: string | null } {
  try {
    return JSON.parse(localStorage.getItem(OUTPUTS_KEY) ?? "{}") as { room?: string; cue?: string | null };
  } catch {
    return {};
  }
}
function saveOutputPrefs(o: { room: string; cue: string | null }) {
  try {
    localStorage.setItem(OUTPUTS_KEY, JSON.stringify(o));
  } catch {}
}

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
/** 2026-11: a cortina without a chorus in the data, and without the DJ's own start, may start at its file's loud part */
const audioHook = (it: BoothRow) =>
  it.kind === "cortina" &&
  useStore.getState().settings.cortinaHookStart !== false &&
  useBooth.getState().playlist?.booth?.cortinaEdits?.[it.id ?? ""]?.startSec === undefined &&
  (cortinaHookOf(it.id)?.source ?? "none") === "none";

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
    // 2026-11: Settings → Cortinas → "Start cortinas at the chorus" (on unless false)
    cortinaHookStart: user.cortinaHookStart === false ? false : undefined,
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
  bypassed: [],
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
  audition: null,
  outputs: {
    devices: [{ id: "default", label: tx("booth.store.this_device") }],
    room: "default",
    cue: null,
    cueSupported: false,
    roomSupported: false,
    named: false,
  },
  cuePos: { at: 0, of: 0 },

  boot: async (p, o = {}) => {
    const a = adapters();
    const saved = (await loadBoothSettings()) ?? {};
    const settings: BoothSettings = { ...DEFAULT_BOOTH_SETTINGS, ...(saved as Partial<BoothSettings>) };
    const sameSet = get().playlist?.id === p.id && engine;
    // round 22: a rehearsal is a choice for one session; with Premium connected the night plays full tracks
    const mode: SourceMode = resolveSourceMode({
      saved: (saved.sourceMode as SourceMode | undefined) ?? get().sourceMode,
      rehearsalParam: !!o.rehearsal,
      spotifyOk: false,
    });
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
    if (
      mode === "preview" &&
      !o.rehearsal &&
      resolveSourceMode({
        saved: "preview",
        rehearsalParam: false,
        spotifyOk: get().availability.spotify.ok,
      }) !== "preview"
    )
      await get().setSourceMode("file");
    void get().refreshOutputs();
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
      // (2026-11: a row the DJ selected stays selected while the sources resolve again)
      const sel = get().planIndex;
      const keep =
        sel > 0 && sources[sel] !== undefined && sources[sel] !== "missing" && rows[sel]?.kind !== "break";
      const planIndex = get().started || keep ? sel : Math.max(0, first);
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
      syncBypass();
      if (a.local.permission === "prompt")
        pushBanner({
          key: "folder",
          text: a.local.info?.session
            ? tx("booth.store.your_browser_cannot_remember_the_folder")
            : tx("booth.store.folder_permission_needed_to_play_your"),
          action: {
            label: a.local.info?.session ? tx("booth.store.pick_folder") : tx("booth.store.allow"),
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
      pushBanner({ key: "audio", text: tx("booth.store.this_browser_cannot_play_audio") });
      return;
    }
    if (!ctx) {
      ctx = new Ctor({ latencyHint: "playback" });
      if (get().outputs.room !== "default") void routeRoom(ctx, get().outputs.room);
    }
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
        whyMissing,
        audioHook,
      });
      engine.load(plan, entities, sources);
      syncBypass();
      engine.planIndex = get().planIndex;
      engine.setMaster(get().master);
      engine.setCortinaFader(get().cortinaFader);
      if (resumeOffer) engine.restore(resumeOffer);
    } else if (!get().started && !resumeOffer && !engine.live) {
      // 2026-11: the engine outlived an earlier night (or a test tone made it): start where the DJ put the playhead
      engine.planIndex = get().planIndex;
      engine.pausedAt = null;
    }
    if (sourceMode === "spotify" || sources.includes("spotify")) {
      try {
        await adapters().spotify.connect();
      } catch (e) {
        pushBanner({
          key: "spotify",
          text: e instanceof Error ? e.message : tx("booth.store.spotify_could_not_connect"),
        });
        if (sourceMode === "spotify") {
          media.setPlaying(false);
          return;
        }
      }
    }
    const held = await media.acquire();
    if (!held && !media.supports.wakeLock)
      pushBanner({ key: "wake", text: tx("booth.store.keep_the_laptop_awake_system_settings") });
    media.setPlaying(true);
    applyMediaHandlers();
    unsubDevice?.();
    unsubDevice = media.onDeviceChange(() =>
      pushBanner({ key: "device", text: tx("booth.store.audio_output_changed") }),
    );
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
        text: tx("booth.store.of_items_have_no_file_yet", { missing, length: plan.items.length }),
        action: {
          label: tx("booth.store.link_folder"),
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
    else {
      // a field set to undefined goes back to the night's setting (2026-11: a start back to the chorus)
      const next = Object.fromEntries(
        Object.entries({ ...edits[id], ...edit }).filter(([, v]) => v !== undefined),
      ) as CortinaEdit;
      if (Object.keys(next).length) edits[id] = next;
      else delete edits[id];
    }
    applyPlan(rePlan(p, get().settings, { cortinaEdits: edits }));
  },
  next: () => engine?.next(),
  playNow: async (i) => {
    get().stopAudition();
    if (!engine || !get().started) {
      set({ planIndex: i });
      return get().start();
    }
    if (ctx) unlockAudio(ctx);
    await ctx?.resume().catch(() => {});
    await engine.playNow(i);
    startTicking();
  },
  playNext: (i) => {
    engine?.playNext(i);
    if (engine)
      set({
        ...derive(get().plan!, engine.planIndex, engine.position(), capFor(get().sources, get().rehearsal)),
      });
  },
  // round 21: audition a row (a tap); round 22: a pre-listen in the headphones when a second output is set
  auditionItem: async (i) => get().prelisten({ i }),
  cueBlocked: () => {
    const o = get().outputs;
    const v = canPrelisten({ supported: o.cueSupported, roomId: o.room, cueId: o.cue, devices: o.devices });
    return v.ok ? null : (v.why ?? tx("booth.store.pick_your_headphones_first"));
  },
  prelisten: async (t, o = {}) => {
    const { entities, plan, sources, availability, started } = get();
    const it = t.i !== undefined ? plan?.items[t.i] : undefined;
    if (t.i !== undefined && (!it || it.kind === "break")) return tx("booth.store.nothing_to_play");
    const e: PlanEntity = t.song ?? (t.i !== undefined ? (entities[t.i] ?? null) : null);
    if (!e) return tx("booth.store.nothing_to_play");
    const title = it?.title ?? e.title;
    get().stopAudition();
    const blocked = get().cueBlocked();
    // during the night a pre-listen never goes to the room: headphones only
    if (blocked && started) return blocked;
    const where: CueWhere = blocked ? "device" : "headphones";
    const sink = where === "headphones" ? get().outputs.cue : null;
    const base = { i: t.i ?? null, songId: e.id, title, where };
    const play = async (src: string | Blob, via: Audition["via"]) => {
      cuePlayer ??= new CuePlayer();
      cuePlayer.onEnded = () => {
        stopCueTimer();
        useBooth.setState({ audition: null, cuePos: { at: 0, of: 0 } });
      };
      await cuePlayer.play(src, { sinkId: sink, startSec: o.startSec });
      set({ audition: { ...base, via } });
      startCueTimer();
    };
    // 1. the DJ's own file (the whole song)
    const file = await adapters()
      .local.fileFor(it?.id ?? e.id)
      .catch(() => null);
    if (file) {
      try {
        await play(file, "file");
        return null;
      } catch {}
    }
    // 2. this device before the night: Spotify Premium plays the checked recording on the SDK device
    const sp = spotifyOf(e);
    if (
      where === "device" &&
      sp?.uri &&
      availability.spotify.ok &&
      (t.i === undefined || sources[t.i] === "spotify" || !started)
    ) {
      try {
        await adapters().spotify.audition(sp.uri);
        set({ audition: { ...base, via: "spotify" } });
        return null;
      } catch (err) {
        pushBanner({
          key: "spotify",
          text: err instanceof Error ? err.message : tx("booth.store.spotify_could_not_play_it"),
        });
      }
    }
    // 3. the 30 s clip of that recording
    const v = rehearsalClip(e);
    const url = v.clip ? (v.clip.from === "spotify" ? v.clip.url : clipUrl(v.clip.resolved)) : null;
    if (!url)
      return where === "headphones" && sp
        ? tx("booth.store.spotify_plays_only_to_the_room")
        : (v.why ?? tx("booth.store.no_clip_of_this_recording"));
    try {
      await play(url, "clip");
    } catch {
      return tx("booth.store.the_browser_blocked_playback_tap_again");
    }
    return null;
  },
  stopAudition: () => {
    cuePlayer?.stop();
    stopCueTimer();
    if (get().audition?.via === "spotify") void adapters().spotify.pauseAudition();
    if (get().audition) set({ audition: null, cuePos: { at: 0, of: 0 } });
  },
  refreshOutputs: async (askNames = false) => {
    const devices = await listOutputs(askNames);
    const prefs = loadOutputPrefs();
    const has = (id?: string | null): id is string => !!id && devices.some((d) => d.id === id);
    set({
      outputs: {
        devices,
        room: has(prefs.room) ? prefs.room : "default",
        cue: has(prefs.cue) ? prefs.cue : null,
        cueSupported: sinkSupported(),
        roomSupported: roomSinkSupported(),
        named: devices.some((d) => d.id !== "default"),
      },
    });
  },
  setRoomOutput: async (id) => {
    const o = get().outputs;
    set({ outputs: { ...o, room: id } });
    saveOutputPrefs({ room: id, cue: o.cue });
    if (ctx) await routeRoom(ctx, id);
  },
  setCueOutput: (id) => {
    const o = get().outputs;
    get().stopAudition();
    set({ outputs: { ...o, cue: id } });
    saveOutputPrefs({ room: o.room, cue: id });
  },
  setSongCue: (id, cue) => {
    const p = get().playlist;
    if (!p) return;
    const cues: Record<string, SongCue> = { ...(p.booth?.songCues ?? {}) };
    if (cue === null) delete cues[id];
    else cues[id] = { ...cue };
    applyPlan(rePlan(p, get().settings, { songCues: cues }));
  },
  setCortinaLength: (sec) => {
    useStore.getState().setSettings({ cortinaStopSec: sec });
    const p = get().playlist;
    if (p) applyPlan(rePlan(p, get().settings));
  },
  setTransition: (i, edit) => {
    const p = get().playlist;
    const a = get().plan?.items[i];
    const b = get().plan?.items[i + 1];
    if (!p || !a?.id || !b?.id) return;
    const key = transitionKey(a.id, b.id);
    const all: Record<string, TransitionEdit> = { ...(p.booth?.transitions ?? {}) };
    if (edit === null) delete all[key];
    else all[key] = { ...edit };
    applyPlan(rePlan(p, get().settings, { transitions: all }));
  },
  auditionTransition: async (i, edit) => {
    const { plan, entities, started, settings } = get();
    const a = plan?.items[i];
    const b = plan?.items[i + 1];
    const ea = entities[i];
    const eb = entities[i + 1];
    if (!a || !b || a.kind === "break" || b.kind === "break" || !ea || !eb)
      return tx("booth.store.nothing_to_play");
    get().stopAudition();
    const blocked = get().cueBlocked();
    // during the night an audition never goes to the room: headphones only
    if (blocked && started) return blocked;
    const where: CueWhere = blocked ? "device" : "headphones";
    const Off = offlineCtor();
    if (!Off) return tx("booth.store.this_browser_cannot_mix_a_transition");
    const [da, db] = await Promise.all([
      decodeAudio(a.id ?? "", ea).catch(() => null),
      decodeAudio(b.id ?? "", eb).catch(() => null),
    ]);
    if (!da && !db) return tx("booth.store.no_audio_to_mix_spotify_plays");
    // one side with nothing decodable (Spotify only, no clip): it is silence, and the line under the stage says so
    const silent = (it: typeof a) => {
      const sec = Math.max(1, Math.min(it.lengthSec, 30));
      return {
        buffer: new Off(1, 1, 44100).createBuffer(1, Math.ceil(sec * 44100), 44100),
        from: "clip" as const,
      };
    };
    const note = !da
      ? tx("booth.store.only_one_side_has_audio", { title: a.title })
      : !db
        ? tx("booth.store.only_one_side_has_audio", { title: b.title })
        : undefined;
    const side = (it: typeof a, d: { buffer: AudioBuffer; from: Waveform["from"] }) => {
      const offset = d.from === "file" ? Math.min(it.trimInSec ?? 0, Math.max(0, d.buffer.duration - 1)) : 0;
      return {
        buffer: d.buffer,
        offset,
        length: Math.max(0.5, Math.min(it.lengthSec, d.buffer.duration - offset)),
        gain: Math.min(
          1,
          dbToGain(Math.min(0, it.gainDb ?? (it.kind === "cortina" ? settings.cortinaLevelDb : 0))),
        ),
      };
    };
    const out = side(a, da ?? silent(a));
    const inn = side(b, db ?? silent(b));
    const tr = edit
      ? resolveTransition(edit, {
          from: { kind: a.kind, lengthSec: a.lengthSec, tanda: a.tanda },
          to: { kind: b.kind, lengthSec: b.lengthSec, tanda: b.tanda },
          cortinaFadeOutSec: a.fadeOutSec,
        })
      : null;
    const window = transitionWindow(tr, {
      outLen: out.length,
      inLen: inn.length,
      gapSec: a.gapAfterSec || settings.gapSec,
      songFadeOutSec: settings.songFadeOutSec,
      outKind: a.kind,
      cortinaFadeOutSec: a.fadeOutSec ?? settings.cortinaFadeOutSec,
    });
    let blob: Blob;
    try {
      blob = encodeWav(await renderTransition(Off, { out, in: inn, window }));
    } catch {
      return tx("booth.store.this_browser_cannot_mix_a_transition");
    }
    const sink = where === "headphones" ? get().outputs.cue : null;
    cuePlayer ??= new CuePlayer();
    cuePlayer.onEnded = () => {
      stopCueTimer();
      useBooth.setState({ audition: null, cuePos: { at: 0, of: 0 } });
    };
    try {
      await cuePlayer.play(blob, { sinkId: sink });
    } catch (err) {
      return err instanceof Error && err.message
        ? err.message
        : tx("booth.store.the_browser_blocked_playback_tap_again");
    }
    set({
      audition: {
        i,
        songId: a.id ?? "",
        via: "transition",
        title: `${a.title} → ${b.title}`,
        where,
        ...(note ? { note } : {}),
      },
    });
    startCueTimer();
    return null;
  },
  versionNight: (songId, version) => {
    const p = get().playlist;
    if (!p) return null;
    const ti = p.tandas.findIndex((t) => t.songs.some((x) => x.id === songId));
    const cur = get().plan?.items[get().planIndex];
    if (ti < 0 || (get().started && cur && ti + 1 <= cur.tanda)) return null;
    return {
      ...p,
      tandas: p.tandas.map((t, i) =>
        i === ti ? { ...t, songs: t.songs.map((x) => (x.id === songId ? version : x)) } : t,
      ),
    };
  },
  playVersion: async (songId, version) => {
    const np = get().versionNight(songId, version);
    if (!np) return false;
    get().stopAudition();
    await get().applySwappedPlaylist(np);
    return true;
  },
  waveformOf: (i) => {
    const it = get().plan?.items[i];
    const e = get().entities[i] ?? null;
    if (!it || it.kind === "break" || !e) return Promise.resolve(null);
    const key = it.id ?? String(it.n);
    let p = waveforms.get(key);
    if (!p) {
      p = decodePeaks(key, e).catch(() => null);
      waveforms.set(key, p);
    }
    return p;
  },
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
  toggleBypass: async (tanda) => {
    const p = get().playlist;
    if (!p?.tandas[tanda - 1]) return;
    await get().applySwappedPlaylist({
      ...p,
      tandas: p.tandas.map((t, i) => (i === tanda - 1 ? { ...t, bypass: !t.bypass || undefined } : t)),
    });
    syncBypass();
  },
  setLastFourTango: async (on) => {
    const p = get().playlist;
    if (!p) return;
    await get().applySwappedPlaylist({
      ...p,
      options: { ...p.options, rules: { ...(p.options.rules ?? {}), lastFourTango: on || undefined } },
    });
    syncBypass();
  },
  jumpToClosing: async (now) => {
    await engine?.jumpToClosing(now);
    if (engine) useBooth.setState({ skipped: [...engine.skipped] });
  },
  leave: () => {
    stopTicking();
  },
  ...seekActions(set, get),
}));

/* ---------- 2026-11: start from any row, Previous / Next now, seek ---------- */
function seekActions(set: (p: Partial<BoothStore>) => void, get: () => BoothStore) {
  /** the store's mirror of the engine after a move: playhead, times, the night's record */
  const sync = () => {
    const s = get();
    if (!s.plan) return;
    const i = engine ? engine.planIndex : s.planIndex;
    if (engine && s.started) {
      const r = engine.remaining();
      set({
        planIndex: i,
        position: engine.position(),
        remaining: r.remainingSec,
        timeToCumparsita: r.timeToCumparsita,
      });
    } else set({ planIndex: i, position: 0, ...derive(s.plan, i, 0, capFor(s.sources, s.rehearsal)) });
    void persistNight();
  };
  /** a row the night can start from: a song or cortina with a source, not bypassed tonight */
  const playable = (i: number) => {
    const s = get();
    const it = s.plan?.items[i];
    return (
      !!it && it.kind !== "break" && (s.sources[i] ?? "missing") !== "missing" && !s.bypassed.includes(i)
    );
  };
  const live = () => {
    const st = get().state;
    return get().started && (st === "playing" || st === "cortina");
  };
  const step = (dir: 1 | -1) => {
    const s = get();
    const n = s.plan?.items.length ?? 0;
    for (let i = s.planIndex + dir; i >= 0 && i < n; i += dir) if (playable(i)) return i;
    return null;
  };
  return {
    select: (i: number) => {
      if (live() || !playable(i)) return false;
      if (engine && get().started && !engine.select(i)) return false;
      if (engine && !get().started && !engine.live) engine.planIndex = i;
      set({ planIndex: i });
      sync();
      return true;
    },
    previous: async () => {
      if (engine && get().started) {
        if (ctx) unlockAudio(ctx);
        await engine.previous();
        startTicking();
        return sync();
      }
      const p = step(-1);
      if (p !== null) get().select(p);
    },
    nextNow: async () => {
      if (engine && get().started) {
        if (ctx) unlockAudio(ctx);
        await engine.nextNow();
        startTicking();
        return sync();
      }
      const n = step(1);
      if (n !== null) get().select(n);
    },
    seek: async (sec: number) => {
      if (!engine || !get().started) return;
      await engine.seek(sec);
      sync();
      media?.setPosition(engine.currentLength(), engine.position());
    },
  };
}

/** A Deezer clip through the instance's fresh-link redirect (signed links expire within minutes). */
function clipUrl(r: { provider?: string; id?: string; previewUrl?: string | null }): string | null {
  if (r.provider === "deezer" && r.id && /^\d+$/.test(r.id)) return `/api/preview?provider=deezer&id=${r.id}`;
  return r.previewUrl ?? null;
}
function startCueTimer() {
  stopCueTimer();
  cueTimer = setInterval(() => {
    if (!cuePlayer?.el) return stopCueTimer();
    useBooth.setState({ cuePos: { at: cuePlayer.position(), of: cuePlayer.duration() } });
  }, 250);
}
function stopCueTimer() {
  if (cueTimer) clearInterval(cueTimer);
  cueTimer = null;
}
/** Round 22: the waveform of a side — its file (the whole song) else its clip — decoded off the room's graph. */
async function decodePeaks(id: string, e: NonNullable<PlanEntity>): Promise<Waveform | null> {
  const d = await decodeAudio(id, e);
  if (!d) return null;
  const Off = offlineCtor();
  const bands = Off ? await renderBands(d.buffer, Off).catch(() => undefined) : undefined;
  return { peaks: bufferPeaks(d.buffer, 240), durationSec: d.buffer.duration, from: d.from, bands };
}

/** The offline context constructor (Safari's prefixed one too); null where there is none. */
function offlineCtor(): typeof OfflineAudioContext | null {
  return typeof OfflineAudioContext !== "undefined"
    ? OfflineAudioContext
    : ((globalThis as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .webkitOfflineAudioContext ?? null);
}

/** A side's decodable audio: the DJ's file, else its 30 s clip; null when only Spotify has it. */
async function decodeAudio(
  id: string,
  e: NonNullable<PlanEntity>,
): Promise<{ buffer: AudioBuffer; from: Waveform["from"] } | null> {
  const Off = offlineCtor();
  if (!Off) return null;
  const file = await adapters()
    .local.fileFor(id)
    .catch(() => null);
  let bytes: ArrayBuffer | null = null;
  let from: Waveform["from"] = "file";
  if (file) bytes = await file.arrayBuffer();
  else {
    const v = rehearsalClip(e);
    let u = v.clip ? (v.clip.from === "spotify" ? v.clip.url : clipUrl(v.clip.resolved)) : null;
    if (!u) return null;
    if (u.startsWith("/api/preview")) {
      const j = (await (await fetch(`${u}&json=1`)).json().catch(() => ({}))) as { url?: string };
      if (!j.url) return null;
      u = j.url;
    }
    const r = await fetch(u);
    if (!r.ok) return null;
    bytes = await r.arrayBuffer();
    from = "clip";
  }
  const dec = new Off(1, 1, 44100);
  const buffer = await dec.decodeAudioData(bytes);
  return { buffer, from };
}

/** the engine passes over the tandas the DJ bypasses tonight (round 21) */
function syncBypass() {
  const { playlist, plan } = useBooth.getState();
  const items = playlist && plan ? bypassPlanItems(playlist, plan.items) : [];
  engine?.setBypass(items);
  useBooth.setState({ bypassed: items });
  // the night's time follows at once (before the night; the tick does it while it runs)
  const s = useBooth.getState();
  if (plan && !s.started) useBooth.setState(derive(plan, s.planIndex, 0, capFor(s.sources, s.rehearsal)));
}

/** wave 2: why the engine passes an item over, in the DJ's words (the banner) */
function whyMissing(i: number): string | null {
  const s = useBooth.getState();
  if (!s.rehearsal) return null;
  const why = s.notRehearsable.find((x) => x.i === i)?.why;
  return tx("booth.store.the_rehearsal_has_no_30_s", {
    p1: why && why !== "no clip of the Spotify recording" ? ` (${why})` : "",
  });
}

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
        album:
          it.kind === "cortina"
            ? tx("booth.store.cortina_tanda", { tanda: it.tanda })
            : tx("booth.store.tanda", { tanda: it.tanda, rhythm: it.rhythm }),
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
          ? tx("booth.store.birthday_vals_the_next_vals_tanda")
          : tx("booth.store.the_next_tanda_is_not_a"),
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
    // 2026-11: the same Previous as the transport (restart past 3 s, else one back)
    previous: () => void s.previous(),
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
        text: tx("booth.store.the_browser_is_holding_the_sound"),
        action: {
          label: tx("booth.store.turn_sound_on"),
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
  const { sources, bypassed } = useBooth.getState();
  const skipped = new Set(
    sources
      .map((s, i) => (s === "missing" && plan.items[i]?.kind !== "break" ? i : -1))
      .filter((i) => i >= 0),
  );
  // a tanda skipped tonight and its cortina leave the night's time (wave 2)
  for (const i of bypassed) skipped.add(i);
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
