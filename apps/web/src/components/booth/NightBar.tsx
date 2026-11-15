"use client";
import { Cake, Coffee, FastForward, Flag, ListChecks } from "lucide-react";
import { useEffect, useState } from "react";
import { clockLabel, driftLabel, durationLabel, remainingFrom } from "@/lib/booth/plan";
import { useBooth } from "@/lib/booth/store";
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
  const full = rehearsal && !started ? remainingFrom(plan, planIndex, 0) : null;
  const live = state === "playing" || state === "cortina";
  const hasClosing = !!playlist?.closing;
  return (
    <section
      className="booth-night"
      data-testid="booth-time"
      aria-label="The night"
      data-ttc={Math.round(ttc)}
      data-remaining={Math.round(remaining)}
    >
      <div className="booth-night-row">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0">
          <span className="booth-clock" data-testid="booth-clock" data-hint="The time now">
            {now ? clockLabel(now) : "--:--"}
          </span>
          <span className="text-subhead text-[var(--label-2)]" data-hint="When the night ends at this pace">
            ends {now ? clockLabel(end) : "--:--"}
            {rehearsal ? " · rehearsal" : ""}
          </span>
        </div>
        <div className="text-right" data-hint="How long until La Cumparsita, the last song of the night">
          <p className="booth-eyebrow booth-eyebrow-wrap">Time to La Cumparsita</p>
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
          {started
            ? `${driftLabel(drift)} ${drift > 1 ? "late" : drift < -1 ? "early" : "on plan"}`
            : "not started"}
        </span>
        <span className="booth-chip">
          {left} tanda{left === 1 ? "" : "s"} left
        </span>
        {full && (
          <span
            className="booth-chip tabular-nums"
            data-testid="booth-full-night"
            data-remaining={Math.round(full.remainingSec)}
            data-hint="The night played in full from the Spotify recordings"
          >
            full night {durationLabel(full.remainingSec)}
            {now ? ` · ends ${clockLabel(now + full.remainingSec * 1000)}` : ""}
          </span>
        )}
        {resolving && !started && (
          <span className="booth-chip" data-testid="booth-resolving">
            resolving sources…
          </span>
        )}
        {breakUntil !== null && (
          <span className="booth-chip text-[var(--tint)]" data-testid="booth-break">
            break · {durationLabel(Math.max(0, (breakUntil - now) / 1000))}
          </span>
        )}
      </div>
      <fieldset className="booth-night-actions" aria-label="Night tools">
        {hasClosing && (
          <button
            type="button"
            className="booth-tool"
            disabled={!live}
            data-testid="booth-rest-cumparsita"
            data-hint="This tanda plays to its end, then La Cumparsita closes the night; the tandas between are left out"
            onClick={() => {
              void b.jumpToClosing(false);
              toast("La Cumparsita follows this tanda");
            }}
          >
            <Flag size={16} strokeWidth={2} aria-hidden /> Rest, then La Cumparsita
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
            <FastForward size={16} strokeWidth={2} aria-hidden /> La Cumparsita now…
          </button>
        )}
        <button
          type="button"
          className="booth-tool"
          aria-pressed={lastFour}
          data-testid="booth-last4"
          data-hint="The vals and milonga tandas among the last four are skipped tonight: the night ends on tangos"
          onClick={() => void b.setLastFourTango(!lastFour)}
        >
          <ListChecks size={16} strokeWidth={2} aria-hidden /> Last 4 tandas tango only
        </button>
        <button
          type="button"
          className="booth-tool"
          disabled={!started}
          data-testid="booth-night-break"
          data-hint="A timed break after the song playing; Play ends it early"
          onClick={onBreak}
        >
          <Coffee size={16} strokeWidth={2} aria-hidden /> Break…
        </button>
        <button
          type="button"
          className="booth-tool"
          disabled={!started}
          data-testid="booth-night-birthday"
          data-hint="Marks the next vals tanda for a birthday: the player holds before it (b)"
          onClick={() => b.birthdayVals()}
        >
          <Cake size={16} strokeWidth={2} aria-hidden /> Birthday vals
        </button>
      </fieldset>
      <Sheet
        open={jump}
        onClose={() => setJump(false)}
        title="La Cumparsita now?"
        detents={["medium"]}
        testId="booth-jump-sheet"
      >
        <Group footer="The song playing fades out and La Cumparsita closes the night. Everything between is left out tonight (it stays in the set).">
          <button
            type="button"
            className="cell cell-tap w-full justify-center font-semibold text-[var(--destructive)]"
            data-testid="booth-jump-confirm"
            onClick={() => {
              void b.jumpToClosing(true);
              setJump(false);
            }}
          >
            Play La Cumparsita now
          </button>
        </Group>
      </Sheet>
    </section>
  );
}
