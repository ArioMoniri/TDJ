"use client";
import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { invoke, nativeInfo } from "@/lib/app/native";
import { APP } from "@/lib/app/target";
import { type MsgKey, t } from "@/lib/i18n";
import { newCode, normalizeCode } from "./code";
import { b64url, deriveKeys, type SyncKeys } from "./crypto";
import { type Persist, type Report, type SpaceDevice, SyncEngine, type Transport } from "./engine";
import { onLocalChange, storeSide, storesReady } from "./local";
import {
  type ICloudStatus,
  icloudDrop,
  icloudStatus,
  icloudTransport,
  SyncHttpError,
  serverTransport,
} from "./transports";

/**
 * Sync on this device (Settings → Sync, docs/SYNC.md): the code, which transports it uses, the loop that runs a
 * round after every change and every half minute while the page is visible, and what Settings shows.
 *
 * The code is kept in this browser's (or app's) local storage and nowhere else: not on the server, not in iCloud.
 */
export type ServerMode = "default" | "custom" | "off";
export interface SyncConfig {
  code: string;
  on: boolean;
  server: { mode: ServerMode; url: string };
  /** the Apple apps: also mirror into iCloud Documents (on unless turned off) */
  icloud: boolean;
}
export type SyncStatus = "off" | "idle" | "syncing" | "ok" | "error" | "replaced";

const CONFIG_KEY = "tdj-sync-v1";
const DEVICE_KEY = "tdj-sync-device-v1";
const ROUND_MS = 30_000;

/** the build's default sync server (NEXT_PUBLIC_TDJ_SYNC_URL; empty by default, never committed) */
export const BUILD_SYNC_URL = (process.env.NEXT_PUBLIC_TDJ_SYNC_URL ?? "").replace(/\/$/, "");

function readConfig(): SyncConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "null") as SyncConfig | null;
    if (c && typeof c.code === "string" && normalizeCode(c.code))
      return {
        code: normalizeCode(c.code)!,
        on: c.on !== false,
        server: { mode: c.server?.mode ?? "default", url: c.server?.url ?? "" },
        icloud: c.icloud !== false,
      };
  } catch {}
  return null;
}
function writeConfig(c: SyncConfig | null) {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {}
}
/** this device's opaque tag (kept across Leave and Join: it names no one) */
export function deviceId(): string {
  try {
    const cur = localStorage.getItem(DEVICE_KEY);
    if (cur && /^[A-Za-z0-9_-]{8,32}$/.test(cur)) return cur;
    const id = b64url(globalThis.crypto.getRandomValues(new Uint8Array(12)));
    localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return "nostorage";
  }
}

/** "iPhone", "iPad", "Mac", "Web (Chrome)": what other devices list this one as */
export function deviceLabel(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): {
  name: string;
  platform: string;
} {
  const touchMac = typeof navigator !== "undefined" && navigator.maxTouchPoints > 1 && /Macintosh/.test(ua);
  const kind = /iPhone/.test(ua)
    ? "iphone"
    : /iPad/.test(ua) || touchMac
      ? "ipad"
      : /Macintosh/.test(ua)
        ? "mac"
        : /Android/.test(ua)
          ? "android"
          : /Windows/.test(ua)
            ? "windows"
            : "other";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "";
  const name = t(`devsync.device_${kind}` as MsgKey);
  return {
    name: APP ? name : browser ? `${name} · ${browser}` : name,
    platform: APP ? `app-${kind}` : `web-${kind}`,
  };
}

const persist: Persist = {
  get: (k) => get(`tdj-sync-v1:${k}`),
  set: (k, v) => set(`tdj-sync-v1:${k}`, v),
  del: (k) => del(`tdj-sync-v1:${k}`),
};

/** where the server transport goes: "" = this site (the web app), an origin, or null = none */
export async function serverBase(c: Pick<SyncConfig, "server">): Promise<string | null> {
  if (c.server.mode === "off") return null;
  if (c.server.mode === "custom") return c.server.url ? c.server.url.replace(/\/$/, "") : null;
  if (BUILD_SYNC_URL) return BUILD_SYNC_URL;
  if (!APP) return "";
  // the apps: the TDJ server the DJ linked (Settings → Connections), else none (iCloud and files only)
  const linked = (await nativeInfo().catch(() => ({ linkedServer: null }))).linkedServer;
  return linked ? linked.replace(/\/$/, "") : null;
}

/** a custom server address as typed: an https origin (http only for this computer) */
export function cleanServerUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(local && u.protocol === "http:")) return null;
    return u.origin;
  } catch {
    return null;
  }
}

interface SyncState {
  ready: boolean;
  config: SyncConfig | null;
  status: SyncStatus;
  lastSync: string | null;
  error: string | null;
  devices: SpaceDevice[];
  /** server-side last-seen times by device id (ms) */
  serverSeen: Record<string, number>;
  icloud: ICloudStatus;
  /** the server chosen before sync is turned on (used by create / join) */
  pendingServer: SyncConfig["server"];
  /** the server this device syncs with ("" = this site), null = none */
  server: string | null;
  init: () => Promise<void>;
  /** turn sync on with a new code (this device's library becomes the space) */
  create: () => Promise<string>;
  /** join another device's space; false when the code is not valid */
  join: (code: string) => Promise<boolean>;
  setOn: (on: boolean) => Promise<void>;
  setServer: (mode: ServerMode, url?: string) => Promise<boolean>;
  setICloud: (on: boolean) => Promise<void>;
  syncNow: () => Promise<Report | null>;
  /** stop syncing on this device; the space and the other devices keep going */
  leave: () => Promise<void>;
  /** a new code for every device: the library moves to a new space, the old one is deleted */
  reset: () => Promise<string | null>;
}

let engine: SyncEngine | null = null;
let engineKeys: SyncKeys | null = null;

async function transportsFor(
  c: SyncConfig,
  keys: SyncKeys,
): Promise<{ list: Transport[]; server: string | null; icloud: ICloudStatus }> {
  const list: Transport[] = [];
  const server = await serverBase(c);
  if (server !== null) list.push(serverTransport({ base: server, id: keys.id, device: deviceId() }));
  let ic: ICloudStatus = { available: false, reason: "unsupported" };
  if (APP) {
    ic = await icloudStatus(invoke);
    if (ic.available && c.icloud) list.push(await icloudTransport(keys.id, invoke));
  }
  return { list, server, icloud: ic };
}

async function engineFor(c: SyncConfig): Promise<SyncEngine> {
  const keys = engineKeys && engine ? engineKeys : await deriveKeys(c.code);
  const { list, server, icloud } = await transportsFor(c, keys);
  useSync.setState({ server, icloud });
  if (engine && engineKeys?.id === keys.id) {
    engine.setTransports(list);
    return engine;
  }
  engineKeys = keys;
  engine = new SyncEngine(keys, { id: deviceId(), ...deviceLabel() }, storeSide, list, persist);
  return engine;
}

const errorText = (r: Report): { text: string | null; replaced: boolean } => {
  const bad = r.transports.filter((x) => !x.ok);
  if (!bad.length) return { text: null, replaced: false };
  const replaced = bad.some((x) => /replaced|410/.test(x.error ?? ""));
  if (replaced) return { text: t("devsync.replaced"), replaced };
  if (bad.length < r.transports.length) return { text: null, replaced: false };
  return { text: t("devsync.error_unreachable"), replaced: false };
};

export const useSync = create<SyncState>()((setState, getState) => ({
  ready: false,
  config: null,
  status: "off",
  lastSync: null,
  error: null,
  devices: [],
  serverSeen: {},
  icloud: { available: false, reason: "unsupported" },
  server: null,
  pendingServer: { mode: "default", url: "" },
  init: async () => {
    if (getState().ready) return;
    const config = readConfig();
    setState({ ready: true, config, status: config?.on ? "idle" : "off" });
    if (!config) {
      if (APP) setState({ icloud: await icloudStatus(invoke) });
      setState({ server: await serverBase({ server: { mode: "default", url: "" } }) });
      return;
    }
    const e = await engineFor(config);
    await e.load();
    setState({ devices: e.devices() });
  },
  create: async () => {
    const code = newCode();
    const config: SyncConfig = {
      code,
      on: true,
      server: getState().config?.server ?? getState().pendingServer,
      icloud: true,
    };
    writeConfig(config);
    engine = null;
    setState({ config, status: "idle", error: null });
    await getState().syncNow();
    return code;
  },
  join: async (raw) => {
    const code = normalizeCode(raw);
    if (!code) return false;
    const cur = getState().config;
    if (cur && cur.code !== code && engine) await engine.forget();
    const config: SyncConfig = {
      code,
      on: true,
      server: cur?.server ?? getState().pendingServer,
      icloud: cur?.icloud ?? true,
    };
    writeConfig(config);
    engine = null;
    setState({ config, status: "idle", error: null });
    await getState().syncNow();
    return true;
  },
  setOn: async (on) => {
    const c = getState().config;
    if (!c) return;
    const config = { ...c, on };
    writeConfig(config);
    setState({ config, status: on ? "idle" : "off" });
    if (on) await getState().syncNow();
  },
  setServer: async (mode, url = "") => {
    const c = getState().config;
    let clean = "";
    if (mode === "custom") {
      const u = cleanServerUrl(url);
      if (!u) return false;
      clean = u;
    }
    const server = { mode, url: clean };
    if (c) {
      const config = { ...c, server };
      writeConfig(config);
      setState({ config });
      await getState().syncNow();
    } else setState({ pendingServer: server, server: await serverBase({ server }) });
    return true;
  },
  setICloud: async (on) => {
    const c = getState().config;
    if (!c) return;
    const config = { ...c, icloud: on };
    writeConfig(config);
    setState({ config });
    await getState().syncNow();
  },
  syncNow: async () => {
    const c = getState().config;
    if (!c?.on || !storesReady()) return null;
    setState({ status: "syncing" });
    try {
      const e = await engineFor(c);
      if (getState().server === null && !(getState().icloud.available && c.icloud)) {
        setState({ status: "error", error: t("devsync.error_no_transport"), devices: e.devices() });
        // nothing to sync with, but the log keeps this device's changes for when there is
        e.capture();
        await e.save();
        return null;
      }
      const r = await e.sync();
      const err = errorText(r);
      const seen = r.transports.find((x) => x.devices)?.devices ?? getState().serverSeen;
      setState({
        status: err.replaced ? "replaced" : err.text ? "error" : "ok",
        error: err.text,
        lastSync: r.transports.some((x) => x.ok) ? r.at : getState().lastSync,
        devices: e.devices(),
        serverSeen: seen,
      });
      return r;
    } catch (e) {
      setState({ status: "error", error: (e as Error).message });
      return null;
    }
  },
  leave: async () => {
    if (engine) await engine.forget();
    engine = null;
    engineKeys = null;
    writeConfig(null);
    setState({ config: null, status: "off", devices: [], serverSeen: {}, lastSync: null, error: null });
  },
  reset: async () => {
    const c = getState().config;
    if (!c) return null;
    const old = engine ?? (await engineFor(c));
    await old.load();
    // one last round, so the new space starts from everything the old one held
    await old.sync().catch(() => null);
    const records = old.records();
    const oldKeys = engineKeys!;
    const oldBase = await serverBase(c);
    const code = newCode();
    const config: SyncConfig = { ...c, code };
    engine = null;
    engineKeys = null;
    const fresh = await engineFor(config);
    fresh.absorb(records);
    writeConfig(config);
    setState({ config, status: "idle", error: null });
    const r = await getState().syncNow();
    if (r?.transports.some((x) => x.ok)) {
      // the old space: deleted on the server (devices still on it are told the code was replaced), out of iCloud
      if (oldBase !== null)
        await fetch(`${oldBase}/api/sync`, {
          method: "DELETE",
          headers: { "x-tdj-sync-id": oldKeys.id, "x-tdj-device": deviceId() },
        }).catch(() => {});
      if (APP) await icloudDrop(oldKeys.id, invoke);
      await old.forget();
    }
    return code;
  },
}));

/* ---------- the loop ---------- */

let started = false;
/** Starts syncing on this page (components/Boot.tsx): after the stores load, on every change, every half minute. */
export function startSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  // a code in the address (#sync=… from a QR code or a link) opens Settings → Sync with it; it never reaches a server
  void useSync
    .getState()
    .init()
    .then(() => loop());
}

function loop() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  const schedule = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
  const run = async () => {
    const s = useSync.getState();
    if (!s.config?.on) return schedule(ROUND_MS);
    if (!storesReady() || document.visibilityState === "hidden") return schedule(ROUND_MS);
    const r = await s.syncNow();
    failures = r?.transports.every((x) => x.ok) ? 0 : Math.min(failures + 1, 6);
    if (useSync.getState().status === "replaced") return;
    schedule(ROUND_MS * 2 ** failures);
  };
  onLocalChange(() => {
    if (useSync.getState().config?.on) schedule(2500);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") schedule(500);
  });
  window.addEventListener("online", () => schedule(500));
  // the stores load their data once (Boot): the first round waits for it
  schedule(1500);
}

export { SyncHttpError };
