import { popularity } from "@/lib/api/popularity";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/popularity.ts (shared with the macOS and iPadOS apps, which run it on the device). */
export const dynamic = "force-dynamic";
export const GET = onServer(popularity);
