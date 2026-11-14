import { LlmError } from "./provider";

/**
 * Round 22 — ACP (Agent Client Protocol, agentclientprotocol.com): TDJ as an ACP client of a local or remote agent
 * (Claude Code, Gemini CLI, any ACP agent). JSON-RPC 2.0: `initialize`, `session/new`, `session/prompt`; the agent
 * streams its answer as `session/update` notifications (`agent_message_chunk`). TDJ offers the agent no file system
 * and no terminal, and declines every permission request: the agent only answers.
 *
 * Transports: a WebSocket URL (the web app, to an agent or a stdio-to-WebSocket bridge, local or remote) and a local
 * process speaking newline-delimited JSON on stdio (the Mac app registers a spawner, `registerAcpSpawner`). Plain
 * module: it runs in the browser, in Node and in the apps.
 */
export interface AcpTransport {
  send(msg: unknown): void;
  onMessage(cb: (msg: unknown) => void): void;
  onClose(cb: (why?: string) => void): void;
  close(): void;
  /** resolves when the transport can send */
  ready: Promise<void>;
}

export interface AcpConnection {
  id: string;
  name: string;
  /** "url": a WebSocket (ws:// or wss://, http(s) is upgraded); "process": a local command (the apps) */
  kind: "url" | "process";
  url?: string;
  command?: string;
  args?: string[];
  /** sent as the `token` query parameter (bridges that ask for one); kept on this device only */
  token?: string;
  /** the last Test: whether the agent answered, and who it is */
  lastTest?: { ok: boolean; at: string; agent?: string; message?: string };
}

export const PROTOCOL_VERSION = 1;

/** every line of a chunk that parses as JSON (one message per frame, or several newline-separated) */
function messagesIn(raw: string): unknown[] {
  const out: unknown[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {}
  }
  return out;
}

export function wsUrl(url: string, token?: string): string {
  const u = new URL(url.trim());
  if (u.protocol === "http:") u.protocol = "ws:";
  if (u.protocol === "https:") u.protocol = "wss:";
  if (u.protocol !== "ws:" && u.protocol !== "wss:")
    throw new LlmError("Use a ws:// or wss:// address.", 400);
  if (token) u.searchParams.set("token", token);
  return u.toString();
}

export function wsTransport(
  url: string,
  opts: { token?: string; WebSocketImpl?: typeof WebSocket } = {},
): AcpTransport {
  const WS = opts.WebSocketImpl ?? (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
  if (!WS) throw new LlmError("This device cannot open a WebSocket.", 501);
  const ws = new WS(wsUrl(url, opts.token));
  const listeners: Array<(m: unknown) => void> = [];
  const closers: Array<(why?: string) => void> = [];
  let open = false;
  const ready = new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => {
      open = true;
      resolve();
    });
    ws.addEventListener("error", () => {
      if (!open) reject(new LlmError("Could not reach the agent at this address.", 502));
    });
    ws.addEventListener("close", (e) => {
      if (!open) reject(new LlmError("The agent closed the connection.", 502));
      for (const c of closers) c((e as CloseEvent).reason || "closed");
    });
  });
  ws.addEventListener("message", (e) => {
    const data = (e as MessageEvent).data;
    const text = typeof data === "string" ? data : "";
    for (const m of messagesIn(text)) for (const l of listeners) l(m);
  });
  return {
    ready,
    send: (msg) => ws.send(JSON.stringify(msg)),
    onMessage: (cb) => listeners.push(cb),
    onClose: (cb) => closers.push(cb),
    close: () => {
      try {
        ws.close();
      } catch {}
    },
  };
}

/** newline-delimited JSON over a byte stream (an agent's stdio, or any pipe) */
export function streamTransport(io: {
  write: (line: string) => void;
  onData: (cb: (chunk: string) => void) => void;
  onExit?: (cb: (why?: string) => void) => void;
  kill?: () => void;
}): AcpTransport {
  const listeners: Array<(m: unknown) => void> = [];
  const closers: Array<(why?: string) => void> = [];
  let buf = "";
  io.onData((chunk) => {
    buf += chunk;
    const i = buf.lastIndexOf("\n");
    if (i < 0) return;
    const head = buf.slice(0, i);
    buf = buf.slice(i + 1);
    for (const m of messagesIn(head)) for (const l of listeners) l(m);
  });
  io.onExit?.((why) => {
    for (const c of closers) c(why);
  });
  return {
    ready: Promise.resolve(),
    send: (msg) => io.write(`${JSON.stringify(msg)}\n`),
    onMessage: (cb) => listeners.push(cb),
    onClose: (cb) => closers.push(cb),
    close: () => io.kill?.(),
  };
}

/** the apps register how to start a local agent process; the web has none */
export type AcpSpawner = (command: string, args: string[]) => AcpTransport;
let spawner: AcpSpawner | null = null;
export function registerAcpSpawner(fn: AcpSpawner | null) {
  spawner = fn;
}
export const canSpawnAgents = () => !!spawner;

/** the transport for a saved connection */
export function transportFor(c: AcpConnection): AcpTransport {
  if (c.kind === "process") {
    if (!spawner)
      throw new LlmError("Local agents run in the Mac app. On the web, connect with an address.", 501);
    if (!c.command?.trim()) throw new LlmError("Add the command that starts the agent.", 400);
    return spawner(c.command.trim(), c.args ?? []);
  }
  if (!c.url?.trim()) throw new LlmError("Add the agent's address.", 400);
  return wsTransport(c.url, { token: c.token });
}

interface RpcMessage {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code?: number; message?: string };
}

export class AcpClient {
  private next = 1;
  private pending = new Map<number | string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private chunks = new Map<string, string[]>();
  private closed: string | null = null;
  agentName?: string;

  constructor(private t: AcpTransport) {
    t.onMessage((m) => this.receive(m as RpcMessage));
    t.onClose((why) => {
      this.closed = why ?? "closed";
      for (const p of this.pending.values()) p.reject(new LlmError("The agent closed the connection.", 502));
      this.pending.clear();
    });
  }

  private receive(m: RpcMessage) {
    if (!m || typeof m !== "object") return;
    // a response to one of ours
    if (m.id !== undefined && m.id !== null && !m.method) {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.error) p.reject(new LlmError(m.error.message || "The agent refused the request.", 502));
      else p.resolve(m.result);
      return;
    }
    if (m.method === "session/update") {
      const sid = String(m.params?.sessionId ?? "");
      const u = m.params?.update as
        | { sessionUpdate?: string; content?: { type?: string; text?: string } }
        | undefined;
      if (u?.sessionUpdate === "agent_message_chunk" && u.content?.type === "text" && u.content.text)
        this.chunks.set(sid, [...(this.chunks.get(sid) ?? []), u.content.text]);
      return;
    }
    // a request from the agent: no permission, no files, no terminal
    if (m.method && m.id !== undefined && m.id !== null) {
      if (m.method === "session/request_permission") {
        const options = (m.params?.options ?? []) as Array<{ optionId: string; kind?: string }>;
        const reject = options.find((o) => /reject/.test(o.kind ?? ""));
        this.t.send({
          jsonrpc: "2.0",
          id: m.id,
          result: {
            outcome: reject ? { outcome: "selected", optionId: reject.optionId } : { outcome: "cancelled" },
          },
        });
        return;
      }
      this.t.send({
        jsonrpc: "2.0",
        id: m.id,
        error: { code: -32601, message: "TDJ offers no files or terminal to agents." },
      });
    }
  }

  request<T = unknown>(method: string, params: Record<string, unknown>, timeoutMs = 30_000): Promise<T> {
    if (this.closed) return Promise.reject(new LlmError("The agent closed the connection.", 502));
    const id = this.next++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new LlmError("The agent took too long to answer.", 504));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v as T);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.t.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  async initialize(): Promise<{ protocolVersion?: number; agentName?: string }> {
    await this.t.ready;
    const r = await this.request<{
      protocolVersion?: number;
      agentInfo?: { name?: string; title?: string; version?: string };
    }>(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        clientInfo: { name: "tdj", title: "T-DJ", version: "1" },
      },
      15_000,
    );
    const a = r?.agentInfo;
    this.agentName = a ? [a.title || a.name, a.version].filter(Boolean).join(" ") : undefined;
    return { protocolVersion: r?.protocolVersion, agentName: this.agentName };
  }

  async newSession(): Promise<string> {
    const r = await this.request<{ sessionId?: string }>("session/new", { cwd: "/", mcpServers: [] }, 20_000);
    if (!r?.sessionId) throw new LlmError("The agent did not open a session.", 502);
    return r.sessionId;
  }

  async prompt(
    sessionId: string,
    text: string,
    timeoutMs = 90_000,
  ): Promise<{ text: string; stopReason?: string }> {
    this.chunks.set(sessionId, []);
    const r = await this.request<{ stopReason?: string }>(
      "session/prompt",
      { sessionId, prompt: [{ type: "text", text }] },
      timeoutMs,
    );
    const out = (this.chunks.get(sessionId) ?? []).join("");
    this.chunks.delete(sessionId);
    if (r?.stopReason === "refusal") throw new LlmError("The agent declined this request.", 422);
    return { text: out, stopReason: r?.stopReason };
  }

  close() {
    this.t.close();
  }
}

/** one prompt, one answer: connect, open a session, ask, close */
export async function acpComplete(
  transport: AcpTransport,
  text: string,
  o: { timeoutMs?: number } = {},
): Promise<{ text: string; agentName?: string }> {
  const c = new AcpClient(transport);
  try {
    await c.initialize();
    const sid = await c.newSession();
    const r = await c.prompt(sid, text, o.timeoutMs);
    return { text: r.text, agentName: c.agentName };
  } finally {
    c.close();
  }
}

/** Settings → Models → Test: the agent answers a one-word prompt */
export async function acpProbe(transport: AcpTransport): Promise<{ agentName?: string; text: string }> {
  return acpComplete(transport, "You are a connection test. Reply with the single word OK.", {
    timeoutMs: 45_000,
  });
}
