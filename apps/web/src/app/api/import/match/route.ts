import { importMatch } from "@/lib/api/importMatch";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/importMatch.ts (shared with the macOS and iPadOS apps, which run it on the device). */
export const dynamic = "force-dynamic";
export const POST = onServer(importMatch);
