"use client";
import { cortinaSpan, upNext } from "@/lib/booth/nightView";
import { useBooth } from "@/lib/booth/store";
import { metaLine } from "@/lib/year";
import { Artwork } from "../ui/Artwork";
import { EraBadge } from "../ui/EraBadge";
import { eyebrowFor } from "./NowCard";

/**
 * Next (round7-booth.md §1.1): the next item (a track inside the running tanda, the cortina, or the next tanda's
 * first track) with the same eyebrow, the next tanda's summary and its cortina in words. Wave 2: a tanda skipped
 * tonight and its cortina are passed over. Tapping the next tanda jumps the set column there.
 */
export function NextCard({ onJump }: { onJump: (planIndex: number) => void }) {
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  const sources = useBooth((s) => s.sources);
  const skipped = useBooth((s) => s.skipped);
  const bypassed = useBooth((s) => s.bypassed);
  const rehearsal = useBooth((s) => s.rehearsal);
  const decoding = useBooth((s) => s.decoding);
  const playlist = useBooth((s) => s.playlist);
  const holdBefore = useBooth((s) => s.holdBefore);
  const entities = useBooth((s) => s.entities);
  if (!plan) return null;
  const missing = new Set(
    sources
      .map((s, i) => (s === "missing" && plan.items[i]?.kind !== "break" ? i : -1))
      .filter((i) => i >= 0),
  );
  // wave 2: a tanda skipped tonight and its cortina are passed over like the items the night already left out
  const passed = new Set([...skipped, ...bypassed]);
  const up = upNext(plan.items, planIndex, { passed, missing });
  const next = up.next ?? plan.items.length;
  const item = up.next === null ? undefined : plan.items[up.next];
  const noSource = up.noSource;
  const tandas = playlist?.tandas.length ?? 0;
  const nextTandaFirst = up.nextTanda;
  const nt = nextTandaFirst >= 0 ? plan.items[nextTandaFirst]! : null;
  const ntTanda = nt ? playlist?.tandas[nt.tanda - 1] : null;
  const ntCortina = up.nextTandaCortina >= 0 ? plan.items[up.nextTandaCortina] : null;
  return (
    <section className="booth-card" data-testid="booth-next" aria-label="Next">
      <p className="booth-eyebrow" data-hint="What the room hears after this song">
        Up next{decoding === next ? " · decoding…" : ""}
      </p>
      {item ? (
        <>
          <p className="text-caption1 text-[var(--label-2)]">{eyebrowFor(item, tandas)}</p>
          <div className="mt-1 flex items-center gap-3">
            <Artwork
              entity={entities[next]}
              orchestra={(entities[next] as { orchestra?: string } | null)?.orchestra ?? item.artist}
              size={48}
            />
            <div className="min-w-0 flex-1">
              <h3
                className="booth-mid booth-next-title font-semibold"
                data-testid="booth-next-title"
                data-next-index={up.next ?? undefined}
              >
                {item.title}
              </h3>
            </div>
            <EraBadge entity={entities[next]} />
          </div>
          {noSource && (
            <p className="text-footnote text-[var(--label-2)]" data-testid="booth-next-nosource">
              {rehearsal
                ? "The rehearsal has no 30 s clip of this song: it is passed over (on the night it plays in full)."
                : "Nothing to play this song from (no file or Spotify): it is passed over."}
            </p>
          )}
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
          data-next-index={nextTandaFirst}
        >
          <span className="text-caption1 block text-[var(--label-2)]">
            next tanda · {nt.tanda} of {tandas} · {ntTanda.rhythm}
          </span>
          <span className="booth-mid block truncate">
            {metaLine(
              ntTanda.singer ? `${ntTanda.orchestra} / ${ntTanda.singer}` : ntTanda.orchestra,
              ntTanda.yearRange ? `${ntTanda.yearRange[0]}–${ntTanda.yearRange[1]}` : null,
            )}
          </span>
          {ntCortina && (
            <span
              className="text-footnote block truncate text-[var(--label-2)]"
              data-testid="booth-next-cortina"
            >
              then the cortina {ntCortina.artist} – {ntCortina.title}, which{" "}
              {cortinaSpan(ntCortina.trimInSec ?? 0, ntCortina.stopSec ?? 0)}
            </span>
          )}
        </button>
      )}
    </section>
  );
}
