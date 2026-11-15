"use client";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { HOUSE_RULES_MAX } from "@/lib/types";
import { ActionRow, Group } from "./Form";
import { GuideTour } from "./guide/GuideTour";
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
    toast(
      v && v !== open.text
        ? t("guideSections.saved", { title: open.title })
        : t("guideSections.back_to_the_built_in_text", { title: open.title }),
    );
    setOpen(null);
  };
  const reset = () => {
    if (!open) return;
    updateOverrides((o) => {
      const g = { ...(o.guide ?? {}) };
      delete g[open.id];
      return { ...o, guide: g };
    });
    toast(t("guideSections.reset", { title: open.title }));
    setOpen(null);
  };
  const max = open?.id === "houseRules" ? HOUSE_RULES_MAX : 4000;
  return (
    <>
      <Group header={header} className={className} titleHeader>
        {sections.map((sec) => {
          const body = (
            <>
              <span className="text-headline flex items-center gap-2">
                {sec.title}
                {edited(sec) && (
                  <span className="text-caption1 rounded-full bg-[color-mix(in_srgb,var(--tint)_14%,transparent)] px-2 py-0.5 font-medium text-[var(--tint)]">
                    {t("guideSections.edited")}
                  </span>
                )}
              </span>
              <span
                className="text-body whitespace-pre-wrap text-[var(--label-2)]"
                data-testid={`guide-${sec.id}`}
              >
                {textOf(sec) || (sec.id === "houseRules" ? t("guideSections.no_house_rules_yet_tap_to") : "")}
              </span>
            </>
          );
          return editing ? (
            <button
              key={sec.id}
              type="button"
              className="cell cell-tap w-full flex-col items-stretch gap-1 py-3 text-left"
              onClick={() => begin(sec)}
              aria-label={t("guideSections.edit_3", { title: sec.title })}
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
        trailing={t("guideSections.save")}
        onTrailing={save}
        detents={["large"]}
        testId="guide-edit"
      >
        <Group
          footer={`${draft.length} / ${max} characters.${open?.id === "houseRules" ? t("guideSections.appended_to_every_written_review_and") : t("guideSections.replaces_the_built_in_text_in")}`}
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
            <ActionRow label={t("guideSections.reset_section")} destructive onClick={reset} />
          </Group>
        )}
      </Sheet>
    </>
  );
}

/**
 * Guide page client shell: the large title with its Edit / Done bar button, the tour of what T-DJ does (round 22: one
 * chapter per feature, with Lottie loops and drawings), then the editable groups; the context factors stay
 * server-rendered below.
 */
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
            {editing
              ? t("guideSections.done")
              : changes
                ? t("guideSections.edit_2", { changes })
                : t("guideSections.edit")}
          </button>
        }
      />
      <GuideTour />
      <h2 className="text-title3 mt-10 px-4">{t("guideSections.how_a_night_is_composed")}</h2>
      <p className="text-subhead mt-1 px-4 text-[var(--label-2)]">
        {t("guideSections.the_rules_from_working_djs_that")}
      </p>
      <GuideSections sections={rows} editing={editing} className="mt-2" />
      <Link
        href="/#result"
        className="mx-4 mt-1 inline-flex min-h-11 items-center gap-1 text-[var(--tint)]"
        data-testid="guide-score-link"
      >
        {t("guideSections.see_how_your_night_scored")}
        <ChevronRight size={16} strokeWidth={2.25} aria-hidden />
      </Link>
      <h2 className="text-title3 mt-8 px-4">{t("guideSections.what_a_great_set_takes_into")}</h2>
      <p className="text-subhead mt-1 px-4 text-[var(--label-2)]">
        {t("guideSections.five_layers_from_the_notes_inside")}
      </p>
      <GuideSections sections={takes} editing={editing} />
      <GuideSections
        header={t("guideSections.house_rules")}
        sections={[{ id: "houseRules", title: t("guideSections.what_this_dj_always_does"), text: "" }]}
        editing={editing}
      />
      <p className="section-foot">
        {editing
          ? t("guideSections.tap_a_section_to_rewrite_it")
          : t("guideSections.edit_lets_you_rewrite_any_section")}
      </p>
    </>
  );
}
