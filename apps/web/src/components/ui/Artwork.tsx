"use client";
import "./compose-db.css";
import "./indicators.css";
import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  type ArtCandidate,
  artworkCache,
  artworkSources,
  type Entity,
  forgetCover,
  liveQuery,
  loadShippedCovers,
  lookupCover,
  orchestraPlaceholder,
  pickCover,
  placeholderFor,
  placeholderStops,
  shippedCovers,
  subscribeShipped,
} from "@/lib/artwork";
import { useIndicators } from "@/lib/booth/indicatorPrefs";

/* one IntersectionObserver for every tile: a live lookup starts only once its row is (nearly) on screen */
const watchers = new Map<Element, () => void>();
let observer: IntersectionObserver | null = null;
function whenVisible(el: Element, cb: () => void): () => void {
  if (typeof IntersectionObserver === "undefined") {
    cb();
    return () => {};
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const go = watchers.get(en.target);
        watchers.delete(en.target);
        observer?.unobserve(en.target);
        go?.();
      }
    },
    { rootMargin: "200px" },
  );
  watchers.set(el, cb);
  observer.observe(el);
  return () => {
    watchers.delete(el);
    observer?.unobserve(el);
  };
}

const useShipped = (on: boolean) => {
  const map = useSyncExternalStore(subscribeShipped, shippedCovers, () => null);
  useEffect(() => {
    if (on && !map) void loadShippedCovers();
  }, [on, map]);
  return map;
};

/**
 * The cover for a side: the resolver's sources in order (lib/artwork.ts → artworkSources), each image falling to the
 * next when it fails, then a live lookup once the tile is on screen, then the placeholder.
 */
function useCover(src: string | null | undefined, entity: Entity, on: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const shipped = useShipped(on);
  const id = (entity as { id?: string } | null | undefined)?.id;
  const [live, setLive] = useState<string | null>(null);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  // a different side in the same slot starts over
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on the side's identity only
  useEffect(() => {
    setFailed(new Set());
    setLive(null);
  }, [id, src]);
  const list = useMemo<ArtCandidate[]>(() => {
    if (!on) return [];
    const device = id ? artworkCache() : null;
    const l = artworkSources({ src, entity, shipped, device });
    if (live && !l.some((c) => c.url === live)) l.push({ url: live, from: "live" });
    return l;
  }, [on, src, entity, shipped, id, live]);
  const cover = pickCover(list, failed);
  const canLookup = on && !cover && shipped !== null && !!liveQuery(entity);
  useEffect(() => {
    const el = ref.current;
    if (!canLookup || !el) return;
    let alive = true;
    const stop = whenVisible(el, () => {
      void lookupCover(entity).then((u) => {
        if (alive && u) setLive(u);
      });
    });
    return () => {
      alive = false;
      stop();
    };
  }, [canLookup, entity]);
  const fail = (c: ArtCandidate) => {
    if (c.from === "live" && id) forgetCover(id, c.url);
    setFailed((f) => new Set(f).add(c.url));
  };
  return { ref, cover, fail };
}

/** an image that hands over to the next source when it fails to load */
function Cover({ c, onFail }: { c: ArtCandidate; onFail: (c: ArtCandidate) => void }) {
  return (
    // biome-ignore lint/performance/noImgElement: provider artwork (Deezer, Spotify, the DJ's sources), sized by CSS
    <img
      key={c.url}
      src={c.url}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      data-source={c.from}
      onError={() => onFail(c)}
    />
  );
}

const phText = {
  color: "#fff",
  lineHeight: 1,
  textShadow: "0 1px 1px rgb(0 0 0 / 0.25)",
  whiteSpace: "nowrap",
} as const;

type TileProps = {
  src?: string | null;
  orchestra: string;
  orchestraId?: string;
  /** the side itself (its id, Spotify recording, Deezer match): lets the tile find a cover when `src` has none */
  song?: Entity;
  size?: "s" | "m" | "l";
  className?: string;
};
type BoothProps = { entity: Entity; orchestra: string; size?: number; className?: string };

/**
 * Round 22 — artwork on every song, one component in two looks and one resolver (lib/artwork.ts):
 * - a tile (Compose, Database, Library, search): `src` is the DJ's or their sources' cover, `song` the side;
 * - the Booth's cover: `entity` is the side or cortina.
 * Both try (a) the DJ's own / sources' cover, (b) the shipped Deezer match, (c) the shipped Spotify cover, (d) a live
 * lookup through /api/artwork (no Spotify login; kept on this device), (e) the orchestra's hue and initials. With
 * artwork off, the Booth shows nothing and a tile only its placeholder (no images, no lookups).
 */
export const Artwork = memo(function Artwork(props: TileProps | BoothProps) {
  const booth = "entity" in props;
  const on = useIndicators().artwork;
  const entity = booth ? props.entity : props.song;
  const src = booth ? undefined : props.src;
  const { ref, cover, fail } = useCover(src, entity, on);

  if (booth) {
    if (!on) return null;
    const { orchestra, size = 40, className = "" } = props;
    const ph = placeholderFor(orchestra);
    const stops = placeholderStops(ph.hue);
    return (
      <span
        ref={ref}
        className={`booth-art ${className}`}
        style={{ ["--art" as string]: `${size}px` }}
        data-testid="booth-art"
        data-art={cover ? "cover" : "placeholder"}
        aria-hidden
      >
        {cover ? (
          <Cover c={cover} onFail={fail} />
        ) : (
          <span
            className="booth-art-ph"
            style={{
              ["--hue" as string]: ph.hue,
              ...phText,
              fontSize: `${Math.max(9, Math.round(size * 0.36))}px`,
              background: `linear-gradient(135deg, ${stops.from}, ${stops.to})`,
            }}
          >
            {ph.initials}
          </span>
        )}
      </span>
    );
  }
  const { orchestra, orchestraId, size = "m", className = "" } = props;
  const ph = orchestraPlaceholder(orchestraId ?? orchestra, orchestra);
  return (
    <span
      ref={ref}
      className={`art ${className}`}
      data-size={size}
      data-testid="artwork"
      data-art={cover ? "cover" : "placeholder"}
      data-placeholder={cover ? undefined : "true"}
      style={cover ? undefined : { ...phText, background: `linear-gradient(150deg, ${ph.from}, ${ph.to})` }}
      aria-hidden
    >
      {cover ? <Cover c={cover} onFail={fail} /> : ph.initials}
    </span>
  );
});
