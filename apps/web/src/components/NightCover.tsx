"use client";
import { type ReactNode, useEffect, useState } from "react";
import type { CoverTheme } from "@/lib/cover";
import { coverSeedFor } from "@/lib/cover/entrySeed";
import { useMediaQuery } from "@/lib/hooks";
import { getLocale } from "@/lib/i18n";
import { useStore } from "@/lib/store";

type CoverModule = typeof import("@/lib/cover");
let mod: Promise<CoverModule> | null = null;
/** the outlines (lib/cover/glyphs.ts) load with the first cover on screen, not with the page */
const load = () => {
  mod ??= import("@/lib/cover");
  return mod;
};
/** the drawn covers by night hash, size, theme and language: a History list draws each night once */
const cache = new Map<string, string>();

/** the app's theme as it shows: the Settings choice, Auto following the system */
export function useCoverTheme(): CoverTheme {
  const setting = useStore((s) => s.settings.theme);
  const systemDark = useMediaQuery("(prefers-color-scheme: dark)");
  return setting === "auto" ? (systemDark ? "dark" : "light") : setting;
}

/**
 * Wave 4 — a night's generated cover as an image (lib/cover): History thumbnails (56 px, light or dark with the
 * app) and the Share sheet's preview. The SVG goes in as a data URL, so it stays sharp at any pixel ratio and needs
 * no canvas; the same night always draws the same cover, cached by its hash.
 */
export function NightCover({
  night,
  coverSeed,
  size,
  display = size,
  badge,
  className = "",
  testId,
  alt = "",
}: {
  /** a Playlist or a NightFile */
  night: unknown;
  /** the History entry's cover family (lib/cover/seed.ts); found from the store when absent */
  coverSeed?: string;
  /** the cover's own size: under 160 it is a thumbnail without words */
  size: number;
  /** the size on screen, in px */
  display?: number;
  badge?: ReactNode;
  className?: string;
  testId?: string;
  /** empty when the row beside it already names the night */
  alt?: string;
}) {
  const theme = useCoverTheme();
  const locale = getLocale();
  const [src, setSrc] = useState<{ key: string; url: string } | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then((m) => {
      // one cover per generation: the entry's seed (History), else the seed of the entry holding this night
      const n =
        night && typeof night === "object"
          ? { ...night, coverSeed: coverSeed ?? coverSeedFor(night) }
          : night;
      const key = m.coverKey(n, { size, theme, locale });
      let url = cache.get(key);
      if (!url) {
        url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(m.nightCoverSvg(n, { size, theme, locale }))}`;
        cache.set(key, url);
      }
      if (alive) setSrc({ key, url });
    });
    return () => {
      alive = false;
    };
  }, [night, coverSeed, size, theme, locale]);
  return (
    <span
      className={`night-cover relative block flex-none overflow-hidden ${className}`}
      style={{ width: display, height: display }}
      data-theme-cover={theme}
      data-testid={testId}
      data-cover={src?.key.split(":")[0]}
    >
      {src ? (
        // biome-ignore lint/performance/noImgElement: a generated SVG data URL; next/image would add nothing
        <img src={src.url} alt={alt} width={display} height={display} draggable={false} />
      ) : null}
      {badge}
    </span>
  );
}
