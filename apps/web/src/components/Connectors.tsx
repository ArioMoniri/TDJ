"use client";
import { Disc, Library, Radio, Webhook } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { beginAuth } from "@/lib/spotify";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { ActionRow, FieldRow, Group, Row, Tile } from "./Form";
import { Sheet } from "./Sheet";

type Status = "checking" | "ok" | "down" | "idle";
const statusText: Record<Status, string> = {
  checking: "Checking…",
  ok: "Reachable",
  down: "Unreachable",
  idle: "Keyless",
};

/**
 * Settings → Connectors: tile rows → a per-service sheet. Spotify (BYO Client ID, as before), Deezer (keyless,
 * previews and metadata only), MusicBrainz (keyless, recording dates) and "Bring your own automation" (a webhook
 * the Export sheet can POST to). Only what the research says works is promised: no Deezer, Amazon or Beatport
 * exports (docs/research/connectors.md §6).
 */
export function Connectors() {
  const { settings, setSettings, spotifyToken, setSpotifyToken, overrides, updateOverrides } = useStore();
  const [open, setOpen] = useState<"spotify" | "deezer" | "musicbrainz" | "webhook" | null>(null);
  const [deezer, setDeezer] = useState<Status>("idle");
  const [mb, setMb] = useState<Status>("idle");
  const [redirect, setRedirect] = useState("/callback");
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  useEffect(() => setRedirect(`${location.origin}/callback`), []);
  const webhookUrl = overrides.connectors?.webhookUrl ?? "";
  const minutesLeft = spotifyToken ? Math.max(0, Math.round((spotifyToken.expires - Date.now()) / 60000)) : 0;

  const checkDeezer = async () => {
    setDeezer("checking");
    try {
      // Deezer answers keyless with CORS *; the browser asks it directly (spec §6)
      const r = await fetch("https://api.deezer.com/infos", { mode: "cors" });
      setDeezer(r.ok ? "ok" : "down");
    } catch {
      setDeezer("down");
    }
  };
  const checkMb = async () => {
    setMb("checking");
    try {
      const r = await fetch("/api/resolve");
      const j = (await r.json()) as { musicbrainz?: boolean };
      setMb(j.musicbrainz ? "ok" : "down");
    } catch {
      setMb("down");
    }
  };
  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirect);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  const saveHook = () => {
    const v = draft.trim();
    if (v && !/^https:\/\//i.test(v)) {
      toast("The webhook must be an https:// URL");
      return;
    }
    updateOverrides((o) => ({ ...o, connectors: { ...(o.connectors ?? {}), webhookUrl: v || undefined } }));
    setOpen(null);
    toast(v ? "Webhook saved in this browser" : "Webhook removed");
  };
  const tile = (color: string, icon: ReactNode) => <Tile color={color}>{icon}</Tile>;

  return (
    <>
      <Group
        header="Connectors"
        footer="Spotify needs your own developer app (Premium account, 5 users per app). Deezer and MusicBrainz are keyless and used for 30 s previews, artwork and recording dates only: no Deezer export is offered since Deezer closed new developer apps in June 2025. Amazon Music and Beatport have no public API. Keys and URLs stay in this browser."
        id="connectors"
      >
        <Row
          tile={tile("#1db954", <Radio size={16} strokeWidth={2} />)}
          label="Spotify"
          sub="Playlists · full tracks in Listen"
          value={
            spotifyToken
              ? `Connected · ${minutesLeft} min`
              : settings.spotifyClientId
                ? "Not connected"
                : "Needs a Client ID"
          }
          chevron
          onClick={() => setOpen("spotify")}
          id="connector-spotify"
        />
        <Row
          tile={tile("#a238ff", <Disc size={16} strokeWidth={2} />)}
          label="Deezer"
          sub="Used for previews and metadata"
          value={statusText[deezer]}
          chevron
          onClick={() => {
            setOpen("deezer");
            if (deezer === "idle") void checkDeezer();
          }}
          id="connector-deezer"
        />
        <Row
          tile={tile("#ba478f", <Library size={16} strokeWidth={2} />)}
          label="MusicBrainz"
          sub="Recording dates and singers"
          value={statusText[mb]}
          chevron
          onClick={() => {
            setOpen("musicbrainz");
            if (mb === "idle") void checkMb();
          }}
          id="connector-musicbrainz"
        />
        <Row
          tile={tile("#5856d6", <Webhook size={16} strokeWidth={2} />)}
          label="Bring your own automation"
          sub="Export → Webhook for Pipedream, Make, Zapier, n8n"
          value={webhookUrl ? "Set" : "Not set"}
          chevron
          onClick={() => {
            setDraft(webhookUrl);
            setOpen("webhook");
          }}
          id="connector-webhook"
        />
      </Group>

      <Sheet open={open === "spotify"} onClose={() => setOpen(null)} title="Spotify" trailing="Done">
        <Group
          header="Account"
          footer="Create an app at developer.spotify.com (Premium account), add the redirect URI to it, then paste the Client ID. Connected, Listen plays the exact recordings and Export can create playlists."
        >
          <Row label="Status" value={spotifyToken ? `Connected · ${minutesLeft} min` : "Not connected"} />
          <Row label="Used for" value="Playlists · Listen" />
          <ActionRow
            label={spotifyToken ? "Reconnect" : "Connect Spotify"}
            onClick={() => beginAuth(settings.spotifyClientId)}
            disabled={!settings.spotifyClientId}
          />
          {spotifyToken && <ActionRow label="Disconnect" destructive onClick={() => setSpotifyToken(null)} />}
        </Group>
        <Group header="Your own app">
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
        </Group>
      </Sheet>

      <Sheet
        open={open === "deezer"}
        onClose={() => setOpen(null)}
        title="Deezer"
        trailing="Done"
        detents={["medium"]}
      >
        <Group
          header="Keyless"
          footer="Deezer's public search gives TDJ 30 s previews, artwork and durations for the play buttons and the in-browser analysis. Nothing is written to Deezer and no account is needed. Deezer export is not offered: new developer apps have been closed since June 2025."
        >
          <Row label="Status" value={statusText[deezer]} busy={deezer === "checking"} />
          <Row label="Used for" value="Previews · Metadata" />
          <ActionRow label="Check again" onClick={checkDeezer} busy={deezer === "checking"} />
        </Group>
      </Sheet>

      <Sheet
        open={open === "musicbrainz"}
        onClose={() => setOpen(null)}
        title="MusicBrainz"
        trailing="Done"
        detents={["medium"]}
      >
        <Group
          header="Keyless"
          footer="MusicBrainz recordings give the first-release year that 'Find on services' suggests for a catalogue entry (streaming reissue dates are never used as the recording year). Requests go through the TDJ server with its own user agent."
        >
          <Row label="Status" value={statusText[mb]} busy={mb === "checking"} />
          <Row label="Used for" value="Recording dates · Singers" />
          <ActionRow label="Check again" onClick={checkMb} busy={mb === "checking"} />
        </Group>
      </Sheet>

      <Sheet
        open={open === "webhook"}
        onClose={() => setOpen(null)}
        title="Your automation"
        trailing="Save"
        onTrailing={saveHook}
        detents={["medium", "large"]}
      >
        <Group
          header="Webhook URL"
          footer="Export → Send to → Webhook POSTs the chosen format (Rekordbox XML, M3U8, CSV…) as the request body, with X-TDJ-Format and X-TDJ-Set headers and ?format=&filename= query parameters. Point it at a Pipedream, Make, Zapier or n8n webhook that files, mails or pushes the set wherever you need. The URL is stored in this browser only."
        >
          <label htmlFor="connector-webhook-url" className="cell">
            <span className="sr-only">Webhook URL</span>
            <input
              id="connector-webhook-url"
              className="field font-mono"
              data-autofocus
              inputMode="url"
              placeholder="https://…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </Group>
        {webhookUrl && (
          <Group>
            <ActionRow
              label="Remove webhook"
              destructive
              onClick={() => {
                setDraft("");
                updateOverrides((o) => ({
                  ...o,
                  connectors: { ...(o.connectors ?? {}), webhookUrl: undefined },
                }));
                setOpen(null);
              }}
            />
          </Group>
        )}
      </Sheet>
    </>
  );
}
