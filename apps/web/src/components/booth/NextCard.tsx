"use client";
import { Repeat2 } from "lucide-react";
import { cortinaSpan, upNext } from "@/lib/booth/nightView";
import { useBooth } from "@/lib/booth/store";
import { useBoothSwap } from "@/lib/booth/swap";
import { t } from "@/lib/i18n";
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
    <section className="booth-card" data-testid="booth-next" aria-label={t("booth.nextCard.next")}>
      <p className="booth-eyebrow" data-hint={t("booth.nextCard.what_the_room_hears_after_this")}>
        {t("booth.nextCard.up_next")}
        {decoding === next ? t("booth.nextCard.decoding") : ""}
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
            {/* 2026-11: swap what plays next in one tap (the room keeps playing the current song) */}
            {(item.kind === "track" || item.kind === "cortina") && (
              <button
                type="button"
                className="icon-btn icon-btn-bare h-11 w-11 shrink-0"
                aria-label={t("boothSwap.swap_label", { title: item.title })}
                data-hint={t("boothSwap.swap")}
                onClick={() => useBoothSwap.getState().open(next)}
                data-testid="booth-next-swap"
              >
                <Repeat2 size={16} strokeWidth={2} aria-hidden />
              </button>
            )}
          </div>
          {noSource && (
            <p className="text-footnote text-[var(--label-2)]" data-testid="booth-next-nosource">
              {rehearsal
                ? t("booth.nextCard.the_rehearsal_has_no_30_s")
                : t("booth.nextCard.nothing_to_play_this_song_from")}
            </p>
          )}
          {holdBefore === next && (
            <p className="text-footnote text-[var(--tint)]">
              {t("booth.nextCard.holds_before_this_tanda_birthday_vals")}
            </p>
          )}
        </>
      ) : (
        <h3 className="booth-mid font-semibold">{t("booth.nextCard.end_of_the_night")}</h3>
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
            {t("booth.nextCard.next_tanda_of", { tanda: nt.tanda, tandas, rhythm: ntTanda.rhythm })}
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
              {t("booth.nextCard.then_the_cortina_which", {
                artist: ntCortina.artist,
                title: ntCortina.title,
                p1: " ",
                p2: cortinaSpan(ntCortina.trimInSec ?? 0, ntCortina.stopSec ?? 0),
              })}
            </span>
          )}
        </button>
      )}
    </section>
  );
}
