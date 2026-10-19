import { callbackRedirect, SPOTIFY } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** Code exchange on the server; the tokens go into a sealed httpOnly cookie, never to the browser or a database. */
export async function GET(req: Request) {
  return callbackRedirect(SPOTIFY, req);
}
