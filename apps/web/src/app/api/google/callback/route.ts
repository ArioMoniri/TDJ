import { callbackRedirect, GOOGLE } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** Server-side exchange; `{ access, refresh, expires, scopes }` sealed into the `tdj_gg` cookie. */
export async function GET(req: Request) {
  return callbackRedirect(GOOGLE, req);
}
