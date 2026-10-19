import { DROPBOX, loginRedirect } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** "Connect Dropbox": PKCE (S256) + `token_access_type=offline`; the verifier waits in a sealed cookie. */
export async function GET(req: Request) {
  return loginRedirect(DROPBOX, req);
}
