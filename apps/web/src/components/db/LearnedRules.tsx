"use client";
import { forgetLearned, type LearnedRule, learnedRules, setLearnedWeight } from "@tdj/core";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DraftSong } from "@/lib/build";
import { useStore } from "@/lib/store";
import type { Meta } from "@/lib/types";
import { ActionRow, Group, SwitchRow } from "../Form";
import { SwipeRow } from "../SwipeRow";
import { Tip } from "../ui/Tip";

const SIDES_SHOWN = 30;
const fmt = (w: number) => `${w > 0 ? "+" : ""}${Number.isInteger(w) ? w : w.toFixed(1)}`;

/** one rule: what it is, what it does, its weight with − / + (44 pt), and delete (swipe or the bin) */
function RuleRow({
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
        <span className="min-w-0 flex-1">
          <Tip text={r.label}>
            <span className="block truncate">{r.label}</span>
          </Tip>
          <span className="text-footnote block truncate text-[var(--label-2)]">{r.detail}</span>
        </span>
        {r.kind !== "template" && (
          <Tip text={"How much this weighs in your next nights"}>
            <span className="flex shrink-0 items-center">
              <button
                type="button"
                className="icon-btn icon-btn-bare h-11 w-11"
                onClick={() => onWeight(r.weight - step)}
                disabled={r.weight <= r.min}
                aria-label={`Weigh ${r.label} less`}
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
                aria-label={`Weigh ${r.label} more`}
              >
                <Plus size={16} aria-hidden />
              </button>
            </span>
          </Tip>
        )}
        <Tip text={"Delete this rule"}>
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
        header="Learned from your edits"
        footer={
          settings.learn
            ? "Like an autocorrect: every swap, lock, AI edit and hand-built night teaches T-DJ what you prefer, and the next nights follow it under tonight's settings. Weigh a rule up or down, or delete it; the night's rules still apply."
            : "Learning is off: your edits teach nothing and nothing learned is applied."
        }
        data-testid="learned-rules"
      >
        <SwitchRow
          label="Learn from my edits"
          tip="Your swaps and pinned tandas teach T-DJ what you prefer for later nights"
          checked={settings.learn}
          onChange={(v) => setSettings({ learn: v })}
        />
        {!all.length && (
          <div className="cell text-[var(--label-2)]">
            Nothing yet: swap a song, lock a tanda or build a night by hand.
          </div>
        )}
      </Group>
      {fams.length > 0 && <Group header="Families">{rows(fams)}</Group>}
      {sides.length > 0 && (
        <Group
          header="Sides"
          footer={
            Object.keys(L?.sides ?? {}).length > SIDES_SHOWN
              ? `The ${SIDES_SHOWN} strongest of ${Object.keys(L?.sides ?? {}).length}.`
              : undefined
          }
        >
          {rows(sides)}
        </Group>
      )}
      {temps.length > 0 && <Group header="Your tandas">{rows(temps)}</Group>}
      {all.length > 0 && (
        <Group>
          <ActionRow
            label="Forget everything learned from my edits"
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
