import type { SVGProps } from "react";

/**
 * The glyphs a set repeats 100+ times (track rows, card headers): one `<symbol>` sprite in the layout and a
 * 2-node `<svg><use/></svg>` per instance instead of a 3–7 node Lucide SVG each. Path data is Lucide's
 * (ISC), so the icons stay pixel-identical to the `lucide-react` ones used everywhere else.
 */
const ICONS = {
  swap: [
    ["path", { d: "m2 9 3-3 3 3" }],
    ["path", { d: "M13 18H7a2 2 0 0 1-2-2V6" }],
    ["path", { d: "m22 15-3 3-3-3" }],
    ["path", { d: "M11 6h6a2 2 0 0 1 2 2v10" }],
  ],
  more: [
    ["circle", { cx: "12", cy: "12", r: "1" }],
    ["circle", { cx: "19", cy: "12", r: "1" }],
    ["circle", { cx: "5", cy: "12", r: "1" }],
  ],
  play: [
    ["path", { d: "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" }],
  ],
  pause: [
    ["rect", { x: "14", y: "3", width: "5", height: "18", rx: "1" }],
    ["rect", { x: "5", y: "3", width: "5", height: "18", rx: "1" }],
  ],
  search: [
    ["path", { d: "m21 21-4.34-4.34" }],
    ["circle", { cx: "11", cy: "11", r: "8" }],
  ],
  cortina: [
    ["path", { d: "M2 10v3" }],
    ["path", { d: "M6 6v11" }],
    ["path", { d: "M10 3v18" }],
    ["path", { d: "M14 8v7" }],
    ["path", { d: "M18 5v13" }],
    ["path", { d: "M22 10v3" }],
  ],
  chevron: [["path", { d: "m9 18 6-6-6-6" }]],
  lock: [
    ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }],
    ["path", { d: "M7 11V7a5 5 0 0 1 10 0v4" }],
  ],
  unlock: [
    ["rect", { width: "18", height: "11", x: "3", y: "11", rx: "2", ry: "2" }],
    ["path", { d: "M7 11V7a5 5 0 0 1 9.9-1" }],
  ],
  headphones: [
    [
      "path",
      {
        d: "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3",
      },
    ],
  ],
} as const satisfies Record<string, ReadonlyArray<readonly [string, Record<string, string>]>>;

export type IconName = keyof typeof ICONS;

/** Rendered once in the root layout (hidden, zero size): the `<symbol>` definitions `<I>` references. */
export function IconSprite() {
  return (
    <svg
      aria-hidden
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      focusable="false"
    >
      <defs>
        {(Object.keys(ICONS) as IconName[]).map((name) => (
          <symbol key={name} id={`tdj-i-${name}`} viewBox="0 0 24 24">
            {ICONS[name].map(([tag, attrs], k) => {
              const Tag = tag as "path" | "circle" | "rect";
              return <Tag key={k} {...attrs} />;
            })}
          </symbol>
        ))}
      </defs>
    </svg>
  );
}

/** A sprite icon with Lucide's default presentation (24 box, 2 px round strokes, no fill). */
export function I({
  name,
  size = 24,
  strokeWidth = 2,
  fill = "none",
  ...rest
}: { name: IconName; size?: number; strokeWidth?: number; fill?: string } & Omit<
  SVGProps<SVGSVGElement>,
  "fill" | "strokeWidth" | "name"
>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      <use href={`#tdj-i-${name}`} />
    </svg>
  );
}
