/**
 * Page scroll lock for sheets, counted (round 23).
 *
 * The lock is `html[data-scroll-lock]` (globals.css: `overflow: hidden` on the root, not `body`: `html` has
 * `overflow-x: clip`, so `body`'s overflow never reaches the viewport, and the root keeps its scroll offset).
 *
 * Each sheet used to save the root's inline `overflow` and restore it on close. Two sheets whose lives overlap (one
 * opens while another is still closing: the ••• sheet → Find on services, a menu → its sheet) restored out of order,
 * and the later one "restored" `hidden` for good. Touch scrolling on iPad ignores a hidden root, so it looked fine
 * on the device, but the trackpad, the mouse wheel and Safari on a Mac could not scroll the page any more.
 */
export function createScrollLock(root: { dataset: Record<string, string | undefined> }) {
  let locks = 0;
  return {
    /** Locks the page; the returned release is idempotent. */
    lock(): () => void {
      if (locks++ === 0) root.dataset.scrollLock = "";
      let released = false;
      return () => {
        if (released) return;
        released = true;
        locks = Math.max(0, locks - 1);
        if (locks === 0) delete root.dataset.scrollLock;
      };
    },
    get count() {
      return locks;
    },
  };
}

let shared: ReturnType<typeof createScrollLock> | null = null;
/** The page's lock (browser only). */
export function lockScroll(): () => void {
  shared ??= createScrollLock(
    document.documentElement as unknown as { dataset: Record<string, string | undefined> },
  );
  return shared.lock();
}
