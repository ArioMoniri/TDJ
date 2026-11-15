import { preview } from "@/lib/api/net";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/net.ts (shared with the macOS and iPadOS apps, which run it on the device). */
export const dynamic = "force-dynamic";
export const GET = onServer(preview);
