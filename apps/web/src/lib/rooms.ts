"use client";
import {
  cleanRoomUser,
  diffNight,
  exportNight,
  isUnchanged,
  type MissingItem,
  type NightFile,
  normalizeRoomCode,
  RoomClient,
  RoomError,
  type RoomLogEntry,
  type RoomOp,
  type RoomView,
  sameJson,
} from "@tdj/core";
import { create } from "zustand";
import { t } from "@/lib/i18n";
import { makeSnapshot } from "./history";
import { useStore } from "./store";
import { toast } from "./toast";
import type { Playlist } from "./types";

/**
 * The DJ's side of a room: who they are (a username, kept in this browser), the room they are in, the rooms they
 * were in before, and the sync loop. The loop diffs the night in the composer against the last synced one and
 * sends the edits as ops; otherwise it polls the room and brings other DJs' edits into the composer. Every page
 * edits the same night (Compose, the Booth, the Rooms page), so a room needs nothing from them.
 */
export interface RoomRef {
  code: string;
  /** "" = this site */
  server: string;
  name: string;
  lastSeen: string;
}
interface Saved {
  user: string;
  active: { code: string; server: string } | null;
  rooms: RoomRef[];
}
const KEY = "tdj-rooms-v1";
const load = (): Saved => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (s && typeof s === "object")
      return { user: s.user ?? "", active: s.active ?? null, rooms: s.rooms ?? [] };
  } catch {}
  return { user: "", active: null, rooms: [] };
};
const save = (s: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
};

export type RoomStatus = "idle" | "connecting" | "live" | "offline";
export interface RoomInfo {
  code: string;
  server: string;
  name: string;
  rev: number;
  createdBy: string;
  createdAt: string;
  presence: string[];
  slots: string[];
  hasNight: boolean;
}

interface RoomSession {
  ready: boolean;
  user: string;
  active: { code: string; server: string } | null;
  rooms: RoomRef[];
  info: RoomInfo | null;
  log: RoomLogEntry[];
  missing: MissingItem[];
  status: RoomStatus;
  error: string | null;
  /** the room has no night yet: the DJ's night is shared on their next change, or with "Share my night" */
  waitingForNight: boolean;
  boot: () => void;
  setUser: (u: string) => void;
  create: (name: string, withNight: boolean) => Promise<boolean>;
  join: (code: string, server?: string) => Promise<boolean>;
  leave: () => void;
  forget: (code: string) => void;
  rename: (name: string) => Promise<void>;
  shareNight: () => Promise<void>;
  /** the slot the DJ is moving (named in the log); set right before the reorder reaches the composer */
  moveHint: (slot: string) => void;
  /** a previous room's whole log (read-only) */
  fetchLog: (ref: RoomRef) => Promise<{ log: RoomLogEntry[]; name: string } | null>;
}

/* the sync engine's own state (not rendered) */
let client: RoomClient | null = null;
let synced: { night: NightFile | null; slots: string[]; rev: number } = { night: null, slots: [], rev: 0 };
/** the composer's night when the room had none: shared once it changes */
let held: NightFile | null = null;
let moved: string | null = null;
let busy = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let failures = 0;

const local = (): NightFile | null => {
  const p = useStore.getState().playlist;
  return p ? exportNight(p) : null;
};

function remember(ref: RoomRef) {
  const s = useRooms.getState();
  const rooms = [ref, ...s.rooms.filter((r) => !(r.code === ref.code && r.server === ref.server))].slice(
    0,
    30,
  );
  useRooms.setState({ rooms });
  save({ user: s.user, active: s.active, rooms });
}

function infoOf(v: RoomView, server: string): RoomInfo {
  return {
    code: v.code,
    server,
    name: v.name,
    rev: v.rev,
    createdBy: v.createdBy,
    createdAt: v.createdAt,
    presence: v.presence,
    slots: v.slots,
    hasNight: !!v.night,
  };
}

const comings = new Set(["join", "leave"]);
/** what other DJs did, as one toast */
function announce(entries: RoomLogEntry[], me: string) {
  const theirs = entries.filter((e) => e.by !== me && !comings.has(e.kind));
  if (!theirs.length) {
    const j = [...entries].reverse().find((e) => e.by !== me && comings.has(e.kind));
    if (j) toast(t(j.kind === "leave" ? "rooms.left_the_room" : "rooms.joined_the_room", { name: j.by }));
    return;
  }
  const e = theirs[theirs.length - 1]!;
  toast(
    theirs.length === 1
      ? `${e.by} ${e.text}`
      : t("rooms.and_others_made_changes", { by: e.by, length: theirs.length }),
  );
}

function applyView(v: RoomView, o: { entries?: boolean } = {}) {
  const s = useRooms.getState();
  if (!s.active) return;
  const log = [...s.log];
  for (const e of v.log)
    if (!log.some((x) => x.rev === e.rev && x.text === e.text && x.by === e.by)) log.push(e);
  log.sort((a, b) => a.rev - b.rev);
  useRooms.setState({
    info: infoOf(v, s.active.server),
    log: log.slice(-400),
    status: "live",
    error: null,
    ...(v.missing ? { missing: v.missing } : {}),
  });
  if (o.entries) announce(v.log, s.user);
  remember({ code: v.code, server: s.active.server, name: v.name, lastSeen: new Date().toISOString() });
}

/** brings the room's night into the composer (the DJ's own unsynced edits are never overwritten) */
function adopt(v: RoomView, before: Playlist | null) {
  synced = { night: v.night, slots: v.slots, rev: v.rev };
  if (!v.night) {
    held = local();
    useRooms.setState({ waitingForNight: true });
    return;
  }
  useRooms.setState({ waitingForNight: false });
  held = null;
  const p = v.playlist ?? null;
  if (!p) return;
  // compare like with like: the night as this catalogue resolves it
  synced = { night: exportNight(p), slots: v.slots, rev: v.rev };
  const st = useStore.getState();
  if (st.playlist !== before) return; // the DJ edited meanwhile: the next tick sends that edit first
  if (!sameJson(local(), synced.night)) st.setPlaylist(p);
}

async function tick() {
  if (busy || !client) return;
  busy = true;
  const before = useStore.getState().playlist;
  try {
    const mine = local();
    let ops: RoomOp[] = [];
    if (held) {
      if (!sameJson(mine, held)) ops = mine ? [{ type: "night", night: mine, base: synced.rev }] : [];
    } else if (mine) ops = diffNight(synced, mine); // (an emptied composer never clears the room's night)
    if (moved) {
      for (const op of ops) if (op.type === "order") op.moved = moved;
      moved = null;
    }
    let v: RoomView | null = null;
    if (ops.length) {
      v = await client.send(ops, { since: synced.rev });
      applyView(v, { entries: true });
      if (sameJson(v.night, mine)) {
        synced = { night: mine, slots: v.slots, rev: v.rev };
        held = null;
        useRooms.setState({ waitingForNight: !mine });
        v = null;
      }
    } else {
      const r = await client.get({ since: synced.rev });
      if (isUnchanged(r)) {
        const info = useRooms.getState().info;
        if (info) useRooms.setState({ info: { ...info, presence: r.presence }, status: "live", error: null });
      } else {
        applyView(r, { entries: true });
        v = r;
      }
    }
    if (v) {
      const full = await client.get({ since: synced.rev, resolve: true });
      if (!isUnchanged(full)) {
        applyView(full);
        adopt(full, before);
      }
    }
    failures = 0;
  } catch (e) {
    failures++;
    if (e instanceof RoomError && e.status === 404) {
      useRooms.setState({ status: "offline", error: t("rooms.this_room_no_longer_exists") });
      stop();
    } else useRooms.setState({ status: "offline", error: (e as Error).message });
  } finally {
    busy = false;
  }
}

function schedule() {
  if (timer) clearTimeout(timer);
  if (!client) return;
  const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
  const wait = hidden ? 8000 : Math.min(15000, 1500 * 2 ** Math.min(failures, 3));
  timer = setTimeout(async () => {
    await tick();
    schedule();
  }, wait);
}
function stop() {
  if (timer) clearTimeout(timer);
  timer = null;
  client = null;
}

/** joins the room: the room's night replaces the composer's (which is kept in History first) */
async function connect(code: string, server: string, user: string, opening?: RoomView) {
  stop();
  client = new RoomClient({ server, code, user });
  useRooms.setState({
    active: { code: client.code, server },
    status: "connecting",
    error: null,
    log: [],
    missing: [],
  });
  const s = useRooms.getState();
  save({ user: s.user, active: { code: client.code, server }, rooms: s.rooms });
  const first = opening ?? (await client.join());
  applyView(first);
  const before = useStore.getState().playlist;
  const mine = local();
  if (first.night && sameJson(first.night, mine)) {
    synced = { night: mine, slots: first.slots, rev: first.rev };
    held = null;
    useRooms.setState({ waitingForNight: false });
  } else {
    const full = await client.get({ since: 0, resolve: true, log: "all" });
    if (isUnchanged(full)) return;
    useRooms.setState({ log: full.log });
    if (full.night && before) {
      // the DJ's own night stays in History
      const st = useStore.getState();
      if (!st.history.some((h) => h.playlist.id === before.id && h.playlist.createdAt === before.createdAt))
        st.addSnapshot(makeSnapshot(before, before.options, "compose"));
    }
    applyView(full);
    adopt(full, before);
  }
  schedule();
}

export const useRooms = create<RoomSession>()((set, get) => ({
  ready: false,
  user: "",
  active: null,
  rooms: [],
  info: null,
  log: [],
  missing: [],
  status: "idle",
  error: null,
  waitingForNight: false,
  boot: () => {
    if (get().ready) return;
    const s = load();
    set({ ready: true, user: s.user, rooms: s.rooms });
    if (s.active && s.user)
      void connect(s.active.code, s.active.server, s.user).catch((e) =>
        set({ status: "offline", error: (e as Error).message, active: s.active }),
      );
    if (typeof document !== "undefined")
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && client) {
          void tick().then(schedule);
        }
      });
  },
  setUser: (u) => {
    const user = cleanRoomUser(u) ?? "";
    set({ user });
    save({ user, active: get().active, rooms: get().rooms });
  },
  create: async (name, withNight) => {
    const user = get().user;
    if (!user) return false;
    set({ status: "connecting", error: null });
    try {
      const night = withNight ? local() : null;
      const { client: c, view } = await RoomClient.create({ server: "", user, name, night });
      await connect(c.code, "", user, view);
      return true;
    } catch (e) {
      set({ status: "idle", error: (e as Error).message, active: null });
      return false;
    }
  },
  join: async (code0, server = "") => {
    const user = get().user;
    const code = normalizeRoomCode(code0);
    if (!user || !code) {
      set({ error: code ? t("rooms.choose_a_name_first") : t("rooms.that_code_is_six_letters_and") });
      return false;
    }
    set({ status: "connecting", error: null });
    try {
      await connect(code, server, user);
      return true;
    } catch (e) {
      stop();
      set({ status: "idle", error: (e as Error).message, active: null, info: null });
      save({ user, active: null, rooms: get().rooms });
      return false;
    }
  },
  leave: () => {
    // tell the room, so the others' log says so and their presence list drops this DJ at once (wave 2: a leave was
    // never logged); fire and forget: leaving never waits on the network
    const c = client;
    if (c) void c.send([{ type: "leave" }], { since: synced.rev }).catch(() => {});
    stop();
    synced = { night: null, slots: [], rev: 0 };
    held = null;
    set({
      active: null,
      info: null,
      log: [],
      status: "idle",
      error: null,
      waitingForNight: false,
      missing: [],
    });
    save({ user: get().user, active: null, rooms: get().rooms });
  },
  forget: (code) => {
    const rooms = get().rooms.filter((r) => r.code !== code);
    set({ rooms });
    save({ user: get().user, active: get().active, rooms });
  },
  rename: async (name) => {
    if (!client) return;
    try {
      const v = await client.rename(name, synced.rev);
      applyView(v);
    } catch (e) {
      toast((e as Error).message);
    }
  },
  shareNight: async () => {
    if (!client) return;
    const mine = local();
    if (!mine) return;
    held = null;
    synced = { night: null, slots: [], rev: synced.rev };
    await tick();
  },
  moveHint: (slot) => {
    moved = slot;
  },
  fetchLog: async (ref) => {
    try {
      const c = new RoomClient({ server: ref.server, code: ref.code, user: get().user || "guest" });
      const v = await c.get({ since: 0, log: "all" });
      return isUnchanged(v) ? null : { log: v.log, name: v.name };
    } catch {
      return null;
    }
  },
}));

/** the share link of a room on this site */
export function roomShareLink(code: string, server = ""): string {
  const origin = server || (typeof location !== "undefined" ? location.origin : "");
  return `${origin}/rooms?join=${code}`;
}

/** 2026-11, dancer hearts: the sync engine's room client (null when the DJ is in no room) */
export const roomClient = () => client;
