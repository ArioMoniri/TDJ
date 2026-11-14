/**
 * Round 22 — the AI layer without the network: the edit prompt and its tool call against a mock model, every id
 * checked by the engine; the providers' request and answer shapes (fetch mocked); the ACP client against an
 * in-memory agent; the relay that lets a route use the DJ's own agent.
 */
import { compose, type Playlist } from "@tdj/core";
import { loadCatalog } from "@tdj/core/load";
import { beforeAll, describe, expect, it } from "vitest";
import { addSong, addTanda, type DraftSong, moveTanda, openTanda, removeSong, slimSong } from "../build";
import { AcpClient, acpComplete, registerAcpSpawner, wsUrl } from "./acp";
import { aiFetch, aiHeaders, hasOwnModel } from "./client";
import { EDIT_TOOL, editNight, editPrompt } from "./edit";
import { DEFAULT_MODEL, NEWEST_CLAUDE } from "./models";
import { mockProvider, promptKey } from "./provider";
import { providerFor } from "./providers";
import { memoryAgent } from "./testAgent";

let deps: ReturnType<typeof loadCatalog>;
let night: Playlist;
beforeAll(() => {
  deps = loadCatalog();
  night = compose({ hours: 4, seed: 3 }, deps);
}, 300_000);
const inCatalogue = (id: string) => deps.catalog.songs.some((s) => s.id === id || s.altIds?.includes(id));
const ids = (p: Playlist) => p.tandas.map((t) => t.songs.map((s) => s.id).join(","));

describe("edit with AI: one call, a small context, every id checked", () => {
  it("sends one request with the night summary and the edit tool, and applies the tool call", async () => {
    const m = mockProvider(() => ({
      text: "",
      toolCalls: [
        {
          name: "edit_night",
          input: { edits: [{ op: "lock", tanda: 4, locked: true }], note: "Tanda 4 stays." },
        },
      ],
    }));
    const r = await editNight({
      playlist: night,
      instruction: "keep tanda 4",
      deps,
      ask: (q) => m.complete(q),
    });
    expect(m.calls).toHaveLength(1);
    expect(m.calls[0]!.tools?.[0]?.name).toBe(EDIT_TOOL.name);
    expect(m.calls[0]!.user.length).toBeLessThan(12_000);
    expect(m.calls[0]!.user).toContain("T4 ");
    expect(r.source).toBe("model");
    expect(r.applied).toHaveLength(1);
    expect(r.playlist.tandas[3]!.locked).toBe(true);
    expect(r.note).toBe("Tanda 4 stays.");
  });
  it("refuses a made-up id and leaves the night as it was", async () => {
    const m = mockProvider(() => ({
      text: "",
      toolCalls: [
        {
          name: "edit_night",
          input: { edits: [{ op: "swap", tanda: 2, position: 1, songId: "f1ct10n4l" }] },
        },
      ],
    }));
    const r = await editNight({
      playlist: night,
      instruction: "swap the first song of tanda 2",
      deps,
      ask: (q) => m.complete(q),
    });
    expect(r.applied).toHaveLength(0);
    expect(r.rejected[0]!.reason).toMatch(/not in the catalogue/);
    expect(ids(r.playlist)).toEqual(ids(night));
  });
  it("reads an agent's JSON text answer the same way (ACP agents have no tool calls)", async () => {
    const m = mockProvider(
      () => ({
        text: 'Sure.\n```json\n{"edits":[{"op":"retune","tanda":6,"direction":"calmer"}]}\n```',
        toolCalls: [],
      }),
      "acp",
    );
    const r = await editNight({
      playlist: night,
      instruction: "tanda 6 calmer",
      deps,
      ask: (q) => m.complete(q),
    });
    expect(r.ops).toEqual([{ op: "retune", tanda: 6, direction: "calmer" }]);
    expect(r.applied.length + r.rejected.length).toBe(1);
  });
  it("falls back to the plain-words reader when the model names no edit", async () => {
    const m = mockProvider(() => ({ text: "I would rather not.", toolCalls: [] }));
    const r = await editNight({
      playlist: night,
      instruction: "lock tanda 2",
      deps,
      ask: (q) => m.complete(q),
    });
    expect(r.source).toBe("words");
    expect(r.playlist.tandas[1]!.locked).toBe(true);
  });
  it("offers only catalogue ids in the prompt", () => {
    const { user, candidateIds } = editPrompt(night, deps, "swap the 2nd song of tanda 5 for a Fiorentino");
    for (const id of candidateIds) expect(inCatalogue(id)).toBe(true);
    const cand = user.slice(user.indexOf("CANDIDATES"), user.indexOf("ORCHESTRA IDS"));
    for (const id of cand.match(/\b[0-9a-f]{10}\b/g) ?? []) expect(inCatalogue(id)).toBe(true);
  });
});

describe("providers behind one interface (fetch mocked, no network)", () => {
  const capture = (answer: unknown) => {
    const seen: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
    const f = (async (url: string, init: RequestInit) => {
      seen.push({
        url: String(url),
        body: JSON.parse(String(init.body)),
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      });
      return new Response(JSON.stringify(answer), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;
    return { seen, f };
  };
  it("Anthropic: the newest Claude by default, the tool offered with tool_choice auto, tool_use read back", async () => {
    const { seen, f } = capture({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: NEWEST_CLAUDE,
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "t1", name: "edit_night", input: { edits: [{ op: "lock", tanda: 1 }] } },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const p = providerFor(
      { provider: "anthropic", key: "sk-test" },
      { fetch: f, baseUrl: { anthropic: "http://mock" } },
    );
    expect(p.model).toBe(NEWEST_CLAUDE);
    expect(DEFAULT_MODEL.anthropic).toBe(NEWEST_CLAUDE);
    const r = await p.complete({ system: "s", user: "u", tools: [EDIT_TOOL] });
    expect(r.toolCalls).toEqual([{ name: "edit_night", input: { edits: [{ op: "lock", tanda: 1 }] } }]);
    expect(seen[0]!.body.model).toBe(NEWEST_CLAUDE);
    expect(seen[0]!.body.tool_choice).toEqual({ type: "auto" });
    expect((seen[0]!.body.tools as Array<{ name: string }>)[0]!.name).toBe("edit_night");
  });
  it("OpenAI: function tools, arguments parsed from their JSON string", async () => {
    const { seen, f } = capture({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [{ function: { name: "edit_night", arguments: '{"edits":[]}' } }],
          },
        },
      ],
    });
    const r = await providerFor(
      { provider: "openai", key: "sk-o" },
      { fetch: f, baseUrl: { openai: "http://mock" } },
    ).complete({
      system: "s",
      user: "u",
      tools: [EDIT_TOOL],
    });
    expect(r.toolCalls).toEqual([{ name: "edit_night", input: { edits: [] } }]);
    expect(seen[0]!.headers.authorization).toBe("Bearer sk-o");
    expect((seen[0]!.body.tools as Array<{ type: string }>)[0]!.type).toBe("function");
  });
  it("Gemini: function declarations out, functionCall back; the key in a header, never the URL", async () => {
    const { seen, f } = capture({
      candidates: [{ content: { parts: [{ functionCall: { name: "edit_night", args: { edits: [] } } }] } }],
    });
    const r = await providerFor(
      { provider: "gemini", key: "AIza-k" },
      { fetch: f, baseUrl: { gemini: "http://mock" } },
    ).complete({
      system: "s",
      user: "u",
      tools: [EDIT_TOOL],
    });
    expect(r.toolCalls[0]!.name).toBe("edit_night");
    expect(seen[0]!.url).not.toContain("AIza");
    expect(seen[0]!.headers["x-goog-api-key"]).toBe("AIza-k");
  });
});

describe("ACP: an agent answers like a model, and gets no files, terminal or permission", () => {
  it("initialises, opens a session, streams the answer, declines permission and file requests", async () => {
    const agent = memoryAgent(() => "Hello from the agent", { askPermission: true, name: "Claude Code" });
    const c = new AcpClient(agent);
    const init = await c.initialize();
    expect(init.agentName).toContain("Claude Code");
    const sid = await c.newSession();
    const r = await c.prompt(sid, "hi");
    expect(r.text).toBe("Hello from the agent");
    const responses = agent.seen.filter((m) => !m.method);
    expect(responses.some((m) => JSON.stringify(m.result).includes('"optionId":"no"'))).toBe(true);
    expect(responses.some((m) => (m.error as { code?: number })?.code === -32601)).toBe(true);
    const init0 = agent.seen.find((m) => m.method === "initialize")!;
    expect(JSON.stringify(init0.params)).toContain('"terminal":false');
  });
  it("is a provider like the others: the same edit tool, answered as JSON text", async () => {
    const agent = memoryAgent((prompt) =>
      prompt.includes("edit_night") ? '{"edits":[{"op":"lock","tanda":2}]}' : "?",
    );
    registerAcpSpawner(() => agent);
    try {
      const p = providerFor({
        provider: "acp",
        acp: { id: "a", name: "Local", kind: "process", command: "agent" },
      });
      const r = await p.complete({ system: "s", user: "u", tools: [EDIT_TOOL] });
      expect(r.text).toContain('"op":"lock"');
      const res = await acpComplete(
        memoryAgent(() => "OK"),
        "ping",
      );
      expect(res.text).toBe("OK");
    } finally {
      registerAcpSpawner(null);
    }
  });
  it("upgrades http addresses to WebSocket and refuses other schemes", () => {
    expect(wsUrl("http://localhost:8765/acp")).toBe("ws://localhost:8765/acp");
    expect(wsUrl("https://agent.example/acp", "t0k")).toBe("wss://agent.example/acp?token=t0k");
    expect(() => wsUrl("file:///etc/passwd")).toThrow();
  });
});

describe("the relay: a route uses the DJ's own agent through the browser", () => {
  it("answers a 202 relay on the device and repeats the request with the answer for that prompt", async () => {
    const agent = memoryAgent(() => "Fine set.");
    registerAcpSpawner(() => agent);
    const settings = {
      ai: { provider: "acp" as const, key: "sk-never-sent", model: "x", acpId: "a1" },
      acp: [{ id: "a1", name: "Local", kind: "process" as const, command: "agent" }],
    };
    expect(hasOwnModel(settings)).toBe(true);
    expect(aiHeaders(settings)["x-ai-key"]).toBe("");
    const bodies: Array<Record<string, unknown>> = [];
    const relay = { for: promptKey("sys", "usr"), system: "sys", user: "usr" };
    const f = (async (_url: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      bodies.push(b);
      return b.aiAnswer
        ? new Response(JSON.stringify({ text: b.aiAnswer.text }), { status: 200 })
        : new Response(JSON.stringify({ relay }), { status: 202 });
    }) as unknown as typeof fetch;
    try {
      const r = await aiFetch("/api/ai/review", { playlist: 1 }, settings, { fetchImpl: f });
      expect(r.status).toBe(200);
      expect(bodies).toHaveLength(2);
      expect(bodies[1]!.aiAnswer).toMatchObject({ for: relay.for, text: "Fine set." });
      expect(bodies[1]!.playlist).toBe(1);
    } finally {
      registerAcpSpawner(null);
    }
  });
  it("ties an answer to its prompt", () => {
    expect(promptKey("a", "b")).toBe(promptKey("a", "b"));
    expect(promptKey("a", "b")).not.toBe(promptKey("a", "c"));
  });
});

describe("the hand-built draft", () => {
  it("adds sides into the open tanda of the same orchestra, else starts a tanda; whole tandas; remove and move", () => {
    const t = night.tandas.find((x) => x.rhythm === "tango")!;
    const u = night.tandas.find((x) => x.rhythm === "tango" && x.orchestraId !== t.orchestraId)!;
    const s = t.songs.map(slimSong) as DraftSong[];
    let d = addSong([], s[0]!);
    d = addSong(d, s[1]!);
    d = addSong(d, s[1]!);
    expect(d).toHaveLength(1);
    expect(d[0]!.map((x) => x.id)).toEqual([s[0]!.id, s[1]!.id]);
    expect(openTanda(d)).toBeTruthy();
    d = addSong(d, slimSong(u.songs[0]!));
    expect(d).toHaveLength(2);
    d = addTanda(d, u.songs.map(slimSong));
    expect(d).toHaveLength(2);
    expect(d[1]!.length).toBe(u.songs.length);
    d = moveTanda(d, 1, 0);
    expect(d[0]![0]!.orchestraId).toBe(u.orchestraId);
    d = removeSong(d, 1, 0);
    d = removeSong(d, 1, 0);
    expect(d).toHaveLength(1);
  });
});
