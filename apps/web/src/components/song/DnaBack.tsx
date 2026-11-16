"use client";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { backStep, readTrail, type TrailStep } from "@/lib/navTrail";

/**
 * QA fix 2026-11 (the owner: "there should be a back button from the Song DNA page") — "‹ Back" on /song, /orchestra
 * and /singer, named after the page it returns to ("‹ Compose", "‹ Ansiedad", "‹ Juan D'Arienzo"). It is the
 * browser's back (the same entry the OS's back and the iPad's swipe take, scroll restored by the router); a page
 * opened directly goes to the Library. Esc and ⌘[ / Ctrl+[ do the same on desktop.
 */
export function DnaBack() {
  const router = useRouter();
  const [step, setStep] = useState<TrailStep | null>(null);
  const [here, setHere] = useState("");
  useEffect(() => {
    const read = () => {
      const h = `${location.pathname}${location.search}`;
      setHere(h);
      setStep(backStep(readTrail(), h));
    };
    read();
    const id = setInterval(read, 600);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const go = () => (step ? router.back() : router.push("/library"));
    const k = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.(
        "input, textarea, select, [contenteditable]",
      );
      if (typing || e.defaultPrevented) return;
      const bracket = (e.metaKey || e.ctrlKey) && e.key === "[";
      const esc = e.key === "Escape" && !document.querySelector('[role="dialog"], [role="menu"]');
      if (!bracket && !esc) return;
      e.preventDefault();
      go();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [step, router]);
  const label = step?.label || (step ? t("song.back") : t("navItems.library"));
  return (
    <button
      type="button"
      className="btn-plain -ml-2 inline-flex min-h-11 max-w-full items-center gap-0.5 px-2 text-[var(--tint-text,var(--tint))]"
      onClick={() => (step ? router.back() : router.push("/library"))}
      aria-label={t("song.back_to", { page: label })}
      data-testid="dna-back"
      data-href={here}
    >
      <ChevronLeft size={20} strokeWidth={2.25} aria-hidden className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
