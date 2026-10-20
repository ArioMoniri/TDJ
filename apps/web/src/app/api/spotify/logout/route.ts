import { logoutResponse, SPOTIFY } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** Forgets the sealed session cookie. Spotify itself keeps the grant: spotify.com/account/apps removes it. */
export async function POST(req: Request) {
  return logoutResponse(SPOTIFY, req);
}
