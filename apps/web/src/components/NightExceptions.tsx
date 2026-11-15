"use client";
import type { EditRule, NightException } from "@tdj/core";
import { fmtList, type MsgKey, t } from "@/lib/i18n";
import { nightExceptionsOf, removeException } from "@/lib/ruleCheck";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { Group } from "./Form";

/** "one singer, close years": the rules an exception accepted, in the DJ's language */
export const acceptedRules = (x: NightException) =>
  fmtList((x.rules ?? []).map((r) => t(`ruleCheck.label.${r as EditRule}` as MsgKey)));

/** one exception row: the tanda, what it accepted, and Remove */
export function ExceptionRow({ x }: { x: NightException }) {
  return (
    <div className="cell gap-3" data-testid="night-exception">
      <span className="min-w-0 flex-1">
        <span className="text-body block truncate" lang="es">
          {x.name ?? x.titles.join(", ")}
        </span>
        <span className="text-footnote block text-[var(--label-2)]">
          {x.rules?.length ? t("ruleCheck.accepted_rules", { rules: acceptedRules(x) }) : x.reason}
        </span>
      </span>
      <button
        type="button"
        className="btn-plain min-h-11 shrink-0 text-[var(--destructive)]"
        aria-label={t("ruleCheck.remove_label", { name: x.name ?? x.titles.join(", ") })}
        data-testid="night-exception-remove"
        onClick={() => {
          removeException(x);
          toast(t("ruleCheck.exception_removed"));
        }}
      >
        {t("ruleCheck.remove")}
      </button>
    </div>
  );
}

/**
 * The night's panel: "Accepted by you (this night)" — the tandas the DJ kept as they are against a rule ("Do it as I
 * said"), which the strict panel and the score breakdown accept for this night only. Each one can be removed.
 */
export function NightExceptions({ nightId }: { nightId: string | undefined }) {
  const learned = useStore((s) => s.memory.learned);
  const list = nightExceptionsOf(learned, nightId).filter((x) => x.source === "dj");
  if (!list.length) return null;
  return (
    <Group
      header={t("ruleCheck.accepted_header")}
      footer={t("ruleCheck.accepted_footer")}
      data-testid="night-exceptions"
    >
      {list.map((x) => (
        <ExceptionRow key={`${x.nightId}-${x.tandaId}`} x={x} />
      ))}
    </Group>
  );
}
