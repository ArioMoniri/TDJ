/**
 * Where a popover menu goes (Menu.tsx): below its trigger when it fits, flipped above when the space below is
 * short and above is roomier, and in every case shifted so the whole menu stays inside the viewport minus the safe
 * area and a margin. Pure, so the placement is unit tested (wave 2: on iPad portrait the tanda menu opened past the
 * bottom edge and three of its six items were cut off).
 */
export interface Rect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}
export interface Placement {
  top: number;
  left: number;
  /** the menu opens upward: its transform origin is at the bottom */
  up: boolean;
  /** a max-height when the menu is taller than the viewport allows (the list scrolls) */
  maxHeight?: number;
}

export const MENU_GAP = 4;
export const MENU_MARGIN = 8;

export function placeMenu(
  trigger: Rect,
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
  safe: Insets = { top: 0, bottom: 0, left: 0, right: 0 },
  align: "left" | "right" = "right",
): Placement {
  const minY = safe.top + MENU_MARGIN;
  const maxY = viewport.height - safe.bottom - MENU_MARGIN;
  const minX = safe.left + MENU_MARGIN;
  const maxX = viewport.width - safe.right - MENU_MARGIN;
  const room = Math.max(0, maxY - minY);
  const height = Math.min(menu.height, room);
  const below = maxY - (trigger.bottom + MENU_GAP);
  const above = trigger.top - MENU_GAP - minY;
  const up = below < height && above > below;
  let top = up ? trigger.top - MENU_GAP - height : trigger.bottom + MENU_GAP;
  top = Math.min(Math.max(top, minY), maxY - height);
  let left = align === "right" ? trigger.right - menu.width : trigger.left;
  left = Math.min(Math.max(left, minX), Math.max(minX, maxX - menu.width));
  return { top, left, up, ...(menu.height > room ? { maxHeight: room } : {}) };
}
