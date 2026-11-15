import { spotifyPlaylist } from "@/lib/api/spotify";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/spotify.ts (shared with the macOS and iPadOS apps, which run it on the device). */
export const dynamic = "force-dynamic";
export const POST = onServer(spotifyPlaylist);
