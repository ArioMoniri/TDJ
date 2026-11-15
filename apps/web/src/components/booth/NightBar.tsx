"use client";
import { bypassedTandas } from "@tdj/core";
import { Cake, Coffee, FastForward, Flag, ListChecks } from "lucide-react";
import { useEffect, useState } from "react";
import { driftWords, lastFourChange, ttcCaption } from "@/lib/booth/nightView";
import { clockLabel, durationLabel, remainingFrom } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { Group } from "../Form";
import { Sheet } from "../Sheet";

/**
 * Round 22 — the night bar on top of the set list: the clock, the planned end, time to La Cumparsita, drift and
 * tandas left (was the Time card), and the night's own tools where a DJ looks for them: Play the rest then La
 * Cumparsita, Jump to La Cumparsita now (confirmed), Last 4 tandas tango only, Break, Birthday vals.
 */
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
    >
      <div className="booth-night-row">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0">
          <span className="booth-clock" data-testid="booth-clock" data-hint="The time now">
            {now ? clockLabel(now) : "--:--"}
          </span>
          <span className="text-subhead text-[var(--label-2)]" data-hint="When the night ends at this pace">
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
          data-hint="Ahead of or behind the planned clock"
        >
          {started ? driftWords(drift) : t("booth.nightBar.not_started")}
        </span>
        <span className="booth-chip">
          {t("booth.nightBar.tanda_left", { left, p1: left === 1 ? "" : "s" })}
        </span>
        {full && (
          <span
            className="booth-chip tabular-nums"
            data-testid="booth-full-night"
            data-remaining={Math.round(full.remainingSec)}
            data-hint="The night with every song played in full (the rehearsal plays 30 s of each)"
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
            {t("booth.nightBar.break", { time: durationLabel(Math.max(0, (breakUntil - now) / 1000)) })}
          </span>
        )}
      </div>
      <fieldset className="booth-night-actions" aria-label={t("booth.nightBar.night_tools")}>
        {hasClosing && (
          <button
            type="button"
            className="booth-tool"
            disabled={!live}
            data-testid="booth-rest-cumparsita"
            data-hint="This tanda plays to its end, then La Cumparsita closes the night; the tandas between are left out"
            onClick={() => {
              void b.jumpToClosing(false);
              toast(t("booth.nightBar.la_cumparsita_follows_this_tanda"));
            }}
          >
            <Flag size={16} strokeWidth={2} aria-hidden /> {t("booth.nightBar.rest_then_la_cumparsita")}
          </button>
        )}
        {hasClosing && (
          <button
            type="button"
            className="booth-tool"
            data-tone="destructive"
            disabled={!started}
            data-testid="booth-jump-cumparsita"
            data-hint="La Cumparsita now: the song playing fades out (asks first)"
            onClick={() => setJump(true)}
          >
            <FastForward size={16} strokeWidth={2} aria-hidden /> {t("booth.nightBar.la_cumparsita_now_2")}
          </button>
        )}
        <button
          type="button"
          className="booth-tool"
          aria-pressed={lastFour}
          data-testid="booth-last4"
          data-hint="The vals and milonga tandas among the last four are skipped tonight: the night ends on tangos"
          onClick={() => void toggleLastFour()}
        >
          <ListChecks size={16} strokeWidth={2} aria-hidden /> {t("booth.nightBar.last_4_tandas_tango_only")}
        </button>
        <button
          type="button"
          className="booth-tool"
          disabled={!started}
          data-testid="booth-night-break"
          data-hint="A timed break after the song playing; Play ends it early"
          onClick={onBreak}
        >
          <Coffee size={16} strokeWidth={2} aria-hidden /> {t("booth.nightBar.break")}
        </button>
        <button
          type="button"
          className="booth-tool"
          disabled={!started}
          data-testid="booth-night-birthday"
          data-hint="Marks the next vals tanda for a birthday: the player holds before it (b)"
          onClick={() => b.birthdayVals()}
        >
          <Cake size={16} strokeWidth={2} aria-hidden /> {t("booth.nightBar.birthday_vals")}
        </button>
      </fieldset>
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
