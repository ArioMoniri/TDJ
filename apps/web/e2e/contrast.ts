import type { Page } from "@playwright/test";

/**
 * Every text inside `scope` (its buttons, links, chips and rows) against its real, composited background: WCAG AA
 * (4.5:1, 3:1 for large or disabled text). The same measure as booth-ipad.spec's, for any selector.
 */
export const contrastFailures = (page: Page, scope = ".booth") =>
  page.evaluate(async (scope) => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a instanceof CSSTransition)
        .map((a) => a.finished.catch(() => {})),
    );
    type C = [number, number, number, number];
    const parse = (s: string): C | null => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) {
        const c = s.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
        if (!c) return null;
        return [+c[1]! * 255, +c[2]! * 255, +c[3]! * 255, c[4] === undefined ? 1 : +c[4]];
      }
      const p = m[1]!
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
    };
    const over = (top: C, under: C): C => {
      const a = top[3] + under[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      return [0, 1, 2]
        .map((i) => (top[i]! * top[3] + under[i]! * under[3] * (1 - top[3])) / a)
        .concat(a) as C;
    };
    const lum = (c: C) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
    };
    const ratio = (a: C, b: C) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x! + 0.05) / (y! + 0.05);
    };
    const page0 = parse(getComputedStyle(document.documentElement).backgroundColor)!;
    const body0 = parse(getComputedStyle(document.body).backgroundColor);
    const base = body0 && body0[3] > 0 ? over(body0, page0) : page0;
    const bgOf = (el: Element): C => {
      const layers: C[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (e.classList.contains("glass")) {
          const a = parse(getComputedStyle(e, "::after").backgroundColor);
          if (a && a[3] > 0) layers.push(a);
        }
        const c = parse(cs.backgroundColor);
        if (c && c[3] > 0) layers.push(c);
        if (layers.length && layers[layers.length - 1]![3] >= 0.999) break;
      }
      let acc: C = base;
      for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i]!, acc);
      return acc;
    };
    const roots = [...document.querySelectorAll<HTMLElement>(scope)];
    const hosts = roots
      .flatMap((r) => [
        ...r.querySelectorAll<HTMLElement>("button, a, h1, h2, p, .booth-chip, .tanda-type, .cell"),
      ])
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.width > 0 &&
          r.height > 0 &&
          !el.closest(".booth-played, [data-bypassed], .booth-row-energy") &&
          getComputedStyle(el).visibility !== "hidden"
        );
      });
    const out: string[] = [];
    let checked = 0;
    const seen = new Set<Element>();
    for (const h of hosts) {
      const texts = [h, ...h.querySelectorAll<HTMLElement>("*")].filter((e) =>
        [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 0),
      );
      for (const e of texts) {
        if (seen.has(e)) continue;
        seen.add(e);
        const cs = getComputedStyle(e);
        if (cs.visibility === "hidden" || e.getBoundingClientRect().width === 0) continue;
        if (e.closest(".booth-art, .tile-art, [data-testid='artwork'], .night-cover")) continue;
        let op = 1;
        for (let x: Element | null = e; x && x !== document.body; x = x.parentElement) {
          op *= Number(getComputedStyle(x).opacity);
          const bx = parse(getComputedStyle(x).backgroundColor);
          if (bx && bx[3] >= 0.999) break;
        }
        const bg = bgOf(e);
        const fg0 = parse(cs.color)!;
        const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * op], bg);
        const r = ratio(fg, bg);
        const size = Number.parseFloat(cs.fontSize);
        const bold = Number(cs.fontWeight) >= 700;
        const large = size >= 24 || (bold && size >= 18.66);
        const disabled =
          (e.closest("button") as HTMLButtonElement | null)?.disabled ||
          !!e.closest("[aria-disabled='true'], [disabled]");
        const need = disabled || large ? 3 : 4.5;
        checked++;
        if (r < need - 0.01)
          out.push(
            `${(h.dataset.testid ?? h.className).slice(0, 40)} “${e.textContent!.trim().slice(0, 24)}” ${r.toFixed(2)} < ${need}`,
          );
      }
    }
    return { out, checked };
  }, scope);
