"use client";
import { Eye, Keyboard, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Banners } from "@/components/booth/Banners";
import { ControlStrip } from "@/components/booth/ControlStrip";
import { EnergyRail } from "@/components/booth/EnergyRail";
import { HintLayer } from "@/components/booth/Indicators";
import { NextCard } from "@/components/booth/NextCard";
import { NightBar } from "@/components/booth/NightBar";
import { NowCard } from "@/components/booth/NowCard";
import { OnboardingSheet } from "@/components/booth/OnboardingSheet";
import { PlayerToolbar, ShowSheet } from "@/components/booth/PlayerToolbar";
import { SetColumn } from "@/components/booth/SetColumn";
import {
  BreakSheet,
  CortinaSheet,
  FindFileSheet,
  LevelsSheet,
  ResumeSheet,
  ShortcutsSheet,
  StopSheet,
} from "@/components/booth/Sheets";
import { SongSheet } from "@/components/booth/SongSheet";
import { EmptyState } from "@/components/EmptyState";
import { type MenuItem, MenuList } from "@/components/Menu";
import { PageHeader } from "@/components/PageHeader";
import { Sheet } from "@/components/Sheet";
import { BoothSongSearch } from "@/components/ui/BoothSongSearch";
import { boothContextState, boothEngine, useBooth } from "@/lib/booth/store";
import { useMediaQuery } from "@/lib/hooks";
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
  const router = useRouter();
  const params = useSearchParams();
  const rehearsalParam = params.get("rehearsal") === "1";
  const boot = useBooth((s) => s.boot);
  const ready = useBooth((s) => s.ready);
  const state = useBooth((s) => s.state);
  const started = useBooth((s) => s.started);
  const rehearsal = useBooth((s) => s.rehearsal);
  const plan = useBooth((s) => s.plan);
  const [onboarding, setOnboarding] = useState(false);
  const [more, setMore] = useState(false);
  const [keys, setKeys] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const [find, setFind] = useState<{ id: string; title: string } | null>(null);
  const [jump, setJump] = useState<number | null>(null);
  const [light, setLight] = useState(false);
  const [levels, setLevels] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [cortina, setCortina] = useState<number | null>(null);
  // round 22: the song sheet (tap any row, or Song info on Now), the phone's set-list sheet, the Show sheet
  const [song, setSong] = useState<number | null>(null);
  const [setOpen, setSetOpen] = useState(false);
  const [show, setShow] = useState(false);
  const phone = useMediaQuery("(max-width: 639px)", false);
  // a tanda tapped on the energy chart or the Next card: the set list scrolls to it (a phone opens the sheet first)
  const showInSet = (i: number) => {
    if (phone) setSetOpen(true);
    setJump(i);
  };
  // the stored theme, read at mount: the persisting effect waits until `light` holds it (round 18: with the booth
  // already ready at mount, its first run wrote "dark" over a stored "light" before setLight(true) landed)
  const storedLight = useRef<boolean | null>(null);
  const themeSynced = useRef(false);

  // while a night runs the phone tab bar leaves (round8-ux.md §1.5); "Leave the booth" in ••• is the way out
  useEffect(() => {
    const el = document.documentElement;
    if (started) el.dataset.boothLive = "1";
    else delete el.dataset.boothLive;
    return () => {
      delete el.dataset.boothLive;
    };
  }, [started]);

  // dark forced while mounted; the DJ's per-device choice overrides it
  useEffect(() => {
    const el = document.documentElement;
    const prev = el.dataset.theme;
    const prevDark = el.classList.contains("dark");
    let wantLight = false;
    try {
      wantLight = localStorage.getItem(THEME_KEY) === "light";
    } catch {}
    storedLight.current = wantLight;
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
    if (!ready || storedLight.current === null) return;
    if (!themeSynced.current) {
      if (light !== storedLight.current) return;
      themeSynced.current = true;
    }
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
    const w = window as unknown as {
      __tdjBoothPlan?: unknown;
      __tdjBooth?: unknown;
      __tdjBoothEngine?: unknown;
      __tdjBoothCtx?: unknown;
    };
    w.__tdjBoothPlan = plan;
    w.__tdjBooth = useBooth;
    // round 20: the e2e measures the master output (the analyser right before the speakers) and the context state
    w.__tdjBoothEngine = boothEngine;
    w.__tdjBoothCtx = boothContextState;
  }, [plan]);

  // keyboard (§1.1, round 20): ignored while an input has focus or a sheet is up; esc opens the Stop confirm
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
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        e.preventDefault();
        if (e.repeat) return;
        b.togglePause();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        b.next();
      } else if (e.key === "Escape") {
        if (e.repeat) return;
        if (b.started && b.state !== "stopped" && b.state !== "idle") setStopOpen(true);
      } else if (e.key === "f") b.fadeOutNow();
      else if (e.key === "x") void b.crossfadeNext();
      else if (e.key === "h") {
        if (b.state === "playing" || b.state === "cortina") b.toggleHold();
      } else if (e.key === "t") b.setDucked(!b.ducked);
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        b.setCortinaFader(Math.max(0, Math.min(1, b.cortinaFader + (e.key === "ArrowUp" ? 0.05 : -0.05))));
      } else if (e.key === "c") b.cueCortina();
      // round 22: p pre-listens the next item in the headphones, P stops the pre-listen (the room keeps playing)
      else if (e.key === "p") {
        if (b.plan) void b.prelisten({ i: Math.min(b.plan.items.length - 1, b.planIndex + 1) });
      } else if (e.key === "P") b.stopAudition();
      else if (e.key === "b") b.birthdayVals();
      else if (e.key === "m") b.toggleMute();
      else if (e.key === "?") setKeys(true);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
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
  // round 22: every night and song tool has its own home (the night bar, the transport, Mix, the song sheet); the
  // overflow keeps set-up and the app
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
    { label: "Show: energy, BPM, key, era, artwork…", icon: Eye, onClick: () => setShow(true) },
    { label: "Keyboard shortcuts", icon: Keyboard, onClick: () => setKeys(true) },
    { label: light ? "Dark theme" : "Light theme", onClick: () => setLight((v) => !v) },
    started && { label: "Leave the booth", icon: LogOut, onClick: () => router.push("/") },
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
      {/* the title keeps one width; the mode is a chip under it (round8-ux.md §2 Booth) */}
      <PageHeader title="Booth" />
      <PlayerToolbar rehearsal={rehearsal} />
      <Banners />
      <BoothSongSearch />
      <div className="booth-grid">
        <div className="booth-deck">
          <NowCard onInfo={(i) => setSong(i)} />
          {phone && <NightBar onBreak={() => setBreakOpen(true)} />}
          <div className="booth-deck-row">
            <EnergyRail onJump={showInSet} />
            <NextCard onJump={showInSet} />
          </div>
        </div>
        {!phone && (
          <aside className="booth-col-set" aria-label="The night and its set list">
            <NightBar onBreak={() => setBreakOpen(true)} />
            <SetColumn
              jumpTo={jump}
              onFind={(id, title) => setFind({ id, title })}
              onCortina={(i) => setCortina(i)}
              onTapRow={(i) => setSong(i)}
            />
          </aside>
        )}
      </div>
      {phone && (
        <Sheet
          open={setOpen}
          onClose={() => setSetOpen(false)}
          title="Set list"
          trailing="Done"
          detents={["large"]}
          testId="booth-set-sheet"
        >
          <div className="booth-set-sheet">
            <SetColumn
              jumpTo={jump}
              onFind={(id, title) => setFind({ id, title })}
              onCortina={(i) => setCortina(i)}
              onTapRow={(i) => setSong(i)}
            />
          </div>
        </Sheet>
      )}
      <ControlStrip
        onMore={() => setMore(true)}
        onLevels={() => setLevels(true)}
        onStop={() => setStopOpen(true)}
        onSet={phone ? () => setSetOpen(true) : undefined}
      />
      <SongSheet i={song} onClose={() => setSong(null)} />
      <ShowSheet open={show} onClose={() => setShow(false)} />
      <HintLayer />
      <LevelsSheet open={levels} onClose={() => setLevels(false)} />
      <StopSheet open={stopOpen} onClose={() => setStopOpen(false)} />
      <CortinaSheet planIndex={cortina} onClose={() => setCortina(null)} />
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
          const files = e.target.files;
          if (files?.length) {
            // the File objects stay readable once copied; the input itself is cleared at once (Chromium's
            // renderer crashed when a sheet opened while the input still held a directory's FileList)
            const copy = Array.from(files);
            e.target.value = "";
            void b.loadFileList(copy);
          }
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
