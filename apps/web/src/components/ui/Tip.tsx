"use client";
import {
  cloneElement,
  isValidElement,
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
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
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
  const child = isValidElement(children)
    ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": id })
    : children;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a passive host for the help tag; the child stays the control
    <span
      ref={ref}
      className={`inline-flex ${className}`}
      onPointerEnter={(e) => {
        if (e.pointerType !== "mouse") return;
        clear();
        timer.current = setTimeout(show, 450);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") hide();
      }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse") return hide();
        clear();
        timer.current = setTimeout(show, 500);
      }}
      onPointerUp={(e) => {
        if (e.pointerType === "mouse") return;
        clear();
        if (at) timer.current = setTimeout(hide, 1800);
      }}
      onContextMenu={(e) => {
        // the long-press shows the tag instead of the system menu
        if (at) e.preventDefault();
      }}
      onFocus={() => {
        clear();
        timer.current = setTimeout(show, 700);
      }}
      onBlur={hide}
    >
      {child}
      <span id={id} className="sr-only">
        {text}
      </span>
      {at &&
        createPortal(
          <span
            role="tooltip"
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
        )}
    </span>
  );
}
