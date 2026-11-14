"use client";
import "./compose-db.css";
import { memo, useState } from "react";
import { orchestraPlaceholder } from "@/lib/artwork";

/**
 * Round 22 — artwork on every song: the cached cover (the DJ's, their sources', the shipped Deezer match), or the
 * orchestra's own placeholder (its colour and initials) when there is none or the image fails to load.
 */
export const Artwork = memo(function Artwork({
  src,
  orchestra,
  orchestraId,
  size = "m",
  className = "",
}: {
  src?: string | null;
  orchestra: string;
  orchestraId?: string;
  size?: "s" | "m" | "l";
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
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
      {show ? (
        // biome-ignore lint/performance/noImgElement: provider artwork, cached by the browser, unoptimised by design
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} />
      ) : (
        ph.initials
      )}
    </span>
  );
});
