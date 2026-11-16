"use client";
import { ListMusic, Play } from "lucide-react";
import { type ReactNode, useContext, useMemo } from "react";
import { t } from "@/lib/i18n";
import { nightItems, PlayListContext, playTanda } from "@/lib/playback";
import { type PlayItem, usePlayer } from "@/lib/player";
import { Menu } from "../Menu";
import { NowBars } from "./NowPlaying";

/**
 * 2026-11 (the owner: "a button on the tanda image to play that tanda only, or play from there till the end") — a
 * tanda's cover is a play button: a tap (or Enter / Space) opens "Play this tanda" and "Play from here to the end"
 * (a popover on wide screens, a sheet on phones). While the tanda plays the cover shows the
 * bars. `list` is the night's play list (`nightItems`), `tanda` the 0-based tanda.
 */
export function TandaPlayCover({
  list: given,
  night,
  tanda,
  children,
  className = "",
}: {
  /** the night's play list; else the page's (PlayListContext), else `night`'s own */
  list?: { label: string; items: PlayItem[] } | null;
  night?: Parameters<typeof nightItems>[0] & { name?: string };
  tanda: number;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(PlayListContext);
  const own = useMemo(() => (night ? { label: night.name ?? "", items: nightItems(night) } : null), [night]);
  const list = given ?? ctx ?? own ?? { label: "", items: [] };
  const now = usePlayer((s) => {
    const l = s.list;
    if (!l || l.items !== list.items) return null;
    const row = l.items[l.index];
    return row?.tanda === tanda ? (s.playing ? "playing" : "paused") : null;
  });
  return (
    <Menu
      label={t("play.play_tanda", { n: tanda + 1 })}
      tip={t("play.play_tanda", { n: tanda + 1 })}
      align="left"
      className={`tanda-play relative grid min-h-11 min-w-11 shrink-0 place-items-center rounded-[var(--radius-s,10px)] ${className}`}
      items={[
        {
          label: t("play.play_this_tanda"),
          icon: Play,
          onClick: () => void playTanda(list, tanda, "tanda"),
        },
        {
          label: t("play.play_from_here_to_end"),
          icon: ListMusic,
          onClick: () => void playTanda(list, tanda, "from"),
        },
      ]}
    >
      <span
        className="pointer-events-none relative block"
        data-testid="tanda-cover"
        data-now={now ?? undefined}
      >
        {children}
        {now ? (
          <span
            className="absolute inset-0 grid place-items-center rounded-[inherit] bg-black/45 text-white"
            aria-hidden
          >
            <NowBars on={now === "playing"} className="!text-white" />
          </span>
        ) : (
          // the play badge on the cover's corner (the tanda number stays readable)
          <span
            className="absolute -right-1 -bottom-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--tint)] text-white shadow"
            aria-hidden
          >
            <Play size={10} fill="currentColor" strokeWidth={0} />
          </span>
        )}
      </span>
    </Menu>
  );
}
