/**
 * QA fix 2026-11 (the owner: "there should be a back button from the Song DNA page"; "when jumping from one Song DNA
 * to another there's no back to the previous one") — the pages this tab visited, newest last, each with the name its
 * Back button shows ("‹ Compose", "‹ Ansiedad", "‹ Juan D'Arienzo"). Every DNA link pushes a real history entry
 * (next/link), so the browser's and the OS's back (iPad swipe) walk the same chain; the trail only names the steps.
 * Kept in sessionStorage (per tab), pure helpers for the vitest.
 */
export interface TrailStep {
  href: string;
  label: string;
}
const KEY = "tdj-nav-trail-v1";
const MAX = 30;

export function readTrail(): TrailStep[] {
  try {
    const x = JSON.parse(sessionStorage.getItem(KEY) ?? "[]") as TrailStep[];
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}
function writeTrail(t: TrailStep[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(t.slice(-MAX)));
  } catch {}
}

/**
 * The trail after visiting `href`: a step back to the page before it (the browser's back) pops the last step, a new
 * page is pushed, the same page (a re-render, a label arriving) only updates its label.
 */
export function visit(trail: TrailStep[], href: string, label: string): TrailStep[] {
  const last = trail.at(-1);
  if (last?.href === href) return [...trail.slice(0, -1), { href, label: label || last.label }];
  if (trail.at(-2)?.href === href) return trail.slice(0, -1);
  return [...trail, { href, label }].slice(-MAX);
}

/** the step a Back button returns to: the page before this one, else null (opened directly) */
export const backStep = (trail: TrailStep[], href: string): TrailStep | null => {
  const i = trail.map((s) => s.href).lastIndexOf(href);
  return i > 0 ? trail[i - 1]! : null;
};

export function recordVisit(href: string, label: string) {
  writeTrail(visit(readTrail(), href, label));
}
/** a page names itself once its data is in (a DNA page's song or orchestra) */
export function nameVisit(href: string, label: string) {
  const t = readTrail();
  if (t.at(-1)?.href === href) writeTrail([...t.slice(0, -1), { href, label }]);
}
