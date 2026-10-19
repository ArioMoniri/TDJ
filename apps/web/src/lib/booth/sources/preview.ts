"use client";
import type { Song } from "@tdj/core";
import type { AppOverrides } from "@/lib/types";
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
 * Deezer 30 s rehearsal (round7-booth.md §8.3): `/api/preview?…&json=1` hands over the provider's current signed
 * link (they expire daily), the clip is fetched cross-origin, decoded and measured. Items are capped at 30 s and
 * every badge says "30 s rehearsal".
 */
export class PreviewAdapter implements SourceAdapter {
  readonly kind = "preview" as const;
  private cache = new Map<string, Promise<PreparedItem>>();
  constructor(
    private ctx: () => DecodeCtx | null,
    private overrides: () => AppOverrides | null | undefined,
    private fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  private resolvedOf(entity: PlanEntity): Song["resolved"] | null {
    if (!entity || !("rhythm" in entity)) return null;
    const patch = this.overrides()?.songs?.[entity.id];
    const r = patch?.resolved ?? entity.resolved ?? null;
    return r?.previewUrl ? r : null;
  }

  async available() {
    return { ok: true };
  }

  async resolve(_item: BoothRow, entity: PlanEntity) {
    return this.resolvedOf(entity) ? ("ready" as const) : ("missing" as const);
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
    const r = this.resolvedOf(entity);
    const ctx = this.ctx();
    if (!r || !ctx) throw new Error("No preview for this item");
    const ep = `/api/preview?provider=${encodeURIComponent(r.provider)}&id=${encodeURIComponent(r.id)}&json=1`;
    const j = await this.fetchImpl(ep)
      .then((x) => (x.ok ? x.json() : null))
      .catch(() => null);
    const url: string | undefined = j?.url;
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
