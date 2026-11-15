"use client";
import { t as tx } from "@/lib/i18n";
import type { Playlist } from "@/lib/types";
import { Group, RhythmTile, Row } from "./Form";
import { Sheet } from "./Sheet";

/**
 * Wave 2 — Swap tanda as a choice: up to three other families for the slot, nearest the slot's planned energy
 * first (/api/swap with `options`), each with its years and its energy against the plan. Tapping one puts it in;
 * the toast that follows can take it back.
 */
export function TandaChoices({
  index,
  current,
  options,
  busy,
  onPick,
  onClose,
}: {
  index: number | null;
  current: Playlist | null;
  options: Playlist[] | null;
  busy: boolean;
  onPick: (p: Playlist) => void;
  onClose: () => void;
}) {
  const open = index !== null && !!current;
  const t = open ? current!.tandas[index!] : undefined;
  const yrs = (r: [number, number] | null | undefined) =>
    r ? (r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`) : "";
  const planFit = (e: number, plan: number) => {
    const d = Math.round(e - plan);
    return Math.abs(d) <= 4
      ? tx("tandaChoices.right_on_the_plan")
      : d > 0
        ? tx("tandaChoices.livelier_than_the_plan", { d })
        : tx("tandaChoices.calmer_than_the_plan", { p1: -d });
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t ? tx("tandaChoices.swap_tanda_2", { p1: index! + 1 }) : tx("tandaChoices.swap_tanda")}
      trailing="Cancel"
      detents={["medium", "large"]}
      testId="tanda-choices"
    >
      {t && (
        <>
          <p className="text-footnote px-4 pt-2 text-[var(--label-2)]">
            {tx("tandaChoices.now_energy_the_plan_here_is", {
              orchestra: t.orchestra,
              p1: t.singer ? ` / ${t.singer}` : "",
              rhythm: t.rhythm,
              p2: Math.round(t.energy),
              p3: Math.round(t.targetEnergy),
            })}
          </p>
          <Group
            header={tx("tandaChoices.choose_one")}
            footer={
              busy
                ? tx("tandaChoices.finding_tandas_that_keep_the_night")
                : options && !options.length
                  ? tx("tandaChoices.no_other_family_keeps_the_night")
                  : tx("tandaChoices.every_choice_keeps_the_night_s")
            }
          >
            {(options ?? []).map((p) => {
              const x = p.tandas[index!]!;
              return (
                <Row
                  key={x.songs.map((s) => s.id).join(",")}
                  tile={<RhythmTile rhythm={x.rhythm} />}
                  label={`${x.orchestra}${x.singer ? ` / ${x.singer}` : tx("tandaChoices.instrumental")}`}
                  sub={tx("tandaChoices.energy", {
                    p1: yrs(x.yearRange),
                    p2: Math.round(x.energy),
                    p3: planFit(x.energy, t.targetEnergy),
                    p4: x.songs.map((s) => s.title).join(", "),
                  })}
                  chevron
                  onClick={() => onPick(p)}
                  data-testid="tanda-choice"
                />
              );
            })}
          </Group>
        </>
      )}
    </Sheet>
  );
}
