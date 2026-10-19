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
  trailing: ReactNode;
  /** the page's filled primary action (Compose): the tablet pill shows it once the large title scrolled out */
  primary: ReactNode;
  barChild: ReactNode;
}
const EMPTY: ToolbarState = { title: "", collapsed: false, trailing: null, primary: null, barChild: null };
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
  children,
  inBar,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  primary?: ReactNode;
  children?: ReactNode;
  /** rendered inside the collapsed bar as a second row (search field / segmented control) */
  inBar?: ReactNode;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const set = useContext(SetCtx);
  const id = useId();
  const isPhone = useMediaQuery("(max-width: 639px)");
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // the sentinel sits under the large title: once its bottom edge scrolls above the bar, the bar takes over
    const io = new IntersectionObserver(
      ([e]) => setCollapsed(!e!.isIntersecting && e!.boundingClientRect.top < 60),
      { rootMargin: "-56px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useIso(() => {
    // the chrome shows the actions only while collapsed: hand it stable nulls otherwise
    set?.({
      title,
      collapsed,
      trailing: collapsed ? trailing : null,
      primary: collapsed ? (primary ?? null) : null,
      barChild: collapsed && inBar ? inBar : null,
    });
  });
  useEffect(() => () => set?.(EMPTY), [set]);
  return (
    <>
      {/* Collapsed bar (phone): glass, 44 pt + safe area, title centred, trailing actions right. Tablets use the pill. */}
      {isPhone && (
        <div
          className={`fixed inset-x-0 top-0 z-40 ${collapsed ? "pointer-events-auto" : "pointer-events-none"}`}
          aria-hidden={!collapsed}
          data-testid="collapsed-bar"
          data-collapsed={collapsed || undefined}
        >
          <div
            className="material-regular border-b border-[var(--separator)] pt-[env(safe-area-inset-top)]"
            style={{ opacity: collapsed ? 1 : 0, transition: "opacity var(--dur-s) var(--ease-settle)" }}
          >
            <div className="relative mx-auto flex h-11 max-w-[720px] items-center justify-center px-4">
              <span className="text-headline truncate px-20">{title}</span>
              <div className="absolute right-2 flex items-center gap-1">{collapsed && trailing}</div>
            </div>
            {inBar && collapsed && <div className="mx-auto max-w-[720px] px-4 pb-2">{inBar}</div>}
          </div>
        </div>
      )}
      {/* lg (macOS): the title row is the page's sticky toolbar (a sibling of the page content, so it can stick
          the whole way down): the primary action stays at every scroll position. Its scrolled state is a 94 %
          grouped-background band, not blur: the sidebar already blurs on lg and the wallpaper is static
          (performance-budget.md caps backdrop-filter at the control layer that must lens). */}
      <header
        className={`flex items-end justify-between gap-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-2 lg:sticky lg:top-0 lg:z-30 lg:-mx-4 lg:min-h-[52px] lg:items-center lg:px-4 lg:py-1 ${
          collapsed
            ? "lg:rounded-b-[var(--radius-s)] lg:bg-[rgb(var(--bg-grouped)/0.94)] lg:shadow-[0_1px_0_var(--separator)]"
            : ""
        } ${className}`}
        data-testid="page-toolbar"
        data-collapsed={collapsed || undefined}
      >
        <h1 className="text-large-title lg:text-title1 min-w-0 truncate" data-testid="page-title" id={id}>
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
