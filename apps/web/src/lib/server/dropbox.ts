import "server-only";
import { ApiError, api, DROPBOX, safeName } from "./oauth";

/**
 * Dropbox with the deployment's own app (App Folder access): files land in /Apps/TDJ/<set name>/ and come back
 * with a shared link. PKCE + `token_access_type=offline` happen in lib/server/oauth.ts.
 */
const API = () => (process.env.DROPBOX_API_URL ?? "https://api.dropboxapi.com").replace(/\/$/, "");
const CONTENT = () =>
  (process.env.DROPBOX_CONTENT_URL ?? "https://content.dropboxapi.com").replace(/\/$/, "");
/** Dropbox RPC endpoints take a JSON body (or `null`) and always answer JSON. */
const rpc = <T>(access: string, path: string, body: unknown = null) =>
  api<T>(access, `${API()}${path}`, { method: "POST", body: JSON.stringify(body) });

export interface Profile {
  id: string;
  name: string;
  email?: string;
}
export async function profile(access: string): Promise<Profile> {
  const j = await rpc<{ account_id: string; name?: { display_name?: string }; email?: string }>(
    access,
    "/2/users/get_current_account",
  );
  return { id: j.account_id, name: j.name?.display_name || j.email || j.account_id, email: j.email };
}

async function sharedLink(access: string, path: string): Promise<string | undefined> {
  try {
    const r = await rpc<{ url?: string }>(access, "/2/sharing/create_shared_link_with_settings", { path });
    return r.url;
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 409 && /shared_link_already_exists/.test(e.body)))
      return undefined;
    const l = await rpc<{ links?: Array<{ url?: string }> }>(access, "/2/sharing/list_shared_links", {
      path,
      direct_only: true,
    }).catch(() => null);
    return l?.links?.[0]?.url;
  }
}

/** `files/upload` into /<set>/<file> of the app folder (= /Apps/TDJ/… in the user's Dropbox), then a shared link. */
export async function upload(
  access: string,
  f: { set: string; filename: string; mime: string; text: string },
): Promise<{ path: string; url?: string }> {
  const path = `/${safeName(f.set)}/${safeName(f.filename)}`;
  const r = await api<{ path_display?: string; path_lower?: string }>(access, `${CONTENT()}/2/files/upload`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "dropbox-api-arg": JSON.stringify({ path, mode: "add", autorename: true, mute: false }),
    },
    body: f.text,
  });
  const stored = r.path_display ?? path;
  return { path: `/Apps/TDJ${stored}`, url: await sharedLink(access, r.path_lower ?? stored) };
}

export { DROPBOX };
