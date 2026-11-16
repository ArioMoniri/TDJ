import { searchSnapshot } from "@/lib/api/searchSnapshot";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/searchSnapshot.ts (the browser's search worker builds its index from it). */
export const dynamic = "force-dynamic";
export const GET = onServer(searchSnapshot);
