import { type AiSettingsLike, completeOnDevice } from "./client";
import type { Relay } from "./provider";

/**
 * Round 22 — the relay for every existing AI caller (Tell the DJ, the written review, the AI pick): when the DJ's
 * model is an ACP agent, an /api/ai/* route answers 202 with the prompt; this wrapper around the page's `fetch` asks
 * the agent from this device and repeats the request with the answer, so the callers need no change. Installed once
 * per page; any other request passes through untouched.
 */
let installed = false;
export function installAiRelay(getSettings: () => AiSettingsLike) {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const base = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await base(input, init);
    if (res.status !== 202) return res;
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!/\/api\/ai\//.test(new URL(url, window.location.href).pathname)) return res;
    const j = (await res
      .clone()
      .json()
      .catch(() => null)) as { relay?: Relay } | null;
    if (!j?.relay || typeof init?.body !== "string") return res;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(init.body);
    } catch {
      return res;
    }
    try {
      const reply = await completeOnDevice(getSettings(), j.relay);
      return base(input, {
        ...init,
        body: JSON.stringify({
          ...body,
          aiAnswer: { for: j.relay.for, text: reply.text, toolCalls: reply.toolCalls },
        }),
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: e instanceof Error ? e.message : "The agent did not answer." }),
        { status: 502, headers: { "content-type": "application/json" } },
      );
    }
  };
}
