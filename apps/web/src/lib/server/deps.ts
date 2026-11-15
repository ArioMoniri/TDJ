import "server-only";
import type { ApiDeps } from "@/lib/api/deps";
import { serverCatalog } from "./catalog";
import { requestOrigin } from "./cookies";
import { dbEnabled } from "./db";
import { crossOriginResponse } from "./guard";
import { hostedEnabled, withSession } from "./spotify";

/** The server's runtime for the shared route handlers (lib/api/*): what every route did before the apps existed. */
export const serverDeps: ApiDeps = {
  ...serverCatalog,
  storage: () => (dbEnabled() ? "server" : "browser"),
  guard: crossOriginResponse,
  fetch: (url, init) => fetch(url, init),
  spotify: {
    enabled: hostedEnabled,
    session: async (req) => {
      const s = await withSession(req, await requestOrigin(req));
      if (!s) return null;
      const { access, expires, authorizedAt, scopes } = s.session;
      return { access, expires, authorizedAt, scopes, setCookie: s.setCookie };
    },
  },
};

/** A route handler of lib/api/* bound to the server's runtime. */
export const onServer =
  (h: (req: Request, d: ApiDeps) => Promise<Response>) =>
  (req: Request): Promise<Response> =>
    h(req, serverDeps);
