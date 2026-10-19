"use client";
import { durationLabel } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { eyebrowFor } from "./NowCard";

/**
 * Next (round7-booth.md §1.1): the next item (a track inside the running tanda, the cortina, or the next tanda's
 * first track) with the same eyebrow, the next tanda's summary and its cortina (artist – title, cue-in, planned
 * stop). Tapping the next tanda jumps the set column there.
 */
export function NextCard({ onJump }: { onJump: (planIndex: number) => void }) {
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  const sources = useBooth((s) => s.sources);
  const skipped = useBooth((s) => s.skipped);
  const decoding = useBooth((s) => s.decoding);
  const playlist = useBooth((s) => s.playlist);
  const holdBefore = useBooth((s) => s.holdBefore);
  if (!plan) return null;
  const isSkipped = (i: number) =>
    (sources[i] === "missing" && plan.items[i]?.kind !== "break") || skipped.includes(i);
  let next = planIndex + 1;
  while (next < plan.items.length && isSkipped(next)) next++;
  // nothing playable after the playhead but items remain: show the next one anyway (it says "no source")
  if (next >= plan.items.length && planIndex + 1 < plan.items.length) next = planIndex + 1;
  const item = plan.items[next];
  const noSource = item ? isSkipped(next) : false;
  const cur = plan.items[planIndex];
  const tandas = playlist?.tandas.length ?? 0;
  // the next tanda: the first track after the current tanda
  const nextTandaFirst = plan.items.findIndex(
    (x, i) => i > planIndex && x.kind === "track" && x.tanda > (cur?.tanda ?? 0),
  );
  const nt = nextTandaFirst >= 0 ? plan.items[nextTandaFirst]! : null;
  const ntTanda = nt ? playlist?.tandas[nt.tanda - 1] : null;
  const ntCortina = nt ? plan.items.find((x) => x.kind === "cortina" && x.tanda === nt.tanda) : null;
  return (
    <section className="booth-card" data-testid="booth-next" aria-label="Next">
      <p className="booth-eyebrow">Next{decoding === next ? " · decoding…" : ""}</p>
      {item ? (
        <>
          <p className="text-caption1 text-[var(--label-2)]">{eyebrowFor(item, tandas)}</p>
          <h3 className="booth-mid font-semibold" data-testid="booth-next-title">
            {item.title}
          </h3>
          {noSource && <p className="text-footnote text-[var(--label-2)]">no source: skipped</p>}
          {holdBefore === next && (
            <p className="text-footnote text-[var(--tint)]">holds before this tanda (birthday vals)</p>
          )}
        </>
      ) : (
        <h3 className="booth-mid font-semibold">End of the night</h3>
      )}
      {nt && ntTanda && (
        <button
          type="button"
          className="mt-3 block w-full rounded-[var(--radius-m)] bg-[var(--fill-4)] px-3 py-2 text-left"
          onClick={() => onJump(nextTandaFirst)}
          data-testid="booth-next-tanda"
        >
          <span className="text-caption1 block text-[var(--label-2)]">
            next tanda · {nt.tanda} of {tandas} · {ntTanda.rhythm}
          </span>
          <span className="booth-mid block truncate">
            {ntTanda.orchestra}
            {ntTanda.singer ? ` / ${ntTanda.singer}` : ""}
            {ntTanda.yearRange ? ` · ${ntTanda.yearRange[0]}–${ntTanda.yearRange[1]}` : ""}
          </span>
          {ntCortina && (
            <span className="text-footnote block truncate text-[var(--label-2)]">
              cortina: {ntCortina.artist} – {ntCortina.title} · in {durationLabel(ntCortina.trimInSec ?? 0)} ·
              stop at {durationLabel(ntCortina.stopSec ?? 0)}
            </span>
          )}
        </button>
      )}
    </section>
  );
}
