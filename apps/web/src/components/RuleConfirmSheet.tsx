"use client";
import { Check, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { answer, factText, suggestionText, useRuleAsk, violationTitle } from "@/lib/ruleCheck";
import type { Song } from "@/lib/types";
import { Group } from "./Form";
import { Sheet } from "./Sheet";
import { PlayButton } from "./ui/SongRow";

/**
 * The rule check's confirm sheet (lib/ruleCheck.ts gateEdit), mounted once in the layout: "This breaks a tanda rule",
 * one plain line per violation with its facts, up to three suggestions (each with a play button where the side has a
 * stream or a clip), and the DJ's choice — "Use suggestion", "Do it as I said" (this night only) or Cancel. Opened
 * from a soft toast's "See suggestion", it offers the suggestion and "Keep as is". Glass only on the sheet; every
 * control ≥ 44 px.
 */
export function RuleConfirmSheet() {
  const ask = useRuleAsk((s) => s.ask);
  const [picked, setPicked] = useState(0);
  // a new question starts on its first suggestion
  const id = ask?.id;
  useEffect(() => {
    if (id !== undefined) setPicked(0);
  }, [id]);
  const open = !!ask;
  const hard = ask?.mode !== "soft";
  const sug = ask?.suggestions ?? [];
  const chosen = sug[Math.min(picked, Math.max(0, sug.length - 1))];
  return (
    <Sheet
      open={open}
      onClose={() => answer({ kind: "cancel" })}
      title={hard ? t("ruleCheck.title_hard") : t("ruleCheck.title_soft")}
      detents={["large"]}
      testId="rule-sheet"
      footer={
        ask && (
          <div className="grid gap-2 px-4 pt-2 pb-3">
            <button
              type="button"
              className="btn btn-primary min-h-11 w-full"
              disabled={!chosen}
              data-testid="rule-use-suggestion"
              onClick={() => {
                if (!chosen) return;
                haptic(8);
                answer({ kind: "suggestion", playlist: chosen.playlist });
              }}
            >
              {t("ruleCheck.use_suggestion")}
            </button>
            {hard ? (
              <button
                type="button"
                className="btn btn-ghost min-h-11 w-full flex-col gap-0 py-1"
                data-testid="rule-as-said"
                onClick={() => answer({ kind: "asSaid" })}
              >
                <span>{t("ruleCheck.do_it_as_i_said")}</span>
                <span className="text-caption1 text-[var(--label-2)]">{t("ruleCheck.this_night_only")}</span>
              </button>
            ) : null}
            <button
              type="button"
              className="btn-plain min-h-11 w-full"
              data-testid="rule-cancel"
              onClick={() => answer({ kind: "cancel" })}
            >
              {hard ? t("ruleCheck.cancel") : t("ruleCheck.keep_as_is")}
            </button>
          </div>
        )
      }
    >
      {ask && (
        <>
          <Group
            header={hard ? t("ruleCheck.what_it_breaks") : t("ruleCheck.what_it_changes")}
            data-testid="rule-violations"
          >
            {ask.violations.map((v) => (
              <div
                key={`${v.rule}-${v.tanda}-${v.text}`}
                className="cell flex-col items-start gap-0.5 py-2.5"
                data-testid="rule-violation"
                data-rule={v.rule}
              >
                <span className="text-headline">{violationTitle(v)}</span>
                {v.facts.map((f) => (
                  <span key={f.text} className="text-subhead text-[var(--label-2)]" data-testid="rule-fact">
                    {factText(f)}
                  </span>
                ))}
              </div>
            ))}
          </Group>
          <Group
            header={t("ruleCheck.suggestions")}
            footer={hard ? t("ruleCheck.footer_hard") : t("ruleCheck.footer_soft")}
            data-testid="rule-suggestions"
          >
            {ask.loading && !sug.length ? (
              <div className="cell text-[var(--label-2)]" role="status">
                <LoaderCircle size={18} className="animate-spin" aria-hidden />
                {t("ruleCheck.looking_for_suggestions")}
              </div>
            ) : sug.length ? (
              <fieldset className="m-0 border-0 p-0">
                <legend className="sr-only">{t("ruleCheck.suggestions")}</legend>
                {sug.map((s, k) => {
                  const on = s === chosen;
                  return (
                    <div key={s.id} className="cell gap-1 py-1" data-testid="rule-suggestion">
                      <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="radio"
                          name="rule-suggestion"
                          className="sr-only"
                          checked={on}
                          onChange={() => setPicked(k)}
                        />
                        <span
                          className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${on ? "border-[var(--tint)] bg-[var(--tint)] text-white" : "border-[var(--separator)]"}`}
                          aria-hidden
                        >
                          {on && <Check size={14} strokeWidth={3} />}
                        </span>
                        <span className="text-body min-w-0">{suggestionText(s)}</span>
                      </label>
                      {s.song && (s.song.spotify?.uri || s.song.resolved?.previewUrl) && (
                        <PlayButton song={s.song as unknown as Song} />
                      )}
                    </div>
                  );
                })}
              </fieldset>
            ) : (
              <div className="cell text-[var(--label-2)]">{t("ruleCheck.no_suggestion")}</div>
            )}
          </Group>
        </>
      )}
    </Sheet>
  );
}
