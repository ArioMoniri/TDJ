import { tandaSet } from "@/lib/api/tandaSet";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/tandaSet.ts (shared with the macOS and iPadOS apps, which run it on the device). */
export const dynamic = "force-dynamic";
export const POST = onServer(tandaSet);
