# Round 22 — Models: API keys and ACP agents

Status: plan (2026-11-14). ROADMAP "Round 22 onward" §6: "Models: API keys (BYOK) and ACP (Agent Client Protocol) connections to local/remote agents". Apps context: [r22-apps-plan.md](r22-apps-plan.md).

Goal: besides pasting an API key, a DJ can let TDJ talk to an agent they already run and pay for — Claude Code, Gemini CLI, Codex, GitHub Copilot, Goose, OpenCode and others — through the Agent Client Protocol. The agent handles its own login (a Claude/Google/ChatGPT subscription or the DJ's own key on their machine); TDJ never sees or stores that credential, and the server never stores any key (CLAUDE.md: keys are BYOK and never persisted server-side).

---

## 1. What ACP is

- An open protocol (started by Zed Industries, now at github.com/agentclientprotocol, docs at agentclientprotocol.com) that standardises how an **editor/client** talks to a **coding agent**, the way LSP did for language servers. JSON-RPC 2.0; in practice the client launches the agent as a **subprocess and talks over stdio** (newline-delimited JSON). The protocol overview does not define an HTTP/WebSocket transport; remote transport is still being designed, so anything remote is ours to bridge.
- Methods (protocol overview, read 2026-11-14):
  - client → agent: `initialize` (version + capabilities), `authenticate`, `session/new` (takes a working directory and optional MCP servers), `session/load` (optional), `session/prompt`, `session/set_mode` (optional), `logout` (optional); notification `session/cancel`.
  - agent → client: `session/request_permission` (baseline — the agent asks before a tool call), optional `fs/read_text_file`, `fs/write_text_file`, `terminal/create|output|release|wait_for_exit|kill`, `elicitation/create`; notifications `session/update` (message chunks, tool calls, plans, mode changes) and `elicitation/complete`.
- SDKs: TypeScript **`@agentclientprotocol/sdk`** (`ClientSideConnection` / `AgentSideConnection`, Zod-validated types; formerly `@zed-industries/agent-client-protocol`), Rust crate `agent-client-protocol`, plus Python and Kotlin libraries. Pin exact versions at implementation and re-check the import names (third-party mirrors disagree).
- Agents (agentclientprotocol.com "Agents" list, 2026-11): Claude (through the `claude-agent-acp` adapter), Codex CLI (`codex-acp` adapter), Gemini CLI, GitHub Copilot (public preview), Goose, OpenCode, Qwen Code, Kimi CLI, Kiro CLI, Mistral Vibe, Cursor, Cline, Junie, OpenHands and more. Launch commands differ per agent and move between releases (e.g. Gemini's ACP flag); TDJ keeps them in a small editable table (§5), not in code.

TDJ is an **ACP client** with a tiny surface: it never offers the file system or terminals; it only sends prompts and reads the answer.

## 2. What TDJ asks an agent to do

The same three jobs the BYOK path does today (`apps/web/src/app/api/ai/{review,refine,swap}` through `lib/server/llm.ts`): write a review of a set, refine a set from the DJ's feedback, pick a swap. To avoid a second copy of every prompt:

- New stateless route **`POST /api/ai/prompt`** `{ kind: "review"|"refine"|"swap", set, houseRules, memory, … }` → `{ system, prompt, schema }`: the exact text the server would send to a model, built by the same functions, **without calling a model and without needing a key**.
- The client sends `system + prompt` to the agent in one `session/prompt` (as a text content block), collects `agent_message_chunk` updates until the prompt's `stopReason`, then calls the existing parse/apply step (new **`POST /api/ai/parse`** `{ kind, text }` → the same validated result the BYOK route returns: review JSON, refined plan, swap pick). The engine rules and the 85-point golden-set check stay on the server exactly as today.
- The agent gets no tools from TDJ in v1. v2 (optional): an MCP server exposing read-only TDJ tools (`search_catalog`, `get_tanda`, `score_set`) passed in `session/new.mcpServers` as an HTTP MCP server at `<server>/api/mcp`, only to agents whose `initialize` reply advertises HTTP MCP support.

Nothing in this flow stores anything: `/api/ai/prompt` and `/api/ai/parse` are pure functions of the request, keep the same-origin guard (`lib/server/guard.ts`), and do not count against the organiser's shared-key limit (no model is called).

## 3. Connection paths

One ACP client implementation (TypeScript, `apps/web/src/lib/acp/`, using `@agentclientprotocol/sdk`'s `ClientSideConnection` over a Web Streams pair). Only the **byte transport** differs by platform; every path relays newline-delimited JSON unchanged.

```
             ┌─────────────── TDJ UI (web view or browser) ───────────────┐
             │  lib/acp client  ── ndjson stream ──┐                      │
             └─────────────────────────────────────┼──────────────────────┘
   (A) macOS DMG app:   Tauri IPC  ──►  tdj-acp plugin (Rust) ── spawn ── agent (stdio)
   (B) browser / Mac App Store / any: WebSocket ws://127.0.0.1:<port> ──► tdj-acp-bridge (Node CLI) ── spawn ── agent (stdio)
   (C) iPad: WebSocket over the LAN (paired) ──► tdj-acp-bridge --lan on the DJ's Mac ── spawn ── agent
   (D) "remote": the same bridge on any machine the DJ controls, reached over their own tunnel (Tailscale/SSH), wss + token
```

### (A) macOS app, Developer ID (DMG) build — no extra install
- The `tdj-acp` Tauri plugin (r22-apps-plan.md §4) resolves the agent command through the DJ's login shell (`$SHELL -lc 'command -v claude-agent-acp'`, so Homebrew/npm/nvm paths work), spawns it with `cwd` = an empty per-session folder in `~/Library/Application Support/TDJ/acp/<session>` and a **minimal environment** (PATH, HOME, LANG, plus whatever the agent table names, never TDJ's own variables), and relays stdout/stdin lines as Tauri events/commands. Killed on disconnect, window close and app quit.
- The Mac **App Store** build is sandboxed and may not spawn user-installed binaries, so it uses path (B) — the sandbox allows outgoing connections to `127.0.0.1` with `com.apple.security.network.client`.

### (B) Web (any browser) and the App Store Mac build — local bridge
- New package **`packages/acp-bridge`** (published as an npm CLI; run with `npx <package>@<version>`; also bundled inside the DMG for path A users who prefer a terminal): a ~200-line Node program using only `ws` and `child_process`.
- `tdj-acp-bridge` prints: the port, a **pairing code** (32 random bytes, base32), a QR code, and a link `https://<server>/settings/models?bridge=127.0.0.1:<port>` (the code is **not** in the link; the DJ types or scans it once and the browser keeps it).
- Binds **127.0.0.1 only** (path C opts in to the LAN explicitly). Rejects: a `Host` header other than `127.0.0.1:<port>`/`localhost:<port>` (DNS rebinding), an `Origin` not on its allowlist (the production URL, `http://127.0.0.1:3000`, the app origins, and any origin the DJ adds with `--allow-origin`), and a first frame without the pairing code (constant-time compare, 5 tries then exit). One TDJ page per agent process; idle timeout 30 min.
- Spawns only agents from its table (§5) — the page sends an agent **id**, never a command line.
- Browser realities: Chrome's Local Network Access asks the DJ to allow a public site to reach `127.0.0.1` (a one-time permission prompt; Settings explains it before it appears). Safari's handling of `ws://127.0.0.1` from an `https` page must be checked (spike A2); if it blocks, Settings says "use Chrome/Edge or the Mac app for local agents".
- The deployed server is **never** in this path: Lambda cannot hold an agent process, and relaying through it would put the DJ's agent session on our infrastructure.

### (C) iPad — pair with the DJ's Mac
- iPadOS cannot run CLI agents. `tdj-acp-bridge --lan` (or the Mac app's "Share agents with my iPad" switch, which runs the bridge in-process) binds the LAN interface, advertises Bonjour `_tdj-acp._tcp`, and serves **TLS** with a self-signed certificate whose SHA-256 fingerprint is part of the QR code, so the iPad pins it (no ATS exception needed beyond `NSLocalNetworkUsageDescription` + `NSBonjourServices`).
- The iPad app scans the QR (fingerprint + pairing code), connects `wss://<mac>.local:<port>`, and the Mac shows a confirmation ("TDJ on Ario's iPad wants to use Claude Code — Allow / Deny"). Pairings are listed and revocable on both sides.

### (D) Remote agents
- No public relay. A DJ who runs agents on another machine starts the same bridge there with `--lan`/`--listen 0.0.0.0` behind their own tunnel and pastes `wss://host:port` + code. Once ACP standardises a remote transport, TDJ adds it as a fourth transport behind the same client.

## 4. Security and consent

| Concern | Rule |
|---|---|
| Keys | TDJ never asks for, receives or stores the agent's credentials; the agent authenticates itself (its own `authenticate` method or prior CLI login). If an agent's `initialize` lists auth methods that need a browser/terminal step, TDJ shows the agent's own instructions and a "I've logged in — retry" button. BYOK API keys stay where they are today (browser; Keychain in the apps) and travel per request in headers; the server never persists them. |
| Consent | First connection to an agent opens a sheet: which agent and command, what TDJ will send (the set, house rules, notes, learned preferences — the same data a BYOK review sends to a provider), that the agent's provider processes it under the DJ's own account and terms, what TDJ will **not** allow (files, terminals, tool calls), and how to disconnect. Stored per agent per device; revocable in Settings → Models. |
| Capabilities | `initialize` advertises `fs.readTextFile=false`, `fs.writeTextFile=false`, `terminal=false`, no elicitation. TDJ never implements `fs/*` or `terminal/*`. |
| Agent's own tools | Agents like Claude Code have built-in tools (shell, edits, web fetch) that run in the `cwd` we pass. Mitigations: `cwd` is an empty throwaway folder; `session/set_mode` to the agent's read-only/plan mode when its `initialize`/session reply lists one; every `session/request_permission` is answered **reject** by default (shown in the transcript as "TDJ declined: <tool>"), with an opt-in per agent to "ask me" for read-only kinds (`read`, `fetch`, `search`), never for `edit`/`execute`/`delete`. |
| Local network attack surface | loopback by default, Host + Origin checks, pairing code, single client, idle exit, no command lines from the page, LAN only on explicit opt-in with TLS pinning and per-device approval. |
| Prompt injection from data | Song titles/notes come from the DJ's own database; the answer is still parsed and validated by `/api/ai/parse` and the engine before anything changes; the agent has no TDJ tools in v1, so an injected instruction cannot act. |
| Logs | The bridge and plugin log connection events only, never message bodies; the server logs nothing new (the two new routes are stateless and do not log bodies). |
| Terms | Whether a subscription-backed agent may be driven by a third-party app is the agent provider's policy; Settings links each agent's terms and says the DJ uses their own installation. Re-check before advertising any specific agent. |

## 5. Agent table (data, editable)

`data/knowledge/acp-agents.json` (shipped default; the DJ's additions live in their database like other overrides). Each row: `id`, `name`, `homepage`, `detect` (binary name), `command`, `args`, `env` (names to pass through, e.g. `ANTHROPIC_API_KEY` only if the DJ ticks it), `readOnlyMode` (mode id to request if offered), `install` (one-line hint), `terms` URL. Initial rows (commands to verify at implementation): Claude (`claude-agent-acp` adapter, installed via npm), Codex (`codex-acp` adapter), Gemini CLI (its ACP flag), GitHub Copilot CLI (ACP preview), Goose, OpenCode, Qwen Code, Mistral Vibe. A "Custom agent" row lets the DJ enter a command — in path A/B this is accepted only through the local bridge/plugin config on the DJ's own machine (`tdj-acp-bridge --agent name=cmd`), never from a web page.

## 6. Settings → Models (UI)

One screen, two groups, one default per job. Glass only on the sheet chrome; rows on `surface`; targets ≥ 44 px (CLAUDE.md). Every string in English and Turkish (ROADMAP §7).

```
Models                                                    [?]
  Use for   Reviews [Claude Code (local) ▾]  Refine [same ▾]  Swap pick [Engine only ▾]

  API keys                                    (keys stay on this device)
   ● Anthropic        sk-…a1F3   claude-sonnet-5-5 ▾   Test  Remove
   ○ OpenAI           Add key
   ○ Google Gemini    Add key
   ○ OpenRouter       Add key
   ○ Organiser's key  12 of 20 reviews left today   (from /admin, when enabled)

  Agents (ACP)                                (run on your computer, use your own plan)
   ● Claude Code      Connected · this Mac            Test  Disconnect
   ○ Gemini CLI       Installed · not connected       Connect
   ○ Codex            Not found · How to install
   ○ On my Mac (iPad) Paired with "Studio Mac" · 2 agents
   + Add agent / Pair a computer / Start the bridge (web: shows the npx command and the pairing field)
```

- **Status** per agent: Not found · Installed · Needs login (agent's own auth step) · Connected · Error (last message). The web shows "Bridge not running" with the copyable command until the WebSocket answers.
- **Test** sends a 1-line prompt and shows the streamed reply, the agent's name/version from `initialize`, and the time taken.
- **Use for** pickers list every configured source; "Engine only" keeps the deterministic engine without any model. The composer's AI chip shows the active source ("AI: Claude Code · local").
- While a job runs: streamed text in the existing review sheet, a Cancel button (`session/cancel`), declined tool calls listed under "Agent activity".
- Accessibility: status by text and icon, not colour alone; focus order follows the list; VoiceOver labels name agent + state.

## 7. Work items

| # | Item | Where (new unless noted) | Tests first (docs/TDD.md) |
|---|---|---|---|
| 1 | `/api/ai/prompt`, `/api/ai/parse` sharing the BYOK prompt builders | `apps/web/src/app/api/ai/{prompt,parse}/route.ts`; small export from `lib/server/llm.ts` (coordinate with the engineer editing it) | vitest: prompt for kind X equals what the BYOK route sends; parse(model answer) equals BYOK result; no key needed; guard enforced |
| 2 | ACP client + transports (Tauri IPC, WebSocket) | `apps/web/src/lib/acp/` | vitest against the SDK's example agent over an in-memory stream: initialize caps are fs/terminal false; permission requests rejected; cancel works |
| 3 | `packages/acp-bridge` | new package | vitest: wrong Host/Origin/code rejected; only table agents spawn; idle exit; LAN mode refuses without `--lan` |
| 4 | `tdj-acp` Tauri plugin | `apps/native/plugins/tdj-acp` | `cargo test`: env minimised, cwd empty, process killed on drop (runs on Linux CI) |
| 5 | Settings → Models screen + consent sheet | `apps/web/src/components/settings/Models*.tsx` | Playwright with a mock bridge: connect, test, use-for, cancel, disconnect; en + tr strings |
| 6 | iPad pairing (Bonjour, TLS pin, approval) | bridge + iOS plugin | integration on a macOS runner with the iOS simulator (label-gated) |
| 7 | Agent table | `data/knowledge/acp-agents.json` | schema test; every row has terms + install hint |

Spikes: **A1** each listed agent answers `initialize` + one `session/prompt` through the bridge with fs/terminal disabled (and which ones respect a read-only mode); **A2** Safari/WebKit and Chrome LNA behaviour for `https` → `ws://127.0.0.1`; **A3** Mac App Store sandbox build connecting to the bridge.

## 8. Risks

- **Agent commands and flags change often** (adapters renamed, flags promoted from experimental) → data table, `initialize` version shown in Settings, A1 re-run in CI weekly against the latest adapters (label-gated, Linux).
- **Agents' built-in tools** may run before a permission request in some modes → empty `cwd`, read-only mode, reject-by-default, minimal env; documented per agent after A1.
- **Browser blocks loopback** (Safari) or the DJ declines Chrome's LNA prompt → Mac app path A; clear copy.
- **Provider terms** for driving subscription-backed agents from another app → link terms, no claims, DJ's own install.
- **Latency/cost**: coding agents are slower than a direct API call (agent loop, larger system prompts) → stream output, show timing in Test, keep BYOK as the fast path.
