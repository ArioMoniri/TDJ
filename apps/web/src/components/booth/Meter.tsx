"use client";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import type { AutoHold } from "@/lib/booth/autoMaster";
import type { SongLoudness } from "@/lib/booth/level";
import { attachLevels, clearClip, stopAuto, useLevels } from "@/lib/booth/levelRuntime";
import { t } from "@/lib/i18n";
import "./level.css";

/**
 * Level meter (round7-booth.md §4; 2026-11 "the decibel shower doesn't work"): the room's output after the master,
 * −60…0 dBFS — the bar is the sample peak with PPM ballistics, a tick holds the peak, marks at −18 (the loudness
 * target's region), −6 and −1 (the peak cap), red above −1 dBFS, and the clip light. Files and clips only: Spotify and
 * YouTube play outside the page's audio, so the meter says so and shows the side's known loudness instead of a dead
 * bar. With Auto master on, its boost shows here with a one-tap Stop.
 */
const MIN = -60;
const pos = (db: number, w: number) => ((Math.max(MIN, Math.min(0, db)) - MIN) / -MIN) * w;

export const fmtDb = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

export function songLoudnessText(s: SongLoudness | null): string | null {
  if (!s) return null;
  return t(
    s.from === "file"
      ? "booth.level.song_file"
      : s.from === "clip"
        ? "booth.level.song_clip"
        : "booth.level.song_catalogue",
    { db: fmtDb(s.lufs) },
  );
}

/** The bar on a canvas (shared by the Now card and the Mixer). */
export function MeterBar({
  className = "",
  testId = "booth-meter",
}: {
  className?: string;
  testId?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => attachLevels(), []);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let raf = 0;
    let last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < (reduced ? 100 : 33)) return;
      last = now;
      const { peakDb, holdDb, clip } = useLevels.getState().reading;
      el.dataset.peak = Number.isFinite(peakDb) ? peakDb.toFixed(1) : "";
      el.dataset.clip = clip ? "1" : "0";
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      if (el.width !== w * dpr || el.height !== h * dpr) {
        el.width = w * dpr;
        el.height = h * dpr;
      }
      const g = el.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const cs = getComputedStyle(el);
      const track = cs.getPropertyValue("--fill-4") || "rgba(255,255,255,.08)";
      const ok = cs.getPropertyValue("--system-green") || "#34c759";
      const warn = cs.getPropertyValue("--system-gold") || "#e8b85a";
      const red = cs.getPropertyValue("--destructive") || "#ff6b6b";
      const label = cs.getPropertyValue("--label-3") || "rgba(255,255,255,.3)";
      g.fillStyle = track;
      g.fillRect(0, 0, w, h);
      const x = Number.isFinite(peakDb) ? pos(peakDb, w) : 0;
      g.fillStyle = ok;
      g.fillRect(0, 0, Math.min(x, pos(-6, w)), h);
      if (x > pos(-6, w)) {
        g.fillStyle = warn;
        g.fillRect(pos(-6, w), 0, Math.min(x, pos(-1, w)) - pos(-6, w), h);
      }
      if (x > pos(-1, w)) {
        g.fillStyle = red;
        g.fillRect(pos(-1, w), 0, x - pos(-1, w), h);
      }
      g.fillStyle = label;
      for (const m of [-18, -6, -1]) g.fillRect(Math.round(pos(m, w)) - 0.5, 0, 1, h);
      if (Number.isFinite(holdDb) && holdDb > MIN) {
        g.fillStyle = holdDb > -1 ? red : cs.color || "#fff";
        g.fillRect(Math.round(pos(holdDb, w)) - 1, 0, 2, h);
      }
      if (clip) {
        g.fillStyle = red;
        g.fillRect(w - 4, 0, 4, h);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [reduced]);
  return (
    <canvas
      ref={canvas}
      className={`block w-full rounded-full text-[var(--label)] ${className}`}
      role="img"
      aria-label={t("booth.meter.output_level")}
      data-testid={testId}
    />
  );
}

/** "Level not available from Spotify" and the side's known loudness (no dead bar). */
export function NoMeter({ testId = "booth-meter-na" }: { testId?: string }) {
  const live = useLevels((s) => s.live);
  const song = useLevels((s) => s.song);
  const txt = songLoudnessText(song);
  return (
    <p className="text-caption1 text-[var(--label-2)]" data-testid={testId} role="status">
      {live === "youtube" ? t("booth.level.na_youtube") : t("booth.level.na_spotify")}
      {txt ? ` · ${txt}` : ""}
    </p>
  );
}

export const holdText = (h: AutoHold): string =>
  ({
    cortina: t("booth.level.hold_cortina"),
    talk: t("booth.level.hold_talk"),
    muted: t("booth.level.hold_muted"),
    paused: t("booth.level.hold_paused"),
    gap: t("booth.level.hold_gap"),
    starting: t("booth.level.hold_starting"),
  })[h];

/** The Auto master indicator with its one-tap Stop (shown only while on, or while its boost ramps back). */
export function AutoBadge({ testId = "booth-auto-badge" }: { testId?: string }) {
  const a = useLevels((s) => s.auto);
  if (!a.enabled && a.db < 0.05) return null;
  const why = a.hold ? holdText(a.hold) : null;
  return (
    <button
      type="button"
      className="booth-chip booth-auto-badge"
      data-testid={testId}
      data-on={a.enabled ? "1" : "0"}
      onClick={() => stopAuto()}
      aria-label={t("booth.level.auto_stop_aria", { db: fmtDb(a.db) })}
      title={why ?? undefined}
    >
      <span className="booth-auto-dot" aria-hidden />
      <span className="tabular-nums">
        {a.enabled
          ? t("booth.level.auto_on", { db: fmtDb(a.db) })
          : t("booth.level.auto_returning", { db: fmtDb(a.db) })}
      </span>
      {a.enabled && <span className="booth-auto-stop">{t("booth.level.stop")}</span>}
    </button>
  );
}

export function Meter({ className = "" }: { className?: string }) {
  const live = useLevels((s) => s.live);
  const clip = useLevels((s) => s.reading.clip);
  const st = useLevels((s) => s.reading.shortTermLufs);
  const external = live === "spotify" || live === "youtube";
  return (
    <div className={`booth-meter ${className}`} data-live={live}>
      {external ? (
        <NoMeter />
      ) : (
        <div className="flex items-center gap-2">
          <MeterBar className="h-2 min-w-0 flex-1" />
          <span
            className="booth-meter-lufs text-caption2 tabular-nums text-[var(--label-2)]"
            data-testid="booth-meter-lufs"
          >
            {t("booth.level.lufs_value", { db: Number.isFinite(st) ? Math.round(st) : "–" })}
          </span>
          {clip && (
            <button
              type="button"
              className="booth-clip"
              data-testid="booth-clip"
              onClick={() => clearClip()}
              aria-label={t("booth.level.clip_clear")}
            >
              {t("booth.level.clip")}
            </button>
          )}
        </div>
      )}
      <AutoBadge />
    </div>
  );
}
