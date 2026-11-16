"use client";
import { Info } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import type { AutoHold } from "@/lib/booth/autoMaster";
import { isEstimate, type NormalisationPath, type SongLoudness } from "@/lib/booth/level";
import { attachLevels, clearClip, stopAuto, useLevels } from "@/lib/booth/levelRuntime";
import { useBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { cancelPowerFrame, powerFrame, useSaving } from "@/lib/power";
import "./level.css";

/**
 * Level meter (round7-booth.md §4; 2026-11 "the decibel shower doesn't work"): the room's output after the master,
 * −60…0 dBFS — the bar is the sample peak with PPM ballistics, a tick holds the peak, marks at −18 (the loudness
 * target's region), −6 and −1 (the peak cap), red above −1 dBFS, and the clip light. Files and clips only: Spotify and
 * YouTube play outside the page's audio, so there the side's level known from data and the gain applied to it show
 * instead (`KnownLevel`). With Auto master on, its boost shows here with a one-tap Stop.
 */
const MIN = -60;
const pos = (db: number, w: number) => ((Math.max(MIN, Math.min(0, db)) - MIN) / -MIN) * w;

export const fmtDb = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined || !Number.isFinite(v) ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;

/** where a side's level comes from, in words ("estimate from Deezer", "measured from your file") */
export const levelFromText = (s: Pick<SongLoudness, "from">): string =>
  t(
    s.from === "file"
      ? "booth.level.from_file"
      : s.from === "clip"
        ? "booth.level.from_clip"
        : s.from === "deezer"
          ? "booth.level.from_deezer"
          : s.from === "spotify"
            ? "booth.level.from_spotify"
            : "booth.level.from_catalogue",
  );

/** "-11.8 LUFS (estimate from Deezer)" for the notes; null when unknown */
export function songLoudnessText(s: SongLoudness | null): string | null {
  if (!s) return null;
  return `${t("booth.level.lufs_value", { db: fmtDb(s.lufs) })} (${levelFromText(s)})`;
}

/** what the night does to the side: "turned down 4.2 dB", "at full volume", "not changed here"; null when unknown */
export function appliedText(applied: number | null, norm: NormalisationPath): string | null {
  if (applied === null) return null;
  if (norm !== "sdk" && norm !== "graph") return t("booth.level.not_changed");
  return applied < -0.05
    ? t("booth.level.turned_down", { db: Math.abs(applied).toFixed(1) })
    : t("booth.level.full_volume");
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
  // Battery saver: the Now card's always-on meter rests; the Controls panel's and Mix's (open panels) draw at 4 fps
  const rest = useSaving() && testId === "booth-meter";
  useEffect(() => (rest ? undefined : attachLevels()), [rest]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || rest) return;
    let raf = 0;
    let last = 0;
    // 2026-11 (the sidebar's lag): the size from a ResizeObserver and the colours read once a second, never a
    // style or layout read per frame (one forced a style and layout pass of the whole Booth on every frame while the
    // page moved)
    let w = el.clientWidth;
    let h = el.clientHeight;
    const ro =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(([e]) => {
            w = Math.round(e?.contentRect.width ?? w);
            h = Math.round(e?.contentRect.height ?? h);
          })
        : null;
    ro?.observe(el);
    let colours: { track: string; ok: string; warn: string; red: string; label: string; fg: string } | null =
      null;
    let coloursAt = 0;
    const draw = (now: number) => {
      raf = powerFrame(draw);
      if (now - last < (reduced ? 100 : 33)) return;
      last = now;
      const { peakDb, holdDb, clip } = useLevels.getState().reading;
      el.dataset.peak = Number.isFinite(peakDb) ? peakDb.toFixed(1) : "";
      el.dataset.clip = clip ? "1" : "0";
      const dpr = window.devicePixelRatio || 1;
      if (!w || !h) return;
      if (el.width !== w * dpr || el.height !== h * dpr) {
        el.width = w * dpr;
        el.height = h * dpr;
      }
      const g = el.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      if (!colours || now - coloursAt > 1000) {
        coloursAt = now;
        const cs = getComputedStyle(el);
        colours = {
          track: cs.getPropertyValue("--fill-4") || "rgba(255,255,255,.08)",
          ok: cs.getPropertyValue("--system-green") || "#34c759",
          warn: cs.getPropertyValue("--system-gold") || "#e8b85a",
          red: cs.getPropertyValue("--destructive") || "#ff6b6b",
          label: cs.getPropertyValue("--label-3") || "rgba(255,255,255,.3)",
          fg: cs.color || "#fff",
        };
      }
      const { track, ok, warn, red, label } = colours;
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
        g.fillStyle = holdDb > -1 ? red : colours.fg;
        g.fillRect(Math.round(pos(holdDb, w)) - 1, 0, 2, h);
      }
      if (clip) {
        g.fillStyle = red;
        g.fillRect(w - 4, 0, 4, h);
      }
    };
    raf = powerFrame(draw);
    return () => {
      cancelPowerFrame(raf);
      ro?.disconnect();
    };
  }, [reduced, rest]);
  return (
    <canvas
      ref={canvas}
      className={`block w-full rounded-full text-[var(--label)] ${className}`}
      role="img"
      aria-label={t("booth.meter.output_level")}
      data-testid={testId}
      data-rest={rest || undefined}
    />
  );
}

/* the static bar's scale, LUFS (a quiet 78 rpm transfer to a loud remaster) */
const EST_MIN = -36;
const EST_MAX = -6;
const estPct = (lufs: number) =>
  `${(((Math.max(EST_MIN, Math.min(EST_MAX, lufs)) - EST_MIN) / (EST_MAX - EST_MIN)) * 100).toFixed(1)}%`;

/** the full explanation behind ⓘ: why the level comes from data, and what the night does with it */
export function levelWhyText(live: string, norm: NormalisationPath, target: number): string {
  const how =
    norm === "sdk"
      ? t("booth.level.norm_sdk", { target })
      : norm === "spotify"
        ? t("booth.level.norm_connect")
        : t("booth.level.norm_none");
  return `${live === "youtube" ? t("booth.level.live_youtube") : t("booth.level.live_spotify")} ${how}`;
}

/**
 * 2026-11 (the owner on "Level not available from Spotify") — Spotify and YouTube play outside the page's audio, so
 * there is no live meter there: the side's level known from data instead (lib/booth/sideLevel.ts), with the gain the
 * night applies to it. A static bar, never bouncing: striped for an estimate, solid for a measurement; the part the
 * night turns down is shown as cut, a tick marks the night's target. Unknown: one plain sentence saying what to do.
 * `compact` (the Mixer's title line): the bar and the numbers only, the source in the tooltip.
 */
export function KnownLevel({
  testId = "booth-meter-est",
  compact = false,
  explain = true,
}: {
  testId?: string;
  compact?: boolean;
  /** the ⓘ explanation (off where the same words already stand below: the room sheet's note) */
  explain?: boolean;
}) {
  const live = useLevels((s) => s.live);
  const song = useLevels((s) => s.song);
  const applied = useLevels((s) => s.applied);
  const norm = useLevels((s) => s.norm);
  const target = useBooth((s) => s.settings.loudnessTargetLUFS);
  const [why, setWhy] = useState(false);
  const whyId = useId();
  // keep the level loop running while this stands in for the meter (it follows the next side)
  useEffect(() => attachLevels(), []);
  if (!song)
    return (
      <span
        className="booth-meter-na block text-caption1 text-[var(--label-2)]"
        data-testid={testId}
        data-unknown="1"
        role="status"
      >
        {t("booth.level.unknown")}
      </span>
    );
  const est = isEstimate(song);
  const level = t("booth.level.lufs_value", { db: fmtDb(song.lufs) });
  const gain = appliedText(applied, norm);
  const from = levelFromText(song);
  const heard = song.lufs + Math.min(0, applied ?? 0);
  return (
    <div
      className={`booth-meter-est ${compact ? "booth-meter-est-compact" : ""}`}
      data-testid={testId}
      data-from={song.from}
      data-estimate={est ? "1" : "0"}
      data-lufs={song.lufs.toFixed(1)}
      data-applied={applied === null ? "" : applied.toFixed(1)}
      title={compact ? `${level} · ${from}${gain ? ` · ${gain}` : ""}` : undefined}
    >
      <span
        className="booth-est-bar"
        role="img"
        aria-label={t("booth.level.estimate_aria", { db: fmtDb(song.lufs), from })}
        data-estimate={est ? "1" : "0"}
      >
        <span className="booth-est-fill" style={{ width: estPct(heard) }} />
        {heard < song.lufs - 0.05 && (
          <span
            className="booth-est-cut"
            style={{ left: estPct(heard), width: `calc(${estPct(song.lufs)} - ${estPct(heard)})` }}
          />
        )}
        <span className="booth-est-target" style={{ left: estPct(target) }} />
      </span>
      <span className="booth-est-text text-caption1 tabular-nums" role="status">
        <span className="text-[var(--label)]" data-testid={`${testId}-text`}>
          {level}
          {gain ? ` · ${gain}` : ""}
        </span>
        {!compact && <span className="booth-est-from text-[var(--label-2)]"> · {from}</span>}
        {!compact && explain && (
          <button
            type="button"
            className="booth-est-why"
            aria-expanded={why}
            aria-controls={whyId}
            aria-label={t("booth.level.why")}
            title={t("booth.level.why")}
            data-testid={`${testId}-why`}
            onClick={() => setWhy((v) => !v)}
          >
            <Info size={14} strokeWidth={2} aria-hidden />
          </button>
        )}
      </span>
      {!compact && explain && why && (
        <p
          id={whyId}
          className="booth-est-note text-caption1 text-[var(--label-2)]"
          data-testid={`${testId}-note`}
        >
          {levelWhyText(live, norm, target)}
        </p>
      )}
    </div>
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
        <KnownLevel />
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
