import { serviceSearch } from "@/lib/api/serviceSearch";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/serviceSearch.ts (shared with the macOS and iPadOS apps, which run it on the device). */
export const dynamic = "force-dynamic";
export const POST = onServer(serviceSearch);
