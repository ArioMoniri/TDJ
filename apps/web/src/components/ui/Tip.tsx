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

/**
 * The help tag's behaviour for any element: hover (desktop, after a short rest), long-press (touch) and keyboard focus
 * show it; scrolling, a key or leaving hides it. Spread `props` on the element (they include its ref and its accessible
 * description) and render `tag` anywhere: it is portaled. With no text it does nothing, so a row can take an optional
 * tip without a wrapper (a wrapper would break the grouped list's separators).
 */
export function useTip<T extends HTMLElement = HTMLElement>(text: ReactNode | undefined) {
  const id = useId();
  const ref = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [at, setAt] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const show = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const above = r.bottom + 64 > window.innerHeight;
    setAt({
      x: Math.min(window.innerWidth - 16, Math.max(16, r.left + r.width / 2)),
      y: above ? r.top - 8 : r.bottom + 8,
      above,
    });
  }, []);
  const hide = useCallback(() => {
    clear();
    setAt(null);
  }, [clear]);
  useEffect(() => () => clear(), [clear]);
  useEffect(() => {
    if (!at) return;
    const off = () => hide();
    window.addEventListener("scroll", off, true);
    window.addEventListener("keydown", off);
    return () => {
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("keydown", off);
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
          timer.current = setTimeout(show, 450);
        },
        onPointerLeave: (e: PointerEvent) => {
          if (e.pointerType === "mouse") hide();
        },
        onPointerDown: (e: PointerEvent) => {
          if (e.pointerType === "mouse") return hide();
          clear();
          timer.current = setTimeout(show, 500);
        },
        onPointerUp: (e: PointerEvent) => {
          if (e.pointerType === "mouse") return;
          clear();
          if (at) timer.current = setTimeout(hide, 1800);
        },
        onContextMenu: (e: { preventDefault: () => void }) => {
          // the long-press shows the tag instead of the system menu
          if (at) e.preventDefault();
        },
        onFocus: (e: { target: EventTarget }) => {
          clear();
          // a text field being typed in keeps its tag to hover: it would cover what the DJ types
          if ((e.target as HTMLElement).matches?.("input:not([type=checkbox]):not([type=radio]), textarea"))
            return;
          timer.current = setTimeout(show, 700);
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
            {text}
          </span>,
          document.body,
        )
      : null;
  return { props, tag };
}

/**
 * A one-line "what it does" on hover (desktop, after a short rest) and on long-press (touch), like a macOS help tag.
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
