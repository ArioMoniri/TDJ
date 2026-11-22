"use client";
import type { ReactNode } from "react";
import { FitText } from "./FitText";

/**
 * 2026-11 (the owner: "name won't slide to show all"): one line of text that, when it does not fit, slides once to
 * its end and back — a 2 s pause, the scroll, a 2 s pause, back, again — like Apple Music's now-playing title. Text
 * that fits stays still. With Reduce Motion (or Battery saver) it never moves: it ends in an ellipsis, and the whole
 * text is the element's hover tag (`title`) and stays in the accessibility tree as it is. `data-overflow` says which
 * (the e2e). The looping mode of FitText (components/ui/FitText.tsx), which buttons and chips use in its reveal mode.
 */
export function Marquee({
  children,
  text,
  className = "",
  testId,
}: {
  children: ReactNode;
  /** the whole text, for the hover tag */
  text: string;
  className?: string;
  testId?: string;
}) {
  return (
    <FitText mode="loop" text={text} className={className} testId={testId}>
      {children}
    </FitText>
  );
}
