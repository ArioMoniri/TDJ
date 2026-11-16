/**
 * The black stage the product shots stand on (the README hero, the Mac App Store pictures, the Mac app preview):
 * pure black, a soft vignette, and the headline set above the laptop in the system's display face (SF Pro on a Mac,
 * Inter Display where there is no SF), white, large and tight.
 */
import type { CSSProperties } from "react";

export const STAGE = "#000";

/** the headline's face: the system's display face first */
export const DISPLAY_FONT =
  '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Inter Display", Inter, "Helvetica Neue", Arial, sans-serif';

/** the corners and the bottom edge sink into black (CSS, so the 3D still and the 2D phase share it exactly) */
export const VIGNETTE =
  "radial-gradient(120% 95% at 50% 42%, rgba(0,0,0,0) 58%, rgba(0,0,0,.42) 86%, rgba(0,0,0,.7) 100%)";

export const Vignette = () => (
  <div style={{ position: "absolute", inset: 0, background: VIGNETTE, pointerEvents: "none" }} />
);

/** a small product line over one headline, centred on the frame */
export function Headline({
  kicker,
  text,
  width,
  top,
  size,
  style,
}: {
  kicker?: string;
  text: string;
  width: number;
  top: number;
  /** the headline's font size, px; the product line is 0.36 of it */
  size: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top,
        width,
        textAlign: "center",
        color: "#f5f5f7",
        fontFamily: DISPLAY_FONT,
        ...style,
      }}
    >
      {kicker ? (
        <div
          style={{
            fontSize: size * 0.36,
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "#86868b",
            marginBottom: size * 0.22,
          }}
        >
          {kicker}
        </div>
      ) : null}
      <div style={{ fontSize: size, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
        {text}
      </div>
    </div>
  );
}
