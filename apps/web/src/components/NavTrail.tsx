"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { recordVisit } from "@/lib/navTrail";
import { NAV_MAIN, NAV_PINNED } from "./navItems";

/** the page's name for a Back button: the nav item's label (Compose, Library, Database, Booth…), else its path */
export function pageLabel(path: string): string {
  const item = [...NAV_MAIN, ...NAV_PINNED].find((i) => i.href === path);
  return item?.label ?? "";
}

/** Records every page this tab visits (lib/navTrail): mounted once in the layout. */
export function NavTrail() {
  const path = usePathname() ?? "/";
  const q = useSearchParams()?.toString() ?? "";
  useEffect(() => {
    recordVisit(q ? `${path}?${q}` : path, pageLabel(path));
  }, [path, q]);
  return null;
}
