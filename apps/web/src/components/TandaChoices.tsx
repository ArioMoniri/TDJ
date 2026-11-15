"use client";
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
      ? "right on the plan"
      : d > 0
        ? `${d} livelier than the plan`
        : `${-d} calmer than the plan`;
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t ? `Swap tanda ${index! + 1}` : "Swap tanda"}
      trailing="Cancel"
      detents={["medium", "large"]}
      testId="tanda-choices"
    >
      {t && (
        <>
          <p className="text-footnote px-4 pt-2 text-[var(--label-2)]">
            Now: {t.orchestra}
            {t.singer ? ` / ${t.singer}` : ""} · {t.rhythm} · energy {Math.round(t.energy)}. The plan here is
            about {Math.round(t.targetEnergy)}; the closest choices come first.
          </p>
          <Group
            header="Choose one"
            footer={
              busy
                ? "Finding tandas that keep the night's rules…"
                : options && !options.length
                  ? "No other family keeps the night's rules in this place."
                  : "Every choice keeps the night's rules: the orchestra gaps, the years, the songs already played."
            }
          >
            {(options ?? []).map((p) => {
              const x = p.tandas[index!]!;
              return (
                <Row
                  key={x.songs.map((s) => s.id).join(",")}
                  tile={<RhythmTile rhythm={x.rhythm} />}
                  label={`${x.orchestra}${x.singer ? ` / ${x.singer}` : " · instrumental"}`}
                  sub={`${yrs(x.yearRange)} · energy ${Math.round(x.energy)}, ${planFit(x.energy, t.targetEnergy)} · ${x.songs
                    .map((s) => s.title)
                    .join(", ")}`}
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
