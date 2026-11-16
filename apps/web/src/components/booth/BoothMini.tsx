"use client";
import { Pause, Play, SkipForward, Volume2, VolumeX } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { type PointerEvent, useEffect, useRef, useState } from "react";
import { guard, useArmed } from "@/lib/booth/confirm";
import type { useBooth as UseBooth } from "@/lib/booth/store";
import { t } from "@/lib/i18n";
import { Artwork } from "../ui/Artwork";
import { ConfirmRing, useHoldConfirm } from "./Confirm";
import "./mini.css";

type BoothStore = typeof UseBooth;
type BoothState = ReturnType<BoothStore["getState"]>;
type EngineLike = { currentLength: () => number } | null;

/** the Booth's store, once the Booth page made it (read through `window`, so this bar adds no engine to the pages) */
const boothStore = (): BoothStore | null =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { __tdjBooth?: BoothStore }).__tdjBooth ?? null);
const boothEngine = (): EngineLike =>
  typeof window === "undefined"
    ? null
    : ((window as unknown as { __tdjBoothEngine?: () => EngineLike }).__tdjBoothEngine?.() ?? null);

const clock = (sec: number) => {
  const n = Math.max(0, Math.round(sec));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = String(n % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
};

/** the night is on: playing, a cortina, paused or held mid-night (the room is the Booth's) */
export function nightOn(s: Pick<BoothState, "started" | "state"> | null): boolean {
  return !!s?.started && s.state !== "idle" && s.state !== "stopped";
}

function useBoothSnapshot(path: string | null) {
  const [snap, setSnap] = useState<BoothState | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new page may be the first to see the Booth's store
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const attach = () => {
      const st = boothStore();
      if (!st) return false;
      setSnap(st.getState());
      // the store ticks ~30 fps while a night runs: the bar redraws at most 4 times a second
      let last = 0;
      let pending: ReturnType<typeof setTimeout> | null = null;
      const sub = st.subscribe((s) => {
        const now = Date.now();
        if (now - last >= 250) {
          last = now;
          setSnap(s);
        } else if (!pending)
          pending = setTimeout(() => {
            pending = null;
            last = Date.now();
            setSnap(st.getState());
          }, 250);
      });
      unsub = () => {
        sub();
        if (pending) clearTimeout(pending);
      };
      return true;
    };
    if (!attach()) timer = setInterval(() => attach() && timer && clearInterval(timer), 1000);
    return () => {
      unsub?.();
      if (timer) clearInterval(timer);
    };
  }, [path]);
  return snap;
}

/**
 * 2026-11 (the owner: "when switching to other tabs while a night is playing, there should be a song controller on
 * screen always") — the Booth's night on every other page: the cover (tap → back to the Booth), the title and
 * orchestra, "Tanda N of M · next in …", Play / Pause, Next (press and hold mid-night, as on the Booth's transport),
 * a compact seek bar (tap to arm, tap again to jump), Mute, and what the night is doing (Starting…, paused or held,
 * with Resume). Above the tab bar on a phone, at the content column's foot on an iPad or a desktop. While it shows,
 * the preview mini player steps aside (a tap on another page pre-listens in the headphones, lib/playback.ts).
 */
export function BoothMini() {
  const path = usePathname();
  const router = useRouter();
  const s = useBoothSnapshot(path);
  const onBooth = path === "/booth" || path?.startsWith("/booth/");
  const show = !onBooth && nightOn(s);
  const box = useRef<HTMLElement>(null);
  // the pages clear the bar (globals: --booth-mini-h), and the preview mini player steps aside while it shows
  useEffect(() => {
    const root = document.documentElement;
    const el = box.current;
    if (!show || !el) {
      delete root.dataset.boothMini;
      root.style.removeProperty("--booth-mini-h");
      return;
    }
    root.dataset.boothMini = "1";
    const put = () => root.style.setProperty("--booth-mini-h", `${Math.ceil(el.offsetHeight)}px`);
    put();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(put) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      delete root.dataset.boothMini;
      root.style.removeProperty("--booth-mini-h");
    };
  }, [show]);
  const next = useHoldConfirm("next", () => void boothStore()?.getState().nextNow());
  const seekArmed = useArmed("mini-seek");
  const [seekTo, setSeekTo] = useState<number | null>(null);
  if (!show || !s?.plan) return null;
  const st = boothStore()!;
  const items = s.plan.items;
  const it = items[s.planIndex];
  if (!it) return null;
  const tandas = s.playlist?.tandas.length ?? 0;
  const live = s.state === "playing" || s.state === "cortina";
  const len = boothEngine()?.currentLength() ?? it.lengthSec;
  const pos = Math.max(0, Math.min(len, s.position));
  const held = s.holding || (s.holdBefore !== null && s.holdBefore !== undefined);
  const entity = s.entities[s.planIndex] ?? null;
  const orchestra = (entity as { orchestra?: string } | null)?.orchestra ?? it.artist;
  const status = s.starting
    ? t("booth.ui2.mini_starting")
    : !live && s.state === "paused"
      ? t("booth.ui2.mini_paused")
      : held
        ? t("booth.ui2.mini_held")
        : null;
  const where =
    it.tanda > 0 && it.tanda <= tandas ? t("booth.ui2.mini_tanda", { tanda: it.tanda, count: tandas }) : "";
  const when = [
    where,
    live ? t("booth.ui2.mini_to_next", { time: clock(len - pos) }) : "",
    s.timeToCumparsita > 0 ? t("booth.ui2.mini_to_cumparsita", { time: clock(s.timeToCumparsita) }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const back = () => router.push("/booth");
  const onSeek = (e: PointerEvent<HTMLDivElement>) => {
    if (!live || len <= 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const sec = Math.max(0, Math.min(len - 0.5, ((e.clientX - r.left) / r.width) * len));
    setSeekTo(sec);
    // mid-night a tap arms ("Tap again to jump to 1:23"), the second jumps (the Booth's seek bar does the same)
    guard("mini-seek", () => {
      setSeekTo(null);
      void st.getState().seek(sec);
    });
  };
  return (
    <section
      ref={box}
      className="booth-mini glass"
      aria-label={t("booth.ui2.mini_label")}
      data-testid="booth-mini"
      data-state={s.state}
    >
      <button
        type="button"
        className="booth-mini-cover"
        onClick={back}
        aria-label={t("booth.ui2.mini_back")}
        data-testid="booth-mini-back"
      >
        <Artwork entity={entity} orchestra={orchestra} size={44} />
      </button>
      <button type="button" className="booth-mini-text" onClick={back} tabIndex={-1} aria-hidden>
        <span className="booth-mini-title" data-testid="booth-mini-title">
          {it.title}
        </span>
        <span className="booth-mini-sub">{orchestra}</span>
        <span className="booth-mini-when" data-testid="booth-mini-when">
          {when}
        </span>
      </button>
      {status && (
        <span className="booth-mini-chip" data-testid="booth-mini-status" role="status">
          {status}
        </span>
      )}
      <div className="booth-mini-btns">
        <button
          type="button"
          className="booth-mini-btn"
          onClick={() => st.getState().togglePause()}
          aria-label={live ? t("booth.ui2.mini_pause") : t("booth.ui2.mini_resume")}
          data-testid="booth-mini-toggle"
        >
          {live ? (
            <Pause size={20} fill="currentColor" strokeWidth={0} aria-hidden />
          ) : (
            <Play size={20} fill="currentColor" strokeWidth={0} aria-hidden />
          )}
        </button>
        <button
          type="button"
          className="booth-mini-btn confirm-host"
          {...next.handlers}
          data-armed={next.armed || undefined}
          data-holding={next.holding || undefined}
          aria-label={t("booth.ui2.mini_next")}
          data-hint={t("booth.ui2.mini_hold_next")}
          data-testid="booth-mini-next"
        >
          <SkipForward size={20} strokeWidth={2} aria-hidden />
          {(next.armed || next.holding) && <ConfirmRing />}
        </button>
        <button
          type="button"
          className="booth-mini-btn"
          onClick={() => st.getState().toggleMute()}
          aria-label={s.muted ? t("booth.ui2.mini_unmute") : t("booth.ui2.mini_mute")}
          aria-pressed={s.muted}
          data-testid="booth-mini-mute"
        >
          {s.muted ? (
            <VolumeX size={20} strokeWidth={2} aria-hidden />
          ) : (
            <Volume2 size={20} strokeWidth={2} aria-hidden />
          )}
        </button>
      </div>
      {/* (a pointer shortcut; the Booth's seek bar is the keyboard's) */}
      <div
        className="booth-mini-seek"
        title={t("booth.ui2.mini_seek")}
        aria-disabled={!live || undefined}
        onPointerDown={onSeek}
        data-testid="booth-mini-seek"
        data-len={Math.round(len)}
        data-pos={Math.round(pos)}
      >
        <span className="booth-mini-track">
          <span className="booth-mini-fill" style={{ width: `${len > 0 ? (pos / len) * 100 : 0}%` }} />
          {seekArmed && seekTo !== null && (
            <span className="booth-mini-target" style={{ left: `${(seekTo / len) * 100}%` }} />
          )}
        </span>
        {seekArmed && seekTo !== null && (
          <span className="booth-mini-arm" role="status" data-testid="booth-mini-seek-arm">
            {t("booth.ui2.mini_seek_arm", { at: clock(seekTo) })}
          </span>
        )}
      </div>
    </section>
  );
}
