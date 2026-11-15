import "server-only";
import { createHash } from "node:crypto";

/**
 * An upload proves itself: after the file is stored, the provider is asked again for what it holds (Dropbox
 * `files/get_metadata`, Drive `files.get`) and its size and hash are compared with the bytes that were sent.
 */
export interface UploadCheck {
  /** the provider holds exactly the bytes that were sent */
  ok: boolean;
  /** bytes sent */
  bytes: number;
  /** bytes the provider reports (absent: it did not say) */
  size?: number;
  hash: "match" | "differs" | "unknown";
  /** why the check could not run */
  error?: string;
}

/** Dropbox's content hash: SHA-256 of the concatenated SHA-256 of every 4 MiB block. */
export function dropboxContentHash(bytes: Uint8Array): string {
  const BLOCK = 4 * 1024 * 1024;
  const blocks: Buffer[] = [];
  for (let i = 0; i < bytes.length; i += BLOCK)
    blocks.push(
      createHash("sha256")
        .update(bytes.subarray(i, i + BLOCK))
        .digest(),
    );
  return createHash("sha256").update(Buffer.concat(blocks)).digest("hex");
}
export const md5Hex = (bytes: Uint8Array) => createHash("md5").update(bytes).digest("hex");

/** Compares what the provider reports with what was sent. */
export function compareUpload(
  sent: Uint8Array,
  held: { size?: number | string | null; hash?: string | null },
  algo: "dropbox" | "md5",
): UploadCheck {
  const size = held.size === undefined || held.size === null ? undefined : Number(held.size);
  const want = algo === "dropbox" ? dropboxContentHash(sent) : md5Hex(sent);
  const hash = held.hash ? (held.hash.toLowerCase() === want ? "match" : "differs") : "unknown";
  const sizeOk = size === undefined || size === sent.length;
  return {
    ok: sizeOk && hash === "match",
    bytes: sent.length,
    ...(size !== undefined ? { size } : {}),
    hash,
  };
}

/** Runs `read` for what the provider holds; a failed read is an unknown result, never a thrown upload. */
export async function checkUpload(
  sent: string,
  read: () => Promise<{ size?: number | string | null; hash?: string | null }>,
  algo: "dropbox" | "md5",
): Promise<UploadCheck> {
  const bytes = new TextEncoder().encode(sent);
  try {
    return compareUpload(bytes, await read(), algo);
  } catch (e) {
    return { ok: false, bytes: bytes.length, hash: "unknown", error: (e as Error).message.slice(0, 200) };
  }
}
