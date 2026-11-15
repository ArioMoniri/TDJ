import { nightCoverSvg } from "@/lib/cover";
import { getShortNight, isShortId } from "@/lib/server/rooms";
export const dynamic = "force-dynamic";

/** the generic brand image (public/og-night.png): no night, an expired link, or no rasteriser on this server */
const generic = (req: Request) =>
  new Response(null, {
    status: 302,
    headers: {
      location: new URL("/og-night.png", req.url).toString(),
      "cache-control": "public, max-age=300",
    },
  });

/**
 * Wave 4 — the Open Graph image of a short night link (`/night?s=<id>`, see app/night/page.tsx): the night's own
 * 1200 × 630 cover, drawn from the night this server keeps and rasterised with resvg (no fonts needed: the cover's
 * words are outlines). A fragment-only link never reaches here (the server cannot see the night), and anything
 * that fails falls back to the generic brand image.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("s");
  if (!isShortId(id)) return generic(req);
  const night = await getShortNight(id).catch(() => null);
  if (!night) return generic(req);
  try {
    const { Resvg } = await import("@resvg/resvg-js");
    const svg = nightCoverSvg(night, { size: "og", theme: "light", locale: "en" });
    const png = new Resvg(svg).render().asPng();
    return new Response(new Uint8Array(png), {
      headers: {
        "content-type": "image/png",
        // a short link's night never changes: cache for a day
        "cache-control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return generic(req);
  }
}
