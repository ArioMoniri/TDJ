"use client";
import { Server } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke, nativeInfo } from "@/lib/app/native";
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
      toast(`Linked to ${new URL(origin).host}`);
    } catch (e) {
      setError(
        typeof e === "string" ? e : ((e as { message?: string })?.message ?? "That server did not answer."),
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
      toast("This device no longer talks to a TDJ server");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Group
      header="Connections"
      footer={
        linked
          ? `Your database changes are also saved on ${host}, and Google, Dropbox and rooms go through it. Composing, playing and your history stay on this device either way.`
          : "T-DJ works fully on this device: composing, the catalogue, your database and history. Link your own TDJ server only to share rooms or keep it in sync with this device."
      }
      id="app-connections"
    >
      <Row
        tile={
          <Tile color="#636366">
            <Server size={16} strokeWidth={2} />
          </Tile>
        }
        label="TDJ server"
        value={linked ? host : "Not linked"}
        id="app-server-status"
      />
      {linked ? (
        <ActionRow
          label="Unlink this server"
          destructive
          onClick={unlink}
          busy={busy}
          id="app-server-unlink"
        />
      ) : (
        <SwitchRow label="Link a TDJ server" checked={open} onChange={setOpen} />
      )}
      {!linked && open && (
        <>
          <FieldRow label="Address" id="app-server-url" sub={error || undefined}>
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
          <ActionRow label="Link" onClick={link} busy={busy} disabled={!url} id="app-server-link" />
        </>
      )}
    </Group>
  );
}
