"use client";
import { Bot, Check, CircleAlert, CircleCheck, KeyRound, LoaderCircle, Pencil } from "lucide-react";
import { useState } from "react";
import { type AcpConnection, acpProbe, canSpawnAgents, transportFor } from "@/lib/ai/acp";
import { KEY_PROVIDERS, type KeyProvider, modelFor, PROVIDER_LABEL } from "@/lib/ai/models";
import { chooseAgent, chooseKeyProvider, keyOf, newAgentId, removeAgent, saveAgent } from "@/lib/ai/settings";
import { haptic } from "@/lib/haptics";
import { useStore } from "@/lib/store";
import { ActionRow, FieldRow, Group, SegmentedRow, Tile } from "./Form";
import { Sheet } from "./Sheet";
import { Tip, useTip } from "./ui/Tip";

type Probe = { state: "busy" } | { state: "ok"; text: string } | { state: "fail"; text: string };

function StatusMark({ p }: { p?: Probe }) {
  if (!p) return null;
  if (p.state === "busy") return <LoaderCircle size={14} className="animate-spin" aria-hidden />;
  return p.state === "ok" ? (
    <CircleCheck size={14} className="text-[var(--system-green)]" aria-hidden />
  ) : (
    <CircleAlert size={14} className="text-[var(--destructive)]" aria-hidden />
  );
}

/** a row of Settings → Models: tap to use it for every generation, Test on the right, a check mark when in use */
function ModelRow({
  id,
  label,
  sub,
  active,
  onUse,
  onTest,
  testDisabled,
  testTitle,
  probe,
  onEdit,
  tile,
}: {
  id: string;
  label: string;
  sub: string;
  active: boolean;
  onUse: () => void;
  onTest: () => void;
  testDisabled?: boolean;
  testTitle: string;
  probe?: Probe;
  onEdit?: () => void;
  tile: React.ReactNode;
}) {
  const useAs = useTip<HTMLButtonElement>(
    active ? "Every generation uses this" : `Use ${label} for every generation`,
  );
  return (
    <div className="cell gap-1 pr-2" data-leading="tile" id={id} data-active={active || undefined}>
      <button
        type="button"
        className="-my-2 flex min-h-[44px] min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => {
          haptic(4);
          onUse();
        }}
        aria-pressed={active}
        {...useAs.props}
      >
        {useAs.tag}
        {tile}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{label}</span>
          <span className="text-footnote flex items-center gap-1 truncate text-[var(--label-2)]">
            <StatusMark p={probe} />
            <span className="truncate">{probe && probe.state !== "busy" ? probe.text : sub}</span>
          </span>
        </span>
        <span className="grid h-5 w-5 shrink-0 place-items-center">
          {active && <Check size={18} strokeWidth={2.5} className="text-[var(--tint)]" aria-label="In use" />}
        </span>
      </button>
      {onEdit && (
        <Tip text={"Edit"}>
          <button
            type="button"
            className="icon-btn icon-btn-bare h-11 w-11"
            onClick={onEdit}
            aria-label={`Edit ${label}`}
          >
            <Pencil size={16} aria-hidden />
          </button>
        </Tip>
      )}
      <Tip text={testTitle}>
        <button
          type="button"
          className="btn-plain min-h-[44px] px-2"
          onClick={onTest}
          disabled={testDisabled || probe?.state === "busy"}
          data-testid={`${id}-test`}
        >
          Test
        </button>
      </Tip>
    </div>
  );
}

/**
 * Round 22 — Settings → Models: every API key and every ACP agent connection, with its status and a Test button;
 * the one with the check mark runs every generation (written reviews, Tell the DJ, Edit with AI, AI pick). Keys and
 * agent addresses stay in this browser.
 */
export function ModelConnections() {
  const { settings, setSettings } = useStore();
  const [probe, setProbe] = useState<Record<string, Probe>>({});
  const [editing, setEditing] = useState<AcpConnection | null>(null);
  const ms = { ai: settings.ai, aiKeys: settings.aiKeys, acp: settings.acp };
  const agents = settings.acp ?? [];
  const local = canSpawnAgents();

  const testKey = async (p: KeyProvider) => {
    const k = keyOf(ms, p);
    setProbe((x) => ({ ...x, [p]: { state: "busy" } }));
    try {
      const r = await fetch("/api/ai/review", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ai-provider": p,
          "x-ai-key": k.key,
          "x-ai-model": k.model,
          "x-ai-workspace": k.workspace ?? "",
        },
        body: JSON.stringify({ test: true }),
      });
      const j = await r.json().catch(() => ({}));
      setProbe((x) => ({
        ...x,
        [p]: r.ok
          ? { state: "ok", text: `Connected · ${modelFor(p, k.model)} answered` }
          : {
              state: "fail",
              text:
                r.status === 401 || r.status === 403
                  ? "The key was rejected"
                  : String(j.error ?? r.status).slice(0, 90),
            },
      }));
    } catch {
      setProbe((x) => ({ ...x, [p]: { state: "fail", text: "Could not reach the server" } }));
    }
  };
  const testAgent = async (c: AcpConnection) => {
    setProbe((x) => ({ ...x, [c.id]: { state: "busy" } }));
    const at = new Date().toISOString();
    try {
      const r = await acpProbe(transportFor(c));
      const agent = r.agentName;
      const text = `Connected${agent ? ` · ${agent}` : ""}`;
      setProbe((x) => ({ ...x, [c.id]: { state: "ok", text } }));
      setSettings(saveAgent(useStore.getState().settings, { ...c, lastTest: { ok: true, at, agent } }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not reach the agent";
      setProbe((x) => ({ ...x, [c.id]: { state: "fail", text: message } }));
      setSettings(saveAgent(useStore.getState().settings, { ...c, lastTest: { ok: false, at, message } }));
    }
  };
  const agentSub = (c: AcpConnection) => {
    const where = c.kind === "process" ? (c.command ?? "Local app") : (c.url ?? "");
    if (c.kind === "process" && !local) return `${where} · runs in the Mac app`;
    if (!c.lastTest) return `${where} · not tested yet`;
    return c.lastTest.ok
      ? `${where} · connected${c.lastTest.agent ? ` (${c.lastTest.agent})` : ""}`
      : `${where} · did not answer last time`;
  };

  const save = () => {
    if (!editing) return;
    const c = { ...editing, name: editing.name.trim() || "Agent" };
    setSettings(saveAgent(useStore.getState().settings, c));
    setEditing(null);
  };

  return (
    <>
      <Group
        header="Keys and agents"
        footer="The one with the check mark writes your reviews, reads “Tell the DJ”, edits the night with AI and makes the AI pick. Keys and agent addresses stay in this browser and go only with your own requests. An agent is an AI agent app on your computer or server (Claude Code, Gemini CLI and others), reached by its address."
        data-testid="model-connections"
      >
        {KEY_PROVIDERS.map(([p, label]) => {
          const k = keyOf(ms, p);
          return (
            <ModelRow
              key={p}
              id={`model-${p}`}
              label={label}
              sub={k.key ? `Key saved · ${modelFor(p, k.model)}` : "No key"}
              active={settings.ai.provider === p}
              onUse={() => setSettings(chooseKeyProvider(ms, p))}
              onTest={() => testKey(p)}
              testDisabled={!k.key}
              testTitle={k.key ? `Ask ${label} for one word` : "Add a key in Models above first"}
              probe={probe[p]}
              tile={
                <Tile color="#5856d6">
                  <KeyRound size={16} strokeWidth={2} />
                </Tile>
              }
            />
          );
        })}
        {agents.map((c) => (
          <ModelRow
            key={c.id}
            id={`model-agent-${c.id}`}
            label={c.name}
            sub={agentSub(c)}
            active={settings.ai.provider === "acp" && settings.ai.acpId === c.id}
            onUse={() => setSettings(chooseAgent(ms, c.id))}
            onTest={() => testAgent(c)}
            testDisabled={c.kind === "process" && !local}
            testTitle="Connect to the agent and ask for one word"
            probe={probe[c.id]}
            onEdit={() => setEditing(c)}
            tile={
              <Tile color="#ff9500">
                <Bot size={16} strokeWidth={2} />
              </Tile>
            }
          />
        ))}
        <ActionRow
          label="Add an agent connection…"
          tip="Use an AI app on your own computer, such as Claude Code, instead of a key"
          onClick={() =>
            setEditing({ id: newAgentId(), name: "My agent", kind: "url", url: "ws://localhost:8765" })
          }
          id="model-add-agent"
        />
      </Group>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={agents.some((a) => a.id === editing?.id) ? "Agent connection" : "New agent connection"}
        trailing="Save"
        onTrailing={save}
        testId="agent-sheet"
      >
        {editing && (
          <>
            <Group
              footer={
                editing.kind === "url"
                  ? "The address of your AI agent app: one on this computer starts with ws://localhost, one on a server with wss://. The agent's own help says how to get it."
                  : local
                    ? "The command that starts the agent on this Mac, for example npx @zed-industries/claude-code-acp."
                    : "A local agent process runs in the Mac app. On the web, connect with an address."
              }
            >
              <FieldRow label="Name" id="agent-name">
                <input
                  id="agent-name"
                  className="field field-value min-w-0 flex-1"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  autoComplete="off"
                  data-autofocus
                />
              </FieldRow>
              <SegmentedRow
                label="Connects by"
                value={editing.kind}
                items={[
                  ["url", "Address"],
                  ["process", "Local app"],
                ]}
                onChange={(kind) => setEditing({ ...editing, kind })}
              />
              {editing.kind === "url" ? (
                <>
                  <FieldRow label="Address" id="agent-url">
                    <input
                      id="agent-url"
                      className="field field-value min-w-0 flex-1 font-mono"
                      value={editing.url ?? ""}
                      placeholder="ws://localhost:8765"
                      onChange={(e) => setEditing({ ...editing, url: e.target.value.trim() })}
                      autoComplete="off"
                      spellCheck={false}
                      inputMode="url"
                    />
                  </FieldRow>
                  <FieldRow label="Token" sub="Only if the bridge asks for one" id="agent-token">
                    <input
                      id="agent-token"
                      type="password"
                      className="field field-value min-w-0 flex-1 font-mono"
                      value={editing.token ?? ""}
                      onChange={(e) => setEditing({ ...editing, token: e.target.value.trim() || undefined })}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </FieldRow>
                </>
              ) : (
                <FieldRow label="Command" id="agent-command">
                  <input
                    id="agent-command"
                    className="field field-value min-w-0 flex-1 font-mono"
                    value={[editing.command ?? "", ...(editing.args ?? [])].join(" ").trim()}
                    placeholder="npx @zed-industries/claude-code-acp"
                    onChange={(e) => {
                      const [command, ...args] = e.target.value.split(/\s+/);
                      setEditing({ ...editing, command, args: args.filter(Boolean) });
                    }}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FieldRow>
              )}
            </Group>
            <Group
              footer={
                <span role="status" aria-live="polite" data-testid="agent-sheet-status">
                  {probe[editing.id]?.state === "busy"
                    ? "Connecting…"
                    : probe[editing.id]
                      ? (probe[editing.id] as { text: string }).text
                      : `${PROVIDER_LABEL.acp}: T-DJ only asks it questions; it gets no files, no terminal and no permissions.`}
                </span>
              }
            >
              <ActionRow
                label="Test connection"
                onClick={() => testAgent(editing)}
                busy={probe[editing.id]?.state === "busy"}
                disabled={editing.kind === "process" && !local}
                id="agent-test"
              />
              <ActionRow
                label="Save and use for every generation"
                onClick={() => {
                  const c = { ...editing, name: editing.name.trim() || "Agent" };
                  const s1 = {
                    ...useStore.getState().settings,
                    ...saveAgent(useStore.getState().settings, c),
                  };
                  setSettings({ acp: s1.acp, ...chooseAgent(s1, c.id) });
                  setEditing(null);
                }}
                id="agent-use"
              />
              {agents.some((a) => a.id === editing.id) && (
                <ActionRow
                  label="Delete this connection"
                  destructive
                  onClick={() => {
                    setSettings(removeAgent(useStore.getState().settings, editing.id));
                    setEditing(null);
                  }}
                />
              )}
            </Group>
          </>
        )}
      </Sheet>
    </>
  );
}
