"use client";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { FEEDBACK_CHIPS, FEEDBACK_LABEL } from "@/lib/feedback";
import { t } from "@/lib/i18n";
import type { Feedback } from "@/lib/types";
import { Group } from "./Form";
import { Tip } from "./ui/Tip";

/** After a set: one-tap adjustments (the one chip wall that stays) and a line to the DJ; both recompose with locks kept. */
export function FeedbackBar({
  onFeedback,
  onRefine,
  busy,
  note,
  pending = null,
  lockedCount = 0,
  changeSummary = null,
  bare = false,
}: {
  onFeedback: (f: Feedback) => void;
  onRefine: (text: string) => void;
  busy: boolean;
  note: string | null;
  /** the chip whose adjustment is being applied (stays `chip-on` with a spinner while busy) */
  pending?: Feedback | null;
  lockedCount?: number;
  /** "3 tandas replaced (7, 9, 14) · score 79 → 75" after the last chip or refine */
  changeSummary?: string | null;
  /** inside the phone "Adjust" sheet: the sheet title replaces the group header */
  bare?: boolean;
}) {
  const [text, setText] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    onRefine(text.trim());
    setText("");
  };
  return (
    <Group
      header={bare ? undefined : t("feedbackBar.adjust")}
      footer={
        <span aria-live="polite" className="block min-h-[1.125rem]">
          {note ??
            (lockedCount
              ? t("feedbackBar.locked_where", {
                  lockedCount,
                  p1: lockedCount === 1 ? t("feedbackBar.tanda_stays") : t("feedbackBar.tandas_stay"),
                  p2: lockedCount === 1 ? t("feedbackBar.it_is") : t("feedbackBar.they_are"),
                })
              : t("feedbackBar.tap_a_chip_to_recompose_or"))}
          {changeSummary && (
            <span className="block" data-testid="change-summary">
              {changeSummary}
            </span>
          )}
        </span>
      }
      aria-label={t("feedbackBar.adjust_the_set")}
    >
      <div className="cell flex-wrap gap-2 py-3">
        {FEEDBACK_CHIPS.map(([k, l]) => (
          <Tip
            key={k}
            text={t("feedbackBar.compose_again_with_locked_tandas_stay", { p1: FEEDBACK_LABEL[k] })}
          >
            <motion.button
              type="button"
              className={`chip ${pending === k ? "chip-on" : ""}`}
              disabled={busy}
              whileTap={{ scale: 0.96 }}
              onClick={() => onFeedback(k)}
            >
              {pending === k && <LoaderCircle size={14} className="animate-spin" aria-hidden />} {l}
            </motion.button>
          </Tip>
        ))}
      </div>
      <form onSubmit={submit} className="cell">
        <label htmlFor="tell-dj" className="sr-only">
          {t("feedbackBar.tell_the_dj")}
        </label>
        <Tip text={t("feedbackBar.say_in_your_own_words_what")} className="min-w-0 flex-1">
          <input
            id="tell-dj"
            className="field w-full min-w-0"
            placeholder={t("feedbackBar.tell_the_dj_warmer_start_more")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={600}
            autoComplete="off"
          />
        </Tip>
        <Tip text={t("feedbackBar.compose_again_with_your_words")}>
          <button
            type="submit"
            className="icon-btn icon-btn-send -mr-2"
            disabled={busy || !text.trim()}
            aria-label={t("feedbackBar.apply")}
          >
            {busy ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : (
              <ArrowUp size={18} strokeWidth={2.5} />
            )}
          </button>
        </Tip>
      </form>
    </Group>
  );
}
