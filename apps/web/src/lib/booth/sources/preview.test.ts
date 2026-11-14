import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Playlist, planBooth } from "@tdj/core";
import { describe, expect, it, vi } from "vitest";
import { decorate, planEntities } from "../plan";
import { PreviewAdapter } from "./preview";

const featured = JSON.parse(
  readFileSync(join(__dirname, "../../../../public/featured/golden-double-peak.json"), "utf8"),
) as Playlist;

describe("preview clips: an expired signed link is fetched again once", () => {
  it("a 403 on the Deezer link asks /api/preview for a fresh one and decodes that", async () => {
    const plan = decorate(featured, planBooth(featured));
    const ents = planEntities(featured, plan);
    const probe = new PreviewAdapter(
      () => null,
      () => null,
    );
    const i = plan.items.findIndex((_, k) => probe.verdict(ents[k]!).clip?.from === "deezer");
    expect(i).toBeGreaterThanOrEqual(0);
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (u: string) => {
      calls.push(u);
      if (u.startsWith("/api/preview") && u.includes("fresh=1"))
        return Response.json({ url: "https://dz/fresh.mp3" });
      if (u.startsWith("/api/preview")) return Response.json({ url: "https://dz/stale.mp3" });
      if (u === "https://dz/stale.mp3") return new Response(null, { status: 403 });
      return new Response(new ArrayBuffer(8), { status: 200 });
    }) as unknown as typeof fetch;
    const decode = vi.fn(async () => {
      throw new Error("decoded");
    });
    const a = new PreviewAdapter(
      () => ({ decodeAudioData: decode }) as never,
      () => null,
      fetchImpl,
    );
    await expect(a.prepare(plan.items[i]!, ents[i]!)).rejects.toThrow("decoded");
    expect(calls.some((u) => u.includes("fresh=1"))).toBe(true);
    expect(calls).toContain("https://dz/fresh.mp3");
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("a second 403 is reported, never retried in a loop", async () => {
    const plan = decorate(featured, planBooth(featured));
    const ents = planEntities(featured, plan);
    const probe = new PreviewAdapter(
      () => null,
      () => null,
    );
    const i = plan.items.findIndex((_, k) => probe.verdict(ents[k]!).clip?.from === "deezer");
    let previews = 0;
    const fetchImpl = vi.fn(async (u: string) => {
      if (u.startsWith("/api/preview")) {
        previews++;
        return Response.json({ url: "https://dz/stale.mp3" });
      }
      return new Response(null, { status: 403 });
    }) as unknown as typeof fetch;
    const a = new PreviewAdapter(
      () => ({ decodeAudioData: vi.fn() }) as never,
      () => null,
      fetchImpl,
    );
    await expect(a.prepare(plan.items[i]!, ents[i]!)).rejects.toThrow("Preview request failed (403)");
    expect(previews).toBe(2);
  });
});
