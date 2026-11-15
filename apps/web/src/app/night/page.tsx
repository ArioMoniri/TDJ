import type { Metadata } from "next";
import { headers } from "next/headers";
import NightView from "./NightView";

/** the generic brand image: a fragment-only link (`/night#n1.…`) carries its night where the server never sees it */
const GENERIC = "/og-night.png";

/**
 * Wave 4 — a shared night's link preview. A short link (`/night?s=<id>`) names a night this server keeps, so its
 * Open Graph image is that night's own 1200 × 630 cover (/api/night/og, rendered with resvg); any other /night
 * link gets the generic brand image. In the apps (a static export, TDJ_TARGET=app) the page is the same and the
 * metadata static: nothing there is crawled.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const base: Metadata = {
    title: "Open a night",
    openGraph: { title: "A night on T-DJ", images: [{ url: GENERIC, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [GENERIC] },
  };
  if (process.env.TDJ_TARGET === "app") return base;
  const s = (await searchParams).s;
  const id = typeof s === "string" && /^[a-z2-9]{10}$/.test(s) ? s : null;
  let origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || "";
  if (!origin) {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    origin = host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  }
  const abs = (path: string) => (origin ? `${origin}${path}` : path);
  const image = id ? abs(`/api/night/og?s=${id}`) : abs(GENERIC);
  return {
    ...base,
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    openGraph: { title: "A night on T-DJ", images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default function Page() {
  return <NightView />;
}
