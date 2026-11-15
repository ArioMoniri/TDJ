import { checkEditRoute } from "@/lib/api/engine";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/engine.ts (shared with the macOS and iPadOS apps, which run it on the device). */
export const dynamic = "force-dynamic";
export const POST = onServer(checkEditRoute);
