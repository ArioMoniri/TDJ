import { loginRedirect, SPOTIFY } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** Hosted "Log in with Spotify": sends the browser to Spotify with a state cookie; the callback finishes it. */
export async function GET(req: Request) {
  return loginRedirect(SPOTIFY, req);
}
