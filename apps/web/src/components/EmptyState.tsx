"use client";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useInViewport } from "@/lib/hooks";
import { rise } from "@/lib/motion";

/** The crate animation, fetched once per session; a navigation away before it lands is simply ignored. */
let crate: Promise<unknown> | null = null;
function loadCrate(): Promise<unknown> {
  crate ??= fetch("/anim/empty-crate.json")
    .then((r) => r.json())
    .catch(() => {
      crate = null;
      return null;
    });
  return crate;
}

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
  const [data, setData] = useState<unknown>(null);
  useEffect(() => {
    let alive = true;
    void loadCrate().then((d) => alive && d && setData(d));
    return () => {
      alive = false;
    };
  }, []);
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
        {data ? (
          <DotLottieReact
            data={data as Record<string, unknown>}
            loop
            autoplay={inView && !reduced}
            style={{ width: "100%", height: "auto", aspectRatio: "200 / 160" }}
          />
        ) : (
          <div style={{ width: "100%", aspectRatio: "200 / 160" }} />
        )}
      </div>
      <p className="text-subhead text-[var(--label-2)]">{children}</p>
      {action}
    </motion.div>
  );
}
