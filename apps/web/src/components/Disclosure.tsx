"use client";
import { ChevronDown } from "lucide-react";
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
    <div className={`${className} text-sm`} data-open={open || undefined}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full cursor-pointer items-center gap-2 text-left text-sm font-medium"
      >
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: DUR.base, ease: EASE.out }}
          className="inline-flex"
          aria-hidden
        >
          <ChevronDown size={16} />
        </motion.span>
        {summary}
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
