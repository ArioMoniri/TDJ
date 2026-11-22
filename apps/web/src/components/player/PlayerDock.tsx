"use client";
import { ArrowDownToLine, Disc3, Maximize2, PanelLeftOpen, PictureInPicture2, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  type Anchor,
  type Box,
  boxOf,
  CARD,
  clampPos,
  DISC,
  DRAG_SLOP,
  discOf,
  dropTarget,
  formOf,
  handleSize,
  type Insets,
  isDisc,
  type Place,
  pinchSize,
  place as placeAt,
  placeOf,
  ring,
  settleSize,
  snap,
} from "@/lib/dock/geometry";
import { useDock } from "@/lib/dock/store";
import { haptic } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { stopAt, usePlayer } from "@/lib/player";
import { useSaving } from "@/lib/power";
import { BoothMini, boothEngine, clock, nightOn, useBoothSnapshot } from "../booth/BoothMini";
import { MiniPlayerCard } from "../MiniPlayer";
import { Artwork } from "../ui/Artwork";
import { usePlayingEntity } from "../ui/TandaArt";
import { DOCK_FLOAT_EVENT } from "./DockGrip";
import "./dock.css";

/** a long press on the gramophone opens its quick controls */
const LONG_MS = 480;
/** a press on a control inside the player that travels this far is a drag, never the control (it is cancelled) */
const PRESS_SLOP = 10;

interface Env {
  vw: number;
  vh: number;
  wide: boolean;
  collapsed: boolean;
}

function useEnv(): Env | null {
  const [env, setEnv] = useState<Env | null>(null);
  useEffect(() => {
    const r = document.documentElement;
    const read = () =>
      setEnv((o) => {
        const n = {
          vw: window.innerWidth,
          vh: window.innerHeight,
          wide: window.matchMedia("(min-width: 900px)").matches,
          collapsed: r.dataset.sidebar === "collapsed",
        };
        return o && o.vw === n.vw && o.vh === n.vh && o.wide === n.wide && o.collapsed === n.collapsed
          ? o
          : n;
      });
    read();
    window.addEventListener("resize", read);
    const mo = new MutationObserver(read);
    mo.observe(r, { attributes: true, attributeFilter: ["data-sidebar"] });
    return () => {
      window.removeEventListener("resize", read);
      mo.disconnect();
    };
  }, []);
  return env;
}

let probe: HTMLDivElement | null = null;
/** the safe-area insets, read from a probe that carries them as padding */
function safeArea(): Insets {
  if (!probe) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.append(probe);
  }
  const cs = getComputedStyle(probe);
  return {
    top: Number.parseFloat(cs.paddingTop) || 0,
    right: Number.parseFloat(cs.paddingRight) || 0,
    bottom: Number.parseFloat(cs.paddingBottom) || 0,
    left: Number.parseFloat(cs.paddingLeft) || 0,
  };
}

const visibleRect = (sel: string): DOMRect | null => {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
};

/**
 * what a floating player stays clear of: the safe areas, the page's top bar, the phone's tab capsule, the open
 * sidebar (or the rail a collapsed one leaves)
 */
function insetsNow(env: Env): Insets {
  const safe = safeArea();
  const ins: Insets = {
    top: safe.top + (env.wide ? 8 : 56),
    right: safe.right,
    bottom: safe.bottom + 4,
    left: safe.left,
  };
  const tab = visibleRect('[data-testid="tab-bar"]');
  if (tab && tab.top < env.vh && tab.top > env.vh / 2)
    ins.bottom = Math.max(ins.bottom, env.vh - tab.top + 4);
  if (env.wide) {
    const side = env.collapsed ? null : visibleRect('[data-testid="sidebar"]');
    ins.left = Math.max(ins.left, side ? side.right : 52);
  }
  return ins;
}

/** the ring's geometry inside the gramophone (a 100 × 100 view box) */
const RING_R = 46;

/**
 * 2026-11 (the owner: "the circular shape always on screen player bar like gramophone on side bar"; "draggable and
 * resizable, and maybe for lower size be a circle in gramophone shape with the circular indicator around it showing
 * how much remains") — the ONE player of the app. It holds the Booth's night when one plays (BoothMini) or a
 * preview (MiniPlayerCard), and stands in one place at a time:
 * - `side`: docked in the sidebar on a desktop and an iPad landscape, with every control the bottom bar and the
 *   player settings had (cover, title, Tanda / Song N of M, next, La Cumparsita, progress, transport with the
 *   mid-night confirm, volume and mute, the headphones' pre-listen, the output, Now playing);
 * - `bar`: the compact bar above the tab bar (a phone) or at the content's foot (an iPad portrait), with a grabber;
 * - `float`: a floating card, dragged anywhere, snapping to an edge or a corner, resized by its handle or a pinch;
 * - `disc`: below a card's width (and whenever the sidebar is collapsed) the round gramophone — the cover as the
 *   record's label, spinning while the room plays (still when paused, with Reduce Motion or Battery saver), a ring
 *   around it for how much of the song is left; a tap (or a long press) opens the player's card in place — Now
 *   playing is one tap further, on the card (the owner: "it jumped straight to Now playing").
 * Position and size are kept per device (lib/dock). A drag starts only on the grabber, the card's head or the
 * gramophone; a press on a control that travels is cancelled, so the room's transport never changes by accident.
 */
export function PlayerDock() {
  const path = usePathname();
  const snapshot = useBoothSnapshot(path);
  const track = usePlayer((s) => s.track);
  const onBooth = path === "/booth" || !!path?.startsWith("/booth/");
  const night = !onBooth && nightOn(snapshot) && !!snapshot?.plan;
  const active = !onBooth && (night || !!track);
  const env = useEnv();
  const saved = useDock((s) => s.saved);
  const quick = useDock((s) => s.quick);
  const dragging = useDock((s) => s.dragging);
  useEffect(() => {
    if (env) useDock.getState().setForm(formOf(env.vw));
  }, [env]);

  // a drag, a pinch or the handle: the live size and spot (null at rest)
  const [live, setLive] = useState<{ x?: number; y?: number; size: number } | null>(null);
  const restSize = saved.detached ? saved.size : DISC.def;
  const base: Place | null = active && env ? placeOf(saved, env) : null;
  const place: Place | null = live ? (isDisc(live.size) ? "disc" : "float") : base;
  const size = live?.size ?? (base === "disc" ? discOf(restSize) : restSize);
  const anchor: Anchor = saved.detached ? saved.anchor : { edge: "left", y: 1 };

  useLayoutEffect(() => {
    useDock.setState({ place });
    const r = document.documentElement;
    if (place) r.dataset.dock = place;
    else delete r.dataset.dock;
  }, [place]);
  useEffect(
    () => () => {
      delete document.documentElement.dataset.dock;
      useDock.setState({ place: null, quick: false, dragging: false });
    },
    [],
  );

  // the floating card's height (it follows what it holds)
  const panel = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(168);
  useEffect(() => {
    // (the shell, its padding included: the panel alone left the card 12 px lower than its margin)
    const el = shellRef.current;
    if (place !== "float" || !el || typeof ResizeObserver !== "function") return;
    const put = () => setCardH(Math.ceil(el.offsetHeight) || 168);
    put();
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => ro.disconnect();
  }, [place]);

  const box: Box = boxOf(size, cardH);
  const [ins, setIns] = useState<Insets>({ top: 64, right: 0, bottom: 16, left: 0 });
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again when the window or the place changes
  useLayoutEffect(() => {
    if (env && (place === "float" || place === "disc")) {
      const n = insetsNow(env);
      setIns((o) =>
        o.top === n.top && o.right === n.right && o.bottom === n.bottom && o.left === n.left ? o : n,
      );
    }
  }, [env, place, track, night]);
  const pos =
    env && (place === "float" || place === "disc")
      ? live?.x !== undefined && live.y !== undefined
        ? { x: live.x, y: live.y }
        : placeAt(anchor, box, { w: env.vw, h: env.vh }, ins)
      : null;

  // the sidebar's slot (Sidebar.tsx renders it)
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHost(document.body);
    setSlot(document.getElementById("sidebar-player"));
  }, []);

  /* ——— save helpers ——— */
  const saveDetached = useCallback((p: { anchor?: Anchor; size?: number }) => {
    const s = useDock.getState().saved;
    useDock.getState().save({
      detached: true,
      anchor: p.anchor ?? s.anchor,
      size: settleSize(p.size ?? s.size),
    });
  }, []);
  const dock = useCallback(() => {
    haptic(6);
    useDock.setState({ quick: false });
    useDock.getState().save({ ...useDock.getState().saved, detached: false });
  }, []);
  const floatCard = useCallback(() => {
    haptic(6);
    const s = useDock.getState().saved;
    useDock.getState().save({
      detached: true,
      anchor: s.detached ? s.anchor : { edge: "right", y: 1 },
      size: isDisc(s.size) ? CARD.def : s.size,
    });
    useDock.setState({ quick: false });
  }, []);
  const toDisc = useCallback(() => {
    haptic(6);
    const s = useDock.getState().saved;
    useDock.getState().save({
      detached: true,
      anchor: s.detached ? s.anchor : { edge: "right", y: 1 },
      size: DISC.def,
    });
    useDock.setState({ quick: false });
  }, []);
  useEffect(() => {
    window.addEventListener(DOCK_FLOAT_EVENT, toDisc);
    return () => window.removeEventListener(DOCK_FLOAT_EVENT, toDisc);
  }, [toDisc]);

  /* ——— a click right after a drag, a long press or a cancelled press is spent ——— */
  const eatUntil = useRef(0);
  const eat = useCallback(() => {
    eatUntil.current = performance.now() + 450;
  }, []);
  const onClickCapture = (e: MouseEvent) => {
    if (!shellRef.current?.contains(e.target as Node)) return;
    if (performance.now() < eatUntil.current) {
      e.preventDefault();
      e.stopPropagation();
      eatUntil.current = 0;
    }
  };

  /* ——— a control pressed and then moved is never that control (the room's transport above all) ——— */
  const press = useRef<{ id: number; x: number; y: number; el: HTMLElement | null; off: boolean } | null>(
    null,
  );
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p || p.off || p.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < PRESS_SLOP) return;
      p.off = true;
      if (p.el)
        p.el.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: e.pointerId }));
    };
    const up = (e: PointerEvent) => {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      if (p.off) eat();
      press.current = null;
    };
    // a new press is a new gesture: its click is its own
    const down = () => {
      eatUntil.current = 0;
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
  }, [eat]);
  const onPointerDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    // (a sheet the player opened, the room's output picker, is in its React tree but not on it: its own gestures)
    if (!shellRef.current?.contains(e.target as Node)) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>(
      "button:not(.dock-grip):not(.dock-disc):not(.dock-resize), a, .booth-mini-seek",
    );
    press.current = { id: e.pointerId, x: e.clientX, y: e.clientY, el, off: false };
    trackTouch(e);
  };

  /* ——— drag ——— */
  const drag = useRef<{
    id: number;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    from: Place;
    size: number;
    moved: boolean;
    long: ReturnType<typeof setTimeout> | null;
    last: { x: number; y: number } | null;
  } | null>(null);
  const frame = useRef(0);
  const ctx = useRef({ env, ins, box, place, saved, cardH });
  ctx.current = { env, ins, box, place, saved, cardH };

  const endListeners = useRef<() => void>(() => {});
  const startDrag = useCallback(
    (e: ReactPointerEvent<HTMLElement>, opts: { long?: boolean } = {}) => {
      const c = ctx.current;
      if (!c.place || !c.env) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      // a second finger is a pinch, never a second drag
      if (pinch.current || touches.current.size > 1) return;
      const shell = e.currentTarget.closest<HTMLElement>(".dock");
      const hostEl =
        c.place === "float" || c.place === "disc"
          ? shell
          : e.currentTarget.closest<HTMLElement>('.booth-mini, [data-testid="mini-player"], .dock-panel');
      const r = (hostEl ?? e.currentTarget).getBoundingClientRect();
      const d = {
        id: e.pointerId,
        sx: e.clientX,
        sy: e.clientY,
        ox: e.clientX - r.left,
        oy: e.clientY - r.top,
        from: c.place,
        size: c.place === "float" || c.place === "disc" ? (live?.size ?? size) : size,
        moved: false,
        long: null as ReturnType<typeof setTimeout> | null,
        last: null as { x: number; y: number } | null,
      };
      if (opts.long)
        d.long = setTimeout(() => {
          d.long = null;
          if (d.moved || drag.current !== d) return;
          haptic(10);
          eat();
          useDock.setState({ quick: true });
          stop();
        }, LONG_MS);
      drag.current = d;
      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== d.id || drag.current !== d) return;
        const k = ctx.current;
        if (!k.env) return;
        if (!d.moved) {
          if (Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < DRAG_SLOP) return;
          d.moved = true;
          if (d.long) clearTimeout(d.long);
          d.long = null;
          useDock.setState({ dragging: true, quick: false });
          // off the bar: the gramophone under the finger; out of the sidebar: the card it keeps
          if (d.from === "bar") {
            d.size = DISC.def;
            d.ox = d.oy = DISC.def / 2;
          } else if (d.from === "side") {
            const s = k.saved.size;
            d.size = isDisc(s) ? CARD.def : s;
            d.ox = Math.min(d.ox, d.size - 24);
            d.oy = Math.min(d.oy, 24);
          } else if (d.from === "disc") d.size = discOf(d.size);
        }
        const b = boxOf(d.size, k.cardH);
        const vp = { w: k.env.vw, h: k.env.vh };
        const p = clampPos({ x: ev.clientX - d.ox, y: ev.clientY - d.oy }, b, vp, insetsNow(k.env));
        d.last = { x: ev.clientX, y: ev.clientY };
        if (!frame.current)
          frame.current = requestAnimationFrame(() => {
            frame.current = 0;
            if (drag.current === d) setLive({ x: p.x, y: p.y, size: d.size });
          });
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        if (d.long) clearTimeout(d.long);
        if (drag.current === d) drag.current = null;
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== d.id) return;
        stop();
        if (!d.moved) return;
        eat();
        if (frame.current) cancelAnimationFrame(frame.current);
        frame.current = 0;
        const k = ctx.current;
        useDock.setState({ dragging: false });
        if (!k.env) return setLive(null);
        const vp = { w: k.env.vw, h: k.env.vh };
        const ins2 = insetsNow(k.env);
        const side = k.env.wide && !k.env.collapsed ? visibleRect('[data-testid="sidebar"]') : null;
        const target = dropTarget({ x: ev.clientX, y: ev.clientY }, vp, {
          sideRight: side ? side.right : null,
          barTop: k.env.wide ? null : vp.h - ins2.bottom - 8,
        });
        setLive(null);
        if (target) {
          haptic(8);
          useDock.getState().save({ ...useDock.getState().saved, detached: false });
          return;
        }
        const b = boxOf(d.size, k.cardH);
        const at = clampPos({ x: ev.clientX - d.ox, y: ev.clientY - d.oy }, b, vp, ins2);
        const s = snap(at, b, vp, ins2);
        haptic(6);
        saveDetached({ anchor: s.anchor, size: d.size });
      };
      const cancel = (ev: PointerEvent) => {
        if (ev.pointerId !== d.id) return;
        stop();
        if (d.moved) {
          useDock.setState({ dragging: false });
          setLive(null);
        }
      };
      endListeners.current = () => {
        stop();
        if (d.moved) useDock.setState({ dragging: false });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    },
    [eat, live?.size, saveDetached, size],
  );
  useEffect(() => {
    useDock.setState({ grip: (e) => startDrag(e) });
    return () => useDock.setState({ grip: null });
  }, [startDrag]);

  /* ——— pinch (two fingers on the card or the gramophone) ——— */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; s0: number; cx: number; cy: number } | null>(null);
  const trackTouch = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== "touch") return;
    const k = ctx.current;
    if (k.place !== "float" && k.place !== "disc") return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 2) {
      // two fingers: no drag, no control
      endListeners.current();
      if (press.current) press.current.off = true;
      const [a, b] = [...touches.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch.current = {
        d0: Math.hypot(a.x - b.x, a.y - b.y),
        s0: live?.size ?? size,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
      useDock.setState({ dragging: true, quick: false });
    }
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!touches.current.has(e.pointerId)) return;
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const p = pinch.current;
      const k = ctx.current;
      if (!p || touches.current.size < 2 || !k.env) return;
      const [a, b] = [...touches.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const s = pinchSize(p.s0, p.d0, Math.hypot(a.x - b.x, a.y - b.y));
      const bx = boxOf(s, k.cardH);
      const at = clampPos(
        { x: p.cx - bx.w / 2, y: p.cy - bx.h / 2 },
        bx,
        { w: k.env.vw, h: k.env.vh },
        insetsNow(k.env),
      );
      setLive({ x: at.x, y: at.y, size: s });
    };
    const up = (e: PointerEvent) => {
      if (!touches.current.delete(e.pointerId)) return;
      const p = pinch.current;
      if (!p) return;
      pinch.current = null;
      touches.current.clear();
      eat();
      const k = ctx.current;
      useDock.setState({ dragging: false });
      setLive((l) => {
        if (l && k.env) {
          const s = settleSize(l.size);
          const bx = boxOf(s, k.cardH);
          const vp = { w: k.env.vw, h: k.env.vh };
          const ins2 = insetsNow(k.env);
          const sn = snap({ x: l.x ?? 0, y: l.y ?? 0 }, bx, vp, ins2);
          queueMicrotask(() => saveDetached({ anchor: sn.anchor, size: s }));
        }
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [eat, saveDetached]);

  /* ——— the card's resize handle ——— */
  const onHandleDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const s0 = size;
    const sx = e.clientX;
    const edge = anchor.edge;
    let now = s0;
    useDock.setState({ dragging: true });
    const move = (ev: PointerEvent) => {
      now = handleSize(s0, ev.clientX - sx, edge);
      setLive({ size: now });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      useDock.setState({ dragging: false });
      eat();
      setLive(null);
      saveDetached({ size: now });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const onHandleKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 60 : 20;
    const grow = anchor.edge === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = anchor.edge === "left" ? "ArrowLeft" : "ArrowRight";
    const next =
      e.key === grow
        ? size + step
        : e.key === shrink
          ? size - step
          : e.key === "Home"
            ? DISC.def
            : e.key === "End"
              ? CARD.max
              : null;
    if (next === null) return;
    e.preventDefault();
    saveDetached({ size: next < CARD.min ? DISC.def : next });
  };

  /* ——— the quick controls close on a press outside or Esc ——— */
  useEffect(() => {
    if (!quick) return;
    const out = (e: PointerEvent) => {
      if (shellRef.current?.contains(e.target as Node)) return;
      // a sheet the card opened (the room's output picker) keeps the card open beneath it
      if ((e.target as Element | null)?.closest?.('[role="dialog"]')) return;
      useDock.setState({ quick: false });
    };
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") useDock.setState({ quick: false });
    };
    document.addEventListener("pointerdown", out, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", out, true);
      document.removeEventListener("keydown", key);
    };
  }, [quick]);
  useEffect(() => {
    if (place !== "disc" && quick) useDock.setState({ quick: false });
  }, [place, quick]);

  if (!host) return null;
  const floating = place === "float" || place === "disc";
  const style: CSSProperties | undefined =
    floating && pos
      ? ({
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${box.w}px`,
          ...(place === "disc" ? { height: `${box.h}px` } : {}),
        } as CSSProperties)
      : undefined;
  const edge = anchor.edge;
  const vAlign = pos && env ? (pos.y + box.h / 2 > env.vh / 2 ? "up" : "down") : "up";

  const shell = (
    // biome-ignore lint/a11y/useSemanticElements: a display: contents shell around the bar, not a form's fieldset
    <div
      ref={shellRef}
      role="group"
      aria-label={t("dock.player")}
      className={`dock${place === "float" ? " glass" : ""}`}
      data-testid="player-dock"
      data-place={place ?? "idle"}
      data-edge={floating ? edge : undefined}
      data-open={vAlign}
      data-live={live ? "" : undefined}
      data-dragging={dragging || undefined}
      data-quick={quick || undefined}
      data-size={floating ? Math.round(size) : undefined}
      style={style}
      onPointerDownCapture={onPointerDownCapture}
      onClickCapture={onClickCapture}
      onDragStart={(e) => e.preventDefault()}
    >
      {place === "disc" && (
        <Gramophone
          size={box.w}
          night={night}
          onTap={() => {
            haptic(4);
            useDock.setState({ quick: !useDock.getState().quick });
          }}
          onQuick={() => {
            haptic(10);
            useDock.setState({ quick: !useDock.getState().quick });
          }}
          onDown={(e) => startDrag(e, { long: true })}
        />
      )}
      <div
        ref={panel}
        className={`dock-panel${place === "disc" ? " glass" : ""}`}
        hidden={place === "disc" && !quick}
        data-testid="player-panel"
      >
        {(place === "side" || place === "float" || (place === "disc" && quick)) && (
          <div
            className="dock-head"
            data-testid="player-head"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("button")) return;
              startDrag(e);
            }}
          >
            <span className="dock-head-grab" aria-hidden />
            <span className="dock-head-label">{t(night ? "dock.tonight" : "dock.listening")}</span>
            {place === "side" ? (
              <>
                <HeadBtn label={t("dock.float_card")} testId="player-float" onClick={floatCard}>
                  <PictureInPicture2 size={16} strokeWidth={2} aria-hidden />
                </HeadBtn>
                <HeadBtn label={t("dock.to_gramophone")} testId="player-shrink" onClick={toDisc}>
                  <Disc3 size={16} strokeWidth={2} aria-hidden />
                </HeadBtn>
              </>
            ) : (
              <>
                {place === "float" ? (
                  <HeadBtn label={t("dock.to_gramophone")} testId="player-shrink" onClick={toDisc}>
                    <Disc3 size={16} strokeWidth={2} aria-hidden />
                  </HeadBtn>
                ) : (
                  <HeadBtn label={t("dock.expand")} testId="player-expand" onClick={floatCard}>
                    <Maximize2 size={16} strokeWidth={2} aria-hidden />
                  </HeadBtn>
                )}
                {(saved.detached || place === "float") && (
                  <HeadBtn
                    label={env?.wide ? t("dock.to_sidebar") : t("dock.to_bar")}
                    testId="player-dock-btn"
                    onClick={dock}
                  >
                    {env?.wide ? (
                      <PanelLeftOpen size={16} strokeWidth={2} aria-hidden />
                    ) : (
                      <ArrowDownToLine size={16} strokeWidth={2} aria-hidden />
                    )}
                  </HeadBtn>
                )}
                {place === "disc" && (
                  <HeadBtn
                    label={t("dock.close_quick")}
                    testId="player-quick-close"
                    onClick={() => useDock.setState({ quick: false })}
                  >
                    <X size={16} strokeWidth={2} aria-hidden />
                  </HeadBtn>
                )}
              </>
            )}
          </div>
        )}
        <div className="dock-body">
          <BoothMini />
          <MiniPlayerCard />
        </div>
        {place === "float" && (
          <button
            type="button"
            className="dock-resize"
            data-testid="player-resize"
            aria-label={t("dock.resize")}
            onPointerDown={onHandleDown}
            onKeyDown={onHandleKey}
          >
            <span aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
  return createPortal(shell, place === "side" && slot ? slot : host);
}

function HeadBtn({
  label,
  testId,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="dock-head-btn"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * The gramophone: a record whose label is the playing side's cover, its grooves catching the light, a tone arm on
 * its edge, and around it the ring of the song (what has played filled, what is left still to come). It turns while
 * the sound plays — never while paused, with Reduce Motion or with Battery saver.
 */
function Gramophone({
  size,
  night,
  onTap,
  onQuick,
  onDown,
}: {
  size: number;
  night: boolean;
  onTap: () => void;
  onQuick: () => void;
  onDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const path = usePathname();
  const snap = useBoothSnapshot(path);
  const track = usePlayer((s) => s.track);
  const playingPreview = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const queue = usePlayer((s) => s.queue);
  const list = usePlayer((s) => s.list);
  const previewEntity = usePlayingEntity();
  const reduced = useReducedMotion();
  const saving = useSaving();
  let title = track?.title ?? "";
  let orchestra = track?.orchestra ?? "";
  let entity = previewEntity;
  let pos = position;
  let len = stopAt(track, queue, list?.clipSec) ?? (duration || 30);
  let playing = playingPreview;
  if (night && snap?.plan) {
    const it = snap.plan.items[snap.planIndex];
    entity = snap.entities[snap.planIndex] ?? null;
    title = it?.title ?? "";
    orchestra = (entity as { orchestra?: string } | null)?.orchestra ?? it?.artist ?? "";
    len = boothEngine()?.currentLength() ?? it?.lengthSec ?? 0;
    pos = Math.max(0, Math.min(len, snap.position));
    playing = snap.state === "playing" || snap.state === "cortina";
  }
  const r = ring(pos, len, RING_R);
  const spin = playing && !reduced && !saving;
  const label = Math.max(24, Math.round(size * 0.42));
  return (
    <button
      type="button"
      className="dock-disc"
      data-testid="player-gramophone"
      data-playing={playing || undefined}
      data-spin={spin || undefined}
      aria-label={t("dock.gramophone_label", { title, left: clock(r.remaining) })}
      aria-description={t(night ? "dock.gramophone_hint" : "dock.gramophone_hint_preview")}
      onPointerDown={onDown}
      onClick={onTap}
      onContextMenu={(e) => {
        e.preventDefault();
        onQuick();
      }}
      onKeyDown={(e) => {
        if ((e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) && !e.repeat) {
          e.preventDefault();
          onQuick();
        }
      }}
    >
      <svg className="dock-ring" viewBox="0 0 100 100" aria-hidden>
        <circle className="dock-ring-track" cx="50" cy="50" r={RING_R} />
        <circle
          className="dock-ring-fill"
          cx="50"
          cy="50"
          r={RING_R}
          strokeDasharray={r.circumference}
          strokeDashoffset={r.offset}
          data-testid="player-ring"
          data-frac={r.frac.toFixed(4)}
          data-left={Math.round(r.remaining)}
        />
      </svg>
      <span className="dock-record" data-testid="player-record">
        <span className="dock-label" style={{ width: label, height: label }}>
          <Artwork entity={entity} orchestra={orchestra} size={label} />
        </span>
        <span className="dock-spindle" aria-hidden />
      </span>
      <span className="dock-arm" aria-hidden />
    </button>
  );
}
