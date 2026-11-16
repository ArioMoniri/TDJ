"use client";
import { Brain, CloudUpload, Heart, History, Palette, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { CATALOGUE_GROUPS, type Group as ContribGroup, PERSONAL } from "@/lib/contrib/collect";
import {
  checkOwner,
  exportContributionFile,
  forgetOwnerDevice,
  refreshCounts,
  sendPending,
  setOwnerPrefs,
  startOwnerSync,
  useOwner,
} from "@/lib/contrib/owner";
import { type MsgKey, plural, t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { ActionRow, Group, Row, SwitchRow, Tile } from "./Form";
import { Sheet } from "./Sheet";

const GROUP_LABEL: Record<ContribGroup, MsgKey> = {
  songs: "owner.group_songs",
  added: "owner.group_added",
  cortinas: "owner.group_cortinas",
  orchestras: "owner.group_orchestras",
  filled: "owner.group_filled",
  matches: "owner.group_matches",
  artwork: "owner.group_artwork",
  learning: "owner.group_learning",
  favourites: "owner.group_favourites",
  history: "owner.group_history",
  grades: "owner.group_grades",
};
const PERSONAL_ICON = { learning: Brain, favourites: Heart, history: History, grades: Palette } as const;
const ORDER: ContribGroup[] = [...(Object.keys(CATALOGUE_GROUPS) as ContribGroup[]), ...PERSONAL];

/**
 * Settings → Owner (2026-11): shown only on a device that has seen this deployment's owner session. The owner's
 * catalogue edits go to the shared repo data as contributions (lib/contrib/owner.ts); personal categories only when
 * switched on here. Every other DJ never sees this group and nothing of theirs leaves their device or their own row.
 */
export function OwnerContributions() {
  const ui = useOwner();
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    void checkOwner(true).then((s) => {
      if (s === "owner") startOwnerSync();
    });
  }, []);
  const { prefs, status } = ui;
  if (!prefs.device && status !== "owner") return null;
  const total = ORDER.reduce((n, g) => n + (ui.existing[g] ?? 0), 0);
  const send = async () => {
    const r = await sendPending({ includeBaseline: true });
    setPreview(false);
    if (r.error) toast(t("owner.send_failed", { error: r.error }));
    else toast(r.sent ? plural("owner.sent_toast", r.sent) : t("owner.nothing_to_send"));
  };
  const exportFile = async () => {
    const n = await exportContributionFile();
    toast(plural("owner.exported_toast", n));
  };
  return (
    <div data-testid="settings-owner">
      <Group
        header={t("owner.title")}
        footer={
          status === "owner"
            ? t("owner.footer_unlocked")
            : status === "unavailable"
              ? t("owner.footer_unavailable")
              : t("owner.footer_locked")
        }
      >
        <SwitchRow
          tile={
            <Tile color="#5856D6">
              <CloudUpload size={16} strokeWidth={2} />
            </Tile>
          }
          label={t("owner.auto")}
          sub={t("owner.auto_sub")}
          checked={prefs.auto}
          onChange={(auto) => setOwnerPrefs({ auto })}
        />
        <Row
          label={t("owner.waiting")}
          value={<span data-testid="owner-waiting">{ui.waiting}</span>}
          sub={ui.serverPending !== null ? plural("owner.server_pending", ui.serverPending) : undefined}
        />
        {status !== "owner" && (
          <Row
            tile={
              <Tile color="#636366">
                <ShieldCheck size={16} strokeWidth={2} />
              </Tile>
            }
            label={t("owner.unlock")}
            sub={t("owner.unlock_sub")}
            chevron
            onClick={() => location.assign("/admin")}
            id="owner-unlock"
          />
        )}
        <ActionRow
          label={t("owner.send_existing")}
          onClick={() => {
            refreshCounts();
            setPreview(true);
          }}
          disabled={status !== "owner"}
          busy={ui.busy}
          id="owner-send-existing"
        />
        <ActionRow label={t("owner.export")} onClick={() => void exportFile()} id="owner-export" />
      </Group>

      <Group header={t("owner.share_header")} footer={t("owner.share_footer")}>
        {PERSONAL.map((k) => {
          const Icon = PERSONAL_ICON[k];
          return (
            <SwitchRow
              key={k}
              tile={
                <Tile color="#FF2D55">
                  <Icon size={16} strokeWidth={2} />
                </Tile>
              }
              label={t(GROUP_LABEL[k])}
              checked={prefs.personal[k]}
              onChange={(v) => setOwnerPrefs({ personal: { ...prefs.personal, [k]: v } })}
            />
          );
        })}
        <ActionRow label={t("owner.forget")} destructive onClick={forgetOwnerDevice} id="owner-forget" />
      </Group>

      <Sheet
        open={preview}
        onClose={() => setPreview(false)}
        title={t("owner.preview_title")}
        testId="owner-preview"
        footer={
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={!total || ui.busy || status !== "owner"}
            onClick={() => void send()}
            data-testid="owner-send-confirm"
          >
            {total ? plural("owner.send_n", total) : t("owner.nothing_to_send")}
          </button>
        }
      >
        <Group footer={t("owner.preview_footer")}>
          {ORDER.filter((g) => ui.existing[g]).map((g) => (
            <Row
              key={g}
              label={t(GROUP_LABEL[g])}
              value={<span data-testid={`owner-count-${g}`}>{ui.existing[g]}</span>}
            />
          ))}
          {!total && <Row label={t("owner.nothing_to_send")} />}
        </Group>
      </Sheet>
    </div>
  );
}
