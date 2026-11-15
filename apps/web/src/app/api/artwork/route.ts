import { artwork } from "@/lib/api/artwork";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/artwork.ts (shared with the macOS and iPadOS apps, which run it on the device). */
export const dynamic = "force-dynamic";
export const GET = onServer((req, d) => artwork(req, d));
