import { level } from "@/lib/api/level";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/level.ts (shared with the macOS and iPadOS apps, which run it on the device). */
export const dynamic = "force-dynamic";
export const GET = onServer((req, d) => level(req, d));
