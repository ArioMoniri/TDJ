/**
 * 2026-11 — an export file to the DJ's own Dropbox app or Google Drive client, from this browser or app straight to
 * the provider (no TDJ server between). The same places the server's uploads use: Dropbox `/<set>/<file>` inside
 * the app's folder (`/Apps/<your app's name>/`), Drive a "TDJ" folder in My Drive (`drive.file`: only files T-DJ
 * made are visible to it).
 */
export const DROPBOX_CONTENT = "https://content.dropboxapi.com/2";
export const DROPBOX_API = "https://api.dropboxapi.com/2";
export const DRIVE_API = "https://www.googleapis.com";

export interface OwnFile {
  filename: string;
  text: string;
  mime?: string;
  /** the set's name: the Dropbox folder */
  set?: string;
}
export interface OwnUploadResult {
  path: string;
  url?: string;
}

/** a name that is safe as one path segment at both providers */
export const safeSegment = (s: string) =>
  s
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
    .trim()
    .slice(0, 120) || "TDJ";

/** Dropbox-API-Arg is an HTTP header: anything past ASCII goes as \uXXXX (Dropbox's own rule). */
export const headerJson = (v: unknown) =>
  JSON.stringify(v).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

const opts = { credentials: "omit", referrerPolicy: "no-referrer" } as const;

export async function dropboxUpload(access: string, f: OwnFile, fetchFn: typeof fetch = fetch) {
  const path = `/${safeSegment(f.set ?? "TDJ")}/${safeSegment(f.filename)}`;
  const r = await fetchFn(`${DROPBOX_CONTENT}/files/upload`, {
    ...opts,
    method: "POST",
    headers: {
      authorization: `Bearer ${access}`,
      "content-type": "application/octet-stream",
      "dropbox-api-arg": headerJson({ path, mode: "overwrite", autorename: false, mute: true }),
    },
    body: new TextEncoder().encode(f.text),
  });
  if (!r.ok) throw new Error(`Dropbox ${r.status}`);
  const meta = (await r.json()) as { path_display?: string };
  const shown = meta.path_display ?? path;
  // a shared link when the app may make one (sharing.write); the file is saved either way
  let url: string | undefined;
  try {
    const s = await fetchFn(`${DROPBOX_API}/sharing/create_shared_link_with_settings`, {
      ...opts,
      method: "POST",
      headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
      body: JSON.stringify({ path: shown }),
    });
    if (s.ok) url = ((await s.json()) as { url?: string }).url;
  } catch {}
  return { path: shown, url } satisfies OwnUploadResult;
}

const FOLDER = "application/vnd.google-apps.folder";
export async function driveUpload(access: string, f: OwnFile, fetchFn: typeof fetch = fetch) {
  const auth = { authorization: `Bearer ${access}` };
  const q = `name = 'TDJ' and mimeType = '${FOLDER}' and trashed = false and 'root' in parents`;
  const found = await fetchFn(
    `${DRIVE_API}/drive/v3/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`,
    { ...opts, headers: auth },
  );
  if (!found.ok) throw new Error(`Google Drive ${found.status}`);
  let folder = ((await found.json()) as { files?: Array<{ id: string }> }).files?.[0]?.id;
  if (!folder) {
    const made = await fetchFn(`${DRIVE_API}/drive/v3/files?fields=id`, {
      ...opts,
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ name: "TDJ", mimeType: FOLDER }),
    });
    if (!made.ok) throw new Error(`Google Drive ${made.status}`);
    folder = ((await made.json()) as { id: string }).id;
  }
  const name = safeSegment(f.filename);
  const boundary = `tdj${Date.now().toString(36)}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name, parents: [folder] }),
    `--${boundary}`,
    `Content-Type: ${f.mime ?? "text/plain"}`,
    "",
    f.text,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const r = await fetchFn(`${DRIVE_API}/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`, {
    ...opts,
    method: "POST",
    headers: { ...auth, "content-type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!r.ok) throw new Error(`Google Drive ${r.status}`);
  const j = (await r.json()) as { id: string; name?: string; webViewLink?: string };
  return {
    path: `TDJ/${j.name ?? name}`,
    url: j.webViewLink ?? `https://drive.google.com/file/d/${j.id}/view`,
  } satisfies OwnUploadResult;
}
