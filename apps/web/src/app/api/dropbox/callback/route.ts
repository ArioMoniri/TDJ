import { callbackRedirect, DROPBOX } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** Server-side exchange with the code verifier; tokens sealed into the `tdj_db` cookie. */
export async function GET(req: Request) {
  return callbackRedirect(DROPBOX, req);
}
