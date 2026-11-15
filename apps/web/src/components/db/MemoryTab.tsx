"use client";
import { addNote } from "@tdj/core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { fmtDate, fmtTime, t } from "@/lib/i18n";
import { describePreferences } from "@/lib/memory";
import { useStore } from "@/lib/store";
import type { AgentMemory } from "@/lib/types";
import { ActionRow, Group, Row } from "../Form";
import { ExceptionRow } from "../NightExceptions";
import { Sheet } from "../Sheet";
import { SwipeRow } from "../SwipeRow";
import { DancerFavourites } from "./DancerFavourites";
import { FeaturedLearned } from "./FeaturedLearned";
import { LearnedRules } from "./LearnedRules";
import { useDbEdit } from "./shared";

/**
 * The DJ's one-night exceptions ("Do it as I said"), night by night: each counts for its own night only and never
 * becomes a rule or a template; each can be removed.
 */
function MyNightExceptions() {
  const learned = useStore((s) => s.memory.learned);
  const history = useStore((s) => s.history);
  const mine = (learned?.night?.exceptions ?? []).filter((x) => x.source === "dj");
  if (!mine.length) return null;
  const nights = [...new Set(mine.map((x) => x.nightId))];
  const nameOf = (id: string) =>
    history.find((h) => h.playlist?.id === id)?.title ??
    (useStore.getState().playlist?.id === id ? useStore.getState().playlist?.name : undefined) ??
    id;
  return (
    <Group
      header={t("ruleCheck.memory_header")}
      footer={t("ruleCheck.memory_footer")}
      data-testid="memory-night-exceptions"
    >
      {nights.map((id) => (
        <div key={id}>
          <div className="cell text-footnote font-semibold text-[var(--label-2)]">
            {t("ruleCheck.memory_night", { name: nameOf(id) })}
          </div>
          {mine
            .filter((x) => x.nightId === id)
            .map((x) => (
              <ExceptionRow key={`${x.nightId}-${x.tandaId}`} x={x} />
            ))}
        </div>
      ))}
    </Group>
  );
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : fmtDate(d, { month: "short", day: "numeric" }) +
        " " +
        fmtTime(d, { hour: "2-digit", minute: "2-digit" });
};
const PREF_LABEL: Record<string, string> = {
  get floorMood() {
    return t("db.memoryTab.floor_mood");
  },
  get pattern() {
    return t("db.memoryTab.cycle");
  },
  get customPattern() {
    return t("db.memoryTab.custom_cycle");
  },
  get cortinaLengthSec() {
    return t("db.memoryTab.cortina_length");
  },
  get excludeOrchestras() {
    return t("db.memoryTab.orchestras_left_out");
  },
  get includeOrchestras() {
    return t("db.memoryTab.orchestras_preferred");
  },
  get eras() {
    return t("db.memoryTab.era");
  },
  get tandaShape() {
    return t("db.memoryTab.shape_inside_a_tanda");
  },
  get arc() {
    return t("db.memoryTab.arc");
  },
  get cortinaStyle() {
    return t("db.memoryTab.cortina_style");
  },
  get cortinaCultures() {
    return t("db.memoryTab.cortina_cultures");
  },
  get cortinaTrend() {
    return t("db.memoryTab.cortina_flavour");
  },
  get rules() {
    return t("db.memoryTab.night_rules");
  },
  get context() {
    return t("db.memoryTab.tonight");
  },
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
        {t("db.memoryTab.forget_2")}
      </button>
    ) : null;
  const swipe = (onClick: () => void) => [
    { kind: "destructive" as const, label: t("db.memoryTab.forget_2"), icon: Trash2, onClick },
  ];

  return (
    <div>
      <DancerFavourites />
      <LearnedRules />
      <MyNightExceptions />
      <FeaturedLearned />
      <Group
        header={t("db.memoryTab.notes")}
        footer={t("db.memoryTab.things_to_remember_about_rooms_crowds")}
        data-testid="memory-notes"
      >
        {memory.notes.map((n) => (
          <SwipeRow key={n.at} actions={swipe(() => forgetNote(n.at))}>
            <Row
              label={n.text}
              sub={`${n.source === "dj" ? t("db.memoryTab.you") : t("db.memoryTab.assistant")} · ${when(n.at)}`}
              chevron={!editing}
              onClick={editing ? undefined : () => setNoteOpen({ at: n.at, text: n.text })}
            >
              {forgetButton(t("db.memoryTab.forget_note", { p1: n.text.slice(0, 20) }), () =>
                forgetNote(n.at),
              )}
            </Row>
          </SwipeRow>
        ))}
        <ActionRow
          label={t("db.memoryTab.add_a_note")}
          tip={t("db.memoryTab.write_something_the_assistant_should_always")}
          onClick={() => setNoteOpen({ text: "" })}
        />
      </Group>

      <Group
        header={t("db.memoryTab.learned_preferences")}
        footer={
          settings.learn
            ? learned.length
              ? t("db.memoryTab.applied_under_tonight_s_explicit_choices", { learned: learned.join(", ") })
              : t("db.memoryTab.repeated_feedback_becomes_a_preference_three")
            : t("db.memoryTab.learning_is_off_in_settings_memory")
        }
      >
        {prefs.length === 0 && (
          <div className="cell text-[var(--label-2)]">{t("db.memoryTab.nothing_learned_yet")}</div>
        )}
        {prefs.map(([k, v]) => (
          <SwipeRow key={k} actions={swipe(() => forgetPref(k))}>
            <Row label={PREF_LABEL[k] ?? k} value={fmt(v)}>
              {forgetButton(t("db.memoryTab.forget", { p1: PREF_LABEL[k] ?? k }), () => forgetPref(k))}
            </Row>
          </SwipeRow>
        ))}
      </Group>

      <Group header={t("db.memoryTab.sets")} footer={t("db.memoryTab.the_last_50_sets_you_composed")}>
        {memory.sets.length === 0 && (
          <div className="cell text-[var(--label-2)]">{t("db.memoryTab.no_sets_yet")}</div>
        )}
        {memory.sets.map((s) => (
          <SwipeRow key={s.id} actions={swipe(() => forgetSet(s.id))}>
            <Row
              label={s.name}
              sub={`${when(s.at)} · ${s.hours} h · ${s.eras.join(", ")}${s.context?.event ? ` · ${s.context.event}` : ""}`}
              value={`${s.score}${s.liked === true ? t("db.memoryTab.liked") : s.liked === false ? t("db.memoryTab.disliked") : ""}`}
            >
              {forgetButton(t("db.memoryTab.forget_set", { name: s.name }), () => forgetSet(s.id))}
            </Row>
          </SwipeRow>
        ))}
      </Group>

      <Group header={t("db.memoryTab.feedback")} footer={t("db.memoryTab.chips_and_tell_the_dj_requests")}>
        {memory.feedbackHistory.length === 0 && (
          <div className="cell text-[var(--label-2)]">{t("db.memoryTab.no_feedback_yet")}</div>
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
              {forgetButton(t("db.memoryTab.forget_feedback_from", { p1: when(f.at) }), () =>
                forgetFeedback(f.at),
              )}
            </Row>
          </SwipeRow>
        ))}
      </Group>

      <Group>
        <ActionRow
          label={t("db.memoryTab.clear_memory")}
          tip={t("db.memoryTab.remove_notes_past_sets_feedback_and")}
          destructive
          onClick={() => setConfirmClear(true)}
        />
      </Group>

      <Sheet
        open={!!noteOpen}
        onClose={() => setNoteOpen(null)}
        title={noteOpen?.at ? t("db.memoryTab.edit_note") : t("db.memoryTab.new_note")}
        trailing={t("db.memoryTab.save")}
        onTrailing={saveNote}
      >
        <Group footer={t("db.memoryTab.one_line_is_enough_thursday_crowd")}>
          <label htmlFor="memory-note" className="cell">
            <span className="sr-only">{t("db.memoryTab.note")}</span>
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
              label={t("db.memoryTab.forget_this_note")}
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
        title={t("db.memoryTab.clear_memory")}
        detents={["medium"]}
      >
        <Group footer={t("db.memoryTab.notes_sets_feedback_and_learned_preferences")}>
          <ActionRow
            label={t("db.memoryTab.clear_everything")}
            destructive
            onClick={async () => {
              await clearMemory();
              setConfirmClear(false);
            }}
          />
          <ActionRow label={t("db.memoryTab.cancel")} onClick={() => setConfirmClear(false)} />
        </Group>
      </Sheet>
    </div>
  );
}
