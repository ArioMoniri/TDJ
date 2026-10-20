import { DROPBOX, logoutResponse } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** Forgets the sealed cookie. Dropbox keeps the grant until dropbox.com/account/connected_apps removes it. */
export async function POST(req: Request) {
  return logoutResponse(DROPBOX, req);
}
