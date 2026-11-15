"use client";
import "../ui/indicators.css";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

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
