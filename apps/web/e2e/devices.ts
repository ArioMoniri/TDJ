/**
 * iPhone Duo (iOS 27.1, 2026-10) in Chromium: each posture's viewport, scale, touch, user agent and safe-area insets.
 *
 * Apple publishes the App Store screenshot sizes (outer display 1398 × 2034, inner display 2007 × 2853 / 2853 × 2007)
 * but no point sizes; at 3x those are 466 × 678 pt folded and 951 × 669 pt open (the book pose, fold down the middle),
 * the same sizes the store captures use (apps/desktop/store/creative/spec.ts). Insets are estimates until Device Hub's
 * iPhone Duo simulator confirms them: folded, a camera region at the top and the home indicator; open (27.1 SDK, edge
 * to edge), the status bar as a vertical bar on the trailing edge. Playwright has no safe-area option, so `duoSafeArea`
 * sets them through CDP (Emulation.setSafeAreaInsetsOverride, Chromium only).
 *
 * Fold and unfold resize the app's one scene discretely (TN3192) — in a WKWebView that is a resize of the same page,
 * which `setViewportSize` reproduces: no reload, the Booth keeps playing (e2e/duo-fold.spec.ts).
 */
import type { BrowserContextOptions, Page } from "@playwright/test";

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

export type DuoPosture = "outer" | "outer-landscape" | "inner" | "inner-portrait";

export const DUO: Record<
  DuoPosture,
  BrowserContextOptions & {
    viewport: { width: number; height: number };
    safe: { top: number; bottom: number; left: number; right: number };
  }
> = {
  outer: {
    viewport: { width: 466, height: 678 },
    safe: { top: 44, bottom: 20, left: 0, right: 0 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: UA,
  },
  "outer-landscape": {
    viewport: { width: 678, height: 466 },
    safe: { top: 0, bottom: 20, left: 44, right: 0 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: UA,
  },
  inner: {
    viewport: { width: 951, height: 669 },
    safe: { top: 0, bottom: 20, left: 0, right: 28 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: UA,
  },
  "inner-portrait": {
    viewport: { width: 669, height: 951 },
    safe: { top: 28, bottom: 20, left: 0, right: 0 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: UA,
  },
};

/** the context options of a posture (Playwright rejects the extra `safe` key) */
export function duo(p: DuoPosture): BrowserContextOptions {
  const { safe: _s, ...rest } = DUO[p];
  return rest;
}

/** the posture's safe-area insets, emulated (env(safe-area-inset-*) in the page); a no-op where CDP is missing */
export async function duoSafeArea(page: Page, p: DuoPosture) {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setSafeAreaInsetsOverride" as never, { insets: DUO[p].safe } as never);
  } catch {}
}

/** the matrix rows the layout specs add (wave4-mobile, booth-ui2, qa) */
export const DUO_MATRIX: Array<[string, BrowserContextOptions]> = [
  ["iPhone Duo folded", duo("outer")],
  ["iPhone Duo open", duo("inner")],
];
