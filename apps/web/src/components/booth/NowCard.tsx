"use client";
import { Info, ListEnd } from "lucide-react";
import { durationLabel } from "@/lib/booth/plan";
import { SOURCE_LABEL } from "@/lib/booth/sources/types";
import { useBooth } from "@/lib/booth/store";
import { metaLine, yearText } from "@/lib/year";
import { Artwork } from "../ui/Artwork";
import { BpmKey, EnergyChip } from "../ui/BpmKey";
import { EraBadge } from "../ui/EraBadge";
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
  withArtist = true,
) {
  const where =
    item.kind === "closing"
      ? item.tanda === 0
        ? "opening"
        : "closing"
      : item.kind === "break"
        ? "break"
        : `tanda ${item.tanda} of ${tandas}`;
  return [
    where,
    RHYTHM[item.rhythm] ?? item.rhythm,
    withArtist ? item.artist : null,
    withArtist ? yearText(item.year) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Now playing (round 22: the deck): artwork, where it sits in the night, the title at 34 pt, orchestra / singer and
 * year, the era badge, BPM / key and energy (each with its source on hover / long-press), a transform-only progress
 * bar, `k of n` dots, the remaining time at 44 pt, the level meter, the source and gain, "End the tanda after this
 * song" and the song's info sheet.
 */
export function NowCard({ onInfo }: { onInfo?: (planIndex: number) => void }) {
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  const state = useBooth((s) => s.state);
  const position = useBooth((s) => s.position);
  const current = useBooth((s) => s.current);
  const sources = useBooth((s) => s.sources);
  const holding = useBooth((s) => s.holding);
  const paused = useBooth((s) => s.paused);
  const ducked = useBooth((s) => s.ducked);
  const rehearsal = useBooth((s) => s.rehearsal);
  const playlist = useBooth((s) => s.playlist);
  const notRehearsable = useBooth((s) => s.notRehearsable);
  const entity = useBooth((s) => s.entities[s.planIndex] ?? null);
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
  const orchestra = entity && "orchestra" in entity ? entity.orchestra : item.artist;
  const statusText =
    state === "idle"
      ? "Ready"
      : state === "armed"
        ? "Ready: tap play"
        : state === "paused"
          ? paused
            ? "Paused: tap Resume"
            : "Holding"
          : state === "stopped"
            ? "Stopped"
            : holding
              ? "Holding after this song"
              : null;
  return (
    <section className="booth-card" data-testid="booth-now" aria-label="Now playing">
      <div className="booth-now-head">
        <Artwork entity={entity} orchestra={orchestra} size={96} />
        <div className="min-w-0 flex-1">
          <p className="booth-eyebrow" data-hint="Where this song sits in the night">
            <span className="text-[var(--room)]">● Room</span> ·{" "}
            {eyebrowFor(item, playlist?.tandas.length ?? 0, false)}
          </p>
          <h2 className="booth-title" data-testid="booth-now-title">
            {item.title}
          </h2>
          <p className="booth-now-artist">{metaLine(item.artist, yearText(item.year))}</p>
          <div className="booth-meta">
            <EraBadge entity={entity} />
            <BpmKey e={entity} />
            <EnergyChip e={entity} />
          </div>
        </div>
      </div>
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
        <span
          className="booth-chip"
          data-testid="booth-source"
          data-hint="Where this song plays from: your file, Spotify or a 30 s clip"
        >
          {src === "missing" && item.kind !== "break"
            ? rehearsal
              ? "No 30 s clip of this song: the rehearsal passes over it"
              : "Nothing to play this song from: passed over"
            : SOURCE_LABEL[src]}
        </span>
        {current && (
          <span
            className="booth-chip tabular-nums"
            data-testid="booth-gain"
            data-hint="The level correction that keeps every song as loud as the last"
          >
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
        {ducked && (
          <span className="booth-chip" data-testid="booth-ducked">
            talk-over · −12 dB
          </span>
        )}
        {/* the source badge already says "30 s rehearsal" when the item plays from a preview */}
        {rehearsal && src !== "preview" && <span className="booth-chip">30 s rehearsal</span>}
      </div>
      <div className="booth-now-actions">
        {/* wave 2: never offered on the opening or closing La Cumparsita (no tanda to end) */}
        {item.kind !== "closing" && (
          <button
            type="button"
            className="booth-tool"
            onClick={() => useBooth.getState().cueCortina()}
            disabled={!live || item.kind !== "track"}
            data-testid="booth-end-tanda"
            data-hint="The song plays to its end, then the cortina: the rest of this tanda is left out (c)"
          >
            <ListEnd size={16} strokeWidth={2} aria-hidden /> End tanda after this song
          </button>
        )}
        {onInfo && item.kind !== "break" && (
          <button
            type="button"
            className="booth-tool"
            onClick={() => onInfo(planIndex)}
            data-testid="booth-now-info"
            data-hint="Versions, cue and stop, BPM and key of this song"
          >
            <Info size={16} strokeWidth={2} aria-hidden /> Song info
          </button>
        )}
      </div>
      {/* round 18: say which items cannot be rehearsed and why, instead of skipping them silently */}
      {rehearsal && notRehearsable.length > 0 && (
        <details className="booth-norehearse mt-2" data-testid="booth-skipped">
          <summary className="text-footnote text-[var(--label-2)]">
            {notRehearsable.length} not rehearsable: no clip of the Spotify recording
          </summary>
          <ul className="text-footnote mt-1 grid gap-0.5 text-[var(--label-2)]">
            {notRehearsable.map((x) => (
              <li key={x.i}>
                <span className="text-[var(--label)]">{x.title}</span> · {x.why}
              </li>
            ))}
          </ul>
          <p className="text-footnote mt-1 text-[var(--label-3)]">
            They are left out of the rehearsal and play in full from Spotify or your files.
          </p>
        </details>
      )}
    </section>
  );
}
