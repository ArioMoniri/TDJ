import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AA_TEXT, contrast, over, parseColor, type Rgb } from "./contrast";

/** The custom properties declared directly in the block that opens with `header` (the first match). */
function block(css: string, header: string): Record<string, string> {
  const at = css.indexOf(header);
  if (at < 0) throw new Error(`no block ${header}`);
  let depth = 0;
  let i = css.indexOf("{", at);
  const start = i + 1;
  for (; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) break;
  }
  const out: Record<string, string> = {};
  for (const m of css.slice(start, i).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");
const tokenStart = css.indexOf("/* Tokens.");
const light = block(css.slice(tokenStart), ":root {");
const darkClass = { ...light, ...block(css, '.dark,\n:root[data-theme="dark"] {') };
const darkMedia = { ...light, ...block(css, ':root:not([data-theme="light"]) {') };

function resolve(t: Record<string, string>, name: string): string {
  let v = t[name];
  if (v === undefined) throw new Error(`token ${name} is not declared`);
  for (let n = 0; n < 5; n++) {
    const m = v.match(/^var\((--[\w-]+)\)$/);
    if (!m) break;
    v = t[m[1]];
  }
  return v;
}
const rgb = (t: Record<string, string>, name: string): Rgb => parseColor(resolve(t, name));
/** `rgb(var(--text) / 0.6)` → 0.6 */
function alphaOf(t: Record<string, string>, name: string): number {
  const m = resolve(t, name).match(/rgb\(var\(--text\)\s*\/\s*([\d.]+)\)/);
  if (!m) throw new Error(`${name} is not a --text alpha`);
  return Number(m[1]);
}

/** Every text colour against every background it is painted on, as the testers measured it. */
function pairs(t: Record<string, string>) {
  const text = rgb(t, "--text");
  const grouped = rgb(t, "--bg-grouped");
  const cell = rgb(t, "--bg-cell");
  const surface = rgb(t, "--surface");
  const fill3 = alphaOf(t, "--fill-3");
  const tint = rgb(t, "--tint");
  const backgrounds: Record<string, Rgb> = {
    "page (bg-grouped)": grouped,
    cell: cell,
    surface,
    "fill-3 over the page": over(text, fill3, grouped),
    "fill-3 over a cell": over(text, fill3, cell),
    "tint 13 % over a cell (pills)": over(tint, 0.13, cell),
  };
  const out: { fg: string; bg: string; ratio: number }[] = [];
  for (const [name, bg] of Object.entries(backgrounds)) {
    for (const label of ["--label", "--label-2", "--label-3"]) {
      const a = label === "--label" ? 1 : alphaOf(t, label);
      out.push({ fg: label, bg: name, ratio: contrast(over(text, a, bg), bg) });
    }
    out.push({ fg: "--tint", bg: name, ratio: contrast(tint, bg) });
    out.push({ fg: "--tint-text", bg: name, ratio: contrast(rgb(t, "--tint-text"), bg) });
  }
  out.push({ fg: "--on-tint", bg: "--tint-fill", ratio: contrast(rgb(t, "--on-tint"), rgb(t, "--tint-fill")) });
  return out;
}

describe("design-token contrast (WCAG AA, 4.5:1 for text)", () => {
  for (const [theme, tokens] of [
    ["light", light],
    ["dark (.dark / data-theme)", darkClass],
    ["dark (prefers-color-scheme)", darkMedia],
  ] as const) {
    it(`every label / tint / on-tint pair clears 4.5:1 in ${theme}`, () => {
      const failing = pairs(tokens)
        .filter((p) => p.ratio < AA_TEXT)
        .map((p) => `${p.fg} on ${p.bg}: ${p.ratio.toFixed(2)}`);
      expect(failing).toEqual([]);
    });
  }

  it("the two dark declarations agree on every colour token", () => {
    for (const name of ["--tint", "--tint-text", "--tint-fill", "--on-tint", "--text", "--bg-grouped", "--bg-cell"]) {
      expect(resolve(darkMedia, name), name).toBe(resolve(darkClass, name));
    }
  });

  it("keeps the label hierarchy: label-2 stronger than label-3", () => {
    for (const t of [light, darkClass]) expect(alphaOf(t, "--label-2")).toBeGreaterThan(alphaOf(t, "--label-3"));
  });

  it("parses the token forms", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor("24 22 34")).toEqual([24, 22, 34]);
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });
});
