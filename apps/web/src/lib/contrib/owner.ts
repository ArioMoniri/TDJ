"use client";
import type { ContributionItem } from "@tdj/core";
import { create } from "zustand";
import { APP } from "@/lib/app/target";
import { artworkCache } from "@/lib/artwork";
import { templatesNow } from "@/lib/booth/transitionTemplates";
import { downloadBlob } from "@/lib/download";
import { useStore } from "@/lib/store";
import { loadMatches } from "@/lib/youtubeMatches";
import {
  chunkItems,
  collectItems,
  contributionFile,
  countByGroup,
  type DeviceState,
  diffItems,
  type Group,
  hashesOf,
  itemHash,
  itemKey,
  NO_PERSONAL,
  type PersonalChoice,
} from "./collect";

/**
 * Owner contributions from this device (lib/contrib/collect.ts decides what; lib/server/contributions.ts receives).
 * Only a device that has seen the owner session (/admin unlocked on this server, or on the server an app is linked
 * to) ever sends anything: every other DJ's device stays exactly as before — its database on the device (or in its
 * own server row) and nothing shared. The queue is the difference between the store and what the server
 * acknowledged, kept in localStorage `tdj-owner-v1`; when the owner session has expired it simply waits.
 */
const KEY = "tdj-owner-v1";
const ENDPOINT = "/api/owner/contributions";
const DEBOUNCE_MS = 8_000;
const POLL_MS = 3 * 60_000;
const STATUS_TTL_MS = 5 * 60_000;

export interface OwnerPrefs {
  /** this device has seen the owner session */
  device: boolean;
  /** send catalogue changes as they happen */
  auto: boolean;
  personal: PersonalChoice;
  /** item key → hash the server acknowledged */
  sent: Record<string, string>;
  /** item key → hash this device held when it became the owner's (sent only by "Send my existing changes") */
  baseline?: Record<string, string>;
  lastSentAt?: string;
}
const DEFAULT: OwnerPrefs = { device: false, auto: true, personal: NO_PERSONAL, sent: {} };

export function loadPrefs(): OwnerPrefs {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<OwnerPrefs> | null;
    if (!j || typeof j !== "object") return { ...DEFAULT };
    return {
      ...DEFAULT,
      ...j,
      personal: { ...NO_PERSONAL, ...(j.personal ?? {}) },
      sent: j.sent && typeof j.sent === "object" ? j.sent : {},
    };
  } catch {
    return { ...DEFAULT };
  }
}
function savePrefs(p: OwnerPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {}
  useOwner.setState({ prefs: p });
  refreshCounts();
}
export function setOwnerPrefs(patch: Partial<OwnerPrefs>) {
  savePrefs({ ...loadPrefs(), ...patch });
}

export type OwnerStatus = "unknown" | "owner" | "locked" | "unavailable";
interface OwnerUi {
  status: OwnerStatus;
  prefs: OwnerPrefs;
  /** new changes waiting (outside the baseline), and everything not yet acknowledged, per group */
  waiting: number;
  existing: Partial<Record<Group, number>>;
  serverPending: number | null;
  busy: boolean;
  error: string | null;
}
export const useOwner = create<OwnerUi>(() => ({
  status: "unknown",
  prefs: DEFAULT,
  waiting: 0,
  existing: {},
  serverPending: null,
  busy: false,
  error: null,
}));

/* ---------- the device's state ---------- */

/** BYO Spotify matches lib/spotify.ts remembers (`tdj-sp:<id>|<title>|<orchestra>`) */
function spotifyMatches(): DeviceState["spotify"] {
  const out: DeviceState["spotify"] = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith("tdj-sp:")) continue;
      const id = k.slice(7).split("|")[0];
      const v = JSON.parse(localStorage.getItem(k) ?? "null") as {
        uri?: string;
        name?: string;
        artist?: string;
        durationMs?: number;
      } | null;
      if (id && v?.uri)
        out[id] = { uri: v.uri, matched: `${v.artist ?? ""} – ${v.name ?? ""}`, durationMs: v.durationMs };
    }
  } catch {}
  return out;
}
export function deviceState(): DeviceState | null {
  const s = useStore.getState();
  if (!s.overridesReady) return null;
  return {
    overrides: s.overrides,
    memory: s.memory,
    history: s.history,
    youtube: loadMatches(),
    artwork: { ...artworkCache() },
    spotify: spotifyMatches(),
    transitions: (() => {
      const t = templatesNow();
      return { templates: t.templates, defaults: t.defaults };
    })(),
  };
}
const nowIso = () => new Date().toISOString();
function pending(includeBaseline: boolean): ContributionItem[] {
  const st = deviceState();
  if (!st) return [];
  const p = loadPrefs();
  const at = nowIso();
  return diffItems(collectItems(st, p.personal, at), p.sent, { baseline: p.baseline, includeBaseline, at });
}
export function refreshCounts() {
  if (!loadPrefs().device) return;
  const fresh = pending(false).length;
  useOwner.setState({ waiting: fresh, existing: countByGroup(pending(true)) });
}

/* ---------- the server ---------- */

/** resolves once the DJ's database has loaded (Boot), or after 15 s */
function storeReady(): Promise<void> {
  if (useStore.getState().overridesReady) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      off();
      resolve();
    };
    const timer = setTimeout(done, 15_000);
    const off = useStore.subscribe((s) => {
      if (s.overridesReady) done();
    });
  });
}

let checkedAt = 0;
/** GET the owner's queue: 200 only for the owner session. The first time, this device's current state is the baseline. */
export async function checkOwner(force = false): Promise<OwnerStatus> {
  if (!force && Date.now() - checkedAt < STATUS_TTL_MS && useOwner.getState().status !== "unknown")
    return useOwner.getState().status;
  checkedAt = Date.now();
  let status: OwnerStatus = "unavailable";
  let serverPending: number | null = null;
  try {
    const r = await fetch(ENDPOINT, { cache: "no-store", credentials: "same-origin" });
    if (r.ok) {
      const j = (await r.json()) as { owner?: boolean; pending?: number };
      if (j.owner) {
        status = "owner";
        serverPending = typeof j.pending === "number" ? j.pending : null;
      }
    } else if (r.status === 401) status = "locked";
  } catch {}
  if (status === "owner" && !loadPrefs().device) {
    // what is already on this device waits for "Send my existing changes" (with its preview); new edits flow
    await storeReady();
    const st = deviceState();
    const p = loadPrefs();
    if (st && !p.device)
      savePrefs({ ...p, device: true, baseline: hashesOf(collectItems(st, p.personal, nowIso())) });
  }
  useOwner.setState({ status, serverPending, prefs: loadPrefs() });
  refreshCounts();
  return status;
}

/** Sends what is waiting, in batches; each acknowledged batch is recorded at once, so a failure resends only the rest. */
export async function sendPending(
  o: { includeBaseline?: boolean } = {},
): Promise<{ sent: number; error?: string }> {
  if (useOwner.getState().busy) return { sent: 0 };
  const items = pending(!!o.includeBaseline);
  if (!items.length) {
    if (o.includeBaseline) setOwnerPrefs({ baseline: undefined });
    return { sent: 0 };
  }
  useOwner.setState({ busy: true, error: null });
  let sent = 0;
  let error: string | undefined;
  try {
    for (const batch of chunkItems(items)) {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ v: 1, source: APP ? "app" : "web", items: batch }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string; pending?: number };
        error = j.error ?? `HTTP ${r.status}`;
        if (r.status === 401) useOwner.setState({ status: "locked" });
        break;
      }
      const j = (await r.json().catch(() => ({}))) as { pending?: number };
      const p = loadPrefs();
      const next = { ...p.sent };
      for (const it of batch) {
        if (it.value === null) delete next[itemKey(it)];
        else next[itemKey(it)] = itemHash(it);
      }
      savePrefs({ ...p, sent: next, lastSentAt: nowIso() });
      useOwner.setState({ serverPending: j.pending ?? useOwner.getState().serverPending });
      sent += batch.length;
    }
    if (!error && o.includeBaseline) setOwnerPrefs({ baseline: undefined });
  } catch (e) {
    error = (e as Error).message;
  } finally {
    useOwner.setState({ busy: false, error: error ?? null });
    refreshCounts();
  }
  return { sent, error };
}

/** Everything this device would contribute (acknowledged or not), as a file `pnpm data:apply-contributions` reads. */
export async function exportContributionFile(): Promise<number> {
  const st = deviceState();
  if (!st) return 0;
  const at = nowIso();
  const items = collectItems(st, loadPrefs().personal, at);
  const file = contributionFile(items, at, APP ? "app" : "web");
  await downloadBlob(
    `tdj-owner-contribution-${at.slice(0, 10)}.json`,
    `${JSON.stringify(file, null, 1)}\n`,
    "application/json",
  );
  return items.length;
}

/** This device stops being the owner's: nothing is sent any more (the acknowledged map goes too). */
export function forgetOwnerDevice() {
  savePrefs({ ...DEFAULT });
  useOwner.setState({ waiting: 0, existing: {} });
}

/* ---------- automatic sync ---------- */

let started = false;
/** Boot (components/Boot.tsx): on the owner's devices, changes go out a few seconds after they are made. */
export function startOwnerSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  useOwner.setState({ prefs: loadPrefs() });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = async () => {
    timer = null;
    const p = loadPrefs();
    if (!p.device) return;
    refreshCounts();
    if (!p.auto || !useOwner.getState().waiting) return;
    if ((await checkOwner()) !== "owner") return;
    await sendPending();
  };
  const soon = () => {
    if (!loadPrefs().device) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), DEBOUNCE_MS);
  };
  useStore.subscribe((s, prev) => {
    if (!s.overridesReady) return;
    if (!prev.overridesReady) {
      soon();
      return;
    }
    if (s.overrides !== prev.overrides || s.memory !== prev.memory || s.history !== prev.history) soon();
  });
  // covers and YouTube matches live in localStorage without an event: look again now and then while visible
  setInterval(() => {
    if (document.visibilityState === "visible") soon();
  }, POLL_MS);
}
