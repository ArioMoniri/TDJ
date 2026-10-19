"use client";
import { Ellipsis, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { DUR, EASE } from "@/lib/motion";
import { Sheet } from "./Sheet";

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** macOS-style trailing shortcut hint */
  shortcut?: string;
}

/** The phone menu rows (one inset group of `menuitem` buttons); also used by sheets that are menus of their own. */
export function MenuList({
  items,
  onPick,
}: {
  items: Array<MenuItem | false | null | undefined>;
  onPick: (it: MenuItem) => void;
}) {
  const list = items.filter(Boolean) as MenuItem[];
  return (
    <div className="group-inset mt-2">
      {list.map((it) => (
        <button
          key={it.label}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          data-destructive={it.destructive || undefined}
          onClick={() => onPick(it)}
          className={`cell cell-tap w-full text-left ${it.destructive ? "text-[var(--destructive)]" : ""} disabled:text-[var(--label-3)]`}
        >
          <span className="min-w-0 flex-1 truncate">{it.label}</span>
          {it.icon && <it.icon size={20} strokeWidth={1.75} aria-hidden />}
        </button>
      ))}
    </div>
  );
}

/**
 * A `•••` button that opens a UIMenu-style popover (desktop, also on right-click of `contextRef`)
 * or a sheet of rows (phone). Arrow keys, Escape and click-outside are handled.
 */
export function Menu({
  label,
  items,
  className = "",
  icon,
  contextRef,
  align = "right",
  children,
}: {
  label: string;
  items: Array<MenuItem | false | null | undefined>;
  className?: string;
  icon?: ReactNode;
  /** on hover devices the menu also opens on `contextmenu` of this element */
  contextRef?: React.RefObject<HTMLElement | null>;
  align?: "right" | "left";
  /** custom trigger content; defaults to the ellipsis glyph in an icon-btn */
  children?: ReactNode;
}) {
  const list = items.filter(Boolean) as MenuItem[];
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  // the popover is portaled to <body> and fixed at the trigger: inside a card it would be clipped by the card's
  // `overflow: clip` and stacked under the sticky toolbar / nav pill; a scroll or resize while open closes it
  const [at, setAt] = useState<{ top: number; left: number; right: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 639px)");
  const id = useId();

  useEffect(() => {
    if (!open || isPhone) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    const onMove = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setFocus((f) => {
          const n = list.length;
          const d = e.key === "ArrowDown" ? 1 : -1;
          let i = f;
          for (let k = 0; k < n; k++) {
            i = (i + d + n) % n;
            if (!list[i]?.disabled) break;
          }
          return i;
        });
      }
      if (e.key === "Enter" || e.key === " ") {
        const it = list[focus];
        if (it && !it.disabled) {
          e.preventDefault();
          setOpen(false);
          it.onClick?.();
        }
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, { passive: true, capture: true });
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, { capture: true });
      window.removeEventListener("resize", onMove);
    };
  }, [open, isPhone, list, focus]);

  useLayoutEffect(() => {
    if (!open || isPhone) return;
    const r = root.current?.getBoundingClientRect();
    if (!r) return;
    setAt({ top: r.bottom + 4, left: r.left, right: window.innerWidth - r.right });
  }, [open, isPhone]);

  useEffect(() => {
    const el = contextRef?.current;
    if (!el || !window.matchMedia("(hover: hover)").matches) return;
    const onCtx = (e: MouseEvent) => {
      e.preventDefault();
      setOpen(true);
    };
    el.addEventListener("contextmenu", onCtx);
    return () => el.removeEventListener("contextmenu", onCtx);
  }, [contextRef]);

  const run = (it: MenuItem) => {
    if (it.disabled) return;
    haptic(4);
    setOpen(false);
    it.onClick?.();
  };

  const trigger = (
    <button
      type="button"
      className={children ? className : `icon-btn ${className}`}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={open ? id : undefined}
      onClick={() => {
        setFocus(-1);
        setOpen((v) => !v);
      }}
    >
      {children ?? icon ?? <Ellipsis size={20} strokeWidth={2} />}
    </button>
  );

  if (isPhone)
    return (
      <>
        {trigger}
        <Sheet open={open} onClose={() => setOpen(false)} title={label} detents={["medium", "large"]}>
          <MenuList items={list} onPick={run} />
        </Sheet>
      </>
    );

  const popover = (
    <AnimatePresence>
      {open && at && (
        <motion.div
          key="menu"
          ref={pop}
          id={id}
          role="menu"
          aria-label={label}
          initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }}
          transition={{ duration: DUR.base, ease: EASE.out }}
          style={{
            transformOrigin: align === "right" ? "top right" : "top left",
            top: at.top,
            ...(align === "right" ? { right: at.right } : { left: at.left }),
          }}
          className="menu fixed z-[60]"
        >
          {list.map((it, i) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              data-destructive={it.destructive || undefined}
              data-focus={focus === i || undefined}
              onMouseEnter={() => setFocus(i)}
              onClick={() => run(it)}
              className="menu-item"
            >
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              {it.shortcut && (
                <span className="text-footnote text-[var(--label-3)]" aria-hidden>
                  {it.shortcut}
                </span>
              )}
              {it.icon && <it.icon size={18} strokeWidth={1.75} aria-hidden />}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={root} className="relative inline-flex">
      {trigger}
      {mounted && createPortal(popover, document.body)}
    </div>
  );
}
