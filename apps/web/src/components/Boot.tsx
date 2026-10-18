"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

/** Loads the user's database (IndexedDB or server) once per page load. */
export function Boot() {
  const boot = useStore((s) => s.bootOverrides);
  useEffect(() => {
    boot();
  }, [boot]);
  return null;
}
