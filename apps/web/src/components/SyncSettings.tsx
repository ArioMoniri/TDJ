"use client";
import { Cloud, KeyRound, Laptop, QrCode as QrIcon, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActionRow, FieldRow, Group, Row, SegmentedRow, SwitchRow, Tile } from "@/components/Form";
import { QrCode } from "@/components/QrCode";
import { Sheet } from "@/components/Sheet";
import { APP } from "@/lib/app/target";
import { downloadBlob } from "@/lib/download";
import { fmtDate } from "@/lib/i18n";
import { useT } from "@/lib/i18n/useT";
import { BUILD_SYNC_URL, type ServerMode, startSync, useSync } from "@/lib/sync/client";
import { codeLink, normalizeCode } from "@/lib/sync/code";
import { exportEncrypted, exportPlain, LIBRARY_EXT, mergeImport, readLibraryFile } from "@/lib/sync/file";
import { storeSide } from "@/lib/sync/local";
import { toast } from "@/lib/toast";

/**
 * Settings → Sync (docs/SYNC.md), one self-contained block: it slots into the Settings page as is, or into a "Sync"
 * category of a categorized Settings. Turn on / join with a code, the code and its QR code, status, devices, the
 * sync server, iCloud (the Apple apps), Leave, Reset, and the library file for anyone without either.
 */
export function SyncSettings() {
  const t = useT();
  const s = useSync();
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [armed, setArmed] = useState<"leave" | "reset" | null>(null);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState(false);
  const [modeUI, setModeUI] = useState<ServerMode | null>(null);
  const [fileCode, setFileCode] = useState("");
  const [fileNote, setFileNote] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const c = s.config;

  useEffect(() => {
    startSync();
    void s.init();
    // a code in the address (#sync=… from a link): ready to join, never sent anywhere
    const m = /[#&]sync=([^&]+)/.exec(location.hash);
    if (m) {
      setJoinCode(normalizeCode(decodeURIComponent(m[1]!)) ?? "");
      history.replaceState(null, "", location.pathname + location.search);
    }
  }, [s.init]);
  const saved = c?.server ?? s.pendingServer;
  useEffect(() => {
    if (saved.mode === "custom") setUrl(saved.url);
  }, [saved.mode, saved.url]);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(null), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };
  const when = (iso: string | number) => fmtDate(iso, { dateStyle: "medium", timeStyle: "short" });
  const join = () =>
    run("join", async () => {
      const ok = await s.join(joinCode);
      setJoinError(!ok);
      if (ok) setJoinCode("");
    });

  const statusText = !c?.on
    ? t("devsync.status_off")
    : s.status === "syncing"
      ? t("devsync.status_syncing")
      : s.error
        ? s.error
        : s.lastSync
          ? t("devsync.status_ok", { time: when(s.lastSync) })
          : t("devsync.status_idle");

  const serverItems: Array<[ServerMode, string]> = [
    ["default", t("devsync.server_default")],
    ["custom", t("devsync.server_custom")],
    ["off", t("devsync.server_off")],
  ];
  const defaultServer = BUILD_SYNC_URL || (APP ? "" : t("devsync.server_here"));
  const serverMode: ServerMode = modeUI ?? (c ?? { server: s.pendingServer }).server.mode;

  const exportFile = (encrypted: boolean) =>
    run(encrypted ? "export-enc" : "export", async () => {
      const lib = storeSide.read();
      const day = new Date().toISOString().slice(0, 10);
      const body = encrypted && c ? await exportEncrypted(lib, c.code) : exportPlain(lib);
      await downloadBlob(
        `T-DJ-${day}${encrypted ? "-encrypted" : ""}.${LIBRARY_EXT}`,
        body,
        "application/json",
      );
    });
  const importFile = (f: File) =>
    run("import", async () => {
      const text = await f.text();
      const r = await readLibraryFile(text, normalizeCode(fileCode) ?? c?.code ?? null);
      if (!r.ok) {
        setFileNote(
          r.reason === "needs-code"
            ? t("devsync.import_needs_code")
            : r.reason === "wrong-code"
              ? t("devsync.import_wrong_code")
              : t("devsync.import_bad"),
        );
        return;
      }
      const { next, added } = mergeImport(storeSide.read(), r.file);
      storeSide.write(next);
      setFileNote(null);
      toast(t("devsync.import_done", { count: added }));
    });

  const devices = s.devices.map((d) => ({
    ...d,
    seenMs: Math.max(Date.parse(d.seen) || 0, s.serverSeen[d.id] ?? 0),
  }));

  return (
    <div data-testid="sync-settings" id="settings-sync">
      <Group header={t("devsync.header")} footer={t("devsync.footer")}>
        {!c ? (
          <>
            <Row
              tile={
                <Tile color="#34c759">
                  <RefreshCw size={16} strokeWidth={2} />
                </Tile>
              }
              label={t("devsync.start")}
              sub={t("devsync.start_sub")}
              chevron
              busy={busy === "create"}
              onClick={() => run("create", () => s.create().then(() => setShowCode(true)))}
              data-testid="sync-start"
            />
            <FieldRow
              label={t("devsync.join")}
              sub={
                joinError ? (
                  <span className="text-[var(--destructive)]">{t("devsync.bad_code")}</span>
                ) : (
                  t("devsync.join_sub")
                )
              }
              id="sync-join-code"
              tile={
                <Tile color="#007aff">
                  <KeyRound size={16} strokeWidth={2} />
                </Tile>
              }
            >
              <input
                id="sync-join-code"
                className="field field-value min-w-0 flex-1 font-mono"
                placeholder="tango-…"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value);
                  setJoinError(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && joinCode.trim()) join();
                }}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                data-testid="sync-join-input"
              />
              <button
                type="button"
                className="btn-plain -mr-2 min-h-11"
                disabled={!joinCode.trim() || busy === "join"}
                onClick={join}
                data-testid="sync-join"
              >
                {t("devsync.join_button")}
              </button>
            </FieldRow>
          </>
        ) : (
          <>
            <SwitchRow
              label={t("devsync.on")}
              checked={c.on}
              onChange={(on) => void s.setOn(on)}
              tile={
                <Tile color="#34c759">
                  <RefreshCw size={16} strokeWidth={2} />
                </Tile>
              }
            />
            <Row
              label={t("devsync.status")}
              sub={
                <span data-testid="sync-status" data-status={s.status}>
                  {statusText}
                </span>
              }
              busy={s.status === "syncing"}
            >
              {c.on && (
                <button
                  type="button"
                  className="btn-plain -mr-2 min-h-11"
                  onClick={() => void s.syncNow()}
                  disabled={s.status === "syncing"}
                  data-testid="sync-now"
                >
                  {t("devsync.sync_now")}
                </button>
              )}
            </Row>
            <Row
              tile={
                <Tile color="#5856d6">
                  <QrIcon size={16} strokeWidth={2} />
                </Tile>
              }
              label={t("devsync.show_code")}
              sub={t("devsync.show_code_sub")}
              chevron
              onClick={() => setShowCode(true)}
              data-testid="sync-show-code"
            />
          </>
        )}
      </Group>

      {c && devices.length > 0 && (
        <Group header={t("devsync.devices")} footer={t("devsync.devices_foot")} data-testid="sync-devices">
          {devices.map((d) => (
            <Row
              key={d.id}
              tile={
                <Tile color="#8e8e93">
                  {/mac|windows|other/.test(d.platform) ? (
                    <Laptop size={16} strokeWidth={2} />
                  ) : (
                    <Smartphone size={16} strokeWidth={2} />
                  )}
                </Tile>
              }
              label={d.self ? `${d.name} · ${t("devsync.this_device")}` : d.name}
              sub={d.seenMs ? t("devsync.last_seen", { time: when(d.seenMs) }) : undefined}
            />
          ))}
        </Group>
      )}

      <Group header={t("devsync.server")} footer={t("devsync.server_foot")}>
        <SegmentedRow
          label={t("devsync.server")}
          sub={serverMode === "default" ? defaultServer || t("devsync.server_none") : undefined}
          value={serverMode}
          items={serverItems}
          onChange={(m) => {
            // "Your own" waits for an address; the others apply at once
            setModeUI(m);
            if (m !== "custom") void s.setServer(m);
          }}
        />
        {serverMode === "custom" && (
          <FieldRow
            label={t("devsync.server_url")}
            id="sync-server-url"
            sub={
              urlError ? (
                <span className="text-[var(--destructive)]">{t("devsync.server_url_bad")}</span>
              ) : undefined
            }
          >
            <input
              id="sync-server-url"
              className="field field-value min-w-0 flex-1 font-mono"
              placeholder="https://"
              value={url}
              inputMode="url"
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError(false);
              }}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <button
              type="button"
              className="btn-plain -mr-2 min-h-11"
              onClick={() => void s.setServer("custom", url).then((ok) => setUrlError(!ok))}
            >
              {t("devsync.server_save")}
            </button>
          </FieldRow>
        )}
      </Group>

      {APP && c && (
        <Group>
          {s.icloud.available ? (
            <SwitchRow
              label={t("devsync.icloud")}
              sub={t("devsync.icloud_sub")}
              checked={c.icloud}
              onChange={(on) => void s.setICloud(on)}
              tile={
                <Tile color="#0a84ff">
                  <Cloud size={16} strokeWidth={2} />
                </Tile>
              }
            />
          ) : (
            <Row
              tile={
                <Tile color="#8e8e93">
                  <Cloud size={16} strokeWidth={2} />
                </Tile>
              }
              label={t("devsync.icloud")}
              sub={s.icloud.reason === "off" ? t("devsync.icloud_off") : t("devsync.icloud_unsupported")}
            />
          )}
        </Group>
      )}

      {c && (
        <Group footer={t("devsync.manage_foot")}>
          <ActionRow
            label={armed === "leave" ? t("devsync.leave_confirm") : t("devsync.leave")}
            destructive
            busy={busy === "leave"}
            onClick={() => {
              if (armed !== "leave") return setArmed("leave");
              setArmed(null);
              void run("leave", () => s.leave());
            }}
            id="sync-leave"
          />
          <ActionRow
            label={armed === "reset" ? t("devsync.reset_confirm") : t("devsync.reset")}
            destructive
            busy={busy === "reset"}
            onClick={() => {
              if (armed !== "reset") return setArmed("reset");
              setArmed(null);
              void run("reset", async () => {
                if (await s.reset()) {
                  toast(t("devsync.reset_done"));
                  setShowCode(true);
                }
              });
            }}
            id="sync-reset"
          />
        </Group>
      )}

      <Group header={t("devsync.file_header")} footer={fileNote ?? t("devsync.file_foot")}>
        {c && (
          <Row
            label={t("devsync.export_encrypted")}
            sub={t("devsync.export_encrypted_sub")}
            chevron
            busy={busy === "export-enc"}
            onClick={() => exportFile(true)}
            data-testid="sync-export-encrypted"
          />
        )}
        <Row
          label={t("devsync.export_plain")}
          sub={t("devsync.export_plain_sub")}
          chevron
          busy={busy === "export"}
          onClick={() => exportFile(false)}
          data-testid="sync-export-plain"
        />
        <Row
          label={t("devsync.import")}
          sub={t("devsync.import_sub")}
          chevron
          busy={busy === "import"}
          onClick={() => fileInput.current?.click()}
          data-testid="sync-import"
        />
        {fileNote && (
          <FieldRow label={t("devsync.file_code")} id="sync-file-code">
            <input
              id="sync-file-code"
              className="field field-value min-w-0 flex-1 font-mono"
              placeholder="tango-…"
              value={fileCode}
              onChange={(e) => setFileCode(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </FieldRow>
        )}
        <input
          ref={fileInput}
          type="file"
          accept={`.${LIBRARY_EXT},.json,application/json`}
          className="hidden"
          data-testid="sync-import-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) importFile(f);
          }}
        />
      </Group>

      <Sheet
        open={showCode && !!c}
        onClose={() => setShowCode(false)}
        title={t("devsync.code_title")}
        trailing={t("settings.done")}
      >
        {c && (
          <Group footer={t("devsync.code_foot")}>
            <div className="flex flex-col items-center gap-4 px-4 py-5">
              <QrCode value={codeLink(c.code)} label={t("devsync.qr_label")} size={200} />
              <code className="text-body select-all break-all text-center font-mono" data-testid="sync-code">
                {c.code}
              </code>
              <button
                type="button"
                className="btn-plain min-h-11"
                onClick={() =>
                  void navigator.clipboard?.writeText(c.code).then(
                    () => toast(t("devsync.copied")),
                    () => {},
                  )
                }
              >
                {t("devsync.copy")}
              </button>
            </div>
          </Group>
        )}
      </Sheet>
    </div>
  );
}
