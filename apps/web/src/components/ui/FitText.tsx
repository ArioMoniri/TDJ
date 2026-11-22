"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useSaving } from "@/lib/power";
import "./fit-text.css";

/** px per second of the loop's scroll (Apple Music's now-playing title moves about this slowly) */
const SPEED = 28;
/** the loop's pause at each end, ms */
const HOLD = 2000;
/** a revealed label moves a little faster: it is read on purpose (hover / focus), not watched */
const REVEAL_SPEED = 40;
/** the reveal's pause before it moves and at the end, ms */
const REVEAL_START = 250;
const REVEAL_END = 1100;
/** touch screens (no hover): a cut label reveals itself about this often, ms */
const TOUCH_EVERY = 5000;
/** the controls that carry a label: a hover or focus anywhere on them reveals it */
const HOST = "button, a, summary, label, [role='button'], [role='link'], [tabindex]";

function useMedia(q: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(q);
    const set = () => setOn(mq.matches);
    set();
    mq.addEventListener?.("change", set);
    return () => mq.removeEventListener?.("change", set);
  }, [q]);
  return on;
}

/**
 * 2026-11 (the owner: "the buttons should slide the text in them if their full text is not seen") — one line of text
 * that never ends in a silent cut. Text that fits stays still. Text that runs past its box:
 * - `mode="reveal"` (buttons, chips, transport labels, set-list titles): shows its start with an ellipsis; a hover or
 *   a keyboard focus on its control (or on itself) slides it smoothly to its end and back, once; on a touch screen it
 *   does so by itself every few seconds;
 * - `mode="loop"` (the mini players' titles, `Marquee`): slides to its end and back for as long as it is cut, a 2 s
 *   pause at each end, like Apple Music's now-playing title.
 * Under Reduce Motion or Battery saver nothing moves: the shortest label that fits (`short`, when given) or the
 * ellipsis. The whole text is always the accessible name (a shown short label is hidden from the accessibility tree
 * and the full text is read instead). `data-overflow` / `data-moving` / `data-sliding` say what it does (the e2e).
 */
export function FitText({
  children,
  text,
  short,
  mode = "reveal",
  className = "",
  testId,
}: {
  /** the text as drawn (defaults to `text`) */
  children?: ReactNode;
  /** the whole text: the accessible name, the hover tag of a loop */
  text: string;
  /** a shorter label for when nothing may move (Reduce Motion, Battery saver) and the whole one does not fit */
  short?: string;
  mode?: "reveal" | "loop";
  className?: string;
  testId?: string;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(0);
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const touch = useMedia("(hover: none)");
  // how far the text runs past the box, measured again on any resize of either
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    const measure = () => setOver(Math.max(0, Math.ceil(i.scrollWidth - b.clientWidth)));
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(b);
    ro?.observe(i);
    void document.fonts?.ready.then(measure);
    return () => ro?.disconnect();
  }, [text, short]);
  // Battery saver: still, like Reduce Motion (lib/power.ts)
  const saving = useSaving();
  const still = reduced || saving;
  const cut = over > 2;
  const canMove = cut && !still;
  const moving = mode === "loop" && canMove;

  // the loop: for as long as the text is cut
  useEffect(() => {
    const i = inner.current;
    if (!i || !moving || typeof i.animate !== "function") return;
    const scroll = (over / SPEED) * 1000;
    const total = HOLD + scroll + HOLD + scroll;
    const a = i.animate(
      [
        { transform: "translateX(0)", offset: 0 },
        { transform: "translateX(0)", offset: HOLD / total },
        { transform: `translateX(${-over}px)`, offset: (HOLD + scroll) / total },
        { transform: `translateX(${-over}px)`, offset: (HOLD + scroll + HOLD) / total },
        { transform: "translateX(0)", offset: 1 },
      ],
      { duration: total, iterations: Number.POSITIVE_INFINITY, easing: "linear" },
    );
    return () => a.cancel();
  }, [moving, over]);

  // the reveal: once per hover / focus (and every few seconds on a touch screen)
  useEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i || mode !== "reveal" || !canMove || typeof i.animate !== "function") return;
    const host = b.parentElement?.closest<HTMLElement>(HOST) ?? b;
    let anim: Animation | null = null;
    const end = () => {
      anim?.cancel();
      anim = null;
      b.removeAttribute("data-sliding");
    };
    const play = () => {
      if (anim) return;
      const scroll = Math.max(350, (over / REVEAL_SPEED) * 1000);
      const total = REVEAL_START + scroll + REVEAL_END + scroll;
      b.setAttribute("data-sliding", "1");
      anim = i.animate(
        [
          { transform: "translateX(0)", offset: 0 },
          { transform: "translateX(0)", offset: REVEAL_START / total, easing: "ease-in-out" },
          { transform: `translateX(${-over}px)`, offset: (REVEAL_START + scroll) / total },
          {
            transform: `translateX(${-over}px)`,
            offset: (REVEAL_START + scroll + REVEAL_END) / total,
            easing: "ease-in-out",
          },
          { transform: "translateX(0)", offset: 1 },
        ],
        { duration: total, easing: "linear" },
      );
      anim.onfinish = end;
    };
    host.addEventListener("pointerenter", play);
    host.addEventListener("focusin", play);
    host.addEventListener("pointerleave", end);
    host.addEventListener("focusout", end);
    // a touch screen has no hover: a cut label shows its end now and then, while it is on screen
    let timer: ReturnType<typeof setInterval> | null = null;
    if (touch)
      timer = setInterval(
        () => {
          if (document.visibilityState === "visible" && b.getClientRects().length > 0) play();
        },
        TOUCH_EVERY + Math.round(Math.random() * 800),
      );
    return () => {
      host.removeEventListener("pointerenter", play);
      host.removeEventListener("focusin", play);
      host.removeEventListener("pointerleave", end);
      host.removeEventListener("focusout", end);
      if (timer) clearInterval(timer);
      end();
    };
  }, [mode, canMove, over, touch]);

  // still and cut: the short label, when there is one (the whole text stays the accessible name)
  const useShort = !!short && cut && still && short !== text;
  return (
    <span
      ref={box}
      className={`marquee fit ${className}`}
      title={mode === "loop" && cut ? text : undefined}
      data-fit={mode}
      data-overflow={cut ? "1" : "0"}
      data-moving={moving ? "1" : "0"}
      data-short={useShort ? "1" : undefined}
      data-testid={testId}
    >
      {useShort && <span className="sr-only">{text}</span>}
      <span ref={inner} className="marquee-inner" aria-hidden={useShort || undefined}>
        {children ?? text}
      </span>
      {useShort && (
        <span className="fit-short" aria-hidden>
          {short}
        </span>
      )}
    </span>
  );
}
