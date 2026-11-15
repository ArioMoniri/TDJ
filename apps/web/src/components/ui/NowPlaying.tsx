"use client";
import { t } from "@/lib/i18n";

/** the animated bars of the row that is playing (static while it is paused) */
export function NowBars({ on, className = "" }: { on: boolean; className?: string }) {
  return (
    <span
      className={`wave text-[var(--tint)] ${className}`}
      data-on={on || undefined}
      data-testid="now-bars"
      role="img"
      aria-label={on ? t("play.now_playing") : t("play.paused")}
    >
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** the small "No audio" hint on a row nothing can play (the tap says why) */
export function NoAudio() {
  return (
    <span
      className="no-audio text-caption2 shrink-0 rounded-full px-1.5 py-0.5 font-medium"
      data-testid="no-audio"
    >
      {t("play.no_audio_hint")}
    </span>
  );
}
