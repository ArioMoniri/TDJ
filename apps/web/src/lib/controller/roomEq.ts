"use client";
import { boothEngine } from "@/lib/booth/store";

/**
 * 2026-11 (docs/design/controller.md): the room EQ a controller's deck-A EQ knobs (or the virtual controller's) set —
 * a low shelf (250 Hz), a mid bell (1 kHz) and a high shelf (4 kHz) between the Booth's master and its meter, so the
 * meter, the routing and every output hear it. Flat, the filters leave the chain (master → meter, bit for bit as
 * before). Files and 30 s clips only: Spotify and YouTube play outside Web Audio (the controller says so).
 */
export type Band = "low" | "mid" | "high";
export interface EqDb {
  low: number;
  mid: number;
  high: number;
}
export const FLAT: EqDb = { low: 0, mid: 0, high: 0 };
export const isFlat = (e: EqDb) => e.low === 0 && e.mid === 0 && e.high === 0;

interface Biquad {
  type: string;
  frequency: { value: number };
  gain: { setTargetAtTime(v: number, t: number, tc: number): void; value: number };
  Q: { value: number };
  connect(n: unknown): unknown;
  disconnect(): void;
}
interface Eng {
  ctx: { currentTime: number; createBiquadFilter?(): Biquad };
  master: { connect(n: unknown): unknown; disconnect(): void };
  analyser: unknown;
}

let attached: Eng | null = null;
let nodes: Record<Band, Biquad> | null = null;
let inserted = false;

function build(e: Eng): Record<Band, Biquad> | null {
  const mk = e.ctx.createBiquadFilter?.bind(e.ctx);
  if (!mk) return null;
  const low = mk();
  low.type = "lowshelf";
  low.frequency.value = 250;
  const mid = mk();
  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = 0.7;
  const high = mk();
  high.type = "highshelf";
  high.frequency.value = 4000;
  low.connect(mid);
  mid.connect(high);
  high.connect(e.analyser);
  return { low, mid, high };
}

/** Put the room EQ on the running engine (false when there is no engine or no filters) */
export function applyRoomEq(eq: EqDb): boolean {
  const e = boothEngine() as unknown as Eng | null;
  if (!e) return false;
  if (e !== attached) {
    attached = e;
    nodes = null;
    inserted = false;
  }
  if (isFlat(eq)) {
    if (inserted) {
      e.master.disconnect();
      e.master.connect(e.analyser);
      inserted = false;
    }
    if (nodes) for (const b of ["low", "mid", "high"] as const) nodes[b].gain.value = 0;
    return true;
  }
  nodes ??= build(e);
  if (!nodes) return false;
  const t = e.ctx.currentTime;
  for (const b of ["low", "mid", "high"] as const) nodes[b].gain.setTargetAtTime(eq[b], t, 0.03);
  if (!inserted) {
    e.master.disconnect();
    e.master.connect(nodes.low);
    inserted = true;
  }
  return true;
}
