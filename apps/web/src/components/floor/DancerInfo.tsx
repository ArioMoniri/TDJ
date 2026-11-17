"use client";
import { singerDisplay } from "@tdj/core";
import { type FloorState, floorRemaining, floorTimes } from "@/lib/floor";
import { t } from "@/lib/i18n";
import { orchestraName } from "@/lib/orchestraName";
import { rhythmWord } from "../ui/TandaTypeBadge";

/**
 * 2026-11 (the owner: "dancer information, prominent on both screens") — what a dancer wants to know, in words, from
 * the one Floor state the Booth publishes (lib/floor.ts): the song's place in its tanda ("Song 2 of 4"), the tanda's
 * rhythm, orchestra and singer, the time left in the tanda, what comes next ("Next: cortina, then Vals · Canaro"),
 * when La Cumparsita comes, and the night's strip of tandas. Shared by Now playing and the Floor screen.
 */

/** "4:05" under ten minutes, then "41 min", then "2 h 05 min" */
export function leftLabel(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 600) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const m = Math.round(s / 60);
  if (m < 60) return t("dancer.m", { m });
  return t("dancer.hm", { h: Math.floor(m / 60), m: String(m % 60).padStart(2, "0") });
}

/** an orchestra (a raw credit read as names, a singer's guitars) and a singer as printed */
export const whoOf = (orchestra: string, singer: string | null | undefined) => ({
  orchestra: orchestra ? orchestraName({ orchestra, singer }) : "",
  singer: singer ? (singerDisplay(singer) as string) : "",
});

export interface DancerWords {
  rhythm: string;
  songOf: string | null;
  tandaLeft: string | null;
  next: string | null;
  cumparsita: string | null;
}

export function dancerWords(s: FloorState, now = Date.now()): DancerWords {
  const times = floorTimes(s, now);
  const nx = s.next
    ? { rhythm: rhythmWord(s.next.rhythm), orchestra: whoOf(s.next.orchestra, null).orchestra }
    : null;
  let next: string | null = null;
  if (s.kind === "cortina" || s.kind === "break" || s.kind === "opening")
    next = nx ? t("floor.next", nx) : null;
  else if (s.kind === "closing") next = t("dancer.next_end");
  else if (s.follows === "song") next = t("dancer.next_song", { k: s.k + 2, n: s.n });
  else if (s.follows === "cortina") next = nx ? t("dancer.next_cortina_then", nx) : t("dancer.next_cortina");
  else if (s.follows === "closing") next = t("dancer.next_closing");
  else if (s.follows === "break") next = t("dancer.next_break");
  else if (s.follows === "end") next = t("dancer.next_end");
  const left =
    s.kind === "song" && times.tandaLeftSec !== null
      ? t("dancer.tanda_left", { t: leftLabel(times.tandaLeftSec) })
      : s.kind === "cortina"
        ? t("floor.next_in", { t: leftLabel(floorRemaining(s, now)) })
        : null;
  return {
    rhythm: s.kind === "cortina" ? t("floor.cortina") : rhythmWord(s.rhythm),
    songOf: s.kind === "song" && s.n > 0 && s.k >= 0 ? t("floor.song_of", { k: s.k + 1, n: s.n }) : null,
    tandaLeft: left,
    next,
    cumparsita:
      s.kind === "closing"
        ? t("dancer.cumparsita_now")
        : times.cumparsitaInSec !== null
          ? t("dancer.cumparsita_in", { t: leftLabel(times.cumparsitaInSec) })
          : null,
  };
}

/** the tanda's songs as dots: the ones played filled, the one playing large in the rhythm's colour */
export function TandaDots({ k, n, testId }: { k: number; n: number; testId?: string }) {
  if (n <= 0) return null;
  return (
    <span className="tanda-dots" aria-hidden data-testid={testId}>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} data-on={i === k || undefined} data-done={i < k || undefined} />
      ))}
    </span>
  );
}

/** the night as a strip of tandas in their rhythm's colour, the ones played dimmed, the one playing marked */
export function NightStrip({
  arc,
  tanda,
  testId,
}: {
  arc: readonly string[];
  tanda: number;
  testId?: string;
}) {
  if (arc.length < 2) return null;
  const label = tanda > 0 ? t("dancer.night_strip", { n: tanda, of: arc.length }) : undefined;
  return (
    <div className="night-strip" role="img" aria-label={label} data-testid={testId}>
      {arc.map((r, i) => (
        <i
          key={i}
          data-rhythm={r}
          data-done={i + 1 < tanda || undefined}
          data-on={i + 1 === tanda || undefined}
        />
      ))}
    </div>
  );
}
