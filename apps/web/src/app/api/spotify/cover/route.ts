import { spotifyCover } from "@/lib/api/spotifyCover";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/spotifyCover.ts (wave 4, the playlist cover; the apps run it on the device). */
export const dynamic = "force-dynamic";
export const POST = onServer(spotifyCover);
