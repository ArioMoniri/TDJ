"use client";
import { Check, Ellipsis, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { type Insets, type Placement, placeMenu } from "@/lib/menuPlace";
import { DUR, EASE } from "@/lib/motion";
import { Sheet } from "./Sheet";
import { useTip } from "./ui/Tip";

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** macOS-style trailing shortcut hint */
  shortcut?: string;
  /** 2026-11: a second line under the label (the state, or why the row cannot act now) */
  subtitle?: string;
  /** 2026-11: a trailing checkmark (a mode that is on) */
  checked?: boolean;
  testId?: string;
}

/** The safe-area insets, read from `env()` through a probe (0 where the platform has none). */
function safeInsets(): Insets {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding:var(--chrome-top,env(safe-area-inset-top,0px)) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const out = {
    top: Number.parseFloat(cs.paddingTop) || 0,
    right: Number.parseFloat(cs.paddingRight) || 0,
    bottom: Number.parseFloat(cs.paddingBottom) || 0,
    left: Number.parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return out;
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
          data-testid={it.testId}
        >
          {it.subtitle ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate">{it.label}</span>
              <span className="text-footnote block text-[var(--label-2)]" data-testid="menu-subtitle">
                {it.subtitle}
              </span>
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
          )}
          {it.checked && (
            <Check
              size={18}
              strokeWidth={2.25}
              className="text-[var(--tint)]"
              aria-label="✓"
              data-testid="menu-check"
            />
          )}
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
  tip,
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
  /** the trigger's help tag; defaults to what the menu holds */
  tip?: string;
}) {
  const list = items.filter(Boolean) as MenuItem[];
  const [open, setOpen] = useState(false);
  const t = useTip<HTMLButtonElement>(open ? undefined : (tip ?? list.map((i) => i.label).join(" · ")));
  const [focus, setFocus] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  // the popover is portaled to <body> and fixed at the trigger: inside a card it would be clipped by the card's
  // `overflow: clip` and stacked under the sticky toolbar / nav pill; a scroll or resize while open closes it
  // placed by `placeMenu`: below the trigger, flipped up or shifted so the whole menu stays inside the viewport and
  // the safe area (wave 2: the tanda menu on iPad portrait opened past the bottom edge)
  const [at, setAt] = useState<Placement | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 599.98px)");
  const id = useId();

  useEffect(() => {
    if (!open || isPhone) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!root.current?.contains(t) && !pop.current?.contains(t)) setOpen(false);
    };
    // a deliberate scroll closes the menu; the page settling (a smooth scroll finishing, scroll anchoring when the
    // popover mounts) and scrolling inside an unrelated panel do not (the menu used to vanish as it opened)
    const y0 = window.scrollY;
    const t0 = performance.now();
    const onScroll = (e: Event) => {
      const t = e.target;
      const page = t === document || t === document.documentElement || t === document.body;
      if (!page && !(t instanceof Node && root.current && t.contains(root.current))) return;
      if (performance.now() - t0 < 200) return;
      if (page && Math.abs(window.scrollY - y0) < 12) return;
      setOpen(false);
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
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onMove);
    };
  }, [open, isPhone, list, focus]);

  const place = useCallback(() => {
    const r = root.current?.getBoundingClientRect();
    if (!r) return;
    const el = pop.current;
    // offsetWidth/Height ignore the scale animation's transform; before the popover mounts, estimate from the rows
    const size = el
      ? { width: el.offsetWidth, height: el.scrollHeight }
      : { width: 250, height: list.length * 44 + 2 };
    const next = placeMenu(
      r,
      size,
      { width: document.documentElement.clientWidth, height: window.innerHeight },
      safeInsets(),
      align,
    );
    setAt((prev) =>
      prev &&
      prev.top === next.top &&
      prev.left === next.left &&
      prev.up === next.up &&
      prev.maxHeight === next.maxHeight
        ? prev
        : next,
    );
  }, [align, list.length]);

  useLayoutEffect(() => {
    if (!open || isPhone) {
      setAt(null);
      return;
    }
    place();
  }, [open, isPhone, place]);
  // once mounted, re-place with the popover's real size
  useLayoutEffect(() => {
    if (open && at && pop.current) place();
  }, [open, at, place]);

  useEffect(() => {
    const el = contextRef?.current;
    if (!el) return;
    if (window.matchMedia("(hover: hover)").matches) {
      const onCtx = (e: MouseEvent) => {
        e.preventDefault();
        setOpen(true);
      };
      el.addEventListener("contextmenu", onCtx);
      return () => el.removeEventListener("contextmenu", onCtx);
    }
    // 2026-11 (touch): a long press (½ s, the finger still) opens the menu; the tap it ends in does nothing
    let timer: ReturnType<typeof setTimeout> | null = null;
    let at: { x: number; y: number } | null = null;
    let fired = false;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      at = null;
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      fired = false;
      at = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        timer = null;
        fired = true;
        haptic(8);
        setFocus(-1);
        setOpen(true);
      }, 500);
    };
    const move = (e: PointerEvent) => {
      if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > 10) cancel();
    };
    const click = (e: MouseEvent) => {
      if (!fired) return;
      fired = false;
      e.preventDefault();
      e.stopPropagation();
    };
    const ctx = (e: Event) => e.preventDefault();
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", cancel);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("click", click, true);
    el.addEventListener("contextmenu", ctx);
    return () => {
      cancel();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", cancel);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("click", click, true);
      el.removeEventListener("contextmenu", ctx);
    };
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
      {...t.props}
      onClick={() => {
        setFocus(-1);
        setOpen((v) => !v);
      }}
    >
      {t.tag}
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
            transformOrigin: `${at.up ? "bottom" : "top"} ${align === "right" ? "right" : "left"}`,
            top: at.top,
            left: at.left,
          }}
          data-placement={at.up ? "above" : "below"}
          className="menu fixed z-[60]"
        >
          <div
            className="menu-list"
            style={at.maxHeight ? { maxHeight: at.maxHeight, overflowY: "auto" } : undefined}
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
                data-testid={it.testId}
                title={it.subtitle}
              >
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.checked && (
                  <Check size={16} strokeWidth={2.25} className="text-[var(--tint)]" aria-label="✓" />
                )}
                {it.shortcut && (
                  <span className="text-footnote text-[var(--label-3)]" aria-hidden>
                    {it.shortcut}
                  </span>
                )}
                {it.icon && <it.icon size={18} strokeWidth={1.75} aria-hidden />}
              </button>
            ))}
          </div>
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
