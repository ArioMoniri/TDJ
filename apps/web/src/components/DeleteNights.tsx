"use client";
import "./delete-nights.css";
import { useEffect, useMemo } from "react";
import { APP } from "@/lib/app/target";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import {
  closeDeleteNights,
  deleteNights,
  deletePlan,
  isFeaturedEntry,
  onDropCovers,
  useNightDelete,
} from "@/lib/nightDelete";
import { useStore } from "@/lib/store";
import { ActionRow, Group, Row } from "./Form";
import { forgetCovers, NightCover } from "./NightCover";
import { Sheet } from "./Sheet";

/**
 * 2026-11 — the one confirm for deleting nights (the sidebar's Recent nights, History's rows, its Edit selection and
 * "Clear all…"): what goes, what stays and why (the night the Booth has open), asked once; Delete removes them with
 * an Undo (lib/nightDelete.ts). Mounted once in the layout.
 */
export function DeleteNights() {
  const ask = useNightDelete((s) => s.ask);
  const history = useStore((s) => s.history);
  const synced = useStore((s) => s.storageMode === "server") && !APP;
  useEffect(() => onDropCovers(forgetCovers), []);
  const plan = useMemo(() => (ask ? deletePlan(history, ask.ids) : null), [ask, history]);
  const go = plan?.go ?? [];
  const kept = plan?.kept ?? [];
  const featuredOnly = go.length === 1 && isFeaturedEntry(go[0]!);
  const title = !ask
    ? ""
    : ask.all
      ? t("nightDelete.clear_all_title")
      : go.length === 1
        ? featuredOnly
          ? t("nightDelete.remove_title", { title: go[0]!.title })
          : t("nightDelete.delete_title", { title: go[0]!.title })
        : go.length
          ? t("nightDelete.delete_n_title", { n: go.length })
          : t("nightDelete.cannot_title");
  const confirm = () => {
    if (!ask) return;
    haptic(10);
    const ids = go.map((h) => h.id);
    closeDeleteNights();
    deleteNights(ids);
  };
  return (
    <Sheet
      open={!!ask}
      onClose={closeDeleteNights}
      title={title}
      detents={["medium", "large"]}
      testId="delete-nights"
    >
      {ask && (
        <>
          {go.length > 0 && (
            <Group
              footer={
                featuredOnly
                  ? t("nightDelete.remove_footer")
                  : synced
                    ? t("nightDelete.footer_synced")
                    : t("nightDelete.footer_device")
              }
              data-testid="delete-nights-list"
            >
              {go.slice(0, 6).map((h) => (
                <Row
                  key={h.id}
                  tile={
                    <NightCover
                      night={h.playlist}
                      coverSeed={h.coverSeed}
                      size={44}
                      className="rounded-[8px]"
                    />
                  }
                  label={h.title}
                  sub={t("nightPicker.tandas", { n: h.playlist.tandas.length })}
                />
              ))}
              {go.length > 6 && <Row label={t("nightDelete.and_more", { n: go.length - 6 })} />}
              <ActionRow
                label={
                  featuredOnly
                    ? t("nightDelete.remove_from_recents")
                    : go.length === 1
                      ? t("nightDelete.delete_one")
                      : t("nightDelete.delete_n", { n: go.length })
                }
                destructive
                onClick={confirm}
                id="delete-nights-confirm"
              />
            </Group>
          )}
          {kept.length > 0 && (
            <Group header={t("nightDelete.kept_header")} data-testid="delete-nights-kept">
              {kept.map(({ entry, why }) => (
                <Row key={entry.id} label={entry.title} sub={why} />
              ))}
            </Group>
          )}
        </>
      )}
    </Sheet>
  );
}
