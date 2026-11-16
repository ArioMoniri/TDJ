/**
 * QA 2026-11 (1440 × 900: the 980 px Controller sheet, centred on the viewport, ran 10 px over the 240 px sidebar): a
 * wide sheet is centred on the viewport (Sheet.tsx), so it stays clear of the sidebar by keeping the same margin on
 * both sides — at most `max`, and never wider than the viewport less the sidebar and a 16 px gap on each side.
 */
export function wideSheetWidth(viewport: number, sidebarRight: number, max = 980, gap = 16): number {
  const room = viewport - 2 * (Math.max(0, sidebarRight) + gap);
  return Math.max(320, Math.min(max, room));
}
