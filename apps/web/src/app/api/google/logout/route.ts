import { GOOGLE, logoutResponse } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** Forgets the sealed cookie. Google keeps the grant until myaccount.google.com/permissions removes it. */
export async function POST() {
  return logoutResponse(GOOGLE);
}
