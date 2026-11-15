"use client";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useMediaQuery } from "@/lib/hooks";

interface ToolbarState {
  title: string;
  collapsed: boolean;
  /** content has scrolled under the top bar: the bars show their material and hairline */
  scrolled: boolean;
  trailing: ReactNode;
  /** the page's filled primary action (Compose): the tablet pill shows it once the large title scrolled out */
  primary: ReactNode;
  /** an icon-only stand-in for `primary` (same action, `aria-label`): the pill uses it when the capsule does not fit */
  primaryCompact: ReactNode;
  barChild: ReactNode;
}
const EMPTY: ToolbarState = {
  title: "",
  collapsed: false,
  scrolled: false,
  trailing: null,
  primary: null,
  primaryCompact: null,
  barChild: null,
};
const StateCtx = createContext<ToolbarState>(EMPTY);
const SetCtx = createContext<((s: Partial<ToolbarState>) => void) | null>(null);

/** Shares the page title and bar actions between `PageHeader` and the chrome (`Nav`). */
export function ToolbarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToolbarState>(EMPTY);
  // bail out when nothing changed: a page re-render must not re-render the chrome (and its layout-measured pill)
  const set = useCallback(
    (s: Partial<ToolbarState>) =>
      setState((p) => {
        for (const k of Object.keys(s) as Array<keyof ToolbarState>)
          if (!Object.is(p[k], s[k])) return { ...p, ...s };
        return p;
      }),
    [],
  );
  return (
    <SetCtx.Provider value={set}>
      <StateCtx.Provider value={state}>{children}</StateCtx.Provider>
    </SetCtx.Provider>
  );
}
export function useToolbar() {
  return useContext(StateCtx);
}

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * iOS large title that collapses into a glass bar after 56 px of scroll (phone + tablet),
 * and a toolbar row at lg (macOS). `trailing` holds the bar buttons, `primary` the page's filled action
 * (desktop only; phones use their accessory bar), `children` a search field or segmented control.
 */
export function PageHeader({
  title,
  subtitle,
  trailing,
  primary,
  primaryCompact,
  children,
  inBar,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  primary?: ReactNode;
  /** icon-only version of `primary` for the tablet pill when the capsule would overflow it */
  primaryCompact?: ReactNode;
  children?: ReactNode;
  /** rendered inside the collapsed bar as a second row (search field / segmented control) */
  inBar?: ReactNode;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const set = useContext(SetCtx);
  const id = useId();
  const isPhone = useMediaQuery("(max-width: 599.98px)");
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    // One rAF-throttled scroll read: `scrolled` once anything has moved under the bars, `collapsed` once the large
    // title has gone under the top bar (its bottom edge, status-bar inset included, measured, not assumed: a fixed
    // 56 px margin ignored the inset). State changes only on a flip.
    let raf = 0;
    let c = false;
    let s = false;
    const read = () => {
      raf = 0;
      // the bar the title goes under: the phone's own bar, the tablet's pill band, or this sticky toolbar (lg)
      const w = window.innerWidth;
      const over =
        w < 600
          ? bar.current
          : w < 1024
            ? document.querySelector<HTMLElement>('[data-testid="nav-pill-band"]')
            : header.current;
      const edge = over ? over.getBoundingClientRect().bottom : 56;
      const y = el.getBoundingClientRect().top;
      const nextC = y < edge - 0.5;
      const nextS = window.scrollY > 0;
      if (nextC !== c) {
        c = nextC;
        setCollapsed(nextC);
      }
      if (nextS !== s) {
        s = nextS;
        setScrolled(nextS);
      }
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    // the first read waits for the next frame too (wave 2): read at mount it forced a synchronous layout of the
    // whole incoming page inside the navigation's commit (returning to Compose froze for one ~0.5 s frame)
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  useIso(() => {
    // the chrome shows the actions only while collapsed: hand it stable nulls otherwise
    set?.({
      title,
      collapsed,
      scrolled,
      trailing: collapsed ? trailing : null,
      primary: collapsed ? (primary ?? null) : null,
      primaryCompact: collapsed ? (primaryCompact ?? null) : null,
      barChild: collapsed && inBar ? inBar : null,
    });
  });
  useEffect(() => () => set?.(EMPTY), [set]);
  // the collapsed bar's trailing width, as `--bar-trail` on the bar (its title pads both sides by it); re-run when
  // the bar mounts or unmounts with the size class
  // biome-ignore lint/correctness/useExhaustiveDependencies: `isPhone` decides whether the bar (and its refs) exist
  useEffect(() => {
    const el = trail.current;
    const host = bar.current;
    if (!el || !host || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => host.style.setProperty("--bar-trail", `${el.offsetWidth}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isPhone]);
  return (
    <>
      {/* Collapsed bar (phone): 44 pt + the status-bar inset, title centred, trailing actions right. Transparent
          while the large title shows; once the title has gone under it, the bar material and its hairline fade in
          (`bar-edge`: full width, square, its own height). Tablets use the pill. */}
      {isPhone && (
        <div
          ref={bar}
          className={`bar-edge fixed inset-x-0 top-0 z-40 pt-[var(--chrome-top)] ${collapsed ? "pointer-events-auto" : "pointer-events-none"}`}
          aria-hidden={!collapsed}
          data-testid="collapsed-bar"
          data-collapsed={collapsed || undefined}
          data-scrolled={collapsed || undefined}
        >
          <div style={{ opacity: collapsed ? 1 : 0, transition: "opacity var(--dur-s) var(--ease-settle)" }}>
            <div className="relative mx-auto flex h-11 max-w-[720px] items-center justify-center px-4">
              {/* the centred title keeps clear of the trailing buttons on both sides (three icon buttons are 132 px:
                  a fixed 80 px inset let a Turkish title run under them) */}
              <span
                className="text-headline truncate"
                style={{ paddingInline: `max(5rem, calc(var(--bar-trail, 0px) + 0.5rem))` }}
              >
                {title}
              </span>
              <div ref={trail} className="absolute right-2 flex items-center gap-1">
                {collapsed && trailing}
              </div>
            </div>
            {inBar && collapsed && <div className="mx-auto max-w-[720px] px-4 pb-2">{inBar}</div>}
          </div>
        </div>
      )}
      {/* lg (macOS): the title row is the page's sticky toolbar (a sibling of the page content, so it can stick
          the whole way down): the primary action stays at every scroll position. At the top it sits on the page;
          once content scrolls under it, the bar material fades in edge to edge (sidebar edge to window edge) with a
          hairline (`bar-edge`). On the Mac app it starts below the title bar and is the window's drag region.
          sm–lg: a plain row under the nav pill; the pill carries the actions once the title scrolled out. */}
      <header
        ref={header}
        className={`toolbar-row bar-edge flex items-end justify-between gap-3 pt-[calc(var(--chrome-top)+0.75rem)] sm:pt-2 lg:sticky lg:top-0 lg:z-30 lg:min-h-[calc(var(--chrome-top)+60px)] lg:items-center lg:pt-[calc(var(--chrome-top)+0.75rem)] lg:pb-2 ${className}`}
        data-testid="page-toolbar"
        data-collapsed={collapsed || undefined}
        data-scrolled={scrolled || undefined}
        data-tauri-drag-region
      >
        <h1
          className="text-large-title lg:text-title1 min-w-0 truncate"
          data-testid="page-title"
          id={id}
          data-tauri-drag-region
        >
          {title}
        </h1>
        <div className="flex shrink-0 items-center gap-1 pb-0.5 lg:pb-0">
          {trailing}
          {primary && <span className="ml-1 hidden sm:inline-flex">{primary}</span>}
        </div>
      </header>
      <div ref={sentinel} className="h-px" aria-hidden />
      {subtitle && <p className="text-subhead mt-1 text-[var(--label-2)]">{subtitle}</p>}
      {/* `.bar-dup` children (a search field, a segmented control) go invisible while the collapsed bar shows its copy.
          Pages must not read `useToolbar()` for this: a page that re-renders on the toolbar state hands the header a
          fresh `trailing` node on every render, and the header writes it back, which loops. */}
      {children && (
        <div data-collapsed={collapsed || undefined} className="contents">
          {children}
        </div>
      )}
    </>
  );
}
