/**
 * WCAG 2 contrast arithmetic for the design tokens (globals.css). Pure: the contrast unit test reads the token
 * values out of the stylesheet and checks every text / background pair the app paints with them.
 */
export type Rgb = readonly [number, number, number];

/** "#rrggbb" or "r g b" (the triplet form the tokens use for alpha composition). */
export function parseColor(value: string): Rgb {
  const v = value.trim();
  if (v.startsWith("#")) {
    const h = v.length === 4 ? [...v.slice(1)].map((c) => c + c).join("") : v.slice(1);
    return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as unknown as Rgb;
  }
  const parts = v.split(/[\s,]+/).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) throw new Error(`not a colour: ${value}`);
  return [parts[0], parts[1], parts[2]];
}

/** `fg` at `alpha` over the opaque `bg`. */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as unknown as Rgb;
}

export function luminance([r, g, b]: Rgb): number {
  const f = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** WCAG AA: 4.5:1 for body text, 3:1 for large text (24 px, or 18.66 px bold). */
export const AA_TEXT = 4.5;
export const AA_LARGE = 3;
