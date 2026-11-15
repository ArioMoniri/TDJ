"use client";
import { type AcpTransport, registerAcpSpawner, streamTransport } from "@/lib/ai/acp";
import { activeAcp } from "@/lib/ai/client";
import { LlmError, type ModelReply, type ModelRequest } from "@/lib/ai/provider";
import { providerFor } from "@/lib/ai/providers";
import type { WireResponse } from "./host";
import { invoke, nativeInfo } from "./native";
import type { AiCreds } from "./server/llm";
import { KEYCHAIN_KEY } from "./target";

/**
 * The apps' model calls, on the provider layer (lib/ai/*), on the page. A key provider runs through its own
 * provider code with a fetch that goes out natively (`model_fetch`, src-tauri/src/net.rs): the page sends the mark
 * of a saved key, and the native side puts the DJ's key from the Keychain in its place, for the provider's own host
 * only. An ACP agent is asked directly: over its WebSocket, or as a local process the Mac app starts.
 */
export async function modelFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const src = input instanceof Request ? input : null;
  const headers: Record<string, string> = {};
  new Headers(src?.headers).forEach((v, k) => {
    headers[k] = v;
  });
  new Headers(init.headers).forEach((v, k) => {
    headers[k] = v;
  });
  const body =
    typeof init.body === "string"
      ? init.body
      : init.body
        ? await new Response(init.body).text()
        : src
          ? await src.text()
          : undefined;
  const call = invoke<WireResponse>("model_fetch", {
    req: { url: src ? src.url : String(input), method: init.method ?? src?.method ?? "POST", headers, body },
  });
  const signal = init.signal ?? undefined;
  const r = await (signal
    ? Promise.race([
        call,
        new Promise<never>((_, no) => {
          if (signal.aborted) no(new DOMException("The operation was aborted.", "AbortError"));
          signal.addEventListener("abort", () =>
            no(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
      ])
    : call);
  return new Response(r.status === 204 || r.status === 304 ? null : r.body, {
    status: r.status,
    headers: r.headers,
  });
}

/** One model call for a route the engine worker runs (lib/app/server/llm.ts → ask). */
export async function deviceAsk(ai: AiCreds, req: Omit<ModelRequest, "signal">): Promise<ModelReply> {
  if (ai.provider === "acp") {
    const { useStore } = await import("@/lib/store");
    const conn = activeAcp(useStore.getState().settings);
    if (!conn) throw new LlmError("Choose an agent connection in Settings → Models.", 401);
    return providerFor({ provider: "acp", acp: conn }).complete(req);
  }
  if (!ai.key) throw new LlmError("No API key. Add one in Settings → Models.", 401);
  // a mark with no key behind it (the Keychain was cleared): say so, rather than a connection error from the SDK
  const saved = await invoke<boolean>("secret_has", { name: `ai.${ai.provider}` }).catch(() => true);
  if (!saved) throw new LlmError("No API key for this provider. Add one in Settings → Models.", 401);
  // whatever the page holds, only the mark leaves it: the Keychain's key is the one the provider sees
  return providerFor(
    { provider: ai.provider, key: KEYCHAIN_KEY, model: ai.model, workspace: ai.workspace },
    { fetch: modelFetch as typeof fetch },
  ).complete(req);
}

/** A local ACP agent as a child process of the Mac app (`acp_spawn` / `acp_write` / `acp_read` / `acp_kill`). */
export function nativeAgent(command: string, args: string[]): AcpTransport {
  const id = invoke<number>("acp_spawn", { command, args });
  let onData: (chunk: string) => void = () => {};
  let onExit: (why?: string) => void = () => {};
  let open = true;
  const poll = async (pid: number) => {
    while (open) {
      const r = await invoke<{ data: string; exited: string | null }>("acp_read", { id: pid }).catch(
        (e: { message?: string }) => ({ data: "", exited: e?.message ?? "The agent stopped." }),
      );
      if (r.data) onData(r.data);
      if (r.exited !== null) {
        open = false;
        onExit(r.exited || undefined);
        return;
      }
      await new Promise((ok) => setTimeout(ok, r.data ? 0 : 40));
    }
  };
  id.then(poll, (e: { message?: string }) => {
    open = false;
    onExit(e?.message ?? "The agent could not be started.");
  });
  return streamTransport({
    write: (line) => {
      void id.then((pid) => invoke("acp_write", { id: pid, data: line })).catch(() => {});
    },
    onData: (cb) => {
      onData = cb;
    },
    onExit: (cb) => {
      onExit = cb;
    },
    kill: () => {
      open = false;
      void id.then((pid) => invoke("acp_kill", { id: pid })).catch(() => {});
    },
  });
}

/** The Mac app starts local agents (Settings → Models → Keys and agents); the iPad app connects by address only. */
export async function registerDeviceAgents(): Promise<void> {
  const info = await nativeInfo();
  registerAcpSpawner(info.platform === "macos" ? nativeAgent : null);
}
