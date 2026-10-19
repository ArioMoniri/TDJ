"use client";
import { LoaderCircle, MessageCircleMore } from "lucide-react";
import { useState } from "react";
import { FEEDBACK_CHIPS } from "@/lib/feedback";
import type { Feedback } from "@/lib/types";

/** After a set: one-tap adjustments and a free-text line to the DJ; both recompose with locked tandas kept. */
export function FeedbackBar({
  onFeedback,
  onRefine,
  busy,
  note,
}: {
  onFeedback: (f: Feedback) => void;
  onRefine: (text: string) => void;
  busy: boolean;
  note: string | null;
}) {
  const [text, setText] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    onRefine(text.trim());
    setText("");
  };
  return (
    <section className="surface p-5 sm:p-6" aria-label="Adjust the set">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">Not quite right?</h3>
        <span className="text-muted text-xs">Locked tandas stay where they are</span>
      </div>
      <div className="chip-row scroll-x mt-2">
        {FEEDBACK_CHIPS.map(([k, l]) => (
          <button type="button" key={k} className="chip" disabled={busy} onClick={() => onFeedback(k)}>
            {l}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <label htmlFor="tell-dj" className="sr-only">
          Tell the DJ
        </label>
        <input
          id="tell-dj"
          className="field"
          placeholder="Tell the DJ… e.g. warmer start, more vals, no Canaro"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={600}
          autoComplete="off"
        />
        <button type="submit" className="btn btn-ghost shrink-0" disabled={busy || !text.trim()}>
          {busy ? <LoaderCircle size={16} className="animate-spin" /> : <MessageCircleMore size={16} />}
          <span className="hidden sm:inline">Apply</span>
        </button>
      </form>
      <p className="text-muted mt-2 min-h-5 text-xs" aria-live="polite">
        {note ?? ""}
      </p>
    </section>
  );
}
