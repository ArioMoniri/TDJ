"use client";
import { Keyboard } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Banners } from "@/components/booth/Banners";
import { ControlStrip, STOP_HOLD_MS } from "@/components/booth/ControlStrip";
import { NextCard } from "@/components/booth/NextCard";
import { NowCard } from "@/components/booth/NowCard";
import { OnboardingSheet } from "@/components/booth/OnboardingSheet";
import { SetColumn } from "@/components/booth/SetColumn";
import { BreakSheet, FindFileSheet, ResumeSheet, ShortcutsSheet } from "@/components/booth/Sheets";
import { TimeCard } from "@/components/booth/TimeCard";
import { EmptyState } from "@/components/EmptyState";
import { type MenuItem, MenuList } from "@/components/Menu";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { useBooth } from "@/lib/booth/store";
import { usePlayer } from "@/lib/player";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";

const THEME_KEY = "tdj-booth-theme";

/**
 * /booth (round7-booth.md §1): the night, played from the app. Dark forced while mounted (per-device choice in
 * localStorage), nothing on the content layer is glass, no layout animation; the page is interactive before the
 * DJ's first tap (no LazyHydrate). Opens on the current set; without one, "Compose a night first".
 */
export default function BoothPage() {
  return (
    <Suspense>
      <Booth />
    </Suspense>
  );
}

function Booth() {
  const playlist = useStore((s) => s.playlist);
  const params = useSearchParams();
  const rehearsalParam = params.get("rehearsal") === "1";
  const boot = useBooth((s) => s.boot);
  const ready = useBooth((s) => s.ready);
  const state = useBooth((s) => s.state);
  const started = useBooth((s) => s.started);
  const rehearsal = useBooth((s) => s.sourceMode === "preview");
  const plan = useBooth((s) => s.plan);
  const [onboarding, setOnboarding] = useState(false);
  const [more, setMore] = useState(false);
  const [keys, setKeys] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const [find, setFind] = useState<{ id: string; title: string } | null>(null);
  const [jump, setJump] = useState<number | null>(null);
  const [light, setLight] = useState(false);

  // dark forced while mounted; the DJ's per-device choice overrides it
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.dataset.theme;
    const prevDark = el.classList.contains("dark");
    let wantLight = false;
    try {
      wantLight = localStorage.getItem(THEME_KEY) === "light";
    } catch {}
    setLight(wantLight);
    el.dataset.theme = wantLight ? "light" : "dark";
    el.classList.toggle("dark", !wantLight);
    el.dataset.booth = "1";
    usePlayer.getState().close();
    return () => {
      if (prev) el.dataset.theme = prev;
      else delete el.dataset.theme;
      el.classList.toggle("dark", prevDark);
      delete el.dataset.booth;
      useBooth.getState().leave();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const el = document.documentElement;
    el.dataset.theme = light ? "light" : "dark";
    el.classList.toggle("dark", !light);
    try {
      localStorage.setItem(THEME_KEY, light ? "light" : "dark");
    } catch {}
  }, [light, ready]);

  // boot per set (by id): the booth writes its plan back into the set, which must not re-boot it
  const playlistId = playlist?.id ?? null;
  useEffect(() => {
    const p = useStore.getState().playlist;
    if (p && p.id === playlistId) void boot(p, { rehearsal: rehearsalParam });
  }, [playlistId, boot, rehearsalParam]);

  // the plan for tests and the console (nothing secret: the set the DJ composed)
  useEffect(() => {
    const w = window as unknown as { __tdjBoothPlan?: unknown; __tdjBooth?: unknown };
    w.__tdjBoothPlan = plan;
    w.__tdjBooth = useBooth;
  }, [plan]);

  // keyboard (§1.1): ignored while an input has focus; esc must be held 600 ms
  const escTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const typing = () => {
      const a = document.activeElement as HTMLElement | null;
      return (
        !!a &&
        (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable)
      );
    };
    const down = (e: KeyboardEvent) => {
      if (typing() || document.querySelector('[role="dialog"]')) return;
      const b = useBooth.getState();
      if (e.key === " ") {
        e.preventDefault();
        if (e.repeat) return;
        if (!b.started) void b.start();
        else if ((b.state === "playing" || b.state === "cortina") && !b.holding) b.hold();
        else void b.play();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        b.next();
      } else if (e.key === "Escape") {
        if (e.repeat || escTimer.current) return;
        escTimer.current = setTimeout(() => {
          escTimer.current = null;
          b.stop();
        }, STOP_HOLD_MS);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        b.setCortinaFader(Math.max(0, Math.min(1, b.cortinaFader + (e.key === "ArrowUp" ? 0.05 : -0.05))));
      } else if (e.key === "c") b.cueCortina();
      else if (e.key === "b") b.birthdayVals();
      else if (e.key === "m") b.toggleMute();
      else if (e.key === "?") setKeys(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Escape" && escTimer.current) {
        clearTimeout(escTimer.current);
        escTimer.current = null;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  if (!playlist)
    return (
      <div>
        <PageHeader title="Booth" />
        <EmptyState
          action={
            <Link href="/" className="btn btn-primary">
              Compose
            </Link>
          }
        >
          <span className="text-headline block text-[var(--label)]">Compose a night first</span>
          <span className="block">The booth plays the set on the Compose tab.</span>
        </EmptyState>
      </div>
    );

  const b = useBooth.getState();
  const menu: Array<MenuItem | false> = [
    { label: "Set-up (source, output, night)…", onClick: () => setOnboarding(true) },
    {
      label: rehearsal ? "Rehearsal (30 s) · on" : "Rehearsal (30 s)",
      onClick: () => void b.setSourceMode(rehearsal ? "file" : "preview"),
      disabled: started,
    },
    {
      label: "Link music folder…",
      onClick: () =>
        b.folder.canKeep ? void b.linkFolder() : document.getElementById("booth-folder-input")?.click(),
    },
    { label: "Keyboard shortcuts", icon: Keyboard, onClick: () => setKeys(true) },
    { label: light ? "Dark theme" : "Light theme", onClick: () => setLight((v) => !v) },
    started && {
      label: "End the night",
      destructive: true,
      onClick: () => {
        void b.endNight();
        toast("The night's log is in History");
      },
    },
  ];

  return (
    <div className="booth" data-state={state} data-testid="booth" data-rehearsal={rehearsal || undefined}>
      <PageHeader title={rehearsal ? "Booth (rehearsal)" : "Booth"} />
      <Banners />
      <div className="booth-grid">
        <div className="booth-col-now">
          <NowCard />
        </div>
        <div className="booth-col-mid">
          <NextCard onJump={(i) => setJump(i)} />
          <TimeCard />
        </div>
        <div className="booth-col-set">
          <SetColumn jumpTo={jump} onFind={(id, title) => setFind({ id, title })} />
        </div>
      </div>
      <ControlStrip onMore={() => setMore(true)} onBreak={() => setBreakOpen(true)} />
      {/* any browser: the folder as a FileList (Chromium prefers the persisted handle) */}
      <input
        id="booth-folder-input"
        type="file"
        multiple
        className="sr-only"
        aria-label="Music folder"
        data-testid="booth-folder-input"
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(e) => {
          if (e.target.files?.length) void b.loadFileList(e.target.files);
        }}
      />
      <OnboardingSheet
        open={onboarding}
        onClose={() => setOnboarding(false)}
        onStart={() => {
          setOnboarding(false);
          void b.start();
        }}
      />
      <Sheet
        open={more}
        onClose={() => setMore(false)}
        title="Booth"
        detents={["medium", "large"]}
        testId="booth-menu"
      >
        <MenuList
          items={menu}
          onPick={(it) => {
            setMore(false);
            it.onClick?.();
          }}
        />
      </Sheet>
      <ShortcutsSheet open={keys} onClose={() => setKeys(false)} />
      <BreakSheet open={breakOpen} onClose={() => setBreakOpen(false)} />
      <FindFileSheet item={find} onClose={() => setFind(null)} />
      <ResumeSheet />
    </div>
  );
}
