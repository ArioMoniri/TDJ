/**
 * The server routes the apps run unchanged on the device (apps/web/scripts/device-routes.mjs → DEVICE_ROUTES: the AI
 * routes, song search, add a side, build by hand, fill). Empty in the web tree, so the web build never bundles a
 * server module: the app build (apps/desktop/scripts/build-ui.mjs) writes this file over device copies of those
 * routes, whose server imports point at lib/app/server/*, and src/lib/app/routes.test.ts runs the same copies.
 * (/api/fill reads the global fetch: in the engine worker that is the app's native client.)
 */
type H = (req: Request) => Promise<Response>;
export const DEVICE_ROUTES: Record<string, Partial<Record<"GET" | "POST", H>>> = {};
