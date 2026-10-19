"use client";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { HOUSE_RULES_MAX } from "@/lib/types";
import { ActionRow, Group } from "./Form";
import { PageHeader } from "./PageHeader";
import { Sheet } from "./Sheet";

export interface GuideSection {
  id: string;
  title: string;
  text: string;
}

/**
 * The Guide's prose with an Edit mode: each section's text opens in a sheet with a textarea and is stored in the
 * user's database under `guide[sectionId]`; "Reset section" restores the built-in text. A "House rules" section
 * (free text, ≤ 2000 chars) is appended to the written-review and Tell-the-DJ prompts.
 */
export function GuideSections({
  sections,
  editing,
  header,
  className = "",
}: {
  sections: GuideSection[];
  editing: boolean;
  header?: string;
  className?: string;
}) {
  const stored = useStore((s) => s.overrides.guide);
  const guide = stored ?? {};
  const updateOverrides = useStore((s) => s.updateOverrides);
  const [open, setOpen] = useState<GuideSection | null>(null);
  const [draft, setDraft] = useState("");
  const textOf = (sec: GuideSection) => guide[sec.id] ?? sec.text;
  const edited = (sec: GuideSection) => typeof guide[sec.id] === "string";
  const begin = (sec: GuideSection) => {
    setDraft(textOf(sec));
    setOpen(sec);
  };
  const save = () => {
    if (!open) return;
    const v = draft.trim();
    updateOverrides((o) => {
      const g = { ...(o.guide ?? {}) };
      if (!v || v === open.text) delete g[open.id];
      else g[open.id] = v.slice(0, open.id === "houseRules" ? HOUSE_RULES_MAX : 4000);
      return { ...o, guide: g };
    });
    toast(v && v !== open.text ? `Saved "${open.title}"` : `"${open.title}" back to the built-in text`);
    setOpen(null);
  };
  const reset = () => {
    if (!open) return;
    updateOverrides((o) => {
      const g = { ...(o.guide ?? {}) };
      delete g[open.id];
      return { ...o, guide: g };
    });
    toast(`"${open.title}" reset`);
    setOpen(null);
  };
  const max = open?.id === "houseRules" ? HOUSE_RULES_MAX : 4000;
  return (
    <>
      <Group header={header} className={className}>
        {sections.map((sec) => {
          const body = (
            <>
              <span className="text-headline flex items-center gap-2">
                {sec.title}
                {edited(sec) && (
                  <span className="text-caption1 rounded-full bg-[color-mix(in_srgb,var(--tint)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--tint)]">
                    edited
                  </span>
                )}
              </span>
              <span
                className="text-body whitespace-pre-wrap text-[var(--label-2)]"
                data-testid={`guide-${sec.id}`}
              >
                {textOf(sec) ||
                  (sec.id === "houseRules"
                    ? "No house rules yet. Tap to write what this DJ always does (the assistant reads them)."
                    : "")}
              </span>
            </>
          );
          return editing ? (
            <button
              key={sec.id}
              type="button"
              className="cell cell-tap w-full flex-col items-stretch gap-1 py-3 text-left"
              onClick={() => begin(sec)}
              aria-label={`Edit ${sec.title}`}
            >
              {body}
            </button>
          ) : (
            <div key={sec.id} className="cell flex-col items-stretch gap-1 py-3">
              {body}
            </div>
          );
        })}
      </Group>
      <Sheet
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.title ?? ""}
        trailing="Save"
        onTrailing={save}
        detents={["large"]}
        testId="guide-edit"
      >
        <Group
          footer={`${draft.length} / ${max} characters.${open?.id === "houseRules" ? " Appended to every written review and Tell-the-DJ request after the built-in DJ rules." : " Replaces the built-in text in your Guide; the engine's rules do not change."}`}
        >
          <label htmlFor="guide-text" className="cell">
            <span className="sr-only">{open?.title}</span>
            <textarea
              id="guide-text"
              className="field min-h-[160px] resize-y leading-[1.4]"
              data-autofocus
              value={draft}
              maxLength={max}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck
            />
          </label>
        </Group>
        {open && edited(open) && (
          <Group>
            <ActionRow label="Reset section" destructive onClick={reset} />
          </Group>
        )}
      </Sheet>
    </>
  );
}

/** Guide page client shell: the large title with its Edit / Done bar button, the editable groups; the context factors stay server-rendered below. */
export function GuideBody({
  title,
  subtitle,
  rows,
  takes,
}: {
  title: string;
  subtitle: string;
  rows: GuideSection[];
  takes: GuideSection[];
}) {
  const [editing, setEditing] = useState(false);
  const changes = useStore(
    (s) => Object.values(s.overrides.guide ?? {}).filter((v) => typeof v === "string" && v.trim()).length,
  );
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        trailing={
          <button
            type="button"
            className={`btn-plain ${editing ? "font-semibold" : ""}`}
            aria-pressed={editing}
            onClick={() => setEditing((v) => !v)}
            data-testid="guide-edit-toggle"
          >
            {editing ? "Done" : changes ? `Edit (${changes})` : "Edit"}
          </button>
        }
      />
      <GuideSections sections={rows} editing={editing} className="mt-6" />
      <h2 className="text-title3 mt-8 px-4">What a great set takes into account</h2>
      <p className="text-subhead mt-1 px-4 text-[var(--label-2)]">
        Five layers, from the notes inside a tanda to the booth.
      </p>
      <GuideSections sections={takes} editing={editing} />
      <GuideSections
        header="House rules"
        sections={[{ id: "houseRules", title: "What this DJ always does", text: "" }]}
        editing={editing}
      />
      <p className="section-foot">
        {editing
          ? "Tap a section to rewrite it. Edits live in your database (Database → changes) and count there."
          : "Edit lets you rewrite any section and add house rules the assistant follows."}
      </p>
    </>
  );
}
