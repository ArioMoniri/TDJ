"use client";
import { forgetLearned, type LearnedRule, learnedRules, setLearnedWeight } from "@tdj/core";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DraftSong } from "@/lib/build";
import { t } from "@/lib/i18n";
import { useStore } from "@/lib/store";
import type { Meta } from "@/lib/types";
import { ActionRow, Group, SwitchRow } from "../Form";
import { SwipeRow } from "../SwipeRow";
import { Tip } from "../ui/Tip";
import { PraiseRows } from "./PraiseRows";

const SIDES_SHOWN = 30;
const fmt = (w: number) => `${w > 0 ? "+" : ""}${Number.isInteger(w) ? w : w.toFixed(1)}`;
/** what a rule does, with its source for the ones the thumbs up / down taught ("from nights you liked") */
const detailOf = (r: LearnedRule) =>
  r.kind === "liked"
    ? t(
        r.source === "liked"
          ? "db.learnedRules.from_nights_you_liked"
          : "db.learnedRules.from_nights_you_disliked",
      )
    : r.kind === "shape"
      ? t(r.source === "liked" ? "db.learnedRules.liked_shape" : "db.learnedRules.disliked_shape")
      : r.kind === "family" || r.kind === "side"
        ? t(
            r.weight > 0
              ? `db.learnedRules.${r.kind}_more`
              : r.weight < 0
                ? `db.learnedRules.${r.kind}_less`
                : "db.learnedRules.neutral",
          )
        : r.detail;

/** one rule: what it is, what it does, its weight with − / + (44 pt), and delete (swipe or the bin) */
export function RuleRow({
  r,
  onWeight,
  onForget,
}: {
  r: LearnedRule;
  onWeight: (w: number) => void;
  onForget: () => void;
}) {
  const step = r.kind === "family" ? 0.5 : 0.5;
  return (
    <SwipeRow actions={[{ kind: "destructive", label: "Delete", icon: Trash2, onClick: onForget }]}>
      <div className="cell" data-testid="learned-rule" data-rule={r.id}>
        {/* the text column never runs under the controls: it clips to its own width and the name wraps to two lines */}
        <span className="min-w-0 flex-1 overflow-hidden">
          <Tip text={r.label} className="w-full min-w-0">
            <span className="line-clamp-2 block min-w-0 break-words" data-testid="learned-label">
              {r.label}
            </span>
          </Tip>
          <span className="text-footnote block truncate text-[var(--label-2)]" data-testid="learned-source">
            {detailOf(r)}
          </span>
        </span>
        {(r.kind === "family" || r.kind === "side") && (
          <Tip text={t("db.learnedRules.how_much_this_weighs_in_your")}>
            <span className="flex shrink-0 items-center">
              <button
                type="button"
                className="icon-btn icon-btn-bare h-11 w-11"
                onClick={() => onWeight(r.weight - step)}
                disabled={r.weight <= r.min}
                aria-label={t("db.learnedRules.weigh_less", { label: r.label })}
              >
                <Minus size={16} aria-hidden />
              </button>
              <span className="w-9 text-center tabular-nums" data-testid="learned-weight">
                {fmt(r.weight)}
              </span>
              <button
                type="button"
                className="icon-btn icon-btn-bare h-11 w-11"
                onClick={() => onWeight(r.weight + step)}
                disabled={r.weight >= r.max}
                aria-label={t("db.learnedRules.weigh_more", { label: r.label })}
              >
                <Plus size={16} aria-hidden />
              </button>
            </span>
          </Tip>
        )}
        <Tip text={t("db.learnedRules.delete_this_rule")}>
          <button
            type="button"
            className="icon-btn icon-btn-bare -mr-2 h-11 w-11 text-[var(--destructive)]"
            onClick={onForget}
            aria-label={`Delete ${r.label}`}
          >
            <Trash2 size={15} aria-hidden />
          </button>
        </Tip>
      </div>
    </SwipeRow>
  );
}

/**
 * Round 22 — Database → Memory → Learned from your edits: every swap, lock, AI edit and hand-built night feeds these
 * rules (like an autocorrect); the next nights follow them under tonight's settings. Each one can be weighted or
 * deleted; learning can be switched off.
 */
export function LearnedRules() {
  const { memory, updateMemory, settings, setSettings } = useStore();
  const L = memory.learned;
  const [names, setNames] = useState<Record<string, string>>({});
  const [songs, setSongs] = useState<Record<string, DraftSong>>({});
  useEffect(() => {
    fetch("/api/meta")
      .then((r) => (r.ok ? r.json() : null))
      .then((m: Meta | null) => {
        if (m) setNames(Object.fromEntries(m.orchestras.map((o) => [o.id, o.name])));
      })
      .catch(() => {});
  }, []);
  const sideIds = useMemo(
    () =>
      Object.entries(L?.sides ?? {})
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
        .slice(0, SIDES_SHOWN)
        .map(([id]) => id),
    [L?.sides],
  );
  const want = sideIds.filter((id) => !songs[id]).join(",");
  useEffect(() => {
    if (!want) return;
    fetch("/api/build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lookup: want.split(",") }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { songs?: DraftSong[] } | null) => {
        if (j?.songs) setSongs((x) => ({ ...x, ...Object.fromEntries(j.songs!.map((s) => [s.id, s])) }));
      })
      .catch(() => {});
  }, [want]);
  const all = learnedRules(
    L,
    (id) => names[id] ?? id.replace(/-/g, " "),
    (id) => songs[id],
  );
  const fams = all.filter((r) => r.kind === "family");
  const sides = all.filter((r) => r.kind === "side" && sideIds.includes(r.id.slice(5)));
  const temps = all.filter((r) => r.kind === "template");
  const rated = all.filter((r) => r.kind === "liked" || r.kind === "shape");
  const weigh = (id: string, w: number) =>
    updateMemory((m) => ({
      ...m,
      learned: setLearnedWeight(m.learned, id, w),
      updatedAt: new Date().toISOString(),
    }));
  const forget = (id: string) =>
    updateMemory((m) => ({
      ...m,
      learned: forgetLearned(m.learned, id),
      updatedAt: new Date().toISOString(),
    }));
  const rows = (rs: LearnedRule[]) =>
    rs.map((r) => (
      <RuleRow key={r.id} r={r} onWeight={(w) => weigh(r.id, w)} onForget={() => forget(r.id)} />
    ));

  return (
    <>
      <Group
        header={t("db.learnedRules.learned_from_your_edits")}
        footer={
          settings.learn
            ? t("db.learnedRules.like_an_autocorrect_every_swap_lock")
            : t("db.learnedRules.learning_is_off_your_edits_teach")
        }
        data-testid="learned-rules"
      >
        <SwitchRow
          label={t("db.learnedRules.learn_from_my_edits")}
          tip={t("db.learnedRules.your_swaps_and_pinned_tandas_teach")}
          checked={settings.learn}
          onChange={(v) => setSettings({ learn: v })}
        />
        {!all.length && (
          <div className="cell text-[var(--label-2)]">
            {t("db.learnedRules.nothing_yet_swap_a_song_lock")}
          </div>
        )}
      </Group>
      {fams.length > 0 && <Group header={t("db.learnedRules.families")}>{rows(fams)}</Group>}
      {sides.length > 0 && (
        <Group
          header={t("db.learnedRules.sides")}
          footer={
            Object.keys(L?.sides ?? {}).length > SIDES_SHOWN
              ? t("db.learnedRules.the_strongest_of", {
                  SIDES_SHOWN,
                  length: Object.keys(L?.sides ?? {}).length,
                })
              : undefined
          }
        >
          {rows(sides)}
        </Group>
      )}
      {temps.length > 0 && <Group header={t("db.learnedRules.your_tandas")}>{rows(temps)}</Group>}
      <PraiseRows
        praise={L?.praise ?? []}
        onForget={(id) => forget(`praise:${id}`)}
        testId="learned-praise"
      />
      {rated.length > 0 && (
        <Group
          header={t("db.learnedRules.from_your_nights")}
          footer={t("db.learnedRules.from_your_nights_footer")}
          data-testid="learned-from-likes"
        >
          {rows(rated)}
        </Group>
      )}
      {all.length > 0 && (
        <Group>
          <ActionRow
            label={t("db.learnedRules.forget_everything_learned_from_my_edits")}
            destructive
            onClick={() =>
              updateMemory((m) => ({ ...m, learned: undefined, updatedAt: new Date().toISOString() }))
            }
          />
        </Group>
      )}
    </>
  );
}
