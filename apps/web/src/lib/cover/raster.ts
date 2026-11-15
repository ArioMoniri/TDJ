/**
 * Wave 4 — the cover SVG as pixels, in the browser and the apps' web views: drawn to an OffscreenCanvas (a canvas
 * where there is none) and exported as JPEG. The size cap logic is pure so vitest checks it without a canvas.
 */

/** Spotify takes a cover of at most 256 KB, counted on the base64 body it receives */
export const SPOTIFY_COVER_MAX = 256 * 1024;
/** qualities tried in turn until the JPEG fits */
export const QUALITIES = [0.92, 0.86, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4, 0.32] as const;

export const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;

/**
 * The first encoding under `maxB64` base64 bytes, trying the qualities from the best down; null when even the lowest
 * is too big (the caller skips the cover, never the export).
 */
export async function fitJpeg<T extends { size: number }>(
  encode: (quality: number) => Promise<T>,
  maxB64 = SPOTIFY_COVER_MAX,
  qualities: readonly number[] = QUALITIES,
): Promise<{ blob: T; quality: number } | null> {
  for (const q of qualities) {
    const blob = await encode(q);
    if (base64Length(blob.size) <= maxB64) return { blob, quality: q };
  }
  return null;
}

async function svgImage(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // the decoded image keeps its pixels; the URL is not needed once decode() resolved
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** an encoder for one SVG at w × h: call it with a JPEG quality (or with type "image/png") */
export async function svgEncoder(svg: string, w: number, h: number) {
  const img = await svgImage(svg);
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext("2d");
    if (g) {
      g.drawImage(img, 0, 0, w, h);
      return (quality: number, type = "image/jpeg") => c.convertToBlob({ type, quality });
    }
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")?.drawImage(img, 0, 0, w, h);
  return (quality: number, type = "image/jpeg") =>
    new Promise<Blob>((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error("canvas export failed"))), type, quality),
    );
}

/** the cover as a JPEG whose base64 fits `maxB64` (Spotify's cap by default), or null */
export async function coverJpeg(svg: string, w = 640, h = 640, maxB64 = SPOTIFY_COVER_MAX) {
  const enc = await svgEncoder(svg, w, h);
  return fitJpeg((q) => enc(q), maxB64);
}

/** a Blob's bytes as base64 (no data: prefix) */
export async function blobBase64(b: Blob): Promise<string> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
