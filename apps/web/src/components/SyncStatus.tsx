"use client";
import { CloudCheck, CloudOff, LoaderCircle, RefreshCw } from "lucide-react";
import { t } from "@/lib/i18n";
import {
  type NightSync,
  type SyncService,
  type SyncStatus,
  setSyncEnabled,
  statusOf,
  useSync,
} from "@/lib/playlistSync";
import { playlistSyncer } from "@/lib/playlistSyncRun";
import { useStore } from "@/lib/store";
import { ActionRow, Group, Row, SwitchRow, Tile } from "./Form";

const NAME: Record<SyncService, string> = { spotify: "Spotify", youtube: "YouTube" };

/** one line for a target's state: "Spotify playlist updated · 2 changes", "Syncing…", the error */
export function syncLine(service: SyncService, s: SyncStatus): string {
  const name = NAME[service];
  if (s.state === "pending") return t("sync.pending", { name, n: s.changes });
  if (s.state === "syncing") return t("sync.syncing", { name });
  if (s.state === "error") return t("sync.failed", { name, error: s.error ?? "" });
  if (s.state === "ok" && s.changes > 0) return t("sync.updated", { name, n: s.changes });
  return t("sync.in_step", { name });
}

function useNightSync(): { nightId: string | null; rec: NightSync | null } {
  const nightId = useStore((s) => s.playlist?.id ?? null);
  const rec = useSync((s) => (nightId ? (s.records[nightId] ?? null) : null));
  useSync((s) => s.status);
  return { nightId, rec };
}

/**
 * The Export sheet's group: the switch, each exported playlist with its state and Retry, and what cannot follow
 * (a file, YouTube's cover).
 */
export function SyncGroup() {
  const { nightId, rec } = useNightSync();
  const playlist = useStore((s) => s.playlist);
  if (!nightId || !rec?.targets.length)
    return (
      <Group header={t("sync.header")} footer={t("sync.footer_none")} data-testid="sync-group">
        <Row label={t("sync.none_yet")} />
      </Group>
    );
  return (
    <Group
      header={t("sync.header")}
      footer={`${t("sync.footer")}${rec.targets.some((x) => x.service === "youtube") ? ` ${t("sync.youtube_cover")}` : ""}`}
      data-testid="sync-group"
    >
      <SwitchRow
        label={t("sync.switch")}
        sub={t("sync.switch_sub")}
        checked={rec.enabled}
        onChange={(v) => {
          setSyncEnabled(nightId, v);
          if (v) void playlistSyncer.flush(useStore.getState().playlist);
        }}
      />
      {rec.targets.map((tg) => {
        const s = statusOf(nightId, tg.service);
        return (
          <Row
            key={tg.service}
            tile={
              <Tile color={tg.service === "spotify" ? "#1db954" : "#ff0033"}>
                {s.state === "syncing" ? (
                  <LoaderCircle size={16} strokeWidth={2} className="animate-spin" />
                ) : s.state === "error" ? (
                  <CloudOff size={16} strokeWidth={2} />
                ) : (
                  <CloudCheck size={16} strokeWidth={2} />
                )}
              </Tile>
            }
            label={syncLine(tg.service, s)}
            sub={
              s.state === "ok" && s.cover === "added"
                ? t("sync.cover_updated")
                : s.state === "ok" && s.cover === "no-scope"
                  ? t("cover.reconnect")
                  : rec.enabled
                    ? undefined
                    : t("sync.off")
            }
            href={tg.url}
            data-testid={`sync-${tg.service}`}
            data-state={s.state}
          />
        );
      })}
      {rec.targets.some((tg) => statusOf(nightId, tg.service).state === "error") && (
        <ActionRow
          label={t("sync.retry")}
          onClick={() => void playlistSyncer.flush(playlist)}
          id="sync-retry"
        />
      )}
    </Group>
  );
}

/** the Booth's small chip: the exported playlists' state at a glance (a tap retries after an error) */
export function SyncChip() {
  const { nightId, rec } = useNightSync();
  const playlist = useStore((s) => s.playlist);
  if (!nightId || !rec?.enabled || !rec.targets.length) return null;
  const all = rec.targets.map((tg) => ({ tg, s: statusOf(nightId, tg.service) }));
  const err = all.find((x) => x.s.state === "error");
  const busy = all.find((x) => x.s.state === "syncing" || x.s.state === "pending");
  const label = err
    ? t("sync.chip_failed")
    : busy
      ? t("sync.chip_syncing")
      : t("sync.chip_ok", { n: all.length });
  const title = all.map((x) => syncLine(x.tg.service, x.s)).join(" · ");
  return (
    <button
      type="button"
      className="sync-chip"
      data-state={err ? "error" : busy ? "busy" : "ok"}
      data-testid="sync-chip"
      title={title}
      aria-label={title}
      onClick={() => {
        if (err) void playlistSyncer.flush(playlist);
      }}
    >
      {err ? (
        <RefreshCw size={13} strokeWidth={2.25} aria-hidden />
      ) : busy ? (
        <LoaderCircle size={13} strokeWidth={2.25} className="animate-spin" aria-hidden />
      ) : (
        <CloudCheck size={13} strokeWidth={2.25} aria-hidden />
      )}
      <span>{label}</span>
    </button>
  );
}
