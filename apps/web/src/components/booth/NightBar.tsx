"use client";
import { bypassedTandas } from "@tdj/core";
import { Cake, Clock3, Coffee, FastForward, Flag, ListChecks } from "lucide-react";
import { useEffect, useState } from "react";
import { driftWords, lastFourChange, ttcCaption } from "@/lib/booth/nightView";
import { clockLabel, durationLabel, remainingFrom } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { plural, t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { Group } from "../Form";
import { Sheet } from "../Sheet";
import { ChangeEndSheet } from "./ChangeEndSheet";

/**
 * Round 22 — the night bar on top of the set list: the clock, the planned end, time to La Cumparsita, drift and
 * tandas left (was the Time card), and the night's own tools where a DJ looks for them: Play the rest then La
 * Cumparsita, Jump to La Cumparsita now (confirmed), Last 4 tandas tango only, Break, Birthday vals.
 */
/** the night's music (songs and cortinas as they play) and the Booth's gaps between them (breaks apart) */
export function nightTotals(
  plan: Parameters<typeof remainingFrom>[0],
  skipped: ReadonlySet<number>,
): { music: number; gaps: number } {
  const all = remainingFrom(plan, 0, 0, { skipped }).remainingSec;
  let music = 0;
  let breaks = 0;
  plan.items.forEach((it, i) => {
    if (skipped.has(i)) return;
    if (it.kind === "break") breaks += it.lengthSec;
    else music += it.lengthSec;
  });
  return { music, gaps: Math.max(0, all - music - breaks) };
}

export function NightBar({ onBreak }: { onBreak: () => void }) {
  const plan = useBooth((s) => s.plan);
  const planIndex = useBooth((s) => s.planIndex);
  const remaining = useBooth((s) => s.remaining);
  const ttc = useBooth((s) => s.timeToCumparsita);
  const drift = useBooth((s) => s.drift);
  const breakUntil = useBooth((s) => s.breakUntil);
  const started = useBooth((s) => s.started);
  const startedWall = useBooth((s) => s.startedWall);
  const rehearsal = useBooth((s) => s.rehearsal);
  const resolving = useBooth((s) => s.resolving);
  const playlist = useBooth((s) => s.playlist);
  const state = useBooth((s) => s.state);
  const sources = useBooth((s) => s.sources);
  const bypassed = useBooth((s) => s.bypassed);
  const lastFour = !!playlist?.options.rules?.lastFourTango;
  const [jump, setJump] = useState(false);
  // 2026-11: "Change the end…" (booth/ChangeEndSheet.tsx)
  const [endOpen, setEndOpen] = useState(false);
  // 0 until mounted: the server cannot know the DJ's clock (a hydration mismatch otherwise)
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!plan) return null;
  const b = useBooth.getState();
  const cur = plan.items[planIndex];
  const tandas = playlist?.tandas.length ?? 0;
  const left = cur
    ? Math.max(0, tandas - (cur.kind === "closing" && cur.tanda > 0 ? tandas : cur.tanda))
    : tandas;
  const end = (started && startedWall ? startedWall : now) + remaining * 1000;
  const full =
    rehearsal && !started ? remainingFrom(plan, planIndex, 0, { skipped: new Set(bypassed) }) : null;
  const live = state === "playing" || state === "cortina";
  const hasClosing = !!playlist?.closing;
  const closingNoClip = rehearsal && sources[plan.items.length - 1] === "missing";
  const ttc0 = ttcCaption({ rehearsal, started });
  const totals = nightTotals(plan, new Set(bypassed));
  // wave 2: the switch says what it changed, with Undo
  const toggleLastFour = async () => {
    const p = useBooth.getState().playlist;
    if (!p) return;
    const on = !p.options.rules?.lastFourTango;
    const before = bypassedTandas(p);
    await b.setLastFourTango(on);
    const q = useBooth.getState().playlist;
    const after = q ? bypassedTandas(q) : before;
    toast(lastFourChange(before, after, p.tandas), () => void useBooth.getState().setLastFourTango(!on));
  };
  return (
    <section
      className="booth-night"
      data-testid="booth-time"
      aria-label={t("booth.nightBar.the_night")}
      data-ttc={Math.round(ttc)}
      data-remaining={Math.round(remaining)}
      data-compact={started || undefined}
    >
      <div className="booth-night-row">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0">
          <span
            className="booth-clock"
            data-testid="booth-clock"
            data-hint={t("booth.nightBar.the_time_now")}
          >
            {now ? clockLabel(now) : "--:--"}
          </span>
          <span
            className="text-subhead text-[var(--label-2)]"
            data-hint={t("booth.nightBar.when_the_night_ends_at_this")}
          >
            {t("booth.nightBar.ends_2", { p1: now ? clockLabel(end) : "--:--" })}
            {rehearsal ? t("booth.nightBar.rehearsal") : ""}
          </span>
        </div>
        <div className="text-right" data-hint={ttc0.explain}>
          <p className="booth-eyebrow booth-eyebrow-wrap" data-testid="booth-ttc-label">
            {ttc0.label}
          </p>
          {resolving && !started ? (
            <span
              className="booth-big block text-[var(--label-3)]"
              data-testid="booth-ttc"
              data-resolving="1"
            >
              …
            </span>
          ) : (
            <span className="booth-big block" data-testid="booth-ttc">
              {durationLabel(ttc)}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className={`booth-chip tabular-nums ${Math.abs(drift) >= 60 ? "text-[var(--system-gold)]" : ""}`}
          data-testid="booth-drift"
          data-hint={t("booth.nightBar.ahead_of_or_behind_the_planned")}
        >
          {started ? driftWords(drift) : t("booth.nightBar.not_started")}
        </span>
        <span className="booth-chip">{plural("plural.tandas_left", left)}</span>
        {/* 2026-11: the night's total and what is left of it; the music is Compose's number, the gaps are the
            Booth's own (so the two never seem to disagree) */}
        <span
          className="booth-chip tabular-nums"
          data-testid="booth-night-total"
          data-music-sec={Math.round(totals.music)}
          data-gaps-sec={Math.round(totals.gaps)}
        >
          {t("booth.nightBar.total_left", {
            total: t("booth.connect.music_gaps", {
              music: durationLabel(totals.music),
              gaps: durationLabel(totals.gaps),
            }),
            left: durationLabel(remaining),
          })}
        </span>
        {full && (
          <span
            className="booth-chip tabular-nums"
            data-testid="booth-full-night"
            data-remaining={Math.round(full.remainingSec)}
            data-hint={t("booth.nightBar.the_night_with_every_song_played")}
          >
            {t("booth.nightBar.every_song_in_full", { p1: durationLabel(full.remainingSec) })}
            {now ? t("booth.nightBar.ends", { p1: clockLabel(now + full.remainingSec * 1000) }) : ""}
          </span>
        )}
        {resolving && !started && (
          <span className="booth-chip" data-testid="booth-resolving">
            {t("booth.nightBar.resolving_sources")}
          </span>
        )}
        {breakUntil !== null && (
          <span className="booth-chip text-[var(--tint)]" data-testid="booth-break">
            {t("booth.nightBar.break_chip", { time: durationLabel(Math.max(0, (breakUntil - now) / 1000)) })}
          </span>
        )}
      </div>
      {/* 2026-11: the night's tools in two groups, one button style; once the night runs (DJ review: the set list got
          no room) one compact row of glyphs (their names on hover, long-press and to assistive tech), legends hidden */}
      <fieldset className="booth-night-group" data-testid="booth-night-ending">
        <legend>{t("booth.nightBar.group_ending")}</legend>
        <div className="booth-night-actions">
          {hasClosing && (
            <button
              type="button"
              className="booth-tool"
              disabled={!live}
              data-testid="booth-rest-cumparsita"
              aria-label={t("booth.nightBar.rest_then_la_cumparsita")}
              data-hint={t("booth.nightBar.this_tanda_plays_to_its_end")}
              onClick={() => {
                void b.jumpToClosing(false);
                toast(t("booth.nightBar.la_cumparsita_follows_this_tanda"));
              }}
            >
              <Flag size={16} strokeWidth={2} aria-hidden />
              <span className="booth-tool-l">{t("booth.nightBar.rest_then_la_cumparsita")}</span>
            </button>
          )}
          {hasClosing && (
            <button
              type="button"
              className="booth-tool"
              data-tone="destructive"
              disabled={!started}
              data-testid="booth-jump-cumparsita"
              aria-label={t("booth.nightBar.la_cumparsita_now_2")}
              data-hint={t("booth.nightBar.la_cumparsita_now_the_song_playing")}
              onClick={() => setJump(true)}
            >
              <FastForward size={16} strokeWidth={2} aria-hidden />
              <span className="booth-tool-l">{t("booth.nightBar.la_cumparsita_now_2")}</span>
            </button>
          )}
          <button
            type="button"
            className="booth-tool"
            data-testid="booth-change-end"
            aria-label={t("booth.end.button")}
            data-hint={t("booth.end.hint")}
            onClick={() => setEndOpen(true)}
          >
            <Clock3 size={16} strokeWidth={2} aria-hidden />
            <span className="booth-tool-l">{t("booth.end.button")}</span>
          </button>
          <button
            type="button"
            className="booth-tool"
            aria-pressed={lastFour}
            data-testid="booth-last4"
            aria-label={t("booth.nightBar.last_4_tandas_tango_only")}
            data-hint={t("booth.nightBar.the_vals_and_milonga_tandas_among")}
            onClick={() => void toggleLastFour()}
          >
            <ListChecks size={16} strokeWidth={2} aria-hidden />
            <span className="booth-tool-l">{t("booth.nightBar.last_4_tandas_tango_only")}</span>
          </button>
        </div>
      </fieldset>
      <fieldset className="booth-night-group" data-testid="booth-night-moments">
        <legend>{t("booth.nightBar.group_moments")}</legend>
        <div className="booth-night-actions">
          <button
            type="button"
            className="booth-tool"
            disabled={!started}
            data-testid="booth-night-break"
            aria-label={t("booth.nightBar.break")}
            data-hint={t("booth.nightBar.a_timed_break_after_the_song")}
            onClick={onBreak}
          >
            <Coffee size={16} strokeWidth={2} aria-hidden />
            <span className="booth-tool-l">{t("booth.nightBar.break")}</span>
          </button>
          <button
            type="button"
            className="booth-tool"
            disabled={!started}
            data-testid="booth-night-birthday"
            aria-label={t("booth.nightBar.birthday_vals")}
            data-hint={t("booth.nightBar.marks_the_next_vals_tanda_for")}
            onClick={() => b.birthdayVals()}
          >
            <Cake size={16} strokeWidth={2} aria-hidden />
            <span className="booth-tool-l">{t("booth.nightBar.birthday_vals")}</span>
          </button>
        </div>
      </fieldset>
      <ChangeEndSheet open={endOpen} onClose={() => setEndOpen(false)} endMs={end} />
      <Sheet
        open={jump}
        onClose={() => setJump(false)}
        title={t("booth.nightBar.la_cumparsita_now")}
        detents={["medium"]}
        testId="booth-jump-sheet"
      >
        <Group
          footer={t("booth.nightBar.the_song_playing_fades_out_and", {
            p1: closingNoClip ? t("booth.nightBar.the_rehearsal_has_no_30_s") : "",
          })}
        >
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold text-[var(--destructive)]"
            data-testid="booth-jump-confirm"
            onClick={() => {
              void b.jumpToClosing(true);
              setJump(false);
            }}
          >
            {t("booth.nightBar.play_la_cumparsita_now")}
          </button>
        </Group>
      </Sheet>
    </section>
  );
}
