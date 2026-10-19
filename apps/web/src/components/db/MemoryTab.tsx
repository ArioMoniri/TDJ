"use client";
import { addNote } from "@tdj/core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { describePreferences } from "@/lib/memory";
import { useStore } from "@/lib/store";
import type { AgentMemory } from "@/lib/types";
import { ActionRow, Group, Row } from "../Form";
import { Sheet } from "../Sheet";
import { SwipeRow } from "../SwipeRow";
import { useDbEdit } from "./shared";

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
        " " +
        d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};
const PREF_LABEL: Record<string, string> = {
  floorMood: "Floor mood",
  pattern: "Cycle",
  customPattern: "Custom cycle",
  cortinaLengthSec: "Cortina length",
  excludeOrchestras: "Orchestras left out",
  includeOrchestras: "Orchestras preferred",
  eras: "Era",
  tandaShape: "Shape inside a tanda",
  arc: "Arc",
  cortinaStyle: "Cortina style",
  cortinaCultures: "Cortina cultures",
  cortinaTrend: "Cortina flavour",
  rules: "Night rules",
  context: "Tonight",
};
const fmt = (v: unknown) =>
  Array.isArray(v)
    ? v.length
      ? v.join(", ")
      : "none"
    : typeof v === "object" && v
      ? JSON.stringify(v)
      : String(v);

/** What the agents remember: notes, set history, feedback history and learned preferences, each forgettable. */
export function MemoryTab() {
  const { memory, updateMemory, clearMemory, settings } = useStore();
  const editing = useDbEdit();
  const [noteOpen, setNoteOpen] = useState<{ at?: string; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const forgetNote = (at: string) =>
    updateMemory((m) => ({ ...m, notes: m.notes.filter((n) => n.at !== at) }));
  const forgetSet = (id: string) => updateMemory((m) => ({ ...m, sets: m.sets.filter((s) => s.id !== id) }));
  const forgetFeedback = (at: string) =>
    updateMemory((m) => ({ ...m, feedbackHistory: m.feedbackHistory.filter((f) => f.at !== at) }));
  const forgetPref = (k: string) =>
    updateMemory((m) => {
      const prefs = { ...m.preferences } as Record<string, unknown>;
      delete prefs[k];
      return { ...m, preferences: prefs as AgentMemory["preferences"], updatedAt: new Date().toISOString() };
    });
  const saveNote = () => {
    const text = noteOpen?.text.trim();
    if (!text) return;
    updateMemory((m) => {
      if (noteOpen?.at) {
        return {
          ...m,
          notes: m.notes.map((n) => (n.at === noteOpen.at ? { ...n, text } : n)),
          updatedAt: new Date().toISOString(),
        };
      }
      return addNote(m, text, "dj");
    });
    setNoteOpen(null);
  };
  const prefs = Object.entries(memory.preferences ?? {});
  const learned = describePreferences(memory);
  const forgetButton = (label: string, onClick: () => void) =>
    editing ? (
      <button
        type="button"
        className="btn-plain text-[var(--destructive)]"
        aria-label={label}
        onClick={onClick}
      >
        Forget
      </button>
    ) : null;
  const swipe = (onClick: () => void) => [
    { kind: "destructive" as const, label: "Forget", icon: Trash2, onClick },
  ];

  return (
    <div>
      <Group
        header="Notes"
        footer="Things to remember about rooms, crowds and what worked. The assistant reads these before a review or a refine."
        data-testid="memory-notes"
      >
        {memory.notes.map((n) => (
          <SwipeRow key={n.at} actions={swipe(() => forgetNote(n.at))}>
            <Row
              label={n.text}
              sub={`${n.source === "dj" ? "You" : "Assistant"} · ${when(n.at)}`}
              chevron={!editing}
              onClick={editing ? undefined : () => setNoteOpen({ at: n.at, text: n.text })}
            >
              {forgetButton(`Forget note ${n.text.slice(0, 20)}`, () => forgetNote(n.at))}
            </Row>
          </SwipeRow>
        ))}
        <ActionRow label="Add a note…" onClick={() => setNoteOpen({ text: "" })} />
      </Group>

      <Group
        header="Learned preferences"
        footer={
          settings.learn
            ? learned.length
              ? `Applied under tonight's explicit choices: ${learned.join(", ")}.`
              : "Repeated feedback becomes a preference: three times “more energetic”, twice “shorter cortinas”."
            : "Learning is off in Settings → Memory; nothing here is applied."
        }
      >
        {prefs.length === 0 && <div className="cell text-[var(--label-2)]">Nothing learned yet.</div>}
        {prefs.map(([k, v]) => (
          <SwipeRow key={k} actions={swipe(() => forgetPref(k))}>
            <Row label={PREF_LABEL[k] ?? k} value={fmt(v)}>
              {forgetButton(`Forget ${PREF_LABEL[k] ?? k}`, () => forgetPref(k))}
            </Row>
          </SwipeRow>
        ))}
      </Group>

      <Group
        header="Sets"
        footer="The last 50 sets you composed. Thumbs on the result mark a set as liked or not."
      >
        {memory.sets.length === 0 && <div className="cell text-[var(--label-2)]">No sets yet.</div>}
        {memory.sets.map((s) => (
          <SwipeRow key={s.id} actions={swipe(() => forgetSet(s.id))}>
            <Row
              label={s.name}
              sub={`${when(s.at)} · ${s.hours} h · ${s.eras.join(", ")}${s.context?.event ? ` · ${s.context.event}` : ""}`}
              value={`${s.score}${s.liked === true ? " · liked" : s.liked === false ? " · disliked" : ""}`}
            >
              {forgetButton(`Forget set ${s.name}`, () => forgetSet(s.id))}
            </Row>
          </SwipeRow>
        ))}
      </Group>

      <Group header="Feedback" footer="Chips and “Tell the DJ” requests, newest first.">
        {memory.feedbackHistory.length === 0 && (
          <div className="cell text-[var(--label-2)]">No feedback yet.</div>
        )}
        {memory.feedbackHistory.map((f) => (
          <SwipeRow key={f.at} actions={swipe(() => forgetFeedback(f.at))}>
            <Row
              label={
                [...f.feedback.map((x) => x.replace(/-/g, " ")), f.instruction].filter(Boolean).join(", ") ||
                "—"
              }
              sub={when(f.at)}
            >
              {forgetButton(`Forget feedback from ${when(f.at)}`, () => forgetFeedback(f.at))}
            </Row>
          </SwipeRow>
        ))}
      </Group>

      <Group>
        <ActionRow label="Clear memory" destructive onClick={() => setConfirmClear(true)} />
      </Group>

      <Sheet
        open={!!noteOpen}
        onClose={() => setNoteOpen(null)}
        title={noteOpen?.at ? "Edit note" : "New note"}
        trailing="Save"
        onTrailing={saveNote}
      >
        <Group footer="One line is enough: “Thursday crowd likes Donato milongas”.">
          <label htmlFor="memory-note" className="cell">
            <span className="sr-only">Note</span>
            <textarea
              id="memory-note"
              className="field min-h-28 py-2"
              value={noteOpen?.text ?? ""}
              onChange={(e) => setNoteOpen((n) => ({ ...(n ?? { text: "" }), text: e.target.value }))}
              maxLength={400}
              data-autofocus
            />
          </label>
        </Group>
        {noteOpen?.at && (
          <Group>
            <ActionRow
              label="Forget this note"
              destructive
              onClick={() => {
                forgetNote(noteOpen.at!);
                setNoteOpen(null);
              }}
            />
          </Group>
        )}
      </Sheet>

      <Sheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear memory"
        detents={["medium"]}
      >
        <Group footer="Notes, sets, feedback and learned preferences are removed. This cannot be undone.">
          <ActionRow
            label="Clear everything"
            destructive
            onClick={async () => {
              await clearMemory();
              setConfirmClear(false);
            }}
          />
          <ActionRow label="Cancel" onClick={() => setConfirmClear(false)} />
        </Group>
      </Sheet>
    </div>
  );
}
