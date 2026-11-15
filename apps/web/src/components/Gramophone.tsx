"use client";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";

const MAX = 170;
/** the pull at which the tone arm drops onto the record */
const ARM_AT = 56;

/** A soft vinyl crackle, generated (no file): sparse clicks over a faint hiss, looped. */
function crackleBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    let v = (Math.random() * 2 - 1) * 0.015;
    if (Math.random() < 0.0012) v += (Math.random() * 2 - 1) * (0.25 + Math.random() * 0.5);
    d[i] = v;
  }
  return buf;
}

/**
 * Round 23 easter egg: pull past the foot of the Compose page (trackpad, wheel, finger, or the native rubber band)
 * and a gramophone rises from the bottom edge. The record turns with the pull, the tone arm drops once it is far
 * enough, and a soft crackle plays (unless sound effects are off; on iPhone and iPad it follows the silent
 * switch). Let go and it springs back. Reduced motion: it fades in, still. Decorative: hidden from assistive tech.
 */
export function Gramophone() {
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const sounds = useStore((s) => s.settings.sounds !== false);
  const soundsRef = useRef(sounds);
  soundsRef.current = sounds;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let pull = 0;
    let angle = 0;
    let idle = 0;
    let touchY: number | null = null;
    let audio: { ctx: AudioContext; gain: GainNode; src: AudioBufferSourceNode | null } | null = null;

    const atBottom = () => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;

    const sound = (level: number) => {
      if (!soundsRef.current && !audio) return;
      try {
        if (!audio && level > 0) {
          const AC =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AC) return;
          // iOS 17+: an ambient session follows the ring / silent switch
          const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
          if (session) session.type = "ambient";
          const ctx = new AC();
          const gain = ctx.createGain();
          gain.gain.value = 0;
          const lp = ctx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = 5200;
          gain.connect(lp).connect(ctx.destination);
          audio = { ctx, gain, src: null };
        }
        if (!audio) return;
        const on = level > 0 && soundsRef.current;
        if (on && !audio.src) {
          void audio.ctx.resume();
          const src = audio.ctx.createBufferSource();
          src.buffer = crackleBuffer(audio.ctx);
          src.loop = true;
          src.connect(audio.gain);
          src.start();
          audio.src = src;
        }
        const t = audio.ctx.currentTime;
        audio.gain.gain.setTargetAtTime(on ? Math.min(1, level) * 0.07 : 0, t, 0.06);
        if (!on && audio.src) {
          const src = audio.src;
          audio.src = null;
          src.stop(t + 0.4);
        }
      } catch {
        audio = null;
      }
    };

    const render = () => {
      el.style.setProperty("--pull", `${pull}px`);
      if (pull > 2) el.dataset.visible = "";
      else delete el.dataset.visible;
      if (pull >= ARM_AT) el.dataset.arm = "";
      else delete el.dataset.arm;
      if (!reducedRef.current) el.style.setProperty("--spin", `${angle}deg`);
    };
    const set = (next: number) => {
      const p = Math.max(0, Math.min(MAX, next));
      angle += Math.abs(p - pull) * 2.4;
      pull = p;
      delete el.dataset.releasing;
      render();
      sound(pull >= ARM_AT ? (pull - ARM_AT) / (MAX - ARM_AT) + 0.35 : 0);
    };
    const release = () => {
      if (!pull) return;
      el.dataset.releasing = "";
      pull = 0;
      render();
      sound(0);
    };
    const later = () => {
      clearTimeout(idle);
      idle = window.setTimeout(release, 160);
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY > 0 && atBottom()) {
        set(pull + e.deltaY * 0.35);
        later();
      } else if (e.deltaY < 0 && pull) release();
    };
    const onTouchStart = (e: TouchEvent) => {
      touchY = atBottom() ? (e.touches[0]?.clientY ?? null) : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (touchY == null) {
        if (atBottom()) touchY = e.touches[0]?.clientY ?? null;
        return;
      }
      const dy = touchY - (e.touches[0]?.clientY ?? touchY);
      if (dy > 0) set(dy * 0.55);
    };
    const onTouchEnd = () => {
      touchY = null;
      release();
    };
    // Safari's rubber band reports the overscroll as scrollY past the end
    const onScroll = () => {
      const over = window.scrollY + window.innerHeight - document.documentElement.scrollHeight;
      if (over > 0 && touchY == null) {
        set(over);
        later();
      }
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(idle);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("scroll", onScroll);
      if (audio) void audio.ctx.close().catch(() => {});
    };
  }, []);

  return (
    <div ref={root} className="gramophone" data-testid="gramophone" aria-hidden>
      <svg viewBox="0 0 200 160" width="180" height="144" role="presentation">
        <rect x="6" y="6" width="188" height="148" rx="16" className="gramo-plinth" />
        {/* the record turns with the pull */}
        <g className="gramo-record">
          <circle cx="86" cy="80" r="64" className="gramo-vinyl" />
          {[55, 46, 37].map((r) => (
            <circle key={r} cx="86" cy="80" r={r} className="gramo-groove" />
          ))}
          <circle cx="86" cy="80" r="19" className="gramo-label" />
          <path d="M86 64 A16 16 0 0 1 101 74" className="gramo-mark" />
        </g>
        <circle cx="86" cy="80" r="3" className="gramo-spindle" />
        {/* the tone arm pivots at its base and drops onto the record */}
        <g className="gramo-arm">
          <circle cx="168" cy="34" r="9" className="gramo-pivot" />
          <path d="M168 34 L162 104 L140 124" className="gramo-tube" />
          <rect
            x="128"
            y="118"
            width="16"
            height="9"
            rx="2.5"
            className="gramo-head"
            transform="rotate(-40 136 122)"
          />
        </g>
      </svg>
    </div>
  );
}
