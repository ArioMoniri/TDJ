import { dna } from "@/lib/api/dna";
import { onServer } from "@/lib/server/deps";

/** Handler: lib/api/dna.ts (shared with the macOS and iPadOS apps, which run it on the device). */
export const dynamic = "force-dynamic";
export const GET = onServer(dna);
