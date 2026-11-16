import { COMMIT, VERSION } from "@/lib/release";

/**
 * The deployed version and commit (inlined at build time from the root package.json). An open tab compares it with
 * its own to say "Update available" (components/About.tsx); the release workflow checks it after a deploy.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { version: VERSION, commit: COMMIT },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
