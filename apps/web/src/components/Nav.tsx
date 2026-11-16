"use client";
import { Ellipsis, Search } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { useFitLevel, useScrollDirection } from "@/lib/hooks";
import { getLocale, t } from "@/lib/i18n";
import { spring } from "@/lib/motion";
import { Logo } from "./Logo";
import { type NavItem, PHONE_MORE, PHONE_TABS, PILL_ITEMS } from "./navItems";
import { useToolbar } from "./PageHeader";
import { Sheet } from "./Sheet";
import { Sidebar } from "./Sidebar";
import { useTip } from "./ui/Tip";

const SEARCH_ID: Record<string, string> = { "/library": "library-search", "/database": "db-search" };

/** Fired by `SearchField` on phones so the tab bar can make room for the keyboard. */
export const SEARCH_FOCUS_EVENT = "tdj:search-focus";

/**
 * iOS 26 tab: 24 pt glyph over a 10 pt label, sharing the capsule's width. The selection is the tint plus a faint
 * glass lens that slides between tabs (never a filled block). `compact` drops the label (search pages make room for
 * the detached search button); `hidden` collapses the link while the bar is minimised but keeps it in the DOM.
 */
function MobileTab({
  it,
  on,
  min,
  compact = false,
  hidden = false,
  onOpen,
}: {
  it: NavItem;
  on: boolean;
  min: boolean;
  compact?: boolean;
  hidden?: boolean;
  /** the More tab: a button that opens the sheet of the other pages */
  onOpen?: () => void;
}) {
  // the name on hover and long-press, the app's help tag (a title attribute is not used anywhere, wave 2)
  const tip = useTip<HTMLElement>(it.label);
  // the tab's shown name: its short one where it has one (the full name stays its accessible name)
  const name = it.short ?? it.label;
  const cls = `tab-item ${hidden ? "!w-0 !flex-none overflow-hidden !px-0 opacity-0" : min ? "!flex-none w-[54px]" : "px-1"}`;
  const inner = (
    <>
      {on && (
        <motion.span
          layoutId="tab-pill"
          layoutDependency={on}
          className="tab-lens"
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
      <span
        className={`tab-label relative ${min || compact ? "sr-only" : ""}`}
        data-testid="tab-label"
        aria-hidden={name !== it.label || undefined}
      >
        {name}
      </span>
      {name !== it.label && <span className="sr-only">{it.label}</span>}
    </>
  );
  if (onOpen)
    return (
      <button
        type="button"
        aria-haspopup="dialog"
        data-testid="tab-more"
        data-on={on || undefined}
        {...(tip.props as object)}
        aria-hidden={hidden || undefined}
        tabIndex={hidden ? -1 : undefined}
        onClick={() => {
          haptic(4);
          onOpen();
        }}
        className={cls}
      >
        {inner}
        {tip.tag}
      </button>
    );
  return (
    <Link
      href={it.href}
      aria-current={on ? "page" : undefined}
      {...(tip.props as object)}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      onClick={() => !on && haptic(4)}
      className={cls}
    >
      {inner}
      {tip.tag}
    </Link>
  );
}
/**
 * 2026-11 (QA, Turkish on an iPhone SE: "Gece oluştur" ran into "Kabin" on the Library's narrowed bar): true while
 * any tab's name is wider than its tab, and then the bar shows icons only (names stay their accessible names and
 * help tags). Measured on the bar's width, the page (the search pages narrow it) and the language; never while
 * the bar is minimised (one tab, no name).
 */
function useTabLabelsFit(ref: React.RefObject<HTMLElement | null>, key: string): boolean {
  const [over, setOver] = useState(false);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e?.contentRect.width ?? 0)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` (page, minimised, language) re-measures the names
  useEffect(() => {
    const el = ref.current;
    if (!el || !width || el.dataset.min !== undefined) return;
    // a label's scrollWidth is its text's width even while it is hidden (sr-only clips, it does not reflow)
    let tooWide = false;
    for (const label of el.querySelectorAll<HTMLElement>('[data-testid="tab-label"]')) {
      const tab = label.parentElement;
      if (!tab || tab.getAttribute("aria-hidden") === "true") continue;
      // 4 px of padding each side: the name never reaches the tab's edge
      if (label.scrollWidth > tab.clientWidth - 8) tooWide = true;
    }
    setOver(tooWide);
  }, [ref, width, key]);
  return over;
}

const MORE: NavItem = {
  href: "#more",
  get label() {
    return t("nav.more");
  },
  icon: Ellipsis,
};

/** one link of the sm–lg pill: its name, or its icon with the name on hover and long-press */
function PillLink({ it, on, icon, path }: { it: NavItem; on: boolean; icon: boolean; path: string }) {
  const tip = useTip<HTMLElement>(it.label);
  return (
    <Link
      href={it.href}
      aria-current={on ? "page" : undefined}
      aria-label={icon ? it.label : undefined}
      {...(tip.props as object)}
      onClick={() => !on && haptic(4)}
      className={`text-subhead relative isolate inline-flex min-h-11 items-center rounded-full ${
        icon ? "min-w-11 justify-center px-2.5" : "px-3"
      } ${on ? "font-semibold text-[var(--label)]" : "text-[var(--label-2)]"}`}
      style={{ transition: "color var(--dur-xs) var(--ease-settle) 60ms" }}
    >
      {on && (
        <motion.span
          layoutId="nav-pill"
          layoutDependency={path}
          transition={spring.thumb}
          className="absolute inset-y-1 inset-x-0 -z-10 rounded-full bg-[var(--fill-3)]"
          aria-hidden
        />
      )}
      {icon ? <it.icon size={20} strokeWidth={on ? 2.25 : 1.75} aria-hidden /> : it.label}
      {tip.tag}
    </Link>
  );
}

export function Nav() {
  const path = usePathname();
  const bar = useToolbar();
  // the booth keeps the whole tab bar (round 18): its control strip sits right above it, and the bar minimised to one
  // tab read as a stray handle floating over the set list
  const scrolledDown = useScrollDirection();
  const minimised = scrolledDown && path !== "/booth";
  const [searchFocused, setSearchFocused] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setSearchFocused(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(SEARCH_FOCUS_EVENT, on);
    return () => window.removeEventListener(SEARCH_FOCUS_EVENT, on);
  }, []);
  const searchId = SEARCH_ID[path];
  const hidden = searchFocused;
  const pill = useRef<HTMLDivElement>(null);
  // re-measure when the pill's content changes: the page's actions arrive with `collapsed`, the tab set with the path
  const fit = useFitLevel(pill, 3, `${path}|${bar.collapsed}|${!!bar.trailing}|${!!bar.primary}`);
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = PHONE_MORE.some((i) => i.href === path);
  const tabbar = useRef<HTMLElement>(null);
  const iconsOnly = useTabLabelsFit(tabbar, `${path}|${minimised}|${getLocale()}`);
  return (
    <>
      {/* Tablet (sm–lg): glass pill as a toolbar. Left: logo (+ page title once the large title scrolled out),
          centre: tabs, right: the page's bar actions. Every piece is `shrink-0`, so the pill can only overflow to
          the right, and `useFitLevel` collapses it one step at a time until it fits (title text → icon-only
          primary → icon-only tabs): nothing ever overlaps. The band starts at the status bar / title bar and adds
          its spacing under it; once content scrolls under it, the full-width bar material and hairline fade in
          (`bar-edge`), so content never peeks out around the capsule and never reads next to it. */}
      <header
        className="toolbar-pill-band bar-edge sticky top-0 z-40 hidden px-4 pt-[calc(var(--chrome-top)+0.75rem)] pb-3 sm:block sm:px-6 lg:hidden"
        data-collapsed={bar.collapsed || undefined}
        data-scrolled={bar.scrolled || undefined}
        data-testid="nav-pill-band"
        data-tauri-drag-region
      >
        <div
          ref={pill}
          className="glass glass-pill isolate mx-auto flex max-w-[720px] items-center justify-between gap-2 overflow-clip px-2 py-1 sm:px-3"
          data-testid="nav-pill"
          data-fit={fit}
        >
          <Link
            href="/"
            className="flex min-h-11 min-w-11 shrink-0 items-center gap-2.5 pl-1"
            aria-label={t("nav.t_dj_home")}
          >
            <Logo size={28} />
            {fit < 1 && (
              <span className="text-headline max-w-[200px] truncate">
                {bar.collapsed && bar.title ? bar.title : t("nav.t_dj")}
              </span>
            )}
          </Link>
          <nav className="flex shrink-0 items-center" aria-label={t("nav.primary")}>
            <LayoutGroup id="desktop-nav">
              {PILL_ITEMS.map((it) => {
                const on = path === it.href;
                return <PillLink key={it.href} it={it} on={on} icon={fit >= 3} path={path} />;
              })}
            </LayoutGroup>
          </nav>
          <div className="flex min-w-[44px] shrink-0 items-center justify-end gap-1">
            {bar.collapsed && bar.trailing}
            {bar.collapsed && (fit >= 2 && bar.primaryCompact ? bar.primaryCompact : bar.primary)}
          </div>
        </div>
      </header>

      {/* Desktop and iPad landscape (lg+): the sectioned, resizable sidebar */}
      <Sidebar />

      {/* Phone: Liquid Glass tab capsule that minimises on scroll, plus a detached search button on search pages */}
      <LayoutGroup id="mobile-nav">
        {/* One capsule, 16 px from the edges (at most 440 wide, centred); on search pages it leaves room on its
            right for the search circle on the same row; minimised (scrolling down) it shrinks to the current tab at
            the leading edge, as iOS 26 does */}
        <nav
          ref={tabbar}
          className="glass tabbar fixed z-40 flex items-center sm:hidden"
          data-min={minimised || undefined}
          data-icons={iconsOnly || undefined}
          data-testid="tab-bar"
          aria-label={t("nav.primary_mobile")}
          style={{
            bottom: "var(--tabbar-bottom)",
            left: "max(1rem, env(safe-area-inset-left, 0px))",
            right: minimised
              ? "auto"
              : searchId
                ? "calc(max(1rem, env(safe-area-inset-right, 0px)) + var(--tab-search-w) + var(--tab-search-gap))"
                : "max(1rem, env(safe-area-inset-right, 0px))",
            marginInline: minimised || searchId ? undefined : "auto",
            maxWidth: 440,
            transition: "transform var(--dur-s) var(--ease-settle), opacity var(--dur-s) var(--ease-settle)",
            transform: hidden ? "translateY(120%)" : "none",
            opacity: hidden ? 0 : 1,
          }}
        >
          {PHONE_TABS.map((it) => (
            <MobileTab
              key={it.href}
              it={it}
              on={path === it.href}
              min={minimised}
              compact={false}
              hidden={minimised && path !== it.href}
            />
          ))}
          <MobileTab
            it={MORE}
            on={inMore}
            min={minimised}
            compact={false}
            hidden={minimised && !inMore}
            onOpen={() => setMoreOpen(true)}
          />
        </nav>
        <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t("nav.more")} testId="more-sheet">
          <nav className="group-inset mt-2" aria-label={t("nav.more_pages")}>
            {PHONE_MORE.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                aria-current={path === it.href ? "page" : undefined}
                className="cell cell-tap w-full text-left"
                data-leading="tile"
                onClick={() => setMoreOpen(false)}
              >
                <it.icon
                  size={22}
                  strokeWidth={1.75}
                  className={path === it.href ? "text-[var(--tint)]" : "text-[var(--label-2)]"}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
              </Link>
            ))}
          </nav>
        </Sheet>
        {searchId && (
          <button
            type="button"
            className="glass tab-search fixed bottom-[var(--tabbar-bottom)] right-[max(1rem,env(safe-area-inset-right,0px))] z-40 grid place-items-center rounded-full text-[var(--label)] sm:hidden"
            aria-label={t("nav.search")}
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
