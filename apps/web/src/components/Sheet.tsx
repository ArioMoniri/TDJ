"use client";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { lower, t as tx } from "@/lib/i18n";
import { DUR, EASE, SPRING } from "@/lib/motion";
import { lockScroll } from "@/lib/scrollLock";
import { useSheets } from "@/lib/sheets";

/** the open sheets, oldest first: Escape and the focus trap belong to the top one only (2026-11: stacked sheets) */
const stack: symbol[] = [];

/**
 * Native sheet. Phone: bottom sheet with a grabber, medium/large detents, drag to dismiss, thick material.
 * Desktop: centred 540 px panel with Cancel on the left and the title centred. Focus trap, Escape, scroll lock.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  trailing,
  onTrailing,
  detents = ["medium", "large"],
  describedBy,
  width = 540,
  testId,
  footer,
  hideCancel = false,
  initialFocus = "control",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** a bar button label (e.g. "Done", "Save") or a node; a string closes the sheet unless `onTrailing` is given */
  trailing?: ReactNode;
  onTrailing?: () => void;
  detents?: Array<"medium" | "large">;
  describedBy?: string;
  width?: number;
  testId?: string;
  /** pinned below the scrolling body (a primary button, Health-style) */
  footer?: ReactNode;
  /** an alert with one answer: no Cancel on desktop */
  hideCancel?: boolean;
  /**
   * 2026-11: where the focus goes when the sheet opens with no field to type in: the first control (default), or
   * the title (a sheet of actions: no button looks pressed on open, the screen reader starts at the title)
   */
  initialFocus?: "control" | "title";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 599.98px)");
  const [settling, setSettling] = useState(false);
  const [detent, setDetent] = useState<"medium" | "large">(detents[0] ?? "large");
  const titleId = useId();
  // Portaled to <body>: a sheet opened from inside a tanda card (the ••• sheet, Find on services, Audio details)
  // was `fixed` relative to the card, because `container-type` (the card's energy-bar query) makes the card the
  // containing block for fixed descendants: the scrim and the sheet were confined to, and clipped by, the card.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // 2026-11: the body has more below its fold (the fade at the foot shows only then)
  const [more, setMore] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again once the portal has mounted the body
  useEffect(() => {
    if (!open) return;
    let el: HTMLDivElement | null = null;
    const read = () => {
      if (el) setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 8);
    };
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(read) : null;
    // (the body mounts with the sheet's first frame)
    const id = requestAnimationFrame(() => {
      el = body.current;
      if (!el) return;
      read();
      el.addEventListener("scroll", read, { passive: true });
      ro?.observe(el);
      for (const c of el.children) ro?.observe(c);
    });
    return () => {
      cancelAnimationFrame(id);
      el?.removeEventListener("scroll", read);
      ro?.disconnect();
    };
  }, [open, mounted]);

  // the open count lets the phone primary bar hide under any sheet (round5-design.md §1)
  useEffect(() => {
    if (!open) return;
    const { _inc, _dec } = useSheets.getState();
    _inc();
    return _dec;
  }, [open]);

  // keyed by value: callers pass a fresh array literal on every render, and an effect keyed by that identity re-ran
  // on each parent render — re-focusing the sheet's first control after every keystroke in one of its fields
  const detentKey = detents.join(",");
  useEffect(() => {
    if (!open) return;
    setDetent((detentKey.split(",")[0] as "medium" | "large" | "") || "large");
    const active = document.activeElement as HTMLElement | null;
    const prev = active && panel.current?.contains(active) ? null : active;
    const t = setTimeout(() => {
      const root = panel.current;
      // a field that already took the focus (autoFocus, inside the tap that opened the sheet, so iOS raises the
      // keyboard) keeps it; else `[data-autofocus]` first, then the first control. One selector list matched in
      // document order, so the desktop bar's Cancel won over a search field marked to take the focus, and a
      // hardware keyboard's typing went nowhere (the Booth's "Find in tonight's night", 2026-11)
      if (!root || root.contains(document.activeElement)) return;
      (
        root.querySelector<HTMLElement>("[data-autofocus]") ??
        (initialFocus === "title"
          ? (root.querySelector<HTMLElement>("input:not([type=hidden])") ??
            root.querySelector<HTMLElement>(`[id="${titleId}"]`))
          : root.querySelector<HTMLElement>("input:not([type=hidden]), button:not([disabled]), a[href]"))
      )?.focus({ preventScroll: true });
    }, 30);
    const me = Symbol("sheet");
    stack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      }
      if (e.key === "Tab" && panel.current) {
        const f = [
          ...panel.current.querySelectorAll<HTMLElement>(
            "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea, [tabindex='0']",
          ),
        ].filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    const unlock = lockScroll();
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      const at = stack.indexOf(me);
      if (at >= 0) stack.splice(at, 1);
      unlock();
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, detentKey, initialFocus, titleId]);

  const panelMotion = useMemo(() => {
    if (reduced)
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: DUR.base } },
        exit: { opacity: 0, transition: { duration: DUR.fast } },
      };
    return isPhone
      ? {
          initial: { y: "100%" },
          animate: { y: 0, transition: SPRING.sheet },
          exit: { y: "100%", transition: { duration: DUR.base, ease: EASE.in } },
        }
      : {
          initial: { opacity: 0, scale: 0.96, y: 12 },
          animate: { opacity: 1, scale: 1, y: 0, transition: { duration: DUR.base, ease: EASE.out } },
          exit: { opacity: 0, scale: 0.98, transition: { duration: DUR.fast, ease: EASE.in } },
        };
  }, [isPhone, reduced]);

  const canMedium = detents.includes("medium") && detents.includes("large");
  const trailingNode =
    typeof trailing === "string" ? (
      <button
        type="button"
        className="btn-plain font-semibold"
        onClick={() => (onTrailing ? onTrailing() : onClose())}
      >
        {trailing}
      </button>
    ) : (
      trailing
    );

  const tree = (
    <AnimatePresence>
      {open && (
        <div
          key="sheet"
          className="fixed inset-0 z-50 flex items-end justify-center pt-[calc(var(--chrome-top)+0.5rem)] sm:items-center sm:p-6 sm:pt-[calc(var(--chrome-top)+1.5rem)]"
        >
          <motion.button
            type="button"
            className="absolute inset-0 cursor-default bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DUR.base } }}
            exit={{ opacity: 0, transition: { duration: DUR.fast } }}
            onClick={onClose}
            aria-label={tx("sheet.close_2", { title: lower(title) })}
            tabIndex={-1}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={describedBy}
            data-testid={testId}
            data-detent={isPhone ? detent : undefined}
            className={`sheet-material rounded-continuous relative flex w-full flex-col rounded-t-[var(--radius-l)] pb-[env(safe-area-inset-bottom)] sm:rounded-[var(--radius-l)] sm:shadow-[0_24px_80px_rgb(0_0_0/.3)] ${
              settling ? "glass-settling" : ""
            }`}
            style={{
              willChange: "transform",
              overscrollBehavior: "contain",
              maxWidth: isPhone ? undefined : width,
              // never taller than the room under the status bar / title bar (the container's top padding)
              maxHeight: `min(${isPhone ? (detent === "medium" ? "62dvh" : "92dvh") : "80vh"}, 100%)`,
              transition: "max-height var(--dur-s) var(--ease-settle)",
            }}
            {...panelMotion}
            onAnimationStart={() => isPhone && setSettling(true)}
            onAnimationComplete={() => {
              setSettling(false);
              if (isPhone) haptic(6);
            }}
            drag={isPhone && !reduced ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: canMedium && detent === "medium" ? 0.25 : 0, bottom: 0.6 }}
            dragMomentum={false}
            dragDirectionLock
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) {
                if (canMedium && detent === "large" && info.offset.y < 260 && info.velocity.y < 1200) {
                  setDetent("medium");
                  haptic(6);
                } else onClose();
              } else if (
                canMedium &&
                detent === "medium" &&
                (info.offset.y < -60 || info.velocity.y < -400)
              ) {
                setDetent("large");
                haptic(6);
              }
            }}
          >
            {isPhone && (
              <span className="mx-auto mt-2 block h-[5px] w-9 rounded-full bg-[var(--label-3)]" aria-hidden />
            )}
            <div className="relative flex min-h-11 shrink-0 items-center justify-center px-4">
              {!isPhone && !hideCancel && (
                <button type="button" className="btn-plain absolute left-2" onClick={onClose}>
                  {tx("sheet.cancel")}
                </button>
              )}
              {/* final QA: a long title wraps (two balanced lines) instead of ending in "…" */}
              <h2
                id={titleId}
                className="text-headline min-w-0 px-16 py-1 text-center break-words outline-none [text-wrap:balance]"
                data-testid="sheet-title"
                tabIndex={-1}
              >
                {title}
              </h2>
              <div className="absolute right-2 flex items-center gap-1">
                {trailingNode}
                {isPhone && !trailingNode && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-glass"
                    onClick={onClose}
                    aria-label={tx("sheet.close")}
                  >
                    <X size={18} strokeWidth={2.25} className="text-[var(--label)]" />
                  </button>
                )}
              </div>
            </div>
            {/* wave 4: a toast raised while this sheet is open shows here, as an inline status row under the title
                (Toast.tsx portals into the topmost slot), so it never floats over the grabber or the title */}
            <div className="sheet-status-slot shrink-0" data-sheet-status data-testid="sheet-status-slot" />
            <div
              ref={body}
              className="sheet-body hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 [&>section:first-child>.section-head]:mt-2 [&>section:first-child>.group-inset]:mt-2"
              onPointerDownCapture={(e) => {
                // a scrolled list must never turn a scroll into a dismiss
                if ((body.current?.scrollTop ?? 0) > 0) e.stopPropagation();
              }}
              onFocusCapture={() => {
                if (isPhone && canMedium) setDetent("large");
              }}
            >
              {children}
              {/* a cut row at the medium detent reads as scrollable (round4-ux.md P2-7). 2026-11: only while there is
                  more below — at the end it lay as a lighter band over the last footnote (the Invite sheet's) */}
              <div
                className={`pointer-events-none sticky bottom-0 -mb-4 h-6 bg-gradient-to-t from-[var(--material-thick)] to-transparent transition-opacity ${more ? "opacity-100" : "opacity-0"}`}
                aria-hidden
                data-testid="sheet-more-fade"
                data-more={more ? "1" : "0"}
              />
            </div>
            {footer && (
              <div className="sheet-footer shrink-0" data-testid="sheet-footer">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
  return mounted ? createPortal(tree, document.body) : null;
}
