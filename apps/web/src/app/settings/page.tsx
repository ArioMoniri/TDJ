"use client";
import { Check, Copy, Eye, EyeOff, Globe, KeyRound, Palette, Radio, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Field, Segmented, Switch } from "@/components/ui";
import { beginAuth } from "@/lib/spotify";
import { useStore } from "@/lib/store";
import type { UserSettings } from "@/lib/types";

const MODELS: Array<[string, string]> = [
  ["claude-opus-5-5", "Best"],
  ["claude-sonnet-5-5", "Balanced"],
  ["claude-haiku-5-5", "Fast"],
  ["claude-fable-5-1", "Fable"],
];
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
          then paste the Client ID.
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
          <Badge ok={!!settings.anthropicApiKey}>{settings.anthropicApiKey ? "Key saved" : "No key"}</Badge>
        </div>
        <p className="text-muted text-sm">
          An Anthropic API key lets you ask for a written review of a set from the result card.
        </p>
        <Field label="API key" htmlFor="anthropic-key">
          <div className="flex gap-2">
            <input
              id="anthropic-key"
              value={settings.anthropicApiKey}
              onChange={(e) => setSettings({ anthropicApiKey: e.target.value.trim() })}
              placeholder="sk-ant-…"
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
        <Field label="Model" hint={settings.anthropicModel}>
          <Segmented
            label="Model"
            value={settings.anthropicModel}
            onChange={(m) => setSettings({ anthropicModel: m })}
            items={MODELS}
          />
        </Field>
        <p className="text-muted flex items-center gap-1.5 text-xs">
          <ShieldCheck size={13} /> Sent with your review request only; never stored on the server.
        </p>
      </section>

      <section className="surface space-y-4 p-5 sm:p-6" aria-labelledby="region-h">
        <h2 id="region-h" className="flex items-center gap-2 font-semibold">
          <Globe size={18} /> Region
        </h2>
        <Field label="Where you usually play" hint="Shapes cortina defaults">
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
