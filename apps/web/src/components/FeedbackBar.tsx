"use client";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { FEEDBACK_CHIPS } from "@/lib/feedback";
import type { Feedback } from "@/lib/types";
import { Group } from "./Form";

/** After a set: one-tap adjustments (the one chip wall that stays) and a line to the DJ; both recompose with locks kept. */
export function FeedbackBar({
  onFeedback,
  onRefine,
  busy,
  note,
  pending = null,
  lockedCount = 0,
  changeSummary = null,
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
      header="Adjust"
      footer={
        <span aria-live="polite" className="block min-h-[1.125rem]">
          {note ??
            (lockedCount
              ? `${lockedCount} locked ${lockedCount === 1 ? "tanda stays" : "tandas stay"} where ${lockedCount === 1 ? "it is" : "they are"}.`
              : "Tap a chip to recompose, or lock tandas you want to keep.")}
          {changeSummary && (
            <span className="block" data-testid="change-summary">
              {changeSummary}
            </span>
          )}
        </span>
      }
      aria-label="Adjust the set"
    >
      <div className="cell flex-wrap gap-2 py-3">
        {FEEDBACK_CHIPS.map(([k, l]) => (
          <motion.button
            type="button"
            key={k}
            className={`chip ${pending === k ? "chip-on" : ""}`}
            disabled={busy}
            whileTap={{ scale: 0.96 }}
            onClick={() => onFeedback(k)}
          >
            {pending === k && <LoaderCircle size={14} className="animate-spin" aria-hidden />} {l}
          </motion.button>
        ))}
      </div>
      <form onSubmit={submit} className="cell">
        <label htmlFor="tell-dj" className="sr-only">
          Tell the DJ
        </label>
        <input
          id="tell-dj"
          className="field min-w-0 flex-1"
          placeholder="Tell the DJ: warmer start, more vals, no Canaro"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={600}
          autoComplete="off"
        />
        <button
          type="submit"
          className="icon-btn icon-btn-send -mr-2"
          disabled={busy || !text.trim()}
          aria-label="Apply"
        >
          {busy ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <ArrowUp size={18} strokeWidth={2.5} />
          )}
        </button>
      </form>
    </Group>
  );
}
