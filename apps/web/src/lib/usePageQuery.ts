"use client";
import {
  createContext,
  createElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * 2026-11 (the owner: "while the tab changes from Songs to Orchestras or others in Database or Library, the written
 * text should not be deleted"): one search text per page, shared by every tab's search field on it (the Database's
 * Songs, Orchestras and Cortinas; the Library's field), kept in the address (`?q=`) so reload and back / forward
 * bring it back, and per page in this tab's session storage, so coming back to the page by the menu brings it back too.
 * Clearing it (the field's ⓧ, Cancel or Esc) clears it on every tab of the page.
 */

const KEY = (page: string) => `tdj-q:${page}`;
/** how long the words rest before the address is rewritten (a history write per keystroke would cost frames) */
export const URL_WRITE_MS = 300;

/** the query an address carries (`?q=`) */
export function queryFromSearch(search: string): string | null {
  const q = new URLSearchParams(search).get("q");
  return q === null ? null : q.slice(0, 400);
}

/** the address with `?q=` set (or dropped when empty), every other parameter and the hash kept */
export function urlWithParam(href: string, name: string, value: string | null): string {
  const u = new URL(href);
  if (value) u.searchParams.set(name, value);
  else u.searchParams.delete(name);
  return `${u.pathname}${u.search}${u.hash}`;
}

/** the query to start a page with: the address's first, else the session's last for that page, else nothing */
export function initialQuery(search: string, stored: string | null): string {
  return queryFromSearch(search) ?? stored ?? "";
}

function readStored(page: string): string | null {
  try {
    return sessionStorage.getItem(KEY(page));
  } catch {
    return null;
  }
}
function writeStored(page: string, q: string) {
  try {
    if (q) sessionStorage.setItem(KEY(page), q);
    else sessionStorage.removeItem(KEY(page));
  } catch {}
}
/** rewrite one parameter of the address in place (no navigation, no new history entry) */
export function replaceParam(name: string, value: string | null) {
  try {
    const next = urlWithParam(location.href, name, value);
    if (next !== `${location.pathname}${location.search}${location.hash}`)
      history.replaceState(history.state, "", next);
  } catch {}
}

export type PageQuery = [string, (q: string) => void];

/** the page's one search text (restored from the address or the session after mount: the server renders it empty) */
export function usePageQuery(page: string): PageQuery {
  const [q, setQState] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const restore = () => {
      const v = initialQuery(location.search, readStored(page));
      setQState(v);
      writeStored(page, v);
    };
    restore();
    // back / forward inside the page (an address another part of the app pushed)
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [page]);
  const setQ = useCallback(
    (v: string) => {
      setQState(v);
      writeStored(page, v);
      if (timer.current) clearTimeout(timer.current);
      // cleared: at once (a reload right after the ⓧ must not bring the words back)
      if (!v) replaceParam("q", null);
      else timer.current = setTimeout(() => replaceParam("q", v), URL_WRITE_MS);
    },
    [page],
  );
  return useMemo<PageQuery>(() => [q, setQ], [q, setQ]);
}

/** the page's shared query, for the tabs on it (null outside such a page: a tab then keeps its own) */
export const PageQueryContext = createContext<PageQuery | null>(null);

/**
 * The page's shared query for the tabs inside it. The text lives here, not in the page: a keystroke re-renders this
 * provider and the fields that read it, never the page around them (its header, its tab bar, its sheets).
 */
export function PageQueryProvider({ page, children }: { page: string; children: ReactNode }) {
  const value = usePageQuery(page);
  return createElement(PageQueryContext.Provider, { value }, children);
}

/** a tab's search text: the page's shared one inside a PageQueryContext, else its own */
export function useSharedQuery(): PageQuery {
  const shared = useContext(PageQueryContext);
  const own = useState("");
  return shared ?? own;
}
