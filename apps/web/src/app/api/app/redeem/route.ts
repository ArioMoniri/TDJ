import { redeemResponse } from "@/lib/server/oauth";
export const dynamic = "force-dynamic";

/** The apps' sign-in hand-off: a 60 s ticket from the callback → the sealed session cookie (lib/server/appTicket.ts). */
export async function GET(req: Request) {
  return redeemResponse(req);
}
