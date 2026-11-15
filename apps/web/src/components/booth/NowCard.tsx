"use client";
import { Info, ListEnd } from "lucide-react";
import { durationLabel } from "@/lib/booth/plan";
import { SOURCE_LABEL } from "@/lib/booth/sources/types";
import { useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { metaLine, yearText } from "@/lib/year";
import { Artwork } from "../ui/Artwork";
import { BpmKey, EnergyChip } from "../ui/BpmKey";
import { EraBadge } from "../ui/EraBadge";
import { SeekBar } from "../ui/SeekBar";
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
        : t("booth.nowCard.tanda_of", { tanda: item.tanda, tandas });
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
  const started = useBooth((s) => s.started);
  const item = plan?.items[planIndex];
  if (!plan || !item) return null;
  const length = current
    ? Math.max(0, current.endsAt - current.startedAt)
    : rehearsal
      ? Math.min(30, item.lengthSec)
      : item.lengthSec;
  const remaining = Math.max(0, length - position);
  const tandaItems = plan.items.filter((x) => x.tanda === item.tanda && x.kind === "track");
  const k = tandaItems.findIndex((x) => x.n === item.n);
  const live = state === "playing" || state === "cortina";
  const src = sources[planIndex] ?? "missing";
  const orchestra = entity && "orchestra" in entity ? entity.orchestra : item.artist;
  const statusText =
    state === "idle"
      ? t("booth.nowCard.ready")
      : state === "armed"
        ? t("booth.nowCard.ready_tap_play")
        : state === "paused"
          ? paused
            ? t("booth.nowCard.paused_tap_resume")
            : t("booth.nowCard.holding")
          : state === "stopped"
            ? t("booth.nowCard.stopped")
            : holding
              ? t("booth.nowCard.holding_after_this_song")
              : null;
  return (
    <section className="booth-card" data-testid="booth-now" aria-label={t("booth.nowCard.now_playing")}>
      <div className="booth-now-head">
        <Artwork entity={entity} orchestra={orchestra} size={96} />
        <div className="min-w-0 flex-1">
          <p className="booth-eyebrow" data-hint={t("booth.nowCard.where_this_song_sits_in_the")}>
            <span className="text-[var(--room)]">{t("booth.nowCard.room")}</span> ·{" "}
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
      {/* 2026-11: the progress bar is a seek bar — drag, tap or ← / → (±5 s) moves inside the song, on every source */}
      <div className="booth-seek-row">
        <span className="tabular-nums" data-testid="booth-elapsed">
          {durationLabel(Math.min(position, length))}
        </span>
        <SeekBar
          value={Math.min(position, length)}
          max={length}
          onSeek={(sec) => void useBooth.getState().seek(sec)}
          disabled={!started || item.kind === "break" || !(live || state === "paused")}
          label={t("booth.nowCard.seek_label")}
          hint={t("booth.nowCard.seek_hint")}
          testId="booth-seek"
        />
        <span className="tabular-nums text-right">-{durationLabel(remaining)}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          {item.kind === "track" && (
            <span
              className="flex items-center gap-1"
              role="img"
              aria-label={t("booth.nowCard.of", { p1: k + 1, length: tandaItems.length })}
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
            {statusText ??
              (item.kind === "cortina"
                ? t("booth.nowCard.cortina")
                : t("booth.nowCard.of", { p1: k + 1, length: tandaItems.length }))}
          </span>
        </div>
        <span
          className="booth-big"
          data-testid="booth-remaining"
          role="timer"
          aria-label={t("booth.nowCard.remaining_in_this_song")}
        >
          {live || state === "paused" ? durationLabel(remaining) : durationLabel(length)}
        </span>
      </div>
      <Meter className="mt-3" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className="booth-chip"
          data-testid="booth-source"
          data-hint={t("booth.nowCard.where_this_song_plays_from_your")}
        >
          {src === "missing" && item.kind !== "break"
            ? rehearsal
              ? t("booth.nowCard.no_30_s_clip_of_this")
              : t("booth.nowCard.nothing_to_play_this_song_from")
            : SOURCE_LABEL[src]}
        </span>
        {current && (
          <span
            className="booth-chip tabular-nums"
            data-testid="booth-gain"
            data-hint={t("booth.nowCard.the_level_correction_that_keeps_every")}
          >
            {t("booth.nowCard.db", {
              p1: current.gainDb > 0 ? "+" : "",
              gainDb: current.gainDb.toFixed(1),
              p2: current.peakCapped ? t("booth.nowCard.peak_capped") : "",
              p3:
                current.gainFrom === "prior"
                  ? t("booth.nowCard.estimated_from_a_preview")
                  : current.gainFrom === "none"
                    ? t("booth.nowCard.no_measurement")
                    : "",
            })}
          </span>
        )}
        {item.birthday && <span className="booth-chip">{t("booth.nowCard.birthday_vals")}</span>}
        {ducked && (
          <span className="booth-chip" data-testid="booth-ducked">
            {t("booth.nowCard.talk_over_12_db")}
          </span>
        )}
        {/* the source badge already says "30 s rehearsal" when the item plays from a preview */}
        {rehearsal && src !== "preview" && (
          <span className="booth-chip">{t("booth.nowCard.30_s_rehearsal")}</span>
        )}
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
            data-hint={t("booth.nowCard.the_song_plays_to_its_end")}
          >
            <ListEnd size={16} strokeWidth={2} aria-hidden /> {t("booth.nowCard.end_tanda_after_this_song")}
          </button>
        )}
        {onInfo && item.kind !== "break" && (
          <button
            type="button"
            className="booth-tool"
            onClick={() => onInfo(planIndex)}
            data-testid="booth-now-info"
            data-hint={t("booth.nowCard.versions_cue_and_stop_bpm_and")}
          >
            <Info size={16} strokeWidth={2} aria-hidden /> {t("booth.nowCard.song_info")}
          </button>
        )}
      </div>
      {/* round 18: say which items cannot be rehearsed and why, instead of skipping them silently */}
      {rehearsal && notRehearsable.length > 0 && (
        <details className="booth-norehearse mt-2" data-testid="booth-skipped">
          <summary className="text-footnote text-[var(--label-2)]">
            {t("booth.nowCard.not_rehearsable_no_clip_of_the", { length: notRehearsable.length })}
          </summary>
          <ul className="text-footnote mt-1 grid gap-0.5 text-[var(--label-2)]">
            {notRehearsable.map((x) => (
              <li key={x.i}>
                <span className="text-[var(--label)]">{x.title}</span> · {x.why}
              </li>
            ))}
          </ul>
          <p className="text-footnote mt-1 text-[var(--label-3)]">
            {t("booth.nowCard.they_are_left_out_of_the")}
          </p>
        </details>
      )}
    </section>
  );
}
