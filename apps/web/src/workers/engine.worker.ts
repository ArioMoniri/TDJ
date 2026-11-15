/// <reference lib="webworker" />
import type { DataFiles } from "@tdj/core/data";
import { type AppDeps, appDeps } from "@/lib/app/deps";
import type { HostCalls, HostError } from "@/lib/app/host";
import { dispatch } from "@/lib/app/routes";

/**
 * The apps' engine (TDJ_TARGET=app): every /api/* request of the page is answered here, off the main thread, with
 * @tdj/core over the index bundled in the app (lib/app/adapter.ts posts the files once, as text). Native work
 * (HTTP without CORS, the Keychain, SQLite) is asked of the page, which holds the Tauri bridge.
 */
type In =
  | { type: "init"; files: Record<string, string | null> }
  | {
      type: "req";
      id: number;
      method: string;
      url: string;
      headers: Record<string, string>;
      body?: ArrayBuffer;
    }
  | { type: "host"; id: number; ok: boolean; value?: unknown; error?: HostError };

const post = (m: unknown, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(m, transfer);

let seq = 0;
const waiting = new Map<number, { ok: (v: unknown) => void; no: (e: HostError) => void }>();
const call = <T>(op: string, args: unknown[]): Promise<T> =>
  new Promise<T>((ok, no) => {
    const id = ++seq;
    waiting.set(id, { ok: ok as (v: unknown) => void, no });
    post({ type: "host", id, op, args });
  });
const host: HostCalls = {
  fetch: (r) => call("fetch", [r]),
  sql: (op, sql, params) => call("sql", [op, sql, params]),
  spotify: {
    enabled: () => call("spotify.enabled", []),
    access: () => call("spotify.access", []),
    logout: () => call("spotify.logout", []),
  },
  linked: () => call("linked", []),
  remote: (r) => call("remote", [r]),
};

let markReady: (d: AppDeps) => void = () => {};
let markFailed: (e: unknown) => void = () => {};
const ready = new Promise<AppDeps>((ok, no) => {
  markReady = ok;
  markFailed = no;
});

/** Requests are built on a fixed http origin: the handlers read the path and query only. */
const BASE = "http://app.tdj.invalid";

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  if (m.type === "init") {
    try {
      const files: DataFiles = {};
      for (const [k, text] of Object.entries(m.files))
        if (text) (files as Record<string, unknown>)[k] = JSON.parse(text);
      const d = appDeps(files, host);
      d.catalog(); // build the index now, before the first compose asks for it
      markReady(d);
      post({ type: "ready" });
    } catch (err) {
      markFailed(err);
      post({ type: "failed", error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  if (m.type === "host") {
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    if (m.ok) w.ok(m.value);
    else w.no(m.error ?? { message: "The app could not do that." });
    return;
  }
  let status = 500;
  let headers: Record<string, string> = { "content-type": "application/json" };
  let body = new TextEncoder().encode(JSON.stringify({ error: "T-DJ could not start its engine." }))
    .buffer as ArrayBuffer;
  try {
    const d = await ready;
    const u = new URL(m.url);
    const res = await dispatch(
      new Request(BASE + u.pathname + u.search, {
        method: m.method,
        headers: m.headers,
        body: m.method === "GET" || m.method === "HEAD" ? undefined : m.body,
      }),
      d,
    );
    status = res.status;
    headers = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    body = await res.arrayBuffer();
  } catch (err) {
    body = new TextEncoder().encode(
      JSON.stringify({ error: err instanceof Error ? err.message : "Something went wrong" }),
    ).buffer as ArrayBuffer;
  }
  post({ type: "res", id: m.id, status, headers, body }, [body]);
};
