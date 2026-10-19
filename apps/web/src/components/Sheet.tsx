"use client";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { useMediaQuery } from "@/lib/hooks";
import { DUR, EASE, SPRING } from "@/lib/motion";

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
}) {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const reduced = useReducedMotion();
  const isPhone = useMediaQuery("(max-width: 639px)");
  const [settling, setSettling] = useState(false);
  const [detent, setDetent] = useState<"medium" | "large">(detents[0] ?? "large");
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    setDetent(detents[0] ?? "large");
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      panel.current
        ?.querySelector<HTMLElement>(
          "[data-autofocus], input:not([type=hidden]), button:not([disabled]), a[href]",
        )
        ?.focus({ preventScroll: true });
    }, 30);
    const onKey = (e: KeyboardEvent) => {
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
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, detents]);

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

  return (
    <AnimatePresence>
      {open && (
        <div key="sheet" className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.button
            type="button"
            className="absolute inset-0 cursor-default bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: DUR.base } }}
            exit={{ opacity: 0, transition: { duration: DUR.fast } }}
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
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
            className={`material-thick rounded-continuous relative flex w-full flex-col rounded-t-[var(--radius-l)] pb-[env(safe-area-inset-bottom)] sm:rounded-[var(--radius-l)] sm:shadow-[0_24px_80px_rgb(0_0_0/.3)] ${
              settling ? "glass-settling" : ""
            } ${isPhone ? (detent === "medium" ? "max-h-[62dvh]" : "max-h-[92dvh]") : "max-h-[80vh]"}`}
            style={{
              willChange: "transform",
              overscrollBehavior: "contain",
              maxWidth: isPhone ? undefined : width,
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
            <div className="relative flex h-11 shrink-0 items-center justify-center px-4">
              {!isPhone && (
                <button type="button" className="btn-plain absolute left-2" onClick={onClose}>
                  Cancel
                </button>
              )}
              <h2 id={titleId} className="text-headline truncate px-16">
                {title}
              </h2>
              <div className="absolute right-2 flex items-center gap-1">
                {trailingNode}
                {isPhone && !trailingNode && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-glass"
                    onClick={onClose}
                    aria-label="Close"
                  >
                    <X size={18} strokeWidth={2.25} className="text-[var(--label)]" />
                  </button>
                )}
              </div>
            </div>
            <div
              ref={body}
              className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4 [&>section:first-child>.section-head]:mt-2 [&>section:first-child>.group-inset]:mt-2"
              onPointerDownCapture={(e) => {
                // a scrolled list must never turn a scroll into a dismiss
                if ((body.current?.scrollTop ?? 0) > 0) e.stopPropagation();
              }}
              onFocusCapture={() => {
                if (isPhone && canMedium) setDetent("large");
              }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
