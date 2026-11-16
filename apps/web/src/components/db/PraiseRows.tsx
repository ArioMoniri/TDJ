"use client";
import type { TandaPraise } from "@tdj/core";
import { Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";
import { Group } from "../Form";
import { SwipeRow } from "../SwipeRow";
import { Tip } from "../ui/Tip";

/**
 * 2026-11 — Database → Memory → "Praised by you": the tandas the DJ praised (the featured night's store, or the DJ's
 * memory), each with the DJ's words and what it means — feedback that the tanda was great, counted as a ♥ for its
 * songs — and delete (swipe or the bin, 44 pt).
 */
export function PraiseRows({
  praise,
  onForget,
  testId,
}: {
  praise: TandaPraise[];
  onForget: (id: string) => void;
  testId: string;
}) {
  if (!praise.length) return null;
  return (
    <Group header={t("praise.header")} footer={t("praise.footer")} data-testid={testId}>
      {praise.map((p) => {
        const label = p.note ? `${p.reason} · ${p.note}` : p.reason;
        return (
          <SwipeRow
            key={p.id}
            actions={[{ kind: "destructive", label: "Delete", icon: Trash2, onClick: () => onForget(p.id) }]}
          >
            <div className="cell" data-testid="praise-row" data-praise={p.id}>
              <span className="min-w-0 flex-1 overflow-hidden py-1">
                <span className="line-clamp-3 block min-w-0 break-words" data-testid="praise-reason">
                  “{label}”
                </span>
                {p.name && (
                  <span className="text-footnote block truncate text-[var(--label-2)]">{p.name}</span>
                )}
                <span className="text-footnote block text-[var(--label-2)]" data-testid="praise-feedback">
                  {t("praise.feedback")}
                </span>
              </span>
              <Tip text={t("praise.delete_tip")} className="-mr-2 shrink-0">
                <button
                  type="button"
                  className="icon-btn icon-btn-bare h-11 w-11 shrink-0 text-[var(--destructive)]"
                  onClick={() => onForget(p.id)}
                  aria-label={t("praise.delete", { label })}
                  data-testid="praise-delete"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </Tip>
            </div>
          </SwipeRow>
        );
      })}
    </Group>
  );
}
