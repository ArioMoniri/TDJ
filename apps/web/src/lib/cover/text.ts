import type { GlyphFont } from "./glyphs";

/**
 * Words as outlines (wave 4): a line of text becomes one `<path>` from the glyph table, so the cover looks the same
 * in Chrome, Safari, the apps' web views and resvg, with no font on the machine. No DOM, no layout engine: advance
 * widths, the pairs' kerning and letter spacing, which is all a cover's few short lines need.
 */
const UNITS = 500;

/** the glyph for a character: itself, else its letter without the accent (NFD), else nothing */
function glyphOf(f: GlyphFont, ch: string): [number, string] | null {
  const g = f.glyphs[ch];
  if (g) return g;
  const base = ch.normalize("NFD").replace(/\p{M}+/gu, "");
  return (base && f.glyphs[base]) || null;
}

/** what a title can carry: printable characters, runs of white space as one space */
export function cleanText(s: unknown): string {
  return String(s ?? "")
    .replace(/[\p{C}\p{Z}\s]+/gu, " ")
    .trim();
}

/** width in font units at 1 em = UNITS */
function unitsWidth(f: GlyphFont, text: string, tracking = 0): number {
  let w = 0;
  let prev = "";
  for (const ch of text) {
    const g = glyphOf(f, ch);
    w += (g ? g[0] : UNITS * 0.3) + tracking * UNITS;
    if (prev) w += f.kern[prev + ch] ?? 0;
    prev = ch;
  }
  return Math.max(0, w - (text ? tracking * UNITS : 0));
}

/** the line's width in pixels at `size` */
export function measure(f: GlyphFont, text: string, size: number, tracking = 0): number {
  return (unitsWidth(f, text, tracking) * size) / UNITS;
}

/** `text` cut to `max` px with an ellipsis */
export function fitLine(f: GlyphFont, text: string, size: number, max: number, tracking = 0): string {
  if (measure(f, text, size, tracking) <= max) return text;
  const chars = [...text];
  while (chars.length && measure(f, `${chars.join("").trimEnd()}…`, size, tracking) > max) chars.pop();
  return chars.length ? `${chars.join("").trimEnd()}…` : "";
}

/** words into at most `lines` lines of `max` px; the last line takes the rest, cut with an ellipsis */
export function wrap(f: GlyphFont, text: string, size: number, max: number, lines: number): string[] {
  const words = text.split(" ").filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const next = cur ? `${cur} ${w}` : w;
    if (measure(f, next, size) <= max || !cur) {
      cur = next;
      continue;
    }
    out.push(cur);
    cur = w;
    if (out.length === lines - 1) {
      cur = words.slice(i).join(" ");
      break;
    }
  }
  if (cur) out.push(cur);
  return out.slice(0, lines).map((l) => fitLine(f, l, size, max));
}

const MOVE = /^m(-?\d+)\s?(-?\d+)/;
/**
 * The line as one path: `x` is the left edge (or the right one with `anchor: "end"`), `y` the baseline. Each
 * glyph's path starts with a relative move from the origin, made absolute at its pen position; the rest stays
 * relative, so the glyphs join into one `d` with a single scale.
 */
export function textPath(
  f: GlyphFont,
  text: string,
  o: {
    x: number;
    y: number;
    size: number;
    fill: string;
    tracking?: number;
    anchor?: "start" | "end";
    opacity?: number;
  },
): string {
  const tracking = o.tracking ?? 0;
  let pen = 0;
  let prev = "";
  let d = "";
  for (const ch of text) {
    const g = glyphOf(f, ch);
    if (prev) pen += f.kern[prev + ch] ?? 0;
    if (g?.[1]) {
      const m = MOVE.exec(g[1]);
      if (m) d += `M${pen + Number(m[1])} ${m[2]}${g[1].slice(m[0].length)}`;
    }
    pen += (g ? g[0] : UNITS * 0.3) + tracking * UNITS;
    prev = ch;
  }
  if (!d) return "";
  const k = o.size / UNITS;
  const width = (Math.max(0, pen - (text ? tracking * UNITS : 0)) * o.size) / UNITS;
  const x = o.anchor === "end" ? o.x - width : o.x;
  const op = o.opacity !== undefined && o.opacity < 1 ? ` fill-opacity="${o.opacity}"` : "";
  return `<path transform="translate(${r2(x)} ${r2(o.y)}) scale(${r4(k)})" fill="${o.fill}"${op} d="${d}"/>`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
