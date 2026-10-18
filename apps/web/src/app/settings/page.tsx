"use client";
import { Globe2, KeyRound, Music, Palette, ShieldCheck } from "lucide-react";
import { beginAuth } from "@/lib/spotify";
import { useStore } from "@/lib/store";

const MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5", "claude-fable-5-1"];

export default function Settings() {
  const { settings, setSettings, spotifyToken, setSpotifyToken } = useStore();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="font-serif text-3xl font-semibold">Your panel</h1>
      <p className="text-muted text-sm">
        Each user brings their own keys. They live only in this browser (localStorage) and are sent per
        request, never stored on the server.
      </p>

      <section className="glass p-5 space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Music size={18} /> Spotify
        </h2>
        <p className="text-muted text-sm">
          Create an app at developer.spotify.com (Dev Mode, your account must be Premium), add{" "}
          <code className="rounded bg-black/10 px-1">
            {typeof location !== "undefined" ? `${location.origin}/callback` : "/callback"}
          </code>{" "}
          as Redirect URI, paste the Client ID.
        </p>
        <input
          value={settings.spotifyClientId}
          onChange={(e) => setSettings({ spotifyClientId: e.target.value.trim() })}
          placeholder="Spotify Client ID"
          className="w-full rounded-xl border border-white/30 bg-white/30 px-3 py-2 dark:bg-white/10"
          autoComplete="off"
        />
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
          <span className="text-muted self-center text-xs">
            {spotifyToken
              ? `connected · token valid ${Math.max(0, Math.round((spotifyToken.expires - Date.now()) / 60000))} min`
              : "not connected"}
          </span>
        </div>
      </section>

      <section className="glass p-5 space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound size={18} /> AI reviewer (Anthropic)
        </h2>
        <input
          value={settings.anthropicApiKey}
          onChange={(e) => setSettings({ anthropicApiKey: e.target.value.trim() })}
          placeholder="sk-ant-…"
          type="password"
          className="w-full rounded-xl border border-white/30 bg-white/30 px-3 py-2 dark:bg-white/10"
          autoComplete="off"
        />
        <div className="scroll-x flex gap-2">
          {MODELS.map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setSettings({ anthropicModel: m })}
              className={`chip ${settings.anthropicModel === m ? "chip-on" : ""}`}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-muted flex items-center gap-1 text-xs">
          <ShieldCheck size={13} /> Sent as a request header to /api/ai/explain only; never logged.
        </p>
      </section>

      <section className="glass p-5 space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Globe2 size={18} /> Region defaults
        </h2>
        <div className="scroll-x flex gap-2">
          {(["buenos-aires", "europe", "istanbul", "asia", "us"] as const).map((r) => (
            <button
              type="button"
              key={r}
              onClick={() => setSettings({ region: r })}
              className={`chip capitalize ${settings.region === r ? "chip-on" : ""}`}
            >
              {r.replace("-", " ")}
            </button>
          ))}
        </div>
      </section>

      <section className="glass p-5 space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Palette size={18} /> Appearance
        </h2>
        <div className="flex gap-2">
          {(["auto", "light", "dark"] as const).map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => {
                setSettings({ theme: t });
                document.documentElement.dataset.theme = t === "auto" ? "" : t;
                document.documentElement.classList.toggle("dark", t === "dark");
              }}
              className={`chip capitalize ${settings.theme === t ? "chip-on" : ""}`}
            >
              {t}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.reduceGlass}
            onChange={(e) => setSettings({ reduceGlass: e.target.checked })}
          />{" "}
          Reduce transparency (battery / accessibility)
        </label>
      </section>
    </div>
  );
}
