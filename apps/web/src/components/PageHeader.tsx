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

interface ToolbarState {
  title: string;
  collapsed: boolean;
  trailing: ReactNode;
  barChild: ReactNode;
}
const EMPTY: ToolbarState = { title: "", collapsed: false, trailing: null, barChild: null };
const StateCtx = createContext<ToolbarState>(EMPTY);
const SetCtx = createContext<((s: Partial<ToolbarState>) => void) | null>(null);

/** Shares the page title and bar actions between `PageHeader` and the chrome (`Nav`). */
export function ToolbarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToolbarState>(EMPTY);
  const set = useCallback((s: Partial<ToolbarState>) => setState((p) => ({ ...p, ...s })), []);
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
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setCollapsed(!e!.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useIso(() => {
    set?.({ title, collapsed, trailing, barChild: inBar ?? null });
  });
  useEffect(() => () => set?.(EMPTY), [set]);
  return (
    <>
      {/* Collapsed bar: glass, 44 pt + safe area, title centred, trailing actions right. Phone and tablet. */}
      <div
        className={`fixed inset-x-0 top-0 z-40 lg:hidden ${collapsed ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!collapsed}
        data-testid="collapsed-bar"
        data-collapsed={collapsed || undefined}
      >
        <div
          className="material-regular border-b border-[var(--separator)] pt-[env(safe-area-inset-top)] sm:hidden"
          style={{ opacity: collapsed ? 1 : 0, transition: "opacity var(--dur-s) var(--ease-settle)" }}
        >
          <div className="relative mx-auto flex h-11 max-w-[720px] items-center justify-center px-4">
            <span className="text-headline truncate px-20">{title}</span>
            <div className="absolute right-2 flex items-center gap-1">{collapsed && trailing}</div>
          </div>
          {inBar && collapsed && <div className="mx-auto max-w-[720px] px-4 pb-2">{inBar}</div>}
        </div>
      </div>
      <div ref={sentinel} className="h-px" aria-hidden />
      <header className={`pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-2 ${className}`}>
        <div className="flex items-end justify-between gap-3 lg:min-h-[52px] lg:items-center">
          <h1 className="text-large-title lg:text-title1 min-w-0 truncate" data-testid="page-title" id={id}>
            {title}
          </h1>
          <div className="flex shrink-0 items-center gap-1 pb-0.5 lg:pb-0">
            {trailing}
            {primary && <span className="ml-1 hidden sm:inline-flex">{primary}</span>}
          </div>
        </div>
        {subtitle && <p className="text-subhead mt-1 text-[var(--label-2)]">{subtitle}</p>}
        {children}
      </header>
    </>
  );
}
