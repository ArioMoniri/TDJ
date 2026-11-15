"use client";
import { Bot, Check, CircleAlert, CircleCheck, KeyRound, LoaderCircle, Pencil } from "lucide-react";
import { useState } from "react";
import { type AcpConnection, acpProbe, canSpawnAgents, transportFor } from "@/lib/ai/acp";
import { KEY_PROVIDERS, type KeyProvider, modelFor, PROVIDER_LABEL } from "@/lib/ai/models";
import { chooseAgent, chooseKeyProvider, keyOf, newAgentId, removeAgent, saveAgent } from "@/lib/ai/settings";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
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
    active
      ? t("modelConnections.every_generation_uses_this")
      : t("modelConnections.use_for_every_generation", { label }),
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
          <span className="block break-words">{label}</span>
          <span className="text-footnote flex items-start gap-1 text-[var(--label-2)]">
            <StatusMark p={probe} />
            <span className="min-w-0 break-words">{probe && probe.state !== "busy" ? probe.text : sub}</span>
          </span>
        </span>
        <span className="grid h-5 w-5 shrink-0 place-items-center">
          {active && (
            <Check
              size={18}
              strokeWidth={2.5}
              className="text-[var(--tint)]"
              aria-label={t("modelConnections.in_use")}
            />
          )}
        </span>
      </button>
      {onEdit && (
        <Tip text={t("modelConnections.edit_2")}>
          <button
            type="button"
            className="icon-btn icon-btn-bare h-11 w-11"
            onClick={onEdit}
            aria-label={t("modelConnections.edit", { label })}
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
          {t("modelConnections.test")}
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
          ? { state: "ok", text: t("modelConnections.connected_answered", { p1: modelFor(p, k.model) }) }
          : {
              state: "fail",
              text:
                r.status === 401 || r.status === 403
                  ? t("modelConnections.the_key_was_rejected")
                  : String(j.error ?? r.status).slice(0, 90),
            },
      }));
    } catch {
      setProbe((x) => ({
        ...x,
        [p]: { state: "fail", text: t("modelConnections.could_not_reach_the_server") },
      }));
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
      const message = e instanceof Error ? e.message : t("modelConnections.could_not_reach_the_agent");
      setProbe((x) => ({ ...x, [c.id]: { state: "fail", text: message } }));
      setSettings(saveAgent(useStore.getState().settings, { ...c, lastTest: { ok: false, at, message } }));
    }
  };
  const agentSub = (c: AcpConnection) => {
    const where = c.kind === "process" ? (c.command ?? t("modelConnections.local_app")) : (c.url ?? "");
    if (c.kind === "process" && !local) return t("modelConnections.runs_in_the_mac_app", { where });
    if (!c.lastTest) return t("modelConnections.not_tested_yet", { where });
    return c.lastTest.ok
      ? t("modelConnections.connected", { where, p1: c.lastTest.agent ? ` (${c.lastTest.agent})` : "" })
      : t("modelConnections.did_not_answer_last_time", { where });
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
        header={t("modelConnections.keys_and_agents")}
        footer={t("modelConnections.the_one_with_the_check_mark")}
        data-testid="model-connections"
      >
        {KEY_PROVIDERS.map(([p, label]) => {
          const k = keyOf(ms, p);
          return (
            <ModelRow
              key={p}
              id={`model-${p}`}
              label={label}
              sub={
                k.key
                  ? t("modelConnections.key_saved", { p1: modelFor(p, k.model) })
                  : t("modelConnections.no_key")
              }
              // the check mark means "this runs every generation": never beside a provider with no key
              active={settings.ai.provider === p && !!k.key}
              onUse={() => setSettings(chooseKeyProvider(ms, p))}
              onTest={() => testKey(p)}
              testDisabled={!k.key}
              testTitle={
                k.key
                  ? t("modelConnections.ask_for_one_word", { label })
                  : t("modelConnections.test_is_off_add_a_key", { label })
              }
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
            testTitle={
              c.kind === "process" && !local
                ? t("modelConnections.test_is_off_an_agent_started")
                : t("modelConnections.connect_to_the_agent_and_ask")
            }
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
          label={t("modelConnections.add_an_agent_connection")}
          tip={t("modelConnections.use_an_ai_app_on_your")}
          onClick={() =>
            setEditing({
              id: newAgentId(),
              name: t("modelConnections.my_agent"),
              kind: "url",
              url: "ws://localhost:8765",
            })
          }
          id="model-add-agent"
        />
      </Group>

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title={
          agents.some((a) => a.id === editing?.id)
            ? t("modelConnections.agent_connection")
            : t("modelConnections.new_agent_connection")
        }
        trailing="Save"
        onTrailing={save}
        testId="agent-sheet"
      >
        {editing && (
          <>
            <Group
              footer={
                editing.kind === "url"
                  ? t("modelConnections.the_address_of_your_ai_agent")
                  : local
                    ? t("modelConnections.the_command_that_starts_the_agent")
                    : t("modelConnections.a_local_agent_process_runs_in")
              }
            >
              <FieldRow label={t("modelConnections.name")} id="agent-name">
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
                label={t("modelConnections.connects_by")}
                value={editing.kind}
                items={[
                  ["url", t("modelConnections.address")],
                  ["process", t("modelConnections.local_app")],
                ]}
                onChange={(kind) => setEditing({ ...editing, kind })}
              />
              {editing.kind === "url" ? (
                <>
                  <FieldRow label={t("modelConnections.address")} id="agent-url">
                    <input
                      id="agent-url"
                      className="field field-value min-w-0 flex-1 font-mono"
                      value={editing.url ?? ""}
                      placeholder={t("modelConnections.ws_localhost_8765")}
                      onChange={(e) => setEditing({ ...editing, url: e.target.value.trim() })}
                      autoComplete="off"
                      spellCheck={false}
                      inputMode="url"
                    />
                  </FieldRow>
                  <FieldRow
                    label={t("modelConnections.token")}
                    sub={t("modelConnections.only_if_the_bridge_asks_for")}
                    id="agent-token"
                  >
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
                <FieldRow label={t("modelConnections.command")} id="agent-command">
                  <input
                    id="agent-command"
                    className="field field-value min-w-0 flex-1 font-mono"
                    value={[editing.command ?? "", ...(editing.args ?? [])].join(" ").trim()}
                    placeholder={t("modelConnections.npx_zed_industries_claude_code_acp")}
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
                    ? t("modelConnections.connecting")
                    : probe[editing.id]
                      ? (probe[editing.id] as { text: string }).text
                      : t("modelConnections.t_dj_only_asks_it_questions", { acp: PROVIDER_LABEL.acp })}
                </span>
              }
            >
              <ActionRow
                label={t("modelConnections.test_connection")}
                onClick={() => testAgent(editing)}
                busy={probe[editing.id]?.state === "busy"}
                disabled={editing.kind === "process" && !local}
                id="agent-test"
              />
              <ActionRow
                label={t("modelConnections.save_and_use_for_every_generation")}
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
                  label={t("modelConnections.delete_this_connection")}
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
