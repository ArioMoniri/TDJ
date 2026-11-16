"use client";
/**
 * 2026-11 — tap any song or cortina row to play it (Compose, the inspector, Build by hand, the swap and search
 * sheets, Library, Database, History and shared nights). The source order and the Booth routing are pure
 * (`playSource.ts`); this module runs them against the app: the one mini player (`player.ts`), the Booth's Spotify
 * adapter for a Premium account's full tracks, the linked music folder, and — while the Booth runs a night — the
 * Booth's headphones output (never the room). It never edits the Booth: it reads `useBooth` (exposed on `window`
 * by the Booth page once it mounted, so a night can only be running when it is there) and calls its public actions.
 */
import { cortinaSpan } from "@tdj/core";
import { createContext, useCallback, useContext } from "react";
import { create } from "zustand";
import { effectiveSong } from "./audio";
import type { useBooth as UseBooth } from "./booth/store";
import { t } from "./i18n";
import {
  type PlayerList,
  type PlayerTrack,
  type PlayItem,
  playKey,
  previewEndpoint,
  usePlayer,
} from "./player";
import {
  isSpotifyTrackUri,
  noAudioWhy,
  pickSource,
  routeFor,
  type SourcePick,
  stepIndex,
} from "./playSource";
import { markSpotifyBurst } from "./spotifyBurst";
import { useStore } from "./store";
import { toast } from "./toast";
import { cortinaStopSec, type Song } from "./types";

/* ---------------- what this browser can play ---------------- */

interface Access {
  /** Spotify Premium with the streaming scopes (null: not known / not connected) */
  premium: boolean | null;
  /** a Spotify session exists (hosted login or the DJ's own app) */
  connected: boolean;
  /** song / cortina ids the linked music folder matched (a granted folder only) */
  files: Record<string, true>;
  /** rows (play keys) a lookup found nothing for: they show "No audio" */
  missing: Record<string, true>;
  /** rows a live lookup found a preview for (play key → our preview endpoint) */
  found: Record<string, string>;
}
export const usePlayAccess = create<Access>()(() => ({
  premium: null,
  connected: false,
  files: {},
  missing: {},
  found: {},
}));

let accessOnce: Promise<void> | null = null;
/** ask once per tab whether the Spotify session can stream full tracks (the Booth's own rule: product + scopes) */
export function loadPlayAccess(): Promise<void> {
  accessOnce ??= (async () => {
    const tok = useStore.getState().spotifyToken;
    const own = !!tok && tok.expires > Date.now();
    const j = (await fetch("/api/spotify/me")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)) as { user?: { product?: string } | null; scopes?: string[] } | null;
    const user = j?.user ?? null;
    const scopes = Array.isArray(j?.scopes) ? j.scopes : null;
    const streaming =
      !scopes ||
      ["streaming", "user-modify-playback-state", "user-read-playback-state"].every((x) =>
        scopes.includes(x),
      );
    usePlayAccess.setState({
      connected: !!user || own,
      premium: user ? (user.product === "premium" && streaming ? true : user.product ? false : null) : null,
    });
  })();
  return accessOnce;
}

/* the linked music folder: the Booth's LocalAdapter class, our own instance (the Booth's file is not touched) */
type Local = {
  fileFor: (id: string) => Promise<File | null>;
  matches: Record<string, unknown>;
  permission: string;
};
let local: Promise<Local | null> | null = null;
function localFiles(): Promise<Local | null> {
  local ??= import("./booth/sources/local")
    .then(async (m) => {
      const a = new m.LocalAdapter(() => null);
      await a.restore();
      if (a.permission === "granted")
        usePlayAccess.setState({ files: Object.fromEntries(Object.keys(a.matches).map((k) => [k, true])) });
      return a as unknown as Local;
    })
    .catch(() => null);
  return local;
}

/* ---------------- the Booth (read, never edited) ---------------- */

type BoothStore = typeof UseBooth;
const booth = (): BoothStore | null =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { __tdjBooth?: BoothStore }).__tdjBooth ?? null);
/** a night is running in the Booth (it keeps playing while the DJ is on another page) */
export const boothNightRunning = () => routeFor(booth()?.getState() ?? null) === "headphones";

/* ---------------- sources ---------------- */

const songOf = (s: Song) => effectiveSong(s, useStore.getState().overrides);
const spotifyUriOf = (it: PlayItem): string | null => {
  if (it.kind === "cortina") return it.cortina.spotify?.uri ?? null;
  const patch = useStore.getState().overrides.songs?.[it.song.id];
  return patch?.spotify?.uri ?? it.song.spotify?.uri ?? null;
};
const previewOf = (it: PlayItem): string | null => {
  const r = it.kind === "song" ? songOf(it.song).resolved : it.cortina.resolved;
  return r?.previewUrl ? previewEndpoint(r) : null;
};

/**
 * A side or cortina without a cached preview: the keyless lookup the "Find on services" sheet and CortinaPreview use
 * (Deezer through /api/resolve), once per row; what it finds (or not) is remembered for the tab.
 */
const lookups = new Map<string, Promise<string | null>>();
function lookupPreview(it: PlayItem): Promise<string | null> {
  const key = playKey(it);
  let p = lookups.get(key);
  if (!p) {
    const body =
      it.kind === "cortina"
        ? { title: it.cortina.title, orchestra: it.cortina.artist }
        : {
            id: it.song.id,
            title: it.song.title,
            orchestra: it.song.orchestra,
            singer: it.song.singer ?? "",
          };
    p = fetch("/api/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : {}))
      .then(
        (j: {
          candidates?: Array<{
            provider: string;
            id: string;
            previewUrl: string | null;
            confidence?: number;
          }>;
        }) => {
          const hit = (j.candidates ?? []).find(
            (x) => x.provider === "deezer" && x.previewUrl && (x.confidence ?? 1) >= 0.5,
          );
          return hit
            ? previewEndpoint({ provider: "deezer", id: hit.id } as NonNullable<Song["resolved"]>)
            : null;
        },
      )
      .catch(() => null)
      .then((ref) => {
        usePlayAccess.setState((a) =>
          ref ? { found: { ...a.found, [key]: ref } } : { missing: { ...a.missing, [key]: true } },
        );
        return ref;
      });
    lookups.set(key, p);
  }
  return p;
}

/**
 * Synchronously: may the row play? False (the "No audio" hint) only once we know: no Premium track, no cached or
 * found preview, no file, and the lookup came back empty. A row never looked up is assumed playable (the tap asks).
 */
export function audibleNow(it: PlayItem, a: Access = usePlayAccess.getState()): boolean {
  const key = playKey(it);
  if (!a.missing[key]) return true;
  return !!pickSource({
    premium: a.premium,
    spotifyUri: spotifyUriOf(it),
    previewRef: previewOf(it) ?? a.found[key] ?? null,
    file: !!a.files[it.kind === "song" ? it.song.id : it.cortina.id],
  });
}

/** the cortina's start (its chorus, or the DJ's own) and stop (absolute seconds) as the night plays it (core) */
export function cortinaWindow(
  c: Extract<PlayItem, { kind: "cortina" }>["cortina"],
  app: {
    settings: Parameters<typeof cortinaStopSec>[0] & { cortinaHookStart?: boolean };
    edits?: Record<string, import("@tdj/core").CortinaEdit> | null;
  } = {
    settings: useStore.getState().settings,
    edits: useStore.getState().playlist?.booth?.cortinaEdits,
  },
) {
  const sp = cortinaSpan(c, {
    cortinaStopSec: cortinaStopSec(app.settings, c.lengthSec),
    cortinaEdits: app.edits ?? undefined,
    cortinaHookStart: app.settings.cortinaHookStart === false ? false : undefined,
  });
  return { start: sp.trimIn, stop: sp.stopSec };
}

function baseTrack(it: PlayItem): Omit<PlayerTrack, "source"> {
  if (it.kind === "song") {
    const s = songOf(it.song);
    return {
      id: playKey(it),
      title: s.title,
      orchestra: s.orchestra,
      singer: s.singer,
      year: s.year,
      where: it.where,
    };
  }
  const c = it.cortina;
  const w = cortinaWindow(c);
  return {
    id: playKey(it),
    title: c.title,
    orchestra: c.artist,
    year: c.year ?? null,
    kind: "cortina",
    startSec: w.start,
    stopSec: w.stop,
    where: it.where,
  };
}

/** the source this tap plays, in the order of `pickSource`; async steps (a cortina lookup, the folder) last */
async function sourceOf(it: PlayItem): Promise<SourcePick | { kind: "file-url"; ref: string }> {
  const a = usePlayAccess.getState();
  const uri = spotifyUriOf(it);
  if (isSpotifyTrackUri(uri) && a.premium === null && a.connected) await loadPlayAccess();
  let previewRef = previewOf(it);
  previewRef ??= usePlayAccess.getState().found[playKey(it)] ?? null;
  if (!previewRef) previewRef = await lookupPreview(it);
  const first = pickSource({ premium: usePlayAccess.getState().premium, spotifyUri: uri, previewRef });
  if (first) return first;
  const folder = await localFiles();
  const file = await folder?.fileFor(it.kind === "song" ? it.song.id : it.cortina.id).catch(() => null);
  return file ? { kind: "file-url", ref: URL.createObjectURL(file) } : null;
}

/* ---------------- the external players: the Spotify device and the Booth's headphones ---------------- */

type Sp = {
  connect: () => Promise<void>;
  playUri: (uri: string, ms: number) => Promise<void>;
  pauseDevice: () => Promise<void>;
  remoteState: () => Promise<{ playing: boolean; positionMs: number; durationMs: number } | null>;
};
let ownSpotify: Sp | null = null;
/** the Booth's Spotify adapter when the Booth made one, else our own instance of the same class */
async function spotifyAdapter(): Promise<Sp> {
  const m = await import("./booth/sources/spotify");
  const room = m.spotifyRoom() as unknown as Sp | null;
  if (room) return room;
  ownSpotify ??= new m.SpotifyAdapter() as unknown as Sp;
  return ownSpotify;
}
let poll: ReturnType<typeof setInterval> | null = null;
const stopPoll = () => {
  if (poll) clearInterval(poll);
  poll = null;
};
function pollSpotify(id: string) {
  stopPoll();
  poll = setInterval(async () => {
    const p = usePlayer.getState();
    if (p.track?.id !== id || p.track.source.kind !== "spotify-full") return stopPoll();
    if (!p.playing) return;
    const sp = await spotifyAdapter();
    const st = await sp.remoteState().catch(() => null);
    if (st && usePlayer.getState().track?.id === id)
      usePlayer.getState()._tick(st.positionMs / 1000, st.durationMs / 1000);
  }, 1000);
}

let cueUnsub: (() => void) | null = null;
function watchCue(id: string) {
  cueUnsub?.();
  const b = booth();
  if (!b) return;
  cueUnsub = b.subscribe((s, prev) => {
    const p = usePlayer.getState();
    if (p.track?.id !== id || p.track.source.kind !== "cue") return void cueUnsub?.();
    if (s.cuePos !== prev.cuePos && s.audition) p._tick(s.cuePos.at, s.cuePos.of);
    // the pre-listen ended (or the Booth stopped it): the mini player shows paused
    if (!s.audition && prev.audition && p.playing) usePlayer.setState({ playing: false });
  });
}

/** the mini player's seek on a track another player sounds */
export async function externalSeek(sec: number) {
  const p = usePlayer.getState();
  const tr = p.track;
  if (!tr) return;
  p.seek(sec);
  if (tr.source.kind === "spotify-full") {
    const sp = await spotifyAdapter();
    await sp.playUri(tr.source.ref, sec * 1000).catch(() => {});
    if (!usePlayer.getState().playing) usePlayer.setState({ playing: true });
  } else if (tr.source.kind === "cue") {
    await cueTo(tr, sec);
  }
}

async function cueTo(tr: PlayerTrack, startSec: number): Promise<string | null> {
  const b = booth();
  const it = items.get(tr.id);
  if (!b || !it) return t("play.headphones_ended");
  const entity = it.kind === "song" ? songOf(it.song) : it.cortina;
  const why = await b.getState().prelisten({ song: entity as Song }, { startSec });
  if (why) {
    usePlayer.setState({ playing: false });
    return why;
  }
  usePlayer.setState({ playing: true });
  watchCue(tr.id);
  return null;
}

/** play / pause on an external track follows the store (the mini player's button, a second tap on the row) */
let lastPlaying: { id: string | null; playing: boolean } = { id: null, playing: false };
if (typeof window !== "undefined")
  usePlayer.subscribe((s) => {
    const id = s.track?.id ?? null;
    const was = lastPlaying;
    lastPlaying = { id, playing: s.playing };
    if (was.id !== id) {
      // the previous external track stops when another (or nothing) takes over
      const prev = was.id ? sounding.get(was.id) : undefined;
      if (prev === "spotify-full") void spotifyAdapter().then((sp) => sp.pauseDevice());
      if (prev === "cue") booth()?.getState().stopAudition();
      if (was.id) sounding.delete(was.id);
      return;
    }
    if (!s.track || was.playing === s.playing) return;
    const kind = s.track.source.kind;
    if (kind === "spotify-full") {
      const uri = s.track.source.ref;
      void spotifyAdapter().then((sp) =>
        s.playing ? sp.playUri(uri, s.position * 1000).catch(() => {}) : sp.pauseDevice(),
      );
      if (s.playing) pollSpotify(s.track.id);
    } else if (kind === "cue") {
      if (s.playing) void cueTo(s.track, s.position).then((why) => why && toast(why));
      else booth()?.getState().stopAudition();
    }
  });
/** which external player is sounding a track id (so a hand-over stops it) */
const sounding = new Map<string, "spotify-full" | "cue">();
/** the items behind the tracks we started (a cue resume needs the song back) */
const items = new Map<string, PlayItem>();

/* ---------------- the tap ---------------- */

let seq = 0;
/**
 * A tap on a row: the playing row pauses (and a paused one resumes); any other row plays from the list it is in,
 * so the mini player's previous / next step through that tanda or night. Resolves to false when nothing played (the
 * toast said why).
 */
export async function tapPlay(
  it: PlayItem,
  list?: { label: string; items: PlayItem[] } | null,
  o: { find?: () => void } = {},
) {
  const key = playKey(it);
  const p = usePlayer.getState();
  if (p.track?.id === key) {
    p.toggle();
    return true;
  }
  const items0 = list?.items.some((x) => playKey(x) === key) ? list.items : [it];
  const index = items0.findIndex((x) => playKey(x) === key);
  return playFrom({ label: list?.label ?? "", items: items0, index }, o);
}

/** previous / next in the list the playing row came from */
export async function stepList(delta: number) {
  const l = usePlayer.getState().list;
  if (!l) return false;
  // past a row with no audio, to the next one that plays
  for (
    let i = stepIndex(l.items.length, l.index, delta);
    i !== null;
    i = stepIndex(l.items.length, i, delta)
  ) {
    if (await playFrom({ ...l, index: i }, { quiet: true })) return true;
  }
  return false;
}

async function playFrom(list: PlayerList, o: { find?: () => void; quiet?: boolean }): Promise<boolean> {
  const it = list.items[list.index];
  if (!it) return false;
  const n = ++seq;
  const base = baseTrack(it);
  items.set(base.id, it);
  // a night in the Booth: the headphones only, never the room
  if (boothNightRunning()) {
    const track: PlayerTrack = { ...base, source: { kind: "cue", ref: base.id } };
    usePlayer.getState().play(track, list);
    sounding.set(base.id, "cue");
    const why = await cueTo(track, base.startSec ?? 0);
    if (n !== seq) return true;
    if (why) {
      usePlayer.getState().close();
      toast(t("play.booth_running", { why }));
      return false;
    }
    if (!o.quiet) toast(t("play.in_headphones"));
    return true;
  }
  const src = await sourceOf(it);
  if (n !== seq) return true;
  if (!src) {
    if (!o.quiet) {
      const a = usePlayAccess.getState();
      const why = noAudioWhy({ connected: a.connected, premium: a.premium, spotifyUri: spotifyUriOf(it) });
      const text = t(`play.${why}`, { title: base.title });
      if (o.find) toast(text, o.find, t("play.find"));
      else toast(text);
    }
    return false;
  }
  if (src.kind === "spotify-full") {
    markSpotifyBurst();
    try {
      const sp = await spotifyAdapter();
      await sp.connect();
      await sp.playUri(src.uri, (base.startSec ?? 0) * 1000);
    } catch (e) {
      // the device refused: the 30 s preview (or the file) instead, and say so
      if (n !== seq) return true;
      const fallback = pickSource({ premium: false, previewRef: previewOf(it) });
      if (fallback?.kind === "preview") {
        toast(t("play.spotify_failed_preview", { why: e instanceof Error ? e.message : "" }));
        usePlayer.getState().play({ ...base, source: { kind: "preview", ref: fallback.ref } }, list);
        return true;
      }
      toast(e instanceof Error ? e.message : t("play.no_audio", { title: base.title }));
      return false;
    }
    if (n !== seq) return true;
    usePlayer.getState().play({ ...base, source: { kind: "spotify-full", ref: src.uri } }, list);
    sounding.set(base.id, "spotify-full");
    pollSpotify(base.id);
    return true;
  }
  const source =
    src.kind === "preview"
      ? { kind: "preview" as const, ref: src.ref }
      : { kind: "file" as const, ref: (src as { ref: string }).ref };
  usePlayer.getState().play({ ...base, source }, list);
  return true;
}

/* ---------------- rows ---------------- */

/** the list rows of a page play from (the night on Compose, the tanda on a card, the results of a search) */
export const PlayListContext = createContext<{ label: string; items: PlayItem[] } | null>(null);

/**
 * A row's play state and its tap. `state`: "playing" (tinted, animated bars), "paused" (the current item, paused),
 * or null. `audible` false shows the "No audio" hint.
 */
export function useTapPlay(it: PlayItem | null, list?: { label: string; items: PlayItem[] } | null) {
  const ctx = useContext(PlayListContext);
  const key = it ? playKey(it) : "";
  const state = usePlayer((s) => (key && s.track?.id === key ? (s.playing ? "playing" : "paused") : null));
  const audible = usePlayAccess((a) => (it ? audibleNow(it, a) : false));
  // the store's overrides decide the preview (a "Find on services" pick): re-read on change
  useStore((s) => (it?.kind === "song" ? s.overrides.songs?.[it.song.id] : null));
  const use = list ?? ctx;
  const tap = useCallback(
    (o?: { find?: () => void }) => (it ? tapPlay(it, use, o) : Promise.resolve(false)),
    [it, use],
  );
  return { state, playing: state === "playing", audible, tap };
}

/** the items of a night in play order: opening, each tanda's songs and its cortina, closing */
export function nightItems(p: {
  opening?: Song | null;
  closing?: Song | null;
  tandas: Array<{ songs: Song[]; cortina?: import("./types").Cortina | null }>;
}): PlayItem[] {
  const out: PlayItem[] = [];
  if (p.opening) out.push({ kind: "song", song: p.opening, where: t("play.opening") });
  p.tandas.forEach((tn, i) => {
    const where = t("play.tanda", { n: i + 1 });
    for (const s of tn.songs) out.push({ kind: "song", song: s, where });
    if (tn.cortina)
      out.push({ kind: "cortina", cortina: tn.cortina, where: t("play.cortina_after", { n: i + 1 }) });
  });
  if (p.closing) out.push({ kind: "song", song: p.closing, where: t("play.closing") });
  return out;
}
