"use client";
import type { ReactNode } from "react";
import { openExternal } from "@/lib/openLink";

/** a link that leaves T-DJ (the browser's tab, the apps' system browser: never inside T-DJ's own view) */
export function ExtLink({
  href,
  children,
  className = "",
  testId,
}: {
  href: string;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      data-testid={testId}
      onClick={(e) => {
        e.preventDefault();
        void openExternal(href);
      }}
    >
      {children}
    </a>
  );
}
