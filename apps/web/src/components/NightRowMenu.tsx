"use client";
import { Pencil, Play, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef } from "react";
import { t } from "@/lib/i18n";
import { askRename, playInBooth, reopenNight } from "@/lib/nightActions";
import { askDeleteNights, deleteLabel, isFeaturedEntry, protectedReason } from "@/lib/nightDelete";
import type { HistorySnapshot } from "@/lib/types";
import { Menu, type MenuItem } from "./Menu";

/**
 * 2026-11 (the owner: "rename and delete everywhere"; "you can't select which night to play in the Booth, or from
 * History"): one menu for a night, wherever it is listed (History's rows, the sidebar's Recent nights): Play in the
 * Booth, Reopen in Compose, Rename…, Delete (the featured night: Remove from recents, never renamed; the night the
 * Booth has open: Delete disabled, with the reason).
 */
export function useNightMenuItems() {
  const router = useRouter();
  return (s: HistorySnapshot, o: { before?: () => void } = {}): MenuItem[] => {
    const why = protectedReason(s);
    const featured = isFeaturedEntry(s);
    const items: Array<MenuItem | false> = [
      {
        label: t("history.play_the_night"),
        icon: Play,
        testId: "night-menu-play",
        onClick: () => {
          o.before?.();
          void playInBooth(s.playlist, { historyId: s.id, go: () => router.push("/booth") });
        },
      },
      {
        label: t("history.reopen_in_compose"),
        icon: RotateCcw,
        testId: "night-menu-reopen",
        onClick: () => {
          o.before?.();
          reopenNight(s);
          router.push("/#result");
        },
      },
      !featured && {
        label: t("history.rename_2"),
        icon: Pencil,
        testId: "night-menu-rename",
        onClick: () => askRename(s.id),
      },
      {
        label: deleteLabel(s),
        icon: Trash2,
        destructive: true,
        disabled: !!why,
        subtitle: why ?? undefined,
        testId: "night-menu-delete",
        onClick: () => askDeleteNights([s.id]),
      },
    ];
    return items.filter(Boolean) as MenuItem[];
  };
}

/**
 * A night's row with its "•••" (on hover devices it shows on hover and focus; touch keeps it shown) and the same menu
 * on right-click or a long press of the row.
 */
export function NightRowMenu({
  entry,
  children,
  className = "",
  menuClassName = "",
  before,
}: {
  entry: HistorySnapshot;
  children: ReactNode;
  className?: string;
  menuClassName?: string;
  before?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const items = useNightMenuItems();
  return (
    <div ref={ref} className={`night-row-menu flex min-w-0 items-center ${className}`}>
      <div className="min-w-0 flex-1">{children}</div>
      <Menu
        label={t("nights.actions_of", { title: entry.title })}
        tip={t("nights.actions")}
        className={`night-row-more ${menuClassName}`}
        contextRef={ref}
        items={items(entry, { before })}
      />
    </div>
  );
}
