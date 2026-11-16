"use client";
import "../ui/indicators.css";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { coversShield, forPointer, HIDE_HINTS_EVENT, keyboardFocus } from "../ui/Tip";

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
    // the element the hint explains: once it leaves the page (a dismissed banner), so does the hint
    let anchor: HTMLElement | null = null;
    let watch: ReturnType<typeof setInterval> | null = null;
    const show = (el: HTMLElement, touch = false) => {
      const raw = el.dataset.hint;
      if (!raw) return;
      // 2026-11: a keyboard shortcut in the words only where there is a keyboard or a pointer
      const text = forPointer(raw, touch);
      const r = el.getBoundingClientRect();
      const below = r.top < 90;
      // never over an open panel's controls (the Controls panel over the transport)
      if (below ? coversShield(el, r.bottom, r.bottom + 72) : coversShield(el, r.top - 72, r.top)) return;
      anchor = el;
      if (!watch)
        watch = setInterval(() => {
          if (anchor && !anchor.isConnected) hide();
        }, 250);
      setHint({ text, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
    };
    const clear = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    // hover hints for a real pointer: a mouse, or an iPad's trackpad (wave 2: the iPad reports `hover: none`, so the
    // media check alone left its trackpad without hints); a phone keeps the check (its mouse is only ever emulated),
    // and never the mouse a touch screen emulates right after a tap
    const canHover = typeof matchMedia === "function" && matchMedia("(hover: hover)").matches;
    let lastTouch = Number.NEGATIVE_INFINITY;
    const over = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse" || ev.timeStamp - lastTouch < 1000) return;
      if (!canHover && window.innerWidth < 600) return;
      const el = target(ev);
      clear();
      if (!el) return setHint(null);
      timer.current = setTimeout(() => {
        shownAt = { x: ev.clientX, y: ev.clientY };
        show(el);
      }, 350);
    };
    // 2026-11 (an iPad trackpad: a tanda's hint sat over Last 4 tandas and Birthday vals): a hover hint needs the
    // pointer at rest — any move restarts the wait, and a move of a few px once it shows takes it away, so it never
    // covers the control the DJ is heading for
    let shownAt: { x: number; y: number } | null = null;
    // 2026-11: a finger that moves is a drag (a transition edge, a fader), not a long press: no hint, and the next
    // tap is never swallowed (a slow drag on a phone used to eat the following tap on Save)
    let touchAt: { x: number; y: number } | null = null;
    const move = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse") {
        if (touchAt && Math.hypot(ev.clientX - touchAt.x, ev.clientY - touchAt.y) > 8) {
          touchAt = null;
          clear();
          if (swallow.current) {
            swallow.current = false;
            setHint(null);
          }
        }
        return;
      }
      if (shownAt && Math.hypot(ev.clientX - shownAt.x, ev.clientY - shownAt.y) > 6) {
        shownAt = null;
        clear();
        setHint(null);
        return;
      }
      if (timer.current && !shownAt) {
        const el = target(ev);
        clear();
        if (el)
          timer.current = setTimeout(() => {
            shownAt = { x: ev.clientX, y: ev.clientY };
            show(el);
          }, 450);
      }
    };
    document.addEventListener("pointermove", move);
    const down = (ev: PointerEvent) => {
      // a click takes a hover hint away (it explained what is now being done)
      if (ev.pointerType === "mouse") return hide();
      lastTouch = ev.timeStamp;
      touchAt = { x: ev.clientX, y: ev.clientY };
      const el = target(ev);
      clear();
      setHint(null);
      if (!el) return;
      timer.current = setTimeout(() => {
        swallow.current = true;
        show(el, true);
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
      if (el && keyboardFocus(ev.target as Element, ev.timeStamp)) show(el);
      else setHint(null);
    };
    function hide() {
      clear();
      anchor = null;
      if (watch) clearInterval(watch);
      watch = null;
      setHint(null);
    }
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", hide);
    document.addEventListener("click", click, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", hide);
    window.addEventListener(HIDE_HINTS_EVENT, hide);
    return () => {
      clear();
      if (watch) clearInterval(watch);
      window.removeEventListener(HIDE_HINTS_EVENT, hide);
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointermove", move);
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
