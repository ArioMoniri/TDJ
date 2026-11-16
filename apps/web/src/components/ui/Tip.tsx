"use client";
import {
  cloneElement,
  isValidElement,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/** Fired to take every help tag and hint away at once (a panel opening over the controls they would cover). */
export const HIDE_HINTS_EVENT = "tdj:hide-hints";
export function hideHints() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(HIDE_HINTS_EVENT));
}

/**
 * Media capture (`pnpm media`, `pnpm media:hero`): no help tag or hint ever shows, so a filmed click never leaves a
 * tag beside the cursor. On with `?capture=1` (kept for the tab in sessionStorage), `window.__tdjCapture = true` or
 * `<html data-capture>`; the recorder sets these before the page loads. Invisible to users: nothing links to it.
 * globals.css hides any `role="tooltip"` under `html[data-capture]` too (the Booth's hint bubble included).
 */
export function capturing(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if ((window as unknown as { __tdjCapture?: boolean }).__tdjCapture) return true;
    if (document.documentElement.hasAttribute("data-capture")) return true;
    if (new URLSearchParams(location.search).get("capture") === "1") {
      sessionStorage.setItem("tdj-capture", "1");
      return true;
    }
    return sessionStorage.getItem("tdj-capture") === "1";
  } catch {
    return false;
  }
}
if (typeof window !== "undefined" && capturing()) document.documentElement.setAttribute("data-capture", "");

/** the last touch or pen press: a focus that follows it is the tap's, never the keyboard's (no tag on a tap) */
let lastPress = Number.NEGATIVE_INFINITY;
if (typeof document !== "undefined")
  document.addEventListener(
    "pointerdown",
    (e) => {
      lastPress = e.timeStamp;
    },
    true,
  );
/** a focus by the keyboard (`:focus-visible`), not by a click or a tap */
export function keyboardFocus(el: Element | null | undefined, timeStamp?: number): boolean {
  if (!el) return false;
  if (timeStamp !== undefined && timeStamp - lastPress < 1000) return false;
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * A tag or hint would cover an open panel's controls (`data-hint-shield`, the Booth's Controls panel) its anchor is
 * not part of: it stays away instead (2026-11, design review: the Controls toggle's tag sat over the Floor buttons).
 */
export function coversShield(anchor: Element, top: number, bottom: number): boolean {
  if (typeof document === "undefined") return false;
  for (const s of document.querySelectorAll("[data-hint-shield]")) {
    if (s.contains(anchor)) continue;
    const r = s.getBoundingClientRect();
    if (r.height > 0 && bottom > r.top && top < r.bottom) return true;
  }
  return false;
}

/** the keyboard shortcut in a hint ("Next now (→)", "Mute (m)"): only where there is a keyboard or a pointer */
export function forPointer(text: string, touch: boolean): string {
  return touch ? text.replace(/\s*\((?:[^()]{1,18})\)(?=\s*$|\s*[.·,;])/g, "").trim() : text;
}

/**
 * The help tag's behaviour for any element: hover (desktop, after a short rest) and keyboard focus (never a touch)
 * show it; scrolling, a key or leaving hides it. Spread `props` on the element (they include its ref and its accessible
 * description) and render `tag` anywhere: it is portaled. With no text it does nothing, so a row can take an optional
 * tip without a wrapper (a wrapper would break the grouped list's separators).
 */
export function useTip<T extends HTMLElement = HTMLElement>(text: ReactNode | undefined) {
  const id = useId();
  const ref = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [at, setAt] = useState<{ x: number; y: number; above: boolean; touch?: boolean } | null>(null);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const show = useCallback((touch = false) => {
    const el = ref.current;
    const r = el?.getBoundingClientRect();
    if (!el || !r || capturing()) return;
    const above = r.bottom + 64 > window.innerHeight;
    if (above ? coversShield(el, r.top - 64, r.top) : coversShield(el, r.bottom, r.bottom + 64)) return;
    setAt({
      x: Math.min(window.innerWidth - 16, Math.max(16, r.left + r.width / 2)),
      y: above ? r.top - 8 : r.bottom + 8,
      above,
      touch,
    });
  }, []);
  const hide = useCallback(() => {
    clear();
    setAt(null);
  }, [clear]);
  useEffect(() => () => clear(), [clear]);
  // a pending tag (the hover's rest, a focus) never lands after the hints were taken away
  useEffect(() => {
    window.addEventListener(HIDE_HINTS_EVENT, clear);
    return () => window.removeEventListener(HIDE_HINTS_EVENT, clear);
  }, [clear]);
  useEffect(() => {
    if (!at) return;
    const off = () => hide();
    window.addEventListener("scroll", off, true);
    window.addEventListener("keydown", off);
    window.addEventListener(HIDE_HINTS_EVENT, off);
    return () => {
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("keydown", off);
      window.removeEventListener(HIDE_HINTS_EVENT, off);
    };
  }, [at, hide]);
  const on = text !== undefined && text !== null && text !== "";
  const props = on
    ? {
        ref,
        "aria-description": typeof text === "string" ? text : undefined,
        onPointerEnter: (e: PointerEvent) => {
          if (e.pointerType !== "mouse") return;
          clear();
          timer.current = setTimeout(() => show(), 450);
        },
        onPointerLeave: (e: PointerEvent) => {
          if (e.pointerType === "mouse") hide();
        },
        // QA fix 2026-11 (a tag stayed stuck mid-screen after composing on a phone: a press that became a scroll
        // never sent its pointerup): help tags show on a mouse's hover and on keyboard focus only — a touch or a
        // click hides them
        onPointerDown: () => hide(),
        onPointerCancel: () => hide(),
        onFocus: (e: { target: EventTarget; timeStamp?: number }) => {
          clear();
          // a text field being typed in keeps its tag to hover: it would cover what the DJ types
          if ((e.target as HTMLElement).matches?.("input:not([type=checkbox]):not([type=radio]), textarea"))
            return;
          // 2026-11: only a keyboard focus shows it — a click or a tap focuses the button too, and its tag then
          // landed 0.7 s later over whatever the click opened (the Controls panel's Floor buttons)
          if (!keyboardFocus(e.target as Element, e.timeStamp)) return;
          timer.current = setTimeout(() => show(), 700);
        },
        onBlur: hide,
      }
    : { ref };
  const tag =
    on && at
      ? createPortal(
          <span
            role="tooltip"
            id={id}
            className="tip-tag text-footnote"
            data-testid="tip"
            style={{
              left: at.x,
              top: at.y,
              transform: `translate(-50%, ${at.above ? "-100%" : "0"})`,
            }}
          >
            {typeof text === "string" ? forPointer(text, !!at.touch) : text}
          </span>,
          document.body,
        )
      : null;
  return { props, tag };
}

/**
 * A one-line "what it does" on hover (desktop, after a short rest) and on keyboard focus, like a macOS help tag.
 * The text is also the child's accessible description. The tag is portaled and flips above / below to stay on screen.
 */
export function Tip({
  text,
  children,
  className = "",
}: {
  text: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { props, tag } = useTip<HTMLSpanElement>(text);
  const { "aria-description": description, ...host } = props as typeof props & {
    "aria-description"?: string;
  };
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ "aria-description"?: string }>, {
        "aria-description": description,
      })
    : children;
  return (
    <span className={`inline-flex ${className}`} {...host}>
      {child}
      {tag}
    </span>
  );
}
