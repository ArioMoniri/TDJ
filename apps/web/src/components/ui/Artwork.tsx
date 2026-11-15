"use client";
import "./compose-db.css";
import "./indicators.css";
import type { Cortina, Song } from "@tdj/core";
import { memo, useEffect, useState } from "react";
import { artworkCache, coverFor, loadArtwork, orchestraPlaceholder, placeholderFor } from "@/lib/artwork";
import { useIndicators } from "@/lib/booth/indicatorPrefs";

type Entity = Song | Cortina | null | undefined;

/** an image that falls back to the placeholder when it fails to load */
function Cover({ src, onFail }: { src: string; onFail: () => void }) {
  // biome-ignore lint/performance/noImgElement: provider artwork (Deezer, Spotify, the DJ's sources), sized by CSS
  return <img src={src} alt="" loading="lazy" decoding="async" onError={onFail} />;
}

/**
 * Round 22 — artwork on every song, one component in two looks:
 * - a tile (Compose, Database, search): `src` is the cached cover (the DJ's, their sources', the shipped Deezer
 *   match); the orchestra's colour and initials when there is none or the image fails;
 * - the Booth's cover: `entity` is the side or cortina; its catalogue cover, else a Spotify cover looked up once and
 *   kept on this device, else the orchestra's hue and surname initials. Nothing when the DJ turned artwork off.
 */
export const Artwork = memo(function Artwork(
  props:
    | {
        src?: string | null;
        orchestra: string;
        orchestraId?: string;
        size?: "s" | "m" | "l";
        className?: string;
      }
    | { entity: Entity; orchestra: string; size?: number; className?: string },
) {
  const booth = "entity" in props;
  const entity = booth ? props.entity : undefined;
  const on = useIndicators().artwork;
  const [boothUrl, setBoothUrl] = useState<string | null>(() => (booth ? coverFor(entity) : null));
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!booth || !on) return;
    setFailed(null);
    const hit = coverFor(entity, artworkCache());
    setBoothUrl(hit);
    if (hit) return;
    let live = true;
    void loadArtwork(entity).then((u) => live && u && setBoothUrl(u));
    return () => {
      live = false;
    };
  }, [booth, entity, on]);

  if (booth) {
    if (!on) return null;
    const { orchestra, size = 40, className = "" } = props;
    const show = boothUrl && failed !== boothUrl;
    const ph = placeholderFor(orchestra);
    return (
      <span
        className={`booth-art ${className}`}
        style={{ ["--art" as string]: `${size}px` }}
        data-testid="booth-art"
        data-art={show ? "cover" : "placeholder"}
        aria-hidden
      >
        {show ? (
          <Cover src={boothUrl} onFail={() => setFailed(boothUrl)} />
        ) : (
          <span className="booth-art-ph" style={{ ["--hue" as string]: ph.hue }}>
            {ph.initials}
          </span>
        )}
      </span>
    );
  }
  const { src, orchestra, orchestraId, size = "m", className = "" } = props;
  const ph = orchestraPlaceholder(orchestraId ?? orchestra, orchestra);
  const show = src && failed !== src;
  return (
    <span
      className={`art ${className}`}
      data-size={size}
      data-testid="artwork"
      data-placeholder={show ? undefined : "true"}
      style={show ? undefined : { background: `linear-gradient(150deg, ${ph.from}, ${ph.to})` }}
      aria-hidden
    >
      {show ? <Cover src={src} onFail={() => setFailed(src)} /> : ph.initials}
    </span>
  );
});
