import { GOOGLE, GOOGLE_SCOPE, loginRedirect } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/**
 * "Connect with Google". Scopes are incremental: `?scope=drive` (exporting a file) or `?scope=youtube` (creating a
 * playlist) adds that feature to what the account already granted (`include_granted_scopes=true`).
 */
export async function GET(req: Request) {
  const want = new URL(req.url).searchParams.get("scope") ?? "";
  const scopes = want
    .split(/[\s,]+/)
    .filter((f): f is keyof typeof GOOGLE_SCOPE => Object.hasOwn(GOOGLE_SCOPE, f))
    .map((f) => GOOGLE_SCOPE[f]);
  return loginRedirect(GOOGLE, req, { scopes });
}
