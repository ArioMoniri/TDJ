import { search } from "@/lib/api/engine";
import { searchQuery } from "@/lib/api/search";
import { onServer } from "@/lib/server/deps";

/**
 * Handlers: lib/api/engine.ts (GET: a plain list of songs) and lib/api/search.ts (POST: the shared search with
 * filters, facets, highlights and pages); both are shared with the macOS and iPadOS apps, which run them on the device.
 */
export const dynamic = "force-dynamic";
export const GET = onServer(search);
export const POST = onServer(searchQuery);
