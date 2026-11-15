"use client";
import "./indicators.css";
import type { Cortina, Song } from "@tdj/core";
import { useReducedMotion } from "motion/react";
import { memo, useEffect, useRef, useState } from "react";
import { artworkCache, artworkFor, loadArtwork, placeholderFor } from "@/lib/booth/artwork";
import { ERA_CLASSES, eraOf } from "@/lib/booth/era";
import { INDICATORS } from "@/lib/booth/indicatorList";
import { useIndicators } from "@/lib/booth/indicatorPrefs";
import { bpmOf, energyOf, keyOf } from "@/lib/booth/songInfo";

type Entity = Song | Cortina | null | undefined;
const explain = (id: string) => INDICATORS.find((i) => i.id === id)?.explain ?? "";

/** The four-bar era glyph; `data-hint` carries the words (hover / long-press, VoiceOver via aria-label). */
export const EraBadge = memo(function EraBadge({ e, slot = false }: { e: Entity; slot?: boolean }) {
  const on = useIndicators().era;
  const era = eraOf(e);
  if (!on) return null;
  if (!era) return slot ? <span className="booth-era-slot" aria-hidden /> : null;
  const glyph = (
    <span
      className="booth-era"
      data-era={era.cls}
      role="img"
      aria-label={`Era: ${era.label} (${era.why})`}
      data-hint={`Era: ${era.why}. ${ERA_CLASSES.find((c) => c.cls === era.cls)?.explain ?? ""}`}
      data-testid="booth-era"
    >
      {[1, 2, 3, 4].map((b) => (
        <i key={b} data-on={b <= era.bars || undefined} />
      ))}
    </span>
  );
  return slot ? <span className="booth-era-slot">{glyph}</span> : glyph;
});

/** "122 BPM" and "1A" chips, the source on hover / long-press; `compact` prints "122 · 1A" for a row. */
export const BpmKey = memo(function BpmKey({ e, compact = false }: { e: Entity; compact?: boolean }) {
  const ind = useIndicators();
  const bpm = ind.bpm ? bpmOf(e) : null;
  const key = ind.key ? keyOf(e) : null;
  if (!ind.bpm && !ind.key) return null;
  if (compact) {
    const parts: string[] = [];
    if (ind.bpm) parts.push(bpm ? String(bpm.value) : "–");
    if (ind.key) parts.push(key ? key.camelot : "–");
    const hint = [
      ind.bpm ? (bpm ? `${bpm.value} BPM · ${bpm.source}` : "BPM unknown") : null,
      ind.key ? (key ? `Key ${key.camelot} (${key.name}) · ${key.source}` : "Key unknown") : null,
    ]
      .filter(Boolean)
      .join(" — ");
    return (
      <span className="booth-row-ind" data-hint={hint} data-testid="booth-row-bpmkey">
        {parts.join(" · ")}
      </span>
    );
  }
  return (
    <>
      {ind.bpm && bpm && (
        <span
          className="booth-ind"
          data-testid="booth-bpm"
          data-hint={bpm ? `${bpm.value} BPM · from ${bpm.source}. ${explain("bpm")}` : explain("bpm")}
        >
          {bpm ? `${bpm.value} BPM` : "BPM –"}
        </span>
      )}
      {ind.key && key && (
        <span
          className="booth-ind"
          data-testid="booth-key"
          data-hint={key ? `${key.name} · from ${key.source}. ${explain("key")}` : explain("key")}
        >
          {key ? `${key.camelot} · ${key.name}` : "Key –"}
        </span>
      )}
    </>
  );
});

export function EnergyChip({ e }: { e: Entity }) {
  const on = useIndicators().energy;
  const v = energyOf(e);
  if (!on || v === null) return null;
  return (
    <span
      className="booth-ind"
      data-testid="booth-energy"
      data-hint={`Energy ${v} of 100. ${explain("energy")}`}
    >
      Energy {v}
    </span>
  );
}

/** Album art, cached; a per-orchestra tile without one. Nothing when the DJ turned artwork off. */
export const Artwork = memo(function Artwork({
  e,
  orchestra,
  size = 40,
  className = "",
}: {
  e: Entity;
  orchestra: string;
  size?: number;
  className?: string;
}) {
  const on = useIndicators().artwork;
  const [url, setUrl] = useState<string | null>(() => artworkFor(e));
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    if (!on) return;
    setBroken(false);
    const hit = artworkFor(e, artworkCache());
    setUrl(hit);
    if (hit) return;
    let live = true;
    void loadArtwork(e).then((u) => live && u && setUrl(u));
    return () => {
      live = false;
    };
  }, [e, on]);
  if (!on) return null;
  const ph = placeholderFor(orchestra);
  return (
    <span
      className={`booth-art ${className}`}
      style={{ ["--art" as string]: `${size}px` }}
      data-testid="booth-art"
      data-art={url && !broken ? "cover" : "placeholder"}
      aria-hidden
    >
      {url && !broken ? (
        // biome-ignore lint/performance/noImgElement: covers come from Deezer / Spotify CDNs, sized by CSS
        <img src={url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        <span className="booth-art-ph" style={{ ["--hue" as string]: ph.hue }}>
          {ph.initials}
        </span>
      )}
    </span>
  );
});

/** The era legend: the four classes with their glyphs and one line each. */
export function EraLegend() {
  return (
    <div className="booth-legend" data-testid="booth-era-legend">
      {ERA_CLASSES.map((c) => (
        <div key={c.cls}>
          <span className="booth-era" data-era={c.cls} aria-hidden>
            {[1, 2, 3, 4].map((b) => (
              <i key={b} data-on={b <= c.bars || undefined} />
            ))}
          </span>
          <span>
            <b className="font-semibold">{c.label}</b>
            <span className="text-[var(--label-2)]"> · {c.explain}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Hover / long-press explanations for any element with `data-hint` inside the page: a pointer shows the bubble
 * after a short rest, a finger after a 0.5 s press (the tap that follows is swallowed), the keyboard on focus.
 * One fixed bubble, so a scrolling list never clips it.
 */
export function HintLayer() {
  const [hint, setHint] = useState<{ text: string; x: number; y: number; below: boolean } | null>(null);
  const reduced = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swallow = useRef(false);
  useEffect(() => {
    const target = (ev: Event) =>
      (ev.target as Element | null)?.closest?.<HTMLElement>("[data-hint]") ?? null;
    const show = (el: HTMLElement) => {
      const text = el.dataset.hint;
      if (!text) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 90;
      setHint({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
    };
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    // hover hints only where there is a real pointer (a phone's emulated mouse after a tap must not open one)
    const canHover = typeof matchMedia === "function" && matchMedia("(hover: hover)").matches;
    const over = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse" || !canHover) return;
      const el = target(ev);
      clear();
      if (!el) return setHint(null);
      timer.current = setTimeout(() => show(el), 350);
    };
    const down = (ev: PointerEvent) => {
      if (ev.pointerType === "mouse") return;
      const el = target(ev);
      clear();
      setHint(null);
      if (!el) return;
      timer.current = setTimeout(() => {
        swallow.current = true;
        show(el);
      }, 500);
    };
    const up = () => {
      clear();
      if (swallow.current) setTimeout(() => setHint(null), 1800);
    };
    const click = (ev: MouseEvent) => {
      if (!swallow.current) return;
      swallow.current = false;
      ev.preventDefault();
      ev.stopPropagation();
    };
    const focus = (ev: FocusEvent) => {
      const el = target(ev);
      if (el && (ev.target as HTMLElement).matches(":focus-visible")) show(el);
      else setHint(null);
    };
    const hide = () => {
      clear();
      setHint(null);
    };
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", hide);
    document.addEventListener("click", click, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", hide);
    return () => {
      clear();
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", hide);
      document.removeEventListener("click", click, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", hide);
    };
  }, []);
  if (!hint) return null;
  return (
    <div
      className="booth-hint"
      role="tooltip"
      data-testid="booth-hint"
      style={{
        left: Math.max(
          12,
          Math.min(hint.x - 160, (typeof window !== "undefined" ? window.innerWidth : 1000) - 332),
        ),
        ...(hint.below
          ? { top: hint.y }
          : { bottom: (typeof window !== "undefined" ? window.innerHeight : 800) - hint.y }),
        animation: reduced ? "none" : undefined,
      }}
    >
      {hint.text}
    </div>
  );
}
