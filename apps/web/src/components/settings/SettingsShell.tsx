"use client";
import {
  BatteryCharging,
  Bot,
  ChevronLeft,
  ChevronRight,
  Info,
  Keyboard,
  Library,
  Link2,
  Moon,
  Palette,
  Settings2,
  Speaker,
  Users,
  Waves,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Group, Row, Tile } from "@/components/Form";
import { PageHeader } from "@/components/PageHeader";
import { SearchField } from "@/components/SearchField";
import { APP } from "@/lib/app/target";
import { t } from "@/lib/i18n";
import {
  hashTarget,
  isSection,
  SECTION_GROUPS,
  SECTION_META,
  SECTIONS,
  type SectionId,
  type SettingEntry,
  searchSettings,
  sectionOf,
} from "@/lib/settingsIndex";

const ICONS: Record<SectionId, ReactNode> = {
  general: <Settings2 size={16} strokeWidth={2} />,
  appearance: <Palette size={16} strokeWidth={2} />,
  booth: <Waves size={16} strokeWidth={2} />,
  audio: <Speaker size={16} strokeWidth={2} />,
  keyboard: <Keyboard size={16} strokeWidth={2} />,
  night: <Moon size={16} strokeWidth={2} />,
  connections: <Link2 size={16} strokeWidth={2} />,
  ai: <Bot size={16} strokeWidth={2} />,
  library: <Library size={16} strokeWidth={2} />,
  rooms: <Users size={16} strokeWidth={2} />,
  battery: <BatteryCharging size={16} strokeWidth={2} />,
  about: <Info size={16} strokeWidth={2} />,
};

/** the content width from which the categories sit beside the pane (an iPad in portrait, any Mac window) */
const SPLIT_PX = 640;
const SEARCH_ID = "settings-search";
const isWide = (el: HTMLElement | null) => (el?.clientWidth ?? 0) >= SPLIT_PX;
const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** the first selector that is on the page */
function find(root: HTMLElement, selectors: string[]): HTMLElement | null {
  for (const s of selectors) {
    try {
      const el = root.querySelector<HTMLElement>(s);
      if (el) return el;
    } catch {
      // a hash that is no selector
    }
  }
  return null;
}

/** what a landed setting lights up: its row, else its group's body, else itself */
function flashTarget(el: HTMLElement): HTMLElement {
  if (el.matches("section")) return el.querySelector<HTMLElement>(":scope > .group-inset") ?? el;
  return el.closest<HTMLElement>(".cell") ?? el;
}

/**
 * Settings in categories (2026-11, owner: "too overwhelming"): the macOS System Settings / iPadOS Settings split —
 * the categories on the left, one category's pane on the right — from a 640 px content width, and the iOS drill-down
 * below it (the grouped list of categories, a category as its own page with a back button). The search at the top
 * finds any setting by its label, its help text or a synonym, in English and Turkish (lib/settingsIndex.ts); a result
 * opens its category, scrolls to the setting and lights it up. ⌘F / Ctrl+F focuses the search, Esc clears it.
 *
 * Deep links: `/settings?section=<id>` opens a category; `/settings#<id>` (every anchor that worked before:
 * #app-connections, #ai-key, #settings-keyboard, #lyrics-sources…) opens the category that holds it and scrolls to
 * it; `?error=` and `?connected=` (a service's sign-in coming back) open Connections. Every category's content stays
 * in the page (the others `hidden`), so each id and test id is where it was.
 */
export function SettingsShell({
  panes,
  title,
  initial = null,
}: {
  panes: Record<SectionId, ReactNode>;
  title: string;
  /** the category the address's query names (the page reads it on the server) */
  initial?: SectionId | null;
}) {
  const [section, setSection] = useState<SectionId | null>(initial);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [split, setSplit] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const cancel = useRef<() => void>(() => {});
  /** the pane on screen: a wide layout shows General until a category is chosen */
  const current: SectionId = section ?? "general";
  const sectionRef = useRef<SectionId | null>(null);
  sectionRef.current = section;
  const pushedFromList = useRef(false);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setSplit(el.clientWidth >= SPLIT_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * Shows the first of `selectors` on the page: opens the category that holds it (an element can arrive late: the
   * Booth's audio groups load once the page is idle), scrolls it to the middle and lights it up.
   */
  const reveal = useCallback(
    (selectors: string[], fallback: SectionId | null) => {
      cancel.current();
      const host = root.current;
      if (!host) return;
      let raf = 0;
      let done = false;
      const t0 = performance.now();
      const land = (el: HTMLElement, flash: boolean) => {
        done = true;
        // a row to the middle; a group taller than half the screen from its top
        const tall = el.getBoundingClientRect().height > window.innerHeight / 2;
        el.scrollIntoView({ block: tall ? "start" : "center", behavior: reduced ? "auto" : "smooth" });
        if (!flash) return;
        const f = flashTarget(el);
        f.removeAttribute("data-flash");
        void f.offsetWidth;
        f.setAttribute("data-flash", "");
        setTimeout(() => f.removeAttribute("data-flash"), 2400);
        // a keyboard (a fine pointer) lands in the setting itself; a phone keeps its keyboard down
        if (matchMedia("(pointer: fine)").matches) {
          const focusable = f.matches("input, select, textarea, button, a[href]")
            ? f
            : f.querySelector<HTMLElement>("input, select, textarea, button, a[href], [role='switch']");
          focusable?.focus({ preventScroll: true });
        }
      };
      const tick = () => {
        const el = find(host, selectors);
        if (el) {
          if (el.getClientRects().length > 0) return land(el, true);
          const pane = el.closest<HTMLElement>("[data-settings-section]")?.dataset.settingsSection;
          if (isSection(pane) && pane !== sectionRef.current) setSection(pane);
        }
        if (performance.now() - t0 < 8000) raf = requestAnimationFrame(tick);
        else if (fallback) {
          const head = host.querySelector<HTMLElement>(`[data-settings-section="${fallback}"]`);
          if (head && head.getClientRects().length > 0) land(head, false);
        }
      };
      raf = requestAnimationFrame(tick);
      cancel.current = () => {
        if (!done) cancelAnimationFrame(raf);
      };
    },
    [reduced],
  );

  /** the category (and the setting) the address names */
  const fromUrl = useCallback(() => {
    const u = new URL(location.href);
    let s = sectionOf(Object.fromEntries(u.searchParams));
    const h = u.hash.length > 1 ? hashTarget(u.hash) : null;
    if (h?.section && !s) s = h.section;
    setSection(s);
    setQuery("");
    if (h?.id) reveal([`#${CSS.escape(h.id)}`], s);
  }, [reveal]);

  useIso(() => {
    fromUrl();
    window.addEventListener("popstate", fromUrl);
    window.addEventListener("hashchange", fromUrl);
    return () => {
      window.removeEventListener("popstate", fromUrl);
      window.removeEventListener("hashchange", fromUrl);
      cancel.current();
    };
  }, [fromUrl]);

  const wide = () => isWide(root.current);
  const top = () => window.scrollTo({ top: 0, behavior: "auto" });

  /** a category from the list: the phone pushes a page (Back returns), the split swaps the pane in place */
  const open = (s: SectionId) => {
    cancel.current();
    const push = !wide() && sectionRef.current === null;
    pushedFromList.current = push;
    history[push ? "pushState" : "replaceState"](null, "", `/settings?section=${s}`);
    setSection(s);
    setQuery("");
    top();
  };
  const back = () => {
    cancel.current();
    if (pushedFromList.current) {
      pushedFromList.current = false;
      history.back();
      return;
    }
    history.replaceState(null, "", "/settings");
    setSection(null);
    top();
  };

  const groups = useMemo(() => searchSettings(query, { app: APP }), [query]);
  const flat = useMemo(() => groups.flatMap((g) => g.entries), [groups]);
  const searching = query.trim().length > 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new query starts at its first result
  useEffect(() => setActive(0), [query]);

  const choose = (e: SettingEntry) => {
    setQuery("");
    (document.getElementById(SEARCH_ID) as HTMLInputElement | null)?.blur();
    pushedFromList.current = false;
    history.replaceState(null, "", `/settings?section=${e.section}`);
    setSection(e.section);
    reveal(e.target, e.section);
  };

  // ⌘F / Ctrl+F: the search (on a phone in a category, back to the list where the search is)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "f") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      if (!isWide(root.current) && sectionRef.current !== null) {
        history.replaceState(null, "", "/settings");
        setSection(null);
      }
      requestAnimationFrame(() => {
        const input = document.getElementById(SEARCH_ID) as HTMLInputElement | null;
        input?.focus();
        input?.select();
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const view = searching ? "results" : section ? "pane" : "root";
  const meta = (s: SectionId) => SECTION_META[s];

  return (
    <div className="settings-page mx-auto max-w-[720px] lg:max-w-none" data-testid="settings">
      <PageHeader title={title} />
      <div ref={root} className="settings-shell">
        <div className="settings-split" data-view={view} data-split={split || undefined}>
          <aside className="settings-side">
            <SearchField
              id={SEARCH_ID}
              value={query}
              onChange={setQuery}
              placeholder={t("settings.search.placeholder")}
              label={t("settings.search.placeholder")}
              tip={t("settings.search.tip")}
              className="settings-search"
              inputProps={{
                "aria-controls": "settings-results",
                "aria-keyshortcuts": "Meta+F Control+F",
                onKeyDown: (e) => {
                  if (e.key === "Escape") {
                    if (query) {
                      e.preventDefault();
                      e.stopPropagation();
                      setQuery("");
                    } else e.currentTarget.blur();
                  } else if (e.key === "ArrowDown" && flat.length) {
                    e.preventDefault();
                    setActive((a) => Math.min(flat.length - 1, a + 1));
                  } else if (e.key === "ArrowUp" && flat.length) {
                    e.preventDefault();
                    setActive((a) => Math.max(0, a - 1));
                  } else if (e.key === "Enter" && flat[active]) {
                    e.preventDefault();
                    choose(flat[active]!);
                  }
                },
              }}
            />
            <nav className="settings-nav" aria-label={t("settings.categories")} data-testid="settings-nav">
              {SECTION_GROUPS.map((g) => (
                <div key={g[0]} className="group-inset settings-nav-group">
                  {g.map((id) => (
                    <a
                      key={id}
                      href={`/settings?section=${id}`}
                      className="cell cell-tap settings-nav-row"
                      data-leading="tile"
                      data-testid={`settings-cat-${id}`}
                      aria-current={(split ? current : section) === id ? "page" : undefined}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                        e.preventDefault();
                        open(id);
                      }}
                    >
                      <Tile color={meta(id).color}>{ICONS[id]}</Tile>
                      <span className="cell-label min-w-0 flex-1">{t(meta(id).title)}</span>
                      <ChevronRight
                        size={16}
                        strokeWidth={2.5}
                        className="cell-chevron settings-nav-chevron"
                        aria-hidden
                      />
                    </a>
                  ))}
                </div>
              ))}
            </nav>
          </aside>

          <div className="settings-main">
            <section
              id="settings-results"
              className="settings-results"
              aria-label={t("settings.search.results")}
              hidden={!searching}
              data-testid="settings-results"
            >
              {searching && groups.length === 0 && (
                <div className="settings-empty" role="status">
                  <p className="text-headline">{t("settings.search.none", { q: query.trim() })}</p>
                  <p className="text-subhead mt-1 text-[var(--label-2)]">{t("settings.search.none_sub")}</p>
                </div>
              )}
              {searching &&
                groups.map((g) => (
                  <Group key={g.section} header={t(meta(g.section).title)}>
                    {g.entries.map((e) => (
                      <Row
                        key={e.id}
                        tile={<Tile color={meta(e.section).color}>{ICONS[e.section]}</Tile>}
                        label={t(e.label)}
                        sub={e.help ? t(e.help) : undefined}
                        tip={t(meta(e.section).title)}
                        chevron
                        onClick={() => choose(e)}
                        className={flat[active] === e ? "settings-result-active" : ""}
                        data-testid={`settings-result-${e.id}`}
                      />
                    ))}
                  </Group>
                ))}
            </section>

            <div className="settings-panes" hidden={searching}>
              <button type="button" className="settings-back" onClick={back} data-testid="settings-back">
                <ChevronLeft size={22} strokeWidth={2.5} aria-hidden />
                {title}
              </button>
              {SECTIONS.map((id) => (
                <section
                  key={id}
                  className="settings-pane"
                  data-settings-section={id}
                  data-testid={`settings-pane-${id}`}
                  hidden={id !== current}
                  aria-labelledby={`settings-h-${id}`}
                >
                  <header className="settings-pane-head">
                    <span className="settings-pane-tile" style={{ background: meta(id).color }} aria-hidden>
                      {ICONS[id]}
                    </span>
                    <div className="min-w-0">
                      <h2 id={`settings-h-${id}`} className="text-title2">
                        {t(meta(id).title)}
                      </h2>
                      <p className="text-subhead text-[var(--label-2)]">{t(meta(id).blurb)}</p>
                    </div>
                  </header>
                  {panes[id]}
                </section>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
