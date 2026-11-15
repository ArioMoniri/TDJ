"use client";
import { Clock, Disc3, PanelLeft, Pause, Play, Volume2 } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type KeyboardEvent, type PointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { spring } from "@/lib/motion";
import { lengthText } from "@/lib/nightName";
import { usePlayer } from "@/lib/player";
import { useStore } from "@/lib/store";
import { Logo } from "./Logo";
import { NAV_MAIN, NAV_MAIN_TITLE, NAV_PINNED } from "./navItems";
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
    ? "Today"
    : d === 1
      ? "Yesterday"
      : d < 7
        ? `${d} days ago`
        : new Date(iso).toLocaleDateString();
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
  const drag = useRef<{ x: number; w: number } | null>(null);

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

  const onResizeDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, w: state.w };
  };
  const onResizeMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const w = Math.round(Math.min(MAX_W, Math.max(MIN_W, d.w + e.clientX - d.x)));
    if (w !== state.w) update({ ...state, w }, false);
  };
  const onResizeUp = () => {
    if (!drag.current) return;
    drag.current = null;
    save(state);
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
        className="material-thin fixed left-0 top-0 z-40 hidden h-dvh flex-col border-r border-[var(--separator)] lg:flex"
        style={{ width: "var(--sidebar-w)" }}
        aria-label="Sidebar"
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
            aria-label="T-DJ home"
          >
            <Logo size={28} />
            <span className="text-headline">T-DJ</span>
          </Link>
          <Tip text={"Hide sidebar (⌃⌘S)"}>
            <button
              type="button"
              className="icon-btn icon-btn-bare text-[var(--label-2)]"
              aria-label="Hide sidebar"
              onClick={() => setCollapsed(true)}
              data-testid="sidebar-hide"
            >
              <PanelLeft size={20} strokeWidth={1.75} aria-hidden />
            </button>
          </Tip>
        </div>

        <div className="side-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <nav aria-label="Primary sidebar">
            <h2 className="side-head">{NAV_MAIN_TITLE}</h2>
            <LayoutGroup id="sidebar-nav">
              <div className="flex flex-col gap-0.5">
                {library.map((it) => (
                  <SideLink key={it.href} {...it} on={path === it.href} pill="side-pill" />
                ))}
              </div>
            </LayoutGroup>
          </nav>

          {playlist && playlist.tandas.length > 0 && (
            <section aria-labelledby="side-tonight" data-testid="sidebar-tonight">
              <h2 className="side-head" id="side-tonight">
                Tonight
                <span className="side-head-meta">
                  {playlist.tandas.length} tandas · {lengthText(playlist.stats.durationSec)}
                </span>
              </h2>
              <ol className="flex flex-col gap-0.5">
                {playlist.tandas.map((t, i) => {
                  const now = i === nowTanda;
                  const here = hash === `#tanda-${i + 1}`;
                  return (
                    <li key={`${t.index}-${t.songs[0]?.id}`}>
                      <button
                        type="button"
                        className="side-row w-full text-left"
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
                        <span className="min-w-0 flex-1 truncate">
                          <span className="sr-only">Tanda {i + 1}: </span>
                          {t.orchestra}
                        </span>
                        {now ? (
                          <Volume2
                            size={14}
                            className="shrink-0 text-[var(--tint)]"
                            aria-label="Now playing"
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
                Recent nights
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
            <section className="side-now mb-2" aria-label="Now playing" data-testid="sidebar-now">
              {track.source.kind === "preview" ? (
                <button
                  type="button"
                  className="icon-btn shrink-0"
                  aria-label={playing ? "Pause" : "Play"}
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
                <SideLink key={it.href} {...it} on={path === it.href} pill="side-pill-foot" />
              ))}
            </div>
          </LayoutGroup>
        </div>

        {/* trailing edge: drag (or arrow keys) to resize, double-click to reset */}
        {/* biome-ignore lint/a11y/useSemanticElements: a focusable window splitter (WAI-ARIA separator pattern) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
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

      {/* collapsed: one glass button brings it back, clear of the traffic lights on the Mac app */}
      {state.collapsed && (
        <Tip text={"Show sidebar (⌃⌘S)"}>
          <button
            type="button"
            className="icon-btn icon-btn-glass fixed z-40 hidden lg:grid"
            style={{ top: "calc(var(--chrome-top) + 14px)", left: "calc(var(--traffic-left) + 12px)" }}
            aria-label="Show sidebar"
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
