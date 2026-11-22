"use client";
import { BookOpen, Cloud, Disc, HardDrive, Library, ListVideo, MicVocal, Music, Radio } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { invoke, nativeInfo } from "@/lib/app/native";
import { SPOTIFY_APP_REDIRECT } from "@/lib/app/pkce";
import { APP } from "@/lib/app/target";
import { keyHint, type OwnProvider, saveOwnClientId, saveYoutubeKey, useByo } from "@/lib/connections/byo";
import {
  CONNECTIONS,
  type ConnectionId,
  type ConnectionInfo,
  docsLink,
  validDropboxAppKey,
  validGoogleClientId,
} from "@/lib/connections/catalog";
import {
  beginOwnLogin,
  finishOwnLogin,
  type OwnDeps,
  ownDisconnect,
  ownWebRedirect,
} from "@/lib/connections/ownOAuth";
import { byoAvailable, type ConnectionContext, connectionStatus, type ServerConnectors } from "@/lib/connections/status";
import { type MsgKey, t } from "@/lib/i18n";
import { openExternal } from "@/lib/openLink";
import { useConnectors } from "@/lib/spotify";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { ActionRow, FieldRow, Group, Row, Tile } from "./Form";
import { Sheet } from "./Sheet";

/**
 * 2026-11 — Settings → Connections, self-contained: every service T-DJ talks to (lib/connections/catalog.ts), each
 * with one plain status (lib/connections/status.ts), what it unlocks, its limits, the DJ's own credentials where the
 * provider allows a public client (a YouTube API key; a Dropbox app key; a Google client ID in the apps) and
 * "Set up your own" steps with the exact redirect address. It signs nobody in with the site's apps: that stays
 * in Connectors.tsx (Accounts and services). The Settings redesign places it under "Connections".
 * Keys stay on this device (lib/connections/byo.ts) and go only to their own provider.
 */
const ICON: Record<ConnectionId, ReactNode> = {
  spotify: <Radio size={16} strokeWidth={2} />,
  youtube: <ListVideo size={16} strokeWidth={2} />,
  google_drive: <HardDrive size={16} strokeWidth={2} />,
  dropbox: <Cloud size={16} strokeWidth={2} />,
  deezer: <Disc size={16} strokeWidth={2} />,
  musicbrainz: <Library size={16} strokeWidth={2} />,
  lrclib: <MicVocal size={16} strokeWidth={2} />,
  apple_music: <Music size={16} strokeWidth={2} />,
};
/** the i18n prefix of each service's own texts */
const TEXT: Record<ConnectionId, string> = {
  spotify: "connections.spotify",
  youtube: "connections.youtube",
  google_drive: "connections.google",
  dropbox: "connections.dropbox",
  deezer: "connections.deezer",
  musicbrainz: "connections.musicbrainz",
  lrclib: "connections.lrclib",
  apple_music: "connections.apple",
};
const tt = (id: ConnectionId, part: string, v?: Record<string, string | number>) =>
  t(`${TEXT[id]}.${part}` as MsgKey, v);
const STEPS: Partial<Record<ConnectionId, string[]>> = {
  spotify: ["step1", "step2", "step3", "step4"],
  youtube: ["step1", "step2", "step3", "step4"],
  dropbox: ["step1", "step2", APP ? "step3_app" : "step3", "step4"],
  google_drive: ["step1", "step2", "step3", "step4"],
};

function Dot({ tone }: { tone: "on" | "off" | "warn" }) {
  const bg = tone === "on" ? "var(--system-green)" : tone === "warn" ? "#ff9500" : "var(--label-3)";
  return (
    <span className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full align-middle" style={{ background: bg }} aria-hidden />
  );
}

/** A copyable value (a redirect address, a bundle ID). */
function CopyRow({ label, value, id }: { label: string; value: string; id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Row label={label} sub={<span className="font-mono break-all">{value}</span>} id={id}>
      <button
        type="button"
        className="btn-plain min-h-11 px-2"
        aria-live="polite"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {}
        }}
      >
        {copied ? t("connections.copied") : t("connections.copy")}
      </button>
    </Row>
  );
}

const Para = ({ children, id }: { children: ReactNode; id?: string }) => (
  <div className="cell" data-testid={id}>
    <span className="min-w-0 whitespace-normal">{children}</span>
  </div>
);

export function Connections() {
  const byo = useByo();
  const spotifyOwnId = useStore((s) => s.settings.spotifyClientId);
  const { spotify, google, dropbox } = useConnectors();
  const [youtubeKeyOnServer, setYoutubeKeyOnServer] = useState<boolean | null>(null);
  const [linkedServer, setLinkedServer] = useState(false);
  const [builtInSpotify, setBuiltInSpotify] = useState(false);
  const [origin, setOrigin] = useState("");
  const [googleRedirect, setGoogleRedirect] = useState("");
  const [open, setOpen] = useState<ConnectionId | null>(null);
  useEffect(() => {
    setOrigin(location.origin);
    void fetch("/api/admin/public", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { keys?: { youtube?: boolean } } | null) => setYoutubeKeyOnServer(!!j?.keys?.youtube))
      .catch(() => setYoutubeKeyOnServer(false));
    if (APP) {
      void nativeInfo().then((i) => {
        setLinkedServer(!!i.linkedServer);
        setBuiltInSpotify(!!i.spotifyClientId);
      });
      void invoke<string>("byo_google_redirect")
        .then(setGoogleRedirect)
        .catch(() => {});
    }
  }, []);
  const server: ServerConnectors | null =
    spotify === null || google === null || dropbox === null || youtubeKeyOnServer === null
      ? null
      : {
          spotify: spotify.hosted,
          google: google.hosted,
          dropbox: dropbox.hosted,
          youtubeKey: youtubeKeyOnServer,
        };
  const ctx: ConnectionContext = {
    app: APP,
    linkedServer,
    server,
    byo,
    spotifyClientId: !!spotifyOwnId || builtInSpotify,
  };
  const deps: OwnDeps = {
    app: APP,
    fetch: (...a) => fetch(...a),
    invoke: (cmd, args) => invoke(cmd, args),
    openExternal: async (url) => {
      await openExternal(url);
    },
  };

  return (
    <section id="connections" data-testid="connections">
      <Group header={t("connections.header")} footer={APP ? t("connections.footer_app") : t("connections.footer")}>
        {CONNECTIONS.map((c) => {
          const st = connectionStatus(c.id, ctx);
          return (
            <Row
              key={c.id}
              tile={<Tile color={c.color}>{ICON[c.id]}</Tile>}
              label={c.label}
              sub={tt(c.id, "sub")}
              value={
                <span className="inline-flex items-center" data-via={st.via}>
                  <Dot tone={st.tone} />
                  {t(st.short)}
                </span>
              }
              chevron
              onClick={() => setOpen(c.id)}
              id={`connection-${c.id}`}
            />
          );
        })}
      </Group>
      {CONNECTIONS.map((c) => (
        <Sheet
          key={c.id}
          open={open === c.id}
          onClose={() => setOpen(null)}
          title={c.label}
          trailing={t("connections.done")}
          testId={`connection-sheet-${c.id}`}
        >
          <ConnectionSheetBody
            info={c}
            ctx={ctx}
            deps={deps}
            origin={origin}
            googleRedirect={googleRedirect}
          />
        </Sheet>
      ))}
    </section>
  );
}

function ConnectionSheetBody({
  info,
  ctx,
  deps,
  origin,
  googleRedirect,
}: {
  info: ConnectionInfo;
  ctx: ConnectionContext;
  deps: OwnDeps;
  origin: string;
  googleRedirect: string;
}) {
  const st = connectionStatus(info.id, ctx);
  const steps = STEPS[info.id];
  return (
    <>
      <Group header={t("connections.status")}>
        <Row
          label={t("connections.status")}
          value={
            <span className="inline-flex items-center">
              <Dot tone={st.tone} />
              {t(st.short)}
            </span>
          }
        />
        <Para id={`connection-message-${info.id}`}>{t(st.message)}</Para>
      </Group>
      <Group header={t("connections.what")}>
        <Para>{tt(info.id, "unlocks")}</Para>
      </Group>
      <Group header={t("connections.limits")}>
        <Para>{tt(info.id, "limits")}</Para>
      </Group>
      {byoAvailable(info.id, ctx.app) ? (
        <OwnCredentials id={info.id} ctx={ctx} deps={deps} />
      ) : info.id === "google_drive" ? (
        <Group header={t("connections.your_own")}>
          <Para id="connection-google-web-why">{t("connections.google.web_why")}</Para>
        </Group>
      ) : null}
      {steps && (
        <Group header={t("connections.set_up_own")}>
          <ol className="m-0 list-none p-0">
            {steps.map((s, i) => (
              <li key={s} className="cell">
                <span className="min-w-0 whitespace-normal">
                  <span className="mr-1 font-semibold tabular-nums">{i + 1}.</span>
                  {tt(info.id, s)}
                </span>
              </li>
            ))}
          </ol>
          {info.id === "spotify" && (
            <CopyRow
              label={t("connections.redirect_uri")}
              value={ctx.app ? SPOTIFY_APP_REDIRECT : `${origin}/callback`}
              id="connection-spotify-redirect"
            />
          )}
          {info.id === "dropbox" && !ctx.app && origin && (
            <CopyRow
              label={t("connections.redirect_uri")}
              value={ownWebRedirect(origin)}
              id="connection-dropbox-redirect"
            />
          )}
          {info.id === "google_drive" && ctx.app && googleRedirect && (
            <>
              <CopyRow
                label={t("connections.bundle_id")}
                value={googleRedirect.split(":")[0] ?? ""}
                id="connection-google-bundle"
              />
              <CopyRow
                label={t("connections.redirect_uri")}
                value={googleRedirect}
                id="connection-google-redirect"
              />
            </>
          )}
          {info.console && (
            <Row
              label={t("connections.open_console")}
              chevron
              onClick={() => void openExternal(info.console as string)}
              id={`connection-console-${info.id}`}
            />
          )}
        </Group>
      )}
      <Group>
        <Row
          tile={
            <Tile color="#636366">
              <BookOpen size={16} strokeWidth={2} />
            </Tile>
          }
          label={t("connections.full_guide")}
          sub={t("connections.full_guide_sub")}
          chevron
          onClick={() => void openExternal(docsLink(info.docs))}
          id={`connection-docs-${info.id}`}
        />
      </Group>
    </>
  );
}

/** The DJ's own credentials for one service: the field, save / remove, and the sign-in for OAuth ones. */
function OwnCredentials({ id, ctx, deps }: { id: ConnectionId; ctx: ConnectionContext; deps: OwnDeps }) {
  if (id === "spotify")
    return (
      <Group header={t("connections.your_own")}>
        <Para>{t("connections.spotify.where")}</Para>
      </Group>
    );
  if (id === "youtube") return <YoutubeKey app={ctx.app} saved={ctx.byo.youtubeKey} />;
  if (id === "dropbox" || id === "google_drive")
    return <OwnApp provider={id === "dropbox" ? "dropbox" : "google"} ctx={ctx} deps={deps} />;
  return null;
}

function YoutubeKey({ app, saved }: { app: boolean; saved: string | undefined }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (value: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await saveYoutubeKey(value, { app, invoke: (c, a) => invoke(c, a) });
      if (r === "invalid") return setError(t("connections.youtube.invalid"));
      setDraft("");
      toast(r === "saved" ? t("connections.youtube.saved") : t("connections.youtube.removed"));
    } catch (e) {
      setError(t("connections.youtube.save_failed", { reason: (e as { message?: string })?.message ?? "" }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Group header={t("connections.your_own")} footer={error || undefined}>
      {saved && (
        <Row
          label={t("connections.youtube.key")}
          value={t("connections.youtube.saved_value", { hint: keyHint(saved) }).trim()}
          id="connection-youtube-saved"
        />
      )}
      <FieldRow label={t("connections.youtube.key")} id="connection-youtube-key">
        <input
          id="connection-youtube-key"
          type="password"
          className="field field-value min-h-11 min-w-0 flex-1"
          placeholder={t("connections.youtube.key_placeholder")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          data-testid="connection-youtube-key"
        />
      </FieldRow>
      <ActionRow
        label={t("connections.youtube.save")}
        onClick={() => void save(draft)}
        disabled={!draft.trim()}
        busy={busy}
        id="connection-youtube-save"
      />
      {saved && (
        <ActionRow
          label={t("connections.youtube.remove")}
          destructive
          onClick={() => void save("")}
          busy={busy}
          id="connection-youtube-remove"
        />
      )}
    </Group>
  );
}

function OwnApp({ provider, ctx, deps }: { provider: OwnProvider; ctx: ConnectionContext; deps: OwnDeps }) {
  const own = ctx.byo[provider];
  const label = provider === "dropbox" ? "Dropbox" : "Google Drive";
  const [draft, setDraft] = useState(own?.clientId ?? "");
  const [paste, setPaste] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setDraft(own?.clientId ?? ""), [own?.clientId]);
  const valid = provider === "dropbox" ? validDropboxAppKey : validGoogleClientId;
  const saveId = () => {
    setError("");
    const v = draft.trim();
    if (v && !valid(v)) {
      setError(provider === "dropbox" ? t("connections.dropbox.invalid") : t("connections.google.invalid"));
      return false;
    }
    saveOwnClientId(provider, v);
    return !!v;
  };
  const connect = async () => {
    if (!saveId()) return;
    setBusy(true);
    try {
      const r = await beginOwnLogin(provider, deps);
      if (r === "paste") setPaste("");
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setBusy(true);
    try {
      const r = await finishOwnLogin({ code: paste ?? "" }, deps);
      if (r.ok) {
        setPaste(null);
        toast(t("connections.connected_toast", { label }));
      } else setError(t("connections.signin_failed"));
    } finally {
      setBusy(false);
    }
  };
  const fieldId = `connection-${provider}-client-id`;
  return (
    <Group header={t("connections.your_own")} footer={error || (paste !== null ? t("connections.dropbox.paste_hint") : undefined)}>
      <FieldRow
        label={provider === "dropbox" ? t("connections.dropbox.app_key") : t("connections.google.client_id")}
        id={fieldId}
      >
        <input
          id={fieldId}
          className="field field-value min-h-11 min-w-0 flex-1"
          value={draft}
          onChange={(e) => setDraft(e.target.value.trim())}
          onBlur={() => draft !== (own?.clientId ?? "") && saveId()}
          autoComplete="off"
          spellCheck={false}
          data-testid={fieldId}
        />
      </FieldRow>
      {paste !== null && (
        <>
          <FieldRow label={t("connections.dropbox.paste_code")} id="connection-dropbox-code">
            <input
              id="connection-dropbox-code"
              className="field field-value min-h-11 min-w-0 flex-1 font-mono"
              value={paste}
              onChange={(e) => setPaste(e.target.value.trim())}
              autoComplete="off"
              spellCheck={false}
            />
          </FieldRow>
          <ActionRow
            label={t("connections.dropbox.finish")}
            onClick={() => void finish()}
            disabled={!paste}
            busy={busy}
            id="connection-dropbox-finish"
          />
        </>
      )}
      {own?.connected ? (
        <ActionRow
          label={t("connections.sign_out")}
          destructive
          onClick={() =>
            void ownDisconnect(provider, deps).then(() => toast(t("connections.signed_out", { label })))
          }
          id={`connection-${provider}-signout`}
        />
      ) : (
        paste === null && (
          <ActionRow
            label={provider === "dropbox" ? t("connections.dropbox.connect") : t("connections.google.connect")}
            onClick={() => void connect()}
            disabled={!draft.trim()}
            busy={busy}
            id={`connection-${provider}-connect`}
          />
        )
      )}
    </Group>
  );
}
