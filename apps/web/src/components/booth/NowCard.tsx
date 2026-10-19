"use client";
import { durationLabel } from "@/lib/booth/plan";
import { SOURCE_LABEL } from "@/lib/booth/sources/types";
import { useBooth } from "@/lib/booth/store";
import { Meter } from "./Meter";

const RHYTHM: Record<string, string> = {
  tango: "Tango",
  vals: "Vals",
  milonga: "Milonga",
  cortina: "Cortina",
  break: "Break",
};

/** The eyebrow a card prints over an item: "tanda 7 · Vals · D'Arienzo / Echagüe · 1940". */
export function eyebrowFor(
  item: { tanda: number; kind: string; rhythm: string; artist: string; year?: number | null },
  tandas: number,
) {
  const where =
    item.kind === "closing"
      ? item.tanda === 0
        ? "opening"
        : "closing"
      : item.kind === "break"
        ? "break"
        : `tanda ${item.tanda} of ${tandas}`;
  return [where, RHYTHM[item.rhythm] ?? item.rhythm, item.artist, item.year ? String(item.year) : null]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Now (round7-booth.md §1.1): eyebrow, the title at 34 pt, a transform-only progress bar, `k of n` dots, the
 * remaining time at 44 pt tabular, the level meter, the applied gain, the source badge.
 */
export function NowCard() {
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  const state = useBooth((s) => s.state);
  const position = useBooth((s) => s.position);
  const current = useBooth((s) => s.current);
  const sources = useBooth((s) => s.sources);
  const holding = useBooth((s) => s.holding);
  const rehearsal = useBooth((s) => s.sourceMode === "preview");
  const playlist = useBooth((s) => s.playlist);
  const item = plan?.items[planIndex];
  if (!plan || !item) return null;
  const length = current
    ? Math.max(0, current.endsAt - current.startedAt)
    : rehearsal
      ? Math.min(30, item.lengthSec)
      : item.lengthSec;
  const remaining = Math.max(0, length - position);
  const pct = length ? Math.min(1, position / length) : 0;
  const tandaItems = plan.items.filter((x) => x.tanda === item.tanda && x.kind === "track");
  const k = tandaItems.findIndex((x) => x.n === item.n);
  const live = state === "playing" || state === "cortina";
  const src = sources[planIndex] ?? "missing";
  const statusText =
    state === "idle"
      ? "Ready: tap Start the night"
      : state === "armed"
        ? "Ready: tap play"
        : state === "paused"
          ? "Holding"
          : state === "stopped"
            ? "Stopped"
            : holding
              ? "Holding after this song"
              : null;
  return (
    <section className="booth-card" data-testid="booth-now" aria-label="Now playing">
      <p className="booth-eyebrow">{eyebrowFor(item, playlist?.tandas.length ?? 0)}</p>
      <h2 className="booth-title" data-testid="booth-now-title">
        {item.title}
      </h2>
      <div className="booth-progress" aria-hidden>
        <div className="booth-progress-bar" style={{ transform: `scaleX(${pct})` }} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          {item.kind === "track" && (
            <span
              className="flex items-center gap-1"
              role="img"
              aria-label={`${k + 1} of ${tandaItems.length}`}
            >
              {tandaItems.map((x, i) => (
                <i
                  key={x.n}
                  className={`booth-dot ${i < k ? "booth-dot-done" : i === k ? "booth-dot-on" : ""}`}
                />
              ))}
            </span>
          )}
          <span className="text-caption1 text-[var(--label-2)]">
            {statusText ?? (item.kind === "cortina" ? "cortina" : `${k + 1} of ${tandaItems.length}`)}
          </span>
        </div>
        <span
          className="booth-big"
          data-testid="booth-remaining"
          role="timer"
          aria-label="Remaining in this song"
        >
          {live || state === "paused" ? durationLabel(remaining) : durationLabel(length)}
        </span>
      </div>
      <Meter className="mt-3" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="booth-chip" data-testid="booth-source">
          {SOURCE_LABEL[src]}
        </span>
        {current && (
          <span className="booth-chip tabular-nums" data-testid="booth-gain">
            {current.gainDb > 0 ? "+" : ""}
            {current.gainDb.toFixed(1)} dB
            {current.peakCapped ? " · peak-capped" : ""}
            {current.gainFrom === "prior"
              ? " · estimated from a preview"
              : current.gainFrom === "none"
                ? " · no measurement"
                : ""}
          </span>
        )}
        {item.birthday && <span className="booth-chip">birthday vals</span>}
        {rehearsal && <span className="booth-chip">30 s rehearsal</span>}
      </div>
    </section>
  );
}
