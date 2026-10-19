import "server-only";
import { ApiError, api, GOOGLE, GOOGLE_SCOPE, type GoogleFeature, type Session, safeName } from "./oauth";

/**
 * Google with the deployment's own OAuth client: Drive uploads (`drive.file`: TDJ only ever sees files it created)
 * and YouTube playlists (`youtube`). Scopes are granted per feature; `hasScope` tells a route whether to send the
 * DJ back through /api/google/login?scope=<feature> first.
 */
const API = () => (process.env.GOOGLE_API_URL ?? "https://www.googleapis.com").replace(/\/$/, "");
const google = <T>(access: string, path: string, init: RequestInit = {}) =>
  api<T>(access, `${API()}${path}`, init);

export const hasScope = (s: Session, f: GoogleFeature) => (s.scopes ?? []).includes(GOOGLE_SCOPE[f]);
export const grantedFeatures = (s: Session): Record<GoogleFeature, boolean> => ({
  drive: hasScope(s, "drive"),
  youtube: hasScope(s, "youtube"),
});
export const featureLogin = (f: GoogleFeature, next: string) =>
  `/api/google/login?scope=${f}&next=${encodeURIComponent(next)}`;

export interface Profile {
  id: string;
  name: string;
  email?: string;
  picture?: string;
}
export async function profile(access: string): Promise<Profile> {
  const j = await google<{ sub: string; name?: string; email?: string; picture?: string }>(
    access,
    "/oauth2/v3/userinfo",
  );
  return { id: j.sub, name: j.name || j.email || j.sub, email: j.email, picture: j.picture };
}

const FOLDER = "application/vnd.google-apps.folder";
/** The "TDJ" folder in My Drive, created on first use (drive.file only lists what this app created). */
async function tdjFolder(access: string): Promise<string> {
  const q = `name = 'TDJ' and mimeType = '${FOLDER}' and trashed = false and 'root' in parents`;
  const found = await google<{ files?: Array<{ id: string }> }>(
    access,
    `/drive/v3/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`,
  );
  if (found.files?.[0]?.id) return found.files[0].id;
  const made = await google<{ id: string }>(access, "/drive/v3/files?fields=id", {
    method: "POST",
    body: JSON.stringify({ name: "TDJ", mimeType: FOLDER }),
  });
  return made.id;
}

/** Multipart upload (metadata JSON part, then the file) into the TDJ folder; returns the Drive link. */
export async function uploadDrive(
  access: string,
  f: { filename: string; mime: string; text: string },
): Promise<{ id: string; path: string; url: string }> {
  const folder = await tdjFolder(access);
  const name = safeName(f.filename);
  const boundary = `tdj${Date.now().toString(36)}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name, parents: [folder] }),
    `--${boundary}`,
    `Content-Type: ${f.mime}`,
    "",
    f.text,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const r = await google<{ id: string; name?: string; webViewLink?: string }>(
    access,
    "/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    { method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body },
  );
  return {
    id: r.id,
    path: `TDJ/${r.name ?? name}`,
    url: r.webViewLink ?? `https://drive.google.com/file/d/${r.id}/view`,
  };
}

export const isQuotaError = (e: unknown) =>
  e instanceof ApiError &&
  e.status === 403 &&
  /quotaExceeded|dailyLimitExceeded|rateLimitExceeded|quota/i.test(e.body || e.message);

/**
 * YouTube: one playlist insert (50 units) + one search (100/day/project) + one playlistItems insert (50 units) per
 * track. The daily quota is shared by every TDJ user, so the loop stops at the first quota error and reports what
 * was left out (`skipped`) separately from what was not found (`missing`).
 */
export async function youtubePlaylist(
  access: string,
  p: { name: string; description: string; isPublic: boolean; queries: string[] },
): Promise<{ id: string; url: string; added: number; missing: string[]; skipped: string[]; quota: boolean }> {
  const pl = await google<{ id: string }>(access, "/youtube/v3/playlists?part=snippet,status", {
    method: "POST",
    body: JSON.stringify({
      snippet: { title: p.name, description: p.description },
      status: { privacyStatus: p.isPublic ? "public" : "private" },
    }),
  });
  let added = 0;
  let quota = false;
  const missing: string[] = [];
  const skipped: string[] = [];
  for (const q of p.queries) {
    if (quota) {
      skipped.push(q);
      continue;
    }
    try {
      const s = await google<{ items?: Array<{ id?: { videoId?: string } }> }>(
        access,
        `/youtube/v3/search?${new URLSearchParams({ part: "snippet", type: "video", maxResults: "1", q })}`,
      );
      const videoId = s.items?.[0]?.id?.videoId;
      if (!videoId) {
        missing.push(q);
        continue;
      }
      await google(access, "/youtube/v3/playlistItems?part=snippet", {
        method: "POST",
        body: JSON.stringify({
          snippet: { playlistId: pl.id, resourceId: { kind: "youtube#video", videoId } },
        }),
      });
      added++;
    } catch (e) {
      if (isQuotaError(e)) {
        quota = true;
        skipped.push(q);
      } else if (e instanceof ApiError && e.status !== 401) missing.push(q);
      else throw e;
    }
  }
  return { id: pl.id, url: `https://www.youtube.com/playlist?list=${pl.id}`, added, missing, skipped, quota };
}

export { GOOGLE, GOOGLE_SCOPE };
