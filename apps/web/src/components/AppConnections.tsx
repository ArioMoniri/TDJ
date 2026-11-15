"use client";
import { Server } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke, nativeInfo } from "@/lib/app/native";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { ActionRow, FieldRow, Group, Row, SwitchRow, Tile } from "./Form";

/**
 * Settings → Connections (apps only). T-DJ runs entirely on this device; a TDJ server is an opt-in link, off by
 * default, for rooms and for keeping the DJ's own self-deployed instance in sync. Google, Dropbox and Pipedream
 * also go through a linked server, because their sign-in needs a secret an app cannot keep.
 */
export function AppConnections() {
  const [linked, setLinked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    void nativeInfo().then((i) => setLinked(i.linkedServer ?? null));
  }, []);
  const host = (() => {
    try {
      return linked ? new URL(linked).host : "";
    } catch {
      return linked ?? "";
    }
  })();
  const link = async () => {
    setBusy(true);
    setError("");
    try {
      const origin = await invoke<string>("set_server", { url });
      setLinked(origin);
      setOpen(false);
      toast(t("appConnections.linked_to", { host: new URL(origin).host }));
    } catch (e) {
      setError(
        typeof e === "string"
          ? e
          : ((e as { message?: string })?.message ?? t("appConnections.that_server_did_not_answer")),
      );
    } finally {
      setBusy(false);
    }
  };
  const unlink = async () => {
    setBusy(true);
    try {
      await invoke("unlink_server");
      setLinked(null);
      setUrl("");
      toast(t("appConnections.this_device_no_longer_talks_to"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Group
      header={t("appConnections.connections")}
      footer={
        linked
          ? t("appConnections.your_database_changes_are_also_saved", { host })
          : t("appConnections.t_dj_works_fully_on_this")
      }
      id="app-connections"
    >
      <Row
        tile={
          <Tile color="#636366">
            <Server size={16} strokeWidth={2} />
          </Tile>
        }
        label={t("appConnections.tdj_server")}
        value={linked ? host : "Not linked"}
        id="app-server-status"
      />
      {linked ? (
        <ActionRow
          label={t("appConnections.unlink_this_server")}
          destructive
          onClick={unlink}
          busy={busy}
          id="app-server-unlink"
        />
      ) : (
        <SwitchRow label={t("appConnections.link_a_tdj_server")} checked={open} onChange={setOpen} />
      )}
      {!linked && open && (
        <>
          <FieldRow label={t("appConnections.address")} id="app-server-url" sub={error || undefined}>
            <input
              id="app-server-url"
              type="url"
              inputMode="url"
              className="field field-value min-w-0 flex-1 font-mono"
              placeholder="https://tdj.example.org"
              value={url}
              onChange={(e) => setUrl(e.target.value.trim())}
              autoComplete="url"
              autoCapitalize="off"
              spellCheck={false}
            />
          </FieldRow>
          <ActionRow
            label={t("appConnections.link")}
            onClick={link}
            busy={busy}
            disabled={!url}
            id="app-server-link"
          />
        </>
      )}
    </Group>
  );
}
