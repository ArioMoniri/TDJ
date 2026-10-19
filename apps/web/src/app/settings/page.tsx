"use client";
import { Brain, FolderOpen, Globe, HardDrive, KeyRound, LoaderCircle, Palette, Timer } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Connectors } from "@/components/Connectors";
import {
  ActionRow,
  FieldRow,
  Group,
  PickerRow,
  Row,
  SegmentedRow,
  StepperRow,
  SwitchRow,
  Tile,
} from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { fade, t as tw } from "@/lib/motion";
import { useStore } from "@/lib/store";
import {
  AI_DEFAULT_MODEL,
  AI_PROVIDERS,
  type AiProvider,
  CORTINA_STOP_RANGE,
  cortinaStopSec,
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

/* The dotLottie player loads with the first test result, not with the page. */
const DotLottieReact = dynamic(() => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact), {
  ssr: false,
});

type TestState = "idle" | "busy" | "ok" | "fail";

/**
 * Test-connection icon (motion-system.md §3.6): idle → nothing; busy → spinner after a 300 ms grace; ok / fail →
 * the save-pulse / error-mark Lottie plays once in the same 20 px slot (final frame under reduced motion).
 */
function TestIcon({ state }: { state: TestState }) {
  const reduced = useReducedMotion();
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (state !== "busy") {
      setLate(false);
      return;
    }
    const id = setTimeout(() => setLate(true), 300);
    return () => clearTimeout(id);
  }, [state]);
  const show = state === "ok" || state === "fail" || (state === "busy" && late);
  return (
    <span className="relative inline-grid h-5 w-5 shrink-0 place-items-center align-middle" aria-hidden>
      <AnimatePresence mode="wait" initial={false}>
        {show && (
          <motion.span
            key={state}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={tw.press}
            className="inline-grid h-5 w-5 place-items-center"
            data-testid={`test-icon-${state}`}
          >
            {state === "busy" ? (
              <LoaderCircle size={15} className="animate-spin" />
            ) : (
              <DotLottieReact
                src={state === "ok" ? "/anim/save-pulse.json" : "/anim/error-mark.json"}
                autoplay={!reduced}
                loop={false}
                dotLottieRefCallback={(d) => {
                  if (reduced) d?.setFrame(23);
                }}
                style={{ width: 20, height: 20 }}
              />
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Provider errors as one human line: "The key was rejected by Anthropic (401). Check it and try again." */
function humanError(provider: AiProvider, status: number, raw: unknown): string {
  const name = AI_PROVIDERS.find(([k]) => k === provider)?.[1] ?? provider;
  const text = typeof raw === "string" ? raw : "";
  // an Anthropic key made at organisation level must name the workspace it bills
  if (/not scoped to a workspace|anthropic-workspace-id/i.test(text))
    return "This key needs a workspace: paste its Workspace ID below or create the key inside a workspace.";
  if (status === 429 && /organiser/i.test(text)) return text;
  if (
    status === 401 ||
    status === 403 ||
    /invalid x-api-key|authentication|unauthori[sz]ed|invalid api key/i.test(text)
  )
    return `The key was rejected by ${name} (${status || 401}). Check it and try again.`;
  if (status === 404 || /model.*not (found|exist)|does not exist/i.test(text))
    return `${name} does not know this model (${status}). Leave the model blank for the default.`;
  if (status === 429 || /rate limit|quota/i.test(text))
    return `${name} is rate-limiting this key (${status}). Try again in a minute.`;
  if (status >= 500 || !status) return `${name} did not answer (${status || "network"}). Try again.`;
  const short = text
    .replace(/\{[\s\S]*\}/, "")
    .trim()
    .slice(0, 80);
  return `${name} answered ${status}${short ? `: ${short}` : ""}.`;
}

export default function Settings() {
  const { settings, setSettings, storageMode, memory, options } = useStore();
  const [showKey, setShowKey] = useState(false);
  const [folderFor, setFolderFor] = useState<DjApp | null>(null);
  const [test, setTest] = useState<{ state: TestState; text?: string }>({ state: "idle" });
  /** the organiser's shared key (GET /api/ai/review): exists, and this DJ's use of today's allowance */
  const [shared, setShared] = useState<{ shared: boolean; limit: number; used: number } | null>(null);
  const [ownKey, setOwnKey] = useState(false);
  useEffect(() => {
    void fetch("/api/ai/review", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setShared(j ?? { shared: false, limit: 0, used: 0 }))
      .catch(() => setShared({ shared: false, limit: 0, used: 0 }));
  }, []);
  /** "Checking…" waits 300 ms so a fast answer never flashes it */
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (test.state !== "busy") {
      setChecking(false);
      return;
    }
    const id = setTimeout(() => setChecking(true), 300);
    return () => clearTimeout(id);
  }, [test.state]);
  const ai = settings.ai;
  const setAi = (patch: Partial<UserSettings["ai"]>) => setSettings({ ai: { ...ai, ...patch } });
  const usingShared = !ai.key && !!shared?.shared;
  // the personal fields fold away under "Use my own key" while the organiser's key does the work
  const showOwn = ownKey || !!ai.key || shared?.shared === false;
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
          "x-ai-workspace": ai.workspace ?? "",
        },
        body: JSON.stringify({ test: true }),
      });
      const j = await r.json();
      if (r.ok) {
        setTest({
          state: "ok",
          text: j.shared
            ? `Connected through the organiser's key; the model answered "${j.text}".`
            : `Connected. ${ai.model || "The default model"} answered "${j.text}".`,
        });
        if (j.shared && shared) setShared({ ...shared, used: Math.min(shared.limit, shared.used + 1) });
      } else setTest({ state: "fail", text: humanError(ai.provider, r.status, j.error) });
    } catch {
      setTest({ state: "fail", text: "Could not reach the server." });
    }
  };
  const app = DJ_APPS.find((a) => a.id === folderFor);
  const remembered = memory.notes.length + memory.sets.length + memory.feedbackHistory.length;

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader title="Settings" />

      <Connectors />

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
            <TestIcon state={test.state} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={
                  test.state === "idle"
                    ? "idle"
                    : test.state === "busy"
                      ? checking
                        ? "busy"
                        : "idle"
                      : test.text
                }
                variants={fade}
                initial="hidden"
                animate="show"
                exit="exit"
                // the result text lands as the check in the Lottie completes (300 ms in)
                transition={
                  test.state === "ok" || test.state === "fail" ? { ...tw.fade, delay: 0.3 } : tw.fade
                }
                className={test.state === "idle" ? "block" : "ml-1.5 inline"}
              >
                {test.state === "busy"
                  ? checking
                    ? "Checking…"
                    : ""
                  : (test.text ??
                    (usingShared
                      ? `The organiser's key writes your reviews and turns “Tell the DJ” into precise changes, up to ${shared?.limit ?? 20} requests a day per DJ. Add your own key under “Use my own key” for unlimited use; it stays in this browser.`
                      : "A model key lets you ask for a written review of a set and turns “Tell the DJ” into precise changes. Without a key, free text still works by keyword. The key is sent with your own requests only and never stored on the server."))}
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
          value={
            ai.key
              ? "Key saved"
              : shared === null
                ? "Checking…"
                : shared.shared
                  ? `Using the organiser's key · ${shared.used} of ${shared.limit} today`
                  : "No key"
          }
          id="ai-status"
        />
        {!showOwn && (
          <Row
            label="Use my own key"
            sub="Unlimited, kept in this browser"
            value="Show"
            onClick={() => setOwnKey(true)}
            id="ai-own-key"
          />
        )}
        {showOwn && (
          <>
            <SegmentedRow
              label="Provider"
              value={ai.provider}
              items={AI_PROVIDERS}
              onChange={switchProvider}
            />
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
            <FieldRow label="Model" sub="Leave blank for the default" id="ai-model">
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
            {ai.provider === "anthropic" && (
              <FieldRow label="Workspace ID" sub="Only for keys made at organisation level" id="ai-workspace">
                <input
                  id="ai-workspace"
                  className="field field-value min-w-0 flex-1 font-mono"
                  placeholder="wrkspc_…"
                  value={ai.workspace ?? ""}
                  onChange={(e) => setAi({ workspace: e.target.value.trim() })}
                  autoComplete="off"
                  spellCheck={false}
                />
              </FieldRow>
            )}
          </>
        )}
        <ActionRow
          label="Test connection"
          onClick={testConnection}
          disabled={!ai.key && !usingShared}
          busy={test.state === "busy"}
          id="ai-test"
        />
      </Group>
      {showOwn && ai.provider === "anthropic" && (
        <p className="section-foot -mt-2">
          Workspace ID: only needed when the key was created at organisation level; or create the key inside a
          workspace at console.anthropic.com → API keys.
        </p>
      )}

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
        footer={`Exports point at real paths once a folder is set. Files are expected as “${settings.fileNaming || DEFAULT_NAMING}.mp3”, for example “${(
          settings.fileNaming || DEFAULT_NAMING
        )
          .replace("{artist}", "Juan D'Arienzo")
          .replace("{orchestra}", "Juan D'Arienzo")
          .replace("{title}", "El Flete")
          .replace("{singer}", "")
          .replace("{year}", "1936")
          .replace("{rhythm}", "tango")
          .replace("{tanda}", "03")
          .replace("{n}", "011")
          .replace(/\s{2,}/g, " ")
          .trim()}.mp3”. Placeholders: {artist} {title} {orchestra} {singer} {year} {rhythm} {tanda} {n}.`}
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

      <Group
        header="Playback"
        footer={`Where a cortina stops: TDJ's player cuts it there, M3U8 and XSPF tell VLC to stop (#EXTVLCOPT / vlc:option stop-time), Rekordbox XML gets a hot cue at that second. ${settings.cortinaStopSec === null ? `Following the composer's cortina length (${cortinaStopSec(settings, options.cortinaLengthSec)} s).` : "Spotify playlists cannot trim tracks: cortinas there play in full, or leave them out when exporting."}`}
      >
        <StepperRow
          label="Cortina play length"
          sub={settings.cortinaStopSec === null ? "Follows the composer" : "Your own length"}
          value={cortinaStopSec(settings, options.cortinaLengthSec)}
          unit=" s"
          min={CORTINA_STOP_RANGE.min}
          max={CORTINA_STOP_RANGE.max}
          step={CORTINA_STOP_RANGE.step}
          onChange={(v) => setSettings({ cortinaStopSec: v })}
          tile={
            <Tile color="#ff2d55">
              <Timer size={16} strokeWidth={2} />
            </Tile>
          }
        />
        <SwitchRow
          label="Follow the composer's cortina length"
          checked={settings.cortinaStopSec === null}
          onChange={(v) =>
            setSettings({ cortinaStopSec: v ? null : cortinaStopSec(settings, options.cortinaLengthSec) })
          }
        />
      </Group>

      <Group header="Region" footer="Default for Tonight's region on the composer.">
        <PickerRow
          label="Where you usually play"
          value={settings.region}
          items={REGIONS}
          onChange={(r) => r && setSettings({ region: r })}
          tile={
            <Tile color="#007aff">
              <Globe size={16} strokeWidth={2} />
            </Tile>
          }
        />
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
          tile={
            <Tile color="#636366">
              <Palette size={16} strokeWidth={2} />
            </Tile>
          }
        />
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
