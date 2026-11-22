"use client";
import { ChevronRight, Clock, PanelLeft, Trash2, Volume2, X } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  COMPACT_H,
  readSidePlayer,
  SIDE_PLAYER_KEY,
  settleSidePlayer,
  sidePlayerFit,
} from "@/lib/dock/sidePlayer";
import { useDock } from "@/lib/dock/store";
import { haptic } from "@/lib/haptics";
import { fmtDate, t as tx } from "@/lib/i18n";
import { nightMusicSec } from "@/lib/lengths";
import { spring } from "@/lib/motion";
import { askDeleteNights, deleteLabel, protectedReason } from "@/lib/nightDelete";
import { lengthText } from "@/lib/nightName";
import { orchestraName } from "@/lib/orchestraName";
import { usePlayer } from "@/lib/player";
import { useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { HistorySnapshot } from "@/lib/types";
import { Logo } from "./Logo";
import { Menu } from "./Menu";
import { useNightMenuItems } from "./NightRowMenu";
import { NAV_MAIN, NAV_MAIN_TITLE, NAV_PINNED } from "./navItems";
import { SwipeRow } from "./SwipeRow";
import { TandaArt } from "./ui/TandaArt";
import { tandaTypeWords } from "./ui/TandaTypeBadge";
import { Tip } from "./ui/Tip";

/** Fired with the tanda index when the sidebar's Tonight list picks a tanda: the Compose inspector follows it. */
export const SELECT_TANDA_EVENT = "tdj:select-tanda";

const KEY = "tdj-sidebar";
const MIN_W = 200;
const MAX_W = 360;
const DEFAULT_W = 240;

const library = NAV_MAIN;
const pinned = NAV_PINNED;

interface Saved {
  w: number;
  collapsed: boolean;
}
function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Saved> | null;
    return {
      w: typeof v?.w === "number" ? Math.min(MAX_W, Math.max(MIN_W, v.w)) : DEFAULT_W,
      collapsed: !!v?.collapsed,
    };
  } catch {
    return { w: DEFAULT_W, collapsed: false };
  }
}
function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
/** The root carries the state, so `main`, the toolbar and the mini player lay out from CSS without a re-render. */
function apply(s: Saved) {
  const r = document.documentElement;
  r.style.setProperty("--sidebar-open-w", `${s.w}px`);
  if (s.collapsed) r.dataset.sidebar = "collapsed";
  else delete r.dataset.sidebar;
}

/*
 * 2026-11 (the owner: "the parts resizing when the sidebar opens and closes is so laggy"; a trace of a long night on
 * Compose: ~100 ms of layout and a whole-document restyle per frame). The page used to follow the sidebar through
 * the root's `--sidebar-w`, a transitioned custom property every element inherits: each frame of a collapse or a
 * drag restyled all ~9,500 elements and laid `main` out at a new width (tanda grid, energy charts, the Booth deck and
 * every ResizeObserver behind them). Now, while the sidebar moves:
 * - the sidebar slides on the compositor (its own `data-collapsed`, set by React in the click);
 * - `main` keeps one width (the wider of before and after: clipped on the right, never a gap) and glides by its own
 *   margin; the Booth's docked bars and the toast glide by `translate` at their final width;
 * - the root's variables (`data-sidebar`, `--sidebar-open-w`) change once, when the motion ends (a collapse or
 *   expand) or on release (a drag), so the one whole-document restyle never lands in a moving frame.
 * Reduce Motion and screens below lg change at once, as before.
 */
/** the elements outside `main` placed from `--sidebar-w` (booth.css `--bx-l`, the toast) */
const FOLLOWERS = ".booth .booth-strip, .booth .booth-ctl, .app-toast";
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"; // --ease-settle
/**
 * the page's offset for a sidebar state, from the state itself: no style read (a getComputedStyle of the root's
 * variable or of a docked bar's `left` forced a style and layout pass of the whole night, ~40–150 ms, in the click)
 */
const offsetOf = (s: Saved) => {
  const r = document.documentElement;
  const traffic = r.classList.contains("titlebar-overlay") && r.dataset.fullscreen === undefined ? 78 : 0;
  return s.collapsed ? traffic + 52 : s.w;
};
const moving = () =>
  matchMedia("(min-width: 900px)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches;
let running: { anims: Animation[]; finish: () => void } | null = null;

/**
 * one collapse or expand: the motion first, the root's state when it ends (see above). `begin` sets the sidebar's
 * own state (its compositor slide). A collapse first lays the page out at its wider width while nothing moves yet
 * (one frame), so no frame of the slide ever holds that layout; an expand keeps the wide width until it ends.
 */
function animateSidebar(prev: Saved, next: Saved, begin: () => void) {
  running?.finish();
  const main = document.querySelector("main");
  if (!main || !moving()) {
    apply(next);
    return begin();
  }
  const r = document.documentElement;
  const vw = r.clientWidth;
  const from = offsetOf(prev);
  const to = offsetOf(next);
  if (Math.abs(to - from) < 1) {
    apply(next);
    return begin();
  }
  const fol = [...document.querySelectorAll<HTMLElement>(FOLLOWERS)];
  main.style.width = `${vw - Math.min(from, to)}px`;
  main.style.marginLeft = `${from}px`;
  r.dataset.sidebarAnimating = "1";
  const anims: Animation[] = [];
  const run = {
    anims,
    finish: () => {
      if (running !== run) return;
      running = null;
      // the root takes the new state, and in the same task every element hands its motion back to it
      apply(next);
      for (const a of anims) a.cancel();
      main.style.width = "";
      main.style.marginLeft = "";
      delete r.dataset.sidebarAnimating;
    },
  };
  running = run;
  const go = () => {
    if (running !== run) return;
    begin();
    const opts: KeyframeAnimationOptions = { duration: 260, easing: EASE, fill: "forwards" };
    anims.push(main.animate([{ marginLeft: `${from}px` }, { marginLeft: `${to}px` }], opts));
    // (the docked bars are placed from `--sidebar-w` + a constant: they move by the same amount, at their width)
    for (const el of fol)
      anims.push(el.animate([{ translate: "0 0" }, { translate: `${to - from}px 0` }], opts));
    void Promise.all(anims.map((a) => a.finished))
      .catch(() => {})
      .then(run.finish);
  };
  // a collapse: the wider layout in the next frame, the slide from the one after (a requestAnimationFrame callback
  // runs before its own frame's layout); an expand: at once
  if (to < from) requestAnimationFrame(() => requestAnimationFrame(go));
  else go();
}

const RHYTHM: Record<string, string> = { tango: "T", vals: "V", milonga: "M" };
const ago = (iso: string) => {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0
    ? tx("sidebar.today")
    : d === 1
      ? tx("sidebar.yesterday")
      : d < 7
        ? tx("sidebar.days_ago", { d })
        : fmtDate(iso);
};

function SideLink({
  href,
  label,
  icon: Icon,
  on,
  pill,
}: {
  href: string;
  label: string;
  icon: (typeof library)[number]["icon"];
  on: boolean;
  pill: string;
}) {
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className="side-row">
      {on && (
        <motion.span
          layoutId={pill}
          layoutDependency={href}
          transition={spring.thumb}
          className="absolute inset-0 -z-10 rounded-[8px] bg-[var(--fill-3)]"
          aria-hidden
        />
      )}
      <Icon
        size={18}
        strokeWidth={1.75}
        className={on ? "text-[var(--tint)]" : "text-[var(--label-2)]"}
        aria-hidden
      />
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}

/**
 * macOS / iPadOS sidebar (Music, Finder, Notes): sections with headers (Library; Tonight, the current night's tandas
 * to jump to with the one now playing marked; Recent nights), Guide and Settings pinned at the foot with the one
 * player docked above them (components/player/PlayerDock.tsx). It collapses (the toolbar button or ⌃⌘S) and resizes from its trailing edge; both
 * are remembered. Material on the control layer only; rows are 44 pt where the pointer is a finger.
 */
export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const playlist = useStore((s) => s.playlist);
  const history = useStore((s) => s.history);
  const track = usePlayer((s) => s.track);
  const [state, setState] = useState<Saved>({ w: DEFAULT_W, collapsed: false });
  const [hash, setHash] = useState("");
  const drag = useRef<{ x: number; w: number; now: number } | null>(null);
  const aside = useRef<HTMLElement>(null);
  // the Tonight list's disclosure, remembered on this device
  const [tonightOpen, setTonightOpenState] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("tdj-side-tonight") === "0") setTonightOpenState(false);
    } catch {}
  }, []);
  const setTonightOpen = (v: boolean) => {
    setTonightOpenState(v);
    try {
      localStorage.setItem("tdj-side-tonight", v ? "1" : "0");
    } catch {}
  };

  useEffect(() => {
    const s = load();
    setState(s);
    apply(s);
  }, []);
  const update = useCallback((next: Saved, persist = true) => {
    setState(next);
    apply(next);
    if (persist) save(next);
  }, []);
  const setCollapsed = useCallback((collapsed: boolean) => {
    haptic(4);
    const prev = load();
    const next = { ...prev, collapsed };
    // the motion, then the root's state when it ends (animateSidebar); the React state when it starts
    save(next);
    animateSidebar(prev, next, () => setState(next));
  }, []);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      // ⌃⌘S: the macOS "Show / Hide Sidebar" shortcut
      if (e.ctrlKey && e.metaKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setCollapsed(!load().collapsed);
      }
    };
    const onHash = () => setHash(location.hash);
    onHash();
    window.addEventListener("keydown", onKey);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hashchange", onHash);
    };
  }, [setCollapsed]);

  // 2026-11 (design review: "a 40 px empty strip mid-drag"): while the edge is dragged the page follows it live —
  // the width goes to the root's `--sidebar-open-w` once per frame (rAF, no React render per move), so the sidebar,
  // `main`, the toolbar and the Booth's bottom stack move together; the transitions are off meanwhile
  // (2026-11, the owner: "laggy"): per frame only the sidebar's own width, `main`'s margin at a frozen width and the
  // followers' `left` change (see animateSidebar); the root's `--sidebar-open-w` once, on release
  const frame = useRef(0);
  const followers = useRef<HTMLElement[]>([]);
  const onResizeDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: state.w, now: state.w };
    aside.current?.setAttribute("data-resizing", "");
    const r = document.documentElement;
    r.dataset.sidebarResizing = "1";
    followers.current = [...document.querySelectorAll<HTMLElement>(FOLLOWERS)];
    const main = document.querySelector("main");
    // the widest the page can be while the edge moves: clipped on the right, never a gap
    if (main && matchMedia("(min-width: 900px)").matches) main.style.width = `${r.clientWidth - MIN_W}px`;
  };
  const onResizeMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const w = Math.round(Math.min(MAX_W, Math.max(MIN_W, d.w + e.clientX - d.x)));
    if (w === d.now) return;
    d.now = w;
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const now = drag.current?.now;
        if (now === undefined) return;
        if (aside.current) aside.current.style.width = `${now}px`;
        const main = document.querySelector("main");
        if (main?.style.width) main.style.marginLeft = `${now}px`;
        // the docked bars glide by `translate` at their width (no resize per frame)
        for (const el of followers.current) el.style.translate = `${now - d.w}px 0`;
      });
  };
  const onResizeUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    aside.current?.removeAttribute("data-resizing");
    delete document.documentElement.dataset.sidebarResizing;
    update({ ...state, w: d.now });
    // the root holds the width now: hand every element back to it (one layout)
    if (aside.current) aside.current.style.width = "var(--sidebar-open-w, 240px)";
    const main = document.querySelector("main");
    if (main) {
      main.style.width = "";
      main.style.marginLeft = "";
    }
    for (const el of followers.current) el.style.translate = "";
    followers.current = [];
  };
  const onResizeKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 40 : 10;
    const w =
      e.key === "ArrowLeft"
        ? state.w - step
        : e.key === "ArrowRight"
          ? state.w + step
          : e.key === "Home"
            ? MIN_W
            : e.key === "End"
              ? MAX_W
              : null;
    if (w == null) return;
    e.preventDefault();
    update({ ...state, w: Math.min(MAX_W, Math.max(MIN_W, w)) });
  };

  /** the tanda that holds the track now playing (by song id) */
  const nowTanda = track
    ? (playlist?.tandas.findIndex((t) => t.songs.some((s) => s.id === track.id)) ?? -1)
    : -1;
  const goTanda = (i: number) => {
    haptic(4);
    window.dispatchEvent(new CustomEvent(SELECT_TANDA_EVENT, { detail: i }));
    if (path === "/") {
      document.getElementById(`tanda-${i + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else router.push(`/#tanda-${i + 1}`);
  };
  const recent = history.slice(0, 5);

  /* ——— the player's share of the sidebar (2026-11, the owner: "the lower part takes too much space from the nav"):
     a handle between the nav and the docked player sets its height (kept on this device); a short window takes it
     down to what leaves the nav its room; below the whole player's height it is the compact row (lib/dock/sidePlayer) */
  const docked = useDock((d) => d.place === "side");
  const [chosen, setChosen] = useState(() => readSidePlayer(null));
  const [liveH, setLiveH] = useState<number | null>(null);
  const [room, setRoom] = useState(100_000);
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      setChosen(readSidePlayer(localStorage.getItem(SIDE_PLAYER_KEY)));
    } catch {}
  }, []);
  useEffect(() => {
    const a = scrollRef.current;
    const b = slotRef.current;
    if (!docked || !a || !b || typeof ResizeObserver !== "function") return;
    // the nav's and the player's height together (the nav scrolls, so it gives up what the player takes)
    const read = () => setRoom(Math.round(a.clientHeight + b.getBoundingClientRect().height));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(a);
    ro.observe(b);
    return () => ro.disconnect();
  }, [docked]);
  const fit = sidePlayerFit(liveH ?? chosen, room);
  const keep = (h: number) => {
    const v = settleSidePlayer(h);
    setChosen(v);
    try {
      localStorage.setItem(SIDE_PLAYER_KEY, String(v));
    } catch {}
  };
  const split = useRef<{ y: number; h: number; now: number } | null>(null);
  const onSplitDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    split.current = { y: e.clientY, h: fit.height, now: fit.height };
  };
  const onSplitMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = split.current;
    if (!d) return;
    d.now = Math.max(COMPACT_H, d.h + (d.y - e.clientY));
    setLiveH(d.now);
  };
  const onSplitUp = () => {
    const d = split.current;
    if (!d) return;
    split.current = null;
    setLiveH(null);
    haptic(4);
    keep(sidePlayerFit(d.now, room).height);
  };
  const onSplitKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 60 : 20;
    const h =
      e.key === "ArrowUp"
        ? fit.height + step
        : e.key === "ArrowDown"
          ? fit.height - step
          : e.key === "Home"
            ? COMPACT_H
            : e.key === "End"
              ? room
              : null;
    if (h === null) return;
    e.preventDefault();
    keep(sidePlayerFit(h, room).height);
  };

  return (
    <>
      <aside
        ref={aside}
        className="side-aside material-thin fixed left-0 top-0 z-40 hidden h-dvh flex-col border-r border-[var(--separator)] lg:flex"
        style={{ width: "var(--sidebar-open-w, 240px)" }}
        aria-hidden={state.collapsed || undefined}
        inert={state.collapsed || undefined}
        aria-label={tx("sidebar.sidebar")}
        data-testid="sidebar"
        data-collapsed={state.collapsed || undefined}
        data-player={docked ? fit.mode : undefined}
      >
        {/* the title-bar strip (traffic lights on the Mac app) is the window's drag region */}
        <div
          className="shrink-0"
          style={{ height: "var(--chrome-top)" }}
          data-tauri-drag-region
          aria-hidden
        />
        <div className="flex shrink-0 items-center gap-2 px-3 pt-2 pb-1" data-tauri-drag-region>
          <Link
            href="/"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 px-2"
            aria-label={tx("sidebar.t_dj_home")}
          >
            <Logo size={28} />
            <span className="text-headline">{tx("sidebar.t_dj")}</span>
          </Link>
          <Tip text={tx("sidebar.hide_sidebar_s")}>
            <button
              type="button"
              className="icon-btn icon-btn-bare text-[var(--label-2)]"
              aria-label={tx("sidebar.hide_sidebar")}
              onClick={() => setCollapsed(true)}
              data-testid="sidebar-hide"
            >
              <PanelLeft size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </Tip>
        </div>

        <div ref={scrollRef} className="side-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <nav aria-label={tx("sidebar.primary_sidebar")}>
            <h2 className="side-head">{NAV_MAIN_TITLE()}</h2>
            <LayoutGroup id="sidebar-nav">
              <div className="flex flex-col gap-0.5">
                {library.map((it) => (
                  <SideLink key={it.href} {...it} on={path === it.href} pill={"side-pill"} />
                ))}
              </div>
            </LayoutGroup>
          </nav>

          {playlist && playlist.tandas.length > 0 && (
            <section aria-labelledby="side-tonight" data-testid="sidebar-tonight">
              {/* a Finder-style disclosure: the Tonight list folds away (remembered on this device) */}
              <h2 className="side-head" id="side-tonight">
                <button
                  type="button"
                  className="side-head-btn flex min-h-11 w-full items-center gap-1 text-left"
                  aria-expanded={tonightOpen}
                  aria-controls="side-tonight-list"
                  data-testid="sidebar-tonight-toggle"
                  onClick={() => setTonightOpen(!tonightOpen)}
                >
                  <ChevronRight
                    size={14}
                    aria-hidden
                    className="shrink-0 transition-transform duration-200"
                    style={{ transform: tonightOpen ? "rotate(90deg)" : undefined }}
                  />
                  {/* 2026-11: the count and length on their own line under "Tonight", never cut nor hidden (the
                      header's one line cut them at 240 px and hid them below 230 px, mid-drag too) */}
                  <span className="side-head-label">
                    <span>{tx("sidebar.tonight")}</span>
                    <span className="side-head-meta" data-testid="sidebar-tonight-meta">
                      {tx("sidebar.tandas", {
                        length: playlist.tandas.length,
                        durationSec: lengthText(
                          nightMusicSec(playlist, useStore.getState().settings) ?? playlist.stats.durationSec,
                        ),
                      })}
                    </span>
                  </span>
                </button>
              </h2>
              <ol className="flex flex-col gap-0.5" id="side-tonight-list" hidden={!tonightOpen}>
                {playlist.tandas.map((t, i) => {
                  const now = i === nowTanda;
                  const here = hash === `#tanda-${i + 1}`;
                  return (
                    <li key={`${t.index}-${t.songs[0]?.id}`}>
                      <button
                        type="button"
                        className="side-row side-tanda w-full text-left"
                        aria-current={here ? "location" : undefined}
                        onClick={() => {
                          setHash(`#tanda-${i + 1}`);
                          goTanda(i);
                        }}
                        data-now={now || undefined}
                      >
                        {/* 2026-11 ("images are not added on the left side"): the tanda's cover, its rhythm letter
                            in the corner (the letter alone when artwork is off) */}
                        <span className="side-tanda-art" data-testid="side-tanda-art">
                          <TandaArt tanda={t} size={32} badge={RHYTHM[t.rhythm] ?? "·"} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            <span className="sr-only">{tx("sidebar.tanda", { p1: i + 1 })} </span>
                            {orchestraName({ orchestra: t.orchestra, singer: t.singer })}
                          </span>
                          {/* 2026-11: the tanda's type in words (rhythm, vocal or instrumental) */}
                          <span className="side-tanda-type block truncate" data-rhythm={t.rhythm}>
                            {tandaTypeWords({
                              rhythm: t.rhythm,
                              vocal: t.vocal,
                              singer: t.singer,
                              songs: t.songs,
                            })}
                          </span>
                        </span>
                        {now ? (
                          <Volume2
                            size={14}
                            className="shrink-0 text-[var(--tint)]"
                            aria-label={tx("sidebar.now_playing")}
                          />
                        ) : (
                          <span
                            className="text-caption1 shrink-0 tabular-nums text-[var(--label-3)]"
                            aria-hidden
                          >
                            {i + 1}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {recent.length > 0 && (
            <section aria-labelledby="side-recent" data-testid="sidebar-recent">
              <h2 className="side-head" id="side-recent">
                {tx("sidebar.recent_nights")}
              </h2>
              {/* 2026-11 (the owner: "delete nights from Recent nights"): ✕ on hover, right-click, a swipe, or
                  Delete / Backspace on the focused row ask once (components/DeleteNights.tsx); the night the Booth
                  has open stays (its ✕ says why), the featured night only leaves the recents */}
              <ul className="flex flex-col gap-0.5">
                {recent.map((s) => (
                  <RecentRow key={s.id} s={s} />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="side-foot shrink-0 border-t border-[var(--separator)] px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {/* the handle between the nav and the docked player: drag (or arrow keys) to share the height, double-click
              for the compact row or the whole player */}
          {docked && (
            // biome-ignore lint/a11y/useSemanticElements: a focusable window splitter (WAI-ARIA separator pattern)
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label={tx("sidebar.resize_player")}
              aria-valuemin={COMPACT_H}
              aria-valuemax={Math.max(COMPACT_H, room)}
              aria-valuenow={fit.height}
              aria-valuetext={
                fit.mode === "compact" ? tx("sidebar.player_compact") : tx("sidebar.player_full")
              }
              tabIndex={0}
              className="side-split"
              data-testid="sidebar-split"
              data-dragging={liveH !== null || undefined}
              onPointerDown={onSplitDown}
              onPointerMove={onSplitMove}
              onPointerUp={onSplitUp}
              onPointerCancel={onSplitUp}
              onDoubleClick={() => keep(fit.mode === "compact" ? readSidePlayer(null) : COMPACT_H)}
              onKeyDown={onSplitKey}
            >
              <span className="side-split-bar" aria-hidden />
            </div>
          )}
          {/* 2026-11 (the owner: "the player … all on the left in the side bar"): the one player docks here
              (components/player/PlayerDock.tsx portals into this slot); it was a now-playing card here and a
              second player at the page's foot */}
          <div
            ref={slotRef}
            id="sidebar-player"
            className="side-player"
            data-testid="sidebar-player"
            data-mode={docked ? fit.mode : undefined}
            style={docked && fit.mode === "full" ? { maxHeight: `${fit.height}px` } : undefined}
          />
          <LayoutGroup id="sidebar-foot">
            <div className="flex flex-col gap-0.5">
              {pinned.map((it) => (
                <SideLink key={it.href} {...it} on={path === it.href} pill={"side-pill-foot"} />
              ))}
            </div>
          </LayoutGroup>
          <p className="text-caption2 truncate px-3 pt-2 text-[var(--label-3)]" data-testid="sidebar-credit">
            {tx("about.developed_by")}
          </p>
        </div>

        {/* trailing edge: drag (or arrow keys) to resize, double-click to reset */}
        {/* biome-ignore lint/a11y/useSemanticElements: a focusable window splitter (WAI-ARIA separator pattern) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={tx("sidebar.resize_sidebar")}
          aria-valuemin={MIN_W}
          aria-valuemax={MAX_W}
          aria-valuenow={state.w}
          tabIndex={0}
          className="side-resize"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          onDoubleClick={() => update({ ...state, w: DEFAULT_W })}
          onKeyDown={onResizeKey}
          data-testid="sidebar-resize"
        />
      </aside>

      {/* collapsed: one button brings it back, in the page toolbar's row (centred on the title's line) and in the
          rail the collapsed sidebar leaves (`--sidebar-w`), so the title keeps the content's edge; clear of the
          traffic lights on the Mac app. Its wrapper is the fixed box: an in-flow wrapper pushed the page down 24 px */}
      {state.collapsed && (
        <Tip text={tx("sidebar.show_sidebar_s")} className="side-show">
          <button
            type="button"
            className="icon-btn icon-btn-glass"
            aria-label={tx("sidebar.show_sidebar")}
            onClick={() => setCollapsed(false)}
            data-testid="sidebar-show"
          >
            <PanelLeft size={20} strokeWidth={1.75} aria-hidden />
          </button>
        </Tip>
      )}
    </>
  );
}

/**
 * One of the Recent nights. 2026-11 (the owner: "delete nights from Recent nights", then "rename and delete
 * everywhere"): ✕ on hover deletes (asked once, components/DeleteNights.tsx); "•••" on hover, a right-click or a long
 * press opens the night's menu — Play in the Booth, Reopen in Compose, Rename…, Delete (components/NightRowMenu.tsx);
 * a swipe, or Delete / Backspace on the focused row, asks to delete. The night the Booth has open stays (its ✕ says
 * why), the featured night only leaves the recents and keeps its name.
 */
function RecentRow({ s }: { s: HistorySnapshot }) {
  const ref = useRef<HTMLLIElement>(null);
  const items = useNightMenuItems();
  const why = protectedReason(s);
  const label = deleteLabel(s);
  const del = () => !why && askDeleteNights([s.id]);
  return (
    <li ref={ref} className="side-recent" data-testid="sidebar-recent-row">
      <SwipeRow
        actions={[
          {
            kind: "destructive",
            label,
            icon: Trash2,
            onClick: del,
            disabled: !!why,
          },
        ]}
      >
        <Link
          href={`/history#night=${s.id}`}
          className="side-row"
          onKeyDown={(e) => {
            if (e.key !== "Delete" && e.key !== "Backspace") return;
            e.preventDefault();
            if (why) toast(why);
            else del();
          }}
        >
          <Clock size={16} strokeWidth={1.75} className="shrink-0 text-[var(--label-2)]" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{s.title}</span>
            <span className="text-caption1 block truncate text-[var(--label-2)]">
              {ago(s.createdAt)} · {s.score}
            </span>
          </span>
        </Link>
      </SwipeRow>
      <span className="side-recent-more" data-testid="sidebar-recent-more">
        <Menu
          label={tx("nights.actions_of", { title: s.title })}
          tip={tx("nights.actions")}
          className="side-recent-x icon-btn-bare"
          contextRef={ref}
          items={items(s)}
        />
      </span>
      <Tip text={why ?? tx("nightDelete.delete_named", { label, title: s.title })}>
        <button
          type="button"
          className="side-recent-x icon-btn icon-btn-bare"
          aria-label={tx("nightDelete.delete_named", { label, title: s.title })}
          aria-disabled={why ? true : undefined}
          data-protected={why ? "" : undefined}
          onClick={() => (why ? toast(why) : del())}
          data-testid="sidebar-recent-delete"
        >
          <X size={14} strokeWidth={2.25} aria-hidden />
        </button>
      </Tip>
    </li>
  );
}
