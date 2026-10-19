"use client";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useId, useState } from "react";
import { DUR, EASE } from "@/lib/motion";

/** <details> cannot animate height: same semantics (button[aria-expanded][aria-controls] + region), animated content. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className = "mt-3",
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className} data-open={open || undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 text-left"
      >
        {summary}
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: DUR.base, ease: EASE.out }}
          className="cell-chevron inline-flex"
          aria-hidden
        >
          <ChevronRight size={16} strokeWidth={2.5} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: {
                height: { duration: DUR.base, ease: EASE.out },
                opacity: { duration: DUR.fast, delay: 0.06 },
              },
            }}
            exit={{ height: 0, opacity: 0, transition: { duration: DUR.fast, ease: EASE.in } }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
