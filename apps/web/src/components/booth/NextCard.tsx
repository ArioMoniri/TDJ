"use client";
import { Headphones, Play, Repeat2 } from "lucide-react";
import { useRef } from "react";
import { cortinaSpan, upNext } from "@/lib/booth/nightView";
import { boothMenuSpec } from "@/lib/booth/songMenu";
import { useBooth } from "@/lib/booth/store";
import { useBoothSwap } from "@/lib/booth/swap";
import { t } from "@/lib/i18n";
import { useSongMenuProps } from "@/lib/songMenu";
import { metaLine, yearSpan, yearText } from "@/lib/year";
import { Artwork } from "../ui/Artwork";
import { EraBadge } from "../ui/EraBadge";
import { rhythmWord, TandaTypeBadge } from "../ui/TandaTypeBadge";
import { eyebrowFor } from "./NowCard";

/**
 * Next (round7-booth.md §1.1): the next item (a track inside the running tanda, the cortina, or the next tanda's
 * first track) with the same eyebrow, the next tanda's summary and its cortina in words. Wave 2: a tanda skipped
 * tonight and its cortina are passed over. Tapping the next tanda jumps the set column there.
 */
export function NextCard({
  onJump,
  onPlay,
  onInfo,
}: {
  onJump: (planIndex: number) => void;
  /** 2026-11: one tap plays the item (the page's row tap: from here before the night, the headphones during it) */
  onPlay?: (planIndex: number) => void;
  /** 2026-11: the song sheet of the next item (the song menu's Song details) */
  onInfo?: (planIndex: number) => void;
}) {
  const hearing = useBooth((s) => s.audition?.i ?? null);
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
  // 2026-11: what "Play next" picked is next (the card used to keep the plan's order, so Play next looked broken)
  const picked = useBooth((s) => s.pickedNext);
  // 2026-11: the shared song menu on the next song (right-click, long press, "i"): its sheet, Song DNA, Swap…
  const nextAt = useRef<number | null>(null);
  const menu = useSongMenuProps(() =>
    nextAt.current === null
      ? null
      : boothMenuSpec(nextAt.current, {
          details: onInfo && nextAt.current !== null ? () => onInfo(nextAt.current!) : undefined,
          swap: () => nextAt.current !== null && useBoothSwap.getState().open(nextAt.current),
        }),
  );
  if (!plan) return null;
  const missing = new Set(
    sources
      .map((s, i) => (s === "missing" && plan.items[i]?.kind !== "break" ? i : -1))
      .filter((i) => i >= 0),
  );
  // wave 2: a tanda skipped tonight and its cortina are passed over like the items the night already left out
  const passed = new Set([...skipped, ...bypassed]);
  const up = upNext(plan.items, planIndex, { passed, missing, picked });
  const next = up.next ?? plan.items.length;
  nextAt.current = up.next;
  const item = up.next === null ? undefined : plan.items[up.next];
  const noSource = up.noSource;
  const tandas = playlist?.tandas.length ?? 0;
  const nextTandaFirst = up.nextTanda;
  const nt = nextTandaFirst >= 0 ? plan.items[nextTandaFirst]! : null;
  const ntTanda = nt ? playlist?.tandas[nt.tanda - 1] : null;
  const ntCortina = up.nextTandaCortina >= 0 ? plan.items[up.nextTandaCortina] : null;
  return (
    <section
      className="booth-card"
      data-testid="booth-next"
      data-next={up.next ?? undefined}
      data-picked={up.picked || undefined}
      aria-label={t("booth.nextCard.next")}
    >
      <p className="booth-eyebrow" data-hint={t("booth.nextCard.what_the_room_hears_after_this")}>
        {t("booth.nextCard.up_next")}
        {decoding === next ? t("booth.nextCard.decoding") : ""}
      </p>
      {item ? (
        <>
          {/* 2026-11 (DJ review: the eyebrow repeated the orchestra and year the next tanda's card shows again): where
              it sits over the title, the orchestra and year under it, one line each */}
          <p className="text-caption1 text-[var(--label-2)]">{eyebrowFor(item, tandas, false)}</p>
          {/* 2026-11: the song is one tap to play (before the night: from here; during it: the headphones) */}
          <button
            type="button"
            className="booth-next-play mt-1 flex w-full items-center gap-3 text-left"
            onClick={() => up.next !== null && onPlay?.(up.next)}
            disabled={!onPlay || up.next === null}
            aria-label={t("booth.setColumn.play", { title: item.title })}
            data-testid="booth-next-play"
            data-auditioning={hearing === next || undefined}
            {...menu}
          >
            <Artwork
              entity={entities[next]}
              orchestra={(entities[next] as { orchestra?: string } | null)?.orchestra ?? item.artist}
              size={48}
            />
            <span className="min-w-0 flex-1">
              <span
                className="booth-mid booth-next-title block font-semibold"
                data-testid="booth-next-title"
                data-next-index={up.next ?? undefined}
              >
                {item.title}
              </span>
              <span className="text-footnote block truncate text-[var(--label-2)]">
                {metaLine(item.artist, yearText(item.year))}
              </span>
            </span>
            <EraBadge entity={entities[next]} />
            <PlayIcon hearing={hearing === next} />
          </button>
          {/* 2026-11: swap what plays next in one tap (the room keeps playing the current song); a sibling of the
              card's play button, never inside it */}
          {(item.kind === "track" || item.kind === "cortina") && (
            <button
              type="button"
              className="icon-btn icon-btn-bare h-11 w-11 shrink-0 self-start"
              aria-label={t("boothSwap.swap_label", { title: item.title })}
              data-hint={t("boothSwap.swap")}
              onClick={() => useBoothSwap.getState().open(next)}
              data-testid="booth-next-swap"
            >
              <Repeat2 size={16} strokeWidth={2} aria-hidden />
            </button>
          )}
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
          className="booth-next-tanda mt-3 block w-full rounded-[var(--radius-m)] px-3 py-2 text-left"
          onClick={() => {
            onJump(nextTandaFirst);
            onPlay?.(nextTandaFirst);
          }}
          aria-label={t("booth.nextCard.play_next_tanda", { tanda: nt.tanda })}
          data-testid="booth-next-tanda"
          data-next-index={nextTandaFirst}
          data-auditioning={hearing === nextTandaFirst || undefined}
        >
          <span className="text-caption1 block text-[var(--label-2)]">
            {t("booth.nextCard.next_tanda_of", {
              tanda: nt.tanda,
              tandas,
              rhythm: rhythmWord(ntTanda.rhythm),
            })}
          </span>
          <span className="my-1 flex">
            <TandaTypeBadge rhythm={ntTanda.rhythm} vocal={ntTanda.vocal} singer={ntTanda.singer} />
          </span>
          <span className="booth-mid block truncate">
            {metaLine(
              ntTanda.singer ? `${ntTanda.orchestra} / ${ntTanda.singer}` : ntTanda.orchestra,
              yearSpan(ntTanda.yearRange),
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

/** the play glyph on a tappable song (headphones while it pre-listens) */
function PlayIcon({ hearing }: { hearing: boolean }) {
  return hearing ? (
    <Headphones size={18} strokeWidth={2} className="flex-none text-[var(--cue)]" aria-hidden />
  ) : (
    <Play
      size={18}
      fill="currentColor"
      strokeWidth={0}
      className="flex-none text-[var(--label-2)]"
      aria-hidden
    />
  );
}
