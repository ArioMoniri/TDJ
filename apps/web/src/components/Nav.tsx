"use client";
import { BookOpen, Clock, Database, Disc3, ListMusic, Search, SlidersHorizontal } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { haptic } from "@/lib/haptics";
import { useScrollDirection } from "@/lib/hooks";
import { spring } from "@/lib/motion";
import { Logo } from "./Logo";
import { useToolbar } from "./PageHeader";

const items = [
  { href: "/", label: "Compose", icon: ListMusic },
  { href: "/library", label: "Library", icon: Disc3 },
  { href: "/history", label: "History", icon: Clock },
  { href: "/database", label: "Database", icon: Database },
  { href: "/guide", label: "Guide", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];
const SEARCH_ID: Record<string, string> = { "/library": "library-search", "/database": "db-search" };

/** Fired by `SearchField` on phones so the tab bar can make room for the keyboard. */
export const SEARCH_FOCUS_EVENT = "tdj:search-focus";

/**
 * iOS tab: one shared pill slides between tabs; icon weight cross-fades; 10 pt label. `compact` drops the label
 * (search pages make room for the detached search button); `hidden` collapses the link while the bar is minimised
 * but keeps it in the DOM.
 */
function MobileTab({
  it,
  on,
  min,
  compact = false,
  hidden = false,
}: {
  it: (typeof items)[number];
  on: boolean;
  min: boolean;
  compact?: boolean;
  hidden?: boolean;
}) {
  return (
    <Link
      href={it.href}
      aria-current={on ? "page" : undefined}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      onClick={() => !on && haptic(4)}
      className={`relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-full ${
        hidden
          ? "w-0 min-w-0 overflow-hidden px-0 opacity-0"
          : compact
            ? "min-w-[44px] px-1.5"
            : "min-w-[48px] px-2"
      } ${on ? "text-[var(--tint)]" : "text-[var(--label-2)]"}`}
      style={{ transition: "color var(--dur-xs) var(--ease-settle)" }}
    >
      {on && (
        <motion.span
          layoutId="tab-pill"
          className="absolute inset-0 rounded-full bg-[var(--fill-3)]"
          transition={spring.thumb}
          aria-hidden
        />
      )}
      <span className="relative grid h-6 w-6 place-items-center">
        {/* two stacked weights, cross-faded: stroke-width is not animatable via CSS on SVG in all engines */}
        <it.icon
          size={24}
          strokeWidth={1.75}
          className="col-start-1 row-start-1"
          style={{ opacity: on ? 0 : 1, transition: "opacity var(--dur-xs)" }}
          aria-hidden
        />
        <it.icon
          size={24}
          strokeWidth={2.25}
          className="col-start-1 row-start-1"
          style={{ opacity: on ? 1 : 0, transition: "opacity var(--dur-xs)" }}
          aria-hidden
        />
      </span>
      <span className={`text-tab relative ${min || compact ? "sr-only" : ""}`}>{it.label}</span>
    </Link>
  );
}

export function Nav() {
  const path = usePathname();
  const bar = useToolbar();
  const minimised = useScrollDirection();
  const [searchFocused, setSearchFocused] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setSearchFocused(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(SEARCH_FOCUS_EVENT, on);
    return () => window.removeEventListener(SEARCH_FOCUS_EVENT, on);
  }, []);
  const searchId = SEARCH_ID[path];
  const hidden = searchFocused;
  return (
    <>
      {/* Tablet (sm–lg): glass pill as a toolbar. Left: logo (page title once the large title scrolled out), centre: tabs. */}
      <header className="sticky top-0 z-40 hidden px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:block sm:px-6 lg:hidden">
        <div className="glass glass-pill mx-auto flex max-w-[720px] items-center justify-between gap-2 px-2 py-1 sm:px-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 pl-1" aria-label="TDJ home">
            <Logo size={28} />
            <span className="text-headline truncate">{bar.collapsed && bar.title ? bar.title : "TDJ"}</span>
          </Link>
          <nav className="flex items-center" aria-label="Primary">
            <LayoutGroup id="desktop-nav">
              {items.map((it) => {
                const on = path === it.href;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={on ? "page" : undefined}
                    onClick={() => !on && haptic(4)}
                    className={`text-subhead relative isolate inline-flex min-h-11 items-center rounded-full px-3 ${
                      on ? "font-semibold text-[var(--label)]" : "text-[var(--label-2)]"
                    }`}
                    style={{ transition: "color var(--dur-xs) var(--ease-settle) 60ms" }}
                  >
                    {on && (
                      <motion.span
                        layoutId="nav-pill"
                        transition={spring.thumb}
                        className="absolute inset-y-1 inset-x-0 -z-10 rounded-full bg-[var(--fill-3)]"
                        aria-hidden
                      />
                    )}
                    {it.label}
                  </Link>
                );
              })}
            </LayoutGroup>
          </nav>
          <div className="flex min-w-[44px] items-center justify-end gap-1">
            {bar.collapsed && bar.trailing}
          </div>
        </div>
      </header>

      {/* Desktop (lg+): macOS sidebar with source-list rows */}
      <aside
        className="material-thin fixed left-0 top-0 z-40 hidden h-dvh w-[220px] flex-col border-r border-[var(--separator)] px-3 pt-[max(1rem,env(safe-area-inset-top))] lg:flex"
        aria-label="Sidebar"
      >
        <Link href="/" className="flex items-center gap-2.5 px-3 py-2" aria-label="TDJ home">
          <Logo size={28} />
          <span className="text-headline">TDJ</span>
        </Link>
        <nav className="mt-4 flex flex-col gap-0.5" aria-label="Primary sidebar">
          <LayoutGroup id="sidebar-nav">
            {items.map((it) => {
              const on = path === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={on ? "page" : undefined}
                  className="side-row"
                >
                  {on && (
                    <motion.span
                      layoutId="side-pill"
                      transition={spring.thumb}
                      className="absolute inset-0 -z-10 rounded-[8px] bg-[var(--fill-3)]"
                      aria-hidden
                    />
                  )}
                  <it.icon
                    size={18}
                    strokeWidth={1.75}
                    className={on ? "text-[var(--tint)]" : "text-[var(--label-2)]"}
                    aria-hidden
                  />
                  {it.label}
                </Link>
              );
            })}
          </LayoutGroup>
        </nav>
      </aside>

      {/* Phone: Liquid Glass tab capsule that minimises on scroll, plus a detached search button on search pages */}
      <LayoutGroup id="mobile-nav">
        <nav
          className="glass fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-40 flex items-center p-1 sm:hidden"
          data-min={minimised || undefined}
          data-testid="tab-bar"
          aria-label="Primary mobile"
          style={{
            transition:
              "transform var(--dur-s) var(--ease-settle), opacity var(--dur-s) var(--ease-settle), width var(--dur-s) var(--ease-settle)",
            transform: hidden
              ? "translate(-50%, 120%)"
              : `translate(calc(-50% - ${searchId && !minimised ? 30 : 0}px), 0)`,
            opacity: hidden ? 0 : 1,
            maxWidth: searchId ? "calc(100vw - 96px)" : "calc(100vw - 1.5rem)",
          }}
        >
          {items.map((it) => (
            <MobileTab
              key={it.href}
              it={it}
              on={path === it.href}
              min={minimised}
              compact={!!searchId}
              hidden={minimised && path !== it.href}
            />
          ))}
        </nav>
        {searchId && (
          <button
            type="button"
            className="glass fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] right-3 z-40 grid h-[60px] w-[60px] place-items-center rounded-full text-[var(--label)] sm:hidden"
            aria-label="Search"
            style={{
              transition:
                "transform var(--dur-s) var(--ease-settle), opacity var(--dur-s) var(--ease-settle)",
              transform: hidden || minimised ? "translateY(120%)" : "none",
              opacity: hidden || minimised ? 0 : 1,
            }}
            onClick={() => {
              document.getElementById(searchId)?.focus();
              document.getElementById(searchId)?.scrollIntoView({ block: "center", behavior: "smooth" });
            }}
          >
            <Search size={22} strokeWidth={2} />
          </button>
        )}
      </LayoutGroup>
    </>
  );
}
