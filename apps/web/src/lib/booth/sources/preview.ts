"use client";
import type { AppOverrides } from "@/lib/types";
import { type Clip, type ClipVerdict, rehearsalClip } from "../clips";
import { PREVIEW_CAP_SEC } from "../engine";
import { measureBuffer } from "../measure";
import type { BoothRow } from "../plan";
import type { PlanEntity, PreparedItem, SourceAdapter } from "./types";

/** The previews are capped at 30 s: the rehearsal length of every item. */
export const REHEARSAL_SEC = PREVIEW_CAP_SEC;

interface DecodeCtx {
  decodeAudioData(b: ArrayBuffer): Promise<AudioBuffer>;
}

/**
 * 30 s rehearsal (round7-booth.md §8.3, round18-booth.md): every clip is the side's checked Spotify recording —
 * Spotify's own preview of that track, or a Deezer clip only when it is the same recording (`rehearsalClip`); an
 * item without one is "not rehearsable" rather than rehearsed from another transfer or take. A Deezer clip goes
 * through `/api/preview?…&json=1` (the provider's current signed link; they expire daily); a Spotify preview is
 * fetched as stored. The clip is decoded and measured; items are capped at 30 s and every badge says "30 s rehearsal".
 */
export class PreviewAdapter implements SourceAdapter {
  readonly kind = "preview" as const;
  private cache = new Map<string, Promise<PreparedItem>>();
  constructor(
    private ctx: () => DecodeCtx | null,
    private overrides: () => AppOverrides | null | undefined,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  /** the clip for this item, or why there is none (the DJ's own Deezer pick in "Find on services" counts) */
  verdict(entity: PlanEntity): ClipVerdict {
    if (!entity) return rehearsalClip(null);
    const e = entity as { id?: string };
    const patch = e.id ? this.overrides()?.songs?.[e.id] : undefined;
    return rehearsalClip(entity, patch?.resolved === undefined ? undefined : patch.resolved);
  }
  private clipOf(entity: PlanEntity): Clip | null {
    return this.verdict(entity).clip;
  }

  async available() {
    return { ok: true };
  }

  async resolve(_item: BoothRow, entity: PlanEntity) {
    return this.clipOf(entity) ? ("ready" as const) : ("missing" as const);
  }

  prepare(item: BoothRow, entity: PlanEntity): Promise<PreparedItem> {
    const key = item.id ?? String(item.n);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const p = this.load(entity).catch((e) => {
      this.cache.delete(key);
      throw e;
    });
    this.cache.set(key, p);
    return p;
  }

  private async load(entity: PlanEntity): Promise<PreparedItem> {
    const clip = this.clipOf(entity);
    const ctx = this.ctx();
    if (!clip || !ctx) throw new Error("No clip of the Spotify recording for this item");
    let url: string | undefined;
    if (clip.from === "spotify") url = clip.url;
    else {
      const r = clip.resolved;
      const ep = `/api/preview?provider=${encodeURIComponent(r.provider)}&id=${encodeURIComponent(r.id)}&json=1`;
      const j = await this.fetchImpl(ep)
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      url = j?.url;
    }
    if (!url) throw new Error("No preview available right now");
    const res = await this.fetchImpl(url, { mode: "cors" });
    if (!res.ok) throw new Error(`Preview request failed (${res.status})`);
    const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
    const measured = await measureBuffer(buffer);
    return {
      kind: "preview",
      buffer,
      measured,
      durationSec: Math.min(REHEARSAL_SEC, buffer.duration),
      note: "30 s rehearsal",
    };
  }

  release(itemId: string) {
    this.cache.delete(itemId);
  }
}
