"use client";
import { floorLearningOn, floorLessons, setFloorLearning } from "@tdj/core";
import { ActionRow, Group, Row, SwitchRow } from "@/components/Form";
import { t as tx } from "@/lib/i18n";
import type { MsgKey } from "@/lib/i18n/en";
import { useStore } from "@/lib/store";

const PHASE: Record<string, MsgKey> = {
  warmup: "phase.warmup",
  build: "phase.build",
  peak: "phase.peak",
  cooldown: "phase.cooldown",
  close: "phase.close",
};
const STEP: Record<string, MsgKey> = {
  up: "floorLearn.step_up",
  down: "floorLearn.step_down",
  flat: "floorLearn.step_flat",
};

/**
 * 2026-11 — Settings → learning, source "floor reactions" (core floor.ts): what the Booth's Floor full ♥ / Floor
 * emptied taught — tanda pairs and energy steps, each a small capped nudge — with the switch that stops floor learning
 * (what it learned is kept and not read while off) and a way to forget it.
 */
export function FloorLearning() {
  const learned = useStore((s) => s.memory.learned);
  const updateMemory = useStore((s) => s.updateMemory);
  const on = floorLearningOn(learned);
  const lessons = floorLessons(learned).slice(0, 8);
  const nameOf = (id: string) =>
    id
      .split("-")
      .map((w) => (w.length > 2 ? w[0]!.toUpperCase() + w.slice(1) : w))
      .join(" ");
  return (
    <Group header={tx("floorLearn.header")} footer={tx("floorLearn.footer")} data-testid="floor-learning">
      <SwitchRow
        label={tx("floorLearn.switch")}
        checked={on}
        onChange={(v) => updateMemory((m) => ({ ...m, learned: setFloorLearning(m.learned, v) }))}
      />
      {lessons.length ? (
        lessons.map((l) => {
          const [a, b] = l.key.split(/[>|]/);
          const label =
            l.kind === "pair"
              ? tx("floorLearn.pair", { a: nameOf(a ?? ""), b: nameOf(b ?? "") })
              : tx("floorLearn.step", {
                  role: PHASE[a ?? ""] ? tx(PHASE[a ?? ""]!) : (a ?? ""),
                  step: STEP[b ?? ""] ? tx(STEP[b ?? ""]!) : (b ?? ""),
                });
          return (
            <Row
              key={`${l.kind}:${l.key}`}
              label={label}
              sub={`${tx(l.weight > 0 ? "floorLearn.filled" : "floorLearn.emptied")} · ${tx("floorLearn.source")}`}
              value={`${l.weight > 0 ? "+" : ""}${l.weight}`}
              data-testid="floor-lesson"
            />
          );
        })
      ) : (
        <Row label={tx("floorLearn.none")} />
      )}
      {lessons.length > 0 && (
        <ActionRow
          label={tx("floorLearn.forget")}
          destructive
          onClick={() =>
            updateMemory((m) => ({
              ...m,
              learned: m.learned
                ? { ...m.learned, floor: { pairs: {}, steps: {}, taps: {}, ...(on ? {} : { off: true }) } }
                : m.learned,
            }))
          }
        />
      )}
    </Group>
  );
}
