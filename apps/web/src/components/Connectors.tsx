"use client";
import { Cloud, Disc, HardDrive, KeyRound, Library, ListVideo, Radio, Webhook } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import {
  beginAuth,
  CONNECT_FALLBACK,
  type ConnectApp,
  directLogout,
  dropboxLoginUrl,
  type GoogleFeature,
  googleLoginUrl,
  hostedLoginUrl,
  hostedLogout,
  openConnectLink,
  useConnectors,
} from "@/lib/spotify";
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
const DEPLOY_DOCS = "https://github.com/ArioMoniri/TDJ/blob/main/docs/DEPLOY.md#connectors";
const APP_META: Record<ConnectApp, { color: string; icon: ReactNode; sub: string; blurb: string }> = {
  youtube_data_api: {
    color: "#ff0000",
    icon: <ListVideo size={16} strokeWidth={2} />,
    sub: "Playlists · YouTube Music sees them too",
    blurb:
      "Creates a YouTube playlist in your account (YouTube Music shows it as well). Matching uses a daily search budget shared by every TDJ user, so some 78-rpm recordings may be left out; the result lists them.",
  },
  dropbox: {
    color: "#0061ff",
    icon: <Cloud size={16} strokeWidth={2} />,
    sub: "Export files to your Dropbox",
    blurb:
      "Saves the chosen export file (Rekordbox XML, Traktor NML, M3U8, CSV…) into the TDJ app folder of your Dropbox.",
  },
  google_drive: {
    color: "#1fa463",
    icon: <HardDrive size={16} strokeWidth={2} />,
    sub: "Export files to your Drive",
    blurb: "Saves the chosen export file into your Google Drive. TDJ only sees files it created.",
  },
  spotify: {
    color: "#1db954",
    icon: <Radio size={16} strokeWidth={2} />,
    sub: "Playlists",
    blurb: "Spotify through Pipedream: the same 5-listeners-per-app rule applies to Pipedream's Spotify app.",
  },
};
const GOOGLE_COLOR = "#4285f4";

/** The status dot in front of a row value: green connected, grey not, amber needs attention. */
function Dot({ tone }: { tone: "on" | "off" | "warn" }) {
  const bg = tone === "on" ? "var(--system-green)" : tone === "warn" ? "#ff9500" : "var(--label-3)";
  return (
    <span
      className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full align-middle"
      style={{ background: bg }}
      aria-hidden
    />
  );
}
const withDot = (tone: "on" | "off" | "warn", text: string) => (
  <span className="inline-flex items-center">
    <Dot tone={tone} />
    {text}
  </span>
);

/** What the OAuth callback says in the URL, as one toast. */
function arrivalToast(connected: string | null, error: string | null): string {
  if (connected === "spotify") return "Logged in with Spotify";
  if (connected === "google") return "Connected with Google";
  if (connected === "dropbox") return "Connected to Dropbox";
  if (connected) return "Connected. You can close the other tab.";
  const m = error?.match(/^(spotify|google|dropbox)_(\w+)$/);
  if (m) {
    const who = m[1] === "spotify" ? "Spotify" : m[1] === "google" ? "Google" : "Dropbox";
    if (m[2] === "denied") return `${who} did not grant access.`;
    if (m[2] === "state") return "The login expired; try again.";
    return `Could not finish the ${who} login.`;
  }
  return "The connection was not completed.";
}

/**
 * Settings → Connectors for non-technical DJs: one tile row per service, a status dot and ONE primary action in its
 * sheet ("Log in with Spotify", "Connect with Google", "Connect Dropbox"). Each row is a direct OAuth login with the
 * deployment's own app (lib/server/oauth.ts); Google asks for Drive and YouTube one feature at a time. Developer
 * fields (BYO Spotify Client ID, webhook URL) and the optional Pipedream Connect alternative sit under Advanced.
 * Only what the research says works is promised: no Deezer, Amazon or Beatport exports
 * (docs/research/connectors.md §6).
 */
export function Connectors() {
  const { settings, setSettings, spotifyToken, setSpotifyToken, overrides, updateOverrides } = useStore();
  const { spotify, google, dropbox, connect, reload } = useConnectors();
  const [open, setOpen] = useState<
    "spotify" | "google" | "dropbox" | "deezer" | "musicbrainz" | "webhook" | `pd:${ConnectApp}` | null
  >(null);
  const [advanced, setAdvanced] = useState(false);
  const [deezer, setDeezer] = useState<Status>("idle");
  const [mb, setMb] = useState<Status>("idle");
  const [redirect, setRedirect] = useState("/callback");
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setRedirect(`${location.origin}/callback`), []);
  // back from an OAuth dance (same tab for the direct logins, a second tab for Connect Link): say so once, clean the URL
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const connected = q.get("connected");
    const error = q.get("error");
    if (!connected && !error) return;
    toast(arrivalToast(connected, error));
    history.replaceState(null, "", location.pathname);
  }, []);
  const webhookUrl = overrides.connectors?.webhookUrl ?? "";
  const hosted = spotify?.hosted ?? false;
  const hostedUser = spotify?.user ?? null;
  const byoConnected = !hosted && !!spotifyToken;
  const minutesLeft = spotifyToken ? Math.max(0, Math.round((spotifyToken.expires - Date.now()) / 60000)) : 0;
  const spotifyValue =
    spotify === null
      ? "Checking…"
      : hosted
        ? hostedUser
          ? withDot("on", hostedUser.name)
          : withDot("off", "Log in")
        : byoConnected
          ? withDot("on", `Connected · ${minutesLeft} min`)
          : settings.spotifyClientId
            ? withDot("off", "Connect")
            : withDot("warn", "Needs a Client ID");
  const directValue = (s: typeof google) =>
    s === null
      ? "Checking…"
      : !s.hosted
        ? withDot("off", "Not enabled")
        : s.user
          ? withDot("on", s.user.name)
          : withDot("off", "Connect");
  const pdEnabled = connect?.enabled ?? false;
  const accountFor = (app: ConnectApp) => connect?.accounts.find((a) => a.app === app);
  const connectValue = (app: ConnectApp) => {
    if (connect === null) return "Checking…";
    if (!connect.enabled) return withDot("off", "Not enabled");
    const a = accountFor(app);
    return a
      ? withDot(a.healthy ? "on" : "warn", a.healthy ? "Connected" : "Reconnect")
      : withDot("off", "Connect");
  };

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
  const logout = async () => {
    setBusy("logout");
    try {
      await hostedLogout();
      setSpotifyToken(null);
      await reload();
      toast("Logged out of Spotify");
    } finally {
      setBusy(null);
    }
  };
  const disconnectDirect = async (provider: "google" | "dropbox") => {
    setBusy(`${provider}-logout`);
    try {
      await directLogout(provider);
      await reload();
      toast(provider === "google" ? "Disconnected from Google" : "Disconnected from Dropbox");
    } finally {
      setBusy(null);
    }
  };
  const connectApp = async (app: ConnectApp) => {
    setBusy(app);
    try {
      await openConnectLink(app);
      toast("Finish in the new tab, then come back here");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const tile = (color: string, icon: ReactNode) => <Tile color={color}>{icon}</Tile>;
  const notEnabled = (what: string, secrets: string) => (
    <Group
      header="Account"
      footer={`${what} This deployment has not enabled it: the owner adds ${secrets} as described in docs/DEPLOY.md → Connectors.${pdEnabled ? " Pipedream Connect is enabled here instead; see Advanced below." : ""}`}
    >
      <Row label="Status" value="Not enabled on this deployment" />
      <Row label="How to enable" sub="docs/DEPLOY.md → Connectors" chevron href={DEPLOY_DOCS} />
    </Group>
  );
  const googleUser = google?.user ?? null;
  const granted = (f: GoogleFeature) => google?.scopes?.[f] ?? false;
  // no service has credentials on this deployment: the owner configures them in-app at /admin (docs/DEPLOY.md)
  const needsOwnerSetup =
    spotify !== null && google !== null && dropbox !== null && !hosted && !google.hosted && !dropbox.hosted;
  const connectRow = (app: ConnectApp) => (
    <Row
      key={app}
      tile={tile(APP_META[app].color, APP_META[app].icon)}
      label={`${(connect ?? CONNECT_FALLBACK).apps.find((a) => a.slug === app)?.label ?? app} via Pipedream`}
      sub={APP_META[app].sub}
      value={connectValue(app)}
      chevron
      onClick={() => setOpen(`pd:${app}`)}
      id={`connector-pd-${app}`}
    />
  );
  const connectSheet = (app: ConnectApp) => {
    const label = (connect ?? CONNECT_FALLBACK).apps.find((a) => a.slug === app)?.label ?? app;
    const a = accountFor(app);
    return (
      <Sheet
        key={app}
        open={open === `pd:${app}`}
        onClose={() => setOpen(null)}
        title={`${label} via Pipedream`}
        trailing="Done"
      >
        <Group
          header="Account"
          footer={`${APP_META[app].blurb} One button: ${label} asks for your permission in a new tab and Pipedream keeps the connection; TDJ never sees your password or your tokens.`}
        >
          <Row
            label="Status"
            value={
              a
                ? `Connected${a.name ? ` · ${a.name}` : ""}${a.healthy ? "" : " · needs attention"}`
                : "Not connected"
            }
          />
          <Row label="Used for" value={APP_META[app].sub.split(" · ")[0]} />
          <ActionRow
            label={a ? `Reconnect ${label}` : `Connect ${label}`}
            onClick={() => connectApp(app)}
            busy={busy === app}
            id={`connect-${app}`}
          />
        </Group>
      </Sheet>
    );
  };

  return (
    <>
      <Group
        header="Send your set to"
        footer={
          hosted
            ? "Log in with Spotify to create playlists and play full tracks in Listen; nothing to paste. Google (Drive files and YouTube playlists) and Dropbox connect in one tap with this deployment's own apps when the owner has enabled them."
            : "Spotify needs your own developer app on this deployment (Premium account, 5 users per app): open Spotify → Advanced. Google (Drive files and YouTube playlists) and Dropbox connect in one tap when the deployment enables them."
        }
        id="connectors"
      >
        <Row
          tile={tile("#1db954", <Radio size={16} strokeWidth={2} />)}
          label="Spotify"
          sub="Playlists · full tracks in Listen"
          value={spotifyValue}
          chevron
          onClick={() => setOpen("spotify")}
          id="connector-spotify"
        />
        <Row
          tile={tile(GOOGLE_COLOR, <HardDrive size={16} strokeWidth={2} />)}
          label="Google"
          sub="Drive files · YouTube playlists"
          value={directValue(google)}
          chevron
          onClick={() => setOpen("google")}
          id="connector-google"
        />
        <Row
          tile={tile(APP_META.dropbox.color, APP_META.dropbox.icon)}
          label="Dropbox"
          sub={APP_META.dropbox.sub}
          value={directValue(dropbox)}
          chevron
          onClick={() => setOpen("dropbox")}
          id="connector-dropbox"
        />
        {needsOwnerSetup && (
          <Row
            tile={tile("#636366", <KeyRound size={16} strokeWidth={2} />)}
            label="Owner setup"
            sub="Enable one-tap logins for this deployment"
            value="Open"
            chevron
            onClick={() => location.assign("/admin")}
            id="connector-owner-setup"
          />
        )}
      </Group>

      <Group
        header="Also used"
        footer="Deezer and MusicBrainz are keyless and used for 30 s previews, artwork and recording dates only: no Deezer export is offered since Deezer closed new developer apps in June 2025. Amazon Music and Beatport have no public API."
      >
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
      </Group>

      <Group
        header="Advanced"
        footer={
          pdEnabled
            ? "For DJs who run their own automation. Keys and URLs stay in this browser. The Pipedream rows are an alternative to the direct logins above: Pipedream keeps the connection and proxies every request."
            : "For DJs who run their own automation. Keys and URLs stay in this browser."
        }
      >
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
        {pdEnabled &&
          (["youtube_data_api", "dropbox", "google_drive", "spotify"] as ConnectApp[]).map(connectRow)}
      </Group>

      <Sheet open={open === "spotify"} onClose={() => setOpen(null)} title="Spotify" trailing="Done">
        <Group
          header="Account"
          footer={
            hosted
              ? "Log in with your Spotify account; there is nothing to paste. Connected, Listen plays the exact recordings and Export creates playlists in your library (private by default). This deployment's Spotify app runs in Development Mode: Spotify allows 5 listeners per app, which the owner adds by e-mail in the Spotify dashboard, or more with Extended Quota. The login is kept in a sealed cookie in this browser; Spotify asks again after six months."
              : "This deployment has no Spotify app of its own, so you connect with your own developer app: create one at developer.spotify.com (Premium account, 5 users per app), add the redirect URI under Advanced to it and paste the Client ID. Connected, Listen plays the exact recordings and Export can create playlists."
          }
        >
          <Row
            label="Status"
            value={
              spotify === null
                ? "Checking…"
                : hosted
                  ? hostedUser
                    ? `Logged in as ${hostedUser.name}`
                    : "Not logged in"
                  : byoConnected
                    ? `Connected · ${minutesLeft} min`
                    : "Not connected"
            }
            busy={spotify === null}
          />
          <Row label="Used for" value="Playlists · Listen" />
          {hosted ? (
            hostedUser ? (
              <ActionRow
                label="Log out"
                destructive
                onClick={logout}
                busy={busy === "logout"}
                id="spotify-logout"
              />
            ) : (
              <ActionRow
                label="Log in with Spotify"
                onClick={() => location.assign(hostedLoginUrl("/settings"))}
                id="spotify-login"
              />
            )
          ) : (
            <>
              <ActionRow
                label={byoConnected ? "Reconnect" : "Connect Spotify"}
                onClick={() => beginAuth(settings.spotifyClientId)}
                disabled={!settings.spotifyClientId}
                id="spotify-connect"
              />
              {byoConnected && (
                <ActionRow label="Disconnect" destructive onClick={() => setSpotifyToken(null)} />
              )}
            </>
          )}
        </Group>
        <Group>
          <Row
            label="Advanced"
            sub={hosted ? "Use your own Spotify app instead" : "Your own Spotify app"}
            value={advanced ? "Hide" : "Show"}
            onClick={() => setAdvanced((v) => !v)}
            id="spotify-advanced"
          />
        </Group>
        {advanced && (
          <Group
            header="Your own app"
            footer={
              hosted
                ? "With a Client ID here, Connect Spotify uses your own developer app in this browser (PKCE) instead of the hosted login. Useful when the deployment's 5 listener seats are taken."
                : "Add this exact redirect URI to your app at developer.spotify.com, then paste its Client ID."
            }
          >
            <Row label="Redirect URI" sub={<span className="font-mono">{redirect}</span>}>
              <button type="button" className="btn-plain" onClick={copyRedirect} aria-live="polite">
                {copied ? "Copied" : "Copy"}
              </button>
            </Row>
            <FieldRow label="Client ID" id="spotify-client-id">
              <input
                id="spotify-client-id"
                className="field field-value min-w-0 flex-1"
                placeholder={hosted ? "Optional" : "Required"}
                value={settings.spotifyClientId}
                onChange={(e) => setSettings({ spotifyClientId: e.target.value.trim() })}
                autoComplete="off"
                spellCheck={false}
              />
            </FieldRow>
            {hosted && (
              <ActionRow
                label="Connect with my own app"
                onClick={() => beginAuth(settings.spotifyClientId)}
                disabled={!settings.spotifyClientId}
                id="spotify-connect"
              />
            )}
          </Group>
        )}
      </Sheet>

      <Sheet open={open === "google"} onClose={() => setOpen(null)} title="Google" trailing="Done">
        {google === null || google.hosted ? (
          <>
            <Group
              header="Account"
              footer="One Google account for two things: export files go to a TDJ folder in your Drive (TDJ only ever sees files it created), and playlists go to YouTube (YouTube Music shows them too). Google asks for each permission the first time you use it. The login is kept in a sealed cookie in this browser; myaccount.google.com → Security → Third-party access removes it."
            >
              <Row
                label="Status"
                value={
                  google === null
                    ? "Checking…"
                    : googleUser
                      ? `Connected as ${googleUser.name}`
                      : "Not connected"
                }
                sub={googleUser?.email}
                busy={google === null}
              />
              <Row label="Used for" value="Drive files · YouTube playlists" />
              {googleUser ? (
                <ActionRow
                  label="Disconnect"
                  destructive
                  onClick={() => disconnectDirect("google")}
                  busy={busy === "google-logout"}
                  id="google-logout"
                />
              ) : (
                <ActionRow
                  label="Connect with Google"
                  onClick={() => location.assign(googleLoginUrl("", "/settings"))}
                  id="google-login"
                />
              )}
            </Group>
            {googleUser && (
              <Group
                header="Permissions"
                footer="Each permission is asked once, on Google's own page, and only for what it names. YouTube matching uses a daily search budget shared by every TDJ user, so some 78-rpm recordings may be left out; the export sheet lists them."
              >
                <Row
                  tile={tile(APP_META.google_drive.color, APP_META.google_drive.icon)}
                  label="Google Drive"
                  sub="Export files in a TDJ folder"
                  value={granted("drive") ? withDot("on", "Allowed") : withDot("off", "Not yet")}
                  id="google-scope-drive"
                />
                {!granted("drive") && (
                  <ActionRow
                    label="Allow Google Drive"
                    onClick={() => location.assign(googleLoginUrl("drive", "/settings"))}
                    id="google-grant-drive"
                  />
                )}
                <Row
                  tile={tile(APP_META.youtube_data_api.color, APP_META.youtube_data_api.icon)}
                  label="YouTube"
                  sub="Playlists · YouTube Music sees them too"
                  value={granted("youtube") ? withDot("on", "Allowed") : withDot("off", "Not yet")}
                  id="google-scope-youtube"
                />
                {!granted("youtube") && (
                  <ActionRow
                    label="Allow YouTube"
                    onClick={() => location.assign(googleLoginUrl("youtube", "/settings"))}
                    id="google-grant-youtube"
                  />
                )}
              </Group>
            )}
          </>
        ) : (
          notEnabled(
            "Google would save export files to your Drive and create YouTube playlists.",
            "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
          )
        )}
      </Sheet>

      <Sheet open={open === "dropbox"} onClose={() => setOpen(null)} title="Dropbox" trailing="Done">
        {dropbox === null || dropbox.hosted ? (
          <Group
            header="Account"
            footer="Saves the chosen export file (Rekordbox XML, Traktor NML, M3U8, CSV…) into Apps/TDJ/<set name>/ in your Dropbox and gives you a share link. TDJ only sees that folder. The login is kept in a sealed cookie in this browser; dropbox.com → Settings → Connected apps removes it."
          >
            <Row
              label="Status"
              value={
                dropbox === null
                  ? "Checking…"
                  : dropbox.user
                    ? `Connected as ${dropbox.user.name}`
                    : "Not connected"
              }
              sub={dropbox?.user?.email}
              busy={dropbox === null}
            />
            <Row label="Used for" value="Export files" />
            {dropbox?.user ? (
              <ActionRow
                label="Disconnect"
                destructive
                onClick={() => disconnectDirect("dropbox")}
                busy={busy === "dropbox-logout"}
                id="dropbox-logout"
              />
            ) : (
              <ActionRow
                label="Connect Dropbox"
                onClick={() => location.assign(dropboxLoginUrl("/settings"))}
                id="dropbox-login"
              />
            )}
          </Group>
        ) : (
          notEnabled(
            "Dropbox would receive your export files in Apps/TDJ.",
            "DROPBOX_APP_KEY and DROPBOX_APP_SECRET",
          )
        )}
      </Sheet>

      {pdEnabled &&
        (["youtube_data_api", "dropbox", "google_drive", "spotify"] as ConnectApp[]).map(connectSheet)}

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
