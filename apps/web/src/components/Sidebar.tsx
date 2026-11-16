"use client";
import { ChevronRight, Clock, Disc3, PanelLeft, Pause, Play, Volume2 } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { fmtDate, t as tx } from "@/lib/i18n";
import { nightMusicSec } from "@/lib/lengths";
import { spring } from "@/lib/motion";
import { lengthText } from "@/lib/nightName";
import { usePlayer } from "@/lib/player";
import { useStore } from "@/lib/store";
import { Logo } from "./Logo";
import { NAV_MAIN, NAV_MAIN_TITLE, NAV_PINNED } from "./navItems";
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
 * to jump to with the one now playing marked; Recent nights), Guide and Settings pinned at the foot with a compact
 * now-playing card above them. It collapses (the toolbar button or ⌃⌘S) and resizes from its trailing edge; both
 * are remembered. Material on the control layer only; rows are 44 pt where the pointer is a finger.
 */
export function Sidebar() {
  const path = usePathname();
  const router = useRouter();
  const playlist = useStore((s) => s.playlist);
  const history = useStore((s) => s.history);
  const track = usePlayer((s) => s.track);
  const playing = usePlayer((s) => s.playing);
  const toggle = usePlayer((s) => s.toggle);
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
  const setCollapsed = useCallback(
    (collapsed: boolean) => {
      haptic(4);
      update({ ...load(), collapsed });
    },
    [update],
  );
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
  const frame = useRef(0);
  const onResizeDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: state.w, now: state.w };
    aside.current?.setAttribute("data-resizing", "");
    document.documentElement.dataset.sidebarResizing = "1";
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
        if (now !== undefined) document.documentElement.style.setProperty("--sidebar-open-w", `${now}px`);
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

        <div className="side-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
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
                        <span className="side-num" data-rhythm={t.rhythm} aria-hidden>
                          {RHYTHM[t.rhythm] ?? "·"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            <span className="sr-only">{tx("sidebar.tanda", { p1: i + 1 })} </span>
                            {t.orchestra}
                          </span>
                          {/* 2026-11: the tanda's type in words (rhythm, vocal or instrumental) */}
                          <span className="side-tanda-type block truncate" data-rhythm={t.rhythm}>
                            {tandaTypeWords({ rhythm: t.rhythm, vocal: t.vocal, singer: t.singer })}
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
              <ul className="flex flex-col gap-0.5">
                {recent.map((s) => (
                  <li key={s.id}>
                    <Link href={`/history#night=${s.id}`} className="side-row">
                      <Clock
                        size={16}
                        strokeWidth={1.75}
                        className="shrink-0 text-[var(--label-2)]"
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{s.title}</span>
                        <span className="text-caption1 block truncate text-[var(--label-2)]">
                          {ago(s.createdAt)} · {s.score}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--separator)] px-3 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {track && (
            <section
              className="side-now mb-2"
              aria-label={tx("sidebar.now_playing")}
              data-testid="sidebar-now"
            >
              {track.source.kind === "preview" ? (
                <button
                  type="button"
                  className="icon-btn shrink-0"
                  aria-label={playing ? tx("sidebar.pause") : tx("sidebar.play")}
                  onClick={() => toggle()}
                >
                  {playing ? (
                    <Pause size={18} fill="currentColor" strokeWidth={0} />
                  ) : (
                    <Play size={18} fill="currentColor" strokeWidth={0} />
                  )}
                </button>
              ) : (
                <span className="tile-art shrink-0" data-rhythm="tango" aria-hidden>
                  <Disc3 size={18} strokeWidth={1.75} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="text-subhead block truncate font-semibold">{track.title}</span>
                <span className="text-caption1 block truncate text-[var(--label-2)]">{track.orchestra}</span>
              </span>
            </section>
          )}
          <LayoutGroup id="sidebar-foot">
            <div className="flex flex-col gap-0.5">
              {pinned.map((it) => (
                <SideLink key={it.href} {...it} on={path === it.href} pill={"side-pill-foot"} />
              ))}
            </div>
          </LayoutGroup>
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
