/**
 * JSON for an HTTP header value. Header values must be ISO-8859-1 (Node's `fetch` throws on anything else) and
 * Dropbox's `Dropbox-API-Arg` requires non-ASCII to be `\uXXXX`-escaped, so every character above DEL is
 * escaped. Characters outside the BMP become their two surrogate escapes, which JSON readers reassemble.
 */
const NON_ASCII = /[\u007f-\uffff]/g;
export const httpJson = (v: unknown): string =>
  JSON.stringify(v).replace(NON_ASCII, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
