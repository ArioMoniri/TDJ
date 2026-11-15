"use client";
import type { DotLottie } from "@lottiefiles/dotlottie-react";
import { useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useInViewport } from "@/lib/hooks";

/* the player chunk and its WASM load only when a Guide picture is on screen */
const DotLottieReact = dynamic(() => import("@lottiefiles/dotlottie-react").then((m) => m.DotLottieReact), {
  ssr: false,
});

/**
 * One of the Guide's small Lottie loops (public/lottie). It plays only while on screen; with reduced motion it shows
 * one still frame (`still`) where the whole picture is visible, and never moves.
 */
export function GuideLottie({ src, still }: { src: string; still: number }) {
  const reduced = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const near = useInViewport(box, 0.05);
  const inView = useInViewport(box, 0.35);
  // mounted once it comes near, then kept (scrolling back does not reload it)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    if (near) setMounted(true);
  }, [near]);
  const player = useRef<DotLottie | null>(null);
  const wantPlay = inView && !reduced;
  const want = useRef(wantPlay);
  want.current = wantPlay;
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    if (wantPlay) p.play();
    else {
      p.pause();
      if (reduced) p.setFrame(still);
    }
  }, [wantPlay, reduced, still]);
  return (
    <div ref={box} className="guide-lottie" data-testid="guide-lottie" data-src={src} aria-hidden>
      {mounted && (
        <DotLottieReact
          src={src}
          loop
          autoplay={wantPlay}
          renderConfig={{ autoResize: true }}
          dotLottieRefCallback={(p) => {
            player.current = p;
            if (!p) return;
            p.addEventListener("load", () => {
              if (!want.current) {
                p.pause();
                p.setFrame(still);
              }
            });
          }}
          style={{ width: "100%", height: "100%" }}
        />
      )}
    </div>
  );
}
