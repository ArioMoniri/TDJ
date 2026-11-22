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
    // the owner's devices only (lib/contrib/owner.ts): catalogue edits go to the shared repo data as contributions;
    // every other device never loads the module
    try {
      if (localStorage.getItem("tdj-owner-v1"))
        void import("@/lib/contrib/owner").then((m) => m.startOwnerSync());
    } catch {}
    // docs/SYNC.md: a device that joined a sync space syncs on every page; others never load the module
    try {
      if (localStorage.getItem("tdj-sync-v1")) void import("@/lib/sync/client").then((m) => m.startSync());
    } catch {}
  }, [boot]);
  // an older copy of the featured night in this browser follows the shipped version (after the store hydrates)
  useEffect(() => {
    const run = () => void syncFeaturedNight();
    if (useStore.persist.hasHydrated()) run();
    else return useStore.persist.onFinishHydration(run);
  }, []);
  return null;
}
