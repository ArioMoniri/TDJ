"use client";
import {
  ArrowRightLeft,
  Cloud,
  Disc,
  HardDrive,
  KeyRound,
  Library,
  ListVideo,
  Radio,
  UserRound,
  Webhook,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { appLogin } from "@/lib/app/login";
import { nativeInfo, saveOwnSpotifyClientId } from "@/lib/app/native";
import { SPOTIFY_APP_REDIRECT } from "@/lib/app/pkce";
import { APP } from "@/lib/app/target";
import { t } from "@/lib/i18n";
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
import { isSpotifyClientId, ownAppRedirects, ownAppSteps, SPOTIFY_DASHBOARD } from "@/lib/spotifyOwnApp";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { ActionRow, FieldRow, Group, Row, Tile } from "./Form";
import { Sheet } from "./Sheet";

type Status = "checking" | "ok" | "down" | "idle";
/* status values in the DJ's words, not the engineering's (round8-ux.md §1.10) */
const statusText: Record<Status, string> = {
  get checking() {
    return t("connectors.checking");
  },
  get ok() {
    return t("connectors.reachable");
  },
  get down() {
    return t("connectors.offline");
  },
  get idle() {
    return t("connectors.built_in");
  },
};
const DEPLOY_DOCS = "https://github.com/ArioMoniri/TDJ/blob/main/docs/DEPLOY.md#connectors";
const APP_META: Record<ConnectApp, { color: string; icon: ReactNode; sub: string; blurb: string }> = {
  youtube_data_api: {
    color: "#ff0000",
    icon: <ListVideo size={16} strokeWidth={2} />,
    get sub() {
      return t("connectors.playlists_youtube_music_sees_them_too");
    },
    get blurb() {
      return t("connectors.creates_a_youtube_playlist_in_your");
    },
  },
  dropbox: {
    color: "#0061ff",
    icon: <Cloud size={16} strokeWidth={2} />,
    get sub() {
      return t("connectors.export_files_to_your_dropbox");
    },
    get blurb() {
      return t("connectors.saves_the_chosen_export_file_rekordbox_2");
    },
  },
  google_drive: {
    color: "#1fa463",
    icon: <HardDrive size={16} strokeWidth={2} />,
    get sub() {
      return t("connectors.export_files_to_your_drive");
    },
    get blurb() {
      return t("connectors.saves_the_chosen_export_file_into");
    },
  },
  spotify: {
    color: "#1db954",
    icon: <Radio size={16} strokeWidth={2} />,
    get sub() {
      return t("connectors.playlists");
    },
    get blurb() {
      return t("connectors.spotify_through_pipedream_the_same_5");
    },
  },
};
const GOOGLE_COLOR = "#4285f4";

/** GET /api/admin/public: what any DJ may know (no secret in it, see lib/server/admin.ts → publicStatus). */
export interface PublicStatus {
  providers: Record<"spotify" | "google" | "dropbox", boolean>;
  ownerContact: string;
  seats: Record<"spotify" | "google" | "dropbox", { used: number; max: number }>;
  ai: { shared: boolean; dailyLimit: number };
}
export async function fetchPublicStatus(): Promise<PublicStatus | null> {
  try {
    const r = await fetch("/api/admin/public", { cache: "no-store" });
    return r.ok ? ((await r.json()) as PublicStatus) : null;
  } catch {
    return null;
  }
}
/** The message a DJ sends the organiser to get one of the Spotify seats. */
export const seatRequest = (origin: string) => t("connectors.hi_i_would_like_to_use", { origin });

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
  if (connected === "spotify") return t("connectors.logged_in_with_spotify");
  if (connected === "google") return t("connectors.connected_with_google");
  if (connected === "dropbox") return t("connectors.connected_to_dropbox");
  if (connected) return t("connectors.connected_you_can_close_the_other");
  const m = error?.match(/^(spotify|google|dropbox)_(\w+)$/);
  if (m) {
    const who =
      m[1] === "spotify"
        ? t("connectors.spotify")
        : m[1] === "google"
          ? t("connectors.google")
          : t("connectors.dropbox");
    if (m[2] === "denied") return t("connectors.did_not_grant_access", { who });
    if (m[2] === "state") return t("connectors.the_login_expired_try_again");
    return t("connectors.could_not_finish_the_login", { who });
  }
  return t("connectors.the_connection_was_not_completed");
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
    | "spotify"
    | "google"
    | "dropbox"
    | "deezer"
    | "musicbrainz"
    | "webhook"
    | "notlisted"
    | `pd:${ConnectApp}`
    | null
  >(null);
  const [pub, setPub] = useState<PublicStatus | null>(null);
  const [otherWays, setOtherWays] = useState(false);
  const [requestCopied, setRequestCopied] = useState(false);
  useEffect(() => {
    void fetchPublicStatus().then(setPub);
  }, []);
  const [advanced, setAdvanced] = useState(false);
  const [deezer, setDeezer] = useState<Status>("idle");
  const [mb, setMb] = useState<Status>("idle");
  const [redirect, setRedirect] = useState("/callback");
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => setRedirect(APP ? SPOTIFY_APP_REDIRECT : `${location.origin}/callback`), []);
  /** apps: Google and Dropbox sign in through a linked TDJ server only (Settings → Connections) */
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    if (APP) void nativeInfo().then((i) => setLinked(!!i.linkedServer));
  }, []);
  const showDirect = !APP || linked;
  /**
   * "Use my own Spotify app": the DJ's own Client ID, per device. The apps keep it in the Keychain (an older build's
   * value in the page's settings moves there once); the web keeps it in this browser's settings (local storage).
   */
  const [ownId, setOwnId] = useState(settings.spotifyClientId ?? "");
  /** what was last saved (blur saves; the web's field writes the settings as it is typed) */
  const [lastSaved, setLastSaved] = useState(settings.spotifyClientId?.trim() ?? "");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []);
  useEffect(() => {
    if (!APP) return;
    void nativeInfo().then(async (i) => {
      const legacy = useStore.getState().settings.spotifyClientId?.trim() ?? "";
      if (!i.ownSpotifyClientId && legacy && isSpotifyClientId(legacy)) {
        try {
          await saveOwnSpotifyClientId(legacy);
          useStore.getState().setSettings({ spotifyClientId: "" });
        } catch {}
        setOwnId(legacy);
        setLastSaved(legacy);
      } else {
        setOwnId(i.ownSpotifyClientId ?? legacy);
        setLastSaved(i.ownSpotifyClientId ?? legacy);
      }
    });
  }, []);
  const saveOwnId = async (raw: string) => {
    const v = raw.trim();
    if (v === lastSaved) return;
    if (v && !isSpotifyClientId(v)) {
      toast(t("spotify_own.not_a_client_id"));
      return;
    }
    if (APP) {
      try {
        await saveOwnSpotifyClientId(v);
        if (settings.spotifyClientId) setSettings({ spotifyClientId: "" });
      } catch (e) {
        toast((e as { message?: string })?.message ?? t("spotify_own.not_a_client_id"));
        return;
      }
    } else setSettings({ spotifyClientId: v });
    setLastSaved(v);
    if (v) toast(t("spotify_own.saved"));
  };
  const ownRedirects = ownAppRedirects({ app: APP, origin });
  /** Spotify: the system browser + PKCE in the apps (lib/app/login.ts); the server's own login on the web */
  const spotifyLogin = () =>
    APP
      ? void appLogin("spotify", "/settings")
      : settings.spotifyClientId?.trim()
        ? beginAuth(settings.spotifyClientId.trim()) // the DJ's own Spotify app, PKCE in this browser
        : location.assign(hostedLoginUrl("/settings"));
  const ownAppLogin = () =>
    APP ? void appLogin("spotify", "/settings") : beginAuth(settings.spotifyClientId);
  // back from an OAuth dance (same tab for the direct logins, a second tab for Connect Link): say so once, clean the URL
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const connected = q.get("connected");
    const error = q.get("error");
    if (!connected && !error) return;
    // a DJ the owner has not listed in the Spotify dashboard gets a sheet that says what to do, not a toast
    if (error === "spotify_not_listed") setOpen("notlisted");
    else toast(arrivalToast(connected, error));
    history.replaceState(null, "", location.pathname);
  }, []);
  // the apps: signed in, but Spotify refuses the account (Development Mode, not listed): say why, once per view
  const notListed = !!spotify?.notListed;
  useEffect(() => {
    if (notListed) setOpen("notlisted");
  }, [notListed]);
  const copyRequest = async () => {
    try {
      await navigator.clipboard.writeText(seatRequest(location.origin));
      setRequestCopied(true);
      setTimeout(() => setRequestCopied(false), 1500);
      toast(t("connectors.request_copied_paste_it_to_the"));
    } catch {
      toast(t("connectors.copy_failed_select_the_text_and"));
    }
  };
  const seats = pub?.seats.spotify;
  const seatsNote = seats
    ? ` ${t("connectors.of_seats_are_handed_out", { used: seats.used, max: seats.max })}`
    : "";
  const contactNote = pub?.ownerContact
    ? ` ${t("connectors.organiser_2", { ownerContact: pub.ownerContact })}`
    : "";
  const webhookUrl = overrides.connectors?.webhookUrl ?? "";
  const hosted = spotify?.hosted ?? false;
  const hostedUser = spotify?.user ?? null;
  const byoConnected = !hosted && !!spotifyToken;
  const minutesLeft = spotifyToken ? Math.max(0, Math.round((spotifyToken.expires - Date.now()) / 60000)) : 0;
  const spotifyValue =
    spotify === null
      ? t("connectors.checking")
      : hosted
        ? hostedUser
          ? withDot("on", hostedUser.name)
          : withDot("off", t("connectors.log_in"))
        : byoConnected
          ? withDot("on", t("connectors.connected_min", { minutesLeft }))
          : settings.spotifyClientId
            ? withDot("off", "Connect")
            : withDot("warn", t("connectors.set_up"));
  const directValue = (s: typeof google) =>
    s === null
      ? t("connectors.checking")
      : !s.hosted
        ? withDot("off", "Off")
        : s.user
          ? withDot("on", s.user.name)
          : withDot("off", "Connect");
  const pdEnabled = connect?.enabled ?? false;
  const accountFor = (app: ConnectApp) => connect?.accounts.find((a) => a.app === app);
  const connectValue = (app: ConnectApp) => {
    if (connect === null) return t("connectors.checking");
    if (!connect.enabled) return withDot("off", "Off");
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
      toast(t("connectors.the_webhook_must_be_an_https"));
      return;
    }
    updateOverrides((o) => ({ ...o, connectors: { ...(o.connectors ?? {}), webhookUrl: v || undefined } }));
    setOpen(null);
    toast(v ? t("connectors.webhook_saved_in_this_browser") : t("connectors.webhook_removed"));
  };
  const logout = async () => {
    setBusy("logout");
    try {
      await hostedLogout();
      setSpotifyToken(null);
      await reload();
      toast(t("connectors.logged_out_of_spotify"));
    } finally {
      setBusy(null);
    }
  };
  const disconnectDirect = async (provider: "google" | "dropbox") => {
    setBusy(`${provider}-logout`);
    try {
      await directLogout(provider);
      await reload();
      toast(
        provider === "google"
          ? t("connectors.disconnected_from_google")
          : t("connectors.disconnected_from_dropbox"),
      );
    } finally {
      setBusy(null);
    }
  };
  const connectApp = async (app: ConnectApp) => {
    setBusy(app);
    try {
      await openConnectLink(app);
      toast(t("connectors.finish_in_the_new_tab_then"));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const tile = (color: string, icon: ReactNode) => <Tile color={color}>{icon}</Tile>;
  const notEnabled = (what: string, service: string) => (
    <Group
      header={t("connectors.account")}
      footer={t("connectors.the_person_who_runs_this_t", {
        what,
        service,
        p1: pdEnabled ? t("connectors.pipedream_connect_is_on_here_instead") : "",
      })}
    >
      <Row label={t("connectors.status")} value={t("connectors.not_turned_on_for_this_site")} />
      <Row
        label={t("connectors.how_to_turn_it_on")}
        sub={t("connectors.step_by_step_for_the_site")}
        chevron
        href={DEPLOY_DOCS}
      />
    </Group>
  );
  const googleUser = google?.user ?? null;
  const granted = (f: GoogleFeature) => google?.scopes?.[f] ?? false;
  // no service has credentials on this deployment: the owner configures them in-app at /admin (docs/DEPLOY.md)
  const needsOwnerSetup =
    !APP &&
    spotify !== null &&
    google !== null &&
    dropbox !== null &&
    !hosted &&
    !google.hosted &&
    !dropbox.hosted;
  const connectRow = (app: ConnectApp) => (
    <Row
      key={app}
      tile={tile(APP_META[app].color, APP_META[app].icon)}
      label={t("connectors.via_pipedream_2", {
        p1: (connect ?? CONNECT_FALLBACK).apps.find((a) => a.slug === app)?.label ?? app,
      })}
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
        title={t("connectors.via_pipedream", { label })}
        trailing={t("connectors.done")}
      >
        <Group
          header={t("connectors.account")}
          footer={t("connectors.one_button_asks_for_your_permission", { blurb: APP_META[app].blurb, label })}
        >
          <Row
            label={t("connectors.status")}
            value={
              a
                ? `Connected${a.name ? ` · ${a.name}` : ""}${a.healthy ? "" : t("connectors.needs_attention")}`
                : t("connectors.not_connected")
            }
          />
          <Row label={t("connectors.used_for")} value={APP_META[app].sub.split(" · ")[0]} />
          <ActionRow
            label={a ? t("connectors.reconnect_2", { label }) : t("connectors.connect", { label })}
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
        header={t("connectors.accounts_and_services")}
        footer={
          APP && !linked
            ? t("connectors.log_in_with_spotify_to_create_2")
            : hosted
              ? t("connectors.log_in_with_spotify_to_create")
              : t("connectors.spotify_set_up_your_own_developer")
        }
        id="connectors"
      >
        <Row
          tile={tile("#1db954", <Radio size={16} strokeWidth={2} />)}
          label={t("connectors.spotify")}
          sub={t("connectors.playlists_full_tracks_in_listen")}
          value={spotifyValue}
          chevron
          onClick={() => setOpen("spotify")}
          id="connector-spotify"
        />
        {showDirect && (
          <Row
            tile={tile(GOOGLE_COLOR, <HardDrive size={16} strokeWidth={2} />)}
            label={t("connectors.google")}
            sub={t("connectors.drive_files_youtube_playlists")}
            value={directValue(google)}
            chevron
            onClick={() => setOpen("google")}
            id="connector-google"
          />
        )}
        {showDirect && (
          <Row
            tile={tile(APP_META.dropbox.color, APP_META.dropbox.icon)}
            label={t("connectors.dropbox")}
            sub={APP_META.dropbox.sub}
            value={directValue(dropbox)}
            chevron
            onClick={() => setOpen("dropbox")}
            id="connector-dropbox"
          />
        )}
        {needsOwnerSetup && (
          <Row
            tile={tile("#636366", <KeyRound size={16} strokeWidth={2} />)}
            label={t("connectors.owner_setup")}
            sub={t("connectors.turn_on_one_tap_logins_for")}
            value={t("connectors.open")}
            chevron
            onClick={() => location.assign("/admin")}
            id="connector-owner-setup"
          />
        )}
      </Group>

      <Group
        header={t("connectors.also_used")}
        footer={t("connectors.deezer_and_musicbrainz_need_no_account")}
      >
        <Row
          tile={tile("#a238ff", <Disc size={16} strokeWidth={2} />)}
          label={t("connectors.deezer")}
          sub={t("connectors.used_for_previews_and_metadata")}
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
          label={t("connectors.musicbrainz")}
          sub={t("connectors.recording_dates_and_singers")}
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
        header={t("connectors.advanced")}
        footer={
          pdEnabled ? t("connectors.for_djs_who_run_their_own_2") : t("connectors.for_djs_who_run_their_own")
        }
      >
        <Row
          tile={tile("#5856d6", <Webhook size={16} strokeWidth={2} />)}
          label={t("connectors.bring_your_own_automation")}
          sub={t("connectors.export_webhook_for_pipedream_make_zapier")}
          value={webhookUrl ? t("connectors.set") : t("connectors.off")}
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

      <Sheet
        open={open === "spotify"}
        onClose={() => setOpen(null)}
        title={t("connectors.spotify")}
        trailing={t("connectors.done")}
      >
        <Group
          header={t("connectors.account")}
          footer={
            APP && hosted
              ? t("connectors.log_in_with_your_spotify_account_2")
              : hosted
                ? t("connectors.log_in_with_your_spotify_account", { seatsNote, contactNote })
                : t("connectors.connect_with_your_own_spotify_app")
          }
        >
          <Row
            label={t("connectors.status")}
            value={
              spotify === null
                ? t("connectors.checking")
                : hosted
                  ? hostedUser
                    ? t("connectors.logged_in_as", { name: hostedUser.name })
                    : t("connectors.not_logged_in")
                  : byoConnected
                    ? t("connectors.connected_min", { minutesLeft })
                    : t("connectors.not_connected")
            }
            busy={spotify === null}
          />
          <Row label={t("connectors.used_for")} value={t("connectors.playlists_listen")} />
          {hosted ? (
            hostedUser ? (
              <ActionRow
                label={t("connectors.log_out")}
                destructive
                onClick={logout}
                busy={busy === "logout"}
                id="spotify-logout"
              />
            ) : (
              <ActionRow
                label={t("connectors.log_in_with_spotify")}
                onClick={spotifyLogin}
                id="spotify-login"
              />
            )
          ) : (
            <>
              <ActionRow
                label={byoConnected ? t("connectors.reconnect") : t("connectors.connect_spotify")}
                onClick={ownAppLogin}
                disabled={!(APP ? ownId : settings.spotifyClientId)}
                id="spotify-connect"
              />
              {byoConnected && (
                <ActionRow
                  label={t("connectors.disconnect")}
                  destructive
                  onClick={() => setSpotifyToken(null)}
                />
              )}
            </>
          )}
        </Group>
        <Group>
          <Row
            label={t("connectors.advanced")}
            sub={
              hosted ? t("connectors.use_your_own_spotify_app_instead") : t("connectors.your_own_spotify_app")
            }
            value={advanced ? t("connectors.hide") : t("connectors.show")}
            onClick={() => setAdvanced((v) => !v)}
            id="spotify-advanced"
          />
        </Group>
        {advanced && (
          <>
            <Group
              header={t("connectors.your_own_app")}
              footer={
                APP
                  ? t("connectors.to_sign_in_with_your_own")
                  : hosted
                    ? t("connectors.with_a_client_id_here_connect")
                    : t("connectors.add_this_exact_redirect_uri_to")
              }
            >
              <Row label={t("connectors.redirect_uri")} sub={<span className="font-mono">{redirect}</span>}>
                <button type="button" className="btn-plain" onClick={copyRedirect} aria-live="polite">
                  {copied ? t("connectors.copied") : t("connectors.copy")}
                </button>
              </Row>
              <FieldRow label={t("connectors.client_id")} id="spotify-client-id">
                <input
                  id="spotify-client-id"
                  className="field field-value min-w-0 flex-1"
                  placeholder={hosted ? t("connectors.optional") : t("connectors.required")}
                  value={APP ? ownId : settings.spotifyClientId}
                  onChange={(e) =>
                    APP
                      ? setOwnId(e.target.value.trim())
                      : setSettings({ spotifyClientId: e.target.value.trim() })
                  }
                  onBlur={(e) => void saveOwnId(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </FieldRow>
              <Row
                label={t("spotify_own.signs_in_with")}
                value={
                  (APP ? ownId : settings.spotifyClientId)
                    ? t("spotify_own.using_own")
                    : t("spotify_own.using_built_in")
                }
                sub={t("spotify_own.kept_on_device")}
              />
            </Group>
            <Group
              header={t("spotify_own.title")}
              footer={
                !APP && ownRedirects.server
                  ? t("spotify_own.server_redirect", { uri: ownRedirects.server })
                  : t("spotify_own.why")
              }
              id="spotify-own-guide"
            >
              <div className="cell">
                <ol
                  className="list-decimal space-y-1.5 pl-5 whitespace-normal"
                  data-testid="spotify-own-steps"
                >
                  {ownAppSteps({ app: APP, origin }).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
              </div>
              <Row label={t("spotify_own.open_dashboard")} href={SPOTIFY_DASHBOARD} chevron />
              {hosted && (
                <ActionRow
                  label={t("connectors.connect_with_my_own_app")}
                  onClick={ownAppLogin}
                  disabled={!(APP ? ownId : settings.spotifyClientId)}
                  id="spotify-connect"
                />
              )}
            </Group>
          </>
        )}
      </Sheet>

      <Sheet
        open={open === "google"}
        onClose={() => setOpen(null)}
        title={t("connectors.google")}
        trailing={t("connectors.done")}
      >
        {google === null || google.hosted ? (
          <>
            <Group
              header={t("connectors.account")}
              footer={t("connectors.one_google_account_for_two_things")}
            >
              <Row
                label={t("connectors.status")}
                value={
                  google === null
                    ? t("connectors.checking")
                    : googleUser
                      ? t("connectors.connected_as", { name: googleUser.name })
                      : t("connectors.not_connected")
                }
                sub={googleUser?.email}
                busy={google === null}
              />
              <Row label={t("connectors.used_for")} value={t("connectors.drive_files_youtube_playlists")} />
              {googleUser ? (
                <ActionRow
                  label={t("connectors.disconnect")}
                  destructive
                  onClick={() => disconnectDirect("google")}
                  busy={busy === "google-logout"}
                  id="google-logout"
                />
              ) : (
                <ActionRow
                  label={t("connectors.connect_with_google")}
                  onClick={() => location.assign(googleLoginUrl("", "/settings"))}
                  id="google-login"
                />
              )}
            </Group>
            {googleUser && (
              <Group
                header={t("connectors.permissions")}
                footer={t("connectors.each_permission_is_asked_once_on")}
              >
                <Row
                  tile={tile(APP_META.google_drive.color, APP_META.google_drive.icon)}
                  label={t("connectors.google_drive")}
                  sub={t("connectors.export_files_in_a_tdj_folder")}
                  value={
                    granted("drive") ? withDot("on", "Allowed") : withDot("off", t("connectors.not_yet"))
                  }
                  id="google-scope-drive"
                />
                {!granted("drive") && (
                  <ActionRow
                    label={t("connectors.allow_google_drive")}
                    onClick={() => location.assign(googleLoginUrl("drive", "/settings"))}
                    id="google-grant-drive"
                  />
                )}
                <Row
                  tile={tile(APP_META.youtube_data_api.color, APP_META.youtube_data_api.icon)}
                  label={t("connectors.youtube")}
                  sub={t("connectors.playlists_youtube_music_sees_them_too")}
                  value={
                    granted("youtube") ? withDot("on", "Allowed") : withDot("off", t("connectors.not_yet"))
                  }
                  id="google-scope-youtube"
                />
                {!granted("youtube") && (
                  <ActionRow
                    label={t("connectors.allow_youtube")}
                    onClick={() => location.assign(googleLoginUrl("youtube", "/settings"))}
                    id="google-grant-youtube"
                  />
                )}
              </Group>
            )}
          </>
        ) : (
          notEnabled(t("connectors.google_would_save_export_files_to"), "Google")
        )}
      </Sheet>

      <Sheet
        open={open === "dropbox"}
        onClose={() => setOpen(null)}
        title={t("connectors.dropbox")}
        trailing={t("connectors.done")}
      >
        {dropbox === null || dropbox.hosted ? (
          <Group
            header={t("connectors.account")}
            footer={t("connectors.saves_the_chosen_export_file_rekordbox")}
          >
            <Row
              label={t("connectors.status")}
              value={
                dropbox === null
                  ? t("connectors.checking")
                  : dropbox.user
                    ? t("connectors.connected_as", { name: dropbox.user.name })
                    : t("connectors.not_connected")
              }
              sub={dropbox?.user?.email}
              busy={dropbox === null}
            />
            <Row label={t("connectors.used_for")} value={t("connectors.export_files")} />
            {dropbox?.user ? (
              <ActionRow
                label={t("connectors.disconnect")}
                destructive
                onClick={() => disconnectDirect("dropbox")}
                busy={busy === "dropbox-logout"}
                id="dropbox-logout"
              />
            ) : (
              <ActionRow
                label={t("connectors.connect_dropbox")}
                onClick={() => location.assign(dropboxLoginUrl("/settings"))}
                id="dropbox-login"
              />
            )}
          </Group>
        ) : (
          notEnabled(t("connectors.dropbox_would_receive_your_export_files"), "Dropbox")
        )}
      </Sheet>

      {pdEnabled &&
        (["youtube_data_api", "dropbox", "google_drive", "spotify"] as ConnectApp[]).map(connectSheet)}

      <Sheet
        open={open === "notlisted"}
        onClose={() => {
          setOpen(null);
          setOtherWays(false);
        }}
        title={t("connectors.spotify_did_not_let_you_in")}
        trailing={t("connectors.done")}
        detents={["medium", "large"]}
        testId="spotify-not-listed"
      >
        <Group header={t("connectors.why")} footer={t("connectors.spotify_limits_a_small_app_like")}>
          <div className="cell">
            <span className="whitespace-normal">{t("connectors.this_app_can_let_in_5")}</span>
          </div>
          {seats && (
            <Row
              label={t("connectors.seats_handed_out")}
              value={t("connectors.of", { used: seats.used, max: seats.max })}
            />
          )}
          {pub?.ownerContact && (
            <Row
              tile={
                <Tile color="#636366">
                  <UserRound size={16} strokeWidth={2} />
                </Tile>
              }
              label={t("connectors.organiser")}
              value={<span className="select-all">{pub.ownerContact}</span>}
              id="not-listed-contact"
            />
          )}
          <ActionRow
            label={requestCopied ? t("connectors.copied") : t("connectors.copy_my_request")}
            onClick={copyRequest}
            id="not-listed-copy"
          />
          <div className="cell">
            <span className="whitespace-normal">{t("spotify_own.not_listed_own")}</span>
          </div>
          <ActionRow
            label={t("spotify_own.title")}
            onClick={() => {
              setOtherWays(false);
              setAdvanced(true);
              setOpen("spotify");
            }}
            id="not-listed-own-app"
          />
          <ActionRow
            label={otherWays ? t("connectors.hide_other_ways") : t("connectors.other_ways")}
            onClick={() => setOtherWays((v) => !v)}
            id="not-listed-other"
          />
        </Group>
        {otherWays && (
          <Group
            header={t("connectors.other_ways")}
            footer={t("connectors.the_transfer_service_matches_every_track")}
            id="not-listed-other-ways"
          >
            <Row
              tile={
                <Tile color="#1db954">
                  <ArrowRightLeft size={16} strokeWidth={2} />
                </Tile>
              }
              label={t("connectors.spotify_via_a_transfer_service")}
              sub={t("connectors.export_send_to_a_csv_for")}
              value={t("connectors.open_compose")}
              chevron
              onClick={() => location.assign("/")}
              id="not-listed-transfer"
            />
            <Row
              tile={tile("#ff0000", <ListVideo size={16} strokeWidth={2} />)}
              label={t("connectors.youtube_playlist")}
              sub={t("connectors.export_send_to_youtube")}
              value={google?.hosted ? t("connectors.available") : t("connectors.not_enabled")}
            />
            <Row
              tile={tile(APP_META.dropbox.color, APP_META.dropbox.icon)}
              label={t("connectors.files_to_dropbox_or_drive")}
              sub={t("connectors.rekordbox_traktor_m3u8_csv")}
              value={
                dropbox?.hosted || google?.hosted ? t("connectors.available") : t("connectors.not_enabled")
              }
            />
          </Group>
        )}
      </Sheet>

      <Sheet
        open={open === "deezer"}
        onClose={() => setOpen(null)}
        title={t("connectors.deezer")}
        trailing={t("connectors.done")}
        detents={["medium"]}
      >
        <Group header={t("connectors.keyless")} footer={t("connectors.deezer_s_public_search_gives_t")}>
          <Row label={t("connectors.status")} value={statusText[deezer]} busy={deezer === "checking"} />
          <Row label={t("connectors.used_for")} value={t("connectors.previews_metadata")} />
          <ActionRow label={t("connectors.check_again")} onClick={checkDeezer} busy={deezer === "checking"} />
        </Group>
      </Sheet>

      <Sheet
        open={open === "musicbrainz"}
        onClose={() => setOpen(null)}
        title={t("connectors.musicbrainz")}
        trailing={t("connectors.done")}
        detents={["medium"]}
      >
        <Group
          header={t("connectors.keyless")}
          footer={t("connectors.musicbrainz_recordings_give_the_first_release")}
        >
          <Row label={t("connectors.status")} value={statusText[mb]} busy={mb === "checking"} />
          <Row label={t("connectors.used_for")} value={t("connectors.recording_dates_singers")} />
          <ActionRow label={t("connectors.check_again")} onClick={checkMb} busy={mb === "checking"} />
        </Group>
      </Sheet>

      <Sheet
        open={open === "webhook"}
        onClose={() => setOpen(null)}
        title={t("connectors.your_automation")}
        trailing={t("connectors.save")}
        onTrailing={saveHook}
        detents={["medium", "large"]}
      >
        <Group header={t("connectors.webhook_url")} footer={t("connectors.paste_a_pipedream_make_zapier_or")}>
          <label htmlFor="connector-webhook-url" className="cell">
            <span className="sr-only">{t("connectors.webhook_url")}</span>
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
              label={t("connectors.remove_webhook")}
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
