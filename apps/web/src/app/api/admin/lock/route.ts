import { clearAdminCookie } from "@/lib/server/admin";
import { crossOriginResponse, jsonNoStore } from "@/lib/server/guard";
export const dynamic = "force-dynamic";

/** Forgets the owner session cookie. */
export async function POST(req: Request) {
  const cross = await crossOriginResponse(req);
  if (cross) return cross;
  const res = jsonNoStore({ ok: true });
  res.headers.append("set-cookie", clearAdminCookie());
  return res;
}
