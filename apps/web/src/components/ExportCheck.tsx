"use client";
import type { CheckView, Mark } from "@/lib/exportCheckView";
import { t } from "@/lib/i18n";
import { ActionRow, Group } from "./Form";

const MARK_KEY: Record<Mark, Parameters<typeof t>[0]> = {
  ok: "exportCheck.mark_ok",
  missing: "exportCheck.mark_missing",
  unavailable: "exportCheck.mark_unavailable",
  replaced: "exportCheck.mark_replaced",
  moved: "exportCheck.mark_moved",
  extra: "exportCheck.mark_extra",
};
const MARK_COLOR: Record<Mark, string> = {
  ok: "text-[var(--green,#34c759)]",
  replaced: "text-[var(--label-2)]",
  missing: "text-[var(--destructive)]",
  unavailable: "text-[var(--destructive)]",
  moved: "text-[var(--destructive)]",
  extra: "text-[var(--destructive)]",
};

/**
 * The verified result of one export target (lib/exportCheckView.ts): the summary, what is wrong in plain words,
 * "Fix in …" when writing again can put it right, and the playlist as the target holds it, row by row.
 */
export function ExportCheck({
  view,
  onFix,
  fixing,
  id,
}: {
  view: CheckView;
  onFix?: () => void;
  fixing?: boolean;
  id: string;
}) {
  return (
    <Group>
      <div
        className="cell flex-col items-stretch gap-1"
        data-testid={id}
        data-ok={view.ok ? "true" : "false"}
      >
        <p
          className={`text-subhead ${view.ok ? "" : "text-[var(--destructive)]"}`}
          data-testid={`${id}-summary`}
        >
          {view.summary}
        </p>
        {view.lines.length > 0 && (
          <ul className="text-footnote text-[var(--label-2)]" data-testid={`${id}-lines`}>
            {view.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </div>
      {onFix && view.fixable && (
        <ActionRow
          label={fixing ? t("exportCheck.fixing") : t("exportCheck.fix", { target: view.target })}
          onClick={onFix}
          busy={fixing}
          id={`${id}-fix`}
        />
      )}
      {view.rows.length > 0 && (
        <details className="cell flex-col items-stretch" data-testid={`${id}-list`}>
          <summary className="flex min-h-[44px] cursor-pointer items-center text-[var(--tint)]">
            {t("exportCheck.show_list", { target: view.target })}
          </summary>
          <ol className="text-footnote mt-1 flex flex-col gap-1">
            {view.rows.map((r) => (
              <li
                key={`${r.pos}-${r.mark}-${r.title}`}
                className="grid grid-cols-[2.5rem_1fr_auto] gap-2"
                data-mark={r.mark}
              >
                <span className="text-[var(--label-3)] tabular-nums">{r.pos}</span>
                <span className="min-w-0">
                  <span className="block truncate">{r.title}</span>
                  <span className="block truncate text-[var(--label-2)]">
                    {r.artist}
                    {r.slot ? ` · ${r.slot}` : ""}
                  </span>
                </span>
                <span className={MARK_COLOR[r.mark]}>{t(MARK_KEY[r.mark])}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </Group>
  );
}
