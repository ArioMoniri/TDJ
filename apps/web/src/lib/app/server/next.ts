/**
 * `next/server` as the device routes use it (lib/app/deviceRoutes.ts): `NextResponse.json`, a plain Response
 * otherwise. The app build points the copied routes here (apps/web/scripts/device-routes.mjs).
 */
export class NextResponse extends Response {
  static json(body: unknown, init: ResponseInit = {}): NextResponse {
    const headers = new Headers(init.headers);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
    return new NextResponse(JSON.stringify(body), { ...init, headers });
  }
}
