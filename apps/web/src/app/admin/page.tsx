"use client";
import {
  BookOpen,
  Cloud,
  HardDrive,
  KeyRound,
  Link2,
  LockKeyhole,
  Radio,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { ActionRow, FieldRow, Group, Row, SegmentedRow, StepperRow, Tile } from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "@/lib/toast";
import { AI_DEFAULT_MODEL, AI_PROVIDERS, type AiProvider } from "@/lib/types";

const OWNER_GUIDE = "https://github.com/ArioMoniri/TDJ/blob/main/docs/OWNER_GUIDE.md";
/** where each provider lists the people its development app may admit (docs/OWNER_GUIDE.md) */
const PEOPLE: Record<ProviderId, { where: string; url: string; note: string }> = {
  spotify: {
    where: "Spotify dashboard → your app → User Management",
    url: "https://developer.spotify.com/dashboard",
    note: "Name and e-mail of the Spotify account; the DJ can log in a minute later.",
  },
  google: {
    where: "Google Cloud console → Google Auth Platform → Audience → Test users",
    url: "https://console.cloud.google.com/auth/audience",
    note: "While the app is unverified only test users can connect; their login expires weekly.",
  },
  dropbox: {
    where: "Dropbox App Console (no list: the first 50 linked users are admitted)",
    url: "https://www.dropbox.com/developers/apps",
    note: "Kept here for your own count; Dropbox asks for a production approval at 50.",
  },
};

/**
 * Owner setup for a deployment: unlock with the one-time setup code from the deploy summary (or the passphrase once
 * chosen), set the passphrase, paste each provider's credentials next to the redirect URIs they need. Secrets go to
 * the server's config store and never come back: the page only ever sees "configured" and the last characters of
 * an ID (apps/web/src/lib/server/admin.ts).
 */
type ProviderId = "spotify" | "google" | "dropbox";
interface ProviderStatus {
  id: ProviderId;
  label: string;
  configured: boolean;
  idHint: string | null;
  source: "env" | "store" | null;
  redirectUris: string[];
}
interface Status {
  unlocked: boolean;
  hasPassphrase: boolean;
  hasSetupCode: boolean;
  stage: string;
  backend: "memory" | "ssm";
  storeAvailable: boolean;
  origin: string;
  publicUrl: { value: string; source: "env" | "store" } | null;
  providers?: ProviderStatus[];
  seats?: Record<ProviderId, string[]>;
  seatLimits?: Record<ProviderId, number>;
  ownerContact?: string;
  ai?: {
    configured: boolean;
    provider: AiProvider;
    model: string;
    dailyLimit: number;
    keyHint: string | null;
    hasWorkspace: boolean;
    source: "env" | "store" | null;
  };
}
const META: Record<
  ProviderId,
  {
    color: string;
    icon: ReactNode;
    idLabel: string;
    secretLabel: string;
    console: string;
    consoleUrl: string;
    help: string;
  }
> = {
  spotify: {
    color: "#1db954",
    icon: <Radio size={16} strokeWidth={2} />,
    idLabel: "Client ID",
    secretLabel: "Client secret",
    console: "Spotify dashboard",
    consoleUrl: "https://developer.spotify.com/dashboard",
    help: "Create an app in the Spotify dashboard (a Premium account), add both redirect URIs under Settings → Redirect URIs, then paste the Client ID and the Client secret. Development Mode serves 5 listeners, added by e-mail under User Management.",
  },
  google: {
    color: "#4285f4",
    icon: <HardDrive size={16} strokeWidth={2} />,
    idLabel: "Client ID",
    secretLabel: "Client secret",
    console: "Google Cloud console",
    consoleUrl: "https://console.cloud.google.com/apis/credentials",
    help: "In Google Cloud: enable the Drive API and the YouTube Data API, configure the OAuth consent screen, then Credentials → OAuth client ID (Web application) with the redirect URI above. Add DJs as test users until the app is verified.",
  },
  dropbox: {
    color: "#0061ff",
    icon: <Cloud size={16} strokeWidth={2} />,
    idLabel: "App key",
    secretLabel: "App secret",
    console: "Dropbox App Console",
    consoleUrl: "https://www.dropbox.com/developers/apps",
    help: "Create a scoped app with App folder access named TDJ, tick files.content.write and sharing.write under Permissions, add the redirect URI under Settings → OAuth 2, then paste the App key and App secret.",
  },
};

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full align-middle"
      style={{ background: on ? "var(--system-green)" : "var(--label-3)" }}
      aria-hidden
    />
  );
}

/** A redirect URI the owner pastes into a provider console, with its copy button. */
function UriRow({ uri, id }: { uri: string; id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Copy failed; select the address and copy it by hand");
    }
  };
  return (
    <Row label="Redirect URI" sub={<span className="select-all font-mono">{uri}</span>} id={id}>
      <button type="button" className="btn-plain -mr-2" onClick={copy} aria-live="polite">
        {copied ? "Copied" : "Copy"}
      </button>
    </Row>
  );
}

async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const r = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as T };
}

export default function AdminPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  /** after an unlock with the setup code, the passphrase step comes first; "change" reopens it later */
  const [passStep, setPassStep] = useState<"none" | "required" | "change">("none");
  const [pass, setPass] = useState({ a: "", b: "" });
  const [drafts, setDrafts] = useState<Record<ProviderId, { id: string; secret: string; show: boolean }>>({
    spotify: { id: "", secret: "", show: false },
    google: { id: "", secret: "", show: false },
    dropbox: { id: "", secret: "", show: false },
  });
  const [tests, setTests] = useState<Partial<Record<ProviderId, { ok: boolean; text: string }>>>({});
  const [publicUrl, setPublicUrl] = useState("");
  const [contact, setContact] = useState("");
  const [seatDrafts, setSeatDrafts] = useState<Record<ProviderId, string>>({
    spotify: "",
    google: "",
    dropbox: "",
  });
  const [aiDraft, setAiDraft] = useState<{
    provider: AiProvider;
    key: string;
    model: string;
    workspaceId: string;
    dailyLimit: number;
    show: boolean;
  }>({ provider: "anthropic", key: "", model: "", workspaceId: "", dailyLimit: 20, show: false });
  const [aiTest, setAiTest] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const { body } = await api<Status>("/api/admin/status");
      setStatus(body);
      setFailed(false);
      if (body.publicUrl) setPublicUrl(body.publicUrl.value);
      if (body.ownerContact !== undefined) setContact(body.ownerContact);
      if (body.seats)
        setSeatDrafts({
          spotify: body.seats.spotify.join("\n"),
          google: body.seats.google.join("\n"),
          dropbox: body.seats.dropbox.join("\n"),
        });
      if (body.ai)
        setAiDraft((d) => ({
          ...d,
          provider: body.ai!.provider,
          model: body.ai!.model,
          dailyLimit: body.ai!.dailyLimit,
          key: "",
          workspaceId: "",
        }));
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const unlock = async () => {
    setBusy("unlock");
    setUnlockError(null);
    try {
      const { status: code, body } = await api<{ ok?: boolean; via?: "code" | "passphrase"; error?: string }>(
        "/api/admin/unlock",
        { method: "POST", body: JSON.stringify({ secret }) },
      );
      if (code !== 200 || !body.ok) {
        setUnlockError(body.error ?? "Could not unlock.");
        return;
      }
      setSecret("");
      setPassStep(body.via === "code" ? "required" : "none");
      await load();
      toast(body.via === "code" ? "Unlocked. Choose a passphrase next." : "Unlocked");
    } catch {
      setUnlockError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  };
  const lock = async () => {
    setBusy("lock");
    try {
      await api("/api/admin/lock", { method: "POST" });
      setPassStep("none");
      await load();
    } finally {
      setBusy(null);
    }
  };
  const savePassphrase = async () => {
    if (pass.a.length < 8) {
      toast("The passphrase needs at least 8 characters");
      return;
    }
    if (pass.a !== pass.b) {
      toast("The two passphrases differ");
      return;
    }
    setBusy("passphrase");
    try {
      const { status: code, body } = await api<{ error?: string }>("/api/admin/passphrase", {
        method: "POST",
        body: JSON.stringify({ passphrase: pass.a }),
      });
      if (code !== 200) {
        toast(body.error ?? "Could not save the passphrase");
        return;
      }
      setPass({ a: "", b: "" });
      setPassStep("none");
      await load();
      toast("Passphrase saved. The setup code no longer works.");
    } finally {
      setBusy(null);
    }
  };
  const saveProvider = async (id: ProviderId) => {
    const d = drafts[id];
    setBusy(`save-${id}`);
    try {
      const { status: code, body } = await api<{ saved?: string[]; errors?: string[]; error?: string }>(
        "/api/admin/config",
        { method: "PUT", body: JSON.stringify({ [id]: { clientId: d.id, clientSecret: d.secret } }) },
      );
      const errors = body.errors ?? (body.error ? [body.error] : []);
      if (code !== 200 || errors.length) {
        toast(errors[0] ?? "Could not save");
        return;
      }
      setDrafts((p) => ({ ...p, [id]: { id: "", secret: "", show: false } }));
      setTests((t) => ({ ...t, [id]: undefined }));
      await load();
      toast(`${META[id].console.split(" ")[0]} credentials saved`);
    } finally {
      setBusy(null);
    }
  };
  const removeProvider = async (id: ProviderId) => {
    setBusy(`remove-${id}`);
    try {
      await api("/api/admin/config", { method: "PUT", body: JSON.stringify({ [id]: { remove: true } }) });
      setTests((t) => ({ ...t, [id]: undefined }));
      await load();
      toast("Removed");
    } finally {
      setBusy(null);
    }
  };
  const testProvider = async (id: ProviderId) => {
    setBusy(`test-${id}`);
    try {
      const { body } = await api<{ ok: boolean; text: string }>("/api/admin/test", {
        method: "POST",
        body: JSON.stringify({ provider: id }),
      });
      setTests((t) => ({ ...t, [id]: body }));
    } catch {
      setTests((t) => ({ ...t, [id]: { ok: false, text: "Could not reach the server." } }));
    } finally {
      setBusy(null);
    }
  };
  const savePublicUrl = async () => {
    setBusy("url");
    try {
      const { status: code, body } = await api<{ errors?: string[]; error?: string }>("/api/admin/config", {
        method: "PUT",
        body: JSON.stringify({ publicUrl }),
      });
      const errors = body.errors ?? (body.error ? [body.error] : []);
      if (code !== 200 || errors.length) {
        toast(errors[0] ?? "Could not save");
        return;
      }
      await load();
      toast(publicUrl.trim() ? "Public URL saved" : "Public URL cleared");
    } finally {
      setBusy(null);
    }
  };

  /** one PUT of part of the config, with the first error as a toast */
  const put = async (data: Record<string, unknown>, okText: string) => {
    const { status: code, body } = await api<{ errors?: string[]; error?: string }>("/api/admin/config", {
      method: "PUT",
      body: JSON.stringify(data),
    });
    const errors = body.errors ?? (body.error ? [body.error] : []);
    if (code !== 200 || errors.length) {
      toast(errors[0] ?? "Could not save");
      return false;
    }
    await load();
    toast(okText);
    return true;
  };
  const saveContact = async () => {
    setBusy("contact");
    try {
      await put(
        { ownerContact: contact },
        contact.trim() ? "Organiser contact saved" : "Organiser contact cleared",
      );
    } finally {
      setBusy(null);
    }
  };
  const saveSeats = async (id: ProviderId) => {
    setBusy(`seats-${id}`);
    try {
      await put({ seats: { [id]: seatDrafts[id] } }, `${META[id].console.split(" ")[0]} seats saved`);
    } finally {
      setBusy(null);
    }
  };
  const saveAi = async () => {
    setBusy("ai");
    setAiTest(null);
    try {
      const ok = await put(
        {
          ai: {
            provider: aiDraft.provider,
            key: aiDraft.key,
            model: aiDraft.model,
            workspaceId: aiDraft.workspaceId,
            dailyLimit: aiDraft.dailyLimit,
          },
        },
        "Shared model key saved",
      );
      if (ok) setAiDraft((d) => ({ ...d, key: "", workspaceId: "", show: false }));
    } finally {
      setBusy(null);
    }
  };
  const removeAi = async () => {
    setBusy("ai-remove");
    setAiTest(null);
    try {
      await put({ ai: { remove: true } }, "Shared model key removed");
    } finally {
      setBusy(null);
    }
  };
  const testAi = async () => {
    setBusy("ai-test");
    try {
      const { body } = await api<{ ok: boolean; text: string }>("/api/admin/test", {
        method: "POST",
        body: JSON.stringify({ provider: "ai" }),
      });
      setAiTest(body);
    } catch {
      setAiTest({ ok: false, text: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  };
  const seatCount = (id: ProviderId) =>
    seatDrafts[id]
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter(Boolean).length;
  const tile = (id: ProviderId) => <Tile color={META[id].color}>{META[id].icon}</Tile>;
  const anyConfigured = status?.providers?.some((p) => p.configured) ?? false;

  return (
    <div className="mx-auto max-w-[720px]">
      <PageHeader
        title="Owner setup"
        subtitle={
          status
            ? `${status.origin} · stage ${status.stage}`
            : failed
              ? "The server did not answer."
              : "Checking…"
        }
        trailing={
          <a href={OWNER_GUIDE} target="_blank" rel="noreferrer" className="btn-plain" id="admin-guide">
            <BookOpen size={16} strokeWidth={2} className="mr-1 inline" aria-hidden />
            Owner guide
          </a>
        }
      />

      {status && !status.unlocked && (
        <Group
          header="Unlock"
          footer={
            <span
              className={unlockError ? "text-[var(--destructive)]" : undefined}
              role="status"
              aria-live="polite"
            >
              {unlockError ??
                (status.hasPassphrase
                  ? "Enter the owner passphrase. Forgotten it? Run Deploy to AWS again and use the setup code from the run summary."
                  : status.hasSetupCode
                    ? "Paste the setup code printed in the summary of the Deploy to AWS run (Actions → the run → Summary). It works for one day and only until a passphrase is set."
                    : "No setup code is stored for this deployment yet: run Deploy to AWS once and copy the code from the run summary.")}
            </span>
          }
          id="admin-unlock"
        >
          <FieldRow
            label={status.hasPassphrase ? "Passphrase" : "Setup code"}
            id="admin-secret"
            tile={
              <Tile color="#5856d6">
                <LockKeyhole size={16} strokeWidth={2} />
              </Tile>
            }
          >
            <input
              id="admin-secret"
              type={showSecret ? "text" : "password"}
              className="field field-value min-w-0 flex-1 font-mono"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && secret && busy !== "unlock") void unlock();
              }}
              autoComplete="current-password"
              spellCheck={false}
              data-autofocus
            />
            <button
              type="button"
              className="btn-plain -mr-2"
              onClick={() => setShowSecret((v) => !v)}
              aria-pressed={showSecret}
            >
              {showSecret ? "Hide" : "Show"}
            </button>
          </FieldRow>
          <ActionRow
            label="Unlock"
            onClick={unlock}
            disabled={!secret}
            busy={busy === "unlock"}
            id="admin-unlock-button"
          />
        </Group>
      )}

      {status?.unlocked && (passStep !== "none" || !status.hasPassphrase) && (
        <Group
          header="Owner passphrase"
          footer="Choose a passphrase of at least 8 characters: it opens this page from now on. Saving it deletes the one-time setup code. Keep it somewhere safe; a new deploy prints a fresh setup code if it is lost."
          id="admin-passphrase"
        >
          <FieldRow
            label="Passphrase"
            id="admin-pass-a"
            tile={
              <Tile color="#5856d6">
                <KeyRound size={16} strokeWidth={2} />
              </Tile>
            }
          >
            <input
              id="admin-pass-a"
              type="password"
              className="field field-value min-w-0 flex-1"
              value={pass.a}
              onChange={(e) => setPass((p) => ({ ...p, a: e.target.value }))}
              autoComplete="new-password"
            />
          </FieldRow>
          <FieldRow label="Repeat" id="admin-pass-b">
            <input
              id="admin-pass-b"
              type="password"
              className="field field-value min-w-0 flex-1"
              value={pass.b}
              onChange={(e) => setPass((p) => ({ ...p, b: e.target.value }))}
              autoComplete="new-password"
            />
          </FieldRow>
          <ActionRow
            label={status.hasPassphrase ? "Change passphrase" : "Save passphrase"}
            onClick={savePassphrase}
            disabled={pass.a.length < 8 || pass.a !== pass.b}
            busy={busy === "passphrase"}
            id="admin-pass-save"
          />
          {status.hasPassphrase && (
            <ActionRow label="Keep the current one" onClick={() => setPassStep("none")} />
          )}
        </Group>
      )}

      {status?.unlocked && status.hasPassphrase && passStep === "none" && (
        <>
          {!status.storeAvailable && (
            <Group
              footer="The config store did not answer (on AWS the function needs ssm:* on /tdj/*; locally use TDJ_CONFIG_BACKEND=memory). Saving will fail until it does."
              id="admin-store-warning"
            >
              <Row label="Config store" value="Unavailable" />
            </Group>
          )}
          {status.providers?.map((p) => {
            const m = META[p.id];
            const d = drafts[p.id];
            const t = tests[p.id];
            const locked = p.source === "env";
            return (
              <Group
                key={p.id}
                header={p.label}
                id={`admin-${p.id}`}
                footer={
                  t ? (
                    <span
                      role="status"
                      aria-live="polite"
                      className={t.ok ? "text-[var(--system-green)]" : "text-[var(--destructive)]"}
                      data-testid={`admin-test-${p.id}`}
                    >
                      {t.text}
                    </span>
                  ) : locked ? (
                    `${p.label} is set by the deployment's environment (a GitHub secret); change it there, not here.`
                  ) : (
                    m.help
                  )
                }
              >
                <Row
                  tile={tile(p.id)}
                  label="Status"
                  value={
                    p.configured ? (
                      <span className="inline-flex items-center">
                        <Dot on />
                        Configured · {p.idHint}
                      </span>
                    ) : (
                      <span className="inline-flex items-center">
                        <Dot on={false} />
                        Not configured
                      </span>
                    )
                  }
                  id={`admin-status-${p.id}`}
                />
                <Row label={`Open the ${m.console}`} chevron href={m.consoleUrl} />
                {p.redirectUris.map((u, i) => (
                  <UriRow key={u} uri={u} id={`admin-uri-${p.id}-${i}`} />
                ))}
                {!locked && (
                  <>
                    <FieldRow label={m.idLabel} id={`admin-id-${p.id}`}>
                      <input
                        id={`admin-id-${p.id}`}
                        className="field field-value min-w-0 flex-1 font-mono"
                        placeholder={p.configured ? "Replace" : "Paste"}
                        value={d.id}
                        onChange={(e) =>
                          setDrafts((x) => ({ ...x, [p.id]: { ...x[p.id], id: e.target.value.trim() } }))
                        }
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </FieldRow>
                    <FieldRow label={m.secretLabel} id={`admin-secret-${p.id}`}>
                      <input
                        id={`admin-secret-${p.id}`}
                        type={d.show ? "text" : "password"}
                        className="field field-value min-w-0 flex-1 font-mono"
                        placeholder={p.configured ? "Replace" : "Paste"}
                        value={d.secret}
                        onChange={(e) =>
                          setDrafts((x) => ({ ...x, [p.id]: { ...x[p.id], secret: e.target.value.trim() } }))
                        }
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="btn-plain -mr-2"
                        onClick={() =>
                          setDrafts((x) => ({ ...x, [p.id]: { ...x[p.id], show: !x[p.id].show } }))
                        }
                        aria-pressed={d.show}
                      >
                        {d.show ? "Hide" : "Show"}
                      </button>
                    </FieldRow>
                    <ActionRow
                      label="Save"
                      onClick={() => saveProvider(p.id)}
                      disabled={!d.id || !d.secret}
                      busy={busy === `save-${p.id}`}
                      id={`admin-save-${p.id}`}
                    />
                  </>
                )}
                {p.configured && (
                  <ActionRow
                    label="Test"
                    onClick={() => testProvider(p.id)}
                    busy={busy === `test-${p.id}`}
                    id={`admin-test-button-${p.id}`}
                  />
                )}
                {p.configured && !locked && (
                  <ActionRow
                    label="Remove"
                    destructive
                    onClick={() => removeProvider(p.id)}
                    busy={busy === `remove-${p.id}`}
                    id={`admin-remove-${p.id}`}
                  />
                )}
              </Group>
            );
          })}

          <Group
            header="People"
            footer="Spotify lets a small app like this one admit 5 Spotify accounts: you add each DJ's Spotify e-mail under User Management in the Spotify dashboard, and a sixth DJ is turned away at login. Keep the same list here so you and the DJs see how many seats are left; the lists stay on the server and only the counts are shown to DJs. Google admits 100 test users while the app is unverified, Dropbox 50 linked users before a production approval. One e-mail per line."
            id="admin-people"
          >
            <FieldRow
              label="Organiser contact"
              sub="Shown to DJs who need a seat"
              id="admin-contact"
              tile={
                <Tile color="#636366">
                  <UserRound size={16} strokeWidth={2} />
                </Tile>
              }
            >
              <input
                id="admin-contact"
                className="field field-value min-w-0 flex-1"
                placeholder="you@example.com or a chat handle"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </FieldRow>
            <ActionRow
              label="Save contact"
              onClick={saveContact}
              disabled={contact.trim() === (status.ownerContact ?? "")}
              busy={busy === "contact"}
              id="admin-contact-save"
            />
            {(["spotify", "google", "dropbox"] as ProviderId[]).map((id) => {
              const max = status.seatLimits?.[id] ?? 0;
              const n = seatCount(id);
              return (
                <div key={id} className="contents">
                  <Row
                    tile={
                      <Tile color={META[id].color}>
                        <Users size={16} strokeWidth={2} />
                      </Tile>
                    }
                    label={`${META[id].console.split(" ")[0]} seats`}
                    sub={PEOPLE[id].note}
                    value={
                      <span className={n > max ? "text-[var(--destructive)]" : undefined}>
                        {n} of {max} used
                      </span>
                    }
                    id={`admin-seats-${id}`}
                  />
                  <Row label={`Open ${PEOPLE[id].where}`} chevron href={PEOPLE[id].url} />
                  <label htmlFor={`admin-seat-list-${id}`} className="cell">
                    <span className="sr-only">{META[id].console.split(" ")[0]} seat e-mails</span>
                    <textarea
                      id={`admin-seat-list-${id}`}
                      className="field min-h-[88px] w-full resize-y"
                      placeholder={"dj@example.com\nanother@example.com"}
                      value={seatDrafts[id]}
                      onChange={(e) => setSeatDrafts((d) => ({ ...d, [id]: e.target.value }))}
                      autoComplete="off"
                      spellCheck={false}
                      rows={3}
                    />
                  </label>
                  <ActionRow
                    label="Save seats"
                    onClick={() => saveSeats(id)}
                    disabled={n > max || seatDrafts[id].trim() === (status.seats?.[id] ?? []).join("\n")}
                    busy={busy === `seats-${id}`}
                    id={`admin-seats-save-${id}`}
                  />
                </div>
              );
            })}
          </Group>

          <Group
            header="AI reviews for everyone"
            id="admin-ai"
            footer={
              aiTest ? (
                <span
                  role="status"
                  aria-live="polite"
                  className={aiTest.ok ? "text-[var(--system-green)]" : "text-[var(--destructive)]"}
                  data-testid="admin-test-ai"
                >
                  {aiTest.text}
                </span>
              ) : status.ai?.source === "env" ? (
                "The shared model key is set by the deployment's environment; change it there, not here."
              ) : (
                "One model key, paid by you, writes reviews for every DJ who has not added a key of their own, up to the daily limit per DJ (counted per server instance, so treat it as a courtesy cap). The key never reaches a browser. The Workspace ID is only needed for an Anthropic key created at organisation level."
              )
            }
          >
            <Row
              tile={
                <Tile color="#5856d6">
                  <Sparkles size={16} strokeWidth={2} />
                </Tile>
              }
              label="Status"
              value={
                status.ai?.configured ? (
                  <span className="inline-flex items-center">
                    <Dot on />
                    Configured · {status.ai.keyHint} · {status.ai.dailyLimit}/day
                  </span>
                ) : (
                  <span className="inline-flex items-center">
                    <Dot on={false} />
                    Not configured
                  </span>
                )
              }
              id="admin-status-ai"
            />
            {status.ai?.source !== "env" && (
              <>
                <SegmentedRow
                  label="Provider"
                  value={aiDraft.provider}
                  items={AI_PROVIDERS}
                  onChange={(provider) => setAiDraft((d) => ({ ...d, provider }))}
                />
                <FieldRow label="API key" id="admin-ai-key">
                  <input
                    id="admin-ai-key"
                    type={aiDraft.show ? "text" : "password"}
                    className="field field-value min-w-0 flex-1 font-mono"
                    placeholder={status.ai?.configured ? "Replace" : "Paste"}
                    value={aiDraft.key}
                    onChange={(e) => setAiDraft((d) => ({ ...d, key: e.target.value.trim() }))}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className="btn-plain -mr-2"
                    onClick={() => setAiDraft((d) => ({ ...d, show: !d.show }))}
                    aria-pressed={aiDraft.show}
                  >
                    {aiDraft.show ? "Hide" : "Show"}
                  </button>
                </FieldRow>
                <FieldRow label="Model" sub="Blank for the default" id="admin-ai-model">
                  <input
                    id="admin-ai-model"
                    className="field field-value min-w-0 flex-1 font-mono"
                    placeholder={AI_DEFAULT_MODEL[aiDraft.provider]}
                    value={aiDraft.model}
                    onChange={(e) => setAiDraft((d) => ({ ...d, model: e.target.value.trim() }))}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FieldRow>
                {aiDraft.provider === "anthropic" && (
                  <FieldRow
                    label="Workspace ID"
                    sub={status.ai?.hasWorkspace ? "Saved · paste to replace" : "Optional"}
                    id="admin-ai-workspace"
                  >
                    <input
                      id="admin-ai-workspace"
                      className="field field-value min-w-0 flex-1 font-mono"
                      placeholder="wrkspc_…"
                      value={aiDraft.workspaceId}
                      onChange={(e) => setAiDraft((d) => ({ ...d, workspaceId: e.target.value.trim() }))}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </FieldRow>
                )}
                <StepperRow
                  label="Daily limit per DJ"
                  value={aiDraft.dailyLimit}
                  min={1}
                  max={200}
                  step={1}
                  onChange={(dailyLimit) => setAiDraft((d) => ({ ...d, dailyLimit }))}
                />
                <ActionRow
                  label="Save"
                  onClick={saveAi}
                  disabled={!aiDraft.key && !status.ai?.configured}
                  busy={busy === "ai"}
                  id="admin-ai-save"
                />
              </>
            )}
            {status.ai?.configured && (
              <ActionRow label="Test" onClick={testAi} busy={busy === "ai-test"} id="admin-ai-test" />
            )}
            {status.ai?.configured && status.ai.source !== "env" && (
              <ActionRow
                label="Remove"
                destructive
                onClick={removeAi}
                busy={busy === "ai-remove"}
                id="admin-ai-remove"
              />
            )}
          </Group>

          <Group
            header="Public address"
            footer={
              status.publicUrl?.source === "env"
                ? "The public URL is set by the deployment's environment (NEXT_PUBLIC_APP_URL)."
                : "Leave empty to use the address the app is opened on (the CloudFront URL). Set it when a custom domain fronts the app, so the redirect URIs above match what the providers see."
            }
            id="admin-public-url"
          >
            <Row
              tile={
                <Tile color="#636366">
                  <Link2 size={16} strokeWidth={2} />
                </Tile>
              }
              label="Origin"
              value={<span className="font-mono text-footnote">{status.origin}</span>}
            />
            {status.publicUrl?.source !== "env" && (
              <>
                <FieldRow label="Public URL" id="admin-url">
                  <input
                    id="admin-url"
                    className="field field-value min-w-0 flex-1 font-mono"
                    placeholder="https://…"
                    inputMode="url"
                    value={publicUrl}
                    onChange={(e) => setPublicUrl(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </FieldRow>
                <ActionRow
                  label="Save public URL"
                  onClick={savePublicUrl}
                  disabled={(status.publicUrl?.value ?? "") === publicUrl.trim().replace(/\/$/, "")}
                  busy={busy === "url"}
                />
              </>
            )}
          </Group>

          <Group
            header="Session"
            footer={
              anyConfigured
                ? "DJs see the configured services under Settings → Connectors. This page stays unlocked for 12 hours in this browser."
                : "Nothing is configured yet: Settings → Connectors shows the bring-your-own fields until a service is saved here. This page stays unlocked for 12 hours in this browser."
            }
          >
            <ActionRow
              label="Change passphrase"
              onClick={() => setPassStep("change")}
              id="admin-change-pass"
            />
            <ActionRow label="Lock" destructive onClick={lock} busy={busy === "lock"} id="admin-lock" />
          </Group>
        </>
      )}
    </div>
  );
}
