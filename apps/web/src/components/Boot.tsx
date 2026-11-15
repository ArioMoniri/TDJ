"use client";
import { useEffect } from "react";
import { useAppBoot } from "@/lib/app/boot";
import { syncFeaturedNight } from "@/lib/featuredSync";
import { useStore } from "@/lib/store";

/** Loads the user's database (IndexedDB or server; the on-device database in the apps) once per page load. */
export function Boot() {
  const boot = useStore((s) => s.bootOverrides);
  useAppBoot();
  useEffect(() => {
    boot();
  }, [boot]);
  // an older copy of the featured night in this browser follows the shipped version (after the store hydrates)
  useEffect(() => {
    const run = () => void syncFeaturedNight();
    if (useStore.persist.hasHydrated()) run();
    else return useStore.persist.onFinishHydration(run);
  }, []);
  return null;
}
