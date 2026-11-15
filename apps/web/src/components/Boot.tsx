"use client";
import { useEffect } from "react";
import { useAppBoot } from "@/lib/app/boot";
import { useStore } from "@/lib/store";

/** Loads the user's database (IndexedDB or server; the on-device database in the apps) once per page load. */
export function Boot() {
  const boot = useStore((s) => s.bootOverrides);
  useAppBoot();
  useEffect(() => {
    boot();
  }, [boot]);
  return null;
}
