"use client";
import { Brain, FolderOpen, Globe, HardDrive, KeyRound, Palette, Radio } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { ActionRow, FieldRow, Group, PickerRow, Row, SegmentedRow, SwitchRow, Tile } from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { fade } from "@/lib/motion";
import { beginAuth } from "@/lib/spotify";
import { useStore } from "@/lib/store";
import {
  AI_DEFAULT_MODEL,
  AI_PROVIDERS,
  type AiProvider,
  DEFAULT_NAMING,
  DJ_APPS,
  type DjApp,
  type UserSettings,
} from "@/lib/types";

const MODEL_SUGGESTIONS: Record<AiProvider, string[]> = {
  anthropic: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
  openai: ["gpt-5.2", "gpt-5.2-mini", "o4-mini"],
  gemini: ["gemini-3-pro", "gemini-3-flash"],
  openrouter: ["openrouter/auto", "anthropic/claude-sonnet-5-5", "openai/gpt-5.2"],
};
const KEY_PLACEHOLDER: Record<AiProvider, string> = {
  anthropic: "sk-ant-…",
  openai: "sk-…",
  gemini: "AIza…",
  openrouter: "sk-or-…",
};
const REGIONS: Array<[UserSettings["region"], string]> = [
  ["buenos-aires", "Buenos Aires"],
  ["europe", "Europe"],
  ["istanbul", "Istanbul"],
  ["asia", "Asia"],
  ["us", "US"],
];
const THEMES: Array<[UserSettings["theme"], string]> = [
  ["auto", "Auto"],
  ["light", "Light"],
  ["dark", "Dark"],
];

export default function Settings() {
  const { settings, setSettings, spotifyToken, setSpotifyToken, storageMode, memory } = useStore();
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [redirect, setRedirect] = useState("/callback");
  const [folderFor, setFolderFor] = useState<DjApp | null>(null);
  const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "fail"; text?: string }>({
    state: "idle",
  });
  useEffect(() => setRedirect(`${location.origin}/callback`), []);
  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirect);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the URI is selectable */
    }
  };
  const minutesLeft = spotifyToken ? Math.max(0, Math.round((spotifyToken.expires - Date.now()) / 60000)) : 0;
  const ai = settings.ai;
  const setAi = (patch: Partial<UserSettings["ai"]>) => setSettings({ ai: { ...ai, ...patch } });
  const switchProvider = (provider: AiProvider) => {
    const keepModel = MODEL_SUGGESTIONS[provider].includes(ai.model);
    setAi({ provider, model: keepModel ? ai.model : AI_DEFAULT_MODEL[provider] });
    setTest({ state: "idle" });
  };
  const testConnection = async () => {
    setTest({ state: "busy" });
    try {
      const r = await fetch("/api/ai/review", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-ai-provider": ai.provider,
          "x-ai-key": ai.key,
          "x-ai-model": ai.model,
        },
        body: JSON.stringify({ test: true }),
      });
      const j = await r.json();
      if (r.ok)
        setTest({ state: "ok", text: `Connected. ${ai.model || "Default model"} answered "${j.text}".` });
      else setTest({ state: "fail", text: j.error ?? `Failed (${r.status}).` });
    } catch {
      setTest({ state: "fail", text: "Could not reach the server." });
    }
  };
  const app = DJ_APPS.find((a) => a.id === folderFor);
  const remembered = memory.notes.length + memory.sets.length + memory.feedbackHistory.length;

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader title="Settings" />

      <Group
        header="Spotify"
        footer="Create an app at developer.spotify.com (Premium account), add the redirect URI to it, then paste the Client ID. Connected, Listen plays the exact recordings."
      >
        <Row
          tile={
            <Tile color="#1db954">
              <Radio size={16} strokeWidth={2} />
            </Tile>
          }
          label="Status"
          value={spotifyToken ? `Connected · ${minutesLeft} min` : "Not connected"}
        />
        <Row label="Redirect URI" sub={<span className="font-mono">{redirect}</span>}>
          <button type="button" className="btn-plain" onClick={copyRedirect} aria-live="polite">
            {copied ? "Copied" : "Copy"}
          </button>
        </Row>
        <FieldRow label="Client ID" id="spotify-client-id">
          <input
            id="spotify-client-id"
            className="field field-value min-w-0 flex-1"
            placeholder="Required"
            value={settings.spotifyClientId}
            onChange={(e) => setSettings({ spotifyClientId: e.target.value.trim() })}
            autoComplete="off"
            spellCheck={false}
          />
        </FieldRow>
        <ActionRow
          label={spotifyToken ? "Reconnect" : "Connect Spotify"}
          onClick={() => beginAuth(settings.spotifyClientId)}
          disabled={!settings.spotifyClientId}
        />
        {spotifyToken && <ActionRow label="Disconnect" destructive onClick={() => setSpotifyToken(null)} />}
      </Group>

      <Group
        header="Written reviews"
        footer={
          <span
            role="status"
            aria-live="polite"
            className={
              test.state === "fail"
                ? "text-[var(--destructive)]"
                : test.state === "ok"
                  ? "text-[var(--system-green)]"
                  : undefined
            }
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={test.state === "idle" || test.state === "busy" ? "idle" : test.text}
                variants={fade}
                initial="hidden"
                animate="show"
                exit="exit"
                className="block"
              >
                {test.state === "busy"
                  ? "Checking…"
                  : (test.text ??
                    "A model key lets you ask for a written review of a set and turns “Tell the DJ” into precise changes. Without a key, free text still works by keyword. The key is sent with your own requests only and never stored on the server.")}
              </motion.span>
            </AnimatePresence>
          </span>
        }
      >
        <Row
          tile={
            <Tile color="#5856d6">
              <KeyRound size={16} strokeWidth={2} />
            </Tile>
          }
          label="Status"
          value={ai.key ? "Key saved" : "No key"}
        />
        <SegmentedRow label="Provider" value={ai.provider} items={AI_PROVIDERS} onChange={switchProvider} />
        <FieldRow label="API key" id="ai-key">
          <input
            id="ai-key"
            type={showKey ? "text" : "password"}
            className="field field-value min-w-0 flex-1 font-mono"
            placeholder={KEY_PLACEHOLDER[ai.provider]}
            value={ai.key}
            onChange={(e) => setAi({ key: e.target.value.trim() })}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="btn-plain -mr-2"
            onClick={() => setShowKey((v) => !v)}
            aria-pressed={showKey}
          >
            {showKey ? "Hide" : "Show"}
          </button>
        </FieldRow>
        <FieldRow label="Model" id="ai-model">
          <input
            id="ai-model"
            list="ai-model-list"
            className="field field-value min-w-0 flex-1 font-mono"
            placeholder={AI_DEFAULT_MODEL[ai.provider]}
            value={ai.model}
            onChange={(e) => setAi({ model: e.target.value.trim() })}
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id="ai-model-list">
            {MODEL_SUGGESTIONS[ai.provider].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </FieldRow>
        <ActionRow
          label="Test connection"
          onClick={testConnection}
          disabled={!ai.key}
          busy={test.state === "busy"}
        />
      </Group>

      <Group
        header="Memory"
        footer="The assistant keeps notes, the sets you composed and your feedback in your database, and applies what it learned under tonight's explicit choices. Review or forget any of it under Database → Memory."
      >
        <Row
          tile={
            <Tile color="#ff2d55">
              <Brain size={16} strokeWidth={2} />
            </Tile>
          }
          label="Stored"
          value={`${storageMode === "server" ? "On the server" : "In this browser"} · ${remembered} ${remembered === 1 ? "item" : "items"}`}
        />
        <SwitchRow
          label="Let the assistant learn from my feedback"
          checked={settings.learn}
          onChange={(v) => setSettings({ learn: v })}
        />
      </Group>

      <Group
        header="DJ apps"
        footer={`Exports point at real paths once a folder is set. Files are expected as “${settings.fileNaming || DEFAULT_NAMING}.mp3”. Placeholders: {artist} {title} {orchestra} {singer} {year} {tanda} {n}.`}
      >
        <FieldRow
          label="File naming"
          id="file-naming"
          tile={
            <Tile color="#ff9500">
              <FolderOpen size={16} strokeWidth={2} />
            </Tile>
          }
        >
          <input
            id="file-naming"
            className="field field-value min-w-0 flex-1 font-mono"
            value={settings.fileNaming}
            placeholder={DEFAULT_NAMING}
            onChange={(e) => setSettings({ fileNaming: e.target.value })}
            autoComplete="off"
            spellCheck={false}
          />
        </FieldRow>
        {DJ_APPS.map((a) => (
          <Row
            key={a.id}
            label={a.label}
            sub={a.format}
            chevron
            onClick={() => setFolderFor(a.id)}
            value={settings.djApps[a.id]?.folder ? "Set" : "Not set"}
            id={`folder-row-${a.id}`}
          />
        ))}
      </Group>

      <Group header="Region" footer="Default for Tonight's region on the composer.">
        <PickerRow
          label="Where you usually play"
          value={settings.region}
          items={REGIONS}
          onChange={(r) => r && setSettings({ region: r })}
        >
          <Tile color="#007aff">
            <Globe size={16} strokeWidth={2} />
          </Tile>
        </PickerRow>
      </Group>

      <Group
        header="Appearance"
        footer="Reduce transparency makes navigation and sheets solid; easier to read, lighter on the battery."
      >
        <SegmentedRow
          label="Theme"
          value={settings.theme}
          items={THEMES}
          onChange={(t) => setSettings({ theme: t })}
        >
          <Tile color="#8e8e93">
            <Palette size={16} strokeWidth={2} />
          </Tile>
        </SegmentedRow>
        <SwitchRow
          label="Reduce transparency"
          checked={settings.reduceGlass}
          onChange={(v) => setSettings({ reduceGlass: v })}
        />
      </Group>

      <Group
        header="Storage"
        footer="Set TDJ_DB_TABLE on the server to keep the database and memory across devices."
      >
        <Row
          tile={
            <Tile color="#636366">
              <HardDrive size={16} strokeWidth={2} />
            </Tile>
          }
          label="Database"
          value={storageMode === "server" ? "Server" : "This browser"}
        />
      </Group>

      <Sheet open={!!app} onClose={() => setFolderFor(null)} title={app?.label ?? ""} trailing="Done">
        {app && (
          <Group header="Music folder" footer={app.note}>
            <label htmlFor={`folder-${app.id}`} className="cell">
              <span className="sr-only">{app.label} folder</span>
              <input
                id={`folder-${app.id}`}
                className="field font-mono"
                data-autofocus
                value={settings.djApps[app.id]?.folder ?? ""}
                onChange={(e) =>
                  setSettings({ djApps: { ...settings.djApps, [app.id]: { folder: e.target.value } } })
                }
                placeholder={app.id === "rekordbox" ? "/Users/you/Music/Tango" : "Music folder path"}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </Group>
        )}
      </Sheet>
    </div>
  );
}
