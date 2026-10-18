"use client";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  FolderOpen,
  Globe,
  KeyRound,
  LoaderCircle,
  Palette,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Field, Segmented, Switch } from "@/components/ui";
import { beginAuth } from "@/lib/spotify";
import { useStore } from "@/lib/store";
import {
  AI_DEFAULT_MODEL,
  AI_PROVIDERS,
  type AiProvider,
  DEFAULT_NAMING,
  DJ_APPS,
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

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${ok ? "bg-[#2f9e5b]/15 text-[var(--ok)]" : "bg-[rgb(var(--text)/.08)] text-[rgb(var(--muted))]"}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-[#2f9e5b]" : "bg-[rgb(var(--muted))]"}`}
        aria-hidden
      />
      {children}
    </span>
  );
}

export default function Settings() {
  const { settings, setSettings, spotifyToken, setSpotifyToken } = useStore();
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [redirect, setRedirect] = useState("/callback");
  const [test, setTest] = useState<{ state: "idle" | "busy" | "ok" | "fail"; text?: string }>({ state: "idle" });
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
      if (r.ok) setTest({ state: "ok", text: `Connected. ${ai.model || "Default model"} answered "${j.text}".` });
      else setTest({ state: "fail", text: j.error ?? `Failed (${r.status}).` });
    } catch {
      setTest({ state: "fail", text: "Could not reach the server." });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Settings</h1>
        <p className="text-muted mt-1 text-sm">
          Keys stay in this browser and are sent only with your own requests.
        </p>
      </div>

      <section className="surface space-y-4 p-5 sm:p-6" aria-labelledby="spotify-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="spotify-h" className="flex items-center gap-2 font-semibold">
            <Radio size={18} /> Spotify
          </h2>
          <Badge ok={!!spotifyToken}>
            {spotifyToken ? `Connected · ${minutesLeft} min left` : "Not connected"}
          </Badge>
        </div>
        <p className="text-muted text-sm">
          Create an app at developer.spotify.com (your account must be Premium), add the redirect URI below,
          then paste the Client ID. Once connected, Listen plays the exact recordings and cortinas.
        </p>
        <Field label="Redirect URI" htmlFor="redirect-uri" hint="Add this to your Spotify app">
          <div className="flex gap-2">
            <input id="redirect-uri" readOnly value={redirect} className="field font-mono text-sm" />
            <button
              type="button"
              className="btn btn-ghost shrink-0"
              onClick={copyRedirect}
              aria-live="polite"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </Field>
        <Field label="Client ID" htmlFor="spotify-client-id">
          <input
            id="spotify-client-id"
            value={settings.spotifyClientId}
            onChange={(e) => setSettings({ spotifyClientId: e.target.value.trim() })}
            placeholder="e.g. 7f3c1a9b2d…"
            className="field"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!settings.spotifyClientId}
            onClick={() => beginAuth(settings.spotifyClientId)}
          >
            {spotifyToken ? "Reconnect" : "Connect Spotify"}
          </button>
          {spotifyToken && (
            <button type="button" className="btn btn-ghost" onClick={() => setSpotifyToken(null)}>
              Disconnect
            </button>
          )}
        </div>
      </section>

      <section className="surface space-y-4 p-5 sm:p-6" aria-labelledby="review-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="review-h" className="flex items-center gap-2 font-semibold">
            <KeyRound size={18} /> Written reviews
          </h2>
          <Badge ok={!!ai.key}>{ai.key ? "Key saved" : "No key"}</Badge>
        </div>
        <p className="text-muted text-sm">
          A model key lets you ask for a written review of a set and turns “Tell the DJ” requests into
          precise changes. Without one, free-text requests still work by keyword.
        </p>
        <Field label="Provider">
          <Segmented label="Provider" value={ai.provider} onChange={switchProvider} items={AI_PROVIDERS} />
        </Field>
        <Field label="API key" htmlFor="ai-key">
          <div className="flex gap-2">
            <input
              id="ai-key"
              value={ai.key}
              onChange={(e) => setAi({ key: e.target.value.trim() })}
              placeholder={KEY_PLACEHOLDER[ai.provider]}
              type={showKey ? "text" : "password"}
              className="field font-mono text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowKey((v) => !v)}
              aria-pressed={showKey}
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </Field>
        <Field label="Model" htmlFor="ai-model" hint={`Default: ${AI_DEFAULT_MODEL[ai.provider]}`}>
          <input
            id="ai-model"
            list="ai-model-list"
            value={ai.model}
            onChange={(e) => setAi({ model: e.target.value.trim() })}
            placeholder={AI_DEFAULT_MODEL[ai.provider]}
            className="field font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
          <datalist id="ai-model-list">
            {MODEL_SUGGESTIONS[ai.provider].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div className="chip-row scroll-x mt-2">
            {MODEL_SUGGESTIONS[ai.provider].map((m) => (
              <button
                type="button"
                key={m}
                className={`chip ${ai.model === m ? "chip-on" : ""}`}
                aria-pressed={ai.model === m}
                onClick={() => setAi({ model: m })}
              >
                {m}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={testConnection}
            disabled={!ai.key || test.state === "busy"}
          >
            {test.state === "busy" ? <LoaderCircle size={15} className="animate-spin" /> : null} Test connection
          </button>
          <span
            role="status"
            aria-live="polite"
            className={`text-sm ${test.state === "fail" ? "text-[var(--accent)]" : test.state === "ok" ? "text-[var(--ok)]" : "text-muted"}`}
          >
            {test.text ?? ""}
          </span>
        </div>
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <ShieldCheck size={13} /> Sent with your own requests only; never stored on the server.
        </p>
      </section>

      <section className="surface space-y-4 p-5 sm:p-6" aria-labelledby="djapps-h">
        <h2 id="djapps-h" className="flex items-center gap-2 font-semibold">
          <FolderOpen size={18} /> DJ apps
        </h2>
        <p className="text-muted text-sm">
          Tell TDJ where each app keeps your tango files so exports point at real paths instead of a TDJ/
          placeholder. Files are expected as “{settings.fileNaming || DEFAULT_NAMING}.mp3”.
        </p>
        <Field label="File naming" htmlFor="file-naming" hint="{artist} {title} {orchestra} {singer} {year} {tanda} {n}">
          <input
            id="file-naming"
            value={settings.fileNaming}
            onChange={(e) => setSettings({ fileNaming: e.target.value })}
            placeholder={DEFAULT_NAMING}
            className="field font-mono text-sm"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <div className="space-y-3">
          {DJ_APPS.map((app) => (
            <div key={app.id} className="rounded-xl bg-[rgb(var(--text)/.04)] p-3">
              <Field label={app.label} htmlFor={`folder-${app.id}`} hint={app.format}>
                <input
                  id={`folder-${app.id}`}
                  value={settings.djApps[app.id]?.folder ?? ""}
                  onChange={(e) =>
                    setSettings({ djApps: { ...settings.djApps, [app.id]: { folder: e.target.value } } })
                  }
                  placeholder={app.id === "rekordbox" ? "/Users/you/Music/Tango" : "Music folder path"}
                  className="field font-mono text-sm"
                  autoComplete="off"
                  spellCheck={false}
                />
              </Field>
              <p className="text-muted mt-2 text-xs leading-relaxed">{app.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="surface space-y-4 p-5 sm:p-6" aria-labelledby="region-h">
        <h2 id="region-h" className="flex items-center gap-2 font-semibold">
          <Globe size={18} /> Region
        </h2>
        <Field label="Where you usually play" hint="Default for Tonight's region">
          <Segmented
            label="Region"
            chips
            value={settings.region}
            onChange={(r) => setSettings({ region: r })}
            items={REGIONS}
          />
        </Field>
      </section>

      <section className="surface space-y-4 p-5 sm:p-6" aria-labelledby="appearance-h">
        <h2 id="appearance-h" className="flex items-center gap-2 font-semibold">
          <Palette size={18} /> Appearance
        </h2>
        <Field label="Theme">
          <Segmented
            label="Theme"
            value={settings.theme}
            onChange={(t) => setSettings({ theme: t })}
            items={THEMES}
          />
        </Field>
        <Switch
          checked={settings.reduceGlass}
          onChange={(v) => setSettings({ reduceGlass: v })}
          label="Reduce transparency"
          hint="Solid navigation and sheets; easier to read and lighter on the battery."
        />
      </section>
    </div>
  );
}
