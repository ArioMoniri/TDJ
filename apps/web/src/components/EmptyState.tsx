"use client";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useInViewport } from "@/lib/hooks";
import { rise } from "@/lib/motion";

/** Record-crate empty state (3 s loop, plays only while on screen). Enters with `rise` after a 300 ms grace. */
export function EmptyState({
  children,
  action,
  grace = 300,
}: {
  children: ReactNode;
  action?: ReactNode;
  grace?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInViewport(ref, 0.4);
  const [ready, setReady] = useState(grace === 0);
  useEffect(() => {
    if (grace === 0) return;
    const id = setTimeout(() => setReady(true), grace);
    return () => clearTimeout(id);
  }, [grace]);
  return (
    <motion.div
      ref={ref}
      variants={rise}
      initial="hidden"
      animate={ready ? "show" : "hidden"}
      className="flex flex-col items-center gap-3 py-8 text-center"
      data-testid="empty-state"
    >
      <div className="w-[120px] sm:w-[160px]" aria-hidden>
        <DotLottieReact
          src="/anim/empty-crate.json"
          loop
          autoplay={inView && !reduced}
          style={{ width: "100%", height: "auto", aspectRatio: "200 / 160" }}
        />
      </div>
      <p className="text-subhead text-[var(--label-2)]">{children}</p>
      {action}
    </motion.div>
  );
}
