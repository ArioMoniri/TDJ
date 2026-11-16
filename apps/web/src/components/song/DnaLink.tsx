"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { type DnaTarget, dnaHref, inBooth, useSongOpen } from "@/lib/songOpen";

/**
 * A link to a Song DNA page (a song, an orchestra, a singer). In the Booth, or inside the DNA overlay, it opens the
 * overlay instead: the Booth's page leaving would end the night.
 */
export function DnaLink({
  to,
  children,
  className = "",
  testId,
  label,
}: {
  to: DnaTarget;
  children: ReactNode;
  className?: string;
  testId?: string;
  label?: string;
}) {
  return (
    <Link
      href={dnaHref(to)}
      className={className}
      data-testid={testId}
      aria-label={label}
      onClick={(e) => {
        if (inBooth() || useSongOpen.getState().dna) {
          e.preventDefault();
          useSongOpen.getState().openDna(to);
        }
      }}
    >
      {children}
    </Link>
  );
}
