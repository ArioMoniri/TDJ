"use client";
import { DATA_FILES } from "@tdj/core/data";
import { t } from "@/lib/i18n";
import type { HostCalls, HostError } from "./host";
import { nativeHost } from "./native";

/**
 * The one client adapter of the apps (TDJ_TARGET=app): every `fetch("/api/…")` of the page is answered on the
 * device by the engine worker (src/workers/engine.worker.ts), which runs the same route handlers as the server
 * (lib/api/*) over the index bundled in the app. Nothing goes to a TDJ server unless the DJ linked one under
 * Settings → Connections, and then only for the services that need it (lib/app/routes.ts).
 */
export const DATA_BASE = "/tdj-data/";

type Pending = { ok: (r: Response) => void; no: (e: unknown) => void };

declare global {
  interface Window {
    __TDJ_ADAPTER__?: { request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
  }
}

const toHostError = (e: unknown): HostError => {
  if (e && typeof e === "object" && "message" in e)
    return { message: String((e as HostError).message), status: (e as HostError).status };
  return { message: typeof e === "string" ? e : t("adapter.the_app_could_not_do_that") };
};

type Adapter = { request(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };

/** Installs the adapter over the page's own fetch (`base`: the browser's, before lib/app/boot.ts wrapped it). */
export function installAppAdapter(base: typeof fetch = window.fetch.bind(window)): Adapter {
  if (window.__TDJ_ADAPTER__) return window.__TDJ_ADAPTER__;
  const origFetch = base;
  const host = nativeHost(origFetch);
  const worker = new Worker(new URL("../../workers/engine.worker.ts", import.meta.url));
  let seq = 0;
  const pending = new Map<number, Pending>();
  let failed: string | null = null;

  const run = async (op: string, args: unknown[]): Promise<unknown> => {
    const h = host as unknown as Record<string, unknown>;
    const [a, b] = op.split(".");
    const target = (b ? (h[a!] as Record<string, unknown>)[b] : h[a!]) as (
      ...x: unknown[]
    ) => Promise<unknown>;
    return target(...args);
  };

  worker.onmessage = (e: MessageEvent) => {
    const m = e.data as
      | { type: "res"; id: number; status: number; headers: Record<string, string>; body: ArrayBuffer }
      | { type: "host"; id: number; op: string; args: unknown[] }
      | { type: "ready" }
      | { type: "failed"; error: string };
    if (m.type === "res") {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      const empty = m.status === 204 || m.status === 304 || (m.status >= 300 && m.status < 400);
      p.ok(new Response(empty ? null : m.body, { status: m.status, headers: m.headers }));
    } else if (m.type === "host") {
      run(m.op, m.args).then(
        (value) => worker.postMessage({ type: "host", id: m.id, ok: true, value }),
        (err) => worker.postMessage({ type: "host", id: m.id, ok: false, error: toHostError(err) }),
      );
    } else if (m.type === "failed") {
      failed = m.error;
      for (const p of pending.values()) p.no(new TypeError(t("adapter.t_dj_could_not_load_its")));
      pending.clear();
    }
  };

  // the bundled index, read once and handed over as text (the worker parses it off the main thread)
  void Promise.all(
    Object.entries(DATA_FILES).map(async ([k, rel]) => {
      const r = await origFetch(DATA_BASE + rel).catch(() => null);
      return [k, r?.ok ? await r.text() : null] as const;
    }),
  ).then((entries) => worker.postMessage({ type: "init", files: Object.fromEntries(entries) }));

  /** a page request as plain data (no `Request` object: its URL would carry the app's custom scheme) */
  const serialise = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const src = input instanceof Request ? input : null;
    const method = (init.method ?? src?.method ?? "GET").toUpperCase();
    const headers: Record<string, string> = {};
    new Headers(src?.headers).forEach((v, k) => {
      headers[k] = v;
    });
    new Headers(init.headers).forEach((v, k) => {
      headers[k] = v;
    });
    let body: ArrayBuffer | undefined;
    if (method !== "GET" && method !== "HEAD") {
      if (init.body !== undefined && init.body !== null) {
        const r = new Response(init.body);
        const type = r.headers.get("content-type");
        if (type && !headers["content-type"]) headers["content-type"] = type;
        body = await r.arrayBuffer();
      } else if (src) body = await src.arrayBuffer();
    }
    const url = new URL(src ? src.url : String(input), location.href);
    return { method, headers, body, url: `http://app.tdj.invalid${url.pathname}${url.search}` };
  };

  const request = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (failed) throw new TypeError(t("adapter.t_dj_could_not_load_its"));
    const { method, headers, body, url } = await serialise(input, init);
    const id = ++seq;
    return new Promise<Response>((ok, no) => {
      pending.set(id, { ok, no });
      worker.postMessage({ type: "req", id, method, url, headers, body }, body ? [body] : []);
    });
  };
  window.__TDJ_ADAPTER__ = { request };

  // same scheme and host as the page (a custom scheme's `origin` reads "null", so it is not compared)
  const isApi = (url: string) => {
    try {
      const u = new URL(url, location.href);
      return u.protocol === location.protocol && u.host === location.host && u.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  };
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!isApi(url)) return origFetch(input, init);
    return request(input, init);
  };
  return window.__TDJ_ADAPTER__;
}

export type { HostCalls };
