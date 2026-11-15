import { t } from "@/lib/i18n";
import type { AcpTransport } from "./acp";

/**
 * An in-memory ACP agent for tests (no network, no process): answers `initialize`, `session/new` and
 * `session/prompt`, streaming `answer(prompt)` back as `agent_message_chunk` updates. With `askPermission` it first
 * asks the client for a permission and reads a file, which TDJ must decline.
 */
export function memoryAgent(
  answer: (prompt: string) => string,
  o: { askPermission?: boolean; name?: string } = {},
): AcpTransport & { seen: Array<Record<string, unknown>> } {
  const listeners: Array<(m: unknown) => void> = [];
  const seen: Array<Record<string, unknown>> = [];
  const emit = (m: unknown) => queueMicrotask(() => listeners.forEach((l) => l(m)));
  let n = 1000;
  return {
    seen,
    ready: Promise.resolve(),
    onMessage: (cb) => listeners.push(cb),
    onClose: () => {},
    close: () => {},
    send(raw) {
      const m = raw as { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown };
      seen.push(m as Record<string, unknown>);
      if (!m.method) return; // a response from the client
      if (m.method === "initialize")
        emit({
          jsonrpc: "2.0",
          id: m.id,
          result: { protocolVersion: 1, agentInfo: { name: o.name ?? "test-agent", version: "0.1" } },
        });
      else if (m.method === "session/new") emit({ jsonrpc: "2.0", id: m.id, result: { sessionId: "s1" } });
      else if (m.method === "session/prompt") {
        const text = ((m.params?.prompt as Array<{ text?: string }>) ?? []).map((p) => p.text ?? "").join("");
        if (o.askPermission) {
          emit({
            jsonrpc: "2.0",
            id: n++,
            method: "session/request_permission",
            params: {
              sessionId: "s1",
              options: [
                { optionId: "yes", kind: "allow_once", name: "Allow" },
                { optionId: "no", kind: "reject_once", name: "Reject" },
              ],
            },
          });
          emit({ jsonrpc: "2.0", id: n++, method: "fs/read_text_file", params: { path: "/etc/passwd" } });
        }
        const out = answer(text);
        const half = Math.ceil(out.length / 2);
        for (const part of [out.slice(0, half), out.slice(half)])
          emit({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "s1",
              update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: part } },
            },
          });
        emit({ jsonrpc: "2.0", id: m.id, result: { stopReason: "end_turn" } });
      } else
        emit({
          jsonrpc: "2.0",
          id: m.id,
          error: { code: -32601, message: t("ai.testAgent.no_such_method") },
        });
    },
  };
}
